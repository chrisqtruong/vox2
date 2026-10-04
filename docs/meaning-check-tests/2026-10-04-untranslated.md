# Meaning check test — 2026-10-04: text that came through untranslated

**A targeted test** for [#38](https://github.com/chrisqtruong/vox2/issues/38): when Google can't translate part of your text (gibberish, a garbled snip), it passes it through unchanged both ways, so the ↩ line repeats your text and the score said **100% match** though nothing was checked.

**Summary:** Vox2 now shows **"can't check"** instead of a score when a long stretch of your text came through word for word, or most of your words did, and underlines what wasn't translated. On every good translation from runs 1–3 (6,160 translations, 11 languages) it fires **0 times**. It catches **84%** of sentences whose second half is garbled and **94%** of all-garbage text. A few junk words (2–4) don't trigger it, by design: the rest of the sentence still gets a real score.

| | |
|---|---|
| Date | 2026-10-04 |
| Vox2 | 0.4.17 + this change |
| What changed | `resources/meaning-checks.js` (`untranslated()`), `resources/app.js` (badge, hover card, underline), `resources/styles.css` |
| Good translations | all "good" pairs in the run 1–3 results (professional and Google), 11 languages: 6,160 |
| Garbled text | 18 FLORES-200 sentences (from `items-v3.json`) × 3 kinds × 6 languages (Vietnamese, Spanish, Tagalog, Chinese, Japanese, Arabic), translated by Google: 324 |
| Raw results | [`2026-10-04-untranslated-results.json`](2026-10-04-untranslated-results.json) |
| Test kit | [`tools/meaning-bench/untranslated.py`](../../tools/meaning-bench/untranslated.py) |

## Where it came from

A snip garbled the end of a paragraph into "…If that bothers 220008 0 Ans sl dd In arson Slam Allon alolon oa A Invlvlad Ela armva mn mon la ana sn laa nn". Google translated the first part into Chinese and kept the junk as is; the ↩ line came back with the same junk, and the score was 100%.

## The rule

The check looks at the **translation** (not the ↩ line), where untranslated text stands out:

1. **A long copied stretch.** Walk through the translation; words that also appear in your text extend a stretch: a lowercase word counts **1**, a capitalized word **½** (often a name, which legitimately stays the same). Numbers from your text and `, . ' -` don't break a stretch; anything else (a translated word, other punctuation) ends it. A stretch of **6 or more** = untranslated.
2. **Most of your words copied.** If your text has 4+ words and **80%+** of them appear in the translation = untranslated (e.g. all gibberish, or text already in the other language).

When either fires, the badge says **can't check** (no %), the copied words are underlined in the ↩ line, and the hover card explains why.

## How the thresholds were set

From the good translations first (what must never fire), then checked on garbled text.

**Good translations** (6,160): longest copied stretch, counting the same way:

| Longest stretch | Translations |
|---|---|
| 0 | 5,213 |
| 1–2 | 918 |
| 3–4 | 29 |
| 4.5–5 | 4 (all Tagalog, which mixes in English phrases: "stimulated emission of radiation", "round the world flight", "head to head record") |

Units ("km/h", "mph"), titles in another language ("Tratado de las Indias") and names are all short stretches. Share of words copied: at most 58%.

An earlier version counted only lowercase words and missed most garbage (much of it is capitalized, like OCR noise); counting every copied word fully flagged 5 good translations at 6. The ½ weight for capitalized words separates the two.

## Results

| Text | Caught ("can't check") |
|---|---|
| Good translations (must not fire) | **0 of 6,160** |
| Second half garbled (8–14 junk words) | **91 of 108 (84%)** |
| All garbage (6–16 junk words) | **102 of 108 (94%)** |
| 2–4 junk words added to a good sentence | 0 of 108 (by design) |

Same in every language tested (Latin and non-Latin scripts). The JavaScript in the app and the Python test give identical results on all 6,484 cases.

**Missed garbage** is short junk broken up by numbers or translated fragments, so no stretch reaches 6, for example "…and parks 29201 eeeuia etiek voa eh Rrh Gr Iubasel Nleiuw". Those still get a normal score, which the junk drags down somewhat.

## Limits

- The garbled text is synthetic (random letter clumps, like OCR noise), made with a fixed seed; real garbles vary. Your real case is caught.
- Text that *should* stay untranslated (code, a long English quote inside a Spanish message) will also say "can't check". That's honest: that part wasn't translated, so the ↩ line can't confirm it.
- With the source on "detect", text already in the target language gets "can't check" too (nothing was translated).

## Reproducing

```
cd tools/meaning-bench
python3 untranslated.py fetch garbage.json     # ~5 minutes; Google output can change over time
python3 untranslated.py score garbage.json     # or score the saved results in docs/meaning-check-tests/
```

*FLORES-200 by Meta AI, CC BY-SA 4.0.*
