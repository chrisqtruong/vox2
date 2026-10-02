// Microphone → text. Speech is cut into segments at pauses; while you talk the
// current segment is re-transcribed about once a second (shown as pending),
// and when you pause it gets one last pass and becomes final.

const SAMPLE_RATE = 16000;
const TICK_MS = 80;
const NEVER_SPOKE_MS = 8000; // auto-stop gives up if you never say anything
const PARTIAL_EVERY_MS = 900;
const PAUSE_MS = 700;        // silence that ends a segment
const MAX_SEGMENT_S = 25;    // Whisper sees 30 s at most
const PREROLL_S = 0.4;       // keep a little audio before speech starts so first syllables aren't cut
const VOICE_RMS = 0.012;     // loudness that counts as speech

// Whisper's languages, keyed by Google Translate codes where they differ.
const WHISPER = new Set(('en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su').split(' '));
const ALIAS = { 'zh-CN': 'zh', 'zh-TW': 'zh', iw: 'he' };
export const whisperLang = (code) => {
  const c = ALIAS[code] || code;
  return WHISPER.has(c) ? c : null; // null = let Whisper detect it
};

export const STT_MODELS = { tiny: '41 MB', base: '77 MB', small: '250 MB' };

const tapWorklet = URL.createObjectURL(new Blob([`
  class Tap extends AudioWorkletProcessor {
    process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
  }
  registerProcessor('tap', Tap);
`], { type: 'text/javascript' }));

let worker = null;
const pending = new Map();
let workerListener = null; // app-level progress / ready events
let nextId = 1;

// A loaded model holds ~2 GB of memory (RAM + graphics card). Let it go after a while
// without dictation; it reloads from the disk cache in a few seconds when next needed.
const UNLOAD_AFTER_MS = 5 * 60e3;
let unloadTimer = null;

let keepLoaded = false; // the "always ready" setting

export function setKeepLoaded(on) {
  keepLoaded = on;
  if (on) clearTimeout(unloadTimer);
  else if (worker) scheduleUnload();
}

// Is this model already saved on disk (so loading it is a quick wake-up, not a download)?
export async function isModelSaved(model) {
  try {
    const cache = await caches.open('transformers-cache');
    return (await cache.keys()).some((r) => r.url.includes(`/whisper-${model}/`));
  } catch {
    return false;
  }
}

export function scheduleUnload(ms = UNLOAD_AFTER_MS) {
  clearTimeout(unloadTimer);
  if (keepLoaded) return;
  unloadTimer = setTimeout(() => {
    if (!worker) return;
    if (pending.size) return scheduleUnload(ms); // still finishing a phrase
    worker.terminate(); // frees the model and its graphics-card memory
    worker = null;
  }, ms);
}

function getWorker() {
  clearTimeout(unloadTimer);
  if (worker) return worker;
  worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress' || data.type === 'ready' || !data.id) return workerListener?.(data);
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    data.type === 'error' ? job.reject(new Error(data.message)) : job.resolve(data);
  };
  worker.onerror = (e) => workerListener?.({ type: 'error', message: e.message || 'Whisper failed to start' });
  return worker;
}

export function onWhisperEvent(fn) { workerListener = fn; }
export function preloadWhisper(model) { getWorker().postMessage({ type: 'load', model }); }

function whisper(audio, { model, language, final }) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: 'transcribe', id, audio, model, language: whisperLang(language), final });
  });
}

function wav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SAMPLE_RATE, true); v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buf], { type: 'audio/wav' });
}

async function openai(audio, { key, model, language }) {
  const form = new FormData();
  form.append('file', wav(audio), 'speech.wav');
  form.append('model', model);
  const lang = whisperLang(language);
  if (lang) form.append('language', lang);
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    throw new Error(`OpenAI transcription: ${msg}`);
  }
  return { text: (await res.json()).text };
}

// Whisper invents text for noise and silence ("[BLANK_AUDIO]", "(music)", "♪").
const clean = (t) => t.replace(/[[(][^\])]*[\])]|♪+/g, '').replace(/\s+/g, ' ').trim();

function concat(chunks) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export class Dictation {
  constructor({ onPartial, onFinal, onError, onLevel = () => {}, onAutoStop = () => {} }) {
    Object.assign(this, { onPartial, onFinal, onError, onLevel, onAutoStop });
    this.active = false;
  }

  // opts: { deviceId, language, engine: 'whisper' | 'openai', model, key, stream? }
  async start(opts) {
    this.opts = opts;
    this.stream = opts.stream || await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
        channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      },
    });
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    await this.ctx.audioWorklet.addModule(tapWorklet);
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.tap = new AudioWorkletNode(this.ctx, 'tap');
    this.chunks = [];
    this.recent = 0;          // squared-sample sum since last tick
    this.recentN = 0;
    this.heardVoice = false;
    this.lastVoice = 0;
    this.lastPartial = 0;
    this.startedAt = performance.now();
    this.everSpoke = false;
    this.partialBusy = false;
    this.segment = 0;
    this.finals = Promise.resolve();
    this.tap.port.onmessage = ({ data }) => {
      this.chunks.push(data);
      for (const s of data) this.recent += s * s;
      this.recentN += data.length;
      // Tick off the audio itself, not a timer: background windows get their timers throttled,
      // but audio keeps flowing, so dictation still works while you're in another app.
      if (this.active && this.recentN >= TICK_MS * SAMPLE_RATE / 1000) this.tick();
    };
    this.src.connect(this.tap);
    this.active = true;
    if (opts.engine === 'whisper') preloadWhisper(opts.model);
  }

  samples() { return this.chunks.reduce((n, c) => n + c.length, 0); }

  tick() {
    const now = performance.now();
    const rms = this.recentN ? Math.sqrt(this.recent / this.recentN) : 0;
    this.recent = 0;
    this.recentN = 0;
    this.onLevel(Math.min(1, rms / 0.08));
    if (rms > VOICE_RMS) { this.heardVoice = true; this.everSpoke = true; this.lastVoice = now; }

    // Auto-stop mode: you went quiet (or never started talking).
    const auto = this.opts.autoStopMs;
    if (auto && (this.everSpoke ? now - this.lastVoice > auto : now - this.startedAt > NEVER_SPOKE_MS)) {
      return this.onAutoStop();
    }

    if (!this.heardVoice) {
      // Nothing said yet: keep only a short pre-roll.
      let keep = PREROLL_S * SAMPLE_RATE;
      while (this.chunks.length > 1 && this.samples() - this.chunks[0].length > keep) this.chunks.shift();
      return;
    }
    const long = this.samples() > MAX_SEGMENT_S * SAMPLE_RATE;
    if (now - this.lastVoice > PAUSE_MS || long) return this.finishSegment();
    if (this.opts.engine === 'whisper' && !this.partialBusy && now - this.lastPartial > PARTIAL_EVERY_MS) {
      this.partial();
    }
  }

  async partial() {
    this.partialBusy = true;
    this.lastPartial = performance.now();
    const seg = this.segment;
    try {
      const { text } = await whisper(concat(this.chunks), { ...this.opts, final: false });
      if (this.active && seg === this.segment) this.onPartial(clean(text));
    } catch (err) {
      this.fail(err);
    } finally {
      this.partialBusy = false;
      this.lastPartial = performance.now();
    }
  }

  finishSegment() {
    const audio = concat(this.chunks);
    this.chunks = [];
    this.heardVoice = false;
    this.segment++;
    const run = () => (this.opts.engine === 'openai' ? openai(audio, this.opts) : whisper(audio, { ...this.opts, final: true }));
    // Finals land in the order they were spoken.
    this.finals = this.finals.then(run).then(({ text }) => this.onFinal(clean(text)), (err) => this.fail(err));
    return this.finals;
  }

  fail(err) {
    this.onError(err);
    this.stop(false);
  }

  // flush = transcribe what was said since the last pause before stopping.
  async stop(flush = true) {
    if (!this.active) return;
    this.active = false; // ignore late partials; finals still arrive
    this.tap.port.onmessage = null;
    try { this.src.disconnect(); } catch {}
    if (!this.opts.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.ctx.close().catch(() => {});
    if (flush && this.heardVoice) await this.finishSegment();
    else await this.finals;
    if (this.opts.engine === 'whisper') scheduleUnload();
  }
}

export async function listMics() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
}
