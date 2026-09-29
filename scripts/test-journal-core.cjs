// The browser bundle of the LuxAlgo Trade Journal engine (public/journal-core.js): round trips with a contract
// multiplier, metrics and Edge Score, the calendar, and a TradingView statement import.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const sandbox = { Intl, Date, Math, JSON }
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(fs.readFileSync(require.resolve('../public/journal-core.js'), 'utf8'), sandbox)
const { core: C, importers: I } = sandbox.LuxJournal

const fill = (id, side, quantity, price, at, fee = 0) => ({ id, accountId: 'main', symbol: 'NQ1!', side, quantity, price, fee, executedAt: at, source: 'manual' })
// Scale in twice, scale out twice: one round trip, P&L in points × $20.
const trips = C.buildRoundTrips([
  fill('a', 'buy', 1, 20000, '2026-09-21T13:30:00Z', 1), fill('b', 'buy', 1, 20010, '2026-09-21T13:40:00Z', 1),
  fill('c', 'sell', 1, 20030, '2026-09-21T14:00:00Z', 1), fill('d', 'sell', 1, 20040, '2026-09-21T14:10:00Z', 1),
  fill('e', 'sell', 2, 20050, '2026-09-22T13:30:00Z'), fill('f', 'buy', 2, 20070, '2026-09-22T14:00:00Z'),
], { multipliers: { 'NQ1!': 20 } })
assert.equal(trips.length, 2)
assert.equal(trips[0].status, 'win'); assert.equal(trips[0].grossPnl, (30 + 30) * 20); assert.equal(trips[0].netPnl, 1196)
assert.equal(trips[0].key, 'main|NQ1!|long|2026-09-21T13:30:00Z')
assert.equal(trips[1].direction, 'short'); assert.equal(trips[1].netPnl, -800)

const m = C.computeMetrics(trips, { timeZone: 'UTC' })
assert.equal(m.closedTrades, 2); assert.equal(m.winRate, 0.5); assert.equal(m.netPnl, 396)
assert.ok(Math.abs(m.profitFactor - 1196 / 800) < 1e-9)
assert.equal(C.computeEdgeScore(m).score, null)   // fewer than 5 closed trades

const cal = C.calendarMonth(trips, 2026, 9, 'UTC')
assert.equal(cal.tradingDays, 2); assert.equal(cal.winningDays, 1); assert.equal(cal.monthNetPnl, 396)
assert.equal(C.dailyStats(trips, 'UTC').map(d => d.date).join(), '2026-09-21,2026-09-22')

// A TradingView export is recognised and parsed into fills.
const csv = 'Symbol,Side,Qty,Fill Price,Commission,Closing Time,Status\nAMZN,Buy,75,196.3,0.38,2025-03-03T15:02:00.000Z,Filled\nAMZN,Sell,75,197.79,0.38,2025-03-03T15:23:00.000Z,Filled\n'
const parsed = I.parseAuto(csv, { timeZone: 'UTC' })
assert.equal(parsed.format, 'tradingview'); assert.equal(parsed.executions.length, 2)
const imported = C.buildRoundTrips(parsed.executions.map((e, i) => ({ ...e, id: 'x' + i, accountId: 'main', source: 'import' })))
assert.equal(imported.length, 1); assert.ok(Math.abs(imported[0].netPnl - (1.49 * 75 - 0.76)) < 1e-6)
assert.equal(I.parseAuto('just,some\n1,2\n', {}), null)
console.log('PASS journal core bundle: round trips with multiplier, metrics, Edge Score gate, calendar, TradingView import')
