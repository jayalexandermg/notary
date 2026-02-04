use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::db::Database;
use crate::note_window::{close_all_note_windows, create_note_window, show_all_note_windows};

static NOTES_VISIBLE: AtomicBool = AtomicBool::new(true);

pub fn register_hotkeys(app: &AppHandle) -> Result<(), String> {
    let app_handle = app.clone();

    // Ctrl+Shift+N: Create new note
    let new_note_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);

    // Ctrl+Shift+H: Hide/show all notes
    let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH);

    app.global_shortcut().on_shortcut(new_note_shortcut, move |app, _shortcut, _event| {
        let db = app.state::<Database>();

        // Create note at a default position (center-ish of screen)
        // In a real app, we'd get the cursor position
        let note = match db.create_note(100, 100) {
            Ok(n) => n,
            Err(e) => {
                eprintln!("Failed to create note: {}", e);
                return;
            }
        };

        if let Err(e) = create_note_window(app, &note) {
            eprintln!("Failed to create note window: {}", e);
        }
    }).map_err(|e| e.to_string())?;

    app_handle.global_shortcut().on_shortcut(toggle_shortcut, move |app, _shortcut, _event| {
        let visible = NOTES_VISIBLE.load(Ordering::SeqCst);

        if visible {
            close_all_note_windows(app);
            NOTES_VISIBLE.store(false, Ordering::SeqCst);
        } else {
            show_all_note_windows(app);
            NOTES_VISIBLE.store(true, Ordering::SeqCst);
        }
    }).map_err(|e| e.to_string())?;

    Ok(())
}
