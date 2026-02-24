use tauri::{AppHandle, Emitter, Manager, Window};
use crate::db::{Database, Note, Settings};
use crate::note_window::create_note_window;

#[tauri::command]
pub fn create_note(app: AppHandle, pos_x: Option<i32>, pos_y: Option<i32>) -> Result<Note, String> {
    let db = app.state::<Database>();
    let x = pos_x.unwrap_or(100);
    let y = pos_y.unwrap_or(100);

    let note = db.create_note(x, y).map_err(|e| e.to_string())?;
    create_note_window(&app, &note)?;

    Ok(note)
}

#[tauri::command]
pub fn get_note(app: AppHandle, id: String) -> Result<Option<Note>, String> {
    let db = app.state::<Database>();
    db.get_note(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    let db = app.state::<Database>();
    db.get_all_notes().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_note(
    app: AppHandle,
    id: String,
    title: Option<String>,
    content: Option<String>,
    mode: Option<String>,
    pos_x: Option<i32>,
    pos_y: Option<i32>,
    width: Option<i32>,
    height: Option<i32>,
    opacity: Option<f64>,
    always_on_top: Option<bool>,
) -> Result<(), String> {
    // Validate mode
    if let Some(ref m) = mode {
        if m != "text" && m != "todo" {
            return Err(format!("Invalid mode: {m}. Must be \"text\" or \"todo\""));
        }
    }

    // Clamp opacity
    let opacity = opacity.map(|o| o.clamp(0.3, 1.0));

    // Clamp dimensions to minimum
    let width = width.map(|w| w.max(200));
    let height = height.map(|h| h.max(150));

    let db = app.state::<Database>();
    db.update_note(
        &id,
        title.as_deref(),
        content.as_deref(),
        mode.as_deref(),
        pos_x,
        pos_y,
        width,
        height,
        opacity,
        always_on_top,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_note(app: AppHandle, id: String) -> Result<(), String> {
    let db = app.state::<Database>();
    db.close_note(&id).map_err(|e| e.to_string())?;

    // Close the window
    let label = format!("note-{}", id);
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_note(app: AppHandle, id: String) -> Result<(), String> {
    let db = app.state::<Database>();
    db.delete_note(&id).map_err(|e| e.to_string())?;

    // Close the window
    let label = format!("note-{}", id);
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn open_note(app: AppHandle, id: String) -> Result<Note, String> {
    let db = app.state::<Database>();

    // Mark as open in database
    db.open_note(&id).map_err(|e| e.to_string())?;

    // Get the note data
    let note = db.get_note(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Note not found".to_string())?;

    // Create the window
    create_note_window(&app, &note)?;

    Ok(note)
}

#[tauri::command]
pub fn set_opacity(window: Window, opacity: f64) -> Result<(), String> {
    let opacity = opacity.clamp(0.3, 1.0);
    let id = window.label().replace("note-", "");
    let app = window.app_handle();
    let db = app.state::<Database>();
    db.update_note(&id, None, None, None, None, None, None, None, Some(opacity), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_always_on_top(window: Window, on_top: bool) -> Result<(), String> {
    window.set_always_on_top(on_top).map_err(|e| e.to_string())?;

    let id = window.label().replace("note-", "");
    let app = window.app_handle();
    let db = app.state::<Database>();
    db.update_note(&id, None, None, None, None, None, None, None, None, Some(on_top))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let db = app.state::<Database>();
    db.get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let db = app.state::<Database>();
    db.set_setting("theme", &theme).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_default_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let db = app.state::<Database>();
    db.set_setting("default_opacity", &opacity.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn minimize_all_notes(app: AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label.starts_with("note-") {
            window.minimize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_all_notes(app: AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label.starts_with("note-") {
            window.unminimize().map_err(|e| e.to_string())?;
            window.show().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_all_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let opacity = opacity.clamp(0.3, 1.0);
    let db = app.state::<Database>();
    let notes = db.get_all_notes().map_err(|e| e.to_string())?;
    for note in &notes {
        db.update_note(&note.id, None, None, None, None, None, None, None, Some(opacity), None)
            .map_err(|e| e.to_string())?;
        let label = format!("note-{}", note.id);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.emit("opacity-updated", opacity);
        }
    }
    Ok(())
}
