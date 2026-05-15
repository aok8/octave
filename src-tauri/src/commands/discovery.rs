/// discovery.rs — Tauri IPC proxy commands for the Discovery Mode endpoints.
///
/// Proxies POST requests to the Python FastAPI sidecar's /discovery/* routes.
/// The Spotify access token is fetched from the OS keychain automatically —
/// callers do not supply it.

use reqwest::Client;
use serde_json::Value;

/// Returns the base URL for the sidecar, e.g. "http://127.0.0.1:8000".
fn sidecar_base() -> String {
    let port = std::env::var("OCTAVE_SIDECAR_PORT").unwrap_or_else(|_| "8000".to_string());
    format!("http://127.0.0.1:{port}")
}

/// Maps a reqwest error or an unexpected status code into a human-readable String.
async fn check_response(resp: reqwest::Response) -> Result<Value, String> {
    let status = resp.status();
    if status.is_success() {
        resp.json::<Value>()
            .await
            .map_err(|e| format!("Failed to parse sidecar response: {e}"))
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!("Sidecar returned HTTP {status}: {body}"))
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Start a new discovery session seeded by a track.
///
/// Proxies to `POST /discovery/start` on the Python sidecar.
#[tauri::command]
pub async fn start_discovery_session(seed_track_id: String) -> Result<Value, String> {
    let token = crate::auth::get_stored_token()?;
    let url = format!("{}/discovery/start", sidecar_base());
    let client = Client::new();
    let body = serde_json::json!({
        "access_token": token,
        "seed_track_id": seed_track_id,
    });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Submit keep/skip feedback for a track in a discovery session.
///
/// Proxies to `POST /discovery/feedback` on the Python sidecar.
/// `action` must be `"keep"` or `"skip"`.
#[tauri::command]
pub async fn send_discovery_feedback(
    session_id: String,
    track_id: String,
    action: String,
) -> Result<Value, String> {
    let token = crate::auth::get_stored_token()?;
    let url = format!("{}/discovery/feedback", sidecar_base());
    let client = Client::new();
    let body = serde_json::json!({
        "access_token": token,
        "session_id": session_id,
        "track_id": track_id,
        "action": action,
    });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// End a discovery session.
///
/// Proxies to `POST /discovery/end` on the Python sidecar.
#[tauri::command]
pub async fn end_discovery_session(session_id: String) -> Result<Value, String> {
    let token = crate::auth::get_stored_token()?;
    let url = format!("{}/discovery/end", sidecar_base());
    let client = Client::new();
    let body = serde_json::json!({
        "access_token": token,
        "session_id": session_id,
    });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Export kept discovery tracks to a new Spotify playlist.
///
/// Proxies to `POST /export/new` on the Python sidecar with the given track IDs.
#[tauri::command]
pub async fn start_discovery_export(
    track_ids: Vec<String>,
    name: String,
) -> Result<Value, String> {
    let token = crate::auth::get_stored_token()?;
    let url = format!("{}/export/new", sidecar_base());
    let client = Client::new();
    let body = serde_json::json!({
        "token": token,
        "track_ids": track_ids,
        "name": name,
        "description": "Created by Octave Discovery Mode",
        "mode": "new",
    });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}
