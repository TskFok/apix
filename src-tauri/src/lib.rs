use std::collections::HashMap;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct HttpRequestPayload {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body_base64: Option<String>,
}

#[derive(Serialize)]
struct HttpResponsePayload {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    time_ms: u64,
}

#[tauri::command]
async fn http_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    let start = std::time::Instant::now();

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| e.to_string())?;

    let method = payload
        .method
        .parse::<reqwest::Method>()
        .map_err(|e| e.to_string())?;

    let mut req = client.request(method, &payload.url);
    for (k, v) in &payload.headers {
        req = req.header(k, v);
    }
    if let Some(body_base64) = payload.body_base64 {
        let bytes = STANDARD
            .decode(body_base64)
            .map_err(|e| format!("invalid request body base64: {e}"))?;
        req = req.body(bytes);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    let status_text = resp
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut headers = HashMap::new();
    for (k, v) in resp.headers() {
        if let Ok(val) = v.to_str() {
            headers.insert(k.to_string(), val.to_string());
        }
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    let time_ms = start.elapsed().as_millis() as u64;

    Ok(HttpResponsePayload {
        status,
        status_text,
        headers,
        body,
        time_ms,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![http_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
