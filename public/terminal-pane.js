// One independent chart for the BBB / UNC workspaces: its own market (or linked to the main chart), interval,
// indicator library, order flow, TPO, drawings and live candles. Settings are stored under the pane's own keys, so
// each pane in each layout remembers what it shows. The main terminal chart (hyper-terminal.js) stays separate.
(function (root) {
  'use strict';
  // Built-in and user timeframes (terminal-timeframes.js); a built timeframe (6h, 90m...) comes from smaller candles.
  const TF = () => root.TerminalTimeframes;
  const frameOptions = current => [...new Set([...TF().all(), current].filter(Boolean))].map(f => `<option value="${f}">${f}</option>`).join('');
  const SPAN = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 };
  const ORDERFLOW = ['footprint', 'delta', 'profile', 'tradebubbles'];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formats = [2, 4, 6].map(d => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }));
  const fmt = n => Number.isFinite(n) ? formats[n < 1 ? 2 : n < 100 ? 1 : 0].format(n) : '—';
  const LINK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 12 4-4M7 13l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M13 7l1-1a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0"/></svg>';
  const EXPAND = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4M13 3h4v4M3 13v4h4M17 13v4h-4"/></svg>';

  // Pane indicator flags that are not studies or order flow (candle volume, TPO), validated on load.
  function cleanFlags(saved) {
    return { volume: typeof saved?.volume === 'boolean' ? saved.volume : false, tpo: typeof saved?.tpo === 'boolean' ? saved.tpo : false,
      tpoMode: ['daily', 'weekly', 'monthly'].includes(saved?.tpoMode) ? saved.tpoMode : 'daily' };
  }
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const write = (key, value) => (root.Store?.set || ((k, v) => localStorage.setItem(k, v)))(key, JSON.stringify(value));

  /**
   * @param {object} o
   *  slot, key (storage prefix), fetchJson, markets() → market list, mainCoin() → main chart market,
   *  config() → { coin, linked, interval, mode }, change(patch) → save part of the pane config,
   *  palette() → chart colours, onCrosshair(pane, time|null)
   */
  function create(o) {
    const el = document.createElement('section');
    el.className = 'tw-pane tw-companion'; el.dataset.slot = o.slot; el.hidden = true;
    const n = o.slot + 1;
    el.innerHTML = `<header class="tw-pane-head">
        <button type="button" class="tw-link" data-link title="Połącz z instrumentem głównego wykresu" aria-label="Połącz wykres ${n} z głównym">${LINK}</button>
        <div class="tw-sym"><button type="button" class="tw-symbol-btn" aria-haspopup="listbox" aria-expanded="false" title="Zmień instrument"><strong class="tw-symbol">—</strong><span aria-hidden="true">▾</span></button>
          <div class="tw-jump" hidden><input type="search" placeholder="Szukaj tickera…" aria-label="Instrument wykresu ${n}" autocomplete="off" spellcheck="false"><div class="tw-jump-list" role="listbox"></div></div></div>
        <span class="tw-last"></span><span class="tw-grow"></span>
        <select data-frame aria-label="Interwał wykresu ${n}">${frameOptions()}</select>
        <button type="button" class="tw-ind-btn" aria-expanded="false" title="Indykatory wykresu ${n}">ƒx</button>
        <button type="button" data-fit title="Dopasuj wykres" aria-label="Dopasuj wykres ${n}">↔</button>
        <button type="button" data-focus="${o.slot}" title="Powiększ wykres" aria-label="Powiększ wykres ${n}">${EXPAND}</button>
      </header>
      <div class="tw-chart"><div class="ht-active-indicators tw-chips" hidden></div><div class="tw-chart-message" role="status"></div></div>
      <aside class="ht-indicator-panel tw-library" hidden aria-label="Indykatory wykresu ${n}"><div class="ht-library-head"><strong>Indykatory · wykres ${n}</strong><button type="button" data-lib-close aria-label="Zamknij">×</button></div><input type="search" placeholder="Szukaj indykatora…" aria-label="Szukaj indykatora"><div class="tw-lib-list"></div></aside>
      <div class="ht-ind-pop tw-pop" hidden role="dialog"><div class="ht-ind-pop-head"><strong class="tw-pop-title"></strong><button type="button" data-pop-remove title="Usuń indykator z wykresu">Usuń</button><button type="button" data-pop-close aria-label="Zamknij ustawienia">×</button></div>
        <div class="st-settings" hidden></div><div class="of-host" hidden></div>
        <div class="ht-tpo-controls tw-tpo" hidden><label>TPO <select data-tpo-mode><option value="daily">Dzienne</option><option value="weekly">Tygodniowe</option><option value="monthly">Miesięczne</option></select></label><span class="tw-tpo-info"></span></div>
        <p class="ht-ind-pop-empty" hidden>Ten indykator nie ma ustawień.</p></div>`;
    const $ = s => el.querySelector(s);
    const chartEl = $('.tw-chart'), chips = $('.tw-chips');
    let flags = cleanFlags(read(o.key + ':ind'));
    const saveFlags = () => write(o.key + ':ind', flags);
    // First use: turn the old single "mode" of the pane into the matching indicator.
    const firstUse = read(o.key + ':ind') === null, mode = o.config().mode;
    if (firstUse) { flags.volume = mode === 'volume'; flags.tpo = mode === 'tpo'; saveFlags(); }

    let base = [];   // candles the pane's timeframe is built from
    let chart = null, series, volume, panel, drawings, profile, orderflow, studies, candles = [], key = '', coin = '', interval = '', shown = false;
    let stamp = 0, loadedAt = 0, controller = null, unfollow = null, feed = '', streaming = '', studiesTimer = 0, tpoCandles = [], tpoStamp = 0, tpoAt = 0;
    const views = {};   // zoom per market and interval, restored when the pane comes back to it

    // Chart settings of this pane's layout (terminal-appearance.js); "auto" colours follow the theme.
    const A = root.TerminalAppearance, layout = () => o.layout || 'BBB';
    function theme() {
      if (!chart) return;
      const c = o.palette();
      chart.applyOptions(A.chartOptions(layout(), c));
      series.applyOptions(A.seriesOptions(layout(), c));
      A.watermark(chart, layout(), c, { symbol: name(coin), interval });
    }
    const volumeBar = (b, c) => ({ time: b.time, value: Math.max(0, Number(b.volume) || 0), color: A.volumeColor(layout(), c, b.close >= b.open) });
    root.addEventListener?.('terminalappearance', () => { if (!chart) return; theme(); if (candles.length) { const c = o.palette(); series.setData(A.colorBars(candles, layout(), c)); volume.setData(candles.map(b => volumeBar(b, c))); series.applyOptions({ priceFormat: A.priceFormat(layout(), candles.at(-1)?.close) }); } });
    function build() {
      if (chart) return;
      chart = LightweightCharts.createChart(chartEl, { autoSize: true, localization: { locale: 'pl-PL' }, timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 8 }, rightPriceScale: { minimumWidth: 64 } });
      series = chart.addSeries(LightweightCharts.CandlestickSeries, { priceFormat: { type: 'price', precision: 2, minMove: .01 } });
      volume = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false, visible: flags.volume });
      volume.priceScale().applyOptions({ scaleMargins: { top: .85, bottom: 0 } });
      panel = { el: chartEl, chart, series, symbol: 'hl:' + coin, candles: [], volume: true };
      drawings = Drawings.attach(panel); panel.drawings = drawings;
      profile = TerminalProfile.attach(panel);
      orderflow = TerminalOrderflow.attach($('.of-host'), { storageKey: o.key + ':orderflow' });
      studies = TerminalStudies.attach({ settingsHost: $('.st-settings'), fetchJson: url => o.fetchJson(url), orderflow, storageKey: o.key + ':studies', chips });
      if (root.TerminalPine) studies = TerminalPine.extend(studies, { pop: $('.tw-pop'), storageKey: o.key + ':pine' });
      orderflow.bindPanel(panel); studies.bindPanel(panel);
      if (firstUse && mode === 'vwap') studies.setEnabled('vwap', true);   // saved like any other choice
      chart.subscribeCrosshairMove(param => o.onCrosshair?.(api, param));
      theme();
      library();
    }
    // ---- indicator library and settings popover (the same catalogue as the main chart) -----------------------
    function enabled(id) { return id === 'volume' || id === 'tpo' ? !!flags[id] : ORDERFLOW.includes(id) ? orderflow.isEnabled(id) : studies.isEnabled(id); }
    function setIndicator(id, value) {
      if (id === 'volume') { flags.volume = value; saveFlags(); volume.applyOptions({ visible: value }); }
      else if (id === 'tpo') { flags.tpo = value; saveFlags(); if (value) loadTpo(true); else { ++tpoStamp; profile.set([]); } }
      else if (ORDERFLOW.includes(id)) orderflow.setEnabled(id, value);
      else studies.setEnabled(id, value);
    }
    function showSettings(id) {
      const study = studies.showSettings(id);
      orderflow.showSettings?.(id);
      $('.of-host').hidden = !ORDERFLOW.includes(id);
      $('.tw-tpo').hidden = id !== 'tpo';
      return study || id === 'tpo' || ORDERFLOW.includes(id);
    }
    function library() {
      const lib = $('.tw-library');
      TerminalIndicators.attach({ button: $('.tw-ind-btn'), panel: lib, list: $('.tw-lib-list'), search: lib.querySelector('input'), active: chips, close: $('[data-lib-close]'),
        get: enabled, set: setIndicator, showSettings, candles: () => panel?.candles || [],
        pop: { el: $('.tw-pop'), title: $('.tw-pop-title'), empty: $('.ht-ind-pop-empty'), remove: $('[data-pop-remove]'), close: $('[data-pop-close]') } });
      $('[data-tpo-mode]').value = flags.tpoMode;
      $('[data-tpo-mode]').addEventListener('change', e => { flags = cleanFlags({ ...flags, tpoMode: e.target.value }); saveFlags(); paintTpo(); });
    }
    // ---- data -------------------------------------------------------------------------------------------------
    function message(text) { $('.tw-chart-message').textContent = text; }
    function fit() { if (chart && candles.length) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 110), to: candles.length + 7 }); }
    function paint(list, next) {
      const changed = next !== key;
      if (changed && key && chart) { const r = chart.timeScale().getVisibleLogicalRange(); if (r) views[key] = r; }
      key = next; candles = list; panel.candles = list;
      const last = list.at(-1)?.close;
      series.applyOptions({ priceFormat: A.priceFormat(layout(), last) });
      const c = o.palette();
      series.setData(A.colorBars(list, layout(), c));
      volume.setData(list.map(b => volumeBar(b, c)));
      A.watermark(chart, layout(), c, { symbol: name(coin), interval });
      drawings.redraw(); orderflow.refresh(); studies.refresh();
      message(list.length ? '' : 'Brak świec dla tego zakresu');
      $('.tw-last').textContent = fmt(last);
      if (changed) { if (views[next]) chart.timeScale().setVisibleLogicalRange(views[next]); else fit(); }
    }
    async function load(force = false) {
      if (!shown || !coin) return;
      const next = coin + ':' + interval;
      if (!force && key === next && (streaming === 'live' || Date.now() - loadedAt < 30000)) return;
      controller?.abort(); const mine = controller = new AbortController(), id = ++stamp;
      if (key !== next) { series.setData([]); volume.setData([]); candles = []; panel.candles = []; message('Ładowanie wykresu…'); }
      try {
        const data = await TF().load(o.fetchJson, coin, interval, { signal: mine.signal });
        if (id !== stamp || !chart) return;
        base = data.base; loadedAt = Date.now(); paint(data.candles, next);
      } catch (e) { if (id === stamp && e.name !== 'AbortError') message(key === next ? 'Nie odświeżono · poprzednie dane' : 'Dane niedostępne · ponowię automatycznie'); }
    }
    // TPO uses 30-minute candles of the same market, whatever the chart interval.
    async function loadTpo(force = false) {
      if (!flags.tpo || !shown || !coin) return;
      if (!force && Date.now() - tpoAt < 60000) return;
      const id = ++tpoStamp, market = coin;
      $('.tw-tpo-info').textContent = 'Ładowanie…';
      try {
        const data = await o.fetchJson('/api/hl/candles?coin=' + encodeURIComponent(market) + '&interval=30m');
        if (id !== tpoStamp || market !== coin) return;
        tpoCandles = data.candles; tpoAt = Date.now(); paintTpo();
      } catch (e) { if (id === tpoStamp) $('.tw-tpo-info').textContent = e.message; }
    }
    function paintTpo() {
      if (!profile) return;
      if (!flags.tpo) { profile.set([]); return; }
      try { const values = TerminalProfile.profiles(tpoCandles, { mode: flags.tpoMode }); profile.set(values); $('.tw-tpo-info').textContent = `${values.length} profili · bloki 30m · UTC`; }
      catch (e) { $('.tw-tpo-info').textContent = e.message; }
    }
    // Live candles through the shared stream; studies follow a new bar at once and the forming bar every 2 s.
    function follow() {
      const next = coin + ':' + interval;
      if (!root.HLStream || feed === next) return;
      unfollow?.(); feed = next; streaming = '';
      unfollow = root.HLStream.shared.subscribe({ type: 'candle', coin, interval: TF().parse(interval).base }, data => onBar(next, data), status => {
        const before = streaming; streaming = status;
        if (status === 'live' && before === 'gap') load(true);
      });
    }
    function stopFollow() { unfollow?.(); unfollow = null; feed = ''; streaming = ''; clearTimeout(studiesTimer); studiesTimer = 0; }
    function onBar(next, data) {
      if (feed !== next || key !== next || !candles.length) return;
      let bar = root.HLStream.candleOf(data);
      if (![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return;
      const frame = TF().parse(interval);
      if (!frame.native) {
        if (!base.length || !root.HLStream.mergeCandle(base, bar)) return;
        const start = TF().bucket(bar.time, frame), tail = [];
        for (let i = base.length - 1; i >= 0 && base[i].time >= start; i--) tail.unshift(base[i]);
        bar = TF().aggregate(tail, frame)[0];
      }
      const kind = root.HLStream.mergeCandle(candles, bar);
      if (!kind) return;
      const c = o.palette();
      series.update(A.colorBar(bar, candles[candles.length - 2], layout(), c));
      volume.update(volumeBar(bar, c));
      $('.tw-last').textContent = fmt(bar.close);
      if (kind === 'append') { clearTimeout(studiesTimer); studiesTimer = 0; drawings.redraw(); orderflow.refresh(); studies.refresh(); }
      else if (!studiesTimer) studiesTimer = setTimeout(() => { studiesTimer = 0; if (key === next) studies.refresh(); }, 2000);
    }
    // ---- market and interval ------------------------------------------------------------------------------------
    function name(market) { return o.markets().find(m => m.coin === market)?.name || market || '—'; }
    function apply() {
      const cfg = o.config(), nextCoin = (cfg.linked || !cfg.coin ? o.mainCoin() : cfg.coin) || '', nextInterval = TF().parse(cfg.interval) ? cfg.interval : '1h';
      $('[data-frame]').innerHTML = frameOptions(nextInterval);
      $('[data-frame]').value = nextInterval;
      $('[data-link]').setAttribute('aria-pressed', String(!!cfg.linked));
      $('[data-link]').title = cfg.linked ? 'Połączony z głównym wykresem · kliknij, aby odłączyć' : 'Połącz z instrumentem głównego wykresu';
      $('.tw-symbol').textContent = name(nextCoin);
      if (!chart) return;
      if (nextCoin === coin && nextInterval === interval) return;
      const coinChanged = nextCoin !== coin;
      coin = nextCoin; interval = nextInterval; base = [];
      if (coinChanged) {
        panel.symbol = 'hl:' + coin; drawings.reload(); tpoCandles = []; tpoAt = 0; profile.set([]);
      }
      orderflow.setMarket(coin, interval); studies.setMarket(coin, interval);
      if (shown) { stopFollow(); follow(); load(); if (coinChanged) loadTpo(true); }
    }
    // ---- symbol search ------------------------------------------------------------------------------------------
    let results = [], index = 0;
    const jump = $('.tw-jump'), input = jump.querySelector('input'), list = $('.tw-jump-list');
    function renderJump() {
      const q = input.value.trim().toUpperCase(), all = o.markets();
      results = (q ? all.filter(m => (m.coin + ' ' + m.name).toUpperCase().includes(q)).sort((a, b) => Number(b.name.toUpperCase() === q) - Number(a.name.toUpperCase() === q) || a.name.length - b.name.length) : all.slice().sort((a, b) => b.volume - a.volume)).slice(0, 12);
      index = Math.min(index, Math.max(0, results.length - 1));
      list.innerHTML = results.map((m, i) => `<button type="button" role="option" class="ht-jump-row${i === index ? ' active' : ''}${m.coin === coin ? ' current' : ''}" aria-selected="${i === index}" data-coin="${esc(m.coin)}"><span><b>${esc(m.name)}</b><small>${esc(m.dex)}</small></span><span>${fmt(m.price)}</span></button>`).join('')
        || `<p class="ht-empty">${q ? 'Nie znaleziono takiego tickera.' : 'Wczytuję rynki…'}</p>`;
    }
    function openJump() { jump.hidden = false; $('.tw-symbol-btn').setAttribute('aria-expanded', 'true'); input.value = ''; index = 0; renderJump(); input.focus(); }
    function closeJump(refocus) { if (jump.hidden) return; jump.hidden = true; $('.tw-symbol-btn').setAttribute('aria-expanded', 'false'); if (refocus) $('.tw-symbol-btn').focus(); }
    function choose(market) { closeJump(true); o.change({ coin: market, linked: false }); apply(); }
    $('.tw-symbol-btn').addEventListener('pointerdown', e => e.preventDefault());
    $('.tw-symbol-btn').addEventListener('click', () => jump.hidden ? openJump() : closeJump(true));
    jump.addEventListener('pointerdown', e => { if (e.target !== input) e.preventDefault(); });
    jump.addEventListener('focusout', e => { if (!jump.contains(e.relatedTarget)) closeJump(false); });
    input.addEventListener('input', () => { index = 0; renderJump(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeJump(true); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (results.length) { index = (index + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length; renderJump(); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (results[index]) choose(results[index].coin); }
    });
    list.addEventListener('click', e => { const market = e.target.closest('[data-coin]')?.dataset.coin; if (market) choose(market); });
    $('[data-link]').addEventListener('click', () => {
      const cfg = o.config();
      // Linking follows the main chart; unlinking keeps the market shown now.
      o.change(cfg.linked ? { linked: false, coin: coin || o.mainCoin() } : { linked: true }); apply();
    });
    $('[data-frame]').addEventListener('change', e => { o.change({ interval: e.target.value }); apply(); });
    // The user added or removed a timeframe: refresh the list (the pane keeps its interval).
    root.addEventListener?.('timeframeschange', () => { const sel = $('[data-frame]'), value = sel.value; sel.innerHTML = frameOptions(value); sel.value = value; });
    $('[data-fit]').addEventListener('click', fit);

    // Crosshair from another chart: the bar of this pane that contains that moment.
    function crosshair(time) {
      if (!chart || !shown) return;
      if (time === null || !candles.length) { chart.clearCrosshairPosition(); return; }
      const span = SPAN[interval] || TF().parse(interval)?.seconds || 60;
      let lo = 0, hi = candles.length - 1;
      if (time < candles[0].time || time >= candles[hi].time + span) { chart.clearCrosshairPosition(); return; }
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; candles[mid].time <= time ? lo = mid : hi = mid - 1; }
      chart.setCrosshairPosition(candles[lo].close, candles[lo].time, series);
    }
    const api = {
      el, slot: o.slot,
      get coin() { return coin; }, get interval() { return interval; },
      show() {
        build();
        if (!shown) { shown = true; studies.resume?.(); orderflow.resume?.(); }
        theme();
        apply(); follow(); load(); loadTpo();
      },
      hide() {
        if (!shown) return;
        shown = false; controller?.abort(); ++stamp; stopFollow(); closeJump(false);
        studies?.suspend?.(); orderflow?.suspend?.();
      },
      // The main chart moved to another market: linked panes follow it.
      mainChanged() { if (o.config().linked) apply(); else $('.tw-symbol').textContent = name(coin); },
      marketsLoaded() { $('.tw-symbol').textContent = name(coin || o.mainCoin()); },
      theme, fit, crosshair,
      // For the terminal screenshot (terminal-snapshot.js).
      snapshot() { return chart && shown ? { el: panel.el, chart, title: `${name(coin)} · ${interval}` } : null; },
      configChanged() { apply(); },
      refresh() { if (shown) { load(); loadTpo(); } },
      destroy() { api.hide(); if (chart) { orderflow.destroy?.(); chart.remove(); chart = null; } el.remove(); },
    };
    return api;
  }
  root.TerminalPane = { create, cleanFlags };
})(globalThis);
