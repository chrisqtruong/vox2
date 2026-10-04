# Meaning-check benchmark

Measures how well Vox2's meaning check (back-translation + match score, `resources/meaning.js`) tells good translations from ones that say something different. Reports live in [`docs/meaning-check-tests/`](../../docs/meaning-check-tests/); each run gets a dated report and its raw results so runs can be compared over time.

## What it does

1. `make_items.py` picks English sentences from [FLORES-200](https://github.com/facebookresearch/flores/blob/main/flores200/README.md) and plants one meaning error in each (negation flipped, number changed, he/she swapped, an opposite word, a clause dropped), keeping each sentence's professional translations. FLORES text is CC BY-SA 4.0.
   - `items.json`: run 1's 40 sentences (8 per error type).
   - `items-v2.json` (run 2): those 40 as the **development** set (`split: "dev"`, used while designing checks) plus 80 new **held-out** sentences (`split: "test"`, 16 per error type, never looked at while tuning). Report the held-out numbers as the headline.
   - `items-v3.json` (run 3): the same development set plus a **fresh** 80 held-out sentences (seed 2027), because run 2's held-out examples were read while writing its report. Use a fresh held-out set whenever the previous one has been looked at.
   - `items-v4.json` (run 5): the same development set plus a fresh 96 held-out sentences (seed 2028), 16 per error type, including a sixth type, *gender added* ("they" → "he", "people" → "men"). `compare.mjs` prints the report's tables for several versions of the word checks on the same translations.
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

## Re-scoring offline (Phase 1.2 on)

Runs 2 and later save the model's similarity for every translation. The word checks (`meaning-checks.js`) don't need the model, so a change to them can be scored on all saved translations in about a second, without Google or WebKit:

```
J=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc   # macOS's JavaScript engine (the Mac app's)
$J -m offline.mjs -- ../../docs/meaning-check-tests/2026-10-03-run-3-results.json summary verify
$J -m offline.mjs -- ../../docs/meaning-check-tests/2026-10-03-run-3-results.json flags test good negation
```

`summary` prints the report's measures per split and false alarms by cause; `verify` counts rows whose score differs from the saved one (0 before any change). `flags <split> good <check>` lists false alarms of one kind; `flags <split> bad <error type>` lists planted errors shown as "meaning kept". Changes to the similarity part (`meaning.js`, the model) still need a full run.

Keep the item files unchanged so results stay comparable. If the method changes (new error types, more languages, different thresholds), say so in the report and mark the history row.
