// Bloomberg Terminal for UNCsWay Final. GP chart screen (launchpad bar with a command line, quote lines, the red
// action bar with numbered menus, range / periodicity / chart-type controls, candles on a dotted grid) plus WEI
// world indices, ECO calendar, a watchlist, price alerts, relative comparison (COMP), spreads, day/week/month
// high-low levels, live Hyperliquid crypto and a 1/2/4-pane Launchpad.
// Data comes from the terminal's own /api (Yahoo, Hyperliquid; in the Mac app through the native proxy).
(() => {
  const $ = id => document.getElementById(id)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const params = new URLSearchParams(location.search), pane = params.get('pane')
  // Each Launchpad pane keeps its own settings.
  const prefix = pane ? `bb-p${pane}-` : 'bb-'
  const store = (k, v) => { try { v === undefined ? localStorage.removeItem(prefix + k) : localStorage.setItem(prefix + k, JSON.stringify(v)) } catch {} }
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(prefix + k)); return v ?? d } catch { return d } }
  const shared = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('bb-' + k)) ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem('bb-' + k, JSON.stringify(v)) } catch {} } }

  // ---------- Launchpad: 2 or 4 GP panes, each its own page; linked panes follow each other's security ----------
  const layout = pane ? 1 : shared.get('layout', 1)
  if (pane) document.documentElement.dataset.pane = pane
  function setLayout(n) { shared.set('layout', n); location.reload() }
  if (layout > 1) {
    document.documentElement.dataset.launchpad = layout
    document.querySelectorAll('.bb > :not(.bb-top)').forEach(el => el.remove())
    $('title').innerHTML = 'LAUNCHPAD'; $('fn').textContent = 'BLP'
    const grid = document.createElement('div'); grid.className = 'bb-lp'; grid.dataset.n = layout
    for (let i = 1; i <= layout; i++) { const f = document.createElement('iframe'); f.src = `bloomberg.html?pane=${i}`; f.title = `Panel ${i}`; f.name = 'pane' + i; grid.append(f) }
    document.querySelector('.bb').append(grid)
    let focused = 1
    addEventListener('message', e => {
      const m = e.data, from = [...grid.children].find(f => f.contentWindow === e.source)
      if (!from) return
      if (m?.type === 'bb-focus') focused = +m.pane
      if (m?.type === 'bb-sym' && m.group) for (const f of grid.children) if (f !== from) f.contentWindow.postMessage({ type: 'bb-open', sym: m.sym, group: m.group }, '*')
    })
    const input = $('cmdInput')
    $('title').onclick = () => { $('cmd').hidden = false; $('title').hidden = true; input.value = ''; input.focus() }
    $('cmd').onsubmit = e => { e.preventDefault(); $('cmd').hidden = true; $('title').hidden = false; grid.children[focused - 1]?.contentWindow.postMessage({ type: 'bb-command', text: input.value }, '*') }
    $('layoutBtn').onclick = e => layoutMenu(e.currentTarget)
    function layoutMenu(anchor) {
      const pop = document.createElement('div'); pop.className = 'bb-pop'; const r = anchor.getBoundingClientRect()
      pop.style.left = Math.min(r.left, innerWidth - 240) + 'px'; pop.style.top = r.bottom + 'px'
      pop.innerHTML = [[1, '1 panel'], [2, '2 panele'], [4, '4 panele']].map(([n, t]) => `<button data-n="${n}"><em>${n})</em>${n === layout ? '✓ ' : ''}${t}</button>`).join('')
      pop.onclick = ev => { const n = ev.target.closest('[data-n]')?.dataset.n; if (n) setLayout(+n) }
      document.body.append(pop); setTimeout(() => addEventListener('mousedown', ev => { if (!pop.contains(ev.target)) pop.remove() }, { once: true }))
    }
    return
  }

  const PERIODS = ['1D', '3D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'Max']
  // Periodicities a range can show, first = default. What history exists decides the list: 5-minute bars cover
  // 5 days, 15/30-minute bars a month, hourly bars (and H4 built from them) 6 months, daily bars 2 years; 5Y uses
  // weekly and Max monthly history.
  const FREQS = { '1D': ['M5', 'M15', 'M30', 'H1'], '3D': ['M15', 'M5', 'M30', 'H1', 'H4'], '5D': ['M15', 'M5', 'M30', 'H1', 'H4'],
    '1M': ['Daily', 'M15', 'M30', 'H1', 'H4', 'Weekly'], '6M': ['Daily', 'H1', 'H4', 'Weekly', 'Monthly'],
    YTD: ['Daily', 'Weekly', 'Monthly'], '1Y': ['Daily', 'Weekly', 'Monthly'], '5Y': ['Weekly', 'Monthly'], Max: ['Monthly'] }
  const INTRADAY = { M5: '5m', M15: '15m', M30: '30m', H1: '60m', H4: '60m' }
  const PERIOD_SOURCE = { '1M': '1D', '6M': '1D', YTD: '1D', '1Y': '1D', '5Y': '1W', Max: '1M' }
  const source = () => INTRADAY[state.freq] || PERIOD_SOURCE[state.period] || '1D'
  const isIntraday = () => !!INTRADAY[state.freq]
  const COLORS = ['#fb8b1e', '#35d0ff', '#ff5fd2', '#7cff6b', '#ffe14d']

  const state = { sym: load('symbol', pane ? ['NQ1!', 'ES1!', 'GC1!', 'BTC1!'][pane - 1] || 'NQ1!' : 'NQ1!'), period: load('period', 'YTD'), freq: null, freqs: load('freqs', {}),
    type: load('type', 'candle'), mavg: load('mavg', false), events: load('events', false), track: true, annotate: false,
    compares: load('compares', []), relative: load('relative', false), watch: load('watchOpen', false), fn: 'GP', group: load('group', null) }
  if (!PERIODS.includes(state.period)) state.period = 'YTD'
  const history = [state.sym]; let hpos = 0
  const cache = new Map()
  let shown = [], quote = null, daily = null

  // ---------- data ----------
  async function fetchChart(symbol, frame) {
    const key = symbol + '|' + frame, hit = cache.get(key)
    if (hit && Date.now() - hit.at < 60000) return hit.data
    const r = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&interval=${frame}`)
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error === 'bad symbol or interval' ? 'Unknown security' : data.error || 'HTTP ' + r.status)
    data.candles = (data.candles || []).filter(c => ['time', 'open', 'high', 'low', 'close'].every(k => Number.isFinite(c[k]))).sort((a, b) => a.time - b.time)
    cache.set(key, { at: Date.now(), data })
    return data
  }
  // Spreads: "NQ1!/ES1!" (ratio) or "GC1!-SI1!" (difference) between two securities, bar by bar.
  const spreadOf = s => s.match(/^([A-Z0-9^=.]+!?)([/-])([A-Z0-9^=.]+!?)$/)
  const isSpread = s => { const m = spreadOf(s); return !!m && (m[2] === '/' || (m[1].endsWith('!') && m[3].endsWith('!'))) }
  async function chartData(symbol, frame) {
    if (!isSpread(symbol)) return fetchChart(symbol, frame)
    const [, a, op, b] = spreadOf(symbol), [A, B] = await Promise.all([fetchChart(a, frame), fetchChart(b, frame)])
    const f = op === '/' ? (x, y) => x / y : (x, y) => x - y, other = new Map(B.candles.map(c => [c.time, c]))
    const candles = A.candles.filter(c => other.has(c.time)).map(c => { const o = other.get(c.time), open = f(c.open, o.open), close = f(c.close, o.close); return { time: c.time, open, close, high: Math.max(open, close), low: Math.min(open, close) } })
    return { symbol, name: `${a} ${op === '/' ? '/' : '−'} ${b}`, price: f(A.price ?? A.candles.at(-1)?.close, B.price ?? B.candles.at(-1)?.close), previousClose: f(A.previousClose, B.previousClose), candles }
  }
  const etDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t * 1000))
  function bucket(candles, keyOf) {
    const out = []
    for (const c of candles) {
      const k = keyOf(c.time), last = out.at(-1)
      if (last && last.k === k) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; if (Number.isFinite(c.volume)) last.volume = (last.volume || 0) + c.volume }
      else out.push({ ...c, k })
    }
    return out.map(({ k, ...c }) => c)
  }
  const weekKey = t => { const d = new Date(t * 1000); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10) }
  const monthKey = t => new Date(t * 1000).toISOString().slice(0, 7)
  // New York wall-clock offset of a moment (seconds), cached per UTC day: H4 bars follow the
  // 18:00 New York session start in summer and winter.
  const etOffset = new Map()
  const etShift = t => { const day = Math.floor(t / 86400); if (!etOffset.has(day)) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(day * 86400000 + 43200000)).map(x => [x.type, x.value])); etOffset.set(day, Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute) / 1000 - (day * 86400 + 43200)) } return etOffset.get(day) }
  function reshape(candles, freq) {
    if (freq === 'H4') return bucket(candles, t => Math.floor((t + etShift(t) - 18 * 3600) / 14400))
    if (freq === 'Weekly') return bucket(candles, weekKey)
    if (freq === 'Monthly') return bucket(candles, monthKey)
    return candles
  }
  function window_(candles, period) {
    if (!candles.length) return candles
    const last = candles.at(-1).time
    if (period === '1D' || period === '3D' || period === '5D') {
      const days = [...new Set(candles.map(c => etDay(c.time)))].slice(-parseInt(period))
      return candles.filter(c => days.includes(etDay(c.time)))
    }
    const d = new Date(last * 1000)
    if (period === '1M') d.setUTCMonth(d.getUTCMonth() - 1)
    else if (period === '6M') d.setUTCMonth(d.getUTCMonth() - 6)
    else if (period === '1Y') d.setUTCFullYear(d.getUTCFullYear() - 1)
    else if (period === '5Y') d.setUTCFullYear(d.getUTCFullYear() - 5)
    else if (period === 'YTD') d.setTime(Date.UTC(d.getUTCFullYear(), 0, 1))
    else return candles
    const from = d.getTime() / 1000, slice = candles.filter(c => c.time >= from)
    return slice.length > 1 ? slice : candles.slice(-2)
  }

  // ---------- formatting ----------
  const digits = v => Math.abs(v) < 10 ? 4 : 2
  const num = (v, d = digits(v)) => Number.isFinite(v) ? v.toFixed(d) : '—'
  const group3 = (v, d) => Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'
  // Bloomberg drops the leading zero of a change: -0.73 → -.73
  const chg = (v, d) => Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(d).replace(/^(-?)0\./, '$1.') : '—'
  const pct = v => Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '—'
  const mdy = t => { const d = new Date(t * 1000); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}` }
  const short = t => mdy(t).replace(/\/(\d\d)(\d\d)$/, '/$2')
  const yellowKey = s => isSpread(s) ? 'Spread' : /^(NQ|ES|YM|RTY|NKD|VX)1!$/.test(s) || s.startsWith('^') ? 'Index' : /1!$/.test(s) ? (s === 'DXY1!' ? 'Curncy' : 'Comdty') : /=X$|-USD$|^DXY$/.test(s) ? 'Curncy' : 'Equity'
  const dirOf = v => v > 0 ? 'up' : v < 0 ? 'down' : ''

  // ---------- chart ----------
  const LC = LightweightCharts
  const chart = LC.createChart($('chart'), {
    autoSize: true,
    layout: { background: { type: 'solid', color: '#000' }, textColor: '#f2f2f2', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13, attributionLogo: false },
    // Horizontal grid and price labels are drawn by the axis primitive below (Bloomberg's ~6 round levels).
    grid: { vertLines: { color: '#8c8c8c', style: LC.LineStyle.Dotted }, horzLines: { visible: false } },
    rightPriceScale: { borderVisible: false, ticksVisible: false, minimumWidth: 74, scaleMargins: { top: .12, bottom: .06 } },
    leftPriceScale: { visible: false, borderVisible: false },
    // Daily charts label the first tick of a year with its month (Jan), as Bloomberg does; long ranges keep years.
    timeScale: { borderVisible: false, ticksVisible: true, rightOffset: 4, ensureEdgeTickMarksVisible: true,
      tickMarkFormatter: (time, type) => type === 0 && !['1Y', '5Y', 'Max'].includes(state.period) ? new Date(time * 1000).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) : null },
    crosshair: { mode: LC.CrosshairMode.Normal, vertLine: { color: '#8a8a8a', style: LC.LineStyle.Dotted, labelBackgroundColor: '#333' }, horzLine: { color: '#8a8a8a', style: LC.LineStyle.Dotted, labelVisible: false } },
    localization: { locale: 'en-US', dateFormat: 'MM/dd/yy' },
  })
  const UP = '#ffffff', DOWN = '#2a8cff', WICK = '#d9d9d9'
  let series = null, maLines = [], cmpSeries = [], markers = null, notes = [], levelLines = [], alertLines = []

  // Price axis like Bloomberg's: about six round levels with dotted lines across the chart, the last price, coloured
  // labels of levels / alerts / annotations, and the crosshair price. The series' own labels are blanked.
  const marks = new Map()
  const axis = {
    ticks: [], last: null, cross: null, fmt: v => num(v), requestUpdate: null,
    attached({ requestUpdate }) { this.requestUpdate = requestUpdate }, detached() { this.requestUpdate = null },
    updateAllViews() {
      if (!series) return
      const h = chart.paneSize?.(0)?.height ?? $('chart').clientHeight - 28
      const top = series.coordinateToPrice(0), bottom = series.coordinateToPrice(h)
      if (!Number.isFinite(top) || !Number.isFinite(bottom) || top === bottom) { this.ticks = []; return }
      const lo = Math.min(top, bottom), hi = Math.max(top, bottom), raw = (hi - lo) / 6, mag = 10 ** Math.floor(Math.log10(raw))
      const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(x => x >= raw)
      this.ticks = []
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) this.ticks.push(+v.toPrecision(12))
    },
    paneViews() { return [{ zOrder: () => 'bottom', renderer: () => ({ draw() {}, drawBackground: target => target.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
      c.strokeStyle = '#8c8c8c'; c.lineWidth = 1; c.setLineDash([1, 3])
      for (const p of axis.ticks) { const y = series?.priceToCoordinate(p); if (y == null) continue; c.beginPath(); c.moveTo(0, Math.round(y) + .5); c.lineTo(mediaSize.width, Math.round(y) + .5); c.stroke() }
      // Titles of levels and alerts, right-aligned just above their line.
      c.setLineDash([]); c.font = '12px Arial, Helvetica, sans-serif'; c.textAlign = 'right'; c.textBaseline = 'bottom'
      // Levels at the same price (e.g. today's high is also the week's) stack their titles instead of overlapping.
      const used = new Map()
      for (const m of marks.values()) {
        const y = m.title ? series?.priceToCoordinate(m.price) : null
        if (y == null) continue
        const row = Math.round(y), n = used.get(row) || 0; used.set(row, n + 1)
        c.fillStyle = m.back; c.fillText(m.title, mediaSize.width - 6, y - 2 - n * 13)
      }
    }) }) }] },
    priceAxisViews() {
      const view = (price, text, textColor, backColor, y) => ({ coordinate: () => y ?? series?.priceToCoordinate(price) ?? -100, text: () => text, textColor: () => textColor, backColor: () => backColor, visible: () => true, tickVisible: () => true })
      const out = this.ticks.map(p => view(p, this.fmt(p), '#f2f2f2', '#000000'))
      for (const m of marks.values()) out.push(view(m.price, this.fmt(m.price), m.fore, m.back))
      if (Number.isFinite(this.last)) out.push(view(this.last, this.fmt(this.last), '#000000', '#ffffff'))
      if (this.cross != null && series) { const p = series.coordinateToPrice(this.cross); if (Number.isFinite(p)) out.push(view(p, this.fmt(p), '#ffffff', '#333333', this.cross)) }
      return out
    },
  }
  // A price line whose axis label is drawn by the axis primitive (line in the chart, coloured box on the axis).
  function priceLine(opts, back, fore = '#000000') { const line = series.createPriceLine({ ...opts, title: '', axisLabelVisible: false }); marks.set(line, { price: opts.price, back, fore, title: opts.title }); return line }
  function dropLine(line) { marks.delete(line); series?.removePriceLine(line) }
  function makeSeries() {
    if (series) chart.removeSeries(series)
    const common = { lastValueVisible: false, priceLineVisible: false }
    const type = state.relative ? 'line' : state.type
    series = type === 'line' ? chart.addSeries(LC.LineSeries, { ...common, color: '#ffffff', lineWidth: 1 })
      : type === 'bar' ? chart.addSeries(LC.BarSeries, { ...common, upColor: UP, downColor: DOWN, thinBars: true })
        : chart.addSeries(LC.CandlestickSeries, { ...common, upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: WICK, wickDownColor: WICK })
    markers = null; notes = []; levelLines = []; alertLines = []; marks.clear()
    series.attachPrimitive(axis)
  }
  // Whole range in view with a little room on both sides, so the first month label (Jan) is not cut at the edge.
  function fit() { const n = shown.length; if (n) chart.timeScale().setVisibleLogicalRange({ from: -Math.max(2, n * .015), to: n - 1 + Math.max(3, n * .02) }) }
  const sma = (data, n) => data.map((c, i) => i < n - 1 ? { time: c.time } : { time: c.time, value: data.slice(i - n + 1, i + 1).reduce((s, x) => s + x.close, 0) / n })

  // Current day / week / month high and low with their Q labels (our cycle rules, /api/highs), as price lines.
  let qLabels = {}
  async function loadLabels(sym) { try { const r = await fetch('/api/highs?symbol=' + encodeURIComponent(sym)); if (r.ok) qLabels = await r.json() } catch { qLabels = {} } }
  function drawLevels() {
    levelLines.forEach(dropLine); levelLines = []
    if (!state.events || state.relative || !daily?.candles.length) return
    const d = daily.candles, today = d.at(-1)
    const wk = d.filter(c => weekKey(c.time) === weekKey(today.time)), mo = d.filter(c => monthKey(c.time) === monthKey(today.time))
    const hi = a => Math.max(...a.map(c => c.high)), lo = a => Math.min(...a.map(c => c.low))
    const lab = k => (qLabels[k] || []).filter(Boolean).join('·')
    for (const [price, title, color] of [[today.high, 'HOTD ' + lab('hotd'), '#fb8b1e'], [today.low, 'LOTD ' + lab('lotd'), '#fb8b1e'], [hi(wk), 'HOTW ' + lab('hotw'), '#35d0ff'], [lo(wk), 'LOTW ' + lab('lotw'), '#35d0ff'], [hi(mo), 'HOTM ' + lab('hotm'), '#ff5fd2'], [lo(mo), 'LOTM ' + lab('lotm'), '#ff5fd2']])
      if (Number.isFinite(price)) levelLines.push(priceLine({ price, color, lineWidth: 1, lineStyle: LC.LineStyle.Dashed, title: title.trim() }, color))
  }

  function draw() {
    if (!series) makeSeries()
    chart.applyOptions({ timeScale: { timeVisible: isIntraday(), secondsVisible: false } })
    const base = shown[0]?.close, rel = state.relative && Number.isFinite(base)
    const d = rel ? 2 : digits(shown.at(-1)?.close ?? 1)
    series.applyOptions({ priceFormat: { type: 'custom', formatter: () => '', minMove: rel ? .01 : 10 ** -d } })
    axis.fmt = rel ? v => (v > 0 ? '+' : '') + v.toFixed(2) + '%' : v => v.toFixed(d)
    series.setData(rel ? shown.map(c => ({ time: c.time, value: (c.close / base - 1) * 100 }))
      : (state.type === 'line' ? shown.map(c => ({ time: c.time, value: c.close })) : shown.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))))
    axis.last = rel ? (shown.at(-1)?.close / base - 1) * 100 : shown.at(-1)?.close
    maLines.forEach(s => chart.removeSeries(s)); maLines = []
    if (state.mavg && !rel) for (const [n, color] of [[50, '#f5d300'], [200, '#c26cff']]) {
      const s = chart.addSeries(LC.LineSeries, { color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false })
      s.setData(sma(shown, n)); maLines.push(s)
    }
    const hi = shown.reduce((a, c) => c.high > a.high ? c : a, shown[0] || {}), lo = shown.reduce((a, c) => c.low < a.low ? c : a, shown[0] || {})
    const list = state.events && !rel && shown.length ? [{ time: hi.time, position: 'aboveBar', color: '#fb8b1e', shape: 'arrowDown', text: 'H' }, { time: lo.time, position: 'belowBar', color: '#fb8b1e', shape: 'arrowUp', text: 'L' }].sort((a, b) => a.time - b.time) : []
    if (!markers) markers = LC.createSeriesMarkers(series, list); else markers.setMarkers(list)
    drawLevels(); drawAlerts()
    fit()
    legend()
    if (!$('tableView').hidden) table()
  }
  const others = () => state.compares.filter(s => s !== state.sym)
  async function drawCompare() {
    cmpSeries.forEach(s => chart.removeSeries(s)); cmpSeries = []
    chart.applyOptions({ leftPriceScale: { visible: others().length > 0 && !state.relative } })
    for (const [i, sym] of others().entries()) {
      try {
        const data = await chartData(sym, source())
        const rows = window_(reshape(data.candles, state.freq), state.period)
        const base = rows[0]?.close
        const s = chart.addSeries(LC.LineSeries, { color: COLORS[i % COLORS.length], lineWidth: 1, priceScaleId: state.relative ? 'right' : 'left', lastValueVisible: true, priceLineVisible: false, title: sym })
        s.setData(rows.map(c => ({ time: c.time, value: state.relative ? (c.close / base - 1) * 100 : c.close })))
        cmpSeries.push(s)
      } catch (e) { status(`${sym}: ${e.message}`) }
    }
    legend()
  }

  // Legend box (top right): last, period high with its date, average, period low with its date; while tracking,
  // the bar under the crosshair.
  function legend(bar) {
    if (!shown.length) { $('legend').innerHTML = ''; return }
    const d = digits(shown.at(-1).close)
    if (bar) {
      $('legend').innerHTML = `<div class="first"><span class="sw"></span><span>${isIntraday() ? new Date(bar.time * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : short(bar.time)}</span><span></span></div>`
        + (bar.value !== undefined && bar.open === undefined ? `<div><i>·</i><span>${state.relative ? 'Change' : 'Close'}</span><span>${state.relative ? pct(bar.value) : num(bar.value, d)}</span></div>`
          : [['Open', bar.open], ['High', bar.high], ['Low', bar.low], ['Close', bar.close]].map(([k, v]) => `<div><i>·</i><span>${k}</span><span>${num(v, d)}</span></div>`).join(''))
      return
    }
    const hi = shown.reduce((a, c) => c.high > a.high ? c : a, shown[0]), lo = shown.reduce((a, c) => c.low < a.low ? c : a, shown[0])
    const avg = shown.reduce((s, c) => s + c.close, 0) / shown.length
    $('legend').innerHTML = (state.relative ? `<div class="first"><span class="sw"></span><span>${esc(state.sym)}</span><span>${pct((shown.at(-1).close / shown[0].close - 1) * 100)}</span></div>`
      : `<div class="first"><span class="sw"></span><span>Last Price</span><span>${num(shown.at(-1).close, d)}</span></div>
      <div><i>⊤</i><span>High on ${short(hi.time)}</span><span>${num(hi.high, d)}</span></div>
      <div><i>-·-</i><span>Average</span><span>${num(avg, d)}</span></div>
      <div><i>⊥</i><span>Low on ${short(lo.time)}</span><span>${num(lo.low, d)}</span></div>`)
      + (state.mavg && !state.relative ? '<div><i style="color:#f5d300">—</i><span>SMA (50)</span><span></span></div><div><i style="color:#c26cff">—</i><span>SMA (200)</span><span></span></div>' : '')
      + others().map((s, i) => `<div><i style="color:${COLORS[i % COLORS.length]}">—</i><span>${esc(s)}${state.relative ? '' : ' (L1)'}</span><span></span></div>`).join('')
  }
  chart.subscribeCrosshairMove(p => {
    axis.cross = state.track && p?.point ? p.point.y : null; axis.requestUpdate?.()
    if (!state.track || !p?.time || !series) return legend()
    const bar = p.seriesData.get(series)
    bar ? legend({ ...bar, time: p.time }) : legend()
  })
  chart.subscribeClick(p => {
    if (!state.annotate || !series || !p?.point) return
    const price = series.coordinateToPrice(p.point.y)
    if (Number.isFinite(price)) notes.push(priceLine({ price, color: '#fb8b1e', lineWidth: 1, lineStyle: LC.LineStyle.Dashed, title: '' }, '#fb8b1e'))
  })

  // ---------- alerts: right-click the chart to set one; crossing it rings, flashes and (in the app) bounces the Dock ----------
  let alerts = shared.get('alerts', [])
  const saveAlerts = () => shared.set('alerts', alerts)
  function drawAlerts() {
    alertLines.forEach(dropLine); alertLines = []
    if (state.relative) return
    for (const a of alerts.filter(a => a.sym === state.sym)) alertLines.push(priceLine({ price: a.price, color: '#ff3b3b', lineWidth: 1, lineStyle: LC.LineStyle.SparseDotted, title: '🔔 ALRT' }, '#ff3b3b', '#ffffff'))
  }
  $('chartBox').addEventListener('contextmenu', e => {
    if (!series || state.relative) return
    e.preventDefault()
    const y = e.clientY - $('chart').getBoundingClientRect().top, price = series.coordinateToPrice(y), last = quote?.last
    if (!Number.isFinite(price) || !Number.isFinite(last)) return
    const d = digits(last), p = +price.toFixed(d)
    alerts.push({ sym: state.sym, price: p, above: p > last, at: Date.now() }); saveAlerts(); drawAlerts()
    status(`Alert ${state.sym} ${p > last ? '≥' : '≤'} ${num(p, d)} – prawy klik dodaje kolejny, menu 96) Actions czyści`)
  })
  function ring(a, price) {
    const d = digits(price)
    $('alertBar').hidden = false
    $('alertBar').innerHTML = `<b>ALERT</b> ${esc(a.sym)} ${a.above ? 'przebił w górę' : 'spadł poniżej'} ${num(a.price, d)} · teraz ${num(price, d)} <button type="button" aria-label="Zamknij">✕</button>`
    $('alertBar').querySelector('button').onclick = () => { $('alertBar').hidden = true }
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); for (const [i, f] of [880, 660, 880].entries()) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = .08; o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * .18); o.stop(ctx.currentTime + i * .18 + .14) } } catch {}
    window.webkit?.messageHandlers?.windowDrag?.postMessage({ attention: `${a.sym} ${num(a.price, d)}` })
    if (window.Notification?.permission === 'granted') new Notification('Bloomberg · alert', { body: `${a.sym} ${a.above ? '≥' : '≤'} ${num(a.price, d)}` })
  }
  async function checkAlerts(prices = {}) {
    if (!alerts.length) return
    for (const sym of [...new Set(alerts.map(a => a.sym))]) {
      let price = prices[sym]
      if (!Number.isFinite(price)) try { const d = await chartData(sym, '1D'); price = d.price ?? d.candles.at(-1)?.close } catch { continue }
      for (const a of alerts.filter(a => a.sym === sym && (a.above ? price >= a.price : price <= a.price))) { ring(a, price); alerts = alerts.filter(x => x !== a) }
    }
    saveAlerts(); if (series) drawAlerts()
  }

  // ---------- quote lines ----------
  function spark(points, up) {
    const c = $('spark'), x = c.getContext('2d'), w = c.width, h = c.height
    x.clearRect(0, 0, w, h)
    if (points.length < 2) return
    const lo = Math.min(...points), hi = Math.max(...points), span = hi - lo || 1
    x.strokeStyle = up ? '#d9d9d9' : '#ff5a5a'; x.lineWidth = 1; x.beginPath()
    points.forEach((v, i) => { const px = i / (points.length - 1) * (w - 2) + 1, py = h - 2 - (v - lo) / span * (h - 4); i ? x.lineTo(px, py) : x.moveTo(px, py) })
    x.stroke()
  }
  function showLast(last, prev) {
    const change = last - prev, dir = dirOf(change), p = digits(last)
    quote = { last, prev }
    $('qArrow').textContent = dir === 'up' ? '↑' : dir === 'down' ? '↓' : ''
    $('qArrow').className = 'bb-arrow ' + dir
    $('qLast').textContent = num(last, p); $('qLast').className = 'bb-last ' + dir
    $('qChg').textContent = chg(change, p); $('qChg').className = 'bb-chg ' + dir
  }
  function renderQuote(data, intraday) {
    const d = data.candles, today = d.at(-1), last = Number.isFinite(data.price) ? data.price : today?.close
    const prev = Number.isFinite(data.previousClose) ? data.previousClose : d.at(-2)?.close, p = digits(last)
    $('qSym').textContent = state.sym.replace(/!$/, '')
    showLast(last, prev)
    $('qPrev').textContent = num(prev, p)
    $('qOp').textContent = num(today?.open, p); $('qHi').textContent = num(today?.high, p); $('qLo').textContent = num(today?.low, p)
    $('qVol').textContent = Number.isFinite(today?.volume) ? Math.round(today.volume).toLocaleString('en-US').replace(/,/g, '') : 'N.A.'
    $('qOI').textContent = 'N.A.'; $('qSize').textContent = '— x —'
    const iday = intraday?.candles || [], lastDay = iday.length ? etDay(iday.at(-1).time) : null
    $('qAt').textContent = iday.length ? new Date(iday.at(-1).time * 1000).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    spark(iday.filter(c => etDay(c.time) === lastDay).map(c => c.close), last >= prev)
    const yk = yellowKey(state.sym)
    $('secName').textContent = `${data.name || state.sym} ${yk}`
    $('secField').textContent = `${state.sym.replace(/!$/, '')} ${yk}`
    document.title = `${state.sym} ${yk} ${state.fn} · Bloomberg`
  }

  // ---------- live crypto (Hyperliquid): price, open interest and funding every 3 s ----------
  const hlCoin = s => ({ 'BTC1!': 'BTC', BTCUSD: 'BTC', 'BTC-USD': 'BTC', 'ETH1!': 'ETH', ETHUSD: 'ETH', 'ETH-USD': 'ETH', 'SOL-USD': 'SOL', SOLUSD: 'SOL', XYZ100: 'xyz:XYZ100' })[s]
  let hlTimer = 0
  async function hlTick() {
    const coin = hlCoin(state.sym)
    if (!coin || document.hidden || state.fn !== 'GP') return
    try {
      const { markets = [] } = await (await fetch('/api/hl/markets')).json()
      const m = markets.find(x => x.coin === coin)
      if (!m || hlCoin(state.sym) !== coin || !quote) return
      showLast(m.price, quote.prev)
      $('qOI').textContent = Number.isFinite(m.openInterest) ? Math.round(m.openInterest).toLocaleString('en-US') : 'N.A.'
      $('qSize').textContent = Number.isFinite(m.funding) ? `Fund ${(m.funding * 100).toFixed(4)}%` : ''
      $('qAt').textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      const bar = shown.at(-1)
      if (bar && !state.relative && series) { bar.close = m.price; bar.high = Math.max(bar.high, m.price); bar.low = Math.min(bar.low, m.price); series.update(state.type === 'line' ? { time: bar.time, value: bar.close } : { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close }); axis.last = m.price; axis.requestUpdate?.() }
      checkAlerts({ [state.sym]: m.price })
    } catch {}
  }
  function hlStart() { clearInterval(hlTimer); if (hlCoin(state.sym)) { hlTimer = setInterval(hlTick, 3000); hlTick() } }

  // ---------- watchlist (left column) ----------
  let watch = shared.get('watch', ['NQ1!', 'ES1!', 'YM1!', 'RTY1!', 'GC1!', 'CL1!', 'DXY1!', 'BTC1!', 'ETH1!'])
  let tape = { at: 0, map: new Map() }
  async function tapeMap() {
    if (Date.now() - tape.at < 30000) return tape.map
    try { const { quotes = [] } = await (await fetch('/api/tape')).json(); tape = { at: Date.now(), map: new Map(quotes.flatMap(q => [[q.chart, q], [q.symbol, q]])) } } catch {}
    return tape.map
  }
  async function renderWatch() {
    const box = $('watchList')
    if ($('watch').hidden) return
    const map = await tapeMap()
    const rows = await Promise.all(watch.map(async sym => {
      const q = map.get(sym)
      if (q) return { sym, price: q.price, change: q.change }
      try { const d = await chartData(sym, '1D'), last = d.price ?? d.candles.at(-1)?.close, prev = d.previousClose ?? d.candles.at(-2)?.close; return { sym, price: last, change: (last / prev - 1) * 100 } } catch { return { sym } }
    }))
    box.innerHTML = rows.map(r => `<li data-sym="${esc(r.sym)}" class="${r.sym === state.sym ? 'on' : ''}"><b>${esc(r.sym)}</b><span>${group3(r.price, digits(r.price ?? 1))}</span><em class="${dirOf(r.change)}">${pct(r.change)}</em><button type="button" data-del="${esc(r.sym)}" aria-label="Usuń ${esc(r.sym)}">×</button></li>`).join('')
  }
  $('watchList').onclick = e => {
    const del = e.target.closest('[data-del]')?.dataset.del
    if (del) { watch = watch.filter(s => s !== del); shared.set('watch', watch); renderWatch(); return }
    const sym = e.target.closest('[data-sym]')?.dataset.sym
    if (sym) open(sym)
  }
  $('watchAdd').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const s = e.target.value.trim().toUpperCase(); e.target.value = ''; if (s && !watch.includes(s)) { watch.push(s); shared.set('watch', watch); renderWatch() } })
  function toggleWatch(on = $('watch').hidden) { $('watch').hidden = !on; state.watch = on; store('watchOpen', on); $('collapse').textContent = on ? '«' : '»'; renderWatch() }

  // ---------- function screens: WEI / FXC / WB / GLCO / MOST / CRYP and ECO ----------
  const WEI_GROUPS = [
    ['Americas', ['SPX', 'NDX', 'DJI', 'RUT', 'VIX', 'SPY', 'QQQ', 'IWM'], 'Equity'], ['EMEA', ['DAX', 'FTSE'], 'Equity'], ['Asia / Pacific', ['N225'], 'Equity'],
    ['Futures', ['NQ1!', 'ES1!', 'YM1!'], 'Equity'], ['Govt Bonds', ['US10Y'], 'Govt'], ['Currencies', ['DXY', 'EURUSD', 'USDJPY', 'GBPUSD'], 'Curncy'],
    ['Commodities', ['GOLD', 'SILVER', 'WTI', 'NATGAS'], 'Comdty'], ['Crypto', ['BTC', 'ETH', 'SOL', 'XRP', 'BNB'], 'Crypto'],
    ['Most Active Equities', ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'AVGO', 'LLY', 'JPM', 'V', 'WMT', 'XOM', 'MA', 'ORCL', 'COST', 'NFLX', 'AMD', 'PLTR', 'TSM', 'BABA'], 'Most'],
  ]
  const SCREEN_FILTER = { WEI: null, FXC: 'Curncy', WB: 'Govt', GLCO: 'Comdty', MOST: 'Most', CRYP: 'Crypto' }
  const SCREEN_TITLE = { WEI: 'World Equity Indices', FXC: 'Currencies', WB: 'World Bond Markets', GLCO: 'Global Commodities', MOST: 'Most Active Equities', CRYP: 'Crypto', ECO: 'Economic Calendar · United States' }
  let screenTimer = 0, ecoRange = 'week'
  function showScreen(fn) {
    state.fn = fn; document.documentElement.dataset.fn = fn; $('fn').textContent = fn
    clearInterval(screenTimer)
    if (fn === 'GP') { $('screen').hidden = true; refresh(true); return }
    $('screen').hidden = false
    const paint = fn === 'ECO' ? eco : () => wei(fn)
    paint(); screenTimer = setInterval(() => { if (!document.hidden) paint() }, 30000)
    document.title = `${fn} · Bloomberg`
  }
  async function wei(fn) {
    const map = await tapeMap(), filter = SCREEN_FILTER[fn]
    let n = 0
    const groups = WEI_GROUPS.filter(g => filter ? g[2] === filter : g[2] !== 'Most')
    $('screen').innerHTML = `<header class="bb-scr-head"><b>${fn}</b> ${SCREEN_TITLE[fn]}<span class="bb-grow"></span><span>${new Date().toLocaleTimeString('en-GB', { timeZone: 'America/New_York' })} NY</span><button type="button" data-go="GP">GP ▸</button></header>
      <table class="bb-wei"><thead><tr><th></th><th>Security</th><th>Last</th><th>Net Chg</th><th>%Chg</th><th class="bar"></th></tr></thead><tbody>${groups.map(([name, syms]) => `<tr class="grp"><td colspan="6">${name}</td></tr>` + syms.map(s => {
        const q = map.get(s); if (!q) return ''
        const net = q.price - q.price / (1 + q.change / 100), d = digits(q.price), w = Math.min(100, Math.abs(q.change) * 25)
        return `<tr data-open="${esc(q.chart)}"><td class="n">${++n})</td><td>${esc(s)}</td><td>${group3(q.price, d)}</td><td class="${dirOf(net)}">${chg(net, d)}</td><td class="${dirOf(q.change)}">${pct(q.change)}</td><td class="bar"><i class="${dirOf(q.change)}" style="width:${w}%"></i></td></tr>`
      }).join('')).join('')}</tbody></table><p class="bb-scr-note">Klik otwiera wykres (GP). F8 waluty · F9 obligacje · F10 akcje · WEI wszystko · ECO kalendarz</p>`
  }
  async function eco() {
    let events = []
    try { events = (await (await fetch('/api/events?range=' + ecoRange)).json()).events || [] } catch {}
    const now = Date.now(), next = events.find(e => Date.parse(e.date) > now)
    const day = t => new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: '2-digit', day: '2-digit' })
    let lastDay = ''
    $('screen').innerHTML = `<header class="bb-scr-head"><b>ECO</b> ${SCREEN_TITLE.ECO}<span class="bb-grow"></span><button type="button" data-eco="week" class="${ecoRange === 'week' ? 'on' : ''}">This Week</button><button type="button" data-eco="next-week" class="${ecoRange === 'next-week' ? 'on' : ''}">Next Week</button><button type="button" data-go="GP">GP ▸</button></header>
      <table class="bb-eco"><thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Rel</th><th>Survey</th><th>Actual</th><th>Prior</th></tr></thead><tbody>${events.map(e => {
        const t = Date.parse(e.date), dd = day(t), first = dd !== lastDay; lastDay = dd
        const rel = { High: '■■■', Medium: '■■□', Low: '■□□' }[e.impact] || '□□□'
        return `<tr class="${t < now ? 'past' : ''} ${e === next ? 'next' : ''} ${e.impact === 'High' ? 'high' : ''}"><td>${first ? dd : ''}</td><td>${new Date(t).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}</td><td>${esc(e.title)}</td><td class="rel">${rel}</td><td>${esc(e.forecast || '')}</td><td>${esc(e.actual || '')}</td><td>${esc(e.previous || '')}</td></tr>`
      }).join('') || '<tr><td colspan="7">Calendar unavailable</td></tr>'}</tbody></table><p class="bb-scr-note">Czas Nowego Jorku. Pomarańczowe: najbliższa publikacja.</p>`
  }
  $('screen').onclick = e => {
    const go = e.target.closest('[data-go]')?.dataset.go, row = e.target.closest('[data-open]')?.dataset.open, range = e.target.closest('[data-eco]')?.dataset.eco
    if (range) { ecoRange = range; eco() } else if (row) { open(row); showScreen('GP') } else if (go) showScreen(go)
  }

  // ---------- controls ----------
  function status(text) { $('status').textContent = text }
  function controls() {
    document.querySelectorAll('#periods button').forEach(b => b.classList.toggle('on', b.dataset.p === state.period))
    document.querySelectorAll('#types button').forEach(b => b.classList.toggle('on', !state.relative && b.dataset.t === state.type))
    $('freq').textContent = state.freq + ' ▾'
    // Bloomberg's function code follows the chart: GPC candles, GP line, GPO bars, COMP relative.
    if (state.fn === 'GP') $('fn').textContent = state.relative ? 'COMP' : { candle: 'GPC', line: 'GP', bar: 'GPO' }[state.type]
    $('kindName').textContent = state.relative ? 'Relative (COMP)' : { candle: 'Candle Chart', line: 'Line Chart', bar: 'Bar Chart' }[state.type]
    $('mavg').checked = state.mavg; $('events').checked = state.events
    $('back').disabled = hpos <= 0; $('fwd').disabled = hpos >= history.length - 1
    $('link').dataset.group = state.group || ''; $('link').style.background = state.group || ''
    document.querySelectorAll('.bb-tools button').forEach(b => b.classList.toggle('on', (b.dataset.tool === 'track' && state.track) || (b.dataset.tool === 'annotate' && state.annotate) || (b.dataset.tool === 'news' && !$('newsView').hidden)))
  }
  let refreshing = 0
  async function refresh(quiet) {
    const sym = state.sym, ticket = ++refreshing
    if (!FREQS[state.period].includes(state.freq)) state.freq = FREQS[state.period].includes(state.freqs[state.period]) ? state.freqs[state.period] : FREQS[state.period][0]
    controls()
    if (!quiet) status('Loading ' + sym + '…')
    try {
      const [d1, base, intraday] = await Promise.all([chartData(sym, '1D'), chartData(sym, source()), chartData(sym, '5m').catch(() => null), loadLabels(sym)])
      if (ticket !== refreshing) return
      daily = d1
      renderQuote(d1, intraday)
      shown = window_(reshape(base.candles, state.freq), state.period)
      // YTD starts on the last day of the previous year, like Bloomberg's date box.
      if (shown.length) { $('from').textContent = state.period === 'YTD' ? `12/31/${new Date(shown.at(-1).time * 1000).getUTCFullYear() - 1}` : mdy(shown[0].time); $('to').textContent = mdy(shown.at(-1).time) }
      draw()
      drawCompare()
      status(shown.length ? '' : 'No data for this range')
      checkAlerts({ [sym]: quote?.last })
    } catch (e) { if (ticket === refreshing) status(`${sym}: ${e.message}`) }
  }
  function open(sym, push = true, fromLink = false) {
    sym = sym.trim().toUpperCase()
    if (!sym) return
    if (push && sym !== state.sym) { history.splice(hpos + 1); history.push(sym); hpos = history.length - 1 }
    state.sym = sym; store('symbol', sym); notes = []
    if (pane && state.group && !fromLink) parent.postMessage({ type: 'bb-sym', pane, group: state.group, sym }, '*')
    makeSeries(); refresh(); hlStart(); renderWatch()
  }
  function setPeriod(p) { state.period = p; store('period', p); state.freq = null; refresh() }
  function setFreq(f) { state.freq = f; state.freqs[state.period] = f; store('freqs', state.freqs); refresh() }
  function setRelative(on) { state.relative = on; store('relative', on); makeSeries(); controls(); draw(); drawCompare() }

  $('periods').onclick = e => { const p = e.target.closest('[data-p]')?.dataset.p; if (p) setPeriod(p) }
  $('types').onclick = e => { const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return; state.type = t; store('type', t); state.relative = false; store('relative', false); makeSeries(); controls(); draw(); drawCompare() }
  $('mavg').onchange = e => { state.mavg = e.target.checked; store('mavg', state.mavg); draw() }
  $('events').onchange = e => { state.events = e.target.checked; store('events', state.events); draw() }
  $('back').onclick = () => { if (hpos > 0) { hpos--; open(history[hpos], false) } }
  $('fwd').onclick = () => { if (hpos < history.length - 1) { hpos++; open(history[hpos], false) } }
  $('table').onclick = () => { $('tableView').hidden = !$('tableView').hidden; $('table').classList.toggle('on', !$('tableView').hidden); if (!$('tableView').hidden) table() }
  $('collapse').onclick = () => toggleWatch()
  // Add Data: one or more securities separated by commas or spaces; empty clears.
  $('addData').addEventListener('keydown', e => { if (e.key === 'Enter') { state.compares = e.target.value.toUpperCase().split(/[\s,;]+/).filter(Boolean).slice(0, 5); store('compares', state.compares); drawCompare() } })
  $('addData').value = state.compares.join(', ')
  // Pane link colour: none → amber → cyan → magenta → green; panes of one colour follow each other's security.
  $('link').onclick = () => { const i = COLORS.indexOf(state.group); state.group = i === COLORS.length - 2 ? null : COLORS[(i + 1) % 4]; store('group', state.group); controls() }
  addEventListener('message', e => {
    const m = e.data
    if (m?.type === 'bb-open' && m.group === state.group) open(m.sym, true, true)
    if (m?.type === 'bb-command') runCommand(m.text)
  })
  if (pane) addEventListener('mousedown', () => parent.postMessage({ type: 'bb-focus', pane }, '*'), true)

  function table() {
    const d = digits(shown.at(-1)?.close ?? 1), intraday = isIntraday()
    const time = t => intraday ? new Date(t * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : mdy(t)
    $('tableView').innerHTML = `<table><thead><tr><th>Date</th><th>Last Px</th><th>Open</th><th>High</th><th>Low</th><th>Change</th><th>Volume</th></tr></thead><tbody>${shown.slice().reverse().map((c, i, a) => {
      const prev = a[i + 1]?.close
      return `<tr><td>${time(c.time)}</td><td>${num(c.close, d)}</td><td>${num(c.open, d)}</td><td>${num(c.high, d)}</td><td>${num(c.low, d)}</td><td>${Number.isFinite(prev) ? chg(c.close - prev, d) : ''}</td><td>${Number.isFinite(c.volume) ? Math.round(c.volume).toLocaleString('en-US') : ''}</td></tr>`
    }).join('')}</tbody></table>`
  }
  async function news() {
    const box = $('newsView')
    box.hidden = !box.hidden; controls()
    if (box.hidden) return
    box.innerHTML = '<h3>CN · Top News</h3><a><time>…</time><span>Loading</span></a>'
    try {
      const r = await fetch('/api/news'); const { items = [] } = await r.json()
      box.innerHTML = '<h3>CN · Top News</h3>' + items.slice(0, 40).map(it => `<a href="${esc(it.link)}" target="_blank" rel="noopener"><time>${new Date(it.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time><span>${esc(it.title)}</span></a>`).join('')
    } catch { box.innerHTML = '<h3>CN · Top News</h3><a><time>--:--</time><span>News unavailable</span></a>' }
  }
  document.querySelector('.bb-tools').onclick = e => {
    const tool = e.target.closest('[data-tool]')?.dataset.tool
    if (tool === 'track') { state.track = !state.track; chart.applyOptions({ crosshair: { mode: state.track ? LC.CrosshairMode.Normal : LC.CrosshairMode.Hidden } }); legend() }
    if (tool === 'annotate') { state.annotate = !state.annotate; status(state.annotate ? 'Annotate: kliknij wykres, aby dodać linię ceny' : '') }
    if (tool === 'news') return news()
    if (tool === 'zoom') fit()
    controls()
  }

  // Numbered menus (94/96/97), periodicity, Related Data and Related Functions: one pop-up list under the control.
  const check = on => on ? '✓ ' : ''
  const MENUS = {
    charts: () => [['1', 'Candle Chart', () => setType('candle')], ['2', 'Line Chart', () => setType('line')], ['3', 'Bar Chart', () => setType('bar')], ['4', check(state.relative) + 'Relative Performance (COMP)', () => setRelative(!state.relative)],
      ['5', check(state.mavg) + 'Moving Averages 50/200', () => { state.mavg = !state.mavg; store('mavg', state.mavg); controls(); draw() }], ['6', check(state.events) + 'Poziomy H/L dnia, tygodnia, miesiąca (Q)', () => { state.events = !state.events; store('events', state.events); controls(); draw() }]],
    actions: () => [['1', 'Save Chart Image (PNG)', saveImage], ['2', 'Refresh Data', () => { cache.clear(); refresh() }], ['3', 'Copy Security', () => navigator.clipboard?.writeText(state.sym)],
      ['4', `Add to Watchlist`, () => { if (!watch.includes(state.sym)) { watch.push(state.sym); shared.set('watch', watch) } toggleWatch(true) }],
      ['5', `Clear Alerts for ${state.sym} (${alerts.filter(a => a.sym === state.sym).length})`, () => { alerts = alerts.filter(a => a.sym !== state.sym); saveAlerts(); drawAlerts() }],
      ['6', `Clear All Alerts (${alerts.length})`, () => { alerts = []; saveAlerts(); drawAlerts() }]],
    edit: () => [['1', 'Reset Chart', () => { state.compares = []; store('compares', []); $('addData').value = ''; notes.forEach(dropLine); notes = []; setRelative(false); fit() }], ['2', 'Clear Annotations', () => { notes.forEach(dropLine); notes = [] }]],
    freq: () => FREQS[state.period].map((f, i) => [String(i + 1), f, () => setFreq(f)]),
    data: () => [['1', 'Compare: NQ1!, ES1!, YM1!, RTY1! (COMP)', () => { state.compares = ['ES1!', 'YM1!', 'RTY1!'].filter(s => s !== state.sym); if (state.sym !== 'NQ1!') state.compares.unshift('NQ1!'); store('compares', state.compares); $('addData').value = state.compares.join(', '); setRelative(true) }],
      ['2', 'Spread NQ1! / ES1!', () => open('NQ1!/ES1!')], ['3', 'Spread GC1! / SI1! (gold / silver)', () => open('GC1!/SI1!')], ['4', 'Spread CL1! − BZ1! (WTI − Brent)', () => open('CL1!-BZ1!')],
      ['5', 'Clear Related Data', () => { state.compares = []; store('compares', []); $('addData').value = ''; setRelative(false) }]],
    related: () => [['GP', 'Line / Candle Chart', () => showScreen('GP')], ['GIP', 'Intraday Chart', () => { showScreen('GP'); setPeriod('1D') }], ['HP', 'Historical Prices', () => { showScreen('GP'); if ($('tableView').hidden) $('table').click() }],
      ['CN', 'Company / Market News', () => { showScreen('GP'); if ($('newsView').hidden) news() }], ['COMP', 'Relative Performance', () => { showScreen('GP'); setRelative(true) }], ['HL', 'Key Levels (H/L · Q)', () => { showScreen('GP'); state.events = true; store('events', true); controls(); draw() }],
      ['WEI', 'World Equity Indices', () => showScreen('WEI')], ['FXC', 'Currencies', () => showScreen('FXC')], ['WB', 'World Bonds', () => showScreen('WB')], ['GLCO', 'Commodities', () => showScreen('GLCO')], ['MOST', 'Most Active', () => showScreen('MOST')], ['CRYP', 'Crypto', () => showScreen('CRYP')], ['ECO', 'Economic Calendar', () => showScreen('ECO')],
      ['MON', 'Watchlist', () => { showScreen('GP'); toggleWatch(true) }]],
    layout: () => [[1, '1 panel', () => setLayout(1)], [2, '2 panele (Launchpad)', () => setLayout(2)], [4, '4 panele (Launchpad)', () => setLayout(4)]].map(([n, t, f]) => [String(n), check(n === layout) + t, f]),
  }
  function setType(t) { state.type = t; store('type', t); state.relative = false; store('relative', false); makeSeries(); controls(); draw(); drawCompare() }
  function menu(name, anchor) {
    const pop = $('pop')
    if (!pop.hidden && pop.dataset.for === name) { pop.hidden = true; return }
    const items = MENUS[name]()
    pop.innerHTML = items.map(([k, label], i) => `<button data-i="${i}"><em>${esc(k)})</em>${esc(label)}</button>`).join('')
    const r = anchor.getBoundingClientRect()
    pop.style.left = Math.max(0, Math.min(r.left, innerWidth - 300)) + 'px'; pop.style.top = r.bottom + 'px'
    pop.dataset.for = name; pop.hidden = false
    pop.onclick = e => { const i = e.target.closest('[data-i]')?.dataset.i; if (i === undefined) return; pop.hidden = true; items[+i][2]() }
  }
  document.querySelector('.bb-red').addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (b) menu(b.dataset.menu, b) })
  $('freq').onclick = e => menu('freq', e.currentTarget)
  $('related').onclick = e => menu('related', e.currentTarget)
  $('relData').onclick = e => menu('data', e.currentTarget)
  $('layoutBtn').onclick = e => menu('layout', e.currentTarget)
  addEventListener('mousedown', e => { if (!e.target.closest('#pop,[data-menu],#freq,#related,#relData,#layoutBtn')) $('pop').hidden = true })
  async function saveImage() {
    const canvas = chart.takeScreenshot(), blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    const name = `${state.sym.replace(/[!/]/g, '')}_GP_${state.period}.png`
    if (window.webkit?.messageHandlers?.postCreatorFile) {
      const data = await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(blob) })
      await window.webkit.messageHandlers.postCreatorFile.postMessage({ action: 'save', filename: 'UNC-Terminal-' + new Date().toISOString().slice(0, 10) + '.png', data }).catch(() => {})
    } else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000) }
  }

  // Command line: click the security or just start typing. "ES1!", "ES1! GP", "AAPL US Equity", "NQ1!/ES1!",
  // or a function alone: GIP, HP, CN, COMP, HL, WEI, FXC, WB, GLCO, MOST, CRYP, ECO, MON.
  const cmd = $('cmd'), input = $('cmdInput')
  function command(open_) { cmd.hidden = !open_; $('title').hidden = open_; if (open_) { input.focus(); input.select() } }
  $('title').onclick = () => { input.value = ''; command(true) }
  function runCommand(text) {
    const words = text.toUpperCase().replace(/<GO>|\bGO\b/g, ' ').replace(/\b(COMDTY|INDEX|CURNCY|EQUITY|US)\b/g, ' ').trim().split(/\s+/).filter(Boolean)
    const fn = words.at(-1), entry = fn && MENUS.related().find(([k]) => k === fn)
    if (entry) { words.pop(); if (words.length) open(words.join('')); entry[2](); return }
    if (words.length) { if (state.fn !== 'GP') showScreen('GP'); open(words.join('')) }
  }
  cmd.onsubmit = e => { e.preventDefault(); command(false); runCommand(input.value) }
  input.addEventListener('keydown', e => { if (e.key === 'Escape') command(false) })
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) command(false) }, 150))
  // Keyboard: typing opens the command line; F8 currencies, F9 bonds, F10 equities (Bloomberg market keys);
  // ←/→ change the range, ↑/↓ the periodicity; Esc closes pop-ups.
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input,textarea')) return
    const keys = { F8: 'FXC', F9: 'WB', F10: 'MOST' }
    if (keys[e.key]) { e.preventDefault(); showScreen(keys[e.key]); return }
    if (state.fn === 'GP' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); const i = PERIODS.indexOf(state.period) + (e.key === 'ArrowRight' ? 1 : -1); if (PERIODS[i]) setPeriod(PERIODS[i]); return }
    if (state.fn === 'GP' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const list = FREQS[state.period], i = list.indexOf(state.freq) + (e.key === 'ArrowDown' ? 1 : -1); if (list[i]) setFreq(list[i]); return }
    if (/^[a-z0-9^=!.-]$/i.test(e.key)) { input.value = ''; command(true) }
    if (e.key === 'Escape') { $('pop').hidden = true; $('newsView').hidden = true; controls() }
  })

  makeSeries(); toggleWatch(state.watch && !pane); showScreen('GP'); hlStart()
  setInterval(() => { if (!document.hidden && state.fn === 'GP') { for (const k of [...cache.keys()]) if (k.startsWith(state.sym + '|') || k.includes(state.sym)) cache.delete(k); refresh(true); renderWatch() } }, 60000)
  // Alerts on other securities are checked every minute even when they are not on screen.
  setInterval(() => checkAlerts(), 60000)
})()
