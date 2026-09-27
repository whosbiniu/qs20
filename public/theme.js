// Colour themes: one accent colour for text, lines and drawings on the black page. The quarter colours
// (--q1..--q4) are deliberately not part of a theme. Shell and framed pages stay in sync via postMessage,
// because pages bundled in the Mac app (file://) cannot read each other's storage.
const Theme = (() => {
  // Each accent colour has a dark palette (the original look on black) and a light one (dark ink on paper).
  const DARK_BG = '#050505';
  const THEMES = {
    cream: { label: 'krem', ink: '#ebe6d3', dim: '#8c8a7c', line: '#3a3a34', faint: '#1c1c19', land: '#0d0d0b', border: '#4a483f',
      light: { bg: '#f6f3e8', ink: '#2b2a24', dim: '#7a776a', line: '#cfcabb', faint: '#e6e2d3', land: '#ebe7d9', border: '#b9b4a3' } },
    white: { label: 'biały', ink: '#f5f5f5', dim: '#8e8e8e', line: '#3c3c3c', faint: '#1d1d1d', land: '#0e0e0e', border: '#555555',
      light: { bg: '#ffffff', ink: '#111111', dim: '#6b6b6b', line: '#d0d0d0', faint: '#ececec', land: '#f1f1f1', border: '#bdbdbd' } },
    green: { label: 'zielony', ink: '#4cf58a', dim: '#25945a', line: '#1f5a37', faint: '#0f2a1a', land: '#07120b', border: '#2a7048',
      light: { bg: '#f3f8f4', ink: '#0b6b34', dim: '#4f8f69', line: '#b9d6c4', faint: '#e0eee5', land: '#e8f2ec', border: '#9cc4ad' } },
    red: { label: 'czerwony', ink: '#ff5d5d', dim: '#a33b3b', line: '#5c2323', faint: '#2b1010', land: '#140808', border: '#7a3030',
      light: { bg: '#faf3f3', ink: '#b3202a', dim: '#b06a6f', line: '#e3c3c5', faint: '#f1e0e1', land: '#f4e8e8', border: '#d6a9ac' } },
  };
  const isTop = window.parent === window;
  let current = 'cream', mode = 'dark';
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');
  const paletteOf = (id, m) => m === 'light' ? THEMES[id].light : { bg: DARK_BG, ...THEMES[id] };

  function apply(id, nextMode) {
    current = THEMES[id] ? id : 'cream';
    mode = nextMode === 'light' ? 'light' : 'dark';
    const theme = paletteOf(current, mode);
    const root = document.documentElement, style = root.style;
    for (const key of ['bg', 'ink', 'dim', 'line', 'faint', 'land', 'border']) style.setProperty('--' + key, theme[key]);
    style.setProperty('--panel', theme.bg);
    style.setProperty('--ink-rgb', rgb(theme.ink));
    // Variables of the framed Kwartały pages that carry text and accent colours.
    style.setProperty('--text', theme.ink); style.setProperty('--muted', theme.dim);
    for (const key of ['green', 'blue', 'hot']) style.setProperty('--' + key, theme.ink);
    root.dataset.colorMode = mode; style.colorScheme = mode;
    window.dispatchEvent(new CustomEvent('themechange', { detail: current }));
  }
  const persist = () => { try { localStorage.setItem('theme', current); localStorage.setItem('mode', mode); } catch {} };
  const broadcast = () => { if (isTop) for (const frame of document.querySelectorAll('iframe')) frame.contentWindow?.postMessage({ type: 'theme', id: current, mode }, '*'); };
  function set(id) { apply(id, mode); persist(); broadcast(); }
  function setMode(next) { apply(current, next); persist(); broadcast(); }
  window.addEventListener('message', event => {
    if (event.data?.type === 'theme' && event.source === window.parent && !isTop) apply(event.data.id, event.data.mode);
    if (event.data?.type === 'theme-request' && isTop) event.source?.postMessage({ type: 'theme', id: current, mode }, '*');
  });
  let saved = null, savedMode = null;
  try { saved = localStorage.getItem('theme'); savedMode = localStorage.getItem('mode'); } catch {}
  apply(saved, savedMode);
  if (!isTop) window.parent.postMessage({ type: 'theme-request' }, '*');
  return { THEMES, set, setMode, get: () => current, getMode: () => mode, swatch: id => paletteOf(id, mode).ink, css: name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() };
})();
