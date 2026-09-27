// Executed trades only. No bid/ask volume is inferred from OHLC candles.
(function (root) {
  const spans = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 }
  function bucket(ms, interval) {
    const t = Math.floor(ms / 1000)
    if (interval === '1M') { const date = new Date(ms); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000 }
    if (interval === '1w') return Math.floor((t - 345600) / 604800) * 604800 + 345600
    const span = spans[interval] || 60
    return Math.floor(t / span) * span
  }
  const byTime = (a, b) => a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  function createStore(coin, limit = 50000) {
    let trades = [], seen = new Set(), floor = 0, trimmed = false
    return {
      add(batch) {
        let changed = false, ordered = true
        for (const t of batch) {
          const price = Number(t.px), size = Number(t.sz), time = Number(t.time)
          if (t.coin !== coin || (t.side !== 'A' && t.side !== 'B') || !Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(time) || price <= 0 || size <= 0 || time < floor || !Number.isSafeInteger(t.tid)) continue
          const id = `${time}:${coin}:${t.tid}`
          if (seen.has(id)) continue
          const trade = { id, price, size, time, buy: t.side === 'B' }
          if (ordered && trades.length && byTime(trades[trades.length - 1], trade) > 0) ordered = false
          seen.add(id); trades.push(trade); changed = true
        }
        // Live trades arrive in time order, so the full sort only runs for late or replayed batches.
        if (changed && !ordered) trades.sort(byTime)
        // Trim in chunks (10 % over the limit) rather than on every batch once the buffer is full.
        if (changed && trades.length > limit * 1.1) {
          // Drop the whole boundary millisecond, preventing replayed partial batches.
          floor = trades[trades.length - limit - 1].time + 1
          let start = trades.length - limit
          while (start < trades.length && trades[start].time < floor) start++
          for (let i = 0; i < start; i++) seen.delete(trades[i].id)
          trades = trades.slice(start); trimmed = true
        }
        return changed
      },
      reset(now = Date.now()) { trades = []; seen.clear(); floor = now; trimmed = false },
      get trades() { return trades }, get trimmed() { return trimmed },
    }
  }
  // Value area of a volume profile (rows sorted by price): POC, then grow towards the larger neighbour until 70 %.
  // Equal POC candidates: the one nearest the middle of the range (then the lower price), so ties are stable.
  function valueArea(rows, share = .7) {
    if (!rows.length) return null
    let pocIndex = 0, best = -1
    const middle = (rows.length - 1) / 2
    rows.forEach((r, i) => {
      if (r.total > best || r.total === best && Math.abs(i - middle) < Math.abs(pocIndex - middle)) { best = r.total; pocIndex = i }
    })
    const total = rows.reduce((sum, r) => sum + r.total, 0)
    let bottom = pocIndex, top = pocIndex, area = rows[pocIndex].total
    while (area < total * share && (bottom > 0 || top < rows.length - 1)) {
      if ((top < rows.length - 1 ? rows[top + 1].total : -1) >= (bottom > 0 ? rows[bottom - 1].total : -1)) area += rows[++top].total
      else area += rows[--bottom].total
    }
    return { pocIndex, bottom, top, total }
  }
  // Diagonal imbalance inside one bar: buyers at a level against sellers one level lower, sellers against buyers one
  // level higher. `ratio` 3 = 300 %. A traded level with nothing on the other side counts once the own side reaches
  // `minVolume` (no division by zero); the bar's edge, where the diagonal level was never traded, never counts.
  // `stack` or more neighbouring imbalances of one side form a stacked-imbalance zone.
  function imbalances(bar, step, ratio = 3, minVolume = 0, stack = 3) {
    const zones = [], indexes = [...bar.levels.keys()].sort((a, b) => a - b)
    const beats = (own, other) => other !== undefined && own > 0 && own >= minVolume && (other > 0 ? own >= other * ratio : true)
    for (const i of indexes) {
      const level = bar.levels.get(i)
      level.buyImbalance = beats(level.ask, bar.levels.get(i - 1)?.bid)
      level.sellImbalance = beats(level.bid, bar.levels.get(i + 1)?.ask)
    }
    for (const side of ['buy', 'sell']) {
      let run = []
      const flush = () => { if (run.length >= stack) zones.push({ time: bar.time, side, low: bar.levels.get(run[0]).price, high: bar.levels.get(run.at(-1)).price + step, count: run.length }); run = [] }
      for (const i of indexes) {
        const hit = bar.levels.get(i)[side + 'Imbalance']
        if (hit && (!run.length || run.at(-1) === i - 1)) run.push(i)
        else { flush(); if (hit) run.push(i) }
      }
      flush()
    }
    return zones
  }
  // Trading sessions by exchange clock, daylight saving included (IANA time zones through Intl).
  const ZONES = { utc: { tz: 'UTC', start: 0, label: 'UTC 00:00' }, ny: { tz: 'America/New_York', start: 18, label: 'Nowy Jork 18:00 (CME Globex)' },
    warsaw: { tz: 'Europe/Warsaw', start: 0, label: 'Warszawa 00:00' } }
  const formatters = {}
  function sessionKey(ms, zone = 'utc') {
    const z = ZONES[zone] || ZONES.utc
    const f = formatters[z.tz] ||= new Intl.DateTimeFormat('en-CA', { timeZone: z.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    const parts = Object.fromEntries(f.formatToParts(ms).map(p => [p.type, p.value]))
    let day = Date.UTC(+parts.year, +parts.month - 1, +parts.day)
    if (z.start && +parts.hour >= z.start) day += 86400000   // an evening open belongs to the next trading day
    return new Date(day).toISOString().slice(0, 10)
  }
  // Large executed orders: fills with the same millisecond and side are one aggressive order (size-weighted price).
  // minSize 0 = automatic: the top 2 % of orders in the collected range.
  function bigTrades(trades, minSize = 0) {
    const orders = []
    let current = null
    for (const t of trades) {
      if (current && current.time === t.time && current.buy === t.buy) { current.notional += t.price * t.size; current.size += t.size; current.count++ }
      else { if (current) orders.push(current); current = { time: t.time, buy: t.buy, size: t.size, notional: t.price * t.size, count: 1 } }
    }
    if (current) orders.push(current)
    for (const o of orders) o.price = o.notional / o.size
    let threshold = minSize
    if (!(threshold > 0)) {
      const sizes = Float64Array.from(orders, o => o.size).sort()   // typed arrays sort numerically, several times faster
      threshold = sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * .98))] : Infinity
    }
    return { threshold, orders: orders.filter(o => o.size >= threshold) }
  }
  // POC and imbalance zones of one bar, computed once per result.
  function barDetail(bar, result) {
    if (bar.detail) return bar.detail
    const levels = [...bar.levels.entries()].sort((x, y) => x[0] - y[0]).map(e => e[1]), va = valueArea(levels)
    const { ratio, minVolume, stack } = result.imbalance
    return bar.detail = { poc: levels[va.pocIndex].price, zones: imbalances(bar, result.step, ratio, minVolume, stack) }
  }
  function calculate(trades, interval, requestedStep = 0, options = {}) {
    if (!trades.length) return null
    const { ratio = 3, minVolume = 0, stack = 3, sessions = false, zone = 'utc', bubbles = false, bubbleMin = 0 } = options
    let low = Infinity, high = -Infinity
    for (const t of trades) { low = Math.min(low, t.price); high = Math.max(high, t.price) }
    const raw = Math.max((high - low) / 40, high * 1e-6, 1e-8), power = 10 ** Math.floor(Math.log10(raw))
    const step = requestedStep > 0 && Number.isFinite(requestedStep) ? requestedStep : [1, 2, 5, 10].find(n => n * power >= raw) * power
    const first = Math.floor(low / step + 1e-8), last = Math.floor(high / step + 1e-8)
    if (last - first >= 200) throw Error('Zwiększ krok ceny — limit wynosi 200 poziomów.')
    const row = price => ({ price, bid: 0, ask: 0, total: 0, delta: 0 })
    const rows = Array.from({ length: last - first + 1 }, (_, i) => row((first + i) * step)), bars = new Map()
    const sessionRows = new Map()
    let bar = null, barTime = NaN, session = null, sessionDay = -1, sessionName = ''
    for (const t of trades) {
      const index = Math.floor(t.price / step + 1e-8) - first, time = bucket(t.time, interval)
      if (time !== barTime) {
        barTime = time; bar = bars.get(time)
        if (!bar) { bar = { time, bid: 0, ask: 0, delta: 0, levels: new Map() }; bars.set(time, bar) }
      }
      let level = bar.levels.get(index)
      if (!level) { level = row(rows[index].price); bar.levels.set(index, level) }
      const r = rows[index], size = t.size
      if (t.buy) { r.ask += size; level.ask += size; bar.ask += size; r.delta += size; level.delta += size; bar.delta += size }
      else { r.bid += size; level.bid += size; bar.bid += size; r.delta -= size; level.delta -= size; bar.delta -= size }
      r.total += size; level.total += size
      if (sessions) {
        // Session keys change at most once an hour: look the key up once per clock hour.
        const hour = Math.floor(t.time / 3600000)
        if (hour !== sessionDay) { sessionDay = hour; sessionName = sessionKey(t.time, zone) }
        if (!session || session.key !== sessionName) {
          session = sessionRows.get(sessionName)
          if (!session) { session = { key: sessionName, from: t.time, to: t.time, rows: new Map() }; sessionRows.set(sessionName, session) }
        }
        session.to = t.time
        let s = session.rows.get(index)
        if (!s) { s = row(rows[index].price); session.rows.set(index, s) }
        if (t.buy) { s.ask += size; s.delta += size } else { s.bid += size; s.delta -= size }
        s.total += size
      }
    }
    let cvd = 0
    const ordered = [...bars.values()].sort((a, b) => a.time - b.time)
    for (const b of ordered) { cvd += b.delta; b.cvd = cvd }
    const va = valueArea(rows)
    rows.forEach((r, i) => { r.poc = i === va.pocIndex; r.valueArea = i >= va.bottom && i <= va.top })
    // Per-bar POC and imbalances are computed on demand (only bars on screen are drawn), see barDetail.
    const imbalance = { ratio, minVolume, stack }
    const result = { rows, bars: ordered, step, total: va.total, cvd, poc: rows[va.pocIndex].price, val: rows[va.bottom].price, vah: rows[va.top].price + step, imbalance }
    if (sessions) {
      const list = [...sessionRows.values()].sort((a, b) => a.from - b.from)
      result.sessions = list.map((s, i) => {
        const levels = [...s.rows.entries()].sort((x, y) => x[0] - y[0]).map(e => e[1]), v = valueArea(levels)
        levels.forEach((r, j) => { r.poc = j === v.pocIndex; r.valueArea = j >= v.bottom && j <= v.top })
        // The first session started before collection, the last one is still running.
        return { key: s.key, from: s.from, to: s.to, rows: levels, total: v.total, poc: levels[v.pocIndex].price, val: levels[v.bottom].price, vah: levels[v.top].price + step,
          partial: i === 0 || i === list.length - 1 }
      })
    }
    if (bubbles) result.bubbles = bigTrades(trades, bubbleMin)
    return result
  }
  function connect(coin, onTrades, onStatus, deps = {}) {
    // On the page, trades come through the shared Hyperliquid stream (one socket for every panel and study).
    const shared = !deps.WebSocket && root.HLStream?.shared
    if (shared) {
      const off = shared.subscribe({ type: 'trades', coin }, onTrades, status => onStatus(status === 'idle' ? 'connecting' : status))
      return { stop: off }
    }
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
  const FLAGS = ['footprint', 'delta', 'profile', 'counter', 'tradebubbles']
  const DEFAULTS = { footprint: false, delta: false, profile: false, counter: false, tradebubbles: false, step: 0,
    view: 'bidask', color: 'delta', ratio: 300, minImbalance: 0, stack: 3, range: 'all', zone: 'utc', bubbleMin: 0 }
  function clean(saved) {
    const s = { ...DEFAULTS }
    for (const key of FLAGS) if (typeof saved?.[key] === 'boolean') s[key] = saved[key]
    const num = (key, low, high) => { const n = Number(saved?.[key]); if (Number.isFinite(n) && n >= low && n <= high) s[key] = n }
    num('step', 0, 1e9); num('ratio', 100, 10000); num('minImbalance', 0, 1e9); num('stack', 2, 10); num('bubbleMin', 0, 1e9)
    const pick = (key, list) => { if (list.includes(saved?.[key])) s[key] = saved[key] }
    pick('view', ['bidask', 'delta', 'volume']); pick('color', ['delta', 'volume']); pick('range', ['all', 'session', 'visible']); pick('zone', Object.keys(ZONES))
    return s
  }
  // One order-flow instance per chart. `storageKey` keeps each chart's settings apart.
  function attach(host, { storageKey = 'hl-orderflow' } = {}) {
    const zoneOptions = Object.entries(ZONES).map(([k, z]) => `<option value="${k}">${z.label}</option>`).join('')
    host.innerHTML = `<div class="of-controls"><label>Krok ceny order flow <input data-of-step type="number" min="0" step="any" value="0"></label><span>0 = auto · jednostki instrumentu</span><button data-of-reset type="button">Nowy zakres</button></div>
      <div class="of-controls" data-of-group="footprint"><label>Widok <select data-of="view"><option value="bidask">Bid × Ask</option><option value="delta">Delta</option><option value="volume">Wolumen</option></select></label>
        <label>Kolor <select data-of="color"><option value="delta">wg delty</option><option value="volume">wg wolumenu</option></select></label>
        <label>Imbalance % <input data-of="ratio" type="number" min="100" max="10000" step="50"></label><label>Min. wolumen <input data-of="minImbalance" type="number" min="0" step="any"></label>
        <label>Stacked od <input data-of="stack" type="number" min="2" max="10" step="1"></label>
        <span>Imbalance po skosie: kupno na poziomie wobec sprzedaży poziom niżej (i odwrotnie). Brak drugiej strony liczy się od min. wolumenu. Ramka = POC świecy.</span></div>
      <div class="of-controls" data-of-group="profile"><label>Zakres <select data-of="range"><option value="all">zebrane transakcje</option><option value="session">sesje</option><option value="visible">widoczny zakres</option></select></label>
        <label>Sesja <select data-of="zone">${zoneOptions}</select></label><span>Profil z wykonanych transakcji, czas giełdy z uwzględnieniem zmiany czasu. Pierwsza i bieżąca sesja są niepełne.</span></div>
      <div class="of-controls" data-of-group="tradebubbles"><label>Min. wielkość zlecenia <input data-of="bubbleMin" type="number" min="0" step="any"></label><span>0 = auto (największe 2 %). Zlecenie = transakcje z tej samej milisekundy i strony.</span></div>
      <p class="of-status" role="status"></p><p class="of-summary"></p>`
    const el = selector => host.querySelector(selector)
    let saved = {}
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') } catch {}
    let settings = clean(saved)
    let coin = '', interval = '1h', store, stream, state = 'connecting', gap = false, timer, panel, delta, cvd, update = () => {}, result = null, lines = [], suspended = false
    const enabled = () => FLAGS.some(key => settings[key])
    const save = () => { try { (root.Store?.set || ((k, v) => localStorage.setItem(k, v)))(storageKey, JSON.stringify(settings)) } catch {} }
    const number = n => Number(n).toLocaleString('en-US', { maximumSignificantDigits: 5 })
    const utc = t => new Date(t).toISOString().replace('T', ' ').slice(0, 19)
    const clearLines = () => { if (panel) lines.forEach(l => panel.series.removePriceLine(l)); lines = [] }
    const GREEN = '141,204,156', RED = '220,142,137'
    // ---- painting (runs every frame while the chart moves: only what is on screen) ---------------------------
    function yRange(price) {
      const y = panel.series.priceToCoordinate(price), top = panel.series.priceToCoordinate(price + result.step)
      return y === null || top === null ? null : { top, h: Math.max(1, y - top) }
    }
    function paintRows(c, rows, right, width, size) {
      const max = Math.max(...rows.map(r => r.total), 1e-12)
      for (const r of rows) {
        const box = yRange(r.price)
        if (!box || box.top + box.h < 0 || box.top > size.height) continue
        const w = r.total / max * width, sell = r.bid / max * width
        c.globalAlpha = r.valueArea ? .7 : .3
        c.fillStyle = `rgb(${RED})`; c.fillRect(right - w, box.top, sell, Math.max(1, box.h - 1))
        c.fillStyle = `rgb(${GREEN})`; c.fillRect(right - w + sell, box.top, w - sell, Math.max(1, box.h - 1))
        if (r.poc) { c.globalAlpha = 1; c.fillStyle = '#b797d6'; c.fillRect(right - w, box.top + box.h / 2 - .5, w, 1) }
      }
      c.globalAlpha = 1
    }
    // Profile of the bars on screen, summed from their per-bar levels (memoised for the current view).
    let visibleMemo = { key: '', rows: null }
    function visibleRows(range) {
      const key = `${range.from}:${range.to}:${result.bars.length}:${result.total}`
      if (visibleMemo.key === key) return visibleMemo.rows
      const byPrice = new Map()
      for (const bar of result.bars) {
        if (bar.time < range.from || bar.time > range.to) continue
        for (const l of bar.levels.values()) {
          const r = byPrice.get(l.price) || byPrice.set(l.price, { price: l.price, bid: 0, ask: 0, total: 0 }).get(l.price)
          r.bid += l.bid; r.ask += l.ask; r.total += l.total
        }
      }
      const rows = [...byPrice.values()].sort((a, b) => a.price - b.price), va = valueArea(rows)
      if (va) rows.forEach((r, i) => { r.poc = i === va.pocIndex; r.valueArea = i >= va.bottom && i <= va.top })
      return (visibleMemo = { key, rows }).rows
    }
    function paintProfile(c, size, scale) {
      if (settings.range === 'session' && result.sessions) {
        for (const s of result.sessions) {
          const x0 = scale.timeToCoordinate(bucket(s.from, interval)), x1 = scale.timeToCoordinate(bucket(s.to, interval))
          if (x0 === null || x1 === null || x1 < 0 || x0 > size.width) continue
          const width = Math.max(20, Math.min(160, (x1 - x0) * .9))
          // Session profiles grow from the session's first bar to the right.
          c.save(); c.translate(x0 + width, 0); paintRows(c, s.rows, 0, width, size); c.restore()
          c.fillStyle = 'rgba(183,151,214,.9)'; c.font = '9px ui-monospace,monospace'; c.textAlign = 'left'
          const top = yRange(Math.max(...s.rows.map(r => r.price)))
          if (top) c.fillText(`${s.key}${s.partial ? ' · niepełna' : ''}`, x0 + 2, Math.max(9, top.top - 4))
        }
        return
      }
      const rows = settings.range === 'visible' ? (() => { const r = scale.getVisibleRange(); return r ? visibleRows(r) : [] })() : result.rows
      if (rows.length) paintRows(c, rows, size.width, Math.min(150, size.width * .18), size)
    }
    function paintFootprint(c, size, scale) {
      const range = scale.getVisibleRange(), spacing = scale.options().barSpacing
      const numbers = spacing >= 75, w = Math.max(2, Math.min(45, spacing * .46))
      c.font = '10px ui-monospace,monospace'; c.textBaseline = 'middle'
      let most = 1e-12, mostDelta = 1e-12
      const visible = result.bars.filter(bar => !range || bar.time >= range.from && bar.time <= range.to)
      for (const bar of visible) for (const r of bar.levels.values()) { most = Math.max(most, r.total); mostDelta = Math.max(mostDelta, Math.abs(r.delta)) }
      for (const bar of visible) {
        const x = scale.timeToCoordinate(bar.time)
        if (x === null || x < -w || x > size.width + w) continue
        const detail = barDetail(bar, result)
        for (const r of bar.levels.values()) {
          const box = yRange(r.price)
          if (!box || box.top + box.h < 0 || box.top > size.height) continue
          const h = Math.max(2, box.h)
          c.globalAlpha = settings.color === 'volume' ? .2 + .6 * r.total / most : .25 + .55 * Math.abs(r.delta) / mostDelta
          c.fillStyle = settings.color === 'volume' ? 'rgb(120,140,170)' : r.delta >= 0 ? '#256a53' : '#873a49'
          c.fillRect(x - w, box.top, w * 2, h - 1); c.globalAlpha = 1
          if (r.price === detail.poc) { c.strokeStyle = '#e8c268'; c.lineWidth = 1; c.strokeRect(x - w + .5, box.top + .5, w * 2 - 1, h - 2) }
          // Imbalances: a bright edge on the winning side, bold numbers when they fit.
          if (r.buyImbalance) { c.fillStyle = `rgb(${GREEN})`; c.fillRect(x + w - 2, box.top, 2, h - 1) }
          if (r.sellImbalance) { c.fillStyle = `rgb(${RED})`; c.fillRect(x - w, box.top, 2, h - 1) }
          if (numbers && h >= 12) {
            const bold = f => (f ? 'bold ' : '') + '10px ui-monospace,monospace'
            if (settings.view === 'bidask') {
              c.textAlign = 'right'; c.font = bold(r.sellImbalance); c.fillStyle = r.sellImbalance ? '#ff8f89' : '#ffaaa6'; c.fillText(number(r.bid), x - 3, box.top + h / 2, w - 4)
              c.textAlign = 'left'; c.font = bold(r.buyImbalance); c.fillStyle = r.buyImbalance ? '#9ff5ad' : '#b1edbb'; c.fillText(number(r.ask), x + 3, box.top + h / 2, w - 4)
            } else {
              const value = settings.view === 'delta' ? r.delta : r.total
              c.textAlign = 'center'; c.font = bold(r.buyImbalance || r.sellImbalance)
              c.fillStyle = settings.view === 'delta' ? (value >= 0 ? '#b1edbb' : '#ffaaa6') : '#dfe3ea'
              c.fillText((settings.view === 'delta' && value > 0 ? '+' : '') + number(value), x, box.top + h / 2, w * 2 - 4)
            }
          }
        }
      }
      paintZones(c, size, scale, range)
    }
    // Stacked imbalances stay on the chart as zones until a later bar trades back into them.
    function paintZones(c, size, scale, range) {
      const bars = result.bars, from = range ? range.from : -Infinity
      let startIndex = bars.findIndex(b => b.time >= from)
      if (startIndex < 0) return
      startIndex = Math.max(0, startIndex - 100)
      for (let i = startIndex; i < bars.length; i++) {
        if (range && bars[i].time > range.to) break
        for (const zone of barDetail(bars[i], result).zones) {
          // Where price came back into the zone: found once per result, not on every frame.
          if (zone.end === undefined) {
            zone.end = null
            for (let j = i + 1; j < bars.length && j < i + 500; j++) {
              let low = Infinity, high = -Infinity
              for (const l of bars[j].levels.values()) { if (l.price < low) low = l.price; if (l.price > high) high = l.price }
              if (low < zone.high && high + result.step > zone.low) { zone.end = bars[j].time; break }
            }
          }
          const end = zone.end
          const x0 = scale.timeToCoordinate(zone.time), x1 = end === null ? size.width : scale.timeToCoordinate(end)
          const top = panel.series.priceToCoordinate(zone.high), bottom = panel.series.priceToCoordinate(zone.low)
          if (x0 === null || x1 === null || top === null || bottom === null || x1 < 0 || x0 > size.width) continue
          const color = zone.side === 'buy' ? `rgb(${GREEN})` : `rgb(${RED})`, width = Math.max(1, x1 - x0)
          c.globalAlpha = .08; c.fillStyle = color; c.fillRect(x0, top, width, Math.max(1, bottom - top))
          c.globalAlpha = .5; c.fillRect(x0, top, width, 1); c.fillRect(x0, bottom - 1, width, 1); c.globalAlpha = 1
        }
      }
    }
    function paintBubbles(c, size, scale) {
      const { orders, threshold } = result.bubbles, span = (spans[interval] || 60) * 1000, spacing = scale.options().barSpacing
      for (const o of orders) {
        const start = bucket(o.time, interval), x = scale.timeToCoordinate(start), y = panel.series.priceToCoordinate(o.price)
        if (x === null || y === null) continue
        const cx = x + ((o.time - start * 1000) / span - .5) * spacing * .8
        if (cx < -40 || cx > size.width + 40 || y < -40 || y > size.height + 40) continue
        const radius = Math.min(28, 3 + 5 * Math.sqrt(o.size / threshold))
        c.beginPath(); c.arc(cx, y, radius, 0, Math.PI * 2)
        c.globalAlpha = .35; c.fillStyle = o.buy ? `rgb(${GREEN})` : `rgb(${RED})`; c.fill()
        c.globalAlpha = .9; c.strokeStyle = c.fillStyle; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1
      }
    }
    const renderer = { draw(target) {
      if (!result || !panel) return
      target.useMediaCoordinateSpace(({ context: c, mediaSize: size }) => {
        c.save(); c.beginPath(); c.rect(0, 0, size.width, size.height); c.clip()
        const scale = panel.chart.timeScale()
        if (settings.profile) paintProfile(c, size, scale)
        if (settings.footprint) paintFootprint(c, size, scale)
        if (settings.tradebubbles && result.bubbles) paintBubbles(c, size, scale)
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
      try {
        result = calculate(trades, interval, Number(settings.step), { ratio: settings.ratio / 100, minVolume: settings.minImbalance, stack: settings.stack,
          sessions: settings.profile && settings.range === 'session', zone: settings.zone, bubbles: settings.tradebubbles, bubbleMin: settings.bubbleMin })
      } catch (error) { el('.of-summary').textContent = error.message }
      if (result) {
        el('.of-summary').textContent = `Wolumen ${number(result.total)} · Δ ${number(result.bars.at(-1).delta)} · CVD ${number(result.cvd)} · krok ${number(result.step)}.${settings.tradebubbles && result.bubbles ? ` Bąbelki od ${number(result.bubbles.threshold)} (${result.bubbles.orders.length}).` : ''} Footprint: przybliż wykres, aby odczytać liczby.`
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
        if (settings.profile && settings.range === 'all' && panel) for (const [title, price] of [['VP POC', result.poc], ['VP VAH', result.vah], ['VP VAL', result.val]]) lines.push(panel.series.createPriceLine({ title, price, color: '#b797d6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }))
      }
      update()
      listeners.forEach(f => f())
    }
    function schedule() { if (!timer) timer = setTimeout(render, 500) }
    function start() {
      if (stream || !coin || !enabled() || suspended) return
      stream = connect(coin, batch => { if (store.add(batch)) schedule() }, value => { state = value; if (value === 'gap') gap = true; schedule() })
    }
    function stop() { if (stream) { stream.stop(); stream = null; gap = !!store?.trades.length } }
    function syncControls() {
      el('[data-of-step]').value = settings.step
      for (const key of ['view', 'color', 'ratio', 'minImbalance', 'stack', 'range', 'zone', 'bubbleMin']) { const input = el(`[data-of="${key}"]`); if (input) input.value = settings[key] }
    }
    syncControls()
    el('[data-of-step]').addEventListener('change', e => { settings.step = Math.max(0, Number(e.target.value) || 0); e.target.value = settings.step; save(); render() })
    for (const key of ['view', 'color', 'ratio', 'minImbalance', 'stack', 'range', 'zone', 'bubbleMin']) el(`[data-of="${key}"]`)?.addEventListener('change', e => {
      settings = clean({ ...settings, [key]: typeof DEFAULTS[key] === 'number' ? Number(e.target.value) : e.target.value })
      syncControls(); save(); render()
    })
    el('[data-of-reset]').addEventListener('click', () => { store?.reset(); gap = state !== 'live'; render() })
    const onHide = () => { stop(); }, onShow = () => start()
    window.addEventListener('pagehide', onHide)
    window.addEventListener('pageshow', onShow)
    return {
      isEnabled(key) { return !!settings[key] },
      setEnabled(key, value) {
        if (!FLAGS.includes(key)) return
        settings[key] = !!value; save()
        if (!enabled()) stop(); else start()
        render()
      },
      // Settings groups shown in the indicator's popover (footprint, profile or trade bubbles).
      showSettings(id) { for (const group of ['footprint', 'profile', 'tradebubbles']) { const g = el(`[data-of-group="${group}"]`); if (g) g.hidden = group !== id } },
      setMarket(next, frame) {
        interval = frame
        if (next !== coin) { stop(); coin = next; store = createStore(coin); gap = false; state = 'connecting' }
        start(); render()
      },
      refresh: render,
      // A hidden chart stops listening; trades missed meanwhile are reported as a possible gap.
      suspend() { suspended = true; stop() },
      resume() { if (!suspended) return; suspended = false; start(); render() },
      destroy() { stop(); clearTimeout(timer); clearLines(); window.removeEventListener('pagehide', onHide); window.removeEventListener('pageshow', onShow); listeners.length = 0 },
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
  root.TerminalOrderflow = { createStore, calculate, bucket, connect, attach, valueArea, imbalances, barDetail, sessionKey, bigTrades, ZONES }
})(globalThis)
