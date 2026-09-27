window.HyperTerminal = (() => {
  const root = document.getElementById('hyper-terminal')
  root.innerHTML = `<div class="ht">
    <aside class="ht-markets"><header><strong>HYPERLIQUID</strong><span id="ht-count"></span></header><input id="ht-search" type="search" placeholder="Szukaj: XYZ100, SP500, BTC…" aria-label="Szukaj rynku"><div class="ht-list" id="ht-list"></div></aside>
    <div class="ht-main"><header class="ht-head"><div><strong id="ht-symbol">XYZ100</strong><span id="ht-dex">xyz</span></div><div class="ht-price" id="ht-price">—</div><div class="ht-change" id="ht-change">—</div><div class="ht-spacer"></div><span class="ht-source">Dane: Hyperliquid</span></header>
      <div class="ht-stats"><div>WOLUMEN 24H <b id="ht-volume">—</b></div><div>OPEN INTEREST <b id="ht-oi">—</b></div><div>FUNDING / H <b id="ht-funding">—</b></div></div>
      <div class="ht-periods" id="ht-periods"></div><div class="ht-chart" id="ht-chart"></div><div class="ht-message" id="ht-message" hidden></div>
    </div><aside class="ht-book"><header><strong>ARKUSZ ZLECEŃ</strong><span id="ht-book-time"></span></header><div class="ht-book-title"><span>CENA</span><span>WIELKOŚĆ</span><span>SUMA</span></div><div id="ht-asks"></div><div class="ht-spread" id="ht-spread">—</div><div id="ht-bids"></div></aside>
  </div>`
  const $ = id => document.getElementById(id)
  const fmt = n => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 }) : '—'
  const compact = n => Number.isFinite(n) ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : '—'
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
  let all = [], selected = localStorage.getItem('hl-coin') || 'xyz:XYZ100', interval = localStorage.getItem('hl-interval') || '1h'
  let chart, series, request = 0, initialized = false
  const periods = ['5m', '15m', '1h', '4h', '1d', '1w', '1M']
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
    theme()
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
      renderList(); renderQuote()
      $('ht-message').hidden = true
    } catch (error) { $('ht-message').textContent = error.message; $('ht-message').hidden = false }
  }
  async function loadChart() {
    if (!selected) return
    setupChart()
    const stamp = ++request
    try {
      const { candles } = await json(`/api/hl/candles?coin=${encodeURIComponent(selected)}&interval=${encodeURIComponent(interval)}`)
      if (stamp !== request) return
      series.setData(candles)
      chart.timeScale().fitContent()
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
  function select(coin) { selected = coin; localStorage.setItem('hl-coin', coin); renderList(); renderQuote(); loadChart(); loadBook() }
  $('ht-search').addEventListener('input', renderList)
  $('ht-list').addEventListener('click', e => { const coin = e.target.closest('[data-coin]')?.dataset.coin; if (coin) select(coin) })
  $('ht-periods').addEventListener('click', e => { const p = e.target.closest('[data-period]')?.dataset.period; if (p && p !== interval) { interval = p; localStorage.setItem('hl-interval', p); renderQuote(); loadChart() } })
  window.addEventListener('themechange', theme)
  window.addEventListener('resize', () => chart?.timeScale().fitContent())
  setInterval(() => { if (!root.hidden && !document.hidden && initialized) { loadMarkets(); loadBook() } }, 15000)
  setInterval(() => { if (!root.hidden && !document.hidden && initialized) loadChart() }, 30000)
  return { show() { if (!initialized) { initialized = true; loadMarkets().then(() => { loadChart(); loadBook() }) } else { loadMarkets(); loadBook(); requestAnimationFrame(() => chart?.timeScale().fitContent()) } } }
})()
