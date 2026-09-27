import { NextRequest } from 'next/server'
import { terminal, terminalRoute } from '../../../lib/terminal-api'
import { hyperCoin, marketChart } from '../../../lib/hyperliquid.mjs'

export const dynamic = 'force-dynamic'

export const GET = (request: NextRequest) => terminalRoute(request, p => {
  const symbol = p.get('symbol') || '', frame = p.get('interval') || '1D'
  return hyperCoin(symbol) ? marketChart(symbol, frame) : terminal.chart(symbol, frame)
})
