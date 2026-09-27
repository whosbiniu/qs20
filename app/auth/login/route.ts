import { NextRequest, NextResponse } from 'next/server'
import { authConfigured, createSession, SESSION_COOKIE, SESSION_SECONDS, verifyPassword } from '../../../lib/site-auth.mjs'

export const dynamic = 'force-dynamic'

function loginPage(error = '', status = 200) {
  return new NextResponse(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>UNC's TERMINAL</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#050505;color:#ebe6d3;font:13px ui-monospace,SFMono-Regular,Menlo,monospace}main{width:100%;max-width:410px;padding:32px;border:1px solid #3a3a34;background:#050505}.brand{margin:0 0 32px;color:#ebe6d3;font-size:14px;letter-spacing:.24em}h1{font-size:12px;font-weight:400;color:#8c8a7c;margin:0 0 22px;text-transform:uppercase;letter-spacing:.14em}label{display:block;font-size:12px;color:#8c8a7c;margin-bottom:8px}input,button{width:100%;font-family:inherit}input{padding:13px;border:1px solid #3a3a34;background:#050505;color:#ebe6d3;font-size:16px}button{margin-top:16px;padding:13px;border:1px solid #ebe6d3;background:#ebe6d3;color:#050505;cursor:pointer;font-size:13px;letter-spacing:.12em;text-transform:uppercase}button:hover{background:#050505;color:#ebe6d3}input:focus-visible,button:focus-visible{outline:1px dashed #ebe6d3;outline-offset:3px}#unlock-status{min-height:36px;margin:16px 0 0;color:#ebe6d3;font-size:12px;line-height:1.5}
  </style></head><body><main><p class="brand">UNC'S TERMINAL</p><h1>Wpisz hasło</h1><form id="unlock-form" action="/auth/login" method="post"><label for="site-password">Hasło</label><input id="site-password" name="password" type="password" autocomplete="current-password" required maxlength="256" autofocus><button id="unlock-button" type="submit">Odblokuj</button><p id="unlock-status" role="status">${error}</p></form></main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
  })
}

export function GET() {
  if (!authConfigured()) return new NextResponse('Logowanie jest chwilowo niedostępne.', { status: 503 })
  return loginPage()
}

export async function POST(request: NextRequest) {
  if (!authConfigured()) return new NextResponse('Logowanie jest chwilowo niedostępne.', { status: 503 })
  const origin = request.headers.get('origin')
  // Next can normalize its internal URL host; compare the browser's origin
  // with the actual request Host so custom production domains work too.
  try {
    const source = new URL(origin || '')
    if (source.origin !== origin || source.host !== request.headers.get('host') ||
      (source.protocol !== 'https:' && !(source.protocol === 'http:' && !process.env.VERCEL))) {
      return new NextResponse('Forbidden', { status: 403 })
    }
  } catch { return new NextResponse('Forbidden', { status: 403 }) }
  if (Number(request.headers.get('content-length') || 0) > 4096) return new NextResponse('Request too large', { status: 413 })
  let password: FormDataEntryValue | null
  try { password = (await request.formData()).get('password') }
  catch { return loginPage('Nieprawidłowy formularz.', 400) }
  if (!(await verifyPassword(password))) return loginPage('Nieprawidłowe hasło. Spróbuj ponownie.', 401)
  const response = NextResponse.redirect(new URL('/', origin!), 303)
  response.cookies.set(SESSION_COOKIE, createSession(), {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: SESSION_SECONDS,
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
