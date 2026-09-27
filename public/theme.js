// Colour themes: one accent colour for text, lines and drawings on the black page. The quarter colours
// (--q1..--q4) are deliberately not part of a theme. Shell and framed pages stay in sync via postMessage,
// because pages bundled in the Mac app (file://) cannot read each other's storage.
const Theme = (() => {
  const THEMES = {
    cream: { label: 'krem', ink: '#ebe6d3', dim: '#8c8a7c', line: '#3a3a34', faint: '#1c1c19', land: '#0d0d0b', border: '#4a483f' },
    white: { label: 'biały', ink: '#f5f5f5', dim: '#8e8e8e', line: '#3c3c3c', faint: '#1d1d1d', land: '#0e0e0e', border: '#555555' },
    green: { label: 'zielony', ink: '#4cf58a', dim: '#25945a', line: '#1f5a37', faint: '#0f2a1a', land: '#07120b', border: '#2a7048' },
    red: { label: 'czerwony', ink: '#ff5d5d', dim: '#a33b3b', line: '#5c2323', faint: '#2b1010', land: '#140808', border: '#7a3030' },
  };
  const isTop = window.parent === window;
  let current = 'cream';
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ');

  function apply(id) {
    const theme = THEMES[id] || THEMES.cream;
    current = THEMES[id] ? id : 'cream';
    const style = document.documentElement.style;
    for (const key of ['ink', 'dim', 'line', 'faint', 'land', 'border']) style.setProperty('--' + key, theme[key]);
    style.setProperty('--ink-rgb', rgb(theme.ink));
    // Variables of the framed Kwartały pages that carry text and accent colours.
    style.setProperty('--text', theme.ink); style.setProperty('--muted', theme.dim);
    for (const key of ['green', 'blue', 'hot']) style.setProperty('--' + key, theme.ink);
    window.dispatchEvent(new CustomEvent('themechange', { detail: current }));
  }
  function set(id) {
    apply(id);
    try { localStorage.setItem('theme', current); } catch {}
    if (isTop) for (const frame of document.querySelectorAll('iframe')) frame.contentWindow?.postMessage({ type: 'theme', id: current }, '*');
  }
  window.addEventListener('message', event => {
    if (event.data?.type === 'theme' && event.source === window.parent && !isTop) apply(event.data.id);
    if (event.data?.type === 'theme-request' && isTop) event.source?.postMessage({ type: 'theme', id: current }, '*');
  });
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch {}
  apply(saved);
  if (!isTop) window.parent.postMessage({ type: 'theme-request' }, '*');
  return { THEMES, set, get: () => current, css: name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() };
})();
