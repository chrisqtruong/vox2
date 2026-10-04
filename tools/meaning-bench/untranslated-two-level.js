// Two-level "wasn't translated" check, proposed in run 4 (docs/meaning-check-tests/2026-10-04-run-4.md):
// the share of your words left unchanged in the translation. From 40%: "can't check"; from 20%: the
// score capped at 84. A bench-only alternative to untranslated() in resources/meaning-checks.js.
export const UNTRANSLATED_SHARE = 0.4;
export const PARTIAL_SHARE = 0.2;

// Text that was never translated. Google passes what it can't translate (garbled snip text,
// gibberish, made-up words) through unchanged, both ways, so the ↩ line repeats your text and the
// score would say 100% when nothing was checked. This looks at the translation itself: which of
// your words appear in it unchanged. Works for any pair of languages.
// Names and brand words pass through in a good translation too (Bento, Puerto Princesa), so a
// capitalized word only counts inside a run of UNTRANSLATED_RUN unchanged words in a row, and
// short words don't count on their own ("no", "a", "do" are words in many languages).
// Measured in docs/meaning-check-tests/2026-10-04-run-4.md. Not used by the app (it ships
// the check in resources/meaning-checks.js); kept here to compare against it.
// → { share: unchanged words / your words (0–1), words: the unchanged ones }
const wordSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
const wordsOf = (s) => (wordSegmenter
  ? [...wordSegmenter.segment(s)].filter((x) => x.isWordLike).map((x) => x.segment)
  : s.match(/[\p{L}\p{M}\d]+(?:['’][\p{L}]+)?/gu) || []);
const HAN = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
export const UNTRANSLATED_RUN = 3;
const UNITS = new Set('km m cm mm h s ms min kg g mg lb lbs oz l ml ft mi mph kph kmh sq kw kwh mb gb hz'.split(' '));
export function untranslated(original, translation) {
  const mine = wordsOf(original).filter((w) => /\p{L}/u.test(w) && !/\d/.test(w)); // numbers pass through in every language
  if (!mine.length || !translation) return { share: 0, words: [] };
  const theirs = new Set(wordsOf(translation).map((w) => w.toLocaleLowerCase()));
  // Chinese and Japanese share characters, so whole Han words carry over between them legitimately.
  const cjk = (translation.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length > translation.replace(/\s/g, '').length / 2;
  const kept = mine.map((w) => theirs.has(w.toLocaleLowerCase()) && !(cjk && HAN.test(w)));
  const counts = kept.map(() => false);
  for (let i = 0; i < mine.length;) {
    let j = i;
    while (j < mine.length && kept[j]) j++;
    const run = mine.slice(i, j);
    const lower = (w) => w === w.toLocaleLowerCase();
    // A run of capitalized words is a name or title ("War Memorial Stadium", "Hero of the Soviet Union",
    // "Bartolomé de las Casas"), maybe next to a word both languages share ("message Dr Nguyen" in
    // French); units pass through too ("km/h", "m/s", "mph"). Gibberish mixes in several lowercase words.
    const small = run.filter(lower);
    const title = small.length * 2 <= run.length && small.every((w) => w.length <= 3);
    const longRun = run.length >= UNTRANSLATED_RUN && small.filter((w) => !UNITS.has(w)).length >= 2 && !title;
    for (let k = i; k < j; k++) counts[k] = longRun || (lower(mine[k]) && mine[k].length > 2 && !UNITS.has(mine[k]));
    i = j + 1;
  }
  const words = mine.filter((_, k) => counts[k]);
  return { share: words.length / mine.length, words: [...new Set(words)] };
}
