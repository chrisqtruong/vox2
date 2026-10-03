# Meaning check: how it works and how well it works

Vox2's meaning check translates your translation back into your language (the faint ↩ line) and scores how much of your meaning survived (`92% match`). This page explains exactly how the score is computed and keeps a dated record of every test of it, so improvements can be measured over time.

- [Test history](#test-history)
- [How the score works](#how-the-score-works)
- [Re-running the test](#re-running-the-test)

## Test history

Each run has a dated report (what was tested, how, results, what we noticed, grades) and its raw results. Compare runs here; read a report for details.

| Date | Report | Method | Good shown as "meaning kept" | False alarms | Meaning errors caught | Missed | Overall |
|---|---|---|---|---|---|---|---|
| 2026-10-03 | [Run 1, baseline](2026-10-03.md) | 40 FLORES-200 sentences × 11 languages, 5 planted error types, Google both ways; Vox2 0.4.12 | 93% | 4% | 29% (numbers 100%, others 5–18%) | 71% | Confirms good translations well; misses most meaning errors except numbers |

When you add a run, keep the same columns. If the method changed (more languages, new error types, different engines), say how in the Method column so rows stay comparable.

## How the score works

### The method, exactly

Code: [`resources/meaning.js`](../../resources/meaning.js) (scoring) and [`resources/meaning-worker.js`](../../resources/meaning-worker.js) (model).

**Inputs.**

- **A**: the text you typed, trimmed.
- **B**: the back-translation. It always comes from Google Translate (`translate.googleapis.com`, `client=gtx`), whichever engine made the forward translation.

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

### Next steps for the score

In order, based on the [2026-10-03 test](2026-10-03.md):

1. **Catch negations, swapped pronouns, opposites, names and dates** ([#28](https://github.com/chrisqtruong/vox2/issues/28)), and read number words as numbers (about half of today's false alarms).
2. **Show what changed** between your text and the ↩ line, not just a number ([#27](https://github.com/chrisqtruong/vox2/issues/27)).
3. **Translate back with a different engine** than the one that translated ([#29](https://github.com/chrisqtruong/vox2/issues/29)), and an **optional AI check** of the meaning ([#7](https://github.com/chrisqtruong/vox2/issues/7)).
4. Per-language thresholds, only if still needed after 1–3.

## Re-running the test

The test kit is in [`tools/meaning-bench/`](../../tools/meaning-bench/) with step-by-step instructions. It uses Vox2's real scoring code and a fixed set of sentences, so a new run is directly comparable with the history above.
