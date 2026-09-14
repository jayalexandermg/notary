mod captures;
mod capture_runtime;
mod engaged_notes;
mod surface_geometry;
mod db;
mod foreground;
mod hotkeys;
mod tray;

use tauri::Manager;
pub use db::{Database, Note, Settings};


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            // Debug smoke tests never rewrite the owner's data.
            #[cfg(debug_assertions)]
            let app_data_dir = std::env::var_os("HOVERTHOUGHT_TEST_DATA_DIR")
                .map(std::path::PathBuf::from).unwrap_or(app_data_dir);
            app.manage(Database::new(app_data_dir)?);
            app.manage(capture_runtime::CaptureRuntime::default());
            app.manage(hotkeys::Hotkeys::default());
            app.manage(engaged_notes::Editors::default());
            capture_runtime::create_surfaces(app.handle())?;
            if let Err(error) = hotkeys::register_hotkeys(app.handle()) {
                eprintln!("Quick Capture shortcut registration failed: {error}");
            }
            tray::setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_runtime::capture_surface_ready,
            capture_runtime::capture_input_ready,
            capture_runtime::commit_capture,
            capture_runtime::cancel_capture,
            capture_runtime::report_commit_elapsed,
            capture_runtime::get_capture_measurements,
            capture_runtime::set_anchor_expanded,
            capture_runtime::list_captures,
            capture_runtime::get_capture_context,
            capture_runtime::create_project,
            capture_runtime::set_primary_project,
            capture_runtime::reassign_capture,
            capture_runtime::list_legacy_notes,
            capture_runtime::get_capture,
            capture_runtime::get_capture_shortcut,
            capture_runtime::set_capture_shortcut,
            capture_runtime::get_quick_presentation,
            capture_runtime::update_quick_presentation,
            capture_runtime::set_capture_router,
            engaged_notes::engage_capture,
            engaged_notes::new_project_note,
            engaged_notes::load_editor,
            engaged_notes::editor_close_settled,
            engaged_notes::save_editor,
            engaged_notes::update_editor_presentation,
            engaged_notes::trash_editor,
            engaged_notes::list_deleted_captures,
            engaged_notes::restore_capture,
            engaged_notes::permanently_delete_capture,
            engaged_notes::finish_quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HoverThought");
}
