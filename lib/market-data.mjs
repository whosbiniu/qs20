import DayHighs from '../public/day-highs.js'

let cached, pending
export async function marketHighs() {
  if (cached && Date.now() - cached.fetchedAt < 60000) return cached
  if (pending) return pending
  pending = (async () => {
    const assets = await Promise.all(DayHighs.assets.map(async asset => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.feed)}?interval=1m&range=5d&includePrePost=true`
        const response = await fetch(url, { cache:'no-store', signal:AbortSignal.timeout(12000), headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'} })
        if (!response.ok) throw new Error('Market data unavailable')
        const data = await response.json()
        return DayHighs.summarize(data.chart?.result?.[0], asset.symbol)
      } catch {
        return {symbol:asset.symbol,feed:asset.feed,error:'Dane chwilowo niedostępne'}
      }
    }))
    cached = {assets,fetchedAt:Date.now(),source:'Yahoo Finance',delayed:true,intervalSeconds:60}
    return cached
  })()
  try { return await pending } finally { pending = undefined }
}
