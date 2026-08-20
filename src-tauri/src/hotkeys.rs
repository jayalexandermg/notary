use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::db::Database;
use crate::note_window::{close_all_note_windows, show_all_note_windows, spawn_note_window};

static NOTES_VISIBLE: AtomicBool = AtomicBool::new(true);

const DEFAULT_NEW_NOTE: &str = "Ctrl+Alt+N";
const DEFAULT_TOGGLE_ALL: &str = "Ctrl+Alt+H";

/// Parse a binding string like "Mod+Alt+N" / "Ctrl+Alt+H" (as produced by the
/// keybinding settings UI) into a `Shortcut`. Only letters and digits are
/// supported as the trailing key — enough for the two global actions this app
/// exposes, and it keeps the surface small enough to validate reliably across
/// platforms.
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

    let key = key_part.to_uppercase();
    let code = match key.as_str() {
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

/// (Re-)register the two global hotkeys, replacing whatever was registered before.
/// Used both at startup (with the stored or default bindings) and whenever the
/// user rebinds them from the keyboard shortcuts panel.
pub fn apply_hotkeys(app: &AppHandle, new_note_accel: &str, toggle_accel: &str) -> Result<(), String> {
    let new_note_shortcut = parse_shortcut(new_note_accel)?;
    let toggle_shortcut = parse_shortcut(toggle_accel)?;

    let _ = app.global_shortcut().unregister_all();

    app.global_shortcut().on_shortcut(new_note_shortcut, move |app, _shortcut, _event| {
        let db = app.state::<Database>();

        // Create note at a default position (center-ish of screen)
        // In a real app, we'd get the cursor position
        let note = match db.create_note(100, 100) {
            Ok(n) => n,
            Err(e) => {
                eprintln!("Failed to create note: {}", e);
                return;
            }
        };

        spawn_note_window(app, note);
    }).map_err(|e| e.to_string())?;

    app.global_shortcut().on_shortcut(toggle_shortcut, move |app, _shortcut, _event| {
        let visible = NOTES_VISIBLE.load(Ordering::SeqCst);

        if visible {
            close_all_note_windows(app);
            NOTES_VISIBLE.store(false, Ordering::SeqCst);
        } else {
            show_all_note_windows(app);
            NOTES_VISIBLE.store(true, Ordering::SeqCst);
        }
    }).map_err(|e| e.to_string())?;

    Ok(())
}

/// Register hotkeys at startup, using whatever the user last saved (falling
/// back to the defaults for a first run or an unparsable stored value).
pub fn register_hotkeys(app: &AppHandle) -> Result<(), String> {
    let db = app.state::<Database>();
    let new_note_accel = db.get_setting_opt("hotkey_new_note").ok().flatten().unwrap_or_else(|| DEFAULT_NEW_NOTE.to_string());
    let toggle_accel = db.get_setting_opt("hotkey_toggle_all").ok().flatten().unwrap_or_else(|| DEFAULT_TOGGLE_ALL.to_string());

    if let Err(e) = apply_hotkeys(app, &new_note_accel, &toggle_accel) {
        eprintln!("Failed to apply stored hotkeys ({e}), falling back to defaults");
        return apply_hotkeys(app, DEFAULT_NEW_NOTE, DEFAULT_TOGGLE_ALL);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_shipped_defaults() {
        parse_shortcut(DEFAULT_NEW_NOTE).expect("default new-note hotkey must parse");
        parse_shortcut(DEFAULT_TOGGLE_ALL).expect("default toggle-all hotkey must parse");
    }

    #[test]
    fn parses_bindings_recorded_by_the_settings_ui() {
        // The keybinding panel serializes with a portable "Mod" prefix.
        for binding in ["Mod+Alt+N", "Mod+Shift+H", "Ctrl+Alt+N", "Alt+Shift+3", "Mod+K"] {
            parse_shortcut(binding).unwrap_or_else(|e| panic!("{binding} should parse: {e}"));
        }
    }

    #[test]
    fn rejects_bindings_it_cannot_honour() {
        // Rejected up front so a bad rebind reports an error instead of
        // silently unregistering the working hotkeys.
        assert!(parse_shortcut("").is_err());
        assert!(parse_shortcut("Ctrl+Alt+F5").is_err(), "unsupported key must error");
        assert!(parse_shortcut("Hyper+N").is_err(), "unknown modifier must error");
    }

    #[test]
    fn modifiers_are_not_silently_dropped() {
        let with_alt = parse_shortcut("Ctrl+Alt+N").unwrap();
        let without_alt = parse_shortcut("Ctrl+N").unwrap();
        assert_ne!(with_alt, without_alt);
    }
}
