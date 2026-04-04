use std::sync::{Arc, Mutex};

use crate::auth::AuthState;
use crate::crypto::DerivedKey;
use crate::db::DbPool;

/// Credential saved from the browser extension while the vault was locked.
/// Stored in plaintext in memory until the vault is unlocked and they can be encrypted.
#[derive(Debug, Clone)]
pub struct PendingCredential {
    pub url: String,
    pub username: String,
    pub password: String,
    pub name: String,
}

pub struct AppState {
    pub db: DbPool,
    pub key: Arc<Mutex<Option<DerivedKey>>>,
    pub auth: Arc<Mutex<AuthState>>,
    pub pending_credentials: Arc<Mutex<Vec<PendingCredential>>>,
    pub app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}
