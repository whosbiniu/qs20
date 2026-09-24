import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const output = join(process.cwd(), '_site')
await mkdir(output, { recursive: true })
await cp('public', output, { recursive: true, force: true })

const htmlPath = join(output, 'index.html')
const html = await readFile(htmlPath, 'utf8')
const originalEndpoint = '<meta name="events-endpoint" content="/api/events" />'
if (!html.includes(originalEndpoint)) throw new Error('Missing events endpoint marker')
await writeFile(htmlPath, html.replace(originalEndpoint, '<meta name="events-endpoint" content="api/events.json" />'))

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
await writeFile(join(output, 'api', 'events.json'), JSON.stringify(calendar))
await writeFile(join(output, '.nojekyll'), '')
console.log(`Prepared GitHub Pages site with ${calendar.events.length} calendar events`)
