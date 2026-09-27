import { NextRequest } from 'next/server'
import { terminal, terminalRoute } from '../../../lib/terminal-api'

export const dynamic = 'force-dynamic'

export const GET = (request: NextRequest) => terminalRoute(request, () => terminal.monitor())
