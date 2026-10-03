import { langName } from './languages.js';
import { ENGINES, translate, detectLanguage, checkBack } from './engines.js';
import { attachLangPicker } from './langpicker.js';
import { readText, tesseractLang } from './ocr.js';
import { matchScore, tier } from './meaning.js';
import { THEME_GROUPS, applyTheme } from './themes.js';
import {
  Dictation, STT_MODELS, listMics, onWhisperEvent, preloadWhisper, whisperAwake, setKeepLoaded, scheduleUnload, isModelSaved,
  setIdleRelease,
} from './dictation.js';
import { speak, stop as stopSpeech, setSpeed, setVolume, voicesFor, voiceLabel, defaultVoice, OPENAI_VOICES } from './tts.js';
import {
  native, loadData, saveData, setAlwaysOnTop, openUrl, onNative, setHotkey, typeText, sendPill,
  setCloseToTray, setWindowAlpha, setAutostart, resetKeys, hideWindow,
  sendBubble, openBubble, showWindow, startSnip, takeSnip, getSecret, setSecret, memoryInfo, resizeWindowHeight,
  getPermissions, requestPermission, openPrivacy, relaunch, hideBubble,
} from './platform.js';

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- settings ---------- */

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const DEFAULTS = {
  engine: 'google', top: 'en', bottom: 'vi', onTop: false, keys: {}, models: {},
  pinnedLangs: [], // favorites shown first in the language menu
  theme: 'auto', font: 'mono', zoom: 1,
  mic: '', sttEngine: 'whisper', sttModel: 'small', sttOpenaiModel: 'gpt-4o-mini-transcribe',
  sttSilence: 3, // seconds of quiet that end a tapped dictation; 0 = never
  sttEnabled: true, sttKeep: 'save', // keep the voice model loaded: 'always' or 'save' (release when idle)
  ttsEngine: 'neural', ttsGender: 'F', ttsVoices: {}, ttsOpenaiVoice: 'coral',
  ttsSpeed: 1, ttsVolume: 100, // read-aloud speed (0.75 / 1 / 1.25) and volume (0–100)
  sttOutput: 'spoken', // dictating into another app types 'spoken' (what you said) or 'translation'
  // Lone right-hand modifier, like Wispr Flow / SuperWhisper: easy to hit, rarely used otherwise.
  sttShortcut: { code: MAC ? 'AltRight' : 'ControlRight' },
  summonShortcut: MAC ? { code: 'Space', meta: true, shift: true } : { code: 'Space', ctrl: true, shift: true },
  selectShortcut: MAC ? { code: 'KeyT', meta: true, alt: true } : { code: 'KeyT', ctrl: true, alt: true },
  pinShortcut: MAC ? { code: 'KeyP', meta: true } : { code: 'KeyP', ctrl: true }, // while Vox2 is in front
  // Also only while Vox2 is in front. Mac: ⌘H would hide the app, so history is ⌘Y (as in Safari).
  fitShortcut: MAC ? { code: 'KeyF', meta: true, shift: true } : { code: 'KeyF', ctrl: true, shift: true },
  historyShortcut: MAC ? { code: 'KeyY', meta: true } : { code: 'KeyH', ctrl: true },
  settingsShortcut: MAC ? { code: 'Comma', meta: true } : { code: 'Comma', ctrl: true },
  snipShortcut: MAC ? { code: 'KeyS', meta: true, alt: true } : { code: 'KeyS', ctrl: true, alt: true },
  quickResult: 'bubble', // quick translations (selected text, snips) show in: 'bubble' or 'window'
  conversation: false, // conversation mode: speak each dictated phrase's translation aloud
  tone: 'auto', toneNote: '',
  showRoman: true, showBack: false, showMatch: true, // showMatch: meaning score on the back-translation
  fade: true, closeToTray: true, autostart: false,
  updates: 'auto', // 'auto' (install when you're not using Vox2), 'ask', or 'off'
  permCheck: true, // macOS: open the permissions sheet at startup while something's missing
  colorblind: false, // match scores in colorblind-friendly colors (with symbols) instead of theme colors
};
let settings = { ...DEFAULTS };

async function load(key, fallback) {
  try {
    const raw = await loadData(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const save = (key, value) => saveData(key, JSON.stringify(value));

async function loadSettings() {
  const saved = await load('settings', {});
  // Speed used to be a percent change baked into the voice (-20 / 0 / +15).
  if (saved.ttsRate != null && saved.ttsSpeed == null) saved.ttsSpeed = saved.ttsRate < 0 ? 0.75 : saved.ttsRate > 0 ? 1.25 : 1;
  delete saved.ttsRate;
  settings = { ...DEFAULTS, ...saved, keys: { ...saved.keys } };
  await loadKeys();
}

/* API keys: kept in the system's credential store (Windows Credential Manager / macOS Keychain),
   never in settings.json. Older versions saved them in the file; the first launch after updating
   moves them over, checks each one reads back, and only then drops them from the file. If the
   store isn't available, keys stay in the file as before, so nobody loses a key. */

const KEY_ENGINES = Object.keys(ENGINES).filter((id) => ENGINES[id].keyUrl);
let keysInVault = false;
const vaultKeys = {}; // what the store holds, so saving only writes keys that changed

async function loadKeys() {
  if (!native) return; // plain browser (development): no store, keys stay in local storage
  try {
    const fromFile = KEY_ENGINES.filter((id) => settings.keys[id]);
    for (const id of KEY_ENGINES) {
      if (settings.keys[id]) {
        await setSecret(id, settings.keys[id]);
        if ((await getSecret(id)) !== settings.keys[id]) throw new Error(`${id} key didn't read back`);
      } else {
        settings.keys[id] = (await getSecret(id)) || '';
      }
      vaultKeys[id] = settings.keys[id];
    }
    keysInVault = true;
    if (fromFile.length) saveSettings(); // rewrite settings.json without them
  } catch (err) {
    keysInVault = false;
    console.warn('credential store unavailable; API keys stay in settings.json:', err);
  }
}

function saveSettings() {
  if (!keysInVault) return save('settings', settings);
  const { keys, ...rest } = settings;
  save('settings', rest);
  for (const id of KEY_ENGINES) {
    const value = keys[id] || '';
    if (value === (vaultKeys[id] || '')) continue;
    vaultKeys[id] = value;
    setSecret(id, value).catch((err) => setStatus('error', `couldn't save the ${ENGINES[id].name} key: ${err}`));
  }
}

/* ---------- panes ---------- */

const panes = {};
for (const key of ['top', 'bottom']) {
  const root = $(`[data-pane="${key}"]`);
  panes[key] = { key, root, el: $('.text', root), lang: $('.lang', root), committed: '' };
}
const other = (key) => (key === 'top' ? 'bottom' : 'top');
let source = 'top'; // the pane the user last typed in

// The language a pane is actually in: its pick, or what was detected when set to "detect".
const langOf = (pane) => (pane.lang.value === 'auto' ? pane.lang.detected || 'en' : pane.lang.value);

const detections = new Map(); // text → language code
async function detectCached(text) {
  const key = text.slice(0, 500);
  if (!detections.has(key)) {
    const code = await detectLanguage(key);
    if (!code) throw new Error('could not detect the language');
    detections.set(key, code);
    if (detections.size > 100) detections.delete(detections.keys().next().value);
  }
  return detections.get(key);
}

const getText = (pane) => pane.el.innerText.replace(/ /g, ' ');

// Either side can be the one you write in, so placeholders follow the content, not the position:
// both empty → each invites input in its language; one filled → the other is "translation…".
function updateEmpty() {
  const list = Object.values(panes);
  for (const p of list) p.el.classList.toggle('is-empty', p.el.textContent.length === 0);
  const anyText = list.some((p) => p.el.textContent.length > 0);
  for (const p of list) {
    p.el.dataset.placeholder = anyText ? 'translation…'
      : `type or speak in ${p.lang.value === 'auto' ? 'any language' : langName(p.lang.value)}`;
  }
  if (!anyText) unfit(); // both boxes cleared: back to two equal halves
}

// Replace a pane's content with [{ t, cls }] segments.
function paint(pane, segs) {
  const frag = document.createDocumentFragment();
  for (const { t, cls } of segs) {
    if (!t) continue;
    if (!cls) { frag.append(t); continue; }
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = t;
    frag.append(span);
  }
  pane.el.replaceChildren(frag);
  updateEmpty(pane);
}

// Collapse colored spans back into one plain text node, keeping the caret.
function flatten(pane) {
  const el = pane.el;
  if (!el.querySelector('span')) return;
  let caret = -1;
  const sel = getSelection();
  if (document.activeElement === el && sel.rangeCount) {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
    caret = r.toString().length;
  }
  el.textContent = el.textContent;
  if (caret >= 0 && el.firstChild) {
    sel.collapse(el.firstChild, Math.min(caret, el.firstChild.length));
  }
}

// Length of the shared start of two strings, backed off to a word boundary
// so a half-changed word reads as pending rather than confirmed.
function stablePrefix(next, prev) {
  let p = 0;
  const n = Math.min(next.length, prev.length);
  while (p < n && next[p] === prev[p]) p++;
  if (p === next.length || p === prev.length && /[\s\p{P}]/u.test(next[p])) return p;
  for (let i = p; i >= 0 && p - i < 24; i--) if (i === 0 || /\s/.test(next[i - 1])) return i;
  return p; // no spaces nearby (e.g. Chinese/Japanese): keep the raw prefix
}

// While the engine is still working: confirmed words stay ink, new words are gray.
function paintStreaming(pane, text) {
  const prev = pane.committed;
  const p = stablePrefix(text, prev);
  const segs = [{ t: text.slice(0, p) }, { t: text.slice(p), cls: 'pending' }];
  // Keep the old tail visible (gray) while the new text is still catching up to it.
  if (prev.startsWith(text)) segs.push({ t: prev.slice(text.length), cls: 'pending' });
  paint(pane, segs);
}

// Engine is done: everything turns ink, new words fade in from gray.
function paintFinal(pane, text) {
  const p = stablePrefix(text, pane.committed);
  paint(pane, [{ t: text.slice(0, p) }, { t: text.slice(p), cls: 'settle' }]);
  pane.committed = text;
  clearTimeout(pane.flattenTimer);
  pane.flattenTimer = setTimeout(() => flatten(pane), 350);
}

/* ---------- translation ---------- */

const cache = new Map();
const CACHE_MAX = 200;
const inflight = new Map(); // job id -> AbortController
let jobId = 0;   // newest job started
let shownId = 0; // newest job whose output is on screen
let timer = null;

function schedule(delay = ENGINES[settings.engine].debounce) {
  clearTimeout(timer);
  timer = setTimeout(run, delay);
}

// Jobs overlap while you type, so earlier results can show up as you go.
// A job may paint only if nothing newer has; once it does, older jobs are dropped.
function claim(id) {
  if (id < shownId) return false;
  shownId = id;
  for (const [j, c] of inflight) if (j < id) { c.abort(); inflight.delete(j); }
  return true;
}

function cancelAll() {
  clearTimeout(timer);
  for (const c of inflight.values()) c.abort();
  inflight.clear();
  shownId = ++jobId;
  hideExtras();
}

async function run() {
  clearTimeout(timer);
  clearTimeout(historyTimer);
  const id = ++jobId;
  const src = panes[source];
  const dst = panes[other(source)];
  const text = getText(src);
  let from = src.lang.value;
  const to = langOf(dst);
  const finish = (out) => {
    if (!claim(id)) return;
    paintFinal(dst, out);
    if (!inflight.size) setStatus('idle');
    toBubble(dst, out, true, from, to);
    if (id === jobId && from !== to) {
      noteFinished({ src: text.trim(), dst: out.trim(), from, to });
      updateExtras(dst, out, to, from, text.trim());
    }
    // Conversation mode: a dictated phrase was just translated; say it out loud.
    if (id === jobId && speakWhenTranslated === dst) {
      speakWhenTranslated = null;
      readAloud(dst);
    }
  };

  if (!text.trim()) {
    claim(id);
    paint(dst, []);
    dst.committed = '';
    hideExtras();
    setStatus('idle');
    return;
  }
  // "Detect language": find out what this is, show it on the button, then translate from it.
  if (from === 'auto') {
    try {
      from = await detectCached(text);
    } catch (err) {
      if (id === jobId) setStatus('error', err.message, 'engine');
      if (quick.active && quick.dst === dst) sendBubble({ session: quick.session, error: err.message });
      return;
    }
    if (id !== jobId) return; // you kept typing; a newer run takes over
    if (src.lang.detected !== from) { src.lang.detected = from; updateEmpty(); }
  }
  if (from === to) return finish(text);

  const model = settings.models[settings.engine] || '';
  const cacheKey = [settings.engine, model, from, to, text].join('\u0000');
  if (cache.has(cacheKey)) return finish(cache.get(cacheKey));

  const controller = new AbortController();
  inflight.set(id, controller);
  setStatus('busy');
  try {
    const out = await translate(settings, {
      text, from, to,
      signal: controller.signal,
      onText: (partial) => { if (claim(id)) { paintStreaming(dst, partial); toBubble(dst, partial, false, from, to); } },
    });
    inflight.delete(id);
    const clean = text.endsWith('\n') ? out : out.replace(/\s+$/, '');
    cache.set(cacheKey, clean);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    finish(clean);
  } catch (err) {
    inflight.delete(id);
    if (err.name === 'AbortError' || id !== jobId) return;
    paint(dst, [{ t: dst.committed }]);
    setStatus('error', err.message, err.auth ? 'key' : 'model');
    if (quick.active && quick.dst === dst) sendBubble({ session: quick.session, error: err.message });
  }
}

/* ---------- status bar ---------- */

const statusEl = $('#status');
const statusText = $('#status-text');
let statusFix = 'engine';

function engineLabel() {
  const meta = ENGINES[settings.engine];
  if (!meta.defaultModel) return meta.name;
  const model = settings.models[settings.engine] || meta.defaultModel;
  return `${meta.name} · ${model.replace(/^claude-|-\d{8}$/g, '')}`;
}

// fix: where in settings the problem can be solved ('key', 'model', 'engine', 'voice', 'read').
// Errors with a fix say "click to fix" and open settings right at that spot.
function setStatus(state, message, fix = null) {
  // While the mic is on, say so instead of the engine name.
  const listening = state !== 'error' && dictation?.label;
  const error = state === 'error';
  statusEl.className = `status ${listening ? 'busy' : state}${error && fix ? ' fixable' : ''}`;
  statusText.textContent = error ? message : listening || engineLabel();
  $('#status-fix').hidden = !(error && fix); // its own label, so a long message can't push it out of view
  statusEl.title = error ? (fix ? `${message}\nClick to open settings` : message) : 'Translation engine · click for settings';
  statusFix = error ? fix : 'engine';
}

statusEl.addEventListener('click', () => { if (statusFix) openSettings(statusFix); });

/* ---------- pane events ---------- */

let pasted = false;

for (const pane of Object.values(panes)) {
  pane.el.addEventListener('beforeinput', () => {
    clearTimeout(pane.flattenTimer);
    flatten(pane);
  });
  pane.el.addEventListener('input', () => {
    quick.active = false; // typing in the window: the bubble is done
    if (source !== pane.key) {
      cancelAll(); // don't let a late translation overwrite what you're typing
      source = pane.key;
      panes[other(pane.key)].committed = getText(panes[other(pane.key)]);
    }
    updateEmpty(pane);
    schedule(pasted ? 0 : undefined);
    pasted = false;
  });
  // Paste as plain text and translate right away.
  pane.el.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text/plain');
    if (text == null) return;
    e.preventDefault();
    pasted = true;
    document.execCommand('insertText', false, text);
  });

  pane.lang.addEventListener('change', () => {
    updateEmpty();
    settings[pane.key] = pane.lang.value;
    saveSettings();
    run();
  });

  pane.root.querySelector('[data-act="copy"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const text = getText(pane);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard blocked; nothing else to fall back to
    }
    $('use', btn).setAttribute('href', '#i-check');
    setTimeout(() => $('use', btn).setAttribute('href', '#i-copy'), 900);
  });

  pane.root.querySelector('[data-act="clear"]').addEventListener('click', () => {
    cancelAll();
    for (const p of Object.values(panes)) { paint(p, []); p.committed = ''; }
    source = pane.key;
    setStatus('idle');
    pane.el.focus();
  });
}

$('#swap').addEventListener('click', () => {
  cancelAll();
  const { top, bottom } = panes;
  const [ta, td, ba, bd] = [top.lang.value, top.lang.detected, bottom.lang.value, bottom.lang.detected];
  top.lang.value = ba;
  bottom.lang.value = ta;
  if (ba === 'auto') top.lang.detected = bd;
  if (ta === 'auto') bottom.lang.detected = td;
  settings.top = top.lang.value;
  settings.bottom = bottom.lang.value;
  saveSettings();
  const [a, b] = [getText(top), getText(bottom)];
  paint(top, [{ t: b }]);
  paint(bottom, [{ t: a }]);
  source = other(source);
  panes[other(source)].committed = getText(panes[other(source)]);
  run(); // in case a translation was mid-flight when swapped
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.repeat && stopAudio()) return; // reading aloud or dictating: stop that first
  if (e.key === 'Escape' && sheet.classList.contains('open')) closeSettings();
  else if (e.key === 'Escape' && historySheet.classList.contains('open')) closeHistory();
  else if (e.key === 'Escape' && permSheet.classList.contains('open')) closePerms();
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
});

/* ---------- always on top ---------- */

const pinBtn = $('#pin');
const onTopToggle = $('#ontop-toggle');

function applyOnTop() {
  pinBtn.setAttribute('aria-pressed', String(settings.onTop));
  pinBtn.title = `Keep on top: ${settings.onTop ? 'on' : 'off'}`; // the shortcut shows in the bar's tooltip
  onTopToggle.checked = settings.onTop;
  setAlwaysOnTop(settings.onTop);
  applyFade();
}

function setOnTop(on) {
  settings.onTop = on;
  saveSettings();
  applyOnTop();
}

pinBtn.addEventListener('click', () => setOnTop(!settings.onTop));
onTopToggle.addEventListener('change', () => setOnTop(onTopToggle.checked));

/* ---------- appearance ---------- */

const themesEl = $('#themes');

function themeTile(name, colors) {
  const btn = document.createElement('button');
  btn.className = 'theme';
  btn.dataset.theme = name;
  btn.style.background = colors.bg;
  btn.style.color = colors.main;
  btn.innerHTML = '<span></span><span class="swatch"><i></i><i></i><i></i></span>';
  btn.firstChild.textContent = name;
  [colors.main, colors.sub, colors.text].forEach((c, i) => { btn.querySelectorAll('i')[i].style.background = c; });
  // Hovering previews the theme, like Monkeytype; leaving restores the chosen one.
  btn.addEventListener('mouseenter', () => applyTheme(name));
  btn.addEventListener('mouseleave', () => applyTheme(settings.theme));
  btn.addEventListener('click', () => {
    settings.theme = name;
    saveSettings();
    applyTheme(name);
    markTheme();
  });
  return btn;
}

function renderThemes() {
  const auto = matchMedia('(prefers-color-scheme: dark)').matches
    ? { bg: '#171717', main: '#7aa5ff', sub: '#66665f', text: '#ececea' }
    : { bg: '#fafaf9', main: '#2f6feb', sub: '#a8a8a4', text: '#1c1c1b' };
  const nodes = [];
  const grid = () => Object.assign(document.createElement('div'), { className: 'themes' });
  const first = grid();
  first.append(themeTile('auto', auto));
  nodes.push(first);
  for (const { group, themes } of THEME_GROUPS) {
    nodes.push(Object.assign(document.createElement('h3'), { textContent: group }));
    const g = grid();
    g.append(...themes.map((t) => themeTile(t.name, t)));
    nodes.push(g);
  }
  themesEl.replaceChildren(...nodes);
  markTheme();
}

function markTheme() {
  for (const b of themesEl.querySelectorAll('.theme')) {
    b.setAttribute('aria-pressed', String(b.dataset.theme === settings.theme));
  }
}

function applyColorblind() {
  document.documentElement.toggleAttribute('data-colorblind', !!settings.colorblind);
  $('#colorblind-toggle').checked = !!settings.colorblind;
}
$('#colorblind-toggle').addEventListener('change', (e) => { settings.colorblind = e.target.checked; saveSettings(); applyColorblind(); });

function applyFont() {
  document.documentElement.dataset.font = settings.font;
  for (const b of $('#fonts').children) b.setAttribute('aria-pressed', String(b.dataset.font === settings.font));
}

for (const b of $('#fonts').children) {
  b.addEventListener('click', () => { settings.font = b.dataset.font; saveSettings(); applyFont(); });
}

/* ---------- zoom ---------- */

// Same steps as Chrome/Edge, so the numbers feel familiar.
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const hud = $('#zoom-hud');
let hudTimer = null;

function applyZoom(showHud = false) {
  document.documentElement.style.zoom = settings.zoom;
  const pct = `${Math.round(settings.zoom * 100)}%`;
  $('#zoom-value').textContent = pct;
  if (showHud) flashHud(pct);
}

// The faint centered readout: zoom level, pinned/unpinned.
function flashHud(text) {
  hud.textContent = text;
  hud.classList.add('show');
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => hud.classList.remove('show'), 700);
}

// dir: +1 in, -1 out, 0 reset to 100%.
function stepZoom(dir) {
  const nearest = ZOOM_STEPS.reduce((best, z, i) =>
    Math.abs(z - settings.zoom) < Math.abs(ZOOM_STEPS[best] - settings.zoom) ? i : best, 0);
  const i = dir === 0 ? ZOOM_STEPS.indexOf(1) : Math.min(Math.max(nearest + dir, 0), ZOOM_STEPS.length - 1);
  settings.zoom = ZOOM_STEPS[i];
  saveSettings();
  applyZoom(true);
}

// Ctrl/Cmd + scroll. Trackpads send many tiny deltas, so collect them into one step.
let wheelAcc = 0;
window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) < 40) return;
  stepZoom(wheelAcc < 0 ? 1 : -1);
  wheelAcc = 0;
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (e.key === '=' || e.key === '+') stepZoom(1);
  else if (e.key === '-' || e.key === '_') stepZoom(-1);
  else if (e.key === '0') stepZoom(0);
  else return;
  e.preventDefault();
});

for (const b of $('#zoom-controls').children) {
  if (MAC) b.title = b.title.replace('Ctrl ', '⌘');
  b.addEventListener('click', () => stepZoom(Number(b.dataset.zoom)));
}

/* ---------- settings sheet ---------- */

const sheet = $('#settings');
const enginesEl = $('#engines');
const fields = $('#engine-fields');
const keyInput = $('#api-key');
const modelInput = $('#model');
const modelList = $('#model-list');

function renderEngines() {
  enginesEl.replaceChildren(...Object.entries(ENGINES).map(([id, meta]) => {
    const btn = document.createElement('button');
    btn.className = 'engine';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(id === settings.engine));
    btn.innerHTML = '<span class="radio"></span><span><b></b><small></small></span>';
    $('b', btn).textContent = meta.name;
    $('small', btn).textContent = meta.note;
    btn.addEventListener('click', () => {
      settings.engine = id;
      saveSettings();
      renderEngines();
      renderTone();
      setStatus('idle');
      schedule(0);
    });
    return btn;
  }));

  const meta = ENGINES[settings.engine];
  fields.hidden = !meta.keyUrl;
  if (!meta.keyUrl) return;
  keyInput.value = settings.keys[settings.engine] || '';
  modelInput.value = settings.models[settings.engine] || meta.defaultModel;
  modelList.replaceChildren(...meta.models.map((m) => Object.assign(document.createElement('option'), { value: m })));
}

keyInput.addEventListener('input', () => {
  settings.keys[settings.engine] = keyInput.value.trim();
  saveSettings();
});
modelInput.addEventListener('input', () => {
  const m = modelInput.value.trim();
  if (m && m !== ENGINES[settings.engine].defaultModel) settings.models[settings.engine] = m;
  else delete settings.models[settings.engine];
  saveSettings();
  setStatus('idle');
});

$('#key-link').addEventListener('click', (e) => {
  e.preventDefault();
  const url = ENGINES[settings.engine].keyUrl;
  openUrl(url);
});

function openSettings(target) {
  if (historySheet.classList.contains('open')) closeHistory();
  if (permSheet.classList.contains('open')) closePerms();
  renderEngines();
  renderVoice();
  renderShortcuts();
  renderTone();
  renderWindowOpts();
  renderUpdates();
  renderPermEntry();
  renderTTS();
  renderThemes();
  applyFont();
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  // Land where the problem gets fixed: the key or model box, or the right section.
  const aiEngine = !!ENGINES[settings.engine].keyUrl;
  const spot = {
    key: aiEngine ? keyInput : $('#sec-engine'),
    model: aiEngine ? modelInput : $('#sec-engine'),
    engine: $('#sec-engine'),
    voice: $('#sec-voice'),
    read: $('#sec-read'),
  }[target];
  if (spot) {
    spot.scrollIntoView({ block: 'center' });
    if (spot.tagName === 'INPUT') { spot.focus(); spot.select(); } else $('#settings-done').focus({ preventScroll: true });
  } else {
    (aiEngine && !keyInput.value ? keyInput : $('#settings-done')).focus();
  }
}

function closeSettings() {
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  setStatus('idle');
  schedule(0); // pick up a new key / model / engine
  panes[source].el.focus();
}

$('#gear').addEventListener('click', () => openSettings());
$('#settings-done').addEventListener('click', closeSettings);

// The menu at the top jumps to a section; once it scrolls out of view, an arrow brings you back up.
const sheetBody = $('.sheet-body', sheet);
const toTop = $('#settings-top');
for (const b of $('#settings-nav').children) {
  b.addEventListener('click', () => $(`#${b.dataset.jump}`).scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
new IntersectionObserver(([entry]) => toTop.classList.toggle('show', !entry.isIntersecting), { root: sheetBody })
  .observe($('#settings-nav'));
toTop.addEventListener('click', () => sheetBody.scrollTo({ top: 0, behavior: 'smooth' }));

/* ---------- dictation ---------- */

const NO_SPACE_LANGS = new Set(['zh-CN', 'zh-TW', 'ja', 'th', 'lo', 'km', 'my']);
let dictation = null; // { pane, d, text, partial, dead }

function joinSpoken(a, b, lang) {
  if (!a || !b) return a + b;
  return NO_SPACE_LANGS.has(lang) || /\s$/.test(a) ? a + b : `${a} ${b}`;
}

// Confirmed speech in ink, the phrase still being heard in gray (same as translations).
function renderDictation(st) {
  const lang = langOf(st.pane);
  const withPartial = joinSpoken(st.text, st.partial, lang);
  paint(st.pane, [{ t: st.text }, { t: withPartial.slice(st.text.length), cls: 'pending' }]);
}

function setMicUI(pane, on) {
  for (const p of Object.values(panes)) {
    const btn = p.root.querySelector('[data-act="mic"]');
    btn.setAttribute('aria-pressed', String(on && p === pane));
    btn.classList.remove('loading');
  }
}

const whisperProgress = {};
const modelSaved = {}; // model → already on disk?
onWhisperEvent((e) => {
  if (e.type === 'ready') modelSaved[e.model] = true;
  if (!dictation || dictation.dead) return; // e.g. preloading in the background ("always ready")
  if (e.type === 'progress') {
    whisperProgress[e.file] = e;
    const files = Object.values(whisperProgress);
    const pct = Math.round(100 * files.reduce((n, f) => n + f.loaded, 0) / files.reduce((n, f) => n + f.total, 0));
    dictation.label = modelSaved[settings.sttModel]
      ? `waking up voice model · ${pct}%` // already on disk: loading, not downloading
      : `downloading voice model, one time only · ${pct}%`;
    setStatus('idle');
  } else if (e.type === 'ready') {
    dictation.label = `listening · whisper ${e.model} (${e.device})`;
    setStatus('idle');
  } else if (e.type === 'error') {
    dictationFailed(dictation, new Error(e.message));
  }
});

const checkModelSaved = (model) => isModelSaved(model).then((saved) => { modelSaved[model] ||= saved; });

// Dictation on/off and "keep the voice model ready" (always loaded vs released when idle).
function applyDictationSettings() {
  const on = settings.sttEnabled;
  for (const p of Object.values(panes)) p.root.querySelector('[data-act="mic"]').hidden = !on;
  setHotkey('dictate', on ? settings.sttShortcut : { code: '' });
  if (!on && dictation) abandonDictation();
  const keep = on && settings.sttEngine === 'whisper' && settings.sttKeep === 'always';
  setKeepLoaded(keep);
  if (keep) preloadWhisper(settings.sttModel); // quietly, in the background
  else if (!on) scheduleUnload(0); // turned off: free the memory now
  checkModelSaved(settings.sttModel);
}

function dictationFailed(st, err) {
  if (!st || st.dead) return;
  st.dead = true;
  st.d.stop(false);
  if (dictation === st) dictation = null;
  setMicUI(null, false);
  const msg = err.name === 'NotAllowedError' ? 'microphone access was blocked'
    : err.name === 'NotFoundError' || err.name === 'OverconstrainedError' ? 'microphone not found (check settings)'
      : err.message;
  setStatus('error', `dictation: ${msg}`, 'voice');
  hidePill();
}

/* the pill: tiny live indicator while your voice is going in */

const pill = $('#voice-pill');
const pillBars = [...pill.querySelectorAll('.bars i')];
const BAR_SHAPE = [0.45, 0.75, 1, 0.85, 1, 0.7, 0.4];

// In the desktop app the pill is drawn in its own window at the bottom-center of the screen
// (so you see it from any app); in the browser it sits inside this window.
function showPill(pane) {
  const lang = pane.lang.value === 'auto' ? 'auto' : pane.lang.value.split('-')[0];
  if (native) {
    const css = getComputedStyle(document.documentElement);
    const colors = Object.fromEntries(['bg', 'ink', 'accent'].map((v) => [v, css.getPropertyValue(`--${v}`).trim()]));
    sendPill({ state: 'show', lang, colors: { ...colors, rec: css.getPropertyValue('--danger').trim() } });
    return;
  }
  $('#voice-lang').textContent = lang;
  pill.classList.remove('working');
  pill.classList.add('show');
  pill.setAttribute('aria-hidden', 'false');
}
function pillLevel(level) {
  if (native) return sendPill({ level });
  pillBars.forEach((b, i) => b.style.setProperty('--l', (level * BAR_SHAPE[i] * (0.7 + Math.random() * 0.3)).toFixed(2)));
}
function pillWorking() {
  if (native) sendPill({ state: 'working' });
  else pill.classList.add('working');
}
function hidePill() {
  if (native) return sendPill({ state: 'hide' });
  pill.classList.remove('show', 'working');
  pill.setAttribute('aria-hidden', 'true');
  pillLevel(0);
}
pill.addEventListener('click', () => stopDictation());

/* start / stop */

async function startDictation(pane) {
  if (dictation) return;
  stopSpeech(); // talking over the read-aloud (e.g. your turn in a conversation) stops it
  const useOpenAI = settings.sttEngine === 'openai';
  if (useOpenAI && !settings.keys.openai) {
    setStatus('error', 'dictation: add your OpenAI key under ChatGPT in settings', 'key');
    return;
  }
  if (source !== pane.key) {
    cancelAll();
    source = pane.key;
    panes[other(pane.key)].committed = getText(panes[other(pane.key)]);
  }
  quick.active = false; // dictating, like typing, ends a quick translation: results stay out of the bubble
  const st = { pane, text: getText(pane).replace(/\s+$/, ''), partial: '', dead: false };
  // Started from another app (via the system-wide shortcut): also type each finished
  // phrase where your cursor is, as spoken or translated per settings.
  st.external = native && !document.hasFocus();
  st.typing = Promise.resolve();
  st.typedAny = false;
  st.d = new Dictation({
    onPartial: (t) => {
      if (st.dead || dictation !== st) return;
      st.partial = t;
      renderDictation(st);
      schedule();
    },
    onFinal: (t) => {
      if (st.dead) return;
      st.text = joinSpoken(st.text, t, langOf(pane));
      st.partial = '';
      renderDictation(st);
      schedule(0);
      if (st.external && t) typeElsewhere(st, t);
    },
    onError: (err) => dictationFailed(st, err),
    onLevel: (l) => { if (dictation === st) pillLevel(l); },
    onAutoStop: () => { if (dictation === st && !st.holding) stopDictation(); },
  });
  dictation = st;
  setMicUI(pane, true);
  showPill(pane);
  pane.root.querySelector('[data-act="mic"]').classList.add('loading');
  st.label = useOpenAI ? 'listening · openai' : 'waking up voice model…';
  setStatus('idle');
  try {
    await st.d.start({
      deviceId: settings.mic,
      language: pane.lang.value,
      engine: settings.sttEngine,
      model: useOpenAI ? settings.sttOpenaiModel : settings.sttModel,
      key: settings.keys.openai,
      autoStopMs: settings.sttSilence * 1000, // 0 = only stop when tapped again
    });
    pane.root.querySelector('[data-act="mic"]').classList.remove('loading');
    // Released the hold key before the mic was even ready.
    if (dictation !== st && !st.dead) await st.d.stop(false);
  } catch (err) {
    dictationFailed(st, err);
  }
}

async function stopDictation() {
  const st = dictation;
  if (!st) return;
  dictation = null;
  setMicUI(null, false);
  pillWorking(); // finishing the last phrase
  await st.d.stop(true); // what you said since the last pause still gets transcribed
  if (!st.dead) {
    st.partial = '';
    renderDictation(st);
    if (settings.conversation) speakWhenTranslated = panes[other(st.pane.key)]; // answer aloud
    schedule(0);
  }
  if (!dictation) hidePill();
  if (!inflight.size) setStatus('idle');
}

// Phrases are typed in the order they were spoken, each translated first if asked.
function typeElsewhere(st, phrase) {
  const from = langOf(st.pane);
  const to = langOf(panes[other(st.pane.key)]);
  const translated = settings.sttOutput === 'translation' && from !== to;
  st.typing = st.typing.then(async () => {
    const text = translated
      ? (await translate(settings, { text: phrase, from, to, signal: new AbortController().signal, onText() {} })).trim()
      : phrase;
    const lang = translated ? to : from;
    const lead = st.typedAny && !NO_SPACE_LANGS.has(lang) ? ' ' : '';
    st.typedAny = true;
    await typeText(lead + text);
  }).catch((err) => setStatus('error', `typing into other app: ${err.message || err}`));
}

// Typing, clearing or swapping mid-dictation: stop listening and keep what's on screen.
function abandonDictation() {
  const st = dictation;
  if (!st) return;
  st.dead = true;
  dictation = null;
  st.d.stop(false);
  setMicUI(null, false);
  hidePill();
  setStatus('idle');
}

const targetPane = () =>
  dictation?.pane || Object.values(panes).find((p) => p.el === document.activeElement) || panes[source];

/* tap or hold: one behavior for the mic button and the shortcut key
   - tap  → starts; stops when you go quiet (if set) or when you tap again
   - hold → talk while held; stops when you let go */

const HOLD_MS = 350; // pressed longer than this = hold-to-talk
let press = null;

function pressStart(pane) {
  if (press) return;
  if (dictation) { press = { stopOnRelease: true }; return; } // tapping again stops
  press = { t0: performance.now(), startedNow: true };
  startDictation(pane);
  if (dictation) dictation.holding = true; // no auto-stop while the button is down
}

function pressEnd() {
  const p = press;
  press = null;
  if (!p) return;
  if (p.stopOnRelease) return void stopDictation();
  if (dictation) dictation.holding = false;
  if (performance.now() - p.t0 > HOLD_MS) stopDictation(); // it was a hold
}

function pressCancel() {
  const p = press;
  press = null;
  if (p?.startedNow) abandonDictation();
}

for (const pane of Object.values(panes)) {
  const mic = pane.root.querySelector('[data-act="mic"]');
  mic.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressStart(pane);
    addEventListener('pointerup', pressEnd, { once: true });
  });
  // Pointing at the mic usually means a click is coming: start waking the voice model now
  // (~2 s from cold), if the computer has memory to spare. If no dictation follows, it's let
  // go again after a minute.
  mic.addEventListener('pointerenter', async () => {
    if (dictation || whisperAwake() || !settings.sttEnabled || settings.sttEngine !== 'whisper') return;
    try {
      const mem = await memoryInfo();
      if (mem.availableMb != null && mem.availableMb < PREWAKE_FREE_MB) return;
    } catch {}
    if (dictation || whisperAwake()) return; // clicked while we were checking
    preloadWhisper(settings.sttModel);
    scheduleUnload(60e3);
  });
  pane.el.addEventListener('beforeinput', () => { if (dictation?.pane === pane) abandonDictation(); });
  pane.root.querySelector('[data-act="clear"]').addEventListener('click', abandonDictation);
  pane.lang.addEventListener('change', () => { if (dictation?.pane === pane) stopDictation(); });
}
$('#swap').addEventListener('click', abandonDictation, { capture: true });

/* shortcut key */

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight']);
const isLone = (sc) => MODIFIER_CODES.has(sc.code) && !sc.ctrl && !sc.alt && !sc.shift && !sc.meta;

// Macs write shortcuts with symbols in this order, e.g. ⌥⌘T, like the menu bar does.
const MAC_SYMBOLS = { Control: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };

function keyName(code) {
  const side = code.endsWith('Right') ? 'Right ' : code.endsWith('Left') ? 'Left ' : '';
  const base = code.replace(/(Left|Right)$/, '');
  const names = {
    Control: IS_MAC ? 'Control' : 'Ctrl', Alt: IS_MAC ? 'Option' : 'Alt', Shift: 'Shift', Meta: IS_MAC ? 'Cmd' : 'Win', Space: 'Space',
    Backquote: '`', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
  };
  if (IS_MAC && MAC_SYMBOLS[base]) return `${side}${MAC_SYMBOLS[base]} ${names[base]}`; // "Right ⌥ Option"
  if (names[base]) return side + names[base];
  return code.replace(/^Key|^Digit|^Numpad/, '');
}

const modClass = (code) => (MODIFIER_CODES.has(code) ? code.replace(/(Left|Right)$/, '') : null);
// Modifiers only, e.g. Ctrl+Alt+Shift: stored as one modifier code plus flags for the rest.
const isChord = (sc) => MODIFIER_CODES.has(sc.code) && !!(sc.ctrl || sc.alt || sc.shift || sc.meta);
// Which modifier classes a shortcut needs held (a chord's own code counts as one of them).
const needs = (sc) => {
  const own = modClass(sc.code);
  return { ctrl: !!sc.ctrl || own === 'Control', alt: !!sc.alt || own === 'Alt', shift: !!sc.shift || own === 'Shift', meta: !!sc.meta || own === 'Meta' };
};

function shortcutLabel(sc = settings.sttShortcut) {
  const n = isChord(sc) ? needs(sc) : sc;
  if (IS_MAC && !isLone(sc)) {
    const syms = [n.ctrl && '⌃', n.alt && '⌥', n.shift && '⇧', n.meta && '⌘'].filter(Boolean).join('');
    return isChord(sc) ? syms : syms + keyName(sc.code);
  }
  const mods = [n.ctrl && 'Ctrl', n.alt && (IS_MAC ? 'Option' : 'Alt'), n.shift && 'Shift', n.meta && (IS_MAC ? 'Cmd' : 'Win')];
  return [...mods, !isChord(sc) && keyName(sc.code)].filter(Boolean).join(' + ');
}

function comboMatches(e, sc) {
  if (isChord(sc)) {
    // Fires when the last of its modifiers goes down, in any order.
    const n = needs(sc);
    return MODIFIER_CODES.has(e.code) && e.ctrlKey === n.ctrl && e.altKey === n.alt && e.shiftKey === n.shift && e.metaKey === n.meta;
  }
  return e.code === sc.code && e.ctrlKey === !!sc.ctrl && e.altKey === !!sc.alt
    && e.shiftKey === !!sc.shift && e.metaKey === !!sc.meta;
}

let recordingShortcut = false;
// A lone modifier (Right Ctrl) is also used in shortcuts like Ctrl+C, so wait a beat
// before starting; if another key arrives in that window, it wasn't meant for dictation.
const LONE_GRACE_MS = 150;
let loneTimer = null;
let keyDown = false;

// The shortcut logic, fed either by this window's keys (browser) or by the
// system-wide keyboard watcher (desktop app, so it works from any app).
function hotkeyDown() {
  if (recordingShortcut || keyDown || !settings.sttEnabled) return;
  keyDown = true;
  if (!isLone(settings.sttShortcut) || dictation) return void pressStart(targetPane());
  loneTimer = setTimeout(() => { loneTimer = null; pressStart(targetPane()); }, LONE_GRACE_MS);
}

function hotkeyOther() {
  if (!keyDown) return;
  if (loneTimer) { clearTimeout(loneTimer); loneTimer = null; keyDown = false; return; }
  if (isLone(settings.sttShortcut)) pressCancel(); // Ctrl+C etc. after the grace period
}

function hotkeyUp() {
  if (!keyDown) return;
  keyDown = false;
  if (loneTimer) { // released within the grace period: a quick tap
    clearTimeout(loneTimer);
    loneTimer = null;
    pressStart(targetPane());
  }
  pressEnd();
}

// From other apps, shortcuts arrive from the native keyboard watcher. While Vox2 is in front
// the watcher can't see keys, so this window handles them itself (below) and ignores the watcher.
onNative('hotkey', ({ name, type }) => {
  if (name !== 'dictate' || document.hasFocus()) return;
  if (type === 'down') hotkeyDown();
  else if (type === 'up') hotkeyUp();
  else hotkeyOther();
});

document.addEventListener('keydown', (e) => {
  if (recordingShortcut) return;
  // Settings, history and fit window (only while Vox2 is in front). Settings and history
  // toggle: the same keys close them again.
  const local = [
    ['settingsShortcut', () => (sheet.classList.contains('open') ? closeSettings() : openSettings())],
    ['historyShortcut', () => (historySheet.classList.contains('open') ? closeHistory() : openHistory())],
    ['fitShortcut', () => native && fitWindow().catch(() => {})],
  ];
  for (const [key, run] of local) {
    const sc = settings[key];
    if (sc?.code && comboMatches(e, sc) && !e.repeat) {
      e.preventDefault();
      run();
      return;
    }
  }
  if (sheet.classList.contains('open')) return;
  // Snip pressed while Vox2 is in front (the native watcher can't hear it then).
  if (native && settings.snipShortcut?.code && comboMatches(e, settings.snipShortcut) && !e.repeat) {
    e.preventDefault();
    startSnip();
    return;
  }
  // Pin shortcut (only while Vox2 is in front): toggle keep-on-top.
  const pinKey = settings.pinShortcut;
  if (pinKey?.code && comboMatches(e, pinKey) && !e.repeat) {
    e.preventDefault();
    setOnTop(!settings.onTop);
    flashHud(settings.onTop ? 'pinned' : 'unpinned');
    return;
  }
  // Show/hide pressed while Vox2 is in front: tuck it away.
  const summonKey = settings.summonShortcut;
  if (native && summonKey?.code && comboMatches(e, summonKey) && !e.repeat) {
    e.preventDefault();
    hideWindow();
    return;
  }
  const sc = settings.sttShortcut;
  if (!sc.code) return;
  if (isLone(sc)) {
    if (e.code === sc.code) { if (!e.repeat) hotkeyDown(); } else hotkeyOther();
    return;
  }
  if (!comboMatches(e, sc)) return;
  e.preventDefault();
  if (!e.repeat) hotkeyDown();
});
document.addEventListener('keyup', (e) => {
  const sc = settings.sttShortcut;
  if (e.code === sc.code || (isChord(sc) && MODIFIER_CODES.has(e.code))) hotkeyUp();
});

// Leaving the window mid-press means its key-up lands elsewhere; treat it as released.
// Either way the native watcher should start from a clean slate.
addEventListener('blur', () => { if (keyDown) hotkeyUp(); resetKeys(); });
addEventListener('focus', resetKeys);

// Click a shortcut chip, then press the new key (a lone modifier counts on release).
// Esc cancels; Backspace turns the shortcut off.
function recordShortcut(chip) {
  const key = chip.dataset.shortcut;
  recordingShortcut = true;
  chip.classList.add('recording');
  chip.textContent = 'press keys…';
  const held = []; // modifiers currently down, in the order pressed
  const done = (sc) => {
    recordingShortcut = false;
    removeEventListener('keydown', down, true);
    removeEventListener('keyup', up, true);
    chip.classList.remove('recording');
    if (sc) {
      settings[key] = sc;
      saveSettings();
      if (!("local" in chip.dataset)) setHotkey(chip.dataset.name, sc); // local ones only work inside Vox2
      if (key === 'pinShortcut') applyOnTop();
    }
    renderShortcuts();
  };
  const down = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') return done(null);
    if (!held.length && (e.code === 'Backspace' || e.code === 'Delete')) return done({ code: '' });
    if (MODIFIER_CODES.has(e.code)) {
      // Building up a chord: show it live, decide when the keys come up.
      if (!held.includes(e.code)) held.push(e.code);
      chip.textContent = `${held.map((c) => keyName(c).replace(/^(Left|Right) /, '')).join(' + ')} + …`;
      return;
    }
    // A regular key ends it: modifiers held + this key.
    done({ code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
  };
  const up = (e) => {
    e.preventDefault();
    if (!held.includes(e.code)) return;
    // First modifier released: one modifier = that exact key (e.g. Right Ctrl);
    // several = a modifier-only chord (e.g. Ctrl+Alt+Shift).
    if (held.length === 1) return done({ code: held[0] });
    const code = held[held.length - 1];
    const others = new Set(held.slice(0, -1).map(modClass));
    others.delete(modClass(code));
    done({ code, ctrl: others.has('Control'), alt: others.has('Alt'), shift: others.has('Shift'), meta: others.has('Meta') });
  };
  addEventListener('keydown', down, true);
  addEventListener('keyup', up, true);
}

const shortcutChips = [...document.querySelectorAll('[data-shortcut]')];
function renderShortcuts() {
  for (const b of $('#quick-result').children) b.setAttribute('aria-pressed', String(b.dataset.q === settings.quickResult));
  for (const chip of shortcutChips) {
    const sc = settings[chip.dataset.shortcut];
    if (!chip.classList.contains('recording')) chip.textContent = sc?.code ? shortcutLabel(sc) : 'off';
    chip.classList.toggle('off', !sc?.code);
  }
  $('#shortcut-hint').textContent = (native ? 'the first four work from any app; pin, fit, history and settings while Vox2 is in front' : 'these work while this window is focused')
    + ' · click one, then press the new key · backspace turns it off';
  for (const p of Object.values(panes)) {
    p.root.querySelector('[data-act="mic"]').title = settings.sttShortcut.code
      ? `Tap to dictate · hold to talk (${shortcutLabel()})` : 'Tap to dictate · hold to talk';
  }
}
for (const chip of shortcutChips) chip.addEventListener('click', () => recordShortcut(chip));
for (const b of $('#quick-result').children) {
  b.addEventListener('click', () => { settings.quickResult = b.dataset.q; saveSettings(); renderShortcuts(); });
}

// Show/hide shortcut brought the window up: ready to type, replacing what's there.
onNative('summoned', () => {
  const pane = panes[source];
  pane.el.focus();
  getSelection().selectAllChildren(pane.el);
});

/* ---------- quick translations: selected text and screen snips ---------- */

// Text goes into the box set to "detect" (or the top one) and is translated into the other box,
// so it also lands in history. The result shows in a bubble by the cursor, or in the window.
const quick = { active: false, session: 0, dst: null };
const quickPane = () => Object.values(panes).find((p) => p.lang.value === 'auto') || panes.top;
const useBubble = () => native && settings.quickResult === 'bubble';

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(['bg', 'ink', 'muted', 'pending', 'line', 'accent', 'danger']
    .map((v) => [v, css.getPropertyValue(`--${v}`).trim()]));
}

// Start a bubble (anchored at the cursor, or at x/y) and return its session number.
async function startBubble(anchor, status) {
  quick.active = true;
  quick.session++;
  await openBubble(anchor?.x, anchor?.y);
  sendBubble({ session: quick.session, colors: themeColors(), status, source: '', translation: '' });
  return quick.session;
}

function toBubble(dst, text, done, from, to) {
  if (!quick.active || dst !== quick.dst) return;
  sendBubble({ session: quick.session, langs: `${langName(from)} → ${langName(to)}`, translation: text, done });
}

async function quickTranslate(text, anchor, session) {
  text = (text || '').trim();
  abandonDictation();
  const pane = quickPane();
  if (useBubble()) {
    if (!session) session = await startBubble(anchor, 'translating…');
    if (!text) { sendBubble({ session, error: 'nothing was selected (or that app blocks copying)' }); return; }
    quick.dst = panes[other(pane.key)];
    sendBubble({ session, source: text, status: 'translating…' });
  } else {
    if (!text) { setStatus('error', 'nothing was selected (or that app blocks copying)'); return; }
    quick.active = false;
    showWindow();
  }
  cancelAll();
  source = pane.key;
  paint(pane, [{ t: text }]);
  panes[other(pane.key)].committed = '';
  if (!useBubble()) pane.el.focus();
  run();
}

onNative('selection', ({ text }) => quickTranslate(text));

// Which alphabets to expect in a snip: the source box's language, or (when it's on "detect")
// English plus your pinned languages and the last detected one.
function ocrLangs() {
  const lang = quickPane().lang;
  if (lang.value !== 'auto') return [...new Set([tesseractLang(lang.value) || 'eng', 'eng'])];
  const picks = ['eng', ...[lang.detected, ...settings.pinnedLangs].map((c) => c && tesseractLang(c))].filter(Boolean);
  return [...new Set(picks)].slice(0, 3);
}

onNative('snip', async ({ x, y }) => {
  const session = useBubble() ? await startBubble({ x, y }, 'reading the text…') : 0;
  if (!session) setStatus('busy', 'reading the text…');
  try {
    const png = await takeSnip();
    const text = await readText(new Blob([png], { type: 'image/png' }), ocrLangs());
    if (!text) throw new Error('no text found in that area');
    quickTranslate(text, { x, y }, session);
  } catch (err) {
    if (session) sendBubble({ session, error: `snip: ${err.message || err}` });
    else { showWindow(); setStatus('error', `snip: ${err.message || err}`); }
  }
});

// Coming back to the Vox2 window ends a quick translation: put the bubble away (macOS doesn't
// always tell the bubble it lost focus when you switch to another Vox2 window) and keep results here.
addEventListener('focus', () => {
  if (!quick.active) return;
  quick.active = false;
  hideBubble();
});

onNative('bubble-action', ({ action }) => {
  if (action === 'speak' && quick.dst) readAloud(quick.dst);
  if (action === 'stop') stopAudio();
  if (action === 'open') { quick.active = false; showWindow(); }
});

/* voice settings */

const micSelect = $('#mic-device');

async function refreshMics(ask = false) {
  try {
    if (ask) (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    const mics = await listMics();
    micSelect.replaceChildren(new Option('system default', ''),
      ...mics.map((m, i) => new Option(m.label || `microphone ${i + 1}`, m.deviceId)));
    micSelect.value = mics.some((m) => m.deviceId === settings.mic) ? settings.mic : '';
  } catch (err) {
    if (ask) setStatus('error', `dictation: ${err.name === 'NotAllowedError' ? 'microphone access was blocked' : err.message}`, 'voice');
  }
}

/* The voice model holds ~2–2.5 GB while loaded, so how long it's kept depends on the computer:
   smaller machines get it back sooner. And whatever the timer says, it's let go early when the
   computer runs low on memory, so Vox2 never slows down a machine just by being open. */
const AWAKE_MINUTES = [[24 * 1024, 30], [12 * 1024, 10], [0, 2]]; // [total memory ≥ MB, minutes after dictating]
const LOW_MEMORY_MB = 2048;     // free memory under this (or under 15% of the total) counts as low
const PREWAKE_FREE_MB = 4096;   // only pre-wake on mic hover with at least this much free
let awakeMinutes = 5;

async function applyMemoryPolicy() {
  try {
    const { totalMb } = await memoryInfo();
    awakeMinutes = AWAKE_MINUTES.find(([min]) => totalMb >= min)[1];
  } catch {}
  setIdleRelease(awakeMinutes * 60e3);
}

const lowOnMemory = ({ totalMb, availableMb }) =>
  availableMb != null && (availableMb < LOW_MEMORY_MB || availableMb < totalMb * 0.15);

setInterval(async () => {
  if (!whisperAwake() || dictation || settings.sttKeep === 'always') return;
  try { if (lowOnMemory(await memoryInfo())) scheduleUnload(0); } catch {}
}, 60e3);

const KEEP_HINTS = {
  always: () => 'dictation starts instantly · the model stays in memory while Vox2 is open (about 2–2.5 GB)',
  save: () => `instant for ${awakeMinutes} minute${awakeMinutes === 1 ? '' : 's'} after you dictate (set by this computer's memory), `
    + 'then frees it, sooner if memory runs low · waking it again takes about 2 seconds',
};

function renderVoice() {
  $('#stt-enabled').checked = settings.sttEnabled;
  $('#stt-body').hidden = !settings.sttEnabled;
  $('#dictate-shortcut-row').hidden = !settings.sttEnabled;
  for (const b of $('#stt-keep').children) b.setAttribute('aria-pressed', String(b.dataset.keep === settings.sttKeep));
  $('#stt-keep-hint').textContent = KEEP_HINTS[settings.sttKeep]();
  for (const b of $('#stt-silence').children) b.setAttribute('aria-pressed', String(Number(b.dataset.s) === settings.sttSilence));
  $('#stt-output-row').hidden = !native;
  for (const b of $('#stt-output').children) b.setAttribute('aria-pressed', String(b.dataset.out === settings.sttOutput));
  for (const b of $('#stt-engines').children) b.setAttribute('aria-pressed', String(b.dataset.stt === settings.sttEngine));
  $('#stt-whisper').hidden = settings.sttEngine !== 'whisper';
  $('#stt-openai').hidden = settings.sttEngine !== 'openai';
  $('#stt-models').replaceChildren(...Object.entries(STT_MODELS).map(([m, size]) => {
    const b = document.createElement('button');
    b.innerHTML = `${m}<small>${size}</small>`;
    b.setAttribute('aria-pressed', String(m === settings.sttModel));
    b.addEventListener('click', () => { settings.sttModel = m; saveSettings(); renderVoice(); applyDictationSettings(); });
    return b;
  }));
  $('#stt-hint').textContent = 'runs on this computer, free and private · downloads once on first use · '
    + 'bigger = more accurate, slower';
  $('#stt-openai-model').value = settings.sttOpenaiModel;
  refreshMics();
}

for (const b of $('#stt-engines').children) {
  b.addEventListener('click', () => { settings.sttEngine = b.dataset.stt; saveSettings(); renderVoice(); applyDictationSettings(); });
}
$('#stt-enabled').addEventListener('change', (e) => {
  settings.sttEnabled = e.target.checked;
  saveSettings();
  renderVoice();
  renderShortcuts();
  applyDictationSettings();
});
for (const b of $('#stt-keep').children) {
  b.addEventListener('click', () => { settings.sttKeep = b.dataset.keep; saveSettings(); renderVoice(); applyDictationSettings(); });
}
for (const b of $('#stt-output').children) {
  b.addEventListener('click', () => { settings.sttOutput = b.dataset.out; saveSettings(); renderVoice(); });
}
for (const b of $('#stt-silence').children) {
  b.addEventListener('click', () => { settings.sttSilence = Number(b.dataset.s); saveSettings(); renderVoice(); });
}
micSelect.addEventListener('change', () => { settings.mic = micSelect.value; saveSettings(); });
$('#mic-refresh').addEventListener('click', () => refreshMics(true));
$('#stt-openai-model').addEventListener('input', (e) => {
  settings.sttOpenaiModel = e.target.value.trim() || DEFAULTS.sttOpenaiModel;
  saveSettings();
});

/* ---------- extras under the translation ---------- */

let extrasJob = 0;
const hasNonLatin = (s) => /[^\p{Script=Latin}\p{P}\p{N}\p{S}\s]/u.test(s);

function hideExtras() {
  extrasJob++;
  matchTip.hidden = true;
  for (const p of Object.values(panes)) $('.extras', p.root).hidden = true;
}

async function updateExtras(dst, translation, lang, backTo, original) {
  hideExtras();
  const id = extrasJob;
  const wantRoman = settings.showRoman && hasNonLatin(translation);
  if (!wantRoman && !settings.showBack) return;
  try {
    const { back, roman } = await checkBack(translation, lang, backTo);
    if (id !== extrasJob) return; // a newer translation replaced this one
    const box = $('.extras', dst.root);
    if (quick.active && quick.dst === dst) sendBubble({ session: quick.session, roman: wantRoman ? roman : '' });
    box.querySelector('.roman').textContent = wantRoman ? roman : '';
    const backLine = box.querySelector('.back');
    backLine.textContent = settings.showBack ? back : '';
    box.hidden = !box.textContent.trim();
    if (settings.showBack && settings.showMatch && back) showMatch(backLine, original, back, id);
  } catch {}
}

// A small themed card on hover: what the score means, the tiers, and a note if a number changed.
// The full method is in the README (Back-Translation Fidelity Scoring).
const TIERS = [['high', '85+', 'meaning kept'], ['mid', '65–84', 'check the details'], ['low', '<65', 'likely off']];
const matchTip = document.createElement('div');
matchTip.className = 'match-tip';
matchTip.hidden = true;
document.body.append(matchTip);

function showMatchTip(badge) {
  const { score, numbers } = badge.dataset;
  const t = tier(Number(score));
  matchTip.innerHTML = `<b class="${t}">${score}% match</b>`
    + '<p>how much of your meaning survived the round trip, compared by meaning, not exact words</p>'
    + TIERS.map(([k, range, label]) => `<div class="tier ${k}${k === t ? ' on' : ''}"><i></i><span>${range}</span>${label}</div>`).join('')
    + (numbers ? '<p class="warn">a number changed, so it\'s capped at 60%</p>' : '');
  matchTip.hidden = false;
  const z = parseFloat(document.documentElement.style.zoom) || 1;
  const r = badge.getBoundingClientRect();
  const [w, h] = [matchTip.offsetWidth, matchTip.offsetHeight];
  matchTip.style.left = `${Math.max(8, Math.min(r.left / z, innerWidth / z - w - 8))}px`;
  matchTip.style.top = `${r.top / z - h - 6 > 8 ? r.top / z - h - 6 : r.bottom / z + 6}px`; // above, else below
}

async function showMatch(backLine, original, back, id) {
  const badge = document.createElement('span');
  badge.className = 'match checking';
  badge.textContent = 'checking…';
  badge.title = 'checking meaning (first time downloads a ~120 MB model)';
  backLine.append(' ', badge);
  try {
    const { score, numbersDiffer } = await matchScore(original, back);
    if (id !== extrasJob) return;
    badge.className = `match ${tier(score)}`;
    badge.textContent = `${score}% match`;
    badge.removeAttribute('title');
    badge.dataset.score = score;
    if (numbersDiffer) badge.dataset.numbers = '1';
    badge.addEventListener('mouseenter', () => showMatchTip(badge));
    badge.addEventListener('mouseleave', () => { matchTip.hidden = true; });
  } catch {
    badge.remove(); // no model (e.g. offline the first time): just leave the score out
  }
}

$('#show-roman').addEventListener('change', (e) => { settings.showRoman = e.target.checked; saveSettings(); });
$('#show-back').addEventListener('change', (e) => { settings.showBack = e.target.checked; saveSettings(); renderTone(); });
$('#show-match').addEventListener('change', (e) => { settings.showMatch = e.target.checked; saveSettings(); });

/* ---------- tone (AI engines) ---------- */

function renderTone() {
  $('#tone-row').hidden = !ENGINES[settings.engine].keyUrl; // Google can't do tone
  for (const b of $('#tones').children) b.setAttribute('aria-pressed', String(b.dataset.tone === settings.tone));
  $('#tone-note').value = settings.toneNote;
  $('#show-roman').checked = settings.showRoman;
  $('#show-back').checked = settings.showBack;
  $('#show-match').checked = settings.showMatch;
  $('#match-row').hidden = !settings.showBack;
}
for (const b of $('#tones').children) {
  b.addEventListener('click', () => { settings.tone = b.dataset.tone; saveSettings(); renderTone(); cache.clear(); });
}
$('#tone-note').addEventListener('input', (e) => { settings.toneNote = e.target.value.trim(); saveSettings(); cache.clear(); });

/* ---------- window options ---------- */

// Pinned on top and you're working elsewhere: fade so it doesn't block what's behind it.
const FADED = 165;
let windowFocused = document.hasFocus();
function applyFade() {
  const faded = settings.onTop && settings.fade && !windowFocused && !document.documentElement.matches(':hover');
  setWindowAlpha(faded ? FADED : 255);
}
addEventListener('focus', () => { windowFocused = true; applyFade(); });
addEventListener('blur', () => { windowFocused = false; applyFade(); });
document.documentElement.addEventListener('mouseenter', applyFade);
document.documentElement.addEventListener('mouseleave', applyFade);

function renderWindowOpts() {
  $('#fade-toggle').checked = settings.fade;
  $('#native-window-opts').hidden = !native;
  $('#tray-toggle').checked = settings.closeToTray;
  $('#autostart-toggle').checked = settings.autostart;
  $('#autostart-toggle').closest('label').firstElementChild.textContent = MAC ? 'start at login' : 'start with Windows';
}
$('#fade-toggle').addEventListener('change', (e) => { settings.fade = e.target.checked; saveSettings(); applyFade(); });
$('#tray-toggle').addEventListener('change', (e) => { settings.closeToTray = e.target.checked; saveSettings(); setCloseToTray(settings.closeToTray); });
$('#autostart-toggle').addEventListener('change', (e) => { settings.autostart = e.target.checked; saveSettings(); setAutostart(settings.autostart); });

/* ---------- bottom bar tooltips ---------- */

// The bar's buttons get a small themed tooltip instead of the system one: their name, plus the
// keyboard shortcut (as you've set it) for the ones that have one, as a reminder.
const BAR_SHORTCUTS = {
  'snip-btn': 'snipShortcut', pin: 'pinShortcut', 'fit-btn': 'fitShortcut', 'history-btn': 'historyShortcut', gear: 'settingsShortcut',
};
const barTip = document.createElement('div');
barTip.className = 'bar-tip';
barTip.hidden = true;
document.body.append(barTip);
let barTipTimer = null;
let barTipWarmUntil = 0; // sliding from one button to the next shows the next tip at once

function showBarTip(btn) {
  // Take over the button's title (other code keeps it current) so the system tooltip stays away.
  if (btn.hasAttribute('title')) {
    btn.dataset.tip = btn.title;
    btn.setAttribute('aria-label', btn.title);
    btn.removeAttribute('title');
  }
  const sc = settings[BAR_SHORTCUTS[btn.id]];
  barTip.replaceChildren(btn.dataset.tip || '');
  if (sc?.code) barTip.append(Object.assign(document.createElement('kbd'), { textContent: shortcutLabel(sc) }));
  barTip.hidden = false;
  // Above the button, centered on it, kept inside the window (root zoom: convert to CSS px).
  const z = parseFloat(document.documentElement.style.zoom) || 1;
  const r = btn.getBoundingClientRect();
  const w = barTip.offsetWidth;
  const left = Math.max(8, Math.min((r.left + r.width / 2) / z - w / 2, innerWidth / z - w - 8));
  barTip.style.left = `${left}px`;
  barTip.style.top = `${r.top / z - barTip.offsetHeight - 8}px`;
}

function hideBarTip() {
  clearTimeout(barTipTimer);
  if (!barTip.hidden) barTipWarmUntil = Date.now() + 400;
  barTip.hidden = true;
}

for (const btn of document.querySelectorAll('.bar-actions button')) {
  btn.addEventListener('pointerenter', () => {
    clearTimeout(barTipTimer);
    barTipTimer = setTimeout(() => showBarTip(btn), Date.now() < barTipWarmUntil ? 0 : 350);
  });
  btn.addEventListener('pointerleave', hideBarTip);
  btn.addEventListener('pointerdown', hideBarTip);
}
addEventListener('blur', hideBarTip);

/* ---------- fit window to text ---------- */

// One click resizes the window's height around what's in it: your text, the translation, the
// back-translation and the score, with no empty space. Each box gets exactly the height its
// content needs (they keep that split until you fit again or clear both). If it doesn't fit
// on screen, the window takes the full usable height and the boxes scroll.

// A box's height with its content laid out naturally (no stretching, no scrolling). Done in
// one go before the browser paints, so nothing flickers.
function naturalHeight(pane) {
  const parts = [pane.root, pane.el, $('.extras', pane.root)];
  const saved = parts.map((el) => el.style.cssText);
  pane.root.style.flex = 'none';
  pane.el.style.flex = 'none';
  pane.el.style.overflow = 'visible';
  parts[2].style.maxHeight = 'none';
  const h = pane.root.getBoundingClientRect().height;
  parts.forEach((el, i) => { el.style.cssText = saved[i]; });
  return h;
}

function unfit() {
  if (!document.body.classList.contains('fitted') && !panes.top.root.style.flex) return;
  for (const p of Object.values(panes)) p.root.style.flex = '';
  document.body.classList.remove('fitted');
}

async function fitWindow() {
  const app = $('.app').getBoundingClientRect().height;
  const [top, bottom] = [panes.top, panes.bottom].map((p) => p.root.getBoundingClientRect().height);
  const [needTop, needBottom] = [panes.top, panes.bottom].map(naturalHeight);
  const chrome = app - top - bottom; // divider and bottom bar
  const need = Math.ceil(needTop + needBottom + chrome) + 2; // +2 so rounding never adds a scrollbar
  const result = await resizeWindowHeight(need / app);
  if (!result) return;
  // Split the space in proportion to what each box needs: exact when it all fits.
  panes.top.root.style.flex = `${needTop} 1 0px`;
  panes.bottom.root.style.flex = `${needBottom} 1 0px`;
  document.body.classList.toggle('fitted', !result.capped); // extras may grow past their usual cap
}

$('#fit-btn').hidden = !native;
$('#fit-btn').addEventListener('click', () => fitWindow().catch((err) => setStatus('error', `fit window: ${err.message || err}`)));

/* ---------- conversation mode ---------- */

// Two people, one Vox2: each taps the mic on their side and talks; when they stop, the
// translation is read aloud for the other person. Talking again cuts the read-aloud short.
let speakWhenTranslated = null; // the box whose next finished translation should be spoken

function applyConversation() {
  const on = settings.conversation;
  document.body.classList.toggle('conversation', on);
  const btn = $('#conv-btn');
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? 'Conversation mode: on (each side speaks, Vox2 answers aloud)' : 'Conversation mode: off';
  if (!on) speakWhenTranslated = null;
}
$('#conv-btn').addEventListener('click', () => {
  settings.conversation = !settings.conversation;
  saveSettings();
  applyConversation();
  flashHud(settings.conversation ? 'conversation on' : 'conversation off');
  if (settings.conversation && !settings.sttEnabled) {
    settings.sttEnabled = true; // conversation needs the mic
    saveSettings();
    applyDictationSettings();
  }
});

$('#snip-btn').addEventListener('click', () => startSnip());

/* ---------- updates ---------- */

// New versions are published as GitHub releases; Tauri checks them and verifies the signature.
// auto: download quietly, install the next time you're not using Vox2 (it restarts itself)
// ask:  show an "update" pill in the footer; click to install
// off:  never check unless you press "check now"
const updater = window.__TAURI__?.updater;
// The update we found. `downloaded` belongs to this exact object: a later check must not
// swap in a fresh, undownloaded copy while we think it's ready (that broke installs in 0.4.0).
let found = null; // { update, downloaded }
let appVersion = '';

function setUpdateStatus(text) { $('#update-status').textContent = text; }

async function checkForUpdates(manual = false) {
  if (!updater || (!manual && settings.updates === 'off')) return;
  if (manual) setUpdateStatus('checking…');
  try {
    const update = await updater.check();
    if (!update) { setUpdateStatus(`you have the latest version (v${appVersion})`); return; }
    if (!found || found.update.version !== update.version) found = { update, downloaded: false };
    setUpdateStatus(`v${update.version} is available`);
    if (settings.updates === 'auto') {
      if (manual) return installUpdate(); // you asked: install right now
      await downloadUpdate();
      installWhenIdle();
    } else {
      $('#update-pill').hidden = false;
      $('#update-pill').title = `Vox2 v${update.version} is ready · click to install and restart`;
    }
  } catch (err) {
    // Offline, GitHub hiccup, etc. Only worth mentioning if you asked. A release with no build
    // for this computer yet (the Mac one is added a few minutes after the Windows one) isn't
    // an error, there's just nothing to install.
    const msg = err?.message || String(err);
    if (/fallback platforms|platforms` object/.test(msg)) setUpdateStatus(manual ? `you have the latest version for this computer (v${appVersion})` : '');
    else setUpdateStatus(manual ? `couldn't check right now (${msg})` : '');
  }
}

async function downloadUpdate() {
  if (!found || found.downloaded) return;
  let got = 0;
  let total = 0;
  await found.update.download((e) => {
    if (e.event === 'Started') total = e.data.contentLength || 0;
    if (e.event === 'Progress') {
      got += e.data.chunkLength;
      if (total) setUpdateStatus(`downloading v${found.update.version} · ${Math.round((got / total) * 100)}%`);
    }
  });
  found.downloaded = true;
  setUpdateStatus(`v${found.update.version} downloaded`);
}

async function installUpdate() {
  if (!found) return;
  $('#update-pill').textContent = 'updating…';
  try {
    await downloadUpdate();
    setUpdateStatus(`installing v${found.update.version}… Vox2 will restart`);
    await found.update.install(); // on Windows the installer takes over and Vox2 closes here
    await window.__TAURI__.process.relaunch();
  } catch (err) {
    $('#update-pill').textContent = 'update';
    const msg = err?.message || String(err);
    setUpdateStatus(`update failed: ${msg}`);
    setStatus('error', `update failed: ${msg}`);
    found.downloaded = false; // start clean next time
  }
}

// Auto mode never interrupts: install only when Vox2 isn't in front and you're not dictating.
function installWhenIdle() {
  if (!found?.downloaded || settings.updates !== 'auto') return;
  if (!document.hasFocus() && !dictation && !speakingPane) installUpdate();
}
addEventListener('blur', () => setTimeout(installWhenIdle, 2000));

$('#update-pill').addEventListener('click', installUpdate);
$('#about-github').addEventListener('click', (e) => { e.preventDefault(); openUrl('https://github.com/chrisqtruong/vox2'); });
if (!native) $('#about-version').textContent = 'web preview';
$('#update-check').addEventListener('click', () => checkForUpdates(true));
for (const b of $('#update-modes').children) {
  b.addEventListener('click', () => {
    settings.updates = b.dataset.u;
    saveSettings();
    renderUpdates();
    if (settings.updates !== 'off') checkForUpdates();
  });
}

function renderUpdates() {
  for (const b of $('#update-modes').children) b.setAttribute('aria-pressed', String(b.dataset.u === settings.updates));
  if (!$('#update-status').textContent && appVersion) $('#update-status').textContent = `version ${appVersion}`;
}

if (native) {
  window.__TAURI__.app.getVersion().then((v) => { appVersion = v; $('#about-version').textContent = `v${v}`; renderUpdates(); });
  setTimeout(() => checkForUpdates(), 20e3); // a little after startup
  setInterval(() => checkForUpdates(), 6 * 3600e3);
}

/* ---------- read aloud ---------- */

const voiceFor = (lang) => settings.ttsVoices[lang] || defaultVoice(lang, settings.ttsGender);
let speakingPane = null;

function setSpeakUI(pane, on) {
  for (const p of Object.values(panes)) {
    const btn = p.root.querySelector('[data-act="speak"]');
    const active = on && p === pane;
    btn.setAttribute('aria-pressed', String(active));
    btn.title = active ? 'Stop (Esc)' : 'Read aloud';
    $('use', btn).setAttribute('href', active ? '#i-stop' : '#i-speak');
  }
  if (quick.active) sendBubble({ session: quick.session, speaking: on && pane === quick.dst });
}

// Esc stops whatever Vox2 is doing out loud: reading aloud, or dictating (what was said so far
// is kept). Returns whether there was anything to stop.
function stopAudio() {
  const busy = !!speakingPane || !!dictation;
  if (speakingPane) stopSpeech();
  if (dictation) stopDictation();
  return busy;
}
// Esc pressed in another app, heard by the system-wide keyboard watcher.
onNative('escape', () => { if (!document.hasFocus()) stopAudio(); });

// While reading aloud, the word being spoken lights up. It's a CSS highlight (styles.css,
// ::highlight(vox-word)), drawn over the text without touching it, so the box stays editable.
const wordMark = typeof Highlight === 'function' ? new Highlight() : null;
if (wordMark) CSS.highlights.set('vox-word', wordMark);
let reading = null; // { pane, full, lead, words: [[ms, from, to], …], i, range }

// A Range over characters [from, to) of a box's text (line breaks count as one character).
function textRange(el, from, to) {
  const range = document.createRange();
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let pos = 0;
  let started = false;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const len = n.nodeType === Node.TEXT_NODE ? n.length : n.nodeName === 'BR' ? 1 : 0;
    if (!len || n.nodeType !== Node.TEXT_NODE) { pos += len; continue; }
    if (!started && from < pos + len) { range.setStart(n, from - pos); started = true; }
    if (started && to <= pos + len) { range.setEnd(n, to - pos); return range; }
    pos += len;
  }
  return null;
}

function followReading(ms, fromMedia, rate = 1) {
  const r = reading;
  if (!r) return;
  if (fromMedia && quick.active && quick.dst === r.pane) sendBubble({ session: quick.session, sayMs: ms, sayAt: Date.now(), sayRate: rate });
  if (!wordMark) return;
  if (getText(r.pane) !== r.full) { wordMark.clear(); r.i = -1; return; } // edited mid-read: let go
  let i = r.i;
  while (i + 1 < r.words.length && r.words[i + 1][0] <= ms) i++;
  while (i >= 0 && r.words[i][0] > ms) i--;
  // Repaints swap the text nodes out from under the range, which collapses it: rebuild then too.
  if (i === r.i && !(r.range?.collapsed)) return;
  r.i = i;
  wordMark.clear();
  if (i < 0) return;
  r.range = textRange(r.pane.el, r.lead + r.words[i][1], r.lead + r.words[i][2]);
  if (r.range) wordMark.add(r.range);
}

function endReading(pane) {
  if (reading?.pane !== pane) return;
  if (quick.active && quick.dst === pane) sendBubble({ session: quick.session, words: null });
  reading = null;
  wordMark?.clear();
}

async function readAloud(pane) {
  if (speakingPane === pane) { stopSpeech(); return; }
  const full = getText(pane);
  const text = full.trim();
  if (!text) return;
  const lead = full.indexOf(text);
  const lang = langOf(pane);
  // No natural voice for this language → fall back to the computer's own voices.
  const engine = settings.ttsEngine === 'neural' && !voicesFor(lang).length ? 'system' : settings.ttsEngine;
  if (engine === 'openai' && !settings.keys.openai) {
    setStatus('error', 'read aloud: add your OpenAI key under ChatGPT in settings', 'key');
    return;
  }
  speakingPane = pane;
  setSpeakUI(pane, true);
  try {
    await speak({
      text, lang, engine,
      voice: voiceFor(lang),
      openaiVoice: settings.ttsOpenaiVoice,
      key: settings.keys.openai,
      onStart: () => { reading = { pane, full, lead, words: [], i: -1, range: null }; },
      onWords: (words) => {
        if (reading?.pane !== pane) return;
        reading.words = words;
        if (quick.active && quick.dst === pane) {
          sendBubble({ session: quick.session, words: words.map(([ms, a, b]) => [ms, a + lead, b + lead]) });
        }
      },
      onTime: followReading,
      onEnd: () => {
        endReading(pane);
        if (speakingPane === pane) { speakingPane = null; setSpeakUI(null, false); }
      },
    });
  } catch (err) {
    endReading(pane);
    speakingPane = null;
    setSpeakUI(null, false);
    setStatus('error', `read aloud: ${err.message || err}`, 'read');
  }
}

for (const pane of Object.values(panes)) {
  pane.root.querySelector('[data-act="speak"]').addEventListener('click', () => readAloud(pane));
}

/* speed and volume: the speed popover from each box and the settings rows share one state; volume lives in settings */

const SPEEDS = { 0.75: 'slow', 1: 'normal', 1.25: 'fast' };
const playback = $('#playback');

function applyPlayback() {
  setSpeed(settings.ttsSpeed);
  setVolume(settings.ttsVolume / 100);
  for (const b of document.querySelectorAll('[data-speed]')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === settings.ttsSpeed));
  }
  for (const input of document.querySelectorAll('.volume input')) {
    input.value = settings.ttsVolume;
    input.style.setProperty('--fill', `${settings.ttsVolume}%`);
  }
  for (const el of document.querySelectorAll('.vol-value')) el.textContent = `${settings.ttsVolume}%`;
  // The button shows the speed: a turtle, "1×" or a hare.
  const icon = { 0.75: '#i-turtle', 1.25: '#i-hare' }[settings.ttsSpeed];
  for (const btn of document.querySelectorAll('[data-act="playback"]')) {
    btn.innerHTML = icon ? `<svg><use href="${icon}"/></svg>` : '1×';
    btn.title = `Reading speed: ${SPEEDS[settings.ttsSpeed]} (${settings.ttsSpeed}×)`;
  }
}

for (const b of document.querySelectorAll('[data-speed]')) {
  b.addEventListener('click', () => { settings.ttsSpeed = Number(b.dataset.speed); saveSettings(); applyPlayback(); });
}
for (const input of document.querySelectorAll('.volume input')) {
  input.addEventListener('input', () => { settings.ttsVolume = Number(input.value); applyPlayback(); });
  input.addEventListener('change', saveSettings);
}

function closePlayback() {
  if (playback.hidden) return;
  playback.hidden = true;
  for (const btn of document.querySelectorAll('[data-act="playback"]')) btn.setAttribute('aria-expanded', 'false');
}

for (const pane of Object.values(panes)) {
  const btn = pane.root.querySelector('[data-act="playback"]');
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    closePlayback();
    if (open) return;
    playback.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    // Hang it under the button, right edges lined up, kept inside the window. Root zoom
    // scales fixed positions, so convert screen coordinates back to CSS pixels (as langpicker does).
    const z = parseFloat(document.documentElement.style.zoom) || 1;
    const r = btn.getBoundingClientRect();
    const [w, h] = [playback.offsetWidth, playback.offsetHeight];
    playback.style.left = `${Math.max(8, Math.min(r.right / z - w, innerWidth / z - w - 8))}px`;
    playback.style.top = `${Math.max(8, Math.min(r.bottom / z + 4, innerHeight / z - h - 8))}px`;
  });
}
document.addEventListener('pointerdown', (e) => {
  if (!playback.hidden && !playback.contains(e.target) && !e.target.closest('[data-act="playback"]')) closePlayback();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePlayback(); });
addEventListener('blur', closePlayback);

function renderTTS() {
  for (const b of $('#tts-engines').children) b.setAttribute('aria-pressed', String(b.dataset.tts === settings.ttsEngine));
  for (const b of $('#tts-gender').children) b.setAttribute('aria-pressed', String(b.dataset.g === settings.ttsGender));
  $('#tts-neural').hidden = settings.ttsEngine !== 'neural';
  $('#tts-openai').hidden = settings.ttsEngine !== 'openai';

  // One voice picker per language currently on screen.
  const langs = [...new Set(Object.values(panes).map(langOf))];
  $('#tts-voice-pickers').replaceChildren(...langs.map((lang) => {
    const label = document.createElement('label');
    label.textContent = langName(lang).toLowerCase();
    const voices = voicesFor(lang);
    if (!voices.length) {
      label.append(Object.assign(document.createElement('span'), { className: 'hint', textContent: 'no natural voice yet · uses system voice' }));
      return label;
    }
    const select = document.createElement('select');
    select.append(...voices.map((v) => new Option(voiceLabel(v), v.name)));
    select.value = voiceFor(lang);
    select.addEventListener('change', () => { settings.ttsVoices[lang] = select.value; saveSettings(); });
    label.append(select);
    return label;
  }));

  const ov = $('#tts-openai-voice');
  if (!ov.options.length) ov.append(...OPENAI_VOICES.map(([v, d]) => new Option(`${v} · ${d}`, v)));
  ov.value = settings.ttsOpenaiVoice;

  $('#tts-hint').textContent = {
    neural: native ? 'Microsoft’s natural voices, free · needs internet' : 'natural voices need the desktop app · using system voices here',
    openai: 'very natural · billed to your OpenAI key',
    system: 'voices installed on this computer · works offline, sounds more robotic',
  }[settings.ttsEngine];
}

for (const b of $('#tts-engines').children) {
  b.addEventListener('click', () => { settings.ttsEngine = b.dataset.tts; saveSettings(); renderTTS(); });
}
for (const b of $('#tts-gender').children) {
  b.addEventListener('click', () => {
    settings.ttsGender = b.dataset.g;
    // Re-pick defaults of that gender for the languages on screen.
    for (const p of Object.values(panes)) delete settings.ttsVoices[langOf(p)];
    saveSettings();
    renderTTS();
  });
}
$('#tts-openai-voice').addEventListener('change', (e) => { settings.ttsOpenaiVoice = e.target.value; saveSettings(); });

/* ---------- history ---------- */

const HISTORY_MAX = 30; // recents; starred entries are extra and never roll off
const HISTORY_SETTLE_MS = 1500; // a translation counts as "done" once you've paused this long
let history = [];
let historyTimer = null;
const historySheet = $('#history');
const historyList = $('#history-list');

function noteFinished(entry) {
  clearTimeout(historyTimer);
  if (!entry.src || !entry.dst) return;
  historyTimer = setTimeout(() => addHistory({ ...entry, time: Date.now() }), HISTORY_SETTLE_MS);
}

function addHistory(entry) {
  const last = history[0];
  const sameLangs = last && last.from === entry.from && last.to === entry.to;
  // Deleting back through something already saved isn't new work.
  if (sameLangs && last.src.startsWith(entry.src)) return;
  // Picking up where you left off a moment ago grows that entry instead of adding a near-duplicate.
  if (sameLangs && !last.starred && entry.src.startsWith(last.src) && entry.time - last.time < 5 * 60e3) history.shift();
  if (history.some((h) => h.starred && h.src === entry.src)) return; // already saved for keeps
  // Starred entries are kept forever; only the recents roll over.
  const recents = [entry, ...history.filter((h) => !h.starred && h.src !== entry.src)].slice(0, HISTORY_MAX);
  history = [...recents, ...history.filter((h) => h.starred)].sort((a, b) => b.time - a.time);
  save('history', history);
}

function toggleStar(h) {
  h.starred = !h.starred;
  save('history', history);
  renderHistory();
}

function ago(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

function renderHistory() {
  const ordered = [...history.filter((h) => h.starred), ...history.filter((h) => !h.starred)];
  historyList.replaceChildren(...ordered.map((h) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'entry';
    btn.title = 'Open this translation';
    for (const [cls, text] of [['src', h.src], ['dst', h.dst], ['meta', `${langName(h.from)} → ${langName(h.to)} · ${ago(h.time)}`]]) {
      btn.append(Object.assign(document.createElement('span'), { className: cls, textContent: text }));
    }
    btn.addEventListener('click', () => restoreHistory(h));
    const star = document.createElement('button');
    star.className = 'star';
    star.title = h.starred ? 'Unstar' : 'Star (keep forever)';
    star.setAttribute('aria-pressed', String(!!h.starred));
    star.innerHTML = '<svg><use href="#i-star"/></svg>';
    star.addEventListener('click', () => toggleStar(h));
    li.append(btn, star);
    return li;
  }));
  $('#history-empty').hidden = history.length > 0;
  $('#history-clear').hidden = !history.some((h) => !h.starred);
  $('#history-clear').title = 'Clear recents (starred stay)';
}

function restoreHistory(h) {
  cancelAll();
  const { top, bottom } = panes;
  top.lang.value = h.from;
  bottom.lang.value = h.to;
  settings.top = h.from;
  settings.bottom = h.to;
  saveSettings();
  paint(top, [{ t: h.src }]);
  paint(bottom, [{ t: h.dst }]);
  bottom.committed = h.dst;
  source = 'top';
  setStatus('idle');
  closeHistory();
}

function openHistory() {
  if (sheet.classList.contains('open')) closeSettings();
  if (permSheet.classList.contains('open')) closePerms();
  renderHistory();
  historySheet.classList.add('open');
  historySheet.setAttribute('aria-hidden', 'false');
  $('#history-done').focus();
}

function closeHistory() {
  historySheet.classList.remove('open');
  historySheet.setAttribute('aria-hidden', 'true');
  panes[source].el.focus();
}

$('#history-btn').addEventListener('click', () =>
  historySheet.classList.contains('open') ? closeHistory() : openHistory());
$('#history-done').addEventListener('click', closeHistory);
$('#history-clear').addEventListener('click', () => {
  history = history.filter((h) => h.starred);
  save('history', history);
  renderHistory();
});

/* ---------- permissions (macOS) ---------- */

/* macOS asks for each permission separately, and Accessibility and Screen Recording can only be
   switched on in System Settings. This sheet lists everything Vox2 needs with a button for each,
   and keeps checking while it's open, so it ticks off as you go. Windows has nothing to set up:
   getPermissions() returns null there and none of this shows. */
const permSheet = $('#perms');
const PERMS = [
  { id: 'input', name: 'input monitoring', why: 'hears your shortcuts while you’re in other apps' },
  { id: 'accessibility', name: 'accessibility', why: 'typing what you dictate, translating selected text' },
  { id: 'screen', name: 'screen recording', why: 'snip & translate: reads the part of the screen you box' },
  { id: 'microphone', name: 'microphone', why: 'dictation' },
];
const RESTART_PERMS = ['screen', 'input']; // macOS only notices these after a restart
let permsAtLaunch = null; // what was allowed when Vox2 started
let perms = null;
let permTimer = 0;
const asked = new Set(); // asked once this session: the next click opens System Settings instead

const permGranted = (p, id) => (id === 'microphone' ? p[id] === 'granted' : !!p[id]);
const permsNeeded = () => PERMS.filter((x) => x.id !== 'microphone' || settings.sttEnabled);
const permsMissing = (p) => permsNeeded().filter((x) => !permGranted(p, x.id));

async function askPermission(id) {
  if (id === 'microphone' && perms.microphone === 'ask') {
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); } catch {}
  } else if (id !== 'microphone' && !asked.has(id)) {
    requestPermission(id); // macOS's own prompt, and Vox2 shows up in the list in System Settings
  } else {
    openPrivacy(id);
  }
  asked.add(id);
  checkPerms(true); // the button changes to "open settings" even if nothing else did
}

function renderPerms() {
  $('#perm-list').replaceChildren(...permsNeeded().map((x) => {
    const li = document.createElement('li');
    li.innerHTML = '<div><b></b><small></small></div>';
    $('b', li).textContent = x.name;
    $('small', li).textContent = x.why;
    if (permGranted(perms, x.id)) {
      li.insertAdjacentHTML('beforeend', '<span class="ok"><svg viewBox="0 0 24 24"><use href="#i-check"/></svg>allowed</span>');
    } else {
      const btn = document.createElement('button');
      const first = x.id === 'microphone' ? perms.microphone === 'ask' : !asked.has(x.id);
      btn.className = first ? 'chip go' : 'chip';
      btn.textContent = first ? 'allow' : 'open settings';
      btn.addEventListener('click', () => askPermission(x.id));
      li.append(btn);
      // macOS only re-checks these when Vox2 starts, so the row can't tick itself off.
      if (RESTART_PERMS.includes(x.id) && asked.has(x.id)) {
        $('small', li).textContent = 'switched it on in System Settings? restart Vox2 to finish';
      }
    }
    return li;
  }));
  $('#perm-restart').hidden = !(['accessibility', ...RESTART_PERMS].some((id) => perms[id] && !permsAtLaunch[id])
    || RESTART_PERMS.some((id) => asked.has(id) && !perms[id]));
  $('#perm-startup').checked = settings.permCheck;
}

// Redraws only when something changed, so a click never lands on a button that's being replaced.
async function checkPerms(force = false) {
  const p = await getPermissions();
  if (!p) return;
  const changed = JSON.stringify(p) !== JSON.stringify(perms);
  perms = p;
  if ((changed || force) && permSheet.classList.contains('open')) renderPerms();
}

function openPerms() {
  if (!perms) return;
  if (sheet.classList.contains('open')) closeSettings();
  if (historySheet.classList.contains('open')) closeHistory();
  renderPerms();
  permSheet.classList.add('open');
  permSheet.setAttribute('aria-hidden', 'false');
  $('#perms-done').focus();
  clearInterval(permTimer);
  permTimer = setInterval(checkPerms, 1000);
}

function closePerms() {
  clearInterval(permTimer);
  permSheet.classList.remove('open');
  permSheet.setAttribute('aria-hidden', 'true');
  panes[source].el.focus();
}

// The permissions section at the top of settings (with its own jump link), macOS only.
function renderPermEntry() {
  $('#perm-entry').hidden = !perms;
  $('#nav-perms').hidden = !perms;
  if (!perms) return;
  const missing = permsMissing(perms).length;
  $('#perm-summary').textContent = missing ? `${missing} still needed` : 'all allowed';
}

$('#perms-done').addEventListener('click', closePerms);
$('#perm-open').addEventListener('click', () => openPerms());
$('#perm-restart-btn').addEventListener('click', () => relaunch());
$('#perm-startup').addEventListener('change', (e) => { settings.permCheck = e.target.checked; saveSettings(); });
// Coming back from System Settings: check right away instead of waiting for the next tick.
addEventListener('focus', () => { if (permSheet.classList.contains('open')) checkPerms(); });

/* ---------- start ---------- */

await loadSettings();
if (keysInVault) $('#key-store').textContent = `locked in ${MAC ? "your Mac's Keychain" : 'Windows Credential Manager'}, only on this computer`;
history = await load('history', []);
for (const pane of Object.values(panes)) {
  attachLangPicker(pane.lang, {
    getPinned: () => settings.pinnedLangs,
    setPinned: (codes) => { settings.pinnedLangs = codes; saveSettings(); },
  });
  pane.lang.value = settings[pane.key];
}
applyTheme(settings.theme);
applyColorblind();
applyFont();
applyZoom();
applyOnTop();
await applyMemoryPolicy(); // how long the voice model stays loaded, from this computer's memory
applyDictationSettings(); // dictate shortcut, mic buttons, keep-ready preload
setHotkey('summon', settings.summonShortcut);
setHotkey('select', settings.selectShortcut);
setHotkey('snip', settings.snipShortcut);
applyConversation();
applyPlayback();
$('#snip-btn').hidden = !native; // snipping needs the desktop app
setCloseToTray(settings.closeToTray);
renderShortcuts();
updateEmpty();
renderVoice();
setStatus('idle');
panes.top.el.focus();
perms = await getPermissions();
permsAtLaunch = perms;
if (perms && settings.permCheck && permsMissing(perms).length) openPerms();
