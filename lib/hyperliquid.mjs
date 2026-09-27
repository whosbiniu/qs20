const INFO = 'https://api.hyperliquid.xyz/info'
const intervals = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'])
const cache = new Map()

async function query(body) {
  const response = await fetch(INFO, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`Hyperliquid HTTP ${response.status}`)
  return response.json()
}

async function cached(key, ms, load) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.time < ms) return hit.value
  if (hit?.pending) return hit.pending
  const pending = load().then(value => { cache.set(key, { time: Date.now(), value }); return value })
  cache.set(key, { ...hit, pending })
  try { return await pending } catch (error) { cache.delete(key); if (hit?.value) return hit.value; throw error }
}

export async function markets() {
  return cached('markets', 60000, async () => {
    const dexs = await query({ type: 'perpDexs' })
    const names = ['', ...dexs.filter(Boolean).map(d => d.name)]
    const result = await Promise.allSettled(names.map(async dex => {
      const [meta, contexts] = await query({ type: 'metaAndAssetCtxs', dex })
      return meta.universe.map((asset, index) => {
        const ctx = contexts[index] || {}
        const price = Number(ctx.markPx || ctx.midPx || ctx.oraclePx)
        const previous = Number(ctx.prevDayPx)
        return {
          coin: asset.name, dex: dex || 'Hyperliquid', name: asset.name.split(':').at(-1),
          price: Number.isFinite(price) ? price : null,
          change: Number.isFinite(price) && previous > 0 ? (price / previous - 1) * 100 : null,
          volume: Number(ctx.dayNtlVlm) || 0, openInterest: Number(ctx.openInterest) || 0,
          funding: Number(ctx.funding) || 0,
        }
      })
    }))
    const all = result.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    if (!all.length) throw new Error('Brak rynków Hyperliquid')
    return all
  })
}

export async function candles(coin, interval = '1h') {
  if (!intervals.has(interval)) throw Object.assign(new Error('Nieprawidłowy interwał'), { status: 400 })
  const known = (await markets()).some(m => m.coin === coin)
  if (!known) throw Object.assign(new Error('Nieznany rynek'), { status: 400 })
  const span = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000, '1M': 2592000000 }[interval]
  return cached(`candles:${coin}:${interval}`, 15000, async () => {
    const rows = await query({ type: 'candleSnapshot', req: { coin, interval, startTime: Date.now() - span * 350, endTime: Date.now() } })
    return rows.map(c => ({ time: Math.floor(c.t / 1000), open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c), volume: Number(c.v) }))
      .filter(c => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite))
  })
}

export async function orderBook(coin) {
  if (!(await markets()).some(m => m.coin === coin)) throw Object.assign(new Error('Nieznany rynek'), { status: 400 })
  return cached(`book:${coin}`, 3000, async () => {
    const book = await query({ type: 'l2Book', coin })
    return { time: book.time, bids: book.levels?.[0]?.slice(0, 12) || [], asks: book.levels?.[1]?.slice(0, 12) || [] }
  })
}

export function hyperCoin(symbol) {
  if (typeof symbol !== 'string') return null
  const upper = symbol.trim().toUpperCase()
  if (upper === 'XYZ100' || upper === 'SP500') return 'xyz:' + upper
  return /^([a-z0-9]+):([A-Z0-9]+)$/i.test(symbol) ? (marketsCoin(symbol)) : null
}

function marketsCoin(symbol) {
  const [dex, name] = symbol.split(':')
  return dex.toLowerCase() + ':' + name.toUpperCase()
}

export async function marketChart(symbol, frame) {
  const coin = hyperCoin(symbol)
  const market = (await markets()).find(m => m.coin === coin)
  if (!market) throw Object.assign(new Error('Nieznany rynek Hyperliquid'), { status: 400 })
  const spec = { '1M': '1M', '1W': '1w', '1D': '1d', '6H': '1h' }[frame]
  if (!spec) throw Object.assign(new Error('Nieprawidłowy interwał'), { status: 400 })
  let values = await candles(coin, spec)
  if (frame === '6H') {
    const grouped = new Map()
    for (const c of values) {
      const time = Math.floor(c.time / 21600) * 21600
      const last = grouped.get(time)
      if (last) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close }
      else grouped.set(time, { ...c, time })
    }
    values = [...grouped.values()]
  }
  if (!values.length) throw new Error('Brak świec Hyperliquid')
  return {
    symbol, feed: coin, name: `${market.name} · Hyperliquid`, currency: 'USD',
    price: market.price ?? values.at(-1).close,
    previousClose: market.price && market.change != null ? market.price / (1 + market.change / 100) : values.at(-1).close,
    candles: values, source: 'Hyperliquid', fetchedAt: Date.now(),
  }
}
