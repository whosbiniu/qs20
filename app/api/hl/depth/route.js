import { terminalRoute } from '../../../../lib/terminal-api'
import { deepBook } from '../../../../lib/hyperliquid.mjs'

export const dynamic = 'force-dynamic'
export const GET = request => terminalRoute(request, params => deepBook(params.get('coin'), params.get('sig') || 0))
