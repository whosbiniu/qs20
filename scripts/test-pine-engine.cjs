// Pine Script engine: syntax, bar-by-bar semantics, built-ins checked against hand-computed values, inputs,
// outputs, error messages with line numbers and the limits that keep a script from hanging or escaping.
const assert = require('node:assert/strict')
const Pine = require('../public/pine-engine.js')

const closes = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15]
const bars = closes.map((c, i) => ({ time: 1700000000 + i * 3600, open: c - 0.5, high: c + 1, low: c - 1, close: c, volume: 100 + i }))
const run = (src, opts) => Pine.run(Pine.compile(src), bars, opts)
const plot = (out, i = 0) => out.plots[i].values
const near = (a, b, eps = 1e-9) => Number.isNaN(b) ? Number.isNaN(a) : Math.abs(a - b) < eps
const same = (a, b) => { assert.equal(a.length, b.length); a.forEach((x, i) => assert.ok(near(x, b[i]), `index ${i}: ${x} vs ${b[i]}`)) }

// ---- declaration, plots, sma / ema / history -----------------------------------------------------------------
let out = run(`//@version=5
indicator("Test", overlay=true)
s = ta.sma(close, 3)
plot(s, "SMA", color=color.red)
plot(close[1], "prev")`)
assert.deepEqual([out.meta.title, out.meta.overlay], ['Test', true])
same(plot(out), [NaN, NaN, 11, 34 / 3, 12, 38 / 3, 40 / 3, 14, 44 / 3, 46 / 3])
same(plot(out, 1), [NaN, ...closes.slice(0, -1)])
assert.equal(out.plots[0].colors[5], 'rgba(255, 82, 82, 1)')

// EMA is seeded with the simple average of the first `length` values.
out = run(`indicator("E")
plot(ta.ema(close, 3))`)
const e = [NaN, NaN, 11]; for (let i = 3; i < closes.length; i++) e.push(0.5 * closes[i] + 0.5 * e[i - 1])
same(plot(out), e)

// RSI: RMA of gains and losses (length 2, worked out step by step).
out = run(`indicator("R")
plot(ta.rsi(close, 2))`)
{
  const gains = [], losses = []
  for (let i = 1; i < closes.length; i++) { gains.push(Math.max(closes[i] - closes[i - 1], 0)); losses.push(Math.max(closes[i - 1] - closes[i], 0)) }
  const rma = list => { const r = [NaN, (list[0] + list[1]) / 2]; for (let i = 2; i < list.length; i++) r.push((list[i] + r[i - 1]) / 2); return r }
  const g = rma(gains), l = rma(losses)
  const rsi = [NaN, ...g.map((u, i) => Number.isNaN(u) ? NaN : l[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / l[i]))]
  same(plot(out), rsi)
}

// ---- var, :=, +=, if / else, ternary, history of a variable -------------------------------------------------
out = run(`indicator("V")
var count = 0
up = close > close[1]
if up
    count += 1
else if close < close[1]
    count := count - 1
streak = up ? 1 : 0
plot(count)
plot(count[2])`)
same(plot(out), [0, 1, 2, 1, 2, 3, 2, 3, 4, 3])
same(plot(out, 1), [NaN, NaN, 0, 1, 2, 1, 2, 3, 2, 3])

// if and switch as values, for / while loops, break
out = run(`indicator("C")
x = if close > 12
    1
else
    -1
kind = switch
    close >= 15 => "high"
    close <= 11 => "low"
    => "mid"
total = 0
for i = 1 to 4
    if i == 4
        break
    total += i
n = 0
while n < 3
    n += 1
plot(x)
plot(kind == "high" ? 2 : kind == "low" ? 0 : 1)
plot(total + n)`)
same(plot(out), closes.map(c => c > 12 ? 1 : -1))
same(plot(out, 1), closes.map(c => c >= 15 ? 2 : c <= 11 ? 0 : 1))
same(plot(out, 2), closes.map(() => 9))

// ---- user functions (own state per call site), tuples, macd / bb --------------------------------------------
out = run(`indicator("F")
avg(src, len) => ta.sma(src, len)
spread(a, b) =>
    d = a - b
    d * 2
[m, sig, hist] = ta.macd(close, 2, 3, 2)
[mid, up, dn] = ta.bb(close, 3, 2)
plot(avg(close, 2))
plot(avg(high, 2))
plot(spread(high, low))
plot(up - mid)`)
same(plot(out), [NaN, ...closes.slice(1).map((c, i) => (c + closes[i]) / 2)])
same(plot(out, 1), [NaN, ...closes.slice(1).map((c, i) => (c + closes[i]) / 2 + 1)])
same(plot(out, 2), closes.map(() => 4))
{
  const sd = i => { const w = closes.slice(i - 2, i + 1), m = w.reduce((a, b) => a + b) / 3; return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 3) }
  same(plot(out, 3), closes.map((c, i) => i < 2 ? NaN : 2 * sd(i)))
}

// crossover / crossunder
out = run(`indicator("X")
plotshape(ta.crossover(close, 12), style=shape.triangleup, location=location.belowbar, color=color.green)
plotshape(ta.crossunder(close, 12), style=shape.triangledown, location=location.abovebar)`)
assert.deepEqual(out.shapes.map(s => [s.bar, s.style]), [[4, 'triangleup'], [3, 'triangledown']].sort((a, b) => a[0] - b[0]))

// highest / lowest / change / nz / na
out = run(`indicator("H")
plot(ta.highest(3))
plot(ta.lowest(low, 2))
plot(nz(ta.change(close), 99))`)
same(plot(out), [NaN, NaN, ...closes.slice(2).map((c, i) => Math.max(...closes.slice(i, i + 3)) + 1)])
same(plot(out, 1), [NaN, ...closes.slice(1).map((c, i) => Math.min(c, closes[i]) - 1)])
same(plot(out, 2), [99, ...closes.slice(1).map((c, i) => c - closes[i])])

// ---- inputs, hline, fill, bgcolor, colours ----------------------------------------------------------------------
const src = `indicator("I", overlay=false)
len = input.int(3, "Długość", minval=1)
mult = input.float(1.5, "Mnożnik")
show = input.bool(true, "Pokaż")
srcIn = input.source(close, "Źródło")
p1 = plot(show ? ta.sma(srcIn, len) * mult : na)
h1 = hline(70, "Góra", color=color.gray, linestyle=hline.style_dotted)
h2 = hline(30)
fill(h1, h2, color=color.new(color.blue, 90))
bgcolor(close > 14 ? color.new(#00ff00, 80) : na)`
out = run(src)
assert.deepEqual(out.inputs.map(i => [i.kind, i.title, i.defval]), [['int', 'Długość', 3], ['float', 'Mnożnik', 1.5], ['bool', 'Pokaż', true], ['source', 'Źródło', 'close']])
assert.equal(out.hlines.length, 2); assert.equal(out.hlines[0].style, 'dotted'); assert.equal(out.fills.length, 1)
assert.equal(out.fills[0].colors[0], 'rgba(41, 98, 255, 0.1)')
assert.deepEqual(Object.keys(out.bgcolors).map(Number), [7, 8, 9])
assert.equal(out.bgcolors[7], 'rgba(0, 255, 0, 0.2)')
// overridden inputs (by position in the settings)
out = run(src, { inputs: { 0: 2, 1: 1, 2: true, 3: 'high' } })
same(plot(out), [NaN, ...closes.slice(1).map((c, i) => (c + closes[i]) / 2 + 1)])
out = run(src, { inputs: { 2: false } })
assert.ok(plot(out).every(Number.isNaN))

// strings, math, str.tostring
out = run(`indicator("S")
label = "C=" + str.tostring(close)
plot(str.length(label))
plot(math.max(close, 12) + math.abs(-1) + math.round(2.567, 1))`)
same(plot(out), closes.map(c => ('C=' + c).length))
same(plot(out, 1), closes.map(c => Math.max(c, 12) + 1 + 2.6))

// ---- errors with line numbers ------------------------------------------------------------------------------------
const error = (src, pattern, line) => {
  try { run(src); assert.fail('expected an error') } catch (e) { assert.equal(e.name, 'PineError', e.stack); assert.match(e.message, pattern); if (line) assert.equal(e.line, line) }
}
error('plot(close)', /indicator/)
error('//@version=5\nstrategy("S")\n', /Strategie/)
error('indicator("A")\nx = ta.sma(close, 3\n', /Niezamknięty nawias/)
error('indicator("A")\ny = foo + 1\n', /Nieznana zmienna „foo”/, 2)
error('indicator("A")\nplot(ta.nosuch(close))\n', /Nieznana funkcja/, 2)
error('indicator("A")\nx = request.security("BTC", "D", close)\n', /request/, 2)
error('indicator("A")\nplot(close, colour=color.red)\n', /nie ma parametru „colour”/, 2)
error('indicator("A")\nx := 1\n', /nie została zadeklarowana/, 2)
error('indicator("A")\nif close > 1\nplot(close)\n', /wciętego bloku/, 2)
error('indicator("A")\nplot(ta.sma(close, 0))\n', /długość/)
// A script that never ends stops at the loop limit instead of hanging the page.
error('indicator("A")\nn = 0\nwhile true\n    n += 1\n', /Pętla przekroczyła/)
// Drawings are skipped with a warning rather than failing the whole script.
out = run('indicator("D", overlay=true)\nlabel.new(bar_index, high, "x")\nplot(close)')
assert.equal(out.plots.length, 1); assert.match(out.warnings.join(' '), /label/)

// ---- no way out of the sandbox: page globals are simply unknown names ----------------------------------------
for (const name of ['window', 'document', 'globalThis', 'fetch', 'localStorage', 'constructor', 'process', 'require', '__proto__'])
  error(`indicator("A")\nplot(${name})`, /Nieznana (zmienna|funkcja)/)
error('indicator("A")\nx = constructor("return 1")', /Nieznana funkcja/)

// Continuation lines and comments.
out = run(`indicator("L") // comment
x = close +
     1 // continued
y = ta.sma(close,
     2)
plot(x - y)`)
same(plot(out), [NaN, ...closes.slice(1).map((c, i) => c + 1 - (c + closes[i]) / 2)])

// describe(): title and overlay without running
assert.deepEqual(Pine.describe('//@version=5\nindicator("Moja średnia", "MS", overlay = true)\n'), { title: 'Moja średnia', overlay: true })
assert.deepEqual(Pine.describe('indicator(title="Relative Strength Index", shorttitle="RSI", format=format.price)'), { title: 'Relative Strength Index', overlay: false })

// Speed: a typical script over 5000 bars.
const many = Array.from({ length: 5000 }, (_, i) => ({ time: 1700000000 + i * 60, open: 100 + Math.sin(i / 10), high: 101 + Math.sin(i / 10), low: 99 + Math.sin(i / 10), close: 100 + Math.sin(i / 9), volume: 10 }))
const t0 = performance.now()
Pine.run(Pine.compile(`indicator("P", overlay=true)
fast = ta.ema(close, 12)
slow = ta.ema(close, 26)
[m, s, h] = ta.macd(close, 12, 26, 9)
r = ta.rsi(close, 14)
plot(fast, color = fast > slow ? color.green : color.red)
plot(slow)
plotshape(ta.crossover(fast, slow), location=location.belowbar)`), many)
const ms = performance.now() - t0
assert.ok(ms < 1500, `5000 bars took ${ms.toFixed(0)} ms`)
console.log(`Pine engine: syntax, var/history, control flow, functions, tuples, ta/math/str, inputs, outputs, errors, sandbox OK (5000 bars in ${ms.toFixed(0)} ms)`)

// ---- real-world scripts in the TradingView built-in style ------------------------------------------------------
const REAL = {
  rsi: `//@version=5
indicator(title="Relative Strength Index", shorttitle="RSI", format=format.price, precision=2, timeframe="", timeframe_gaps=true)
ma(source, length, type) =>
    switch type
        "SMA" => ta.sma(source, length)
        "Bollinger Bands" => ta.sma(source, length)
        "EMA" => ta.ema(source, length)
        "SMMA (RMA)" => ta.rma(source, length)
        "WMA" => ta.wma(source, length)
        "VWMA" => ta.vwma(source, length)
rsiLengthInput = input.int(14, minval=1, title="RSI Length", group="RSI Settings")
rsiSourceInput = input.source(close, "Source", group="RSI Settings")
maTypeInput = input.string("SMA", title="MA Type", options=["SMA", "Bollinger Bands", "EMA", "SMMA (RMA)", "WMA", "VWMA"], group="MA Settings")
maLengthInput = input.int(14, title="MA Length", group="MA Settings")
bbMultInput = input.float(2.0, minval=0.001, maxval=50, title="BB StdDev", group="MA Settings")
up = ta.rma(math.max(ta.change(rsiSourceInput), 0), rsiLengthInput)
down = ta.rma(-math.min(ta.change(rsiSourceInput), 0), rsiLengthInput)
rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
rsiMA = ma(rsi, maLengthInput, maTypeInput)
isBB = maTypeInput == "Bollinger Bands"
rsiPlot = plot(rsi, "RSI", color=#7E57C2)
plot(rsiMA, "RSI-based MA", color=color.yellow)
rsiUpperBand = hline(70, "RSI Upper Band", color=#787B86)
midline = hline(50, "RSI Middle Band", color=color.new(#787B86, 50))
rsiLowerBand = hline(30, "RSI Lower Band", color=#787B86)
fill(rsiUpperBand, rsiLowerBand, color=color.rgb(126, 87, 194, 90), title="RSI Background Fill")
bbUpperBand = plot(isBB ? rsiMA + ta.stdev(rsi, maLengthInput) * bbMultInput : na, title = "Upper Bollinger Band", color=color.green)
bbLowerBand = plot(isBB ? rsiMA - ta.stdev(rsi, maLengthInput) * bbMultInput : na, title = "Lower Bollinger Band", color=color.green)
fill(bbUpperBand, bbLowerBand, color= isBB ? color.new(color.green, 90) : na, title="Bollinger Bands Background Fill")`,
  supertrend: `//@version=5
indicator("Supertrend", overlay=true, timeframe="", timeframe_gaps=true)
atrPeriod = input.int(10, "ATR Length", minval = 1)
factor = input.float(3.0, "Factor", minval = 0.01, step = 0.01)
[supertrend, direction] = ta.supertrend(factor, atrPeriod)
supertrend := barstate.isfirst ? na : supertrend
upTrend = plot(direction < 0 ? supertrend : na, "Up Trend", color = color.green, style=plot.style_linebr)
downTrend = plot(direction < 0 ? na : supertrend, "Down Trend", color = color.red, style=plot.style_linebr)
bodyMiddle = plot(barstate.isfirst ? na : (open + close) / 2, display=display.none)
fill(bodyMiddle, upTrend, color.new(color.green, 90), fillgaps=false)
fill(bodyMiddle, downTrend, color.new(color.red, 90), fillgaps=false)`,
  macd: `//@version=5
indicator(title="Moving Average Convergence Divergence", shorttitle="MACD", timeframe="", timeframe_gaps=true)
fast_length = input(title="Fast Length", defval=12)
slow_length = input(title="Slow Length", defval=26)
src = input(title="Source", defval=close)
signal_length = input.int(title="Signal Smoothing",  minval = 1, maxval = 50, defval = 9)
sma_source = input.string(title="Oscillator MA Type",  defval="EMA", options=["SMA", "EMA"])
sma_signal = input.string(title="Signal Line MA Type", defval="EMA", options=["SMA", "EMA"])
col_macd = input(#2962FF, "MACD Line  ", group="Color Settings", inline="MACD")
col_signal = input(#FF6D00, "Signal Line  ", group="Color Settings", inline="Signal")
col_grow_above = input(#26A69A, "Above   Grow", group="Histogram", inline="Above")
col_fall_above = input(#B2DFDB, "Fall", group="Histogram", inline="Above")
col_grow_below = input(#FFCDD2, "Below Grow", group="Histogram", inline="Below")
col_fall_below = input(#FF5252, "Fall", group="Histogram", inline="Below")
fast_ma = sma_source == "SMA" ? ta.sma(src, fast_length) : ta.ema(src, fast_length)
slow_ma = sma_source == "SMA" ? ta.sma(src, slow_length) : ta.ema(src, slow_length)
macd = fast_ma - slow_ma
signal = sma_signal == "SMA" ? ta.sma(macd, signal_length) : ta.ema(macd, signal_length)
hist = macd - signal
alertcondition(hist[1] >= 0 and hist < 0, title = 'Rising to falling', message = 'The MACD histogram switched from a rising to falling state')
hline(0, "Zero Line", color=color.new(#787B86, 50))
plot(hist, title="Histogram", style=plot.style_columns, color=(hist>=0 ? (hist[1] < hist ? col_grow_above : col_fall_above) : (hist[1] < hist ? col_grow_below : col_fall_below)))
plot(macd, title="MACD", color=col_macd)
plot(signal, title="Signal", color=col_signal)`,
}
for (const [name, script] of Object.entries(REAL)) {
  const r = Pine.run(Pine.compile(script), many)
  assert.ok(r.plots.length >= 2, name)
  // (the Supertrend draws one of its two lines at a time)
  assert.ok(r.plots.slice(0, 2).some(p => p.values.slice(-100).some(Number.isFinite)), `${name}: values at the end`)
}
{
  const r = Pine.run(Pine.compile(REAL.macd), many)
  assert.deepEqual(r.plots.map(p => p.style), ['columns', 'line', 'line'])
  assert.equal(r.inputs.length, 12); assert.equal(r.inputs[2].kind, 'source'); assert.equal(r.inputs[6].kind, 'color')
  assert.ok(new Set(r.plots[0].colors.slice(-200)).size >= 2, 'histogram colours change')
  const st = Pine.run(Pine.compile(REAL.supertrend), many)
  assert.equal(st.meta.overlay, true); assert.equal(st.fills.length, 2); assert.equal(st.plots[2].display, 'none')
}
console.log('Pine engine: TradingView-style RSI, Supertrend and MACD scripts run')
