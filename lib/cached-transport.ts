import { unstable_cache } from 'next/cache'
import TerminalData from '../public/terminal-data.js'

type Reply = { status: number; text: string }
type Options = { method?: string; body?: string; headers?: Record<string, string> }

// Seconds a successful upstream answer may be shared. Next's data cache (Vercel Data Cache in production) is common to
// every function instance, so a cold instance answers from it at once and Yahoo / FinancialJuice / CFTC see far fewer
// requests. After the time is up the stale copy is served and refreshed in the background. 0 = never shared.
function ttl(url: string): number {
  const { hostname, pathname, searchParams } = new URL(url)
  if (hostname === 'fc.yahoo.com' || pathname.includes('/getcrumb')) return 0          // session cookie flow
  if (hostname.endsWith('finance.yahoo.com')) {
    if (pathname.includes('/quoteSummary')) return 3600
    if (pathname.includes('/v7/finance/quote') || pathname.includes('/spark')) return 60
    const interval = searchParams.get('interval') || ''
    return /^(1m|2m|5m)$/.test(interval) ? 30 : 60
  }
  const table: Record<string, number> = {
    'www.financialjuice.com': 60, 'translate.googleapis.com': 86400, 'nfs.faireconomy.media': 900,
    'economic-calendar.tradingview.com': 900, 'home.treasury.gov': 3600, 'publicreporting.cftc.gov': 21600,
    'earthquake.usgs.gov': 120, 'eonet.gsfc.nasa.gov': 600, 'api.adsb.lol': 30, 'api.gdeltproject.org': 600,
    'api.weather.gov': 300, 'weather.gc.ca': 600, 'dd.weather.gc.ca': 600, 'api.weather.gc.ca': 600, 'www.youtube.com': 120,
  }
  return table[hostname] ?? 0
}

class Upstream extends Error { constructor(public reply: Reply) { super('upstream ' + reply.status) } }

export function cachedTransport() {
  const base = TerminalData.nodeTransport() as (url: string, options?: Options) => Promise<Reply>
  return async (url: string, options: Options = {}): Promise<Reply> => {
    const seconds = (options.method || 'GET') === 'GET' ? ttl(url) : 0
    if (!seconds) return base(url, options)
    // Only 200 answers are stored: throwing keeps errors and rate limits (429) out of the shared cache.
    const load = unstable_cache(async () => {
      const reply = await base(url)
      if (reply.status !== 200) throw new Upstream(reply)
      return reply
    }, ['upstream', url], { revalidate: seconds })
    try { return await load() } catch (error) { if (error instanceof Upstream) return error.reply; throw error }
  }
}
