const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const nodes = new Map(), timers = [], pending = []
const storage = new Map([['hl-indicators', JSON.stringify({ tpo: true, volume: true, step: 1 })]])
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {
    value: '', hidden: false, listeners: {}, textContent: '',
    set innerHTML(html) { this.html = html; if (id === 'ht-session') this.value = html.match(/value="([^"]+)"/)?.[1] || '' },
    get innerHTML() { return this.html },
    addEventListener(type, fn) { this.listeners[type] = fn },
    querySelectorAll() { return [] }, replaceChildren() { this.html = '' },
  })
  return nodes.get(id)
}
let library;
let fits = 0, drawingPanel, reloads = 0, profileUpdates = 0
const seriesList = []
const chart = { applyOptions() {}, timeScale: () => ({ fitContent() { fits++ } }), addSeries() {
  const series = { attachPrimitive(p) { p.attached?.({ requestUpdate() { profileUpdates++ } }) }, data: [], lines: new Set(), applyOptions() {}, priceScale: () => ({ applyOptions() {} }), setData(data) { this.data = [...data] }, update(bar) { const i = this.data.findIndex(d => d.time === bar.time); if (i >= 0) this.data[i] = bar; else this.data.push(bar) }, createPriceLine(line) { this.lines.add(line); return line }, removePriceLine(line) { this.lines.delete(line) } }
  seriesList.push(series); return series
} }
const base = Date.parse('2026-09-27T00:00:00Z') / 1000
const candles = [{ time: base, open: 100, high: 102, low: 100, close: 101, volume: 2 }, { time: base + 1800, open: 101, high: 103, low: 101, close: 102, volume: 3 }]
const market = coin => ({ coin, name: coin, dex: 'test', price: 101, change: 0, funding: 0, volume: 5, openInterest: 1 })
let delayCandles = false, candleRequests = 0
// Fake shared stream: records subscriptions so the test can push live frames.
const HLStreamLib = require('../public/hl-stream.js'), subs = new Map()
const HLStream = { ...HLStreamLib, shared: { subscribe(sub, onData, onStatus) {
  const key = HLStreamLib.keyOf(sub); subs.set(key, { onData, onStatus }); onStatus?.('connecting'); return () => subs.delete(key)
} } }
const push = (key, data) => subs.get(key).onData(data)
const context = vm.createContext({
  console, Intl, Date, Math, Map, Set,
  document: { getElementById: node, documentElement: {}, hidden: false },
  window: { addEventListener() {} },
  localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  Stash: { get: k => { const v = storage.get('stash:' + k); return v ? JSON.parse(v) : null }, put: (k, v) => { storage.set('stash:' + k, JSON.stringify(v)); return true } },
  Store: { set: (k, v) => { storage.set(k, String(v)); return true } },
  HLStream, MutationObserver: class { observe() {} }, setTimeout: fn => { fn(); return 0 }, clearTimeout() {}, cancelAnimationFrame() {},
  requestAnimationFrame: fn => fn(), setInterval: (fn, ms) => timers.push({ fn, ms }),
  getComputedStyle: () => ({ getPropertyValue: () => '#111111' }),
  LightweightCharts: { createChart: () => chart, CrosshairMode: { Normal: 0 } },
  TerminalOrderflow: { attach: () => ({ setMarket() {}, bindPanel() {}, refresh() {}, isEnabled() { return false }, setEnabled() {} }) },
  TerminalIndicators: { catalog: [], attach(options) { library = options } },
  TerminalStudies: { catalog: [], attach() { return { setMarket() {}, bindPanel() {}, refresh() {}, observeMarkets() {}, isEnabled() { return false }, setEnabled() {} } } },
  Drawings: { attach(panel) { drawingPanel = panel; return { redraw() {}, reload() { reloads++ } } } },
  fetch: async url => {
    if (url.includes('/candles')) candleRequests++
    if (delayCandles && url.includes('/candles')) return new Promise(resolve => pending.push(() => resolve({ ok: true, json: async () => ({ candles }) })))
    return { ok: true, json: async () => url.includes('/markets') ? { markets: [market('xyz:XYZ100'), market('BTC')] } : url.includes('/candles') ? { candles } : { asks: [], bids: [], time: Date.now() } }
  },
})
vm.runInContext(fs.readFileSync(require.resolve('../public/terminal-profile.js'), 'utf8'), context)
vm.runInContext(fs.readFileSync(require.resolve('../public/hyper-terminal.js'), 'utf8'), context)
const flush = () => new Promise(resolve => setImmediate(resolve))
;(async () => {
  context.window.HyperTerminal.show(); await flush()
  assert.equal(drawingPanel.symbol, 'hl:xyz:XYZ100')
  assert.equal(drawingPanel.candles.length, 2)
  assert.equal(seriesList[1].data[1].value, 3)
  assert.equal(seriesList[0].lines.size, 0, 'TPO uses a chart primitive, not full-width price lines')
  assert.ok(profileUpdates > 0)
  assert.equal(fits, 1)
  timers.find(t => t.ms === 30000).fn(); await flush()
  assert.equal(fits, 1, 'background refresh preserves zoom')
  delayCandles = true
  node('ht-list').listeners.click({ target: { closest: () => ({ dataset: { coin: 'BTC' } }) } })
  assert.equal(drawingPanel.symbol, 'hl:BTC')
  assert.equal(drawingPanel.candles.length, 0)
  assert.equal(seriesList[0].lines.size, 0, 'old market levels cleared immediately')
  library.set('tpo', false)
  pending.splice(0).forEach(resolve => resolve()); await flush()
  assert.equal(seriesList[0].lines.size, 0, 'late TPO response cannot restore disabled indicator')
  assert.equal(drawingPanel.candles.length, 2)
  assert.equal(fits, 2)
  assert.equal(reloads, 1)
  assert.equal(JSON.parse(storage.get('hl-indicators')).tpo, false)
  // Favourites: the left list shows only starred tickers; typing a ticker finds it and Enter (or the star) keeps it.
  const list = node('ht-list'), search = node('ht-search')
  assert.match(list.html, /data-fav="xyz:XYZ100"/)
  assert.equal(node('ht-count').textContent, '2', 'the default favourites that exist as markets: XYZ100 and BTC')
  list.listeners.click({ target: { closest: () => ({ dataset: { fav: 'BTC' } }) } })
  assert.deepEqual(JSON.parse(storage.get('hl-favorites')), ['xyz:XYZ100', 'xyz:SP500', 'ETH'])
  search.value = 'btc'; search.listeners.input()
  assert.match(list.html, /data-coin="BTC"/)
  assert.match(list.html, /aria-pressed="false"/)
  search.listeners.keydown({ key: 'Enter' })
  assert.deepEqual(JSON.parse(storage.get('hl-favorites')), ['xyz:XYZ100', 'xyz:SP500', 'ETH', 'BTC'])
  assert.equal(search.value, '', 'the search box is cleared after adding')
  search.value = 'zzz'; search.listeners.keydown({ key: 'Enter' })
  assert.match(list.html, /Nie znaleziono/)
  assert.deepEqual(JSON.parse(storage.get('hl-favorites')), ['xyz:XYZ100', 'xyz:SP500', 'ETH', 'BTC'], 'an unknown ticker is not added')
  // Live stream: only the open market is followed; the forming bar, a new bar, the book and the header update in place.
  assert.deepEqual([...subs.keys()].sort(), ['activeAssetCtx:BTC', 'candle:BTC:1h', 'l2Book:BTC', 'trades:BTC'])
  subs.get('candle:BTC:1h').onStatus('live')
  const t = ms => String(ms * 1000)
  push('candle:BTC:1h', { t: t(base + 1800), s: 'BTC', i: '1h', o: '101', h: '106', l: '101', c: '105', v: '4' })
  assert.equal(seriesList[0].data.length, 2); assert.equal(seriesList[0].data[1].close, 105)
  assert.equal(drawingPanel.candles[1].close, 105)
  push('candle:BTC:1h', { t: t(base + 5400), s: 'BTC', i: '1h', o: '105', h: '107', l: '104', c: '106', v: '1' })
  assert.equal(drawingPanel.candles.length, 3); assert.equal(seriesList[1].data.length, 3)
  push('candle:BTC:1h', { t: t(base), s: 'BTC', i: '1h', o: '1', h: '1', l: '1', c: '1', v: '1' })
  assert.equal(drawingPanel.candles[0].close, 101, 'an out-of-order bar is ignored')
  push('l2Book:BTC', { coin: 'BTC', time: Date.now(), levels: [[{ px: '104.5', sz: '2', n: 1 }], [{ px: '105.5', sz: '1', n: 1 }]] })
  assert.match(node('ht-bids').html, /104\.5/); assert.match(node('ht-asks').html, /105\.5/)
  push('l2Book:BTC', { coin: 'xyz:XYZ100', time: Date.now(), levels: [[{ px: '1', sz: '1', n: 1 }], []] })
  assert.match(node('ht-bids').html, /104\.5/, 'a book for another market is ignored')
  push('activeAssetCtx:BTC', { coin: 'BTC', ctx: { markPx: '110', prevDayPx: '100', dayNtlVlm: '9', openInterest: '2', funding: '0.0001' } })
  assert.equal(node('ht-price').textContent, '110'); assert.equal(node('ht-change').textContent, '+10.00%')
  // DOM: traded volume per price from the trade stream; tape: fills of one order merged, then filtered by size.
  const now = Date.now()
  push('trades:BTC', [{ coin: 'BTC', side: 'B', px: '105.5', sz: '0.4', time: now, tid: 1 }, { coin: 'BTC', side: 'B', px: '105.5', sz: '0.6', time: now, tid: 2 },
    { coin: 'BTC', side: 'A', px: '104.5', sz: '3', time: now + 5, tid: 3 }])
  push('l2Book:BTC', { coin: 'BTC', time: Date.now(), levels: [[{ px: '104.5', sz: '2', n: 1 }, { px: '104', sz: '20', n: 1 }], [{ px: '105.5', sz: '1', n: 1 }]] })
  assert.match(node('ht-asks').html, /class="traded">1</, 'one lot traded at 105.5')
  assert.match(node('ht-bids').html, /class="traded">3</)
  assert.match(node('ht-bids').html, /bid big/, 'the 20-lot stands out (3× the median of 2)')
  node('ht-book-tabs').listeners.click({ target: { closest: () => ({ dataset: { bookTab: 'tape' } }) } })
  assert.equal(node('ht-tape').hidden, false); assert.equal(node('ht-dom').hidden, true)
  assert.equal((node('ht-tape-rows').html.match(/ht-book-row/g) || []).length, 2, 'two fills of one order are one row')
  assert.match(node('ht-tape-rows').html, /×2/)
  node('ht-tape-min').listeners.change({ target: { value: '2' } })
  assert.equal((node('ht-tape-rows').html.match(/ht-book-row/g) || []).length, 1)
  assert.equal(JSON.parse(storage.get('hl-dom')).tab, 'tape')
  // While live, the 30 s timer does not reload the chart; after a gap the chart is reloaded once.
  const before = candleRequests
  timers.find(t => t.ms === 30000).fn(); await flush()
  assert.equal(candleRequests, before)
  subs.get('candle:BTC:1h').onStatus('gap'); subs.get('candle:BTC:1h').onStatus('live'); await flush()
  assert.equal(candleRequests, before + 1)
  console.log('Terminal: drawing binding, volume, TPO levels, zoom, market switch, favourites, stale-response handling, live stream, DOM and tape OK')
})().catch(error => { console.error(error); process.exitCode = 1 })
