// BBB / UNC workspaces. Layout state is separate from market data and indicator settings.
(function (root) {
  'use strict';
  const KEY = 'terminal-workspaces-v1';
  const FRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
  const defaults = name => ({ count: name === 'UNC' ? 4 : 1, markets: name === 'UNC', book: name === 'UNC', split: 58, row: 56,
    panels: [{ interval: '4h', mode: 'volume' }, { interval: '30m', mode: 'tpo' }, { interval: '5m', mode: 'vwap' }] });
  const clamp = (n, low, high, fallback) => Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback;
  function normalize(value) {
    const state = { version: 1, active: value?.active === 'UNC' ? 'UNC' : 'BBB', layouts: {} };
    for (const name of ['BBB', 'UNC']) {
      const d = defaults(name), saved = value?.version === 1 ? value.layouts?.[name] : null;
      state.layouts[name] = { count: [1, 2, 4].includes(saved?.count) ? saved.count : d.count,
        markets: typeof saved?.markets === 'boolean' ? saved.markets : d.markets,
        book: typeof saved?.book === 'boolean' ? saved.book : d.book,
        split: clamp(saved?.split, 25, 75, d.split), row: clamp(saved?.row, 25, 75, d.row),
        panels: d.panels.map((panel, i) => ({ interval: FRAMES.includes(saved?.panels?.[i]?.interval) ? saved.panels[i].interval : panel.interval,
          mode: ['volume', 'tpo', 'vwap'].includes(saved?.panels?.[i]?.mode) ? saved.panels[i].mode : panel.mode })) };
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
  };
  const icon = name => `<svg viewBox="0 0 20 20" aria-hidden="true">${icons[name]}</svg>`;
  function attach(host, api) {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(KEY)); } catch {}
    let state = normalize(stored), focused = null, destroyed = false, frame = 0;
    // Narrow windows (the same 700 px as the stylesheet) show the list and order book as overlays. Which overlay is
    // open there is not saved, so shrinking the window never overwrites the desktop layout.
    let narrow = false, overlay = null;
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
    const helpers = [];
    for (let i = 1; i < 4; i++) {
      const el = document.createElement('section'); el.className = 'tw-pane tw-companion'; el.dataset.slot = i; el.hidden = true;
      el.innerHTML = `<header class="tw-pane-head"><span class="tw-linked" title="Instrument połączony z głównym wykresem">${icon('link')}</span><strong class="tw-symbol">—</strong><span class="tw-grow"></span><select data-frame="${i}" aria-label="Interwał wykresu ${i + 1}">${FRAMES.map(f => `<option value="${f}">${f}</option>`).join('')}</select><select data-mode="${i}" aria-label="Widok wykresu ${i + 1}"><option value="volume">Cena + wolumen</option><option value="tpo">TPO · 30m</option><option value="vwap">VWAP</option></select><button type="button" data-fit="${i}" title="Dopasuj wykres" aria-label="Dopasuj wykres ${i + 1}">↔</button><button type="button" data-focus="${i}" title="Powiększ wykres" aria-label="Powiększ wykres ${i + 1}">${icon('expand')}</button></header><div class="tw-chart"><div class="tw-chart-label"></div><div class="tw-chart-message" role="status"></div></div>`;
      grid.append(el); helpers.push({ el, slot: i, chart: null, key: '', candles: [], stamp: 0, last: null, views: {} });
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
    const companionVisible = p => visible() && !p.el.hidden;
    const save = () => {
      const ok = Store.set(KEY, JSON.stringify(state));
      $('.tw-saved').textContent = ok ? 'Układ zapisany lokalnie' : 'Nie zapisano · pamięć pełna';
    };
    const palette = () => {
      const css = getComputedStyle(host), color = n => css.getPropertyValue(n).trim();
      return { bg: color('--bg'), ink: color('--ink'), dim: color('--dim'), line: color('--line'), up: color('--tw-up'), down: color('--tw-down') };
    };
    function chartTheme(p) {
      if (!p.chart) return;
      const c = palette();
      p.chart.applyOptions({ layout: { background: { color: c.bg }, textColor: c.dim, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10 },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { borderColor: c.line }, timeScale: { borderColor: c.line },
        crosshair: { vertLine: { color: c.dim }, horzLine: { color: c.dim } } });
      p.series.applyOptions({ upColor: c.up, downColor: c.down, borderUpColor: c.up, borderDownColor: c.down, wickUpColor: c.up, wickDownColor: c.down });
    }
    function create(p) {
      if (p.chart) return;
      const el = p.el.querySelector('.tw-chart');
      p.chart = LightweightCharts.createChart(el, { autoSize: true, localization: { locale: 'en-US' }, timeScale: { timeVisible: true, rightOffset: 8 }, rightPriceScale: { minimumWidth: 64 } });
      p.series = p.chart.addSeries(LightweightCharts.CandlestickSeries, { priceFormat: { type: 'price', precision: 2, minMove: .01 } });
      p.volume = p.chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false });
      p.volume.priceScale().applyOptions({ scaleMargins: { top: .85, bottom: 0 } });
      p.vwap = p.chart.addSeries(LightweightCharts.LineSeries, { color: '#c5aa73', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
      p.panel = { el, chart: p.chart, series: p.series, candles: p.candles };
      p.profile = TerminalProfile.attach(p.panel);
      chartTheme(p);
    }
    function fit(p) {
      if (p.chart && p.candles.length) p.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, p.candles.length - 110), to: p.candles.length + 7 });
    }
    function message(p, text) { p.el.querySelector('.tw-chart-message').textContent = text; }
    function paint(p, candles, key) {
      if (!p.chart) return;
      const changed = key !== p.key;
      p.key = key; p.candles = candles; p.panel.candles = candles;
      const last = candles.at(-1)?.close, precision = last > 100 ? 2 : last > 1 ? 4 : 8;
      p.series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
      p.series.setData(candles);
      const config = layout().panels[p.slot - 1], c = palette();
      p.volume.setData(candles.map(bar => ({ time: bar.time, value: Math.max(0, Number(bar.volume) || 0), color: bar.close >= bar.open ? c.up + '40' : c.down + '40' })));
      p.volume.applyOptions({ visible: config.mode === 'volume' });
      p.vwap.setData(config.mode === 'vwap' ? TerminalStudiesMath.vwap(candles).map(b => ({ time: b.time, value: b.value })) : []);
      p.profile.set(config.mode === 'tpo' ? TerminalProfile.profiles(candles, { mode: 'daily' }) : []);
      p.el.querySelector('.tw-chart-label').textContent = config.mode === 'tpo' ? 'TPO dzienne · zakresy świec 30m · UTC' : config.mode === 'vwap' ? 'VWAP dzienny · OHLCV · UTC' : 'Wolumen świecowy';
      message(p, candles.length ? '' : 'Brak świec dla tego zakresu');
      const view = p.views[state.active + ':' + key];
      if (changed) { if (view) p.chart.timeScale().setVisibleLogicalRange(view); else fit(p); }
    }
    // Only one in-flight request per companion. Generation guards also cover A → B → A switches.
    async function refresh(p, force = false) {
      if (!companionVisible(p)) return;
      const { coin } = api.market(); if (!coin) return;
      const config = layout().panels[p.slot - 1], interval = config.mode === 'tpo' ? '30m' : config.interval;
      const key = `${coin}:${interval}:${config.mode}`;
      create(p);
      // A pane shown again (layout, focus or tab change) repaints its last candles at once instead of reloading.
      const candleKey = key.slice(0, key.lastIndexOf(':'));
      if (p.key !== key && p.last?.key === candleKey) paint(p, p.last.candles, key);
      if (p.loading === key || !force && p.key === key && Date.now() - (p.last?.at || 0) < 30000) return;
      p.controller?.abort(); const controller = new AbortController(); p.controller = controller;
      const stamp = ++p.stamp; p.loading = key;
      if (p.key !== key) { p.key = ''; p.series.setData([]); p.volume.setData([]); p.vwap.setData([]); p.profile.set([]); p.candles = []; p.panel.candles = []; message(p, 'Ładowanie wykresu…'); }
      try {
        const { candles } = await api.fetchJson(`/api/hl/candles?coin=${encodeURIComponent(coin)}&interval=${interval}`, { signal: controller.signal });
        if (stamp !== p.stamp || destroyed || !companionVisible(p)) return;
        p.last = { key: candleKey, candles, at: Date.now() }; paint(p, candles, key);
      } catch (e) { if (stamp === p.stamp && e.name !== 'AbortError') message(p, p.key === key ? 'Nie odświeżono · poprzednie dane' : 'Dane niedostępne · ponowię automatycznie'); }
      finally { if (stamp === p.stamp) p.loading = ''; }
    }
    function release(p) {
      p.controller?.abort(); ++p.stamp; p.loading = '';
      if (!p.chart) return;
      const range = p.chart.timeScale().getVisibleLogicalRange();
      if (range && p.key) p.views[state.active + ':' + p.key] = range;
      p.chart.remove(); p.chart = null; p.key = ''; p.candles = [];
    }
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
      geometry(); api.theme();
      for (const p of helpers) {
        p.el.hidden = p.slot >= layout().count || focused !== null && focused !== p.slot;
        const config = layout().panels[p.slot - 1];
        p.el.querySelector('[data-frame]').value = config.mode === 'tpo' ? '30m' : config.interval;
        p.el.querySelector('[data-frame]').disabled = config.mode === 'tpo';
        p.el.querySelector('[data-mode]').value = config.mode;
        if (p.el.hidden || !visible()) release(p); else { chartTheme(p); refresh(p); }
      }
      quote();
    }
    function quote() {
      const { coin, markets: list } = api.market(), name = list.find(m => m.coin === coin)?.name || coin || '—';
      for (const p of helpers) p.el.querySelector('.tw-symbol').textContent = name;
    }
    function setPreset(name) {
      if (!['BBB', 'UNC'].includes(name) || name === state.active) return;
      for (const p of helpers) release(p);
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
      else if (button.dataset.fit) fit(helpers[Number(button.dataset.fit) - 1]);
      else if (button.dataset.action === 'reset') {
        helpers.forEach(release);
        for (const p of helpers) for (const view of Object.keys(p.views)) if (view.startsWith(state.active + ':')) delete p.views[view];
        state.layouts[state.active] = normalize(null).layouts[state.active]; focused = null; overlay = null; render(); save();
      }
    };
    const onChange = e => {
      const slot = Number(e.target.dataset.frame || e.target.dataset.mode); if (!slot) return;
      const panel = layout().panels[slot - 1];
      if (e.target.dataset.frame) panel.interval = e.target.value; else panel.mode = e.target.value;
      render(); save();
    };
    shell.addEventListener('click', onClick); shell.addEventListener('change', onChange);
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
      helpers.forEach(release); state = next; focused = null; render();
    };
    window.addEventListener('storage', onStorage);
    const timer = setInterval(() => { if (visible()) helpers.forEach(p => refresh(p)); }, 30000);
    render();
    return {
      show: lifecycle,
      marketChanged() { quote(); helpers.forEach(p => refresh(p)); },
      dataUpdated(cached = false) { $('.tw-data-status').textContent = `Hyperliquid · ${cached ? 'zapisany wykres' : 'wykres odświeżony ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`; },
      destroy() { destroyed = true; observer.disconnect(); clearInterval(timer); cancelAnimationFrame(frame); helpers.forEach(release); document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', lifecycle); resize.disconnect(); window.removeEventListener('storage', onStorage); },
    };
  }
  root.TerminalWorkspace = { attach, normalize };
})(globalThis);
