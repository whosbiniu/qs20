// Trade journal ("Inne → Dziennik"), modelled on LuxAlgo Trade Journal (github.com/LuxAlgo/trade-journal, MIT).
// Its engine does every calculation: fills (executions) → round-trip trades (FIFO / LIFO / average), metrics, equity
// and drawdown, the P&L calendar, the Edge Score and breakdowns, plus the 14 broker statement importers
// (journal-core.js, built from vendor/luxalgo-trade-journal). The screens are ours: kokpit, kalendarz, dziennik dnia,
// transakcje, strona transakcji, raporty, import. Data stays in this browser (IndexedDB); our own additions are the
// quarter / session context and the chart snapshot saved with a manually added trade.
window.Journal = (() => {
  'use strict'
  const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const ACCOUNT = 'main'
  // Point value per contract; symbols not listed count 1 (stocks, crypto, CFDs). Editable in Import → Ustawienia.
  const MULTIPLIERS = { NQ: 20, MNQ: 2, ES: 50, MES: 5, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, GC: 100, MGC: 10, SI: 5000, SIL: 1000, CL: 1000, MCL: 100, NG: 10000, ZN: 1000, ZB: 1000, '6E': 125000, '6J': 12500000, '6B': 62500 }
  const VIEWS = [['dash', 'Kokpit'], ['calendar', 'Kalendarz'], ['day', 'Dziennik dnia'], ['trades', 'Transakcje'], ['reports', 'Raporty'], ['import', 'Import i ustawienia']]
  const RANGES = [['7', '7D'], ['30', '30D'], ['90', '90D'], ['ytd', 'YTD'], ['all', 'Wszystko']]
  const WEEK = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']
  const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']

  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  const fin = n => typeof n === 'number' && Number.isFinite(n)

  function mount(pane, hooks = {}) {
    const { core: C, importers: I } = LuxJournal
    const light = () => document.documentElement.dataset.colorMode === 'light'
    // Polarity colours shared with the rest of "Inne" (validated pair, always with a sign or a label beside them).
    const UP = () => light() ? '#2a78d6' : '#3987e5', DOWN = () => light() ? '#e34948' : '#e66767'

    // ---- state -----------------------------------------------------------------------------------------------
    let execs = [], ann = {}, days = {}, settings = { method: 'fifo', multipliers: '', balance: 0, privacy: false, range: 'all' }
    let trades = [], view = 'dash', tradeKey = null, dayKey = null, month = null, reportTab = 'overview', breakdown = 'symbol', pending = null, activity = 'recent'

    // ---- storage: IndexedDB "unc-journal" (the old journal's database; its trades are migrated once) -----------
    const db = new Promise(resolve => {
      try {
        const req = indexedDB.open('unc-journal', 3)
        req.onupgradeneeded = () => { for (const name of ['shots', 'journal', 'lux']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name) }
        req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null)
      } catch { resolve(null) }
    })
    async function idb(store, mode, key, value) {
      const d = await db
      if (!d) throw new Error('Brak IndexedDB')
      return new Promise((resolve, reject) => {
        const t = d.transaction(store, mode === 'get' ? 'readonly' : 'readwrite').objectStore(store)
        const req = mode === 'put' ? t.put(value, key) : mode === 'delete' ? t.delete(key) : t.get(key)
        req.onsuccess = () => resolve(req.result ?? null); req.onerror = () => reject(req.error)
      })
    }
    const shot = (mode, key, value) => idb('shots', mode, key, value).catch(() => null)
    let saveTimer = 0, saveFailed = false
    function save() {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(async () => {
        try { for (const [k, v] of [['executions', execs], ['annotations', ann], ['days', days], ['settings', settings]]) await idb('lux', 'put', k, v); if (saveFailed) warn(''); saveFailed = false }
        catch { saveFailed = true; warn('Nie udało się zapisać dziennika. Zrób kopię zapasową (Import i ustawienia → Eksport), aby nie stracić danych.') }
      }, 150)
    }

    // ---- engine ------------------------------------------------------------------------------------------------
    const root = s => String(s).toUpperCase().replace(/1!$/, '').replace(/[FGHJKMNQUVXZ]\d{1,4}$/, '')
    function multipliers() {
      const own = {}
      for (const part of String(settings.multipliers || '').split(/[,;\n]/)) { const m = part.match(/^\s*([A-Za-z0-9!._:-]+)\s*=\s*([\d.]+)\s*$/); if (m && Number(m[2]) > 0) own[m[1].toUpperCase()] = Number(m[2]) }
      const out = {}
      for (const s of new Set(execs.map(e => e.symbol))) { const r = root(s), v = own[s.toUpperCase()] ?? own[r] ?? MULTIPLIERS[r]; if (v) out[s] = v }
      return out
    }
    function rebuild() {
      trades = C.buildRoundTrips(execs, { method: settings.method, multipliers: multipliers() }).map(t => ({ ...t, annotations: ann[t.key] }))
    }
    const closed = list => list.filter(t => t.status !== 'open')
    function inRange(t) {
      if (settings.range === 'all') return true
      const at = Date.parse(t.closedAt || t.openedAt), now = new Date()
      if (settings.range === 'ytd') return at >= Date.UTC(now.getFullYear(), 0, 1)
      return at >= Date.now() - Number(settings.range) * 86400000
    }
    const filtered = () => trades.filter(inRange)
    const metrics = list => C.computeMetrics(list, { timeZone: TZ, initialBalance: Number(settings.balance) || 0 })

    // ---- formatting --------------------------------------------------------------------------------------------
    const money = (n, signed = true) => {
      if (!fin(n)) return '—'
      if (settings.privacy) return (signed && n < 0 ? '−' : '') + '$•••'
      const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      return (n < 0 ? '−' : signed && n > 0 ? '+' : '') + '$' + s
    }
    const short = n => settings.privacy ? '$•••' : (n < 0 ? '−' : n > 0 ? '+' : '') + '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(n))
    const pctTxt = (n, d = 1) => fin(n) ? (n * 100).toFixed(d) + '%' : '—'
    const numTxt = (n, d = 2) => fin(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d }) : '—'
    const ratio = n => fin(n) ? n.toFixed(2) : '—'
    const rTxt = r => fin(r) ? (r >= 0 ? '+' : '−') + Math.abs(r).toFixed(2) + 'R' : '—'
    const dur = ms => !fin(ms) ? '—' : ms < 60000 ? Math.round(ms / 1000) + 's' : ms < 3600000 ? Math.round(ms / 60000) + 'm' : ms < 86400000 ? (ms / 3600000).toFixed(1) + 'h' : (ms / 86400000).toFixed(1) + 'd'
    const when = iso => iso ? new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—'
    const dayOf = iso => C.dayKeyOf(iso, TZ)
    const dayLabel = key => new Date(key + 'T12:00:00Z').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    const STATUS = { win: 'ZYSK', loss: 'STRATA', breakeven: 'BE', open: 'OTWARTA' }
    const badge = s => `<span class="lj-badge ${s}">${STATUS[s]}</span>`
    const tone = n => n > 0 ? 'up' : n < 0 ? 'down' : ''
    const dir = d => d === 'long' ? 'long' : 'short'

    // ---- layout ------------------------------------------------------------------------------------------------
    pane.innerHTML = `<div class="lj">
      <aside class="lj-nav" aria-label="Dziennik">${VIEWS.map(([id, name]) => `<button type="button" data-view="${id}">${name}</button>`).join('')}
        <span class="lj-grow"></span>
        <label class="lj-privacy"><input type="checkbox" data-privacy> tryb prywatny</label>
        <p class="lj-credit">Silnik obliczeń i importu: <a href="https://github.com/LuxAlgo/trade-journal" target="_blank" rel="noopener">LuxAlgo Trade Journal</a> (MIT). Dane zostają w tej przeglądarce. To nie jest porada inwestycyjna.</p></aside>
      <main class="lj-main"><header class="lj-top"><h3 data-title></h3><span class="lj-grow"></span>
        <div class="lj-seg" role="group" aria-label="Zakres">${RANGES.map(([id, name]) => `<button type="button" data-range="${id}">${name}</button>`).join('')}</div>
        <button type="button" class="lj-primary" data-add>+ Dodaj transakcję</button></header>
        <p class="lj-warn" data-warn hidden></p><div class="lj-body" data-body></div></main></div>`
    const body = pane.querySelector('[data-body]')
    const warn = text => { const el = pane.querySelector('[data-warn]'); el.textContent = text; el.hidden = !text }

    function go(next, extra = {}) { view = next; Object.assign(state, extra); render(); body.scrollTop = 0; pane.scrollTop = 0 }
    const state = { get tradeKey() { return tradeKey }, set tradeKey(v) { tradeKey = v }, get dayKey() { return dayKey }, set dayKey(v) { dayKey = v } }

    function render() {
      rebuild()
      pane.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view || (view === 'trade' && b.dataset.view === 'trades')))
      pane.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('active', b.dataset.range === settings.range))
      pane.querySelector('[data-privacy]').checked = !!settings.privacy
      const titles = { trade: 'Transakcja', ...Object.fromEntries(VIEWS) }
      pane.querySelector('[data-title]').textContent = titles[view] + (view === 'day' && dayKey ? ' · ' + dayLabel(dayKey) : '')
      const draw = { dash: dashboard, calendar: calendarView, day: dayView, trades: tradesView, trade: tradeView, reports: reportsView, import: importView }[view]
      body.innerHTML = trades.length || view === 'import' ? draw() : empty()
      paintCharts()
    }
    const empty = () => `<div class="lj-empty"><h4>Dziennik jest pusty</h4><p>Dodaj transakcję ręcznie albo wczytaj wyciąg z brokera (TradingView, MetaTrader 4/5, NinjaTrader, Tradovate, TopstepX, ThinkorSwim, IBKR, Webull, DAS Trader, TradeZella, Tradervue…).</p>
      <p><button type="button" class="lj-primary" data-add>+ Dodaj transakcję</button> <button type="button" data-view="import">Wczytaj plik</button></p></div>`

    // ---- small components --------------------------------------------------------------------------------------
    const card = (title, inner, extra = '', cls = '') => `<section class="lj-card ${cls}"><header><h4>${title}</h4>${extra}</header>${inner}</section>`
    function gauge(value) {   // semicircle, 0..1
      const v = fin(value) ? Math.max(0, Math.min(1, value)) : 0, a = Math.PI * (1 - v), x = 50 + 40 * Math.cos(a), y = 50 - 40 * Math.sin(a)
      return `<svg class="lj-gauge" viewBox="0 0 100 56" aria-hidden="true"><path d="M10 50 A40 40 0 0 1 90 50" class="track"/>${v > 0 ? `<path d="M10 50 A40 40 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}" class="fill"/>` : ''}</svg>`
    }
    function radar(score) {
      const keys = [['winRate', 'Skuteczność'], ['profitFactor', 'Profit factor'], ['avgWinLoss', 'Śr. zysk / strata'], ['drawdown', 'Obsunięcie'], ['recovery', 'Odrabianie'], ['consistency', 'Regularność']]
      const pt = (i, r) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [200 + Math.cos(a) * r, 120 + Math.sin(a) * r] }
      const ring = r => keys.map((_, i) => pt(i, r).map(n => n.toFixed(1)).join(',')).join(' ')
      const shape = keys.map(([k], i) => pt(i, 90 * (score.components[k] || 0) / 100).map(n => n.toFixed(1)).join(',')).join(' ')
      return `<svg class="lj-radar" viewBox="0 0 400 240" role="img" aria-label="Edge Score: ${keys.map(([k, n]) => `${n} ${Math.round(score.components[k])}`).join(', ')}">
        ${[.25, .5, .75, 1].map(f => `<polygon points="${ring(90 * f)}" class="grid"/>`).join('')}
        ${keys.map((_, i) => { const [x, y] = pt(i, 90); return `<line x1="200" y1="120" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="grid"/>` }).join('')}
        <polygon points="${shape}" class="shape"/>
        ${keys.map(([k, n], i) => { const [x, y] = pt(i, 108); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${Math.abs(x - 200) < 5 ? 'middle' : x > 200 ? 'start' : 'end'}"><title>${n}: ${Math.round(score.components[k])}/100</title>${n}</text>` }).join('')}</svg>`
    }
    // Charts are drawn after the HTML is in place (they need their width). Specs wait in `charts`.
    const charts = []
    function chart(spec, height = 220) { charts.push(spec); return `<div class="lj-chart" data-chart="${charts.length - 1}" style="height:${height}px"></div>` }
    function paintCharts() {
      body.querySelectorAll('[data-chart]').forEach(el => drawChart(el, charts[Number(el.dataset.chart)]))
      charts.length = 0
    }
    function drawChart(el, spec) {
      const W = Math.max(200, el.clientWidth), H = el.clientHeight, pad = { l: 64, r: 10, t: 10, b: 22 }
      const pts = spec.points
      if (!pts.length) { el.innerHTML = '<p class="lj-dim">Brak danych w tym zakresie.</p>'; return }
      const vals = pts.map(p => p.v), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1
      const X = i => pad.l + (pts.length === 1 ? (W - pad.l - pad.r) / 2 : i * (W - pad.l - pad.r) / (pts.length - 1))
      const Y = v => pad.t + (hi - v) / span * (H - pad.t - pad.b)
      const fmt = spec.fmt || short
      const ticks = [hi, (hi + lo) / 2, lo].filter((v, i, a) => a.indexOf(v) === i)
      let marks = ''
      if (spec.type === 'bars') {
        const step = (W - pad.l - pad.r) / pts.length, bw = Math.max(1, Math.min(24, step - 2))
        const Xb = i => pad.l + step * i + step / 2
        marks = pts.map((p, i) => { const y0 = Y(0), y1 = Y(p.v), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0)); return `<rect x="${(Xb(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(2, bw / 3)}" fill="${p.v >= 0 ? UP() : DOWN()}"/>` }).join('')
        spec.x = Xb
      } else {
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('')
        const color = spec.color || UP()
        marks = `<path d="${line}L${X(pts.length - 1).toFixed(1)} ${Y(0).toFixed(1)}L${X(0).toFixed(1)} ${Y(0).toFixed(1)}Z" fill="${color}" opacity=".1"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`
        if (spec.ref !== undefined) marks += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(spec.ref).toFixed(1)}" y2="${Y(spec.ref).toFixed(1)}" class="lj-ref"/>`
        spec.x = X
      }
      const labels = pts.length > 1 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : [0]
      el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(spec.label || '')}">
        ${ticks.map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="lj-grid${v === 0 ? ' zero' : ''}"/><text x="${pad.l - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`).join('')}
        ${marks}
        ${labels.map(i => `<text x="${spec.x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${esc(pts[i].x)}</text>`).join('')}
        <line class="lj-guide" y1="${pad.t}" y2="${H - pad.b}" hidden/><circle class="lj-dot" r="4" hidden/></svg><div class="lj-tip" hidden></div>`
      // Hover: the nearest point, its value and date.
      const svg = el.querySelector('svg'), guide = svg.querySelector('.lj-guide'), dot = svg.querySelector('.lj-dot'), tip = el.querySelector('.lj-tip')
      svg.addEventListener('pointermove', e => {
        const x = e.clientX - svg.getBoundingClientRect().left
        let best = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(spec.x(i) - x) < Math.abs(spec.x(best) - x)) best = i
        const p = pts[best], gx = spec.x(best)
        guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.hidden = false
        if (spec.type !== 'bars') { dot.setAttribute('cx', gx); dot.setAttribute('cy', Y(p.v)); dot.setAttribute('fill', spec.color || UP()); dot.hidden = false }
        tip.innerHTML = `<b>${esc(fmt === short ? money(p.v) : fmt(p.v))}</b><span>${esc(p.tip || p.x)}</span>`
        tip.hidden = false; tip.style.left = Math.min(W - tip.offsetWidth - 4, Math.max(0, gx + 10)) + 'px'
      })
      svg.addEventListener('pointerleave', () => { guide.hidden = true; dot.hidden = true; tip.hidden = true })
      if (spec.click) svg.addEventListener('click', e => { const x = e.clientX - svg.getBoundingClientRect().left; let best = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(spec.x(i) - x) < Math.abs(spec.x(best) - x)) best = i; spec.click(pts[best]) })
    }
    const shortDay = key => key.slice(8, 10) + '.' + key.slice(5, 7)

    // Month grid, Monday first, with weekly totals (daily figures from the engine's dailyStats).
    function calendarGrid(list, y, m, compact = false) {
      const cash = compact ? short : money
      const prefix = `${y}-${String(m).padStart(2, '0')}`, stats = new Map(C.dailyStats(list, TZ).filter(d => d.date.startsWith(prefix)).map(d => [d.date, d]))
      const count = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
      const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => { const date = `${prefix}-${String(i + 1).padStart(2, '0')}`; return stats.get(date) || { date, netPnl: 0, trades: 0 } })]
      while (cells.length % 7) cells.push(null)
      const best = Math.max(1, ...[...stats.values()].map(d => Math.abs(d.netPnl))), traded = [...stats.values()].filter(d => d.trades)
      const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
      return `<div class="lj-cal"><div class="lj-cal-row head">${[1, 2, 3, 4, 5, 6, 0].map(i => `<span>${WEEK[i]}</span>`).join('')}<span>Tydzień</span></div>
        ${weeks.map(w => {
          const wn = w.reduce((s, d) => s + (d?.netPnl || 0), 0), wt = w.reduce((s, d) => s + (d?.trades || 0), 0)
          return `<div class="lj-cal-row">${w.map(d => !d ? '<span class="lj-day none"></span>' : `<button type="button" class="lj-day ${d.trades ? tone(d.netPnl) : ''}" data-day="${d.date}" style="--a:${(0.12 + 0.5 * Math.abs(d.netPnl) / best).toFixed(2)}" ${d.trades ? '' : 'tabindex="-1"'}><i>${Number(d.date.slice(8))}</i>${d.trades ? `<b>${cash(d.netPnl)}</b><small>${d.trades} ${compact ? 'tr.' : d.trades === 1 ? 'transakcja' : 'transakcji'}</small>` : ''}</button>`).join('')}
            <span class="lj-week"><b>${wt ? cash(wn) : '—'}</b><small>${wt ? wt + ' trans.' : ''}</small></span></div>`
        }).join('')}
        <footer><span>${traded.length} dni z transakcjami · ${traded.filter(d => d.netPnl > 0).length} na plusie</span><span>Miesiąc: <b>${money(traded.reduce((s, d) => s + d.netPnl, 0))}</b></span></footer></div>`
    }
    function tradeRow(t, compact = false) {
      return `<button type="button" class="lj-row" data-trade="${esc(t.key)}">${badge(t.status)}<b>${esc(t.symbol)}</b><small>${dir(t.direction)}</small><span class="lj-grow"></span>
        ${compact ? '' : `<small>${numTxt(t.quantity)} @ ${numTxt(t.avgEntry, 4)}${fin(t.avgExit) ? ' → ' + numTxt(t.avgExit, 4) : ''}</small>`}<small>${compact ? shortDay(dayOf(t.closedAt || t.openedAt)) : when(t.closedAt || t.openedAt)}</small><b class="lj-num">${t.status === 'open' ? '—' : money(t.netPnl)}</b></button>`
    }

    // ---- views -------------------------------------------------------------------------------------------------
    function dashboard() {
      const list = filtered(), m = metrics(list), edge = C.computeEdgeScore(m), daysList = C.dailyStats(list, TZ)
      const cum = C.dailyCumulativeFromDays(daysList), dd = C.relativeDrawdownCurve(cum, Number(settings.balance) || 0)
      const last = list.map(t => t.closedAt || t.openedAt).sort().at(-1) || new Date().toISOString()
      const [y, mo] = (month || dayOf(last).slice(0, 7)).split('-').map(Number)
      const open = trades.filter(t => t.status === 'open'), recent = [...closed(list)].sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt)).slice(0, 12)
      const winPart = m.avgWin && m.avgLoss ? m.avgWin / (m.avgWin + Math.abs(m.avgLoss)) : .5
      return `<div class="lj-tiles five">
        ${card('Net P&L', `<p class="lj-hero">${money(m.netPnl)}</p><p class="lj-dim">${m.closedTrades} zamkniętych · opłaty ${money(m.fees, false)}</p>`)}
        ${card('Skuteczność transakcji', `<div class="lj-gauge-row">${gauge(m.winRate)}<p class="lj-hero">${pctTxt(m.winRate)}</p><p class="lj-dim">${m.wins} Z · ${m.breakevens} BE · ${m.losses} S</p></div>`)}
        ${card('Profit factor', `<p class="lj-hero">${m.profitFactorIsInfinite ? '∞' : ratio(m.profitFactor)}</p><p class="lj-dim">zyski brutto ÷ straty brutto</p>`)}
        ${card('Skuteczność dni', `<div class="lj-gauge-row">${gauge(m.dayWinRate)}<p class="lj-hero">${pctTxt(m.dayWinRate)}</p><p class="lj-dim">${m.tradingDays} dni</p></div>`)}
        ${card('Śr. zysk / strata', `<p class="lj-hero">${ratio(m.avgWinLossRatio)}</p><div class="lj-split" aria-hidden="true"><i style="flex:${winPart};background:${UP()}"></i><i style="flex:${1 - winPart};background:${DOWN()}"></i></div><p class="lj-dim">${money(m.avgWin)} śr. zysk · ${money(fin(m.avgLoss) ? -Math.abs(m.avgLoss) : null)} śr. strata</p>`)}
      </div>
      <div class="lj-grid3">
        ${card('Edge Score', edge.score === null ? `<p class="lj-dim">Potrzeba co najmniej 5 zamkniętych transakcji (jest ${edge.closedTrades}).</p>` : radar(edge), edge.score === null ? '' : `<span class="lj-score"><b>${edge.score.toFixed(2)}</b>/100</span>`)}
        ${card('Skumulowany P&L dzienny', chart({ type: 'line', label: 'Skumulowany P&L', points: cum.map(p => ({ x: shortDay(p.t), tip: dayLabel(p.t), v: p.cumNetPnl })) }, 190)
          + `<h5>Obsunięcie od szczytu ${(() => { const mx = Math.max(0, ...dd.map(p => p.drawdownPct || 0)); return mx ? '· maks. −' + (mx * 100).toFixed(1) + '%' : '' })()}</h5>`
          + (Number(settings.balance) > 0 ? chart({ type: 'line', color: DOWN(), fmt: v => (v * 100).toFixed(1) + '%', label: 'Obsunięcie', points: dd.map(p => ({ x: shortDay(p.t), tip: dayLabel(p.t), v: -(p.drawdownPct || 0) })) }, 90)
            : chart({ type: 'line', color: DOWN(), label: 'Obsunięcie', points: cum.map((p, i) => ({ x: shortDay(p.t), tip: dayLabel(p.t), v: p.cumNetPnl - Math.max(0, ...cum.slice(0, i + 1).map(q => q.cumNetPnl)) })) }, 90)))}
        ${card('P&L dzienny netto', chart({ type: 'bars', label: 'P&L dzienny', points: daysList.map(d => ({ x: shortDay(d.date), tip: dayLabel(d.date) + ' · ' + d.trades + ' trans.', v: d.netPnl, day: d.date })), click: p => go('day', { dayKey: p.day }) }, 300))}
      </div>
      <div class="lj-grid2 cal">
        ${card(`${MONTHS[mo - 1]} ${y}`, calendarGrid(list, y, mo, true), `<button type="button" class="lj-link" data-view="calendar">Pełny kalendarz</button>`)}
        ${card('Aktywność', `<div class="lj-seg small" role="tablist"><button type="button" data-activity="recent" class="${activity === 'recent' ? 'active' : ''}">Ostatnie</button><button type="button" data-activity="open" class="${activity === 'open' ? 'active' : ''}">Otwarte pozycje · ${open.length}</button></div>
          <div class="lj-list">${(activity === 'open' ? open : recent).map(t => tradeRow(t, true)).join('') || '<p class="lj-dim">Brak.</p>'}</div>`)}
      </div>`
    }

    function calendarView() {
      const list = filtered(), last = list.map(t => t.closedAt || t.openedAt).sort().at(-1) || new Date().toISOString()
      const key = month || dayOf(last).slice(0, 7), [y, mo] = key.split('-').map(Number)
      const inMonth = list.filter(t => t.closedAt && dayOf(t.closedAt).startsWith(key)), m = metrics(inMonth), ds = C.dailyStats(inMonth, TZ)
      const green = ds.filter(d => d.netPnl > 0), red = ds.filter(d => d.netPnl < 0), avg = a => a.length ? a.reduce((s, d) => s + d.netPnl, 0) / a.length : null
      const best = [...ds].sort((a, b) => b.netPnl - a.netPnl)[0], worst = [...ds].sort((a, b) => a.netPnl - b.netPnl)[0]
      return `<div class="lj-monthbar"><button type="button" data-month="-1" aria-label="Poprzedni miesiąc">‹</button><b>${MONTHS[mo - 1]} ${y}</b><button type="button" data-month="1" aria-label="Następny miesiąc">›</button></div>
        ${card('', calendarGrid(list, y, mo), '', 'lj-plain')}
        <h4 class="lj-h">Podsumowanie miesiąca</h4><div class="lj-tiles">
        ${card('Net P&L', `<p class="lj-hero">${money(m.netPnl)}</p><p class="lj-dim">${ds.length} dni z transakcjami</p>`)}
        ${card('Średni P&L dnia', `<p class="lj-hero">${money(avg(ds))}</p><p class="lj-dim">na dzień z zamkniętą transakcją</p>`)}
        ${card('Skuteczność', `<p class="lj-hero">${pctTxt(m.winRate)}</p><p class="lj-dim">${m.wins} zysków · ${m.losses} strat · ${m.breakevens} BE</p>`)}
        ${card('Zamknięte transakcje', `<p class="lj-hero">${m.closedTrades}</p><p class="lj-dim">pełne cykle pozycji, nie pojedyncze wykonania</p>`)}
        ${card('Najlepszy i najgorszy dzień', best ? `<p class="lj-kv"><span>Najlepszy</span><button type="button" class="lj-link" data-day="${best.date}">${money(best.netPnl)} · ${shortDay(best.date)}</button></p><p class="lj-kv"><span>Najgorszy</span><button type="button" class="lj-link" data-day="${worst.date}">${money(worst.netPnl)} · ${shortDay(worst.date)}</button></p>` : '<p class="lj-dim">—</p>')}
        ${card('Średni dzień na plusie i minusie', `<p class="lj-kv"><span>${green.length} na plusie</span><b>${money(avg(green))}</b></p><p class="lj-kv"><span>${red.length} na minusie</span><b>${money(avg(red))}</b></p>`)}
        ${card('Regularność dni', `<p class="lj-hero">${ds.length ? pctTxt(green.length / ds.length) : '—'}</p><p class="lj-dim">${green.length} dodatnich · ${red.length} ujemnych · ${ds.length - green.length - red.length} zerowych</p>`)}
        </div>`
    }

    function dayView() {
      const all = C.dailyStats(trades, TZ).map(d => d.date)
      if (!dayKey) dayKey = all.at(-1) || dayOf(new Date().toISOString())
      const list = trades.filter(t => dayOf(t.closedAt || t.openedAt) === dayKey), m = metrics(list)
      const times = new Map(execs.map(e => [e.id, e.executedAt])), curve = C.intradayCurve(list, times, dayKey, TZ)
      const i = all.indexOf(dayKey), prev = i > 0 ? all[i - 1] : all.filter(d => d < dayKey).at(-1), next = all.find(d => d > dayKey)
      const note = days[dayKey] || ''
      const stat = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`
      return `<div class="lj-monthbar"><button type="button" data-goday="${prev || ''}" ${prev ? '' : 'disabled'} aria-label="Poprzedni dzień z transakcjami">‹</button><input type="date" data-pickday value="${dayKey}" aria-label="Dzień"><button type="button" data-goday="${next || ''}" ${next ? '' : 'disabled'} aria-label="Następny dzień z transakcjami">›</button></div>
      <div class="lj-grid2 wide-left"><div>
        ${card('Statystyki dnia', `<div class="lj-stats">${stat('Net P&L', money(m.netPnl))}${stat('Transakcje', m.closedTrades)}${stat('Skuteczność', pctTxt(m.winRate))}${stat('Zyskowne', m.wins)}${stat('Stratne', m.losses)}${stat('Brutto', money(m.grossPnl))}${stat('Opłaty', money(m.fees, false))}${stat('Wolumen', numTxt(m.totalVolume))}${stat('Profit factor', m.profitFactorIsInfinite ? '∞' : ratio(m.profitFactor))}${stat('Oczekiwana wartość', money(m.expectancy))}</div>`)}
        ${card('Skumulowany P&L w ciągu dnia', chart({ type: 'line', label: 'P&L w ciągu dnia', points: (curve.length ? [{ t: list.map(x => x.openedAt).sort()[0] || curve[0].t, cumNetPnl: 0 }, ...curve] : []).map(p => { const t = new Date(p.t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }); return { x: t, tip: t, v: p.cumNetPnl } }) }, 200))}
        ${card('Transakcje', `<div class="lj-list">${list.map(tradeRow).join('') || '<p class="lj-dim">Tego dnia nie ma transakcji.</p>'}</div>`)}
      </div><div>
        ${card('Notatka dnia', `<div class="lj-seg small"><button type="button" data-notemode="edit" class="active">Edycja</button><button type="button" data-notemode="preview">Podgląd</button></div>
          <textarea class="lj-note" data-daynote rows="16" placeholder="Plan, przebieg sesji, co poszło dobrze, co poprawić… (Markdown: # nagłówek, - lista, **pogrubienie**, - [ ] zadanie)">${esc(note)}</textarea><div class="lj-md" data-notepreview hidden></div>
          <p class="lj-dim" data-notesaved>${note ? 'Zapisane.' : 'Zapisuje się samo.'}</p>`)}
      </div></div>`
    }

    let tradeFilter = { q: '', status: '' }
    function tradesView() {
      const q = tradeFilter.q.trim().toUpperCase()
      const list = filtered().filter(t => (!q || t.symbol.toUpperCase().includes(q) || (t.annotations?.tags || []).some(x => x.toUpperCase().includes(q))) && (!tradeFilter.status || t.status === tradeFilter.status))
        .sort((a, b) => Date.parse(b.closedAt || b.openedAt) - Date.parse(a.closedAt || a.openedAt))
      return `<div class="lj-filters"><input type="search" data-tq value="${esc(tradeFilter.q)}" placeholder="Instrument albo tag…" aria-label="Szukaj"><select data-tstatus aria-label="Wynik"><option value="">Wszystkie</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${tradeFilter.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select><span class="lj-dim">${list.length} transakcji · wynik ${money(list.filter(t => t.status !== 'open').reduce((s, t) => s + t.netPnl, 0))}</span><span class="lj-grow"></span><button type="button" data-csv>Eksport CSV</button></div>
      <div class="lj-tablewrap"><table class="lj-table"><thead><tr><th>Zamknięcie</th><th>Instrument</th><th>Kierunek</th><th>Wynik</th><th class="n">Ilość</th><th class="n">Śr. wejście</th><th class="n">Śr. wyjście</th><th class="n">Net P&L</th><th class="n">R</th><th class="n">Czas</th><th>Tagi</th></tr></thead><tbody>
        ${list.map(t => `<tr data-trade="${esc(t.key)}" tabindex="0"><td>${when(t.closedAt || t.openedAt)}</td><td><b>${esc(t.symbol)}</b></td><td>${dir(t.direction)}</td><td>${badge(t.status)}</td><td class="n">${numTxt(t.quantity)}</td><td class="n">${numTxt(t.avgEntry, 5)}</td><td class="n">${numTxt(t.avgExit, 5)}</td><td class="n">${t.status === 'open' ? '—' : money(t.netPnl)}</td><td class="n">${rTxt(C.tradeR(t))}</td><td class="n">${dur(t.durationMs)}</td><td>${esc((t.annotations?.tags || []).join(', '))}</td></tr>`).join('')}
      </tbody></table></div>`
    }

    function tradeView() {
      const t = trades.find(x => x.key === tradeKey)
      if (!t) { view = 'trades'; return tradesView() }
      const a = t.annotations || {}, c = a.context || {}, fills = execs.filter(e => t.executionIds.includes(e.id)).sort((x, y) => Date.parse(x.executedAt) - Date.parse(y.executedAt))
      const stat = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`
      const closeSide = t.direction === 'long' ? 'sell' : 'buy'
      const ctx = [c.session && 'sesja ' + c.session, c.weekday, c.monthly && 'M ' + c.monthly, c.weekly && 'W ' + c.weekly, c.daily && 'D ' + c.daily, c.m90 && '90m ' + c.m90, c.micro && 'micro ' + c.micro].filter(Boolean)
      const cyc = c.cycles ? ['hotd', 'lotd', 'hotw', 'lotw'].map(k => `${k.toUpperCase()} ${(c.cycles[k] || []).join(' · ') || '—'}`).join(' · ') : ''
      return `<p><button type="button" class="lj-link" data-view="trades">← Wszystkie transakcje</button></p>
      <div class="lj-grid2 wide-left"><div>
        ${card(`${esc(t.symbol)} · ${dir(t.direction).toUpperCase()}`, `<div class="lj-stats">${stat('Net P&L', t.status === 'open' ? 'otwarta' : money(t.netPnl))}${stat('Wynik', badge(t.status))}${stat('Brutto', money(t.grossPnl))}${stat('Opłaty', money(t.fees, false))}${stat('Ilość', numTxt(t.quantity) + (t.openQuantity ? ` (otwarte ${numTxt(t.openQuantity)})` : ''))}${stat('Śr. wejście', numTxt(t.avgEntry, 5))}${stat('Śr. wyjście', numTxt(t.avgExit, 5))}${stat('Czas trwania', dur(t.durationMs))}${stat('Planowane R', fin(C.plannedR(t)) ? C.plannedR(t).toFixed(2) + 'R' : '—')}${stat('Zrealizowane R', rTxt(C.tradeR(t)))}${stat('Mnożnik', t.contractMultiplier || 1)}</div>`)}
        ${card('Przebieg wykonań', fillsChart(t, fills) + `<div class="lj-shot" data-shot="${esc(t.key)}">${a.shot ? '<p class="lj-dim">Wczytywanie zrzutu wykresu…</p>' : ''}</div>`)}
        ${card('Wykonania', `<table class="lj-table"><thead><tr><th>Czas</th><th>Strona</th><th class="n">Ilość</th><th class="n">Cena</th><th class="n">Opłata</th><th></th></tr></thead><tbody>${fills.map(e => `<tr><td>${when(e.executedAt)}</td><td>${e.side === 'buy' ? '▲ KUPNO' : '▼ SPRZEDAŻ'}</td><td class="n">${numTxt(e.quantity)}</td><td class="n">${numTxt(e.price, 5)}</td><td class="n">${money(e.fee, false)}</td><td><button type="button" class="lj-x" data-delexec="${esc(e.id)}" aria-label="Usuń wykonanie">×</button></td></tr>`).join('')}</tbody></table>
          <form class="lj-form inline" data-addexec><select name="side"><option value="${closeSide}">${closeSide === 'buy' ? 'kupno' : 'sprzedaż'} (${t.openQuantity ? 'zamknięcie' : 'wyjście'})</option><option value="${closeSide === 'buy' ? 'sell' : 'buy'}">${closeSide === 'buy' ? 'sprzedaż' : 'kupno'} (dołożenie)</option></select>
            <input name="quantity" type="number" step="any" min="0" value="${t.openQuantity || ''}" placeholder="ilość" required aria-label="Ilość"><input name="price" type="number" step="any" placeholder="cena" required aria-label="Cena"><input name="fee" type="number" step="any" min="0" placeholder="opłata" aria-label="Opłata"><input name="time" type="datetime-local" required aria-label="Czas" value="${localNow()}"><button>Dodaj wykonanie</button></form>`)}
      </div><div>
        ${card('Ocena transakcji', `<form class="lj-form" data-annot>
          <div class="lj-stars" role="radiogroup" aria-label="Ocena">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-rate="${n}" aria-label="${n} z 5" aria-pressed="${(a.rating || 0) >= n}">${(a.rating || 0) >= n ? '★' : '☆'}</button>`).join('')}<label class="lj-check"><input type="checkbox" name="reviewed" ${a.reviewed ? 'checked' : ''}> przejrzana</label></div>
          <div class="lj-two"><label>Stop loss<input name="stopLoss" type="number" step="any" value="${fin(a.stopLoss) ? a.stopLoss : ''}"></label><label>Cel<input name="profitTarget" type="number" step="any" value="${fin(a.profitTarget) ? a.profitTarget : ''}"></label></div>
          <label>Setup / playbook<input name="playbook" value="${esc(a.playbook || '')}" placeholder="np. SSMT Q2→Q3" list="lj-playbooks"></label>
          <label>Tagi (po przecinku)<input name="tags" value="${esc((a.tags || []).join(', '))}" placeholder="A+ setup, breakout"></label>
          <label>Błędy (po przecinku)<input name="mistakes" value="${esc((a.mistakes || []).join(', '))}" placeholder="za wczesne wejście, przesunięty stop"></label>
          <label>Notatka<textarea name="notes" rows="7" placeholder="Dlaczego weszłam/wszedłem, co zrobiłam/zrobiłem dobrze, co poprawić…">${esc(a.notes || '')}</textarea></label>
          <p class="lj-dim" data-saved>Zapisuje się samo.</p></form>
          <datalist id="lj-playbooks">${[...new Set(Object.values(ann).map(x => x?.playbook).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('')}</datalist>`)}
        ${card('Kontekst w chwili wejścia', ctx.length ? `<p>${esc(ctx.join(' · '))}</p>${cyc ? `<p class="lj-dim">${esc(cyc)}</p>` : ''}` : '<p class="lj-dim">Brak. Kontekst kwartałów zapisuje się przy ręcznym dodaniu transakcji.</p>')}
        ${card('Usuń', `<p class="lj-dim">Usuwa transakcję razem z jej wykonaniami, oceną i zrzutem.</p><button type="button" class="lj-danger" data-deltrade>Usuń transakcję</button>`)}
      </div></div>`
    }
    // Price path from the recorded fills (entry and exit markers), with the planned stop and target.
    function fillsChart(t, fills) {
      if (!fills.length) return ''
      const a = t.annotations || {}, prices = [...fills.map(e => e.price), a.stopLoss, a.profitTarget].filter(fin)
      const lo = Math.min(...prices), hi = Math.max(...prices), span = hi - lo || Math.abs(hi) * .01 || 1, W = 640, H = 200
      const t0 = Date.parse(fills[0].executedAt), t1 = Date.parse(fills.at(-1).executedAt), X = e => 40 + (t1 > t0 ? (Date.parse(e.executedAt) - t0) / (t1 - t0) : .5) * (W - 140), Y = p => 16 + (hi - p) / span * (H - 40)
      const level = (p, name) => fin(p) ? `<line x1="30" x2="${W - 10}" y1="${Y(p).toFixed(1)}" y2="${Y(p).toFixed(1)}" class="lj-ref"/><text x="${W - 12}" y="${(Y(p) - 4).toFixed(1)}" text-anchor="end">${name} ${numTxt(p, 5)}</text>` : ''
      return `<svg class="lj-fills" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wykonania transakcji">${level(a.stopLoss, 'stop')}${level(a.profitTarget, 'cel')}
        <path d="${fills.map((e, i) => `${i ? 'L' : 'M'}${X(e).toFixed(1)} ${Y(e.price).toFixed(1)}`).join('')}" fill="none" stroke="${t.netPnl >= 0 ? UP() : DOWN()}" stroke-width="2"/>
        ${fills.map(e => `<g><circle cx="${X(e).toFixed(1)}" cy="${Y(e.price).toFixed(1)}" r="5" fill="${e.side === 'buy' ? UP() : DOWN()}" class="lj-ring"/><text x="${X(e).toFixed(1)}" y="${(Y(e.price) + (e.side === 'buy' ? 18 : -9)).toFixed(1)}" text-anchor="middle">${e.side === 'buy' ? '▲ KUPNO' : '▼ SPRZEDAŻ'} ${numTxt(e.quantity)} @ ${numTxt(e.price, 5)}</text></g>`).join('')}</svg>`
    }

    function reportsView() {
      const list = filtered(), m = metrics(list), tabs = [['overview', 'Przegląd'], ['trends', 'Trendy'], ['breakdowns', 'Podziały']]
      const head = `<div class="lj-seg">${tabs.map(([k, n]) => `<button type="button" data-report="${k}" class="${reportTab === k ? 'active' : ''}">${n}</button>`).join('')}</div>`
      if (reportTab === 'overview') {
        const row = (k, v) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`
        const cl = closed(list), bestT = [...cl].sort((a, b) => b.netPnl - a.netPnl)[0], worstT = [...cl].sort((a, b) => a.netPnl - b.netPnl)[0]
        return head + `<div class="lj-grid2">${card('Wyniki', `<table class="lj-table kv">${row('Net P&L', money(m.netPnl))}${row('Brutto', money(m.grossPnl))}${row('Opłaty', money(m.fees, false))}${row('Zamknięte / otwarte', m.closedTrades + ' / ' + m.openTrades)}${row('Skuteczność', pctTxt(m.winRate))}${row('Skuteczność dni', pctTxt(m.dayWinRate))}${row('Profit factor', m.profitFactorIsInfinite ? '∞' : ratio(m.profitFactor))}${row('Oczekiwana wartość / transakcję', money(m.expectancy))}${row('Śr. zysk / śr. strata', money(m.avgWin) + ' / ' + money(fin(m.avgLoss) ? -Math.abs(m.avgLoss) : null))}${row('Największy zysk / strata', money(m.largestWin) + ' / ' + money(-Math.abs(m.largestLoss)))}</table>`)}
          ${card('Ryzyko i serie', `<table class="lj-table kv">${row('Maks. obsunięcie', money(-m.maxDrawdown) + (fin(m.maxDrawdownPct) ? ' (' + (m.maxDrawdownPct * 100).toFixed(1) + '%)' : ''))}${row('Recovery factor', ratio(m.recoveryFactor))}${row('Koncentracja zysku (najlepszy dzień)', pctTxt(m.profitConcentration))}${row('Śr. zrealizowane R', rTxt(m.avgRealizedR) + ` (${m.tradesWithRisk} ze stopem)`)}${row('Najdłuższa seria zysków / strat', m.maxWinStreak + ' / ' + m.maxLossStreak)}${row('Bieżąca seria', m.currentStreak > 0 ? m.currentStreak + ' zysków' : m.currentStreak < 0 ? -m.currentStreak + ' strat' : '—')}${row('Śr. czas transakcji', dur(m.avgDurationMs))}${row('Wolumen', numTxt(m.totalVolume))}${row('Dni z transakcjami', m.tradingDays)}</table>`)}</div>
          <div class="lj-grid2">${card('Największy zysk', bestT ? `<p class="lj-hero">${money(bestT.netPnl)}</p><button type="button" class="lj-link" data-trade="${esc(bestT.key)}">${esc(bestT.symbol)} · ${dir(bestT.direction)} · ${when(bestT.closedAt)} ↗</button>` : '—')}${card('Największa strata', worstT ? `<p class="lj-hero">${money(worstT.netPnl)}</p><button type="button" class="lj-link" data-trade="${esc(worstT.key)}">${esc(worstT.symbol)} · ${dir(worstT.direction)} · ${when(worstT.closedAt)} ↗</button>` : '—')}</div>`
      }
      if (reportTab === 'trends') {
        const cl = closed(list).sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt)), N = 20, win = [], avg = []
        for (let i = N - 1; i < cl.length; i++) { const w = cl.slice(i - N + 1, i + 1); win.push({ x: '#' + (i + 1), tip: `transakcje ${i - N + 2}–${i + 1}`, v: w.filter(t => t.status === 'win').length / N }); avg.push({ x: '#' + (i + 1), tip: `transakcje ${i - N + 2}–${i + 1}`, v: w.reduce((s, t) => s + t.netPnl, 0) / N }) }
        const note = cl.length < N ? `<p class="lj-dim">Trendy potrzebują co najmniej ${N} zamkniętych transakcji (jest ${cl.length}).</p>` : ''
        return head + note + `<div class="lj-grid2">${card('Skuteczność · ostatnie 20 transakcji', `<p class="lj-hero">${win.length ? pctTxt(win.at(-1).v) : '—'}</p><p class="lj-dim">Przerywana linia: skuteczność w całym zakresie (${pctTxt(m.winRate)})</p>` + chart({ type: 'line', label: 'Skuteczność krocząca', fmt: v => (v * 100).toFixed(0) + '%', ref: m.winRate ?? 0, points: win }, 220))}
          ${card('Średni wynik · ostatnie 20 transakcji', `<p class="lj-hero">${avg.length ? money(avg.at(-1).v) : '—'}</p><p class="lj-dim">Przerywana linia: średnia w całym zakresie (${money(m.closedTrades ? m.netPnl / m.closedTrades : null)})</p>` + chart({ type: 'line', label: 'Średni wynik kroczący', ref: m.closedTrades ? m.netPnl / m.closedTrades : 0, points: avg }, 220))}</div>
          <p class="lj-dim">Okna kroczące nakładają się i opisują ostatnie wyniki, a nie prognozę. Przy małej próbie wartości mogą się mocno zmieniać.</p>`
      }
      const DIMS = [['symbol', 'Instrument'], ['direction', 'Kierunek'], ['weekday', 'Dzień tygodnia'], ['entryHour', 'Godzina wejścia'], ['duration', 'Czas trwania'], ['quantity', 'Wielkość pozycji'], ['realizedR', 'Zrealizowane R'], ['tag', 'Tag'], ['mistake', 'Błąd'], ['playbook', 'Setup'], ['session', 'Sesja (kontekst)'], ['dailyQ', 'Kwartał dzienny'], ['weeklyQ', 'Kwartał tygodniowy']]
      const own = { session: t => t.annotations?.context?.session, dailyQ: t => t.annotations?.context?.daily, weeklyQ: t => t.annotations?.context?.weekly }
      const cl = closed(list), groups = new Map()
      for (const t of cl) for (const k of own[breakdown] ? [own[breakdown](t) || 'brak'] : C.dimensionKeys(t, breakdown, TZ)) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t) }
      const rows = [...groups].map(([k, g]) => ({ k, ...C.summarizeGroup(g) })).sort((a, b) => b.netPnl - a.netPnl), most = Math.max(1, ...rows.map(r => Math.abs(r.netPnl)))
      return head + `<div class="lj-filters"><label>Podział według <select data-breakdown>${DIMS.map(([k, n]) => `<option value="${k}" ${breakdown === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <div class="lj-tablewrap"><table class="lj-table"><thead><tr><th>${esc(DIMS.find(d => d[0] === breakdown)[1])}</th><th class="n">Transakcje</th><th class="n">Skuteczność</th><th class="n">Profit factor</th><th class="n">Śr. R</th><th class="n">Net P&L</th><th class="lj-barcol"></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(r.k)}</td><td class="n">${r.trades}</td><td class="n">${pctTxt(r.winRate)}</td><td class="n">${r.noLosses ? '∞' : ratio(r.profitFactor)}</td><td class="n">${rTxt(r.avgRealizedR)}</td><td class="n">${money(r.netPnl)}</td><td class="lj-barcol"><i style="width:${(Math.abs(r.netPnl) / most * 100).toFixed(1)}%;background:${r.netPnl >= 0 ? UP() : DOWN()}"></i></td></tr>`).join('') || '<tr><td colspan="7" class="lj-dim">Brak zamkniętych transakcji.</td></tr>'}</tbody></table></div>`
    }

    function importView() {
      const p = pending
      return `<div class="lj-grid2">
        ${card('Wczytaj wyciąg z brokera', `<p class="lj-dim">Format rozpoznaje się sam: TradingView (paper i strategie), MetaTrader 4 i 5, NinjaTrader, Tradovate, TopstepX, ThinkorSwim, IBKR (activity i Flex), Webull, DAS Trader, TradeZella, Tradervue. Powtórnie wczytane wykonania są pomijane.</p>
          <div class="lj-form inline"><label>Strefa czasowa pliku <select data-importtz><option value="${esc(TZ)}">lokalna (${esc(TZ)})</option><option value="UTC">UTC</option><option value="America/New_York">Nowy Jork</option><option value="Europe/London">Londyn</option></select></label>
          <label class="lj-file">Wybierz plik CSV / HTML<input type="file" accept=".csv,.txt,.htm,.html,.tsv" data-importfile hidden></label></div>
          ${p ? `<div class="lj-preview"><p><b>${esc(p.format)}</b> · ${p.executions.length} wykonań · ${p.fresh.length} nowych${p.skippedRows ? ` · pominięte wiersze: ${p.skippedRows}` : ''}</p>${p.range ? `<p class="lj-dim">${esc(p.range)}</p>` : ''}
            ${[...(p.errors || []), ...p.warnings].slice(0, 6).map(w => `<p class="lj-warnline">${esc(w)}</p>`).join('')}
            ${p.errors?.length ? '<p>Tego pliku nie da się wczytać bez poprawek.</p>' : `<button type="button" class="lj-primary" data-commit ${p.fresh.length ? '' : 'disabled'}>Dodaj ${p.fresh.length} wykonań</button>`} <button type="button" data-cancelimport>Anuluj</button></div>` : ''}`)}
        ${card('Dodaj transakcję ręcznie', addForm())}
      </div><div class="lj-grid2">
        ${card('Ustawienia', `<form class="lj-form" data-settings>
          <label>Liczenie wyniku częściowych wyjść<select name="method"><option value="fifo">FIFO</option><option value="lifo">LIFO</option><option value="wavg">średnia ważona</option></select></label>
          <label>Kapitał początkowy (dla obsunięcia w % i Edge Score)<input name="balance" type="number" step="any" min="0" value="${Number(settings.balance) || ''}" placeholder="np. 50000"></label>
          <label>Mnożniki kontraktów (poza domyślnymi)<textarea name="multipliers" rows="3" placeholder="NQ=20, ES=50, BTC=1">${esc(settings.multipliers || '')}</textarea></label>
          <p class="lj-dim">Domyślnie: ${esc(Object.entries(MULTIPLIERS).map(([k, v]) => k + '=' + v).join(', '))}. Oznaczenia typu NQ1! i NQZ6 liczą się jak NQ. Czas i dni liczone są w strefie ${esc(TZ)}.</p></form>`)}
        ${card('Kopia zapasowa', `<p class="lj-dim">Plik JSON z wykonaniami, ocenami, notatkami dni, ustawieniami i zrzutami wykresów. Wczyta też plik ze starego dziennika.</p>
          <p><button type="button" data-backup>Eksportuj kopię</button> <label class="lj-file">Wczytaj kopię<input type="file" accept="application/json,.json" data-restore hidden></label> <button type="button" data-csv>Eksport transakcji CSV</button></p>`)}
      </div>`
    }
    function localNow(ms = Date.now()) { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
    function addForm() {
      return `<form class="lj-form" data-addtrade>
        <div class="lj-two"><label>Instrument<input name="symbol" required spellcheck="false" placeholder="NQ1!" value="${esc(hooks.currentSymbol?.() || '')}"></label><label>Kierunek<select name="direction"><option value="long">long</option><option value="short">short</option></select></label></div>
        <div class="lj-two"><label>Ilość<input name="quantity" type="number" step="any" min="0" value="1" required></label><label>Opłaty łącznie<input name="fee" type="number" step="any" min="0" placeholder="0"></label></div>
        <div class="lj-two"><label>Cena wejścia<input name="entry" type="number" step="any" required></label><label>Czas wejścia<input name="entryTime" type="datetime-local" value="${localNow()}" required></label></div>
        <div class="lj-two"><label>Cena wyjścia<input name="exit" type="number" step="any" placeholder="puste = otwarta"></label><label>Czas wyjścia<input name="exitTime" type="datetime-local"></label></div>
        <div class="lj-two"><label>Stop loss<input name="stop" type="number" step="any"></label><label>Cel<input name="target" type="number" step="any"></label></div>
        <label>Tagi (po przecinku)<input name="tags" placeholder="A+ setup"></label><label>Notatka<input name="notes" placeholder="setup, powód, emocje…"></label>
        <label class="lj-check"><input type="checkbox" name="shot" checked> zapisz zrzut wykresu i kontekst kwartałów</label>
        <button class="lj-primary">Zapisz transakcję</button></form>`
    }

    // ---- actions -----------------------------------------------------------------------------------------------
    const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 20).map(x => x.slice(0, 40))
    function setAnn(key, patch) { ann[key] = { ...(ann[key] || {}), ...patch }; save() }
    async function addTrade(form) {
      const f = new FormData(form), n = k => { const v = parseFloat(f.get(k)); return fin(v) ? v : null }
      const symbol = String(f.get('symbol')).trim().toUpperCase(), qty = n('quantity'), entry = n('entry'), exit = n('exit'), fee = n('fee') || 0
      const t0 = new Date(f.get('entryTime')).getTime(), t1 = f.get('exitTime') ? new Date(f.get('exitTime')).getTime() : t0 + 60000
      if (!symbol || !(qty > 0) || entry === null || !fin(t0)) return
      if (exit !== null && !(t1 > t0)) { warn('Czas wyjścia musi być późniejszy niż wejścia.'); return }
      const long = f.get('direction') === 'long', a = { id: 'm' + uid(), accountId: ACCOUNT, symbol, side: long ? 'buy' : 'sell', quantity: qty, price: entry, fee: exit === null ? fee : fee / 2, executedAt: new Date(t0).toISOString(), source: 'manual' }
      execs.push(a)
      if (exit !== null) execs.push({ id: 'm' + uid(), accountId: ACCOUNT, symbol, side: long ? 'sell' : 'buy', quantity: qty, price: exit, fee: fee / 2, executedAt: new Date(t1).toISOString(), source: 'manual' })
      rebuild()
      const t = trades.find(x => x.executionIds.includes(a.id))
      const patch = { stopLoss: n('stop') ?? undefined, profitTarget: n('target') ?? undefined, tags: list(f.get('tags')), notes: String(f.get('notes') || '').slice(0, 5000) }
      if (f.get('shot')) {
        try { patch.context = hooks.context?.(symbol, t0) } catch {}
        const image = await hooks.snapshot?.({ symbol, entry, stop: patch.stopLoss, target: patch.profitTarget }).catch(() => null)
        if (image && t) { await shot('put', t.key, image); patch.shot = true }
      }
      if (t) setAnn(t.key, patch); else save()
      go('trade', { tradeKey: t?.key })
    }
    function download(name, text, type) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }
    function csv() {
      const cell = v => /[",\n;]/.test(String(v ?? '')) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? '')
      const rows = [['opened_at', 'closed_at', 'symbol', 'direction', 'status', 'quantity', 'avg_entry', 'avg_exit', 'gross_pnl', 'fees', 'net_pnl', 'r_multiple', 'tags', 'mistakes', 'playbook', 'rating', 'notes']]
      for (const t of trades) { const a = t.annotations || {}; rows.push([t.openedAt, t.closedAt || '', t.symbol, t.direction, t.status, t.quantity, t.avgEntry, t.avgExit ?? '', t.grossPnl.toFixed(2), t.fees.toFixed(2), t.netPnl.toFixed(2), C.tradeR(t)?.toFixed(3) ?? '', (a.tags || []).join('|'), (a.mistakes || []).join('|'), a.playbook || '', a.rating || '', a.notes || '']) }
      download(`dziennik-transakcje-${new Date().toISOString().slice(0, 10)}.csv`, rows.map(r => r.map(cell).join(',')).join('\n'), 'text/csv')
    }
    async function backup() {
      const shots = {}
      for (const [k, a] of Object.entries(ann)) if (a?.shot) shots[k] = await shot('get', k)
      download(`dziennik-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 2, engine: 'luxalgo-trade-journal', executions: execs, annotations: ann, days, settings: { ...settings, privacy: false }, shots }), 'application/json')
    }
    // Files are untrusted: keep only well-formed executions and plain annotation fields.
    function cleanExec(e) {
      if (!e || typeof e !== 'object' || typeof e.id !== 'string' || e.id.length > 80) return null
      const symbol = String(e.symbol || '').slice(0, 40)
      if (!symbol || !['buy', 'sell'].includes(e.side) || !(e.quantity > 0) || !fin(e.price) || !fin(Date.parse(e.executedAt))) return null
      return { id: e.id, accountId: ACCOUNT, symbol, side: e.side, quantity: Number(e.quantity), price: Number(e.price), fee: Math.abs(Number(e.fee) || 0), executedAt: new Date(e.executedAt).toISOString(), source: ['sync', 'import', 'manual'].includes(e.source) ? e.source : 'import', ...(e.assetClass ? { assetClass: String(e.assetClass) } : {}), ...(e.importMetadata && typeof e.importMetadata === 'object' ? { importMetadata: JSON.parse(JSON.stringify(e.importMetadata)) } : {}) }
    }
    function cleanAnn(a) {
      if (!a || typeof a !== 'object') return null
      const strs = v => Array.isArray(v) ? v.map(x => String(x).slice(0, 40)).slice(0, 20) : []
      return { tags: strs(a.tags), mistakes: strs(a.mistakes), playbook: String(a.playbook || '').slice(0, 80), rating: Math.max(0, Math.min(5, Math.round(Number(a.rating) || 0))), stopLoss: fin(a.stopLoss) ? a.stopLoss : undefined, profitTarget: fin(a.profitTarget) ? a.profitTarget : undefined, reviewed: !!a.reviewed, notes: String(a.notes || '').slice(0, 20000), shot: !!a.shot, context: a.context && typeof a.context === 'object' ? JSON.parse(JSON.stringify(a.context)) : undefined }
    }
    const cleanShot = s => s && typeof s.image === 'string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(s.image) && s.image.length < 4000000 ? { symbol: String(s.symbol || '').slice(0, 20), frame: String(s.frame || '').slice(0, 6), image: s.image } : null
    const execKey = e => e.importMetadata?.id ? 'id:' + e.symbol + ':' + e.importMetadata.id : [e.symbol, e.side, e.quantity, e.price, e.executedAt].join('|')
    async function restore(file) {
      let data
      try { data = JSON.parse(await file.text()) } catch { warn('To nie jest plik kopii dziennika.'); return }
      if (Array.isArray(data.trades) && !data.executions) { const n = await migrate(data.trades, data.shots || {}); warn(`Wczytano ${n} transakcji ze starego dziennika.`); render(); return }
      if (!Array.isArray(data.executions)) { warn('To nie jest plik kopii dziennika.'); return }
      const known = new Set(execs.map(execKey)), ids = new Set(execs.map(e => e.id)); let added = 0
      for (const raw of data.executions) { const e = cleanExec(raw); if (e && !known.has(execKey(e)) && !ids.has(e.id)) { execs.push(e); known.add(execKey(e)); ids.add(e.id); added++ } }
      for (const [k, a] of Object.entries(data.annotations || {})) { const c = cleanAnn(a); if (c && !ann[k]) ann[k] = c }
      for (const [k, v] of Object.entries(data.days || {})) if (/^\d{4}-\d\d-\d\d$/.test(k) && !days[k]) days[k] = String(v).slice(0, 50000)
      for (const [k, s] of Object.entries(data.shots || {})) { const c = cleanShot(s); if (c) await shot('put', k, c) }
      save(); warn(`Wczytano kopię: ${added} nowych wykonań.`); render()
    }
    // The old journal kept one row per trade (entry, stop, target, exit, size, quarter context, snapshot): each becomes
    // an entry fill and, when closed, an exit fill; stop, target, note, context and snapshot move to its annotations.
    async function migrate(legacy, legacyShots = {}) {
      let count = 0
      for (const t of legacy) {
        if (!t || typeof t.id !== 'string' || !fin(t.entry) || !fin(t.time)) continue
        const symbol = String(t.symbol || '').toUpperCase().slice(0, 40), id = 'L' + t.id.slice(0, 30)
        if (!symbol || execs.some(e => e.id === id + 'a')) continue
        const long = t.side !== 'short', qty = t.size > 0 ? t.size : 1
        execs.push({ id: id + 'a', accountId: ACCOUNT, symbol, side: long ? 'buy' : 'sell', quantity: qty, price: t.entry, fee: 0, executedAt: new Date(t.time).toISOString(), source: 'manual' })
        if (fin(t.exit)) execs.push({ id: id + 'b', accountId: ACCOUNT, symbol, side: long ? 'sell' : 'buy', quantity: qty, price: t.exit, fee: 0, executedAt: new Date(Math.max(t.time + 60000, fin(t.closedAt) ? t.closedAt : 0)).toISOString(), source: 'manual' })
        rebuild()
        const trade = trades.find(x => x.executionIds.includes(id + 'a'))
        if (!trade) continue
        const image = cleanShot(legacyShots[t.id]) || (t.shot ? await shot('get', t.id) : null)
        if (image) await shot('put', trade.key, image)
        ann[trade.key] = { ...(ann[trade.key] || {}), stopLoss: fin(t.stop) ? t.stop : undefined, profitTarget: fin(t.target) ? t.target : undefined, notes: String(t.note || '').slice(0, 5000), context: t.context && typeof t.context === 'object' ? t.context : undefined, shot: !!image, tags: [] }
        count++
      }
      save()
      return count
    }
    async function readImport(file) {
      const text = await file.text(), tz = pane.querySelector('[data-importtz]')?.value || TZ
      let parsed
      try { parsed = I.parseAuto(text, { timeZone: tz }) } catch (e) { warn('Nie udało się odczytać pliku: ' + e.message); return }
      if (!parsed) { warn('Nie rozpoznano formatu tego pliku. Obsługiwane formaty są wymienione w sekcji Import.'); return }
      const known = new Set(execs.map(execKey)), batch = Date.now().toString(36)
      const all = parsed.executions.map((e, i) => ({ id: 'i' + batch + i, accountId: ACCOUNT, source: 'import', symbol: e.symbol, side: e.side, quantity: e.quantity, price: e.price, fee: e.fee || 0, executedAt: e.executedAt, ...(e.assetClass ? { assetClass: e.assetClass } : {}), ...(e.importMetadata ? { importMetadata: e.importMetadata } : {}) }))
      const fresh = all.filter(e => !known.has(execKey(e)))
      const times = all.map(e => e.executedAt).sort()
      pending = { ...parsed, fresh, range: times.length ? `${when(times[0])} – ${when(times.at(-1))}` : '' }
      render()
    }

    // ---- events ------------------------------------------------------------------------------------------------
    pane.addEventListener('click', async e => {
      const b = e.target.closest('button, [data-trade], [data-day]')
      if (!b || !pane.contains(b)) return
      const d = b.dataset
      if (d.view) go(d.view)
      else if (d.range) { settings.range = d.range; save(); render() }
      else if (d.add !== undefined) { go('import'); pane.querySelector('[data-addtrade] [name=entry]')?.focus() }
      else if (d.trade) go('trade', { tradeKey: d.trade })
      else if (d.day) go('day', { dayKey: d.day })
      else if (d.goday) go('day', { dayKey: d.goday })
      else if (d.month) { const [y, m] = (month || currentMonth()).split('-').map(Number); month = new Date(Date.UTC(y, m - 1 + Number(d.month), 1)).toISOString().slice(0, 7); render() }
      else if (d.activity) { activity = d.activity; render() }
      else if (d.report) { reportTab = d.report; render() }
      else if (d.rate) { setAnn(tradeKey, { rating: Number(d.rate) === (ann[tradeKey]?.rating || 0) ? 0 : Number(d.rate) }); render() }
      else if (d.delexec) { if (confirm('Usunąć to wykonanie?')) { execs = execs.filter(x => x.id !== d.delexec); save(); rebuild(); if (!trades.some(t => t.key === tradeKey)) view = 'trades'; render() } }
      else if (b.hasAttribute('data-deltrade')) {
        const t = trades.find(x => x.key === tradeKey)
        if (t && confirm(`Usunąć transakcję ${t.symbol} (${t.executionCount} wykonań)?`)) { const ids = new Set(t.executionIds); execs = execs.filter(x => !ids.has(x.id)); delete ann[t.key]; shot('delete', t.key); save(); go('trades') }
      }
      else if (d.notemode) {
        const edit = d.notemode === 'edit', area = body.querySelector('[data-daynote]'), prev = body.querySelector('[data-notepreview]')
        area.hidden = !edit; prev.hidden = edit; if (!edit) prev.innerHTML = markdown(area.value) || '<p class="lj-dim">Pusta notatka.</p>'
        b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b))
      }
      else if (b.hasAttribute('data-commit') && pending) { execs.push(...pending.fresh); const n = pending.fresh.length; pending = null; save(); warn(`Dodano ${n} wykonań.`); go('dash') }
      else if (b.hasAttribute('data-cancelimport')) { pending = null; render() }
      else if (b.hasAttribute('data-backup')) backup()
      else if (b.hasAttribute('data-csv')) csv()
    })
    const currentMonth = () => { const last = filtered().map(t => t.closedAt || t.openedAt).sort().at(-1); return (last ? dayOf(last) : dayOf(new Date().toISOString())).slice(0, 7) }
    pane.addEventListener('keydown', e => { const row = e.target.closest?.('tr[data-trade]'); if (row && e.key === 'Enter') go('trade', { tradeKey: row.dataset.trade }) })
    pane.addEventListener('change', e => {
      const el = e.target
      if (el.matches('[data-privacy]')) { settings.privacy = el.checked; save(); render() }
      else if (el.matches('[data-importfile]') && el.files[0]) { readImport(el.files[0]); el.value = '' }
      else if (el.matches('[data-restore]') && el.files[0]) { restore(el.files[0]); el.value = '' }
      else if (el.matches('[data-breakdown]')) { breakdown = el.value; render() }
      else if (el.matches('[data-tstatus]')) { tradeFilter.status = el.value; render() }
      else if (el.matches('[data-pickday]') && el.value) go('day', { dayKey: el.value })
      else if (el.closest('[data-settings]')) {
        const f = el.closest('form'); settings.method = f.method.value; settings.balance = Math.max(0, Number(f.balance.value) || 0); settings.multipliers = f.multipliers.value.slice(0, 2000); save(); rebuild()
      }
      else if (el.closest('[data-annot]')) saveAnnot(el.closest('form'))
    })
    let typing = 0
    pane.addEventListener('input', e => {
      const el = e.target
      if (el.matches('[data-tq]')) { tradeFilter.q = el.value; clearTimeout(typing); typing = setTimeout(() => { const pos = el.selectionStart; render(); const again = pane.querySelector('[data-tq]'); again.focus(); again.setSelectionRange(pos, pos) }, 250) }
      else if (el.matches('[data-daynote]')) { days[dayKey] = el.value.slice(0, 50000); if (!el.value) delete days[dayKey]; save(); pane.querySelector('[data-notesaved]').textContent = 'Zapisane.' }
      else if (el.closest('[data-annot]') && el.name === 'notes') { clearTimeout(typing); typing = setTimeout(() => saveAnnot(el.closest('form')), 400) }
    })
    function saveAnnot(f) {
      const n = k => { const v = parseFloat(f[k].value); return fin(v) ? v : undefined }
      setAnn(tradeKey, { stopLoss: n('stopLoss'), profitTarget: n('profitTarget'), playbook: f.playbook.value.trim().slice(0, 80), tags: list(f.tags.value), mistakes: list(f.mistakes.value), notes: f.notes.value.slice(0, 20000), reviewed: f.reviewed.checked })
      const s = f.querySelector('[data-saved]'); if (s) s.textContent = 'Zapisane.'
    }
    pane.addEventListener('submit', async e => {
      e.preventDefault()
      const f = e.target
      if (f.matches('[data-addtrade]')) await addTrade(f)
      else if (f.matches('[data-addexec]')) {
        const t = trades.find(x => x.key === tradeKey), fd = new FormData(f), qty = parseFloat(fd.get('quantity')), price = parseFloat(fd.get('price')), ms = new Date(fd.get('time')).getTime()
        if (!t || !(qty > 0) || !fin(price) || !fin(ms)) return
        const id = 'm' + uid()
        execs.push({ id, accountId: ACCOUNT, symbol: t.symbol, side: fd.get('side'), quantity: qty, price, fee: Math.abs(parseFloat(fd.get('fee')) || 0), executedAt: new Date(ms).toISOString(), source: 'manual' })
        const before = ann[t.key]; rebuild()
        const now = trades.find(x => x.executionIds.includes(id))
        if (now && now.key !== t.key && before && !ann[now.key]) { ann[now.key] = before; delete ann[t.key]; const s = await shot('get', t.key); if (s) { await shot('put', now.key, s); shot('delete', t.key) } }
        save(); go('trade', { tradeKey: now?.key || t.key })
      }
    })
    // After a trade page renders, its snapshot (if any) comes from IndexedDB.
    const observer = new MutationObserver(() => {
      const box = body.querySelector('[data-shot]:not([data-loaded])')
      if (!box) return
      box.dataset.loaded = '1'
      shot('get', box.dataset.shot).then(s => { if (s) box.innerHTML = `<img src="${s.image}" alt="Wykres ${esc(s.symbol)} w chwili zapisu"><p class="lj-dim">Zrzut wykresu ${esc(s.symbol)}${s.frame ? ' · ' + esc(s.frame) : ''} z chwili zapisu</p>` })
    })
    observer.observe(body, { childList: true })
    let resizeTimer = 0, width = 0
    new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      if (w === width) return
      width = w
      if (w && body.querySelector('.lj-chart')) { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150) }
    }).observe(body)
    window.addEventListener('themechange', () => render())

    // Minimal, escaped Markdown for day notes: headings, lists, checklists, bold and italics.
    function markdown(text) {
      const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
      let html = '', inList = false
      for (const line of String(text).split('\n')) {
        const h = line.match(/^(#{1,3})\s+(.*)/), li = line.match(/^\s*[-*]\s+(\[( |x)\]\s+)?(.*)/)
        if (li) { if (!inList) { html += '<ul>'; inList = true } html += `<li>${li[1] ? `<input type="checkbox" disabled ${li[2] === 'x' ? 'checked' : ''}> ` : ''}${inline(li[3])}</li>`; continue }
        if (inList) { html += '</ul>'; inList = false }
        if (h) html += `<h${h[1].length + 3}>${inline(h[2])}</h${h[1].length + 3}>`
        else if (line.trim()) html += `<p>${inline(line)}</p>`
      }
      return html + (inList ? '</ul>' : '')
    }

    // ---- load --------------------------------------------------------------------------------------------------
    ;(async () => {
      try {
        const [e, a, d, s] = await Promise.all(['executions', 'annotations', 'days', 'settings'].map(k => idb('lux', 'get', k)))
        if (Array.isArray(e)) execs = e.map(cleanExec).filter(Boolean)
        if (a && typeof a === 'object') ann = a
        if (d && typeof d === 'object') days = d
        if (s && typeof s === 'object') settings = { ...settings, ...s }
        if (!Array.isArray(e)) {
          const legacy = await idb('journal', 'get', 'trades').catch(() => null)
          const old = Array.isArray(legacy) ? legacy : (() => { try { return JSON.parse(localStorage.getItem('other:journal') || '[]') } catch { return [] } })()
          if (old.length) { const n = await migrate(old); warn(`Przeniesiono ${n} transakcji ze starego dziennika. Stare dane zostały też zachowane w przeglądarce.`) }
        }
      } catch { warn('Ta przeglądarka nie udostępnia IndexedDB, więc dziennik nie zapisze zmian. Użyj kopii zapasowej.') }
      render()
    })()
    return { refresh: () => { if (view === 'import') { const i = pane.querySelector('[data-addtrade] [name=symbol]'); if (i && !i.value) i.value = hooks.currentSymbol?.() || '' } } }
  }

  // ---- styles ----------------------------------------------------------------------------------------------------
  const style = document.createElement('style')
  style.textContent = `.lj{display:flex;gap:0;min-height:100%;border:1px solid var(--line)}
.lj-nav{flex:none;width:170px;display:flex;flex-direction:column;gap:2px;padding:8px;border-right:1px solid var(--line)}
.lj-nav button{text-align:left;background:transparent;border:0;color:var(--dim);font:inherit;padding:7px 10px;cursor:pointer}.lj-nav button:hover{color:var(--ink)}.lj-nav button.active{background:var(--faint);color:var(--ink);box-shadow:inset 2px 0 var(--ink)}
.lj-privacy{display:flex;gap:6px;align-items:center;color:var(--dim);padding:6px 10px;font-size:11px}.lj-credit{color:var(--dim);font-size:10px;line-height:1.5;padding:0 10px;margin:4px 0}.lj-credit a{color:var(--ink)}
.lj-grow{flex:1}.lj-main{flex:1;min-width:0;display:flex;flex-direction:column}
.lj-top{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:8px 12px;border-bottom:1px solid var(--line)}.lj-top h3{margin:0;font-size:13px;font-weight:500;color:var(--ink);letter-spacing:.04em}
.lj-body{padding:12px;display:flex;flex-direction:column;gap:12px}
.lj button,.lj select,.lj input,.lj textarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);padding:5px 9px}.lj button{cursor:pointer}.lj button:hover:not(:disabled){border-color:var(--dim)}.lj button:disabled{opacity:.45;cursor:default}
.lj .lj-primary{background:var(--ink);color:var(--bg);border-color:var(--ink)}.lj .lj-danger{border-color:#e66767;color:#e66767}
.lj-seg{display:inline-flex}.lj-seg button{border-right-width:0;padding:4px 10px;color:var(--dim)}.lj-seg button:last-child{border-right-width:1px}.lj-seg button.active{color:var(--ink);background:var(--faint)}.lj-seg.small button{font-size:11px;padding:3px 8px}
.lj-warn{margin:8px 12px 0;padding:6px 10px;border:1px solid var(--line);color:var(--ink)}.lj-warn[hidden]{display:none}
.lj-card{border:1px solid var(--line);padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}.lj-card>header{display:flex;align-items:center;gap:8px;min-height:18px}.lj-card h4{margin:0;font-size:10px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);flex:1}.lj-card h5{margin:6px 0 0;font-size:10px;font-weight:400;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}.lj-card.lj-plain>header{display:none}
.lj-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.lj-tiles.five{grid-template-columns:repeat(5,minmax(0,1fr))}@media(max-width:1100px){.lj-tiles.five{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}}.lj-grid3{display:grid;grid-template-columns:minmax(260px,.9fr) minmax(300px,1.2fr) minmax(300px,1.1fr);gap:12px}.lj-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px}.lj-grid2.wide-left{grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);align-items:start}.lj-grid2.wide-left>div{display:flex;flex-direction:column;gap:12px;min-width:0}
@media(max-width:1200px){.lj-grid3{grid-template-columns:1fr 1fr}.lj-grid2.wide-left{grid-template-columns:1fr}}@media(max-width:760px){.lj{flex-direction:column}.lj-nav{width:auto;flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--line)}.lj-credit,.lj-nav .lj-grow{display:none}.lj-grid3{grid-template-columns:1fr}}
.lj-hero{margin:0;font-size:22px;color:var(--ink);font-variant-numeric:tabular-nums}.lj-dim{color:var(--dim);margin:0;font-size:11px}.lj-h{margin:4px 0 -4px;font-size:12px;color:var(--ink);font-weight:500}
.lj-gauge-row{display:grid;grid-template-columns:86px 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center}.lj-gauge-row .lj-gauge{grid-row:1/3;width:86px}.lj-gauge .track{fill:none;stroke:var(--faint);stroke-width:9}.lj-gauge .fill{fill:none;stroke:var(--ink);stroke-width:9}
.lj-split{display:flex;gap:2px;height:6px}.lj-split i{border-radius:2px}
.lj-score{color:var(--dim)}.lj-score b{font-size:20px;color:var(--ink);font-weight:500}
.lj-radar{width:100%;max-height:300px}.lj-grid2.cal{grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr)}@media(max-width:1100px){.lj-grid2.cal{grid-template-columns:1fr}}.lj-radar .grid{fill:none;stroke:var(--line);stroke-width:1}.lj-radar .shape{fill:rgb(var(--ink-rgb)/.12);stroke:var(--ink);stroke-width:2;stroke-linejoin:round}.lj-radar text{fill:var(--dim);font-size:15px}
.lj-chart{position:relative;width:100%}.lj-chart svg{display:block;overflow:visible}.lj-chart text{fill:var(--dim);font-size:10px;font-family:inherit}.lj-grid{stroke:var(--faint);stroke-width:1}.lj-grid.zero{stroke:var(--line)}.lj-ref{stroke:var(--dim);stroke-dasharray:4 4;stroke-width:1}.lj-guide{stroke:var(--dim);stroke-width:1}.lj-dot{stroke:var(--bg);stroke-width:2}
.lj-tip{position:absolute;top:0;pointer-events:none;background:var(--bg);border:1px solid var(--line);padding:4px 8px;display:flex;flex-direction:column;font-size:11px;white-space:nowrap;z-index:2}.lj-tip span{color:var(--dim)}.lj-tip[hidden]{display:none}
.lj-cal{display:flex;flex-direction:column;gap:3px}.lj-cal-row{display:grid;grid-template-columns:repeat(7,minmax(0,1fr)) minmax(70px,.8fr);gap:3px}.lj-cal-row.head span{color:var(--dim);font-size:10px;padding:2px 4px}
.lj .lj-day{min-height:58px;text-align:left;display:flex;flex-direction:column;gap:1px;padding:4px 6px;border:1px solid var(--faint);background:transparent;font-size:11px;cursor:default}.lj .lj-day i{font-style:normal;color:var(--dim);font-size:10px}.lj .lj-day b{font-weight:500;font-variant-numeric:tabular-nums}.lj .lj-day small{color:var(--dim);font-size:9px}
.lj .lj-day.up,.lj .lj-day.down{cursor:pointer}.lj .lj-day.up{background:color-mix(in srgb,#3987e5 calc(var(--a)*100%),transparent);border-color:color-mix(in srgb,#3987e5 50%,transparent)}.lj .lj-day.down{background:color-mix(in srgb,#e66767 calc(var(--a)*100%),transparent);border-color:color-mix(in srgb,#e66767 50%,transparent)}.lj .lj-day.none{border:0}
.lj-week{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;font-size:11px;padding:0 4px}.lj-week small{color:var(--dim);font-size:9px}.lj-cal footer{display:flex;justify-content:space-between;color:var(--dim);font-size:11px;margin-top:4px}.lj-cal footer b{color:var(--ink)}
.lj-list{display:flex;flex-direction:column;max-height:420px;overflow:auto}.lj .lj-row{display:flex;align-items:center;gap:10px;border:0;border-bottom:1px solid var(--faint);background:transparent;text-align:left;padding:7px 4px;font-size:11px}.lj .lj-row:hover{background:var(--faint)}.lj-row small{color:var(--dim);white-space:nowrap}.lj .lj-row b{white-space:nowrap}.lj-num{font-variant-numeric:tabular-nums;min-width:90px;text-align:right}
.lj-badge{font-size:9px;letter-spacing:.08em;padding:2px 6px;border:1px solid var(--line);color:var(--ink);white-space:nowrap}.lj-badge.win{border-color:#3987e5;box-shadow:inset 3px 0 #3987e5}.lj-badge.loss{border-color:#e66767;box-shadow:inset 3px 0 #e66767}.lj-badge.open{color:var(--dim)}
.lj-monthbar{display:flex;align-items:center;gap:10px}.lj-monthbar b{min-width:130px;text-align:center;font-weight:500}
.lj-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}.lj-stats small{display:block;color:var(--dim);font-size:10px}.lj-stats b{font-weight:400;font-variant-numeric:tabular-nums}
.lj-kv{display:flex;justify-content:space-between;align-items:center;margin:2px 0;font-size:12px}.lj-kv span{color:var(--dim)}
.lj .lj-link{background:none;border:0;padding:0;color:var(--ink);text-decoration:underline;text-underline-offset:3px;font-size:11px}
.lj-note{width:100%;box-sizing:border-box;resize:vertical;min-height:260px;line-height:1.5}.lj-note[hidden],.lj-md[hidden]{display:none}.lj-md{border:1px solid var(--line);padding:10px;min-height:260px}.lj-md h4,.lj-md h5,.lj-md h6{margin:8px 0 4px;color:var(--ink)}.lj-md p{margin:4px 0}
.lj-filters{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.lj-filters label{display:flex;gap:8px;align-items:center;color:var(--dim)}
.lj-tablewrap{overflow:auto;border:1px solid var(--line)}.lj-table{width:100%;border-collapse:collapse;font-size:11px}.lj-table th{text-align:left;font-weight:400;color:var(--dim);padding:6px 8px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg)}.lj-table td{padding:6px 8px;border-bottom:1px solid var(--faint);white-space:nowrap}.lj-table .n{text-align:right;font-variant-numeric:tabular-nums}.lj-table tr[data-trade]{cursor:pointer}.lj-table tr[data-trade]:hover,.lj-table tr[data-trade]:focus{background:var(--faint);outline:0}.lj-table.kv td:first-child{color:var(--dim)}
.lj-barcol{width:22%}.lj-barcol i{display:block;height:8px;border-radius:0 2px 2px 0}
.lj-form{display:flex;flex-direction:column;gap:8px}.lj-form label{display:flex;flex-direction:column;gap:3px;color:var(--dim);font-size:11px}.lj-form .lj-check{flex-direction:row;align-items:center;gap:6px}.lj-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lj-form.inline{flex-direction:row;flex-wrap:wrap;align-items:flex-end;margin-top:6px}.lj-form.inline input{width:100px}.lj-form.inline input[type=datetime-local]{width:auto}
.lj-stars{display:flex;align-items:center;gap:2px}.lj .lj-stars button{border:0;background:none;font-size:18px;padding:0 2px;color:var(--ink)}.lj-stars .lj-check{margin-left:auto}
.lj-x{border:0!important;background:none!important;color:var(--dim)!important;padding:0 4px!important}
.lj-fills{width:100%;max-height:240px}.lj-fills text{fill:var(--dim);font-size:10px}.lj-ring{stroke:var(--bg);stroke-width:2}.lj-shot img{width:100%;border:1px solid var(--line)}
.lj-file{display:inline-block;border:1px solid var(--line);padding:5px 9px;cursor:pointer;color:var(--ink)}.lj-file:hover{border-color:var(--dim)}
.lj-preview{border:1px solid var(--line);padding:8px 10px;display:flex;flex-direction:column;gap:4px}.lj-preview p{margin:0}.lj-warnline{color:var(--dim);font-size:11px}
.lj-empty{border:1px dashed var(--line);padding:30px;text-align:center}.lj-empty h4{margin:0 0 8px;color:var(--ink)}.lj-empty p{color:var(--dim)}
html[data-color-mode=light] .lj input,html[data-color-mode=light] .lj select,html[data-color-mode=light] .lj textarea{color-scheme:light}.lj input,.lj select,.lj textarea{color-scheme:dark}`
  document.head.append(style)
  return { mount }
})()
