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
| Global keyboard watcher | `rdev 0.5` in `hotkey.rs` (watches only) | own CGEventTap, `mod mac` in `hotkey.rs`: holds back a shortcut's key from the app in front (needs Accessibility; falls back to watching only) |
| Permissions screen | not shown | `permissions.rs` + the permissions sheet in `app.js` |
| Window fade (`set_window_alpha`) | layered window alpha | NSWindow `alphaValue` |
| Overlays (`overlay.rs`) | tool windows, cursor in pixels | cursor converted from points (`cursor_px`) |
| Snip text reading | Tesseract (`ocr.js`) | Apple Vision (`ocr.rs`), Tesseract as fallback |
| Dictation audio (`dictation.js`) | 16 kHz AudioContext | native-rate context, resampled to 16 kHz |
| Bubble placement (`bubble.html`) | `requestAnimationFrame` | measured immediately |
| Taskbar/tray icon tweaks | `main.rs` (Windows API) | — |

## macOS lessons

Before changing or debugging anything that runs on the Mac (Mac-only or shared code), read `docs/mac-notes.md`: hard-won rules about threads, permissions, signing, WebKit and screen coordinates. Never change the Mac signing certificate or identity.

## Checks

- Every push to `main` and every PR runs **Windows check** (`cargo check --release --locked` on Windows).
- The **Mac build** runs on demand: `gh workflow run build -R chrisqtruong/vox2 --ref <branch>`; the signed `.dmg` is the run's `Vox2-macOS` artifact. Run it for any change that touches Mac code or shared code.
- Keep `Cargo.lock` in sync (CI uses `--locked`). Platform-gated code compiles on only one platform, so a Mac-only `cargo check` doesn't prove Windows builds (and vice versa); rely on CI for the other platform.
- Before merging into `main`: Windows check green, and a green Mac build if Mac or shared code changed.
- Possible next step (not done yet, on hold): run the Mac build on every PR too and require both checks before merging (branch protection).

## Shared-code gotchas

- **Meaning check changes (`meaning.js`, `meaning-checks.js`, `checkBack`) must be measured** with `tools/meaning-bench/` (its README says which tool for what; word-check-only changes can be re-scored offline in seconds) and get a dated report + history row in `docs/meaning-check-tests/`. Also score them on the high-stakes sets (`items-hs1.json`, `items-hs2.json`, `analyze_hs.py`): medical/legal text with planted critical errors, where the goal is 95%+ caught. Once a sealed set's misses have been read, it's no longer clean: confirm on a new set. Tune only on the development split (`dev`); report the held-out split (`test`). When the held-out set has been used to choose between versions, say so, and draw a fresh held-out set next time.
- **Google sometimes answers in the wrong language** (whole batches of "back into English" in Japanese, 2026-10-03). The bench retries non-English back-translations; check the run log before trusting results.
- **Tesseract OCR (`ocr.js`; Windows, and the Mac fallback) must prepare snips first**: enlarge, grayscale, invert light-on-dark, stretch contrast, PSM 6, then fix lone `|` → `I`. Raw screen captures (small, dark themes) garble words. Test changes against several themes and both 1× and 2× captures.
- `quick.active` (a Right ⌘ tap / Ctrl+Alt+T or snip session) routes translations to the bubble. Anything that moves work back into the main window must end it: typing, dictating, and focusing the window do. A bubble you've dragged (`quick.pinned`) stays on screen when that happens, and `place_bubble` only resizes it in place (`keep`).
- Esc reaches the page two ways: the page's own keydown while Vox2 is in front, and the `escape` event from the native keyboard watcher otherwise (`stopAudio()` handles both).

## Workflow

- Branch per change, PR into `main`, merge when checks pass. Commit/push/merge only when Chris asks.
- Record user-visible changes in `CHANGELOG.md` under "Unreleased" (with *Windows and Mac* / *Mac* / *Windows*). The release workflow turns that section into the release notes and the in-app update note.
- Chris works on both a Mac and a Windows PC; GitHub is the meeting point. `git pull` before starting.
- **Several Claude sessions may work on the repo at once.** Before editing shared docs (README roadmap, `docs/meaning-check-tests/README.md`, CHANGELOG), pull `main` and check open PRs (`gh pr list`) for the same file; keep doc PRs small and merge them soon, so the next one doesn't have to be redone.
- **Each fact lives in one place.** Meaning-check numbers and status live on `docs/meaning-check-tests/README.md` (and each dated report); the README and roadmap link there instead of repeating numbers. Release steps live here and in `.github/workflows/release.yml`.
- Testing a Mac build: download the artifact, swap it into `/Applications` (old copy to the Trash), open it. Testing Windows needs his PC.

## Releases (don't break Windows updates)

- **Two ways to release.**
  - **From anywhere (Mac, phone):** Actions → **release** → Run workflow, type the new version (e.g. `0.4.19`), untick "Test run" (or `gh workflow run release.yml -f version=0.4.19 -f test_run=false`). It bumps the version in `src-tauri/tauri.conf.json`, `Cargo.toml` and `Cargo.lock`, turns CHANGELOG.md's "## Unreleased" into `## <version> (<date>)` and commits that to `main`, then builds Windows and Mac on GitHub, makes a draft with all the files and one `latest.json`, checks it, and only then publishes it as latest. It refuses if "Unreleased" is empty or the version already exists. Left without a version, it releases the version already in the files (which then needs its own changelog section). "Test run" makes an unpublished draft under a `v<ver>-test-<n>` tag, with any version bump on a temporary branch, never `main`; delete the draft after looking. Never publish a test draft.
  - **From Chris's PC:** first bump the version in those three files and date the changelog on `main` by hand. Then: Windows installer + `latest.json`, signed with the updater key. When that release is published, `build.yml` builds the Mac app for the tag, attaches `Vox2-mac.dmg` and the updater archive, and **adds** `darwin-aarch64` entries to that release's `latest.json`.
- Both produce the same files: `Vox2-setup.exe`, `Vox2_<ver>_x64-setup.exe`, `Vox2-mac.dmg`, `Vox2_<ver>_aarch64.dmg`, `Vox2_<ver>_aarch64.app.tar.gz`, `latest.json` (windows-x86_64-nsis, windows-x86_64, darwin-aarch64, darwin-aarch64-app).
- The app's updater reads `releases/latest/download/latest.json`. **Never create a separate Mac release or let anything but a full release (Windows + Mac) become "latest"**, and never remove or change the Windows entries in `latest.json`.
- Repo secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (Mac signing), `TAURI_SIGNING_PRIVATE_KEY` (updates). Never print or commit them.
