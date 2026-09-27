import { NextRequest } from 'next/server'
import { SESSION_COOKIE, validSession } from './site-auth.mjs'
import TerminalData from '../public/terminal-data.js'
import { cachedTransport } from './cached-transport'

// One shared instance per server process, so its caches also protect Yahoo/FinancialJuice from bursts.
export const terminal = TerminalData.create(cachedTransport())

const headers = { 'Cache-Control': 'private, no-store' }

export async function terminalRoute(request: NextRequest, load: (params: URLSearchParams) => Promise<unknown>) {
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return Response.json({ error: 'Authentication required' }, { status: 401, headers })
  }
  try {
    return Response.json(await load(request.nextUrl.searchParams), { headers })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: (error as { status?: number }).status || 502, headers })
  }
}
