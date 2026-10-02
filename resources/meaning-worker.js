// Turns sentences into "meaning vectors" with a small multilingual model, off the UI thread.
// Model files (~120 MB) download from Hugging Face once, then come from the browser cache.
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'; // 50+ languages, built for paraphrases
let embed = null;

function load() {
  embed ??= pipeline('feature-extraction', MODEL, {
    device: 'wasm', dtype: 'q8',
    progress_callback: (p) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) postMessage({ type: 'progress', loaded: p.loaded, total: p.total });
    },
  }).catch((err) => { embed = null; throw err; });
  return embed;
}

// { id, a, b } → { id, cosine }: how alike the two meanings are, -1 … 1 (in practice 0 … 1).
onmessage = async ({ data }) => {
  try {
    const run = await load();
    const out = await run([data.a, data.b], { pooling: 'mean', normalize: true });
    const [va, vb] = out.tolist();
    let cosine = 0;
    for (let i = 0; i < va.length; i++) cosine += va[i] * vb[i];
    postMessage({ id: data.id, cosine });
  } catch (err) {
    postMessage({ id: data.id, error: err.message || String(err) });
  }
};
