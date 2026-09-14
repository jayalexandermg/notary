use std::{collections::{HashMap, HashSet}, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use crate::{captures::{Capture, Presentation}, capture_runtime, foreground, Database};

#[derive(Default)]
pub struct Editors(pub Mutex<EditorState>, AtomicBool, Mutex<()>);
#[derive(Default)]
pub struct EditorState {
    sessions: HashMap<String, Session>,
    quitting: Option<HashSet<String>>,
}
impl EditorState {
    fn eviction_candidates(&self) -> Vec<String> {
        let mut labels: Vec<_> = self.sessions.iter().filter(|(_, s)| !s.open && s.evictable).map(|(label, _)| label.clone()).collect();
        labels.sort();
        labels.truncate(labels.len().saturating_sub(3));
        labels
    }
}
#[derive(Clone)]
struct Session { record_id: Option<String>, project_id: Option<String>, open: bool, evictable: bool, close_token: Option<String>, previous: usize }
#[derive(Serialize)]
pub struct EditorData { record: Option<Capture>, project_id: Option<String>, presentation: Presentation, quit_requested: bool }

fn session(app: &AppHandle, label: &str) -> Result<Session, String> {
    app.state::<Editors>().0.lock().map_err(|_| "Editor state unavailable")?.sessions.get(label).cloned().ok_or("Unknown editor".into())
}
pub fn is_quitting(app: &AppHandle) -> bool {
    app.state::<Editors>().1.load(Ordering::SeqCst)
}

// Admission is serialized separately from registry/data locks. No native event
// callback takes this lock, so destroying a cached window cannot deadlock one.
fn prune_closed(app: &AppHandle) -> Result<(), String> {
    let labels = {
        let state = app.state::<Editors>();
        let state = state.0.lock().map_err(|_| "Editor state unavailable")?;
        state.eviction_candidates()
    };
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) { window.destroy().map_err(|e| e.to_string())?; }
        app.state::<Editors>().0.lock().map_err(|_| "Editor state unavailable")?.sessions.remove(&label);
    }
    Ok(())
}

fn build_editor(app: &AppHandle, label: &str) -> Result<(), String> {
    // Called from an async command, with no runtime/database locks held. Native
    // creation must not block the Windows input queue while it handles a hotkey.
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("HoverThought Note").decorations(false).transparent(true).shadow(false)
        .always_on_top(true).skip_taskbar(true).visible(false).focused(false)
        .resizable(true).inner_size(330.0, 222.0).min_inner_size(260.0, 190.0)
        .build().map_err(|e| e.to_string())?;
    let handle = app.clone();
    let label = label.to_owned();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.emit_to(&label, "surface-close-requested", ());
        }
    });
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn engage_capture(app: AppHandle, id: String) -> Result<(), String> {
    let editors = app.state::<Editors>();
    let _admission = editors.2.lock().map_err(|_| "Editor admission unavailable")?;
    if is_quitting(&app) { return Err("Finish or retry Quit before opening another note".into()); }
    app.state::<Database>().get_capture(&id).map_err(|e| e.to_string())?;
    prune_closed(&app)?;
    let previous = capture_runtime::workspace(&app)?;
    let (label, existing, was_open) = {
        let state = app.state::<Editors>();
        let mut state = state.0.lock().map_err(|_| "Editor state unavailable")?;
        if is_quitting(&app) { return Err("Quit is pending".into()); }
        if let Some((label, item)) = state.sessions.iter_mut().find(|(_, item)| item.record_id.as_deref() == Some(&id)) {
            let open = item.open; item.open = true; item.evictable = false; item.close_token = None; item.previous = previous;
            (label.clone(), true, open)
        } else {
            let label = format!("editor-{id}");
            state.sessions.insert(label.clone(), Session { record_id: Some(id), project_id: None, open: true, evictable: false, close_token: None, previous });
            (label, false, false)
        }
    };
    if existing {
        if let Some(window) = app.get_webview_window(&label) {
            if was_open && window.is_visible().map_err(|e| e.to_string())? {
                window.unminimize().map_err(|e| e.to_string())?;
                window.set_focus().map_err(|e| e.to_string())?;
            }
            // Ready editors preserve their buffer; closing or failed-load
            // editors retain this request and retry after their transition.
            window.emit_to(&label, "editor-requested", ()).map_err(|e| e.to_string())?;
        } // A concurrent first engagement owns construction and will show it.
    } else if let Err(error) = build_editor(&app, &label) {
        app.state::<Editors>().0.lock().map_err(|_| "Editor state unavailable")?.sessions.remove(&label);
        return Err(error);
    }
    let _ = app.emit_to("anchor", "return-to-ambient", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn new_project_note(app: AppHandle, project_id: String) -> Result<(), String> {
    let editors = app.state::<Editors>();
    let _admission = editors.2.lock().map_err(|_| "Editor admission unavailable")?;
    if is_quitting(&app) { return Err("Quit is pending".into()); }
    if !app.state::<Database>().capture_context().map_err(|e| e.to_string())?.containers.iter().any(|c| c.id == project_id && c.kind == "project") {
        return Err("A deliberate note requires an existing Project".into());
    }
    prune_closed(&app)?;
    let label = format!("draft-{}", uuid::Uuid::now_v7());
    let previous = capture_runtime::workspace(&app)?;
    {
        let state = app.state::<Editors>();
        let mut state = state.0.lock().map_err(|_| "Editor state unavailable")?;
        if is_quitting(&app) { return Err("Quit is pending".into()); }
        state.sessions.insert(label.clone(), Session { record_id: None, project_id: Some(project_id), open: true, evictable: false, close_token: None, previous });
    }
    if let Err(error) = build_editor(&app, &label) {
        app.state::<Editors>().0.lock().map_err(|_| "Editor state unavailable")?.sessions.remove(&label);
        return Err(error);
    }
    let _ = app.emit_to("anchor", "return-to-ambient", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn load_editor(app: AppHandle, window: WebviewWindow) -> Result<EditorData, String> {
    let item = session(&app, window.label())?;
    let db = app.state::<Database>();
    let record = item.record_id.as_deref().map(|id| db.get_capture(id)).transpose().map_err(|e| e.to_string())?;
    let mut view = if let Some(record) = &record { db.get_presentation(&record.id).map_err(|e| e.to_string())? }
        else { Presentation::for_capture(String::new()) };
    window.set_size(tauri::LogicalSize::new(view.width, view.height)).map_err(|e| e.to_string())?;
    // New notes are offset from other open notes so a working set is visible.
    if item.record_id.is_none() || record.as_ref().is_some_and(|r| !db.has_capture_presentation(&r.id).unwrap_or(true)) {
        let count = app.state::<Editors>().0.lock().map_err(|_| "Editor state unavailable")?.sessions.values().filter(|s| s.open).count();
        view.pos_x += ((count.saturating_sub(1) % 8) * 36) as f64;
        view.pos_y += ((count.saturating_sub(1) % 8) * 36) as f64;
    }
    window.set_position(tauri::LogicalPosition::new(view.pos_x, view.pos_y)).map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    if window.monitor_from_point(position.x as f64 + 30.0, position.y as f64 + 30.0).map_err(|e| e.to_string())?.is_none() {
        window.center().map_err(|e| e.to_string())?;
    }
    window.set_always_on_top(view.always_on_top).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    view.is_open = true;
    if record.is_some() { db.save_presentation(&view).map_err(|e| e.to_string())?; }
    app.state::<Editors>().0.lock().map_err(|_| "Editor state unavailable")?.sessions.get_mut(window.label()).ok_or("Unknown editor")?.open = true;
    Ok(EditorData { record, project_id: item.project_id, presentation: view, quit_requested: is_quitting(&app) })
}

fn snapshot(window: &WebviewWindow, mut view: Presentation, open: bool) -> Result<Presentation, String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let size = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    view.pos_x = pos.x; view.pos_y = pos.y; view.width = size.width; view.height = size.height; view.is_open = open;
    Ok(view)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_editor(app: AppHandle, window: WebviewWindow, content: String, title: Option<String>, dismiss: bool,
    opacity: f64, always_on_top: bool, close_token: Option<String>) -> Result<Option<Capture>, String> {
    if !opacity.is_finite() || !(0.1..=1.0).contains(&opacity) { return Err("Invalid opacity".into()); }
    // Native geometry before acquiring locks. The registry lock serializes first
    // draft persistence so simultaneous save/close requests cannot create twice.
    let geometry = snapshot(&window, Presentation::for_capture(String::new()), !dismiss)?;
    let record = {
        let state = app.state::<Editors>();
        let mut state = state.0.lock().map_err(|_| "Editor state unavailable")?;
        let item = state.sessions.get_mut(window.label()).ok_or("Unknown editor")?;
        if !item.open { return Err("This editor is closed".into()); }
        let db = app.state::<Database>();
        let record = if let Some(id) = &item.record_id {
            Some(db.edit_capture_text(id, &content, title.as_deref()).map_err(|e| e.to_string())?)
        } else if content.trim().is_empty() && title.as_deref().unwrap_or("").trim().is_empty() { None }
        else {
            let record = db.create_project_note(&content, title.as_deref(), item.project_id.as_deref().ok_or("Missing Project")?).map_err(|e| e.to_string())?;
            item.record_id = Some(record.id.clone());
            Some(record)
        };
        if let Some(record) = &record {
            let mut view = geometry;
            view.record_id = record.id.clone(); view.opacity = opacity; view.always_on_top = always_on_top;
            db.save_presentation(&view).map_err(|e| e.to_string())?;
        }
        record
    };
    if dismiss { close_editor(&app, &window, close_token)?; }
    let _ = app.emit("captures-changed", ());
    Ok(record)
}

fn close_editor(app: &AppHandle, window: &WebviewWindow, close_token: Option<String>) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())?;
    if window.is_visible().map_err(|e| e.to_string())? { return Err("Editor has not finished hiding".into()); }
    let previous = {
        let state = app.state::<Editors>();
        let mut state = state.0.lock().map_err(|_| "Editor state unavailable")?;
        let item = state.sessions.get_mut(window.label()).ok_or("Unknown editor")?;
        item.open = false; item.close_token = close_token; item.previous
    };
    foreground::restore(previous);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn editor_close_settled(app: AppHandle, window: WebviewWindow, close_token: String) -> Result<(), String> {
    let editors = app.state::<Editors>();
    let _admission = editors.2.lock().map_err(|_| "Editor admission unavailable")?;
    {
        let mut state = editors.0.lock().map_err(|_| "Editor state unavailable")?;
        if let Some(item) = state.sessions.get_mut(window.label()) {
            if !item.open && item.close_token.as_deref() == Some(&close_token) { item.evictable = true; }
        }
    }
    // The frontend has no remaining save/reopen work before this acknowledgment.
    // Quit acknowledgments retain their own lifetime until the process exits.
    if !is_quitting(&app) { prune_closed(&app)?; }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_editor_presentation(app: AppHandle, window: WebviewWindow, opacity: f64, always_on_top: bool) -> Result<(), String> {
    if !opacity.is_finite() || !(0.1..=1.0).contains(&opacity) { return Err("Invalid opacity".into()); }
    let item = session(&app, window.label())?;
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())?;
    if let Some(id) = item.record_id {
        let db = app.state::<Database>();
        let mut view = snapshot(&window, db.get_presentation(&id).map_err(|e| e.to_string())?, item.open)?;
        view.opacity = opacity; view.always_on_top = always_on_top;
        db.save_presentation(&view).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn trash_editor(app: AppHandle, window: WebviewWindow, close_token: Option<String>) -> Result<(), String> {
    let geometry = snapshot(&window, Presentation::for_capture(String::new()), false)?;
    {
        let state = app.state::<Editors>();
        let mut state = state.0.lock().map_err(|_| "Editor state unavailable")?;
        let item = state.sessions.get_mut(window.label()).ok_or("Unknown editor")?;
        if let Some(id) = &item.record_id {
            let db = app.state::<Database>();
            if db.get_capture_including_deleted(id).map_err(|e| e.to_string())?.deleted_at.is_none() {
                let mut view = db.get_presentation(id).map_err(|e| e.to_string())?;
                view.pos_x = geometry.pos_x; view.pos_y = geometry.pos_y;
                view.width = geometry.width; view.height = geometry.height; view.is_open = false;
                db.save_presentation(&view).map_err(|e| e.to_string())?;
                db.soft_delete_capture(id).map_err(|e| e.to_string())?;
            }
        }
        // Serialize draft deletion with first persistence; a delayed save must
        // never recreate an abandoned draft. Already-deleted retries only hide.
        item.open = false;
    }
    close_editor(&app, &window, close_token)?;
    let _ = app.emit("captures-changed", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_deleted_captures(app: AppHandle) -> Result<Vec<Capture>, String> {
    app.state::<Database>().list_deleted_captures().map_err(|e| e.to_string())
}
#[tauri::command(rename_all = "snake_case")]
pub async fn restore_capture(app: AppHandle, id: String) -> Result<Capture, String> {
    let record = app.state::<Database>().restore_capture(&id).map_err(|e| e.to_string())?;
    let _ = app.emit("captures-changed", ()); Ok(record)
}
#[tauri::command(rename_all = "snake_case")]
pub async fn permanently_delete_capture(app: AppHandle, id: String, confirmed: bool) -> Result<(), String> {
    let db = app.state::<Database>();
    if !confirmed || db.get_capture_including_deleted(&id).map_err(|e| e.to_string())?.deleted_at.is_none() {
        return Err("Permanent deletion requires a deleted capture and confirmation".into());
    }
    db.permanently_delete_capture(&id).map_err(|e| e.to_string())?;
    let _ = app.emit("captures-changed", ()); Ok(())
}

pub fn request_quit(app: &AppHandle) -> Result<(), String> {
    app.state::<Editors>().1.store(true, Ordering::SeqCst);
    let capture_active = capture_runtime::capture_active(app)?;
    let pending: HashSet<String> = {
        let state = app.state::<Editors>();
        let mut state = state.0.lock().map_err(|_| "Editor state unavailable")?;
        let mut pending: HashSet<String> = state.sessions.iter().filter(|(_, item)| item.open).map(|(label, _)| label.clone()).collect();
        if capture_active { pending.insert("capture".into()); }
        // Publish a complete snapshot atomically. An acknowledgment from an
        // earlier Quit request must never observe a temporary empty pending set.
        state.quitting = Some(pending.clone());
        pending
    };
    if pending.is_empty() { app.exit(0); return Ok(()); }
    for label in pending { app.emit_to(&label, "quit-requested", ()).map_err(|e| e.to_string())?; }
    Ok(())
}
#[tauri::command(rename_all = "snake_case")]
pub async fn finish_quit(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let done = {
        let state = app.state::<Editors>();
        let mut state = state.0.lock().map_err(|_| "Editor state unavailable")?;
        let pending = state.quitting.as_mut().ok_or("No quit request")?;
        pending.remove(window.label()); pending.is_empty()
    };
    if done { app.exit(0); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn phase5_cache_retains_open_and_unsettled_windows_during_churn() {
        let mut state = EditorState::default();
        for label in ["open-a", "open-b", "open-c", "pending-reopen"] {
            state.sessions.insert(label.into(), Session { record_id: Some(label.into()), project_id: None,
                open: label != "pending-reopen", evictable: false, close_token: None, previous: 0 });
        }
        for n in 0..100 {
            let label = format!("closed-{n}");
            state.sessions.insert(label, Session { record_id: None, project_id: Some("project".into()), open: false, evictable: true, close_token: None, previous: 0 });
            for label in state.eviction_candidates() { state.sessions.remove(&label); }
            assert!(state.sessions.len() <= 7);
            assert_eq!(state.sessions.values().filter(|s| !s.open && s.evictable).count(), (n + 1).min(3));
            for label in ["open-a", "open-b", "open-c", "pending-reopen"] { assert!(state.sessions.contains_key(label)); }
        }
    }
}
