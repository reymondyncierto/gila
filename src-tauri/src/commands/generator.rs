use crate::generator::{self, GeneratorOptions};

#[tauri::command]
pub fn generate_password(options: GeneratorOptions) -> Result<String, String> {
    generator::generate_password(&options)
}
