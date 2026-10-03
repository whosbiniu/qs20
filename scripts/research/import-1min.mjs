// Converts 1-minute futures CSVs into the Yahoo-style JSON the research scripts read (m5_<SYM>.json, 5-minute bars).
//
//   node scripts/research/import-1min.mjs <out dir> NQ=F:<csv> ES=F:<csv> YM=F:<csv> [--shift NQ=F:-60]
//
// Two layouts are understood:
// - "timestamp ET,open,high,low,close,…" with New York wall-clock times (MM/DD/YYYY HH:MM)
// - Databento "ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol" in UTC
// Contract rolls: a trading day (18:00 New York start) in which the instrument_id changes, or that opens with a
// gap above 1.5% against the previous close, is dropped, so no SMT level spans two contracts.
// --shift moves a file's timestamps by N seconds (e.g. -60 when a file stamps bars at their close).
import { createReadStream, writeFileSync, mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'

const [out, ...rest] = process.argv.slice(2)
const shifts = {}
const inputs = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--shift') { const [s, v] = rest[++i].split(':'); shifts[s] = +v; continue }
  const at = rest[i].indexOf(':'); inputs.push([rest[i].slice(0, at), rest[i].slice(at + 1)])
}
if (!out || !inputs.length) { console.error('usage: import-1min.mjs <out dir> SYM:file.csv … [--shift SYM:seconds]'); process.exit(1) }
mkdirSync(out, { recursive: true })

// New York wall clock -> UTC seconds (DST from the tz database via Intl).
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function nyOffset(utcSeconds) {
  const p = Object.fromEntries(nyFmt.formatToParts(new Date(utcSeconds * 1000)).map(x => [x.type, x.value]))
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute) / 1000 - utcSeconds
}
function fromNY(y, m, d, h, min) {
  const guess = Date.UTC(y, m - 1, d, h, min) / 1000
  return guess - nyOffset(guess - nyOffset(guess))
}
const tradingDay = t => { const local = t + nyOffset(t); return Math.floor((local + 6 * 3600) / 86400) } // 18:00 NY rollover

async function convert(sym, file) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  let header = null, et = false
  const bars = new Map(), dayIds = new Map()
  for await (const line of rl) {
    if (!header) { header = line.split(','); et = header[0].startsWith('timestamp ET'); continue }
    const c = line.split(',')
    let t, o, h, l, cl, id = null
    if (et) {
      const [date, time] = c[0].split(' '), [mo, d, y] = date.split('/').map(Number), [hh, mm] = time.split(':').map(Number)
      t = fromNY(y, mo, d, hh, mm); [o, h, l, cl] = c.slice(1, 5).map(Number)
    } else {
      t = Date.parse(c[0].replace(' ', 'T')) / 1000; [o, h, l, cl] = c.slice(4, 8).map(Number); id = c[3]
    }
    if (![t, o, h, l, cl].every(Number.isFinite)) continue
    t += shifts[sym] || 0
    const day = tradingDay(t)
    if (id) { if (!dayIds.has(day)) dayIds.set(day, new Set()); dayIds.get(day).add(id) }
    const k = Math.floor(t / 300) * 300, b = bars.get(k)
    if (!b) bars.set(k, { o, h, l, c: cl, day })
    else { b.h = Math.max(b.h, h); b.l = Math.min(b.l, l); b.c = cl }
  }
  const times = [...bars.keys()].sort((a, b) => a - b)
  // roll days: contract change inside the day, or an opening gap above 1.5%
  const drop = new Set([...dayIds].filter(([, ids]) => ids.size > 1).map(([d]) => d))
  let prev = null
  for (const t of times) { const b = bars.get(t); if (prev && b.day !== prev.day && Math.abs(b.o / prev.c - 1) > .015) drop.add(b.day); prev = b }
  const keep = times.filter(t => !drop.has(bars.get(t).day))
  const q = { open: [], high: [], low: [], close: [] }
  for (const t of keep) { const b = bars.get(t); q.open.push(b.o); q.high.push(b.h); q.low.push(b.l); q.close.push(b.c) }
  writeFileSync(join(out, `m5_${sym}.json`), JSON.stringify({ chart: { result: [{ timestamp: keep, indicators: { quote: [q] } }] } }))
  console.log(`${sym}: ${keep.length} bars 5 min · ${new Date(keep[0] * 1000).toISOString().slice(0, 10)} … ${new Date(keep.at(-1) * 1000).toISOString().slice(0, 10)} · roll / gap days dropped: ${drop.size}`)
  return new Map(keep.map(t => [t, bars.get(t)]))
}

const loaded = {}
for (const [sym, file] of inputs) loaded[sym] = await convert(sym, file)
// Alignment check: correlation of 5-minute returns between the first file and the others at lags -1, 0, +1 bars.
const [first, ...others] = Object.keys(loaded)
for (const s of others) {
  const corr = lag => {
    const xs = [], ys = []
    for (const [t, a] of loaded[first]) { const b = loaded[s].get(t + lag * 300), pa = loaded[first].get(t - 300), pb = loaded[s].get(t + lag * 300 - 300); if (b && pa && pb) { xs.push(a.c / pa.c - 1); ys.push(b.c / pb.c - 1) } }
    const mx = xs.reduce((p, v) => p + v, 0) / xs.length, my = ys.reduce((p, v) => p + v, 0) / ys.length
    let sxy = 0, sxx = 0, syy = 0
    for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
    return (sxy / Math.sqrt(sxx * syy)).toFixed(3)
  }
  console.log(`alignment ${first} vs ${s}: lag -1 ${corr(-1)} · lag 0 ${corr(0)} · lag +1 ${corr(1)}`)
}
