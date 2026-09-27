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
  const series = { attachPrimitive(p) { p.attached?.({ requestUpdate() { profileUpdates++ } }) }, data: [], lines: new Set(), applyOptions() {}, priceScale: () => ({ applyOptions() {} }), setData(data) { this.data = data }, createPriceLine(line) { this.lines.add(line); return line }, removePriceLine(line) { this.lines.delete(line) } }
  seriesList.push(series); return series
} }
const base = Date.parse('2026-09-27T00:00:00Z') / 1000
const candles = [{ time: base, open: 100, high: 102, low: 100, close: 101, volume: 2 }, { time: base + 1800, open: 101, high: 103, low: 101, close: 102, volume: 3 }]
const market = coin => ({ coin, name: coin, dex: 'test', price: 101, change: 0, funding: 0, volume: 5, openInterest: 1 })
let delayCandles = false
const context = vm.createContext({
  console, Intl, Date, Math, Map, Set,
  document: { getElementById: node, documentElement: {}, hidden: false },
  window: { addEventListener() {} },
  localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
  Stash: { get: k => { const v = storage.get('stash:' + k); return v ? JSON.parse(v) : null }, put: (k, v) => { storage.set('stash:' + k, JSON.stringify(v)); return true } },
  Store: { set: (k, v) => { storage.set(k, String(v)); return true } },
  requestAnimationFrame: fn => fn(), setInterval: (fn, ms) => timers.push({ fn, ms }),
  getComputedStyle: () => ({ getPropertyValue: () => '#111111' }),
  LightweightCharts: { createChart: () => chart, CrosshairMode: { Normal: 0 } },
  TerminalOrderflow: { attach: () => ({ setMarket() {}, bindPanel() {}, refresh() {}, isEnabled() { return false }, setEnabled() {} }) },
  TerminalIndicators: { catalog: [], attach(options) { library = options } },
  TerminalStudies: { catalog: [], attach() { return { setMarket() {}, bindPanel() {}, refresh() {}, observeMarkets() {}, isEnabled() { return false }, setEnabled() {} } } },
  Drawings: { attach(panel) { drawingPanel = panel; return { redraw() {}, reload() { reloads++ } } } },
  fetch: async url => {
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
  console.log('Terminal: drawing binding, volume, TPO levels, zoom, market switch, favourites and stale-response handling OK')
})().catch(error => { console.error(error); process.exitCode = 1 })
