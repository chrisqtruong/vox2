// Runs Whisper locally (transformers.js + ONNX Runtime) off the UI thread.
// Model files download from Hugging Face once, then come from the browser cache.
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';

let asr = null;
let loaded = '';
let device = '';
let queue = Promise.resolve();

async function hasWebGPU() {
  try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch { return false; }
}

async function load(model, announce = false) {
  if (asr && loaded === model) {
    if (announce) postMessage({ type: 'ready', model, device });
    return asr;
  }
  asr = null;
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
      postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
    }
  };
  const id = `onnx-community/whisper-${model}`;
  // GPU is several times faster; fall back to CPU when it isn't available.
  if (await hasWebGPU()) {
    try {
      asr = await pipeline('automatic-speech-recognition', id, {
        device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback,
      });
      device = 'gpu';
    } catch { asr = null; }
  }
  if (!asr) {
    asr = await pipeline('automatic-speech-recognition', id, { device: 'wasm', dtype: 'q8', progress_callback });
    device = 'cpu';
  }
  loaded = model;
  postMessage({ type: 'ready', model, device });
  return asr;
}

// One job at a time; the model can't run two transcriptions at once.
onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      if (data.type === 'load') return void await load(data.model, true);
      const run = await load(data.model);
      const t0 = performance.now();
      const out = await run(data.audio, { language: data.language || null, task: 'transcribe' });
      postMessage({ type: 'result', id: data.id, final: data.final, text: out.text, ms: Math.round(performance.now() - t0) });
    } catch (err) {
      postMessage({ type: 'error', id: data.id, message: err.message || String(err) });
    }
  });
};
