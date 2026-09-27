const assert = require('node:assert/strict')
const X = require('../public/terminal-extra-data.js')
const at = s => Date.parse(s) / 1000
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`)
const day = (d, close, open = close) => ({ time: at(d + 'T14:30:00Z'), open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1 })

// Treasury CSV: dates to ISO, blank cells skipped, newest first.
const csv = 'Date,"1 Mo","2 Yr","10 Yr"\n09/24/2026,4.01,4.87,5.18\n09/25/2026,4.04,,5.17\nbad,1,2,3\n'
const rows = X.parseTreasuryCsv(csv)
assert.deepEqual(rows.map(r => r.date), ['2026-09-25', '2026-09-24'])
assert.deepEqual(rows[0].yields, { '1 Mo': 4.04, '10 Yr': 5.17 })
assert.deepEqual(X.parseTreasuryCsv(''), [])

// Correlation: identical returns = 1, mirrored = -1, only common dates count.
const a = [100, 101, 99, 102, 104, 103].map((c, i) => day(`2026-09-${String(14 + i).padStart(2, '0')}`, c))
const b = a.map(c => ({ ...c, close: c.close * 2 }))
const inv = a.map((c, i) => ({ ...c, close: i ? 10000 / c.close : 100 }))
const m = X.correlationMatrix([{ candles: a }, { candles: b }, { candles: inv }], 60)
assert.equal(m[0][1], 1); assert.equal(m[0][0], 1); assert.ok(m[0][2] < -0.99); assert.equal(m[2][0], m[0][2])
assert.equal(X.pearson([1, 2], [1, 2]), null)   // too short
assert.equal(X.correlationMatrix([{ candles: a }, { candles: a.slice(0, 2) }])[0][1], null)

// Rebase to % from the first candle on or after the start.
assert.deepEqual(X.rebase(a, a[2].time).map(p => +p.value.toFixed(4)), [0, 3.0303, 5.0505, 4.0404])

// Seasonality: monthly returns by calendar month and weekday returns.
const months = [day('2025-12-01', 100), day('2026-01-01', 110), day('2026-02-01', 99), day('2027-01-01', 104.94)]
const s = X.seasonality(months, [day('2026-09-18', 100), day('2026-09-21', 101), day('2026-09-22', 100)])   // Fri, Mon, Tue
near(s.months[0].avg, (10 + 6) / 2)
near(s.months[0].up, 1); assert.equal(s.months[1].n, 1); near(s.months[1].avg, -10)
near(s.weekdays[0].avg, 1); near(s.weekdays[1].avg, (100 / 101 - 1) * 100); assert.equal(s.weekdays[4].n, 0)
near(s.years['2026'][0], 10)
near(s.months[0].median, 8)

// Earnings reaction: after the close -> next session; before the open -> same session.
const px = [day('2026-08-25', 100), day('2026-08-26', 102), day('2026-08-27', 110, 108), day('2026-08-28', 99)]
const [amc, bmo, unknown, late] = X.earningsReactions([
  { time: at('2026-08-26T20:20:00Z') },                // 16:20 New York
  { time: at('2026-08-26T11:00:00Z') },                // 07:00 New York
  { time: at('2026-08-27T04:00:00Z') },                // midnight New York: time unknown -> same day
  { time: at('2026-09-30T20:00:00Z') },                // no candles yet
], px)
assert.equal(amc.timing, 'AMC'); assert.equal(amc.reactionDay, '2026-08-27'); near(amc.move, (110 / 102 - 1) * 100); near(amc.gap, (108 / 102 - 1) * 100)
assert.equal(bmo.timing, 'BMO'); assert.equal(bmo.reactionDay, '2026-08-26'); near(bmo.move, 2)
assert.equal(unknown.timing, '?'); assert.equal(unknown.reactionDay, '2026-08-27')
assert.equal(late.move, null)
assert.equal(X.earningsReactions([{ time: at('2026-08-25T20:00:00Z'), timing: 'BMO' }], px)[0].move, null, 'no previous close before the first candle')

// COT: net per group, oldest first, broken rows dropped.
const cot = X.cotSeries([
  { report_date_as_yyyy_mm_dd: '2026-09-22T00:00:00.000', open_interest_all: '300', lev_money_positions_long: '50', lev_money_positions_short: '80', dealer_positions_long_all: '1', dealer_positions_short_all: '2', asset_mgr_positions_long: '10', asset_mgr_positions_short: '3', nonrept_positions_long_all: '5', nonrept_positions_short_all: '4' },
  { report_date_as_yyyy_mm_dd: '2026-09-15T00:00:00.000', open_interest_all: '290', lev_money_positions_long: '40', lev_money_positions_short: '80', dealer_positions_long_all: '1', dealer_positions_short_all: '2', asset_mgr_positions_long: '10', asset_mgr_positions_short: '3', nonrept_positions_long_all: '5', nonrept_positions_short_all: '4' },
  { report_date_as_yyyy_mm_dd: 'x' },
], 'tff')
assert.deepEqual(cot.map(r => r.date), ['2026-09-15', '2026-09-22'])
assert.equal(cot[1].groups.find(g => g.name === 'Fundusze lewarowane').net, -30)
assert.equal(cot[1].openInterest, 300)
assert.equal(Object.values(X.COT).every(c => ['tff', 'legacy'].includes(c.report)), true)
assert.ok(Object.values(X.SECTORS).flat().length >= 100)

// End to end with a fake transport.
;(async () => {
  const seen = []
  const chart = (feed, list) => JSON.stringify({ chart: { result: [{ meta: { shortName: feed }, timestamp: list.map(c => c.time), indicators: { quote: [{ open: list.map(c => c.open), high: list.map(c => c.high), low: list.map(c => c.low), close: list.map(c => c.close), volume: list.map(() => 1) }] } }] } })
  const data = X.create(async (url, options) => {
    seen.push(url.split('?')[0] + (options?.method === 'POST' ? ' POST' : ''))
    if (url.startsWith('https://fc.yahoo.com')) return { status: 404, text: '' }
    if (url.includes('getcrumb')) return { status: 200, text: 'crumb' }
    if (url.includes('/v7/finance/quote')) return { status: 200, text: JSON.stringify({ quoteResponse: { result: [{ symbol: 'AAPL', shortName: 'Apple', marketCap: 4e12, regularMarketPrice: 300, regularMarketChangePercent: 1.5 }, { symbol: 'ZZZ', marketCap: 1, regularMarketChangePercent: 1 }] } }) }
    if (url.includes('home.treasury.gov')) return url.includes('/2026/') ? { status: 200, text: '"Date","3 Mo","2 Yr","10 Yr"\n09/25/2026,4.2,4.8,5.2\n09/18/2026,4.1,4.7,5.0\n' } : { status: 200, text: '"Date","3 Mo","2 Yr","10 Yr"\n09/25/2025,4.0,3.9,4.2\n' }
    if (url.includes('publicreporting.cftc.gov')) { assert.match(decodeURIComponent(url), /cftc_contract_market_code='20974\+'/); return { status: 200, text: JSON.stringify([{ report_date_as_yyyy_mm_dd: '2026-09-22T00:00:00.000', open_interest_all: '1', lev_money_positions_long: '1', lev_money_positions_short: '2', dealer_positions_long_all: '1', dealer_positions_short_all: '1', asset_mgr_positions_long: '1', asset_mgr_positions_short: '1', nonrept_positions_long_all: '1', nonrept_positions_short_all: '1' }]) } }
    if (url.includes('quoteSummary')) return { status: 200, text: JSON.stringify({ quoteSummary: { result: [{ price: { shortName: 'NVIDIA' }, calendarEvents: { earnings: { earningsDate: [{ raw: at('2026-11-17T21:00:00Z') }] } }, earnings: { earningsChart: { quarterly: [{ calendarQuarter: '2Q2026', reportedDate: { raw: at('2026-08-26T20:20:00Z') }, actual: { raw: 2.22 }, estimate: { raw: 2.09 }, surprisePct: '6.16' }] } } }] } }) }
    if (url.includes('visualization')) return { status: 200, text: JSON.stringify({ finance: { result: [{ documents: [{ columns: ['ticker', 'startdatetime', 'startdatetimetype', 'epsestimate', 'epsactual', 'epssurprisepct'].map(id => ({ id })), rows: [['NVDA', '2026-08-27T20:20:00.000Z', 'TAS', 2, 2.2, 6], ['NVDA', '2026-05-20T20:20:00.000Z', 'TAS', 1.7, 1.87, 5], ['NVDA', '2026-12-01T20:20:00.000Z', 'TAS', 3, null, null]] }] }] } }) }
    if (url.includes('/v8/finance/chart/')) return { status: 200, text: chart(decodeURIComponent(url.match(/chart\/([^?]+)/)[1]), url.includes('NVDA') ? [day('2026-05-20', 90), day('2026-05-21', 95), ...px] : a) }
    return { status: 500, text: '' }
  })
  const heat = await data.heatmap()
  assert.deepEqual(heat.items.map(i => [i.symbol, i.sector]), [['AAPL', 'Technologia']], 'unknown symbols are dropped')
  const corr = await data.correlation('NQ1!, DXY1!', 60)
  assert.deepEqual(corr.symbols, ['NQ1!', 'DXY1!']); assert.equal(corr.matrix[0][1], 1)
  assert.ok(seen.includes('https://query1.finance.yahoo.com/v8/finance/chart/NQ%3DF') && seen.includes('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB'))
  await assert.rejects(data.correlation('NQ1!'), /2-10/)
  await assert.rejects(data.correlation('NQ1!,a b'), /2-10/)
  const y = await data.yields()
  assert.deepEqual(y.curves.map(c => [c.label, c.date]), [['Dziś', '2026-09-25'], ['Tydzień temu', '2026-09-18'], ['Miesiąc temu', '2025-09-25'], ['Rok temu', '2025-09-25']])
  near(y.spreads.at(-1).s10y2y, 0.4)
  const k = await data.cot('NQ'); assert.equal(k.series[0].groups[2].net, -1)
  await assert.rejects(data.cot('XX'), /unknown market/)
  const e = await data.earningsHistory('nvda')
  assert.deepEqual(e.reports.map(r => r.day), ['2026-08-26', '2026-05-20'], 'the calendar copy of the same report (a day later) is replaced, future reports are skipped')
  assert.equal(e.reports[0].quarter, '2Q2026'); near(e.reports[0].move, (110 / 102 - 1) * 100); near(e.reports[1].move, (95 / 90 - 1) * 100)
  assert.equal(e.next, at('2026-11-17T21:00:00Z'))
  assert.ok(seen.includes('https://query1.finance.yahoo.com/v1/finance/visualization POST'))
  await assert.rejects(data.earningsHistory('../x'), /bad ticker/)
  const sea = await data.seasonal('NQ1!'); assert.equal(sea.months.length, 12)
  await assert.rejects(data.seasonal('bad sym'), /bad symbol/)
  console.log('PASS terminal extra: treasury CSV, correlation, rebase, seasonality, earnings reactions, COT, heat map, yields and earnings history')
})().catch(err => { console.error(err); process.exit(1) })
