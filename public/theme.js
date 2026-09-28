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
  // Frosted glass: `clear` 0..1 is how much shows through (0 = almost solid, 1 = almost clear glass).
  let glass = { clear: .42 };
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');
  // Black smoked glass: neutral tint, no colour cast; text keeps the accent colour of the theme.
  // Comma rgba() syntax, because the chart library parses these colours too.
  const TINT = '8, 8, 10';
  function glassPalette(id) {
    const surface = +(.9 - .82 * glass.clear).toFixed(3);
    return { ...THEMES[id], bg: `rgba(${TINT}, ${(surface * .25).toFixed(3)})`, surface: `rgba(${TINT}, ${surface})`,
      line: 'rgba(255, 255, 255, 0.13)', faint: 'rgba(255, 255, 255, 0.06)', land: 'rgba(255, 255, 255, 0.045)', border: 'rgba(255, 255, 255, 0.22)' };
  }
  const paletteOf = (id, m) => m === 'light' ? THEMES[id].light : m === 'glass' ? glassPalette(id) : { bg: DARK_BG, ...THEMES[id] };
  // In the Mac app the window itself turns into glass over the desktop (see desktop/macos/main.swift).
  const native = (isTop && window.webkit?.messageHandlers?.glass) || null;
  if (native) document.documentElement.dataset.native = '';

  function apply(id, nextMode) {
    current = THEMES[id] ? id : 'cream';
    mode = ['light', 'glass'].includes(nextMode) ? nextMode : 'dark';
    const theme = paletteOf(current, mode);
    const root = document.documentElement, style = root.style;
    for (const key of ['bg', 'ink', 'dim', 'line', 'faint', 'land', 'border']) style.setProperty('--' + key, theme[key]);
    style.setProperty('--panel', theme.bg);
    // Text on an ink-coloured background (active buttons): always solid, also on glass.
    style.setProperty('--on-ink', mode === 'light' ? theme.bg : DARK_BG);
    style.setProperty('--glass', theme.surface || theme.bg);
    style.setProperty('--glass-blur', (8 + 28 * (1 - glass.clear)).toFixed(1) + 'px');
    style.setProperty('--ink-rgb', rgb(theme.ink));
    // Variables of the framed Kwartały pages that carry text and accent colours.
    style.setProperty('--text', theme.ink); style.setProperty('--muted', theme.dim);
    for (const key of ['green', 'blue', 'hot']) style.setProperty('--' + key, theme.ink);
    root.dataset.colorMode = mode; style.colorScheme = mode === 'light' ? 'light' : 'dark';
    native?.postMessage({ on: mode === 'glass', clear: glass.clear });
    window.dispatchEvent(new CustomEvent('themechange', { detail: current }));
  }
  const persist = () => { try { localStorage.setItem('theme', current); localStorage.setItem('mode', mode); localStorage.setItem('glass', JSON.stringify(glass)); } catch {} };
  const message = () => ({ type: 'theme', id: current, mode, glass });
  const broadcast = () => { if (isTop) for (const frame of document.querySelectorAll('iframe')) frame.contentWindow?.postMessage(message(), '*'); };
  const cleanGlass = g => ({ clear: Number.isFinite(+g?.clear) ? Math.min(1, Math.max(0, +g.clear)) : .42 });
  function set(id) { apply(id, mode); persist(); broadcast(); }
  function setMode(next) { apply(current, next); persist(); broadcast(); }
  // Live while dragging the slider; saved when the drag ends (save = true).
  function setGlass(clear, save) { glass = cleanGlass({ clear }); apply(current, mode); broadcast(); if (save) persist(); }
  window.addEventListener('message', event => {
    if (event.data?.type === 'theme' && event.source === window.parent && !isTop) { glass = cleanGlass(event.data.glass); apply(event.data.id, event.data.mode); }
    if (event.data?.type === 'theme-request' && isTop) event.source?.postMessage(message(), '*');
  });
  let saved = null, savedMode = null;
  // Dark by default; light and glass are chosen in the top bar and remembered.
  try {
    saved = localStorage.getItem('theme'); savedMode = localStorage.getItem('mode');
    glass = cleanGlass(JSON.parse(localStorage.getItem('glass') || 'null'));
  } catch {}
  apply(saved, savedMode);
  if (!isTop) window.parent.postMessage({ type: 'theme-request' }, '*');
  return { THEMES, set, setMode, setGlass, native: !!native, get: () => current, getMode: () => mode, getGlass: () => glass.clear,
    swatch: id => paletteOf(id, mode === 'glass' ? 'dark' : mode).ink, css: name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() };
})();
