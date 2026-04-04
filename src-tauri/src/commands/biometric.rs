use serde::Serialize;
use tauri::State;

use crate::commands::init::InitError;
use crate::state::AppState;

const KEYRING_SERVICE: &str = "com.rpyncierto.gila";
const KEYRING_USER: &str = "gila-biometric-key";

#[derive(Debug, Serialize)]
pub struct BiometricStatus {
    pub available: bool,
    pub enrolled: bool,
}

/// Check if biometric auth is available on this platform.
/// On Linux, this checks if a keyring entry exists (as a proxy for enrollment).
#[tauri::command]
pub fn check_biometric_status() -> BiometricStatus {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER);
    match entry {
        Ok(e) => {
            let enrolled = e.get_password().is_ok();
            BiometricStatus {
                available: true,
                enrolled,
            }
        }
        Err(_) => BiometricStatus {
            available: false,
            enrolled: false,
        },
    }
}

/// Enroll biometric: stores the master password in the OS keychain.
/// The user must provide their master password to enroll.
#[tauri::command]
pub fn enroll_biometric(
    state: State<'_, AppState>,
    master_password: String,
) -> Result<(), String> {
    // First verify the password is correct
    crate::commands::init::verify_master_password_inner(&state, &master_password)
        .map_err(|e| e.to_string())?;

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| e.to_string())?;
    entry.set_password(&master_password).map_err(|e| e.to_string())?;

    Ok(())
}

/// Authenticate using biometric: retrieves the master password from the OS keychain
/// and uses it to unlock the vault.
#[tauri::command]
pub fn biometric_unlock(state: State<'_, AppState>) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| e.to_string())?;
    let password = entry.get_password().map_err(|e| format!("Biometric not enrolled: {}", e))?;

    crate::commands::init::verify_master_password_inner(&state, &password)
        .map_err(|e| e.to_string())?;

    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.unlock();

    Ok(())
}

/// Authenticate for a per-action gate using biometric.
#[tauri::command]
pub fn biometric_confirm_auth(state: State<'_, AppState>) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| e.to_string())?;
    let password = entry.get_password().map_err(|e| format!("Biometric not enrolled: {}", e))?;

    crate::commands::init::verify_master_password_inner(&state, &password)
        .map_err(|e| e.to_string())?;

    let mut auth = state.auth.lock().expect("auth mutex poisoned");
    auth.record_auth();

    Ok(())
}

/// Remove biometric enrollment.
#[tauri::command]
pub fn remove_biometric() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())?;
    Ok(())
}
