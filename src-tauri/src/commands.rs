use tauri::{AppHandle, Emitter, Manager, Window};
use crate::db::{Database, Note, Settings};
use crate::note_window::create_note_window;
use crate::hotkeys;

// async so window creation never blocks the caller — see v0.1.8, which fixed a
// deadlock when creating a new note window on Windows.
#[tauri::command(rename_all = "snake_case")]
pub async fn create_note(app: AppHandle, pos_x: Option<i32>, pos_y: Option<i32>) -> Result<Note, String> {
    let db = app.state::<Database>();
    let x = pos_x.unwrap_or(100);
    let y = pos_y.unwrap_or(100);

    let note = db.create_note(x, y).map_err(|e| e.to_string())?;
    create_note_window(&app, &note)?;

    Ok(note)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_note(app: AppHandle, id: String) -> Result<Option<Note>, String> {
    let db = app.state::<Database>();
    db.get_note(&id).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_all_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    let db = app.state::<Database>();
    db.get_all_notes().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
#[allow(clippy::too_many_arguments)]
pub fn update_note(
    app: AppHandle,
    id: String,
    title: Option<String>,
    content: Option<String>,
    mode: Option<String>,
    color: Option<String>,
    auto_stamp: Option<bool>,
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
    let opacity = opacity.map(|o| o.clamp(0.1, 1.0));

    // Clamp dimensions to minimum
    let width = width.map(|w| w.max(200));
    let height = height.map(|h| h.max(150));

    let db = app.state::<Database>();
    db.update_note(
        &id,
        title.as_deref(),
        content.as_deref(),
        mode.as_deref(),
        color.as_deref(),
        auto_stamp,
        pos_x,
        pos_y,
        width,
        height,
        opacity,
        always_on_top,
    ).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
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

#[tauri::command(rename_all = "snake_case")]
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

// async for the same reason as create_note.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_note(app: AppHandle, id: String) -> Result<Note, String> {
    let db = app.state::<Database>();

    // Mark as open in database
    db.open_note(&id).map_err(|e| e.to_string())?;

    // Get the note data
    let note = db.get_note(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Note not found".to_string())?;

    // Create the window (or just bring it forward if it already exists)
    create_note_window(&app, &note)?;
    let label = format!("note-{}", note.id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    Ok(note)
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_opacity(window: Window, opacity: f64) -> Result<(), String> {
    let opacity = opacity.clamp(0.1, 1.0);
    let id = window.label().replace("note-", "");
    let app = window.app_handle();
    let db = app.state::<Database>();
    db.update_note(&id, None, None, None, None, None, None, None, None, None, Some(opacity), None)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_always_on_top(window: Window, on_top: bool) -> Result<(), String> {
    window.set_always_on_top(on_top).map_err(|e| e.to_string())?;

    let id = window.label().replace("note-", "");
    let app = window.app_handle();
    let db = app.state::<Database>();
    db.update_note(&id, None, None, None, None, None, None, None, None, None, None, Some(on_top))
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let db = app.state::<Database>();
    db.get_settings().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let db = app.state::<Database>();
    db.set_setting("theme", &theme).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_default_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let db = app.state::<Database>();
    db.set_setting("default_opacity", &opacity.to_string()).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn minimize_all_notes(app: AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label.starts_with("note-") {
            window.minimize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn show_all_notes(app: AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label.starts_with("note-") {
            window.unminimize().map_err(|e| e.to_string())?;
            window.show().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_all_opacity(app: AppHandle, opacity: f64) -> Result<(), String> {
    let opacity = opacity.clamp(0.1, 1.0);
    let db = app.state::<Database>();
    let notes = db.get_all_notes().map_err(|e| e.to_string())?;
    for note in &notes {
        db.update_note(&note.id, None, None, None, None, None, None, None, None, None, Some(opacity), None)
            .map_err(|e| e.to_string())?;
        let label = format!("note-{}", note.id);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.emit("opacity-updated", opacity);
        }
    }
    Ok(())
}

/// "Universal mode" — colour target for every open note at once.
#[tauri::command(rename_all = "snake_case")]
pub fn set_all_color(app: AppHandle, color: String) -> Result<(), String> {
    let db = app.state::<Database>();
    let notes = db.get_all_notes().map_err(|e| e.to_string())?;
    for note in &notes {
        db.update_note(&note.id, None, None, None, Some(&color), None, None, None, None, None, None, None)
            .map_err(|e| e.to_string())?;
        let label = format!("note-{}", note.id);
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.emit("color-updated", &color);
        }
    }
    Ok(())
}

/// "Universal mode" — pin/unpin every open note at once.
#[tauri::command(rename_all = "snake_case")]
pub fn set_all_always_on_top(app: AppHandle, on_top: bool) -> Result<(), String> {
    let db = app.state::<Database>();
    for (label, window) in app.webview_windows() {
        if !label.starts_with("note-") {
            continue;
        }
        let _ = window.set_always_on_top(on_top);
        let id = label.replace("note-", "");
        db.update_note(&id, None, None, None, None, None, None, None, None, None, None, Some(on_top))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// "Universal mode" — resize every open note at once.
#[tauri::command(rename_all = "snake_case")]
pub fn set_all_size(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let db = app.state::<Database>();
    let w = width.max(200.0);
    let h = height.max(150.0);
    for (label, window) in app.webview_windows() {
        if !label.starts_with("note-") {
            continue;
        }
        let _ = window.set_size(tauri::LogicalSize::new(w, h));
        let id = label.replace("note-", "");
        db.update_note(&id, None, None, None, None, None, None, None, Some(w as i32), Some(h as i32), None, None)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Generic settings read used for user-configurable values (keymap, global
/// hotkeys, universal mode, default auto-stamp) that live in the shared
/// key/value settings table rather than getting their own column/command.
#[tauri::command(rename_all = "snake_case")]
pub fn get_setting(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let db = app.state::<Database>();
    db.get_setting_opt(&key).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_setting(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let db = app.state::<Database>();
    db.set_setting(&key, &value).map_err(|e| e.to_string())?;

    // Broadcast so every open note window updates immediately, no restart needed.
    let event = match key.as_str() {
        "universal_mode" => Some(("universal-mode-changed", value == "true")),
        _ => None,
    };
    if let Some((event_name, payload)) = event {
        let _ = app.emit(event_name, payload);
    } else if key == "keymap" {
        let _ = app.emit("keymap-changed", &value);
    }

    Ok(())
}

/// Rebind the two global (OS-level) hotkeys and persist them so they survive a restart.
#[tauri::command(rename_all = "snake_case")]
pub fn set_global_hotkeys(app: AppHandle, new_note: String, toggle_all: String) -> Result<(), String> {
    let db = app.state::<Database>();
    db.set_setting("hotkey_new_note", &new_note).map_err(|e| e.to_string())?;
    db.set_setting("hotkey_toggle_all", &toggle_all).map_err(|e| e.to_string())?;

    hotkeys::apply_hotkeys(&app, &new_note, &toggle_all)?;

    let payload = serde_json::json!({ "newNote": new_note, "toggleAll": toggle_all });
    let _ = app.emit("global-hotkeys-changed", payload.to_string());

    Ok(())
}
