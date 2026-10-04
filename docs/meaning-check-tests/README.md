# Meaning check: how it works and how well it works

Vox2's meaning check translates your translation back into your language (the faint ↩ line) and scores how much of your meaning survived (`92% match`). This page explains exactly how the score is computed and keeps a dated record of every test of it, so improvements can be measured over time.

- [Test history](#test-history)
- [How the score works](#how-the-score-works)
- [Re-running the test](#re-running-the-test)

## Test history

Each run has a dated report (what was tested, how, results, what we noticed, grades) and its raw results. Compare runs here; read a report for details.

| Date | Report | Method | Good shown as "meaning kept" | False alarms | Meaning errors caught | Missed | Overall |
|---|---|---|---|---|---|---|---|
| 2026-10-03 | [Run 1, baseline](2026-10-03.md) | 40 FLORES-200 sentences × 11 languages, 5 planted error types, Google both ways; Vox2 0.4.12 | 93% | 4% | 29% (numbers 100%, others 5–18%) | 71% | **F** on errors. Confirms good translations well; misses most meaning errors except numbers |
| 2026-10-03 | [Run 2, Phase 1 checks](2026-10-03-run-2.md) | Same method; **80 held-out sentences** (reported here) + run 1's 40 as development set; both methods scored on the same translations; Vox2 0.4.13 + targeted checks | 91% (run-1 method 95%) | 7% (3%) | **78%** (34%): negation 83%, number 98%, pronoun 70%, dropped clause 72%, opposite 66% | 22% (66%) | **C** on errors. Errors caught more than doubled in every language; a few more false alarms |
| 2026-10-03 | [Run 3, Phase 1.1](2026-10-03-run-3.md) | Same method; **fresh 80 held-out sentences** (none from runs 1–2); run 1, Phase 1 and Phase 1.1 scored on the same translations; Vox2 0.4.14 + false-alarm fixes, ~90 opposite pairs, highlights | 93% (Phase 1 91%, run 1 93%) | 5% (8%, 4%) | **78%** (78%, 39%): number 100%, negation 84%, dropped clause 82%, opposite 78%, pronoun 49% | 22% (22%, 61%) | **C** on errors. Same catches as Phase 1, false alarms back near baseline; pronouns weakest |
| 2026-10-04 | [Untranslated text](2026-10-04-untranslated.md) | Targeted test: all 6,160 good translations from runs 1–3, plus 324 garbled sentences (6 languages) translated by Google; Vox2 0.4.17 + "can't check" rule | unchanged (rule fired on 0 good translations) | +0 | **untranslated text: 84%** (half garbled), **94%** (all garbage) shown as "can't check" instead of a score | — | Fixes the "100% match" on gibberish / garbled snips |
| 2026-10-04 | [Phase 1.2: numbers, "not" words, inclusive pronouns](2026-10-04-phase-1-2.md) | **Offline re-score** of runs 2–3's saved translations (no new Google requests), 0.4.18 checks vs Phase 1.2 on the same pairs. Held-out sets had been read before, so optimistic for new text | run 3: 93% → **94%** (run 2: 93% → 94%) | run 3: 4.8% → **4.1%** (run 2: 4.6% → **3.5%**) | run 3: 78% → **79%** (run 2: 77% → 77%) | 21% | **C** on errors. Fewer false alarms in every language; they/xe → he/she and partner → wife now flagged; pronouns marked uncheckable in Tagalog, Hindi, Urdu, Spanish |
| 2026-10-04 | [Run 5, fresh held-out; Phase 1.2b](2026-10-04-run-5.md) | **Fresh 96 held-out sentences** (none used before) + same 40 development; adds a 6th error type, **gender added** (they → he, people → men); run 1, 0.4.18, Phase 1.2 and Phase 1.2b on the same translations. 1.2b was designed after looking at this run | 93% / 91% / 90% / **91%** | 5.0% / 7.1% / 8.3% / **6.9%** | 35% / 65% / 71% / **70%**: negation 85%, number 94%, dropped clause 98%, opposite 58%, pronoun 44%, gender added 9% → **40%** | 30% | **C** on errors. Phase 1.2 raised false alarms on new text; 1.2b fixes it. Earlier phases score lower on fresh text too |

When you add a run, keep the same columns. If the method changed (more languages, new error types, different engines), say how in the Method column so rows stay comparable.

## How the score works

### The method, exactly

Code: [`resources/meaning.js`](../../resources/meaning.js) (scoring) and [`resources/meaning-worker.js`](../../resources/meaning-worker.js) (model).

**Inputs.**

- **A**: the text you typed, trimmed.
- **B**: the back-translation. It always comes from Google Translate (`translate.googleapis.com`, `client=gtx`), whichever engine made the forward translation.

**0. Untranslated text.** Before scoring, the *translation* is checked for text that came through untranslated (gibberish, a garbled snip, text already in the other language), which would otherwise come back unchanged and score ~100%. A stretch of the translation copied word for word from A (lowercase words count 1, capitalized ½, 6+ to fire), or 80%+ of A's words (4+ words) appearing in it, means **can't check**: no score, the copied words underlined. Code: `untranslated()` in [`resources/meaning-checks.js`](../../resources/meaning-checks.js); test: [2026-10-04](2026-10-04-untranslated.md).

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

### Targeted checks (Phase 1, from run 2)

On top of the similarity score, `resources/meaning-checks.js` compares your text with the ↩ line for meaning flips the score barely notices: a negation appearing or disappearing, he/she swapped, an opposite word, a changed month or weekday, and a ↩ line under 60% as long as your text (part missing). Number words count as numbers ("two" = 2). Any of these caps the score at 60 ("check the details"), the word behind it is underlined in the ↩ line, and the hover card says what changed and lists your words that didn't come back. Word lists are English for now. Details and measurements: [run 2](2026-10-03-run-2.md), [run 3](2026-10-03-run-3.md).

**Phase 1.2b** ([run 5](2026-10-04-run-5.md)): built negative words (unharmed, treeless, immoral) only cancel a plain "not" on the other side; they never raise a flag by themselves. A gendered word for a neutral one only counts when your text states no gender.

**Phase 1.2** ([report](2026-10-04-phase-1-2.md)): numbers written differently match (eighteenth = 18th, 90°F = 32°C, "340 and 500 million", "both" = two, conversions in brackets); more "not" words (unharmed, treeless, immoral…) and phrases that aren't negations ("not long ago", "No. 9"); pronouns are inclusive: singular *they* and neopronouns count, a he/she appearing where you wrote they/xe/ze, or a gendered word for a neutral one (partner → wife), caps the score; a neopronoun that comes back as "they" keeps it below 85. In Tagalog, Hindi, Urdu and Spanish, where pronouns can't survive the round trip, the hover card says pronouns can't be checked.

### Next steps for the score

In order, based on the [run 3 report](2026-10-03-run-3.md):

1. **Sharpen the targeted checks** ([#28](https://github.com/chrisqtruong/vox2/issues/28)): number words like "eighteen" / "a couple of thousand" / "dozens", unit conversions, *un-…-able* negations ("unbreakable"); for languages that don't mark he/she, say the pronoun can't be checked instead of implying it's fine.
2. **Show what changed** between your text and the ↩ line, not just a number ([#27](https://github.com/chrisqtruong/vox2/issues/27)).
3. **Translate back with a different engine** than the one that translated ([#29](https://github.com/chrisqtruong/vox2/issues/29)), and an **optional AI check** of the meaning ([#7](https://github.com/chrisqtruong/vox2/issues/7)).
4. Per-language thresholds, only if still needed after 1–3.

## Re-running the test

The test kit is in [`tools/meaning-bench/`](../../tools/meaning-bench/) with step-by-step instructions. It uses Vox2's real scoring code and a fixed set of sentences, so a new run is directly comparable with the history above.
