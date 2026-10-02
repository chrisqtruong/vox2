// Read-aloud. Engines:
//   neural  – Microsoft's natural neural voices (free; desktop app only, via Rust)
//   openai  – OpenAI voices (uses the ChatGPT key)
//   system  – voices installed on this computer (offline, more robotic)
import { EDGE_VOICES } from './voices.js';
import { native, speakNeural } from './platform.js';

// Google Translate code → locale prefix used by the voice list.
const ALIAS = { iw: 'he', jw: 'jv', tl: 'fil', no: 'nb' };
// When a language has several regions, which one to prefer.
const PREFERRED = {
  en: 'en-US', es: 'es-MX', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', ar: 'ar-SA', it: 'it-IT',
  nl: 'nl-NL', ko: 'ko-KR', ja: 'ja-JP', ru: 'ru-RU', hi: 'hi-IN', bn: 'bn-IN', ta: 'ta-IN',
  ur: 'ur-PK', sw: 'sw-KE', ms: 'ms-MY', fa: 'fa-IR', zh: 'zh-CN',
};

export const OPENAI_VOICES = [
  ['coral', 'warm, female'], ['nova', 'bright, female'], ['shimmer', 'soft, female'], ['sage', 'calm, female'],
  ['alloy', 'neutral'], ['ash', 'clear, male'], ['ballad', 'gentle, male'], ['echo', 'smooth, male'],
  ['onyx', 'deep, male'], ['verse', 'expressive, male'], ['fable', 'storyteller'],
];

const parseName = (n) => {
  const [lang, region, ...rest] = n.split('-');
  const locale = `${lang}-${region}`;
  const base = rest.join('-').replace(/Neural$/, '');
  const multi = base.endsWith('Multilingual');
  const person = base.replace(/Multilingual$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return { locale, region, person, multi };
};

// Voices for a Google language code, best region first.
export function voicesFor(code) {
  const lang = ALIAS[code] || code;
  const prefix = `${lang}-`;
  const exact = lang.includes('-'); // zh-CN / zh-TW already name a region
  const pref = PREFERRED[lang];
  return EDGE_VOICES
    .filter(([n]) => n.startsWith(prefix) && (exact || n.split('-')[0] === lang))
    .map(([name, g]) => ({ name, gender: g, ...parseName(name) }))
    .sort((a, b) => (b.locale === pref) - (a.locale === pref) || a.multi - b.multi || a.locale.localeCompare(b.locale));
}

export function voiceLabel(v) {
  return `${v.person}${v.multi ? ' (multilingual)' : ''} · ${v.gender === 'F' ? 'female' : 'male'} · ${v.region}`;
}

export function defaultVoice(code, gender) {
  const list = voicesFor(code);
  return (list.find((v) => v.gender === gender) || list[0])?.name || '';
}

/* playback */

const audio = new Audio();
audio.preservesPitch = true; // faster or slower without the chipmunk effect
let speed = 1;  // 0.75 / 1 / 1.25, applied while playing, so a change takes effect right away
let volume = 1; // 0 – 1

export function setSpeed(x) { speed = x; audio.defaultPlaybackRate = x; audio.playbackRate = x; }
export function setVolume(v) { volume = v; audio.volume = v; }

const cache = new Map(); // `${engine}|${voice}|${text}` → { url, words }
let onEnd = null;
let speaking = 0;        // id of the current request, so a stop cancels a pending one
let onTime = null;       // playback position, for the word highlight

// Finished on its own: run the end callback once and drop it. Keeping it around meant the next
// speak()'s stop() ran it again, which reset the new read's stop button in the same box.
audio.addEventListener('ended', () => {
  const done = onEnd;
  onEnd = null;
  onTime = null;
  done?.();
});
// Media events keep firing in a background window, so they're the reliable clock for other
// windows (the bubble); animation frames give smooth steps while this window is on screen.
audio.addEventListener('timeupdate', () => onTime?.(audio.currentTime * 1000, true, audio.playbackRate));
let ticking = false;
function tick() {
  if (audio.paused || !onTime) { ticking = false; return; }
  onTime(audio.currentTime * 1000, false, audio.playbackRate);
  requestAnimationFrame(tick);
}
audio.addEventListener('playing', () => {
  onTime?.(audio.currentTime * 1000, true, audio.playbackRate);
  if (!ticking) { ticking = true; tick(); }
});

export function stop() {
  speaking++;
  audio.pause();
  audio.currentTime = 0;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  onTime = null;
  onEnd?.();
  onEnd = null;
}

// Word timings → [[start ms, from, to], …] as character positions in `text`. The voice service
// names each word, so find them in order, skipping any it spelled differently.
function placeWords(text, timed) {
  const out = [];
  let at = 0;
  const lower = text.toLowerCase();
  for (const [ms, , word] of timed) {
    let i = text.indexOf(word, at);
    if (i < 0) i = lower.indexOf(word.toLowerCase(), at);
    if (i < 0 || i - at > 40) continue;
    out.push([ms, i, i + word.length]);
    at = i + word.length;
  }
  return out;
}

// OpenAI voices don't say when each word is spoken, so estimate: share the audio's length out
// by word length, with extra room for the pauses after commas and full stops.
function estimateWords(text, lang, durationMs) {
  const seg = new Intl.Segmenter(lang, { granularity: 'word' });
  const words = [];
  for (const s of seg.segment(text)) {
    if (s.isWordLike) { words.push({ from: s.index, to: s.index + s.segment.length, weight: s.segment.length + 2 }); continue; }
    const last = words[words.length - 1];
    if (!last) continue;
    if (/[.!?。！？]/.test(s.segment)) last.weight += 8;
    else if (/[,;:、，；：]/.test(s.segment)) last.weight += 4;
  }
  const total = words.reduce((n, w) => n + w.weight, 0);
  const lead = 150;
  const span = Math.max(0, durationMs - lead - 250);
  let ms = lead;
  return words.map((w) => {
    const mark = [ms, w.from, w.to];
    ms += (w.weight / total) * span;
    return mark;
  });
}

async function fetchOpenAI(text, voice, key) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3' }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    throw new Error(`OpenAI voice: ${msg}`);
  }
  return res.blob();
}

// System voices report each word as they reach it (most do; some report nothing).
function speakSystem(text, code, done, onWords, onTime) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = code;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(code.split('-')[0].toLowerCase()));
  if (voice) u.voice = voice;
  u.rate = speed; // fixed once it starts: a change applies from the next read
  u.volume = volume;
  const start = performance.now();
  const words = [];
  u.onboundary = (e) => {
    if (e.name !== 'word') return;
    const len = e.charLength || (/^\S+/.exec(text.slice(e.charIndex))?.[0].length ?? 0);
    const ms = performance.now() - start;
    words.push([ms, e.charIndex, e.charIndex + len]);
    onWords?.(words);
    onTime?.(ms, true);
  };
  u.onend = done;
  u.onerror = done;
  speechSynthesis.speak(u);
}

// opts: { text, lang, engine, voice, openaiVoice, key, onStart, onEnd, onWords, onTime }
//   onWords([[start ms, from, to], …]) – when each word of `text` is spoken, once known
//   onTime(ms, fromMediaEvent, rate)  – playback position, many times a second, and the speed
export async function speak(opts) {
  stop();
  const id = ++speaking;
  onEnd = opts.onEnd;
  const engine = opts.engine === 'neural' && !native ? 'system' : opts.engine;
  if (engine === 'system') {
    opts.onStart?.();
    onTime = opts.onTime;
    return speakSystem(opts.text, opts.lang, () => { if (id === speaking) stop(); }, opts.onWords, opts.onTime);
  }
  const voice = engine === 'openai' ? opts.openaiVoice : opts.voice;
  const cacheKey = [engine, voice, opts.text].join('|');
  let hit = cache.get(cacheKey);
  if (!hit) {
    let blob;
    let words = null;
    if (engine === 'openai') blob = await fetchOpenAI(opts.text, voice, opts.key);
    else {
      const res = await speakNeural(opts.text, voice, 0);
      blob = new Blob([res.audio], { type: 'audio/mpeg' });
      words = placeWords(opts.text, res.words);
    }
    hit = { url: URL.createObjectURL(blob), words };
    cache.set(cacheKey, hit);
    if (cache.size > 12) {
      const [oldKey, old] = cache.entries().next().value;
      URL.revokeObjectURL(old.url);
      cache.delete(oldKey);
    }
  }
  if (id !== speaking) return; // stopped while loading
  audio.src = hit.url;
  audio.playbackRate = speed;
  audio.volume = volume;
  onTime = opts.onTime;
  opts.onStart?.();
  if (hit.words) opts.onWords?.(hit.words);
  else audio.addEventListener('loadedmetadata', () => {
    if (id !== speaking || !Number.isFinite(audio.duration)) return;
    hit.words = estimateWords(opts.text, opts.lang, audio.duration * 1000);
    opts.onWords?.(hit.words);
  }, { once: true });
  await audio.play();
}
