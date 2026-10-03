// Bloomberg Terminal GP screen for UNCsWay Final: launchpad bar with a command line, quote lines, the red
// action bar with numbered menus, range / periodicity / chart-type controls, and a candle chart on a dotted grid.
// Data comes from the terminal's own /api/chart (Yahoo; in the Mac app through the native proxy).
(() => {
  const $ = id => document.getElementById(id)
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const store = (k, v) => { try { v === undefined ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d } catch { return d } }

  const PERIODS = ['1D', '3D', '1M', '6M', 'YTD', '1Y', '5Y', 'Max']
  // Periodicities a range can show, first = default. Intraday ranges come from 5-minute bars, 5Y from weekly
  // and Max from monthly history (Yahoo keeps 2 years of daily bars).
  const FREQS = { '1D': ['5 Min', '30 Min'], '3D': ['5 Min', '30 Min'], '1M': ['Daily', 'Weekly'], '6M': ['Daily', 'Weekly', 'Monthly'],
    YTD: ['Daily', 'Weekly', 'Monthly'], '1Y': ['Daily', 'Weekly', 'Monthly'], '5Y': ['Weekly', 'Monthly'], Max: ['Monthly'] }
  const SOURCE = { '1D': '5m', '3D': '5m', '1M': '1D', '6M': '1D', YTD: '1D', '1Y': '1D', '5Y': '1W', Max: '1M' }

  const state = { sym: load('bb-symbol', 'NQ1!'), period: load('bb-period', 'YTD'), freq: null, type: load('bb-type', 'candle'),
    mavg: load('bb-mavg', false), events: load('bb-events', false), track: true, annotate: false, compare: null }
  if (!PERIODS.includes(state.period)) state.period = 'YTD'
  const history = [state.sym]; let hpos = 0
  const cache = new Map()
  let shown = [], quote = null

  // ---------- data ----------
  async function chartData(symbol, frame) {
    const key = symbol + '|' + frame, hit = cache.get(key)
    if (hit && Date.now() - hit.at < 60000) return hit.data
    const r = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&interval=${frame}`)
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status)
    data.candles = (data.candles || []).filter(c => ['time', 'open', 'high', 'low', 'close'].every(k => Number.isFinite(c[k]))).sort((a, b) => a.time - b.time)
    cache.set(key, { at: Date.now(), data })
    return data
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
  function reshape(candles, freq) {
    if (freq === '30 Min') return bucket(candles, t => Math.floor(t / 1800))
    if (freq === 'Weekly') return bucket(candles, weekKey)
    if (freq === 'Monthly') return bucket(candles, monthKey)
    return candles
  }
  function window_(candles, period) {
    if (!candles.length) return candles
    const last = candles.at(-1).time
    if (period === '1D' || period === '3D') {
      const days = [...new Set(candles.map(c => etDay(c.time)))].slice(period === '1D' ? -1 : -3)
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
  // Bloomberg drops the leading zero of a change: -0.73 → -.73
  const chg = (v, d) => Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(d).replace(/^(-?)0\./, '$1.') : '—'
  const mdy = t => { const d = new Date(t * 1000); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}` }
  const short = t => mdy(t).replace(/\/(\d\d)(\d\d)$/, '/$2')
  const yellowKey = s => /^(NQ|ES|YM|RTY|NKD|VX)1!$/.test(s) || s.startsWith('^') ? 'Index' : /1!$/.test(s) ? (s === 'DXY1!' ? 'Curncy' : 'Comdty') : /=X$|-USD$|^DXY$/.test(s) ? 'Curncy' : 'Equity'

  // ---------- chart ----------
  const LC = LightweightCharts
  const chart = LC.createChart($('chart'), {
    autoSize: true,
    layout: { background: { type: 'solid', color: '#000' }, textColor: '#f2f2f2', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13, attributionLogo: false },
    grid: { vertLines: { color: '#8c8c8c', style: LC.LineStyle.Dotted }, horzLines: { color: '#8c8c8c', style: LC.LineStyle.Dotted } },
    rightPriceScale: { borderVisible: false, ticksVisible: true, scaleMargins: { top: .12, bottom: .06 } },
    leftPriceScale: { visible: false, borderVisible: false },
    timeScale: { borderVisible: false, ticksVisible: true, rightOffset: 4 },
    crosshair: { mode: LC.CrosshairMode.Normal, vertLine: { color: '#8a8a8a', style: LC.LineStyle.Dotted, labelBackgroundColor: '#333' }, horzLine: { color: '#8a8a8a', style: LC.LineStyle.Dotted, labelBackgroundColor: '#333' } },
    localization: { locale: 'en-US', dateFormat: 'MM/dd/yy' },
  })
  const UP = '#ffffff', DOWN = '#2a8cff', WICK = '#d9d9d9'
  let series = null, lastLine = null, maLines = [], cmpSeries = null, markers = null, notes = []
  function makeSeries() {
    if (series) chart.removeSeries(series)
    const common = { lastValueVisible: false, priceLineVisible: false }
    series = state.type === 'line' ? chart.addSeries(LC.LineSeries, { ...common, color: '#ffffff', lineWidth: 1 })
      : state.type === 'bar' ? chart.addSeries(LC.BarSeries, { ...common, upColor: UP, downColor: DOWN, thinBars: true })
        : chart.addSeries(LC.CandlestickSeries, { ...common, upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: WICK, wickDownColor: WICK })
    lastLine = null; markers = null; notes = []
  }
  const sma = (data, n) => data.map((c, i) => i < n - 1 ? { time: c.time } : { time: c.time, value: data.slice(i - n + 1, i + 1).reduce((s, x) => s + x.close, 0) / n })

  function draw() {
    if (!series) makeSeries()
    const intraday = state.period === '1D' || state.period === '3D'
    chart.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } })
    const d = digits(shown.at(-1)?.close ?? 1)
    series.applyOptions({ priceFormat: { type: 'price', precision: d, minMove: 10 ** -d } })
    series.setData(state.type === 'line' ? shown.map(c => ({ time: c.time, value: c.close })) : shown.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    if (lastLine) series.removePriceLine(lastLine)
    const last = shown.at(-1)?.close
    lastLine = Number.isFinite(last) ? series.createPriceLine({ price: last, color: '#ffffff', lineVisible: false, axisLabelVisible: true, axisLabelColor: '#000000', axisLabelTextColor: '#ffffff' }) : null
    maLines.forEach(s => chart.removeSeries(s)); maLines = []
    if (state.mavg) for (const [n, color] of [[50, '#f5d300'], [200, '#c26cff']]) {
      const s = chart.addSeries(LC.LineSeries, { color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false })
      s.setData(sma(shown, n)); maLines.push(s)
    }
    const hi = shown.reduce((a, c) => c.high > a.high ? c : a, shown[0] || {}), lo = shown.reduce((a, c) => c.low < a.low ? c : a, shown[0] || {})
    const list = state.events && shown.length ? [{ time: hi.time, position: 'aboveBar', color: '#fb8b1e', shape: 'arrowDown', text: 'H' }, { time: lo.time, position: 'belowBar', color: '#fb8b1e', shape: 'arrowUp', text: 'L' }].sort((a, b) => a.time - b.time) : []
    if (!markers) markers = LC.createSeriesMarkers(series, list); else markers.setMarkers(list)
    chart.timeScale().fitContent()
    legend()
    if (!$('tableView').hidden) table()
  }
  async function drawCompare() {
    if (cmpSeries) { chart.removeSeries(cmpSeries); cmpSeries = null }
    chart.applyOptions({ leftPriceScale: { visible: !!state.compare } })
    if (!state.compare) { legend(); return }
    try {
      const data = await chartData(state.compare, SOURCE[state.period])
      const rows = window_(reshape(data.candles, state.freq), state.period)
      cmpSeries = chart.addSeries(LC.LineSeries, { color: '#fb8b1e', lineWidth: 1, priceScaleId: 'left', lastValueVisible: true, priceLineVisible: false })
      cmpSeries.setData(rows.map(c => ({ time: c.time, value: c.close })))
      status('')
    } catch (e) { status(`${state.compare}: ${e.message}`); state.compare = null; chart.applyOptions({ leftPriceScale: { visible: false } }) }
    legend()
  }

  // Legend box (top right): last, period high with its date, average, period low with its date; while tracking,
  // the bar under the crosshair.
  function legend(bar) {
    if (!shown.length) { $('legend').innerHTML = ''; return }
    const d = digits(shown.at(-1).close)
    if (bar) {
      $('legend').innerHTML = `<div class="first"><span class="sw"></span><span>${state.period === '1D' || state.period === '3D' ? new Date(bar.time * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : short(bar.time)}</span><span></span></div>`
        + [['Open', bar.open], ['High', bar.high], ['Low', bar.low], ['Close', bar.close ?? bar.value]].map(([k, v]) => `<div><i>·</i><span>${k}</span><span>${num(v, d)}</span></div>`).join('')
      return
    }
    const hi = shown.reduce((a, c) => c.high > a.high ? c : a, shown[0]), lo = shown.reduce((a, c) => c.low < a.low ? c : a, shown[0])
    const avg = shown.reduce((s, c) => s + c.close, 0) / shown.length
    $('legend').innerHTML = `<div class="first"><span class="sw"></span><span>Last Price</span><span>${num(shown.at(-1).close, d)}</span></div>
      <div><i>⊤</i><span>High on ${short(hi.time)}</span><span>${num(hi.high, d)}</span></div>
      <div><i>-·-</i><span>Average</span><span>${num(avg, d)}</span></div>
      <div><i>⊥</i><span>Low on ${short(lo.time)}</span><span>${num(lo.low, d)}</span></div>`
      + (state.mavg ? '<div><i style="color:#f5d300">—</i><span>SMA (50)</span><span></span></div><div><i style="color:#c26cff">—</i><span>SMA (200)</span><span></span></div>' : '')
      + (state.compare ? `<div><i style="color:#fb8b1e">—</i><span>${esc(state.compare)} (L1)</span><span></span></div>` : '')
  }
  chart.subscribeCrosshairMove(p => {
    if (!state.track || !p?.time || !series) return legend()
    const bar = p.seriesData.get(series)
    bar ? legend({ ...bar, time: p.time }) : legend()
  })
  chart.subscribeClick(p => {
    if (!state.annotate || !series || !p?.point) return
    const price = series.coordinateToPrice(p.point.y)
    if (Number.isFinite(price)) notes.push(series.createPriceLine({ price, color: '#fb8b1e', lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: true, axisLabelColor: '#fb8b1e', axisLabelTextColor: '#000', title: '' }))
  })

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
  function renderQuote(daily, intraday) {
    const d = daily.candles, today = d.at(-1), last = Number.isFinite(daily.price) ? daily.price : today?.close
    const prev = Number.isFinite(daily.previousClose) ? daily.previousClose : d.at(-2)?.close
    const change = last - prev, dir = change > 0 ? 'up' : change < 0 ? 'down' : ''
    const p = digits(last)
    quote = { last, prev }
    $('qSym').textContent = state.sym.replace(/!$/, '')
    $('qArrow').textContent = dir === 'up' ? '↑' : dir === 'down' ? '↓' : ''
    $('qArrow').className = 'bb-arrow ' + dir
    $('qLast').textContent = num(last, p); $('qLast').className = 'bb-last ' + dir
    $('qChg').textContent = chg(change, p); $('qChg').className = 'bb-chg ' + dir
    $('qPrev').textContent = num(prev, p)
    $('qOp').textContent = num(today?.open, p); $('qHi').textContent = num(today?.high, p); $('qLo').textContent = num(today?.low, p)
    $('qVol').textContent = Number.isFinite(today?.volume) ? Math.round(today.volume).toLocaleString('en-US').replace(/,/g, '') : 'N.A.'
    const iday = intraday?.candles || [], lastDay = iday.length ? etDay(iday.at(-1).time) : null
    const todayBars = iday.filter(c => etDay(c.time) === lastDay)
    $('qAt').textContent = iday.length ? new Date(iday.at(-1).time * 1000).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    spark(todayBars.map(c => c.close), change >= 0)
    const yk = yellowKey(state.sym)
    $('secName').textContent = `${daily.name || state.sym} ${yk}`
    $('secField').textContent = `${state.sym.replace(/!$/, '')} ${yk}`
    document.title = `${state.sym} ${yk} GP · Bloomberg`
  }

  // ---------- controls ----------
  function status(text) { $('status').textContent = text }
  function controls() {
    document.querySelectorAll('#periods button').forEach(b => b.classList.toggle('on', b.dataset.p === state.period))
    document.querySelectorAll('#types button').forEach(b => b.classList.toggle('on', b.dataset.t === state.type))
    $('freq').textContent = state.freq + ' ▾'
    $('kindName').textContent = { candle: 'Candle Chart', line: 'Line Chart', bar: 'Bar Chart' }[state.type]
    $('mavg').checked = state.mavg; $('events').checked = state.events
    $('back').disabled = hpos <= 0; $('fwd').disabled = hpos >= history.length - 1
    document.querySelectorAll('.bb-tools button').forEach(b => b.classList.toggle('on', (b.dataset.tool === 'track' && state.track) || (b.dataset.tool === 'annotate' && state.annotate) || (b.dataset.tool === 'news' && !$('newsView').hidden)))
  }
  async function refresh(quiet) {
    const sym = state.sym
    if (!FREQS[state.period].includes(state.freq)) state.freq = FREQS[state.period][0]
    controls()
    if (!quiet) status('Loading ' + sym + '…')
    try {
      const [daily, base, intraday] = await Promise.all([chartData(sym, '1D'), chartData(sym, SOURCE[state.period]), chartData(sym, '5m').catch(() => null)])
      if (sym !== state.sym) return
      renderQuote(daily, intraday)
      shown = window_(reshape(base.candles, state.freq), state.period)
      if (shown.length) { $('from').textContent = mdy(shown[0].time); $('to').textContent = mdy(shown.at(-1).time) }
      draw()
      if (state.compare) drawCompare()
      status(shown.length ? '' : 'No data for this range')
    } catch (e) { if (sym === state.sym) status(`${sym}: ${e.message === 'bad symbol or interval' ? 'Unknown security' : e.message}`) }
  }
  function open(sym, push = true) {
    sym = sym.trim().toUpperCase()
    if (!sym) return
    if (push && sym !== state.sym) { history.splice(hpos + 1); history.push(sym); hpos = history.length - 1 }
    state.sym = sym; store('bb-symbol', sym); notes = []
    makeSeries(); refresh()
  }

  $('periods').onclick = e => { const p = e.target.closest('[data-p]')?.dataset.p; if (!p) return; state.period = p; store('bb-period', p); state.freq = null; refresh() }
  $('types').onclick = e => { const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return; state.type = t; store('bb-type', t); makeSeries(); controls(); draw() }
  $('mavg').onchange = e => { state.mavg = e.target.checked; store('bb-mavg', state.mavg); draw() }
  $('events').onchange = e => { state.events = e.target.checked; store('bb-events', state.events); draw() }
  $('back').onclick = () => { if (hpos > 0) { hpos--; open(history[hpos], false) } }
  $('fwd').onclick = () => { if (hpos < history.length - 1) { hpos++; open(history[hpos], false) } }
  $('table').onclick = () => { $('tableView').hidden = !$('tableView').hidden; $('table').classList.toggle('on', !$('tableView').hidden); if (!$('tableView').hidden) table() }
  $('collapse').onclick = () => { document.querySelector('.bb-row1').hidden = !document.querySelector('.bb-row1').hidden }
  $('addData').addEventListener('keydown', e => { if (e.key === 'Enter') { state.compare = e.target.value.trim().toUpperCase() || null; drawCompare() } })

  function table() {
    const d = digits(shown.at(-1)?.close ?? 1), intraday = state.period === '1D' || state.period === '3D'
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
    if (tool === 'annotate') { state.annotate = !state.annotate; status(state.annotate ? 'Annotate: click the chart to draw a price line' : '') }
    if (tool === 'news') return news()
    if (tool === 'zoom') chart.timeScale().fitContent()
    controls()
  }

  // Numbered menus (94/96/97), periodicity and Related Functions: one pop-up list under the clicked control.
  const MENUS = {
    charts: () => [['1', 'Candle Chart', () => setType('candle')], ['2', 'Line Chart', () => setType('line')], ['3', 'Bar Chart', () => setType('bar')], ['4', (state.mavg ? '✓ ' : '') + 'Moving Averages 50/200', () => { state.mavg = !state.mavg; store('bb-mavg', state.mavg); controls(); draw() }]],
    actions: () => [['1', 'Save Chart Image (PNG)', saveImage], ['2', 'Refresh Data', () => { cache.clear(); refresh() }], ['3', 'Copy Security', () => navigator.clipboard?.writeText(state.sym)]],
    edit: () => [['1', 'Reset Chart', () => { state.compare = null; $('addData').value = ''; notes.forEach(n => series.removePriceLine(n)); notes = []; drawCompare(); chart.timeScale().fitContent() }], ['2', 'Clear Annotations', () => { notes.forEach(n => series.removePriceLine(n)); notes = [] }], ['3', (state.events ? '✓ ' : '') + 'Key Events (High / Low)', () => { state.events = !state.events; store('bb-events', state.events); controls(); draw() }]],
    freq: () => FREQS[state.period].map((f, i) => [String(i + 1), f, () => { state.freq = f; refresh() }]),
    related: () => [['GP', 'Line / Candle Chart', () => {}], ['GIP', 'Intraday Chart', () => { state.period = '1D'; state.freq = null; refresh() }], ['HP', 'Historical Prices', () => { if ($('tableView').hidden) $('table').click() }], ['CN', 'Company / Market News', () => { if ($('newsView').hidden) news() }]],
  }
  function setType(t) { state.type = t; store('bb-type', t); makeSeries(); controls(); draw() }
  function menu(name, anchor) {
    const pop = $('pop')
    if (!pop.hidden && pop.dataset.for === name) { pop.hidden = true; return }
    const items = MENUS[name]()
    pop.innerHTML = items.map(([k, label], i) => `<button data-i="${i}"><em>${esc(k)})</em>${esc(label)}</button>`).join('')
    const r = anchor.getBoundingClientRect()
    pop.style.left = Math.min(r.left, innerWidth - 250) + 'px'; pop.style.top = r.bottom + 'px'
    pop.dataset.for = name; pop.hidden = false
    pop.onclick = e => { const i = e.target.closest('[data-i]')?.dataset.i; if (i === undefined) return; pop.hidden = true; items[+i][2]() }
  }
  document.querySelector('.bb-red').addEventListener('click', e => { const b = e.target.closest('[data-menu]'); if (b) menu(b.dataset.menu, b) })
  $('freq').onclick = e => menu('freq', e.currentTarget)
  $('related').onclick = e => menu('related', e.currentTarget)
  addEventListener('mousedown', e => { if (!e.target.closest('#pop,[data-menu],#freq,#related')) $('pop').hidden = true })
  async function saveImage() {
    const canvas = chart.takeScreenshot(), blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
    const name = `${state.sym.replace(/!/g, '')}_GP_${state.period}.png`
    if (window.webkit?.messageHandlers?.postCreatorFile) {
      const data = await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(blob) })
      await window.webkit.messageHandlers.postCreatorFile.postMessage({ action: 'save', filename: 'UNC-Terminal-' + new Date().toISOString().slice(0, 10) + '.png', data }).catch(() => {})
    } else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000) }
  }

  // Command line: click the security or just start typing. "ES1!", "ES1! GP", "AAPL US Equity", "GIP", "HP", "CN".
  const cmd = $('cmd'), input = $('cmdInput')
  function command(open_) { cmd.hidden = !open_; $('title').hidden = open_; if (open_) { input.focus(); input.select() } }
  $('title').onclick = () => { input.value = ''; command(true) }
  cmd.onsubmit = e => {
    e.preventDefault()
    const words = input.value.toUpperCase().replace(/<GO>|\bGO\b/g, ' ').replace(/\b(COMDTY|INDEX|CURNCY|EQUITY|US)\b/g, ' ').trim().split(/\s+/).filter(Boolean)
    command(false)
    const fn = words.at(-1)
    if (fn && MENUS.related().some(([k]) => k === fn)) { words.pop(); if (words.length) open(words.join('')); MENUS.related().find(([k]) => k === fn)[2](); return }
    if (words.length) open(words.join(''))
  }
  input.addEventListener('keydown', e => { if (e.key === 'Escape') command(false) })
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) command(false) }, 150))
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input,textarea')) return
    if (/^[a-z0-9^=!.-]$/i.test(e.key)) { input.value = ''; command(true) }
    if (e.key === 'Escape') { $('pop').hidden = true; $('newsView').hidden = true; controls() }
  })

  // Mac app (UNCsWay Final): the page draws the title bar, so dragging it moves the window.
  const drag = window.webkit?.messageHandlers?.windowDrag
  if (drag) for (const el of document.querySelectorAll('[data-drag]')) {
    el.addEventListener('mousedown', e => { if (e.button === 0 && !e.target.closest('a,button,input,form') && e.detail === 1) drag.postMessage('drag') })
    el.addEventListener('dblclick', e => { if (!e.target.closest('a,button,input,form')) drag.postMessage('zoom') })
  }

  makeSeries(); refresh()
  setInterval(() => { if (!document.hidden) { for (const k of [...cache.keys()]) if (k.startsWith(state.sym + '|')) cache.delete(k); refresh(true) } }, 60000)
})()
