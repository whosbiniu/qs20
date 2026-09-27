window.HyperTerminal = (() => {
  const root = document.getElementById('hyper-terminal')
  root.innerHTML = `<div class="ht">
    <aside class="ht-markets"><header><strong>ULUBIONE</strong><span id="ht-count"></span></header><input id="ht-search" type="search" placeholder="Ticker + Enter, aby dodać" aria-label="Wpisz ticker, aby dodać do ulubionych" autocomplete="off" spellcheck="false"><div class="ht-list" id="ht-list"></div></aside>
    <div class="ht-main"><header class="ht-head"><div><button type="button" class="ht-symbol-btn" id="ht-symbol-btn" title="Zmień ticker" aria-haspopup="listbox" aria-expanded="false" aria-controls="ht-jump"><strong id="ht-symbol">XYZ100</strong><span class="ht-caret" aria-hidden="true">▾</span></button><span id="ht-dex">xyz</span></div><div class="ht-price" id="ht-price">—</div><div class="ht-change" id="ht-change">—</div><div class="ht-spacer"></div><span class="ht-source">Dane: Hyperliquid</span></header>
      <div class="ht-jump" id="ht-jump" hidden><input id="ht-jump-input" type="search" placeholder="Szukaj tickera…" aria-label="Szukaj innego tickera" aria-controls="ht-jump-list" autocomplete="off" spellcheck="false"><div class="ht-jump-list" id="ht-jump-list" role="listbox" aria-label="Wyniki wyszukiwania tickera"></div></div>
      <div class="ht-stats"><div>WOLUMEN 24H <b id="ht-volume">—</b></div><div>OPEN INTEREST <b id="ht-oi">—</b></div><div>FUNDING / H <b id="ht-funding">—</b></div></div>
      <div class="ht-periods" id="ht-periods"></div>
      <div class="ht-chart-tools"><button type="button" id="ht-indicators-open" aria-expanded="false" aria-controls="ht-indicator-panel">ƒx Indykatory</button><button id="ht-fit" type="button">Dopasuj wykres</button></div>
      <aside class="ht-indicator-panel" id="ht-indicator-panel" hidden aria-label="Biblioteka indykatorów"><div class="ht-library-head"><strong>Indykatory</strong><button type="button" id="ht-indicators-close" aria-label="Zamknij panel indykatorów">×</button></div><input type="search" id="ht-indicator-search" placeholder="Szukaj indykatora…" aria-label="Szukaj indykatora"><div id="ht-indicator-list"></div><h4>Ustawienia aktywnych indykatorów</h4>
      <div class="st-settings" id="ht-studies-settings" hidden></div>
      <div class="ht-tpo-controls" id="ht-profile" hidden><label>TPO <select id="ht-tpo-mode"><option value="daily">Dzienne</option><option value="session">Sesyjne</option><option value="weekly">Tygodniowe</option><option value="monthly">Miesięczne</option></select></label><span id="ht-tpo-hours" hidden><label>Od <input id="ht-tpo-from" type="time" step="1800" value="08:00"></label><label>Do <input id="ht-tpo-to" type="time" step="1800" value="16:30"></label> UTC</span><label>Krok ceny <input id="ht-step" type="number" min="0" step="any" value="0"></label><span id="ht-profile-info" role="status"></span></div><section id="ht-orderflow" aria-label="Ustawienia order flow"></section></aside><div class="ht-chart" id="ht-chart"><div class="ht-active-indicators" id="ht-active-indicators" aria-label="Aktywne indykatory"></div></div><div class="ht-message" id="ht-message" hidden></div>
    </div><aside class="ht-book"><header><strong>ARKUSZ ZLECEŃ</strong><span id="ht-book-time"></span></header><div class="ht-book-title"><span>CENA</span><span>WIELKOŚĆ</span><span>SUMA</span></div><div id="ht-asks"></div><div class="ht-spread" id="ht-spread">—</div><div id="ht-bids"></div></aside>
  </div>`
  const $ = id => document.getElementById(id)
  let workspace
  const fmt = n => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 }) : '—'
  const compact = n => Number.isFinite(n) ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : '—'
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
  let all = [], selected = localStorage.getItem('hl-coin') || 'xyz:XYZ100', interval = localStorage.getItem('hl-interval') || '1h'
  let chart, series, volumeSeries, drawingPanel, request = 0, profileRequest = 0, initialized = false, chartKey = '', profileCandles = [], profileOverlay
  let settings = { volume: false, tpo: false, step: 0, mode: 'daily', from: '08:00', to: '16:30' }
  try { settings = { ...settings, ...JSON.parse(localStorage.getItem('hl-indicators') || '{}') } } catch {}
  const orderflow = TerminalOrderflow.attach($('ht-orderflow'))
  // Extra studies (VWAP, profiles, levels, order book, OI, funding...) are added to the indicator catalog.
  TerminalIndicators.catalog.push(...TerminalStudies.catalog)
  const studies = TerminalStudies.attach({ settingsHost: $('ht-studies-settings'), fetchJson: url => json(url), orderflow })
  const saveSettings = () => Store.set('hl-indicators', JSON.stringify(settings))
  $('ht-step').value = settings.step
  $('ht-profile').hidden = !settings.tpo
  $('ht-tpo-mode').value = settings.mode
  $('ht-tpo-from').value = settings.from
  $('ht-tpo-to').value = settings.to
  $('ht-tpo-hours').hidden = settings.mode !== 'session'
  const periods = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M']
  if (!periods.includes(interval)) interval = '1h'
  $('ht-periods').innerHTML = periods.map(p => `<button data-period="${p}">${p}</button>`).join('')

  function theme() {
    if (!chart) return
    const css = getComputedStyle(root)
    const color = name => css.getPropertyValue(name).trim()
    chart.applyOptions({ layout: { background: { color: color('--bg') }, textColor: color('--dim'), fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderColor: color('--line') }, timeScale: { borderColor: color('--line') },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: color('--dim') }, horzLine: { color: color('--dim') } } })
    const up = color('--tw-up') || color('--ink'), down = color('--tw-down') || color('--bg')
    series.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down })
  }
  function setupChart() {
    if (chart) return
    chart = LightweightCharts.createChart($('ht-chart'), { autoSize: true, localization: { locale: 'pl-PL' }, timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 10 } })
    series = chart.addSeries(LightweightCharts.CandlestickSeries, { priceFormat: { type: 'price', precision: 4, minMove: 0.0001 } })
    volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', lastValueVisible: false, priceLineVisible: false, visible: !!settings.volume })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: .9, bottom: 0 } })
    drawingPanel = { el: $('ht-chart'), chart, series, symbol: 'hl:' + selected, candles: [], volume: true }
    drawingPanel.drawings = Drawings.attach(drawingPanel)
    profileOverlay = TerminalProfile.attach(drawingPanel)
    theme()
    orderflow.bindPanel(drawingPanel)
    studies.bindPanel(drawingPanel)
    studies.setMarket(selected, interval)
  }
  // Favourites replace the full market list: type a ticker to find it, star it (or press Enter) to keep it.
  let favorites = ['xyz:XYZ100', 'xyz:SP500', 'BTC', 'ETH']
  try { const stored = JSON.parse(localStorage.getItem('hl-favorites') || 'null'); if (Array.isArray(stored)) favorites = stored.filter(c => typeof c === 'string') } catch {}
  const saveFavorites = () => Store.set('hl-favorites', JSON.stringify(favorites))
  const marketRow = (m, favorite) => `<div class="ht-market-row"><button class="ht-market${m.coin === selected ? ' active' : ''}" data-coin="${esc(m.coin)}"><span><b>${esc(m.name)}</b><small>${esc(m.dex)}</small></span><span class="ht-market-price">${fmt(m.price)}<small class="${m.change >= 0 ? 'positive' : 'negative'}">${m.change == null ? '—' : (m.change >= 0 ? '+' : '') + m.change.toFixed(2) + '%'}</small></span></button><button class="ht-fav${favorite ? ' on' : ''}" data-fav="${esc(m.coin)}" aria-pressed="${favorite}" aria-label="${favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}: ${esc(m.name)}" title="${favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">${favorite ? '★' : '☆'}</button></div>`
  // Best match first: the exact ticker, then shorter names.
  const findMarkets = q => all.filter(m => (m.coin + ' ' + m.name).toUpperCase().includes(q))
    .sort((a, b) => Number(b.name.toUpperCase() === q) - Number(a.name.toUpperCase() === q) || a.name.length - b.name.length)
  function toggleFavorite(coin) {
    favorites = favorites.includes(coin) ? favorites.filter(c => c !== coin) : [...favorites, coin]
    saveFavorites(); renderList()
  }
  function renderList() {
    const q = $('ht-search').value.trim().toUpperCase()
    if (q) {
      const found = findMarkets(q)
      $('ht-count').textContent = `${found.length} wyników`
      $('ht-list').innerHTML = found.slice(0, 40).map(m => marketRow(m, favorites.includes(m.coin))).join('') || '<p class="ht-empty">Nie znaleziono takiego tickera.</p>'
      return
    }
    const saved = favorites.map(c => all.find(m => m.coin === c)).filter(Boolean)
    // The market on the chart stays visible even when it is not a favourite yet.
    const open = selected && !favorites.includes(selected) ? all.find(m => m.coin === selected) : null
    $('ht-count').textContent = String(saved.length)
    $('ht-list').innerHTML = (open ? marketRow(open, false) : '') + saved.map(m => marketRow(m, true)).join('') || '<p class="ht-empty">Brak ulubionych. Wpisz ticker powyżej i naciśnij Enter.</p>'
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
    workspace?.marketChanged()
  }
  async function json(url, options) { const r = await fetch(url, options); const value = await r.json(); if (!r.ok) throw new Error(value.error || `HTTP ${r.status}`); return value }
  // Last good markets and candles are kept in the browser, so the page paints at once on the next visit.
  const stash = Stash   // storage.js: size-limited cache of these copies
  async function loadMarkets() {
    if (!all.length) { const saved = stash.get('hl-markets'); if (saved?.length) { all = saved; renderList(); renderQuote() } }
    try {
      const data = await json('/api/hl/markets')
      all = data.markets
      stash.put('hl-markets', all)
      studies.observeMarkets(all)
      if (!all.some(m => m.coin === selected)) selected = all.find(m => m.coin === 'xyz:XYZ100')?.coin || all[0]?.coin
      orderflow.setMarket(selected, interval); studies.setMarket(selected, interval)
      renderList(); renderQuote()
      $('ht-message').hidden = true
    } catch (error) { $('ht-message').textContent = error.message; $('ht-message').hidden = false }
  }
  async function loadChart() {
    if (!selected) return
    setupChart()
    const stamp = ++request, key = selected + ':' + interval
    const saved = chartKey !== key ? stash.get('hl-candles') : null
    if (saved?.key === key && saved.candles?.length) { paintChart(saved.candles, key); workspace?.dataUpdated(true) }
    try {
      const { candles } = await json(`/api/hl/candles?coin=${encodeURIComponent(selected)}&interval=${encodeURIComponent(interval)}`)
      if (stamp !== request) return
      stash.put('hl-candles', { key, candles })
      paintChart(candles, key)
      workspace?.dataUpdated()
      $('ht-message').hidden = true
    } catch (error) { if (stamp === request) { $('ht-message').textContent = error.message; $('ht-message').hidden = false } }
  }
  function paintChart(candles, key) {
    const changed = chartKey !== key
    const last = candles.at(-1)?.close, precision = last > 100 ? 2 : last > 1 ? 4 : 8   // 30655.00, not 30655.0000
    series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
    series.setData(candles)
    volumeSeries.setData(candles.map(c => ({ time: c.time, value: Number.isFinite(c.volume) ? c.volume : 0, color: c.close >= c.open ? '#8dcc9c66' : '#dc8e8966' })))
    drawingPanel.candles = candles
    if (drawingPanel.symbol !== 'hl:' + selected) { drawingPanel.symbol = 'hl:' + selected; drawingPanel.drawings.reload() }
    drawingPanel.drawings.redraw()
    profileOverlay.redraw()
    orderflow.refresh()
    studies.refresh()
    chartKey = key
    if (changed) fitChart()
  }
  // Fit all candles but keep some free space to the right of the last one, so the price has room.
  function fitChart() {
    const scale = chart.timeScale(), count = drawingPanel?.candles.length || 0
    if (count > 1 && scale.setVisibleLogicalRange) scale.setVisibleLogicalRange({ from: -0.5, to: count - 1 + Math.max(8, Math.round(count * 0.06)) })
    else scale.fitContent()
  }
  function bookSide(rows, side) {
    let total = 0
    const max = Math.max(1e-9, ...rows.map(row => Number(row.sz) || 0))
    return rows.map(row => { total += Number(row.sz); const depth = Math.max(0, Math.min(100, (Number(row.sz) || 0) / max * 100)); return `<div class="ht-book-row ${side}" style="--depth:${depth.toFixed(1)}%"><span>${fmt(Number(row.px))}</span><span>${fmt(Number(row.sz))}</span><span>${fmt(total)}</span></div>` }).join('')
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
  function select(coin) { if (coin === selected) return; selected = coin; orderflow.setMarket(selected, interval); studies.setMarket(selected, interval); profileCandles = []; clearProfileLines(); series?.setData([]); volumeSeries?.setData([]); if (drawingPanel) { drawingPanel.symbol = 'hl:' + coin; drawingPanel.candles = []; drawingPanel.drawings.reload() }; Store.set('hl-coin', coin); renderList(); renderQuote(); loadChart(); loadBook(); loadProfile() }
  function clearProfileLines() { profileOverlay?.set([]) }
  function renderProfile() {
    clearProfileLines()
    if (!settings.tpo) return
    try {
      const values = TerminalProfile.profiles(profileCandles, settings)
      profileOverlay?.set(values)
      $('ht-profile-info').textContent = values.length ? `${values.length} profili · bloki 30m · VA 70% · UTC · skrajne profile mogą być niepełne` : 'Brak danych TPO dla tego zakresu.'
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
      renderProfile()
    } catch (error) { if (stamp === profileRequest) { profileCandles = []; clearProfileLines(); $('ht-profile-info').textContent = 'TPO: ' + error.message } }
  }
  function indicatorEnabled(id) { return id === 'volume' || id === 'tpo' ? !!settings[id] : ['footprint', 'delta', 'profile'].includes(id) ? orderflow.isEnabled(id) : studies.isEnabled(id) }
  function setIndicator(id, value) {
    if (id === 'volume') { settings.volume = value; saveSettings(); volumeSeries?.applyOptions({ visible: value }) }
    else if (id === 'tpo') { settings.tpo = value; saveSettings(); $('ht-profile').hidden = !value; if (value) loadProfile(); else { ++profileRequest; clearProfileLines() } }
    else if (['footprint', 'delta', 'profile'].includes(id)) orderflow.setEnabled(id, value)
    else studies.setEnabled(id, value)
    $('ht-orderflow').hidden = !['footprint', 'delta', 'profile'].some(key => orderflow.isEnabled(key))
  }
  $('ht-orderflow').hidden = !['footprint', 'delta', 'profile'].some(key => orderflow.isEnabled(key))
  TerminalIndicators.attach({ button: $('ht-indicators-open'), panel: $('ht-indicator-panel'), list: $('ht-indicator-list'), search: $('ht-indicator-search'), active: $('ht-active-indicators'), close: $('ht-indicators-close'), get: indicatorEnabled, set: setIndicator })
  $('ht-step').addEventListener('change', e => { settings.step = Math.max(0, Number(e.target.value) || 0); e.target.value = settings.step; saveSettings(); renderProfile() })
  for (const [id, key] of [['ht-tpo-mode', 'mode'], ['ht-tpo-from', 'from'], ['ht-tpo-to', 'to']]) $(id).addEventListener('change', e => {
    if (key !== 'mode' && (!e.target.value || Number(e.target.value.slice(3)) % 30 !== 0)) { e.target.value = settings[key]; return }
    settings[key] = e.target.value; $('ht-tpo-hours').hidden = settings.mode !== 'session'; saveSettings(); renderProfile()
  })
  $('ht-fit').addEventListener('click', () => chart && fitChart())
  $('ht-search').addEventListener('input', renderList)
  $('ht-search').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return
    // Enter adds the best match to the favourites and opens it.
    const q = $('ht-search').value.trim().toUpperCase(), match = q ? findMarkets(q)[0] : null
    if (!match) { if (q) $('ht-list').innerHTML = '<p class="ht-empty">Nie znaleziono takiego tickera.</p>'; return }
    if (!favorites.includes(match.coin)) { favorites = [...favorites, match.coin]; saveFavorites() }
    $('ht-search').value = ''
    select(match.coin); renderList()
  })
  $('ht-list').addEventListener('click', e => {
    const favorite = e.target.closest('[data-fav]')?.dataset.fav
    if (favorite) { toggleFavorite(favorite); return }
    const coin = e.target.closest('[data-coin]')?.dataset.coin
    if (coin) select(coin)
  })
  // Clicking the ticker name opens a search: switch the chart to another market without touching the favourites.
  let jumpResults = [], jumpIndex = 0
  function renderJump() {
    const q = $('ht-jump-input').value.trim().toUpperCase()
    jumpResults = q ? findMarkets(q).slice(0, 12) : favorites.map(c => all.find(m => m.coin === c)).filter(Boolean)
    jumpIndex = Math.min(jumpIndex, Math.max(0, jumpResults.length - 1))
    $('ht-jump-list').innerHTML = jumpResults.map((m, i) => `<button type="button" class="ht-jump-row${i === jumpIndex ? ' active' : ''}${m.coin === selected ? ' current' : ''}" role="option" aria-selected="${i === jumpIndex}" data-jump="${esc(m.coin)}"><span><b>${esc(m.name)}</b><small>${esc(m.dex)}</small></span><span class="ht-market-price">${fmt(m.price)}<small class="${m.change >= 0 ? 'positive' : 'negative'}">${m.change == null ? '—' : (m.change >= 0 ? '+' : '') + m.change.toFixed(2) + '%'}</small></span></button>`).join('')
      || `<p class="ht-empty">${q ? 'Nie znaleziono takiego tickera.' : 'Wpisz ticker, np. BTC albo SP500.'}</p>`
  }
  function openJump() {
    $('ht-jump').hidden = false; $('ht-symbol-btn').setAttribute('aria-expanded', 'true')
    $('ht-jump-input').value = ''; jumpIndex = 0; renderJump(); $('ht-jump-input').focus()
  }
  function closeJump(refocus) {
    if ($('ht-jump').hidden) return
    $('ht-jump').hidden = true; $('ht-symbol-btn').setAttribute('aria-expanded', 'false')
    if (refocus) $('ht-symbol-btn').focus()
  }
  // pointerdown keeps focus in the input, so focusout below only fires for clicks outside the search.
  $('ht-symbol-btn').addEventListener('pointerdown', e => e.preventDefault())
  $('ht-symbol-btn').addEventListener('click', () => $('ht-jump').hidden ? openJump() : closeJump(true))
  $('ht-jump').addEventListener('pointerdown', e => { if (e.target.id !== 'ht-jump-input') e.preventDefault() })
  $('ht-jump').addEventListener('focusout', e => { if (!$('ht-jump').contains(e.relatedTarget)) closeJump(false) })
  $('ht-jump-input').addEventListener('input', () => { jumpIndex = 0; renderJump() })
  $('ht-jump-input').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeJump(true) }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (jumpResults.length) { jumpIndex = (jumpIndex + (e.key === 'ArrowDown' ? 1 : -1) + jumpResults.length) % jumpResults.length; renderJump() }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const match = jumpResults[jumpIndex]
      if (match) { closeJump(true); select(match.coin) }
    }
  })
  $('ht-jump-list').addEventListener('click', e => {
    const coin = e.target.closest('[data-jump]')?.dataset.jump
    if (coin) { closeJump(true); select(coin) }
  })
  $('ht-periods').addEventListener('click', e => { const p = e.target.closest('[data-period]')?.dataset.period; if (p && p !== interval) { interval = p; Store.set('hl-interval', p); orderflow.setMarket(selected, interval); studies.setMarket(selected, interval); renderQuote(); loadChart() } })
  window.addEventListener('themechange', theme)
  // autoSize resizes the canvas without replacing the user's zoom or scroll position.
  setInterval(() => { if (!root.hidden && !document.hidden && initialized) { loadMarkets(); loadBook() } }, 15000)
  setInterval(() => { if (!root.hidden && !document.hidden && initialized) { loadChart(); loadProfile() } }, 30000)
  // Revisiting the page within 15 s reuses the data (the timers keep it fresh while it is on screen).
  let shownAt = Date.now()
  workspace = window.TerminalWorkspace?.attach(root, { theme, market: () => ({ coin: selected, interval, markets: all }), fetchJson: json })
  return { show() { workspace?.show(); if (!initialized) { initialized = true; loadMarkets().then(() => { loadChart(); loadBook(); loadProfile() }) } else if (Date.now() - shownAt > 15000) { shownAt = Date.now(); loadMarkets(); loadBook(); loadProfile() } } }
})()
