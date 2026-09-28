// Screenshot of the terminal charts: every visible chart (with its indicators and drawings) at its place on the
// screen, a label per chart and the caption "Screenshoted from unc's terminal." below. Copy or save as PNG; the
// macOS app goes through its native file bridge, browsers use the clipboard and a download.
(function (root) {
  'use strict';
  const CAPTION = "Screenshoted from unc's terminal.";
  const FOOTER = 34, FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', MONO = 'ui-monospace,Menlo,monospace';

  // panes: [{ el, chart, title }] (el = the chart's container). Returns a canvas.
  function render({ area, panes }) {
    const css = getComputedStyle(area), color = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const bg = color('--bg', '#202126'), ink = color('--ink', '#e4e5e9'), dim = color('--dim', '#8b8d99'), line = color('--line', '#34353d');
    // The picture covers the charts themselves (not the headers and toolbars around them).
    const rects = panes.map(p => p.el.getBoundingClientRect()).filter(r => r.width >= 2 && r.height >= 2);
    if (!rects.length) throw new Error('Brak widocznego wykresu.');
    const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
    const box = { left, top, width: Math.max(...rects.map(r => r.right)) - left, height: Math.max(...rects.map(r => r.bottom)) - top };
    const scale = Math.min(2, Math.max(1, root.devicePixelRatio || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(box.width * scale); canvas.height = Math.round((box.height + FOOTER) * scale);
    const c = canvas.getContext('2d');
    c.scale(scale, scale);
    c.fillStyle = bg; c.fillRect(0, 0, box.width, box.height + FOOTER);
    for (const pane of panes) {
      const r = pane.el.getBoundingClientRect(), x = r.left - box.left, y = r.top - box.top;
      if (r.width < 2 || r.height < 2) continue;
      try { c.drawImage(pane.chart.takeScreenshot(), x, y, r.width, r.height); } catch { /* chart without a canvas yet */ }
      // Drawings live on their own canvas above the chart.
      for (const layer of pane.el.querySelectorAll('canvas.draw-layer')) {
        const lr = layer.getBoundingClientRect();
        if (lr.width && lr.height) c.drawImage(layer, lr.left - box.left, lr.top - box.top, lr.width, lr.height);
      }
      if (panes.length > 1) { c.strokeStyle = line; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, r.width - 1, r.height - 1); }
      if (pane.title) {
        c.font = `600 12px ${FONT}`;
        const w = c.measureText(pane.title).width + 16;
        c.fillStyle = bg; c.globalAlpha = .85; c.fillRect(x + 8, y + 8, w, 22); c.globalAlpha = 1;
        c.strokeStyle = line; c.lineWidth = 1; c.strokeRect(x + 8.5, y + 8.5, w - 1, 21);
        c.fillStyle = ink; c.textBaseline = 'middle'; c.fillText(pane.title, x + 16, y + 19.5);
      }
    }
    // Caption bar.
    c.fillStyle = line; c.fillRect(0, box.height, box.width, 1);
    c.textBaseline = 'middle';
    c.font = `600 12px ${FONT}`; c.fillStyle = ink; c.textAlign = 'left';
    c.fillText(CAPTION, 12, box.height + FOOTER / 2);
    c.font = `11px ${MONO}`; c.fillStyle = dim; c.textAlign = 'right';
    c.fillText(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', box.width - 12, box.height + FOOTER / 2);
    c.textAlign = 'left';
    return canvas;
  }
  const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Nie udało się utworzyć PNG.')), 'image/png'));
  const base64 = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(blob); });
  const bridge = () => root.webkit?.messageHandlers?.postCreatorFile;
  const fileName = () => 'UNC-Terminal-' + new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-') + '.png';

  async function copy(blob) {
    if (bridge()) { const r = await bridge().postMessage({ action: 'copy', data: await base64(blob) }); if (!r?.ok) throw new Error('Nie skopiowano.'); return; }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }
  async function save(blob) {
    if (bridge()) { const r = await bridge().postMessage({ action: 'save', filename: fileName(), data: await base64(blob) }); return !r?.cancelled; }
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = fileName(); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  // The camera button: capture, then a small preview with Copy / Save.
  function attach({ button, host, collect }) {
    const pop = document.createElement('div');
    pop.className = 'ht-snap'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Zrzut wykresu');
    pop.innerHTML = `<div class="ht-snap-head"><strong>Zrzut wykresu</strong><button type="button" data-snap-close aria-label="Zamknij">×</button></div>
      <img alt="Podgląd zrzutu wykresu"><div class="ht-snap-actions"><button type="button" data-snap-copy>Kopiuj obraz</button><button type="button" data-snap-save>Zapisz PNG</button><span role="status"></span></div>`;
    host.append(pop);
    let blob = null, url = '';
    const status = text => { pop.querySelector('[role=status]').textContent = text; };
    const close = () => { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); if (url) URL.revokeObjectURL(url); url = ''; blob = null; };
    async function shoot() {
      const target = collect();
      if (!target?.panes.length) return;
      status('');
      try { blob = await toBlob(render(target)); }
      catch (e) { status(e.message); return; }
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      pop.querySelector('img').src = url;
      pop.hidden = false; button.setAttribute('aria-expanded', 'true');
      pop.querySelector('[data-snap-copy]').focus();
    }
    button.addEventListener('click', () => pop.hidden ? shoot() : close());
    pop.addEventListener('click', async e => {
      if (e.target.closest('[data-snap-close]')) { close(); button.focus(); return; }
      if (!blob) return;
      try {
        if (e.target.closest('[data-snap-copy]')) { await copy(blob); status('Skopiowano do schowka.'); }
        else if (e.target.closest('[data-snap-save]')) { if (await save(blob)) status('Zapisano PNG.'); }
      } catch { status('Nie udało się. Spróbuj „Zapisz PNG”.'); }
    });
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); button.focus(); } });
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !button.contains(e.target)) close(); });
    return { shoot, close };
  }
  root.TerminalSnapshot = { render, attach, CAPTION };
})(globalThis);
