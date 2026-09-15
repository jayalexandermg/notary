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

#[cfg(any(test, feature = "phase5-diagnostics"))]
fn diagnostic_data_dir(value: Option<std::ffi::OsString>, normal: &std::path::Path) -> std::io::Result<std::path::PathBuf> {
    use std::{io::{Error, ErrorKind}, path::PathBuf};
    let path = value.map(PathBuf::from).filter(|p| p.is_absolute())
        .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "phase5-diagnostics requires an absolute HOVERTHOUGHT_TEST_DATA_DIR"))?;
    // Require a prepared directory and resolve aliases before opening any DB.
    let path = path.canonicalize()?;
    if !path.is_dir() { return Err(Error::new(ErrorKind::InvalidInput, "Diagnostic data path must be a directory")); }
    match normal.canonicalize() {
        Ok(owner) if owner.to_string_lossy().eq_ignore_ascii_case(&path.to_string_lossy()) =>
            Err(Error::new(ErrorKind::InvalidInput, "phase5-diagnostics must not use normal application data")),
        Ok(_) => Ok(path),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(path),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod diagnostic_tests {
    #[test]
    fn diagnostic_directory_rejects_missing_relative_and_owner_aliases() {
        let root = std::env::temp_dir().join(format!("phase5-isolation-{}", uuid::Uuid::new_v4()));
        let normal=root.join("owner"); let test=root.join("test");
        std::fs::create_dir_all(&normal).unwrap(); std::fs::create_dir(&test).unwrap();
        assert!(super::diagnostic_data_dir(None,&normal).is_err());
        assert!(super::diagnostic_data_dir(Some("relative".into()),&normal).is_err());
        assert!(super::diagnostic_data_dir(Some(root.join("missing").into_os_string()),&normal).is_err());
        assert!(super::diagnostic_data_dir(Some(normal.clone().into_os_string()),&normal).is_err());
        assert!(super::diagnostic_data_dir(Some(test.join("..").join("owner").into_os_string()),&normal).is_err());
        assert_eq!(super::diagnostic_data_dir(Some(test.clone().into_os_string()),&normal).unwrap(),test.canonicalize().unwrap());
        std::fs::remove_dir_all(root).unwrap();
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            // Diagnostic release builds must fail closed instead of using owner data.
            #[cfg(feature = "phase5-diagnostics")]
            let app_data_dir = diagnostic_data_dir(std::env::var_os("HOVERTHOUGHT_TEST_DATA_DIR"), &app_data_dir)?;
            // Debug smoke tests retain their existing override.
            #[cfg(all(debug_assertions, not(feature = "phase5-diagnostics")))]
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
