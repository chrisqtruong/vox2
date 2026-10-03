# Meaning-check benchmark

Measures how well Vox2's meaning check (back-translation + match score, `resources/meaning.js`) tells good translations from ones that say something different. Reports live in [`docs/meaning-check-tests/`](../../docs/meaning-check-tests/); each run gets a dated report and its raw results so runs can be compared over time.

## What it does

1. `make_items.py` picks 40 English sentences from [FLORES-200](https://github.com/facebookresearch/flores/blob/main/flores200/README.md) and plants one meaning error in each (8 each: negation flipped, number changed, he/she swapped, an opposite word, a clause dropped). It also keeps each sentence's professional translations. Output: `items.json` (already included; FLORES text is CC BY-SA 4.0).
2. `run.html` does, per language: Google-translate the correct and the corrupted English into the language, then translate all three (professional, Google-correct, Google-corrupted) back into English, and score each against the **correct** English with Vox2's real `matchScore()`. Google is called through the same endpoint as Vox2's main translation, several sentences per request, with pauses and retries.
3. `analyze.py` turns `results.json` into the tables used in the report.

## How to run

```
cp ../../resources/meaning.js ../../resources/meaning-worker.js .   # the scoring code under test
swiftc -O bench.swift -o bench    # macOS: runs run.html in WebKit, like the Mac app
./bench                           # ~7 minutes; writes results.json
python3 analyze.py                # tables for the report
```

Then add a dated report (`docs/meaning-check-tests/YYYY-MM-DD.md`, copy the previous one's structure), save `results.json` next to it as `YYYY-MM-DD-results.json`, and add a row to the history table in `docs/meaning-check-tests/README.md`.

Keep `items.json` unchanged between runs so results stay comparable. If the method changes (new error types, more languages, different thresholds), say so in the report and mark the history row.
