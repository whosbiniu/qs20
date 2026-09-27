// Executed trades only. No bid/ask volume is inferred from OHLC candles.
(function (root) {
  const spans = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 }
  function bucket(ms, interval) {
    const t = Math.floor(ms / 1000), date = new Date(ms)
    if (interval === '1M') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000
    if (interval === '1w') return Math.floor((t - 345600) / 604800) * 604800 + 345600
    const span = spans[interval] || 60
    return Math.floor(t / span) * span
  }
  function createStore(coin, limit = 50000) {
    let trades = [], seen = new Set(), floor = 0, trimmed = false
    return {
      add(batch) {
        let changed = false
        for (const t of batch) {
          const price = Number(t.px), size = Number(t.sz), time = Number(t.time)
          if (t.coin !== coin || !['A', 'B'].includes(t.side) || ![price, size, time].every(Number.isFinite) || price <= 0 || size <= 0 || time < floor || !Number.isSafeInteger(t.tid)) continue
          const id = `${time}:${coin}:${t.tid}`
          if (seen.has(id)) continue
          seen.add(id); trades.push({ id, price, size, time, buy: t.side === 'B' }); changed = true
        }
        if (changed) {
          trades.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
          if (trades.length > limit) {
            // Drop the whole boundary millisecond, preventing replayed partial batches.
            floor = trades[trades.length - limit - 1].time + 1
            trades = trades.filter(t => t.time >= floor)
            seen = new Set(trades.map(t => t.id)); trimmed = true
          }
        }
        return changed
      },
      reset(now = Date.now()) { trades = []; seen.clear(); floor = now; trimmed = false },
      get trades() { return trades }, get trimmed() { return trimmed },
    }
  }
  function calculate(trades, interval, requestedStep = 0) {
    if (!trades.length) return null
    let low = Infinity, high = -Infinity
    for (const t of trades) { low = Math.min(low, t.price); high = Math.max(high, t.price) }
    const raw = Math.max((high - low) / 40, high * 1e-6, 1e-8), power = 10 ** Math.floor(Math.log10(raw))
    const step = requestedStep > 0 && Number.isFinite(requestedStep) ? requestedStep : [1, 2, 5, 10].find(n => n * power >= raw) * power
    const first = Math.floor(low / step + 1e-8), last = Math.floor(high / step + 1e-8)
    if (last - first >= 200) throw Error('Zwiększ krok ceny — limit wynosi 200 poziomów.')
    const row = price => ({ price, bid: 0, ask: 0, total: 0, delta: 0 })
    const rows = Array.from({ length: last - first + 1 }, (_, i) => row((first + i) * step)), bars = new Map()
    for (const t of trades) {
      const index = Math.floor(t.price / step + 1e-8) - first, time = bucket(t.time, interval)
      if (!bars.has(time)) bars.set(time, { time, bid: 0, ask: 0, delta: 0, levels: new Map() })
      const bar = bars.get(time)
      if (!bar.levels.has(index)) bar.levels.set(index, row(rows[index].price))
      for (const target of [rows[index], bar.levels.get(index), bar]) {
        target[t.buy ? 'ask' : 'bid'] += t.size
        target.delta += t.buy ? t.size : -t.size
        if ('total' in target) target.total += t.size
      }
    }
    let cvd = 0
    const ordered = [...bars.values()].sort((a, b) => a.time - b.time)
    for (const bar of ordered) { cvd += bar.delta; bar.cvd = cvd }
    let pocIndex = 0
    rows.forEach((r, i) => { if (r.total > rows[pocIndex].total) pocIndex = i })
    const total = rows.reduce((sum, r) => sum + r.total, 0)
    let bottom = pocIndex, top = pocIndex, area = rows[pocIndex].total
    while (area < total * .7 && (bottom > 0 || top < rows.length - 1)) {
      if ((top < rows.length - 1 ? rows[top + 1].total : -1) >= (bottom > 0 ? rows[bottom - 1].total : -1)) area += rows[++top].total
      else area += rows[--bottom].total
    }
    rows.forEach((r, i) => { r.poc = i === pocIndex; r.valueArea = i >= bottom && i <= top })
    return { rows, bars: ordered, step, total, cvd, poc: rows[pocIndex].price, val: rows[bottom].price, vah: rows[top].price + step }
  }
  function connect(coin, onTrades, onStatus, deps = {}) {
    const Socket = deps.WebSocket || root.WebSocket
    const later = deps.setTimeout || setTimeout, cancel = deps.clearTimeout || clearTimeout
    let socket, retry, heartbeat, stopped = false, attempts = 0, lastMessage = 0
    function open() {
      if (stopped) return
      onStatus('connecting')
      try { socket = new Socket('wss://api.hyperliquid.xyz/ws') } catch { reconnect(); return }
      const current = socket
      const active = () => !stopped && current === socket
      current.onopen = () => {
        if (!active()) return
        lastMessage = Date.now()
        cancel(heartbeat)
        current.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } }))
        function ping() {
          if (!active()) return
          if (Date.now() - lastMessage > 45000) { current.close(); return }
          if (current.readyState === 1) current.send(JSON.stringify({ method: 'ping' }))
          heartbeat = later(ping, 15000)
        }
        heartbeat = later(ping, 15000)
      }
      current.onmessage = event => {
        if (!active()) return
        lastMessage = Date.now()
        try {
          const msg = JSON.parse(event.data)
          if (msg.channel === 'subscriptionResponse') { attempts = 0; onStatus('live') }
          if (msg.channel === 'trades' && Array.isArray(msg.data)) { attempts = 0; onStatus('live'); onTrades(msg.data) }
          if (msg.channel === 'error') { onStatus('error'); current.close() }
        } catch { /* Ignore malformed frames; heartbeat detects a dead connection. */ }
      }
      current.onerror = () => { if (active()) current.close() }
      current.onclose = () => { if (active()) { cancel(heartbeat); reconnect() } }
      // Also recover from a connection that never completes its handshake.
      heartbeat = later(() => { if (active() && current.readyState === 0) current.close() }, 15000)
    }
    function reconnect() {
      if (stopped) return
      onStatus('gap')
      retry = later(open, Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)))
    }
    open()
    return { stop() { stopped = true; cancel(retry); cancel(heartbeat); socket?.close() } }
  }
  function attach(host) {
    host.innerHTML = `<div class="ht-indicators"><span>Order flow</span><label><input type="checkbox" data-of="footprint"> Footprint</label><label><input type="checkbox" data-of="delta"> Delta/CVD</label><label><input type="checkbox" data-of="profile"> Volume Profile</label></div>
      <div class="of-body" hidden><div class="of-controls"><label>Krok ceny <input data-of-step type="number" min="0" step="any" value="0"></label><span>0 = auto · wolumen w jednostkach instrumentu</span><button data-of-reset type="button">Nowy zakres</button></div><p class="of-status" role="status"></p><p class="of-summary"></p>
      <section class="of-delta" hidden><h4>Delta słupki · CVD linia · czas UTC</h4><div class="of-chart"></div></section>
      <section class="of-footprint" hidden><h4>Footprint · Bid (sprzedaż) × Ask (kupno) · ostatnie 12 świec · czas UTC</h4><div class="of-table"></div></section>
      <section class="of-profile" hidden><h4>Volume Profile · cały zebrany zakres · VA 70%</h4><div class="of-profile-rows"></div></section></div>`
    const el = selector => host.querySelector(selector)
    let settings = { footprint: false, delta: false, profile: false, step: 0 }
    try { settings = { ...settings, ...JSON.parse(localStorage.getItem('hl-orderflow') || '{}') } } catch {}
    let coin = '', interval = '1h', store, stream, state = 'connecting', gap = false, timer, mainSeries, lines = [], plot, delta, cvd
    const enabled = () => settings.footprint || settings.delta || settings.profile
    const save = () => { try { localStorage.setItem('hl-orderflow', JSON.stringify(settings)) } catch {} }
    const number = n => Number(n).toLocaleString('en-US', { maximumSignificantDigits: 7 })
    const utc = t => new Date(t).toISOString().replace('T', ' ').slice(0, 19)
    const clearLines = () => { if (mainSeries) lines.forEach(l => mainSeries.removePriceLine(l)); lines = [] }
    function chartTheme() {
      if (!plot) return
      const css = getComputedStyle(document.documentElement), color = k => css.getPropertyValue(k).trim()
      plot.applyOptions({ layout: { background: { color: color('--bg') }, textColor: color('--dim') }, grid: { vertLines: { color: color('--line') }, horzLines: { color: color('--line') } } })
    }
    function render() {
      timer = null
      clearLines()
      el('.of-body').hidden = !enabled()
      for (const key of ['delta', 'footprint', 'profile']) el('.of-' + key).hidden = !settings[key]
      if (!enabled() || !store) return
      const trades = store.trades
      const status = { connecting: 'Łączenie…', live: 'Połączono', gap: 'Przerwa — ponawianie połączenia…', error: 'Błąd strumienia' }[state]
      el('.of-status').textContent = `${coin} · ${status} · ${trades.length} transakcji${trades.length ? ' · ' + utc(trades[0].time) + ' — ' + utc(trades.at(-1).time) + ' UTC' : ' · oczekiwanie na transakcje'}. Zakres zebrany w tej karcie, nie pełna historia sesji.${gap ? ' Możliwe braki po przerwie w połączeniu.' : ''}${store.trimmed ? ' Limit 50 000 transakcji: starsze dane usunięto; CVD liczone od początku widocznego zakresu.' : ''}`
      el('.of-summary').textContent = ''
      el('.of-table').innerHTML = ''; el('.of-profile-rows').innerHTML = ''
      let result
      try { result = calculate(trades, interval, Number(settings.step)) } catch (error) { el('.of-summary').textContent = error.message; delta?.setData([]); cvd?.setData([]); return }
      if (!result) { delta?.setData([]); cvd?.setData([]); return }
      el('.of-summary').textContent = `Wolumen ${number(result.total)} · Δ ostatniej świecy ${number(result.bars.at(-1).delta)} · CVD ${number(result.cvd)} · krok ${number(result.step)}`
      if (settings.delta) {
        if (!plot) {
          plot = LightweightCharts.createChart(el('.of-chart'), { autoSize: true, timeScale: { timeVisible: true }, leftPriceScale: { visible: true }, localization: { locale: 'pl-PL' } })
          delta = plot.addSeries(LightweightCharts.HistogramSeries, { priceScaleId: 'right', title: 'Delta', priceFormat: { type: 'volume' }, priceLineVisible: false })
          cvd = plot.addSeries(LightweightCharts.LineSeries, { priceScaleId: 'left', title: 'CVD', color: '#d6af68', lineWidth: 2, priceFormat: { type: 'volume' }, priceLineVisible: false })
          chartTheme()
        }
        delta.setData(result.bars.map(b => ({ time: b.time, value: b.delta, color: b.delta >= 0 ? '#8dcc9c' : '#dc8e89' })))
        cvd.setData(result.bars.map(b => ({ time: b.time, value: b.cvd })))
        plot.timeScale().fitContent()
      }
      if (settings.footprint) {
        const bars = result.bars.slice(-12)
        el('.of-table').innerHTML = `<table><thead><tr><th>Cena</th>${bars.map(b => `<th>${utc(b.time * 1000).slice(5,16)}</th>`).join('')}</tr></thead><tbody>${[...result.rows].reverse().map((row, reversed) => {
          const index = result.rows.length - 1 - reversed
          return `<tr><th>${number(row.price)}</th>${bars.map(b => { const r = b.levels.get(index); return `<td>${r ? `<span class="negative">${number(r.bid)}</span> × <span class="positive">${number(r.ask)}</span>` : '—'}</td>` }).join('')}</tr>`
        }).join('')}</tbody><tfoot><tr><th>Delta</th>${bars.map(b => `<td class="${b.delta >= 0 ? 'positive' : 'negative'}">${number(b.delta)}</td>`).join('')}</tr></tfoot></table>`
      }
      if (settings.profile) {
        const max = Math.max(...result.rows.map(r => r.total))
        el('.of-profile-rows').innerHTML = `<p>POC ${number(result.poc)} · VAH ${number(result.vah)} · VAL ${number(result.val)}</p>` + [...result.rows].reverse().map(r => `<div class="of-vp-row${r.poc ? ' poc' : ''}${r.valueArea ? ' va' : ''}"><span>${number(r.price)}</span><div class="of-vp-track"><i style="width:${r.bid / max * 100}%"></i><b style="width:${r.ask / max * 100}%"></b></div><span>${number(r.total)}${r.poc ? ' POC' : ''}</span></div>`).join('')
        if (mainSeries) for (const [title, price] of [['VP POC', result.poc], ['VP VAH', result.vah], ['VP VAL', result.val]]) lines.push(mainSeries.createPriceLine({ title, price, color: '#b797d6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }))
      }
    }
    function schedule() { if (!timer) timer = setTimeout(render, 500) }
    function start() {
      if (stream || !coin || !enabled()) return
      stream = connect(coin, batch => { if (store.add(batch)) schedule() }, value => { state = value; if (value === 'gap') gap = true; schedule() })
    }
    host.querySelectorAll('[data-of]').forEach(input => {
      input.checked = !!settings[input.dataset.of]
      input.addEventListener('change', () => {
        settings[input.dataset.of] = input.checked; save()
        if (!enabled()) { stream?.stop(); stream = null; gap = !!store?.trades.length }
        else start()
        render()
      })
    })
    el('[data-of-step]').value = settings.step
    el('[data-of-step]').addEventListener('change', e => { settings.step = Math.max(0, Number(e.target.value) || 0); e.target.value = settings.step; save(); render() })
    el('[data-of-reset]').addEventListener('click', () => { store?.reset(); gap = state !== 'live'; render() })
    window.addEventListener('themechange', chartTheme)
    window.addEventListener('pagehide', () => { stream?.stop(); stream = null; gap = true })
    window.addEventListener('pageshow', start)
    return {
      setMarket(next, frame) {
        interval = frame
        if (next !== coin) { stream?.stop(); stream = null; coin = next; store = createStore(coin); gap = false; state = 'connecting'; delta?.setData([]); cvd?.setData([]) }
        start(); render()
      },
      bindSeries(next) { clearLines(); mainSeries = next; render() },
    }
  }
  root.TerminalOrderflow = { createStore, calculate, bucket, connect, attach }
})(globalThis)
