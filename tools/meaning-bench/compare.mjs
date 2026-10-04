// Report tables for a run: run 1's method (scoreRun1), an earlier version of the word checks
// (re-scored from the saved similarity), the version the bench ran (score, as saved), and the word
// checks in this checkout (re-scored the same way).
//   git show <commit>:resources/meaning-checks.js > /tmp/checks-before.js
//   jsc -m compare.mjs -- results.json /tmp/checks-before.js "0.4.18" "as run" "now"
import * as N from '../../resources/meaning-checks.js';
const [file, beforePath, beforeName = 'before', savedName = 'as run', nowName = 'now'] = globalThis.arguments;
const O = await import(beforePath);
const plain = (s) => s.replace(/(\d)[,.   ](?=\d{3}(?!\d))/g, '$1');
const norm = (s) => s.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const rescore = (M) => (r) => {
  const O = M;
  const o = plain(r.en), b = plain(r.back);
  if (norm(o) === norm(b)) return 100;
  const nd = O.numbersMatch ? !O.numbersMatch(o, b, 'en') : O.numbersIn(o, 'en') !== O.numbersIn(b, 'en');
  const c = O.meaningChecks(o, b, 'en');
  let s = r.similarity;
  if (nd) s = Math.min(s, 60);
  if (c.some((x) => !x.soft)) s = Math.min(s, 60); else if (c.length) s = Math.min(s, 84);
  return s;
};
const rows = JSON.parse(readFile(file)).map((r) => ({ ...r, scoreBefore: rescore(O)(r), scoreNow: rescore(N)(r) }));
const NAMES = { vie_Latn: 'Vietnamese', jpn_Jpan: 'Japanese', kor_Hang: 'Korean', zho_Hans: 'Chinese (simplified)', spa_Latn: 'Spanish', arb_Arab: 'Arabic', hin_Deva: 'Hindi', fra_Latn: 'French', tgl_Latn: 'Tagalog', por_Latn: 'Portuguese', urd_Arab: 'Urdu' };
const pc = (xs) => (xs.length ? `${((100 * xs.filter(Boolean).length) / xs.length).toFixed(1)}%` : '–');
const K = [['scoreRun1', 'Run 1 method'], ['scoreBefore', beforeName], ['score', savedName], ['scoreNow', nowName]];
const good = (r) => r.kind !== 'bad';
for (const split of ['test', 'dev']) {
  const rs = rows.filter((r) => r.split === split);
  const g = rs.filter(good), b = rs.filter((r) => !good(r));
  print(`\n### ${split === 'test' ? 'Held-out' : 'Development'} (${new Set(rs.map((r) => r.id)).size} sentences: ${g.length} good + ${b.length} bad pairs)\n`);
  print(`| Measure | ${K.map(([, n]) => n).join(' | ')} | Better is |\n|---|---|---|---|---|---|`);
  for (const [label, f, set, better] of [['Good shown as "meaning kept" (85+)', (s) => s >= 85, g, 'higher'], ['False alarms (good below 65)', (s) => s < 65, g, 'lower'],
    ['Errors caught (bad below 85)', (s) => s < 85, b, 'higher'], ['Errors flagged "likely off" (bad below 65)', (s) => s < 65, b, 'higher'], ['Missed (bad 85+)', (s) => s >= 85, b, 'lower']])
    print(`| ${label} | ${K.map(([k]) => pc(set.map((r) => f(r[k])))).join(' | ')} | ${better} |`);
  print(`\n| Planted error | n | ${K.map(([, n]) => n).join(' | ')} |\n|---|---|---|---|---|---|`);
  for (const e of [...new Set(b.map((r) => r.error))]) { const x = b.filter((r) => r.error === e); print(`| ${e} | ${x.length} | ${K.map(([k]) => pc(x.map((r) => r[k] < 85))).join(' | ')} |`); }
  if (split === 'test') {
    print(`\n| Language | False alarms (${beforeName} / ${savedName} / ${nowName}) | Errors caught (${beforeName} / ${savedName} / ${nowName}) |\n|---|---|---|`);
    for (const [l, name] of Object.entries(NAMES)) {
      const x = rs.filter((r) => r.lang === l); if (!x.length) continue;
      const xg = x.filter(good), xb = x.filter((r) => !good(r));
      const t = (k, f, set) => pc(set.map((r) => f(r[k])));
      print(`| ${name} | ${['scoreBefore', 'score', 'scoreNow'].map((k) => t(k, (v) => v < 65, xg)).join(' / ')} | ${['scoreBefore', 'score', 'scoreNow'].map((k) => t(k, (v) => v < 85, xb)).join(' / ')} |`);
    }
    const why = {};
    for (const r of g.filter((r) => r.scoreNow < 65)) {
      const o = plain(r.en), b = plain(r.back);
      const c = [...(N.numbersMatch(o, b, 'en') ? [] : ['number']), ...N.meaningChecks(o, b, 'en').map((x) => x.kind)];
      for (const k of c.length ? [...new Set(c)] : ['similarity only']) why[k] = (why[k] || 0) + 1;
    }
    print(`\nFalse alarms by cause (${nowName}): ${JSON.stringify(why)}`);
  }
}
