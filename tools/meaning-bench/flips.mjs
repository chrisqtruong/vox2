// Row by row: which pairs changed between two versions of the word checks, and why. The tables in
// compare.mjs say how much changed; this says which sentences, so each new false alarm or catch can
// be read and understood.
//   git show <commit>:resources/meaning-checks.js > /tmp/checks-before.js
//   jsc -m flips.mjs -- results.json /tmp/checks-before.js test            (counts by cause)
//   jsc -m flips.mjs -- results.json /tmp/checks-before.js test added      (also print the rows; or: removed, caught, missed)
import * as N from '../../resources/meaning-checks.js';
const [file, beforePath, split, show] = globalThis.arguments;
const O = await import(beforePath);
const plain = (s) => s.replace(/(\d)[,.   ](?=\d{3}(?!\d))/g, '$1');
const norm = (s) => s.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const sc = (r, M, nm) => { const o = plain(r.en), b = plain(r.back); if (norm(o) === norm(b)) return { s: 100, c: [] };
  const c = M.meaningChecks(o, b, 'en'); let s = r.similarity; const nd = !nm(o, b); if (nd) s = Math.min(s, 60);
  if (c.some((x) => !x.soft)) s = Math.min(s, 60); else if (c.length) s = Math.min(s, 84); return { s, c: [...(nd ? ['number'] : []), ...c.map((x) => x.kind)] }; };
const tally = {};
for (const r of JSON.parse(readFile(file))) {
  if ((r.split || 'dev') !== split) continue;
  const a = sc(r, O, (x, y) => (O.numbersMatch ? O.numbersMatch(x, y, 'en') : O.numbersIn(x, 'en') === O.numbersIn(y, 'en'))), b = sc(r, N, (x, y) => N.numbersMatch(x, y, 'en'));
  const good = r.kind !== 'bad';
  const key = good ? (a.s < 65 && b.s >= 65 ? 'good: false alarm removed' : a.s >= 65 && b.s < 65 ? 'good: false alarm added' : null)
    : (a.s >= 85 && b.s < 85 ? 'bad: newly caught' : a.s < 85 && b.s >= 85 ? 'bad: newly missed' : null);
  if (!key) continue;
  const why = good ? (key.endsWith('added') ? b.c : a.c).join('+') || 'similarity' : (key.endsWith('caught') ? b.c : a.c).join('+');
  (tally[key] ||= {})[why] = (tally[key][why] || 0) + 1;
  if (show && key.includes(show)) print(`${key} [${why}] ${r.lang}\n   ${good ? r.en : r.bad_en}\n   ↩ ${r.back}`);
}
print(JSON.stringify(tally, null, 1));
