// Watches the keyboard system-wide so Vox2's shortcuts work from any app:
//   dictate – reported to the main window as { name, type: "down" | "up" | "other" };
//             the page owns tap / hold logic (shared with the in-window mic button)
//   summon  – show/hide the window (handled here)
//   select  – copy whatever is selected in the current app and translate it (handled here)

#[cfg(not(target_os = "macos"))]
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
#[cfg(not(target_os = "macos"))]
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
        let held: Arc<Mutex<HashSet<&'static str>>> = Arc::default();
        let mut down: HashSet<String> = HashSet::new(); // shortcuts currently pressed
        let on_key = move |pressed: bool, code: &'static str| {
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
        };

        #[cfg(not(target_os = "macos"))]
        let result = listen(move |event| {
            let (pressed, key) = match event.event_type {
                EventType::KeyPress(k) => (true, k),
                EventType::KeyRelease(k) => (false, k),
                _ => return,
            };
            if let Some(code) = code_of(key) {
                on_key(pressed, code);
            }
        });
        #[cfg(target_os = "macos")]
        let result = {
            // macOS won't let us watch the keyboard until Accessibility is allowed; wait for it
            // here, so granting it from the permissions sheet works without a restart.
            while !crate::permissions::accessibility_allowed() {
                std::thread::sleep(Duration::from_secs(2));
            }
            mac::listen(on_key)
        };
        if let Err(err) = result {
            eprintln!("keyboard watcher stopped: {err:?}");
        }
    });
}

// macOS keyboard watcher. rdev's does a keyboard-layout lookup for every key (on the main
// thread, or it crashes); when that's slow, macOS switches the watcher off for good. This one
// only reads which key went down or up, and switches itself back on if macOS ever turns it off.
#[cfg(target_os = "macos")]
mod mac {
    use core_foundation::base::TCFType;
    use core_foundation::mach_port::{CFMachPort, CFMachPortRef};
    use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicPtr, Ordering};

    type CGEventRef = *mut c_void;
    type TapCallback = extern "C" fn(*mut c_void, u32, CGEventRef, *mut c_void) -> CGEventRef;
    type OnKey = Box<dyn FnMut(bool, &'static str)>;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            events_of_interest: u64,
            callback: TapCallback,
            user_info: *mut c_void,
        ) -> CFMachPortRef;
        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
        fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
        fn CGEventGetFlags(event: CGEventRef) -> u64;
    }

    const SESSION_TAP: u32 = 1; // kCGSessionEventTap
    const HEAD_INSERT: u32 = 0; // kCGHeadInsertEventTap
    const LISTEN_ONLY: u32 = 1; // kCGEventTapOptionListenOnly
    const KEY_DOWN: u32 = 10;
    const KEY_UP: u32 = 11;
    const FLAGS_CHANGED: u32 = 12;
    const DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
    const DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;
    const KEYCODE: u32 = 9; // kCGKeyboardEventKeycode

    static TAP: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    pub fn listen(on_key: impl FnMut(bool, &'static str) + 'static) -> Result<(), &'static str> {
        let user_info = Box::into_raw(Box::new(Box::new(on_key) as OnKey)) as *mut c_void;
        let mask = (1 << KEY_DOWN) | (1 << KEY_UP) | (1 << FLAGS_CHANGED);
        let tap = unsafe { CGEventTapCreate(SESSION_TAP, HEAD_INSERT, LISTEN_ONLY, mask, on_event, user_info) };
        if tap.is_null() {
            return Err("couldn't watch the keyboard");
        }
        TAP.store(tap as *mut c_void, Ordering::Relaxed);
        let port = unsafe { CFMachPort::wrap_under_create_rule(tap) };
        let source = port.create_runloop_source(0).map_err(|_| "couldn't watch the keyboard")?;
        CFRunLoop::get_current().add_source(&source, unsafe { kCFRunLoopCommonModes });
        unsafe { CGEventTapEnable(tap, true) };
        CFRunLoop::run_current();
        Ok(())
    }

    extern "C" fn on_event(_proxy: *mut c_void, kind: u32, event: CGEventRef, user_info: *mut c_void) -> CGEventRef {
        if kind == DISABLED_BY_TIMEOUT || kind == DISABLED_BY_USER_INPUT {
            let tap = TAP.load(Ordering::Relaxed);
            if !tap.is_null() {
                unsafe { CGEventTapEnable(tap as CFMachPortRef, true) };
            }
            return event;
        }
        let keycode = unsafe { CGEventGetIntegerValueField(event, KEYCODE) } as u16;
        let Some(code) = code_of(keycode) else { return event };
        let pressed = match kind {
            KEY_DOWN => true,
            KEY_UP => false,
            // Modifiers only send "flags changed": it's down if its own bit is now set.
            FLAGS_CHANGED => match modifier_bit(keycode) {
                Some(bit) => (unsafe { CGEventGetFlags(event) } & bit) != 0,
                None => return event,
            },
            _ => return event,
        };
        let on_key = unsafe { &mut *(user_info as *mut OnKey) };
        on_key(pressed, code);
        event
    }

    // Left/right-specific modifier bits in the event flags (NX_DEVICE*KEYMASK).
    fn modifier_bit(keycode: u16) -> Option<u64> {
        Some(match keycode {
            0x3B => 0x0001, // left control
            0x38 => 0x0002, // left shift
            0x3C => 0x0004, // right shift
            0x37 => 0x0008, // left command
            0x36 => 0x0010, // right command
            0x3A => 0x0020, // left option
            0x3D => 0x0040, // right option
            0x3E => 0x2000, // right control
            _ => return None,
        })
    }

    // macOS virtual key code (kVK_*) → browser KeyboardEvent.code, matching the UI's names.
    fn code_of(keycode: u16) -> Option<&'static str> {
        Some(match keycode {
            0x3B => "ControlLeft", 0x3E => "ControlRight",
            0x3A => "AltLeft", 0x3D => "AltRight",
            0x38 => "ShiftLeft", 0x3C => "ShiftRight",
            0x37 => "MetaLeft", 0x36 => "MetaRight",
            0x31 => "Space", 0x30 => "Tab", 0x24 => "Enter", 0x35 => "Escape",
            0x33 => "Backspace", 0x39 => "CapsLock", 0x32 => "Backquote",
            0x1B => "Minus", 0x18 => "Equal", 0x21 => "BracketLeft", 0x1E => "BracketRight",
            0x29 => "Semicolon", 0x27 => "Quote", 0x2A => "Backslash",
            0x2B => "Comma", 0x2F => "Period", 0x2C => "Slash",
            0x72 => "Insert", 0x75 => "Delete", 0x73 => "Home", 0x77 => "End",
            0x74 => "PageUp", 0x79 => "PageDown",
            0x7A => "F1", 0x78 => "F2", 0x63 => "F3", 0x76 => "F4", 0x60 => "F5", 0x61 => "F6",
            0x62 => "F7", 0x64 => "F8", 0x65 => "F9", 0x6D => "F10", 0x67 => "F11", 0x6F => "F12",
            0x1D => "Digit0", 0x12 => "Digit1", 0x13 => "Digit2", 0x14 => "Digit3", 0x15 => "Digit4",
            0x17 => "Digit5", 0x16 => "Digit6", 0x1A => "Digit7", 0x1C => "Digit8", 0x19 => "Digit9",
            0x00 => "KeyA", 0x0B => "KeyB", 0x08 => "KeyC", 0x02 => "KeyD", 0x0E => "KeyE",
            0x03 => "KeyF", 0x05 => "KeyG", 0x04 => "KeyH", 0x22 => "KeyI", 0x26 => "KeyJ",
            0x28 => "KeyK", 0x25 => "KeyL", 0x2E => "KeyM", 0x2D => "KeyN", 0x1F => "KeyO",
            0x23 => "KeyP", 0x0C => "KeyQ", 0x0F => "KeyR", 0x01 => "KeyS", 0x11 => "KeyT",
            0x20 => "KeyU", 0x09 => "KeyV", 0x0D => "KeyW", 0x07 => "KeyX", 0x10 => "KeyY",
            0x06 => "KeyZ",
            _ => return None,
        })
    }
}
