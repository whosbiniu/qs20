// Research: SMT + M5 CISD + FVG entry in the predicted High/Low windows, fixed RR targets.
//
//   node scripts/research/smt-cisd-fvg.mjs <data dir> [targets, default 5,10,15]
//
// Data: m5_<SYM>.json (5-minute bars, e.g. from import-1min.mjs).
//
// Setup (long; short mirrored):
// 1. Time: only in the session our rules predict for the day's High/Low (cycle-rules.js); "full" also requires the
//    session's predicted 90-minute window. Control groups use the other sessions / no time filter.
// 2. SMT: one market takes its reference low (previous 90-minute window, or the previous day's low) while another
//    holds above its own – the strongest holder is the market traded.
// 3. CISD (M5): a 5-minute candle of the traded market closes above the open of the bearish delivery that made its
//    low (the first candle of the run of down-closing candles ending at the low). If the traded market takes its
//    own reference low first, the setup is void. CISD must come within 2 hours of the SMT.
// 4. FVG: the most recent bullish gap between the low and the CISD candle (low of candle 3 above high of candle 1);
//    a limit order at its top (the proximal edge) fills when price comes back, within 2 hours of the CISD. A trade
//    with no gap, no fill, or a new low before the fill is not taken.
// 5. Stop one tick beyond the low, fixed target N·R, held until one of them (also over following days). A bar that
//    reaches both counts as the stop; the fill bar counts only for the stop. Costs 2 ticks. One setup per day.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const CycleRules = require('../../public/cycle-rules.js')

const dir = process.argv[2]
if (!dir) { console.error('usage: node scripts/research/smt-cisd-fvg.mjs <data dir> [5,10,15]'); process.exit(1) }
const TARGETS = (process.argv[3] || '5,10,15').split(',').map(Number)
const GROUPS = { 'NQ/ES/YM': ['NQ=F', 'ES=F', 'YM=F'], 'NQ/ES': ['NQ=F', 'ES=F'] }
const TICK = { 'NQ=F': .25, 'ES=F': .25, 'YM=F': 1, 'RTY=F': .1, 'GC=F': .1, 'SI=F': .005 }
const COST_TICKS = 2, CISD_BARS = 24, FILL_BARS = 24

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function et(ts) { const p = Object.fromEntries(fmt.formatToParts(new Date(ts * 1000)).map(x => [x.type, x.value])); return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute } }
function load(file) {
  const r = JSON.parse(readFileSync(file, 'utf8')).chart.result[0], q = r.indicators.quote[0], out = new Map()
  r.timestamp.forEach((t, i) => { const b = { o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }; if ([b.o, b.h, b.l, b.c].every(Number.isFinite)) out.set(t, b) })
  return out
}

// All aligned rows in one array (so trades can run over following days) plus the index range of each trading day.
function prepare(syms) {
  const data = Object.fromEntries(syms.map(s => [s, load(join(dir, `m5_${s}.json`))]))
  const times = [...data[syms[0]].keys()].filter(t => syms.every(s => data[s].has(t))).sort((a, b) => a - b)
  const rows = [], days = []
  let cur = null
  for (const t of times) {
    const e = et(t), since18 = ((e.h * 60 + e.min) - 18 * 60 + 1440) % 1440
    const date = new Date(Date.UTC(e.y, e.m - 1, e.d + (e.h >= 18 ? 1 : 0))), dow = date.getUTCDay()
    if (dow === 0 || dow === 6) continue
    const key = date.toISOString().slice(0, 10)
    if (!cur || cur.key !== key) { cur = { key, date, dow, start: rows.length, end: rows.length }; days.push(cur) }
    rows.push({ t, q: Math.floor(since18 / 360) + 1, k: Math.floor(since18 / 90), m90: Math.floor(since18 / 90) % 4 + 1, b: Object.fromEntries(syms.map(s => [s, data[s].get(t)])) })
    cur.end = rows.length
  }
  const full = days.filter(d => d.end - d.start >= 150)
  for (const d of full) d.hl = Object.fromEntries(syms.map(s => { const r = rows.slice(d.start, d.end); return [s, { h: Math.max(...r.map(x => x.b[s].h)), l: Math.min(...r.map(x => x.b[s].l)) }] }))
  return { rows, days: full }
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

// After an SMT on market `sym` at row index i (side 1 long / -1 short): CISD, FVG and fill. Returns the entry or null.
function confirm(rows, i, sym, side, ref, dayEnd, periodStart, runExt) {
  const bar = j => rows[j].b[sym]
  const against = j => side === 1 ? bar(j).c < bar(j).o : bar(j).c > bar(j).o
  // the traded market's extreme since its reference period began (the low it is holding above)
  let ext = i, extV = runExt
  for (let j = i; j >= periodStart; j--) if ((side === 1 ? bar(j).l : bar(j).h) === runExt) { ext = j; break }
  for (let j = i + 1; j < Math.min(rows.length, i + 1 + CISD_BARS, dayEnd); j++) {
    const b = bar(j)
    // a new extreme of the traded market moves the anchor; taking its own reference level voids the setup
    if (side === 1 ? b.l < extV : b.h > extV) {
      if (side === 1 ? b.l < ref : b.h > ref) return null
      extV = side === 1 ? b.l : b.h; ext = j
    }
    // delivery into the extreme: the run of candles closing against us that ends at the extreme bar (or just
    // before it, when the extreme candle itself closed our way); CISD = the open of its first candle
    const end = against(ext) ? ext : ext - 1
    if (end < 0 || !against(end)) continue
    let first = end
    while (first - 1 >= 0 && against(first - 1)) first--
    const cisd = bar(first).o
    if (!(side === 1 ? b.c > cisd : b.c < cisd)) continue
    // CISD at j: most recent FVG between the extreme and the CISD candle
    let fvg = null
    for (let m = j; m >= ext + 2; m--) {
      if (side === 1 && bar(m).l > bar(m - 2).h) { fvg = { edge: bar(m).l }; break }
      if (side === -1 && bar(m).h < bar(m - 2).l) { fvg = { edge: bar(m).h }; break }
    }
    if (!fvg) return null
    for (let f = j + 1; f < Math.min(rows.length, j + 1 + FILL_BARS); f++) {
      const x = bar(f)
      if (side === 1 ? x.l < extV : x.h > extV) return null // new extreme before the fill: no trade
      if (side === 1 ? x.l <= fvg.edge : x.h >= fvg.edge) return { at: f, entry: fvg.edge, stop: extV - side * TICK[sym] }
    }
    return null
  }
  return null
}

function scanDay(rows, day, prev, syms, ref, allowed) {
  const t = targetsOf(day)
  let period = null, refs = null, run = null, periodStart = day.start
  for (let i = day.start; i < day.end; i++) {
    const row = rows[i]
    if (ref === 'm90') {
      if (row.k !== period) {
        const start = row.k > 0 ? i - 1 : prev ? prev.end - 1 : -1
        if (start < 0) { period = row.k; refs = null; continue }
        const kk = rows[start].k, before = []
        for (let j = start; j >= 0 && rows[j].k === kk && (row.k > 0 ? j >= day.start : j >= prev.start); j--) before.push(rows[j])
        period = row.k; periodStart = i
        refs = Object.fromEntries(syms.map(s => [s, { h: Math.max(...before.map(r => r.b[s].h)), l: Math.min(...before.map(r => r.b[s].l)) }]))
        run = Object.fromEntries(syms.map(s => [s, { h: -Infinity, l: Infinity }]))
      }
    } else if (period === null) { if (!prev) return null; period = 'pd'; refs = prev.hl; run = Object.fromEntries(syms.map(s => [s, { h: -Infinity, l: Infinity }])) }
    if (!refs) continue
    const was = Object.fromEntries(syms.map(s => [s, { ...run[s] }]))
    for (const s of syms) { run[s].h = Math.max(run[s].h, row.b[s].h); run[s].l = Math.min(run[s].l, row.b[s].l) }
    if (!allowed(row, t)) continue
    const span = s => refs[s].h - refs[s].l || 1
    const sweptLow = syms.filter(s => run[s].l < refs[s].l && was[s].l >= refs[s].l), heldLow = syms.filter(s => run[s].l > refs[s].l)
    const sweptHigh = syms.filter(s => run[s].h > refs[s].h && was[s].h <= refs[s].h), heldHigh = syms.filter(s => run[s].h < refs[s].h)
    let side = 0, sym = null
    if (sweptLow.length && heldLow.length && !sweptHigh.length) { side = 1; sym = heldLow.sort((a, b) => (run[b].l - refs[b].l) / span(b) - (run[a].l - refs[a].l) / span(a))[0] }
    else if (sweptHigh.length && heldHigh.length && !sweptLow.length) { side = -1; sym = heldHigh.sort((a, b) => (refs[b].h - run[b].h) / span(b) - (refs[a].h - run[a].h) / span(a))[0] }
    if (!side) continue
    const entry = confirm(rows, i, sym, side, side === 1 ? refs[sym].l : refs[sym].h, day.end, periodStart, side === 1 ? run[sym].l : run[sym].h)
    if (!entry) continue
    return { ...entry, sym, side, date: day.key }
  }
  return null
}

// Outcome of one entry for each RR target, held over following days until the stop or the target.
function outcome(rows, e, rr) {
  const tick = TICK[e.sym], risk = Math.abs(e.entry - e.stop)
  if (risk < 4 * tick) return null
  const target = e.entry + e.side * rr * risk, cost = COST_TICKS * tick / risk
  const fill = rows[e.at].b[e.sym]
  if (e.side === 1 ? fill.l <= e.stop : fill.h >= e.stop) return -1 - cost
  for (let j = e.at + 1; j < rows.length; j++) {
    const b = rows[j].b[e.sym]
    if (e.side === 1 ? b.l <= e.stop : b.h >= e.stop) return -1 - cost
    if (e.side === 1 ? b.h >= target : b.l <= target) return rr - cost
  }
  return e.side * (rows.at(-1).b[e.sym].c - e.entry) / risk - cost
}
function summary(rs) {
  if (!rs.length) return null
  const n = rs.length, total = rs.reduce((a, b) => a + b, 0), avg = total / n
  const sd = Math.sqrt(rs.reduce((a, r) => a + (r - avg) ** 2, 0) / Math.max(1, n - 1))
  let peak = 0, eq = 0, dd = 0
  for (const r of rs) { eq += r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq) }
  const gross = rs.filter(r => r > 0).reduce((a, b) => a + b, 0), loss = -rs.filter(r => r < 0).reduce((a, b) => a + b, 0)
  return { n, win: rs.filter(r => r > 0).length / n, avg, total, pf: loss ? gross / loss : Infinity, dd, t: sd ? avg / (sd / Math.sqrt(n)) : 0 }
}
const pad = (s, n) => String(s).padEnd(n)
const line = (label, s) => s ? `${pad(label, 32)} n=${pad(s.n, 4)} win ${pad((s.win * 100).toFixed(1) + '%', 6)} avg ${pad((s.avg >= 0 ? '+' : '') + s.avg.toFixed(3) + 'R', 8)} suma ${pad((s.total >= 0 ? '+' : '') + s.total.toFixed(1) + 'R', 9)} PF ${pad(s.pf.toFixed(2), 5)} maxDD ${pad(s.dd.toFixed(1) + 'R', 7)} t=${s.t.toFixed(2)}` : `${pad(label, 32)} brak transakcji`

for (const [gname, syms] of Object.entries(GROUPS)) {
  if (!syms.every(s => existsSync(join(dir, `m5_${s}.json`)))) continue
  const { rows, days } = prepare(syms)
  for (const ref of ['m90', 'pd']) {
    console.log(`\n=== ${gname} · SMT względem ${ref === 'm90' ? 'poprzedniego okna M90' : 'poprzedniego dnia'} + CISD M5 + FVG · ${days[0].key} … ${days.at(-1).key} (${days.length} dni) ===`)
    for (const f of Object.keys(FILTERS)) {
      const entries = []
      for (let i = 1; i < days.length; i++) { const e = scanDay(rows, days[i], days[i - 1], syms, ref, FILTERS[f].ok); if (e) entries.push(e) }
      for (const rr of TARGETS) console.log(line(`${FILTERS[f].name} · ${rr}R`, summary(entries.map(e => outcome(rows, e, rr)).filter(r => r !== null))))
    }
  }
}
