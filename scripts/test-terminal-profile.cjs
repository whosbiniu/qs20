const assert = require('node:assert/strict')
require('../public/terminal-profile.js')
const { build } = globalThis.TerminalProfile
const start = Date.parse('2026-09-27T00:00:00Z') / 1000
const candles = [
  { time: start, low: 100, high: 102 },
  { time: start + 1800, low: 101, high: 103 },
  { time: start + 3600, low: 101, high: 102 },
]
const profile = build(candles, '2026-09-27', 1)
assert.deepEqual(profile.rows.map(r => r.letters), ['A', 'ABC', 'ABC', 'B'])
assert.equal(profile.total, 8)
assert.equal(profile.poc, 101)
assert.equal(profile.val, 101)
assert.equal(profile.vah, 103)
assert.equal(profile.blocks, 3)
assert.equal(build([...candles, candles[0]], '2026-09-27', 1).total, 8, 'a block is counted once at each price')
assert.equal(build(candles, '2026-09-26'), null)
assert.equal(build([], '2026-09-27'), null)
assert.equal(build(candles, ''), null)
assert.equal(build([{ time: start, low: 0, high: 0 }], '2026-09-27').rows.length, 1)
assert.equal(build([{ time: start + 3600, low: 1, high: 1 }], '2026-09-27', 1).rows[0].letters, 'C', 'missing blocks do not shift time labels')
assert.equal(build([...candles, { time: start + 86400, low: 0, high: 999 }], '2026-09-27', 1).total, 8)
assert.throws(() => build(candles, '2026-09-27', .0001), /500/)
console.log('TPO: counts, POC, 70% value area, duplicates, sessions, gaps and row limit OK')
const { bounds, profiles, attach } = TerminalProfile
const time = s => Date.parse(s) / 1000
assert.deepEqual(bounds(time('2026-09-27T12:00:00Z'), 'weekly'), [time('2026-09-21T00:00:00Z'), time('2026-09-28T00:00:00Z')])
assert.deepEqual(bounds(time('2026-12-31T12:00:00Z'), 'monthly'), [time('2026-12-01T00:00:00Z'), time('2027-01-01T00:00:00Z')])
assert.equal(bounds(time('2026-09-27T17:00:00Z'), 'session', '08:00', '16:30'), null)
assert.deepEqual(bounds(time('2026-09-27T01:00:00Z'), 'session', '22:00', '06:00'), [time('2026-09-26T22:00:00Z'), time('2026-09-27T06:00:00Z')])
const extended = [...candles, ...candles.map(c => ({ ...c, time: c.time + 86400 }))]
assert.equal(profiles(extended, { mode: 'daily' }).length, 2)
assert.equal(profiles(extended, { mode: 'weekly' }).length, 2, 'Sunday and Monday belong to different weeks')
assert.equal(profiles(extended, { mode: 'monthly' }).length, 1)
assert.equal(profiles(extended, { mode: 'session', from: '08:00', to: '16:30' }).length, 0)
assert.equal(profiles(extended, { mode: 'monthly', step: 1 })[0].total, 16)
let primitive, updates = 0, rectangles = 0
const overlay = attach({ candles, chart: { timeScale: () => ({ logicalToCoordinate: n => n * 20 }) }, series: { priceToCoordinate: p => 300 - p, attachPrimitive(p) { primitive = p; p.attached({ requestUpdate() { updates++ } }) } } })
const ctx = new Proxy({}, { get: (_, name) => name === 'fillRect' ? () => rectangles++ : () => {} })
overlay.set([profile]); assert.equal(updates, 1)
const target = { useMediaCoordinateSpace(fn) { fn({ context: ctx, mediaSize: { width: 800, height: 400 } }) } }
primitive.paneViews()[0].renderer().draw(target)
assert.ok(rectangles > 0, 'profile is drawn on the chart')
rectangles = 0; overlay.set([]); primitive.paneViews()[0].renderer().draw(target)
assert.equal(rectangles, 0, 'disabled profile leaves the chart empty')
console.log('TPO overlay: daily, weekly, monthly, overnight sessions, filtering and canvas rendering OK')
