import { terminalRoute } from '../../../../lib/terminal-api'
import { fundingHistory } from '../../../../lib/hyperliquid.mjs'

export const dynamic = 'force-dynamic'
export const GET = request => terminalRoute(request, async params => ({ rates: await fundingHistory(params.get('coin')) }))
