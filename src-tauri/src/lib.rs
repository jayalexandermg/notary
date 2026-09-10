mod captures;
mod capture_runtime;
mod db;
mod foreground;
mod hotkeys;
mod tray;

use tauri::Manager;
pub use db::{Database, Note, Settings};

#[tauri::command(rename_all = "snake_case")]
async fn finish_quit(app: tauri::AppHandle) { app.exit(0); }

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
            capture_runtime::list_legacy_notes,
            capture_runtime::get_capture,
            capture_runtime::engage_capture,
            capture_runtime::pending_editor,
            capture_runtime::show_editor,
            capture_runtime::save_capture_edit,
            capture_runtime::update_capture_presentation,
            capture_runtime::get_capture_shortcut,
            capture_runtime::set_capture_shortcut,
            finish_quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HoverThought");
}