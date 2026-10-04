// Copy of normalize() from resources/meaning.js (that file also starts a Worker, which jsc lacks).
export function normalize(s) {
  return s.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
