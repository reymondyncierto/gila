use std::path::PathBuf;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener as TokioTcpListener;
use tokio_tungstenite::tungstenite::Message;

use crate::crypto;
use crate::db;
use crate::state::AppState;

/// Fixed port for the HTTP discovery endpoint.
/// The extension fetches http://127.0.0.1:21525/config to get the WS port + token.
const DISCOVERY_PORT: u16 = 21525;

/// Generate a random auth token.
fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn bridge_dir() -> PathBuf {
    let home = dirs::home_dir().expect("cannot determine home directory");
    home.join(".gila")
}

/// Start both the WebSocket bridge and the HTTP discovery endpoint.
pub fn start_bridge(state: Arc<AppState>) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
        rt.block_on(async move {
            run_server(state).await;
        });
    });
}

async fn run_server(state: Arc<AppState>) {
    // Bind WebSocket server to a random port
    let ws_listener = TokioTcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind bridge server");
    let ws_addr = ws_listener.local_addr().expect("no local addr");
    let ws_port = ws_addr.port();
    let token = generate_token();

    // Write discovery files (for native host fallback)
    let dir = bridge_dir();
    std::fs::create_dir_all(&dir).ok();
    std::fs::write(dir.join("bridge.port"), ws_port.to_string()).ok();
    std::fs::write(dir.join("bridge.token"), &token).ok();

    eprintln!("[bridge] WebSocket server listening on 127.0.0.1:{}", ws_port);

    // Start HTTP discovery endpoint on fixed port
    let discovery_token = token.clone();
    tokio::spawn(async move {
        run_discovery_server(ws_port, discovery_token).await;
    });

    // Accept WebSocket connections
    loop {
        if let Ok((stream, _)) = ws_listener.accept().await {
            let state = Arc::clone(&state);
            let token = token.clone();
            tokio::spawn(async move {
                handle_connection(stream, state, token).await;
            });
        }
    }
}

/// HTTP server on a fixed port that returns the WS port + token.
/// The browser extension fetches this to auto-discover the bridge.
async fn run_discovery_server(ws_port: u16, token: String) {
    let listener = match TokioTcpListener::bind(format!("127.0.0.1:{}", DISCOVERY_PORT)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[bridge] Discovery server failed to bind on port {}: {}", DISCOVERY_PORT, e);
            return;
        }
    };

    eprintln!("[bridge] Discovery server listening on 127.0.0.1:{}", DISCOVERY_PORT);

    loop {
        if let Ok((mut stream, _)) = listener.accept().await {
            let body = serde_json::json!({
                "port": ws_port,
                "token": token,
            })
            .to_string();

            // Respond to any HTTP request with the config JSON
            // Include CORS headers so the extension can fetch it
            let response = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: application/json\r\n\
                 Content-Length: {}\r\n\
                 Access-Control-Allow-Origin: *\r\n\
                 Access-Control-Allow-Methods: GET\r\n\
                 Connection: close\r\n\
                 \r\n\
                 {}",
                body.len(),
                body
            );

            // Read the request first (consume it)
            let mut buf = [0u8; 1024];
            let _ = tokio::io::AsyncReadExt::read(&mut stream, &mut buf).await;

            // Send response
            let _ = stream.write_all(response.as_bytes()).await;
            let _ = stream.shutdown().await;
        }
    }
}

async fn handle_connection(
    stream: tokio::net::TcpStream,
    state: Arc<AppState>,
    expected_token: String,
) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(_) => return,
    };

    let (mut write, mut read) = ws_stream.split();
    let mut authenticated = false;

    while let Some(msg) = read.next().await {
        let msg = match msg {
            Ok(Message::Text(t)) => t,
            Ok(Message::Close(_)) => break,
            _ => continue,
        };

        let request: serde_json::Value = match serde_json::from_str(&msg) {
            Ok(v) => v,
            Err(_) => {
                let _ = write
                    .send(Message::Text(r#"{"error":"invalid_json"}"#.to_string()))
                    .await;
                continue;
            }
        };

        let method = request["method"].as_str().unwrap_or("");

        if !authenticated {
            if method == "auth" {
                let tok = request["token"].as_str().unwrap_or("");
                if tok == expected_token {
                    authenticated = true;
                    let _ = write
                        .send(Message::Text(r#"{"result":"authenticated"}"#.to_string()))
                        .await;
                } else {
                    let _ = write
                        .send(Message::Text(r#"{"error":"invalid_token"}"#.to_string()))
                        .await;
                    break;
                }
            } else {
                let _ = write
                    .send(Message::Text(r#"{"error":"auth_required"}"#.to_string()))
                    .await;
            }
            continue;
        }

        let response = handle_message(method, &request, &state);
        let _ = write.send(Message::Text(response)).await;
    }
}

fn handle_message(method: &str, request: &serde_json::Value, state: &AppState) -> String {
    match method {
        "status" => {
            let auth = state.auth.lock().expect("auth mutex poisoned");
            let locked = auth.is_locked();
            serde_json::json!({ "result": { "locked": locked } }).to_string()
        }

        "lookup" => {
            {
                let auth = state.auth.lock().expect("auth mutex poisoned");
                if auth.is_locked() {
                    return r#"{"error":"vault_locked"}"#.to_string();
                }
            }

            let url = request["url"].as_str().unwrap_or("");
            let username = request["username"].as_str();

            // Get full rows with search_index to extract stored usernames
            let domain = db::extract_domain(url).unwrap_or_default();
            let domain_pattern = format!("%{}%", domain.to_lowercase());
            let conn = state.db.conn();
            let mut stmt = match conn.prepare(
                "SELECT id, cred_type, name, favorite, search_index FROM credentials WHERE cred_type = 'login' AND (LOWER(search_index) LIKE ?1 OR LOWER(name) LIKE ?1) ORDER BY updated_at DESC",
            ) {
                Ok(s) => s,
                Err(e) => return serde_json::json!({ "error": e.to_string() }).to_string(),
            };

            let email_re = regex_lite::Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap();

            let rows: Vec<(String, String, String, bool, String)> = {
                let result = stmt
                    .query_map(rusqlite::params![domain_pattern], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, i32>(3)? != 0,
                            row.get::<_, String>(4)?,
                        ))
                    });
                match result {
                    Ok(r) => r.filter_map(|r| r.ok()).collect(),
                    Err(e) => return serde_json::json!({ "error": e.to_string() }).to_string(),
                }
            };
            drop(stmt);
            drop(conn);

            // Filter by username if provided
            let filtered: Vec<&(String, String, String, bool, String)> = if let Some(user) = username {
                let user_lower = user.to_lowercase();
                if !user_lower.is_empty() {
                    let matches: Vec<_> = rows.iter().filter(|r| r.4.to_lowercase().contains(&user_lower)).collect();
                    if !matches.is_empty() { matches } else { rows.iter().collect() }
                } else {
                    rows.iter().collect()
                }
            } else {
                rows.iter().collect()
            };

            let items: Vec<serde_json::Value> = filtered
                .into_iter()
                .map(|r| {
                    // Extract email from search_index for display
                    let stored_email = email_re.find(&r.4).map(|m| m.as_str()).unwrap_or("");
                    serde_json::json!({
                        "id": r.0,
                        "name": r.2,
                        "cred_type": r.1,
                        "favorite": r.3,
                        "username": stored_email,
                    })
                })
                .collect();
            serde_json::json!({ "result": items }).to_string()
        }

        "get_credential" => {
            {
                let auth = state.auth.lock().expect("auth mutex poisoned");
                if auth.is_locked() {
                    return r#"{"error":"vault_locked"}"#.to_string();
                }
            }

            let id = request["id"].as_str().unwrap_or("");
            let key_guard = state.key.lock().expect("key mutex poisoned");
            let key = match key_guard.as_ref() {
                Some(k) => k,
                None => return r#"{"error":"vault_locked"}"#.to_string(),
            };

            match db::get_credential(&state.db, id) {
                Ok(row) => match crypto::decrypt(key.as_bytes(), &row.data) {
                    Ok(decrypted) => {
                        let data_str = String::from_utf8_lossy(&decrypted);
                        serde_json::json!({
                            "result": {
                                "id": row.id,
                                "name": row.name,
                                "cred_type": row.cred_type,
                                "data": serde_json::from_str::<serde_json::Value>(&data_str).unwrap_or_default(),
                            }
                        })
                        .to_string()
                    }
                    Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
                },
                Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
            }
        }

        "save_credential" => {
            {
                let auth = state.auth.lock().expect("auth mutex poisoned");
                if auth.is_locked() {
                    return r#"{"error":"vault_locked"}"#.to_string();
                }
            }

            let key_guard = state.key.lock().expect("key mutex poisoned");
            let key = match key_guard.as_ref() {
                Some(k) => *k.as_bytes(),
                None => return r#"{"error":"vault_locked"}"#.to_string(),
            };
            drop(key_guard);

            let name = request["name"].as_str().unwrap_or("Unknown Site");
            let url = request["url"].as_str().unwrap_or("");
            let username = request["username"].as_str().unwrap_or("");
            let password = request["password"].as_str().unwrap_or("");

            let data = serde_json::json!({
                "service_name": name,
                "url": url,
                "username": username,
                "password": password,
            });
            let data_str = data.to_string();

            let domain = db::extract_domain(url).unwrap_or_default();
            let search_index =
                format!("{} {} {} {}", name, domain, url, username).to_lowercase();

            match crypto::encrypt(&key, data_str.as_bytes()) {
                Ok(encrypted) => {
                    let id = uuid::Uuid::new_v4().to_string();
                    match db::create_credential(
                        &state.db,
                        &id,
                        "login",
                        name,
                        &search_index,
                        &encrypted,
                    ) {
                        Ok(_) => {
                            serde_json::json!({ "result": { "id": id, "name": name } }).to_string()
                        }
                        Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
                    }
                }
                Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
            }
        }

        _ => r#"{"error":"unknown_method"}"#.to_string(),
    }
}
