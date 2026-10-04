# Meaning-check benchmark

Measures how well Vox2's meaning check (back-translation + match score, `resources/meaning.js`) tells good translations from ones that say something different. Reports live in [`docs/meaning-check-tests/`](../../docs/meaning-check-tests/); each run gets a dated report and its raw results so runs can be compared over time.

## What it does

1. `make_items.py` picks English sentences from [FLORES-200](https://github.com/facebookresearch/flores/blob/main/flores200/README.md) and plants one meaning error in each (negation flipped, number changed, he/she swapped, an opposite word, a clause dropped), keeping each sentence's professional translations. FLORES text is CC BY-SA 4.0.
   - `items.json`: run 1's 40 sentences (8 per error type).
   - `items-v2.json` (run 2): those 40 as the **development** set (`split: "dev"`, used while designing checks) plus 80 new **held-out** sentences (`split: "test"`, 16 per error type, never looked at while tuning). Report the held-out numbers as the headline.
   - `items-v3.json` (run 3): the same development set plus a **fresh** 80 held-out sentences (seed 2027), because run 2's held-out examples were read while writing its report. Use a fresh held-out set whenever the previous one has been looked at.
2. `run.html` does, per language: Google-translate the correct and the corrupted English into the language, translate all three (professional, Google-correct, Google-corrupted) back into English, and score each against the **correct** English with Vox2's real `matchScore()`. It also records `scoreRun1`, the run-1 method on the same translations, for a fair before/after. Google is called through the same endpoint as Vox2's main translation, several sentences per request, with pauses and retries. Results are saved after every language, and a restarted run continues where it stopped.
3. `analyze.py` (run 1 format) and `analyze_v2.py` (before/after, development vs held-out) turn the results into the report's tables.

## How to run

```
cp ../../resources/meaning.js ../../resources/meaning-checks.js ../../resources/meaning-worker.js .   # the code under test
swiftc -O bench.swift -o bench               # macOS: runs run.html in WebKit, like the Mac app
./bench items-v2.json results.json           # ~30 minutes for items-v2; rerun the same command to resume
python3 analyze_v2.py results.json           # tables for the report
```

The "can't check" rule for untranslated text has its own test: `python3 untranslated.py fetch garbage.json`, then `python3 untranslated.py score garbage.json` ([report](../../docs/meaning-check-tests/2026-10-04-untranslated.md)).

Then add a dated report in `docs/meaning-check-tests/` (copy the previous one's structure), save the results next to it as `<report name>-results.json`, and add a row to the history table in `docs/meaning-check-tests/README.md`.

## Untranslated text (run 4)

A bigger test of the "wasn't translated" check (#38): text Google can't translate and passes through unchanged, in all 11 languages. Compares the app's check (`resources/meaning-checks.js`) with a bench-only two-level alternative (`untranslated-two-level.js`).

```
python3 make_untranslated.py                                   # items-untranslated.json (fixed seed)
python3 fetch_untranslated.py untranslated-raw.json            # Google both ways, ~1 hour; resumes per language
cp ../../resources/meaning.js ../../resources/meaning-checks.js ../../resources/meaning-worker.js .
swiftc -O bench.swift -o bench
./bench untranslated-raw.json untranslated-scored.json rescore.html   # real scores in WebKit, ~15 minutes
J=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
$J -m reshare.mjs -- untranslated-scored.json > results.json   # re-apply both checks after changing either
python3 analyze_untranslated.py results.json 0.4 0.2           # tables (two-level thresholds)
$J -m eval_untranslated.mjs -- test ../../docs/meaning-check-tests/2026-10-03-run-3-results.json   # two-level on real translations
```

`rescore.html` scores saved translations without asking Google again (`bench` takes the page as its 3rd argument). Google sometimes answers whole batches with empty text (throttling); `fetch_untranslated.py` retries those one at a time at the end, which is slow. In run 4 it was stopped and the empty rows left out.

Keep the item files unchanged so results stay comparable. If the method changes (new error types, more languages, different thresholds), say so in the report and mark the history row.
