// Order-flow analysis on small fixtures worked out by hand: diagonal and stacked imbalances (including x/0), value
// area ties, trading sessions across daylight-saving changes, aggregated large orders and per-session profiles.
const assert = require('node:assert/strict')
global.globalThis = global
require('../public/terminal-orderflow.js')
const { valueArea, imbalances, sessionKey, bigTrades, calculate, barDetail } = globalThis.TerminalOrderflow

// ---- diagonal imbalance, step 1 --------------------------------------------------------------------------------
// price: bid × ask   → buy imbalance compares ask(p) with bid(p-1); sell imbalance compares bid(p) with ask(p+1)
// 100:   2 × 1        lowest level: no traded level below → never an imbalance
// 101:   1 × 7        7 ≥ 3·2 → buy
// 102:   0 × 4        4 ≥ 3·1 → buy
// 103:   1 × 3        3 vs 0 (level 102 traded, no sellers) → buy; bid 1 vs level 104 (never traded) → nothing
const level = (price, bid, ask) => ({ price, bid, ask, total: bid + ask, delta: ask - bid })
const makeBar = () => ({ time: 0, levels: new Map([[100, level(100, 2, 1)], [101, level(101, 1, 7)], [102, level(102, 0, 4)], [103, level(103, 1, 3)]]) })
let bar = makeBar()
let zones = imbalances(bar, 1, 3, 0, 3)
assert.deepEqual([100, 101, 102, 103].map(i => bar.levels.get(i).buyImbalance), [false, true, true, true])
assert.deepEqual([100, 101, 102, 103].map(i => bar.levels.get(i).sellImbalance), [false, false, false, false])
assert.deepEqual(zones, [{ time: 0, side: 'buy', low: 101, high: 104, count: 3 }])
// x/0 needs the minimum volume: 3 buys against no sellers count with a minimum of 3, not with 4.
bar = makeBar(); imbalances(bar, 1, 3, 3, 3); assert.equal(bar.levels.get(103).buyImbalance, true)
bar = makeBar(); zones = imbalances(bar, 1, 3, 4, 3); assert.equal(bar.levels.get(103).buyImbalance, false)
assert.equal(bar.levels.get(101).buyImbalance, true); assert.deepEqual(zones, [])
// Sellers against no buyers one level up.
bar = { time: 0, levels: new Map([[1, level(1, 5, 0)], [2, level(2, 0, 0.5)]]) }
imbalances(bar, 1, 3, 0, 1); assert.equal(bar.levels.get(1).sellImbalance, true)
// Four in a row are needed with stack = 4: no zone.
bar = makeBar(); assert.deepEqual(imbalances(bar, 1, 3, 0, 4), [])
// Empty levels never divide by zero and never count.
bar = { time: 0, levels: new Map([[1, level(1, 0, 0)], [2, level(2, 0, 0)]]) }
assert.deepEqual(imbalances(bar, 1, 3, 0, 1), [])

// ---- value area and POC ties --------------------------------------------------------------------------------
const rows = totals => totals.map((total, i) => ({ price: i, total }))
assert.equal(valueArea(rows([1, 3, 3, 1])).pocIndex, 1, 'tie at equal distance from the middle: the lower price')
assert.equal(valueArea(rows([2, 5, 5, 5, 2])).pocIndex, 2, 'tie: the level nearest the middle')
const va = valueArea(rows([1, 2, 6, 2, 1]))           // total 12, 70 % = 8.4: POC 6, then 2 (upper first on a tie), then 2
assert.deepEqual([va.pocIndex, va.bottom, va.top, va.total], [2, 1, 3, 12])
assert.equal(valueArea([]), null)

// ---- sessions with daylight saving ----------------------------------------------------------------------------
// CME Globex opens 18:00 New York time; the evening belongs to the next trading day. US clocks moved on 2026-03-08.
assert.equal(sessionKey(Date.parse('2026-03-06T22:59:00Z'), 'ny'), '2026-03-06')   // 17:59 EST
assert.equal(sessionKey(Date.parse('2026-03-06T23:00:00Z'), 'ny'), '2026-03-07')   // 18:00 EST
assert.equal(sessionKey(Date.parse('2026-03-09T21:59:00Z'), 'ny'), '2026-03-09')   // 17:59 EDT
assert.equal(sessionKey(Date.parse('2026-03-09T22:00:00Z'), 'ny'), '2026-03-10')   // 18:00 EDT
assert.equal(sessionKey(Date.parse('2026-03-06T23:30:00Z'), 'utc'), '2026-03-06')
assert.equal(sessionKey(Date.parse('2026-03-28T23:30:00Z'), 'warsaw'), '2026-03-29')  // 00:30 CET
assert.equal(sessionKey(Date.parse('2026-03-29T22:30:00Z'), 'warsaw'), '2026-03-30')  // 00:30 CEST, after the change

// ---- large orders from executed fills -----------------------------------------------------------------------------
const fills = [{ time: 1, buy: true, price: 100, size: 1 }, { time: 1, buy: true, price: 102, size: 3 }, { time: 1, buy: false, price: 99, size: 2 }, { time: 2, buy: true, price: 101, size: .5 }]
let big = bigTrades(fills, 2)
assert.deepEqual(big.orders.map(o => [o.time, o.buy, o.size, o.price, o.count]), [[1, true, 4, 101.5, 2], [1, false, 2, 99, 1]])
big = bigTrades(fills)                                  // automatic: top 2 % → only the 4-lot
assert.equal(big.threshold, 4); assert.equal(big.orders.length, 1)
assert.deepEqual(bigTrades([]).orders, [])

// ---- calculate: sessions, bubbles and per-bar detail --------------------------------------------------------------
const trade = (iso, price, size, buy) => ({ time: Date.parse(iso), price, size, buy })
const trades = [
  trade('2026-03-06T20:00:00Z', 100, 1, true), trade('2026-03-06T21:00:00Z', 101, 2, false),     // session 03-06 (partial: first)
  trade('2026-03-06T23:00:00Z', 102, 4, true), trade('2026-03-07T10:00:00Z', 102, 1, false),     // session 03-07
  trade('2026-03-07T23:30:00Z', 103, 1, true),                                                    // session 03-08 (partial: running)
]
const result = calculate(trades, '1d', 1, { sessions: true, zone: 'ny', bubbles: true, bubbleMin: 2 })
assert.deepEqual(result.sessions.map(s => [s.key, s.partial, s.total, s.poc]), [['2026-03-06', true, 3, 101], ['2026-03-07', false, 5, 102], ['2026-03-08', true, 1, 103]])
assert.deepEqual(result.bubbles.orders.map(o => o.size), [2, 4])
const day = result.bars.find(b => b.time === Date.parse('2026-03-06T00:00:00Z') / 1000)
assert.equal(barDetail(day, result).poc, 102)
assert.equal(barDetail(day, result), barDetail(day, result), 'computed once')
console.log('Order-flow analysis: imbalances, x/0, POC ties, sessions across DST, large orders and session profiles OK')
