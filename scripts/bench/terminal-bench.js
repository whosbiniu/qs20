// UNC Terminal benchmark, injected before the page scripts: by scripts/bench-terminal.mjs (Chrome, through the
// DevTools protocol) or by the Mac app (--bench-terminal <this file> <scenario>). It is never part of the site.
//
// 1. A fake Hyperliquid WebSocket replaces window.WebSocket: trades, candles, order book and market context at a
//    chosen rate, with duplicate batches, a replay of recent trades on every new subscription and server-side drops.
//    Prices start from the real market list; REST (history) still comes from the app's own API.
// 2. Measurements: frame intervals, long tasks, message → next frame, click → next paint, DOM size.
// 3. Scenarios: __bench.begin(name) prepares the layout and reloads; after the load, __bench.resume('warm') and
//    __bench.resume('run') run it and return a summary (also kept in window.__benchResult).
(() => {
  'use strict';
  if (window.__bench) return;
  const SPAN = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 };
  const B = window.__bench = { cfg: { rate: 1000, dupEvery: 0, replay: 100 }, emitted: {}, delivered: {}, sockets: 0, drops: 0, open: new Set(), log: [] };
  // Every delivered trade id is remembered only for the double-count check; elsewhere that map would itself grow
  // by ~1 million entries an hour and distort the memory measurement.
  try { B.track = JSON.parse(sessionStorage.getItem('bench-pending') || 'null')?.name === 'reconnect'; } catch { B.track = false; }
  const prices = {}, ring = {}, bars = {}, lastBatch = {};
  let tid = 1, base = null;
  fetch('/api/hl/markets').then(r => r.json()).then(d => { for (const m of d.markets || []) if (m.price) prices[m.coin] = m.price; base = true; }).catch(() => { base = true; });
  const keyOf = s => s.type === 'candle' ? `candle:${s.coin}:${s.interval}` : `${s.type}:${s.coin || ''}`;
  const tick = p => p > 1000 ? 1 : p > 100 ? .1 : p > 1 ? .001 : .000001;
  const round = (v, t) => Math.round(v / t) * t;

  class FakeSocket {
    constructor(url) {
      this.url = url; this.readyState = 0; this.subs = new Map(); B.sockets++;
      setTimeout(() => { if (this.readyState !== 0) return; this.readyState = 1; B.open.add(this); this.onopen?.(); }, 30);
    }
    send(text) {
      const m = JSON.parse(text);
      if (m.method === 'ping') return this.deliver({ channel: 'pong' });
      const key = keyOf(m.subscription || {});
      if (m.method === 'subscribe') {
        this.subs.set(key, m.subscription);
        this.deliver({ channel: 'subscriptionResponse', data: { method: 'subscribe', subscription: m.subscription } });
        // Like a real feed after (re)connecting: recent trades again — the page must not count them twice.
        if (m.subscription.type === 'trades' && ring[m.subscription.coin]?.length) this.trades(m.subscription.coin, ring[m.subscription.coin].slice(-B.cfg.replay));
      } else if (m.method === 'unsubscribe') this.subs.delete(key);
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; B.open.delete(this); setTimeout(() => this.onclose?.(), 0); }
    deliver(msg) { if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(msg) }); }
    trades(coin, list) {
      if (this.readyState !== 1 || !this.subs.has('trades:' + coin) || !list.length) return;
      if (B.track) { const seen = B.delivered[coin] ||= new Map(); for (const t of list) seen.set(t.tid, t.time); }
      const t0 = performance.now();
      this.deliver({ channel: 'trades', data: list });
      if (M.running && ++M.sample % 5 === 0) requestAnimationFrame(() => M.lat.push(performance.now() - t0));
    }
  }
  FakeSocket.CONNECTING = 0; FakeSocket.OPEN = 1; FakeSocket.CLOSING = 2; FakeSocket.CLOSED = 3;
  window.WebSocket = FakeSocket;
  B.drop = () => { B.drops++; for (const s of [...B.open]) { s.readyState = 3; B.open.delete(s); s.onclose?.(); } };
  B.subscriptions = () => { const all = new Set(); for (const s of B.open) for (const k of s.subs.keys()) all.add(k); return [...all].sort(); };

  // ---- market engine: one step every 20 ms ----------------------------------------------------------------------
  const carry = {};
  let last = performance.now(), steps = 0, bookAt = 0, ctxAt = 0, candleAt = 0;
  function coins(type) { const set = new Set(); for (const s of B.open) for (const sub of s.subs.values()) if (!type || sub.type === type) if (sub.coin) set.add(sub.coin); return [...set]; }
  setInterval(() => {
    const now = performance.now(), dt = Math.min(200, now - last); last = now; steps++;
    if (!base) return;
    const active = coins();
    const trading = coins('trades'), wall = Date.now();
    for (const coin of active) {
      prices[coin] ||= 100;
      const per = trading.includes(coin) ? B.cfg.rate / Math.max(1, trading.length) : 20;   // background prints move candles too
      carry[coin] = (carry[coin] || 0) + per * dt / 1000;
      const n = Math.floor(carry[coin]); carry[coin] -= n;
      if (!n) continue;
      const list = [];
      for (let i = 0; i < n; i++) {
        const p = prices[coin] = round(prices[coin] * (1 + (Math.random() - .5) * .0004), tick(prices[coin]));
        list.push({ coin, side: Math.random() < .5 ? 'B' : 'A', px: String(p), sz: String(+(Math.random() ** 3 * 5 + .001).toFixed(4)), time: wall, hash: '0x0', tid: tid++ });
      }
      B.emitted[coin] = (B.emitted[coin] || 0) + n;
      const r = ring[coin] ||= []; r.push(...list); if (r.length > 500) r.splice(0, r.length - 500);
      for (const t of list) for (const [key, sub] of candleSubs(coin)) bar(key, sub, t);
      for (const s of B.open) s.trades(coin, list);
      // Occasionally the same batch again (a duplicate delivery).
      if (B.cfg.dupEvery && steps % B.cfg.dupEvery === 0 && lastBatch[coin]) for (const s of B.open) s.trades(coin, lastBatch[coin]);
      lastBatch[coin] = list;
    }
    if (now - candleAt > 250) { candleAt = now; for (const s of B.open) for (const [key, sub] of s.subs) if (sub.type === 'candle' && bars[key]) s.deliver({ channel: 'candle', data: bars[key] }); }
    if (now - bookAt > 500) { bookAt = now; for (const s of B.open) for (const sub of s.subs.values()) if (sub.type === 'l2Book') s.deliver({ channel: 'l2Book', data: book(sub.coin) }); }
    if (now - ctxAt > 1000) { ctxAt = now; for (const s of B.open) for (const sub of s.subs.values()) if (sub.type === 'activeAssetCtx') s.deliver({ channel: 'activeAssetCtx', data: { coin: sub.coin, ctx: context(sub.coin) } }); }
  }, 20);
  function candleSubs(coin) { const out = []; for (const s of B.open) for (const [key, sub] of s.subs) if (sub.type === 'candle' && sub.coin === coin) out.push([key, sub]); return out; }
  function bar(key, sub, t) {
    const span = (SPAN[sub.interval] || 60) * 1000, start = Math.floor(t.time / span) * span, p = Number(t.px);
    let b = bars[key];
    if (!b || b.t !== start) b = bars[key] = { t: start, T: start + span - 1, s: sub.coin, i: sub.interval, o: String(p), h: String(p), l: String(p), c: String(p), v: '0', n: 0 };
    b.h = String(Math.max(+b.h, p)); b.l = String(Math.min(+b.l, p)); b.c = String(p); b.v = String(+b.v + Number(t.sz)); b.n++;
  }
  function book(coin) {
    const p = prices[coin] || 100, t = tick(p), level = (i, side) => ({ px: String(round(p + side * (i + 1) * t, t)), sz: String(+(Math.random() * 8 + .01).toFixed(4)), n: 1 + (i % 5) });
    return { coin, time: Date.now(), levels: [Array.from({ length: 20 }, (_, i) => level(i, -1)), Array.from({ length: 20 }, (_, i) => level(i, 1))] };
  }
  function context(coin) { const p = prices[coin] || 100; return { markPx: String(p), midPx: String(p), prevDayPx: String(p * .99), dayNtlVlm: '100000000', openInterest: '5000', funding: '0.00001' }; }

  // ---- measurements ----------------------------------------------------------------------------------------------
  const M = { running: false, frames: [], long: [], lat: [], inter: [], sample: 0 };
  try { new PerformanceObserver(list => { if (M.running) for (const e of list.getEntries()) M.long.push(e.duration); }).observe({ type: 'longtask' }); M.longSupported = true; } catch { M.longSupported = false; }
  // One frame loop per measurement: a loop from an earlier measurement stops at its next frame.
  const frameLoop = run => function loop(t) { if (!M.running || M.run !== run) return; M.frames.push(t); requestAnimationFrame(loop); };
  function startMeasure() { const run = (M.run || 0) + 1; Object.assign(M, { running: true, run, frames: [], long: [], lat: [], inter: [], sample: 0, t0: performance.now() }); requestAnimationFrame(frameLoop(run)); }
  const nextPaint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  async function interact(fn) { const t0 = performance.now(); fn(); await nextPaint(); M.inter.push(performance.now() - t0); }
  const pct = (list, p) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1); };
  function stopMeasure() {
    M.running = false;
    const gaps = M.frames.slice(1).map((t, i) => t - M.frames[i]), seconds = (performance.now() - M.t0) / 1000;
    return {
      seconds: +seconds.toFixed(1), fps: +(M.frames.length / seconds).toFixed(1),
      frame: { p50: pct(gaps, .5), p95: pct(gaps, .95), p99: pct(gaps, .99), max: pct(gaps, 1), over50: gaps.filter(g => g > 50).length },
      longTasks: M.longSupported ? { n: M.long.length, total: Math.round(M.long.reduce((a, b) => a + b, 0)), max: Math.round(Math.max(0, ...M.long)) } : 'niedostępne w tym silniku',
      messageToFrame: { n: M.lat.length, p50: pct(M.lat, .5), p95: pct(M.lat, .95), max: pct(M.lat, 1) },
      clickToPaint: { n: M.inter.length, p50: pct(M.inter, .5), p95: pct(M.inter, .95), max: pct(M.inter, 1) },
      dom: document.getElementsByTagName('*').length,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    };
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  async function waitFor(test, ms = 15000) { const end = performance.now() + ms; while (performance.now() < end) { if (test()) return true; await sleep(50); } return false; }
  // Light, repeatable interactions while measuring: switch the order-book tab.
  async function poke(stopAt) {
    let tape = true;
    while (performance.now() < stopAt) {
      const tab = $(`[data-book-tab="${tape ? 'dom' : 'tape'}"]`);
      if (tab) await interact(() => tab.click());
      tape = !tape;
      await sleep(2000);
    }
  }
  async function hold(seconds) { const end = performance.now() + seconds * 1000; await Promise.all([poke(end), sleep(seconds * 1000)]); }

  // ---- layouts ---------------------------------------------------------------------------------------------------
  const FULL = {
    'terminal-workspaces-v1': { version: 1, active: 'UNC', layouts: { UNC: { count: 4, markets: true, book: true, sync: true,
      panels: [{ interval: '1m', coin: '', linked: true }, { interval: '5m', coin: 'ETH', linked: false }, { interval: '15m', coin: '', linked: true }] } } },
    'hl-coin': 'BTC', 'hl-interval': '1m',
    'hl-orderflow': { footprint: true, delta: true, profile: true, tradebubbles: true, range: 'visible' },
    'hl-studies': { on: { vwap: true, heatmap: true } }, 'hl-indicators': { volume: true }, 'hl-dom': { tab: 'tape' },
    'tw:UNC:1:ind': { volume: true }, 'tw:UNC:1:orderflow': { footprint: true, delta: true }, 'tw:UNC:1:studies': { on: { rsi: true } },
    'tw:UNC:2:ind': { volume: true }, 'tw:UNC:2:orderflow': { footprint: true, tradebubbles: true }, 'tw:UNC:2:studies': { on: { macd: true } },
    'tw:UNC:3:ind': { tpo: true }, 'tw:UNC:3:orderflow': { profile: true, range: 'session' }, 'tw:UNC:3:studies': { on: { bb: true } },
  };
  const SIMPLE = { 'terminal-workspaces-v1': { version: 1, active: 'BBB', layouts: {} }, 'hl-coin': 'BTC', 'hl-interval': '1m', 'hl-orderflow': { footprint: true }, 'hl-dom': { tab: 'tape' } };

  // ---- scenarios -------------------------------------------------------------------------------------------------
  const scenarios = {
    // 4 charts, order flow on every chart, tape open, 1000 trades/s.
    baseline: { layout: FULL, rate: 1000, warm: 10, async run() { startMeasure(); await hold(60); return stopMeasure(); } },
    // Scrolling and zooming the main chart and a side chart on every frame for 20 s, with the feed at 1000/s.
    pan: { layout: FULL, rate: 1000, warm: 10, async run() {
      const targets = ['#ht-chart', '.tw-companion[data-slot="1"] .tw-chart'].map(s => $(s)).filter(Boolean);
      startMeasure();
      const end = performance.now() + 20000;
      let n = 0;
      await new Promise(done => {
        const step = () => {
          if (performance.now() > end) return done();
          const phase = Math.floor(n / 60) % 4;   // a second each: scroll left, zoom in, scroll right, zoom out
          for (const el of targets) {
            const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
            const canvas = document.elementFromPoint(x, y) || el;
            canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y,
              deltaX: phase === 0 ? -30 : phase === 2 ? 30 : 0, deltaY: phase === 1 ? -40 : phase === 3 ? 40 : 0 }));
          }
          n++; requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      return { ...stopMeasure(), wheelEvents: n * targets.length, charts: targets.length };
    } },
    // 1000/s, then five times that for 10 s, then back: the page must stay responsive and catch up.
    burst: { layout: FULL, rate: 1000, warm: 10, async run() {
      startMeasure(); await hold(10); const before = stopMeasure();
      B.cfg.rate = 5000; startMeasure(); await hold(10); const during = stopMeasure();
      B.cfg.rate = 1000; startMeasure(); await hold(10); const after = stopMeasure();
      return { before, during, after };
    } },
    // 100 market switches on the main chart: time to the new chart, and nothing left behind.
    switch100: { layout: FULL, rate: 300, warm: 8, async run() {
      const markets = ['ETH', 'xyz:XYZ100', 'xyz:SP500', 'BTC'], times = [];
      const subsBefore = B.subscriptions().length;
      startMeasure();
      for (let i = 0; i < 100; i++) {
        const coin = markets[i % markets.length], button = $(`.ht-market[data-coin="${coin}"]`);
        if (!button) { B.log.push('brak rynku ' + coin); continue; }
        const t0 = performance.now();
        button.click();
        const previous = markets[(i + 3) % markets.length];
        const ok = await waitFor(() => B.subscriptions().includes(`candle:${coin}:1m`) && !B.subscriptions().includes(`candle:${previous}:1m`), 10000);
        times.push(ok ? performance.now() - t0 : NaN);
        await sleep(150);
      }
      await sleep(2000);
      const m = stopMeasure(), valid = times.filter(Number.isFinite);
      return { ...m, switches: times.length, failed: times.length - valid.length, switchMs: { p50: pct(valid, .5), p95: pct(valid, .95), max: pct(valid, 1) },
        subscriptions: { before: subsBefore, after: B.subscriptions().length }, sockets: B.sockets, openSockets: B.open.size };
    } },
    // 20 cycles of closing and reopening the side charts and switching layouts.
    panels20: { layout: FULL, rate: 300, warm: 8, async run() {
      const subsBefore = B.subscriptions().length, click = s => interact(() => $(s)?.click());
      startMeasure();
      for (let i = 0; i < 20; i++) {
        await click('[data-count="1"]'); await sleep(300);
        await click('[data-count="4"]'); await sleep(600);
        await click('[data-preset="BBB"]'); await sleep(300);
        await click('[data-preset="UNC"]'); await sleep(600);
      }
      await sleep(3000);
      return { ...stopMeasure(), cycles: 20, subscriptions: { before: subsBefore, after: B.subscriptions().length }, openSockets: B.open.size };
    } },
    // Five dropped connections, duplicate batches and a replay on every resubscription: no trade may count twice.
    reconnect: { layout: SIMPLE, rate: 200, warm: 5, async run() {
      B.cfg.dupEvery = 40;
      startMeasure();
      const gaps = [];
      for (let i = 0; i < 5; i++) {
        await sleep(6000); B.drop();
        gaps.push(await waitFor(() => /przerwa/.test($('.tw-data-status')?.textContent || ''), 3000));
        await waitFor(() => B.open.size > 0, 40000);
      }
      await sleep(6000);
      const m = stopMeasure(), of = window.TerminalOrderflow?.instances ? [...TerminalOrderflow.instances][0] : null;
      const stored = of ? of.trades : [], ids = stored.map(t => t.id.split(':').at(-1));
      const unique = new Set(ids), delivered = B.delivered.BTC || new Map();
      // Order flow may join the shared feed a moment after it started: compare from its first stored trade on.
      const from = stored[0]?.time ?? Infinity, due = [...delivered].filter(([, time]) => time >= from), missing = due.filter(([id]) => !unique.has(String(id)));
      return { ...m, drops: B.drops, gapShown: gaps, delivered: due.length, stored: stored.length, doubleCounted: stored.length - unique.size,
        deliveredButMissing: missing.length, emitted: B.emitted.BTC, sockets: B.sockets, storedFrom: from,
        check: { instances: window.TerminalOrderflow?.instances?.size, storedCoins: [...new Set(stored.map(t => t.id.split(':').slice(1, -1).join(':')))],
          deliveredTotal: delivered.size, deliveredRange: delivered.size ? [Math.min(...delivered.values()), Math.max(...delivered.values())] : null,
          storedRange: stored.length ? [stored[0].time, stored.at(-1).time] : null, missingSample: missing.slice(0, 3) } };
    } },
    // Long session: samples every minute (the Chrome harness adds heap after garbage collection).
    session: { layout: FULL, rate: 300, warm: 10, async run(minutes = 60) {
      const samples = [];
      for (let i = 0; i < minutes; i++) { startMeasure(); await hold(60); const m = stopMeasure(); samples.push({ minute: i + 1, fps: m.fps, p95: m.frame.p95, over50: m.frame.over50, long: m.longTasks, dom: m.dom, heapMB: m.heapMB }); B.progress = samples; }
      return { minutes, samples };
    } },
  };

  B.begin = (name, opts = {}) => {
    const s = scenarios[name];
    if (!s) throw new Error('nieznany scenariusz ' + name);
    localStorage.clear();
    for (const [k, v] of Object.entries(s.layout)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    sessionStorage.setItem('bench-pending', JSON.stringify({ name, opts }));
    location.reload();
    return 'reloading';
  };
  B.resume = async phase => {
    const pending = JSON.parse(sessionStorage.getItem('bench-pending') || 'null');
    if (!pending) throw new Error('brak scenariusza: najpierw __bench.begin(name)');
    const s = scenarios[pending.name];
    if (phase === 'warm') {
      B.cfg.rate = s.rate;
      await waitFor(() => typeof window.tab === 'function' && base, 20000);
      window.tab('hyper-terminal');
      await waitFor(() => B.open.size > 0, 20000);
      await sleep(s.warm * 1000);
      return { warmed: s.warm, subscriptions: B.subscriptions() };
    }
    const result = { scenario: pending.name, rate: s.rate, userAgent: navigator.userAgent, dpr: devicePixelRatio, viewport: [innerWidth, innerHeight], ...(await s.run(pending.opts.minutes)), log: B.log };
    sessionStorage.removeItem('bench-pending');
    return window.__benchResult = result;
  };
})();
