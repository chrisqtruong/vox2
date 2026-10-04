// The two floating helper windows, both created the first time they're needed:
//   bubble – a small card next to the cursor showing a quick translation
//   snip   – a full-screen overlay where you drag a box around text on screen;
//            the boxed area is captured as an image for the page to read (OCR)

use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::{
    ipc::Response, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

const BUBBLE_W: f64 = 360.0;

// Where the bubble should appear (physical screen pixels), set when a quick translation starts.
static ANCHOR: LazyLock<Mutex<(i32, i32)>> = LazyLock::new(|| Mutex::new((0, 0)));
// The last snip, as PNG bytes, waiting for the page to collect it.
static SNIP: LazyLock<Mutex<Vec<u8>>> = LazyLock::new(|| Mutex::new(Vec::new()));

pub fn cursor() -> (i32, i32) {
    use enigo::{Enigo, Mouse, Settings};
    Enigo::new(&Settings::default()).ok().and_then(|e| e.location().ok()).unwrap_or((200, 200))
}

/// The cursor in physical screen pixels, like monitor and window positions. On macOS the cursor
/// comes in points (half the pixels on a Retina screen), so scale it by the screen it's on.
fn cursor_px(app: &AppHandle) -> (i32, i32) {
    let (cx, cy) = cursor();
    #[cfg(target_os = "macos")]
    {
        let (px, py) = (cx as f64, cy as f64);
        for m in app.available_monitors().unwrap_or_default() {
            let s = m.scale_factor();
            let (pos, size) = (m.position(), m.size());
            let (left, top) = (pos.x as f64 / s, pos.y as f64 / s);
            let (w, h) = (size.width as f64 / s, size.height as f64 / s);
            if px >= left && px < left + w && py >= top && py < top + h {
                return (pos.x + ((px - left) * s) as i32, pos.y + ((py - top) * s) as i32);
            }
        }
        let s = app.primary_monitor().ok().flatten().map_or(1.0, |m| m.scale_factor());
        ((px * s) as i32, (py * s) as i32)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        (cx, cy)
    }
}

fn monitor_at(app: &AppHandle, x: i32, y: i32) -> Option<tauri::Monitor> {
    app.monitor_from_point(x as f64, y as f64).ok().flatten().or_else(|| app.primary_monitor().ok().flatten())
}

/* ---------- bubble ---------- */

fn bubble(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window("bubble") {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, "bubble", WebviewUrl::App("bubble.html".into()))
        .title("Vox2 quick translate")
        .inner_size(BUBBLE_W, 160.0)
        .accept_first_mouse(true) // macOS: a click while another app is in front still presses the button
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .inspect(tool_window)
}

/// Start a quick translation bubble at the cursor (or at an explicit point, e.g. under a snip).
#[tauri::command]
pub async fn open_bubble(app: AppHandle, x: Option<i32>, y: Option<i32>) -> Result<(), String> {
    *ANCHOR.lock().unwrap() = match (x, y) {
        (Some(x), Some(y)) => (x, y),
        _ => cursor_px(&app),
    };
    bubble(&app).map(|_| ()).map_err(|e| e.to_string())
}

/// The bubble measured its content: size it, place it beside the anchor (kept on screen), show it.
#[tauri::command]
pub fn place_bubble(app: AppHandle, height: f64) -> Result<(), String> {
    let win = app.get_webview_window("bubble").ok_or("no bubble")?;
    let (ax, ay) = *ANCHOR.lock().unwrap();
    let monitor = monitor_at(&app, ax, ay).ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let (w, h) = ((BUBBLE_W * scale) as i32, (height * scale) as i32);
    let area = monitor.work_area();
    let (left, top) = (area.position.x, area.position.y);
    let (right, bottom) = (left + area.size.width as i32, top + area.size.height as i32);
    let gap = (14.0 * scale) as i32;
    let mut x = ax + gap;
    let mut y = ay + gap;
    if x + w > right {
        x = (ax - gap - w).max(left);
    }
    if y + h > bottom {
        y = (ay - gap - h).max(top);
    }
    win.set_size(PhysicalSize::new(w as u32, h as u32)).map_err(|e| e.to_string())?;
    win.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    win.show().map_err(|e| e.to_string())?;
    win.set_focus().map_err(|e| e.to_string())?;
    // macOS: focusing the bubble activates Vox2, and activation finishes a moment later by making
    // the window that last had the keyboard key again: the main window, if it's open. Focus the
    // bubble once more after that, so the keyboard (Tab, ⌘L…) lands in the bubble.
    #[cfg(target_os = "macos")]
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        if win.is_visible().unwrap_or(false) {
            let _ = win.set_focus();
        }
    });
    Ok(())
}

#[tauri::command]
pub fn hide_bubble(app: AppHandle) {
    if let Some(w) = app.get_webview_window("bubble") {
        let _ = w.hide();
    }
}

/* ---------- snip ---------- */

/// Cover the screen under the cursor with the snip overlay.
pub fn start_snip(app: &AppHandle) {
    let (cx, cy) = cursor_px(app);
    let Some(monitor) = monitor_at(app, cx, cy) else { return };
    let (pos, size) = (*monitor.position(), *monitor.size());
    let win = match app.get_webview_window("snip") {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(app, "snip", WebviewUrl::App("snip.html".into()))
            .title("Vox2 snip")
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .build()
        {
            Ok(w) => {
                tool_window(&w);
                w
            }
            Err(_) => return,
        },
    };
    let _ = win.set_position(pos);
    let _ = win.set_size(size);
    let _ = win.emit_to("snip", "snip-reset", ());
    let _ = win.show();
    let _ = win.set_focus();
}

/// The user boxed an area (CSS pixels within the overlay). Hide the overlay, capture that area of
/// the screen, keep it as a PNG for the page, and tell the main window where it was.
#[tauri::command]
pub async fn finish_snip(app: AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let win = app.get_webview_window("snip").ok_or("no snip window")?;
    let origin = win.outer_position().map_err(|e| e.to_string())?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let _ = win.hide();
    std::thread::sleep(Duration::from_millis(120)); // let the overlay disappear before capturing
    let (px, py) = (origin.x + (x * scale) as i32, origin.y + (y * scale) as i32);
    #[cfg_attr(target_os = "macos", allow(unused_variables))] // macOS sizes the crop itself, below
    let (pw, ph) = ((w * scale).max(1.0) as u32, (h * scale).max(1.0) as u32);

    // On macOS, xcap finds and places screens in points, while the image it captures is in
    // pixels (2× on Retina): find the screen by the box's position in points, then crop in pixels.
    #[cfg(target_os = "macos")]
    let (gx, gy) = (origin.x as f64 / scale + x, origin.y as f64 / scale + y);

    let png = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
        #[cfg(target_os = "macos")]
        let (monitor, cx, cy, pw, ph) = {
            let monitor = xcap::Monitor::from_point(gx as i32, gy as i32).map_err(|e| e.to_string())?;
            let s = monitor.scale_factor().map_err(|e| e.to_string())? as f64;
            let (mx, my) = (monitor.x().map_err(|e| e.to_string())?, monitor.y().map_err(|e| e.to_string())?);
            let (cx, cy) = (((gx - mx as f64) * s).max(0.0) as u32, ((gy - my as f64) * s).max(0.0) as u32);
            (monitor, cx, cy, (w * s).max(1.0) as u32, (h * s).max(1.0) as u32)
        };
        #[cfg(not(target_os = "macos"))]
        let (monitor, cx, cy) = {
            let monitor = xcap::Monitor::from_point(px, py).map_err(|e| e.to_string())?;
            let (mx, my) = (monitor.x().map_err(|e| e.to_string())?, monitor.y().map_err(|e| e.to_string())?);
            (monitor, (px - mx).max(0) as u32, (py - my).max(0) as u32)
        };
        let shot = monitor.capture_image().map_err(|e| e.to_string())?;
        let cw = pw.min(shot.width().saturating_sub(cx));
        let ch = ph.min(shot.height().saturating_sub(cy));
        let crop = image::imageops::crop_imm(&shot, cx, cy, cw, ch).to_image();
        let mut out = std::io::Cursor::new(Vec::new());
        crop.write_to(&mut out, image::ImageFormat::Png).map_err(|e| e.to_string())?;
        Ok(out.into_inner())
    })
    .await
    .map_err(|e| e.to_string())??;

    *SNIP.lock().unwrap() = png;
    // Bubble goes just under the boxed area.
    let _ = app.emit_to("main", "snip", serde_json::json!({ "x": px, "y": py + ph as i32 }));
    Ok(())
}

#[tauri::command]
pub fn cancel_snip(app: AppHandle) {
    if let Some(w) = app.get_webview_window("snip") {
        let _ = w.hide();
    }
}

/// A copy of the captured image, for reading it natively (ocr.rs); the page can still take it after.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn snip_png() -> Vec<u8> {
    SNIP.lock().unwrap().clone()
}

/// The page collects the captured image to read its text.
#[tauri::command]
pub fn take_snip() -> Response {
    Response::new(std::mem::take(&mut *SNIP.lock().unwrap()))
}

// Keep these helper windows off the taskbar and out of Alt+Tab (skip_taskbar alone doesn't
// stick on Windows). Applied while still hidden, so the first show picks it up.
pub fn tool_window(win: &WebviewWindow) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
        };
        let Ok(hwnd) = win.hwnd() else { return };
        unsafe {
            let ex = GetWindowLongPtrW(hwnd.0 as _, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd.0 as _, GWL_EXSTYLE, (ex & !(WS_EX_APPWINDOW as isize)) | WS_EX_TOOLWINDOW as isize);
        }
    }
    #[cfg(not(windows))]
    let _ = win;
}

/// The snip button in the main window.
#[tauri::command]
pub async fn start_snip_cmd(app: AppHandle) {
    start_snip(&app);
}
