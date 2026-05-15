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
pub(super) fn sidecar_base() -> String {
    let port = std::env::var("OCTAVE_SIDECAR_PORT").unwrap_or_else(|_| "8000".to_string());
    format!("http://127.0.0.1:{port}")
}

/// Maps a reqwest error or an unexpected status code into a human-readable
/// `String` that Tauri's `Result<_, String>` return type expects.
pub(super) async fn check_response(resp: reqwest::Response) -> Result<Value, String> {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // Serialise env-var writes: OCTAVE_SIDECAR_PORT is process-global.
    static PORT_LOCK: Mutex<()> = Mutex::new(());

    /// Point `sidecar_base()` at the wiremock server for the duration of the
    /// closure, then restore the previous value.
    async fn with_mock_server<F, Fut>(f: F)
    where
        F: FnOnce(MockServer) -> Fut,
        Fut: std::future::Future<Output = ()>,
    {
        let server = MockServer::start().await;
        let port = server.address().port().to_string();
        let _lock = PORT_LOCK.lock().unwrap();
        let prev = std::env::var("OCTAVE_SIDECAR_PORT").ok();
        std::env::set_var("OCTAVE_SIDECAR_PORT", &port);
        f(server).await;
        match prev {
            Some(p) => std::env::set_var("OCTAVE_SIDECAR_PORT", p),
            None => std::env::remove_var("OCTAVE_SIDECAR_PORT"),
        }
    }

    // --- check_response -------------------------------------------------------

    #[tokio::test]
    async fn check_response_ok_returns_json() {
        with_mock_server(|server| async move {
            Mock::given(method("GET"))
                .and(path("/ping"))
                .respond_with(
                    ResponseTemplate::new(200)
                        .set_body_json(serde_json::json!({"ok": true})),
                )
                .mount(&server)
                .await;

            let resp = reqwest::Client::new()
                .get(format!("{}/ping", sidecar_base()))
                .send()
                .await
                .unwrap();
            let val = check_response(resp).await.unwrap();
            assert_eq!(val["ok"], true);
        })
        .await;
    }

    #[tokio::test]
    async fn check_response_non2xx_returns_err() {
        with_mock_server(|server| async move {
            Mock::given(method("GET"))
                .and(path("/bad"))
                .respond_with(ResponseTemplate::new(503).set_body_string("down"))
                .mount(&server)
                .await;

            let resp = reqwest::Client::new()
                .get(format!("{}/bad", sidecar_base()))
                .send()
                .await
                .unwrap();
            let err = check_response(resp).await.unwrap_err();
            assert!(err.contains("503"), "expected 503 in error: {err}");
        })
        .await;
    }

    // --- fetch_playlists -------------------------------------------------------

    #[tokio::test]
    async fn fetch_playlists_returns_parsed_list() {
        with_mock_server(|server| async move {
            Mock::given(method("GET"))
                .and(path("/playlists"))
                .respond_with(
                    ResponseTemplate::new(200).set_body_json(serde_json::json!([
                        {"id": "p1", "name": "Chill Mix"}
                    ])),
                )
                .mount(&server)
                .await;

            let result = fetch_playlists("tok".into(), false).await.unwrap();
            assert_eq!(result[0]["name"], "Chill Mix");
        })
        .await;
    }

    #[tokio::test]
    async fn fetch_playlists_propagates_sidecar_error() {
        with_mock_server(|server| async move {
            Mock::given(method("GET"))
                .and(path("/playlists"))
                .respond_with(ResponseTemplate::new(401).set_body_string("Unauthorized"))
                .mount(&server)
                .await;

            let err = fetch_playlists("bad_tok".into(), false).await.unwrap_err();
            assert!(err.contains("401"));
        })
        .await;
    }

    // --- fetch_audio_features --------------------------------------------------

    #[tokio::test]
    async fn fetch_audio_features_empty_ids_returns_err() {
        // No mock needed — the guard fires before any HTTP call.
        let err = fetch_audio_features(vec![], "tok".into()).await.unwrap_err();
        assert!(err.contains("empty"), "expected 'empty' in: {err}");
    }

    #[tokio::test]
    async fn fetch_audio_features_returns_features() {
        with_mock_server(|server| async move {
            Mock::given(method("GET"))
                .and(path("/tracks/audio-features"))
                .respond_with(
                    ResponseTemplate::new(200).set_body_json(serde_json::json!([
                        {"id": "t1", "energy": 0.8, "tempo": 120.0}
                    ])),
                )
                .mount(&server)
                .await;

            let result = fetch_audio_features(vec!["t1".into()], "tok".into())
                .await
                .unwrap();
            assert_eq!(result[0]["energy"], 0.8);
        })
        .await;
    }

    // --- search_tracks --------------------------------------------------------

    #[tokio::test]
    async fn search_tracks_forwards_query() {
        with_mock_server(|server| async move {
            Mock::given(method("GET"))
                .and(path("/search/tracks"))
                .respond_with(
                    ResponseTemplate::new(200)
                        .set_body_json(serde_json::json!([{"id": "s1", "name": "Found"}])),
                )
                .mount(&server)
                .await;

            let result = search_tracks("lofi".into(), "tok".into()).await.unwrap();
            assert_eq!(result[0]["name"], "Found");
        })
        .await;
    }

    // --- sidecar_logout -------------------------------------------------------

    #[tokio::test]
    async fn sidecar_logout_calls_auth_endpoint() {
        with_mock_server(|server| async move {
            Mock::given(method("POST"))
                .and(path("/auth/logout"))
                .respond_with(
                    ResponseTemplate::new(200)
                        .set_body_json(serde_json::json!({"ok": true})),
                )
                .mount(&server)
                .await;

            let result = sidecar_logout().await.unwrap();
            assert_eq!(result["ok"], true);
        })
        .await;
    }

    // --- get_recently_used ----------------------------------------------------

    #[tokio::test]
    async fn get_recently_used_returns_list() {
        with_mock_server(|server| async move {
            Mock::given(method("GET"))
                .and(path("/recently-used"))
                .respond_with(
                    ResponseTemplate::new(200)
                        .set_body_json(serde_json::json!([{"id": "p1"}])),
                )
                .mount(&server)
                .await;

            let result = get_recently_used().await.unwrap();
            assert_eq!(result[0]["id"], "p1");
        })
        .await;
    }

    // --- refine_playlist -------------------------------------------------------

    #[tokio::test]
    async fn refine_playlist_posts_payload_and_parses_result() {
        with_mock_server(|server| async move {
            Mock::given(method("POST"))
                .and(path("/refine"))
                .respond_with(
                    ResponseTemplate::new(200).set_body_json(serde_json::json!({
                        "orderedTrackIds": ["t2", "t1"],
                        "removedTrackIds": []
                    })),
                )
                .mount(&server)
                .await;

            let payload =
                serde_json::json!({"playlist_id": "p1", "track_ids": ["t1", "t2"]});
            let result = refine_playlist(payload).await.unwrap();
            assert_eq!(result["orderedTrackIds"][0], "t2");
        })
        .await;
    }
}
