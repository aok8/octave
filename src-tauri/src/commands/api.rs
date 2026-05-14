/// api.rs — Tauri IPC proxy commands for the Python FastAPI sidecar.
///
/// Each command makes an HTTP request to the sidecar running on
/// http://127.0.0.1:{SIDECAR_PORT}.  The port defaults to 8000 and can be
/// overridden via the OCTAVE_SIDECAR_PORT environment variable for testing.
///
/// Tokens are forwarded as a query parameter — they are never stored in Rust
/// state here; the caller retrieves them from the OS keychain before invoking
/// these commands.

use reqwest::Client;
use serde_json::Value;

/// Returns the base URL for the sidecar, e.g. "http://127.0.0.1:8000".
fn sidecar_base() -> String {
    let port = std::env::var("OCTAVE_SIDECAR_PORT").unwrap_or_else(|_| "8000".to_string());
    format!("http://127.0.0.1:{port}")
}

/// Maps a reqwest error or an unexpected status code into a human-readable
/// `String` that Tauri's `Result<_, String>` return type expects.
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

/// Fetch the current user's playlists.
///
/// `force_refresh = true` bypasses the SQLite cache and fetches fresh data
/// from Spotify.
#[tauri::command]
pub async fn fetch_playlists(
    access_token: String,
    force_refresh: bool,
) -> Result<Value, String> {
    let client = Client::new();
    let url = format!(
        "{}/playlists?access_token={}&force_refresh={}",
        sidecar_base(),
        urlencoding::encode(&access_token),
        force_refresh,
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Fetch the full track list for a playlist.
///
/// `force_refresh = true` bypasses the SQLite cache.
#[tauri::command]
pub async fn fetch_playlist_tracks(
    playlist_id: String,
    access_token: String,
    force_refresh: bool,
) -> Result<Value, String> {
    let client = Client::new();
    let url = format!(
        "{}/playlists/{}/tracks?access_token={}&force_refresh={}",
        sidecar_base(),
        urlencoding::encode(&playlist_id),
        urlencoding::encode(&access_token),
        force_refresh,
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Fetch audio features for a list of track IDs.
///
/// Missing / uncached IDs are batch-fetched from Spotify (100 per call).
#[tauri::command]
pub async fn fetch_audio_features(
    track_ids: Vec<String>,
    access_token: String,
) -> Result<Value, String> {
    if track_ids.is_empty() {
        return Err("track_ids must not be empty".to_string());
    }
    let ids_param = track_ids.join(",");
    let client = Client::new();
    let url = format!(
        "{}/tracks/audio-features?track_ids={}&access_token={}",
        sidecar_base(),
        urlencoding::encode(&ids_param),
        urlencoding::encode(&access_token),
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Search the Spotify catalog for tracks.
///
/// Results are ephemeral — not cached in SQLite.
#[tauri::command]
pub async fn search_tracks(
    query: String,
    access_token: String,
) -> Result<Value, String> {
    let client = Client::new();
    let url = format!(
        "{}/search/tracks?q={}&access_token={}",
        sidecar_base(),
        urlencoding::encode(&query),
        urlencoding::encode(&access_token),
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Fetch audio-feature insights (genre breakdown + timeline) for a playlist.
///
/// Proxies to `GET /insights/{playlist_id}` on the Python sidecar.
#[tauri::command]
pub async fn fetch_insights(playlist_id: String) -> Result<Value, String> {
    let client = Client::new();
    let url = format!(
        "{}/insights/{}",
        sidecar_base(),
        urlencoding::encode(&playlist_id),
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Fetch Spotify recommendations seeded by a single track.
///
/// Returned tracks are cached in the SQLite `tracks` table.
#[tauri::command]
pub async fn fetch_recommendations(
    seed_track_id: String,
    access_token: String,
) -> Result<Value, String> {
    let client = Client::new();
    let url = format!(
        "{}/search/recommendations?seed_track_id={}&access_token={}",
        sidecar_base(),
        urlencoding::encode(&seed_track_id),
        urlencoding::encode(&access_token),
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Filter and re-rank a playlist's track pool.
///
/// Proxies to `POST /refine` on the Python sidecar.
/// The payload must conform to the `RefineRequest` schema:
///   { playlist_id, track_ids, constraints, genre_config }
#[tauri::command]
pub async fn refine_playlist(payload: Value) -> Result<Value, String> {
    let url = format!("{}/refine", sidecar_base());
    let client = Client::new();
    let resp = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    check_response(resp).await
}

/// Call `POST /auth/logout` on the Python sidecar.
///
/// Token clearing from the OS keychain is handled on the Rust side (see
/// `commands::logout`).  This command notifies the sidecar so it can perform
/// any server-side session teardown in the future.
#[tauri::command]
pub async fn sidecar_logout() -> Result<serde_json::Value, String> {
    let url = format!("{}/auth/logout", sidecar_base());
    let client = Client::new();
    let res = client
        .post(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(res).await
}

/// Fetch the authenticated user's profile from the Python sidecar.
///
/// Proxies to `GET /auth/profile`.
#[tauri::command]
pub async fn get_user_profile() -> Result<serde_json::Value, String> {
    let url = format!("{}/auth/profile", sidecar_base());
    let client = Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(res).await
}

/// Export the Octave SQLite database to a user-specified file path.
///
/// Proxies to `POST /storage/export`.
#[tauri::command]
pub async fn export_db(path: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/storage/export", sidecar_base());
    let client = Client::new();
    let body = serde_json::json!({ "path": path });
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    check_response(res).await
}

/// Import a SQLite database file into Octave.
///
/// Proxies to `POST /storage/import`.
/// `mode` must be `"merge"` or `"replace"`.
#[tauri::command]
pub async fn import_db(path: String, mode: String) -> Result<serde_json::Value, String> {
    let url = format!("{}/storage/import", sidecar_base());
    let client = Client::new();
    let body = serde_json::json!({ "path": path, "mode": mode });
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    check_response(res).await
}

/// Full logout: clears OS keychain tokens + notifies the Python sidecar.
///
/// Keychain deletion is authoritative; the sidecar call is best-effort
/// (ignored if the sidecar is not running).
#[tauri::command]
pub async fn logout() -> Result<(), String> {
    // 1. Clear keychain tokens
    crate::auth::clear_tokens()?;
    // 2. Best-effort sidecar notification (ignore errors — sidecar may not be running)
    let client = Client::new();
    let _ = client
        .post(format!("{}/auth/logout", sidecar_base()))
        .send()
        .await;
    Ok(())
}

/// Fetches recently-used playlists from the sidecar cache.
///
/// Proxies to `GET /recently-used` on the Python sidecar.
#[tauri::command]
pub async fn get_recently_used() -> Result<Value, String> {
    let client = Client::new();
    let url = format!("{}/recently-used", sidecar_base());
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Export a Spotify playlist (create new or overwrite existing).
///
/// Routes based on `payload["mode"]`:
///   - `"new"`       → `POST /export/new`
///   - `"overwrite"` → `POST /export/overwrite/{playlist_id}`
///
/// For `"new"` the payload must include `{ name, description, track_ids, token }`.
/// For `"overwrite"` the payload must include `{ playlist_id, track_ids, token }`.
#[tauri::command]
pub async fn export_playlist(payload: Value) -> Result<Value, String> {
    let mode = payload["mode"].as_str().unwrap_or("new");
    let url = if mode == "overwrite" {
        let pid = payload["playlist_id"].as_str().unwrap_or("");
        format!("{}/export/overwrite/{}", sidecar_base(), pid)
    } else {
        format!("{}/export/new", sidecar_base())
    };
    let client = Client::new();
    let resp = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    check_response(resp).await
}
