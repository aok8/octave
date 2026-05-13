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
