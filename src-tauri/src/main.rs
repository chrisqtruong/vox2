// No console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod hotkey;
mod overlay;
mod secrets;
mod tts;

use std::{fs, path::PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

// Settings and history live as small JSON files in the per-user app config folder.
fn data_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("invalid key: {key}"));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{key}.json")))
}

#[tauri::command]
fn load_data(app: AppHandle, key: String) -> Result<Option<String>, String> {
    Ok(fs::read_to_string(data_path(&app, &key)?).ok())
}

#[tauri::command]
fn save_data(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let path = data_path(&app, &key)?;
    // Write then rename, so a crash mid-save never leaves a half-written file.
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, value).map_err(|e| e.to_string())?;
    fs::rename(tmp, path).map_err(|e| e.to_string())
}

// Total and currently available memory in MB, so the page can decide how long to keep
// the voice model loaded (shorter on smaller machines, released early when memory runs low).
#[tauri::command]
fn memory_info() -> (u64, u64) {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    (sys.total_memory() / 1_048_576, sys.available_memory() / 1_048_576)
}

// Types dictated text into whichever app has focus.
#[tauri::command]
async fn type_text(text: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.text(&text).map_err(|e| e.to_string())
}

// A small transparent, click-through, always-on-top window at the bottom-center of the
// screen for the dictation pill. It's created the first time you dictate (it's a second
// web view, ~70 MB) and then stays open, drawing nothing when idle, so showing the pill
// never has to activate a window and steal focus from the app you're typing in.
#[tauri::command]
async fn ensure_pill(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("pill").is_some() {
        return Ok(());
    }
    create_pill(&app).map_err(|e| e.to_string())
}

fn create_pill(app: &AppHandle) -> tauri::Result<()> {
    const W: f64 = 240.0;
    const H: f64 = 64.0;
    let pill = WebviewWindowBuilder::new(app, "pill", WebviewUrl::App("pill.html".into()))
        .title("Vox2 dictation")
        .inner_size(W, H)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false) // shown below without activating it
        .build()?;
    pill.set_ignore_cursor_events(true)?;
    #[cfg(windows)]
    make_overlay(&pill);
    #[cfg(not(windows))]
    pill.show()?;
    if let Some(monitor) = pill.primary_monitor()? {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let (w, h) = ((W * scale) as i32, (H * scale) as i32);
        let x = area.position.x + (area.size.width as i32 - w) / 2;
        let y = area.position.y + area.size.height as i32 - h - (16.0 * scale) as i32;
        pill.set_position(PhysicalPosition::new(x, y))?;
    }
    Ok(())
}

// The window only gets a small (title-bar) icon by default. The taskbar uses the large one
// and shows a blank page without it, so hand it the exe's own icon.
#[cfg(windows)]
fn set_taskbar_icon(win: &tauri::WebviewWindow) {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ExtractIconExW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{SendMessageW, HICON, ICON_BIG, WM_SETICON};
    let (Ok(hwnd), Ok(exe)) = (win.hwnd(), std::env::current_exe()) else { return };
    let path: Vec<u16> = exe.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut large: HICON = std::ptr::null_mut();
    unsafe {
        if ExtractIconExW(path.as_ptr(), 0, &mut large, std::ptr::null_mut(), 1) > 0 && !large.is_null() {
            SendMessageW(hwnd.0 as _, WM_SETICON, ICON_BIG as usize, large as isize);
        }
    }
}

// skip_taskbar alone doesn't stick for this window on Windows: it showed up on the taskbar
// (grouped with the main window, blanking its icon) and in Alt+Tab. A tool window that can't
// be activated is what an overlay should be: no taskbar button, never steals focus.
#[cfg(windows)]
fn make_overlay(win: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, ShowWindow, GWL_EXSTYLE, SW_HIDE, SW_SHOWNOACTIVATE,
        WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    };
    let Ok(hwnd) = win.hwnd() else { return };
    let h = hwnd.0 as _;
    unsafe {
        let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
        let ex = (ex & !(WS_EX_APPWINDOW as isize)) | (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE) as isize;
        // The taskbar only re-reads the style when the window is shown again.
        ShowWindow(h, SW_HIDE);
        SetWindowLongPtrW(h, GWL_EXSTYLE, ex);
        ShowWindow(h, SW_SHOWNOACTIVATE);
    }
}

// Closing the window hides it to the tray (when that setting is on) instead of quitting.
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

#[tauri::command]
fn set_close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

/// See-through window: alpha 255 = solid. Used to fade the pinned window while you work elsewhere.
#[tauri::command]
fn set_window_alpha(window: tauri::WebviewWindow, alpha: u8) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA, WS_EX_LAYERED,
        };
        let Ok(hwnd) = window.hwnd() else { return };
        let h = hwnd.0 as _;
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            if ex & WS_EX_LAYERED as isize == 0 {
                SetWindowLongPtrW(h, GWL_EXSTYLE, ex | WS_EX_LAYERED as isize);
            }
            SetLayeredWindowAttributes(h, 0, alpha, LWA_ALPHA);
        }
    }
    #[cfg(not(windows))]
    let _ = (window, alpha);
}

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Vox2", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Vox2", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Vox2")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => hotkey::show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                hotkey::toggle_visible(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        // Must be registered first: a second launch hands off to the running copy and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| hotkey::show_main(app)))
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["pill"]).build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--minimized"])))
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            memory_info,
            secrets::secret_get,
            secrets::secret_set,
            type_text,
            set_close_to_tray,
            set_window_alpha,
            ensure_pill,
            hotkey::set_hotkey,
            hotkey::reset_keys,
            hotkey::hide_main,
            hotkey::show_window,
            overlay::open_bubble,
            overlay::place_bubble,
            overlay::hide_bubble,
            overlay::finish_snip,
            overlay::cancel_snip,
            overlay::take_snip,
            overlay::start_snip_cmd,
            tts::tts_speak
        ])
        .setup(|app| {
            create_tray(app)?;
            if let Some(main) = app.get_webview_window("main") {
                #[cfg(windows)]
                set_taskbar_icon(&main);
                // Started with Windows: wait quietly in the tray.
                if std::env::args().any(|a| a == "--minimized") {
                    let _ = main.hide();
                } else {
                    let _ = main.set_focus();
                }
            }
            hotkey::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    // The invisible pill window would otherwise keep the app alive.
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Vox2");
}
