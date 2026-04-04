pub mod auth;
pub mod bridge;
pub mod clipboard;
pub mod commands;
pub mod crypto;
pub mod db;
pub mod generator;
pub mod state;

use state::AppState;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;

/// Show a hidden window and reload the webview so it doesn't display a
/// stale "connection refused" page from when it was created while hidden.
fn show_window(window: &tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    // Reload if the page failed to load initially (e.g. dev server wasn't ready)
    let _ = window.eval("if(!document.querySelector('#root')?.children.length) location.reload();");
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");

            let db_path = app_dir.join("gila.db");
            let pool = db::DbPool::new(&db_path).expect("failed to open database");
            db::initialize_db(&pool).expect("failed to initialize database");

            let key = Arc::new(Mutex::new(None));
            let auth_state = Arc::new(Mutex::new(auth::AuthState::new()));
            let pending = Arc::new(Mutex::new(Vec::new()));
            let handle = Arc::new(Mutex::new(Some(app.handle().clone())));

            // Start the WebSocket bridge with its own DB connection
            let bridge_pool = db::DbPool::new(&db_path).expect("failed to open bridge database");
            db::initialize_db(&bridge_pool).ok();
            let bridge_state = Arc::new(AppState {
                db: bridge_pool,
                key: Arc::clone(&key),
                auth: Arc::clone(&auth_state),
                pending_credentials: Arc::clone(&pending),
                app_handle: Arc::clone(&handle),
            });
            bridge::start_bridge(bridge_state);

            app.manage(AppState {
                db: pool,
                key,
                auth: auth_state,
                pending_credentials: pending,
                app_handle: handle,
            });

            // Start hidden in the system tray
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.hide();
            }

            // Build system tray menu
            let open_item = MenuItemBuilder::with_id("open", "Open Gila").build(app)?;
            let lock_item = MenuItemBuilder::with_id("lock", "Lock Vault").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .item(&open_item)
                .item(&lock_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .tooltip("Gila — Password Manager")
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                show_window(&window);
                            }
                        }
                        "lock" => {
                            let state = app.state::<AppState>();
                            let mut auth = state.auth.lock().expect("auth mutex poisoned");
                            auth.lock();
                            let mut key = state.key.lock().expect("key mutex poisoned");
                            *key = None;
                            if let Some(window) = app.get_webview_window("main") {
                                show_window(&window);
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            show_window(&window);
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide to tray on close instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault::create_credential,
            commands::vault::update_credential,
            commands::vault::delete_credential,
            commands::vault::list_credentials,
            commands::vault::get_credential,
            commands::vault::search_credentials,
            commands::vault::toggle_favorite,
            commands::vault::match_credentials_by_url,
            commands::init::initialize_vault,
            commands::init::verify_master_password,
            commands::init::is_vault_setup,
            commands::generator::generate_password,
            commands::clipboard::copy_to_clipboard,
            commands::auth::get_lock_state,
            commands::auth::lock_vault,
            commands::auth::unlock_vault,
            commands::auth::touch_activity,
            commands::auth::request_auth,
            commands::auth::confirm_auth,
            commands::biometric::check_biometric_status,
            commands::biometric::enroll_biometric,
            commands::biometric::biometric_unlock,
            commands::biometric::biometric_confirm_auth,
            commands::biometric::remove_biometric,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
