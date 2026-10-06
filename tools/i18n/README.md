# App languages

Vox2's own words (menus, buttons, settings, messages, the bubble, the tray menu) come in every language Vox2 translates: settings → **app language**. "Match this computer" (the default) follows the system language. Names stay as they are: themes, fonts, engines, models, Vox2.

## How it works

- English is the source. The app looks each piece of text up by its English wording (`resources/i18n.js`) in `resources/i18n/<code>.json`, and shows the English when a language doesn't have it yet.
- The pages' own text is translated in place (`translatePage`): text, `title`, `placeholder`, `aria-label`. Anything marked `translate="no"` is left alone (your text, language names, theme names). `data-i18n="html"` translates a sentence with markup in it as one piece.
- Text made in code goes through `tr('…')`, with `{placeholders}` for what changes: `tr('{n} still needed', { n })`. `N_('…')` marks a string that's translated later, where it's shown.
- Language names in the menus come from the system (`Intl.DisplayNames`), so they're in the app's language; the English names still find them when you search. The English names stay what the AI engines see.
- Right-to-left languages (Arabic, Hebrew, Persian, Urdu…) flip the layout.

## Adding or changing text

1. Write it in English as usual, through `tr()` in code. Short labels that could mean several things ("clear", "tone", "off") get a fuller English version in `context.json` for the machine translator; the app still shows the short English.
2. `python3 tools/i18n/extract.py` updates `strings.json`.
3. `node tools/i18n/translate.mjs` translates what's new (cached in `work/`, so only new or changed strings are sent), and rewrites `resources/i18n/`. A translation that lost a `{placeholder}` or its markup on the way stays English.
4. Check the meaning (below).

## Checking the meaning

The translations are made by Google Translate (the same endpoint the app uses), so each one is also translated back into English and compared with what was meant, using the same model and scale as Vox2's match score:

```
npm i @huggingface/transformers   # anywhere, once
NODE_PATH=<that>/node_modules node tools/i18n/check.mjs
```

For the few labels that go wrong in many languages ("off", "done", "light"…), `context.json` lists several English wordings; the check keeps, per language, the one whose round trip comes back closest (`choices.json`), and `translate.mjs` uses it on its next run. It writes `check-report.md` (a score per language) and `check-flagged.json` (strings that came back noticeably different, for a person to read). This catches the wrong sense of a word ("clear" as "transparent", "pin" as "battery") and mangled sentences. It can't catch a translation that's wrong in a way that translates back correctly, and it flags some harmless rewordings of one-word labels ("Zoom in" ↩ "Enlarge"), so it's a reading list, not a verdict.

Fixes go in `fixes/<code>.json` (`{ "English": "translation" }`), which win over the machine; run `translate.mjs` again to apply them. Vietnamese has been read in full by a person; for other languages, corrections from people who speak them are very welcome.
