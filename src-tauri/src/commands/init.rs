use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::crypto::{self, decrypt, derive_key, encrypt, generate_salt, CipherError};
use crate::state::AppState;

const VERIFICATION_TOKEN: &[u8] = b"GILA_VAULT_VERIFICATION_v1";

#[derive(Debug, Serialize)]
pub enum InitError {
    AlreadyInitialized,
    Crypto(String),
    Database(String),
    InvalidPassword,
}

impl std::fmt::Display for InitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InitError::AlreadyInitialized => write!(f, "vault is already initialized"),
            InitError::Crypto(e) => write!(f, "crypto error: {}", e),
            InitError::Database(e) => write!(f, "database error: {}", e),
            InitError::InvalidPassword => write!(f, "invalid master password"),
        }
    }
}

impl From<CipherError> for InitError {
    fn from(e: CipherError) -> Self {
        InitError::Crypto(e.to_string())
    }
}

impl From<rusqlite::Error> for InitError {
    fn from(e: rusqlite::Error) -> Self {
        InitError::Database(e.to_string())
    }
}

impl From<argon2::Error> for InitError {
    fn from(e: argon2::Error) -> Self {
        InitError::Crypto(e.to_string())
    }
}

fn is_vault_initialized(state: &AppState) -> Result<bool, rusqlite::Error> {
    let conn = state.db.conn();
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM vault_meta WHERE key = 'salt'",
        [],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

#[tauri::command]
pub fn initialize_vault(
    state: State<'_, AppState>,
    master_password: String,
) -> Result<(), InitError> {
    if is_vault_initialized(&state)? {
        return Err(InitError::AlreadyInitialized);
    }

    let salt = generate_salt();
    let key = derive_key(master_password.as_bytes(), &salt)?;
    let verification = encrypt(key.as_bytes(), VERIFICATION_TOKEN)?;

    {
        let conn = state.db.conn();
        conn.execute(
            "INSERT INTO vault_meta (key, value) VALUES ('salt', ?1)",
            params![salt.to_vec()],
        )?;
        conn.execute(
            "INSERT INTO vault_meta (key, value) VALUES ('verification', ?1)",
            params![verification],
        )?;
    }

    // Store the derived key in app state
    let mut key_guard = state.key.lock().expect("key mutex poisoned");
    *key_guard = Some(key);

    Ok(())
}

/// Inner function that can be called without Tauri's State wrapper.
pub fn verify_master_password_inner(
    state: &AppState,
    master_password: &str,
) -> Result<(), InitError> {
    let conn = state.db.conn();

    let salt_bytes: Vec<u8> = conn
        .query_row("SELECT value FROM vault_meta WHERE key = 'salt'", [], |row| {
            row.get(0)
        })
        .map_err(|_| InitError::Database("vault not initialized".to_string()))?;

    let verification: Vec<u8> = conn
        .query_row(
            "SELECT value FROM vault_meta WHERE key = 'verification'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| InitError::Database("vault not initialized".to_string()))?;

    drop(conn);

    let mut salt = [0u8; 16];
    if salt_bytes.len() != 16 {
        return Err(InitError::Database("corrupted salt".to_string()));
    }
    salt.copy_from_slice(&salt_bytes);

    let key = derive_key(master_password.as_bytes(), &salt)?;

    match decrypt(key.as_bytes(), &verification) {
        Ok(plaintext) if plaintext == VERIFICATION_TOKEN => {
            let mut key_guard = state.key.lock().expect("key mutex poisoned");
            *key_guard = Some(key);
            Ok(())
        }
        _ => Err(InitError::InvalidPassword),
    }
}

#[tauri::command]
pub fn verify_master_password(
    state: State<'_, AppState>,
    master_password: String,
) -> Result<(), InitError> {
    verify_master_password_inner(&state, &master_password)
}

#[tauri::command]
pub fn is_vault_setup(state: State<'_, AppState>) -> Result<bool, InitError> {
    Ok(is_vault_initialized(&state)?)
}
