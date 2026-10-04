# Meaning check test — 2026-10-04: direct comparison (the decisive experiment)

**The question.** After run 5, word rules had stopped paying off. Before spending more, one experiment: if the app also compares **your text with the translation itself** (not only with the ↩ line), using the model it already has, does it catch meaningfully more errors? The bar, set in advance: **5–10 points more caught** on held-out sentences, without more false alarms. If not, stop tuning the free, local check and put effort elsewhere.

**Answer: no.** Direct comparison adds about **1 point** at an acceptable cost, and only gets to ~79% by marking a third of good translations "check the details". The stopping rule applies to this path.

**A second finding changes how to read the 70%.** In **99 of the 318** errors the check "missed", the planted error **never reached the translation**: the bad translation is word for word the same as Google's good one (e.g. French *sa femme* for both "his wife" and "her wife"; Tagalog, Hindi and Urdu don't mark he/she). Counting only errors that actually made it into the output, the Meaning Check catches **77%**.

| | |
|---|---|
| Date | 2026-10-04 |
| Data | [run 5](2026-10-04-run-5.md)'s saved translations (11 languages; 40 development + 96 held-out sentences; 6 error types). No new translations |
| Model | the app's own: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 8-bit ONNX, mean pooling, run with onnxruntime. Its round-trip similarity matches the app's saved scores within ±2 points on 93% of rows (about 5 points apart on the rest, from runtime differences) |
| Tuning | on the **development** sentences only; results reported on the **held-out** ones |
| Raw results | [`2026-10-04-direct-comparison-results.json`](2026-10-04-direct-comparison-results.json) (three similarities per pair) |
| Scripts | [`tools/meaning-bench/direct_embed.py`](../../tools/meaning-bench/direct_embed.py), [`direct_eval.py`](../../tools/meaning-bench/direct_eval.py), [`dump-scores.mjs`](../../tools/meaning-bench/dump-scores.mjs) |

## What was tried

For each pair, three similarities with the same model: your text ↔ ↩ line (today's score), **your text ↔ translation** (direct, across languages), and ↩ line ↔ translation.

The most promising signal is the **gap**: how much closer the ↩ line is to the translation than your text is. If the translation says something you didn't, the ↩ line (made from it) matches it better than your text does. On average it works: the gap is **0.006** for good translations and **0.04–0.08** for bad ones, in 10 of 11 languages. Tagalog is the exception: the model can't read it (direct similarity ~0.40 even for good translations), so the rule skips Tagalog.

## Results (held-out)

Today's checks: **69.9%** errors caught, **6.9%** false alarms, **91.2%** of good translations shown as "meaning kept".

| Rule (gap above T → flag) | Errors caught | False alarms | Good shown as "meaning kept" |
|---|---|---|---|
| none (today) | 69.9% | 6.9% | 91.2% |
| T = 0.13, flag as "likely off" (best with ≤ +1 point false alarms on development) | 70.4% | 8.0% | 90.6% |
| T = 0.08, flag as "check the details" | 72.0% | 6.9% | 87.5% |
| T = 0.04, flag as "check the details" | 75.3% | 6.9% | 78.6% |
| T = 0.02, flag as "check the details" | 79.3% | 6.9% | 65.2% |

Every point gained costs several points of good translations losing "meaning kept". Not worth shipping.

**Why it fails.** The errors still being missed look the same as good translations to this model: their median gap is **0.003** for swapped pronouns and added gender, **0.005** for negations, about the same as good translations (0.006). Opposites do a bit better (0.043; 19% of missed opposites stand out). The model, trained to match paraphrases, barely registers he ↔ she or many ↔ few. Comparing directly doesn't fix a sensor that can't see the difference.

## The errors that never reached the translation

| Error type (held-out) | Bad translation identical to the good one | …among the "missed" |
|---|---|---|
| pronoun (he ↔ she) | 55 of 176 (31%) | 55 of 99 |
| gender added (they → he) | 39 of 176 (22%) | 36 of 105 |
| negation | 5 of 176 | 5 of 26 |
| opposite | 3 of 176 | 3 of 74 |
| number, dropped clause | 0 | 0 |

These aren't Meaning Check failures: the translation is the same either way, so there's nothing to catch (Vox2 already says pronouns can't be checked for languages that don't mark them). "Identical" is strict, so a few near-identical cases are still counted as misses.

| | Errors caught |
|---|---|
| All planted errors (as reported in run 5) | 69.9% (738 of 1,056) |
| Errors that reached the translation | **77.0%** (735 of 954) |

The planted-error test will keep its existing definition so runs stay comparable; reports will show both numbers from now on.

## What we take from it

1. **The free, local check is close to what its sensor allows.** Remaining real misses are mostly opposites (71), added gender (69), pronouns (44): exactly what the small model can't see. More rules or comparisons with the same model won't move it much.
2. **High-stakes reliability needs a sharper sensor**, which means something heavier than today's 118 MB model: an AI double-check, a second translation engine, or a large research model. That fits the principle of a light core with optional add-ons: a "careful" mode for medical, legal and other high-stakes text, not a heavier default for everyone.
3. **Measure what matters for high stakes.** A test set of medical and legal sentences with the errors that hurt (dose, units, "do not", conditions, dates, who does what) and a target of **95%+ caught** for those.

## Reproducing

See the scripts above. Needs `numpy`, `onnxruntime`, `tokenizers`, and the model files `onnx/model_quantized.onnx` and `tokenizer.json` from [Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2).

*FLORES-200 by Meta AI, CC BY-SA 4.0.*
