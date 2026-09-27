const assert = require('node:assert/strict')
require('../public/terminal-orderflow.js')
const { createStore, calculate, bucket, connect } = globalThis.TerminalOrderflow
const t = Date.parse('2026-09-27T00:00:00Z')
const trade = (tid, side, px, sz, offset = 0, coin = 'BTC') => ({ tid, coin, side, px: String(px), sz: String(sz), time: t + offset })
const store = createStore('BTC')
const batch = [trade(1, 'B', 100, 5), trade(2, 'A', 100, 2), trade(3, 'B', 101, 3, 60000), trade(4, 'A', 102, 1, 60001)]
assert.equal(store.add(batch), true)
assert.equal(store.add(batch), false)
store.add([trade(9, 'B', 1, 100, 0, 'ETH'), trade(10, '?', 1, 10), trade(11, 'A', NaN, 1), trade(12, 'B', 1, -1)])
assert.equal(store.trades.length, 4)
const result = calculate(store.trades, '1m', 1)
assert.equal(result.total, 11)
assert.equal(result.cvd, 5)
assert.deepEqual(result.bars.map(b => b.delta), [3, 2])
assert.deepEqual(result.bars.map(b => b.cvd), [3, 5])
assert.equal(result.rows[0].bid, 2)
assert.equal(result.rows[0].ask, 5)
assert.equal(result.poc, 100)
assert.equal(result.val, 100)
assert.equal(result.vah, 102)
assert.equal(result.bars[0].levels.get(0).delta, 3)
assert.equal(calculate(store.trades, '1h', 1).bars.length, 1)
assert.throws(() => calculate(store.trades, '1m', .0001), /200/)
assert.equal(bucket(Date.parse('2026-09-27T12:00:00Z'), '1w'), Date.parse('2026-09-21T00:00:00Z') / 1000)
assert.equal(bucket(t, '1M'), Date.parse('2026-09-01T00:00:00Z') / 1000)
const capped = createStore('BTC', 2)
capped.add(batch)
assert.equal(capped.trimmed, true)
assert.equal(capped.trades.length, 2)
capped.add(batch)
assert.equal(capped.trades.length, 2)
store.reset(t + 60001)
store.add(batch)
assert.equal(store.trades.length, 1)
const sockets = [], timers = new Map(), statuses = [], received = []
let timerId = 0
class Socket {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this) }
  send(text) { this.sent.push(JSON.parse(text)) }
  close() { this.readyState = 3; this.onclose?.() }
  open() { this.readyState = 1; this.onopen() }
  message(value) { this.onmessage({ data: JSON.stringify(value) }) }
}
const stream = connect('BTC', data => received.push(...data), s => statuses.push(s), {
  WebSocket: Socket, setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId }, clearTimeout: id => timers.delete(id),
})
sockets[0].open()
assert.deepEqual(sockets[0].sent[0], { method: 'subscribe', subscription: { type: 'trades', coin: 'BTC' } })
assert.equal(timers.size, 1, 'handshake timer removed')
sockets[0].message({ channel: 'subscriptionResponse' })
sockets[0].message({ channel: 'trades', data: batch })
assert.equal(received.length, 4)
sockets[0].close()
assert.equal(statuses.at(-1), 'gap')
const [id, retry] = [...timers.entries()].find(([, v]) => v.ms === 1000)
timers.delete(id); retry.fn()
assert.equal(sockets.length, 2)
sockets[0].message({ channel: 'trades', data: batch })
assert.equal(received.length, 4, 'old socket ignored')
stream.stop()
assert.equal(timers.size, 0)
sockets[1].message({ channel: 'trades', data: batch })
assert.equal(received.length, 4, 'stopped socket ignored')
console.log('Order flow: bid/ask, delta/CVD, volume profile, boundaries, deduplication, limits, reset, reconnect and stale sockets OK')
// Exercise the actual panel controls and rendering with a minimal DOM adapter.
const nodes = new Map()
const element = key => {
  if (!nodes.has(key)) nodes.set(key, { hidden: false, innerHTML: '', textContent: '', addEventListener(type, fn) { this[type] = fn } })
  return nodes.get(key)
}
const host = { innerHTML: '', querySelector: element }
globalThis.localStorage = { getItem: () => null, setItem() {} }
globalThis.window = { addEventListener() {} }
globalThis.WebSocket = Socket
const plotted = [], levelLines = new Set(), primitives = []
globalThis.LightweightCharts = { HistogramSeries: {}, LineSeries: {} }
const panelData = {
  candles: [{ time: t / 1000 }, { time: t / 1000 + 60 }],
  chart: { addSeries() { const series = { setData(data) { this.data = data }, priceScale: () => ({ applyOptions() {} }) }; plotted.push(series); return series }, timeScale: () => ({ getVisibleRange: () => ({ from: t / 1000, to: t / 1000 + 60 }), timeToCoordinate: time => 100 + (time - t / 1000) * 2, options: () => ({ barSpacing: 90 }) }) },
  series: { priceToCoordinate: p => 1800 - p * 15, attachPrimitive(p) { primitives.push(p); p.attached({ requestUpdate() {} }) }, createPriceLine(line) { levelLines.add(line); return line }, removePriceLine(line) { levelLines.delete(line) } },
}
const panel = TerminalOrderflow.attach(host)
panel.bindPanel(panelData)
panel.setMarket('BTC', '1m')
assert.equal(panel.isEnabled('delta'), false)
for (const key of ['footprint', 'delta', 'profile']) panel.setEnabled(key, true)
const liveSocket = sockets.at(-1)
liveSocket.open(); liveSocket.message({ channel: 'trades', data: batch })
panel.refresh()
assert.deepEqual(plotted[0].data.map(d => d.value), [3, 2])
assert.deepEqual(plotted[1].data.map(d => d.value), [3, 5])
assert.equal(levelLines.size, 3)
element('[data-of-step]').change({ target: { value: '1' } })
let rectangles = 0, texts = 0
const ctx = new Proxy({}, { get: (_, name) => name === 'fillRect' ? () => rectangles++ : name === 'fillText' ? () => texts++ : () => {} })
primitives[0].paneViews()[0].renderer().draw({ useMediaCoordinateSpace(fn) { fn({ context: ctx, mediaSize: { width: 800, height: 500 } }) } })
assert.ok(rectangles > 0 && texts > 0, 'profile and footprint are rendered on the chart')
assert.ok(!host.innerHTML.includes('<table'), 'no separate footprint table')
panel.setMarket('ETH', '1m')
assert.equal(levelLines.size, 0)
assert.equal(plotted[0].data.length, 0)
assert.match(element('.of-status').textContent, /ETH/)
for (const key of ['footprint', 'delta', 'profile']) panel.setEnabled(key, false)
assert.equal(panel.isEnabled('profile'), false)
console.log('Order flow overlays: controls, footprint, profile, delta/CVD, chart alignment and market reset OK')
