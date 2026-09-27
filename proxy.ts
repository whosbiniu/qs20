import { NextRequest, NextResponse } from 'next/server'
import { authConfigured, SESSION_COOKIE, validSession } from './lib/site-auth.mjs'

// Only a signed-in browser may keep anything, and only in its own cache ("private"). Files named with a content
// hash (?v=..., see next.config.mjs) never change, so they are kept for a year; other static files and the pages
// are revalidated with their ETag (a tiny 304 when unchanged); API answers and redirects are never stored.
// Only our own pages may frame the terminal, scripts and styles come from this site (inline ones are part of the
// pages), live trades use Hyperliquid's WebSocket and the Bloomberg TV pane embeds YouTube.
const CSP = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:", "font-src 'self' data:", "media-src 'self' blob: https:",
  "connect-src 'self' wss://api.hyperliquid.xyz", "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "worker-src 'self' blob:",
].join('; ')
const SECURITY_HEADERS: [string, string][] = [
  ['Content-Security-Policy', CSP], ['X-Frame-Options', 'SAMEORIGIN'], ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'], ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
]

function cacheControl(request: NextRequest, response: NextResponse) {
  const path = request.nextUrl.pathname
  const passed = response.status < 300 && !response.headers.has('Location') && validSession(request.cookies.get(SESSION_COOKIE)?.value)
  if (!passed || path.startsWith('/api/') || path.startsWith('/auth/')) return 'private, no-store'
  if (path.startsWith('/_next/static/')) return 'private, max-age=31536000, immutable'
  if (request.nextUrl.searchParams.has('v') && /\.(?:js|css|png|svg|webp|html)$/i.test(path)) return 'private, max-age=31536000, immutable'
  return 'private, no-cache'
}

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
  response.headers.set('Cache-Control', cacheControl(request, response))
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  // The login page sends its own, stricter policy.
  if (!request.nextUrl.pathname.startsWith('/auth/')) for (const [name, value] of SECURITY_HEADERS) response.headers.set(name, value)
  return response
}

// Include direct HTML/JS URLs, API routes and Next assets as well as the homepage.
export const config = { matcher: '/:path*' }
