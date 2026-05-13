use crate::auth::{self, AuthStateInfo, OAuthState};
use tauri::State;

/// Smoke-test command — returns "pong".
#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}

/// Returns the current Spotify authentication state.
#[tauri::command]
pub fn get_auth_state() -> AuthStateInfo {
    auth::get_auth_state()
}

/// Initiates the Spotify OAuth PKCE flow: generates challenge, opens system browser.
#[tauri::command]
pub async fn start_oauth(
    client_id: String,
    oauth_state: State<'_, OAuthState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    struct TauriOpener(tauri::AppHandle);
    impl auth::OpenUrl for TauriOpener {
        fn open_url(&self, url: &str) -> Result<(), Box<dyn std::error::Error>> {
            self.0.opener().open_url(url, None::<&str>)?;
            Ok(())
        }
    }

    auth::start_oauth(&client_id, &oauth_state, &TauriOpener(app))
}

/// Clears keychain tokens, effectively logging the user out.
#[tauri::command]
pub fn logout() -> Result<(), String> {
    auth::clear_tokens()
}
