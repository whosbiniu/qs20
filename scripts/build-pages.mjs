import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { deriveSiteKey, encryptSiteContent } from './site-crypto.mjs'

// Fail closed before creating any deployable files when the secret is absent.
const key = await deriveSiteKey(process.env.SITE_PASSWORD)
delete process.env.SITE_PASSWORD
const output = join(process.cwd(), '_site')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })

let html = await readFile('public/index.html', 'utf8')
const originalEndpoint = '<meta name="events-endpoint" content="/api/events" />'
if (!html.includes(originalEndpoint)) throw new Error('Missing events endpoint marker')
html = html.replace(originalEndpoint, '<meta name="events-endpoint" content="api/events.enc.json" />')
const deferred = []
for (const match of [...html.matchAll(/<script src="([a-z0-9-]+\.js)"( defer)?><\/script>/g)]) {
  const source = (await readFile(join('public', match[1]), 'utf8')).replace(/<\/script/gi, '<\\/script')
  const inline = `<script>\n${source}\n</script>`
  if (match[2]) deferred.push(inline)
  html = html.replace(match[0], () => match[2] ? '' : inline)
}
if (/<script\s+[^>]*src=/i.test(html)) throw new Error('Unbundled script; refusing to publish')
html = html.replace('</body>', () => deferred.join('\n') + '\n</body>')

const snapshot = JSON.parse(await readFile('app/api/events/snapshot.json', 'utf8'))
let calendar = { ...snapshot, stale: true }

try {
  const response = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Calendar HTTP ${response.status}`)
  const data = await response.json()
  if (!Array.isArray(data)) throw new Error('Invalid calendar data')
  const dated = data.filter((event) =>
    typeof event.title === 'string' && Number.isFinite(Date.parse(event.date)))
  const events = dated
    .filter((event) => event.country === 'USD')
    .map((event) => ({
      title: event.title,
      date: event.date,
      impact: String(event.impact || ''),
      forecast: String(event.forecast || ''),
      previous: String(event.previous || ''),
    }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  const holidays = dated
    .filter((event) => event.impact === 'Holiday' && !/daylight saving/i.test(event.title))
    .map((event) => ({
      title: event.title,
      date: event.date,
      country: String(event.country || ''),
      impact: 'Holiday',
    }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  calendar = { events, holidays, updatedAt: new Date().toISOString() }
} catch (error) {
  console.warn(`Using calendar snapshot: ${error.message}`)
}

await mkdir(join(output, 'api'), { recursive: true })
await writeFile(join(output, 'protected.json'), JSON.stringify(await encryptSiteContent(html, key, 'page')))
await writeFile(join(output, 'api', 'events.enc.json'), JSON.stringify(await encryptSiteContent(JSON.stringify(calendar), key, 'calendar')))
await writeFile(join(output, 'index.html'), await readFile('web/site-lock.html'))
await writeFile(join(output, 'unlock.js'), await readFile('web/site-unlock.js'))
await writeFile(join(output, '.nojekyll'), '')
console.log(`Prepared encrypted GitHub Pages site with ${calendar.events.length} calendar events`)
