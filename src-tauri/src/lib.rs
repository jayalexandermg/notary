mod commands;
mod db;
mod hotkeys;
mod note_window;

use tauri::Manager;

pub use db::{Database, Note, Settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let db = Database::new(app_data_dir).expect("Failed to initialize database");

            // Store database in app state
            app.manage(db);

            // Register global hotkeys
            let app_handle = app.handle().clone();
            if let Err(e) = hotkeys::register_hotkeys(&app_handle) {
                eprintln!("Failed to register hotkeys: {}", e);
            }

            // Restore open notes
            let db = app.state::<Database>();
            if let Err(e) = note_window::restore_open_notes(&app_handle, &db) {
                eprintln!("Failed to restore notes: {}", e);
            }

            // If no notes exist, create a welcome note
            let notes = db.get_all_notes().unwrap_or_default();
            if notes.is_empty() {
                if let Ok(note) = db.create_note(100, 100) {
                    let _ = db.update_note(&note.id, Some("Welcome"), Some("Welcome to HoverThought HUD!\n\nUse + to create notes\nUse the menu to see all notes"), None, None, None, None, None, None, None);
                    let _ = note_window::create_note_window(&app_handle, &note);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_note,
            commands::get_note,
            commands::get_all_notes,
            commands::update_note,
            commands::close_note,
            commands::open_note,
            commands::delete_note,
            commands::set_opacity,
            commands::set_always_on_top,
            commands::get_settings,
            commands::set_theme,
            commands::set_default_opacity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
