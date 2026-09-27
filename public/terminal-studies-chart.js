// Chart studies for the Hyperliquid terminal: everything drawn from candles, the order book, funding and the
// executed-trade stream. Overlays are series primitives, so they follow the chart natively; the lower
// studies (open interest, funding, trade counter) get their own panes.
window.TerminalStudies = (() => {
  const M = TerminalStudiesMath;
  const NOT_PUBLIC = 'Hyperliquid nie udostępnia publicznie tych danych.';
  const catalog = [
    { id: 'ohlc', title: 'OHLC', group: 'Podstawowe', description: 'Otwarcie, maksimum, minimum, zamknięcie, zmiana i wolumen świecy pod kursorem.' },
    { id: 'barstats', title: 'Bar Stats', group: 'Podstawowe', description: 'Zakres, korpus, knoty, luka i szacowana delta świecy pod kursorem.' },
    { id: 'ma', title: 'Średnie kroczące (EMA / SMA)', chip: 'EMA / SMA', group: 'Trend', description: 'Do trzech średnich na wykresie, domyślnie EMA 20 / 50 / 200. Typ, długości i kolory w ustawieniach.' },
    { id: 'bb', title: 'Bollinger Bands', chip: 'BB', group: 'Zmienność', description: 'Średnia 20 świec i pasma ±2 odchylenia standardowe. Zwężone pasma często poprzedzają mocny ruch.' },
    { id: 'vwap', title: 'VWAP', group: 'Ceny', description: 'VWAP z pasmami ±σ, reset dzienny, tygodniowy lub miesięczny. Anchored VWAP: narzędzie w pasku rysowania (kliknij świecę).' },
    { id: 'vpvr', title: 'VPVR: widoczny zakres', group: 'Profile', description: 'Profil wolumenu z tego, co widać na wykresie: POC, VAH i VAL. Zakres zaznaczony ręcznie: narzędzie w pasku rysowania.' },
    { id: 'vpsv', title: 'VPSV: profil sesji', group: 'Profile', description: 'Osobny profil wolumenu dla każdego dnia lub tygodnia, z linią POC.' },
    { id: 'levels', title: 'Poziomy okresów', group: 'Poziomy', description: 'Open, high i low bieżącego oraz poprzedniego dnia, tygodnia i miesiąca, poniedziałek i weekend.' },
    { id: 'bubbles', title: 'Volume Bubbles (świece)', group: 'Wolumen', description: 'Bąbelki na świecach o największym wolumenie świecy (szacunek z OHLCV). Bąbelki z pojedynczych transakcji: Trade Bubbles.' },
    { id: 'depth', title: 'OB Depth', group: 'Arkusz zleceń', description: 'Skumulowana głębokość arkusza zleceń przy prawej osi ceny.' },
    { id: 'obprofile', title: 'OB Profile', group: 'Arkusz zleceń', description: 'Wielkość zleceń oczekujących na każdym poziomie ceny.' },
    { id: 'heatmap', title: 'Heatmap arkusza', group: 'Arkusz zleceń', description: 'Historia arkusza zleceń w czasie. Zbierana w tej karcie od momentu włączenia, nie z całej sesji.' },
    { id: 'oi', title: 'Open Interest', group: 'Rynek', description: 'Otwarte pozycje w osobnym panelu. Hyperliquid podaje tylko bieżącą wartość, więc próbkuję ją co 15 s.' },
    { id: 'funding', title: 'Funding Rate', group: 'Rynek', description: 'Godzinowa stawka funding z ostatnich 14 dni w osobnym panelu.' },
    { id: 'counter', title: 'Trade Counter / Pulse', group: 'Order flow', description: 'Liczba transakcji na świecę i puls (transakcji na minutę) ze strumienia zebranego w tej karcie.' },
    { id: 'rsi', title: 'RSI', group: 'Oscylatory', description: 'Relative Strength Index (14) w osobnym panelu, z poziomami wykupienia 70 i wyprzedania 30.' },
    { id: 'macd', title: 'MACD', group: 'Oscylatory', description: 'MACD (12, 26, 9) w osobnym panelu: linia, sygnał i histogram różnicy.' },
    { id: 'atr', title: 'ATR', group: 'Zmienność', description: 'Average True Range (14) w osobnym panelu: średni zakres świecy, np. do odległości stop lossa.' },
    ...['Liquidation Heatmap', 'Hyperliquid Take Profit Heatmap', 'Hyperliquid Stop Loss Heatmap', 'Hyperliquid Liquidations Heatmap', 'Liquidations', 'Net Positioning (NS/NL)']
      .map(title => ({ id: 'na:' + title, title, group: 'Niedostępne', description: NOT_PUBLIC, unavailable: true })),
  ];
  const IDS = new Set(catalog.filter(d => !d.unavailable).map(d => d.id));
  const defaults = { vwap: { reset: 'day', bands: 1 }, vpvr: { rows: 32, area: 70 }, vpsv: { period: 'day', rows: 24 },
    levels: { day: true, week: true, month: true, monday: true, weekend: false }, bubbles: { top: 10 }, depth: { sig: 3 }, obprofile: { sig: 3 }, heatmap: { sig: 4 },
    ma: { type: 'ema', a: 20, b: 50, c: 200, ca: '#6b9eff', cb: '#e8c268', cc: '#b797d6' }, bb: { length: 20, mult: 2, color: '#6b9eff' },
    rsi: { length: 14, upper: 70, lower: 30, color: '#b797d6' }, macd: { fast: 12, slow: 26, signal: 9 }, atr: { length: 14, color: '#e8c268' } };
  const compact = n => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  const price = p => p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(3) : p.toFixed(5);
  const LEVEL_STYLE = { day: 1, week: 2, month: 0, monday: 3, weekend: 4 };   // dotted, dashed, solid, large dashed, sparse dotted

  const style = document.createElement('style');
  style.textContent = `.st-legend{position:absolute;left:44px;top:6px;z-index:2;pointer-events:none;color:var(--dim);font:11px/1.5 ui-monospace,Menlo,monospace;max-width:calc(100% - 200px)}
.st-legend b{color:var(--ink);font-weight:400}.st-legend div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-settings{display:flex;flex-wrap:wrap;gap:8px 16px;padding:8px 0;color:var(--dim)}.st-settings[hidden]{display:none}
.st-settings label{display:flex;gap:6px;align-items:center}.st-settings select,.st-settings input[type=number]{background:transparent;color:var(--ink);border:1px solid var(--line);font:inherit;padding:2px 4px;color-scheme:dark}
.st-settings input[type=number]{width:64px}.st-settings b{color:var(--ink);font-weight:400}
.st-settings input[type=color]{width:26px;height:22px;padding:0 2px;border:1px solid var(--line);background:transparent;cursor:pointer}
.st-settings .st-reset{font:inherit;font-size:10px;background:transparent;color:var(--dim);border:1px solid var(--line);padding:3px 8px;cursor:pointer}.st-settings .st-reset:hover{color:var(--ink)}`;
  document.head.append(style);

  // One instance per chart. `storageKey` keeps each chart's studies apart, `chips` is that chart's row of active
  // indicator chips (the legend sits below it) and `initial` the studies switched on before anything was saved.
  function attach({ settingsHost, fetchJson, orderflow, storageKey = 'hl-studies', chips, initial }) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null') || (initial ? { on: initial } : {}); } catch {}
    const on = { ...(saved.on || {}) };
    const cfg = Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, typeof v === 'object' ? { ...v, ...(saved.cfg?.[k] || {}) } : v]));
    const persist = () => { try { (window.Store?.set || ((k, v) => localStorage.setItem(k, v)))(storageKey, JSON.stringify({ on, cfg })); } catch {} };
    let panel, coin = '', interval = '1h', requestUpdate = () => {}, legend, status = '', pollTimer = null, suspended = false;
    let levelData = null, levels = [], levelLines = [], levelStamp = 0, book = null, heat = [], funding = [], oiSamples = [], fundingStamp = 0;
    const aux = {};   // pane studies: id -> series
    const multi = {};   // studies built from several series (averages, bands, RSI, MACD, ATR): id -> { series, lines }
    let vwapData = null, vpsvData = null, bubbleData = null, vpvrMemo = { key: '', value: null };
    const candles = () => panel?.candles || [];
    const enabled = id => !!on[id];

    // ---- coordinates: candle times plus extrapolation beyond the data --------------------------
    function logicalOf(t) {
      const c = candles();
      if (c.length < 2) return null;
      const step = (c[c.length - 1].time - c[0].time) / (c.length - 1);
      if (t <= c[0].time) return (t - c[0].time) / step;
      if (t >= c[c.length - 1].time) return c.length - 1 + (t - c[c.length - 1].time) / step;
      let lo = 0, hi = c.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; c[mid].time <= t ? lo = mid : hi = mid; }
      return lo + (t - c[lo].time) / (c[hi].time - c[lo].time);
    }
    const X = t => { const l = logicalOf(t); return l === null ? null : panel.chart.timeScale().logicalToCoordinate(l); };
    const Y = p => panel.series.priceToCoordinate(p);
    const inkRgb = () => Theme.css('--ink-rgb').replace(/ /g, ',');

    // ---- painters ------------------------------------------------------------------------------
    function paintVwap(c, size) {
      if (!vwapData?.length) return;
      const ink = Theme.css('--ink'), bands = cfg.vwap.bands, key = t => M.periodKey(t, cfg.vwap.reset);
      let segment = [], last = null;
      const flush = () => {
        if (segment.length > 1) {
          const line = k => segment.map(p => ({ x: p.x, y: Y(p.value + k * p.sd) }));
          const stroke = (pts, alpha, dash) => { c.beginPath(); pts.forEach((p, i) => p.y === null ? 0 : i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.strokeStyle = `rgba(${inkRgb()},${alpha})`; c.setLineDash(dash); c.stroke(); };
          c.lineWidth = 1;
          for (let k = 1; k <= bands; k++) {
            const up = line(k), dn = line(-k);
            if (k === 1) { c.beginPath(); up.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); [...dn].reverse().forEach(p => c.lineTo(p.x, p.y)); c.closePath(); c.fillStyle = `rgba(${inkRgb()},.06)`; c.fill(); }
            stroke(up, k === 1 ? .5 : .3, k === 1 ? [] : [4, 4]); stroke(dn, k === 1 ? .5 : .3, k === 1 ? [] : [4, 4]);
          }
          c.setLineDash([]); c.lineWidth = 1.75; c.strokeStyle = ink; c.beginPath();
          segment.forEach((p, i) => { const y = Y(p.value); i ? c.lineTo(p.x, y) : c.moveTo(p.x, y); }); c.stroke();
        }
        segment = [];
      };
      for (const p of vwapData) {
        const x = X(p.time);
        if (x === null) continue;
        if (last !== null && key(p.time) !== last) flush();
        last = key(p.time);
        if (x > -50 && x < size.width + 50) segment.push({ ...p, x });
      }
      flush();
    }
    function paintProfile(c, profile, x, direction, maxWidth, alphaScale = 1) {
      const most = Math.max(...profile.rows.map(r => r.total));
      for (const r of profile.rows) {
        const y0 = Y(r.high), y1 = Y(r.low);
        if (y0 === null || y1 === null) continue;
        const h = Math.max(1, y1 - y0 - 1), w = r.total / most * maxWidth, down = r.total ? w * r.down / r.total : 0, left = direction > 0 ? x : x - w;
        c.globalAlpha = (r.valueArea ? 1 : .55) * alphaScale;
        c.fillStyle = `rgba(${inkRgb()},.5)`; c.fillRect(direction > 0 ? left : left + down, y0, w - down, h);
        c.fillStyle = `rgba(${inkRgb()},.2)`; c.fillRect(direction > 0 ? left + w - down : left, y0, down, h);
        c.globalAlpha = 1;
      }
    }
    function visibleProfile() {
      const range = panel.chart.timeScale().getVisibleLogicalRange(), list = candles();
      if (!range || !list.length) return null;
      const i0 = Math.max(0, Math.ceil(range.from)), i1 = Math.min(list.length - 1, Math.floor(range.to));
      if (i1 < i0) return null;
      const key = [i0, i1, list.length, list[i1].time, list[i1].volume, cfg.vpvr.rows, cfg.vpvr.area].join();
      if (vpvrMemo.key !== key) vpvrMemo = { key, value: M.volumeProfile(list.slice(i0, i1 + 1), { rows: cfg.vpvr.rows, valueArea: cfg.vpvr.area / 100 }) };
      return vpvrMemo.value;
    }
    function paintVpvr(c, size) {
      const profile = visibleProfile();
      if (!profile) return;
      paintProfile(c, profile, size.width, -1, size.width * .28);
      c.setLineDash([4, 3]); c.lineWidth = 1; c.strokeStyle = `rgba(${inkRgb()},.7)`;
      for (const [text, p] of [['POC', profile.pocPrice], ['VAH', profile.vah], ['VAL', profile.val]]) {
        const y = Y(p);
        if (y === null) continue;
        c.beginPath(); c.moveTo(size.width * .72, y); c.lineTo(size.width, y); c.stroke();
        c.setLineDash([]); c.fillStyle = Theme.css('--ink'); c.font = '10px ui-monospace,monospace'; c.textAlign = 'right'; c.fillText(`${text} ${price(p)}`, size.width * .72 - 4, y - 2); c.setLineDash([4, 3]);
      }
      c.setLineDash([]); c.textAlign = 'start';
    }
    function paintVpsv(c, size) {
      if (!vpsvData) return;
      for (const s of vpsvData) {
        const x0 = X(s.from), x1 = X(s.to);
        if (x0 === null || x1 === null || x1 < 0 || x0 > size.width) continue;
        paintProfile(c, s, x0, 1, Math.max(20, Math.min((x1 - x0) * .6, 160)), .9);
        const y = Y(s.pocPrice);
        if (y !== null) { c.strokeStyle = `rgba(${inkRgb()},.55)`; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x0, y); c.lineTo(Math.max(x1, x0 + 10), y); c.stroke(); c.setLineDash([]); }
      }
    }
    function paintBubbles(c, size) {
      if (!bubbleData) return;
      const ink = Theme.css('--ink');
      c.font = '10px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const b of bubbleData) {
        const x = X(b.time), y = Y(b.price);
        if (x === null || y === null || x < -30 || x > size.width + 30) continue;
        const r = 5 + b.ratio * 20;
        c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = `rgba(${inkRgb()},${b.up ? .16 : .06})`; c.fill();
        c.strokeStyle = ink; c.globalAlpha = b.up ? .9 : .5; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
        if (r >= 11) { c.fillStyle = ink; c.fillText(compact(b.volume), x, y); }
      }
      c.textAlign = 'start'; c.textBaseline = 'alphabetic';
    }
    function paintDepth(c, size) {
      if (!book) return;
      const depth = M.bookDepth(book), most = Math.max(depth.bids.at(-1)?.cumulative || 0, depth.asks.at(-1)?.cumulative || 0), width = Math.min(150, size.width * .16);
      if (!most) return;
      const area = (curve, alpha) => {
        const pts = curve.map(l => ({ x: size.width - l.cumulative / most * width, y: Y(l.price) })).filter(p => p.y !== null);
        if (pts.length < 2) return;
        c.beginPath(); c.moveTo(size.width, pts[0].y);
        for (const p of pts) { c.lineTo(p.x, p.y); }
        c.lineTo(size.width, pts.at(-1).y); c.closePath();
        c.fillStyle = `rgba(${inkRgb()},${alpha})`; c.fill();
        c.strokeStyle = `rgba(${inkRgb()},.7)`; c.lineWidth = 1; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
      };
      area(depth.bids, .22); area(depth.asks, .09);
    }
    function paintObProfile(c, size) {
      if (!book) return;
      const all = [...(book.bids || []), ...(book.asks || [])].map(l => Number(l.px)).filter(Number.isFinite);
      if (!all.length) return;
      const mid = M.bookDepth(book).mid, span = Math.min(.1, Math.max(...all.map(p => Math.abs(p - mid) / mid)) * 1.02 || .02);
      const profile = M.bookProfile(book, { rows: 40, span });
      if (!profile) return;
      const most = Math.max(...profile.rows.map(r => Math.max(r.bid, r.ask))), width = Math.min(120, size.width * .14);
      if (!most) return;
      for (const r of profile.rows) {
        const y0 = Y(r.high), y1 = Y(r.low);
        if (y0 === null || y1 === null) continue;
        const h = Math.max(1, y1 - y0 - 1);
        if (r.bid) { c.fillStyle = `rgba(${inkRgb()},.5)`; c.fillRect(size.width - r.bid / most * width, y0, r.bid / most * width, h); }
        if (r.ask) { c.fillStyle = `rgba(${inkRgb()},.2)`; c.fillRect(size.width - r.ask / most * width, y0, r.ask / most * width, h); }
      }
    }
    function paintHeat(c, size) {
      if (heat.length < 1) return;
      const most = Math.max(...heat.flatMap(s => [...s.bids, ...s.asks].map(l => Number(l.sz))).filter(Number.isFinite), 1e-9);
      const now = Date.now() / 1000;
      heat.forEach((snap, i) => {
        const x0 = X(snap.time), x1 = X(heat[i + 1]?.time ?? now);
        if (x0 === null || x1 === null || x1 < 0 || x0 > size.width) return;
        for (const [side, rows] of [['bid', snap.bids], ['ask', snap.asks]]) {
          rows.forEach((l, j) => {
            const p = Number(l.px), sz = Number(l.sz), next = Number(rows[j + 1]?.px ?? rows[j - 1]?.px ?? p), y = Y(p), yn = Y(next);
            if (y === null || yn === null || !Number.isFinite(sz)) return;
            const h = Math.max(2, Math.abs(yn - y));   // a level covers the gap to its neighbour
            c.fillStyle = `rgba(${inkRgb()},${((side === 'bid' ? .55 : .3) * Math.log1p(sz) / Math.log1p(most)).toFixed(3)})`;
            c.fillRect(x0, y - h / 2, Math.max(1, x1 - x0), h);
          });
        }
      });
    }
    const bottomPaint = { draw: t => t.useMediaCoordinateSpace(({ context: c, mediaSize: size }) => { c.save(); c.beginPath(); c.rect(0, 0, size.width, size.height); c.clip();
      if (enabled('heatmap')) paintHeat(c, size); if (enabled('vpsv')) paintVpsv(c, size); if (enabled('vpvr')) paintVpvr(c, size); c.restore(); }) };
    const topPaint = { draw: t => t.useMediaCoordinateSpace(({ context: c, mediaSize: size }) => { c.save(); c.beginPath(); c.rect(0, 0, size.width, size.height); c.clip();
      if (enabled('obprofile')) paintObProfile(c, size); if (enabled('depth')) paintDepth(c, size); if (enabled('vwap')) paintVwap(c, size); if (enabled('bubbles')) paintBubbles(c, size); c.restore(); }) };

    // ---- derived data --------------------------------------------------------------------------
    function recompute() {
      const list = candles();
      vwapData = enabled('vwap') ? M.vwap(list, { reset: cfg.vwap.reset }) : null;
      vpsvData = enabled('vpsv') ? M.sessionProfiles(list, { period: cfg.vpsv.period, rows: cfg.vpsv.rows }) : null;
      bubbleData = enabled('bubbles') ? M.bubbles(list, { top: cfg.bubbles.top / 100 }) : null;
      vpvrMemo = { key: '', value: null };
      syncAux(); renderLegend(); requestUpdate();
    }
    async function loadLevels() {
      if (!enabled('levels') || !coin) return;
      const stamp = ++levelStamp;
      try {
        const [daily, weekly, monthly] = await Promise.all(['1d', '1w', '1M'].map(async i => (await fetchJson(`/api/hl/candles?coin=${encodeURIComponent(coin)}&interval=${i}`)).candles));
        if (stamp !== levelStamp) return;
        levelData = { daily, weekly, monthly }; status = '';
      } catch (error) { if (stamp === levelStamp) { levelData = null; status = 'Poziomy: ' + error.message; } }
      syncLevels(); renderLegend();
    }
    function syncLevels() {
      for (const line of levelLines) panel.series.removePriceLine(line);
      levelLines = [];
      if (!enabled('levels') || !panel) return;
      levels = levelData ? M.keyLevels(levelData, undefined, cfg.levels) : [];
      for (const l of levels) {
        const color = l.group === 'week' || l.group === 'month' || l.group === 'monday' ? Theme.css('--ink') : Theme.css('--dim');
        levelLines.push(panel.series.createPriceLine({ price: l.price, title: l.title, color, lineWidth: 1, lineStyle: LEVEL_STYLE[l.group], axisLabelVisible: false }));
      }
    }
    async function pollBook() {
      clearTimeout(pollTimer); pollTimer = null;
      if (suspended) return;
      if (!coin || document.hidden || !['depth', 'obprofile', 'heatmap'].some(enabled)) { if (['depth', 'obprofile', 'heatmap'].some(enabled)) pollTimer = setTimeout(pollBook, 5000); return; }
      const current = coin;
      try {
        // The heat map keeps its own (finer) aggregation so that history is comparable between snapshots.
        if (enabled('heatmap')) {
          const snap = await fetchJson(`/api/hl/depth?coin=${encodeURIComponent(current)}&sig=${cfg.heatmap.sig}`);
          if (current === coin) { heat.push({ time: Math.floor((snap.time || Date.now()) / 1000), bids: snap.bids, asks: snap.asks }); if (heat.length > 400) heat.shift(); }
        }
        if (enabled('depth') || enabled('obprofile')) {
          const sig = enabled('depth') ? cfg.depth.sig : cfg.obprofile.sig;
          const next = await fetchJson(`/api/hl/depth?coin=${encodeURIComponent(current)}&sig=${sig}`);
          if (current === coin) book = next;
        }
        status = '';
      } catch (error) { status = 'Arkusz: ' + error.message; }
      if (current === coin) { requestUpdate(); renderLegend(); }
      pollTimer = setTimeout(pollBook, 5000);
    }
    async function loadFunding() {
      if (!enabled('funding') || !coin) return;
      const stamp = ++fundingStamp;
      try { const { rates } = await fetchJson('/api/hl/funding?coin=' + encodeURIComponent(coin)); if (stamp === fundingStamp) { funding = rates; status = ''; } }
      catch (error) { if (stamp === fundingStamp) { funding = []; status = 'Funding: ' + error.message; } }
      syncAux(); renderLegend();
    }
    const oiKey = () => 'hl-oi:' + coin;
    // Open interest samples live in the size-limited cache (storage.js): markets not opened for a while make room.
    function loadOi() { oiSamples = Stash.get(oiKey()) || []; if (!Array.isArray(oiSamples)) oiSamples = []; }

    // ---- panes below the chart ----------------------------------------------------------------
    function dropAux(id) {
      const s = aux[id];
      if (!s) return;
      try { const index = s.getPane().paneIndex(), before = panel.chart.panes().length; panel.chart.removeSeries(s); if (index > 0 && panel.chart.panes().length === before) panel.chart.removePane(index); } catch { /* the chart was already torn down */ }
      delete aux[id];
    }
    // A new lower pane would squeeze the earlier ones: give every lower pane the same height again.
    function sizePanes() { try { panel.chart.panes().slice(1).forEach(p => p.setHeight(100)); } catch {} }
    // Several series of one study share a pane (price pane 0 for overlays, a new pane below otherwise).
    function setSeries(id, overlay, specs) {
      let entry = multi[id];
      if (!entry) {
        const pane = overlay ? 0 : panel.chart.panes().length;
        entry = multi[id] = { series: specs.map(s => panel.chart.addSeries(s.kind, s.options, pane)), lines: [] };
        if (!overlay) sizePanes();
      }
      specs.forEach((s, i) => { entry.series[i].applyOptions(s.options); entry.series[i].setData(s.data); });
      return entry;
    }
    function dropSeries(id) {
      const entry = multi[id];
      if (!entry) return;
      delete multi[id];
      try {
        const index = entry.series[0].getPane().paneIndex(), before = panel.chart.panes().length;
        for (const s of entry.series) panel.chart.removeSeries(s);
        // Only remove the pane if the chart did not already drop it together with its last series.
        if (index > 0 && panel.chart.panes().length === before) panel.chart.removePane(index);
      } catch { /* the chart was already torn down */ }
    }
    function ensureAux(id, make) {
      if (aux[id]) return aux[id];
      const pane = panel.chart.panes().length;
      aux[id] = make(pane);
      sizePanes();
      return aux[id];
    }
    function syncAux() {
      if (!panel) return;
      const ink = Theme.css('--ink'), dim = Theme.css('--dim'), list = candles();
      // Candle that contains a time (last candle starting at or before it).
      const candleAt = t => { let lo = 0, hi = list.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; list[mid].time <= t ? lo = mid : hi = mid - 1; } return list[lo]?.time; };
      if (enabled('funding')) {
        const s = ensureAux('funding', pane => panel.chart.addSeries(LightweightCharts.HistogramSeries, { title: 'Funding %/h', priceFormat: { type: 'price', precision: 4, minMove: 0.0001 }, lastValueVisible: true, priceLineVisible: false }, pane));
        const buckets = new Map();
        for (const r of funding) { if (!list.length || r.time < list[0].time) continue; const t = candleAt(r.time), b = buckets.get(t) || { sum: 0, n: 0 }; b.sum += r.rate * 100; b.n++; buckets.set(t, b); }
        s.setData([...buckets].sort((a, b) => a[0] - b[0]).map(([time, b]) => ({ time, value: b.sum / b.n, color: b.sum >= 0 ? ink : dim })));
      } else dropAux('funding');
      if (enabled('oi')) {
        const s = ensureAux('oi', pane => panel.chart.addSeries(LightweightCharts.LineSeries, { title: 'Open Interest', color: ink, lineWidth: 2, priceFormat: { type: 'volume' }, lastValueVisible: true, priceLineVisible: false }, pane));
        s.applyOptions({ color: ink });
        const seen = new Set();
        s.setData(oiSamples.filter(p => Number.isFinite(p.time) && Number.isFinite(p.value) && !seen.has(p.time) && seen.add(p.time)).sort((a, b) => a.time - b.time).map(p => ({ time: p.time, value: p.value })));
      } else dropAux('oi');
      if (enabled('counter')) {
        const s = ensureAux('counter', pane => panel.chart.addSeries(LightweightCharts.HistogramSeries, { title: 'Transakcje', priceFormat: { type: 'volume' }, lastValueVisible: true, priceLineVisible: false }, pane));
        const trades = orderflow?.trades || [], counts = new Map();
        for (const t of trades) { const time = TerminalOrderflow.bucket(t.time, orderflow.interval || interval); counts.set(time, (counts.get(time) || 0) + 1); }
        s.setData([...counts].sort((a, b) => a[0] - b[0]).filter(([time]) => !list.length || time >= list[0].time).map(([time, value]) => ({ time, value, color: ink })));
      } else dropAux('counter');
      syncClassic(list, ink);
    }
    // Averages and bands sit on the price pane; RSI, MACD and ATR each get a pane below.
    function syncClassic(list, ink) {
      const line = (color, width = 1, extra = {}) => ({ color, lineWidth: width, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, ...extra });
      const last = list.at(-1)?.close, precision = last > 100 ? 2 : last > 1 ? 4 : 6, format = { type: 'price', precision, minMove: 10 ** -precision };
      if (enabled('ma')) {
        const m = cfg.ma, specs = ['a', 'b', 'c'].map(k => {
          const length = Math.round(m[k]), on = length >= 2;
          const data = on ? (m.type === 'sma' ? M.sma(list, length) : M.ema(list, length)) : [];
          return { kind: LightweightCharts.LineSeries, options: line(m['c' + k], 1.5, { title: on ? `${m.type.toUpperCase()} ${length}` : '', visible: on, priceFormat: format }), data };
        });
        setSeries('ma', true, specs);
      } else dropSeries('ma');
      if (enabled('bb')) {
        const bands = M.bollinger(list, { length: Math.round(cfg.bb.length), mult: cfg.bb.mult }), c = cfg.bb.color;
        setSeries('bb', true, [
          { kind: LightweightCharts.LineSeries, options: line(c, 1, { priceFormat: format }), data: bands.map(b => ({ time: b.time, value: b.upper })) },
          { kind: LightweightCharts.LineSeries, options: line(c, 1, { lineStyle: 2, priceFormat: format }), data: bands.map(b => ({ time: b.time, value: b.middle })) },
          { kind: LightweightCharts.LineSeries, options: line(c, 1, { priceFormat: format }), data: bands.map(b => ({ time: b.time, value: b.lower })) },
        ]);
      } else dropSeries('bb');
      if (enabled('rsi')) {
        const r = cfg.rsi, entry = setSeries('rsi', false, [{ kind: LightweightCharts.LineSeries,
          options: { title: `RSI ${Math.round(r.length)}`, color: r.color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
            autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) }, data: M.rsi(list, Math.round(r.length)).map(p => ({ time: p.time, value: p.value })) }]);
        for (const l of entry.lines) entry.series[0].removePriceLine(l);
        entry.lines = [r.upper, r.lower].map(price => entry.series[0].createPriceLine({ price, color: Theme.css('--dim'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' }));
      } else dropSeries('rsi');
      if (enabled('macd')) {
        const m = cfg.macd, data = M.macd(list, { fast: Math.round(m.fast), slow: Math.round(m.slow), signal: Math.round(m.signal) }), f = { type: 'price', precision, minMove: 10 ** -precision };
        setSeries('macd', false, [
          { kind: LightweightCharts.HistogramSeries, options: { title: '', priceLineVisible: false, lastValueVisible: false, priceFormat: f },
            data: data.filter(p => p.histogram !== null).map(p => ({ time: p.time, value: p.histogram, color: p.histogram >= 0 ? '#8dcc9c88' : '#dc8e8988' })) },
          { kind: LightweightCharts.LineSeries, options: line(ink, 1.5, { title: `MACD ${Math.round(m.fast)} ${Math.round(m.slow)} ${Math.round(m.signal)}`, lastValueVisible: true, priceFormat: f }), data: data.map(p => ({ time: p.time, value: p.macd })) },
          { kind: LightweightCharts.LineSeries, options: line('#e8c268', 1, { priceFormat: f }), data: data.filter(p => p.signal !== null).map(p => ({ time: p.time, value: p.signal })) },
        ]);
      } else dropSeries('macd');
      if (enabled('atr')) {
        setSeries('atr', false, [{ kind: LightweightCharts.LineSeries, options: { title: `ATR ${Math.round(cfg.atr.length)}`, color: cfg.atr.color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, priceFormat: format },
          data: M.atr(list, Math.round(cfg.atr.length)) }]);
      } else dropSeries('atr');
    }

    // ---- legend: OHLC, bar stats, pulse ---------------------------------------------------------
    let hoverTime = null;
    function renderLegend() {
      if (!legend) return;
      const list = candles(), lines = [];
      const index = hoverTime === null ? list.length - 1 : list.findIndex(c => c.time === hoverTime);
      const c = list[index], prev = list[index - 1];
      if (c && enabled('ohlc')) lines.push(`O <b>${price(c.open)}</b> H <b>${price(c.high)}</b> L <b>${price(c.low)}</b> C <b>${price(c.close)}</b> ${(c.close >= c.open ? '+' : '−') + Math.abs((c.close - c.open) / c.open * 100).toFixed(2)}% · V <b>${compact(c.volume || 0)}</b>`);
      const s = c && enabled('barstats') ? M.barStats(c, prev) : null;
      if (s) lines.push(`zakres <b>${price(s.range)}</b> · korpus <b>${s.bodyPercent.toFixed(0)}%</b> · knoty <b>${price(s.upperWick)}</b> / <b>${price(s.lowerWick)}</b> · luka <b>${(s.gapPercent >= 0 ? '+' : '−') + Math.abs(s.gapPercent).toFixed(2)}%</b> · Δ szac. <b>${compact(s.estimatedDelta)}</b>`);
      if (enabled('counter') && orderflow?.trades?.length) {
        const cutoff = Date.now() - 60000, perMinute = orderflow.trades.filter(t => t.time >= cutoff).length;
        lines.push(`puls <b>${perMinute}</b> transakcji/min · zebrane <b>${orderflow.trades.length}</b>`);
      }
      if (status) lines.push(status);
      // Runs on every crosshair move: touch the DOM only when the text changed.
      const html = lines.map(l => `<div>${l}</div>`).join('');
      if (html !== legend.innerHTML) legend.innerHTML = html;
    }

    // ---- settings ------------------------------------------------------------------------------
    // Settings are shown for one study at a time (the one opened from its chip or from the library).
    const option = (value, label, current) => `<option value="${value}"${String(current) === String(value) ? ' selected' : ''}>${label}</option>`;
    const number = (path, value, min, max, step = 1) => `<input type="number" min="${min}" max="${max}" step="${step}" data-cfg="${path}" value="${value}">`;
    const color = (path, value) => `<input type="color" data-cfg="${path}" value="${value}" aria-label="Kolor">`;
    let settingsId = null;
    function settingsHtml(id) {
      if (!enabled(id)) return '';
      const c = cfg[id];
      const html = {
        vwap: () => `<label>reset <select data-cfg="vwap.reset">${option('day', 'dzień', c.reset)}${option('week', 'tydzień', c.reset)}${option('month', 'miesiąc', c.reset)}</select></label><label>pasma <select data-cfg="vwap.bands">${option(0, 'brak', c.bands)}${option(1, '±1σ', c.bands)}${option(2, '±1σ ±2σ', c.bands)}</select></label>`,
        vpvr: () => `<label>wiersze ${number('vpvr.rows', c.rows, 8, 120)}</label><label>obszar wartości % ${number('vpvr.area', c.area, 50, 95)}</label>`,
        vpsv: () => `<label>okres <select data-cfg="vpsv.period">${option('day', 'dzień', c.period)}${option('week', 'tydzień', c.period)}</select></label><label>wiersze ${number('vpsv.rows', c.rows, 8, 80)}</label>`,
        levels: () => [['day', 'dzień'], ['week', 'tydzień'], ['month', 'miesiąc'], ['monday', 'poniedziałek'], ['weekend', 'weekend']].map(([k, t]) => `<label><input type="checkbox" data-check="levels.${k}"${c[k] ? ' checked' : ''}> ${t}</label>`).join(''),
        bubbles: () => `<label>największe <select data-cfg="bubbles.top">${[5, 10, 20].map(n => option(n, n + '%', c.top)).join('')}</select> świec</label>`,
        depth: () => `<label>agregacja <select data-cfg="depth.sig">${[2, 3, 4, 5].map(n => option(n, n + ' cyfry', c.sig)).join('')}</select></label>`,
        obprofile: () => `<label>agregacja <select data-cfg="obprofile.sig">${[2, 3, 4, 5].map(n => option(n, n + ' cyfry', c.sig)).join('')}</select></label>`,
        heatmap: () => `<label>agregacja <select data-cfg="heatmap.sig">${[2, 3, 4, 5].map(n => option(n, n + ' cyfry', c.sig)).join('')}</select></label>`,
        ma: () => `<label>typ <select data-cfg="ma.type">${option('ema', 'EMA', c.type)}${option('sma', 'SMA', c.type)}</select></label>` + ['a', 'b', 'c'].map((k, i) => `<label>${i + 1}. ${number('ma.' + k, c[k], 0, 500)} ${color('ma.c' + k, c['c' + k])}</label>`).join('') + '<small>0 = wyłączona</small>',
        bb: () => `<label>długość ${number('bb.length', c.length, 2, 200)}</label><label>odchylenia ${number('bb.mult', c.mult, 0.5, 5, 0.1)}</label><label>kolor ${color('bb.color', c.color)}</label>`,
        rsi: () => `<label>długość ${number('rsi.length', c.length, 2, 100)}</label><label>wykupienie ${number('rsi.upper', c.upper, 50, 100)}</label><label>wyprzedanie ${number('rsi.lower', c.lower, 0, 50)}</label><label>kolor ${color('rsi.color', c.color)}</label>`,
        macd: () => `<label>szybka ${number('macd.fast', c.fast, 2, 100)}</label><label>wolna ${number('macd.slow', c.slow, 3, 200)}</label><label>sygnał ${number('macd.signal', c.signal, 2, 50)}</label>`,
        atr: () => `<label>długość ${number('atr.length', c.length, 2, 100)}</label><label>kolor ${color('atr.color', c.color)}</label>`,
      }[id];
      return html ? html() + `<button type="button" class="st-reset" data-reset="${id}">Przywróć domyślne</button>` : '';
    }
    function renderSettings() {
      if (!settingsHost) return false;
      const html = settingsId ? settingsHtml(settingsId) : '';
      settingsHost.innerHTML = html;
      settingsHost.hidden = !html;
      return !!html;
    }
    function applied(id) {
      persist();
      if (id === 'levels') syncLevels(); else if (['depth', 'obprofile', 'heatmap'].includes(id)) { if (id === 'heatmap') heat = []; pollBook(); } else recompute();
      requestUpdate();
    }
    settingsHost?.addEventListener('change', e => {
      const path = e.target.dataset.cfg || e.target.dataset.check;
      if (!path) return;
      const [id, key] = path.split('.');
      let value = e.target.dataset.check ? e.target.checked : Number.isNaN(Number(e.target.value)) || e.target.type === 'color' ? e.target.value : Number(e.target.value);
      if (e.target.type === 'number') {
        // Out-of-range or empty numbers snap back into the allowed range (or to the previous value).
        value = e.target.value === '' ? cfg[id][key] : Math.min(Number(e.target.max), Math.max(Number(e.target.min), value));
        e.target.value = value;
      }
      cfg[id][key] = value;
      applied(id);
    });
    settingsHost?.addEventListener('click', e => {
      const id = e.target.closest?.('[data-reset]')?.dataset.reset;
      if (!id || !defaults[id]) return;
      cfg[id] = { ...defaults[id] };
      renderSettings(); applied(id);
    });

    // ---- public --------------------------------------------------------------------------------
    function startFeeds() {
      if (enabled('levels')) loadLevels();
      if (enabled('funding')) loadFunding();
      pollBook();
    }
    return {
      catalog: catalog.filter(d => IDS.has(d.id) || d.unavailable),
      isEnabled: enabled,
      // Show the settings of one study in the settings host; false when it has none.
      showSettings(id) { settingsId = id; return renderSettings(); },
      setEnabled(id, value) {
        if (!IDS.has(id)) return;
        on[id] = !!value; persist();
        if (id === 'counter') orderflow?.setEnabled('counter', !!value);
        if (id === 'heatmap') {
          if (!value) heat = [];
          // The history grows to the right of the last candle, so leave room for it.
          panel?.chart.timeScale().applyOptions({ rightOffset: value ? 15 : 10 });
        }
        if (id === 'levels') { if (value) loadLevels(); else syncLevels(); }
        if (id === 'funding' && value) loadFunding();
        if (id === 'oi') loadOi();
        if (['depth', 'obprofile', 'heatmap'].includes(id)) pollBook();
        renderSettings(); recompute();
      },
      bindPanel(next) {
        panel = next;
        legend = document.createElement('div'); legend.className = 'st-legend'; panel.el.append(legend);
        // Sit below the row of active-indicator chips, whatever its height (measured only when that row changes).
        const row = chips === undefined ? document.getElementById('ht-active-indicators') : chips;
        if (row) new ResizeObserver(() => {
          // Inside the observer callback layout is already up to date, so these reads are free.
          legend.style.top = (!row.hidden && row.offsetHeight ? Math.max(6, row.getBoundingClientRect().bottom - panel.el.getBoundingClientRect().top + 4) : 6) + 'px';
        }).observe(row);
        const painters = { paneViews: () => [{ zOrder: () => 'bottom', renderer: () => bottomPaint }, { zOrder: () => 'top', renderer: () => topPaint }],
          attached(p) { requestUpdate = p.requestUpdate; } };
        panel.series.attachPrimitive(painters);
        panel.chart.subscribeCrosshairMove(param => { hoverTime = param.time ?? null; renderLegend(); });
        window.addEventListener('themechange', () => { syncLevels(); syncAux(); requestUpdate(); });
        orderflow?.onRender?.(() => { if (enabled('counter')) { syncAux(); renderLegend(); } });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) pollBook(); });
        loadOi(); renderSettings(); recompute(); startFeeds();
      },
      setMarket(nextCoin, nextInterval) {
        const changed = nextCoin !== coin;
        coin = nextCoin; interval = nextInterval;
        if (changed) {
          levelData = null; syncLevels(); book = null; heat = []; funding = []; loadOi();
          for (const id of Object.keys(aux)) dropAux(id);
          startFeeds();
        }
        if (panel) { recompute(); if (!changed && enabled('levels')) loadLevels(); }
      },
      refresh() { recompute(); },
      // A hidden chart stops polling the order book; resume picks up where it left off.
      suspend() { suspended = true; clearTimeout(pollTimer); pollTimer = null; },
      resume() { if (!suspended) return; suspended = false; pollBook(); },
      observeMarkets(markets) {
        const m = markets.find(x => x.coin === coin);
        if (!m || !Number.isFinite(m.openInterest)) return;
        const time = Math.floor(Date.now() / 1000);
        if (oiSamples.at(-1)?.time === time) return;
        oiSamples.push({ time, value: m.openInterest });
        if (oiSamples.length > 2000) oiSamples.splice(0, oiSamples.length - 2000);
        Stash.put(oiKey(), oiSamples);
        if (enabled('oi')) syncAux();
      },
    };
  }
  return { attach, catalog };
})();
