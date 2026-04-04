use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::crypto::{encrypt, CipherError};
use crate::db;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub enum VaultError {
    NotUnlocked,
    Encryption(String),
    Database(String),
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VaultError::NotUnlocked => write!(f, "vault is locked"),
            VaultError::Encryption(e) => write!(f, "encryption error: {}", e),
            VaultError::Database(e) => write!(f, "database error: {}", e),
        }
    }
}

impl From<CipherError> for VaultError {
    fn from(e: CipherError) -> Self {
        VaultError::Encryption(e.to_string())
    }
}

impl From<rusqlite::Error> for VaultError {
    fn from(e: rusqlite::Error) -> Self {
        VaultError::Database(e.to_string())
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateCredentialInput {
    pub cred_type: String,
    pub name: String,
    pub search_index: String,
    pub data: String, // JSON string of credential fields
}

#[derive(Debug, Deserialize)]
pub struct UpdateCredentialInput {
    pub id: String,
    pub name: String,
    pub search_index: String,
    pub data: String,
}

fn get_key_bytes(state: &AppState) -> Result<[u8; 32], VaultError> {
    let guard = state.key.lock().expect("key mutex poisoned");
    match guard.as_ref() {
        Some(key) => Ok(*key.as_bytes()),
        None => Err(VaultError::NotUnlocked),
    }
}

#[tauri::command]
pub fn create_credential(
    state: State<'_, AppState>,
    input: CreateCredentialInput,
) -> Result<String, VaultError> {
    let key = get_key_bytes(&state)?;
    let encrypted_data = encrypt(&key, input.data.as_bytes())?;
    let id = Uuid::new_v4().to_string();

    db::create_credential(
        &state.db,
        &id,
        &input.cred_type,
        &input.name,
        &input.search_index,
        &encrypted_data,
    )?;

    Ok(id)
}

#[tauri::command]
pub fn update_credential(
    state: State<'_, AppState>,
    input: UpdateCredentialInput,
) -> Result<(), VaultError> {
    let key = get_key_bytes(&state)?;
    let encrypted_data = encrypt(&key, input.data.as_bytes())?;

    db::update_credential(&state.db, &input.id, &input.name, &input.search_index, &encrypted_data)?;

    Ok(())
}

#[tauri::command]
pub fn delete_credential(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), VaultError> {
    db::delete_credential(&state.db, &id)?;
    Ok(())
}
