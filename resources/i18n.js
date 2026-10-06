// The app's own language (settings → app language): every word Vox2 shows, in your language.
// English is the source: each piece of text is looked up by its English wording in
// i18n/<code>.json (made by tools/i18n, see its README), and falls back to English when a
// language doesn't have it yet. Proper names (themes, fonts, engines, models) stay as they are.
//
//   tr('history')                      → "lịch sử"
//   tr('{n} still needed', { n: 2 })   → "vẫn cần 2"
//   N_('slow')                         marks a string for the extractor without translating it yet
//   translatePage(root)                translates the static text of a page (text, title, placeholder…)
import { LANGUAGES } from './languages.js';

let lang = 'en';
let strings = {};

export const N_ = (s) => s;

export function tr(en, vars) {
  let s = strings[en] || en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

export const uiLang = () => lang;

// Google's language codes (Vox2's list) → the standard ones browsers know, for names and text direction.
const BCP47 = { iw: 'he', jw: 'jv', tl: 'fil', 'mni-Mtei': 'mni', 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', gom: 'kok' };
export const bcp47 = (code) => BCP47[code] || code;
const RTL = new Set(['ar', 'iw', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb']);
export const isRtl = (code) => RTL.has(code);

// A language's name in that language ("Tiếng Việt"), so you can find yours without reading English.
export function nativeName(code) {
  try {
    const n = new Intl.DisplayNames([bcp47(code)], { type: 'language' }).of(bcp47(code));
    if (n && n !== bcp47(code)) return n.charAt(0).toLocaleUpperCase(bcp47(code)) + n.slice(1);
  } catch {}
  return null;
}

// A language's name in the app's language, for the language menus ("Vietnamese" → "tiếng Việt").
// The English names stay what the AI engines see (languages.js); this is only for showing.
let namer = null;
export function langLabel(code, english) {
  if (lang === 'en') return english;
  try {
    namer ||= new Intl.DisplayNames([bcp47(lang)], { type: 'language' });
    const n = namer.of(bcp47(code));
    if (n && n !== bcp47(code)) return n;
  } catch {}
  return english;
}

// The languages the app can be shown in: English plus every language with a strings file.
// Kept in step with resources/i18n/ by tools/i18n (index.json lists them).
let available = null;
export async function uiLanguages() {
  if (!available) {
    try { available = ['en', ...(await (await fetch(new URL('./i18n/index.json', import.meta.url))).json())]; } catch { available = ['en']; }
  }
  return LANGUAGES.filter(([code]) => available.includes(code));
}

// "Match this computer": the system language, if Vox2 has it (zh-TW → zh-TW, pt-BR → pt, he → iw…).
export async function systemLang() {
  const codes = (await uiLanguages()).map(([c]) => c);
  const back = Object.fromEntries(Object.entries(BCP47).map(([g, b]) => [b.toLowerCase(), g]));
  for (const pref of navigator.languages || [navigator.language || 'en']) {
    const p = pref.toLowerCase();
    if (/^zh-(tw|hk|mo|hant)/.test(p) && codes.includes('zh-TW')) return 'zh-TW';
    if (p.startsWith('zh') && codes.includes('zh-CN')) return 'zh-CN';
    const base = p.split('-')[0];
    const hit = codes.find((c) => c.toLowerCase() === p) || codes.find((c) => c.toLowerCase() === base) || back[base];
    if (hit && codes.includes(hit)) return hit;
    if (base === 'nb' || base === 'nn') return codes.includes('no') ? 'no' : 'en';
  }
  return 'en';
}

// Switch the app's language: 'auto' follows the computer. Resolves to the language actually used.
export async function setUiLang(choice) {
  const code = choice === 'auto' || !choice ? await systemLang() : choice;
  let next = {};
  if (code !== 'en') {
    try { next = await (await fetch(new URL(`./i18n/${code}.json`, import.meta.url))).json(); } catch { next = {}; }
  }
  strings = next;
  lang = Object.keys(next).length || code === 'en' ? code : 'en';
  namer = null;
  document.documentElement.lang = bcp47(lang);
  return lang;
}

/* The page's own text (index.html and friends) is written in English and translated in place.
   Everything with readable text is covered except what's marked translate="no" (names, user text).
   Each node remembers its English, so switching languages again starts from the source. An
   element marked data-i18n="html" is translated as a whole, markup included (a sentence with a
   bold word in it), instead of word fragment by fragment. */
const ATTRS = ['title', 'placeholder', 'aria-label', 'data-placeholder'];
// What each node said in English, and what we last wrote there. If code has changed it since,
// the new value is the source from then on (it was already written in the current language).
const seen = new WeakMap(); // text node or element → { en, wrote } / { [attr]: { en, wrote } }

export const normalize = (s) => s.replace(/\s+/g, ' ').trim();

function source(rec, current) {
  if (!rec || current !== rec.wrote) return { en: current, wrote: current };
  return rec;
}

function translateText(node) {
  const rec = source(seen.get(node), node.nodeValue);
  const key = normalize(rec.en);
  if (key && /\p{L}/u.test(key)) {
    const [, lead, , tail] = rec.en.match(/^(\s*)([\s\S]*?)(\s*)$/);
    rec.wrote = lang === 'en' || !strings[key] ? rec.en : lead + strings[key] + tail;
    node.nodeValue = rec.wrote;
  }
  seen.set(node, rec);
}

function translateAttrs(el) {
  const recs = seen.get(el) || {};
  for (const a of ATTRS) {
    // A button whose title became a themed tooltip (app.js) keeps its text in data-tip.
    const tip = a === 'title' && !el.hasAttribute('title') && el.dataset.tip != null;
    const current = tip ? el.dataset.tip : el.getAttribute(a);
    if (current == null) continue;
    const rec = source(recs[a], current);
    rec.wrote = tr(normalize(rec.en)) === normalize(rec.en) ? rec.en : tr(normalize(rec.en));
    if (tip) { el.dataset.tip = rec.wrote; el.setAttribute('aria-label', rec.wrote); } else el.setAttribute(a, rec.wrote);
    recs[a] = rec;
  }
  seen.set(el, recs);
}

function translateHtml(el) {
  const rec = source(seen.get(el)?.html, el.innerHTML);
  const key = normalize(rec.en);
  rec.wrote = lang === 'en' || !strings[key] ? rec.en : strings[key];
  el.innerHTML = rec.wrote;
  rec.wrote = el.innerHTML; // as the browser wrote it back, for the next comparison
  seen.set(el, { ...seen.get(el), html: rec });
}

export function translatePage(root = document.body) {
  const walk = (el) => {
    if (el.getAttribute?.('translate') === 'no' || /^(SCRIPT|STYLE|svg|TEXTAREA)$/.test(el.nodeName)) return;
    if (el.nodeType === 1) translateAttrs(el);
    if (el.dataset?.i18n === 'html') return translateHtml(el);
    for (const child of el.childNodes) {
      if (child.nodeType === 3) translateText(child);
      else if (child.nodeType === 1) walk(child);
    }
  };
  walk(root);
}
