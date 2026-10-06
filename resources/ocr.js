// Reading text out of a screen snip (OCR) with Tesseract.js, on this computer.
// The library and each language's data download the first time they're needed, then come from
// cache. It's released after a few idle minutes, like the voice model.

import { tr } from './i18n.js';

const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const IDLE_MS = 3 * 60e3;

// Google Translate code → Tesseract language data name.
const TESS = {
  en: 'eng', vi: 'vie', es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pt: 'por', nl: 'nld', sv: 'swe',
  da: 'dan', no: 'nor', fi: 'fin', pl: 'pol', cs: 'ces', sk: 'slk', sl: 'slv', hr: 'hrv', sr: 'srp',
  hu: 'hun', ro: 'ron', bg: 'bul', ru: 'rus', uk: 'ukr', be: 'bel', el: 'ell', tr: 'tur', lt: 'lit',
  lv: 'lav', et: 'est', ja: 'jpn', ko: 'kor', 'zh-CN': 'chi_sim', 'zh-TW': 'chi_tra', ar: 'ara',
  fa: 'fas', ur: 'urd', iw: 'heb', hi: 'hin', bn: 'ben', ta: 'tam', te: 'tel', mr: 'mar', gu: 'guj',
  kn: 'kan', ml: 'mal', pa: 'pan', th: 'tha', km: 'khm', lo: 'lao', my: 'mya', ka: 'kat', hy: 'hye',
  am: 'amh', id: 'ind', ms: 'msa', tl: 'tgl', sw: 'swa', ca: 'cat', gl: 'glg', eu: 'eus', ga: 'gle',
  cy: 'cym', is: 'isl', mk: 'mkd', sq: 'sqi', az: 'aze', kk: 'kaz', uz: 'uzb', mn: 'mon', ne: 'nep',
  si: 'sin', la: 'lat', eo: 'epo', af: 'afr', yi: 'yid', ht: 'hat',
};

export const tesseractLang = (code) => TESS[code] || null;

let libLoading = null;
let worker = null;
let workerLangs = '';
let idleTimer = null;

function loadLib() {
  libLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIB;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { libLoading = null; reject(new Error(tr('could not load the text reader (offline?)'))); };
    document.head.append(s);
  });
  return libLoading;
}

function release() {
  worker?.terminate();
  worker = null;
  workerLangs = '';
}

// Tesseract reads print best: dark text on light paper, letters a few dozen pixels tall. Screen
// text is often small and light-on-dark (dark themes), which is when it garbles words and reads
// "I" as "|". So: enlarge small snips, go grayscale, flip light-on-dark, and stretch the contrast.
async function prepare(image) {
  const bmp = await createImageBitmap(image);
  const scale = Math.min(3, Math.max(1, 1800 / bmp.width)); // small snips up to 3×, big ones as is
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const n = px.length / 4;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const g = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
    gray[i] = g;
    hist[g]++;
    sum += g;
  }
  // The background is whatever most of the snip is: if that's dark, flip it to dark-on-light.
  const invert = sum / n < 128;
  // Contrast: map the 1st..99th percentile of brightness onto the full range.
  const pct = (p) => { let c = 0; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= n * p) return v; } return 255; };
  const lo = pct(0.01);
  const hi = Math.max(lo + 1, pct(0.99));
  for (let i = 0; i < n; i++) {
    let g = Math.min(255, Math.max(0, Math.round(((gray[i] - lo) * 255) / (hi - lo))));
    if (invert) g = 255 - g;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g;
    px[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Tesseract's classic mix-up on screen fonts: a capital I read as "|". In ordinary text a "|"
// standing where a word starts ("| think", "|'m", "|t") is an I.
const fixPipes = (text) => text.replace(/(^|[\s"“'‘(\[])\|(?=[\s'’.,!?;:)\]]|[a-z]|$)/g, '$1I');

// langs: Tesseract names, e.g. ['eng', 'vie']
export async function readText(image, langs) {
  clearTimeout(idleTimer);
  const key = langs.join('+');
  const Tesseract = await loadLib();
  if (!worker || workerLangs !== key) {
    release();
    worker = await Tesseract.createWorker(langs);
    // One block of text (a snip), keep the spaces between words, and the scale screen text is at.
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300' });
    workerLangs = key;
  }
  const { data } = await worker.recognize(await prepare(image));
  idleTimer = setTimeout(release, IDLE_MS);
  const text = joinLines(data.text || '');
  return /[぀-ヿ㐀-鿿가-힯]/.test(text) ? text : fixPipes(text);
}

// Screen text is broken into lines; rejoin lines of the same paragraph so it translates well
// (blank lines between paragraphs stay). Chinese and Japanese lines join without a space.
export function joinLines(text) {
  text = text.trim();
  const cjk = /[぀-ヿ㐀-鿿가-힯]/.test(text);
  return text.replace(/([^\n])\n(?!\n)/g, cjk ? '$1' : '$1 ').replace(/[ \t]+/g, ' ');
}
