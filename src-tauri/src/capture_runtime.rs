use std::{collections::VecDeque, sync::Mutex, time::Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{captures::{Capture, CaptureContext, Container, WAITING_ROOM}, foreground, hotkeys, Database, Note};

pub struct CaptureRuntime(pub Mutex<Runtime>, Mutex<()>);

impl Default for CaptureRuntime {
    fn default() -> Self {
        Self(Mutex::new(Runtime { workspace_window: foreground::remember(), ..Runtime::default() }), Mutex::new(()))
    }
}

#[derive(Default)]
pub struct Runtime {
    sequence: u64,
    capture_css_scale: Option<f64>,
    active: bool,
    completing: bool,
    ready: bool,
    started: Option<Instant>,
    previous_window: usize,
    workspace_window: usize,
    committed: Option<Capture>,
    invocation: Option<InvocationTiming>,
    native_focus_ms: Option<f64>,
    samples: VecDeque<Measurement>,
}

#[derive(Clone, Serialize)]
struct InvocationTiming { scheduled_ms: f64, admitted_ms: f64, placed_ms: f64, shown_ms: f64, focused_ms: f64 }

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
fn remember_workspace(state: &mut Runtime) -> usize {
    let previous = foreground::remember();
    if previous != 0 { state.workspace_window = previous; }
    state.workspace_window
}
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
    for (label, width, height) in [("capture", 432.0, 112.0), ("anchor", 24.0, 48.0)] {
        let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
            .title(match label { "capture" => "HoverThought Quick Capture", "editor" => "HoverThought Capture", _ => "HoverThought" })
            .decorations(false).transparent(true).shadow(false).always_on_top(true)
            .skip_taskbar(true).visible(false).focused(false)
            .focusable(label != "anchor").resizable(label == "editor")
            .inner_size(width, height);
        let builder = if label == "editor" { builder.min_inner_size(240.0, 180.0) } else { builder };
        let window = builder.build().map_err(|e| e.to_string())?;
        if label == "anchor" {
            place_anchor(&window, false, 48.0, false, None)?;
            window.show().map_err(|e| e.to_string())?;
        }
        let handle = app.clone();
        let owned_label = label.to_string();
        window.on_window_event(move |event| {
            #[cfg(any(debug_assertions, feature = "phase5-diagnostics"))]
            if owned_label == "capture" && matches!(event, tauri::WindowEvent::Focused(true)) {
                if let Ok(mut state) = runtime(&handle).0.lock() {
                    if let Some(started) = state.started {
                        state.native_focus_ms = Some(started.elapsed().as_secs_f64()*1000.0);
                    }
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                // The frontend uses the same save/discard transition as its ×/Escape.
                let _ = handle.emit_to(&owned_label, "surface-close-requested", ());
            }
        });
    }
    Ok(())
}

fn place_anchor(window: &WebviewWindow, expanded: bool, requested_height: f64, inspector: bool, pixel_ratio: Option<f64>) -> Result<(), String> {
    let monitor = window.primary_monitor().map_err(|e| e.to_string())?.ok_or("No monitor is available")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let (width, height, regions) = if expanded { crate::surface_geometry::retrieval(requested_height, inspector) }
        else { (24.0, 48.0, vec![crate::surface_geometry::Rect(0.0, 0.0, 24.0, 48.0)]) };
    let factor = crate::surface_geometry::css_scale(window, pixel_ratio)?;
    let (width, height) = (width * factor, height * factor);
    let regions = regions.into_iter().map(|r| r.scaled(factor)).collect::<Vec<_>>();
    let y = area.position.y + ((area.size.height as f64 - height * scale) / 2.0).round() as i32;
    window.set_position(tauri::PhysicalPosition::new(area.position.x, y)).map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    crate::surface_geometry::shape(window, &regions)
}

fn place_capture(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let monitor = window.monitor_from_point(cursor.x, cursor.y).map_err(|e| e.to_string())?
        .or(window.primary_monitor().map_err(|e| e.to_string())?).ok_or("No monitor is available")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    // Cache the text/zoom multiplier, not monitor-specific devicePixelRatio.
    let factor = runtime(app).0.lock().map_err(|_| "Capture state unavailable")?.capture_css_scale.unwrap_or(1.0);
    let width = (432.0 * factor).min(area.size.width as f64 / scale);
    let height = (112.0 * factor).min(area.size.height as f64 / scale);
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    window.set_position(tauri::PhysicalPosition::new(
        area.position.x + ((area.size.width as f64 - width * scale) / 2.0) as i32,
        area.position.y + ((area.size.height as f64 - height * scale) / 3.0) as i32,
    )).map_err(|e| e.to_string())
}

/// Called directly from the OS accelerator. The timer starts before native work.
pub fn show_capture(app: &AppHandle) -> Result<(), String> {
    let started = Instant::now();
    let app = app.clone();
    // Return from the native hotkey callback before activating another window.
    // Windows activation can otherwise wait on the input queue handling that key.
    // Keep the original timestamp, including scheduling and native dispatch time.
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = show_capture_at(&app, started) {
            eprintln!("Quick Capture: {error}");
            let _ = app.emit_to("anchor", "runtime-error", error);
        }
    });
    Ok(())
}

fn show_capture_at(app: &AppHandle, started: Instant) -> Result<(), String> {
    let _scheduled_ms = started.elapsed().as_secs_f64() * 1000.0;
    let runtime = runtime(app);
    // Only complete show/hide operations take this lock. Native callbacks and
    // readiness use the separate state mutex and cannot wait on this operation.
    let _operation = runtime.1.lock().map_err(|_| "Capture operation unavailable")?;
    let _admitted_ms = started.elapsed().as_secs_f64() * 1000.0;
    if crate::engaged_notes::is_quitting(app) { return Err("Quit is pending".into()); }
    let window = surface(app, "capture")?;
    let state = &runtime;
    let session = {
        let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
        if crate::engaged_notes::is_quitting(app) { return Err("Quit is pending".into()); }
        if state.completing { return Ok(()); }
        if !state.active {
            state.sequence += 1;
            state.active = true;
            state.committed = None;
            state.previous_window = remember_workspace(&mut state);
            state.started = Some(started);
            state.invocation = None;
            state.native_focus_ms = None;
        }
        CaptureSession { sequence: state.sequence, active: true }
    };
    // Prepare the existing input before native activation can block its event loop.
    window.emit_to("capture", "capture-invoked", &session).map_err(|e| e.to_string())?;
    place_capture(app, &window)?;
    let _placed = started.elapsed().as_secs_f64() * 1000.0;
    window.show().map_err(|e| e.to_string())?;
    let _shown = started.elapsed().as_secs_f64() * 1000.0;
    window.set_focus().map_err(|e| e.to_string())?;
    let _focused = started.elapsed().as_secs_f64() * 1000.0;
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    state.invocation = Some(InvocationTiming { scheduled_ms: _scheduled_ms, admitted_ms: _admitted_ms, placed_ms: _placed, shown_ms: _shown, focused_ms: _focused });
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn capture_surface_ready(app: AppHandle) -> Result<CaptureSession, String> {
    let state = runtime(&app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    state.ready = true;
    Ok(CaptureSession { sequence: state.sequence, active: state.active })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn capture_input_ready(app: AppHandle, sequence: u64, frontend_focus_ms: Option<f64>, frontend_ready_ms: Option<f64>) -> Result<(), String> {
    if [frontend_focus_ms, frontend_ready_ms].into_iter().flatten().any(|ms| !ms.is_finite() || ms < 0.0) { return Err("Invalid frontend readiness duration".into()); }
    let _received = runtime(&app).0.lock().map_err(|_| "Capture state unavailable")?.started.map(|start| start.elapsed().as_secs_f64() * 1000.0);
    let window = surface(&app, "capture")?;
    if !window.is_visible().map_err(|e| e.to_string())? || !window.is_focused().map_err(|e| e.to_string())? {
        return Err("Capture is not visible and focused".into());
    }
    let state = runtime(&app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    if state.active && state.sequence == sequence {
        if let Some(started) = state.started.take() {
            // Freeze the endpoint before diagnostic output. Console writes are
            // not part of focused-input readiness and can block for tens of ms.
            let confirmed_ms = started.elapsed().as_secs_f64() * 1000.0;
            #[cfg(any(debug_assertions, feature = "phase5-diagnostics"))]
            eprintln!("capture readiness: {}", serde_json::json!({"sequence":sequence,"ack_received_ms":_received,"confirmed_ms":confirmed_ms,"frontend_focus_ms":frontend_focus_ms,"frontend_ready_ms":frontend_ready_ms,"invocation":state.invocation,"native_focus_ms":state.native_focus_ms}));
            sample(&mut state, "hotkey_to_focused_input", confirmed_ms);
        }
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn commit_capture(app: AppHandle, sequence: u64, content: String, title: Option<String>, container_id: Option<String>) -> Result<Capture, String> {
    let started = Instant::now();
    // Qualification builds require an isolated data directory at startup.
    // Observe received IPC data without replacing Tauri's immutable transport.
    #[cfg(feature = "phase5-diagnostics")]
    eprintln!("capture submission: {}", serde_json::json!({"sequence":sequence,"content":content,"title":title,"container_id":container_id}));
    let operation = runtime(&app);
    let _operation = operation.1.lock().map_err(|_| "Capture operation unavailable")?;
    let state = runtime(&app);
    let mut state_guard = state.0.lock().map_err(|_| "Capture state unavailable")?;
    let state = &mut *state_guard;
    if state.sequence != sequence { return Err("This capture session has ended".into()); }
    if state.completing { return Err("Capture is already being completed".into()); }
    // An IPC retry after persistence must never duplicate a successful capture.
    let record = if let Some(record) = &state.committed {
        if record.content != content || record.title.as_deref() != title.as_deref().filter(|value| !value.trim().is_empty())
            || container_id.as_ref().is_some_and(|id| id != &record.container_id) {
            return Err("Saved; dismiss failed. This capture is already persisted; retry with the saved draft.".into());
        }
        record.clone()
    }
    else {
        if !state.active { return Err("This capture session has ended".into()); }
        let record = app.state::<Database>().create_quick_capture(&content, title.as_deref(), container_id.as_deref()).map_err(|e| e.to_string())?;
        state.committed = Some(record.clone());
        record
    };
    state.completing = true;
    let previous_window = state.previous_window;
    drop(state_guard);
    // Persistence is observable even if the following native hide fails.
    let _ = app.emit("captures-changed", ());
    // Never hold the runtime mutex while dispatching native window work. A
    // global-hotkey callback can run on the native event loop and need this lock.
    let hidden = hide_surface(&app, "capture");
    if hidden.is_ok() { eprintln!("capture foreground restored: {}", foreground::restore(previous_window)); }
    let state = runtime(&app);
    {
        let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
        state.completing = false;
        if let Err(error) = hidden { return Err(format!("Saved; dismiss failed. Retry to dismiss: {error}")); }
        state.active = false;
        sample(&mut state, "commit_ipc_to_persisted_and_hidden", started.elapsed().as_secs_f64() * 1000.0);
    }
    #[cfg(feature = "phase5-diagnostics")]
    eprintln!("capture committed: {}", serde_json::json!({"sequence":sequence,"record":record}));
    Ok(record)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn cancel_capture(app: AppHandle, sequence: u64) -> Result<(), String> {
    let operation = runtime(&app);
    let _operation = operation.1.lock().map_err(|_| "Capture operation unavailable")?;
    let state = runtime(&app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    if state.sequence != sequence { return Err("This capture session has ended".into()); }
    if state.completing { return Err("Capture is being saved".into()); }
    state.completing = true;
    let previous_window = state.previous_window;
    drop(state);
    let hidden = hide_surface(&app, "capture");
    if hidden.is_ok() { eprintln!("capture foreground restored: {}", foreground::restore(previous_window)); }
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
pub async fn set_anchor_expanded(app: AppHandle, expanded: bool, focused: bool, height: Option<f64>, inspector: Option<bool>, pixel_ratio: Option<f64>) -> Result<(), String> {
    let height = height.unwrap_or(190.0);
    if !height.is_finite() { return Err("Invalid retrieval height".into()); }
    let window = surface(&app, "anchor")?;
    if expanded {
        let state = runtime(&app);
        let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
        remember_workspace(&mut state);
    } else if window.is_focused().map_err(|e| e.to_string())? {
        let previous = runtime(&app).0.lock().map_err(|_| "Capture state unavailable")?.workspace_window;
        foreground::restore(previous);
    }
    window.set_focusable(expanded && focused).map_err(|e| e.to_string())?;
    place_anchor(&window, expanded, height, inspector.unwrap_or(false), pixel_ratio)?;
    if expanded && focused { window.set_focus().map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_captures(app: AppHandle, container_id: Option<String>) -> Result<Vec<Capture>, String> {
    app.state::<Database>().list_captures(container_id.as_deref().unwrap_or(WAITING_ROOM)).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_capture_context(app: AppHandle) -> Result<CaptureContext, String> {
    app.state::<Database>().capture_context().map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_project(app: AppHandle, name: String, parent_id: Option<String>) -> Result<Container, String> {
    let project = app.state::<Database>().create_project_in(&name, parent_id.as_deref()).map_err(|e| e.to_string())?;
    let _ = app.emit("containers-changed", ());
    Ok(project)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn set_primary_project(app: AppHandle, id: Option<String>) -> Result<(), String> {
    app.state::<Database>().set_primary_project(id.as_deref()).map_err(|e| e.to_string())?;
    let _ = app.emit("containers-changed", ());
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn reassign_capture(app: AppHandle, id: String, container_id: String) -> Result<Capture, String> {
    let capture = app.state::<Database>().reassign_capture(&id, &container_id).map_err(|e| e.to_string())?;
    let _ = app.emit("captures-changed", ());
    Ok(capture)
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
pub async fn get_capture_shortcut(app: AppHandle) -> Result<hotkeys::ShortcutStatus, String> { hotkeys::status(&app) }

#[tauri::command(rename_all = "snake_case")]
pub async fn set_capture_shortcut(app: AppHandle, binding: String) -> Result<hotkeys::ShortcutStatus, String> {
    hotkeys::apply_capture_shortcut(&app, &binding)?;
    hotkeys::status(&app)
}

pub fn workspace(app: &AppHandle) -> Result<usize, String> {
    let state = runtime(app);
    let mut state = state.0.lock().map_err(|_| "Capture state unavailable")?;
    Ok(remember_workspace(&mut state))
}
pub fn capture_active(app: &AppHandle) -> Result<bool, String> {
    Ok(runtime(app).0.lock().map_err(|_| "Capture state unavailable")?.active)
}

#[derive(Serialize)]
pub struct SurfacePreferences { opacity: f64, always_on_top: bool }
#[tauri::command(rename_all = "snake_case")]
pub async fn get_quick_presentation(app: AppHandle) -> Result<SurfacePreferences, String> {
    let db = app.state::<Database>();
    let opacity = db.get_setting_opt("capture_surface_opacity").map_err(|e| e.to_string())?
        .and_then(|value| value.parse::<f64>().ok()).filter(|value| value.is_finite() && (0.1..=1.0).contains(value)).unwrap_or(1.0);
    let always_on_top = db.get_setting_opt("capture_surface_pin").map_err(|e| e.to_string())?.as_deref() != Some("false");
    surface(&app, "capture")?.set_always_on_top(always_on_top).map_err(|e| e.to_string())?;
    Ok(SurfacePreferences { opacity, always_on_top })
}
#[tauri::command(rename_all = "snake_case")]
pub async fn update_quick_presentation(app: AppHandle, opacity: f64, always_on_top: bool) -> Result<(), String> {
    if !opacity.is_finite() || !(0.1..=1.0).contains(&opacity) { return Err("Invalid opacity".into()); }
    surface(&app, "capture")?.set_always_on_top(always_on_top).map_err(|e| e.to_string())?;
    let db = app.state::<Database>();
    db.set_setting("capture_surface_opacity", &opacity.to_string()).map_err(|e| e.to_string())?;
    db.set_setting("capture_surface_pin", &always_on_top.to_string()).map_err(|e| e.to_string())
}
#[tauri::command(rename_all = "snake_case")]
pub async fn set_capture_router(app: AppHandle, open: bool, pixel_ratio: Option<f64>) -> Result<(), String> {
    let window = surface(&app, "capture")?;
    let factor = crate::surface_geometry::css_scale(&window, pixel_ratio)?;
    runtime(&app).0.lock().map_err(|_| "Capture state unavailable")?.capture_css_scale = Some(factor);
    window.set_size(tauri::LogicalSize::new(432.0 * factor, (if open { 360.0 } else { 112.0 }) * factor)).map_err(|e| e.to_string())?;
    let mut regions = vec![crate::surface_geometry::Rect(0.0, 0.0, 432.0, 112.0)];
    if open { regions.push(crate::surface_geometry::Rect(204.0, 112.0, 228.0, 248.0)); }
    let regions = regions.into_iter().map(|r| r.scaled(factor)).collect::<Vec<_>>();
    crate::surface_geometry::shape(&window, &regions)
}
