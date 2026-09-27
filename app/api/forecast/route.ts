import { NextRequest } from 'next/server'
import { SESSION_COOKIE, validSession } from '../../../lib/site-auth.mjs'
import { terminal } from '../../../lib/terminal-api'

export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

// AI briefing for the Monitor. Needs ANTHROPIC_API_KEY on the server; answers 503 without it.
export async function POST(request: NextRequest) {
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return Response.json({ error: 'Authentication required' }, { status: 401, headers })
  }
  if (Number(request.headers.get('content-length') || 0) > 20000) return Response.json({ error: 'Request too large' }, { status: 413, headers })
  try {
    return Response.json(await terminal.forecast(await request.json()), { headers })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: (error as { status?: number }).status || 502, headers })
  }
}
