use arboard::Clipboard;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const CLEAR_DELAY_SECS: u64 = 45;

static CLEAR_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Copy text to the clipboard and schedule auto-clear after 45 seconds.
/// If a new copy happens before the timer fires, the old timer is invalidated.
pub fn copy_and_schedule_clear(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;

    let expected_text = text.to_string();
    let generation = CLEAR_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;

    thread::spawn(move || {
        thread::sleep(Duration::from_secs(CLEAR_DELAY_SECS));

        // Only clear if no newer copy has happened
        let current = CLEAR_COUNTER.load(std::sync::atomic::Ordering::SeqCst);
        if current != generation {
            return;
        }

        if let Ok(mut clipboard) = Clipboard::new() {
            if let Ok(current_text) = clipboard.get_text() {
                if current_text == expected_text {
                    let _ = clipboard.set_text("");
                }
            }
        }
    });

    Ok(())
}
