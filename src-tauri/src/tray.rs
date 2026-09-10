use tauri::{AppHandle, Emitter, Manager, menu::{MenuBuilder, MenuItem}, tray::TrayIconBuilder};
use crate::capture_runtime;

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let capture = MenuItem::with_id(app, "capture", "Quick Capture", true, None::<&str>)?;
    let retrieve = MenuItem::with_id(app, "retrieve", "Retrieve thoughts", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = MenuBuilder::new(app).item(&capture).item(&retrieve).separator().item(&quit).build()?;
    TrayIconBuilder::new().icon(app.default_window_icon().ok_or("Missing tray icon")?.clone())
        .tooltip("HoverThought").menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "capture" => {
                if let Err(error) = capture_runtime::show_capture(app) {
                    let _ = app.emit_to("anchor", "runtime-error", error);
                }
            }
            "retrieve" => {
                if let Some(window) = app.get_webview_window("anchor") { let _ = window.show(); }
                let _ = app.emit_to("anchor", "browse-requested", ());
            }
            "quit" => { let _ = app.emit_to("editor", "quit-requested", ()); }
            _ => {}
        }).build(app)?;
    Ok(())
}