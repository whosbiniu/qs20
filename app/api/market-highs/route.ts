import { NextRequest } from 'next/server'
import { SESSION_COOKIE, validSession } from '../../../lib/site-auth.mjs'
import { marketHighs } from '../../../lib/market-data.mjs'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return Response.json({error:'Authentication required'},{status:401,headers:{'Cache-Control':'private, no-store'}})
  }
  return Response.json(await marketHighs(),{headers:{'Cache-Control':'private, no-store'}})
}
