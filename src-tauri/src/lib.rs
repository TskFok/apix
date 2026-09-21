use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize)]
struct HttpRequestPayload {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body_base64: Option<String>,
    #[serde(default)]
    ignore_tls_certificate_errors: bool,
}

#[derive(Serialize)]
struct HttpResponsePayload {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    time_ms: u64,
}

const MAX_HTTP_REDIRECTS: usize = 10;

fn is_same_origin(current: &reqwest::Url, next: &reqwest::Url) -> bool {
    current.scheme() == next.scheme()
        && current.host_str() == next.host_str()
        && current.port_or_known_default() == next.port_or_known_default()
}

fn safe_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() > MAX_HTTP_REDIRECTS {
            attempt.error("重定向次数超过 10 次")
        } else if attempt
            .previous()
            .last()
            .is_some_and(|current| is_same_origin(current, attempt.url()))
        {
            attempt.follow()
        } else {
            attempt.error("已阻止跨源重定向")
        }
    })
}

fn format_http_error(error: reqwest::Error) -> String {
    if error.is_redirect() {
        return std::error::Error::source(&error)
            .map(ToString::to_string)
            .unwrap_or_else(|| "已阻止不安全的重定向".to_string());
    }

    error.to_string()
}

fn build_http_client(
    ignore_tls_certificate_errors: bool,
) -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(ignore_tls_certificate_errors)
        .redirect(safe_redirect_policy())
        .referer(false)
        .build()
}

#[tauri::command]
async fn http_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    let start = std::time::Instant::now();

    let client =
        build_http_client(payload.ignore_tls_certificate_errors).map_err(|e| e.to_string())?;

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

    let resp = req.send().await.map_err(format_http_error)?;

    let status = resp.status().as_u16();
    let status_text = resp.status().canonical_reason().unwrap_or("").to_string();

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener};
    use std::thread;

    fn read_http_request(stream: &mut std::net::TcpStream) -> String {
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(2)))
            .unwrap();
        let mut bytes = Vec::new();
        let mut chunk = [0_u8; 1024];
        let mut expected_len = None;

        loop {
            let size = stream.read(&mut chunk).unwrap();
            if size == 0 {
                break;
            }
            bytes.extend_from_slice(&chunk[..size]);

            if expected_len.is_none() {
                if let Some(header_end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..header_end]);
                    let content_len = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().ok())
                                .flatten()
                        })
                        .unwrap_or(0);
                    expected_len = Some(header_end + 4 + content_len);
                }
            }

            if expected_len.is_some_and(|len| bytes.len() >= len) {
                break;
            }
        }

        String::from_utf8(bytes).unwrap()
    }

    fn spawn_http_server<F>(
        expected_requests: usize,
        response_for: F,
    ) -> (SocketAddr, thread::JoinHandle<Vec<String>>)
    where
        F: Fn(usize, &str) -> String + Send + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = thread::spawn(move || {
            let mut requests = Vec::new();
            for index in 0..expected_requests {
                let (mut stream, _) = listener.accept().unwrap();
                let request = read_http_request(&mut stream);
                let response = response_for(index, &request);
                stream.write_all(response.as_bytes()).unwrap();
                requests.push(request);
            }
            requests
        });
        (addr, handle)
    }

    fn redirect_response(location: &str) -> String {
        format!(
            "HTTP/1.1 307 Temporary Redirect\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        )
    }

    fn ok_response() -> String {
        "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok".to_string()
    }

    #[test]
    fn http_request_payload_defaults_to_certificate_validation() {
        let payload: HttpRequestPayload = serde_json::from_str(
            r#"{"method":"GET","url":"https://example.com","headers":{},"body_base64":null}"#,
        )
        .unwrap();

        assert!(!payload.ignore_tls_certificate_errors);
    }

    #[test]
    fn builds_http_client_when_certificate_validation_is_ignored() {
        assert!(build_http_client(true).is_ok());
    }

    #[test]
    fn redirect_origin_requires_matching_scheme_host_and_port() {
        let origin = reqwest::Url::parse("https://api.example.test:8443/start").unwrap();

        assert!(is_same_origin(
            &origin,
            &reqwest::Url::parse("https://api.example.test:8443/next").unwrap()
        ));
        assert!(!is_same_origin(
            &origin,
            &reqwest::Url::parse("http://api.example.test:8443/next").unwrap()
        ));
        assert!(!is_same_origin(
            &origin,
            &reqwest::Url::parse("https://other.example.test:8443/next").unwrap()
        ));
        assert!(!is_same_origin(
            &origin,
            &reqwest::Url::parse("https://api.example.test:9443/next").unwrap()
        ));
    }

    #[test]
    fn follows_same_origin_redirect_without_adding_referer() {
        let (addr, server) = spawn_http_server(2, |index, _| {
            if index == 0 {
                redirect_response("/final")
            } else {
                ok_response()
            }
        });
        let client = build_http_client(false).unwrap();

        let response = tauri::async_runtime::block_on(async {
            client
                .post(format!("http://{addr}/start?query-token=query-secret"))
                .header("X-API-Key", "header-secret")
                .body("body-secret")
                .send()
                .await
                .unwrap()
        });

        assert_eq!(response.status(), reqwest::StatusCode::OK);
        let requests = server.join().unwrap();
        let redirected = requests[1].to_ascii_lowercase();
        assert!(redirected.starts_with("post /final http/1.1"));
        assert!(redirected.contains("x-api-key: header-secret"));
        assert!(redirected.ends_with("body-secret"));
        assert!(!redirected.contains("referer:"));
        assert!(!redirected.contains("query-secret"));
    }

    #[test]
    fn blocks_cross_origin_redirect_before_forwarding_headers_or_body() {
        let target = TcpListener::bind("127.0.0.1:0").unwrap();
        target.set_nonblocking(true).unwrap();
        let target_addr = target.local_addr().unwrap();
        let location = format!("http://{target_addr}/stolen?token=location-secret");
        let (source_addr, source) = spawn_http_server(1, move |_, _| redirect_response(&location));
        let client = build_http_client(false).unwrap();

        let error = tauri::async_runtime::block_on(async {
            client
                .post(format!("http://{source_addr}/start"))
                .header("X-API-Key", "header-secret")
                .body("body-secret")
                .send()
                .await
                .unwrap_err()
        });

        source.join().unwrap();
        assert!(error.is_redirect());
        assert_eq!(format_http_error(error), "已阻止跨源重定向");
        assert!(matches!(target.accept(), Err(e) if e.kind() == std::io::ErrorKind::WouldBlock));
    }

    #[test]
    fn stops_after_ten_same_origin_redirects() {
        let (addr, server) = spawn_http_server(11, |index, _| {
            redirect_response(&format!("/hop/{}", index + 1))
        });
        let client = build_http_client(false).unwrap();

        let error = tauri::async_runtime::block_on(async {
            client
                .get(format!("http://{addr}/hop/0"))
                .send()
                .await
                .unwrap_err()
        });

        assert!(error.is_redirect());
        assert_eq!(format_http_error(error), "重定向次数超过 10 次");
        let requests = server.join().unwrap();
        assert_eq!(requests.len(), 11);
        assert!(requests[10].starts_with("GET /hop/10 HTTP/1.1"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(
                tauri_plugin_window_state::StateFlags::SIZE
                    | tauri_plugin_window_state::StateFlags::MAXIMIZED,
            )
            .build(),
    );

    builder
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
