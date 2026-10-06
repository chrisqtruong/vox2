// The meaning check for the app's translations: each translated string was translated back into
// English (translate.mjs); this compares that with what was meant, using the same model and scale
// as Vox2's own match score (meaning-worker.js: paraphrase-multilingual-MiniLM-L12-v2, 8-bit).
// Strings scoring under FLAG are listed for a person to read, and fixed in fixes/<code>.json.
//
//   node tools/i18n/check.mjs            writes check-report.md and check-flagged.json
//
// Needs transformers.js: `npm i @huggingface/transformers` somewhere and NODE_PATH pointing at
// that node_modules (it isn't a dependency of the app itself, which loads it from a CDN).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const FLAG = 70; // the app's "check the details" band starts at 85; UI labels are short, so be a bit gentler

const require = createRequire(join(process.env.NODE_PATH ? join(process.env.NODE_PATH, '..') : HERE, 'x.js'));
const transformers = await import(require.resolve('@huggingface/transformers'));
const { pipeline } = transformers.pipeline ? transformers : transformers.default;
const embed = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', { dtype: 'q8' });

const strings = Object.keys(read(join(HERE, 'strings.json')));
const context = read(join(HERE, 'context.json'), {});
const { LANGUAGES } = await import(join(ROOT, 'resources', 'languages.js'));
const names = Object.fromEntries(LANGUAGES);
const codes = read(join(ROOT, 'resources', 'i18n', 'index.json'), []);

const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/\{\w+\}/g, 'X').toLowerCase();
const vectors = new Map();
async function vecs(texts) {
  const todo = [...new Set(texts.map(plain))].filter((t) => !vectors.has(t));
  for (let i = 0; i < todo.length; i += 64) {
    const out = (await embed(todo.slice(i, i + 64), { pooling: 'mean', normalize: true })).tolist();
    out.forEach((v, j) => vectors.set(todo[i + j], v));
  }
}
const cos = (a, b) => { const x = vectors.get(plain(a)); const y = vectors.get(plain(b)); return x.reduce((s, v, i) => s + v * y[i], 0); };
const score = (meant, back) => (plain(meant) === plain(back) ? 100 : Math.round(Math.min(1, Math.max(0, (cos(meant, back) - 0.55) / 0.30)) * 100));

const rows = [];
const choices = {};
const flagged = {};
for (const code of codes) {
  const work = read(join(HERE, 'work', `${code}.json`), {});
  const fixes = read(join(HERE, 'fixes', `${code}.json`), {});
  // A label with several wordings (context.json lists them): keep the one whose round trip comes
  // back closest to the first, which states the meaning.
  const items = [];
  for (const key of strings) {
    const options = [].concat(context[key] || key);
    const tried = options.map((src, i) => ({ i, src, ...work[src] })).filter((x) => x.back);
    await vecs([options[0], ...tried.map((x) => x.back)]);
    tried.forEach((x) => { x.score = score(options[0], x.back); });
    const best = tried.sort((a, b) => b.score - a.score || a.i - b.i)[0];
    if (!best) continue;
    if (options.length > 1) (choices[code] ||= {})[key] = best.i;
    items.push({ key, meant: options[0], text: best.text, back: best.back, score: best.score });
  }
  const low = items.filter((x) => x.score < FLAG);
  const open = low.filter((x) => !(x.key in fixes));
  flagged[code] = Object.fromEntries(open.map((x) => [x.key, { text: x.text, back: x.back, score: x.score }]));
  const avg = Math.round(items.reduce((s, x) => s + x.score, 0) / (items.length || 1));
  rows.push({ code, name: names[code], avg, low: low.length, fixed: low.length - open.length, hand: Object.keys(fixes).length, n: items.length });
  process.stdout.write(`${code} ${avg} (${low.length} low) · `);
}

writeFileSync(join(HERE, 'choices.json'), `${JSON.stringify(choices, null, 1)}\n`);
writeFileSync(join(HERE, 'check-flagged.json'), `${JSON.stringify(flagged, null, 1)}\n`);
const date = new Date().toISOString().slice(0, 10);
const md = [
  `# App translations: meaning check (${date})`,
  '',
  `Every string Vox2 shows (${strings.length}) was machine-translated into each language and then translated back into English. The back-translation is compared with what was meant, using the same model and scale as Vox2's match score. A string scores under ${FLAG} when its round trip says something noticeably different; those are listed in \`check-flagged.json\` for a person to read, and corrected in \`fixes/<code>.json\`.`,
  '',
  'This catches wrong-sense words ("clear" read as "transparent") and mangled phrases. It can\'t catch a translation that is wrong in a way that translates back correctly, so a native speaker\'s read is still worth more. Corrections are welcome: edit `fixes/<code>.json` and run `translate.mjs`.',
  '',
  `| Language | Avg. score | Under ${FLAG} | Fixed by hand | Hand fixes total |`,
  '|---|---|---|---|---|',
  ...rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => `| ${r.name} (\`${r.code}\`) | ${r.avg} | ${r.low} | ${r.fixed} | ${r.hand} |`),
  '',
].join('\n');
writeFileSync(join(HERE, 'check-report.md'), md);
console.log(`\n${rows.length} languages → tools/i18n/check-report.md`);
