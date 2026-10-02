// macOS asks for each permission on its own, and Accessibility and Screen Recording can only be
// switched on in System Settings. These let the permissions sheet show them all in one place,
// with a button for each. Off macOS there's nothing to set up: `permissions` returns None.

use serde::Serialize;

#[derive(Serialize)]
pub struct Permissions {
    input: bool,              // Input Monitoring: hearing shortcuts pressed in other apps
    accessibility: bool,      // typing dictation, grabbing selected text
    screen: bool,             // snip & translate
    microphone: &'static str, // "granted", "denied", or "ask" (not asked yet)
}

#[tauri::command]
pub fn permissions() -> Option<Permissions> {
    #[cfg(target_os = "macos")]
    return Some(mac::check());
    #[cfg(not(target_os = "macos"))]
    None
}

/// Show macOS's own prompt for one permission. Accessibility and Screen Recording also add
/// Vox2 to their list in System Settings, switched off, ready to switch on.
#[tauri::command]
pub fn request_permission(name: String) {
    #[cfg(target_os = "macos")]
    mac::request(&name);
    #[cfg(not(target_os = "macos"))]
    let _ = name;
}

/// Open the page of System Settings where that permission is switched on.
#[tauri::command]
pub fn open_privacy(name: String) {
    #[cfg(target_os = "macos")]
    mac::open_settings(&name);
    #[cfg(not(target_os = "macos"))]
    let _ = name;
}

/// Whether macOS lets Vox2 hear keys pressed in other apps (Input Monitoring).
#[cfg(target_os = "macos")]
pub fn keyboard_allowed() -> bool {
    mac::check().input
}

#[cfg(target_os = "macos")]
mod mac {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::{CFString, CFStringRef};
    use objc2::msg_send;
    use objc2::runtime::AnyClass;
    use objc2_foundation::NSString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
        static kAXTrustedCheckOptionPrompt: CFStringRef;
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
    }

    // For AVCaptureDevice, looked up by name below.
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}

    pub fn check() -> super::Permissions {
        super::Permissions {
            input: unsafe { CGPreflightListenEventAccess() },
            accessibility: unsafe { AXIsProcessTrusted() },
            screen: unsafe { CGPreflightScreenCaptureAccess() },
            microphone: match mic_status() {
                3 => "granted",
                1 | 2 => "denied",
                _ => "ask",
            },
        }
    }

    // AVAuthorizationStatus: 0 not asked yet, 1 restricted, 2 denied, 3 allowed.
    fn mic_status() -> isize {
        let Some(device) = AnyClass::get(c"AVCaptureDevice") else { return 0 };
        let audio = NSString::from_str("soun"); // AVMediaTypeAudio
        unsafe { msg_send![device, authorizationStatusForMediaType: &*audio] }
    }

    pub fn request(name: &str) {
        match name {
            "accessibility" => {
                let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
                let options = CFDictionary::from_CFType_pairs(&[(key, CFBoolean::true_value())]);
                unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) };
            }
            "screen" => {
                unsafe { CGRequestScreenCaptureAccess() };
            }
            "input" => {
                unsafe { CGRequestListenEventAccess() };
            }
            // The microphone prompt comes from the page asking for the mic.
            _ => {}
        }
    }

    pub fn open_settings(name: &str) {
        let pane = match name {
            "accessibility" => "Privacy_Accessibility",
            "screen" => "Privacy_ScreenCapture",
            "input" => "Privacy_ListenEvent",
            "microphone" => "Privacy_Microphone",
            _ => return,
        };
        let _ = std::process::Command::new("open")
            .arg(format!("x-apple.systempreferences:com.apple.preference.security?{pane}"))
            .spawn();
    }
}
