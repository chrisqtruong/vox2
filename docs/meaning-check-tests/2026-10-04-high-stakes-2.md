# Meaning check test — 2026-10-04: high stakes, fresh set (confirms Phase 1.3)

**Why.** [Phase 1.3](2026-10-04-phase-1-3.md) (unit check, "unless" = "if not") lifted critical errors caught on the first high-stakes set from 48% to 73%, but that set had been looked at while designing it, so the number was optimistic. This is a **new set of 144 sentences from new sources**, written before any of it was scored, all sealed and measured once.

**Result: critical errors caught 48.2% (0.4.20 checks) → 71.1% (Phase 1.3), false alarms 2.7% → 2.4%.** Dangerous translations shown as "meaning kept" fall from 820 to 458 of 1,584. Phase 1.3's gain holds on text it was never tuned on (73% vs 71%).

| | |
|---|---|
| Date | 2026-10-04 |
| Sentences | 144 new (72 medical, 72 legal/official), none from the first set: CDC food safety, NIDDK low blood glucose, FDA sunscreen, FDA NSAID label wording, CDC/NIOSH heat illness; DOT airline refunds, DOL family and medical leave, IRS record keeping, TSA liquids, CFPB credit-report disputes, State Department passports. US federal text, public domain ([`items-hs2.json`](../../tools/meaning-bench/items-hs2.json)) |
| Planted errors | one per sentence, hand-written from the six category definitions (12 per type per domain): number, unit, negation, direction, condition, role. Written before scoring; not tuned to the checks |
| Translation | Google both ways, 11 languages; 3,168 pairs. Google throttled this run (47 minutes); no wrong-language back-translations |
| Compared | 0.4.20's checks vs Phase 1.3 on the same translations |
| Raw results | [`2026-10-04-high-stakes-2-results.json`](2026-10-04-high-stakes-2-results.json) |

## Results (all 144 sentences sealed)

| | 0.4.20 checks | Phase 1.3 |
|---|---|---|
| **Critical errors caught** | 48.2% | **71.1%** |
| False alarms | 2.7% | **2.4%** |
| Good shown as "meaning kept" | 96.9% | 97.2% |
| Dangerous translations shown as "meaning kept" | 820 / 1,584 | **458 / 1,584** |

| Error | 0.4.20 | Phase 1.3 | Medical | Legal |
|---|---|---|---|---|
| number | 100% | 100% | 100% | 100% |
| negation | 96% | 96% | 100% | 92% |
| **unit** | 4% | **83%** | 85% | 82% |
| **condition** | 14% | **72%** | 81% | 63% |
| direction | 53% | 53% | 59% | 46% |
| role | 23% | 23% | 16% | 30% |

Medical 73.5% (3.0% false alarms), legal 68.7% (1.8%). Every language between 68% and 74%. Two planted errors (of 1,584) came out identical to the correct translation.

## What's still missed (and what would fix it)

Almost every miss is again **visible in the ↩ line**, just outside what the rules know:

- **Units the rule doesn't list** (17% of unit errors): quarts, liters, pounds, ounces, workweeks; and "3 **or more** days", where words sit between the number and the unit. → add those units; allow "or more / or less" between number and unit.
- **Direction words with synonyms** (47% missed): "40°F or below" ↩ "40°F or **higher**", "SPF of at least 15" ↩ "a **maximum** SPF of 15", "lower" ↩ "**increase**". The opposites list pairs exact words (above ↔ below), not their synonyms. → treat each side as a family (below = lower = under = at most = maximum; above = higher = over = at least = minimum; lower = reduce = decrease; raise = increase).
- **Who does what** (77% missed): word order; needs the AI double-check ([#7](https://github.com/chrisqtruong/vox2/issues/7)).

Those first two are the next small step (**Phase 1.4**). It must be measured on a **third** fresh set, since this one has now been looked at.

## Where this leaves high stakes

| | Caught | Goal |
|---|---|---|
| First set, after looking (optimistic) | 73.4% | |
| **Fresh set (clean)** | **71.1%** | 95%+ |

Real progress (from about half to about seven in ten critical errors, with fewer false alarms), but **not yet reliable enough to call a safety check** for medicine or legal text. The path to 95% likely needs both Phase 1.4 (synonyms, more units) and the optional AI double-check for role swaps.

## Reproducing

```
cd tools/meaning-bench
python3 make_items_hs2.py                                 # items-hs2.json (fixed)
cp ../../resources/meaning.js ../../resources/meaning-checks.js ../../resources/meaning-worker.js .
swiftc -O bench.swift -o bench && ./bench items-hs2.json results.json
python3 analyze_hs.py results.json test                   # Phase 1.3 (the checks in this commit)
git show <0.4.20>:resources/meaning-checks.js > /tmp/checks-0.4.20.js
J=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
$J -m dump-scores.mjs -- results.json /tmp/checks-0.4.20.js > old.json
python3 analyze_hs.py results.json test old.json          # 0.4.20's checks on the same translations
```
