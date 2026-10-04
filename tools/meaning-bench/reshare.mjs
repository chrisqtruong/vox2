// Recomputes the two-level share and the app's "can't check" on rescore.html's output
// (the share doesn't need the model):  jsc -m reshare.mjs -- scored.json > rescored.json
import { untranslated, UNTRANSLATED_SHARE, PARTIAL_SHARE } from './untranslated-two-level.js';
import { untranslated as shipped } from '../../resources/meaning-checks.js';
const rows = JSON.parse(readFile(globalThis.arguments[0]));
for (const r of rows) {
  if (r.empty) continue;
  const { share, words } = untranslated(r.text, r.translation);
  const score = share >= UNTRANSLATED_SHARE ? null : share >= PARTIAL_SHARE ? Math.min(r.scoreBefore, 84) : r.scoreBefore;
  Object.assign(r, { share, untranslated: words, score, shippedCantCheck: shipped(r.text, r.translation) !== null });
}
print(JSON.stringify(rows));
