// Language menu: search, "detect language", pinned favorites on top, pin/unpin on hover.
// Each pane's language button gets a `value` property and fires `change`, like a <select>.
// Keyboard: with the button focused (Tab to it), start typing a language name to open the menu
// already searching; ↓ / Enter / Space open it too. In the menu, ↑↓ move, Enter or Tab picks,
// Esc cancels, and focus goes back to the button so Tab carries on from there.
import { LANGUAGES, langName } from './languages.js';

const PIN_SVG = '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7"/></svg>';

const menu = document.createElement('div');
menu.className = 'lang-menu';
menu.hidden = true;
menu.innerHTML = '<input class="lang-search" placeholder="search languages" spellcheck="false" autocomplete="off">'
  + '<div class="lang-list" role="listbox"></div>';
document.body.append(menu);
const search = menu.querySelector('.lang-search');
const list = menu.querySelector('.lang-list');

let owner = null; // { button, opts }
let active = 0;

const rows = () => [...list.querySelectorAll('.lang-row')];

function setActive(i) {
  const r = rows();
  if (!r.length) return;
  active = Math.max(0, Math.min(i, r.length - 1));
  r.forEach((row, j) => row.classList.toggle('active', j === active));
  r[active].scrollIntoView({ block: 'nearest' });
}

function row(code, { pinned = false } = {}) {
  const { button } = owner;
  const el = document.createElement('div');
  el.className = `lang-row${code === 'auto' ? ' auto' : ''}${pinned ? ' pinned' : ''}`;
  el.dataset.code = code;
  el.setAttribute('role', 'option');
  el.setAttribute('aria-selected', String(code === button.value));
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = code === 'auto' ? 'detect language' : langName(code);
  el.append(name);
  if (code !== 'auto') {
    const pin = document.createElement('span');
    pin.className = 'pin';
    pin.title = pinned ? 'Unpin' : 'Pin to top';
    pin.innerHTML = PIN_SVG;
    el.append(pin);
  }
  return el;
}

function build() {
  const { opts } = owner;
  const pinned = opts.getPinned();
  const q = search.value.trim().toLowerCase();
  const nodes = [];
  if (q) {
    if ('detect language'.includes(q)) nodes.push(row('auto'));
    // Names that start with what you typed come first ("s" → Samoan, Serbian, Spanish… before Afrikaans),
    // then names with a word starting with it ("chin" → Chinese (Simplified)), then any other match.
    const rank = (code, name) => {
      const n = name.toLowerCase();
      if (code.toLowerCase() === q || n.startsWith(q)) return 0;
      if (n.split(/[\s(]+/).some((w) => w.startsWith(q))) return 1;
      return n.includes(q) ? 2 : -1;
    };
    const found = LANGUAGES.map(([code, name]) => [code, rank(code, name)]).filter(([, r]) => r >= 0);
    for (const [code] of found.sort((x, y) => x[1] - y[1])) nodes.push(row(code, { pinned: pinned.includes(code) }));
  } else {
    nodes.push(row('auto'));
    for (const code of pinned) nodes.push(row(code, { pinned: true }));
    nodes.push(Object.assign(document.createElement('div'), { className: 'lang-divider' }));
    for (const [code] of LANGUAGES) if (!pinned.includes(code)) nodes.push(row(code));
  }
  list.replaceChildren(...nodes);
  const sel = rows().findIndex((r) => r.getAttribute('aria-selected') === 'true');
  setActive(q || sel < 0 ? 0 : sel);
}

function pick(code) {
  const { button } = owner;
  close(true);
  if (code === button.value) return;
  button.value = code;
  button.dispatchEvent(new Event('change'));
}

function togglePin(code) {
  const { opts } = owner;
  const pinned = opts.getPinned();
  opts.setPinned(pinned.includes(code) ? pinned.filter((c) => c !== code) : [...pinned, code]);
  const scroll = list.scrollTop;
  build();
  list.scrollTop = scroll;
}

function open(button, opts, typed = '') {
  if (owner?.button === button) return close(true);
  owner = { button, opts };
  search.value = typed;
  menu.hidden = false;
  // Root zoom scales fixed positions, so convert screen coordinates back to CSS pixels.
  const z = parseFloat(document.documentElement.style.zoom) || 1;
  const r = button.getBoundingClientRect();
  const top = r.bottom / z + 4;
  menu.style.left = `${Math.max(8, r.left / z - 4)}px`;
  menu.style.top = `${top}px`;
  menu.style.maxHeight = `${Math.max(180, innerHeight / z - top - 10)}px`;
  build();
  button.setAttribute('aria-expanded', 'true');
  search.focus();
}

// refocus: put focus back on the language button (after a pick or Esc), so the keyboard stays in
// place instead of landing nowhere when the menu disappears.
function close(refocus = false) {
  if (!owner) return;
  const { button } = owner;
  button.setAttribute('aria-expanded', 'false');
  owner = null;
  menu.hidden = true;
  if (refocus || menu.contains(document.activeElement)) button.focus();
}

list.addEventListener('pointerdown', (e) => e.preventDefault()); // keep focus in the search box
list.addEventListener('click', (e) => {
  const r = e.target.closest('.lang-row');
  if (!r) return;
  if (e.target.closest('.pin')) togglePin(r.dataset.code);
  else pick(r.dataset.code);
});
list.addEventListener('pointermove', (e) => {
  const r = e.target.closest('.lang-row');
  if (r) setActive(rows().indexOf(r));
});
search.addEventListener('input', build);
search.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') setActive(active + 1);
  else if (e.key === 'ArrowUp') setActive(active - 1);
  else if (e.key === 'Enter') { const r = rows()[active]; if (r) pick(r.dataset.code); }
  else if (e.key === 'Tab') { const r = rows()[active]; if (r && search.value.trim()) pick(r.dataset.code); else close(true); } // like autocomplete
  else if (e.key === 'Escape') close(true);
  else return;
  e.preventDefault();
  e.stopPropagation();
});
document.addEventListener('pointerdown', (e) => {
  if (owner && !menu.contains(e.target) && !owner.button.contains(e.target)) close();
});
addEventListener('blur', close);

// opts: { getPinned(): string[], setPinned(codes) }
export function attachLangPicker(button, opts) {
  let value = '';
  let detected = null;
  const label = document.createElement('span');
  button.replaceChildren(label);
  const render = () => {
    label.textContent = value !== 'auto' ? langName(value)
      : detected ? `${langName(detected)} · detected` : 'detect language';
    button.classList.toggle('is-auto', value === 'auto');
  };
  Object.defineProperty(button, 'value', {
    get: () => value,
    set: (v) => { value = v; if (v !== 'auto') detected = null; render(); },
  });
  Object.defineProperty(button, 'detected', {
    get: () => detected,
    set: (v) => { detected = v; render(); },
  });
  button.setAttribute('aria-haspopup', 'listbox');
  button.addEventListener('click', () => open(button, opts));
  // Typing on the focused button opens the menu already searching ("s", "p", "a" → Spanish).
  button.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && /\p{L}/u.test(e.key)) open(button, opts, e.key);
    else if (e.key === 'ArrowDown') open(button, opts);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
}
