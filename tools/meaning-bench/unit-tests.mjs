// Unit tests for the word checks in resources/meaning-checks.js: one line per rule, each with a case
// that should match and, where it matters, one that shouldn't. Every rule added to the checks gets a
// line here, so a later change that breaks it shows up at once (the bench measures the whole effect).
//   jsc -m unit-tests.mjs        (macOS: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc)
import { numbersMatch, meaningChecks } from '../../resources/meaning-checks.js';

const plain = (s) => s.replace(/(\d)[,.](?=\d{3}(?!\d))/g, '$1'); // as matchScore() does
let failed = 0;
const check = (ok, label) => { if (!ok) failed++; print(`${ok ? 'ok  ' : 'FAIL'} ${label}`); };

// Numbers (Phase 1.2): [your text, ↩ line, same numbers?]
for (const [a, b, want] of [
  ['Eighteen holes, finishing on the eighteenth.', 'A round has 18 holes, finishing on the 18th hole.', true],
  ['the world\'s 37th-largest country', 'the thirty-seventh largest country', true],
  ['Ten years later, he led', 'A decade later, he led', true],
  ['about 3,000 miles from Miami, winds of 40 mph (64 kph)', 'about 3,000 miles (4,800 km) from Miami, 40 mph (64 km/h)', true],
  ['about 220 km (140 miles) from Beijing', 'about 220 kilometers from Beijing', true],
  ['15 islands over 2.2 million km2', '15 islands over nearly 2.2 million km 2', true],
  ['waited in 90(F)-degree heat', 'waited in 32°C heat', true],
  ['between 340 million and 500 million speakers', 'between 340 and 500 million speakers', true],
  ['speakers of both languages', 'speakers of the two languages', true],
  ['a couple of thousand staff', 'several thousand staff', true],
  ['four dozen bases', '48 bases', true],
  ['In 1977, he built', 'In 1997, he built', false],
  ['waited in 90(F)-degree heat', 'waited in 50°C heat', false],
  ['about 220 km from Beijing', 'about 520 km from Beijing', false],
  ['He scored 15 goals', 'He scored 52 goals', false],
]) check(numbersMatch(plain(a), plain(b), 'en') === want, `numbers ${want ? '=' : '≠'}  ${a} | ${b}`);

// Pronouns, inclusive (Phase 1.2): [your text, ↩ line, checks expected ("" = none; "(soft)" = kept below 85)]
for (const [a, b, want] of [
  ['They said they would come to the party.', 'He said he would come to the party.', 'pronoun'],
  ['Alex finished xyr homework before xe left.', 'Alex finished their homework before they left.', 'pronoun(soft)'],
  ['Alex finished xyr homework before xe left.', 'Alex finished her homework before she left.', 'pronoun'],
  ['My partner is a doctor.', 'My wife is a doctor.', 'pronoun'],
  ['My partner is a doctor.', 'My partner is a doctor.', ''],
  ['They are my parents.', 'They are my parents.', ''],
  ['He told me she was coming.', 'She told me he was coming.', ''],
  ['His mother is a doctor.', 'Her mother is a doctor.', 'pronoun'],
  ['They went to the store and bought apples.', 'They went to the shop and bought apples.', ''],
]) {
  const got = meaningChecks(a, b, 'en').map((c) => c.kind + (c.soft ? '(soft)' : '')).join();
  check(got === want, `pronoun [${want}]  ${a} | ${b}${got === want ? '' : `  → got [${got}]`}`);
}

// Negations (Phase 1.2b): built negatives (un-, -less, im-/in-) only cancel a plain "not"
for (const [a, b, want] of [
  ['his wife was not hurt.', 'his wife was unharmed.', ''],
  ['this tomb was left virtually undisturbed.', 'this tomb remained almost intact.', ''],
  ['where the fauna are new to you', 'where the fauna are unfamiliar to you', ''],
  ['I can come to the party.', 'I cannot come to the party.', 'negation'],
  ['The windows were unbreakable.', 'The windows did not break.', ''],
  ['The windows were unbreakable.', 'The windows broke.', ''],
  ['He did agree with the ruling.', 'He did not agree with the ruling.', 'negation'],
  ['One of the richest people, Allen invested his wealth.', 'Allen, one of the richest men, invested his money.', ''],
]) {
  const got = meaningChecks(a, b, 'en').map((c) => c.kind).join();
  check(got === want, `negation [${want}]  ${a} | ${b}${got === want ? '' : `  → got [${got}]`}`);
}

print(failed ? `\n${failed} FAILED` : '\nall passed');
if (failed) throw new Error(`${failed} unit tests failed`);
