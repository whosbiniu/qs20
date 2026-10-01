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
  const font = d => `${d.size || 13}px ui-monospace,Menlo,monospace`;
  // Editing toolbar of the selected drawing: colour, width (text: size), line style, lock, delete.
  const SWATCHES = ['', '#6b9eff', '#7fcf8f', '#e07a7a', '#e8c268', '#b797d6'];
  const DASH = { solid: [], dashed: [7, 4], dotted: [2, 3] };
  const STYLES = ['solid', 'dashed', 'dotted'];
  const EDIT_ICONS = {
    width: '<path d="M2 8h12M4.500 5.500 2 8l2.500 2.500M11.500 5.500 14 8l-2.500 2.500"/>',
    size: '<path d="M2 13 5.500 3h1L10 13M3.300 9.500h5.400M11 13l1.800-5h.4L15 13M11.700 11.200h2.600"/>',
    solid: '<path d="M1.500 8h13"/>', dashed: '<path d="M1.500 8h3.500M6.300 8h3.500M11 8h3.500"/>', dotted: '<path d="M2 8h.5M5 8h.5M8 8h.5M11 8h.5M14 8h.5" stroke-width="2" stroke-linecap="round"/>',
    edit: '<path d="M10.500 2.500l3 3L6 13H3v-3z"/>',
    lock: '<rect x="3.500" y="7" width="9" height="6.500" rx="1"/><path d="M5.500 7V5a2.500 2.500 0 0 1 5 0v2"/>',
    unlock: '<rect x="3.500" y="7" width="9" height="6.500" rx="1"/><path d="M5.500 7V5a2.500 2.500 0 0 1 5 0"/>',
    trash: '<path d="M3 4h10M6 4V2.500h4V4M4.500 4l.5 9.500h6l.5-9.500M7 6.500v5M9 6.500v5"/>',
  };
  const editIcon = name => `<svg viewBox="0 0 16 16" aria-hidden="true">${EDIT_ICONS[name]}</svg>`;
  if (typeof document !== 'undefined' && document.head) {
    const style = document.createElement('style');
    style.textContent = `.draw-edit{position:absolute;z-index:8;display:flex;align-items:center;gap:5px;padding:4px 5px;background:var(--tw-chrome,var(--bg));border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 28px #0008;font:11px -apple-system,BlinkMacSystemFont,sans-serif;color:var(--ink);white-space:nowrap;user-select:none}
.draw-edit[hidden]{display:none}.draw-edit svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.draw-edit .de-grip{cursor:grab;color:var(--dim);padding:0 1px;letter-spacing:-2px;font-size:12px;line-height:1}.draw-edit .de-grip:active{cursor:grabbing}
.draw-edit .de-group{display:flex;align-items:center;gap:4px;padding:2px 5px;border:1px solid var(--line);border-radius:6px}.draw-edit .de-sep{width:1px;align-self:stretch;background:var(--line)}
.draw-edit button{display:grid;place-items:center;width:24px;height:24px;padding:0;background:transparent;border:1px solid transparent;border-radius:5px;color:var(--dim);cursor:pointer}
.draw-edit button:hover{color:var(--ink);background:var(--faint)}.draw-edit button[aria-pressed=true]{color:var(--ink)}
.draw-edit button.de-swatch,.draw-edit button.de-swatch:hover,.draw-edit button.de-swatch[aria-pressed=true]{width:20px;height:20px;border-radius:5px;background:var(--c);border:2px solid transparent;box-shadow:inset 0 0 0 1px #0004}.draw-edit button.de-swatch:hover{border-color:var(--dim)}.draw-edit button.de-swatch[aria-pressed=true]{border-color:var(--ink);box-shadow:inset 0 0 0 2px var(--bg)}
.draw-edit .de-custom{position:relative;display:grid;place-items:center;width:20px;height:20px;border:1px dashed var(--dim);border-radius:5px;color:var(--dim);cursor:pointer;font-size:13px;line-height:1}.draw-edit .de-custom:hover{color:var(--ink);border-color:var(--ink)}
.draw-edit .de-custom input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;padding:0;border:0}
.draw-edit .de-width{color:var(--dim);height:30px}.draw-edit .de-width input.de-num{width:26px;height:22px;margin:0;padding:0 2px;font:inherit;font-size:12px;color:var(--ink);background:transparent;border:0;border-radius:3px;outline:0;text-align:center;-moz-appearance:textfield;appearance:textfield}
.draw-edit .de-width input.de-num:focus{background:var(--faint)}.draw-edit .de-width input.de-num::-webkit-inner-spin-button,.draw-edit .de-width input.de-num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.draw-edit .de-width [data-width-icon]{display:flex}.draw-edit [data-delete]:hover{color:#e07a7a}`;
    style.textContent += `
.draw-bar button{position:relative}.draw-bar .db-star{position:absolute;top:-1px;right:0;font-size:9px;line-height:1;color:var(--dim);opacity:0;pointer-events:auto;cursor:pointer;padding:1px}
.draw-bar button:hover .db-star,.draw-bar button:focus-visible .db-star{opacity:.75}.draw-bar .db-star:hover{opacity:1!important;color:var(--ink)}.draw-bar .db-star.on{opacity:1;color:#e8c268}
.draw-favs{position:absolute;z-index:30;display:flex;align-items:center;gap:2px;padding:3px 4px;background:var(--tw-chrome,var(--bg));border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 28px #0008;user-select:none}
.draw-favs[hidden]{display:none}.draw-favs.vertical{flex-direction:column}.draw-favs .df-tools{display:flex;gap:2px}.draw-favs.vertical .df-tools{flex-direction:column}
.draw-favs .df-grip{cursor:grab;color:var(--dim);font-size:12px;letter-spacing:-2px;padding:2px 3px;line-height:1}.draw-favs.vertical .df-grip{letter-spacing:0;writing-mode:vertical-rl}.draw-favs .df-grip:active{cursor:grabbing}
.draw-favs button{display:grid;place-items:center;width:28px;height:28px;padding:0;background:transparent;border:1px solid transparent;border-radius:5px;color:var(--dim);cursor:pointer}
.draw-favs button:hover{color:var(--ink);background:var(--faint)}.draw-favs button.active{color:var(--tw-accent,var(--ink));background:var(--faint)}
.draw-favs svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}.draw-favs .df-turn svg{width:13px;height:13px}`;
    document.head.append(style);
  }

  // Only one drawing can be selected across all chart panels: the panel that owns the selection.
  let owner = null;

  // ---- favourite tools ------------------------------------------------------------------------------------------
  // On panels that name a host (panel.favoritesHost(), the terminal), every tool has a star (or right-click the tool).
  // Starred tools get a floating bar in that host, dragged by its grip anywhere and turned vertical / horizontal;
  // its buttons act on the chart used last. Favourites and the bar's place are remembered.
  const FAV_KEY = 'draw-favorites', FAV_BAR_KEY = 'draw-favorites-bar';
  const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
  const writeJson = (key, value) => (window.Store?.set || ((k, v) => localStorage.setItem(k, v)))(key, JSON.stringify(value));
  let favorites = (readJson(FAV_KEY, []) || []).filter(id => typeof id === 'string').slice(0, 30);
  const instances = new Set(), favBars = new Map();   // attached panels; host element → floating bar
  let lastUsed = null;
  const titleOf = id => TOOLS.find(t => t[0] === id)?.[1] || id;
  const shortTitle = id => titleOf(id).split(':')[0];
  function toggleFavorite(id) {
    favorites = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
    writeJson(FAV_KEY, favorites);
    instances.forEach(i => i.syncStars());
    renderFavorites();
  }
  const visibleIn = (host, inst) => inst.host() === host && inst.box.offsetParent;
  function targetFor(host) {
    if (lastUsed && visibleIn(host, lastUsed)) return lastUsed;
    return [...instances].find(i => visibleIn(host, i)) || null;
  }
  function renderFavorites() {
    const hosts = new Set([...instances].map(i => i.host()).filter(Boolean));
    for (const [host, fav] of favBars) if (!hosts.has(host)) { fav.el.remove(); favBars.delete(host); }
    for (const host of hosts) {
      let fav = favBars.get(host);
      if (!fav) fav = createFavBar(host);
      const list = favorites.filter(id => TOOLS.some(t => t[0] === id));
      fav.el.hidden = !list.length;
      fav.el.querySelector('.df-tools').innerHTML = list.map(id => `<button type="button" data-fav-tool="${id}" title="${shortTitle(id)} (ulubione)" aria-label="${shortTitle(id)}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[id]}</svg></button>`).join('');
      fav.place(); markFavorites();
    }
  }
  function markFavorites() {
    for (const [host, fav] of favBars) {
      const t = targetFor(host);
      fav.el.querySelectorAll('[data-fav-tool]').forEach(b => b.classList.toggle('active', !!t && t.tool() === b.dataset.favTool));
    }
  }
  function createFavBar(host) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const el = document.createElement('div');
    el.className = 'draw-favs'; el.setAttribute('role', 'toolbar'); el.setAttribute('aria-label', 'Ulubione narzędzia');
    el.innerHTML = `<span class="df-grip" title="Przeciągnij, aby przesunąć pasek ulubionych" aria-hidden="true">⋮⋮</span><div class="df-tools"></div>
      <button type="button" class="df-turn" title="Obróć pasek (poziomo / pionowo)" aria-label="Obróć pasek ulubionych"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3M12 2v3H9M4 14v-3h3"/></svg></button>`;
    host.append(el);
    let pos = readJson(FAV_BAR_KEY, null);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) pos = { x: null, y: 150, vertical: false };   // first time: centred over the chart
    const place = () => {
      el.classList.toggle('vertical', !!pos.vertical);
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h || el.hidden) return;
      if (!Number.isFinite(pos.x)) pos.x = Math.round((w - el.offsetWidth) / 2);
      el.style.left = Math.max(0, Math.min(pos.x, w - el.offsetWidth)) + 'px';
      el.style.top = Math.max(0, Math.min(pos.y, h - el.offsetHeight)) + 'px';
    };
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('df-turn')) { pos.vertical = !pos.vertical; writeJson(FAV_BAR_KEY, pos); place(); return; }
      const id = b.dataset.favTool, t = targetFor(host);
      if (!id || !t) return;
      t.setTool(id === t.tool() && id !== 'cursor' ? 'cursor' : id);
      lastUsed = t; markFavorites();
    });
    el.addEventListener('contextmenu', e => { const id = e.target.closest('[data-fav-tool]')?.dataset.favTool; if (id) { e.preventDefault(); toggleFavorite(id); } });
    const grip = el.querySelector('.df-grip');
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); grip.setPointerCapture(e.pointerId);
      const r = host.getBoundingClientRect(), dx = e.clientX - el.offsetLeft - r.left, dy = e.clientY - el.offsetTop - r.top;
      const move = ev => { const rr = host.getBoundingClientRect(); pos.x = ev.clientX - rr.left - dx; pos.y = ev.clientY - rr.top - dy; place(); };
      const up = () => { pos.x = el.offsetLeft; pos.y = el.offsetTop; writeJson(FAV_BAR_KEY, pos); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    new ResizeObserver(place).observe(host);
    const fav = { el, place };
    favBars.set(host, fav);
    return fav;
  }

  function attach(panel) {
    const self = {};
    const box = panel.el;
    const canvas = document.createElement('canvas');
    canvas.className = 'draw-layer';
    const bar = document.createElement('div');
    bar.className = 'draw-bar';
    bar.innerHTML = TOOLS.filter(([id]) => !CUSTOM[id]?.volume || panel.volume).map(([id, title]) => `<button type="button" data-tool="${id}" title="${title}" aria-label="${title}"><svg viewBox="0 0 16 16">${ICONS[id]}</svg></button>`).join('');
    const editBar = document.createElement('div');
    editBar.className = 'draw-edit'; editBar.hidden = true;
    editBar.setAttribute('role', 'toolbar'); editBar.setAttribute('aria-label', 'Edycja rysunku');
    editBar.innerHTML = `<span class="de-grip" title="Przeciągnij, aby przesunąć pasek" aria-hidden="true">⋮⋮</span>
      <div class="de-group" role="group" aria-label="Kolor">${SWATCHES.map(c => `<button type="button" class="de-swatch" data-color="${c}" style="--c:${c || 'var(--ink)'}" title="${c ? 'Kolor ' + c : 'Kolor domyślny'}" aria-label="${c ? 'Kolor ' + c : 'Kolor domyślny'}"></button>`).join('')}<label class="de-custom" title="Własny kolor">+<input type="color" data-custom aria-label="Własny kolor"></label></div>
      <div class="de-group de-width"><span data-width-icon></span><input type="number" class="de-num" data-width min="1" max="8" step="1" aria-label="Grubość linii" title="Strzałki ↑ ↓ lub wpisz liczbę"></div>
      <button type="button" data-style title="Styl linii" aria-label="Styl linii"></button>
      <span class="de-sep"></span>
      <button type="button" data-edit-text title="Edytuj tekst" aria-label="Edytuj tekst">${editIcon('edit')}</button>
      <button type="button" data-lock aria-pressed="false"></button>
      <button type="button" data-delete title="Usuń (Backspace)" aria-label="Usuń rysunek">${editIcon('trash')}</button>`;
    box.append(canvas, bar, editBar);
    const ctx = canvas.getContext('2d');
    let tool = 'cursor', items = [], pending = null, cursor = null, hover = null, selected = null, frame = 0, clearArmed = 0, size = { w: 0, h: 0, dpr: 1 };
    const key = () => 'draw:' + panel.symbol;
    const save = () => { if (!Store.set(key(), JSON.stringify(items))) console.warn('Rysunki nie zmieściły się w pamięci przeglądarki.'); };
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
      ink = d.color || ink;
      if (CUSTOM[d.type]) { ctx.setLineDash([]); CUSTOM[d.type].paint(ctx, d, toolApi, ink, ghost, d === hover || d === selected); ctx.setLineDash([]); return; }
      const pts = d.points.map(toScreen);
      if (pts.some(p => !p)) return;
      const [a, b] = pts, W = size.w, H = size.h, lit = d === hover || d === selected ? 1 : 0, dash = ghost ? [4, 4] : DASH[d.style] || [];
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = (d.width || 1) + lit; ctx.setLineDash(dash);
      if (d.type === 'brush') {
        ctx.lineWidth = (d.width || 2) + lit; ctx.lineJoin = ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        // Midpoint curves smooth the stroke without shifting its endpoints.
        for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        const last = pts[pts.length - 1]; ctx.lineTo(last.x, last.y); ctx.stroke();
        ctx.lineJoin = 'miter'; ctx.lineCap = 'butt'; return;
      }
      if (d.type === 'text') {
        const h = (d.size || 13) + 8;
        ctx.setLineDash([]); ctx.font = font(d); ctx.textBaseline = 'middle'; ctx.fillText(d.text || '', a.x, a.y);
        if (d === hover || d === selected) { const w = ctx.measureText(d.text || '').width; ctx.lineWidth = 1; ctx.strokeRect(a.x - 3.5, a.y - h / 2 - .5, w + 7, h + 1); }
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
        for (const level of FIB) {
          const price = pb.p + (pa.p - pb.p) * level, y = panel.series.priceToCoordinate(price);
          if (y === null) continue;
          ctx.globalAlpha = level === 0 || level === 1 ? 1 : .6;
          ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.setLineDash([]); label(`${level} · ${fmtPrice(price)}`, x1 + 4, y, ink);
        }
        ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
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
      ink = d.color || ink;
      const pts = handlesOf(d).map(toScreen).filter(Boolean);
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
      placeEditor();
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
        ctx.font = font(d);
        const w = ctx.measureText(d.text || '').width;
        return p.x >= a.x - 4 && p.x <= a.x + w + 4 && Math.abs(p.y - a.y) <= (d.size || 13) / 2 + 4 ? 0 : Infinity;
      }
      if (d.type === 'rect') {
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        return Math.min(segDist(p, { x: x0, y: y0 }, { x: x1, y: y0 }), segDist(p, { x: x1, y: y0 }, { x: x1, y: y1 }), segDist(p, { x: x1, y: y1 }, { x: x0, y: y1 }), segDist(p, { x: x0, y: y1 }, { x: x0, y: y0 }));
      }
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      return Math.min(...FIB.map(level => { const y = panel.series.priceToCoordinate(d.points[1].p + (d.points[0].p - d.points[1].p) * level); return y === null ? Infinity : segDist(p, { x: x0, y }, { x: x1, y }); }));
    }
    const nearest = p => items.reduce((best, d) => { const dist = distance(d, p); return dist < 8 && (!best || dist < best.dist) ? { d, dist } : best; }, null)?.d || null;
    // Anchor points that can be dragged one by one (a brush stroke and a text only move as a whole).
    const handlesOf = d => d.type === 'brush' ? [d.points[0], d.points[d.points.length - 1]] : d.points;
    const handleAt = (d, p) => d.type === 'brush' || d.type === 'text' ? -1 : d.points.findIndex(q => { const s = toScreen(q); return s && Math.hypot(s.x - p.x, s.y - p.y) <= 7; });

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
      canvas.style.pointerEvents = tool === 'cursor' ? 'none' : 'auto'; grabbing = false;
      canvas.style.cursor = tool === 'erase' ? 'pointer' : tool === 'text' ? 'text' : 'crosshair';
      bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      lastUsed = self; markFavorites();
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
      const { input, point, item } = editor, text = input.value.trim().slice(0, 200);
      editor = null; input.remove();
      if (item) { if (keep && text && text !== item.text) { item.text = text; save(); } redraw(); return; }
      if (keep && text) commit([point], { text });
    }
    function openEditor(pos, point, item) {
      const input = document.createElement('input');
      input.className = 'draw-text'; input.maxLength = 200; input.placeholder = 'tekst…';
      if (item) { input.value = item.text || ''; input.style.font = font(item); }
      input.style.left = pos.x + 'px'; input.style.top = pos.y + 'px';
      editor = { input, point, item };
      input.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') closeEditor(true);
        else if (e.key === 'Escape') { closeEditor(false); if (!item) setTool('cursor'); }
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
      if (tool === 'cursor') { startDrag(pos, e); return; }
      if (tool === 'erase') { const d = nearest(pos); if (d && !d.locked) { items = items.filter(i => i !== d); if (selected === d) selected = null; hover = null; save(); redraw(); } return; }
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
      if (drag) { moveDrag(local(e)); return; }
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
      if (drag) { endDrag(); return; }
      if (tool === 'brush') { const pos = local(e), last = toData(pos.x, pos.y); if (pending && last && pending.points.length < 8000) pending.points.push(last); if (pending && pending.points.length > 1) commit(pending.points); else pending = null; stroke = null; redraw(); return; }
      // Click-drag also works: releasing far from the press point places the second point.
      if (!downAt || !pending || downAt.had || pending.points.length !== 1 || NEEDS[tool] !== 2) { downAt = null; return; }
      const pos = local(e);
      if (Math.hypot(pos.x - downAt.x, pos.y - downAt.y) > 8) { const p = toData(pos.x, pos.y); if (p) { pending.points.push(p); commit(pending.points); } }
      downAt = null;
    });
    canvas.addEventListener('pointercancel', () => { if (drag) endDrag(); pending = null; stroke = null; downAt = null; redraw(); });
    canvas.addEventListener('pointerleave', () => { cursor = null; if (pending) redraw(); });
    bar.addEventListener('click', e => {
      const star = e.target.closest('[data-star]')?.dataset.star;
      if (star) { e.stopPropagation(); toggleFavorite(star); return; }
      const t = e.target.closest('[data-tool]')?.dataset.tool; if (t) setTool(t === tool && t !== 'cursor' ? 'cursor' : t);
    });
    // Right-click a tool: add it to / remove it from the favourites.
    bar.addEventListener('contextmenu', e => { const t = e.target.closest('[data-tool]')?.dataset.tool; if (t && host()) { e.preventDefault(); toggleFavorite(t); } });
    bar.addEventListener('pointerdown', e => e.stopPropagation());
    box.addEventListener('keydown', e => { if (e.key === 'Escape') setTool('cursor'); });

    // Selecting: in cursor mode the chart receives the pointer (panning), so a click that did not move is a selection.
    const select = d => {
      if (d === selected) return;
      manual = null;
      if (d && owner && owner !== self) owner.deselect();
      selected = d; if (d) owner = self;
      redraw();
    };
    let press = null;
    box.addEventListener('pointerdown', e => {
      press = tool === 'cursor' && e.button === 0 && !e.target.closest('.draw-bar, .draw-text, .draw-edit') ? { x: e.clientX, y: e.clientY } : null;
    });
    box.addEventListener('pointerup', e => {
      if (!press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4;
      press = null;
      if (moved) return;
      const r = canvas.getBoundingClientRect();
      select(nearest({ x: e.clientX - r.left, y: e.clientY - r.top }));
    });
    // ---- moving and reshaping: in cursor mode a drawing under the pointer takes the pointer ----------
    // The canvas only catches the pointer over a drawing, so the chart still pans everywhere else.
    let drag = null, grabbing = false;
    function hoverAt(pos) {
      const handle = selected && !selected.locked ? handleAt(selected, pos) : -1;
      const d = handle >= 0 ? selected : nearest(pos);
      const grab = !!d && (!d.locked || d !== selected);
      if (grab !== grabbing) { grabbing = grab; canvas.style.pointerEvents = grab ? 'auto' : 'none'; }
      canvas.style.cursor = !d ? '' : d.locked ? 'pointer' : handle >= 0 ? 'crosshair' : 'move';
      if (d !== hover) { hover = d; redraw(); }
    }
    box.addEventListener('pointermove', e => {
      if (tool !== 'cursor' || drag || e.target.closest('.draw-bar, .draw-edit, .draw-text')) return;
      const r = canvas.getBoundingClientRect();
      hoverAt({ x: e.clientX - r.left, y: e.clientY - r.top });
    });
    box.addEventListener('pointerleave', () => { if (tool === 'cursor' && !drag) { if (grabbing) { grabbing = false; canvas.style.pointerEvents = 'none'; } if (hover) { hover = null; redraw(); } } });
    function startDrag(pos, e) {
      const handle = selected && !selected.locked ? handleAt(selected, pos) : -1;
      const d = handle >= 0 ? selected : nearest(pos);
      if (!d) { grabbing = false; canvas.style.pointerEvents = 'none'; return; }
      select(d);
      if (d.locked) return;
      const l = panel.chart.timeScale().coordinateToLogical(pos.x), p = panel.series.coordinateToPrice(pos.y);
      if (l === null || p === null) return;
      drag = { d, handle, l, p, orig: d.points.map(q => ({ ...q })), moved: false };
    }
    function moveDrag(pos) {
      const { d, handle, orig } = drag;
      if (handle >= 0) { const q = toData(pos.x, pos.y); if (q) d.points[handle] = q; }
      else {
        const l = panel.chart.timeScale().coordinateToLogical(pos.x), p = panel.series.coordinateToPrice(pos.y);
        if (l === null || p === null) return;
        // Shift in bar (logical) space, so a move keeps its size across weekend gaps in the candles.
        d.points = orig.map(q => { const ql = logicalOf(q.t); return { t: ql === null ? q.t : timeOf(ql + l - drag.l), p: q.p + p - drag.p }; });
      }
      drag.moved = true; redraw();
    }
    function endDrag() { if (drag?.moved) save(); drag = null; redraw(); }

    // ---- editing toolbar -----------------------------------------------------------------------
    let shownFor = null, manual = null;
    const $e = sel => editBar.querySelector(sel);
    function syncEditor() {
      shownFor = selected;
      editBar.hidden = !selected;
      if (!selected) { manual = null; return; }
      const d = selected, custom = !!CUSTOM[d.type], text = d.type === 'text';
      editBar.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String((d.color || '') === b.dataset.color)));
      $e('[data-custom]').value = /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#6b9eff';
      $e('.de-width').hidden = custom;
      $e('[data-width-icon]').innerHTML = editIcon(text ? 'size' : 'width');
      const width = $e('[data-width]');
      width.min = text ? 9 : 1; width.max = text ? 40 : 8;
      width.value = text ? d.size || 13 : d.width || (d.type === 'brush' ? 2 : 1);
      width.setAttribute('aria-label', text ? 'Rozmiar tekstu' : 'Grubość linii');
      width.parentElement.title = text ? 'Rozmiar tekstu' : 'Grubość linii';
      $e('[data-style]').hidden = custom || text;
      $e('[data-style]').innerHTML = editIcon(d.style || 'solid');
      $e('[data-edit-text]').hidden = !text;
      const lock = $e('[data-lock]');
      lock.innerHTML = editIcon(d.locked ? 'lock' : 'unlock'); lock.setAttribute('aria-pressed', String(!!d.locked));
      lock.title = d.locked ? 'Odblokuj (można przesuwać)' : 'Zablokuj (bez przesuwania i gumki)'; lock.setAttribute('aria-label', lock.title);
      editBar.dataset.width = '';   // re-measure on the next placement
    }
    function placeEditor() {
      if (selected !== shownFor) syncEditor();
      if (!selected || editBar.hidden) return;
      if (!editBar.dataset.width) { if (!editBar.offsetWidth) return; editBar.dataset.width = editBar.offsetWidth + 'x' + editBar.offsetHeight; }
      const [w, h] = editBar.dataset.width.split('x').map(Number);
      let x, y;
      if (manual) ({ x, y } = manual);
      else {
        // Above the drawing, or below it when there is no room.
        const pts = selected.points.map(toScreen).filter(Boolean);
        if (!pts.length) return;
        const xs = pts.map(q => q.x), ys = pts.map(q => q.y), top = selected.type === 'hline' ? ys[0] : Math.min(...ys), bottom = selected.type === 'vline' ? size.h / 2 : Math.max(...ys);
        x = selected.type === 'hline' ? size.w / 2 - w / 2 : (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2;
        y = selected.type === 'vline' ? 12 : top - h - 14;
        if (y < 6) y = Math.min(bottom + 14, size.h - h - 6);
      }
      x = Math.max(6, Math.min(x, size.w - w - 6)); y = Math.max(6, Math.min(y, size.h - h - 6));
      editBar.style.left = x + 'px'; editBar.style.top = y + 'px';
    }
    function change(fn) { if (!selected) return; fn(selected); save(); syncEditor(); redraw(); }
    editBar.addEventListener('pointerdown', e => e.stopPropagation());
    editBar.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.color !== undefined) change(d => { if (b.dataset.color) d.color = b.dataset.color; else delete d.color; });
      else if (b.hasAttribute('data-style')) change(d => { d.style = STYLES[(STYLES.indexOf(d.style || 'solid') + 1) % STYLES.length]; if (d.style === 'solid') delete d.style; });
      else if (b.hasAttribute('data-lock')) change(d => { d.locked = !d.locked; if (!d.locked) delete d.locked; });
      else if (b.hasAttribute('data-delete')) removeSelected();
      else if (b.hasAttribute('data-edit-text')) { const d = selected, at = toScreen(d.points[0]); if (at) openEditor(at, d.points[0], d); }
    });
    $e('[data-custom]').addEventListener('input', e => change(d => { d.color = e.target.value; }));
    $e('[data-width]').addEventListener('change', e => {
      const input = e.target, value = Math.round(Number(input.value));
      if (!Number.isFinite(value)) { syncEditor(); return; }
      change(d => { const v = Math.max(Number(input.min), Math.min(Number(input.max), value)); if (d.type === 'text') d.size = v; else d.width = v; });
    });
    $e('[data-width]').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') e.target.blur();
      // Arrow keys apply at once (the value changes natively, "change" would wait for blur).
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') setTimeout(() => e.target.dispatchEvent(new Event('change')), 0);
    });
    $e('.de-width').addEventListener('wheel', e => {
      e.preventDefault(); e.stopPropagation();
      const input = $e('[data-width]');
      input.value = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + (e.deltaY < 0 ? 1 : -1)));
      input.dispatchEvent(new Event('change'));
    }, { passive: false });
    // The grip moves the toolbar itself (until another drawing is selected).
    $e('.de-grip').addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const grip = e.currentTarget, start = { x: e.clientX - editBar.offsetLeft, y: e.clientY - editBar.offsetTop };
      grip.setPointerCapture(e.pointerId);
      const move = ev => { manual = { x: ev.clientX - start.x, y: ev.clientY - start.y }; placeEditor(); };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
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
    // Sizes come from the observer entry (no forced layout). A hidden panel (0×0) keeps its bitmap, and an
    // unchanged size only repaints, so switching pages does not reallocate every drawing canvas.
    new ResizeObserver(entries => {
      const b = entries[0].borderBoxSize?.[0], w = b ? b.inlineSize : entries[0].contentRect.width, h = b ? b.blockSize : entries[0].contentRect.height;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      if (w !== size.w || h !== size.h || dpr !== size.dpr) {
        size = { w, h, dpr };
        canvas.width = w * dpr; canvas.height = h * dpr;
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      }
      settle();
    }).observe(box);
    window.addEventListener('themechange', redraw);
    // Favourites (terminal only): a star on each tool, and this panel joins its host's favourites bar.
    const host = () => panel.favoritesHost?.() || null;
    function syncStars() {
      if (!host()) return;
      bar.querySelectorAll('[data-tool]').forEach(b => {
        let star = b.querySelector('.db-star');
        if (!star) { star = document.createElement('span'); star.className = 'db-star'; star.dataset.star = b.dataset.tool; star.setAttribute('aria-hidden', 'true'); b.append(star); }
        const on = favorites.includes(b.dataset.tool);
        star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on);
        star.title = on ? 'Usuń z ulubionych' : 'Dodaj do ulubionych (pasek na wykresie)';
        b.title = titleOf(b.dataset.tool) + (on ? ' · w ulubionych' : '') + ' · prawy klik: ulubione';
      });
    }
    box.addEventListener('pointerdown', () => { if (lastUsed !== self) { lastUsed = self; markFavorites(); } }, true);
    Object.assign(self, { redraw: settle, reload, setTool, deselect() { selected = null; redraw(); }, tool: () => tool, host, box, syncStars });
    setTool('cursor');
    reload();
    if (host()) { instances.add(self); syncStars(); requestAnimationFrame(renderFavorites); }
    return self;
  }
  return { attach, register, favorites: () => favorites.slice(), toggleFavorite };
})();
