// BBB / UNC workspaces. Layout state is separate from market data and indicator settings.
(function (root) {
  'use strict';
  const KEY = 'terminal-workspaces-v1';
  const FRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
  const defaults = name => ({ count: name === 'UNC' ? 4 : 1, markets: name === 'UNC', book: name === 'UNC', split: 58, row: 56, sync: true,
    panels: [{ interval: '4h', mode: 'volume' }, { interval: '30m', mode: 'tpo' }, { interval: '5m', mode: 'vwap' }].map(p => ({ ...p, coin: '', linked: true })) });
  const COIN = /^[A-Za-z0-9:_.-]{1,40}$/;
  const clamp = (n, low, high, fallback) => Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;
  function normalize(value) {
    const state = { version: 1, active: value?.active === 'UNC' ? 'UNC' : 'BBB', layouts: {} };
    for (const name of ['BBB', 'UNC']) {
      const d = defaults(name), saved = value?.version === 1 ? value.layouts?.[name] : null;
      state.layouts[name] = { count: [1, 2, 4].includes(saved?.count) ? saved.count : d.count,
        markets: typeof saved?.markets === 'boolean' ? saved.markets : d.markets,
        book: typeof saved?.book === 'boolean' ? saved.book : d.book,
        split: clamp(saved?.split, 25, 75, d.split), row: clamp(saved?.row, 25, 75, d.row),
        sync: typeof saved?.sync === 'boolean' ? saved.sync : d.sync,
        panels: d.panels.map((panel, i) => {
          const p = saved?.panels?.[i];
          const known = f => root.TerminalTimeframes ? !!root.TerminalTimeframes.parse(f) : FRAMES.includes(f);
          return { interval: typeof p?.interval === 'string' && known(p.interval) ? p.interval : panel.interval,
            mode: ['volume', 'tpo', 'vwap'].includes(p?.mode) ? p.mode : panel.mode,
            coin: typeof p?.coin === 'string' && COIN.test(p.coin) ? p.coin : '',
            linked: typeof p?.linked === 'boolean' ? p.linked : true };
        }) };
    }
    return state;
  }
  const icons = {
    one: '<rect x="3" y="4" width="14" height="12" rx="1"/>',
    two: '<rect x="3" y="4" width="14" height="12" rx="1"/><path d="M10 4v12"/>',
    four: '<rect x="3" y="4" width="14" height="12" rx="1"/><path d="M10 4v12M3 10h14"/>',
    watch: '<path d="M8 5h9M8 10h9M8 15h9M3 5h1M3 10h1M3 15h1"/>',
    book: '<path d="M4 4h12M4 8h8M4 12h12M4 16h8M14 7v10"/>',
    expand: '<path d="M7 3H3v4M13 3h4v4M3 13v4h4M17 13v4h-4"/>',
    reset: '<path d="M4 7a7 7 0 1 1-.2 5M4 3v4h4"/>',
    link: '<path d="m8 12 4-4M7 13l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M13 7l1-1a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0"/>',
    sync: '<path d="M10 2v16M2 10h16"/><circle cx="10" cy="10" r="3"/>',
    save: '<path d="M10 3v10M6 9l4 4 4-4M4 16h12"/>',
    open: '<path d="M10 14V4M6 8l4-4 4 4M4 16h12"/>',
  };
  const icon = name => `<svg viewBox="0 0 20 20" aria-hidden="true">${icons[name]}</svg>`;
  function attach(host, api) {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(KEY)); } catch {}
    let state = normalize(stored), focused = null, destroyed = false, frame = 0;
    // Narrow windows (the same 700 px as the stylesheet) show the list and order book as overlays. Which overlay is
    // open there is not saved, so shrinking the window never overwrites the desktop layout.
    let narrow = false, overlay = null, liveState = '';
    const side = key => narrow ? overlay === key : layout()[key];
    const layout = () => state.layouts[state.active];
    const $ = selector => host.querySelector(selector);
    const body = $('.ht'), main = $('.ht-main'), markets = $('.ht-markets'), book = $('.ht-book');
    const shell = document.createElement('div'); shell.className = 'tw';
    shell.innerHTML = `<div class="tw-bar">
      <span class="tw-brand"><span class="tw-mark">u</span> TERMINAL</span>
      <div class="tw-presets" role="group" aria-label="Zapisane layouty"><button type="button" data-preset="BBB"><span class="tw-preset-dot"></span>BBB</button><button type="button" data-preset="UNC"><span class="tw-preset-dot"></span>UNC</button></div>
      <span class="tw-saved" role="status" aria-live="polite">Układ zapisany lokalnie</span>
      <span class="tw-grow"></span>
      <div class="tw-count" role="group" aria-label="Liczba wykresów">${[1, 2, 4].map((n, i) => `<button type="button" data-count="${n}" title="${n} ${n === 1 ? 'wykres' : 'wykresy'}" aria-label="${n} ${n === 1 ? 'wykres' : 'wykresy'}">${icon(['one', 'two', 'four'][i])}</button>`).join('')}</div>
      <div class="tw-panels" role="group" aria-label="Panele boczne"><button type="button" data-toggle="markets" aria-controls="ht-watchlist">${icon('watch')}<span>Lista</span></button><button type="button" data-toggle="book" aria-controls="ht-book-panel">${icon('book')}<span>Arkusz</span></button></div>
      <button type="button" class="tw-tool" data-action="sync" title="Wspólny kursor na wszystkich wykresach" aria-label="Wspólny kursor">${icon('sync')}</button>
      <button type="button" class="tw-tool" data-action="export" title="Zapisz układ i ustawienia wykresów do pliku" aria-label="Eksportuj układ">${icon('save')}</button>
      <button type="button" class="tw-tool" data-action="import" title="Wczytaj układ z pliku" aria-label="Importuj układ">${icon('open')}</button><input type="file" accept="application/json,.json" data-import hidden>
      <button type="button" class="tw-reset" data-action="reset" title="Przywróć domyślne ustawienia tego layoutu" aria-label="Przywróć domyślny layout">${icon('reset')}</button>
    </div>
    <div class="tw-status"><span class="tw-data-status">Hyperliquid · oczekiwanie na dane</span><span class="tw-grow"></span><span class="tw-shortcut">⌘ / Ctrl + Enter · powiększ wykres</span><span class="tw-zone">UTC</span></div>`;
    host.append(shell); shell.insertBefore(body, $('.tw-status'));
    const grid = document.createElement('div'); grid.className = 'tw-grid';
    body.insertBefore(grid, main); grid.append(main);
    markets.id = 'ht-watchlist'; book.id = 'ht-book-panel';
    main.dataset.slot = '0'; main.classList.add('tw-pane');
    const mainExpand = document.createElement('button'); mainExpand.type = 'button'; mainExpand.className = 'tw-expand';
    mainExpand.dataset.focus = '0'; mainExpand.title = 'Powiększ wykres'; mainExpand.setAttribute('aria-label', 'Powiększ wykres główny'); mainExpand.innerHTML = icon('expand');
    $('.ht-chart-tools').append(mainExpand);
    // Independent charts (terminal-pane.js), one set per layout, created the first time they are shown.
    const panes = new Map();
    const paneKey = (preset, slot) => `tw:${preset}:${slot}`;
    function pane(preset, slot) {
      const id = paneKey(preset, slot);
      if (!panes.has(id)) {
        const p = TerminalPane.create({ slot, key: id, fetchJson: api.fetchJson, markets: () => api.market().markets, mainCoin: () => api.market().coin,
          config: () => state.layouts[preset].panels[slot - 1], change: patch => { Object.assign(state.layouts[preset].panels[slot - 1], patch); save(); },
          palette, onCrosshair });
        p.preset = preset; grid.append(p.el); panes.set(id, p);
      }
      return panes.get(id);
    }
    const handles = {};
    for (const axis of ['split', 'row']) {
      const handle = document.createElement('div'); handle.className = `tw-divider tw-divider-${axis}`;
      handle.tabIndex = 0; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-label', axis === 'split' ? 'Szerokość wykresów' : 'Wysokość wykresów');
      handle.setAttribute('aria-orientation', axis === 'split' ? 'vertical' : 'horizontal');
      handle.setAttribute('aria-valuemin', '25'); handle.setAttribute('aria-valuemax', '75');
      grid.append(handle); handles[axis] = handle;
    }
    const visible = () => !host.hidden && !document.hidden && host.getBoundingClientRect().width > 0;
    const save = () => {
      const ok = Store.set(KEY, JSON.stringify(state));
      $('.tw-saved').textContent = ok ? 'Układ zapisany lokalnie' : 'Nie zapisano · pamięć pełna';
    };
    const palette = () => {
      const css = getComputedStyle(host), color = n => css.getPropertyValue(n).trim();
      return { bg: color('--bg'), ink: color('--ink'), dim: color('--dim'), line: color('--line'), up: color('--tw-up'), down: color('--tw-down') };
    };
    // Shared crosshair: the chart under the mouse leads, the others show the bar containing that moment.
    // Only real mouse moves lead (programmatic crosshair moves carry no sourceEvent), so charts never echo each other.
    let leader = null, mainHooked = false;
    function onCrosshair(source, param) {
      if (param.sourceEvent) leader = source;
      else if (param.time !== undefined || source !== leader) return;
      else leader = null;
      if (!layout().sync) return;
      const time = param.sourceEvent ? (param.time ?? null) : null;
      for (const p of visiblePanes()) if (p !== source) p.crosshair(time);
      if (source !== 'main') mainCrosshair(time);
    }
    function mainCrosshair(time) {
      const ref = api.chartRef?.();
      if (!ref || main.hidden) return;
      const { chart, series, candles } = ref;
      if (time === null || !candles.length) { chart.clearCrosshairPosition(); return; }
      let lo = 0, hi = candles.length - 1;
      if (time < candles[0].time) { chart.clearCrosshairPosition(); return; }
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; candles[mid].time <= time ? lo = mid : hi = mid - 1; }
      chart.setCrosshairPosition(candles[lo].close, candles[lo].time, series);
    }
    function hookMain() {
      const ref = api.chartRef?.();
      if (mainHooked || !ref) return;
      mainHooked = true;
      ref.chart.subscribeCrosshairMove(param => onCrosshair('main', param));
    }
    const visiblePanes = () => [...panes.values()].filter(p => !p.el.hidden);
    function geometry() {
      grid.style.setProperty('--tw-split', layout().split + '%'); grid.style.setProperty('--tw-row', layout().row + '%');
      for (const axis of ['split', 'row']) handles[axis].setAttribute('aria-valuenow', String(Math.round(layout()[axis])));
    }
    function render() {
      host.dataset.workspace = state.active;
      host.dataset.narrow = String(narrow);
      body.dataset.markets = String(side('markets')); body.dataset.book = String(side('book'));
      grid.dataset.count = layout().count; grid.dataset.focus = focused === null ? '' : focused;
      markets.hidden = !side('markets'); book.hidden = !side('book');
      main.hidden = focused !== null && focused !== 0;
      shell.querySelectorAll('[data-preset]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preset === state.active)));
      shell.querySelectorAll('[data-count]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.count) === layout().count)));
      shell.querySelectorAll('[data-toggle]').forEach(b => { const open = side(b.dataset.toggle); b.setAttribute('aria-pressed', String(open)); b.setAttribute('aria-expanded', String(open)); });
      shell.querySelectorAll('button[data-focus]').forEach(b => { b.setAttribute('aria-pressed', String(focused === Number(b.dataset.focus))); b.title = focused === Number(b.dataset.focus) ? 'Przywróć podział' : 'Powiększ wykres'; });
      handles.split.hidden = layout().count === 1 || focused !== null;
      handles.row.hidden = layout().count !== 4 || focused !== null;
      shell.querySelector('[data-action=sync]').setAttribute('aria-pressed', String(layout().sync));
      geometry(); api.theme(); hookMain();
      // Hide first, then show, so a preset switch never has both sets of charts live at once.
      const want = new Set();
      for (let slot = 1; slot < 4; slot++) if (slot < layout().count && (focused === null || focused === slot)) want.add(paneKey(state.active, slot));
      for (const [id, p] of panes) if (!want.has(id) || !visible()) { p.el.hidden = !want.has(id); p.hide(); }
      for (const id of want) { const [, preset, slot] = id.split(':'); const p = pane(preset, Number(slot)); p.el.hidden = false; if (visible()) p.show(); }
    }
    function setPreset(name) {
      if (!['BBB', 'UNC'].includes(name) || name === state.active) return;
      state.active = name; focused = null; overlay = null; render(); save();
    }
    function focus(slot) { focused = focused === slot ? null : slot; render(); }
    const onClick = e => {
      const button = e.target.closest('button'); if (!button || !shell.contains(button)) return;
      if (button.dataset.preset) setPreset(button.dataset.preset);
      else if (button.dataset.count) { layout().count = Number(button.dataset.count); focused = null; render(); save(); }
      else if (button.dataset.toggle) {
        const key = button.dataset.toggle;
        if (narrow) { overlay = overlay === key ? null : key; render(); } else { layout()[key] = !layout()[key]; render(); save(); }
      }
      else if (button.dataset.focus !== undefined) focus(Number(button.dataset.focus));
      else if (button.dataset.action === 'sync') { layout().sync = !layout().sync; if (!layout().sync) { visiblePanes().forEach(p => p.crosshair(null)); mainCrosshair(null); } render(); save(); }
      else if (button.dataset.action === 'export') exportLayout();
      else if (button.dataset.action === 'import') shell.querySelector('[data-import]').click();
      else if (button.dataset.action === 'reset') {
        // Back to the defaults of this layout, including what each of its charts shows.
        dropPanes(state.active, true);
        state.layouts[state.active] = normalize(null).layouts[state.active]; focused = null; overlay = null; render(); save();
      }
    };
    shell.addEventListener('click', onClick);
    function dropPanes(preset, forget) {
      for (const [id, p] of panes) if (p.preset === preset) { p.destroy(); panes.delete(id); }
      if (forget) for (let slot = 1; slot < 4; slot++) for (const part of ['ind', 'studies', 'orderflow']) localStorage.removeItem(`${paneKey(preset, slot)}:${part}`);
    }
    // ---- export / import: the layouts plus each chart's indicator settings, validated on the way in -------------
    const PARTS = ['ind', 'studies', 'orderflow'];
    function exportLayout() {
      const charts = {};
      for (const preset of ['BBB', 'UNC']) for (let slot = 1; slot < 4; slot++) for (const part of PARTS) {
        const value = localStorage.getItem(`${paneKey(preset, slot)}:${part}`);
        if (value) try { charts[`${preset}:${slot}:${part}`] = JSON.parse(value); } catch {}
      }
      const data = { type: 'unc-terminal-workspace', version: 1, exported: new Date().toISOString(), state, charts };
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      link.download = `unc-terminal-${new Date().toISOString().slice(0, 10)}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      status('Układ zapisany do pliku');
    }
    const plain = v => v && typeof v === 'object' && !Array.isArray(v);
    // Keep only plain objects of known parts; each module validates its own fields again when it reads them.
    function cleanCharts(charts) {
      const out = {};
      if (!plain(charts)) return out;
      for (const [k, v] of Object.entries(charts)) {
        const m = /^(BBB|UNC):([123]):(ind|studies|orderflow)$/.exec(k);
        if (!m || !plain(v)) continue;
        out[k] = m[3] === 'ind' ? TerminalPane.cleanFlags(v) : v;
      }
      return out;
    }
    async function importLayout(file) {
      if (!file) return;
      if (file.size > 300000) { status('Plik jest za duży na układ terminala'); return; }
      let data;
      try { data = JSON.parse(await file.text()); } catch { status('To nie jest poprawny plik JSON'); return; }
      if (data?.type !== 'unc-terminal-workspace' || data.version !== 1 || !plain(data.state)) { status('To nie jest plik układu UNC Terminal'); return; }
      dropPanes('BBB', true); dropPanes('UNC', true);
      for (const [k, v] of Object.entries(cleanCharts(data.charts))) {
        const [preset, slot, part] = k.split(':');
        Store.set(`${paneKey(preset, Number(slot))}:${part}`, JSON.stringify(v));
      }
      state = normalize(data.state); focused = null; overlay = null; render(); save();
      status('Układ i wykresy paneli wczytane z pliku');
    }
    shell.querySelector('[data-import]').addEventListener('change', e => { importLayout(e.target.files?.[0]); e.target.value = ''; });
    function status(text) { const el = $('.tw-saved'); el.textContent = text; clearTimeout(status.timer); status.timer = setTimeout(() => { el.textContent = 'Układ zapisany lokalnie'; }, 4000); }
    let activeSlot = 0;
    const closeOverlay = () => { if (overlay) { overlay = null; render(); } };
    grid.addEventListener('pointerdown', e => { closeOverlay(); const pane = e.target.closest('[data-slot]'); if (pane) activeSlot = Number(pane.dataset.slot); });
    markets.addEventListener('click', e => { if (narrow && e.target.closest('.ht-market')) closeOverlay(); });
    grid.addEventListener('focusin', e => { const pane = e.target.closest('[data-slot]'); if (pane) activeSlot = Number(pane.dataset.slot); });
    const onKey = e => {
      if (!visible() || e.target.closest?.('input,textarea,select,[contenteditable=true]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); focus(activeSlot < layout().count ? activeSlot : 0); }
      if (e.key === 'Escape' && (focused !== null || overlay)) { focused = null; overlay = null; render(); }
    };
    document.addEventListener('keydown', onKey);
    for (const [axis, handle] of Object.entries(handles)) {
      let dragging = false;
      const update = e => {
        const rect = grid.getBoundingClientRect();
        layout()[axis] = clamp((axis === 'split' ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height) * 100, 25, 75, 50);
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; geometry(); });
      };
      handle.addEventListener('pointerdown', e => { if (e.button !== 0) return; dragging = true; handle.setPointerCapture(e.pointerId); grid.classList.add('tw-resizing'); e.preventDefault(); update(e); });
      handle.addEventListener('pointermove', e => { if (dragging) update(e); });
      const end = () => { if (!dragging) return; dragging = false; grid.classList.remove('tw-resizing'); save(); };
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end); handle.addEventListener('lostpointercapture', end);
      handle.addEventListener('keydown', e => {
        const step = { ArrowLeft: -2, ArrowRight: 2, ArrowUp: -2, ArrowDown: 2 }[e.key];
        if (step) { e.preventDefault(); layout()[axis] = clamp(layout()[axis] + step, 25, 75, 50); geometry(); save(); }
      });
    }
    const lifecycle = () => { if (!destroyed) render(); };
    const observer = new MutationObserver(lifecycle); observer.observe(host, { attributes: true, attributeFilter: ['hidden', 'class'] });
    document.addEventListener('visibilitychange', lifecycle);
    const resize = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width, next = width > 0 && width <= 700;
      if (width > 0 && next !== narrow) { narrow = next; overlay = null; render(); }
    });
    resize.observe(host);
    // Another browser tab changed the layouts: follow it.
    const onStorage = e => {
      if (e.key !== KEY || !e.newValue) return;
      let next; try { next = normalize(JSON.parse(e.newValue)); } catch { return; }
      state = next; focused = null; render(); panes.forEach(p => p.configChanged?.());
    };
    window.addEventListener('storage', onStorage);
    const timer = setInterval(() => { if (visible()) visiblePanes().forEach(p => p.refresh()); }, 30000);
    render();
    return {
      show: lifecycle,
      marketChanged() { panes.forEach(p => p.mainChanged()); },
      // Charts to capture for a screenshot: the visible panes and the grid they sit in.
      snapshotPanes() { return visiblePanes().map(p => p.snapshot?.()).filter(Boolean); },
      snapshotArea: grid,
      dataUpdated(cached = false) { if (liveState !== 'live') $('.tw-data-status').textContent = `Hyperliquid · ${cached ? 'zapisany wykres' : 'wykres odświeżony ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`; },
      liveStatus(next) {
        liveState = next;
        const text = { live: 'na żywo', connecting: 'łączenie na żywo…', gap: 'przerwa w połączeniu · ponawiam, dane z ostatniego odświeżenia' }[next];
        if (text) { $('.tw-data-status').textContent = 'Hyperliquid · ' + text; shell.querySelector('.tw-status').dataset.live = next; }
      },
      destroy() { destroyed = true; observer.disconnect(); clearInterval(timer); cancelAnimationFrame(frame); panes.forEach(p => p.destroy()); panes.clear(); document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', lifecycle); resize.disconnect(); window.removeEventListener('storage', onStorage); },
    };
  }
  root.TerminalWorkspace = { attach, normalize };
})(globalThis);
