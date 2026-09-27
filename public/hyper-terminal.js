window.HyperTerminal = (() => {
  const root = document.getElementById('hyper-terminal')
  root.innerHTML = `<div class="ht">
    <aside class="ht-markets"><header><strong>HYPERLIQUID</strong><span id="ht-count"></span></header><input id="ht-search" type="search" placeholder="Szukaj: XYZ100, SP500, BTC…" aria-label="Szukaj rynku"><div class="ht-list" id="ht-list"></div></aside>
    <div class="ht-main"><header class="ht-head"><div><strong id="ht-symbol">XYZ100</strong><span id="ht-dex">xyz</span></div><div class="ht-price" id="ht-price">—</div><div class="ht-change" id="ht-change">—</div><div class="ht-spacer"></div><span class="ht-source">Dane: Hyperliquid</span></header>
      <div class="ht-stats"><div>WOLUMEN 24H <b id="ht-volume">—</b></div><div>OPEN INTEREST <b id="ht-oi">—</b></div><div>FUNDING / H <b id="ht-funding">—</b></div></div>
      <div class="ht-periods" id="ht-periods"></div>
      <div class="ht-indicators" aria-label="Indykatory"><span>Indykatory</span><label><input type="checkbox" id="ht-volume-toggle"> Wolumen</label><label><input type="checkbox" id="ht-tpo-toggle"> TPO</label><button id="ht-fit" type="button">Dopasuj wykres</button></div>
      <section class="ht-profile" id="ht-profile" hidden aria-label="Profil TPO"><div class="ht-profile-controls"><label>Sesja UTC <select id="ht-session"></select></label><label>Krok ceny <input id="ht-step" type="number" min="0" step="any" value="0" aria-label="Krok ceny TPO; zero oznacza automatyczny"></label><span>0 = auto · bloki 30m · VA 70%</span></div><div id="ht-profile-info" role="status"></div><div id="ht-profile-rows"></div></section><div class="ht-chart" id="ht-chart"></div><section id="ht-orderflow" aria-label="Order flow"></section><div class="ht-message" id="ht-message" hidden></div>
    </div><aside class="ht-book"><header><strong>ARKUSZ ZLECEŃ</strong><span id="ht-book-time"></span></header><div class="ht-book-title"><span>CENA</span><span>WIELKOŚĆ</span><span>SUMA</span></div><div id="ht-asks"></div><div class="ht-spread" id="ht-spread">—</div><div id="ht-bids"></div></aside>
  </div>`
  const $ = id => document.getElementById(id)
  const fmt = n => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 }) : '—'
  const compact = n => Number.isFinite(n) ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : '—'
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
  let all = [], selected = localStorage.getItem('hl-coin') || 'xyz:XYZ100', interval = localStorage.getItem('hl-interval') || '1h'
  let chart, series, volumeSeries, drawingPanel, request = 0, profileRequest = 0, initialized = false, chartKey = '', profileCandles = [], profileLines = []
  let settings = { volume: false, tpo: false, step: 0 }
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem('hl-indicators') || '{}') } } catch {}
  const orderflow = TerminalOrderflow.attach($('ht-orderflow'))
  const saveSettings = () => { try { localStorage.setItem('hl-indicators', JSON.stringify(settings)) } catch {} }
  $('ht-volume-toggle').checked = !!settings.volume
  $('ht-tpo-toggle').checked = !!settings.tpo
  $('ht-step').value = settings.step
  $('ht-profile').hidden = !settings.tpo
  const periods = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']
  if (!periods.includes(interval)) interval = '1h'
  $('ht-periods').innerHTML = periods.map(p => `<button data-period="${p}">${p}</button>`).join('')

  function theme() {
    if (!chart) return
    const css = getComputedStyle(document.documentElement)
    const color = name => css.getPropertyValue(name).trim()
    chart.applyOptions({ layout: { background: { color: color('--bg') }, textColor: color('--dim'), fontFamily: 'ui-monospace,Menlo,monospace' },
      grid: { vertLines: { visible: false }, horzLines: { color: color('--faint') } },
      rightPriceScale: { borderColor: color('--line') }, timeScale: { borderColor: color('--line') },
      crosshair: { vertLine: { color: color('--dim') }, horzLine: { color: color('--dim') } } })
    series.applyOptions({ upColor: color('--ink'), downColor: color('--bg'), borderUpColor: color('--ink'), borderDownColor: color('--ink'), wickUpColor: color('--ink'), wickDownColor: color('--ink') })
  }
  function setupChart() {
    if (chart) return
    chart = LightweightCharts.createChart($('ht-chart'), { autoSize: true, localization: { locale: 'pl-PL' }, timeScale: { timeVisible: true, secondsVisible: false } })
    series = chart.addSeries(LightweightCharts.CandlestickSeries, { priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } })
    volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false, visible: !!settings.volume })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: .82, bottom: 0 } })
    drawingPanel = { el: $('ht-chart'), chart, series, symbol: 'hl:' + selected, candles: [] }
    drawingPanel.drawings = Drawings.attach(drawingPanel)
    theme()
    orderflow.bindSeries(series)
  }
  function renderList() {
    const q = $('ht-search').value.trim().toUpperCase()
    const list = all.filter(m => (m.coin + ' ' + m.name).toUpperCase().includes(q))
    $('ht-count').textContent = `${list.length} rynków`
    $('ht-list').innerHTML = list.map(m => `<button class="ht-market${m.coin === selected ? ' active' : ''}" data-coin="${esc(m.coin)}"><span><b>${esc(m.name)}</b><small>${esc(m.dex)}</small></span><span class="ht-market-price">${fmt(m.price)}<small class="${m.change >= 0 ? 'positive' : 'negative'}">${m.change == null ? '—' : (m.change >= 0 ? '+' : '') + m.change.toFixed(2) + '%'}</small></span></button>`).join('') || '<p class="ht-empty">Brak rynku</p>'
  }
  function renderQuote() {
    const m = all.find(x => x.coin === selected)
    if (!m) return
    $('ht-symbol').textContent = m.name
    $('ht-dex').textContent = m.dex
    $('ht-price').textContent = fmt(m.price)
    $('ht-change').textContent = m.change == null ? '—' : (m.change >= 0 ? '+' : '') + m.change.toFixed(2) + '%'
    $('ht-change').className = 'ht-change ' + (m.change >= 0 ? 'positive' : 'negative')
    $('ht-volume').textContent = '$' + compact(m.volume)
    $('ht-oi').textContent = compact(m.openInterest)
    $('ht-funding').textContent = (m.funding * 100).toFixed(4) + '%'
    $('ht-periods').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.period === interval))
  }
  async function json(url) { const r = await fetch(url); const value = await r.json(); if (!r.ok) throw new Error(value.error || `HTTP ${r.status}`); return value }
  async function loadMarkets() {
    try {
      const data = await json('/api/hl/markets')
      all = data.markets
      if (!all.some(m => m.coin === selected)) selected = all.find(m => m.coin === 'xyz:XYZ100')?.coin || all[0]?.coin
      orderflow.setMarket(selected, interval)
      renderList(); renderQuote()
      $('ht-message').hidden = true
    } catch (error) { $('ht-message').textContent = error.message; $('ht-message').hidden = false }
  }
  async function loadChart() {
    if (!selected) return
    setupChart()
    const stamp = ++request, key = selected + ':' + interval
    try {
      const { candles } = await json(`/api/hl/candles?coin=${encodeURIComponent(selected)}&interval=${encodeURIComponent(interval)}`)
      if (stamp !== request) return
      const changed = chartKey !== key
      series.setData(candles)
      volumeSeries.setData(candles.map(c => ({ time: c.time, value: Number.isFinite(c.volume) ? c.volume : 0, color: c.close >= c.open ? '#8dcc9c66' : '#dc8e8966' })))
      drawingPanel.candles = candles
      if (drawingPanel.symbol !== 'hl:' + selected) { drawingPanel.symbol = 'hl:' + selected; drawingPanel.drawings.reload() }
      drawingPanel.drawings.redraw()
      chartKey = key
      if (changed) chart.timeScale().fitContent()
      $('ht-message').hidden = true
    } catch (error) { if (stamp === request) { $('ht-message').textContent = error.message; $('ht-message').hidden = false } }
  }
  function bookSide(rows, side) {
    let total = 0
    return rows.map(row => { total += Number(row.sz); return `<div class="ht-book-row ${side}"><span>${fmt(Number(row.px))}</span><span>${fmt(Number(row.sz))}</span><span>${fmt(total)}</span></div>` }).join('')
  }
  async function loadBook() {
    if (!selected) return
    const coin = selected
    try {
      const book = await json('/api/hl/book?coin=' + encodeURIComponent(coin))
      if (selected !== coin) return
      $('ht-asks').innerHTML = bookSide([...book.asks].reverse(), 'ask')
      $('ht-bids').innerHTML = bookSide(book.bids, 'bid')
      const ask = Number(book.asks[0]?.px), bid = Number(book.bids[0]?.px)
      $('ht-spread').textContent = Number.isFinite(ask - bid) ? `SPREAD ${fmt(ask - bid)}` : '—'
      $('ht-book-time').textContent = new Date(book.time).toLocaleTimeString('pl-PL')
    } catch { $('ht-spread').textContent = 'Brak danych arkusza' }
  }
  function select(coin) { if (coin === selected) return; selected = coin; orderflow.setMarket(selected, interval); profileCandles = []; $('ht-profile-rows').replaceChildren(); clearProfileLines(); series?.setData([]); volumeSeries?.setData([]); if (drawingPanel) { drawingPanel.symbol = 'hl:' + coin; drawingPanel.candles = []; drawingPanel.drawings.reload() }; localStorage.setItem('hl-coin', coin); renderList(); renderQuote(); loadChart(); loadBook(); loadProfile() }
  function clearProfileLines() { if (series) profileLines.forEach(line => series.removePriceLine(line)); profileLines = [] }
  function renderProfile() {
    clearProfileLines()
    $('ht-profile-rows').replaceChildren()
    if (!settings.tpo) return
    try {
      const profile = TerminalProfile.build(profileCandles, $('ht-session').value, Number(settings.step))
      if (!profile) { $('ht-profile-info').textContent = 'Brak danych TPO dla tej sesji.'; return }
      $('ht-profile-info').textContent = `POC ${fmt(profile.poc)} · VAH ${fmt(profile.vah)} · VAL ${fmt(profile.val)} · krok ${fmt(profile.step)} · ${profile.blocks}/48 bloków (sesja może być niepełna). TPO z zakresów świec 30m.`
      $('ht-profile-rows').innerHTML = [...profile.rows].reverse().map(row => `<div class="ht-tpo-row${row.poc ? ' poc' : ''}${row.valueArea ? ' va' : ''}"><span>${fmt(row.price)}</span><b>${row.letters || '·'}</b><small>${row.poc ? 'POC' : row.letters.length}</small></div>`).join('')
      if (series) for (const [title, price] of [['TPO POC', profile.poc], ['TPO VAH', profile.vah], ['TPO VAL', profile.val]]) profileLines.push(series.createPriceLine({ price, title, color: title === 'TPO POC' ? '#d6af68' : '#739cac', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }))
    } catch (error) { $('ht-profile-info').textContent = error.message }
  }
  async function loadProfile() {
    const stamp = ++profileRequest
    if (!settings.tpo || !selected) return
    $('ht-profile-info').textContent = 'Ładowanie TPO…'
    try {
      const data = await json('/api/hl/candles?coin=' + encodeURIComponent(selected) + '&interval=30m')
      if (stamp !== profileRequest || !settings.tpo) return
      profileCandles = data.candles
      const dates = [...new Set(profileCandles.map(c => new Date(c.time * 1000).toISOString().slice(0,10)))].sort().reverse()
      const previous = $('ht-session').value
      $('ht-session').innerHTML = dates.map(date => `<option value="${date}">${date}</option>`).join('')
      if (dates.includes(previous)) $('ht-session').value = previous
      renderProfile()
    } catch (error) { if (stamp === profileRequest) { profileCandles = []; clearProfileLines(); $('ht-profile-rows').replaceChildren(); $('ht-profile-info').textContent = 'TPO: ' + error.message } }
  }
  $('ht-volume-toggle').addEventListener('change', e => { settings.volume = e.target.checked; saveSettings(); volumeSeries?.applyOptions({ visible: settings.volume }) })
  $('ht-tpo-toggle').addEventListener('change', e => { settings.tpo = e.target.checked; saveSettings(); $('ht-profile').hidden = !settings.tpo; if (settings.tpo) loadProfile(); else { ++profileRequest; clearProfileLines() } })
  $('ht-step').addEventListener('change', e => { settings.step = Math.max(0, Number(e.target.value) || 0); e.target.value = settings.step; saveSettings(); renderProfile() })
  $('ht-session').addEventListener('change', renderProfile)
  $('ht-fit').addEventListener('click', () => chart?.timeScale().fitContent())
  $('ht-search').addEventListener('input', renderList)
  $('ht-list').addEventListener('click', e => { const coin = e.target.closest('[data-coin]')?.dataset.coin; if (coin) select(coin) })
  $('ht-periods').addEventListener('click', e => { const p = e.target.closest('[data-period]')?.dataset.period; if (p && p !== interval) { interval = p; localStorage.setItem('hl-interval', p); orderflow.setMarket(selected, interval); renderQuote(); loadChart() } })
  window.addEventListener('themechange', theme)
  window.addEventListener('resize', () => chart?.timeScale().fitContent())
  setInterval(() => { if (!root.hidden && !document.hidden && initialized) { loadMarkets(); loadBook() } }, 15000)
  setInterval(() => { if (!root.hidden && !document.hidden && initialized) { loadChart(); loadProfile() } }, 30000)
  return { show() { if (!initialized) { initialized = true; loadMarkets().then(() => { loadChart(); loadBook(); loadProfile() }) } else { loadMarkets(); loadBook(); loadProfile(); requestAnimationFrame(() => chart?.timeScale().fitContent()) } } }
})()
