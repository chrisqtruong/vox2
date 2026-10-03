# Vox2 — notes for Claude

Vox2 is a small desktop translator: Tauri 2 (Rust in `src-tauri/`) hosting a plain HTML/CSS/JS UI (`resources/`, no framework or build step). It ships for **Windows** (the original, used daily) and **macOS** (beta, Apple Silicon). One codebase, one `main` branch; there are no per-platform branches.

Chris owns the project. He's a designer, not a developer: explain changes in plain language and say what each one means for the app.

## Which platform are we working on?

Chris will usually say "Mac only", "Windows only" or "both". If he doesn't and the change could behave differently per platform, ask.

- **Mac only / Windows only:** keep the change inside that platform's fences (below). Never change the other platform's behavior as a side effect. If a change has to touch shared code, say so before making it.
- **Both:** make it work on both, and check both (see Checks).
- Shared defaults that differ per platform (shortcuts, labels) already branch on the platform; keep it that way.

### Where the fences are

Rust: `#[cfg(target_os = "macos")]` / `#[cfg(windows)]` / `#[cfg(not(target_os = "macos"))]`. Platform-only crates go under `[target.'cfg(...)'.dependencies]` in `Cargo.toml`.
JS: `MAC` / `IS_MAC` (from `navigator.platform`), and `getPermissions()` returns `null` on Windows.

| Area | Windows | macOS |
|---|---|---|
| Global keyboard watcher | `rdev 0.5` in `hotkey.rs` | own listen-only CGEventTap, `mod mac` in `hotkey.rs` |
| Permissions screen | not shown | `permissions.rs` + the permissions sheet in `app.js` |
| Window fade (`set_window_alpha`) | layered window alpha | NSWindow `alphaValue` |
| Overlays (`overlay.rs`) | tool windows, cursor in pixels | cursor converted from points (`cursor_px`) |
| Dictation audio (`dictation.js`) | 16 kHz AudioContext | native-rate context, resampled to 16 kHz |
| Bubble placement (`bubble.html`) | `requestAnimationFrame` | measured immediately |
| Taskbar/tray icon tweaks | `main.rs` (Windows API) | — |

## macOS lessons (each one cost a bug)

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

## Checks

- Every push to `main` and every PR runs **Windows check** (`cargo check --release --locked` on Windows).
- The **Mac build** runs on demand: `gh workflow run build -R chrisqtruong/vox2 --ref <branch>`; the signed `.dmg` is the run's `Vox2-macOS` artifact. Run it for any change that touches Mac code or shared code.
- Keep `Cargo.lock` in sync (CI uses `--locked`). Platform-gated code compiles on only one platform, so a Mac-only `cargo check` doesn't prove Windows builds (and vice versa); rely on CI for the other platform.
- Before merging into `main`: Windows check green, and a green Mac build if Mac or shared code changed.
- Possible next step (not done yet, on hold): run the Mac build on every PR too and require both checks before merging (branch protection).

## Shared-code gotchas

- **Meaning check changes (`meaning.js`, `checkBack`) must be measured**: re-run `tools/meaning-bench/` and add a dated report + history row in `docs/meaning-check-tests/` (keep `items.json` fixed so runs compare).
- **OCR (`ocr.js`) must prepare snips before Tesseract**: enlarge, grayscale, invert light-on-dark, stretch contrast, PSM 6, then fix lone `|` → `I`. Raw screen captures (small, dark themes) garble words. Test changes against several themes and both 1× and 2× captures.
- `quick.active` (a ⌥⌘T / Ctrl+Alt+T or snip session) routes translations to the bubble. Anything that moves work back into the main window must end it: typing, dictating, and focusing the window do.
- Esc reaches the page two ways: the page's own keydown while Vox2 is in front, and the `escape` event from the native keyboard watcher otherwise (`stopAudio()` handles both).

## Workflow

- Branch per change, PR into `main`, merge when checks pass. Commit/push/merge only when Chris asks.
- Record user-visible changes in `CHANGELOG.md` under "Unreleased" (with *Windows and Mac* / *Mac* / *Windows*); Chris copies it into the release notes when he publishes, then it becomes that version's section.
- Chris works on both a Mac and a Windows PC; GitHub is the meeting point. `git pull` before starting.
- Testing a Mac build: download the artifact, swap it into `/Applications` (old copy to the Trash), open it. Testing Windows needs his PC.

## Releases (don't break Windows updates)

- Releases are published from Chris's **PC**: Windows installer + `latest.json`, signed with the updater key that lives only there.
- When a release is published, the workflow builds the Mac app for that tag, attaches `Vox2-mac.dmg` and the updater archive, and **adds** `darwin-aarch64` entries to that release's `latest.json`.
- The app's updater reads `releases/latest/download/latest.json`. **Never create a separate Mac release or let anything but a full PC release become "latest"**, and never remove or change the Windows entries in `latest.json`.
- Repo secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (Mac signing), `TAURI_SIGNING_PRIVATE_KEY` (updates). Never print or commit them.
