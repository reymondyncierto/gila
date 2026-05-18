use serde::Serialize;
use tauri::State;

use crate::commands::init::InitError;
use crate::crypto;
use crate::db;
use crate::state::AppState;

const TRUSTED_SESSION_SERVICE: &str = "com.rpyncierto.gila";
const TRUSTED_SESSION_USER: &str = "gila-trusted-linux-session";

#[derive(Debug, Serialize)]
pub struct LockState {
    pub locked: bool,
    pub vault_initialized: bool,
    pub trusted_session_available: bool,
    pub trusted_session_enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct TrustedSessionStatus {
    pub available: bool,
    pub enabled: bool,
}

fn trusted_session_status() -> TrustedSessionStatus {
    if !cfg!(target_os = "linux") {
        return TrustedSessionStatus {
            available: false,
            enabled: false,
        };
    }

    match keyring::Entry::new(TRUSTED_SESSION_SERVICE, TRUSTED_SESSION_USER) {
        Ok(entry) => TrustedSessionStatus {
            available: true,
            enabled: entry.get_password().is_ok(),
        },
        Err(_) => TrustedSessionStatus {
            available: false,
            enabled: false,
        },
    }
}

fn trusted_session_entry() -> Result<keyring::Entry, String> {
    if !cfg!(target_os = "linux") {
        return Err("trusted Linux sessions are only available on Linux".to_string());
    }

    keyring::Entry::new(TRUSTED_SESSION_SERVICE, TRUSTED_SESSION_USER).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_lock_state(state: State<'_, AppState>) -> LockState {
    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    let trusted_session = trusted_session_status();
    if !trusted_session.enabled {
        auth.check_inactivity();
    }

    // If auto-lock triggered, also wipe the key
    if auth.is_locked() {
        let mut key = state.key.lock().expect("key mutex poisoned");
        *key = None;
    }

    let vault_initialized = {
        let conn = state.db.conn();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM vault_meta WHERE key = 'salt'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        count > 0
    };

    LockState {
        locked: auth.is_locked(),
        vault_initialized,
        trusted_session_available: trusted_session.available,
        trusted_session_enabled: trusted_session.enabled,
    }
}

#[tauri::command]
pub fn get_trusted_session_status() -> TrustedSessionStatus {
    trusted_session_status()
}

#[tauri::command]
pub fn enable_trusted_session_auto_unlock(
    state: State<'_, AppState>,
    master_password: String,
) -> Result<TrustedSessionStatus, String> {
    crate::commands::init::verify_master_password_inner(&state, &master_password)
        .map_err(|e| e.to_string())?;

    let entry = trusted_session_entry()?;
    entry
        .set_password(&master_password)
        .map_err(|e| e.to_string())?;

    Ok(trusted_session_status())
}

#[tauri::command]
pub fn disable_trusted_session_auto_unlock() -> Result<TrustedSessionStatus, String> {
    let status = trusted_session_status();
    if !status.available {
        return Ok(status);
    }

    if status.enabled {
        let entry = trusted_session_entry()?;
        entry.delete_credential().map_err(|e| e.to_string())?;
    }

    Ok(trusted_session_status())
}

#[tauri::command]
pub fn attempt_trusted_session_unlock(state: State<'_, AppState>) -> bool {
    let status = trusted_session_status();
    if !status.enabled {
        return false;
    }

    let entry = match trusted_session_entry() {
        Ok(entry) => entry,
        Err(_) => return false,
    };

    let password = match entry.get_password() {
        Ok(password) => password,
        Err(_) => return false,
    };

    if crate::commands::init::verify_master_password_inner(&state, &password).is_err() {
        return false;
    }

    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.unlock();
    drop(auth);

    process_pending_credentials(&state);
    true
}

#[tauri::command]
pub fn lock_vault(state: State<'_, AppState>) {
    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.lock();

    let mut key = state.key.lock().expect("key mutex poisoned");
    *key = None;
}

#[tauri::command]
pub fn unlock_vault(state: State<'_, AppState>, master_password: String) -> Result<(), InitError> {
    // Reuse verify_master_password logic
    crate::commands::init::verify_master_password_inner(&state, &master_password)?;

    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.unlock();
    drop(auth);

    // Process any credentials queued while the vault was locked
    process_pending_credentials(&state);

    Ok(())
}

/// Encrypt and save credentials that were queued by the bridge while the vault was locked.
pub fn process_pending_credentials(state: &AppState) {
    let pending: Vec<crate::state::PendingCredential> = {
        let mut queue = state
            .pending_credentials
            .lock()
            .expect("pending mutex poisoned");
        queue.drain(..).collect()
    };

    if pending.is_empty() {
        return;
    }

    let key = {
        let key_guard = state.key.lock().expect("key mutex poisoned");
        match key_guard.as_ref() {
            Some(k) => *k.as_bytes(),
            None => return, // no key available, skip
        }
    };

    for cred in pending {
        let domain = db::extract_domain(&cred.url).unwrap_or_default();
        let name = if cred.name.is_empty() {
            if domain.is_empty() {
                "Unknown Site".to_string()
            } else {
                domain.clone()
            }
        } else {
            cred.name.clone()
        };

        let data = serde_json::json!({
            "service_name": name,
            "url": cred.url,
            "username": cred.username,
            "password": cred.password,
        });
        let data_str = data.to_string();
        let search_index = format!("{} {} {}", name, domain, cred.username).to_lowercase();

        // Check for existing credential with the same username to update instead of duplicate
        let username_lower = cred.username.to_lowercase();
        let exact_match = if !cred.username.is_empty() {
            if let Ok(matches) = db::match_credentials_by_url(&state.db, &cred.url) {
                matches
                    .into_iter()
                    .find(|m| m.search_index.to_lowercase().contains(&username_lower))
            } else {
                None
            }
        } else {
            None
        };

        if let Some(matched) = exact_match {
            if let Ok(encrypted) = crypto::encrypt(&key, data_str.as_bytes()) {
                let _ =
                    db::update_credential(&state.db, &matched.id, &name, &search_index, &encrypted);
            }
        } else {
            if let Ok(encrypted) = crypto::encrypt(&key, data_str.as_bytes()) {
                let id = uuid::Uuid::new_v4().to_string();
                let _ = db::create_credential(
                    &state.db,
                    &id,
                    "login",
                    &name,
                    &search_index,
                    &encrypted,
                );
            }
        }
    }
}

#[tauri::command]
pub fn touch_activity(state: State<'_, AppState>) {
    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.touch();
}

#[derive(Debug, Serialize)]
pub struct AuthCheckResult {
    pub authorized: bool,
    pub reason: Option<String>,
}

#[tauri::command]
pub fn request_auth(state: State<'_, AppState>) -> AuthCheckResult {
    let auth = state.auth.lock().expect("auth mutex poisoned");

    if auth.is_locked() {
        return AuthCheckResult {
            authorized: false,
            reason: Some("vault_locked".to_string()),
        };
    }

    if trusted_session_status().enabled {
        return AuthCheckResult {
            authorized: true,
            reason: None,
        };
    }

    if auth.is_within_grace_period() {
        return AuthCheckResult {
            authorized: true,
            reason: None,
        };
    }

    AuthCheckResult {
        authorized: false,
        reason: Some("needs_auth".to_string()),
    }
}

#[tauri::command]
pub fn confirm_auth(state: State<'_, AppState>, master_password: String) -> Result<(), InitError> {
    crate::commands::init::verify_master_password_inner(&state, &master_password)?;

    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.record_auth();

    Ok(())
}
