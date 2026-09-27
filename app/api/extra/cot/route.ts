import { NextRequest } from 'next/server'
import { terminalRoute } from '../../../../lib/terminal-api'
import { extra } from '../../../../lib/terminal-extra-api'

export const dynamic = 'force-dynamic'

export const GET = (request: NextRequest) => terminalRoute(request, p => extra.cot(p.get('market') || ''))
