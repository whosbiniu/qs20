window.HyperTerminal = (() => {
  const root = document.getElementById('hyper-terminal')
  root.innerHTML = `<div class="ht">
    <aside class="ht-markets"><header><strong>ULUBIONE</strong><span id="ht-count"></span></header><input id="ht-search" type="search" placeholder="Ticker + Enter, aby dodać" aria-label="Wpisz ticker, aby dodać do ulubionych" autocomplete="off" spellcheck="false"><div class="ht-list" id="ht-list"></div></aside>
    <div class="ht-main"><header class="ht-head"><div><button type="button" class="ht-symbol-btn" id="ht-symbol-btn" title="Zmień ticker" aria-haspopup="listbox" aria-expanded="false" aria-controls="ht-jump"><strong id="ht-symbol">XYZ100</strong><span class="ht-caret" aria-hidden="true">▾</span></button><span id="ht-dex">xyz</span></div><div class="ht-price" id="ht-price">—</div><div class="ht-change" id="ht-change">—</div><div class="ht-spacer"></div><span class="ht-source">Dane: Hyperliquid</span></header>
      <div class="ht-jump" id="ht-jump" hidden><input id="ht-jump-input" type="search" placeholder="Szukaj tickera…" aria-label="Szukaj innego tickera" aria-controls="ht-jump-list" autocomplete="off" spellcheck="false"><div class="ht-jump-list" id="ht-jump-list" role="listbox" aria-label="Wyniki wyszukiwania tickera"></div></div>
      <div class="ht-stats"><div>WOLUMEN 24H <b id="ht-volume">—</b></div><div>OPEN INTEREST <b id="ht-oi">—</b></div><div>FUNDING / H <b id="ht-funding">—</b></div></div>
      <div class="ht-periods" id="ht-periods"></div>
      <div class="ht-chart-tools"><button type="button" id="ht-indicators-open" aria-expanded="false" aria-controls="ht-indicator-panel">ƒx Indykatory</button><button id="ht-fit" type="button">Dopasuj wykres</button></div>
      <aside class="ht-indicator-panel" id="ht-indicator-panel" hidden aria-label="Biblioteka indykatorów"><div class="ht-library-head"><strong>Indykatory</strong><button type="button" id="ht-indicators-close" aria-label="Zamknij panel indykatorów">×</button></div><input type="search" id="ht-indicator-search" placeholder="Szukaj indykatora…" aria-label="Szukaj indykatora"><div id="ht-indicator-list"></div></aside><div class="ht-ind-pop" id="ht-ind-pop" hidden role="dialog" aria-labelledby="ht-ind-pop-title"><div class="ht-ind-pop-head"><strong id="ht-ind-pop-title"></strong><button type="button" id="ht-ind-pop-remove" title="Usuń indykator z wykresu">Usuń</button><button type="button" id="ht-ind-pop-close" data-pop-close aria-label="Zamknij ustawienia">×</button></div><div class="st-settings" id="ht-studies-settings" hidden></div><div class="ht-tpo-controls" id="ht-profile" hidden><label>TPO <select id="ht-tpo-mode"><option value="daily">Dzienne</option><option value="session">Sesyjne</option><option value="weekly">Tygodniowe</option><option value="monthly">Miesięczne</option></select></label><span id="ht-tpo-hours" hidden><label>Od <input id="ht-tpo-from" type="time" step="1800" value="08:00"></label><label>Do <input id="ht-tpo-to" type="time" step="1800" value="16:30"></label> UTC</span><label>Krok ceny <input id="ht-step" type="number" min="0" step="any" value="0"></label><span id="ht-profile-info" role="status"></span></div><section id="ht-orderflow" aria-label="Ustawienia order flow" hidden></section><p class="ht-ind-pop-empty" id="ht-ind-pop-empty">Ten indykator nie ma ustawień.</p></div><div class="ht-chart" id="ht-chart"><div class="ht-active-indicators" id="ht-active-indicators" aria-label="Aktywne indykatory"></div></div><div class="ht-message" id="ht-message" hidden></div>
    </div><aside class="ht-book"><header><div class="ht-book-tabs" id="ht-book-tabs" role="tablist" aria-label="Arkusz i taśma"><button type="button" role="tab" data-book-tab="dom" aria-selected="true" aria-controls="ht-dom">ARKUSZ</button><button type="button" role="tab" data-book-tab="tape" aria-selected="false" aria-controls="ht-tape">TAŚMA</button></div><span id="ht-book-time"></span></header><div id="ht-dom" role="tabpanel"><div class="ht-book-title ht-dom-cols"><span>CENA</span><span>WIELKOŚĆ</span><span>SUMA</span><span title="Wolumen transakcji na tej cenie od otwarcia rynku w terminalu">HANDEL</span></div><div id="ht-asks"></div><div class="ht-spread" id="ht-spread">—</div><div id="ht-bids"></div><label class="ht-book-filter">Wyróżnij zlecenia od <input id="ht-dom-big" type="number" min="0" step="any" placeholder="auto"></label></div><div id="ht-tape" role="tabpanel" hidden><div class="ht-book-filter"><label>Min. <input id="ht-tape-min" type="number" min="0" step="any" placeholder="0"></label><label><input id="ht-tape-merge" type="checkbox"> łącz zlecenia</label></div><div class="ht-book-title"><span>CZAS</span><span>CENA</span><span>WIELKOŚĆ</span></div><div id="ht-tape-rows"><p class="ht-empty">Czekam na transakcje…</p></div></div></aside>
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
    followLive()
  }
  // Fit all candles but keep some free space to the right of the last one, so the price has room.
  function fitChart() {
    const scale = chart.timeScale(), count = drawingPanel?.candles.length || 0
    if (count > 1 && scale.setVisibleLogicalRange) scale.setVisibleLogicalRange({ from: -0.5, to: count - 1 + Math.max(8, Math.round(count * 0.06)) })
    else scale.fitContent()
  }
  // DOM and tape. Traded volume per price and the tape come from the live trade stream of the open market.
  let dom = { big: 0, tapeMin: 0, merge: true, tab: 'dom' }
  try { dom = { ...dom, ...JSON.parse(localStorage.getItem('hl-dom') || '{}') } } catch {}
  const saveDom = () => Store.set('hl-dom', JSON.stringify(dom))
  let tape = [], traded = new Map(), bigLimit = Infinity, tapeFrame = 0
  // Four significant digits keep the narrow DOM and tape columns readable (0.0932, 16.52, 1.2K).
  const short = n => !Number.isFinite(n) ? '—' : n >= 10000 ? compact(n) : n.toLocaleString('en-US', { maximumSignificantDigits: 4 })
  function bookSide(rows, side) {
    let total = 0
    const max = Math.max(1e-9, ...rows.map(row => Number(row.sz) || 0))
    return rows.map(row => {
      const size = Number(row.sz) || 0, price = Number(row.px), done = traded.get(price)
      total += size
      const depth = Math.max(0, Math.min(100, size / max * 100))
      return `<div class="ht-book-row ht-dom-cols ${side}${size >= bigLimit ? ' big' : ''}" style="--depth:${depth.toFixed(1)}%"><span>${fmt(price)}</span><span>${short(size)}</span><span>${short(total)}</span><span class="traded">${done ? short(done) : ''}</span></div>`
    }).join('')
  }
  // Large resting orders: the chosen size, or automatically 3× the median level of the book on screen.
  function setBigLimit(levels) {
    if (dom.big > 0) { bigLimit = dom.big; return }
    const sizes = levels.map(l => Number(l.sz) || 0).sort((a, b) => a - b)
    bigLimit = sizes.length ? 3 * sizes[Math.floor(sizes.length / 2)] : Infinity
  }
  function onTrades(coin, list) {
    if (coin !== selected || !Array.isArray(list)) return
    for (const t of list) {
      const price = Number(t.px), size = Number(t.sz), time = Number(t.time)
      if (!Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(time)) continue
      tape.push({ time, price, size, buy: t.side === 'B' })
      traded.set(price, (traded.get(price) || 0) + size)
    }
    if (tape.length > 3000) tape = tape.slice(-2000)
    if (!$('ht-tape').hidden && !tapeFrame) tapeFrame = requestAnimationFrame(paintTape)
  }
  function paintTape() {
    tapeFrame = 0
    // Fills of one aggressive order share the millisecond and the side.
    const rows = []
    for (let i = tape.length - 1; i >= 0 && rows.length < 150; i--) {
      const t = tape[i], last = rows.at(-1)
      if (dom.merge && last && last.time === t.time && last.buy === t.buy) { last.notional += t.price * t.size; last.size += t.size; last.count++; continue }
      rows.push({ ...t, notional: t.price * t.size, count: 1 })
    }
    const shown = rows.filter(r => r.size >= dom.tapeMin)
    $('ht-tape-rows').innerHTML = shown.length ? shown.map(r => `<div class="ht-book-row ${r.buy ? 'bid' : 'ask'}${r.size >= bigLimit ? ' big' : ''}"><span>${new Date(r.time).toLocaleTimeString('pl-PL')}</span><span>${fmt(r.notional / r.size)}</span><span>${r.count > 1 ? `<small>×${r.count} </small>` : ''}${short(r.size)}</span></div>`).join('')
      : `<p class="ht-empty">${tape.length ? 'Brak transakcji powyżej filtra.' : 'Czekam na transakcje…'}</p>`
  }
  function showBookTab(tab) {
    dom.tab = tab === 'tape' ? 'tape' : 'dom'
    $('ht-dom').hidden = dom.tab !== 'dom'; $('ht-tape').hidden = dom.tab !== 'tape'
    root.querySelectorAll?.('[data-book-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.bookTab === dom.tab)))
    if (dom.tab === 'tape') paintTape()
  }
  async function loadBook() {
    if (!selected) return
    const coin = selected
    try {
      const book = await json('/api/hl/book?coin=' + encodeURIComponent(coin))
      if (selected !== coin) return
      setBigLimit([...book.asks, ...book.bids])
      $('ht-asks').innerHTML = bookSide([...book.asks].reverse(), 'ask')
      $('ht-bids').innerHTML = bookSide(book.bids, 'bid')
      const ask = Number(book.asks[0]?.px), bid = Number(book.bids[0]?.px)
      $('ht-spread').textContent = Number.isFinite(ask - bid) ? `SPREAD ${fmt(ask - bid)}` : '—'
      $('ht-book-time').textContent = new Date(book.time).toLocaleTimeString('pl-PL')
    } catch { $('ht-spread').textContent = 'Brak danych arkusza' }
  }
  function select(coin) { if (coin === selected) return; selected = coin; tape = []; traded = new Map(); orderflow.setMarket(selected, interval); studies.setMarket(selected, interval); profileCandles = []; clearProfileLines(); series?.setData([]); volumeSeries?.setData([]); if (drawingPanel) { drawingPanel.symbol = 'hl:' + coin; drawingPanel.candles = []; drawingPanel.drawings.reload() }; Store.set('hl-coin', coin); renderList(); renderQuote(); loadChart(); loadBook(); loadProfile() }
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
  function indicatorEnabled(id) { return id === 'volume' || id === 'tpo' ? !!settings[id] : ['footprint', 'delta', 'profile', 'tradebubbles'].includes(id) ? orderflow.isEnabled(id) : studies.isEnabled(id) }
  function setIndicator(id, value) {
    if (id === 'volume') { settings.volume = value; saveSettings(); volumeSeries?.applyOptions({ visible: value }) }
    else if (id === 'tpo') { settings.tpo = value; saveSettings(); if (value) loadProfile(); else { ++profileRequest; clearProfileLines() } }
    else if (['footprint', 'delta', 'profile', 'tradebubbles'].includes(id)) orderflow.setEnabled(id, value)
    else studies.setEnabled(id, value)
  }
  // One indicator's settings at a time, in the popover next to its chip on the chart.
  const ORDERFLOW = ['footprint', 'delta', 'profile', 'tradebubbles']
  function showSettings(id) {
    const study = studies.showSettings(id)
    orderflow.showSettings?.(id)
    $('ht-profile').hidden = id !== 'tpo'
    $('ht-orderflow').hidden = !ORDERFLOW.includes(id)
    return study || id === 'tpo' || ORDERFLOW.includes(id)
  }
  TerminalIndicators.attach({ button: $('ht-indicators-open'), panel: $('ht-indicator-panel'), list: $('ht-indicator-list'), search: $('ht-indicator-search'), active: $('ht-active-indicators'), close: $('ht-indicators-close'), get: indicatorEnabled, set: setIndicator,
    pop: { el: $('ht-ind-pop'), title: $('ht-ind-pop-title'), empty: $('ht-ind-pop-empty'), remove: $('ht-ind-pop-remove'), close: $('ht-ind-pop-close') }, showSettings })
  $('ht-step').addEventListener('change', e => { settings.step = Math.max(0, Number(e.target.value) || 0); e.target.value = settings.step; saveSettings(); renderProfile() })
  for (const [id, key] of [['ht-tpo-mode', 'mode'], ['ht-tpo-from', 'from'], ['ht-tpo-to', 'to']]) $(id).addEventListener('change', e => {
    if (key !== 'mode' && (!e.target.value || Number(e.target.value.slice(3)) % 30 !== 0)) { e.target.value = settings[key]; return }
    settings[key] = e.target.value; $('ht-tpo-hours').hidden = settings.mode !== 'session'; saveSettings(); renderProfile()
  })
  $('ht-fit').addEventListener('click', () => chart && fitChart())
  $('ht-book-tabs').addEventListener('click', e => { const tab = e.target.closest?.('[data-book-tab]')?.dataset.bookTab; if (tab) { showBookTab(tab); saveDom() } })
  $('ht-dom-big').value = dom.big || ''; $('ht-tape-min').value = dom.tapeMin || ''; $('ht-tape-merge').checked = dom.merge
  $('ht-dom-big').addEventListener('change', e => { dom.big = Math.max(0, Number(e.target.value) || 0); e.target.value = dom.big || ''; saveDom() })
  $('ht-tape-min').addEventListener('change', e => { dom.tapeMin = Math.max(0, Number(e.target.value) || 0); e.target.value = dom.tapeMin || ''; saveDom(); paintTape() })
  $('ht-tape-merge').addEventListener('change', e => { dom.merge = !!e.target.checked; saveDom(); paintTape() })
  showBookTab(dom.tab)
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
  // Live data through the shared Hyperliquid stream (hl-stream.js): the candle of the open interval, the order book and
  // the market context. REST loads the start and fills the gap after a dropped connection; while the stream is live the
  // polling below skips the chart and the book.
  let live = null, liveState = '', liveTimer = 0, bookFrame = 0, pendingBook = null, quoteTimer = 0, studiesTimer = 0
  function followLive() {
    if (typeof HLStream === 'undefined' || !initialized || root.hidden || !selected) return
    const key = selected + ':' + interval
    if (live?.key === key) return
    stopLive()
    const coin = selected, stream = HLStream.shared, offs = []
    live = { key, offs }
    const status = next => {
      const before = liveState; liveState = next
      workspace?.liveStatus?.(next)
      if (next === 'live' && before === 'gap') { loadChart(); loadBook() }
    }
    offs.push(stream.subscribe({ type: 'candle', coin, interval }, data => liveCandle(key, data), status))
    offs.push(stream.subscribe({ type: 'l2Book', coin }, book => { if (selected === coin) { pendingBook = book; if (!bookFrame) bookFrame = requestAnimationFrame(paintBook) } }))
    offs.push(stream.subscribe({ type: 'activeAssetCtx', coin }, data => liveContext(coin, data.ctx)))
    offs.push(stream.subscribe({ type: 'trades', coin }, list => onTrades(coin, list)))
  }
  function stopLive() {
    live?.offs.forEach(off => off()); live = null; liveState = ''
    cancelAnimationFrame(bookFrame); bookFrame = 0; pendingBook = null
  }
  function liveCandle(key, data) {
    if (key !== chartKey || !series || !drawingPanel?.candles?.length) return
    const bar = HLStream.candleOf(data)
    if (![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return
    const kind = HLStream.mergeCandle(drawingPanel.candles, bar)
    if (!kind) return
    series.update(bar)
    volumeSeries.update({ time: bar.time, value: Number.isFinite(bar.volume) ? bar.volume : 0, color: bar.close >= bar.open ? '#8dcc9c66' : '#dc8e8966' })
    // Studies and overlays follow the new bar at once, and the forming bar at most every 2 s.
    if (kind === 'append') { clearTimeout(studiesTimer); studiesTimer = 0; drawingPanel.drawings.redraw(); orderflow.refresh(); studies.refresh() }
    else if (!studiesTimer) studiesTimer = setTimeout(() => { studiesTimer = 0; if (chartKey === key) studies.refresh() }, 2000)
  }
  function paintBook() {
    bookFrame = 0
    const book = pendingBook; pendingBook = null
    if (!book || book.coin !== selected) return
    const bids = (book.levels?.[0] || []).slice(0, 12), asks = (book.levels?.[1] || []).slice(0, 12)
    setBigLimit([...bids, ...asks])
    $('ht-asks').innerHTML = bookSide([...asks].reverse(), 'ask')
    $('ht-bids').innerHTML = bookSide(bids, 'bid')
    const ask = Number(asks[0]?.px), bid = Number(bids[0]?.px)
    $('ht-spread').textContent = Number.isFinite(ask - bid) ? `SPREAD ${fmt(ask - bid)}` : '—'
    $('ht-book-time').textContent = new Date(book.time).toLocaleTimeString('pl-PL')
  }
  function liveContext(coin, ctx) {
    const m = all.find(x => x.coin === coin)
    if (!m || !ctx) return
    const price = Number(ctx.markPx || ctx.midPx), previous = Number(ctx.prevDayPx)
    if (Number.isFinite(price)) { m.price = price; if (previous > 0) m.change = (price / previous - 1) * 100 }
    if (Number.isFinite(Number(ctx.dayNtlVlm))) m.volume = Number(ctx.dayNtlVlm)
    if (Number.isFinite(Number(ctx.openInterest))) m.openInterest = Number(ctx.openInterest)
    if (Number.isFinite(Number(ctx.funding))) m.funding = Number(ctx.funding)
    // The header follows every tick; the heavier list and linked panes at most once a second.
    if (coin === selected) {
      $('ht-price').textContent = fmt(m.price)
      if (!quoteTimer) quoteTimer = setTimeout(() => { quoteTimer = 0; renderQuote(); renderList() }, 1000)
    }
  }
  // Off screen: the stream and order-book polling stop; order flow keeps collecting trades without redrawing.
  new MutationObserver(() => {
    if (root.hidden) { clearTimeout(liveTimer); liveTimer = setTimeout(() => { if (root.hidden) { stopLive(); studies.suspend?.(); orderflow.suspend?.() } }, 1000) }
    else { studies.resume?.(); orderflow.resume?.(); followLive() }
  })
    .observe(root, { attributes: true, attributeFilter: ['hidden'] })
  const streaming = () => liveState === 'live'
  setInterval(() => { if (!root.hidden && !document.hidden && initialized) { loadMarkets(); if (!streaming()) loadBook() } }, 15000)
  setInterval(() => { if (!root.hidden && !document.hidden && initialized) { if (!streaming()) loadChart(); loadProfile() } }, 30000)
  // Revisiting the page within 15 s reuses the data (the timers keep it fresh while it is on screen).
  let shownAt = Date.now()
  workspace = window.TerminalWorkspace?.attach(root, { theme, market: () => ({ coin: selected, interval, markets: all }), fetchJson: json,
    chartRef: () => chart ? { chart, series, candles: drawingPanel?.candles || [] } : null })
  return { show() { workspace?.show(); if (!initialized) { initialized = true; loadMarkets().then(() => { loadChart(); loadBook(); loadProfile() }) } else if (Date.now() - shownAt > 15000) { shownAt = Date.now(); loadMarkets(); loadBook(); loadProfile() } } }
})()
