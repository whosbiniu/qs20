// Chart settings: theme defaults, shared vs per-layout settings, untrusted storage, candle / volume colours,
// "colour by previous close", hollow candles, precision and chart options.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const store = new Map()
const sandbox = { JSON, Math, Number, String, Object, Array, Date, Intl,
  localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
  LightweightCharts: { ColorType: { VerticalGradient: 'gradient' } } }
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(fs.readFileSync(require.resolve('../public/terminal-appearance.js'), 'utf8'), sandbox)
const A = sandbox.TerminalAppearance
const p = { bg: '#202126', ink: '#e4e5e9', dim: '#8b8d99', line: '#34353d', up: '#e4e5e9', down: '#55565f' }

// Nothing saved: the theme's colours, no grid, free crosshair (the look the terminal had before).
let o = A.chartOptions('BBB', p), sr = A.seriesOptions('BBB', p)
assert.equal(o.layout.background.color, '#202126'); assert.equal(o.grid.vertLines.visible, false); assert.equal(o.crosshair.mode, 0)
assert.equal(sr.upColor, '#e4e5e9'); assert.equal(sr.downColor, '#55565f'); assert.equal(sr.wickUpColor, '#e4e5e9')
assert.equal(A.volumeColor('BBB', p, true), '#e4e5e966')   // candle colour at 40%

// Shared settings apply to both layouts; UNC may keep its own.
store.set('terminal-appearance-v1', JSON.stringify({ shared: { upBody: '#26a69a', downBody: '#ef5350', hGrid: true, gridColor: '#2a2e39cc', crossMode: 'magnet', scaleMode: 1 },
  UNC: { upBody: '#3987e5', style: 'hollow', upBorder: '#3987e5', precision: '3' }, BBB: { upBody: 'javascript:alert(1)', fontSize: 999, bogus: 1 } }))
A._reset()
o = A.chartOptions('UNC', p); sr = A.seriesOptions('UNC', p)
assert.equal(sr.upColor, 'rgba(0,0,0,0)'); assert.equal(sr.borderUpColor, '#3987e5'); assert.equal(sr.borderVisible, true)   // hollow candles
assert.equal(o.grid.horzLines.visible, false)   // UNC's own settings do not inherit the shared ones
assert.equal(A.priceFormat('UNC', 25000).precision, 3); assert.equal(A.priceFormat('BBB', 25000).precision, 2); assert.equal(A.priceFormat('BBB', 0.5).precision, 8)
// BBB's damaged entry is cleaned: a bad colour falls back, the font size is clamped, unknown keys are dropped.
const bbb = A.get('BBB')
assert.equal(bbb.upBody, ''); assert.equal(bbb.fontSize, 18); assert.equal(bbb.bogus, undefined)
store.set('terminal-appearance-v1', JSON.stringify({ shared: { upBody: '#26a69a', downBody: '#ef5350', hGrid: true, gridColor: '#2a2e39cc', crossMode: 'magnet', scaleMode: 1, prevClose: true, volOpacity: 50 } }))
A._reset()
o = A.chartOptions('BBB', p)
assert.equal(o.grid.horzLines.color, 'rgba(42,46,57,0.800)'); assert.equal(o.crosshair.mode, 1); assert.equal(o.rightPriceScale.mode, 1)
assert.equal(A.volumeColor('BBB', p, false), '#ef535080')   // volume follows the candle colours

// Colour by previous close: a red candle that closed above the previous close is drawn up-coloured.
const bars = [{ time: 1, open: 10, high: 11, low: 9, close: 10 }, { time: 2, open: 12, high: 12, low: 10.5, close: 11 }, { time: 3, open: 11, high: 11, low: 9, close: 9.5 }]
const coloured = A.colorBars(bars, 'BBB', p)
assert.equal(coloured[1].color, '#26a69a'); assert.equal(coloured[2].color, '#ef5350'); assert.equal(bars[1].color, undefined)   // copies, input untouched
assert.equal(A.colorBar(bars[2], bars[1], 'BBB', p).color, '#ef5350')
console.log('PASS terminal appearance: theme defaults, shared and per-layout settings, cleaning, hollow candles, precision, previous-close colours')
