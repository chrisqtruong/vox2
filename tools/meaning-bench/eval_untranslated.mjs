// Offline check of untranslated() on saved translations (run with macOS's jsc, the engine the Mac
// app uses):  jsc -m eval_untranslated.mjs -- <split: dev|test|all> <files…>
import { untranslated } from './untranslated-two-level.js';
const [split, ...files] = globalThis.arguments;
const T = [0.2, 0.25, 0.3, 0.35, 0.4, 0.5];
const groups = {};
const top = [];
for (const f of files) {
  for (const r of JSON.parse(readFile(f))) {
    if (split !== 'all' && (r.split || 'dev') !== split) continue;
    const text = r.text ?? (r.kind === 'bad' ? r.bad_en : r.en);
    const g = r.text !== undefined ? r.kind : `real translation (${r.kind === 'bad' ? 'bad' : 'good'})`;
    const u = untranslated(text, r.translation);
    (groups[g] ||= []).push(u.share);
    if (!r.text || r.kind === 'names') top.push([u.share, r.lang, text, r.translation, u.words.join(' ')]);
  }
}
for (const [g, xs] of Object.entries(groups)) print(`${g.padEnd(28)} n=${String(xs.length).padStart(5)}  ` + T.map((t) => `≥${t}: ${(100 * xs.filter((x) => x >= t).length / xs.length).toFixed(1)}%`).join('  '));
top.sort((a, b) => b[0] - a[0]);
print('\nhighest shares among real translations / names:');
for (const t of top.slice(0, +(globalThis.TOPN || 12))) print(t[0].toFixed(2), t[1], '|', t[2].slice(0, 90), '\n     →', t[3].slice(0, 90), '\n     words:', t[4]);
