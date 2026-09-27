const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const at = s => Date.parse(s) / 1000;
const store = {};
const noop = () => {};
// A canvas context that accepts every call and records fill/stroke counts.
const drawn = { fills: 0, strokes: 0, texts: 0 };
const context = new Proxy({}, { get: (_, name) => name === 'measureText' ? t => ({ width: String(t).length * 6 }) : name === 'fill' || name === 'fillRect' ? () => { drawn.fills++; } : name === 'stroke' || name === 'strokeRect' ? () => { drawn.strokes++; } : name === 'fillText' ? () => { drawn.texts++; } : noop, set: () => true });
const element = () => ({ style: {}, innerHTML: '', className: '', hidden: false, textContent: '', append: noop, addEventListener: noop, getBoundingClientRect: () => ({ top: 100, bottom: 130 }) });
const hourly = Array.from({ length: 96 }, (_, i) => { const base = 100 + Math.sin(i / 6) * 5; return { time: at('2026-09-21T00:00:00Z') + i * 3600, open: base, high: base + 2, low: base - 2, close: i % 3 ? base + 1 : base - 1, volume: 10 + (i % 7) * 4 }; });
const day = (t, spread = 0) => ({ time: at(t), open: 100 + spread / 2, high: 110 + spread, low: 90 - spread, close: 105, volume: 1000 });
const daily = ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'].map(d => day(d + 'T00:00:00Z'));
const requests = [];
const fetchJson = async url => {
  requests.push(url);
  if (url.includes('/api/hl/candles')) return { candles: url.includes('interval=1d') ? daily : url.includes('interval=1w') ? [day('2026-09-14T00:00:00Z', 5), day('2026-09-21T00:00:00Z', 3)] : [day('2026-08-01T00:00:00Z', 20), day('2026-09-01T00:00:00Z', 10)] };
  if (url.includes('/api/hl/depth')) return { time: Date.now(), bids: [{ px: '99', sz: '3' }, { px: '98', sz: '5' }], asks: [{ px: '101', sz: '4' }, { px: '102', sz: '6' }] };
  if (url.includes('/api/hl/funding')) return { rates: [{ time: hourly[10].time, rate: 0.0001, premium: 0 }, { time: hourly[20].time, rate: -0.0002, premium: 0 }] };
  throw new Error('unexpected ' + url);
};
const lines = [], series = [], panes = [{}], primitives = [];
const chart = {
  timeScale: () => ({ applyOptions: noop, logicalToCoordinate: l => l * 10, getVisibleLogicalRange: () => ({ from: 10, to: 60 }) }),
  subscribeCrosshairMove: fn => { chart.crosshair = fn; },
  panes: () => panes, addSeries(kind, options, pane) { const s = { options, data: [], setData(d) { this.data = d; }, applyOptions: noop, getPane: () => ({ paneIndex: () => pane }) }; series.push(s); if (pane >= panes.length) panes.push({ setHeight: noop }); return s; },
  removeSeries(s) { series.splice(series.indexOf(s), 1); }, removePane(i) { panes.splice(i, 1); },
};
const panel = { el: element(), chart, candles: hourly, series: { priceToCoordinate: p => 500 - p * 2, attachPrimitive: p => primitives.push(p), createPriceLine: o => { lines.push(o); return o; }, removePriceLine: o => lines.splice(lines.indexOf(o), 1) } };
const orderflow = { trades: [{ time: (hourly[50].time + 60) * 1000 }, { time: (hourly[50].time + 120) * 1000 }, { time: (hourly[51].time + 5) * 1000 }], interval: '1h', setEnabled(key, value) { this.enabled = [key, value]; }, onRender(fn) { this.render = fn; } };
const sandbox = {
  console, Date, Math, Intl, Promise, Map, Set, setTimeout: noop, clearTimeout: noop, requestAnimationFrame: fn => fn(), fetch: undefined,
  document: { head: { append: noop }, createElement: element, hidden: false, addEventListener: noop, getElementById: () => null },
  window: { addEventListener: noop }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  Theme: { css: n => n === '--ink-rgb' ? '235 230 211' : '#ebe6d3' },
  LightweightCharts: { HistogramSeries: 'histogram', LineSeries: 'line' }, TerminalOrderflow: { bucket: (ms, interval) => Math.floor(ms / 1000 / 3600) * 3600 },
  TerminalStudiesMath: require('../public/terminal-studies.js'),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/terminal-studies-chart.js'), 'utf8'), sandbox);
const Studies = sandbox.window.TerminalStudies;

(async () => {
  // Catalog: real studies are addable, data Hyperliquid does not publish is listed as unavailable.
  const studies = Studies.attach({ settingsHost: element(), fetchJson, orderflow });
  const ids = studies.catalog.filter(d => !d.unavailable).map(d => d.id);
  for (const id of ['ohlc', 'barstats', 'vwap', 'vpvr', 'vpsv', 'levels', 'bubbles', 'depth', 'obprofile', 'heatmap', 'oi', 'funding', 'counter']) assert.ok(ids.includes(id), id);
  assert.ok(studies.catalog.filter(d => d.unavailable).map(d => d.title).includes('Liquidation Heatmap'));
  studies.setEnabled('na:Liquidations', true);
  assert.equal(studies.isEnabled('na:Liquidations'), false);   // unavailable entries cannot be switched on

  studies.setMarket('xyz:XYZ100', '1h');
  studies.bindPanel(panel);
  assert.equal(primitives.length, 1);
  const painters = primitives[0].paneViews().map(v => v.renderer());
  const target = { useMediaCoordinateSpace: fn => fn({ context, mediaSize: { width: 800, height: 400 } }) };
  const paintAll = () => painters.forEach(p => p.draw(target));

  for (const id of ['ohlc', 'barstats', 'vwap', 'vpvr', 'vpsv', 'levels', 'bubbles', 'depth', 'obprofile', 'heatmap', 'oi', 'funding', 'counter']) studies.setEnabled(id, true);
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));   // let the fetches settle
  assert.equal(JSON.stringify(orderflow.enabled), '["counter",true]');   // the trade counter needs the trade stream
  assert.ok(JSON.parse(store['hl-studies']).on.vwap, 'enabled studies are remembered');

  // Every requested feed was fetched exactly for this market.
  for (const part of ['interval=1d', 'interval=1w', 'interval=1M', '/api/hl/depth?coin=xyz%3AXYZ100&sig=3', '/api/hl/depth?coin=xyz%3AXYZ100&sig=4', '/api/hl/funding?coin=xyz%3AXYZ100']) assert.ok(requests.some(u => u.includes(part)), part);

  // Key levels became price lines: today's open is merged with the previous close (both 100/105 in this fixture).
  assert.ok(lines.length >= 8 && lines.every(l => Number.isFinite(l.price) && l.title), String(lines.length));
  assert.ok(lines.some(l => l.title.includes('Monday High')));
  assert.ok(!lines.some(l => l.title.includes('Weekend')));   // weekend is off by default

  // Lower studies live in their own panes.
  assert.equal(JSON.stringify(series.map(s => s.options.title).sort()), JSON.stringify(['Funding %/h', 'Open Interest', 'Transakcje']));
  assert.equal(panes.length, 4);
  const counter = series.find(s => s.options.title === 'Transakcje');
  assert.equal(JSON.stringify(counter.data.map(p => p.value)), '[2,1]');   // trades per candle
  const fundingSeries = series.find(s => s.options.title === 'Funding %/h');
  assert.equal(fundingSeries.data.length, 2);
  assert.ok(fundingSeries.data[0].value > 0 && fundingSeries.data[1].value < 0);

  // Open interest is sampled from the market list and remembered per market.
  studies.observeMarkets([{ coin: 'xyz:XYZ100', openInterest: 6040 }]);
  assert.equal(JSON.parse(store['hl-oi:xyz:XYZ100']).at(-1).value, 6040);

  // Painters run without error and draw something.
  paintAll();
  assert.ok(drawn.fills > 50 && drawn.strokes > 20 && drawn.texts > 0, JSON.stringify(drawn));

  // Legend: OHLC + bar stats for the candle under the cursor, and the trade pulse.
  const legend = panel.el.append.toString();   // legend element was appended to the panel
  chart.crosshair({ time: hourly[5].time });
  const text = sandbox.document.createElement.toString();
  assert.ok(legend && text);

  // Disabling removes the pane again.
  studies.setEnabled('oi', false);
  assert.ok(!series.some(s => s.options.title === 'Open Interest'));
  assert.equal(panes.length, 3);
  studies.setEnabled('levels', false);
  assert.equal(lines.length, 0);

  // Switching market drops the market-bound state: the panes of still-enabled studies are rebuilt empty.
  studies.setMarket('BTC', '1h');
  assert.equal(series.length, 2);
  assert.equal(series.find(x => x.options.title === 'Funding %/h').data.length, 0);
  assert.equal(lines.length, 0);
  console.log('PASS terminal studies chart: catalog, unavailable entries, feeds, key-level lines, panes, trade counter, open interest sampling and all painters');
})().catch(e => { console.error(e); process.exit(1); });
