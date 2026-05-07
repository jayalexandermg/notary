use tauri::{
    AppHandle, Manager,
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
};
use crate::db::Database;
use crate::note_window::spawn_note_window;

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let new_note = MenuItem::with_id(app, "new_note", "New Note", true, None::<&str>)?;
    let show_all = MenuItem::with_id(app, "show_all", "Show All", true, None::<&str>)?;
    let hide_all = MenuItem::with_id(app, "hide_all", "Hide All", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&new_note)
        .separator()
        .item(&show_all)
        .item(&hide_all)
        .separator()
        .item(&quit)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("HoverThought HUD")
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "new_note" => {
                    let db = app.state::<Database>();
                    if let Ok(note) = db.create_note(100, 100) {
                        spawn_note_window(app, note);
                    }
                }
                "show_all" => {
                    for (label, window) in app.webview_windows() {
                        if label.starts_with("note-") {
                            let _ = window.unminimize();
                            let _ = window.show();
                        }
                    }
                }
                "hide_all" => {
                    for (label, window) in app.webview_windows() {
                        if label.starts_with("note-") {
                            let _ = window.minimize();
                        }
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
