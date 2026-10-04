# Changelog

What changed in each version of Vox2, newest first. Each entry says which platforms it affects. The [GitHub releases](https://github.com/chrisqtruong/vox2/releases) have the downloads; versions before 0.4.11 are described only there.

## Unreleased

### Changed

- **Gender-inclusive AI translations.** Claude, ChatGPT and Gemini are now told to keep each person's gender exactly as your text gives it and never assume one it doesn't state: keep pronouns, including singular "they" and neopronouns, as closely as the language allows; keep neutral words like partner, parent or doctor neutral; and where a language needs a gender your text doesn't give, prefer gender-neutral wording. The "who it's for" note (e.g. someone's pronouns) takes priority. Google Translate can't take instructions, so it's unchanged; the meaning check flags when a gender appears. *Windows and Mac.*

## 0.4.20 (2026-10-04)

### Changed

- **Meaning check: inclusive pronouns.** Singular *they* and neopronouns (xe, ze, ey, fae) now count: if you write "they" or "xe" and the ↩ line says "he" or "she", or you write "partner" and it says "wife", the match is capped and the hover card says a gender appeared that you didn't write. A neopronoun that comes back as "they" (most languages don't have one) keeps the score below 85. In Tagalog, Hindi, Urdu and Spanish, whose pronouns can't carry he/she/they through the round trip, the hover card says pronouns can't be checked. Wording says "pronouns" instead of "he/she". *Windows and Mac.*

### Fixed

- **Meaning check: fewer false alarms on new text.** Testing on fresh sentences showed words like "undisturbed" or "unfamiliar" were read as a "not" when a good translation said "intact" or "new". They now only count to balance a "not" on the other side ("not hurt" = "unharmed"). And "people" coming back as "men" isn't flagged when your text already said "his". False alarms on fresh sentences 8.3% → 6.9% ([report](docs/meaning-check-tests/2026-10-04-run-5.md)). *Windows and Mac.*
- **Fewer meaning-check false alarms.** Numbers written differently now match (eighteenth = 18th, 90°F = 32°C, "between 340 and 500 million", "both" = two, a conversion in brackets), and more ways of saying "not" are understood (unharmed = not hurt, treeless = without trees, immoral, "not long ago" isn't a negation, "No. 9" is a number). False alarms on good translations 4.8% → 4.1% on held-out sentences, errors caught unchanged ([report](docs/meaning-check-tests/2026-10-04-phase-1-2.md)). *Windows and Mac.*

## 0.4.19 (2026-10-04)

### Changed

- **Mac: new, easier shortcuts that don't clash with other apps.** The shortcuts that work from any app are now ⌃⌥ + a letter, one left-hand press: **⌃⌥V** show / hide Vox2 (was ⇧⌘Space), **⌃⌥T** translate selected text (was ⌥⌘T), **⌃⌥S** snip & translate (was ⌥⌘S). The old ⌘ combos also did something in other apps (⌥⌘S is "Save All" in Xcode, ⌥⌘T hides toolbars, ⇧⌘Space opens 1Password). If you never changed a shortcut, you get the new ones automatically; shortcuts you set yourself stay. Dictate (right ⌥) and the in-window shortcuts are unchanged. *Mac.*
- **A shortcut can't be Shift (or another left-side modifier) on its own anymore.** It was easy to record by accident (press Shift, let go) and then fired every time you typed a capital letter, e.g. "nothing was selected" bubbles. On its own, only a right-side Ctrl / Option / Cmd works; anything else needs a letter. A shortcut already set that way goes back to its default. *Windows and Mac.*
- **Mac: Vox2's shortcuts no longer also trigger the app in front.** When you press a Vox2 shortcut, only Vox2 reacts; the app you're in doesn't get the keys too. Uses the Accessibility permission Vox2 already has. *Mac.*

## 0.4.18 (2026-10-04)

### Fixed

- **No more "100% match" on text that wasn't translated.** When part of your text comes through untranslated (gibberish, a garbled snip, text already in the other language), the ↩ line just repeats it, so it used to score 100%. Now the badge says **can't check**, the untranslated words are underlined in the ↩ line, and the hover card says why. It never fired on 6,160 good translations in the meaning tests, and catches 84–94% of garbled text ([report](docs/meaning-check-tests/2026-10-04-untranslated.md)). *Windows and Mac.*

## 0.4.17 (2026-10-04)

### Added

- **Star your favorite themes.** Hover a theme in settings → appearance and click the ☆ in its corner: starred themes show at the top under "starred", in the order you starred them (they stay in their group too). Star as many as you like; click ★ again to unstar. *Windows and Mac.*

## 0.4.16 (2026-10-03)

### Fixed

- **Mac: snip & translate reads screen text much more accurately.** Snips are now read by Apple's own text recognizer (the Live Text engine) instead of Tesseract, which sometimes garbled lines or misread words ("on" as "or"). It also works offline with no download. Languages Apple's reader doesn't cover still use Tesseract. *Mac.*

## 0.4.15 (2026-10-03)

### Added

- **Meaning check catches meaning flips.** Targeted checks compare your text with the ↩ line for a "not" that appeared or disappeared, he/she swapped, an opposite word (left/right, many/few…), a changed day or month, and part of the sentence missing; number words now count as numbers ("two" = 2). Any of them caps the score at 60, and the hover card says what changed. Measured on held-out sentences in 11 languages: meaning errors caught ~35% → 78% ([run 2](docs/meaning-check-tests/2026-10-03-run-2.md), [run 3](docs/meaning-check-tests/2026-10-03-run-3.md)). English for now. *Windows and Mac.*
- **The meaning check shows what changed.** The word behind a flag is underlined in the ↩ line (the "not" that appeared, "her" for "his", "52" for "15"), and when the score is below 85 the hover card lists your words that didn't come back. *Windows and Mac.*

### Fixed

- **Fewer meaning-check false alarms.** "unknown" and "do not know" (and similar words like unable, lack, fail) no longer count as a flipped meaning; "not only" isn't a negation; 11:00 and 11am are the same time; numbers in names like COVID-19 are ignored; "one of" isn't read as the number 1. The opposites list grew to about 90 pairs. On fresh test sentences, false alarms went from 8% back to 5% with no loss in errors caught ([report](docs/meaning-check-tests/2026-10-03-run-3.md)). *Windows and Mac.*

## 0.4.14 (2026-10-03)

### Fixed

- **Windows: back-translation and the match score disappeared after heavy use.** Google's back-translation service starts answering "too many requests" after a lot of translating (for hours, per internet connection), and Vox2 then showed nothing. The back-translation now goes through the same Google service as the main translation, as on Mac. Only the pronunciation line (romaji, pinyin…) still uses the old service, only when it's shown, and it simply stays empty while Google is refusing. *Windows.*

## 0.4.13 (2026-10-03)

### Added

- **Esc stops reading aloud and dictation**, from any app, not just Vox2: press it while Vox2 reads a translation (from the window or the bubble) or while you're dictating, and it stops right away. Dictation keeps what it already transcribed. Esc does nothing extra when Vox2 isn't reading or listening. *Windows and Mac.*
- **The bubble's "listen" button turns into "stop"** while it reads. *Windows and Mac.*
- **Search in settings.** A search box at the top of settings filters as you type: only matching settings stay, under their section. × or Esc clears it; Ctrl+F / ⌘F jumps to it. *Windows and Mac.*
- **Tone and "who it's for" are always visible** in settings → translation, dimmed with a note while Google Translate is selected (they need Claude, ChatGPT or Gemini). They used to be hidden, so you couldn't tell they existed. *Windows and Mac.*
- **Colorblind-friendly match score colors** (settings → appearance, off by default). Scores show in blue ✓ / amber ! / vermillion ✕ (the [Okabe–Ito](https://jfly.uni-koeln.de/color/) colorblind-safe palette) instead of the theme's colors, darker on light themes and brighter on dark ones. The symbols mean a score never depends on color alone. *Windows and Mac.*

### Tested

- **First measured test of the meaning check** ([report, 2026-10-03](docs/meaning-check-tests/2026-10-03.md)): 1,320 translations in 11 languages with planted meaning errors. Good translations are confirmed reliably (93% "meaning kept", 4% false alarms) and changed numbers are always caught, but most other meaning errors are missed (29% caught). The fixes lead the roadmap. Test kit: `tools/meaning-bench/`.

### Fixed

- **Snip garbled screen text and read "I" as "|".** Screen text is small and often light-on-dark, which the text reader handles badly. Snips are now enlarged, flipped to dark-on-light and contrast-stretched before reading, read as one block of text, and a lone "|" where a word starts becomes "I". In tests across dark, light and colored themes, word accuracy went from 86–100% to 100%. *Windows and Mac.*
- **Mac: the pronunciation line (romaji, pinyin…) didn't appear.** Google refused Vox2's native request too; it's now made through Apple's own networking, which Google answers. *Mac.*
- **Match score: the middle range (65–84) was nearly invisible.** It used the theme's faint "muted" color; it now uses the theme's text color. *Windows and Mac.*
- **The quick-translate bubble popped up again while dictating in the Vox2 window.** After ⌥⌘T / Ctrl+Alt+T or a snip, the bubble kept receiving updates until you typed in the window, and dictating didn't count. Dictating, or bringing the Vox2 window to the front, now ends the quick translation. *Windows and Mac.*
- **Mac: the bubble stayed on screen after switching to the Vox2 window.** It now hides when the Vox2 window comes to the front. *Mac.*
- **Mac: the stop button (and other Vox2 buttons) needed two clicks while another app was in front.** macOS spent the first click just activating the window. The Vox2 window and bubble now accept the first click. *Mac.*
- **Mac: back-translation, the match score and pronunciation never appeared.** Google's back-translation service often refuses Vox2 on Mac ("too many requests"), which Apple's web engine reports only as "Load failed". On Mac the back-translation now goes through the same Google service as the main translation, and pronunciation is fetched by Vox2's native side as a best-effort extra. *Mac.*
- **Mac: snipping failed right of or below the middle of a Retina screen.** The snip box was handed to the screen-capture library in pixels where it expects points (half as many on Retina), so it looked for a screen that wasn't there ("Monitor not found"). Snips now work anywhere, also with several screens. *Mac.*

## 0.4.12 (2026-10-03)

- **Shortcut reminders:** hover a bottom-bar button to see its name and keyboard shortcut. *Windows and Mac.*
- **New shortcuts** (while Vox2 is in front): fit window to text (Ctrl+Shift+F / ⇧⌘F), history (Ctrl+H / ⌘Y), settings (Ctrl+, / ⌘,). *Windows and Mac.*

## 0.4.11 (2026-10-03)

- **Fit window to text:** one click resizes the window around its content. *Windows and Mac.*
- **macOS (beta), first release.** Apple Silicon, downloadable as `Vox2-mac.dmg`, and Macs update themselves from here on (the signed Mac update is added to each release automatically). Changes that made it work, all Mac-only unless noted:
  - **Permissions screen** listing Input Monitoring, Accessibility, Screen Recording and Microphone with a button for each; ticks off as you allow them, offers a restart where macOS needs one, opens at startup while something's missing, and sits at the top of settings.
  - **Signed with Vox2's own certificate**, so macOS keeps permissions across updates (unsigned builds lost them on every update).
  - **Own keyboard watcher** for global shortcuts. The previous one (`rdev`) crashed the app on every keypress on macOS 14+ (it read the keyboard layout off the main thread) and, once patched, got switched off by macOS for being slow. The new one only reads key codes and switches itself back on.
  - **⌥⌘T crash fixed:** copying the selection used a keyboard-layout lookup off the main thread.
  - **Shortcuts didn't fire twice anymore** when pressed inside Vox2.
  - **Dictation transcribed garbage** ("FIND FIND FIND"): Apple's web engine garbled the microphone at 16 kHz. Vox2 now records at the mic's own rate and converts, and drops runaway repeats.
  - **Quick-translate bubble** never appeared (hidden windows don't get animation frames in Apple's web engine) and was placed wrong on Retina screens.
  - **Window fade** while pinned on top now works on Mac.
  - **Mac-style shortcuts** (⌥⌘T and so on), shown with Mac symbols; ⌘ in zoom tooltips.
  - "No update for this computer yet" reads as up to date instead of an error. *Windows and Mac.*
