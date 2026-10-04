import { meaningChecks, numbersIn, missingWords } from './meaning-checks.js';

// Back-translation match: how much of your meaning survived the round trip
// (your text → translation → back into your language). Compared by meaning, not exact words,
// so rewording and synonyms ("good morning" / "good day") don't count against a good translation.
// The model runs locally in meaning-worker.js and is unloaded after a few idle minutes.

const IDLE_MS = 5 * 60 * 1000;
// Model similarity → score, tuned on test pairs: faithful rewordings land around 0.78–0.99; a
// dropped detail or changed day around 0.70–0.75; a reversed meaning around 0.4–0.6.
// LOW and below counts as 0%, HIGH and above as 100%.
const LOW = 0.55;
const HIGH = 0.85;
const NUMBER_CAP = 60; // a number that changed is a real error, whatever the model thinks
const CHECK_CAP = 60; // same for the targeted checks in meaning-checks.js (negation, he/she, opposites…)

let worker = null;
let idleTimer = null;
let nextId = 0;
const pending = new Map(); // id → { resolve, reject }

function scheduleUnload() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pending.size) return scheduleUnload(); // still downloading or working
    worker?.terminate(); // frees the model's memory; it reloads from cache in a second or two
    worker = null;
  }, IDLE_MS);
}

function getWorker() {
  scheduleUnload();
  if (worker) return worker;
  worker = new Worker(new URL('./meaning-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.error) job.reject(new Error(data.error));
    else job.resolve(data.cosine);
  };
  worker.onerror = (e) => {
    for (const job of pending.values()) job.reject(new Error(e.message || 'meaning model failed to start'));
    pending.clear();
    worker = null;
  };
  return worker;
}

function similarity(a, b) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, a, b });
  });
}

// Lowercase, unify look-alike characters, drop punctuation and symbols, squeeze spaces.
export function normalize(s) {
  return s.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

// "1,000" / "1.000" / "1 000" → "1000": formatting alone shouldn't change the score.
const plainNumbers = (s) => s.replace(/(\d)[,.   ](?=\d{3}(?!\d))/g, '$1');

export const tier = (score) => (score >= 85 ? 'high' : score >= 65 ? 'mid' : 'low');

// lang: your language (the one both texts are in), for the word-based checks.
// → { score: 0–100, similarity: the score before any cap, numbersDiffer, checks: [{ kind, detail, words? }],
//     changed: words to highlight in the ↩ line, missing: your words that didn't come back }
export async function matchScore(original, back, lang) {
  original = plainNumbers(original);
  back = plainNumbers(back);
  const a = normalize(original);
  const b = normalize(back);
  if (!a || !b) throw new Error('nothing to compare');
  // "2 goals" and "two goals" are the same number.
  const numbersDiffer = numbersIn(original, lang) !== numbersIn(back, lang);
  const checks = a === b ? [] : meaningChecks(original, back, lang);
  let similarityScore = 100;
  if (a !== b) {
    const cosine = await similarity(original, back);
    similarityScore = Math.round(Math.min(1, Math.max(0, (cosine - LOW) / (HIGH - LOW))) * 100);
  }
  let score = similarityScore;
  if (numbersDiffer) score = Math.min(score, NUMBER_CAP);
  if (checks.length) score = Math.min(score, CHECK_CAP);
  // What to point at: the words behind each flag, plus numbers that don't match.
  const theirs = numbersIn(back, lang).split(' ').filter(Boolean);
  const mine = numbersIn(original, lang).split(' ').filter(Boolean);
  const changed = [...checks.flatMap((c) => c.words || []), ...(numbersDiffer ? theirs.filter((n) => !mine.includes(n)) : [])];
  return { score, similarity: similarityScore, numbersDiffer, checks, changed, missing: score < 85 ? missingWords(original, back, lang).slice(0, 6) : [] };
}
