import { NextRequest, NextResponse } from 'next/server'
import { authConfigured, SESSION_COOKIE, validSession } from './lib/site-auth.mjs'

export function proxy(request: NextRequest) {
  let response: NextResponse
  if (!authConfigured()) {
    response = new NextResponse('Logowanie jest chwilowo niedostępne.', { status: 503 })
  } else if (request.nextUrl.pathname === '/auth/login') {
    response = NextResponse.next()
  } else if (validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    response = NextResponse.next()
  } else if (request.nextUrl.pathname.startsWith('/api/')) {
    response = NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  } else {
    response = NextResponse.redirect(new URL('/auth/login', request.url), 303)
  }
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

// Include direct HTML/JS URLs, API routes and Next assets as well as the homepage.
export const config = { matcher: '/:path*' }
