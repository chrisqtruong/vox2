// Re-scores saved results (runs 2+) with the current word checks, without the model or Google:
// the saved `similarity` is the model's part of the score, so only the caps are recomputed, as in
// matchScore() (resources/meaning.js).
//   jsc -m offline.mjs -- <results.json> [summary|flags <split> <kind: good|bad> <check>|out]
import { meaningChecks, numbersMatch } from '../../resources/meaning-checks.js';
import { normalize } from './normalize.mjs';
const [file, mode = 'summary', ...rest] = globalThis.arguments;
const plain = (s) => s.replace(/(\d)[,.   ](?=\d{3}(?!\d))/g, '$1');
export function rescore(r) {
  const o = plain(r.en); const b = plain(r.back);
  const same = normalize(o) === normalize(b);
  const numbersDiffer = !numbersMatch(o, b, 'en');
  const checks = same ? [] : meaningChecks(o, b, 'en');
  let score = same ? 100 : r.similarity;
  if (numbersDiffer) score = Math.min(score, 60);
  if (checks.some((c) => !c.soft)) score = Math.min(score, 60);
  else if (checks.length) score = Math.min(score, 84);
  return { score, numbersDiffer, checks: [...(numbersDiffer ? ['number'] : []), ...checks.map((c) => c.kind)] };
}
const rows = JSON.parse(readFile(file));
const pct = (xs) => `${(100 * xs.filter(Boolean).length / (xs.length || 1)).toFixed(1)}%`;
if (mode === 'summary') {
  let mismatch = 0;
  for (const split of ['dev', 'test']) {
    const g = rows.filter((r) => (r.split || 'dev') === split).map((r) => ({ r, s: rescore(r) }));
    for (const { r, s } of g) if (r.score !== undefined && rest[0] === 'verify' && s.score !== r.score) mismatch++;
    const good = g.filter(({ r }) => r.kind !== 'bad'); const bad = g.filter(({ r }) => r.kind === 'bad');
    print(`${split}: good kept ${pct(good.map(({ s }) => s.score >= 85))}  false alarms ${pct(good.map(({ s }) => s.score < 65))}  errors caught ${pct(bad.map(({ s }) => s.score < 85))}  flagged likely off ${pct(bad.map(({ s }) => s.score < 65))}`);
    const types = [...new Set(bad.map(({ r }) => r.error))];
    print('   by error: ' + types.map((t) => `${t} ${pct(bad.filter(({ r }) => r.error === t).map(({ s }) => s.score < 85))}`).join(', '));
    const why = {};
    for (const { s } of good.filter(({ s }) => s.score < 65)) for (const c of s.checks.length ? [...new Set(s.checks)] : ['similarity only']) why[c] = (why[c] || 0) + 1;
    print('   false alarms by cause: ' + JSON.stringify(why));
  }
  if (rest[0] === 'verify') print(`rows where the offline score differs from the saved one: ${mismatch}`);
} else if (mode === 'flags') {
  const [split, which, check] = rest;
  for (const r of rows.filter((r) => (r.split || 'dev') === split && (which === 'bad') === (r.kind === 'bad'))) {
    const s = rescore(r);
    const hit = which === 'good' ? s.score < 65 && (check === 'any' || s.checks.includes(check)) : s.score >= 85 && r.error === check;
    if (hit) print(`${r.lang} [${s.checks}] ${r.kind === 'bad' ? r.bad_en : r.en}\n      ↩ ${r.back}`);
  }
}
