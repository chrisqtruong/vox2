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
const cache = new Map(); // `${engine}|${voice}|${rate}|${text}` → blob URL
let onEnd = null;
let speaking = 0;        // id of the current request, so a stop cancels a pending one

audio.addEventListener('ended', () => onEnd?.());

export function stop() {
  speaking++;
  audio.pause();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  onEnd?.();
  onEnd = null;
}

async function fetchOpenAI(text, voice, rate, key) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3', speed: 1 + rate / 100 }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    throw new Error(`OpenAI voice: ${msg}`);
  }
  return res.blob();
}

function speakSystem(text, code, rate, done) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = code;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(code.split('-')[0].toLowerCase()));
  if (voice) u.voice = voice;
  u.rate = 1 + rate / 100;
  u.onend = done;
  u.onerror = done;
  speechSynthesis.speak(u);
}

// opts: { text, lang, engine, voice, openaiVoice, rate, key, onStart, onEnd }
export async function speak(opts) {
  stop();
  const id = ++speaking;
  onEnd = opts.onEnd;
  const engine = opts.engine === 'neural' && !native ? 'system' : opts.engine;
  if (engine === 'system') {
    opts.onStart?.();
    return speakSystem(opts.text, opts.lang, opts.rate, () => { if (id === speaking) stop(); });
  }
  const voice = engine === 'openai' ? opts.openaiVoice : opts.voice;
  const cacheKey = [engine, voice, opts.rate, opts.text].join('|');
  let url = cache.get(cacheKey);
  if (!url) {
    const blob = engine === 'openai'
      ? await fetchOpenAI(opts.text, voice, opts.rate, opts.key)
      : new Blob([await speakNeural(opts.text, voice, opts.rate)], { type: 'audio/mpeg' });
    url = URL.createObjectURL(blob);
    cache.set(cacheKey, url);
    if (cache.size > 12) {
      const [oldKey, oldUrl] = cache.entries().next().value;
      URL.revokeObjectURL(oldUrl);
      cache.delete(oldKey);
    }
  }
  if (id !== speaking) return; // stopped while loading
  audio.src = url;
  opts.onStart?.();
  await audio.play();
}
