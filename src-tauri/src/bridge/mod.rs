use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener as TokioTcpListener;
use tokio_tungstenite::tungstenite::Message;

use crate::crypto;
use crate::db;
use crate::state::AppState;

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

/// Start the WebSocket bridge server on a random port on 127.0.0.1.
/// Writes port and token to ~/.gila/bridge.port and ~/.gila/bridge.token.
pub fn start_bridge(state: Arc<AppState>) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
        rt.block_on(async move {
            run_server(state).await;
        });
    });
}

async fn run_server(state: Arc<AppState>) {
    // Bind to a random available port
    let listener = TokioTcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind bridge server");
    let addr = listener.local_addr().expect("no local addr");
    let port = addr.port();
    let token = generate_token();

    // Write discovery files
    let dir = bridge_dir();
    std::fs::create_dir_all(&dir).ok();
    std::fs::write(dir.join("bridge.port"), port.to_string()).ok();
    std::fs::write(dir.join("bridge.token"), &token).ok();

    eprintln!("[bridge] WebSocket server listening on 127.0.0.1:{}", port);

    loop {
        if let Ok((stream, _)) = listener.accept().await {
            let state = Arc::clone(&state);
            let token = token.clone();
            tokio::spawn(async move {
                handle_connection(stream, state, token).await;
            });
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
                    .send(Message::Text(
                        r#"{"error":"invalid_json"}"#.to_string(),
                    ))
                    .await;
                continue;
            }
        };

        let method = request["method"].as_str().unwrap_or("");

        // Auth check — first message must be "auth" with the correct token
        if !authenticated {
            if method == "auth" {
                let tok = request["token"].as_str().unwrap_or("");
                if tok == expected_token {
                    authenticated = true;
                    let _ = write
                        .send(Message::Text(
                            r#"{"result":"authenticated"}"#.to_string(),
                        ))
                        .await;
                } else {
                    let _ = write
                        .send(Message::Text(
                            r#"{"error":"invalid_token"}"#.to_string(),
                        ))
                        .await;
                    break;
                }
            } else {
                let _ = write
                    .send(Message::Text(
                        r#"{"error":"auth_required"}"#.to_string(),
                    ))
                    .await;
            }
            continue;
        }

        let response = handle_message(method, &request, &state);
        let _ = write.send(Message::Text(response)).await;
    }
}

fn handle_message(
    method: &str,
    request: &serde_json::Value,
    state: &AppState,
) -> String {
    match method {
        "status" => {
            let auth = state.auth.lock().expect("auth mutex poisoned");
            let locked = auth.is_locked();
            serde_json::json!({
                "result": { "locked": locked }
            })
            .to_string()
        }

        "lookup" => {
            // Check if vault is unlocked
            {
                let auth = state.auth.lock().expect("auth mutex poisoned");
                if auth.is_locked() {
                    return r#"{"error":"vault_locked"}"#.to_string();
                }
            }

            let url = request["url"].as_str().unwrap_or("");
            match db::match_credentials_by_url(&state.db, url) {
                Ok(rows) => {
                    let items: Vec<serde_json::Value> = rows
                        .into_iter()
                        .map(|r| {
                            serde_json::json!({
                                "id": r.id,
                                "name": r.name,
                                "cred_type": r.cred_type,
                                "favorite": r.favorite,
                            })
                        })
                        .collect();
                    serde_json::json!({ "result": items }).to_string()
                }
                Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
            }
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
                Ok(row) => {
                    match crypto::decrypt(key.as_bytes(), &row.data) {
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
                    }
                }
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
            let search_index = format!("{} {} {} {}", name, domain, url, username).to_lowercase();

            match crypto::encrypt(&key, data_str.as_bytes()) {
                Ok(encrypted) => {
                    let id = uuid::Uuid::new_v4().to_string();
                    match db::create_credential(&state.db, &id, "login", name, &search_index, &encrypted)
                    {
                        Ok(_) => serde_json::json!({
                            "result": { "id": id, "name": name }
                        })
                        .to_string(),
                        Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
                    }
                }
                Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
            }
        }

        _ => r#"{"error":"unknown_method"}"#.to_string(),
    }
}
