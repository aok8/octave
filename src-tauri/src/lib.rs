mod auth;
mod commands;
mod db;

use auth::OAuthState;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_shell::ShellExt;

// Keeps the sidecar child process alive for the lifetime of the app.
struct SidecarHandle(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

// ── OAuth URL handler ─────────────────────────────────────────────────────────
//
// Called from TWO places:
//   1. on_open_url  — deep-link plugin fires this when the app is launched
//                     with an octave:// URL (first-launch / macOS case).
//   2. single-instance argv handler — on Windows, when an existing instance is
//                     running, the single-instance plugin forwards the second
//                     instance's argv here. on_open_url does NOT fire in this
//                     path, so we must parse the URL from argv ourselves.

fn process_oauth_url(app: &AppHandle, url_str: &str) {
    let url = match url::Url::parse(url_str) {
        Ok(u) => u,
        Err(_) => return, // not a URL, skip silently
    };

    if url.scheme() != "octave" || url.host_str() != Some("callback") {
        return;
    }

    log::info!("OAuth: processing callback URL");

    let mut code_opt: Option<String> = None;
    let mut state_opt: Option<String> = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "code" => code_opt = Some(v.into_owned()),
            "state" => state_opt = Some(v.into_owned()),
            _ => {}
        }
    }

    let (code, received_state) = match (code_opt, state_opt) {
        (Some(c), Some(s)) => (c, s),
        _ => {
            log::warn!("OAuth: callback URL missing code or state: {url_str}");
            return;
        }
    };

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let oauth_state = handle.state::<OAuthState>();

        // CSRF check — validate state parameter
        let expected_state: Option<String> =
            oauth_state.oauth_state.lock().unwrap().clone();
        if expected_state.as_deref() != Some(received_state.as_str()) {
            log::error!("OAuth: state mismatch — possible CSRF, ignoring callback");
            let _ = handle.emit(
                "oauth-error",
                "Security check failed — please try logging in again.",
            );
            return;
        }

        // Read client_id stored during start_oauth
        let client_id: String = {
            let guard = oauth_state.client_id.lock().unwrap();
            match guard.as_ref() {
                Some(cid) => cid.clone(),
                None => {
                    log::error!("OAuth: callback received but no client_id in state");
                    let _ = handle.emit(
                        "oauth-error",
                        "Login session expired — please try again.",
                    );
                    return;
                }
            }
        };

        match auth::handle_callback(&code, &client_id, &oauth_state).await {
            Ok(()) => {
                log::info!("OAuth: token exchange complete — stored in keychain");
                let _ = handle.emit("oauth-complete", ());
            }
            Err(e) => {
                log::error!("OAuth: token exchange failed: {e}");
                let _ = handle.emit("oauth-error", e);
            }
        }
    });
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        // single-instance MUST be before deep-link.
        // On Windows, Spotify's redirect opens a second Octave process with
        // the octave://callback URL in its argv. Single-instance intercepts
        // that second process and forwards argv to the already-running one.
        // We parse argv here because on_open_url does NOT fire in this path.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            log::info!("Single-instance: new launch blocked, argv={argv:?}");

            // Bring the existing window to the foreground
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            // Check every argv token for an octave:// URL (argv[0] is the exe)
            for arg in argv.iter().skip(1) {
                process_oauth_url(app, arg);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(OAuthState::new())
        .setup(|app| {
            // Initialize SQLite database
            let db_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::init_db(&db_handle).await {
                    log::error!("DB init failed: {e}");
                }
            });

            // Spawn the Python FastAPI sidecar. externalBin bundles it but
            // doesn't auto-start it — we must spawn explicitly.
            let sidecar_port: u16 = 8765; // avoid collisions with common dev servers
            std::env::set_var("OCTAVE_SIDECAR_PORT", sidecar_port.to_string());

            match app.shell().sidecar("main") {
                Ok(cmd) => {
                    match cmd.args([sidecar_port.to_string()]).spawn() {
                        Ok((mut rx, child)) => {
                            log::info!("Sidecar started on port {sidecar_port}");
                            // Store handle so the process stays alive until the app exits
                            app.manage(SidecarHandle(std::sync::Mutex::new(Some(child))));
                            // Drain sidecar stdout/stderr so the pipe buffer never fills
                            tauri::async_runtime::spawn(async move {
                                use tauri_plugin_shell::process::CommandEvent;
                                while let Some(event) = rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(b) => {
                                            log::debug!("sidecar: {}", String::from_utf8_lossy(&b));
                                        }
                                        CommandEvent::Stderr(b) => {
                                            log::warn!("sidecar stderr: {}", String::from_utf8_lossy(&b));
                                        }
                                        CommandEvent::Terminated(s) => {
                                            log::info!("sidecar terminated: {s:?}");
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                            });
                        }
                        Err(e) => log::error!("Failed to spawn sidecar: {e}"),
                    }
                }
                Err(e) => log::error!("Failed to create sidecar command: {e}"),
            }

            // on_open_url fires when the app itself is launched with a deep-link
            // URL (e.g. first run, or macOS which always routes to running app).
            // On Windows with single-instance this path is typically NOT taken —
            // the URL arrives in the single-instance argv above instead.
            let dl_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    log::info!("on_open_url: {url}");
                    process_oauth_url(&dl_handle, url.as_str());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // defined in commands/mod.rs
            commands::ping,
            commands::get_auth_state,
            commands::start_oauth,
            // defined in commands/api.rs
            commands::api::logout,
            commands::api::fetch_playlists,
            commands::api::fetch_playlist_tracks,
            commands::api::fetch_audio_features,
            commands::api::search_tracks,
            commands::api::fetch_recommendations,
            commands::api::fetch_insights,
            commands::api::refine_playlist,
            commands::api::export_playlist,
            commands::api::sidecar_logout,
            commands::api::get_user_profile,
            commands::api::export_db,
            commands::api::import_db,
            commands::api::get_recently_used,
            // defined in commands/discovery.rs
            commands::discovery::start_discovery_session,
            commands::discovery::send_discovery_feedback,
            commands::discovery::end_discovery_session,
            commands::discovery::start_discovery_export,
            // defined in commands/ai_cmd.rs
            commands::ai_cmd::generate_ai_playlist,
            commands::ai_cmd::set_ai_key,
            commands::ai_cmd::get_ai_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
