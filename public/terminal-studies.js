// Pure calculations behind the extra chart studies (no DOM): VWAP, anchored VWAP, volume profiles,
// key levels, volume bubbles, bar statistics and order book depth. Candles are
// { time (unix seconds), open, high, low, close, volume }.
(function (root) {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const sound = c => !!c && [c.time, c.open, c.high, c.low, c.close].every(finite) && c.high >= c.low;
  const volumeOf = c => finite(c.volume) && c.volume > 0 ? c.volume : 0;
  const typical = c => (c.high + c.low + c.close) / 3;
  const DAY = 86400;
  // Weekdays follow UTC and Monday starts the week (the Unix epoch fell on a Thursday).
  const weekday = t => (Math.floor(t / DAY) + 4) % 7;   // 0 = Sunday ... 6 = Saturday
  function periodKey(t, reset) {
    if (reset === 'day') return Math.floor(t / DAY);
    if (reset === 'week') return Math.floor((t - 4 * DAY) / (7 * DAY));
    if (reset === 'month') { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); }
    return 0;
  }

  // Volume weighted average price. `reset` restarts the sum every day / week / month (or never).
  // `sd` is the volume weighted standard deviation around it, used for the bands.
  function vwap(candles, { reset = 'day' } = {}) {
    const out = [];
    let key = null, pv = 0, v = 0, p2v = 0;
    for (const c of candles) {
      if (!sound(c)) continue;
      const k = periodKey(c.time, reset);
      if (k !== key) { key = k; pv = v = p2v = 0; }
      const volume = volumeOf(c), price = typical(c);
      pv += price * volume; v += volume; p2v += price * price * volume;
      if (v > 0) { const value = pv / v; out.push({ time: c.time, value, sd: Math.sqrt(Math.max(0, p2v / v - value * value)) }); }
    }
    return out;
  }
  // The same average anchored to one bar: everything before `anchorTime` is ignored.
  function anchoredVwap(candles, anchorTime) {
    const out = [];
    let pv = 0, v = 0, p2v = 0;
    for (const c of candles) {
      if (!sound(c) || c.time < anchorTime) continue;
      const volume = volumeOf(c), price = typical(c);
      pv += price * volume; v += volume; p2v += price * price * volume;
      if (v > 0) { const value = pv / v; out.push({ time: c.time, value, sd: Math.sqrt(Math.max(0, p2v / v - value * value)) }); }
    }
    return out;
  }

  // Volume by price. Every candle spreads its volume evenly over the rows its high-low range touches;
  // the split into up/down follows the candle's colour. Time range is [from, to).
  function volumeProfile(candles, { from = -Infinity, to = Infinity, rows = 24, valueArea = 0.7 } = {}) {
    const list = candles.filter(c => sound(c) && c.time >= from && c.time < to);
    if (!list.length) return null;
    const low = Math.min(...list.map(c => c.low)), high = Math.max(...list.map(c => c.high));
    const count = Math.max(1, Math.min(200, Math.round(rows)));
    const size = high > low ? (high - low) / count : 0;
    const grid = Array.from({ length: size ? count : 1 }, (_, i) => ({ low: size ? low + i * size : low, high: size ? low + (i + 1) * size : high, up: 0, down: 0, total: 0 }));
    for (const c of list) {
      const volume = volumeOf(c);
      if (!volume) continue;
      const side = c.close >= c.open ? 'up' : 'down';
      if (!size || c.high === c.low) {
        const row = grid[size ? Math.min(grid.length - 1, Math.floor((c.low - low) / size)) : 0];
        row[side] += volume; row.total += volume;
        continue;
      }
      const first = Math.max(0, Math.floor((c.low - low) / size)), last = Math.min(grid.length - 1, Math.floor((c.high - low) / size - 1e-12));
      for (let i = first; i <= last; i++) {
        const overlap = Math.min(c.high, grid[i].high) - Math.max(c.low, grid[i].low);
        if (overlap <= 0) continue;
        const share = volume * overlap / (c.high - c.low);
        grid[i][side] += share; grid[i].total += share;
      }
    }
    const total = grid.reduce((n, r) => n + r.total, 0);
    const middle = (grid.length - 1) / 2;
    let poc = 0;
    grid.forEach((r, i) => { if (r.total > grid[poc].total || r.total === grid[poc].total && Math.abs(i - middle) < Math.abs(poc - middle)) poc = i; });
    // Value area: grow from the point of control towards the heavier neighbour until it holds `valueArea` of the volume.
    let bottom = poc, top = poc, held = grid[poc].total;
    while (held < total * valueArea && (bottom > 0 || top < grid.length - 1)) {
      const above = top < grid.length - 1 ? grid[top + 1].total : -1, below = bottom > 0 ? grid[bottom - 1].total : -1;
      if (above >= below) held += grid[++top].total; else held += grid[--bottom].total;
    }
    grid.forEach((r, i) => { r.mid = (r.low + r.high) / 2; r.poc = i === poc; r.valueArea = i >= bottom && i <= top; });
    return { rows: grid, poc, pocPrice: grid[poc].mid, vah: grid[top].high, val: grid[bottom].low, total, low, high, from: list[0].time, to: list[list.length - 1].time, count: list.length };
  }
  // One profile per UTC day or week (session volume).
  function sessionProfiles(candles, { period = 'day', rows = 24, valueArea = 0.7 } = {}) {
    const groups = new Map();
    for (const c of candles) {
      if (!sound(c)) continue;
      const k = periodKey(c.time, period);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const out = [];
    for (const list of groups.values()) {
      const profile = volumeProfile(list, { rows, valueArea });
      if (profile && profile.total > 0) out.push(profile);
    }
    return out;
  }

  // Open / high / low of the current and the previous day, week and month, plus Monday and weekend.
  // Levels at the same price are merged into one label ("Monday High / Weekly High").
  function keyLevels({ daily = [], weekly = [], monthly = [] }, now = Math.floor(Date.now() / 1000)) {
    const upto = list => list.filter(c => sound(c) && c.time <= now).sort((a, b) => a.time - b.time);
    const d = upto(daily), w = upto(weekly), m = upto(monthly);
    const raw = [];
    const add = (label, price, group) => { if (finite(price)) raw.push({ label, price, group }); };
    const pair = (list, name, previous, group) => {
      const cur = list.at(-1), prev = list.at(-2);
      if (cur) { add(name + ' Open', cur.open, group); add(name + ' High', cur.high, group); add(name + ' Low', cur.low, group); }
      if (prev) { add(previous + ' High', prev.high, group); add(previous + ' Low', prev.low, group); }
    };
    pair(d, 'Daily', 'Prev Day', 'day');
    if (d.at(-2)) add('Prev Day Close', d.at(-2).close, 'day');
    pair(w, 'Weekly', 'Prev Week', 'week');
    pair(m, 'Monthly', 'Prev Month', 'month');
    const mondays = d.filter(c => weekday(c.time) === 1);
    if (mondays.at(-1)) { add('Monday High', mondays.at(-1).high, 'monday'); add('Monday Low', mondays.at(-1).low, 'monday'); }
    if (mondays.at(-2)) { add('Prev Monday High', mondays.at(-2).high, 'monday'); add('Prev Monday Low', mondays.at(-2).low, 'monday'); }
    const saturday = [...d].reverse().find(c => weekday(c.time) === 6);
    if (saturday) {
      const weekend = d.filter(c => c.time >= saturday.time && c.time < saturday.time + 2 * DAY);
      add('Weekend High', Math.max(...weekend.map(c => c.high)), 'weekend'); add('Weekend Low', Math.min(...weekend.map(c => c.low)), 'weekend');
    }
    const merged = [];
    for (const level of raw.sort((a, b) => a.price - b.price)) {
      const last = merged.at(-1);
      if (last && Math.abs(last.price - level.price) <= Math.abs(level.price) * 1e-9) { last.labels.push(level.label); if (!last.groups.includes(level.group)) last.groups.push(level.group); }
      else merged.push({ price: level.price, labels: [level.label], groups: [level.group] });
    }
    return merged.map(l => ({ price: l.price, title: l.labels.join(' / '), group: l.groups[0] }));
  }

  // The heaviest candles by volume, with a radius ratio (0..1] relative to the heaviest one.
  function bubbles(candles, { top = 0.1, max = 80 } = {}) {
    const list = candles.filter(c => sound(c) && volumeOf(c) > 0);
    if (!list.length) return [];
    const count = Math.max(1, Math.min(max, Math.ceil(list.length * top)));
    const heavy = [...list].sort((a, b) => b.volume - a.volume).slice(0, count);
    const most = heavy[0].volume;
    return heavy.sort((a, b) => a.time - b.time).map(c => ({ time: c.time, price: (c.open + c.close) / 2, volume: c.volume, ratio: Math.sqrt(c.volume / most), up: c.close >= c.open }));
  }

  function barStats(c, previous) {
    if (!sound(c)) return null;
    const range = c.high - c.low, body = Math.abs(c.close - c.open);
    return {
      range, body, bodyPercent: range > 0 ? body / range * 100 : 0,
      upperWick: c.high - Math.max(c.open, c.close), lowerWick: Math.min(c.open, c.close) - c.low,
      changePercent: c.open ? (c.close - c.open) / c.open * 100 : 0,
      gapPercent: previous && previous.close ? (c.open - previous.close) / previous.close * 100 : 0,
      volume: volumeOf(c),
      // No trade data here: a candle's delta is estimated from where it closed inside its range.
      estimatedDelta: range > 0 ? volumeOf(c) * ((c.close - c.open) / range) : 0,
    };
  }

  // Order book helpers. Levels are { px, sz } as strings or numbers, bids best first.
  const levels = list => (list || []).map(l => ({ price: Number(l.px), size: Number(l.sz) })).filter(l => finite(l.price) && finite(l.size) && l.size > 0);
  function bookDepth(book) {
    const bids = levels(book.bids).sort((a, b) => b.price - a.price), asks = levels(book.asks).sort((a, b) => a.price - b.price);
    let sum = 0;
    const bidCurve = bids.map(l => ({ price: l.price, cumulative: sum += l.size }));
    sum = 0;
    const askCurve = asks.map(l => ({ price: l.price, cumulative: sum += l.size }));
    return { bids: bidCurve, asks: askCurve, mid: bids.length && asks.length ? (bids[0].price + asks[0].price) / 2 : null };
  }
  // Resting size per price row within ±span of the mid price.
  function bookProfile(book, { rows = 40, span = 0.02 } = {}) {
    const depth = bookDepth(book);
    if (depth.mid === null) return null;
    const low = depth.mid * (1 - span), high = depth.mid * (1 + span), size = (high - low) / rows;
    const grid = Array.from({ length: rows }, (_, i) => ({ low: low + i * size, high: low + (i + 1) * size, bid: 0, ask: 0 }));
    for (const l of levels(book.bids)) { const i = Math.floor((l.price - low) / size); if (i >= 0 && i < rows) grid[i].bid += l.size; }
    for (const l of levels(book.asks)) { const i = Math.floor((l.price - low) / size); if (i >= 0 && i < rows) grid[i].ask += l.size; }
    return { rows: grid, mid: depth.mid, low, high };
  }

  const api = { vwap, anchoredVwap, volumeProfile, sessionProfiles, keyLevels, bubbles, barStats, bookDepth, bookProfile, periodKey, weekday };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TerminalStudiesMath = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
