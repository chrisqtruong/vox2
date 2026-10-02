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
  // The first run after loading is several times slower (the graphics card prepares its
  // programs). When loading ahead of time, spend it on a second of silence so it never delays
  // your first words. If your speech is already waiting, skip it: that run warms it up anyway.
  if (!waiting) try { await asr(new Float32Array(16000), { language: 'en', task: 'transcribe' }); } catch {}
  loaded = model;
  postMessage({ type: 'ready', model, device });
  return asr;
}

// One job at a time; the model can't run two transcriptions at once.
let waiting = 0; // transcriptions queued but not started
onmessage = ({ data }) => {
  if (data.type === 'transcribe') waiting++;
  queue = queue.then(async () => {
    if (data.type === 'transcribe') waiting--;
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
