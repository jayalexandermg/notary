use std::sync::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use crate::{capture_runtime, Database};

pub const DEFAULT_CAPTURE: &str = "Ctrl+Alt+Shift+H";

#[derive(Default)]
pub struct Hotkeys(Mutex<Registration>);
#[derive(Default)]
struct Registration {
    shortcut: Option<Shortcut>,
    binding: String,
    error: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct ShortcutStatus {
    pub binding: String,
    pub registered: bool,
    pub error: Option<String>,
}

fn parse_shortcut(binding: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = binding.split('+').filter(|p| !p.is_empty()).collect();
    let Some((&key_part, mod_parts)) = parts.split_last() else {
        return Err(format!("Empty shortcut: {binding}"));
    };

    let mut modifiers = Modifiers::empty();
    for part in mod_parts {
        match *part {
            // "Mod" is the portable modifier the settings UI records: Cmd on
            // macOS, Ctrl everywhere else. Keep it in step with the frontend's
            // `isMac` handling in src/lib/keybindings.ts.
            "Mod" | "CmdOrCtrl" => {
                #[cfg(target_os = "macos")]
                {
                    modifiers |= Modifiers::SUPER;
                }
                #[cfg(not(target_os = "macos"))]
                {
                    modifiers |= Modifiers::CONTROL;
                }
            }
            "Ctrl" | "Control" => modifiers |= Modifiers::CONTROL,
            "Alt" | "Option" => modifiers |= Modifiers::ALT,
            "Shift" => modifiers |= Modifiers::SHIFT,
            "Meta" | "Super" | "Cmd" | "Win" => modifiers |= Modifiers::SUPER,
            other => return Err(format!("Unknown modifier: {other}")),
        }
    }

    if !modifiers.intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER) { return Err("Use Ctrl, Alt, or Command with a key".into()); }
    let key = key_part.to_uppercase();
    let code = match key.as_str() {
        "SPACE" => Code::Space,
        "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC, "D" => Code::KeyD,
        "E" => Code::KeyE, "F" => Code::KeyF, "G" => Code::KeyG, "H" => Code::KeyH,
        "I" => Code::KeyI, "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
        "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO, "P" => Code::KeyP,
        "Q" => Code::KeyQ, "R" => Code::KeyR, "S" => Code::KeyS, "T" => Code::KeyT,
        "U" => Code::KeyU, "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
        "Y" => Code::KeyY, "Z" => Code::KeyZ,
        "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2, "3" => Code::Digit3,
        "4" => Code::Digit4, "5" => Code::Digit5, "6" => Code::Digit6, "7" => Code::Digit7,
        "8" => Code::Digit8, "9" => Code::Digit9,
        other => return Err(format!("Unsupported key for a global shortcut: {other}")),
    };

    Ok(Shortcut::new(Some(modifiers), code))
}

fn register(app: &AppHandle, shortcut: Shortcut) -> Result<(), String> {
    app.global_shortcut().on_shortcut(shortcut, |app, _, event| {
        if event.state == ShortcutState::Pressed {
            if let Err(error) = capture_runtime::show_capture(app) {
                eprintln!("Quick Capture: {error}");
                let _ = app.emit_to("anchor", "runtime-error", error);
            }
        }
    }).map_err(|e| format!("Shortcut unavailable; it may be in use by another application: {e}"))
}

pub fn status(app: &AppHandle) -> Result<ShortcutStatus, String> {
    let state = app.state::<Hotkeys>();
    let state = state.0.lock().map_err(|_| "Shortcut state unavailable")?;
    Ok(ShortcutStatus { binding: state.binding.clone(), registered: state.shortcut.is_some(), error: state.error.clone() })
}

/// Register the candidate before touching a working accelerator. A collision
/// leaves the old accelerator and its persisted setting intact.
pub fn apply_capture_shortcut(app: &AppHandle, binding: &str) -> Result<(), String> {
    let candidate = parse_shortcut(binding)?;
    let registration = app.state::<Hotkeys>();
    let mut registration = registration.0.lock().map_err(|_| "Shortcut state unavailable")?;
    if registration.shortcut == Some(candidate) { return Ok(()); }
    register(app, candidate)?;
    if let Some(previous) = registration.shortcut {
        if let Err(error) = app.global_shortcut().unregister(previous) {
            let _ = app.global_shortcut().unregister(candidate);
            return Err(format!("Could not replace the current shortcut: {error}"));
        }
    }
    if let Err(error) = app.state::<Database>().set_setting("capture_shortcut", binding) {
        let _ = app.global_shortcut().unregister(candidate);
        if let Some(previous) = registration.shortcut {
            if let Err(restore_error) = register(app, previous) {
                registration.shortcut = None;
                registration.error = Some(restore_error.clone());
                return Err(format!("Could not save shortcut: {error}; restore failed: {restore_error}"));
            }
        }
        return Err(error.to_string());
    }
    registration.shortcut = Some(candidate);
    registration.binding = binding.into();
    registration.error = None;
    Ok(())
}

pub fn register_hotkeys(app: &AppHandle) -> Result<(), String> {
    let binding = app.state::<Database>().get_setting_opt("capture_shortcut")
        .map_err(|e| e.to_string())?.unwrap_or_else(|| DEFAULT_CAPTURE.into());
    if let Err(error) = apply_capture_shortcut(app, &binding) {
        let state = app.state::<Hotkeys>();
        let mut state = state.0.lock().map_err(|_| "Shortcut state unavailable")?;
        state.binding = binding;
        state.error = Some(error.clone());
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_portable_and_development_shortcuts() {
        for binding in [DEFAULT_CAPTURE, "Mod+Alt+N", "Ctrl+Alt+Space", "Alt+Shift+3", "Mod+K"] {
            assert!(parse_shortcut(binding).is_ok(), "{binding}");
        }
    }
    #[test]
    fn rejects_unsafe_or_unsupported_bindings_before_registration() {
        for binding in ["", "H", "Shift+H", "Hyper+N", "Ctrl+Alt+F5"] {
            assert!(parse_shortcut(binding).is_err(), "{binding}");
        }
    }
    #[test]
    fn modifiers_are_not_silently_dropped() {
        assert_ne!(parse_shortcut("Ctrl+Alt+N").unwrap(), parse_shortcut("Ctrl+N").unwrap());
    }
}