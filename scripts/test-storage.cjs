const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

// A localStorage stand-in with a quota, like the browser's (~5 MB there, 2.5 MB here).
function fakeStorage(quota) {
  const data = new Map()
  const used = () => [...data].reduce((n, [k, v]) => n + k.length + v.length, 0)
  return {
    data,
    get length() { return data.size },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => data.has(k) ? data.get(k) : null,
    setItem(k, v) {
      v = String(v)
      const before = data.get(k)
      data.set(k, v)
      if (used() > quota) { if (before === undefined) data.delete(k); else data.set(k, before); const e = new Error('full'); e.name = 'QuotaExceededError'; throw e }
    },
    removeItem: k => { data.delete(k) },
  }
}
function load(ls) {
  const sandbox = { localStorage: ls, JSON, Date, Object, Math, String }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(fs.readFileSync(require.resolve('../public/storage.js'), 'utf8'), sandbox)
  return sandbox
}

// Legacy open-interest keys move into the cache; pre-existing stash keys are adopted and counted.
const ls = fakeStorage(2500000)
ls.setItem('hl-oi:BTC', '[1]')
ls.setItem('stash:chart:OLD:1D', 'x'.repeat(100))
let { Stash, Store, STASH_BUDGET } = load(ls)
assert.equal(ls.getItem('hl-oi:BTC'), null)
assert.equal(ls.getItem('stash:hl-oi:BTC'), '[1]')
assert.ok(JSON.parse(ls.getItem('stash-index'))['chart:OLD:1D'])

// The cache never exceeds its budget: the least recently used copies go first.
const big = n => ({ candles: 'y'.repeat(n) })
for (let i = 0; i < 12; i++) assert.equal(Stash.put('chart:S' + i, big(200000)), true)
const stashBytes = () => [...ls.data].filter(([k]) => k.startsWith('stash:')).reduce((n, [, v]) => n + v.length, 0)
assert.ok(stashBytes() <= STASH_BUDGET, 'within budget')
assert.equal(Stash.get('chart:S0'), null, 'oldest evicted')
assert.ok(Stash.get('chart:S11'), 'newest kept')
Stash.get('chart:S5')   // reading refreshes an entry
for (let i = 12; i < 16; i++) Stash.put('chart:S' + i, big(200000))
assert.ok(Stash.get('chart:S5'), 'recently read entry survives')
assert.equal(Stash.put('huge', big(STASH_BUDGET)), false, 'one copy may not take the whole budget')

// A full quota: settings still save, because cached copies make room.
ls.setItem('filler', 'z'.repeat(2500000 - [...ls.data].reduce((n, [k, v]) => n + k.length + v.length, 0) - 10))
assert.throws(() => ls.setItem('probe', 'q'.repeat(1000)))
assert.equal(Store.set('draw:NQ1!', 'd'.repeat(50000)), true)
assert.equal(ls.getItem('draw:NQ1!').length, 50000)
// When nothing can be freed, the call reports failure instead of throwing.
const tiny = fakeStorage(100)
;({ Store } = load(tiny))
assert.equal(Store.set('k', 'v'.repeat(500)), false)
// No storage at all (private mode, blocked cookies): everything degrades to no-ops.
const none = load(undefined)
assert.equal(none.Stash.get('x'), null); assert.equal(none.Stash.put('x', 1), false); assert.equal(none.Store.set('x', '1'), false)
console.log('PASS storage: stash budget and LRU eviction, legacy key migration, quota recovery for settings, graceful without storage')
