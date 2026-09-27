// Drawing tools for the chart panels (trend line, horizontal/vertical line, rectangle, Fibonacci, measure, brush, text).
// Drawings live in (time, price) space, so they follow the chart when it is panned, zoomed or switched
// to another timeframe, and are stored per symbol in localStorage.
const Drawings = (() => {
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const ICONS = {
    cursor: '<path d="M3 2l9 5-4 1-2 4z"/>',
    trend: '<path d="M2 13L13 3"/><circle cx="2" cy="13" r="1.3"/><circle cx="13" cy="3" r="1.3"/>',
    hline: '<path d="M1 8h14"/><circle cx="8" cy="8" r="1.3"/>',
    vline: '<path d="M8 1v14"/><circle cx="8" cy="8" r="1.3"/>',
    rect: '<rect x="2.5" y="4" width="11" height="8"/>',
    fib: '<path d="M2 3h12M2 6h12M2 9.5h12M2 13h12"/>',
    measure: '<path d="M2 13L13 3M13 3h-3.5M13 3v3.5"/>',
    brush: '<path d="M13.500 1.500l1 1L8 9 6.500 7.500z"/><path d="M6 8.500c-2 0-2.500 1.500-3 3.500-.3 1-1 1.500-1.500 1.500 2.500.5 5-.5 5.500-3.500"/>',
    text: '<path d="M3 4.500V2.500h10v2M8 2.500v11M6 13.500h4"/>',
    erase: '<path d="M3 11l6-7 4 3.500-5 5.500H4z"/><path d="M9 13h5"/>',
    clear: '<path d="M3 4h10M6 4V2.500h4V4M4.500 4l.5 9h6l.5-9"/>',
  };
  const TOOLS = [['cursor', 'Kursor: przesuwanie wykresu; kliknij rysunek, aby go zaznaczyć (Backspace / Delete usuwa)'], ['trend', 'Linia trendu'], ['hline', 'Linia pozioma'], ['vline', 'Linia pionowa'],
    ['rect', 'Prostokąt'], ['fib', 'Zniesienia Fibonacciego'], ['measure', 'Pomiar'], ['brush', 'Pędzel: przeciągnij, aby rysować'], ['text', 'Tekst: kliknij, wpisz i zatwierdź Enterem'], ['erase', 'Gumka: kliknij rysunek, aby go usunąć'], ['clear', 'Usuń wszystkie rysunki']];
  const NEEDS = { trend: 2, rect: 2, fib: 2, measure: 2, hline: 1, vline: 1, text: 1 };
  // Tool types registered by other scripts (anchored VWAP, range volume profile, position):
  // { title, icon, needs, volume, paint(ctx, d, api, ink, ghost, active), distance(d, p, api) }.
  // `volume` tools are offered only on panels that have candle volume (panel.volume).
  const CUSTOM = {};
  function register(id, def) {
    CUSTOM[id] = def; NEEDS[id] = def.needs; ICONS[id] = def.icon;
    TOOLS.splice(TOOLS.findIndex(t => t[0] === 'erase'), 0, [id, def.title]);
  }
  const TEXT_FONT = '13px ui-monospace,Menlo,monospace';

  // Only one drawing can be selected across all chart panels: the panel that owns the selection.
  let owner = null;

  function attach(panel) {
    const self = {};
    const box = panel.el;
    const canvas = document.createElement('canvas');
    canvas.className = 'draw-layer';
    const bar = document.createElement('div');
    bar.className = 'draw-bar';
    bar.innerHTML = TOOLS.filter(([id]) => !CUSTOM[id]?.volume || panel.volume).map(([id, title]) => `<button type="button" data-tool="${id}" title="${title}" aria-label="${title}"><svg viewBox="0 0 16 16">${ICONS[id]}</svg></button>`).join('');
    box.append(canvas, bar);
    const ctx = canvas.getContext('2d');
    let tool = 'cursor', items = [], pending = null, cursor = null, hover = null, selected = null, frame = 0, clearArmed = 0, size = { w: 0, h: 0, dpr: 1 };
    const key = () => 'draw:' + panel.symbol;
    const save = () => { try { localStorage.setItem(key(), JSON.stringify(items)); } catch {} };
    const reload = () => { try { items = JSON.parse(localStorage.getItem(key()) || '[]'); } catch { items = []; } if (!Array.isArray(items)) items = []; pending = null; hover = null; selected = null; redraw(); };

    // ---- time/price <-> screen ----------------------------------------------------------------
    const times = () => panel.candles || [];
    function logicalOf(t) {
      const c = times();
      if (c.length < 2) return null;
      const step = (c[c.length - 1].time - c[0].time) / (c.length - 1);
      if (t <= c[0].time) return (t - c[0].time) / step;
      if (t >= c[c.length - 1].time) return c.length - 1 + (t - c[c.length - 1].time) / step;
      let lo = 0, hi = c.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; c[mid].time <= t ? lo = mid : hi = mid; }
      return lo + (t - c[lo].time) / (c[hi].time - c[lo].time);
    }
    function timeOf(l) {
      const c = times();
      if (c.length < 2) return null;
      const step = (c[c.length - 1].time - c[0].time) / (c.length - 1);
      if (l <= 0) return c[0].time + l * step;
      if (l >= c.length - 1) return c[c.length - 1].time + (l - (c.length - 1)) * step;
      const i = Math.floor(l);
      return c[i].time + (l - i) * (c[i + 1].time - c[i].time);
    }
    const toScreen = pt => {
      const l = logicalOf(pt.t);
      if (l === null) return null;
      const x = panel.chart.timeScale().logicalToCoordinate(l), y = panel.series.priceToCoordinate(pt.p);
      return x === null || y === null ? null : { x, y };
    };
    const toData = (x, y) => {
      const l = panel.chart.timeScale().coordinateToLogical(x), p = panel.series.coordinateToPrice(y);
      const t = l === null ? null : timeOf(l);
      return t === null || p === null ? null : { t, p };
    };

    // ---- drawing ------------------------------------------------------------------------------
    const fmtPrice = p => p >= 1000 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toFixed(5);
    function label(text, x, y, ink, align = 'left') {
      ctx.font = '11px ui-monospace,Menlo,monospace';
      const w = ctx.measureText(text).width + 8;
      const left = align === 'right' ? x - w : x;
      ctx.fillStyle = Theme.css('--bg') || '#050505'; ctx.fillRect(left, y - 8, w, 16);
      ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.strokeRect(left + .5, y - 7.5, w - 1, 15);
      ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.fillText(text, left + 4, y + 1);
    }
    // What registered tool types need to paint and hit-test themselves.
    const toolApi = { toScreen, toData, logicalOf, timeOf, label, fmtPrice, panel, get size() { return size; }, get candles() { return panel.candles || []; }, segDist: (p, a, b) => segDist(p, a, b) };
    function paintShape(d, ink, ghost) {
      if (CUSTOM[d.type]) { ctx.setLineDash([]); CUSTOM[d.type].paint(ctx, d, toolApi, ink, ghost, d === hover || d === selected); ctx.setLineDash([]); return; }
      const pts = d.points.map(toScreen);
      if (pts.some(p => !p)) return;
      const [a, b] = pts, W = size.w, H = size.h;
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = d === hover || d === selected ? 2 : 1; ctx.setLineDash(ghost ? [4, 4] : []);
      if (d.type === 'brush') {
        ctx.setLineDash([]); ctx.lineWidth = d === hover || d === selected ? 3 : 2; ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        // Midpoint curves smooth the stroke without shifting its endpoints.
        for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        const last = pts[pts.length - 1]; ctx.lineTo(last.x, last.y); ctx.stroke();
        ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; return;
      }
      if (d.type === 'text') {
        ctx.setLineDash([]); ctx.font = TEXT_FONT; ctx.textBaseline = 'middle'; ctx.fillText(d.text || '', a.x, a.y);
        if (d === hover || d === selected) { const w = ctx.measureText(d.text || '').width; ctx.strokeRect(a.x - 3.5, a.y - 10.5, w + 7, 21); }
        return;
      }
      const dot = p => { ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); };
      ctx.beginPath();
      if (d.type === 'hline') { ctx.moveTo(0, a.y); ctx.lineTo(W, a.y); ctx.stroke(); ctx.setLineDash([]); label(fmtPrice(d.points[0].p), W - 4, a.y, ink, 'right'); return; }
      if (d.type === 'vline') { ctx.moveTo(a.x, 0); ctx.lineTo(a.x, H); ctx.stroke(); ctx.setLineDash([]); return; }
      if (!b) return;
      if (d.type === 'trend') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); dot(a); dot(b); }
      else if (d.type === 'rect') {
        ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.globalAlpha = .1; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); ctx.setLineDash([]);
      } else if (d.type === 'fib') {
        const [pa, pb] = d.points, x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
        ctx.setLineDash([]);
        for (const level of FIB) {
          const price = pb.p + (pa.p - pb.p) * level, y = panel.series.priceToCoordinate(price);
          if (y === null) continue;
          ctx.globalAlpha = level === 0 || level === 1 ? 1 : .6;
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.globalAlpha = 1;
          label(`${level} · ${fmtPrice(price)}`, x1 + 4, y, ink);
        }
        ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      } else if (d.type === 'measure') {
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); dot(a); dot(b);
        const dp = d.points[1].p - d.points[0].p, pct = dp / d.points[0].p * 100;
        const bars = Math.round((logicalOf(d.points[1].t) ?? 0) - (logicalOf(d.points[0].t) ?? 0));
        label(`${dp >= 0 ? '+' : '−'}${fmtPrice(Math.abs(dp))} (${dp >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%) · ${bars} św.`, Math.min(b.x + 8, W - 190), b.y, ink);
      }
      ctx.setLineDash([]);
    }
    // A selected drawing also gets square handles on its anchor points.
    function paint(d, ink, ghost) {
      paintShape(d, ink, ghost);
      if (ghost || d !== selected) return;
      const pts = (d.type === 'brush' ? [d.points[0], d.points[d.points.length - 1]] : d.points).map(toScreen).filter(Boolean);
      ctx.setLineDash([]); ctx.lineWidth = 1;
      for (const q of pts) { ctx.fillStyle = Theme.css('--bg') || '#050505'; ctx.fillRect(q.x - 4, q.y - 4, 8, 8); ctx.strokeStyle = ink; ctx.strokeRect(q.x - 3.5, q.y - 3.5, 7, 7); }
    }
    function draw() {
      frame = 0;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      const ink = Theme.css('--ink');
      for (const d of items) paint(d, ink, false);
      if (pending) {
        const pts = [...pending.points];
        if (cursor && pts.length < NEEDS[pending.type]) { const p = toData(cursor.x, cursor.y); if (p) pts.push(p); }
        if (pending.type === 'brush' ? pts.length > 1 : pts.length === NEEDS[pending.type]) paint({ ...pending, points: pts }, ink, true);
      }
      ctx.textBaseline = 'alphabetic';
    }
    function redraw() { if (!frame) frame = requestAnimationFrame(draw); }
    const settle = redraw;   // the price scale rescales a moment after the time scale moves

    // ---- hit testing (eraser) -----------------------------------------------------------------
    const segDist = (p, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    function distance(d, p) {
      if (CUSTOM[d.type]) return CUSTOM[d.type].distance(d, p, toolApi);
      const pts = d.points.map(toScreen);
      if (pts.some(q => !q)) return Infinity;
      const [a, b] = pts;
      if (d.type === 'hline') return Math.abs(p.y - a.y);
      if (d.type === 'vline') return Math.abs(p.x - a.x);
      if (d.type === 'trend' || d.type === 'measure') return segDist(p, a, b);
      if (d.type === 'brush') return pts.slice(1).reduce((m, q, i) => Math.min(m, segDist(p, pts[i], q)), Infinity);
      if (d.type === 'text') {
        ctx.font = TEXT_FONT;
        const w = ctx.measureText(d.text || '').width;
        return p.x >= a.x - 4 && p.x <= a.x + w + 4 && Math.abs(p.y - a.y) <= 10 ? 0 : Infinity;
      }
      if (d.type === 'rect') {
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        return Math.min(segDist(p, { x: x0, y: y0 }, { x: x1, y: y0 }), segDist(p, { x: x1, y: y0 }, { x: x1, y: y1 }), segDist(p, { x: x1, y: y1 }, { x: x0, y: y1 }), segDist(p, { x: x0, y: y1 }, { x: x0, y: y0 }));
      }
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      return Math.min(...FIB.map(level => { const y = panel.series.priceToCoordinate(d.points[1].p + (d.points[0].p - d.points[1].p) * level); return y === null ? Infinity : segDist(p, { x: x0, y }, { x: x1, y }); }));
    }
    const nearest = p => items.reduce((best, d) => { const dist = distance(d, p); return dist < 8 && (!best || dist < best.dist) ? { d, dist } : best; }, null)?.d || null;

    // ---- interaction --------------------------------------------------------------------------
    function setTool(next) {
      if (next === 'clear') {
        // Two clicks: browsers/WebViews give no reliable confirm() dialog, so the button asks to be pressed again.
        const button = bar.querySelector('[data-tool="clear"]');
        if (Date.now() < clearArmed) { items = []; selected = null; save(); clearArmed = 0; button.classList.remove('armed'); redraw(); }
        else { clearArmed = Date.now() + 3000; button.classList.add('armed'); setTimeout(() => button.classList.remove('armed'), 3000); }
        return;
      }
      closeEditor(false);
      tool = next; pending = null; hover = null;
      canvas.style.pointerEvents = tool === 'cursor' ? 'none' : 'auto';
      canvas.style.cursor = tool === 'erase' ? 'pointer' : tool === 'text' ? 'text' : 'crosshair';
      bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      redraw();
    }
    function commit(points, extra) {
      if (items.length >= 100) items.shift();
      items.push({ id: Date.now().toString(36) + items.length, type: tool, points, ...extra });
      selected = items[items.length - 1]; owner = self;   // the new drawing is selected, so Backspace removes it right away
      save(); pending = null;
      // The brush stays selected so several strokes can be drawn in a row.
      if (tool === 'brush') redraw(); else setTool('cursor');
    }

    // Text is typed into a small input placed where the chart was clicked; Enter saves, Escape cancels.
    let editor = null;
    function closeEditor(keep) {
      if (!editor) return;
      const { input, point } = editor, text = input.value.trim().slice(0, 200);
      editor = null; input.remove();
      if (keep && text) commit([point], { text });
    }
    function openEditor(pos, point) {
      const input = document.createElement('input');
      input.className = 'draw-text'; input.maxLength = 200; input.placeholder = 'tekst…';
      input.style.left = pos.x + 'px'; input.style.top = pos.y + 'px';
      editor = { input, point };
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') closeEditor(true);
        else if (e.key === 'Escape') { closeEditor(false); setTool('cursor'); }
      });
      input.addEventListener('blur', () => closeEditor(true));
      input.addEventListener('pointerdown', e => e.stopPropagation());
      box.append(input);
      setTimeout(() => input.focus(), 0);
    }
    const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    let downAt = null, stroke = null;
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      canvas.setPointerCapture(e.pointerId);
      const pos = local(e);
      if (tool === 'erase') { const d = nearest(pos); if (d) { items = items.filter(i => i !== d); if (selected === d) selected = null; hover = null; save(); redraw(); } return; }
      const p = toData(pos.x, pos.y);
      if (!p) return;
      if (tool === 'text') { closeEditor(true); if (tool === 'text') openEditor(pos, p); return; }
      if (tool === 'brush') { canvas.setPointerCapture(e.pointerId); pending = { type: 'brush', points: [p] }; stroke = pos; return; }
      downAt = { ...pos, had: !!pending };
      if (!pending) pending = { type: tool, points: [p] };
      else pending.points.push(p);
      if (pending.points.length === NEEDS[tool]) commit(pending.points);
      else redraw();
    });
    canvas.addEventListener('pointermove', e => {
      cursor = local(e);
      if (tool === 'erase') { const next = nearest(cursor); if (next !== hover) { hover = next; redraw(); } return; }
      if (tool === 'brush') {
        if (!stroke || !pending) return;
        const rect = canvas.getBoundingClientRect();
        const samples = e.getCoalescedEvents?.();
        for (const sample of samples?.length ? samples : [e]) {
          const pos = { x: sample.clientX - rect.left, y: sample.clientY - rect.top };
          if (Math.hypot(pos.x - stroke.x, pos.y - stroke.y) < 1) continue;
          const p = toData(pos.x, pos.y);
          if (p && pending.points.length < 8000) { pending.points.push(p); stroke = pos; }
        }
        redraw();
        return;
      }
      if (pending) redraw();
    });
    canvas.addEventListener('pointerup', e => {
      if (tool === 'brush') { const pos = local(e), last = toData(pos.x, pos.y); if (pending && last && pending.points.length < 8000) pending.points.push(last); if (pending && pending.points.length > 1) commit(pending.points); else pending = null; stroke = null; redraw(); return; }
      // Click-drag also works: releasing far from the press point places the second point.
      if (!downAt || !pending || downAt.had || pending.points.length !== 1 || NEEDS[tool] !== 2) { downAt = null; return; }
      const pos = local(e);
      if (Math.hypot(pos.x - downAt.x, pos.y - downAt.y) > 8) { const p = toData(pos.x, pos.y); if (p) { pending.points.push(p); commit(pending.points); } }
      downAt = null;
    });
    canvas.addEventListener('pointercancel', () => { pending = null; stroke = null; downAt = null; redraw(); });
    canvas.addEventListener('pointerleave', () => { cursor = null; if (pending) redraw(); });
    bar.addEventListener('click', e => { const t = e.target.closest('[data-tool]')?.dataset.tool; if (t) setTool(t === tool && t !== 'cursor' ? 'cursor' : t); });
    bar.addEventListener('pointerdown', e => e.stopPropagation());
    box.addEventListener('keydown', e => { if (e.key === 'Escape') setTool('cursor'); });

    // Selecting: in cursor mode the chart receives the pointer (panning), so a click that did not move is a selection.
    const select = d => {
      if (d === selected) return;
      if (d && owner && owner !== self) owner.deselect();
      selected = d; if (d) owner = self;
      redraw();
    };
    let press = null;
    box.addEventListener('pointerdown', e => {
      press = tool === 'cursor' && e.button === 0 && !e.target.closest('.draw-bar, .draw-text') ? { x: e.clientX, y: e.clientY } : null;
    });
    box.addEventListener('pointerup', e => {
      if (!press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4;
      press = null;
      if (moved) return;
      const r = canvas.getBoundingClientRect();
      select(nearest({ x: e.clientX - r.left, y: e.clientY - r.top }));
    });
    function removeSelected() {
      if (!selected) return false;
      items = items.filter(i => i !== selected); selected = null; hover = null; save(); redraw();
      return true;
    }
    document.addEventListener('keydown', e => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!box.offsetParent) return;   // this panel is not on screen
      if (pending) { pending = null; e.preventDefault(); redraw(); return; }   // Backspace cancels a drawing in progress
      if (owner === self && removeSelected()) e.preventDefault();
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (pending || tool !== 'cursor') setTool('cursor'); else if (selected) select(null);
    });

    // ---- redraw hooks -------------------------------------------------------------------------
    // Follow every chart render (including price-axis scaling), without per-event timers.
    panel.series.attachPrimitive({ updateAllViews: redraw });
    panel.chart.timeScale().subscribeVisibleLogicalRangeChange(settle);
    panel.chart.subscribeCrosshairMove(() => redraw());
    for (const type of ['wheel', 'pointermove', 'pointerup']) box.addEventListener(type, () => { if (items.length || pending) settle(); }, { passive: true });
    new ResizeObserver(() => {
      const r = box.getBoundingClientRect();
      size = { w: r.width, h: r.height, dpr: window.devicePixelRatio || 1 };
      canvas.width = size.w * size.dpr; canvas.height = size.h * size.dpr;
      canvas.style.width = size.w + 'px'; canvas.style.height = size.h + 'px';
      settle();
    }).observe(box);
    window.addEventListener('themechange', redraw);
    setTool('cursor');
    reload();
    Object.assign(self, { redraw: settle, reload, setTool, deselect() { selected = null; redraw(); } });
    return self;
  }
  return { attach, register };
})();
