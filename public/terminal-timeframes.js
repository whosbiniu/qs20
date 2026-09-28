// Timeframes of the terminal: Hyperliquid's own intervals plus the user's (6h, 90m, 2d...). A user timeframe that
// Hyperliquid does not serve is built from the largest native interval that divides it (6h from 2h, 90m from 30m),
// in UTC buckets counted from the Unix epoch; multi-week frames start on Monday like Hyperliquid's weeks.
(function (root) {
  'use strict';
  const NATIVE = { '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '8h': 480, '12h': 720, '1d': 1440, '3d': 4320, '1w': 10080, '1M': 43200 };
  // Bases for building a frame: their buckets line up with epoch-aligned multiples (not 3d, 1w or 1M).
  const BASES = ['1d', '12h', '8h', '4h', '2h', '1h', '30m', '15m', '5m', '3m', '1m'];
  const UNIT = { m: 1, h: 60, d: 1440, w: 10080 };
  const WEEK_OFFSET = 4 * 86400;   // the epoch fell on a Thursday: Monday-based weeks start 4 days later
  const MAX_MINUTES = 4 * 10080, MAX_BARS = 5000, TARGET_BARS = 350, KEY = 'hl-custom-periods';
  const BUILT_IN = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];

  // "6h", "h6", "6H", "90m", "m90", "90", "2d", "1w" -> canonical label, or null. "1M" (month) is the only capital M.
  function normalize(text) {
    const raw = String(text ?? '').trim();
    if (raw === '1M') return '1M';
    const s = raw.toLowerCase().replace(/\s+/g, '').replace(/min$/, 'm');
    const match = s.match(/^(\d{1,5})([mhdw]?)$/) || s.match(/^([mhdw])(\d{1,5})$/);
    if (!match) return null;
    const [count, unit] = /^\d/.test(match[1]) ? [Number(match[1]), match[2] || 'm'] : [Number(match[2]), match[1]];
    const minutes = count * UNIT[unit];
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) return null;
    return labelOf(minutes);
  }
  function labelOf(minutes) {
    for (const [unit, size] of [['w', 10080], ['d', 1440], ['h', 60]]) if (minutes % size === 0) return minutes / size + unit;
    return minutes + 'm';
  }
  // { label, minutes, seconds, base, ratio, native }
  function parse(label) {
    if (NATIVE[label]) return { label, minutes: NATIVE[label], seconds: NATIVE[label] * 60, base: label, ratio: 1, native: true };
    const canonical = normalize(label);
    if (!canonical) return null;
    if (NATIVE[canonical]) return parse(canonical);
    const minutes = canonical === '1M' ? 43200 : parseInt(canonical, 10) * UNIT[canonical.slice(-1)];
    const base = BASES.find(b => minutes % NATIVE[b] === 0);
    return { label: canonical, minutes, seconds: minutes * 60, base, ratio: minutes / NATIVE[base], native: false };
  }
  // Start of the bucket (unix seconds) that contains `time`.
  function bucket(time, frame) {
    const f = typeof frame === 'string' ? parse(frame) : frame;
    if (!f) return time;
    if (f.label === '1M') { const d = new Date(time * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; }
    const offset = f.minutes % 10080 === 0 ? WEEK_OFFSET : 0;
    return Math.floor((time - offset) / f.seconds) * f.seconds + offset;
  }
  // Base candles (sorted) -> candles of the frame. The last bucket may still be forming.
  function aggregate(candles, frame) {
    const f = typeof frame === 'string' ? parse(frame) : frame;
    if (!f || f.native) return candles.slice();
    const out = [];
    for (const c of candles) {
      const time = bucket(c.time, f), last = out[out.length - 1];
      if (last && last.time === time) {
        last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close;
        last.volume = (last.volume || 0) + (Number.isFinite(c.volume) ? c.volume : 0);
      } else out.push({ time, open: c.open, high: c.high, low: c.low, close: c.close, volume: Number.isFinite(c.volume) ? c.volume : 0 });
    }
    return out;
  }
  // How many base candles to ask for: enough for ~350 bars of the frame, within Hyperliquid's 5000 limit.
  const barsFor = f => f.native ? null : Math.min(MAX_BARS, TARGET_BARS * f.ratio);
  // Candles of any frame from the terminal API. Also returns the base candles, so a live base candle can be merged.
  async function load(fetchJson, coin, label, options) {
    const f = parse(label);
    if (!f) throw new Error('Nieprawidłowy interwał');
    const bars = barsFor(f);
    const { candles } = await fetchJson(`/api/hl/candles?coin=${encodeURIComponent(coin)}&interval=${f.base}${bars ? '&bars=' + bars : ''}`, options);
    return { candles: aggregate(candles, f), base: candles, frame: f };
  }

  // ---- the user's list ----------------------------------------------------------------------------
  const storage = () => { try { return root.localStorage; } catch { return null; } };
  function custom() {
    try { const list = JSON.parse(storage()?.getItem(KEY) || '[]'); return Array.isArray(list) ? list.map(normalize).filter(l => l && !BUILT_IN.includes(l)) : []; } catch { return []; }
  }
  const sorted = list => [...new Set(list)].sort((a, b) => parse(a).minutes - parse(b).minutes);
  function save(list) {
    const value = JSON.stringify(sorted(list));
    if (root.Store) root.Store.set(KEY, value); else storage()?.setItem(KEY, value);
    root.dispatchEvent?.(new CustomEvent('timeframeschange'));
  }
  // Adds a frame; returns its label, or null when the text is not a timeframe (or it is already built in).
  function add(text) {
    const label = normalize(text);
    if (!label) return null;
    if (!BUILT_IN.includes(label) && !custom().includes(label)) save([...custom(), label]);
    return label;
  }
  function remove(label) { save(custom().filter(l => l !== label)); }
  const all = () => sorted([...BUILT_IN, ...custom()]);

  const api = { NATIVE, BUILT_IN, normalize, parse, bucket, aggregate, barsFor, load, custom, add, remove, all };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TerminalTimeframes = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
