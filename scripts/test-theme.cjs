// Colour modes: dark, light and frosted glass. Glass colours use comma rgba() (the chart library parses them),
// transparency is clamped and saved, text on active buttons stays solid, and the Mac app hears about glass mode.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function load({ storage = {}, native = null } = {}) {
  const props = {}, events = [], posted = []
  const root = { dataset: {}, style: { setProperty: (k, v) => { props[k] = v }, removeProperty: k => { delete props[k] }, set colorScheme(v) { props['color-scheme'] = v } } }
  const store = new Map(Object.entries(storage))
  const window = {
    parent: null, addEventListener() {}, dispatchEvent: e => events.push(e),
    webkit: native ? { messageHandlers: { glass: { postMessage: m => posted.push(m) } } } : undefined,
  }
  window.parent = window
  const context = vm.createContext({ window, document: { documentElement: root, querySelectorAll: () => [] }, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail } }, getComputedStyle: () => ({ getPropertyValue: k => props[k] || '' }) })
  vm.runInContext(fs.readFileSync(require.resolve('../public/theme.js'), 'utf8') + '\nthis.Theme = Theme', context)
  return { Theme: context.Theme, props, root, store, posted }
}

// Dark by default (nothing is switched for the user); light and glass are the other two modes.
let t = load()
assert.equal(t.root.dataset.colorMode, 'dark'); assert.equal(t.props['--bg'], '#050505'); assert.equal(t.props['--on-ink'], '#050505')
assert.equal(t.store.get('mode'), undefined, 'nothing saved until the user chooses')
t.Theme.setMode('light')
assert.equal(t.root.dataset.colorMode, 'light'); assert.equal(t.props['--on-ink'], t.props['--bg'])
assert.equal(t.store.get('mode'), 'light')

// Glass: translucent, chart-parsable colours; accent text stays; solid text for active buttons.
t.Theme.setMode('glass')
assert.equal(t.root.dataset.colorMode, 'glass')
assert.match(t.props['--bg'], /^rgba\(8, 8, 10, 0\.\d+\)$/)
assert.match(t.props['--glass'], /^rgba\(8, 8, 10, 0\.\d+\)$/)
assert.match(t.props['--line'], /^rgba\(255, 255, 255, /)
assert.equal(t.props['--ink'], '#ebe6d3'); assert.equal(t.props['--on-ink'], '#050505')
assert.equal(t.props['color-scheme'], 'dark')
const alpha = v => Number(v.match(/, ([\d.]+)\)$/)[1])
const solid = alpha(t.props['--glass'])

// More transparency: less tint and less blur; the value is clamped and saved only when asked.
t.Theme.setGlass(0.9, false)
assert.ok(alpha(t.props['--glass']) < solid)
assert.ok(parseFloat(t.props['--glass-blur']) < 20)
assert.equal(JSON.parse(t.store.get('glass')).clear, 0.42, 'still the value saved with the mode, not the one being dragged')
t.Theme.setGlass(7, true)
assert.equal(t.Theme.getGlass(), 1); assert.equal(JSON.parse(t.store.get('glass')).clear, 1)

// Saved settings come back; nonsense falls back to the default.
t = load({ storage: { mode: 'glass', glass: '{"clear":0.2}' } })
assert.equal(t.root.dataset.colorMode, 'glass'); assert.equal(t.Theme.getGlass(), 0.2)
t = load({ storage: { mode: 'neon', glass: '{"clear":"x"}' } })
assert.equal(t.root.dataset.colorMode, 'dark'); assert.equal(t.Theme.getGlass(), 0.42)

// In the Mac app the window is told when glass turns on or off, with the transparency.
t = load({ native: true })
assert.equal(t.root.dataset.native, '')
t.Theme.setMode('glass'); t.Theme.setGlass(0.6, true); t.Theme.setMode('dark')
assert.deepEqual(t.posted.slice(-3).map(m => [m.on, m.clear]), [[true, 0.42], [true, 0.6], [false, 0.6]])
console.log('theme: dark, light and glass modes, transparency, saving and the Mac app bridge OK')
