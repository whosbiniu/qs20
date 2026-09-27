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
