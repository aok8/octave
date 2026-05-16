/// ai_cmd.rs — Tauri IPC proxy commands for the AI playlist generation endpoints.
///
/// Proxies to the Python sidecar's /ai/* routes.

use reqwest::Client;
use serde_json::Value;

use super::api::{check_response, sidecar_base};

/// Generate an AI playlist from a text description.
///
/// Proxies to `POST /ai/generate` on the Python sidecar.
#[tauri::command]
pub async fn generate_ai_playlist(
    access_token: String,
    prompt: String,
    ai_key: String,
) -> Result<Value, String> {
    let url = format!("{}/ai/generate", sidecar_base());
    let client = Client::new();
    let resp = client
        .post(&url)
        .json(&serde_json::json!({
            "access_token": access_token,
            "prompt": prompt,
            "ai_key": ai_key,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Store or clear the OpenRouter API key.
///
/// Proxies to `POST /ai/key` on the Python sidecar.
#[tauri::command]
pub async fn set_ai_key(key: String) -> Result<Value, String> {
    let url = format!("{}/ai/key", sidecar_base());
    let client = Client::new();
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "key": key }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Return the current AI key status ("configured", "local", or null).
///
/// Proxies to `GET /ai/status` on the Python sidecar.
#[tauri::command]
pub async fn get_ai_status() -> Result<Value, String> {
    let url = format!("{}/ai/status", sidecar_base());
    let client = Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Save the RapidAPI key for audio feature enrichment.
/// Proxies to `POST /settings/rapidapi-key` on the Python sidecar.
#[tauri::command]
pub async fn save_rapidapi_key(key: String) -> Result<Value, String> {
    let url = format!("{}/settings/rapidapi-key", sidecar_base());
    let client = Client::new();
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "key": key }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Return RapidAPI key configuration status.
/// Proxies to `GET /settings/rapidapi-key/status` on the Python sidecar.
#[tauri::command]
pub async fn get_rapidapi_status() -> Result<Value, String> {
    let url = format!("{}/settings/rapidapi-key/status", sidecar_base());
    let client = Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Remove the stored RapidAPI key.
/// Proxies to `DELETE /settings/rapidapi-key` on the Python sidecar.
#[tauri::command]
pub async fn delete_rapidapi_key() -> Result<Value, String> {
    let url = format!("{}/settings/rapidapi-key", sidecar_base());
    let client = Client::new();
    let resp = client
        .delete(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}

/// Test a RapidAPI key with a live API call.
/// Proxies to `POST /settings/test-rapidapi` on the Python sidecar.
#[tauri::command]
pub async fn test_rapidapi_key(key: String) -> Result<Value, String> {
    let url = format!("{}/settings/test-rapidapi", sidecar_base());
    let client = Client::new();
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "key": key }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach sidecar: {e}"))?;
    check_response(resp).await
}
