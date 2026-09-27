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
    host.innerHTML = `<div class="of-controls"><label>Krok ceny order flow <input data-of-step type="number" min="0" step="any" value="0"></label><span>0 = auto · jednostki instrumentu</span><button data-of-reset type="button">Nowy zakres</button></div><p class="of-status" role="status"></p><p class="of-summary"></p>`
    const el = selector => host.querySelector(selector)
    let settings = { footprint: false, delta: false, profile: false, counter: false, step: 0 }
    try { settings = { ...settings, ...JSON.parse(localStorage.getItem('hl-orderflow') || '{}') } } catch {}
    let coin = '', interval = '1h', store, stream, state = 'connecting', gap = false, timer, panel, delta, cvd, update = () => {}, result = null, lines = []
    const enabled = () => settings.footprint || settings.delta || settings.profile || settings.counter
    const save = () => { try { localStorage.setItem('hl-orderflow', JSON.stringify(settings)) } catch {} }
    const number = n => Number(n).toLocaleString('en-US', { maximumSignificantDigits: 5 })
    const utc = t => new Date(t).toISOString().replace('T', ' ').slice(0, 19)
    const clearLines = () => { if (panel) lines.forEach(l => panel.series.removePriceLine(l)); lines = [] }
    const renderer = { draw(target) {
      if (!result || !panel) return
      target.useMediaCoordinateSpace(({ context: c, mediaSize: size }) => {
        c.save(); c.beginPath(); c.rect(0, 0, size.width, size.height); c.clip()
        if (settings.profile) {
          const max = Math.max(...result.rows.map(r => r.total)), width = Math.min(150, size.width * .18)
          for (const r of result.rows) {
            const y = panel.series.priceToCoordinate(r.price), top = panel.series.priceToCoordinate(r.price + result.step)
            if (y === null || top === null || y < 0 || top > size.height) continue
            const w = r.total / max * width, sell = r.bid / max * width
            c.globalAlpha = r.valueArea ? .7 : .3
            c.fillStyle = '#dc8e89'; c.fillRect(size.width - w, top, sell, Math.max(1, y - top - 1))
            c.fillStyle = '#8dcc9c'; c.fillRect(size.width - w + sell, top, w - sell, Math.max(1, y - top - 1))
          }
          c.globalAlpha = 1
        }
        if (settings.footprint) {
          const scale = panel.chart.timeScale(), range = scale.getVisibleRange()
          c.font = '10px ui-monospace,monospace'; c.textBaseline = 'middle'
          for (const bar of result.bars) {
            if (range && (bar.time < range.from || bar.time > range.to)) continue
            const x = scale.timeToCoordinate(bar.time)
            if (x === null || x < 0 || x > size.width) continue
            const spacing = scale.options().barSpacing
            for (const r of bar.levels.values()) {
              const y = panel.series.priceToCoordinate(r.price), top = panel.series.priceToCoordinate(r.price + result.step)
              if (y === null || top === null || y < 0 || top > size.height) continue
              const h = Math.max(2, y - top), w = Math.max(2, Math.min(45, spacing * .46))
              c.globalAlpha = .75; c.fillStyle = r.delta >= 0 ? '#256a53' : '#873a49'; c.fillRect(x - w, top, w * 2, h - 1); c.globalAlpha = 1
              // At low zoom retain the footprint heatmap; show numbers only when they fit.
              if (spacing >= 75 && h >= 12) {
                c.textAlign = 'right'; c.fillStyle = '#ffaaa6'; c.fillText(number(r.bid), x - 3, top + h / 2, w - 4)
                c.textAlign = 'left'; c.fillStyle = '#b1edbb'; c.fillText(number(r.ask), x + 3, top + h / 2, w - 4)
              }
            }
          }
        }
        c.restore()
      })
    } }
    const listeners = []
    function render() {
      if (timer) clearTimeout(timer)
      timer = null; clearLines(); result = null
      delta?.setData([]); cvd?.setData([])
      if (!enabled() || !store) { update(); listeners.forEach(f => f()); return }
      const trades = store.trades
      const status = { connecting: 'Łączenie…', live: 'Połączono', gap: 'Przerwa — ponawianie…', error: 'Błąd strumienia' }[state]
      el('.of-status').textContent = `${coin} · ${status} · ${trades.length} transakcji${trades.length ? ' · ' + utc(trades[0].time) + ' — ' + utc(trades.at(-1).time) + ' UTC' : ''}. Dane zebrane w tej karcie, nie pełna sesja.${gap ? ' Możliwe braki po przerwie.' : ''}${store.trimmed ? ' Zakres ograniczony do 50 000 transakcji.' : ''}`
      el('.of-summary').textContent = ''
      try { result = calculate(trades, interval, Number(settings.step)) } catch (error) { el('.of-summary').textContent = error.message }
      if (result) {
        el('.of-summary').textContent = `Wolumen ${number(result.total)} · Δ ${number(result.bars.at(-1).delta)} · CVD ${number(result.cvd)} · krok ${number(result.step)}. Footprint: przybliż wykres, aby odczytać Bid × Ask.`
        // Keep auxiliary series inside the candle time domain so live trades do not stretch the chart.
        const candles = panel?.candles || [], from = candles[0]?.time, to = candles.at(-1)?.time
        const bars = result.bars.filter(b => b.time >= from && b.time <= to)
        if (settings.delta && panel) {
          if (!delta) {
            delta = panel.chart.addSeries(LightweightCharts.HistogramSeries, { priceScaleId: 'of-delta', title: 'Delta', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
            cvd = panel.chart.addSeries(LightweightCharts.LineSeries, { priceScaleId: 'of-cvd', title: 'CVD', color: '#d6af68', lineWidth: 2, priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
            delta.priceScale().applyOptions({ scaleMargins: { top: .76, bottom: .12 } })
            cvd.priceScale().applyOptions({ scaleMargins: { top: .76, bottom: .12 } })
          }
          delta.setData(bars.map(b => ({ time: b.time, value: b.delta, color: b.delta >= 0 ? '#8dcc9c99' : '#dc8e8999' })))
          cvd.setData(bars.map(b => ({ time: b.time, value: b.cvd })))
        }
        if (settings.profile && panel) for (const [title, price] of [['VP POC', result.poc], ['VP VAH', result.vah], ['VP VAL', result.val]]) lines.push(panel.series.createPriceLine({ title, price, color: '#b797d6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }))
      }
      update()
      listeners.forEach(f => f())
    }
    function schedule() { if (!timer) timer = setTimeout(render, 500) }
    function start() {
      if (stream || !coin || !enabled()) return
      stream = connect(coin, batch => { if (store.add(batch)) schedule() }, value => { state = value; if (value === 'gap') gap = true; schedule() })
    }
    el('[data-of-step]').value = settings.step
    el('[data-of-step]').addEventListener('change', e => { settings.step = Math.max(0, Number(e.target.value) || 0); e.target.value = settings.step; save(); render() })
    el('[data-of-reset]').addEventListener('click', () => { store?.reset(); gap = state !== 'live'; render() })
    window.addEventListener('pagehide', () => { stream?.stop(); stream = null; gap = true })
    window.addEventListener('pageshow', start)
    return {
      isEnabled(key) { return !!settings[key] },
      setEnabled(key, value) {
        settings[key] = !!value; save()
        if (!enabled()) { stream?.stop(); stream = null; gap = !!store?.trades.length } else start()
        render()
      },
      setMarket(next, frame) {
        interval = frame
        if (next !== coin) { stream?.stop(); stream = null; coin = next; store = createStore(coin); gap = false; state = 'connecting' }
        start(); render()
      },
      refresh: render,
      // Executed trades collected in this tab, and a hook for studies built on them (trade counter / pulse).
      get trades() { return store ? store.trades : [] },
      get interval() { return interval },
      onRender(fn) { listeners.push(fn) },
      bindPanel(next) {
        panel = next
        const view = { zOrder: () => 'top', renderer: () => renderer }
        panel.series.attachPrimitive({ attached(p) { update = p.requestUpdate }, paneViews: () => [view] })
        render()
      },
    }
  }
  root.TerminalOrderflow = { createStore, calculate, bucket, connect, attach }
})(globalThis)
