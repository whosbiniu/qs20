// Saved BBB / UNC layouts: defaults, and damaged or foreign values fall back safely.
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const sandbox = {}
sandbox.globalThis = sandbox
vm.runInNewContext(fs.readFileSync(__dirname + '/../public/terminal-workspace.js', 'utf8'), sandbox)
const { normalize } = sandbox.TerminalWorkspace

const fresh = normalize(null)
assert.equal(fresh.active, 'BBB')
assert.equal(fresh.layouts.BBB.count, 1)
assert.equal(fresh.layouts.BBB.markets, false)
assert.equal(fresh.layouts.UNC.count, 4)
assert.equal(fresh.layouts.UNC.book, true)
assert.equal(fresh.layouts.UNC.panels.length, 3)

const saved = normalize({ version: 1, active: 'UNC', layouts: { UNC: { count: 2, markets: false, book: true, split: 40, row: 60, sync: false,
  panels: [{ interval: '1h', mode: 'vwap', coin: 'BTC', linked: false }, { interval: '1d', mode: 'tpo', coin: 'xyz:SP500', linked: true }, { interval: '15m', mode: 'volume' }] } } })
assert.equal(saved.active, 'UNC')
assert.deepEqual(JSON.parse(JSON.stringify(saved.layouts.UNC)), { count: 2, markets: false, book: true, split: 40, row: 60, sync: false,
  panels: [{ interval: '1h', mode: 'vwap', coin: 'BTC', linked: false }, { interval: '1d', mode: 'tpo', coin: 'xyz:SP500', linked: true }, { interval: '15m', mode: 'volume', coin: '', linked: true }] })
// A layout saved before independent panes existed: every pane follows the main chart, cursor sync on.
assert.equal(fresh.layouts.UNC.sync, true)
assert.equal(fresh.layouts.UNC.panels[0].coin, ''); assert.equal(fresh.layouts.UNC.panels[0].linked, true)
// Market names from a file are checked: no markup, no overlong values.
const hostile = normalize({ version: 1, layouts: { UNC: { panels: [{ coin: '<img src=x onerror=alert(1)>', linked: 'yes' }, { coin: 'A'.repeat(80) }] } } })
assert.deepEqual(JSON.parse(JSON.stringify(hostile.layouts.UNC.panels.map(p => [p.coin, p.linked]))), [['', true], ['', true], ['', true]])

const broken = normalize({ version: 1, active: 'X', layouts: { UNC: { count: 3, markets: 'yes', split: 99, row: -5,
  panels: [{ interval: '7m', mode: '<img>' }, null] } } })
assert.equal(broken.active, 'BBB')
assert.equal(broken.layouts.UNC.count, 4)
assert.equal(broken.layouts.UNC.markets, true)
assert.equal(broken.layouts.UNC.split, 75)
assert.equal(broken.layouts.UNC.row, 25)
assert.equal(broken.layouts.UNC.panels[0].interval, '4h')
assert.equal(broken.layouts.UNC.panels[0].mode, 'volume')

assert.equal(normalize({ version: 2, active: 'UNC', layouts: { UNC: { count: 1 } } }).layouts.UNC.count, 4)
console.log('terminal workspace: ok')
