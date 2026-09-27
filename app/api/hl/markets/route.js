import { terminalRoute } from '../../../../lib/terminal-api'
import { markets } from '../../../../lib/hyperliquid.mjs'

export const dynamic = 'force-dynamic'
export const GET = request => terminalRoute(request, async () => ({ markets: await markets() }))
