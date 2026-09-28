#!/usr/bin/env node
// Load and endurance benchmark of the Hyperliquid terminal in headless Chrome (see scripts/bench/terminal-bench.js).
//
//   node scripts/bench-terminal.mjs [--scenarios baseline,burst,switch100,panels20,reconnect,session]
//                                    [--minutes 60] [--out /tmp/bench.json] [--url http://localhost:3000]
//
// Without --url it starts `next start` on a free port with a throw-away password (build first: pnpm build).
// Chrome adds what the page cannot see itself: JS heap and DOM after garbage collection, event listeners and
// main-thread CPU time (DevTools Performance metrics). Nothing is sent anywhere; results go to stdout and --out.
import { spawn, execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import net from 'node:net'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback }
const scenarios = arg('scenarios', 'baseline,pan,burst,switch100,panels20,reconnect').split(',')
const minutes = Number(arg('minutes', 60)), out = arg('out', ''), CHROME = arg('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)) }) })

// ---- server with a throw-away password --------------------------------------------------------------------------
let server, url = arg('url', ''), cookie = ''
const { hashPassword, createSession } = await import(join(root, 'lib/site-auth.mjs'))
if (!url) {
  const port = await freePort()
  process.env.SITE_SESSION_SECRET = randomBytes(32).toString('hex')
  process.env.SITE_PASSWORD_HASH = await hashPassword('bench-' + randomBytes(8).toString('hex'))
  server = spawn(join(root, 'node_modules/.bin/next'), ['start', '-p', String(port)], { cwd: root, env: process.env, stdio: 'ignore' })
  url = `http://localhost:${port}`
  for (let i = 0; i < 60; i++) { try { await fetch(url + '/auth/login'); break } catch { await sleep(250) } }
}
if (process.env.SITE_SESSION_SECRET) cookie = createSession()

// ---- Chrome ------------------------------------------------------------------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'bench-chrome-')), debugPort = await freePort()
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=1600,950',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-precise-memory-info',
  // Pages left behind must not stay in the back/forward cache, or they would count towards the next scenario.
  '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' })
let targets
for (let i = 0; i < 80; i++) { try { targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); if (targets.some(t => t.type === 'page')) break } catch {} await sleep(250) }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.onopen = r)
let id = 0
const pending = new Map(), waiters = [], errors = []
ws.onmessage = m => {
  const d = JSON.parse(m.data)
  if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); return }
  if (d.method === 'Runtime.exceptionThrown') errors.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300))
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console: ' + d.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300))
  for (const w of [...waiters]) if (w.method === d.method) { waiters.splice(waiters.indexOf(w), 1); w.resolve(d.params) }
}
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
const next = method => new Promise(resolve => waiters.push({ method, resolve }))
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)
  return r.result?.result?.value
}
async function metrics() {
  await send('HeapProfiler.collectGarbage')
  const list = (await send('Performance.getMetrics')).result.metrics, m = Object.fromEntries(list.map(x => [x.name, x.value]))
  return { at: Date.now(), heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, task: m.TaskDuration, script: m.ScriptDuration, layout: m.LayoutDuration, style: m.RecalcStyleDuration }
}
const cpu = (a, b) => ({ mainThreadBusy: +(100 * (b.task - a.task) / ((b.at - a.at) / 1000)).toFixed(1) + ' %', scriptShare: +(100 * (b.script - a.script) / ((b.at - a.at) / 1000)).toFixed(1) + ' %' })

await send('Runtime.enable'); await send('Page.enable'); await send('Performance.enable'); await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 950, deviceScaleFactor: 2, mobile: false })
await send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(join(root, 'scripts/bench/terminal-bench.js'), 'utf8') })
if (cookie) await send('Network.setCookie', { name: '__Host-uncsway-session', value: cookie, url, httpOnly: true, secure: true, path: '/' })

const version = (await send('Browser.getVersion')).result
const machine = (() => { try { return { model: execSync('sysctl -n hw.model').toString().trim(), cpu: execSync('sysctl -n machdep.cpu.brand_string').toString().trim(), memoryGB: Math.round(Number(execSync('sysctl -n hw.memsize')) / 2 ** 30), os: execSync('sw_vers -productVersion').toString().trim() } } catch { return {} } })()
const report = { date: new Date().toISOString(), machine, browser: version.product, mode: 'headless, software rendering, DPR 2, 1600×950', results: {} }
console.log(`# ${version.product} · ${machine.model || ''} ${machine.cpu || ''} · ${machine.memoryGB || '?'} GB · macOS ${machine.os || ''}`)

for (const name of scenarios) {
  errors.length = 0
  let loaded = next('Page.loadEventFired')
  // A different query each time: a full load (a same-URL hash change would not fire a load event).
  await send('Page.navigate', { url: `${url}/?bench=${name}-${Date.now()}#home` }); await loaded
  loaded = next('Page.loadEventFired')
  await evaluate(`__bench.begin(${JSON.stringify(name)}, ${JSON.stringify({ minutes })})`).catch(() => {}); await loaded
  const warm = await evaluate(`__bench.resume('warm')`)
  const before = await metrics()
  const samples = []
  let done = false
  const sampler = name === 'session' ? (async () => { while (!done) { await sleep(60000); if (!done) samples.push(await metrics()) } })() : null
  const profiling = process.argv.includes('--profile')
  if (profiling) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start') }
  const result = await evaluate(`__bench.resume('run')`)
  if (profiling) {
    const { profile } = (await send('Profiler.stop')).result, file = (out || '/tmp/bench') + `.${name}.cpuprofile`
    writeFileSync(file, JSON.stringify(profile)); console.log('profile:', file)
  }
  done = true
  const after = await metrics()
  report.results[name] = { ...result, subscriptionsAtStart: warm.subscriptions.length, chrome: { before, after, ...cpu(before, after),
    heapGrowthMB: +(after.heapMB - before.heapMB).toFixed(1), nodeGrowth: after.nodes - before.nodes, listenerGrowth: after.listeners - before.listeners, samples }, pageErrors: [...errors] }
  const r = report.results[name]
  console.log(`\n## ${name}`)
  console.log(JSON.stringify({ ...r, chrome: { heapMB: [before.heapMB, after.heapMB], nodes: [before.nodes, after.nodes], listeners: [before.listeners, after.listeners], cpu: cpu(before, after), samples: samples.length }, userAgent: undefined, samples: r.samples?.length }, null, 1))
  if (out) writeFileSync(out, JSON.stringify(report, null, 2))
}

ws.close(); chrome.kill(); server?.kill()
await sleep(300); rmSync(profile, { recursive: true, force: true })
