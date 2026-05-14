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
            commands::ping,
            commands::get_auth_state,
            commands::start_oauth,
            commands::logout,
            commands::fetch_playlists,
            commands::fetch_playlist_tracks,
            commands::fetch_audio_features,
            commands::search_tracks,
            commands::fetch_recommendations,
            commands::fetch_insights,
            commands::refine_playlist,
            commands::export_playlist,
            commands::sidecar_logout,
            commands::get_user_profile,
            commands::export_db,
            commands::import_db,
            commands::get_recently_used,
            commands::start_discovery_session,
            commands::send_discovery_feedback,
            commands::end_discovery_session,
            commands::start_discovery_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
