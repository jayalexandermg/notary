use std::{collections::VecDeque, sync::Mutex, time::Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{captures::{Capture, Presentation, WAITING_ROOM}, foreground, hotkeys, Database, Note};

#[derive(Default)]
pub struct CaptureRuntime(pub Mutex<Runtime>);

#[derive(Default)]
pub struct Runtime {
    sequence: u64,
    active: bool,
    completing: bool,
    ready: bool,
    started: Option<Instant>,
    previous_window: usize,
    committed: Option<Capture>,
    pending_editor: Option<String>,
    active_editor: Option<String>,
    editor_previous_window: usize,
    samples: VecDeque<Measurement>,
}

#[derive(Clone, Serialize)]
pub struct Measurement {
    pub boundary: String,
    pub milliseconds: f64,
    pub sequence: u64,
}

#[derive(Clone, Serialize)]
pub struct CaptureSession {
    pub sequence: u64,
    pub active: bool,
}

fn runtime(app: &AppHandle) -> tauri::State<'_, CaptureRuntime> { app.state::<CaptureRuntime>() }
fn surface(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label).ok_or_else(|| format!("{label} surface is unavailable"))
}

fn hide_surface(app: &AppHandle, label: &str) -> Result<(), String> {
    let window = surface(app, label)?;
    window.hide().map_err(|e| e.to_string())?;
    if window.is_visible().map_err(|e| e.to_string())? {
        return Err(format!("{label} has not finished hiding"));
    }
    Ok(())
}

fn sample(state: &mut Runtime, boundary: &str, elapsed: f64) {
    let measurement = Measurement {
        boundary: boundary.into(), milliseconds: elapsed, sequence: state.sequence,
    };
    eprintln!("capture measurement: {}", serde_json::to_string(&measurement).unwrap_or_default());
    if state.samples.len() == 100 { state.samples.pop_front(); }
    state.samples.push_back(measurement);
}

pub fn create_surfaces(app: &AppHandle) -> Result<(), String> {
    for (label, width, height) in [("capture", 680.0, 180.0), ("anchor", 24.0, 48.0), ("editor", 560.0, 380.0)] {
        let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
            .title(match label { "capture" => "HoverThought Quick Capture", "editor" => "HoverThought Capture", _ => "HoverThought" })
            .decorations(false).transparent(true).shadow(false).always_on_top(true)
            .skip_taskbar(true).visible(false).focused(false)
            .focusable(label != "anchor").resizable(label == "editor")
            .inner_size(width, height);
        let builder = if label == "editor" { builder.min_inner_size(240.0, 180.0) } else { builder };
        let window = builder.build().map_err(|e| e.to_string())?;
        if label == "anchor" {
            place_anchor(&window, false, 48.0)?;
            window.show().map_err(|e| e.to_string())?;
        }
        let handle = app.clone();
        let owned_label = label.to_string();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                // The frontend uses the same save/discard transition as its ×/Escape.
                let _ = handle.emit_to(&owned_label, "surface-close-requested", ());
            }
        });
    }
    Ok(())
}

fn place_anchor(window: &WebviewWindow, expanded: bool, requested_height: f64) -> Result<(), String> {
    let monitor = window.primary_monitor().map_err(|e| e.to_string())?
        .ok_or("No monitor is available")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let height: f64 = if expanded { requested_height.clamp(120.0, 420.0) } else { 48.0 };
    let width: f64 = if expanded { 350.0 } else { 24.0 };
    let height = height.min(area.size.height as f64 / scale);
    let width = width.min(area.size.width as f64 / scale);
    let y = area.position.y + ((area.size.height as f64 - height * scale) / 2.0) as i32;
    window.set_position(tauri::PhysicalPosition::new(area.position.x, y)).map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())
}

fn place_capture(window: &WebviewWindow) -> Result<(), String> {
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let monitor = window.monitor_from_point(cursor.x, cursor.y).map_err(|e| e.to_string())?
        .or(window.primary_monitor().map_err(|e| e.to_string())?).ok_or("No monitor is available")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = 680.0_f64.min(area.size.width as f64 / scale);
    let height = 180.0_f64.min(area.size.height as f64 / scale);
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    window.set_position(tauri::PhysicalPosition::new(
        area.position.x + ((area.size.width as f64 - width * scale) / 2.0) as i32,
        area.position.y + ((area.size.height as f64 - height * scale) / 3.0) as i32,
    )).map_err(|e| e.to_string())
}

/// Called directly from the OS accelerator. The timer starts before native work.
pub fn show_capture(app: &AppHandle) -> Result<(), String> {
    let started = Instant::now();
    let previous_window = foreground::remember();
    let window = surface(app, "capture")?;
    let state = runtime(app);
    let session = {
        let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
        if state.completing { return Ok(()); }
        if !state.active {
            state.sequence += 1;
            state.active = true;
            state.committed = None;
            state.previous_window = previous_window;
            state.started = Some(started);
        }
        CaptureSession { sequence: state.sequence, active: true }
    };
    place_capture(&window)?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    window.emit("capture-invoked", session).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn capture_surface_ready(app: AppHandle) -> Result<CaptureSession, String> {
    let state = runtime(&app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    state.ready = true;
    Ok(CaptureSession { sequence: state.sequence, active: state.active })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn capture_input_ready(app: AppHandle, sequence: u64) -> Result<(), String> {
    let window = surface(&app, "capture")?;
    if !window.is_visible().map_err(|e| e.to_string())? || !window.is_focused().map_err(|e| e.to_string())? {
        return Err("Capture is not visible and focused".into());
    }
    let state = runtime(&app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    if state.active && state.sequence == sequence {
        if let Some(started) = state.started.take() {
            sample(&mut state, "hotkey_to_focused_input", started.elapsed().as_secs_f64() * 1000.0);
        }
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn commit_capture(app: AppHandle, sequence: u64, content: String) -> Result<Capture, String> {
    let started = Instant::now();
    let state = runtime(&app);
    let mut state_guard = state.0.lock().map_err(|_| "Capture state unavailable")?;
    let state = &mut *state_guard;
    if state.sequence != sequence { return Err("This capture session has ended".into()); }
    // An IPC retry after persistence must never duplicate a successful capture.
    let record = if let Some(record) = &state.committed { record.clone() }
    else {
        if !state.active { return Err("This capture session has ended".into()); }
        let record = app.state::<Database>().create_capture(&content, None).map_err(|e| e.to_string())?;
        state.committed = Some(record.clone());
        record
    };
    if state.completing { return Err("Capture is already being saved".into()); }
    state.completing = true;
    let previous_window = state.previous_window;
    drop(state_guard);
    // Never hold the runtime mutex while dispatching native window work. A
    // global-hotkey callback can run on the native event loop and need this lock.
    let hidden = hide_surface(&app, "capture");
    if hidden.is_ok() { foreground::restore(previous_window); }
    let state = runtime(&app);
    {
        let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
        state.completing = false;
        if let Err(error) = hidden { return Err(format!("Saved; dismiss failed. Retry to dismiss: {error}")); }
        state.active = false;
        sample(&mut state, "commit_ipc_to_persisted_and_hidden", started.elapsed().as_secs_f64() * 1000.0);
    }
    let _ = app.emit("captures-changed", ());
    Ok(record)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn cancel_capture(app: AppHandle, sequence: u64) -> Result<(), String> {
    let state = runtime(&app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    if state.sequence != sequence { return Err("This capture session has ended".into()); }
    if state.completing { return Err("Capture is being saved".into()); }
    state.completing = true;
    let previous_window = state.previous_window;
    drop(state);
    let hidden = hide_surface(&app, "capture");
    if hidden.is_ok() { foreground::restore(previous_window); }
    let state = runtime(&app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    state.completing = false;
    hidden?;
    state.active = false;
    state.started = None;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn report_commit_elapsed(app: AppHandle, sequence: u64, milliseconds: f64) -> Result<(), String> {
    if !milliseconds.is_finite() || milliseconds < 0.0 { return Err("Invalid duration".into()); }
    let state = runtime(&app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    if state.sequence == sequence && state.committed.is_some() {
        sample(&mut state, "commit_key_to_persisted_hidden_ack", milliseconds);
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_capture_measurements(app: AppHandle) -> Result<Vec<Measurement>, String> {
    Ok(runtime(&app).0.lock().map_err(|_| "Capture state unavailable")?.samples.iter().cloned().collect())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_anchor_expanded(app: AppHandle, expanded: bool, focused: bool, height: Option<f64>) -> Result<(), String> {
    let height = height.unwrap_or(190.0);
    if !height.is_finite() { return Err("Invalid retrieval height".into()); }
    let window = surface(&app, "anchor")?;
    window.set_focusable(expanded && focused).map_err(|e| e.to_string())?;
    place_anchor(&window, expanded, height)?;
    if expanded && focused { window.set_focus().map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_captures(app: AppHandle) -> Result<Vec<Capture>, String> {
    app.state::<Database>().list_captures(WAITING_ROOM).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_legacy_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    app.state::<Database>().get_all_notes().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_capture(app: AppHandle, id: String) -> Result<Capture, String> {
    app.state::<Database>().get_capture(&id).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn engage_capture(app: AppHandle, id: String) -> Result<(), String> {
    app.state::<Database>().get_capture(&id).map_err(|e| e.to_string())?;
    {
        let state = runtime(&app);
        let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
        state.pending_editor = Some(id.clone());
        if state.active_editor.is_none() { state.editor_previous_window = foreground::remember(); }
    }
    surface(&app, "editor")?.emit("editor-requested", id).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn pending_editor(app: AppHandle) -> Result<Option<String>, String> {
    Ok(runtime(&app).0.lock().map_err(|_| "Capture state unavailable")?.pending_editor.clone())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn show_editor(app: AppHandle, id: String) -> Result<Presentation, String> {
    let state = runtime(&app);
    let previous_editor = state.0.lock().map_err(|_| "Capture state unavailable")?.active_editor.clone();
    let db = app.state::<Database>();
    let window = surface(&app, "editor")?;
    if let Some(previous) = &previous_editor {
        if previous != &id {
            let mut view = db.get_presentation(previous).map_err(|e| e.to_string())?;
            view.is_open = false;
            db.save_presentation(&view).map_err(|e| e.to_string())?;
        }
    }
    let mut view = db.get_presentation(&id).map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(view.width, view.height)).map_err(|e| e.to_string())?;
    window.set_position(tauri::LogicalPosition::new(view.pos_x, view.pos_y)).map_err(|e| e.to_string())?;
    // Recover off-screen windows after monitor removal; placement uses physical bounds.
    let position = window.outer_position().map_err(|e| e.to_string())?;
    if window.monitor_from_point(position.x as f64 + 30.0, position.y as f64 + 30.0).map_err(|e| e.to_string())?.is_none() {
        window.center().map_err(|e| e.to_string())?;
    }
    window.set_always_on_top(view.always_on_top).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    view.is_open = true;
    db.save_presentation(&view).map_err(|e| e.to_string())?;
    state.0.lock().map_err(|_| "Capture state unavailable")?.active_editor = Some(id);
    let _ = app.emit_to("anchor", "return-to-ambient", ());
    Ok(view)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_capture_edit(app: AppHandle, id: String, content: String, title: Option<String>, dismiss: bool) -> Result<Capture, String> {
    let db = app.state::<Database>();
    let existing = db.get_capture(&id).map_err(|e| e.to_string())?;
    let record = db.edit_capture(&id, &content, title.as_deref(), &existing.container_id).map_err(|e| e.to_string())?;
    let state = runtime(&app);
    let (active_editor, previous_window) = {
        let state = state.0.lock().map_err(|_| "Capture state unavailable")?;
        (state.active_editor.clone(), state.editor_previous_window)
    };
    if active_editor.as_deref() == Some(id.as_str()) {
        let window = surface(&app, "editor")?;
        let mut view = db.get_presentation(&id).map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let position = window.outer_position().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
        let size = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
        view.pos_x = position.x; view.pos_y = position.y;
        view.width = size.width; view.height = size.height;
        view.is_open = !dismiss;
        db.save_presentation(&view).map_err(|e| e.to_string())?;
        if dismiss {
            hide_surface(&app, "editor")?;
            foreground::restore(previous_window);
            {
                let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
                state.active_editor = None;
                state.pending_editor = None;
            }
            let _ = app.emit_to("anchor", "return-to-ambient", ());
        }
    }
    let _ = app.emit("captures-changed", ());
    Ok(record)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_capture_presentation(app: AppHandle, id: String, opacity: f64, always_on_top: bool) -> Result<(), String> {
    let db = app.state::<Database>();
    let mut view = db.get_presentation(&id).map_err(|e| e.to_string())?;
    view.opacity = opacity; view.always_on_top = always_on_top;
    db.save_presentation(&view).map_err(|e| e.to_string())?;
    surface(&app, "editor")?.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_capture_shortcut(app: AppHandle) -> Result<hotkeys::ShortcutStatus, String> { hotkeys::status(&app) }

#[tauri::command(rename_all = "snake_case")]
pub async fn set_capture_shortcut(app: AppHandle, binding: String) -> Result<hotkeys::ShortcutStatus, String> {
    hotkeys::apply_capture_shortcut(&app, &binding)?;
    hotkeys::status(&app)
}
