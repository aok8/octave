mod auth;
mod commands;
mod db;

use auth::OAuthState;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        // single-instance MUST be registered before deep-link so that when
        // Spotify redirects to octave://callback, Windows routes the URL to
        // the already-running process (which holds the PKCE state in memory)
        // instead of launching a fresh second instance.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Bring the existing window to the foreground
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
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
                    log::error!("Failed to initialize database: {e}");
                }
            });

            // Handle OAuth deep-link callback: octave://callback?code=...&state=...
            let dl_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    // Only handle our callback path
                    if url.scheme() != "octave" || url.host_str() != Some("callback") {
                        continue;
                    }

                    // Extract code and state from query string
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
                            log::warn!("OAuth callback missing code or state");
                            continue;
                        }
                    };

                    let handle = dl_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let oauth_state = handle.state::<OAuthState>();

                        // CSRF check — validate state parameter
                        let expected_state: Option<String> =
                            oauth_state.oauth_state.lock().unwrap().clone();
                        if expected_state.as_deref() != Some(received_state.as_str()) {
                            log::error!("OAuth state mismatch — possible CSRF, ignoring callback");
                            return;
                        }

                        // Read client_id stored during start_oauth
                        let client_id: String = {
                            let guard = oauth_state.client_id.lock().unwrap();
                            match guard.as_ref() {
                                Some(cid) => cid.clone(),
                                None => {
                                    log::error!("OAuth callback: no client_id in state");
                                    return;
                                }
                            }
                        };

                        match auth::handle_callback(&code, &client_id, &oauth_state).await {
                            Ok(()) => {
                                log::info!("OAuth complete — tokens stored in keychain");
                                // Notify the frontend so it can skip polling
                                let _ = handle.emit("oauth-complete", ());
                            }
                            Err(e) => {
                                log::error!("OAuth token exchange failed: {e}");
                                let _ = handle.emit("oauth-error", e);
                            }
                        }
                    });
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
