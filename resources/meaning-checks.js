// Targeted meaning checks: errors the similarity score barely notices, because the sentences stay
// about the same thing. Compares your text with the back-translation (the ↩ line, in your own
// language) word by word. Plain rules, no model, instant.
// Measured in docs/meaning-check-tests/ (run 1 showed flipped negations, opposites and swapped
// pronouns scoring 100). Word lists are English for now; other languages only get the number check.

const isEnglish = (lang) => !lang || /^en\b/i.test(lang);

// Number words → digits, so "2 goals" and "two goals" agree ("eight hundred" → 800).
const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };
const NUM_WORD = new RegExp(`\\b(?:${[...Object.keys(SMALL), ...Object.keys(SCALE)].join('|')})(?:[\\s-]+(?:and[\\s-]+)?(?:${[...Object.keys(SMALL), ...Object.keys(SCALE)].join('|')}))*\\b`, 'gi');
export function numberWordsToDigits(s, lang) {
  if (!isEnglish(lang)) return s;
  return s.replace(NUM_WORD, (m) => {
    let total = 0;
    let part = 0;
    for (const w of m.toLowerCase().split(/[\s-]+/)) {
      if (w === 'and') continue;
      if (w in SMALL) part += SMALL[w];
      else if (w === 'hundred') part = (part || 1) * 100;
      else { total += (part || 1) * SCALE[w]; part = 0; }
    }
    return String(total + part);
  });
}

const words = (s) => s.toLowerCase().replace(/[’`]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) || [];

// "not", "never", "can't"… An odd/even change in how many there are flips the meaning.
// ("without" is left out: "without your knowledge" often comes back as "unknowingly".)
const NEGATIONS = new Set(['not', 'no', 'never', 'none', 'nobody', 'nothing', 'nowhere', 'neither', 'nor', 'cannot']);
const negations = (ws) => ws.filter((w) => NEGATIONS.has(w) || w.endsWith("n't")).length;

const MALE = new Set(['he', 'him', 'his', 'himself']);
const FEMALE = new Set(['she', 'her', 'hers', 'herself']);

// Word pairs that mean the opposite. Each side lists forms that count as that side.
const OPPOSITES = [
  [['left'], ['right']], [['before'], ['after']], [['more'], ['less', 'fewer']], [['many', 'much'], ['few', 'little']],
  [['most'], ['least', 'fewest']], [['increase', 'increased', 'increases', 'increasing'], ['decrease', 'decreased', 'decreases', 'decreasing']],
  [['rise', 'rose', 'rising', 'rises'], ['fall', 'fell', 'falling', 'falls']], [['higher', 'highest'], ['lower', 'lowest']],
  [['larger', 'largest', 'bigger', 'biggest'], ['smaller', 'smallest']], [['longer', 'longest'], ['shorter', 'shortest']],
  [['first'], ['last']], [['early', 'earlier', 'earliest'], ['late', 'later', 'latest']], [['north', 'northern'], ['south', 'southern']],
  [['east', 'eastern'], ['west', 'western']], [['always'], ['never']], [['win', 'wins', 'won', 'winning'], ['lose', 'loses', 'lost', 'losing']],
  [['open', 'opened'], ['closed', 'close', 'shut']], [['hot'], ['cold']], [['buy', 'bought', 'buying'], ['sell', 'sold', 'selling']],
  [['above'], ['below']], [['inside'], ['outside']], [['true'], ['false']], [['possible'], ['impossible']], [['legal'], ['illegal']],
  [['allowed', 'permitted'], ['forbidden', 'banned', 'prohibited']], [['maximum'], ['minimum']], [['best'], ['worst']],
  [['better'], ['worse']], [['easy', 'easier', 'easiest'], ['difficult', 'hard', 'harder', 'hardest']], [['cheap', 'cheaper'], ['expensive']],
  [['rich'], ['poor']], [['safe', 'safer'], ['dangerous']], [['success', 'successful'], ['failure', 'failed']],
  [['accept', 'accepted'], ['reject', 'rejected']], [['same'], ['different']], [['young', 'younger'], ['old', 'older']],
  [['large', 'big'], ['small']], [['strong', 'stronger'], ['weak', 'weaker']], [['full'], ['empty']], [['arrive', 'arrived'], ['leave', 'left', 'departed']],
];

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// → [{ kind, detail }] for each likely meaning change found. Empty = nothing suspicious.
export function meaningChecks(original, back, lang) {
  if (!isEnglish(lang)) return [];
  const a = words(original);
  const b = words(back);
  const found = [];

  if (negations(a) % 2 !== negations(b) % 2) found.push({ kind: 'negation', detail: 'a "not" (or "no", "never"…) appeared or disappeared' });

  const has = (ws, set) => ws.some((w) => set.has(w));
  if ((has(a, MALE) && !has(a, FEMALE) && has(b, FEMALE)) || (has(a, FEMALE) && !has(a, MALE) && has(b, MALE) && !has(b, FEMALE))) {
    found.push({ kind: 'pronoun', detail: 'he/she (or his/her) changed' });
  }

  const sa = new Set(a);
  const sb = new Set(b);
  for (const [x, y] of OPPOSITES) {
    const ax = x.some((w) => sa.has(w)); const ay = y.some((w) => sa.has(w));
    const bx = x.some((w) => sb.has(w)); const by = y.some((w) => sb.has(w));
    if ((ax && !ay && by && !bx) || (ay && !ax && bx && !by)) {
      found.push({ kind: 'opposite', detail: `"${(ax ? x : y)[0]}" became "${(ax ? y : x)[0]}"` });
      break;
    }
  }

  for (const list of [MONTHS, DAYS]) {
    const ma = list.filter((w) => sa.has(w)).join();
    const mb = list.filter((w) => sb.has(w)).join();
    if (ma && mb && ma !== mb) { found.push({ kind: 'date', detail: 'a day or month changed' }); break; }
  }

  // Something left out: the ↩ line came back much shorter than what you wrote. (Comparing
  // lengths beat comparing which words came back: rewording changes the words, not the length.)
  if (a.length >= 8 && b.length < a.length * SHORTER_THAN) found.push({ kind: 'missing', detail: 'part of what you wrote may be missing' });
  return found;
}

// The ↩ line shorter than this share of your text counts as "part may be missing".
// Tuned on the development set (docs/meaning-check-tests/2026-10-03-run-2.md).
export const SHORTER_THAN = 0.6;
