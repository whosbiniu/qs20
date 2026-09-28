// Hyperliquid data for the bundled macOS app. The native proxy supplies the transport.
(function (root) {
  'use strict'
  const intervals = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d', '3d', '1w', '1M'])
  const span = { '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '8h': 28800000, '12h': 43200000, '1d': 86400000, '3d': 259200000, '1w': 604800000, '1M': 2592000000 }
  const hyperCoin = symbol => {
    if (typeof symbol !== 'string') return null
    if (['XYZ100', 'SP500'].includes(symbol.trim().toUpperCase())) return 'xyz:' + symbol.trim().toUpperCase()
    const parts = symbol.match(/^([a-z0-9]+):([a-z0-9]+)$/i)
    return parts ? parts[1].toLowerCase() + ':' + parts[2].toUpperCase() : null
  }
  function create(fetchText) {
    const cache = new Map()
    async function query(body) {
      const response = await fetchText('https://api.hyperliquid.xyz/info', { method: 'POST', body: JSON.stringify(body) })
      if (response.status !== 200) throw new Error('Hyperliquid HTTP ' + response.status)
      return JSON.parse(response.text)
    }
    async function cached(key, ms, load) {
      const hit = cache.get(key)
      if (hit && Date.now() - hit.at < ms) return hit.value
      if (hit?.pending) return hit.pending
      const pending = load().then(value => { cache.set(key, { at: Date.now(), value }); return value })
      cache.set(key, { ...hit, pending })
      try { return await pending } catch (error) { cache.delete(key); if (hit?.value) return hit.value; throw error }
    }
    async function markets() {
      return cached('markets', 60000, async () => {
        const dexs = await query({ type: 'perpDexs' })
        const names = ['', ...dexs.filter(Boolean).map(d => d.name)]
        const result = await Promise.allSettled(names.map(async dex => {
          const [meta, contexts] = await query({ type: 'metaAndAssetCtxs', dex })
          return meta.universe.map((asset, index) => {
            const ctx = contexts[index] || {}, price = Number(ctx.markPx || ctx.midPx || ctx.oraclePx), previous = Number(ctx.prevDayPx)
            return { coin: asset.name, dex: dex || 'Hyperliquid', name: asset.name.split(':').at(-1),
              price: Number.isFinite(price) ? price : null, change: Number.isFinite(price) && previous > 0 ? (price / previous - 1) * 100 : null,
              volume: Number(ctx.dayNtlVlm) || 0, openInterest: Number(ctx.openInterest) || 0, funding: Number(ctx.funding) || 0 }
          })
        }))
        const all = result.flatMap(r => r.status === 'fulfilled' ? r.value : [])
        if (!all.length) throw new Error('Brak rynków Hyperliquid')
        return all
      })
    }
    async function candles(coin, interval = '1h', bars = null) {
      if (!intervals.has(interval)) throw Object.assign(new Error('Nieprawidłowy interwał'), { status: 400 })
      if (!(await markets()).some(m => m.coin === coin)) throw Object.assign(new Error('Nieznany rynek'), { status: 400 })
      const count = Number.isFinite(Number(bars)) && Number(bars) > 0 ? Math.min(5000, Math.max(50, Math.round(Number(bars)))) : interval === '30m' ? 5000 : 350
      return cached(`candles:${coin}:${interval}:${count}`, 15000, async () => {
        const rows = await query({ type: 'candleSnapshot', req: { coin, interval, startTime: Date.now() - span[interval] * count, endTime: Date.now() } })
        return rows.map(c => ({ time: Math.floor(c.t / 1000), open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c), volume: Number(c.v) }))
          .filter(c => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite))
      })
    }
    async function orderBook(coin) {
      if (!(await markets()).some(m => m.coin === coin)) throw Object.assign(new Error('Nieznany rynek'), { status: 400 })
      return cached(`book:${coin}`, 3000, async () => {
        const book = await query({ type: 'l2Book', coin })
        return { time: book.time, bids: book.levels?.[0]?.slice(0, 12) || [], asks: book.levels?.[1]?.slice(0, 12) || [] }
      })
    }
    async function deepBook(coin, sig = 0) {
      if (!(await markets()).some(m => m.coin === coin)) throw Object.assign(new Error('Nieznany rynek'), { status: 400 })
      const figures = [0, 2, 3, 4, 5].includes(Number(sig)) ? Number(sig) : 0
      return cached(`deep:${coin}:${figures}`, 3000, async () => {
        const book = await query({ type: 'l2Book', coin, ...(figures ? { nSigFigs: figures } : {}) })
        return { time: book.time, bids: book.levels?.[0] || [], asks: book.levels?.[1] || [] }
      })
    }
    async function fundingHistory(coin) {
      if (!(await markets()).some(m => m.coin === coin)) throw Object.assign(new Error('Nieznany rynek'), { status: 400 })
      return cached(`funding:${coin}`, 300000, async () => {
        const rows = await query({ type: 'fundingHistory', coin, startTime: Date.now() - 14 * 86400000 })
        return rows.map(r => ({ time: Math.floor(Number(r.time) / 1000), rate: Number(r.fundingRate), premium: Number(r.premium) }))
          .filter(r => [r.time, r.rate].every(Number.isFinite))
      })
    }
    async function chart(symbol, frame) {
      const coin = hyperCoin(symbol), market = (await markets()).find(m => m.coin === coin)
      if (!market) throw Object.assign(new Error('Nieznany rynek Hyperliquid'), { status: 400 })
      const interval = { '1M': '1M', '1W': '1w', '1D': '1d', '6H': '1h' }[frame]
      if (!interval) throw Object.assign(new Error('Nieprawidłowy interwał'), { status: 400 })
      let values = await candles(coin, interval)
      if (frame === '6H') {
        const grouped = new Map()
        for (const c of values) {
          const time = Math.floor(c.time / 21600) * 21600, last = grouped.get(time)
          if (last) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close }
          else grouped.set(time, { ...c, time })
        }
        values = [...grouped.values()]
      }
      if (!values.length) throw new Error('Brak świec Hyperliquid')
      return { symbol, feed: coin, name: `${market.name} · Hyperliquid`, currency: 'USD',
        price: market.price ?? values.at(-1).close,
        previousClose: market.price && market.change != null ? market.price / (1 + market.change / 100) : values.at(-1).close,
        candles: values, source: 'Hyperliquid', fetchedAt: Date.now() }
    }
    return { markets, candles, orderBook, deepBook, fundingHistory, chart }
  }
  root.HyperliquidData = { create, hyperCoin }
})(typeof globalThis === 'undefined' ? this : globalThis)
