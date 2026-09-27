// Time-at-price from 30-minute OHLC ranges; sessions start at 00:00 UTC.
(function (root) {
  function build(candles, session, requestedStep = 0) {
    const start = Date.parse(session + 'T00:00:00Z') / 1000
    if (!Number.isFinite(start)) return null
    return buildRange(candles, start, start + 86400, requestedStep)
  }
  function buildRange(candles, start, end, requestedStep = 0) {
    const blocks = new Map()
    for (const c of candles) {
      if (![c.time, c.low, c.high].every(Number.isFinite) || c.low > c.high || c.time < start || c.time >= end) continue
      const index = Math.floor((c.time - start) / 1800)
      const old = blocks.get(index)
      blocks.set(index, { low: Math.min(old?.low ?? c.low, c.low), high: Math.max(old?.high ?? c.high, c.high) })
    }
    if (!blocks.size) return null
    const low = Math.min(...[...blocks.values()].map(c => c.low)), high = Math.max(...[...blocks.values()].map(c => c.high))
    const raw = Math.max((high - low) / 40, Math.abs(high) * 1e-8, 1e-8)
    const power = 10 ** Math.floor(Math.log10(raw))
    const auto = [1, 2, 5, 10].find(n => n * power >= raw) * power
    const step = Number.isFinite(requestedStep) && requestedStep > 0 ? requestedStep : auto
    const first = Math.floor(low / step), last = Math.floor(high / step)
    if (last - first > 500) throw new Error('Zwiększ krok ceny: maksymalnie 500 wierszy TPO.')
    const rows = Array.from({ length: last - first + 1 }, (_, i) => ({ price: (first + i) * step, letters: '' }))
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv'
    for (const [index, c] of [...blocks].sort((a, b) => a[0] - b[0])) {
      for (let level = Math.floor(c.low / step); level <= Math.floor(c.high / step); level++) rows[level - first].letters += alphabet[index % alphabet.length]
    }
    const center = (rows.length - 1) / 2
    let poc = 0
    rows.forEach((row, i) => { if (row.letters.length > rows[poc].letters.length || row.letters.length === rows[poc].letters.length && Math.abs(i - center) < Math.abs(poc - center)) poc = i })
    const total = rows.reduce((n, r) => n + r.letters.length, 0)
    let bottom = poc, top = poc, count = rows[poc].letters.length
    while (count < total * .7 && (bottom > 0 || top < rows.length - 1)) {
      const below = bottom > 0 ? rows[bottom - 1].letters.length : -1
      const above = top < rows.length - 1 ? rows[top + 1].letters.length : -1
      if (above >= below && top < rows.length - 1) count += rows[++top].letters.length
      else count += rows[--bottom].letters.length
    }
    rows.forEach((row, i) => { row.poc = i === poc; row.valueArea = i >= bottom && i <= top })
    return { start, end, rows, step, poc: rows[poc].price, val: rows[bottom].price, vah: rows[top].price + step, blocks: blocks.size, total }
  }
  function bounds(time, mode, from = '08:00', to = '16:30') {
    const day = Math.floor(time / 86400) * 86400, d = new Date(time * 1000)
    if (mode === 'weekly') { const start = day - ((d.getUTCDay() + 6) % 7) * 86400; return [start, start + 604800] }
    if (mode === 'monthly') return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000]
    if (mode === 'session') {
      const seconds = text => { const [h, m] = text.split(':').map(Number); return h * 3600 + m * 60 }
      const a = seconds(from), b = seconds(to)
      if (![a, b].every(Number.isFinite)) return null
      let start = day + a, end = day + b
      if (b <= a) { end += 86400; if (time < day + b) { start -= 86400; end -= 86400 } }
      return time >= start && time < end ? [start, end] : null
    }
    return [day, day + 86400]
  }
  function profiles(candles, options = {}) {
    const groups = new Map()
    for (const c of candles) {
      const range = bounds(c.time, options.mode, options.from, options.to)
      if (!range) continue
      if (!groups.has(range[0])) groups.set(range[0], { range, candles: [] })
      groups.get(range[0]).candles.push(c)
    }
    return [...groups.values()].sort((a, b) => a.range[0] - b.range[0]).map(g => buildRange(g.candles, ...g.range, Number(options.step))).filter(Boolean)
  }
  function attach(panel) {
    let values = [], update = () => {}
    const xOf = time => {
      const c = panel.candles || []
      if (c.length < 2) return null
      let i = 0, j = c.length - 1
      while (j - i > 1) { const m = (i + j) >> 1; if (c[m].time <= time) i = m; else j = m }
      const logical = i + (time - c[i].time) / (c[j].time - c[i].time)
      return panel.chart.timeScale().logicalToCoordinate(logical)
    }
    const renderer = { draw(target) {
      target.useMediaCoordinateSpace(({ context: c, mediaSize: size }) => {
        c.save(); c.beginPath(); c.rect(0, 0, size.width, size.height); c.clip()
        for (const profile of values) {
          const x = xOf(profile.start), end = xOf(profile.end)
          if (x === null || end === null || end < 0 || x > size.width) continue
          const width = Math.min(180, Math.max(4, (end - x) * .7)), max = Math.max(...profile.rows.map(r => r.letters.length))
          const cell = width / max
          for (const row of profile.rows) {
            const y = panel.series.priceToCoordinate(row.price), upper = panel.series.priceToCoordinate(row.price + profile.step)
            if (y === null || upper === null || y < 0 || upper > size.height) continue
            const height = Math.max(1, y - upper)
            c.fillStyle = row.poc ? 'rgba(216,190,132,.85)' : row.valueArea ? 'rgba(55,126,223,.65)' : 'rgba(160,165,169,.45)'
            if (cell >= 3 && height >= 3) for (let k = 0; k < row.letters.length; k++) c.fillRect(x + k * cell, upper, Math.max(1, cell - 1), Math.max(1, height - 1))
            else c.fillRect(x, upper, cell * row.letters.length, height)
          }
          if (end - x >= 35) {
            c.font = '10px ui-monospace,monospace'; c.textAlign = 'right'
            for (const [label, price] of [['TPOC', profile.poc], ['TVAH', profile.vah], ['TVAL', profile.val]]) {
              const y = panel.series.priceToCoordinate(price)
              if (y === null) continue
              const right = Math.min(end - 2, x + width + 55)
              c.strokeStyle = 'rgba(175,181,190,.65)'; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x, y); c.lineTo(right, y); c.stroke(); c.setLineDash([])
              c.fillStyle = '#aeb6c3'; c.fillText(label, right, y - 3)
            }
          }
        }
        c.restore()
      })
    } }
    const view = { zOrder: () => 'bottom', renderer: () => renderer }
    const primitive = { attached(p) { update = p.requestUpdate }, detached() { update = () => {} }, paneViews: () => [view] }
    panel.series.attachPrimitive(primitive)
    return { set(next) { values = next; update() }, redraw() { update() } }
  }
  root.TerminalProfile = { build, buildRange, bounds, profiles, attach }
})(globalThis)
