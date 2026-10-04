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
// Grown for Phase 1.2 (from runs 2–3's false alarms): "doubt" = not sure, "absence" = lack.
for (const w of ['doubt', 'doubts', 'doubted', 'doubtful', 'absence']) NEGATIVE_WORDS.add(w);
// in-/im-/il-/ir- words are listed one by one: the prefix alone would also catch "important", "include", "image".
const BUILT_NEGATIVE = new Set(['immoral', 'impractical', 'improper', 'impatient', 'imperfect', 'impolite',
  'implausible', 'incorrect', 'inaccurate', 'inadequate', 'incapable', 'incomplete', 'inconsistent', 'indestructible', 'indomitable',
  'insecure', 'insufficient', 'invalid', 'invisible', 'inaccessible', 'inactive', 'incompetent', 'illogical', 'irrelevant', 'irregular',
  'irresponsible', 'irreversible', 'illegally']);
// Words built to mean "not": un-… (unbreakable, unharmed, unwise, unrelated) and "without X" -less words (treeless,
// homeless). Not: under-, uni-, until, unless, unfortunately, "reverse the action" verbs (unlock, unveil, unfold…),
// -ly adverbs ("unusually fast", "implausibly fast" describe how, they don't negate), and -less words that
// mean "very many" (countless, boundless, endless).
const UN_WORD = /^un(?!der|i|til|less|animous|cle|to\b|veil|leash|lock|load|fold|pack|cover|ravel|wrap|do|earth|dergo|fortunat)[a-z]{4,}(?<!ly)$/;
const LESS_WORD = /^(?:tree|home|job|use|help|power|harm|care|point|hope|motion|sleep|water|child|penni|life|speech|defence|defense|fear|blame|flaw|spot|weight|clue|sense|worth|aim)less$/;
// Two kinds of negative words (Phase 1.2b, from run 5's fresh sentences):
// - plain negations ("not", "never", "can't", "without", "lack"…): a change in how many there are flips the meaning;
// - words built to be negative (unharmed, undisturbed, treeless, immoral): a translation swaps these freely with a
//   plain word of the same meaning ("undisturbed" ↩ "intact", "new to you" ↩ "unfamiliar"), so on their own they
//   say nothing. They only count to cancel a plain negation on the other side ("not hurt" ↩ "unharmed").
const isNegative = (w) => NEGATIONS.has(w) || NEGATIVE_WORDS.has(w) || w.endsWith("n't");
const isBuiltNegative = (w) => !isNegative(w) && (BUILT_NEGATIVE.has(w) || UN_WORD.test(w) || LESS_WORD.test(w));
// Phrases that look negative but aren't: "not only" (… but also), "not long ago" (= recently), "not far from"
// (= near), "no matter", "no doubt", "don't worry" (= rest assured), "No. 9" (= number 9). "not un-…"
// needs nothing: two negations cancel out.
const NOT_NEGATION = /\b(?:not|no)\s+(?:only|just|merely|long\s+ago|far|matter|doubt)\b|\b(?:don't|do\s+not)\s+worry\b|\bno\.\s*(?=\d)/gi;
const negationText = (s) => words(s.replace(/[’`]/g, "'").replace(NOT_NEGATION, ' '));
const negationWords = (s) => negationText(s).filter(isNegative);

// Languages where a he/she swap mostly can't survive the round trip, because their pronouns don't state
// a gender (Tagalog "siya", Hindi/Urdu "vah/voh": he, she or they) or drop it (Spanish "su" = his, her or
// their). Measured: fewer than
// half of swapped pronouns caught (runs 2–3: Tagalog 12%, Hindi 29%, Spanish 33%, Urdu 35%; next lowest
// Japanese 60%). There the app says he/she can't be checked instead of implying it's fine.
export const NO_HE_SHE = new Set(['tl', 'fil', 'hi', 'ur', 'es']);
export const heSheUncheckable = (original, target, lang) => isEnglish(lang) && NO_HE_SHE.has(String(target || '').toLowerCase().split('-')[0])
  && words(original).some((w) => MALE.has(w) || FEMALE.has(w) || THEY.has(w) || NEO.has(w));

const MALE = new Set(['he', 'him', 'his', 'himself']);
const FEMALE = new Set(['she', 'her', 'hers', 'herself']);
// Pronouns that don't state a gender: singular or plural they, and neopronouns (xe, ze/hir, ze/zir,
// ey/em, fae). A he/she appearing where you wrote one of these is misgendering, or at least a gender
// your text didn't say.
const THEY = new Set(['they', 'them', 'their', 'theirs', 'themselves', 'themself']);
const NEO = new Set(['xe', 'xem', 'xyr', 'xyrs', 'xemself', 'ze', 'zir', 'zirs', 'zirself', 'hir', 'hirs', 'hirself', 'ey', 'eir', 'eirs', 'emself',
  'fae', 'faer', 'faers', 'faerself']);
// Words for people that don't state a gender, and gendered words a translation might turn them into.
const NEUTRAL_PEOPLE = new Set(['partner', 'partners', 'spouse', 'spouses', 'parent', 'parents', 'sibling', 'siblings', 'child', 'children', 'kid', 'kids',
  'person', 'people', 'grandparent', 'grandparents', 'grandchild', 'grandchildren', 'cousin', 'cousins', 'friend', 'friends', 'teen', 'teenager']);
const GENDERED_PEOPLE = new Set(['husband', 'husbands', 'wife', 'wives', 'boyfriend', 'girlfriend', 'mother', 'mothers', 'father', 'fathers', 'mom', 'dad',
  'brother', 'brothers', 'sister', 'sisters', 'son', 'sons', 'daughter', 'daughters', 'boy', 'boys', 'girl', 'girls', 'man', 'men', 'woman', 'women',
  'grandmother', 'grandfather', 'grandson', 'granddaughter', 'niece', 'nephew', 'aunt', 'uncle', 'gentleman', 'lady', 'ladies']);

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
  let t = s;
  if (isEnglish(lang)) {
    t = t.replace(ORDINAL, (m, tens, unit) => String((tens ? SMALL[tens.toLowerCase()] : 0) + ORDINALS[unit.toLowerCase()])) // "eighteenth" = 18th
      .replace(/\b(k?m|cm|mi|ft)\s([23])\b/g, '$1$2') // "km 2" = km²
      // Vague amounts aren't numbers to compare: "several thousand", "a couple of thousand", "many hundreds".
      .replace(/\b(?:several|a few|few|many|some|a couple of|a couple|tens of|hundreds of|thousands of)\s+(?:hundred|thousand|million|billion)s?\b/gi, ' ')
      .replace(/(\d+(?:\.\d+)?)\s+(hundred|thousand|million|billion)\b/gi, (m, n, w) => String(Math.round(parseFloat(n) * SCALE[w.toLowerCase()]))); // "340 million", "1.5 million"
  }
  t = numberWordsToDigits(t, lang);
  if (isEnglish(lang)) t = t.replace(/(\d+)\s+dozen\b/gi, (m, n) => String(n * 12)).replace(/\ba dozen\b/gi, '12'); // "four dozen" = 48
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

// Ordinal words from "fourth" on ("first" to "third" are mostly not counts: "for the first time").
const ORDINALS = { fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fortieth: 40,
  fiftieth: 50, sixtieth: 60, seventieth: 70, eightieth: 80, ninetieth: 90, hundredth: 100 };
const ORDINAL = new RegExp(`\\b(?:(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\\s-])?(${Object.keys(ORDINALS).join('|')})\\b`, 'gi');

// Do two texts state the same numbers? Like comparing numbersIn(), but forgiving the ways a correct
// translation can say a number differently (all from runs 2–3's false alarms):
// - a word that stands for a number: "both" / "a pair" / "a couple" / "twice" = 2 ("both languages" ↩ "the two languages")
// - a scale said once for two numbers: "between 340 and 500 million" = "340 million to 500 million"
// - a unit converted: 90°F = 32°C, 800 miles = 1,287 km, 300 mph = 480 km/h (within 6%), and a conversion
//   added or left out in brackets: "3,000 miles" = "3,000 miles (4,800 km)"
// - "a decade" = 10 (years)
export function numbersMatch(original, back, lang) {
  const a = numbersIn(original, lang).split(' ').filter(Boolean);
  const b = numbersIn(back, lang).split(' ').filter(Boolean);
  if (a.join(' ') === b.join(' ')) return true;
  if (!isEnglish(lang)) return false;
  const left = [...a];
  const right = [...b];
  for (const x of a) {
    const i = right.indexOf(x);
    if (i >= 0) { right.splice(i, 1); left.splice(left.indexOf(x), 1); }
  }
  const value = (x) => parseFloat(x.replace(',', '.'));
  const ma = measures(original);
  const mb = measures(back);
  const sameAmount = (x, y) => {
    const [p, q] = [value(x), value(y)].sort((m, n) => m - n);
    if ([1e3, 1e6, 1e9].some((k) => Math.abs(q - p * k) < 1e-6 * q)) return true; // scale left off
    return ma.some((u) => u.v === value(x) && mb.some((w) => w.v === value(y) && sameMeasure(u, w)))
      || mb.some((u) => u.v === value(x) && ma.some((w) => w.v === value(y) && sameMeasure(u, w)));
  };
  for (let i = left.length - 1; i >= 0; i--) {
    const j = right.findIndex((y) => sameAmount(left[i], y));
    if (j >= 0) { left.splice(i, 1); right.splice(j, 1); }
  }
  // A number that's only a conversion of another amount in either text ("(4,800 km)") says nothing new.
  const all = [...ma, ...mb];
  const conversion = (x) => all.some((u) => u.v === value(x) && all.some((w) => sameMeasure(u, w)));
  for (const list of [left, right]) for (let i = list.length - 1; i >= 0; i--) if (conversion(list[i])) list.splice(i, 1);
  const stands = (s) => [...(TWO_WORDS.test(s) ? ['2'] : []), ...(/\ba decade\b/i.test(s) ? ['10'] : [])];
  return left.every((x) => stands(back).includes(x)) && right.every((y) => stands(original).includes(y));
}
const TWO_WORDS = /\b(?:both|a pair|a couple|twice|twins?)\b/i;

// Amounts with a unit, in one base unit per kind (°C, metres, kilograms, metres per second).
const UNITS = [
  [/°\s*F\b|\(F\)|degrees? (?:F\b|fahrenheit)|fahrenheit|\bF\b(?=[\s-]*degree)/i, 'temp', (v) => ((v - 32) * 5) / 9],
  [/°\s*C\b|\(C\)|degrees? (?:C\b|celsius)|celsius/i, 'temp', (v) => v],
  [/miles? per hour|mph/i, 'speed', (v) => v * 0.44704], [/km\/h|kph|kilomet(?:er|re)s? per hour/i, 'speed', (v) => v / 3.6],
  [/miles?\b/i, 'length', (v) => v * 1609.34], [/km\b|kilomet(?:er|re)s?/i, 'length', (v) => v * 1000],
  [/feet\b|foot\b|ft\b/i, 'length', (v) => v * 0.3048], [/met(?:er|re)s?\b|m\b/i, 'length', (v) => v],
  [/inch(?:es)?\b/i, 'length', (v) => v * 0.0254], [/cm\b|centimet(?:er|re)s?/i, 'length', (v) => v / 100],
  [/pounds?\b|lbs?\b/i, 'mass', (v) => v * 0.4536], [/kg\b|kilograms?/i, 'mass', (v) => v],
];
function measures(s) {
  const found = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)[\s-]*(\(?[°a-zA-Z][^\d,;]{0,20})/g)) {
    const unit = UNITS.find(([re]) => new RegExp(`^(?:${re.source})`, 'i').test(m[2]));
    if (unit) found.push({ v: parseFloat(m[1]), kind: unit[1], base: unit[2](parseFloat(m[1])), unit: unit[0] });
  }
  return found;
}
const sameMeasure = (u, w) => u.kind === w.kind && u.unit !== w.unit
  && (u.kind === 'temp' ? Math.abs(u.base - w.base) <= 1.5 : Math.abs(u.base - w.base) <= 0.06 * Math.max(u.base, w.base));

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// → [{ kind, detail, words?, missing? }] for each likely meaning change found. Empty = nothing
// suspicious. words: what to highlight in the ↩ line; missing: your words that didn't come back.
export function meaningChecks(original, back, lang) {
  if (!isEnglish(lang)) return [];
  const a = words(original);
  const b = words(back);
  const found = [];

  const [na, nb] = [negationWords(original), negationWords(back)];
  const built = (s) => negationText(s).filter(isBuiltNegative).length;
  if (na.length % 2 !== nb.length % 2 && (na.length + built(original)) % 2 !== (nb.length + built(back)) % 2) {
    // The words to point at: the extra negation in the ↩ line, or the one of yours that didn't come back.
    const more = nb.length > na.length;
    found.push({ kind: 'negation', detail: more ? 'a "not" (or "no", "never"…) appeared' : 'a "not" (or "no", "never"…) from your text didn\'t come back', words: more ? nb : [], missing: more ? [] : na });
  }

  const has = (ws, set) => ws.some((w) => set.has(w));
  const gendered = (ws) => has(ws, MALE) || has(ws, FEMALE);
  if ((has(a, MALE) && !has(a, FEMALE) && has(b, FEMALE)) || (has(a, FEMALE) && !has(a, MALE) && has(b, MALE) && !has(b, FEMALE))) {
    const swapped = has(a, MALE) ? FEMALE : MALE;
    found.push({ kind: 'pronoun', detail: 'a pronoun changed (he ↔ she)', words: b.filter((w) => swapped.has(w)) });
  } else if ((has(a, THEY) || has(a, NEO)) && !gendered(a) && gendered(b)) {
    found.push({ kind: 'pronoun', detail: `a gendered pronoun appeared where you wrote "${a.find((w) => NEO.has(w) || THEY.has(w))}"`, words: b.filter((w) => MALE.has(w) || FEMALE.has(w)) });
  } else if (has(a, NEO) && !a.filter((w) => NEO.has(w)).every((w) => b.includes(w))) {
    // Most languages have no neopronouns, so they usually come back as "they": worth saying, but not "likely off".
    found.push({ kind: 'pronoun', soft: true, detail: `your pronoun "${a.find((w) => NEO.has(w))}" didn't come back (most languages don't have it)`, words: [] });
  }
  // Only when your text states no gender at all: "the richest people… his wealth" ↩ "the richest men" adds nothing new.
  if (has(a, NEUTRAL_PEOPLE) && !has(a, GENDERED_PEOPLE) && !gendered(a) && has(b, GENDERED_PEOPLE)) {
    const added = b.find((w) => GENDERED_PEOPLE.has(w));
    found.push({ kind: 'pronoun', detail: `a gender appeared: "${added}" where you wrote "${a.find((w) => NEUTRAL_PEOPLE.has(w))}"`, words: b.filter((w) => GENDERED_PEOPLE.has(w)) });
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

// Text the translator couldn't translate (gibberish, a garbled snip, text already in the other
// language) comes back unchanged both ways, so the ↩ line matches perfectly though nothing was
// checked. Spot it in the translation itself: a long stretch copied word for word from your text,
// or most of your words. A lowercase word counts 1 in a stretch, a capitalized one ½ (often a name);
// numbers from your text and , . ' - don't break a stretch. Set so that no good translation in the
// meaning tests trips it: names, units and loanwords stay at 5 or under (docs/meaning-check-tests).
const TOKEN = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*|\d+|[^\s\p{L}\p{M}\d]/gu;
const COPIED_RUN = 6;
const COPIED_SHARE = 0.8;
const isWord = (t) => /^[\p{L}\p{M}]/u.test(t);
const isLower = (w) => w === w.toLowerCase() && w !== w.toUpperCase();

// → the copied words (to point at in the ↩ line), or null when the text was translated.
export function untranslated(original, translation) {
  const mine = original.match(TOKEN) || [];
  const myWords = new Set(mine.filter(isWord).map((w) => w.toLowerCase()));
  const myNumbers = new Set(mine.filter((t) => /^\d/.test(t)));
  let run = 0;
  let stretch = [];
  let best = [];
  let bestRun = 0;
  for (const t of translation.match(TOKEN) || []) {
    if (isWord(t) && myWords.has(t.toLowerCase())) {
      run += isLower(t) ? 1 : 0.5;
      stretch.push(t);
      if (run > bestRun) { bestRun = run; best = [...stretch]; }
    } else if (!myNumbers.has(t) && !',.\'’-'.includes(t)) {
      run = 0;
      stretch = [];
    }
  }
  if (bestRun >= COPIED_RUN) return best;
  const theirs = new Set((translation.match(TOKEN) || []).filter(isWord).map((w) => w.toLowerCase()));
  const all = mine.filter(isWord).map((w) => w.toLowerCase());
  const copied = all.filter((w) => theirs.has(w));
  return all.length >= 4 && copied.length / all.length >= COPIED_SHARE ? [...new Set(copied)] : null;
}
