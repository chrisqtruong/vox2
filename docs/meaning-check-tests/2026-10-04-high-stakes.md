# Meaning check test — 2026-10-04: high stakes (medical and legal), baseline

**Why this test.** Vox2 should be dependable for text where a mistake can hurt someone: medicine instructions, legal and official notices. Our earlier tests used news and travel sentences. This one uses **real medical and legal text** and plants the errors that matter there: a wrong dose or unit, a dropped "do not", before ↔ after, if ↔ unless, who must do what. Goal (set in advance): **95%+ of critical errors caught, at most 5% false alarms.**

**Result: the Meaning Check as of 0.4.20 catches 48% of critical errors on the sealed set, with 2.9% false alarms.** It's excellent on numbers (100%) and good on "not" (85%) and on direction words (72%), but nearly blind to **units** (5%), **conditions** (13%) and **who does what** (12.5%). In 551 of 1,056 dangerous translations, it said "meaning kept".

The important part: in almost every miss, **the error is plainly visible in the ↩ line** ("within 1 to 2 **weeks**", "**Unless** pregnant…", "15 to 60 **hours**"). Unlike the pronoun misses in [the direct-comparison report](2026-10-04-direct-comparison.md), nothing is lost on the way; the check just has no rule for units or conditions. That's fixable with the same light, local checks, and is the next step.

| | |
|---|---|
| Date | 2026-10-04 |
| Vox2 | `main` after 0.4.20 (Phase 1.2b checks, "can't check" rule) |
| Sentences | 120 English sentences: **60 medical** (FDA, NIH/NIA, NIDDK, CDC pages, and FDA's required Drug Facts label wording) and **60 legal/official** (IRS, SSA, USCIS, CFPB, EEOC, FTC). US federal text, public domain. Quoted or lightly adapted to stand alone; sources listed per sentence in [`items-hs1.json`](../../tools/meaning-bench/items-hs1.json) |
| Planted errors | one per sentence, written by hand, 20 per type: **number** (4,000 mg → 6,000 mg), **unit** (mg → g, days → weeks, °F → °C), **negation** ("Do not stop taking…" → "Stop taking…"), **direction** (before ↔ after, higher ↔ lower, older ↔ younger, more ↔ less), **condition** (if ↔ unless, and ↔ or), **role** (who does what: "the seller must give you" ↔ "you must give the seller") |
| Split | 24 sentences for development (2 per domain × type), **96 sealed** (measured once, before any change) |
| Translation | Google Translate both ways (Vox2's default engine), 11 languages |
| Pairs scored | 2,640 (good: the translation of the correct sentence; bad: the translation of the sentence with the error) |
| Raw results | [`2026-10-04-high-stakes-results.json`](2026-10-04-high-stakes-results.json) |

## Results (sealed set: 96 sentences × 11 languages)

| Measure | Result | Goal |
|---|---|---|
| Critical errors caught (not shown as "meaning kept") | **47.8%** | 95%+ |
| Flagged "likely off" | 46.6% | |
| Good translations shown as "meaning kept" | 95.3% | |
| False alarms (good flagged "likely off") | **2.9%** | ≤ 5% |

No bad translation came out identical to the good one, so every planted error reached the translation (unlike pronoun swaps in [run 5](2026-10-04-direct-comparison.md#the-errors-that-never-reached-the-translation)).

### By error type

| Error | Caught | Medical | Legal | Example missed |
|---|---|---|---|---|
| number | **100%** | 100% | 100% | – |
| negation | **85%** | 72% | 99% | – |
| direction | **72%** | 84% | 59% | |
| condition | **13%** | 11% | 15% | "**Unless** pregnant or breast-feeding, ask a health professional before use." scored 100 |
| role | **12.5%** | 14% | 11% | "**The pharmacist will tell you** if you have trouble swallowing pills." scored 100 |
| unit | **4.5%** | 1% | 8% | "Antiviral drugs work best when started within 1 to 2 **weeks**…" scored 100 |

False alarms were highest for negation (9.1% of good translations; mostly rewordings of "do not" / "never"), and low elsewhere (0–3%).

### By domain and language

Medical 47.0% caught (1.3% false alarms), legal 48.7% (4.5%). Every language lands between 45% and 51%, so this is about **error types, not languages**: the same gaps everywhere.

## What it means

1. **Today's Meaning Check is not reliable for high-stakes text.** It shouldn't be presented as a safety check for medicine or legal notices until these numbers move.
2. **The gaps are specific and visible.** Units, conditions and roles come back in the ↩ line exactly as the bad translation says them. The check compares numbers but not their units, and counts "not" but not "unless".
3. **Next:** add **unit** and **condition** checks in the same small, local, explainable style ("a unit changed: days → weeks"); treat "unless" as "if not". Role swaps (who does what) depend on word order and may need the stronger second opinion (an AI double-check, [#7](https://github.com/chrisqtruong/vox2/issues/7)).
4. **Then a fresh high-stakes set** (more sentences, new ones) to confirm without the bias of having looked at this one.

## Honest notes

- I (Claude) wrote the planted errors from category definitions, before seeing any results. After this baseline, I looked at the per-type numbers and at 15 missed examples from the sealed set to understand *why* they were missed. Any fix measured on this same set will therefore be somewhat optimistic; the clean number will come from a new set.
- Each type has 16 sealed sentences × 11 languages = 176 translations, so per-type numbers are good to about ±7 points.
- "Good" translations are Google's translations of the correct sentence; Google isn't always right, so a few "false alarms" may be real translation problems.

## Reproducing

```
cd tools/meaning-bench
python3 make_items_hs.py                       # items-hs1.json (the 120 sentences, fixed)
cp ../../resources/meaning.js ../../resources/meaning-checks.js ../../resources/meaning-worker.js .
swiftc -O bench.swift -o bench && ./bench items-hs1.json results.json   # ~13 minutes
python3 analyze_hs.py results.json test        # the tables above
```
