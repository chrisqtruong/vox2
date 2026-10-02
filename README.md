<p align="center"><img src="docs/icon.png" width="72" alt=""></p>

<h1 align="center">Vox2</h1>

<p align="center">A tiny two-way translator for your desktop.<br>
Type, paste, speak or snip text in any app and read it, or hear it, in another language.</p>

<p align="center"><a href="https://github.com/chrisqtruong/vox2/releases/latest/download/Vox2-setup.exe"><b>Download for Windows</b></a> · <a href="https://chrisqtruong.github.io/vox2">Website</a> · <a href="https://github.com/chrisqtruong/vox2/releases">Releases</a></p>

<p align="center">
  <img src="docs/screenshot-dark.jpg" width="320" alt="English to Japanese with romaji and back-translation">
  <img src="docs/screenshot-light.jpg" width="320" alt="English to Vietnamese">
</p>

## What it does

- **Live, both ways.** Type in either box and the other translates as you go. New words show grey until the engine settles.
- **From any app.** Select text anywhere and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd>; the translation appears in a bubble by your cursor.
- **Snip & translate.** <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>, draw a box around text on screen (images, subtitles, apps that block copying), read it in your language.
- **Dictation.** Tap or hold <kbd>Right Ctrl</kbd> and talk. Transcribed on your machine; optionally typed into the app you're using, as said or translated.
- **Read aloud.** Natural male and female voices in about 75 languages.
- **Conversation mode.** Two people take turns; each phrase is translated and spoken to the other.
- **Engines.** Google Translate (free), or Claude, ChatGPT or Gemini with your own key, with a tone setting and a "who it's for" note so pronouns come out right.
- Detect language, pinned languages, pronunciation for non-Latin scripts, back-translation, 30-item history, always on top, 37 themes, self-updates.

## Shortcuts

| Keys | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> | show / hide Vox2, ready to type |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> | translate the selected text in any app |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> | snip an area of the screen and translate it |
| <kbd>Right Ctrl</kbd> | dictate (tap, or hold to talk) |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | pin on top (while Vox2 is in front) |

All configurable in settings.

## Install

1. Download `Vox2-setup.exe` from the [latest release](https://github.com/chrisqtruong/vox2/releases/latest) and run it. It installs per user, no admin needed.
2. The installer isn't code-signed, so Windows shows "unknown publisher". Choose **More info → Run anyway**.
3. Vox2 updates itself from GitHub releases (signed updates). Switch to "ask me" or off in settings → window.

Windows 10/11, 64-bit. macOS can be built from the same code; not published yet.

## How it works

| Part | Tech |
|---|---|
| Shell | [Tauri 2](https://tauri.app): a ~5 MB Rust binary hosting the UI in the system web view (WebView2), no bundled browser |
| UI | plain HTML/CSS/JS in `resources/`, no framework or build step |
| Global shortcuts, typing into other apps, selection grab | Rust: `rdev` keyboard hook, `enigo` simulated input, `arboard` clipboard |
| Speech to text | Whisper (tiny/base/small) running locally via [transformers.js](https://huggingface.co/docs/transformers.js) + ONNX Runtime, WebGPU when available; released from memory when idle |
| Screen text | `xcap` capture + [Tesseract.js](https://tesseract.projectnaptha.com) OCR, local |
| Voices | Microsoft neural voices (Edge Read Aloud protocol, `tts.rs`), OpenAI, or system voices |
| Translation | Google Translate web endpoint, or the Anthropic / OpenAI / Gemini APIs, called directly |
| Updates | `tauri-plugin-updater`, minisign-signed, served from GitHub releases |

## Privacy

- No account, no server, no analytics.
- Text goes only to the engine you choose. Voice and screen snips are processed locally.
- Settings, history and API keys are stored in your user profile (keys unencrypted).
- The free Google Translate and Microsoft voice services are unofficial endpoints and may break; the API engines are the official route.

## Build

```
cargo install tauri-cli --version "^2" --locked
cargo tauri build            # installer in src-tauri/target/release/bundle/nsis/
```

Needs Rust and, on Windows, the Visual Studio C++ build tools (on macOS, Xcode command-line tools). Release builds that publish updates also need the updater signing key in `TAURI_SIGNING_PRIVATE_KEY`.

Layout: `resources/` is the UI (`app.js` wires everything; `engines.js`, `dictation.js`, `tts.js`, `ocr.js`, `langpicker.js` are the pieces). `src-tauri/src/` is the native side (`main.rs`, `hotkey.rs`, `overlay.rs`, `tts.rs`).

## License

[GPL-3.0](LICENSE). Color themes are from [Monkeytype](https://github.com/monkeytypegame/monkeytype) (GPL-3.0). Fonts: Roboto Mono and Lexend Deca (SIL Open Font License).
