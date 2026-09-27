// Shared Hyperliquid stream: one socket, reference-counted subscriptions, reconnect, idle close, candle merging.
const assert = require('node:assert/strict')
const { create, mergeCandle, candleOf } = require('../public/hl-stream.js')

let clock = 0, timers = []
const setTimeout = (fn, ms) => { const t = { fn, at: clock + ms, id: timers.length + 1 }; timers.push(t); return t.id }
const clearTimeout = id => { timers = timers.filter(t => t.id !== id) }
function advance(ms) {
  const end = clock + ms
  for (;;) {
    const next = timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0]
    if (!next) break
    timers = timers.filter(t => t !== next); clock = next.at; next.fn()
  }
  clock = end
}
const sockets = []
class FakeSocket {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this) }
  send(text) { assert.equal(this.readyState, 1, 'send only on an open socket'); this.sent.push(JSON.parse(text)) }
  close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.() }
  accept() { this.readyState = 1; this.onopen?.() }
  push(channel, data) { this.onmessage?.({ data: JSON.stringify({ channel, data }) }) }
}
const stream = create({ WebSocket: FakeSocket, setTimeout, clearTimeout, now: () => clock, random: () => 0.5, idleClose: 30000 })

// Two panels on the same candle feed share one socket and one subscription.
const got = { a: [], b: [], book: [] }, statuses = []
const offA = stream.subscribe({ type: 'candle', coin: 'BTC', interval: '1m' }, d => got.a.push(d), s => statuses.push(s))
const offB = stream.subscribe({ type: 'candle', coin: 'BTC', interval: '1m' }, d => got.b.push(d))
const offBook = stream.subscribe({ type: 'l2Book', coin: 'xyz:XYZ100' }, d => got.book.push(d))
assert.equal(sockets.length, 1)
assert.equal(stream.size(), 2)
const ws = sockets[0]
ws.accept()
assert.deepEqual(ws.sent.map(m => m.subscription.type).sort(), ['candle', 'l2Book'])
ws.push('subscriptionResponse', {})
assert.equal(stream.status(), 'live')

// Messages are routed by coin and interval.
ws.push('candle', { t: 60000, s: 'BTC', i: '1m', o: '1', h: '2', l: '0.5', c: '1.5', v: '3' })
ws.push('candle', { t: 60000, s: 'ETH', i: '1m', o: '1', h: '1', l: '1', c: '1', v: '1' })
ws.push('candle', { t: 60000, s: 'BTC', i: '5m', o: '1', h: '1', l: '1', c: '1', v: '1' })
ws.push('l2Book', { coin: 'xyz:XYZ100', levels: [[], []], time: 1 })
assert.equal(got.a.length, 1); assert.equal(got.b.length, 1); assert.equal(got.book.length, 1)

// The feed is unsubscribed only when its last listener leaves.
offA(); offA()
assert.equal(ws.sent.filter(m => m.method === 'unsubscribe').length, 0)
offB()
assert.deepEqual(ws.sent.filter(m => m.method === 'unsubscribe').map(m => m.subscription.type), ['candle'])

// Heartbeat pings; a silent socket is closed and reopened with every live subscription, reported as a gap.
advance(15000)
assert.ok(ws.sent.some(m => m.method === 'ping'))
advance(45000)   // no message for more than 45 s: closed at the 60 s ping
assert.equal(ws.readyState, 3)
assert.equal(stream.status(), 'gap')
assert.ok(statuses.includes('live'))
advance(1000)
assert.equal(sockets.length, 2)
const ws2 = sockets[1]
ws2.accept()
assert.deepEqual(ws2.sent.filter(m => m.method === 'subscribe').map(m => m.subscription.type), ['l2Book'])
ws2.push('l2Book', { coin: 'xyz:XYZ100', levels: [[], []], time: 2 })
assert.equal(stream.status(), 'live')
assert.equal(got.book.length, 2)

// Repeated failures back off (1 s, 2 s, 4 s ... up to 30 s, each 50-100 % of that with jitter; 75 % here).
ws2.close(); advance(749); assert.equal(sockets.length, 2); advance(1); assert.equal(sockets.length, 3)
sockets[2].close(); advance(1499); assert.equal(sockets.length, 3); advance(1); assert.equal(sockets.length, 4)
sockets[3].accept()

// With no listeners left the socket closes after the idle delay, and a new listener reopens it.
offBook()
advance(29000); assert.equal(sockets[3].readyState, 1)
advance(1000); assert.equal(sockets[3].readyState, 3); assert.equal(stream.status(), 'idle')
const offAgain = stream.subscribe({ type: 'trades', coin: 'BTC' }, () => {})
assert.equal(sockets.length, 5)
offAgain()

// A new listener within the idle delay keeps the same socket.
sockets[4].accept()
const offC = stream.subscribe({ type: 'activeAssetCtx', coin: 'BTC' }, () => {})
offC(); advance(10000)
const offD = stream.subscribe({ type: 'activeAssetCtx', coin: 'BTC' }, () => {})
advance(60000); assert.equal(sockets.length, 5); assert.equal(sockets[4].readyState, 1)
offD()
assert.throws(() => stream.subscribe({ type: 'orders' }, () => {}))
stream.close()

// Candle merging: same bar replaced, newer appended, older ignored.
const bars = [candleOf({ t: 60000, o: '1', h: '2', l: '0', c: '1', v: '1' })]
assert.equal(mergeCandle(bars, candleOf({ t: 60000, o: '1', h: '3', l: '0', c: '2', v: '2' })), 'update')
assert.equal(bars.length, 1); assert.equal(bars[0].close, 2)
assert.equal(mergeCandle(bars, candleOf({ t: 120000, o: '2', h: '2', l: '2', c: '2', v: '0' })), 'append')
assert.equal(mergeCandle(bars, candleOf({ t: 0, o: '9', h: '9', l: '9', c: '9', v: '9' })), null)
assert.deepEqual(bars.map(b => b.time), [60, 120])
console.log('hl stream: shared subscriptions, routing, heartbeat, reconnect with backoff, idle close and candle merge OK')
