import { terminalRoute } from '../../../../lib/terminal-api'
import { orderBook } from '../../../../lib/hyperliquid.mjs'

export const dynamic = 'force-dynamic'
export const GET = request => terminalRoute(request, params => orderBook(params.get('coin')))
