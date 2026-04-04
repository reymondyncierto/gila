use crate::clipboard;

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    clipboard::copy_and_schedule_clear(&text)
}
