import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { authConfigured, hashPassword, verifyPassword, createSession, validSession, SESSION_SECONDS } from '../lib/site-auth.mjs'

delete process.env.SITE_PASSWORD_HASH
delete process.env.SITE_SESSION_SECRET
assert.equal(authConfigured(), false)
assert.equal(validSession('anything'), false)
assert.equal(await verifyPassword('anything'), false)
assert.throws(() => createSession())
process.env.SITE_PASSWORD_HASH = await hashPassword('test-only password')
process.env.SITE_SESSION_SECRET = randomBytes(32).toString('hex')
assert.equal(authConfigured(), true)
assert.equal(await verifyPassword('test-only password'), true)
assert.equal(await verifyPassword('incorrect'), false)
assert.equal(await verifyPassword(null), false)
const now = Date.now()
const session = createSession(now)
assert.equal(validSession(session, now), true)
assert.notEqual(session, createSession(now))
assert.equal(validSession(session, now + SESSION_SECONDS * 1000), false)
assert.equal(validSession(session, now - SESSION_SECONDS * 1000), false)
assert.equal(validSession(session.slice(0, -1) + '!'), false)
assert.equal(validSession(session.replace(/^\d/, '9'), now), false)
const otherSecret = randomBytes(32).toString('hex')
process.env.SITE_SESSION_SECRET = otherSecret
assert.equal(validSession(session, now), false)
const current = createSession(now)
process.env.SITE_PASSWORD_HASH = await hashPassword('rotated password')
assert.equal(validSession(current, now), false)
console.log('PASS server auth: hashed password, incorrect password, fail closed, signed sessions, expiry, tampering and secret/password rotation')
