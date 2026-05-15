use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::sync::Mutex;

const KEYRING_SERVICE: &str = "com.octave.app";
const ACCESS_TOKEN_KEY: &str = "spotify_access_token";
const REFRESH_TOKEN_KEY: &str = "spotify_refresh_token";

const SPOTIFY_SCOPES: &str = "playlist-read-private playlist-read-collaborative \
    playlist-modify-private playlist-modify-public user-library-read user-read-private";

const REDIRECT_URI: &str = "octave://callback";

/// Holds the PKCE code verifier between OAuth steps.
pub struct OAuthState {
    pub code_verifier: Mutex<Option<String>>,
    pub oauth_state: Mutex<Option<String>>,
}

impl OAuthState {
    pub fn new() -> Self {
        Self {
            code_verifier: Mutex::new(None),
            oauth_state: Mutex::new(None),
        }
    }
}

impl Default for OAuthState {
    fn default() -> Self {
        Self::new()
    }
}

/// Returns `(code_verifier, code_challenge)` using SHA-256 + base64url (PKCE S256).
pub fn generate_pkce_pair() -> (String, String) {
    let mut verifier_bytes = [0u8; 64];
    rand::thread_rng().fill_bytes(&mut verifier_bytes);
    let code_verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();
    let code_challenge = URL_SAFE_NO_PAD.encode(hash);

    (code_verifier, code_challenge)
}

/// Builds the Spotify authorization URL and opens it in the system browser.
/// Stores the code verifier in app state for later token exchange.
pub fn start_oauth(
    client_id: &str,
    oauth_state: &OAuthState,
    opener: &impl OpenUrl,
) -> Result<(), String> {
    let (code_verifier, code_challenge) = generate_pkce_pair();

    // Generate random state parameter
    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);

    // Store verifier and state
    {
        let mut v = oauth_state.code_verifier.lock().map_err(|e| e.to_string())?;
        *v = Some(code_verifier);
    }
    {
        let mut s = oauth_state.oauth_state.lock().map_err(|e| e.to_string())?;
        *s = Some(state.clone());
    }

    let auth_url = format!(
        "https://accounts.spotify.com/authorize\
        ?client_id={client_id}\
        &response_type=code\
        &redirect_uri={redirect_uri}\
        &code_challenge_method=S256\
        &code_challenge={code_challenge}\
        &state={state}\
        &scope={scopes}",
        client_id = urlencoding::encode(client_id),
        redirect_uri = urlencoding::encode(REDIRECT_URI),
        code_challenge = code_challenge,
        state = state,
        scopes = urlencoding::encode(SPOTIFY_SCOPES),
    );

    opener.open_url(&auth_url).map_err(|e| e.to_string())
}

/// Exchanges the authorization code for access + refresh tokens, storing them in the OS keychain.
#[allow(dead_code)]
pub async fn handle_callback(
    code: &str,
    client_id: &str,
    oauth_state: &OAuthState,
) -> Result<(), String> {
    let code_verifier = {
        let v = oauth_state
            .code_verifier
            .lock()
            .map_err(|e| e.to_string())?;
        v.clone().ok_or("No code verifier in state")?
    };

    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", REDIRECT_URI),
        ("client_id", client_id),
        ("code_verifier", &code_verifier),
    ];

    let resp = client
        .post("https://accounts.spotify.com/api/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {body}"));
    }

    let token_data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let access_token = token_data["access_token"]
        .as_str()
        .ok_or("Missing access_token")?;
    let refresh_token = token_data["refresh_token"]
        .as_str()
        .ok_or("Missing refresh_token")?;

    store_tokens(access_token, refresh_token)?;

    // Clear the verifier from state
    {
        let mut v = oauth_state
            .code_verifier
            .lock()
            .map_err(|e| e.to_string())?;
        *v = None;
    }

    Ok(())
}

/// Refreshes the access token using the stored refresh token.
#[allow(dead_code)]
pub async fn refresh_token(client_id: &str) -> Result<String, String> {
    let stored_refresh = retrieve_token(REFRESH_TOKEN_KEY)?;

    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", &stored_refresh),
        ("client_id", client_id),
    ];

    let resp = client
        .post("https://accounts.spotify.com/api/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {body}"));
    }

    let token_data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let new_access_token = token_data["access_token"]
        .as_str()
        .ok_or("Missing access_token in refresh response")?;

    // Update access token; refresh token may or may not be rotated
    let new_refresh = token_data["refresh_token"]
        .as_str()
        .unwrap_or(&stored_refresh);

    store_tokens(new_access_token, new_refresh)?;

    Ok(new_access_token.to_string())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct AuthStateInfo {
    pub is_authenticated: bool,
    pub user_id: Option<String>,
}

/// Returns the stored Spotify access token from the OS keychain.
///
/// In test environments the `OCTAVE_TEST_TOKEN` env var is used as a
/// fallback so that wiremock-based unit tests do not require a real keychain.
pub fn get_stored_token() -> Result<String, String> {
    if let Ok(tok) = std::env::var("OCTAVE_TEST_TOKEN") {
        if !tok.is_empty() {
            return Ok(tok);
        }
    }
    retrieve_token(ACCESS_TOKEN_KEY)
}

/// Returns the current authentication state.
pub fn get_auth_state() -> AuthStateInfo {
    match retrieve_token(ACCESS_TOKEN_KEY) {
        Ok(token) if !token.is_empty() => AuthStateInfo {
            is_authenticated: true,
            user_id: None, // User ID is fetched from Spotify API on demand
        },
        _ => AuthStateInfo {
            is_authenticated: false,
            user_id: None,
        },
    }
}

/// Clears all stored tokens from the OS keychain.
pub fn clear_tokens() -> Result<(), String> {
    let _ = keyring::Entry::new(KEYRING_SERVICE, ACCESS_TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .delete_password();
    let _ = keyring::Entry::new(KEYRING_SERVICE, REFRESH_TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .delete_password();
    Ok(())
}

fn store_tokens(access_token: &str, refresh_token: &str) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, ACCESS_TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .set_password(access_token)
        .map_err(|e| e.to_string())?;
    keyring::Entry::new(KEYRING_SERVICE, REFRESH_TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .set_password(refresh_token)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn retrieve_token(key: &str) -> Result<String, String> {
    keyring::Entry::new(KEYRING_SERVICE, key)
        .map_err(|e| e.to_string())?
        .get_password()
        .map_err(|e| e.to_string())
}

/// Trait to allow mocking browser open in tests.
pub trait OpenUrl {
    fn open_url(&self, url: &str) -> Result<(), Box<dyn std::error::Error>>;
}
