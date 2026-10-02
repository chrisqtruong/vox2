// Thin layer over the desktop shell (Tauri), with plain-browser fallbacks for development.
const tauri = window.__TAURI__;
export const native = !!tauri;
const invoke = (cmd, args) => (native ? tauri.core.invoke(cmd, args) : Promise.resolve());

export async function loadData(key) {
  if (native) return tauri.core.invoke('load_data', { key });
  return localStorage.getItem(key);
}

export function saveData(key, value) {
  if (native) invoke('save_data', { key, value }).catch(() => {});
  else try { localStorage.setItem(key, value); } catch {}
}

export function setAlwaysOnTop(on) {
  if (native) tauri.window.getCurrentWindow().setAlwaysOnTop(on).catch(() => {});
}

// Events from the native side: 'hotkey' ({ name, type }), 'summoned', 'selection' ({ text }).
export function onNative(event, cb) {
  if (native) tauri.event.listen(event, ({ payload }) => cb(payload));
}

// System-wide shortcuts by name: 'dictate', 'summon', 'select'. An empty code turns one off.
export function setHotkey(name, sc) {
  const hotkey = { code: sc?.code || '', ctrl: !!sc?.ctrl, alt: !!sc?.alt, shift: !!sc?.shift, meta: !!sc?.meta };
  invoke('set_hotkey', { name, hotkey }).catch(() => {});
}

// Types text into whatever app has focus.
export const typeText = (text) => invoke('type_text', { text });

// The screen-level dictation pill lives in its own transparent window, created the first time
// it's needed. Until it reports ready, updates are merged and sent once it is.
let pillReady = false;
let pillPending = null;
let pillCreating = false;
if (native) {
  tauri.event.listen('pill-ready', () => {
    pillReady = true;
    if (pillPending) tauri.event.emitTo('pill', 'pill', pillPending).catch(() => {});
    pillPending = null;
  });
}
export function sendPill(payload) {
  if (!native) return;
  if (pillReady) { tauri.event.emitTo('pill', 'pill', payload).catch(() => {}); return; }
  pillPending = { ...pillPending, ...payload };
  if (!pillCreating) {
    pillCreating = true;
    invoke('ensure_pill').catch(() => { pillCreating = false; });
  }
}

// The quick-translate bubble next to the cursor. Like the pill, it's created on first use, so
// messages wait until it says it's listening.
let bubbleReady = false;
let bubbleQueue = [];
if (native) {
  tauri.event.listen('bubble-ready', () => {
    bubbleReady = true;
    for (const p of bubbleQueue) tauri.event.emitTo('bubble', 'bubble', p).catch(() => {});
    bubbleQueue = [];
  });
}
export function sendBubble(payload) {
  if (!native) return;
  if (bubbleReady) tauri.event.emitTo('bubble', 'bubble', payload).catch(() => {});
  else bubbleQueue.push(payload);
}
// Anchor at the cursor, or at a point (e.g. just under a snipped area).
export const openBubble = (x, y) => invoke('open_bubble', { x: x ?? null, y: y ?? null });
export const showWindow = () => invoke('show_window').catch(() => {});
export const startSnip = () => invoke('start_snip_cmd').catch(() => {});
export const takeSnip = () => invoke('take_snip');

// Natural neural voice → { audio: MP3 bytes, words: [[start ms, length ms, word], …] }.
// rate is a percent change, e.g. -15.
export async function speakNeural(text, voice, rate) {
  const buf = await invoke('tts_speak', { text, voice, rate });
  const len = new DataView(buf).getUint32(0, true);
  const words = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len)));
  return { audio: buf.slice(4 + len), words };
}

// The native keyboard watcher is blind while Vox2 is in front; the page handles keys then,
// and clears the watcher's key state whenever focus changes hands.
export const resetKeys = () => invoke('reset_keys').catch(() => {});
export const hideWindow = () => invoke('hide_main').catch(() => {});

export const setCloseToTray = (on) => invoke('set_close_to_tray', { on }).catch(() => {});
export const setWindowAlpha = (alpha) => invoke('set_window_alpha', { alpha }).catch(() => {});
export const setAutostart = (on) => invoke(`plugin:autostart|${on ? 'enable' : 'disable'}`).catch(() => {});

export function openUrl(url) {
  if (native) tauri.opener.openUrl(url);
  else window.open(url, '_blank');
}

// API keys go to the system's credential store (Windows Credential Manager / macOS Keychain),
// not into settings. In a plain browser there's no store, so these do nothing.
export const getSecret = (name) => (native ? tauri.core.invoke('secret_get', { name }) : Promise.resolve(null));
export const setSecret = (name, value) => (native ? tauri.core.invoke('secret_set', { name, value }) : Promise.resolve());

// This computer's memory in MB: { totalMb, availableMb }. A plain browser only gives a rough total.
export async function memoryInfo() {
  if (native) {
    const [totalMb, availableMb] = await tauri.core.invoke('memory_info');
    return { totalMb, availableMb };
  }
  return { totalMb: (navigator.deviceMemory || 8) * 1024, availableMb: null };
}
