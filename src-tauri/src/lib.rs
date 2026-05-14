mod auth;
mod commands;
mod db;

use auth::OAuthState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(OAuthState::new())
        .setup(|app| {
            // Initialize SQLite database
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::init_db(&app_handle).await {
                    log::error!("Failed to initialize database: {e}");
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
