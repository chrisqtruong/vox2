// Today's score for every row of a saved results file, as JSON (for direct_eval.py).
//   jsc -m dump-scores.mjs -- <results.json> > scores.json
import { meaningChecks, numbersMatch } from '../../resources/meaning-checks.js';
import { normalize } from './normalize.mjs';
const plain = (s) => s.replace(/(\d)[,.   ](?=\d{3}(?!\d))/g, '$1');
function rescore(r) {
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
const rows = JSON.parse(readFile(globalThis.arguments[0]));
print(JSON.stringify(rows.map((r) => rescore(r).score)));
