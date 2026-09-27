const assert = require('node:assert/strict');
const S = require('../public/terminal-studies.js');
const at = s => Date.parse(s) / 1000;
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const candle = (t, o, h, l, c, v) => ({ time: at(t), open: o, high: h, low: l, close: c, volume: v });

// Weekdays and periods (2026-09-21 is a Monday).
assert.equal(S.weekday(at('2026-09-21T12:00:00Z')), 1);
assert.equal(S.weekday(at('2026-09-27T12:00:00Z')), 0);
assert.equal(S.periodKey(at('2026-09-21T00:00:00Z'), 'week'), S.periodKey(at('2026-09-27T23:59:00Z'), 'week'));
assert.notEqual(S.periodKey(at('2026-09-27T23:59:00Z'), 'week'), S.periodKey(at('2026-09-28T00:00:00Z'), 'week'));

// VWAP: volume weighted typical price, restarting each UTC day; the band is the weighted deviation.
const v = S.vwap([
  candle('2026-09-21T10:00:00Z', 10, 10, 10, 10, 1), candle('2026-09-21T11:00:00Z', 20, 20, 20, 20, 3),
  candle('2026-09-22T10:00:00Z', 30, 30, 30, 30, 1), { time: at('2026-09-22T11:00:00Z'), open: NaN, high: 1, low: 1, close: 1, volume: 1 },
]);
assert.equal(v.length, 3);
near(v[0].value, 10); near(v[1].value, 17.5);
near(v[1].sd, Math.sqrt((10 * 10 * 1 + 20 * 20 * 3) / 4 - 17.5 ** 2));
near(v[2].value, 30); near(v[2].sd, 0);   // new day: the sum restarted
assert.equal(S.vwap([candle('2026-09-21T10:00:00Z', 1, 1, 1, 1, 0)]).length, 0);   // no volume, no VWAP
const week = S.vwap([candle('2026-09-21T10:00:00Z', 10, 10, 10, 10, 1), candle('2026-09-22T10:00:00Z', 30, 30, 30, 30, 1)], { reset: 'week' });
near(week[1].value, 20);

// Anchored VWAP ignores everything before the anchor.
const a = S.anchoredVwap([candle('2026-09-21T10:00:00Z', 5, 5, 5, 5, 100), candle('2026-09-21T11:00:00Z', 10, 10, 10, 10, 1), candle('2026-09-21T12:00:00Z', 20, 20, 20, 20, 1)], at('2026-09-21T11:00:00Z'));
assert.equal(a.length, 2); near(a[0].value, 10); near(a[1].value, 15);

// Volume profile: one candle spreads its volume evenly over the rows it touches.
const p = S.volumeProfile([candle('2026-09-21T10:00:00Z', 0, 10, 0, 10, 10)], { rows: 5 });
assert.equal(p.rows.length, 5);
p.rows.forEach(r => near(r.total, 2));
near(p.total, 10); near(p.rows[0].up, 2); near(p.rows[0].down, 0);
assert.equal(p.poc, 2);   // a tie resolves to the row nearest the middle
// Two candles: the heavier price zone becomes the point of control and the value area.
const q = S.volumeProfile([candle('2026-09-21T10:00:00Z', 4, 5, 4, 5, 90), candle('2026-09-21T11:00:00Z', 9, 10, 0, 1, 10)], { rows: 10, valueArea: 0.7 });
assert.equal(q.poc, 4);
near(q.pocPrice, 4.5);
assert.ok(q.rows[4].valueArea && !q.rows[9].valueArea && q.vah >= 5 && q.val <= 4);
near(q.rows[4].down, 1);   // the second (falling) candle adds a tenth of its volume to this row
assert.equal(S.volumeProfile([], {}), null);
assert.equal(S.volumeProfile([candle('2026-09-21T10:00:00Z', 1, 2, 1, 2, 5)], { from: at('2026-09-22T00:00:00Z') }), null);
// Flat candle and time range
const flat = S.volumeProfile([candle('2026-09-21T10:00:00Z', 5, 5, 5, 5, 7)], { rows: 8 });
assert.equal(flat.rows.length, 1); near(flat.total, 7);
const ranged = S.volumeProfile([candle('2026-09-21T10:00:00Z', 1, 2, 1, 2, 1), candle('2026-09-22T10:00:00Z', 1, 2, 1, 2, 5)], { from: at('2026-09-22T00:00:00Z'), to: at('2026-09-23T00:00:00Z'), rows: 4 });
near(ranged.total, 5); assert.equal(ranged.count, 1);

// Session profiles: one per day, days without volume are dropped.
const sessions = S.sessionProfiles([
  candle('2026-09-21T10:00:00Z', 1, 2, 1, 2, 4), candle('2026-09-21T11:00:00Z', 2, 3, 2, 3, 4), candle('2026-09-22T10:00:00Z', 1, 2, 1, 2, 0), candle('2026-09-23T10:00:00Z', 1, 2, 1, 2, 2),
], { period: 'day', rows: 4 });
assert.deepEqual(sessions.map(s => s.total), [8, 2]);

// Key levels from daily/weekly/monthly bars; equal prices are merged into one line.
const daily = [
  candle('2026-09-19T00:00:00Z', 90, 100, 85, 95, 1), candle('2026-09-20T00:00:00Z', 95, 99, 94, 96, 1),   // Sat, Sun
  candle('2026-09-21T00:00:00Z', 96, 120, 90, 110, 1),   // Monday
  candle('2026-09-22T00:00:00Z', 110, 118, 100, 105, 1),  // Tuesday: previous day
  candle('2026-09-23T00:00:00Z', 105, 120, 101, 108, 1),  // Wednesday: today, high equals Monday's
];
const weeklyBars = [candle('2026-09-14T00:00:00Z', 80, 130, 70, 96, 1), candle('2026-09-21T00:00:00Z', 96, 120, 90, 108, 1)];
const monthlyBars = [candle('2026-08-01T00:00:00Z', 60, 140, 50, 95, 1), candle('2026-09-01T00:00:00Z', 95, 130, 70, 108, 1)];
const lv = S.keyLevels({ daily, weekly: weeklyBars, monthly: monthlyBars }, at('2026-09-23T12:00:00Z'));
const byTitle = title => lv.find(l => l.title.split(' / ').includes(title));
near(byTitle('Daily Open').price, 105); near(byTitle('Prev Day High').price, 118); near(byTitle('Prev Day Close').price, 105);
near(byTitle('Prev Week High').price, 130); near(byTitle('Monthly Low').price, 70); near(byTitle('Prev Month High').price, 140);
near(byTitle('Monday High').price, 120); near(byTitle('Monday Low').price, 90);
near(byTitle('Weekend High').price, 100); near(byTitle('Weekend Low').price, 85);
assert.deepEqual(lv.find(l => l.price === 120).title.split(' / ').sort(), ['Daily High', 'Monday High', 'Weekly High']);   // merged
assert.equal(lv.find(l => l.price === 105).title.split(' / ').includes('Daily Open') && lv.find(l => l.price === 105).title.includes('Prev Day Close'), true);
assert.deepEqual(lv.map(l => l.price), [...lv.map(l => l.price)].sort((x, y) => x - y));
assert.deepEqual(S.keyLevels({}, at('2026-09-23T12:00:00Z')), []);
const noWeekend = S.keyLevels({ daily, weekly: weeklyBars, monthly: monthlyBars }, at('2026-09-23T12:00:00Z'), { weekend: false, monday: false });
assert.ok(!noWeekend.some(l => /Weekend|Monday/.test(l.title)));   // switched-off groups leave no trace, even inside merged labels
assert.ok(noWeekend.some(l => l.title.includes('Daily High')));
assert.equal(S.keyLevels({ daily }, at('2026-09-20T12:00:00Z')).some(l => l.title.includes('Monday')), false);   // no Monday yet

// Bubbles: the heaviest fraction of candles; ratio is relative to the heaviest.
const many = Array.from({ length: 20 }, (_, i) => candle(`2026-09-21T${String(i).padStart(2, '0')}:00:00Z`, 1, 2, 1, i % 2 ? 2 : 1, i + 1));
const b = S.bubbles(many, { top: 0.1 });
assert.deepEqual(b.map(x => x.volume), [19, 20]);
near(b.at(-1).ratio, 1); near(b[0].ratio, Math.sqrt(19 / 20)); assert.equal(b.at(-1).up, true);
assert.deepEqual(S.bubbles([]), []);

// Bar statistics.
const stat = S.barStats(candle('2026-09-22T00:00:00Z', 10, 20, 5, 15, 100), candle('2026-09-21T00:00:00Z', 9, 10, 8, 8, 1));
near(stat.range, 15); near(stat.body, 5); near(stat.bodyPercent, 100 / 3); near(stat.upperWick, 5); near(stat.lowerWick, 5);
near(stat.changePercent, 50); near(stat.gapPercent, 25); near(stat.estimatedDelta, 100 * 5 / 15);
assert.equal(S.barStats({ time: 1 }), null);

// Order book: cumulative depth and resting size per price row.
const book = { bids: [{ px: '99', sz: '2' }, { px: '100', sz: '1' }, { px: 'x', sz: '1' }], asks: [{ px: '101', sz: '3' }, { px: '102', sz: '1' }] };
const depth = S.bookDepth(book);
assert.deepEqual(depth.bids, [{ price: 100, cumulative: 1 }, { price: 99, cumulative: 3 }]);
assert.deepEqual(depth.asks, [{ price: 101, cumulative: 3 }, { price: 102, cumulative: 4 }]);
near(depth.mid, 100.5);
const bp = S.bookProfile(book, { rows: 4, span: 0.02 });
near(bp.rows.reduce((n, r) => n + r.bid, 0), 3); near(bp.rows.reduce((n, r) => n + r.ask, 0), 4);
assert.equal(S.bookProfile({ bids: [], asks: [] }), null);

// Classic studies, checked by hand on tiny series.
const bars = closes => closes.map((c, i) => ({ time: 1000 + i * 60, open: c, high: c, low: c, close: c, volume: 1 }));
const values = list => list.map(p => +p.value.toFixed(9));
assert.deepEqual(values(S.sma(bars([1, 2, 3, 4, 5]), 3)), [2, 3, 4]);
assert.deepEqual(values(S.ema(bars([1, 2, 3, 4, 5]), 3)), [2, 3, 4]);   // seeded with the SMA, then k = 2 / (3 + 1)
assert.equal(S.ema(bars([1, 2]), 3).length, 0);
assert.deepEqual(values(S.rsi(bars([1, 2, 1, 2]), 2)), [50, 75]);        // Wilder smoothing of gains / losses
assert.deepEqual(values(S.rsi(bars([1, 2, 3, 4]), 2)), [100, 100]);
assert.deepEqual(values(S.rsi(bars([4, 3, 2, 1]), 2)), [0, 0]);
assert.deepEqual(values(S.rsi(bars([2, 2, 2]), 2)), [50]);
const bb = S.bollinger(bars([1, 3]), { length: 2, mult: 1 });
near(bb[0].middle, 2); near(bb[0].upper, 3); near(bb[0].lower, 1);
const atrBars = [{ time: 1, open: 1, high: 2, low: 0, close: 1 }, { time: 2, open: 1, high: 3, low: 1, close: 2 }, { time: 3, open: 4, high: 5, low: 4, close: 4.5 }];
assert.deepEqual(values(S.atr(atrBars, 2)), [2, 2.5]);                   // true range counts the gap from the previous close
const m = S.macd(bars([1, 2, 3, 4, 5]), { fast: 2, slow: 3, signal: 2 });
assert.deepEqual(m.map(p => +p.macd.toFixed(9)), [0.5, 0.5, 0.5]);
assert.equal(m[0].signal, null); near(m[1].signal, 0.5); near(m[2].histogram, 0);

console.log('PASS terminal studies: VWAP, anchored VWAP, volume profiles, key levels, bubbles, bar stats, order book depth, SMA / EMA / RSI / Bollinger / ATR / MACD');
