// User timeframes: parsing, the base they are built from, UTC buckets, aggregation, loading and the saved list.
const assert = require('node:assert/strict')
const store = new Map(), events = []
global.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }
global.CustomEvent = class { constructor(type) { this.type = type } }
global.dispatchEvent = e => events.push(e.type)
const TF = require('../public/terminal-timeframes.js')

// Any spelling the user might type.
for (const [text, label] of [['6h', '6h'], ['h6', '6h'], ['6H', '6h'], ['90m', '90m'], ['m90', '90m'], ['90', '90m'], ['90min', '90m'], [' 2d ', '2d'], ['d2', '2d'],
  ['60m', '1h'], ['120', '2h'], ['1440m', '1d'], ['2w', '2w'], ['1M', '1M'], ['7d', '1w']]) assert.equal(TF.normalize(text), label, text)
for (const bad of ['', '0h', 'abc', '6x', '5w', 'h', '-3h', '1.5h']) assert.equal(TF.normalize(bad), null, bad)

// Native intervals come straight from Hyperliquid; others from the largest native interval that divides them.
assert.deepEqual({ ...TF.parse('4h') }, { label: '4h', minutes: 240, seconds: 14400, base: '4h', ratio: 1, native: true })
assert.equal(TF.parse('2h').native, true)
assert.equal(TF.parse('6h').base, '2h'); assert.equal(TF.parse('6h').ratio, 3)
assert.equal(TF.parse('90m').base, '30m'); assert.equal(TF.parse('h6').label, '6h')
assert.equal(TF.parse('45m').base, '15m'); assert.equal(TF.parse('7m').base, '1m')
assert.equal(TF.parse('2w').base, '1d'); assert.equal(TF.parse('nonsense'), null)
assert.equal(TF.barsFor(TF.parse('6h')), 1050); assert.equal(TF.barsFor(TF.parse('2w')), 4900); assert.equal(TF.barsFor(TF.parse('4h')), null)

// UTC buckets from the epoch; multi-week frames start on Monday.
const at = s => Date.parse(s) / 1000
assert.equal(TF.bucket(at('2026-09-28T05:59:00Z'), '6h'), at('2026-09-28T00:00:00Z'))
assert.equal(TF.bucket(at('2026-09-28T06:00:00Z'), '6h'), at('2026-09-28T06:00:00Z'))
assert.equal(TF.bucket(at('2026-09-28T01:29:00Z'), '90m'), at('2026-09-28T00:00:00Z'))
assert.equal(TF.bucket(at('2026-09-28T01:30:00Z'), '90m'), at('2026-09-28T01:30:00Z'))
assert.equal(new Date(TF.bucket(at('2026-09-30T12:00:00Z'), '2w') * 1000).getUTCDay(), 1)

// Three 2h candles make one 6h candle: first open, highest high, lowest low, last close, summed volume.
const bar = (t, o, h, l, c, v) => ({ time: at(t), open: o, high: h, low: l, close: c, volume: v })
const base = [bar('2026-09-27T22:00:00Z', 9, 9, 9, 9, 1), bar('2026-09-28T00:00:00Z', 10, 12, 9, 11, 1), bar('2026-09-28T02:00:00Z', 11, 15, 10, 14, 2), bar('2026-09-28T04:00:00Z', 14, 14, 8, 13, 3), bar('2026-09-28T06:00:00Z', 13, 13, 12, 12, 4)]
const six = TF.aggregate(base, '6h')
assert.equal(six.length, 3)
assert.deepEqual(six[1], { time: at('2026-09-28T00:00:00Z'), open: 10, high: 15, low: 8, close: 13, volume: 6 })
assert.deepEqual(six[2], { time: at('2026-09-28T06:00:00Z'), open: 13, high: 13, low: 12, close: 12, volume: 4 })   // still forming
assert.equal(TF.aggregate(base, '2h').length, base.length)   // native: unchanged

;(async () => {
  // Loading asks for the base interval with enough bars, and returns both lists.
  const urls = []
  const fetchJson = async url => { urls.push(url); return { candles: base } }
  const loaded = await TF.load(fetchJson, 'xyz:XYZ100', '6h')
  assert.equal(urls[0], '/api/hl/candles?coin=xyz%3AXYZ100&interval=2h&bars=1050')
  assert.equal(loaded.candles.length, 3); assert.equal(loaded.base, base)
  await TF.load(fetchJson, 'BTC', '1h')
  assert.equal(urls[1], '/api/hl/candles?coin=BTC&interval=1h')
  await assert.rejects(TF.load(fetchJson, 'BTC', 'zzz'))

  // The user's list: normalized, sorted, no duplicates of built-in frames, saved and announced.
  assert.equal(TF.add('h6'), '6h'); assert.equal(TF.add('m90'), '90m'); assert.equal(TF.add('6h'), '6h'); assert.equal(TF.add('4h'), '4h'); assert.equal(TF.add('bad'), null)
  assert.deepEqual(TF.custom(), ['90m', '6h'])
  assert.deepEqual(TF.all(), ['1m', '5m', '15m', '30m', '1h', '90m', '4h', '6h', '1d', '1w', '1M'])
  assert.ok(events.includes('timeframeschange'))
  TF.remove('90m'); assert.deepEqual(TF.custom(), ['6h'])
  store.set('hl-custom-periods', '["garbage", 5, "2d"]'); assert.deepEqual(TF.custom(), ['2d'])
  console.log('PASS terminal timeframes: parsing, bases, UTC buckets, aggregation, loading and the saved list')
})().catch(e => { console.error(e); process.exit(1) })
