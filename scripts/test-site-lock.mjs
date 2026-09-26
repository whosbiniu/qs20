import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { deriveSiteKey, encryptSiteContent, decryptSiteContent, lockConfig } from './site-crypto.mjs'

const password = 'test-only password 🔒'
const key = await deriveSiteKey(password)
assert.equal(key.extractable, false)
await assert.rejects(deriveSiteKey(''))
const first = await encryptSiteContent('private page', key, 'page')
const second = await encryptSiteContent('private page', key, 'page')
assert.notEqual(first.iv, second.iv)
assert.equal(await decryptSiteContent(first, key, 'page'), 'private page')
assert.ok(!JSON.stringify(first).includes('private page'))
await assert.rejects(decryptSiteContent(first, await deriveSiteKey('wrong password'), 'page'))
await assert.rejects(decryptSiteContent(first, key, 'calendar'))
const tampered = Buffer.from(first.ciphertext, 'base64'); tampered[0] ^= 1
await assert.rejects(decryptSiteContent({...first, ciphertext:tampered.toString('base64')}, key, 'page'))
assert.equal(lockConfig.iterations, 600000)
assert.equal(Buffer.from(lockConfig.salt, 'base64').length, 16)

const env = {...process.env}; delete env.SITE_PASSWORD
const missing = spawnSync(process.execPath, ['scripts/build-pages.mjs'], {env, encoding:'utf8'})
assert.notEqual(missing.status, 0)
assert.match(missing.stderr, /SITE_PASSWORD is required/)
const build = spawnSync(process.execPath, ['scripts/build-pages.mjs'], {env:{...env, SITE_PASSWORD:password}, encoding:'utf8', timeout:30000})
assert.equal(build.status, 0, build.stderr)
assert.deepEqual((await readdir('_site')).sort(), ['.nojekyll','api','index.html','protected.json','unlock.js'])
assert.deepEqual(await readdir('_site/api'), ['events.enc.json'])
const html = await decryptSiteContent(JSON.parse(await readFile('_site/protected.json','utf8')), key, 'page')
assert.match(html, /Aktywne SSMT/)
assert.match(html, /api\/events\.enc\.json/)
assert.doesNotMatch(html, /<script[^>]*src=/)
assert.ok(html.indexOf('function renderAppPage') < html.indexOf("const body = document.getElementById('economic-events')"))
const calendar = JSON.parse(await decryptSiteContent(JSON.parse(await readFile('_site/api/events.enc.json','utf8')), key, 'calendar'))
assert.ok(Array.isArray(calendar.events))
const gate = await readFile('_site/index.html','utf8')
assert.match(gate, /type="password"/)
assert.ok(!gate.includes(password))
assert.doesNotMatch(gate, /Aktywne SSMT/)
assert.match(await readFile('public/index.html','utf8'), /content="\/api\/events"/)
assert.doesNotMatch(await readFile('public/index.html','utf8'), /unlock-form/)
console.log('PASS encryption, wrong password, tampering, fail-closed deployment, encrypted assets/calendar, native app isolation')
