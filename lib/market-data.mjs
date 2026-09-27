import DayHighs from '../public/day-highs.js'

let cached, pending
async function chart(feed, interval, range) {
  try {
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(feed)}?interval=${interval}&range=${range}&includePrePost=true`
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'}})
    if(!response.ok)return null
    const data=await response.json()
    return data.chart?.result?.[0]||null
  }catch{return null}
}
export async function marketHighs() {
  if(cached&&Date.now()-cached.fetchedAt<60000)return cached
  if(pending)return pending
  pending=(async()=>{
    const assets=await Promise.all(DayHighs.assets.map(async asset=>{
      const [intraday,history]=await Promise.all([chart(asset.feed,'1m','5d'),chart(asset.feed,'5m','60d')])
      return DayHighs.summarizeAll(intraday,history,asset.symbol)
    }))
    cached={assets,fetchedAt:Date.now(),source:'Yahoo Finance',delayed:true}
    return cached
  })()
  try{return await pending}finally{pending=undefined}
}
