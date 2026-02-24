use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WebviewWindow};
use crate::db::{Database, Note};

pub fn create_note_window(app: &AppHandle, note: &Note) -> Result<(), String> {
    let label = format!("note-{}", note.id);

    // Check if window already exists
    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }

    let url = WebviewUrl::App(format!("/#/note/{}", note.id).into());

    let builder = WebviewWindowBuilder::new(app, &label, url)
        .title("HoverThought HUD")
        .decorations(false)
        .transparent(true)
        .always_on_top(note.always_on_top)
        .position(note.pos_x as f64, note.pos_y as f64)
        .inner_size(note.width as f64, note.height as f64)
        .min_inner_size(200.0, 150.0)
        .visible(true);

    builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

pub fn restore_open_notes(app: &AppHandle, db: &Database) -> Result<(), String> {
    let notes = db.get_open_notes().map_err(|e| e.to_string())?;

    for note in notes {
        if let Err(e) = create_note_window(app, &note) {
            eprintln!("Failed to create window for note {}: {}", note.id, e);
        }
    }

    Ok(())
}

pub fn close_all_note_windows(app: &AppHandle) {
    let windows: Vec<(String, WebviewWindow)> = app.webview_windows()
        .into_iter()
        .filter(|(label, _): &(String, WebviewWindow)| label.starts_with("note-"))
        .collect();

    for (_, window) in windows {
        let _ = window.hide();
    }
}

pub fn show_all_note_windows(app: &AppHandle) {
    let windows: Vec<(String, WebviewWindow)> = app.webview_windows()
        .into_iter()
        .filter(|(label, _): &(String, WebviewWindow)| label.starts_with("note-"))
        .collect();

    for (_, window) in windows {
        let _ = window.show();
    }
}
