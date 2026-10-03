// Research: does our Daily/Weekly cycle knowledge (public/cycle-rules.js) predict where the High and Low of the day
// and of the week form, and can a mechanical strategy built on it make money?
//
//   node scripts/research/lh-strategy.mjs <data dir>
//
// Data: Yahoo JSON files h_<SYM>.json (60-minute bars, ~2 years) and d_<SYM>.json (daily bars, 10 years).
//
// Model (the same rules the Kwartały timeline shows as "High probability"):
// - Trading day starts 18:00 New York. Sessions = Daily Cycle quarters: Q1 Asia 18–24, Q2 London 0–6,
//   Q3 NY AM 6–12, Q4 NY PM 12–18.
// - Weekly cycle: Mon Q1, Tue Q2, Wed Q3, Thu Q4, Fri Q1/Q4. Day H/L target sessions = targetQuarters(weekday Q):
//   Tue/Wed -> Q1 or Q3, Mon/Thu/Fri -> Q1 or Q4. Weeks crossing a month boundary (Monthly Q0) have no prediction.
// - Monthly cycle (week of the month, fullWeekQuarter): week H/L target days = targetQuarters(month Q):
//   Q1 -> Monday, Q2/Q3 -> Monday or Wednesday, Q4 -> Thursday.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const CycleRules = require('../../public/cycle-rules.js')

const dir = process.argv[2]
if (!dir) { console.error('usage: node scripts/research/lh-strategy.mjs <data dir>'); process.exit(1) }
const TICK = { 'NQ=F': .25, 'ES=F': .25, 'YM=F': 1, 'RTY=F': .1, 'GC=F': .1, 'CL=F': .01, '6E=F': .00005 }
const COST_TICKS = 2 // commission + slippage per round trip, in ticks

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short' })
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }
function et(ts) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ts * 1000)).map(x => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, dow: DOW[p.weekday] }
}
const sessionOf = h => h >= 18 ? 1 : h < 6 ? 2 : h < 12 ? 3 : 4
const NAMES = { 1: 'Q1 Azja', 2: 'Q2 Londyn', 3: 'Q3 NY AM', 4: 'Q4 NY PM' }

function bars(file) {
  const r = JSON.parse(readFileSync(file, 'utf8')).chart.result[0], q = r.indicators.quote[0]
  return r.timestamp.map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] })).filter(b => [b.o, b.h, b.l, b.c].every(Number.isFinite))
}

// Hourly bars -> trading days (18:00 NY start) with the session of the high and of the low.
function tradingDays(hourly) {
  const days = new Map()
  for (const b of hourly) {
    const e = et(b.t)
    // the trading date is the calendar date of the session's NY daytime: bars from 18:00 belong to the next day
    const date = new Date(Date.UTC(e.y, e.m - 1, e.d + (e.h >= 18 ? 1 : 0)))
    const dow = date.getUTCDay()
    if (dow === 0 || dow === 6) continue
    const key = date.toISOString().slice(0, 10)
    if (!days.has(key)) days.set(key, { key, date, dow, bars: [] })
    days.get(key).bars.push({ ...b, q: sessionOf(e.h) })
  }
  const out = []
  for (const d of days.values()) {
    if (d.bars.length < 16) continue // partial / holiday days
    let hi = d.bars[0], lo = d.bars[0]
    for (const b of d.bars) { if (b.h > hi.h) hi = b; if (b.l < lo.l) lo = b }
    out.push({ ...d, high: hi.h, low: lo.l, hiQ: hi.q, loQ: lo.q, open: d.bars[0].o, close: d.bars.at(-1).c })
  }
  return out.sort((a, b) => a.date - b.date)
}

// Weekly Q of a trading day and the Monthly Q of its week, exactly as the timeline computes them.
function dayRule(day) {
  const y = day.date.getUTCFullYear(), m = day.date.getUTCMonth() + 1, d = day.date.getUTCDate()
  const monthQ = CycleRules.fullWeekQuarter(y, m, d)
  if (monthQ === 0) return null
  const weekQ = day.dow === 5 ? 0 : day.dow, label = day.dow === 5 ? 'Q1/Q4' : 'Q' + day.dow
  return { monthQ, targets: CycleRules.targetQuarters(weekQ, { edgePair: true, sourceLabel: label }) }
}

const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—'
const pad = (s, n) => String(s).padEnd(n)

// ---------- 1. Is the knowledge right? Session of the day's High / Low vs prediction ----------
function dayStats(days) {
  const s = { n: 0, hi: 0, lo: 0, both: 0, any: 0, hiBy: [0, 0, 0, 0, 0], loBy: [0, 0, 0, 0, 0], ctrl: { n: 0, hi: 0, lo: 0 } }
  for (const d of days) {
    const r = dayRule(d); if (!r) continue
    const inH = r.targets.includes(d.hiQ), inL = r.targets.includes(d.loQ)
    s.n++; s.hi += inH; s.lo += inL; s.both += inH && inL; s.any += inH || inL; s.hiBy[d.hiQ]++; s.loBy[d.loQ]++
    // control: the other day type's targets ({1,3} <-> {1,4}) on the same day
    const other = r.targets.includes(3) ? [1, 4] : [1, 3]
    s.ctrl.n++; s.ctrl.hi += other.includes(d.hiQ); s.ctrl.lo += other.includes(d.loQ)
  }
  return s
}

// ---------- 2. Strategy: fade the day's new extreme in the predicted session ----------
// The second predicted session (Q3 NY AM on Tue/Wed, Q4 NY PM on Mon/Thu/Fri) should make the day's other extreme.
// In it, the first hourly bar that makes a new day high and closes red is shorted at its close (stop above its high);
// a new day low closing green is bought (stop below its low). Exit at 2R, at the stop, or at the end of the day.
// Within one bar a stop is assumed before the target. One trade per day.
function trade(day, session, tick, rMult = 2) {
  let dh = -Infinity, dl = Infinity
  const bs = day.bars
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]
    if (b.q === session && i > 0) {
      let side = 0, entry, stop
      if (b.h > dh && b.c < b.o) { side = -1; entry = b.c; stop = b.h + tick }
      else if (b.l < dl && b.c > b.o) { side = 1; entry = b.c; stop = b.l - tick }
      if (side) {
        const risk = Math.abs(entry - stop); if (risk <= 0) return null
        const target = entry + side * rMult * risk
        for (let j = i + 1; j < bs.length; j++) {
          const x = bs[j]
          if (side === 1 ? x.l <= stop : x.h >= stop) return { r: -1, risk }
          if (side === 1 ? x.h >= target : x.l <= target) return { r: rMult, risk }
        }
        return { r: side * (bs.at(-1).c - entry) / risk, risk }
      }
    }
    dh = Math.max(dh, b.h); dl = Math.min(dl, b.l)
  }
  return null
}
function backtestDays(days, sym, pick) {
  const tick = TICK[sym], res = []
  for (const d of days) {
    const r = dayRule(d); if (!r) continue
    const session = pick(r, d); if (!session) continue
    const t = trade(d, session, tick); if (!t) continue
    res.push({ ...t, r: t.r - COST_TICKS * tick / t.risk, date: d.key })
  }
  return res
}
function summary(res) {
  if (!res.length) return { n: 0 }
  const rs = res.map(x => x.r), total = rs.reduce((a, b) => a + b, 0), wins = rs.filter(r => r > 0).length
  let peak = 0, eq = 0, dd = 0
  for (const r of rs) { eq += r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq) }
  const gross = rs.filter(r => r > 0).reduce((a, b) => a + b, 0), loss = -rs.filter(r => r < 0).reduce((a, b) => a + b, 0)
  return { n: rs.length, win: wins / rs.length, avg: total / rs.length, total, pf: loss ? gross / loss : Infinity, dd }
}

// ---------- 3. Week: day of the week's High / Low vs prediction, and the weekly fade ----------
function weeks(daily) {
  const map = new Map()
  for (const b of daily) {
    const d = new Date(b.t * 1000), e = et(b.t), date = new Date(Date.UTC(e.y, e.m - 1, e.d)), dow = date.getUTCDay()
    if (dow < 1 || dow > 5) continue
    const monday = new Date(date); monday.setUTCDate(date.getUTCDate() - (dow - 1))
    const key = monday.toISOString().slice(0, 10)
    if (!map.has(key)) map.set(key, { key, monday, days: [] })
    map.get(key).days.push({ ...b, dow })
  }
  return [...map.values()].filter(w => w.days.length >= 4)
}
function weekRule(w) {
  const q = CycleRules.fullWeekQuarter(w.monday.getUTCFullYear(), w.monday.getUTCMonth() + 1, w.monday.getUTCDate())
  return q ? { q, targets: CycleRules.targetQuarters(q) } : null
}
function weekStats(ws) {
  const s = { n: 0, hi: 0, lo: 0, any: 0, hiBy: [0, 0, 0, 0, 0, 0], loBy: [0, 0, 0, 0, 0, 0] }
  for (const w of ws) {
    const r = weekRule(w); if (!r) continue
    let hi = w.days[0], lo = w.days[0]
    for (const d of w.days) { if (d.h > hi.h) hi = d; if (d.l < lo.l) lo = d }
    s.n++; s.hi += r.targets.includes(hi.dow); s.lo += r.targets.includes(lo.dow); s.any += r.targets.includes(hi.dow) || r.targets.includes(lo.dow)
    s.hiBy[hi.dow]++; s.loBy[lo.dow]++
  }
  return s
}
// On a predicted day (not Friday), a new week high that closes red is shorted at the close (stop above the day's high), a new
// week low closing green is bought; exit at 2R, the stop, or the week's last close.
function backtestWeeks(ws, sym, predicted = true) {
  const tick = TICK[sym], res = []
  for (const w of ws) {
    const r = weekRule(w); if (!r) continue
    let wh = -Infinity, wl = Infinity, done = false
    for (let i = 0; i < w.days.length && !done; i++) {
      const d = w.days[i], isTarget = r.targets.includes(d.dow)
      if (isTarget === predicted && d.dow !== 5) {
        // Monday opens the week, so every Monday is a new extreme: its candle colour picks the side.
        let side = 0, entry, stop
        if ((i === 0 || d.h > wh) && d.c < d.o) { side = -1; entry = d.c; stop = d.h + tick }
        else if ((i === 0 || d.l < wl) && d.c > d.o) { side = 1; entry = d.c; stop = d.l - tick }
        if (side) {
          done = true
          const risk = Math.abs(entry - stop), target = entry + side * 2 * risk
          let out = null
          for (const x of w.days.slice(i + 1)) {
            if (side === 1 ? x.l <= stop : x.h >= stop) { out = -1; break }
            if (side === 1 ? x.h >= target : x.l <= target) { out = 2; break }
          }
          if (out === null) out = side * (w.days.at(-1).c - entry) / risk
          res.push({ r: out - COST_TICKS * tick / risk, date: w.key })
        }
      }
      wh = Math.max(wh, d.h); wl = Math.min(wl, d.l)
    }
  }
  return res
}

// ---------- report ----------
const syms = readdirSync(dir).filter(f => f.startsWith('h_')).map(f => f.slice(2, -5))
const line = (label, s) => s.n ? `${pad(label, 34)} n=${pad(s.n, 4)} win ${pad((s.win * 100).toFixed(1) + '%', 6)} avg ${pad(s.avg.toFixed(3) + 'R', 8)} sum ${pad(s.total.toFixed(1) + 'R', 8)} PF ${pad(s.pf.toFixed(2), 5)} maxDD ${s.dd.toFixed(1)}R` : `${pad(label, 34)} n=0`
const all = { pred: [], ctrlLon: [], ctrlSwap: [], wPred: [], wCtrl: [] }
for (const sym of syms) {
  const days = tradingDays(bars(join(dir, `h_${sym}.json`)))
  const ds = dayStats(days)
  console.log(`\n=== ${sym} · ${days[0].key} … ${days.at(-1).key} · ${ds.n} dni z prognozą ===`)
  console.log(`High dnia w przewidzianej sesji: ${pct(ds.hi, ds.n)} (zamienione reguły: ${pct(ds.ctrl.hi, ds.ctrl.n)})`)
  console.log(`Low dnia  w przewidzianej sesji: ${pct(ds.lo, ds.n)} (zamienione reguły: ${pct(ds.ctrl.lo, ds.ctrl.n)})`)
  console.log(`Oba ekstrema: ${pct(ds.both, ds.n)} · przynajmniej jedno: ${pct(ds.any, ds.n)}`)
  console.log(`Sesja High: ${[1, 2, 3, 4].map(q => `${NAMES[q]} ${pct(ds.hiBy[q], ds.n)}`).join(' · ')}`)
  console.log(`Sesja Low:  ${[1, 2, 3, 4].map(q => `${NAMES[q]} ${pct(ds.loBy[q], ds.n)}`).join(' · ')}`)
  const second = r => r.targets.find(q => q !== 1)
  const pred = backtestDays(days, sym, second)
  const ctrlLon = backtestDays(days, sym, () => 2)
  const ctrlSwap = backtestDays(days, sym, r => second(r) === 3 ? 4 : 3)
  console.log(line('Strategia: przewidziana sesja', summary(pred)))
  console.log(line('Kontrola: Londyn (Q2)', summary(ctrlLon)))
  console.log(line('Kontrola: zamieniona sesja Q3↔Q4', summary(ctrlSwap)))
  all.pred.push(...pred); all.ctrlLon.push(...ctrlLon); all.ctrlSwap.push(...ctrlSwap)

  const ws = weeks(bars(join(dir, `d_${sym}.json`))), wsx = weekStats(ws)
  console.log(`Tydzień (${ws.length} tyg., ${wsx.n} z prognozą): High w przewidzianym dniu ${pct(wsx.hi, wsx.n)} · Low ${pct(wsx.lo, wsx.n)} · któreś ${pct(wsx.any, wsx.n)}`)
  console.log(`  dzień High: ${['', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt'].map((n, i) => i ? `${n} ${pct(wsx.hiBy[i], wsx.n)}` : '').filter(Boolean).join(' · ')}`)
  console.log(`  dzień Low:  ${['', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt'].map((n, i) => i ? `${n} ${pct(wsx.loBy[i], wsx.n)}` : '').filter(Boolean).join(' · ')}`)
  const wp = backtestWeeks(ws, sym, true), wc = backtestWeeks(ws, sym, false)
  console.log(line('Tydzień: przewidziane dni', summary(wp)))
  console.log(line('Tydzień: kontrola (inne dni)', summary(wc)))
  all.wPred.push(...wp); all.wCtrl.push(...wc)
}
console.log('\n=== RAZEM (wszystkie rynki) ===')
console.log(line('Dzień · przewidziana sesja', summary(all.pred)))
console.log(line('Dzień · kontrola Londyn', summary(all.ctrlLon)))
console.log(line('Dzień · kontrola Q3↔Q4', summary(all.ctrlSwap)))
console.log(line('Tydzień · przewidziane dni', summary(all.wPred)))
console.log(line('Tydzień · kontrola', summary(all.wCtrl)))
