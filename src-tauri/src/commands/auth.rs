use serde::Serialize;
use tauri::State;

use crate::commands::init::InitError;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct LockState {
    pub locked: bool,
    pub vault_initialized: bool,
}

#[tauri::command]
pub fn get_lock_state(state: State<'_, AppState>) -> LockState {
    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.check_inactivity();

    // If auto-lock triggered, also wipe the key
    if auth.is_locked() {
        let mut key = state.key.lock().expect("key mutex poisoned");
        *key = None;
    }

    let vault_initialized = {
        let conn = state.db.conn();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM vault_meta WHERE key = 'salt'", [], |row| row.get(0))
            .unwrap_or(0);
        count > 0
    };

    LockState {
        locked: auth.is_locked(),
        vault_initialized,
    }
}

#[tauri::command]
pub fn lock_vault(state: State<'_, AppState>) {
    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.lock();

    let mut key = state.key.lock().expect("key mutex poisoned");
    *key = None;
}

#[tauri::command]
pub fn unlock_vault(
    state: State<'_, AppState>,
    master_password: String,
) -> Result<(), InitError> {
    // Reuse verify_master_password logic
    crate::commands::init::verify_master_password_inner(&state, &master_password)?;

    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.unlock();

    Ok(())
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
pub fn confirm_auth(
    state: State<'_, AppState>,
    master_password: String,
) -> Result<(), InitError> {
    crate::commands::init::verify_master_password_inner(&state, &master_password)?;

    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.record_auth();

    Ok(())
}
