import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(pbkdf2)
export const SESSION_COOKIE = '__Host-uncsway-session'
export const SESSION_SECONDS = 12 * 60 * 60

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url')
  const hash = await derive(password, salt, 600000, 32, 'sha256')
  return `pbkdf2-sha256$600000$${salt}$${hash.toString('base64url')}`
}

export function authConfigured() {
  return /^pbkdf2-sha256\$600000\$[\w-]{22}\$[\w-]{43}$/.test(process.env.SITE_PASSWORD_HASH || '') &&
    /^[a-f0-9]{64}$/.test(process.env.SITE_SESSION_SECRET || '')
}

export async function verifyPassword(password) {
  if (!authConfigured() || typeof password !== 'string' || password.length > 256) return false
  const [, , salt, expected] = process.env.SITE_PASSWORD_HASH.split('$')
  const actual = await derive(password, salt, 600000, 32, 'sha256')
  return timingSafeEqual(actual, Buffer.from(expected, 'base64url'))
}

function signature(payload) {
  return createHmac('sha256', Buffer.from(process.env.SITE_SESSION_SECRET, 'hex'))
    .update(`${process.env.SITE_PASSWORD_HASH}:${payload}`).digest('base64url')
}

export function createSession(now = Date.now()) {
  if (!authConfigured()) throw new Error('Website authentication is not configured')
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(16).toString('base64url')}`
  return `${payload}.${signature(payload)}`
}

export function validSession(token, now = Date.now()) {
  if (!authConfigured() || typeof token !== 'string' || !/^\d{10}\.[\w-]{22}\.[\w-]{43}$/.test(token)) return false
  const [expiry, nonce, supplied] = token.split('.')
  const seconds = Math.floor(now / 1000)
  if (+expiry <= seconds || +expiry > seconds + SESSION_SECONDS) return false
  const expected = signature(`${expiry}.${nonce}`)
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}
