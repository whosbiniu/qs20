import { NextRequest } from 'next/server'
import { terminalRoute } from '../../../lib/terminal-api'

export const dynamic = 'force-dynamic'

// Bloomberg TV: the channel's /live page names the broadcast on air now; its video id is what can be embedded reliably.
let cache = { id: '', at: 0 }

async function bloombergLive() {
  if (cache.id && Date.now() - cache.at < 300000) return cache.id
  const page = await (await fetch('https://www.youtube.com/@markets/live', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en', Cookie: 'SOCS=CAI; CONSENT=YES+' },
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  })).text()
  const id = page.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1]
  if (!id || !/"isLiveNow":true/.test(page)) throw Object.assign(new Error('Bloomberg TV is not live right now'), { status: 503 })
  cache = { id, at: Date.now() }
  return id
}

export const GET = (request: NextRequest) => terminalRoute(request, async () => ({ id: await bloombergLive() }))
