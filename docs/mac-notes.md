# macOS lessons (each one cost a bug)

Read this before changing or debugging anything that runs on the Mac (Mac-only code or shared code). Linked from `CLAUDE.md`.

- **Keyboard-layout APIs (TIS/TSM) only on the main thread**, or macOS kills the app (SIGTRAP in `TSMGetInputSourceProperty`). This rules out rdev on Mac and `enigo`'s `Key::Unicode` off the main thread; press keys by key code (`Key::Other(kVK_…)`) instead. `enigo.text()` is fine.
- **Keyboard watching needs Input Monitoring**; Accessibility alone only lets modifier keys through. Accessibility is for typing/copying, Screen Recording for snip.
- **macOS disables a slow event tap** and doesn't turn it back on; keep the tap callback fast and re-enable on `kCGEventTapDisabledByTimeout`.
- The Mac watcher also hears keys pressed in Vox2 itself; it steps aside while the main window is focused (the page handles those).
- **WebKit doesn't run animation frames in hidden windows**, and garbles the mic in a 16 kHz AudioContext.
- **Cursor positions come in points; windows are placed in physical pixels** (×2 on Retina).
- **Permissions are tied to the app's signature.** Mac builds are signed with Vox2's own certificate so permissions survive updates. Never change the signing certificate/identity. Stale entries: `tccutil reset All com.chris.translator`.
- Hardened runtime stays off (no notarization; it would block the mic without entitlements).
- **WebKit says only "TypeError: Load failed"** for any rejected cross-origin response, including a plain HTTP error without CORS headers. When a request fails only on Mac, check the real status natively (it was Google's 429 on `translate_a/single`, which throttles Vox2 on Mac; that's why Mac back-translation uses `translate_a/t` and fetches pronunciation natively via `google.rs`). Google also 429'd a plain Rust TLS client (native-tls) but answers Apple's Foundation networking, so `google.rs` uses `NSData::dataWithContentsOfURL`.
- **xcap works in points on macOS** (`Monitor::from_point`, `x()`/`y()`), while its captured image is in pixels. Convert before looking up a screen (see `finish_snip`).
- **An inactive Mac window ignores the first click** unless it accepts it: `acceptFirstMouse` in `tauri.conf.json`, `.accept_first_mouse(true)` on built windows.
- **A window losing focus to another window of the same app doesn't reliably fire `blur` in WebKit**; don't rely on the bubble's blur alone to dismiss it.
- **Debugging the installed Mac app:** release builds have no web inspector. Write diagnostics with `saveData('debug', …)` (lands in `~/Library/Application Support/com.chris.translator/debug.json`) in a throwaway branch build, then remove them.
