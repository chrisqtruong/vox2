// Palettes from Monkeytype (github.com/monkeytypegame/monkeytype, GPL-3.0).
// Same roles as there: `text` is confirmed text, `sub` is pending text and labels,
// `subAlt` is lines and hovers, `main` is the accent.
// [bg, main, sub, subAlt, text, error]
const raw = {
  dark: [
    ['serika dark', ['#323437', '#e2b714', '#646669', '#2c2e31', '#d1d0c5', '#ca4754']],
    ['carbon', ['#313131', '#f66e0d', '#616161', '#2b2b2b', '#f5e6c8', '#e72d2d']],
    ['nord', ['#242933', '#88c0d0', '#929aaa', '#2e3440', '#d8dee9', '#bf616a']],
    ['dracula', ['#282a36', '#bd93f9', '#6272a4', '#20222c', '#f8f8f2', '#ff5555']],
    ['catppuccin', ['#1e1e2e', '#cba6f7', '#7f849c', '#181825', '#cdd6f4', '#f38ba8']],
    ['rose pine', ['#1f1d27', '#9ccfd8', '#c4a7e7', '#282533', '#e0def4', '#eb6f92']],
    ['gruvbox dark', ['#282828', '#d79921', '#665c54', '#212121', '#ebdbb2', '#fb4934']],
    ['8008', ['#333a45', '#f44c7f', '#939eae', '#2e343d', '#e9ecf0', '#da3333']],
    ['bento', ['#2d394d', '#ff7a90', '#4a768d', '#263041', '#fffaf8', '#ee2a3a']],
    ['olivia', ['#1c1b1d', '#deaf9d', '#4e3e3e', '#262223', '#f2efed', '#bf616a']],
    ['superuser', ['#262a33', '#43ffaf', '#526777', '#1f232c', '#e5f7ef', '#ff5f5f']],
    ['arch', ['#0c0d11', '#7ebab5', '#454864', '#171a25', '#f6f5f5', '#ff4754']],
  ],
  contrast: [
    ['dots', ['#121520', '#ffffff', '#676e8a', '#1b1e2c', '#ffffff', '#da3333']],
    ['matrix', ['#000000', '#15ff00', '#006500', '#032000', '#d1ffcd', '#da3333']],
    ['hammerhead', ['#030613', '#4fcdb9', '#213c53', '#0a1928', '#e2f1f5', '#e32b2b']],
    ['aurora', ['#011926', '#00e980', '#245c69', '#000c13', '#ffffff', '#b94da1']],
    ['terminal', ['#191a1b', '#79a617', '#48494b', '#141516', '#e7eae0', '#a61717']],
    ['modern ink', ['#ffffff', '#ff360d', '#b7b7b7', '#ececec', '#000000', '#d70000']],
    ['9009', ['#eeebe2', '#080909', '#99947f', '#d3cfc1', '#080909', '#c87e74']],
  ],
  colorful: [
    ['miami', ['#f35588', '#05dfd7', '#94294c', '#db4979', '#f0e9ec', '#fff591']],
    ['strawberry', ['#f37f83', '#fcfcf8', '#e53c58', '#ef6e77', '#fcfcf8', '#fcd23f']],
    ['honey', ['#f2aa00', '#fff546', '#a66b00', '#e19e00', '#f3eecb', '#df3333']],
    ['botanical', ['#7b9c98', '#eaf1f3', '#495755', '#72908d', '#eaf1f3', '#f6c9b4']],
    ['laser', ['#221b44', '#009eaf', '#b82356', '#1e173b', '#dbe7e8', '#a8d400']],
    ['sweden', ['#0058a3', '#ffcc02', '#57abdb', '#024f8e', '#ffffff', '#e74040']],
    ['vaporwave', ['#a4a7ea', '#e368da', '#7c7faf', '#989bd9', '#f1ebf1', '#573ca9']],
    ['nautilus', ['#132237', '#ebb723', '#0b4c6c', '#0e1a29', '#1cbaac', '#da3333']],
  ],
  light: [
    ['serika', ['#e1e1e3', '#e2b714', '#aaaeb3', '#d1d3d8', '#323437', '#da3333']],
    ['paper', ['#eeeeee', '#444444', '#b2b2b2', '#dddddd', '#444444', '#d70000']],
    ['solarized light', ['#fdf6e3', '#859900', '#2aa198', '#e2d8be', '#181819', '#d33682']],
    ['lil dragon', ['#ebe1ef', '#8a5bd6', '#a28db8', '#dac7e2', '#212b43', '#f794ca']],
    ['milkshake', ['#ffffff', '#212b43', '#62cfe6', '#ddeff3', '#212b43', '#f19dac']],
    ['mizu', ['#afcbdd', '#fcfbf6', '#85a5bb', '#9fc1d4', '#1a2633', '#bf616a']],
    ['lavender', ['#ada6c2', '#e4e3e9', '#e4e3e9', '#a19bb9', '#2f2a41', '#ca4754']],
    ['shoko', ['#ced7e0', '#81c4dd', '#7599b1', '#b7cada', '#3b4c58', '#bf616a']],
    ['blueberry light', ['#dae0f5', '#506477', '#92a4be', '#c1c7df', '#678198', '#df4576']],
  ],
};

export const THEME_GROUPS = Object.entries(raw).map(([group, themes]) => ({
  group,
  themes: themes.map(([name, [bg, main, sub, subAlt, text, error]]) =>
    ({ name, bg, main, sub, subAlt, text, error })),
}));

const BY_NAME = Object.fromEntries(THEME_GROUPS.flatMap((g) => g.themes.map((t) => [t.name, t])));

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

// 'auto' clears overrides so styles.css's own light/dark palette applies.
export function applyTheme(name) {
  const root = document.documentElement.style;
  const t = BY_NAME[name];
  const vars = t && {
    '--bg': t.bg, '--ink': t.text, '--pending': t.sub, '--muted': t.sub,
    '--line': t.subAlt, '--hover': t.subAlt, '--accent': t.main, '--danger': t.error,
  };
  for (const v of ['--bg', '--ink', '--pending', '--muted', '--line', '--hover', '--accent', '--danger']) {
    if (vars) root.setProperty(v, vars[v]); else root.removeProperty(v);
  }
  if (t) root.setProperty('color-scheme', isDark(t.bg) ? 'dark' : 'light');
  else root.removeProperty('color-scheme');
  setKbdColor();
}

// Keyboard-shortcut hints (the key chips in tooltips, the bubble's "⌘L"): the theme's muted color,
// unless it's too close to the background to read, then the accent color, then the text color.
// Contrast as in WCAG: 4.5 for the small muted text, 3 for the accent (a bolder color).
function rgb(color) {
  const probe = document.createElement('i');
  probe.style.color = color;
  document.body.append(probe);
  const [r, g, b] = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);
  probe.remove();
  return [r, g, b];
}
const luminance = (color) => {
  const [r, g, b] = rgb(color).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setKbdColor()); // "auto" follows the system
function setKbdColor() {
  const root = document.documentElement;
  if (!document.body) return;
  root.style.removeProperty('--kbd');
  const css = getComputedStyle(root);
  const v = (name) => css.getPropertyValue(`--${name}`).trim();
  const bg = v('bg');
  if (!bg) return;
  const pick = [['muted', 4.5], ['accent', 3], ['ink', 0]].find(([name, min]) => v(name) && contrast(v(name), bg) >= min);
  root.style.setProperty('--kbd', v(pick[0]));
}
