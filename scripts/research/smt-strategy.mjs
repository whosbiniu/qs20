// Research: SMT divergence in the predicted High/Low windows of our Daily Cycle model.
//
//   node scripts/research/smt-strategy.mjs <data dir>
//
// Data: Yahoo JSON m5_<SYM>.json (5-minute bars, last 60 days) and h_<SYM>.json (60-minute bars, ~2 years).
//
// Strategy (as traded): the day's High/Low should form in the sessions our rules predict (cycle-rules.js:
// Tue/Wed -> Q1 Asia or Q3 NY AM, Mon/Thu/Fri -> Q1 Asia or Q4 NY PM; inside a session the 90-minute windows
// sessionTargetQuarters). The direction comes from SMT between correlated markets: when one market takes the
// reference low (previous 90-minute window, or previous day) and another does not, buy the stronger one – the one
// that held, furthest above its level; mirrored for highs (sell the weaker one). Stop beyond the traded market's
// own extreme since the reference period began, target 2R, otherwise out at the end of the trading day (17:00 NY).
// One trade per day, costs 2 ticks. Control groups apply the same SMT outside the predicted times.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const CycleRules = require('../../public/cycle-rules.js')

const dir = process.argv[2]
if (!dir) { console.error('usage: node scripts/research/smt-strategy.mjs <data dir>'); process.exit(1) }
const GROUPS = { 'Indeksy (NQ/ES/YM/RTY)': ['NQ=F', 'ES=F', 'YM=F', 'RTY=F'], 'Metale (GC/SI)': ['GC=F', 'SI=F'] }
const TICK = { 'NQ=F': .25, 'ES=F': .25, 'YM=F': 1, 'RTY=F': .1, 'GC=F': .1, 'SI=F': .005 }
const COST_TICKS = 2, R_TARGET = 2

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function et(ts) { const p = Object.fromEntries(fmt.formatToParts(new Date(ts * 1000)).map(x => [x.type, x.value])); return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute } }

function load(file) {
  const r = JSON.parse(readFileSync(file, 'utf8')).chart.result[0], q = r.indicators.quote[0], out = new Map()
  r.timestamp.forEach((t, i) => { const b = { o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }; if ([b.o, b.h, b.l, b.c].every(Number.isFinite)) out.set(t, b) })
  return out
}

// Rows of aligned bars (all markets present), grouped into trading days that start at 18:00 New York.
function days(syms, prefix) {
  const data = Object.fromEntries(syms.map(s => [s, load(join(dir, `${prefix}_${s}.json`))]))
  const times = [...data[syms[0]].keys()].filter(t => syms.every(s => data[s].has(t))).sort((a, b) => a - b)
  const map = new Map()
  for (const t of times) {
    const e = et(t), since18 = ((e.h * 60 + e.min) - 18 * 60 + 1440) % 1440
    const date = new Date(Date.UTC(e.y, e.m - 1, e.d + (e.h >= 18 ? 1 : 0))), dow = date.getUTCDay()
    if (dow === 0 || dow === 6) continue
    const key = date.toISOString().slice(0, 10)
    if (!map.has(key)) map.set(key, { key, date, dow, rows: [] })
    map.get(key).rows.push({ t, q: Math.floor(since18 / 360) + 1, k: Math.floor(since18 / 90), m90: Math.floor(since18 / 90) % 4 + 1, b: Object.fromEntries(syms.map(s => [s, data[s].get(t)])) })
  }
  const out = [...map.values()].filter(d => d.rows.length >= (prefix === 'm5' ? 150 : 16))
  for (const d of out) d.hl = Object.fromEntries(syms.map(s => [s, { h: Math.max(...d.rows.map(r => r.b[s].h)), l: Math.min(...d.rows.map(r => r.b[s].l)) }]))
  return out
}

function targetsOf(day) {
  const y = day.date.getUTCFullYear(), m = day.date.getUTCMonth() + 1, d = day.date.getUTCDate()
  if (CycleRules.fullWeekQuarter(y, m, d) === 0) return null
  const weekQ = day.dow === 5 ? 0 : day.dow, label = day.dow === 5 ? 'Q1/Q4' : 'Q' + day.dow
  return CycleRules.targetQuarters(weekQ, { edgePair: true, sourceLabel: label })
}

const FILTERS = {
  full: { name: 'Pełna wiedza: sesja + okno M90', ok: (row, t) => t && t.includes(row.q) && CycleRules.sessionTargetQuarters(row.q).includes(row.m90) },
  session: { name: 'Przewidziana sesja', ok: (row, t) => t && t.includes(row.q) },
  other: { name: 'Kontrola: inne sesje', ok: (row, t) => t && !t.includes(row.q) },
  any: { name: 'Kontrola: bez filtra czasu', ok: () => true },
}

// One day: scan for the first SMT in an allowed row and manage the trade on the chosen market.
function tradeDay(day, prev, syms, ref, allowed) {
  const t = targetsOf(day), rows = day.rows
  let period = null, refs = null, run = null
  const reset = (key, levels) => { period = key; refs = levels; run = Object.fromEntries(syms.map(s => [s, { h: -Infinity, l: Infinity }])) }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (ref === 'm90') {
      if (row.k !== period) {
        // reference = the previous 90-minute window (the previous day's last one for the first window)
        const before = row.k > 0 ? rows.filter(r => r.k === row.k - 1) : prev ? prev.rows.filter(r => r.k === prev.rows.at(-1).k) : []
        if (!before.length) { period = row.k; refs = null; continue }
        reset(row.k, Object.fromEntries(syms.map(s => [s, { h: Math.max(...before.map(r => r.b[s].h)), l: Math.min(...before.map(r => r.b[s].l)) }])))
      }
    } else if (period === null) { if (!prev) return null; reset('pd', prev.hl) }
    if (!refs) continue
    const was = Object.fromEntries(syms.map(s => [s, { ...run[s] }]))
    for (const s of syms) { run[s].h = Math.max(run[s].h, row.b[s].h); run[s].l = Math.min(run[s].l, row.b[s].l) }
    if (!allowed(row, t)) continue
    const span = s => refs[s].h - refs[s].l || 1
    // bullish SMT: a market takes its reference low on this bar while another still holds above its own
    const sweptLow = syms.filter(s => run[s].l < refs[s].l && was[s].l >= refs[s].l), heldLow = syms.filter(s => run[s].l > refs[s].l)
    const sweptHigh = syms.filter(s => run[s].h > refs[s].h && was[s].h <= refs[s].h), heldHigh = syms.filter(s => run[s].h < refs[s].h)
    let side = 0, sym = null
    if (sweptLow.length && heldLow.length && !sweptHigh.length) { side = 1; sym = heldLow.sort((a, b) => (run[b].l - refs[b].l) / span(b) - (run[a].l - refs[a].l) / span(a))[0] }
    else if (sweptHigh.length && heldHigh.length && !sweptLow.length) { side = -1; sym = heldHigh.sort((a, b) => (refs[b].h - run[b].h) / span(b) - (refs[a].h - run[a].h) / span(a))[0] }
    if (!side) continue
    const tick = TICK[sym], entry = row.b[sym].c, stop = side === 1 ? run[sym].l - tick : run[sym].h + tick, risk = Math.abs(entry - stop)
    if (risk < 4 * tick) continue
    const target = entry + side * R_TARGET * risk
    let r = null
    for (const x of rows.slice(i + 1)) {
      const b = x.b[sym]
      if (side === 1 ? b.l <= stop : b.h >= stop) { r = -1; break }
      if (side === 1 ? b.h >= target : b.l <= target) { r = R_TARGET; break }
    }
    if (r === null) r = side * (rows.at(-1).b[sym].c - entry) / risk
    return { r: r - COST_TICKS * tick / risk, sym, side, date: day.key, session: row.q, m90: row.m90 }
  }
  return null
}

function run(syms, prefix, ref, filter) {
  const ds = days(syms, prefix), res = []
  for (let i = 1; i < ds.length; i++) { const tr = tradeDay(ds[i], ds[i - 1], syms, ref, FILTERS[filter].ok); if (tr) res.push(tr) }
  return { res, from: ds[0]?.key, to: ds.at(-1)?.key, n: ds.length }
}
function summary(res) {
  if (!res.length) return null
  const rs = res.map(x => x.r), n = rs.length, total = rs.reduce((a, b) => a + b, 0), avg = total / n
  const sd = Math.sqrt(rs.reduce((a, r) => a + (r - avg) ** 2, 0) / Math.max(1, n - 1))
  let peak = 0, eq = 0, dd = 0
  for (const r of rs) { eq += r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq) }
  const gross = rs.filter(r => r > 0).reduce((a, b) => a + b, 0), loss = -rs.filter(r => r < 0).reduce((a, b) => a + b, 0)
  return { n, win: rs.filter(r => r > 0).length / n, avg, total, pf: loss ? gross / loss : Infinity, dd, t: sd ? avg / (sd / Math.sqrt(n)) : 0 }
}
const pad = (s, n) => String(s).padEnd(n)
const line = (label, s) => s ? `${pad(label, 34)} n=${pad(s.n, 4)} win ${pad((s.win * 100).toFixed(1) + '%', 6)} avg ${pad((s.avg >= 0 ? '+' : '') + s.avg.toFixed(3) + 'R', 8)} suma ${pad((s.total >= 0 ? '+' : '') + s.total.toFixed(1) + 'R', 8)} PF ${pad(s.pf.toFixed(2), 5)} maxDD ${pad(s.dd.toFixed(1) + 'R', 7)} t=${s.t.toFixed(2)}` : `${pad(label, 34)} brak transakcji`

for (const [prefix, refsList, label] of [['m5', ['m90', 'pd'], '5 min · ostatnie 60 dni'], ['h', ['pd'], '60 min · ~2,5 roku']]) {
  console.log(`\n######## ${label} ########`)
  for (const [gname, syms] of Object.entries(GROUPS)) {
    if (!syms.every(s => existsSync(join(dir, `${prefix}_${s}.json`)))) continue
    for (const ref of refsList) {
      const filters = prefix === 'm5' ? ['full', 'session', 'other', 'any'] : ['session', 'other', 'any']
      const first = run(syms, prefix, ref, filters[0])
      console.log(`\n=== ${gname} · SMT względem ${ref === 'm90' ? 'poprzedniego okna M90' : 'poprzedniego dnia (PDH/PDL)'} · ${first.from} … ${first.to} (${first.n} dni) ===`)
      for (const f of filters) console.log(line(FILTERS[f].name, summary(f === filters[0] ? first.res : run(syms, prefix, ref, f).res)))
    }
  }
}
