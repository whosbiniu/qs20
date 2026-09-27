// Time-at-price from 30-minute OHLC ranges; sessions start at 00:00 UTC.
(function (root) {
  function build(candles, session, requestedStep = 0) {
    const start = Date.parse(session + 'T00:00:00Z') / 1000
    if (!Number.isFinite(start)) return null
    const blocks = new Map()
    for (const c of candles) {
      if (![c.time, c.low, c.high].every(Number.isFinite) || c.low > c.high || c.time < start || c.time >= start + 86400) continue
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
      for (let level = Math.floor(c.low / step); level <= Math.floor(c.high / step); level++) rows[level - first].letters += alphabet[index]
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
    return { rows, step, poc: rows[poc].price, val: rows[bottom].price, vah: rows[top].price + step, blocks: blocks.size, total }
  }
  root.TerminalProfile = { build }
})(globalThis)
