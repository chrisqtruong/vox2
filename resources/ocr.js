// Reading text out of a screen snip (OCR) with Tesseract.js, on this computer.
// The library and each language's data download the first time they're needed, then come from
// cache. It's released after a few idle minutes, like the voice model.

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
    s.onerror = () => { libLoading = null; reject(new Error('could not load the text reader (offline?)')); };
    document.head.append(s);
  });
  return libLoading;
}

function release() {
  worker?.terminate();
  worker = null;
  workerLangs = '';
}

// langs: Tesseract names, e.g. ['eng', 'vie']
export async function readText(image, langs) {
  clearTimeout(idleTimer);
  const key = langs.join('+');
  const Tesseract = await loadLib();
  if (!worker || workerLangs !== key) {
    release();
    worker = await Tesseract.createWorker(langs);
    workerLangs = key;
  }
  const { data } = await worker.recognize(image);
  idleTimer = setTimeout(release, IDLE_MS);
  let text = (data.text || '').trim();
  // Screen text is broken into lines; rejoin lines of the same paragraph so it translates well.
  const cjk = /[぀-ヿ㐀-鿿가-힯]/.test(text);
  text = text.replace(/([^\n])\n(?!\n)/g, cjk ? '$1' : '$1 ').replace(/[ \t]+/g, ' ');
  return text;
}
