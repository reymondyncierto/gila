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
