<p align="center"><img src="docs/icon.png" width="72" alt=""></p>

<h1 align="center">Vox2</h1>

<p align="center">A tiny two-way translator for your desktop.<br>
Type, paste, speak or snip text in any app and read it, or hear it, in another language.</p>

<p align="center"><a href="https://github.com/chrisqtruong/vox2/releases/latest/download/Vox2-setup.exe"><b>Download for Windows</b></a> · <a href="https://github.com/chrisqtruong/vox2/releases/latest/download/Vox2-mac.dmg"><b>Download for macOS</b></a> (beta) · <a href="https://chrisqtruong.github.io/vox2">Website</a> · <a href="https://github.com/chrisqtruong/vox2/releases">Releases</a></p>

<p align="center">
  <img src="docs/screenshot-dark.jpg" width="320" alt="English to Japanese with romaji, and a reworded back-translation that still scores 100% match">
  <img src="docs/screenshot-light.jpg" width="320" alt="English to Vietnamese with a back-translation scored 100% match">
</p>

## Contents

- [What it does](#what-it-does)
- [Shortcuts](#shortcuts)
- [Install](#install): [Windows](#windows) · [macOS](#macos-beta)
- [macOS notes](#macos-notes)
- [Back-translation fidelity scoring](#back-translation-fidelity-scoring)
- [How it works](#how-it-works)
- [Privacy](#privacy)
- [Roadmap](#roadmap)
- [Build](#build)
- [License](#license)

## What it does

- **Live, both ways.** Type in either box and the other translates as you go. New words show grey until the engine settles.
- **From any app.** Select text anywhere and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> (Mac: <kbd>⌥</kbd><kbd>⌘</kbd><kbd>T</kbd>); the translation appears in a bubble by your cursor.
- **Snip & translate.** <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> (Mac: <kbd>⌥</kbd><kbd>⌘</kbd><kbd>S</kbd>), draw a box around text on screen (images, subtitles, apps that block copying), read it in your language.
- **Dictation.** Tap or hold <kbd>Right Ctrl</kbd> (Mac: <kbd>Right ⌥ Option</kbd>) and talk. Transcribed on your machine; optionally typed into the app you're using, as said or translated.
- **Read aloud.** Natural male and female voices in about 75 languages. Each word lights up as it is spoken; slow (0.75×), normal and fast (1.25×) speeds and a volume slider, which take effect mid-sentence.
- **Conversation mode.** Two people take turns; each phrase is translated and spoken to the other.
- **Engines.** Google Translate (free), or Claude, ChatGPT or Gemini with your own key, with a tone setting and a "who it's for" note so pronouns come out right.
- **Back-translation with a match score.** See your translation turned back into your language, with a score for how much of your meaning survived (see below).
- Detect language, pinned languages, pronunciation for non-Latin scripts, 30-item history, always on top (fades while you work elsewhere), 37 themes, self-updates.
- **Windows and Mac.** The same app on both; on Mac the shortcuts use ⌘ and ⌥, and a permissions screen walks you through what macOS asks for.

## Shortcuts

| Windows | Mac | Action |
|---|---|---|
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> | <kbd>⇧</kbd><kbd>⌘</kbd><kbd>Space</kbd> | show / hide Vox2, ready to type |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> | <kbd>⌥</kbd><kbd>⌘</kbd><kbd>T</kbd> | translate the selected text in any app |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> | <kbd>⌥</kbd><kbd>⌘</kbd><kbd>S</kbd> | snip an area of the screen and translate it |
| <kbd>Right Ctrl</kbd> | <kbd>Right ⌥ Option</kbd> | dictate: tap to start (stops when you go quiet, or tap again), or hold to talk |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | <kbd>⌘</kbd><kbd>P</kbd> | pin on top (while Vox2 is in front) |

All configurable in settings → shortcuts.

## Install

### Windows

1. Download [`Vox2-setup.exe`](https://github.com/chrisqtruong/vox2/releases/latest/download/Vox2-setup.exe) from the [latest release](https://github.com/chrisqtruong/vox2/releases/latest) and run it. It installs per user, no admin needed.
2. The installer isn't code-signed, so Windows shows "unknown publisher". Choose **More info → Run anyway**.
3. Vox2 updates itself from GitHub releases (signed updates). Switch to "ask me" or off in settings → window & updates.

Windows 10/11, 64-bit.

### macOS (beta)

1. Download [`Vox2-mac.dmg`](https://github.com/chrisqtruong/vox2/releases/latest/download/Vox2-mac.dmg), open it and drag **Vox2** into **Applications**.
2. Open Vox2. It isn't notarized by Apple yet, so the first time macOS says it can't verify the developer. Go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. You only do this once.
3. Vox2 opens a **permissions** screen listing what macOS needs you to allow. Click **allow** on each row and switch Vox2 on in the System Settings page that opens; the rows tick off as you go, and **restart now** appears where macOS needs one. You can come back to it any time from settings → permissions.
4. Vox2 updates itself from GitHub releases, like on Windows, and keeps its permissions across updates.

Apple Silicon Macs (M1 and newer). Tested on macOS 26.

## macOS notes

**Permissions.** macOS asks for each of these separately; the permissions screen shows them all in one place.

| Permission | Used for |
|---|---|
| Input Monitoring | hearing your shortcuts while you're in other apps |
| Accessibility | typing what you dictate into other apps, copying the selected text to translate it |
| Screen Recording | snip & translate (only the area you box is read, on your Mac) |
| Microphone | dictation (only shown when dictation is on) |

**Why permissions survive updates.** Mac builds are signed with Vox2's own certificate (free, self-made; not Apple-issued). macOS remembers permissions per signature, so every update counts as the same app. Unsigned builds would lose their permissions on every update.

**Shortcuts look Mac-native.** Settings shows them the way the menu bar does (⌥⌘T), and the defaults use ⌘ and ⌥ instead of Ctrl and Alt.

**If a shortcut does nothing.** Check settings → permissions. If a row stays "needed" even though Vox2 looks switched on in System Settings, an old entry is in the way: select Vox2 there, remove it with **−**, add it again with **+**, then restart Vox2. To clear every Vox2 entry at once, run this in Terminal and allow them again:

```
tccutil reset All com.chris.translator
```

**Not yet on Mac.** Intel Macs, and Apple notarization (which would remove the "Open Anyway" step).

## Back-Translation Fidelity Scoring

With **back-translation** on (settings → translation), Vox2 translates the result back into your language and shows it under the translation as a faint ↩ line, tagged with a score such as `92% match`. Hover the tag for a short key.

**What it measures.** How much of your meaning survived the round trip: your text → the translation → back into your language. Good translations often come back reworded ("Good morning" → "Good day"). Counting shared words would mark those as failures, so the score compares **meaning, not exact words**, using a sentence-embedding model.

### The method, exactly

Code: [`resources/meaning.js`](resources/meaning.js) (scoring) and [`resources/meaning-worker.js`](resources/meaning-worker.js) (model).

**Inputs.**

- **A**: the text you typed, trimmed.
- **B**: the back-translation. It always comes from Google Translate (`translate.googleapis.com`, `client=gtx`), whichever engine made the forward translation.

**1. Number formatting.** Thousands separators are removed from A and B so formatting doesn't count as a difference:
`(\d)[,.   ](?=\d{3}(?!\d))` → `$1`. For example, "1,000", "1.000" and "1 000" all become "1000".

**2. Exact-match shortcut.** Each text is normalized:

1. Unicode NFKC
2. `toLocaleLowerCase()`
3. every run of punctuation or symbols (`[\p{P}\p{S}]+`) replaced with a space
4. whitespace collapsed and trimmed

If the two results are equal, the score is **100** and the model isn't used.

**3. Meaning similarity.** A and B (after step 1, but *not* lowercased or stripped) are embedded with [`paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2):

- **Model:** 12 layers, 384 dimensions, 50+ languages, trained on paraphrase pairs.
- **Weights:** the 8-bit quantized ONNX export [`Xenova/paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2), file `onnx/model_quantized.onnx` (118 MB).
- **Runtime:** [transformers.js](https://huggingface.co/docs/transformers.js) 4.3.0 on the CPU (WebAssembly), entirely on your computer.
- **Embedding:** mean pooling over tokens, then L2 normalization.

The similarity *c* is the cosine of the two vectors (their dot product, since both have length 1).

**4. Scale to a percentage.**

```
score = round( clamp( (c − 0.55) / (0.85 − 0.55), 0, 1 ) × 100 )
```

So *c* ≤ 0.55 scores 0, *c* ≥ 0.85 scores 100, and the range between is linear. The two thresholds were chosen from the test pairs below.

**5. Number check.** All numbers are extracted from A and B (`\d+(?:[.,]\d+)?`), sorted, and compared as lists. Sentence embeddings barely react to a changed digit, but a changed number is a real error. If the lists differ, the score is capped: `score = min(score, 60)`.

### Tiers

| Score | Tier | Meaning | Color |
|---|---|---|---|
| 85–100 | high | meaning kept | theme accent |
| 65–84 | moderate | check the details | theme muted |
| below 65 | low | likely off: something dropped, added, reversed or mistranslated | theme warning |

### Test pairs

These are the measurements the thresholds came from. *c* was measured in Vox2 with the quantized model.

| A | B | *c* | Score |
|---|---|---|---|
| Where is the bathroom? | Where is the toilet? | 0.845 | 98 |
| I am sorry I was late to your wedding. | Sorry for being late to the wedding. | 0.849 | 100 |
| Good morning, how are you? | Good day, how are you? | 0.814 | 88 |
| Good morning. | Good day. | 0.775 | 75 |
| I would like a table for two by the window. | I want a table for two people. | 0.833 | 94 |
| Please send me the report by Friday. | Please send the report to me on Monday. | 0.746 | 65 |
| My grandmother makes the best pho in Houston. | My grandmother makes the best pho. | 0.707 | 52 |
| It is raining cats and dogs. | Cats and dogs are falling. | 0.635 | 28 |
| I can come to the party. | I cannot come to the party. | 0.612 | 21 |
| The meeting was moved to next week. | The meeting was cancelled. | 0.438 | 0 |
| Mẹ ơi, con nhớ mẹ nhiều lắm. | Mẹ ơi, con nhớ mẹ rất nhiều. | 0.995 | 100 |
| Mẹ ơi, con nhớ mẹ nhiều lắm. | Mẹ ơi, con đói lắm. | 0.430 | 0 |
| Turn left at the second traffic light. | Turn right at the second traffic light. | 0.937 | 100 ✗ |
| He told me she was coming. | She told me he was coming. | 0.992 | 100 ✗ |

✗ = the score misses a real error (see limits below).

### Check it yourself

The same model in Python gives the same similarities to within about ±0.01. The small gap comes from quantization: Vox2 uses 8-bit weights.

```python
# pip install sentence-transformers
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
a, b = model.encode(["Good morning, how are you?", "Good day, how are you?"], normalize_embeddings=True)
c = float(a @ b)
score = round(min(1, max(0, (c - 0.55) / 0.30)) * 100)
print(round(c, 3), score)  # ≈ 0.81, ≈ 88
```

Remember steps 1, 2 and 5 (number formatting, exact match, number cap) when comparing your results with the app's.

### Limits

- **A low score doesn't always mean a bad translation.** The mistake may have happened on the way *back* (always Google). Literal or free engines also drift more on the round trip than the AI engines (Claude, ChatGPT, Gemini).
- **Single swapped words can slip through.** Embeddings score left/right and he/she swaps as near-identical, as the ✗ rows show.
- **Idioms confuse it.** "Raining cats and dogs" vs "raining heavily" scores 54 even though the meaning matches.
- **The number is a hint, not proof.** Read the ↩ line, and use the number to spot what to look at.

### Next steps for the score

- When an AI engine is selected, optionally ask it to judge meaning preservation directly. That would catch swaps and idioms, but costs an API call.
- Compare your text against the translation itself with cross-lingual embeddings, which removes the Google back-translation step as a source of error.

## How it works

| Part | Tech |
|---|---|
| Shell | [Tauri 2](https://tauri.app): a ~5 MB Rust binary hosting the UI in the system web view (WebView2 on Windows, WebKit on Mac), no bundled browser |
| UI | plain HTML/CSS/JS in `resources/`, no framework or build step |
| Global shortcuts, typing into other apps, selection grab | Rust: keyboard hook (`rdev` on Windows; on Mac a listen-only Core Graphics event tap in `hotkey.rs`), `enigo` simulated input, `arboard` clipboard |
| Mac permissions | `permissions.rs`: checks and prompts for Input Monitoring, Accessibility, Screen Recording and Microphone |
| Speech to text | Whisper (tiny/base/small) running locally via [transformers.js](https://huggingface.co/docs/transformers.js) + ONNX Runtime, WebGPU when available. Kept loaded after use for 2, 10 or 30 min depending on the computer's memory, and released early if memory runs low |
| Back-translation score | [paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) sentence embeddings via transformers.js, local; released from memory when idle |
| Screen text | `xcap` capture + [Tesseract.js](https://tesseract.projectnaptha.com) OCR, local |
| Voices | Microsoft neural voices (Edge Read Aloud protocol, `tts.rs`), OpenAI, or system voices |
| Translation | Google Translate web endpoint, or the Anthropic / OpenAI / Gemini APIs, called directly |
| Updates | `tauri-plugin-updater`, minisign-signed, served from GitHub releases. The Mac build is made by GitHub Actions when a release is published and added to the same release |

## Privacy

- No account, no server, no analytics.
- Text goes only to the engine you choose. Voice, screen snips and the back-translation score are processed locally (models download once from Hugging Face).
- Settings and history are stored in your user profile. API keys are kept in the system credential store (Windows Credential Manager; the macOS Keychain on Mac), never in the settings file. Keys saved by versions before 0.4.6 are moved there automatically on first launch.
- The free Google Translate and Microsoft voice services are unofficial endpoints and may break; the API engines are the official route.

## Roadmap

Planned or being considered, roughly in order. Each item has an issue for discussion; all of them are under the [roadmap label](https://github.com/chrisqtruong/vox2/issues?q=label%3Aroadmap). Ideas and requests are welcome in [Issues](https://github.com/chrisqtruong/vox2/issues).

- [x] **macOS version** (beta). See [macOS notes](#macos-notes).
- [ ] **Mac: Intel support and Apple notarization.** Notarization removes the "Open Anyway" step on first launch. ([#5](https://github.com/chrisqtruong/vox2/issues/5))
- [ ] **Mini mode.** A one-line bar version of the window to keep open while you work. ([#6](https://github.com/chrisqtruong/vox2/issues/6))
- [ ] **Smarter match score.** An optional check by the AI engine that catches swapped words (left/right, he/she) and idioms, and a direct comparison with the translation that skips the trip back. See [next steps for the score](#next-steps-for-the-score). ([#7](https://github.com/chrisqtruong/vox2/issues/7))
- [ ] **Better snip on "detect".** More accurate screen-text reading when the source language isn't set. ([#8](https://github.com/chrisqtruong/vox2/issues/8))
- [ ] **Code signing.** A verified publisher name on the installer, so Windows stops showing "unknown publisher". Planned once Vox2 has more users; until then, see [Install](#install). ([#9](https://github.com/chrisqtruong/vox2/issues/9))

## Build

```
cargo install tauri-cli --version "^2" --locked
cargo tauri build            # installer in src-tauri/target/release/bundle/nsis/
```

Needs Rust and, on Windows, the Visual Studio C++ build tools (on macOS, Xcode command-line tools). Release builds that publish updates also need the updater signing key in `TAURI_SIGNING_PRIVATE_KEY`.

**Mac builds** come from GitHub Actions (`.github/workflows/build.yml`): run the **build** workflow by hand for a test `.dmg`, or publish a release and it attaches `Vox2-mac.dmg` and the Mac update to it. Signing uses repo secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` (Vox2's own certificate), plus `TAURI_SIGNING_PRIVATE_KEY` for updates.

Layout: `resources/` is the UI (`app.js` wires everything; `engines.js`, `dictation.js`, `tts.js`, `ocr.js`, `langpicker.js` are the pieces). `src-tauri/src/` is the native side (`main.rs`, `hotkey.rs`, `overlay.rs`, `permissions.rs`, `tts.rs`).

## License

[GPL-3.0](LICENSE). Color themes are from [Monkeytype](https://github.com/monkeytypegame/monkeytype) (GPL-3.0). Turtle and rabbit icons are from [Lucide](https://lucide.dev) (ISC). Fonts: Roboto Mono and Lexend Deca (SIL Open Font License).
