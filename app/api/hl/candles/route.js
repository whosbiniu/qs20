import { terminalRoute } from '../../../../lib/terminal-api'
import { candles } from '../../../../lib/hyperliquid.mjs'

export const dynamic = 'force-dynamic'
export const GET = request => terminalRoute(request, async params => ({ candles: await candles(params.get('coin'), params.get('interval') || '1h') }))
