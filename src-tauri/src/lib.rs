pub mod commands;
pub mod crypto;
pub mod db;
pub mod state;

use state::AppState;
use std::sync::Mutex;
use tauri::Manager;

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

            app.manage(AppState {
                db: pool,
                key: Mutex::new(None),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault::create_credential,
            commands::vault::update_credential,
            commands::vault::delete_credential,
            commands::vault::list_credentials,
            commands::vault::get_credential,
            commands::vault::search_credentials,
            commands::vault::toggle_favorite,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
