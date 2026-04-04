use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::crypto::{decrypt, encrypt, CipherError};
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

#[derive(Debug, Serialize)]
pub struct CredentialListItem {
    pub id: String,
    pub cred_type: String,
    pub name: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct CredentialDetail {
    pub id: String,
    pub cred_type: String,
    pub name: String,
    pub data: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub fn list_credentials(
    state: State<'_, AppState>,
    cred_type: Option<String>,
    favorites_only: Option<bool>,
) -> Result<Vec<CredentialListItem>, VaultError> {
    let rows = db::list_credentials(
        &state.db,
        cred_type.as_deref(),
        favorites_only.unwrap_or(false),
    )?;

    Ok(rows
        .into_iter()
        .map(|r| CredentialListItem {
            id: r.id,
            cred_type: r.cred_type,
            name: r.name,
            favorite: r.favorite,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

#[tauri::command]
pub fn get_credential(
    state: State<'_, AppState>,
    id: String,
) -> Result<CredentialDetail, VaultError> {
    let key = get_key_bytes(&state)?;
    let row = db::get_credential(&state.db, &id)?;
    let decrypted = decrypt(&key, &row.data)?;
    let data_str = String::from_utf8(decrypted).map_err(|e| VaultError::Encryption(e.to_string()))?;

    Ok(CredentialDetail {
        id: row.id,
        cred_type: row.cred_type,
        name: row.name,
        data: data_str,
        favorite: row.favorite,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

#[tauri::command]
pub fn search_credentials(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<CredentialListItem>, VaultError> {
    let rows = db::search_credentials(&state.db, &query)?;

    Ok(rows
        .into_iter()
        .map(|r| CredentialListItem {
            id: r.id,
            cred_type: r.cred_type,
            name: r.name,
            favorite: r.favorite,
            created_at: r.created_at,
            updated_at: r.updated_at,
        })
        .collect())
}

#[tauri::command]
pub fn toggle_favorite(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), VaultError> {
    db::toggle_favorite(&state.db, &id)?;
    Ok(())
}
