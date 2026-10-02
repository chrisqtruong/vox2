// Watches the keyboard system-wide so Vox2's shortcuts work from any app:
//   dictate – reported to the main window as { name, type: "down" | "up" | "other" };
//             the page owns tap / hold logic (shared with the in-window mic button)
//   summon  – show/hide the window (handled here)
//   select  – copy whatever is selected in the current app and translate it (handled here)

#[cfg(target_os = "macos")]
use rdev_mac as rdev;
use rdev::{listen, EventType, Key};
use serde::Deserialize;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Deserialize)]
pub struct Hotkey {
    pub code: String, // KeyboardEvent.code naming, e.g. "ControlRight", "KeyT"; empty = off
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
}

static HOTKEYS: LazyLock<Mutex<HashMap<String, Hotkey>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub fn set_hotkey(name: String, hotkey: Hotkey) {
    HOTKEYS.lock().unwrap().insert(name, hotkey);
}

fn is_modifier(code: &str) -> bool {
    matches!(
        code,
        "ControlLeft" | "ControlRight" | "AltLeft" | "AltRight" | "ShiftLeft" | "ShiftRight" | "MetaLeft" | "MetaRight"
    )
}

// "ControlLeft" → "Control" etc.; None for non-modifier keys.
fn modifier_class(code: &str) -> Option<&str> {
    is_modifier(code).then(|| code.trim_end_matches("Left").trim_end_matches("Right"))
}

// A shortcut made only of modifiers, e.g. Ctrl+Alt+Shift: stored as one modifier plus flags.
fn is_chord(hk: &Hotkey) -> bool {
    is_modifier(&hk.code) && (hk.ctrl || hk.alt || hk.shift || hk.meta)
}

// rdev key → browser KeyboardEvent.code, so shortcuts recorded in the UI match.
fn code_of(key: Key) -> Option<&'static str> {
    use Key::*;
    Some(match key {
        ControlLeft => "ControlLeft",
        ControlRight => "ControlRight",
        Alt => "AltLeft",
        AltGr => "AltRight",
        ShiftLeft => "ShiftLeft",
        ShiftRight => "ShiftRight",
        MetaLeft => "MetaLeft",
        MetaRight => "MetaRight",
        Space => "Space",
        Tab => "Tab",
        Return => "Enter",
        Escape => "Escape",
        Backspace => "Backspace",
        CapsLock => "CapsLock",
        BackQuote => "Backquote",
        Minus => "Minus",
        Equal => "Equal",
        LeftBracket => "BracketLeft",
        RightBracket => "BracketRight",
        SemiColon => "Semicolon",
        Quote => "Quote",
        BackSlash => "Backslash",
        Comma => "Comma",
        Dot => "Period",
        Slash => "Slash",
        Insert => "Insert",
        Delete => "Delete",
        Home => "Home",
        End => "End",
        PageUp => "PageUp",
        PageDown => "PageDown",
        ScrollLock => "ScrollLock",
        Pause => "Pause",
        PrintScreen => "PrintScreen",
        F1 => "F1", F2 => "F2", F3 => "F3", F4 => "F4", F5 => "F5", F6 => "F6",
        F7 => "F7", F8 => "F8", F9 => "F9", F10 => "F10", F11 => "F11", F12 => "F12",
        Num0 => "Digit0", Num1 => "Digit1", Num2 => "Digit2", Num3 => "Digit3", Num4 => "Digit4",
        Num5 => "Digit5", Num6 => "Digit6", Num7 => "Digit7", Num8 => "Digit8", Num9 => "Digit9",
        KeyA => "KeyA", KeyB => "KeyB", KeyC => "KeyC", KeyD => "KeyD", KeyE => "KeyE", KeyF => "KeyF",
        KeyG => "KeyG", KeyH => "KeyH", KeyI => "KeyI", KeyJ => "KeyJ", KeyK => "KeyK", KeyL => "KeyL",
        KeyM => "KeyM", KeyN => "KeyN", KeyO => "KeyO", KeyP => "KeyP", KeyQ => "KeyQ", KeyR => "KeyR",
        KeyS => "KeyS", KeyT => "KeyT", KeyU => "KeyU", KeyV => "KeyV", KeyW => "KeyW", KeyX => "KeyX",
        KeyY => "KeyY", KeyZ => "KeyZ",
        _ => return None,
    })
}

// The watcher doesn't receive keys while Vox2 itself is in front (and can miss the key-ups
// from just before), so the window handles its own shortcuts while focused and tells us
// to forget stale key state whenever focus changes.
static RESET: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn reset_keys() {
    RESET.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn hide_main(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

#[tauri::command]
pub fn show_window(app: AppHandle) {
    show_main(&app);
}

/// Show/hide shortcut pressed in another app: bring Vox2 up, ready to type.
/// (Pressed while Vox2 is in front, the window hides itself; see app.js.)
fn summon(app: &AppHandle) {
    show_main(app);
    let _ = app.emit_to("main", "summoned", ());
}

/// Tray click: show if hidden, hide if showing.
pub fn toggle_visible(app: &AppHandle) {
    match app.get_webview_window("main") {
        Some(win) if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) => {
            let _ = win.hide();
        }
        _ => summon(app),
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

// Copy the current selection in whatever app is in front, then hand it to the window.
// The user's clipboard is put back afterwards.
fn grab_selection(app: AppHandle, held: Arc<Mutex<HashSet<&'static str>>>) {
    std::thread::spawn(move || {
        // Wait for the shortcut's modifiers to come up, or our Ctrl+C would become Ctrl+Alt+C.
        for _ in 0..60 {
            if held.lock().unwrap().iter().all(|c| !is_modifier(c)) {
                break;
            }
            std::thread::sleep(Duration::from_millis(15));
        }
        let mut clipboard = arboard::Clipboard::new().ok();
        let before = clipboard.as_mut().and_then(|c| c.get_text().ok());
        if let Some(c) = clipboard.as_mut() {
            let _ = c.clear();
        }
        {
            use enigo::{Direction, Enigo, Key, Keyboard, Settings};
            if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
                let modifier = if cfg!(target_os = "macos") { Key::Meta } else { Key::Control };
                let _ = enigo.key(modifier, Direction::Press);
                let _ = enigo.key(Key::Unicode('c'), Direction::Click);
                let _ = enigo.key(modifier, Direction::Release);
            }
        }
        let mut text = String::new();
        for _ in 0..25 {
            std::thread::sleep(Duration::from_millis(20));
            if let Some(t) = clipboard.as_mut().and_then(|c| c.get_text().ok()) {
                if !t.is_empty() {
                    text = t;
                    break;
                }
            }
        }
        if let (Some(c), Some(b)) = (clipboard.as_mut(), before) {
            let _ = c.set_text(b);
        }
        // The page decides where the result goes: the bubble by the cursor, or the main window.
        let _ = app.emit_to("main", "selection", json!({ "text": text }));
    });
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        // This thread isn't the main one, so have rdev look up the keyboard layout on the main
        // thread; doing it here crashes on macOS 14+.
        #[cfg(target_os = "macos")]
        rdev::set_is_main_thread(false);
        let held: Arc<Mutex<HashSet<&'static str>>> = Arc::default();
        let mut down: HashSet<String> = HashSet::new(); // shortcuts currently pressed
        let result = listen(move |event| {
            let (pressed, key) = match event.event_type {
                EventType::KeyPress(k) => (true, k),
                EventType::KeyRelease(k) => (false, k),
                _ => return,
            };
            let Some(code) = code_of(key) else { return };
            // Key-ups get lost while Vox2 itself is in front; start clean whenever focus changes.
            if RESET.swap(false, Ordering::Relaxed) {
                held.lock().unwrap().clear();
                down.clear();
            }
            let hotkeys = HOTKEYS.lock().unwrap().clone();

            if !pressed {
                held.lock().unwrap().remove(code);
                for (name, hk) in &hotkeys {
                    // A modifier-only chord ends as soon as any of its keys comes up.
                    let ends = hk.code == code || (is_chord(hk) && is_modifier(code));
                    if ends && down.remove(name) && name == "dictate" {
                        let _ = app.emit_to("main", "hotkey", json!({ "name": name, "type": "up" }));
                    }
                }
                return;
            }

            let repeat = !held.lock().unwrap().insert(code);
            let mods = held.lock().unwrap().clone();
            let has = |class: &str| mods.iter().any(|c| modifier_class(c) == Some(class));
            for (name, hk) in &hotkeys {
                if hk.code.is_empty() {
                    continue;
                }
                let chord = is_chord(hk);
                let lone = is_modifier(&hk.code) && !chord;
                // Shortcut kinds: one key ("Right Ctrl"), modifiers + key ("Ctrl+Shift+Space"),
                // or modifiers only ("Ctrl+Alt+Shift", any order: fires once all are down).
                let fires = if chord {
                    is_modifier(code) && {
                        let need = |class: &str, flag: bool| flag || modifier_class(&hk.code) == Some(class);
                        has("Control") == need("Control", hk.ctrl)
                            && has("Alt") == need("Alt", hk.alt)
                            && has("Shift") == need("Shift", hk.shift)
                            && has("Meta") == need("Meta", hk.meta)
                    }
                } else {
                    hk.code == code
                        && (lone
                            || (has("Control") == hk.ctrl
                                && has("Alt") == hk.alt
                                && has("Shift") == hk.shift
                                && has("Meta") == hk.meta))
                };
                if fires {
                    if repeat || down.contains(name) {
                        continue;
                    }
                    down.insert(name.clone());
                    match name.as_str() {
                        "dictate" => {
                            let _ = app.emit_to("main", "hotkey", json!({ "name": name, "type": "down" }));
                        }
                        "summon" => summon(&app),
                        "select" => grab_selection(app.clone(), held.clone()),
                        "snip" => crate::overlay::start_snip(&app),
                        _ => {}
                    }
                } else if lone && hk.code != code && name == "dictate" && down.contains(name) {
                    // e.g. Ctrl+C while Right Ctrl is the dictation key
                    let _ = app.emit_to("main", "hotkey", json!({ "name": name, "type": "other" }));
                }
            }
        });
        if let Err(err) = result {
            eprintln!("keyboard watcher stopped: {err:?}");
        }
    });
}
