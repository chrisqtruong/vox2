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
    if (/^(?:one|a)$/i.test(m)) return m; // "one of the best", "no one": not a count on its own
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
const NEGATIONS = new Set(['not', 'no', 'never', 'none', 'nobody', 'nothing', 'nowhere', 'neither', 'nor', 'cannot']);
// Words that carry their own "not", so "unknown" and "do not know" balance out, and
// "lack variety" counts against "more variety". (From run 2's false alarms and misses.)
const NEGATIVE_WORDS = new Set(['without', 'unknown', 'unknowingly', 'unaware', 'unable', 'unclear', 'uncertain', 'unsure', 'unlikely',
  'unavailable', 'unnoticed', 'unidentified', 'unnamed', 'unseen', 'impossible', 'lack', 'lacks', 'lacked', 'lacking', 'fail', 'fails',
  'failed', 'failing', 'refuse', 'refuses', 'refused', 'deny', 'denies', 'denied', 'absent', 'hardly', 'barely', 'scarcely', 'rarely', 'seldom']);
const negations = (ws) => ws.filter((w, i) => {
  if (w === 'not' && ['only', 'just', 'merely'].includes(ws[i + 1])) return false; // "not only… but also": not a negation
  return NEGATIONS.has(w) || NEGATIVE_WORDS.has(w) || w.endsWith("n't");
}).length;

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
  // grown for run 3
  [['gain', 'gains', 'gained'], ['loss', 'losses', 'lose', 'lost']], [['ahead'], ['behind']], [['entrance'], ['exit']], [['import', 'imports', 'imported'], ['export', 'exports', 'exported']],
  [['push', 'pushed'], ['pull', 'pulled']], [['over'], ['under']], [['upper'], ['lower']], [['front'], ['back', 'rear']], [['dark', 'darker'], ['light', 'bright', 'brighter']],
  [['heavy', 'heavier'], ['light', 'lighter']], [['fast', 'faster', 'quick', 'quickly'], ['slow', 'slower', 'slowly']], [['near', 'nearby', 'close'], ['far', 'distant']],
  [['wide', 'wider', 'broad'], ['narrow', 'narrower']], [['thick'], ['thin']], [['deep', 'deeper'], ['shallow']], [['tall', 'taller'], ['short', 'shorter']],
  [['love', 'loved', 'loves'], ['hate', 'hated', 'hates']], [['friend', 'friends', 'ally', 'allies'], ['enemy', 'enemies']], [['agree', 'agreed', 'agrees'], ['disagree', 'disagreed', 'disagrees']],
  [['include', 'included', 'includes', 'including'], ['exclude', 'excluded', 'excludes', 'excluding']], [['add', 'added', 'adds'], ['remove', 'removed', 'removes']],
  [['victory', 'win'], ['defeat', 'loss']], [['often', 'frequently', 'usually'], ['rarely', 'seldom']], [['majority'], ['minority']],
  [['allow', 'allowed', 'allows', 'let'], ['prevent', 'prevented', 'prevents', 'stop', 'stopped', 'block', 'blocked']], [['support', 'supported', 'supports'], ['oppose', 'opposed', 'opposes']],
  [['positive'], ['negative']], [['beginning', 'start', 'started', 'begin', 'began'], ['end', 'ended', 'finish', 'finished']], [['public'], ['private']],
  [['male', 'men', 'man', 'boy', 'boys'], ['female', 'women', 'woman', 'girl', 'girls']], [['husband'], ['wife']], [['father', 'dad'], ['mother', 'mom']],
  [['brother', 'brothers'], ['sister', 'sisters']], [['son', 'sons'], ['daughter', 'daughters']], [['king'], ['queen']],
  [['rise', 'rose', 'raise', 'raised'], ['drop', 'dropped', 'decline', 'declined', 'reduce', 'reduced', 'cut']], [['above', 'over'], ['beneath', 'underneath']],
  [['all', 'every', 'everyone', 'everything'], ['some', 'none', 'nobody', 'nothing']], [['plenty', 'abundant', 'abundance'], ['scarce', 'shortage']],
  [['success', 'succeeded', 'succeed'], ['fail', 'failed', 'failure']], [['true', 'correct', 'right'], ['wrong', 'incorrect']], [['wet'], ['dry']],
  [['healthy'], ['sick', 'ill']], [['alive', 'living'], ['dead', 'died']], [['found', 'discovered'], ['lost', 'missing']], [['guilty'], ['innocent']],
  [['increase', 'more', 'higher'], ['fewer']], [['inside', 'indoors', 'within'], ['outdoors']], [['present'], ['absent']], [['same', 'similar'], ['opposite']],
];

// The numbers in a text, compared as a sorted list. Same number written differently counts as
// the same: number words ("two"), times ("11:00" = "11am" = "11 o'clock"). Digits that are part of
// a name ("COVID-19", "G7", "MP3") are left out.
export function numbersIn(s, lang) {
  let t = numberWordsToDigits(s, lang);
  t = t.replace(/\b(\d{1,2}):00\b/g, '$1') // 11:00 → 11
    .replace(/\b(\d{1,2})(?::(\d\d))?\s*(?:a\.?m\.?|p\.?m\.?|o'clock)(?!\p{L})/giu, (m, h, mm) => (mm ? `${h}:${mm}` : h)) // 11am → 11
    .replace(/(\d)(?:st|nd|rd|th)\b/g, '$1'); // 21st → 21
  // Digits right after letters ("G7", "COVID-19", "MP3") are part of a name, not a count.
  // ("30-year-old", "90-degree", "1830s" still count.)
  return (t.match(/(?<!\p{L}[-–]?)(?<![\d.,:])\d+(?:[.,:]\d+)*/gu) || []).sort().join(' ');
}

// Your content words that never came back in the ↩ line, for "didn't come back:" in the hover
// card. Words are compared by their stem, so "testing" / "test", "elections" / "election" and
// "studied" / "study" match.
const STOP = new Set('a an the and or but if of to in on at by for from with as is are was were be been being it its this that these those there their they them he she his her him we our you your i my me not no so than then too very can could will would should may might must do does did have has had which who whom whose what when where why how all any each some such into over under about after before up down out off again also just only own other more most'.split(' '));
const stem = (w) => w.replace(/'s$/, '').replace(/(?:ies|ied)$/, 'y').replace(/(?:ing|edly|ed|es|ly|s)$/, '').replace(/(.)\1$/, '$1').replace(/e$/, '');
export function missingWords(original, back, lang) {
  if (!isEnglish(lang)) return [];
  const kept = new Set(words(back).map(stem));
  return [...new Set(words(original).filter((w) => w.length > 2 && !STOP.has(w) && !kept.has(stem(w))))];
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// → [{ kind, detail, words?, missing? }] for each likely meaning change found. Empty = nothing
// suspicious. words: what to highlight in the ↩ line; missing: your words that didn't come back.
export function meaningChecks(original, back, lang) {
  if (!isEnglish(lang)) return [];
  const a = words(original);
  const b = words(back);
  const found = [];

  const negWords = (ws) => ws.filter((w, i) => (NEGATIONS.has(w) || NEGATIVE_WORDS.has(w) || w.endsWith("n't")) && !(w === 'not' && ['only', 'just', 'merely'].includes(ws[i + 1])));
  if (negations(a) % 2 !== negations(b) % 2) {
    // The words to point at: the extra negation in the ↩ line, or the one of yours that didn't come back.
    const more = negations(b) > negations(a);
    found.push({ kind: 'negation', detail: more ? 'a "not" (or "no", "never"…) appeared' : 'a "not" (or "no", "never"…) from your text didn\'t come back', words: more ? negWords(b) : [], missing: more ? [] : negWords(a) });
  }

  const has = (ws, set) => ws.some((w) => set.has(w));
  if ((has(a, MALE) && !has(a, FEMALE) && has(b, FEMALE)) || (has(a, FEMALE) && !has(a, MALE) && has(b, MALE) && !has(b, FEMALE))) {
    const swapped = has(a, MALE) ? FEMALE : MALE;
    found.push({ kind: 'pronoun', detail: 'he/she (or his/her) changed', words: b.filter((w) => swapped.has(w)) });
  }

  const sa = new Set(a);
  const sb = new Set(b);
  for (const [x, y] of OPPOSITES) {
    const ax = x.some((w) => sa.has(w)); const ay = y.some((w) => sa.has(w));
    const bx = x.some((w) => sb.has(w)); const by = y.some((w) => sb.has(w));
    if ((ax && !ay && by && !bx) || (ay && !ax && bx && !by)) {
      found.push({ kind: 'opposite', detail: `"${(ax ? x : y)[0]}" became "${(ax ? y : x)[0]}"`, words: (ax ? y : x).filter((w) => sb.has(w)) });
      break;
    }
  }

  for (const list of [MONTHS, DAYS]) {
    const ma = list.filter((w) => sa.has(w)).join();
    const mb = list.filter((w) => sb.has(w)).join();
    if (ma && mb && ma !== mb) { found.push({ kind: 'date', detail: 'a day or month changed', words: list.filter((w) => sb.has(w) && !sa.has(w)) }); break; }
  }

  // Something left out: the ↩ line came back much shorter than what you wrote. (Comparing
  // lengths beat comparing which words came back: rewording changes the words, not the length.)
  if (a.length >= 8 && b.length < a.length * SHORTER_THAN) found.push({ kind: 'missing', detail: 'part of what you wrote may be missing' });
  return found;
}

// The ↩ line shorter than this share of your text counts as "part may be missing".
// Tuned on the development set (docs/meaning-check-tests/2026-10-03-run-2.md).
export const SHORTER_THAN = 0.6;
