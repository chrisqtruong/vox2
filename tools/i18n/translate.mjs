// Makes resources/i18n/<code>.json for every language Vox2 knows: machine-translates strings.json
// (Google, the same endpoint as the app), translates each result back into English for the
// meaning check (check.mjs), and lays hand-made fixes (fixes/<code>.json) on top.
//
//   node tools/i18n/translate.mjs            every language (about 30 minutes the first time)
//   node tools/i18n/translate.mjs vi es      just these
//
// Results are cached in work/<code>.json by the English that was sent, so a re-run only
// translates new or changed strings. Short, ambiguous labels are sent with more context
// (context.json: "clear" → "clear the history"); the app still shows the English as written.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'resources', 'i18n');
const WORK = join(HERE, 'work');
const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const write = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 1)}\n`);
mkdirSync(OUT, { recursive: true });
mkdirSync(WORK, { recursive: true });

const strings = Object.keys(read(join(HERE, 'strings.json')));
const context = read(join(HERE, 'context.json'), {});
// Several wordings for one label: each is translated, and choices.json (from check.mjs) says which to use.
const candidates = (key) => [].concat(context[key] || key);
const choices = read(join(HERE, 'choices.json'), {});
const { LANGUAGES } = await import(join(ROOT, 'resources', 'languages.js'));
const wanted = process.argv.slice(2);
const codes = LANGUAGES.map(([c]) => c).filter((c) => c !== 'en' && (!wanted.length || wanted.includes(c)));

const isHtml = (s) => /<\/?[a-z][^>]*>/i.test(s);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
// {placeholders} travel inside a no-translate span, so they come back as they went.
const KEEP = (m) => `<span translate="no">${m}</span>`;
const toWire = (s) => (isHtml(s) ? s : esc(s)).replace(/\{\w+\}/g, KEEP);
const fromWire = (s, html) => {
  const t = s.replace(/<span translate="no">\s*(\{\w+\})\s*<\/span>/g, '$1');
  return (html ? t : unesc(t)).replace(/\s+/g, ' ').trim();
};
// Google spaces out the kept spans ("v {version}", "\" {word} \""): where the English has no
// space next to a placeholder, neither does the translation.
function tighten(key, text) {
  for (const hole of key.match(/\{\w+\}/g) || []) {
    const i = key.indexOf(hole);
    const h = hole.replace(/[{}]/g, '\\$&');
    if (i > 0 && !/\s/.test(key[i - 1])) text = text.replace(new RegExp(`\\s+${h}`), hole);
    if (i + hole.length < key.length && !/\s/.test(key[i + hole.length])) text = text.replace(new RegExp(`${h}\\s+`), hole);
  }
  return text;
}
const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
const tags = (s) => (s.match(/<\/?\w+/g) || []).sort().join();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function google(texts, from, to) {
  const out = [];
  // Several strings per request, well under the endpoint's size limit.
  for (let i = 0; i < texts.length;) {
    const batch = [];
    let size = 0;
    while (i < texts.length && batch.length < 60 && size + texts[i].length < 3500) { size += texts[i].length; batch.push(texts[i++]); }
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&format=html&sl=${from}&tl=${to}`, {
          method: 'POST', body: new URLSearchParams(batch.map((q) => ['q', q])), headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let data = await res.json();
        if (batch.length === 1 && !Array.isArray(data)) data = [data];
        data = data.map((d) => (Array.isArray(d) ? d[0] : d)); // with sl=auto it answers [text, lang]
        if (data.length !== batch.length) throw new Error('wrong number of answers');
        out.push(...data);
        break;
      } catch (err) {
        if (attempt >= 5) throw err;
        await sleep(5000 * 2 ** attempt); // throttled: back off
      }
    }
    await sleep(700);
  }
  return out;
}

const index = [];
for (const code of codes) {
  const cachePath = join(WORK, `${code}.json`);
  const cache = read(cachePath, {}); // English sent → { text, back }
  const todo = [...new Set(strings.flatMap(candidates))].filter((src) => !cache[src]);
  try {
    if (todo.length) {
      const text = (await google(todo.map(toWire), 'en', code)).map((t, i) => fromWire(t, isHtml(todo[i])));
      const back = (await google(text.map(toWire), code, 'en')).map((t, i) => fromWire(t, isHtml(todo[i])));
      todo.forEach((src, i) => { cache[src] = { text: text[i], back: back[i] }; });
      write(cachePath, cache);
    }
  } catch (err) {
    console.log(`${code}: ${err.message}, skipped (run again to retry)`);
    continue;
  }
  // Fixes: a person's corrections, after reading the meaning check. They win over the machine.
  const fixes = read(join(HERE, 'fixes', `${code}.json`), {});
  const result = {};
  let dropped = 0;
  for (const key of strings) {
    const machine = cache[candidates(key)[choices[code]?.[key] || 0]]?.text;
    const text = fixes[key] ?? (machine && tighten(key, machine));
    // Anything that lost a {placeholder} or its markup on the way stays in English rather than break.
    if (!text || holes(text) !== holes(key) || tags(text) !== tags(key)) { dropped++; continue; }
    if (text !== key) result[key] = text;
  }
  write(join(OUT, `${code}.json`), result);
  index.push(code);
  console.log(`${code}: ${Object.keys(result).length} strings${dropped ? `, ${dropped} kept in English` : ''}${todo.length ? `, ${todo.length} new` : ''}`);
}

// Which languages the app can switch to.
const all = new Set([...read(join(OUT, 'index.json'), []), ...index]);
write(join(OUT, 'index.json'), LANGUAGES.map(([c]) => c).filter((c) => all.has(c) && existsSync(join(OUT, `${c}.json`))));
