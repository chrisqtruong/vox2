# Direct-comparison experiment: embeds every text in a results file with the app's model (8-bit MiniLM, mean pooling, L2 norm).
import json, sys, numpy as np, onnxruntime as ort
from tokenizers import Tokenizer
D = sys.argv[3] if len(sys.argv) > 3 else "minilm/"  # folder with model_quantized.onnx + tokenizer.json (Xenova/paraphrase-multilingual-MiniLM-L12-v2)
tok = Tokenizer.from_file(D + "tokenizer.json"); tok.enable_truncation(128); tok.enable_padding()
sess = ort.InferenceSession(D + "model_quantized.onnx", providers=["CPUExecutionProvider"])
names = [i.name for i in sess.get_inputs()]
def embed(texts):
    out = []
    for i in range(0, len(texts), 64):
        enc = tok.encode_batch(texts[i:i+64])
        ids = np.array([e.ids for e in enc], dtype=np.int64); m = np.array([e.attention_mask for e in enc], dtype=np.int64)
        feed = {"input_ids": ids, "attention_mask": m}
        if "token_type_ids" in names: feed["token_type_ids"] = np.zeros_like(ids)
        h = sess.run(None, feed)[0]
        v = (h * m[..., None]).sum(1) / m.sum(1, keepdims=True)
        out.append(v / np.linalg.norm(v, axis=1, keepdims=True))
    return np.vstack(out)
rows = json.load(open(sys.argv[1]))
texts = sorted({t for r in rows for t in (r["en"], r["translation"], r["back"])})
E = dict(zip(texts, embed(texts)))
cos = lambda a, b: float(E[a] @ E[b])
scale = lambda c: round(min(1, max(0, (c - 0.55) / 0.30)) * 100)
feats = [{"direct": cos(r["en"], r["translation"]), "round": cos(r["en"], r["back"]), "backfwd": cos(r["back"], r["translation"])} for r in rows]
agree = sum(1 for r, f in zip(rows, feats) if abs(scale(f["round"]) - r["similarity"]) <= 2 or r["en"] == r["back"])
print(f"{len(texts)} texts embedded; round-trip similarity matches the app's saved score (±2) on {agree}/{len(rows)} rows")
json.dump(feats, open(sys.argv[2], "w"))
