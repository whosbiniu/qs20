// "Inne": market heat map, correlations & comparison, yield curve, seasonality, earnings reactions, trade journal,
// Commitments of Traders and an AI assistant. Loaded on first use (see LAZY in index.html). Colours follow the
// dataviz reference palette: categorical slots for identity, blue <-> red with a grey midpoint for polarity; every
// chart has hover values and a table view, and labels are always in ink, never in the series colour.
const Other = (() => {
  const root = document.getElementById('other')
  const TOOLS = [['heatmap', 'Mapa rynku'], ['correlation', 'Korelacje'], ['yields', 'Rentowności'], ['seasonal', 'Sezonowość'],
    ['earnings', 'Wyniki spółek'], ['journal', 'Dziennik'], ['cot', 'COT'], ['ai', 'Asystent AI']]
  let current = localStorage.getItem('other-tool') || 'heatmap'
  if (!TOOLS.some(t => t[0] === current)) current = 'heatmap'
  let visible = false, timer = null, widgetTools = []
  const rendered = {}, charts = {}
  const panes = {}

  // ---- helpers ---------------------------------------------------------------------------------------------
  const $ = sel => root.querySelector(sel)
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const num = (n, d = 2) => Number.isFinite(n) ? n.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'
  const pct = (n, d = 2) => Number.isFinite(n) ? (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d) + '%' : '—'
  const big = n => Number.isFinite(n) ? Intl.NumberFormat('pl-PL', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : '—'
  const light = () => document.documentElement.dataset.colorMode === 'light'
  const blue = () => document.documentElement.dataset.colorMode === 'blue'
  const css = name => Theme.css(name)
  // Categorical slots in fixed order (validated: dark on #050505, light with labels / table view as relief).
  const SERIES = { dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'], light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    // on cobalt: no mid blues, which would vanish into the page
    blue: ['#8ec5ff', '#ff9a5c', '#5fe0a8', '#ffd25c', '#ff9cc2', '#b5f06a', '#c8bfff', '#ff8a8a'] }
  const series = i => SERIES[light() ? 'light' : blue() ? 'blue' : 'dark'][i % 8]
  // Diverging: blue (up) <-> red (down) through a grey midpoint; t in [-1, 1].
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})` }
  function diverging(t) {
    const mid = light() ? '#e6e3da' : blue() ? '#33499e' : '#383835', up = light() ? '#2a78d6' : blue() ? '#8ec5ff' : '#3987e5', down = light() ? '#e34948' : blue() ? '#ff8a8a' : '#e66767'
    if (!Number.isFinite(t)) return mid
    const c = Math.max(-1, Math.min(1, t))
    return c >= 0 ? mix(mid, up, c) : mix(mid, down, -c)
  }
  const inkOn = rgb => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? '#111' : '#fff' }
  async function json(url, options) {
    const r = await fetch(url, options)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status)
    return d
  }
  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem('other:' + key)) ?? fallback } catch { return fallback } },
    put(key, value) { try { localStorage.setItem('other:' + key, JSON.stringify(value)) } catch {} },
  }
  // One tooltip for all tools.
  let tip
  function showTip(html, event) {
    const host = event.target.closest('.widget .wbody') || root.querySelector('.ot')
    if (tip.parentElement !== host) host.append(tip)
    tip.innerHTML = html; tip.hidden = false
    const r = host.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight
    let x = event.clientX - r.left + 14, y = event.clientY - r.top + 14
    if (x + w > r.width - 6) x = event.clientX - r.left - w - 14
    if (y + h > r.height - 6) y = event.clientY - r.top - h - 14
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px'
  }
  const hideTip = () => { if (tip) tip.hidden = true }
  function lwChart(host, options = {}) {
    const c = LightweightCharts.createChart(host, { autoSize: true, ...chartTheme(), localization: { locale: 'pl-PL' }, timeScale: { ...chartTheme().timeScale, timeVisible: false }, crosshair: { mode: 1, ...chartTheme().crosshair }, ...options })
    return c
  }
  const status = (el, text, error) => { el.textContent = text; el.classList.toggle('err', !!error) }
  const tableToggle = key => `<button class="ot-mini" data-table="${key}" aria-pressed="false">tabela</button>`
  function wireTable(pane, key) {
    const button = pane.querySelector(`[data-table="${key}"]`), table = pane.querySelector(`[data-table-view="${key}"]`)
    if (!button || !table) return
    button.onclick = () => { const on = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(on)); table.hidden = !on }
  }
  // Open a symbol on the chart page (the active chart panel), like a click on the ticker tape.
  function openOnChart(symbol) {
    if (typeof panels === 'undefined' || typeof setSymbol !== 'function') return
    tab('charts'); setSymbol(panels[active], symbol)
  }

  // ---- shell -----------------------------------------------------------------------------------------------
  function build() {
    root.innerHTML = `<div class="ot">
      <nav class="ot-nav" role="tablist" aria-label="Narzędzia">${TOOLS.map(([id, name]) => `<button role="tab" data-tool="${id}">${name}</button>`).join('')}</nav>
      <div class="ot-body">${TOOLS.map(([id]) => `<section class="ot-pane" data-pane="${id}" hidden></section>`).join('')}</div>
      <div class="ot-tip" hidden></div></div>`
    tip = $('.ot-tip')
    TOOLS.forEach(([id]) => { panes[id] = root.querySelector(`[data-pane="${id}"]`); panes[id].addEventListener('pointerleave', hideTip) })
    $('.ot-nav').onclick = e => { const id = e.target.closest('[data-tool]')?.dataset.tool; if (id) open(id) }
    root.addEventListener('pointerleave', hideTip)
    window.addEventListener('themechange', () => { for (const id of Object.keys(rendered)) repaint[id]?.() })
  }
  function open(id) {
    current = id; localStorage.setItem('other-tool', id)
    root.querySelectorAll('.ot-nav [data-tool]').forEach(b => { b.classList.toggle('active', b.dataset.tool === id); b.setAttribute('aria-selected', String(b.dataset.tool === id)) })
    root.querySelectorAll('.ot-pane').forEach(p => { p.hidden = p.dataset.pane !== id })
    hideTip()
    const pane = panes[id]
    if (!rendered[id]) { rendered[id] = true; tools[id](pane) } else refreshers[id]?.()
  }
  const repaint = {}, refreshers = {}

  // ---- 1. market heat map (squarified treemap) -------------------------------------------------------------
  function squarify(items, x, y, w, h) {
    const out = [], total = items.reduce((s, i) => s + i.value, 0)
    if (!total || w <= 0 || h <= 0) return out
    let rest = items.map(i => ({ item: i, area: i.value / total * w * h })), row = []
    const worst = (list, side) => { const s = list.reduce((a, r) => a + r.area, 0), max = Math.max(...list.map(r => r.area)), min = Math.min(...list.map(r => r.area)); return Math.max(side * side * max / (s * s), s * s / (side * side * min)) }
    const place = list => {
      const s = list.reduce((a, r) => a + r.area, 0)
      if (w >= h) { const cw = s / h; let cy = y; for (const r of list) { const rh = r.area / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh } x += cw; w -= cw }
      else { const rh = s / w; let cx = x; for (const r of list) { const cw = r.area / rh; out.push({ ...r, x: cx, y, w: cw, h: rh }); cx += cw } y += rh; h -= rh }
    }
    while (rest.length) {
      const side = Math.min(w, h), next = rest[0]
      if (!row.length || worst([...row, next], side) <= worst(row, side)) row.push(rest.shift())
      else { place(row); row = [] }
    }
    if (row.length) place(row)
    return out
  }
  const tools = {
    heatmap(pane) {
      pane.innerHTML = `<header class="ot-head"><b>Mapa rynku</b><span>~110 największych spółek USA · wielkość = kapitalizacja · kolor = zmiana dzienna</span><span class="grow"></span>
        <span class="ot-legend-bar"><i>−3%</i><span class="ot-ramp"></span><i>+3%</i></span>${tableToggle('heat')}<span class="ot-status"></span></header>
        <div class="ot-map"></div><div class="ot-table" data-table-view="heat" hidden></div>`
      wireTable(pane, 'heat')
      const map = pane.querySelector('.ot-map'), st = pane.querySelector('.ot-status')
      let data = store.get('heatmap', null)
      const draw = () => {
        pane.querySelector('.ot-ramp').style.background = `linear-gradient(90deg, ${diverging(-1)}, ${diverging(0)}, ${diverging(1)})`
        if (!data) return
        const r = map.getBoundingClientRect(), W = r.width, H = r.height
        if (W < 50 || H < 50) return
        const sectors = data.sectors.map(name => { const list = data.items.filter(i => i.sector === name).sort((a, b) => b.cap - a.cap); return { name, list, value: list.reduce((s, i) => s + i.cap, 0) } }).filter(s => s.value).sort((a, b) => b.value - a.value)
        let html = ''
        for (const s of squarify(sectors, 0, 0, W, H)) {
          const head = s.h > 60 && s.w > 70 ? 15 : 0
          html += `<div class="ot-sector" style="left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px">${head ? `<span>${esc(s.item.name)}</span>` : ''}</div>`
          for (const c of squarify(s.item.list.map(i => ({ ...i, value: i.cap })), s.x + 1, s.y + head + 1, s.w - 2, s.h - head - 2)) {
            const bg = diverging(c.item.change / 3), fg = inkOn(bg), label = c.w > 38 && c.h > 22
            html += `<div class="ot-cell" data-s="${esc(c.item.symbol)}" style="left:${c.x}px;top:${c.y}px;width:${Math.max(0, c.w - 2)}px;height:${Math.max(0, c.h - 2)}px;background:${bg};color:${fg}">${label ? `<b style="font-size:${Math.max(9, Math.min(18, Math.sqrt(c.w * c.h) / 5))}px">${esc(c.item.symbol)}</b>${c.h > 36 ? `<small>${pct(c.item.change)}</small>` : ''}` : ''}</div>`
          }
        }
        map.innerHTML = html
        const rows = [...data.items].sort((a, b) => b.change - a.change)
        pane.querySelector('[data-table-view="heat"]').innerHTML = `<table><thead><tr><th>Spółka</th><th>Sektor</th><th>Cena</th><th>Zmiana</th><th>Kapitalizacja</th></tr></thead><tbody>${rows.map(i => `<tr><td><b>${esc(i.symbol)}</b> ${esc(i.name)}</td><td>${esc(i.sector)}</td><td>${num(i.price)}</td><td>${pct(i.change)}</td><td>${big(i.cap)} $</td></tr>`).join('')}</tbody></table>`
      }
      const cellTip = (s, e, touch) => {
        const i = s && data?.items.find(x => x.symbol === s)
        if (!i) return hideTip()
        showTip(`<b>${esc(i.symbol)}</b> · ${esc(i.name)}<br>${esc(i.sector)}<br>cena ${num(i.price)} · <b>${pct(i.change)}</b><br>kapitalizacja ${big(i.cap)} $<br><small>${touch ? 'stuknij ponownie, aby otworzyć wykres' : 'kliknij, aby otworzyć wykres'}</small>`, e)
      }
      // Touch has no hover: the first tap on a tile shows its details, a second tap on the same tile opens the chart.
      let lastPointer = 'mouse', tapped = null
      map.addEventListener('pointerdown', e => { lastPointer = e.pointerType })
      map.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') cellTip(e.target.closest('.ot-cell')?.dataset.s, e, false) })
      map.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTip() })
      map.addEventListener('click', e => {
        const s = e.target.closest('.ot-cell')?.dataset.s
        if (!s) { tapped = null; return hideTip() }
        if (lastPointer !== 'mouse' && tapped !== s) { tapped = s; cellTip(s, e, true); return }
        tapped = null; hideTip(); openOnChart(s)
      })
      new ResizeObserver(() => draw()).observe(map)
      const load = async () => {
        try { data = await json('/api/extra/heatmap'); store.put('heatmap', data); status(st, 'aktualizacja ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })); draw() }
        catch (e) { status(st, 'błąd: ' + e.message, true) }
      }
      repaint.heatmap = draw; refreshers.heatmap = () => { draw(); load() }
      draw(); load()
    },

    // ---- 2. correlations & comparison ------------------------------------------------------------------------
    correlation(pane) {
      const saved = store.get('corr', { symbols: 'NQ1!, ES1!, YM1!, DXY1!, GC1!, CL1!, BTC-USD, ^TNX', days: 60, range: 180 })
      pane.innerHTML = `<header class="ot-head"><b>Korelacje i porównanie</b><form class="ot-form"><input name="symbols" value="${esc(saved.symbols)}" aria-label="Instrumenty (do 8, po przecinku)" spellcheck="false">
        <select name="days" aria-label="Okno korelacji">${[20, 60, 120, 250].map(d => `<option value="${d}"${d === saved.days ? ' selected' : ''}>${d} sesji</option>`).join('')}</select><button>Pokaż</button></form><span class="ot-status"></span></header>
        <div class="ot-split"><div class="ot-card"><h4>Korelacja dziennych zmian <i>(−1 … +1)</i></h4><div class="ot-matrix"></div></div>
        <div class="ot-card grow"><h4>Porównanie w % <span class="ot-ranges">${[[30, '1M'], [90, '3M'], [180, '6M'], [365, '1R']].map(([d, l]) => `<button class="ot-mini" data-range="${d}" aria-pressed="${d === saved.range}">${l}</button>`).join('')}</span></h4><div class="ot-legend"></div><div class="ot-lw"></div></div></div>`
      const st = pane.querySelector('.ot-status'), form = pane.querySelector('form')
      let data = null, chart = null, lines = []
      const drawMatrix = () => {
        if (!data) return
        const n = data.symbols.length
        pane.querySelector('.ot-matrix').innerHTML = `<table class="ot-corr"><thead><tr><th></th>${data.symbols.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>${data.symbols.map((s, i) => `<tr><th>${esc(s)}</th>${Array.from({ length: n }, (_, j) => {
          const v = data.matrix[i][j], bg = i === j ? 'transparent' : diverging(v)
          return `<td style="background:${bg};color:${i === j ? css('--dim') : inkOn(bg)}" data-i="${i}" data-j="${j}">${v === null ? '—' : v.toFixed(2)}</td>`
        }).join('')}</tr>`).join('')}</tbody></table>`
      }
      const drawLines = () => {
        if (!data) return
        if (!chart) chart = lwChart(pane.querySelector('.ot-lw'), { rightPriceScale: { ...chartTheme().rightPriceScale } })
        lines.forEach(l => chart.removeSeries(l)); lines = []
        const from = Date.now() / 1000 - saved.range * 86400
        data.series.slice(0, 8).forEach((s, i) => {
          const line = chart.addSeries(LightweightCharts.LineSeries, { color: series(i), lineWidth: 2, title: s.symbol, priceFormat: { type: 'custom', formatter: v => pct(v, 1) }, lastValueVisible: true, priceLineVisible: false })
          line.setData(TerminalExtraData.rebase(s.points.map(([time, close]) => ({ time, close })), from))
          lines.push(line)
        })
        chart.timeScale().fitContent()
        pane.querySelector('.ot-legend').innerHTML = data.series.slice(0, 8).map((s, i) => `<span><i style="background:${series(i)}"></i>${esc(s.symbol)}</span>`).join('') + (data.series.length > 8 ? '<span>(pokazuję 8 pierwszych)</span>' : '')
      }
      pane.querySelector('.ot-matrix').addEventListener('pointermove', e => {
        const td = e.target.closest('td[data-i]')
        if (!td || !data) return hideTip()
        const a = data.symbols[+td.dataset.i], b = data.symbols[+td.dataset.j], v = data.matrix[+td.dataset.i][+td.dataset.j]
        showTip(`<b>${esc(a)} ↔ ${esc(b)}</b><br>korelacja ${v === null ? '—' : v.toFixed(2)} (${data.days} sesji)<br><small>${v === null ? '' : Math.abs(v) >= .7 ? 'silna' : Math.abs(v) >= .4 ? 'umiarkowana' : 'słaba'}${v !== null && v < 0 ? ', odwrotna' : ''}</small>`, e)
      })
      pane.querySelector('.ot-ranges').onclick = e => {
        const d = Number(e.target.closest('[data-range]')?.dataset.range)
        if (!d) return
        saved.range = d; store.put('corr', saved)
        pane.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === d)))
        drawLines()
      }
      const load = async () => {
        status(st, 'pobieranie…')
        try {
          data = await json(`/api/extra/correlation?symbols=${encodeURIComponent(saved.symbols.replace(/\s+/g, ''))}&days=${saved.days}`)
          status(st, `${data.symbols.length} instrumentów · dzienne zamknięcia z Yahoo`); drawMatrix(); drawLines()
        } catch (e) { status(st, 'błąd: ' + e.message + ' (2–10 instrumentów, np. NQ1!, AAPL, BTC-USD, ^TNX)', true) }
      }
      form.onsubmit = e => { e.preventDefault(); saved.symbols = form.symbols.value; saved.days = Number(form.days.value); store.put('corr', saved); load() }
      repaint.correlation = () => { drawMatrix(); if (chart) { chart.applyOptions(chartTheme()); drawLines() } }
      load()
    },

    // ---- 3. US Treasury yield curve --------------------------------------------------------------------------
    yields(pane) {
      pane.innerHTML = `<header class="ot-head"><b>Krzywa rentowności USA</b><span>obligacje skarbowe, rentowność w %</span><span class="grow"></span>${tableToggle('yld')}<span class="ot-status"></span></header>
        <div class="ot-tiles"></div><div class="ot-split"><div class="ot-card grow"><h4>Krzywa <i>(1M … 30L)</i></h4><div class="ot-legend"></div><svg class="ot-svg" data-chart="curve"></svg></div>
        <div class="ot-card grow"><h4>Spread 10L−2L i 10L−3M <i>(punkty %, rok)</i></h4><div class="ot-legend" data-legend="spread"></div><div class="ot-lw"></div></div></div>
        <div class="ot-table" data-table-view="yld" hidden></div>`
      wireTable(pane, 'yld')
      const st = pane.querySelector('.ot-status'), svg = pane.querySelector('[data-chart="curve"]')
      let data = null, chart = null, spreadLines = []
      const drawCurve = () => {
        if (!data) return
        const r = svg.getBoundingClientRect(), W = r.width, H = r.height
        if (W < 80 || H < 80) return
        const m = data.maturities, pad = { l: 44, r: 96, t: 12, b: 26 }, all = data.curves.flatMap(c => m.map(k => c.yields[k])).filter(Number.isFinite)
        const lo = Math.floor(Math.min(...all) * 4) / 4 - 0.25, hi = Math.ceil(Math.max(...all) * 4) / 4 + 0.25
        const X = i => pad.l + i * (W - pad.l - pad.r) / (m.length - 1), Y = v => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b)
        let g = ''
        for (let v = Math.ceil(lo * 2) / 2; v <= hi; v += 0.5) g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="axis">${v.toFixed(1)}</text>`
        m.forEach((k, i) => { if (i % (W < 500 ? 2 : 1) === 0) g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" class="axis">${esc(k.replace(' Month', 'M').replace(' Mo', 'M').replace(' Yr', 'L'))}</text>` })
        data.curves.forEach((c, ci) => {
          const pts = m.map((k, i) => Number.isFinite(c.yields[k]) ? [X(i), Y(c.yields[k])] : null).filter(Boolean)
          g += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${series(ci)}" stroke-width="${ci ? 1.5 : 2.5}" ${ci ? 'stroke-dasharray="' + ['', '6 3', '3 3', '1 3'][ci] + '"' : ''} stroke-linejoin="round"/>`
          if (!ci) pts.forEach(p => { g += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${series(0)}" stroke="${css('--bg')}" stroke-width="2"/>` })
        })
        // End labels, nudged apart so they never overlap (at least 13 px between baselines).
        const ends = data.curves.map((c, ci) => ({ ci, label: c.label, y: Number.isFinite(c.yields[m.at(-1)]) ? Y(c.yields[m.at(-1)]) : null })).filter(e => e.y !== null).sort((a, b) => a.y - b.y)
        ends.forEach((e, i) => { if (i && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13 })
        ends.forEach(e => { g += `<line x1="${X(m.length - 1) + 3}" x2="${X(m.length - 1) + 10}" y1="${e.y}" y2="${e.y}" stroke="${series(e.ci)}" stroke-width="2"/><text x="${X(m.length - 1) + 13}" y="${e.y + 4}" class="lbl">${esc(e.label)}</text>` })
        g += `<line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>`
        svg.innerHTML = g
        svg.onpointermove = e => {
          const x = e.clientX - r.left, i = Math.max(0, Math.min(m.length - 1, Math.round((x - pad.l) / ((W - pad.l - pad.r) / (m.length - 1)))))
          const cross = svg.querySelector('.cross'); cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible')
          showTip(`<b>${esc(m[i])}</b><br>${data.curves.map((c, ci) => `<i class="sw" style="background:${series(ci)}"></i>${esc(c.label)} (${c.date}): <b>${num(c.yields[m[i]])}%</b>`).join('<br>')}`, e)
        }
        svg.onpointerleave = () => { svg.querySelector('.cross')?.setAttribute('visibility', 'hidden'); hideTip() }
        pane.querySelector('.ot-legend').innerHTML = data.curves.map((c, ci) => `<span><i style="background:${series(ci)}"></i>${esc(c.label)} · ${c.date}</span>`).join('')
      }
      const drawSpread = () => {
        if (!data) return
        if (!chart) chart = lwChart(pane.querySelector('.ot-lw'))
        spreadLines.forEach(l => chart.removeSeries(l)); spreadLines = []
        ;[['s10y2y', '10L−2L'], ['s10y3m', '10L−3M']].forEach(([key, title], i) => {
          const l = chart.addSeries(LightweightCharts.LineSeries, { color: series(i), lineWidth: 2, title, priceLineVisible: false, priceFormat: { type: 'custom', formatter: v => v.toFixed(2) } })
          l.setData(data.spreads.filter(s => Number.isFinite(s[key])).map(s => ({ time: s.date, value: s[key] })))
          if (!i) l.createPriceLine({ price: 0, color: css('--dim'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '0 = płaska krzywa' })
          spreadLines.push(l)
        })
        chart.timeScale().fitContent()
        pane.querySelector('[data-legend="spread"]').innerHTML = `<span><i style="background:${series(0)}"></i>10L−2L</span><span><i style="background:${series(1)}"></i>10L−3M</span><span>poniżej 0 = odwrócona krzywa</span>`
      }
      const drawRest = () => {
        if (!data) return
        const t = data.curves[0].yields, y = data.curves.find(c => c.label === 'Rok temu')?.yields || {}
        const tile = (label, v, prev, unit = '%') => `<div class="ot-tile"><small>${label}</small><b>${num(v)}${unit}</b><span>${Number.isFinite(prev) ? (v - prev >= 0 ? '+' : '−') + Math.abs(v - prev).toFixed(2) + ' r/r' : ''}</span></div>`
        pane.querySelector('.ot-tiles').innerHTML = tile('3M', t['3 Mo'], y['3 Mo']) + tile('2L', t['2 Yr'], y['2 Yr']) + tile('10L', t['10 Yr'], y['10 Yr']) + tile('30L', t['30 Yr'], y['30 Yr']) + tile('10L−2L', t['10 Yr'] - t['2 Yr'], y['10 Yr'] - y['2 Yr'], ' pp')
        pane.querySelector('[data-table-view="yld"]').innerHTML = `<table><thead><tr><th>Termin</th>${data.curves.map(c => `<th>${esc(c.label)}<br><small>${c.date}</small></th>`).join('')}</tr></thead><tbody>${data.maturities.map(k => `<tr><td>${esc(k)}</td>${data.curves.map(c => `<td>${num(c.yields[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      }
      new ResizeObserver(() => drawCurve()).observe(svg)
      repaint.yields = () => { drawCurve(); if (chart) { chart.applyOptions(chartTheme()); drawSpread() } }
      ;(async () => {
        status(st, 'pobieranie…')
        try { data = await json('/api/extra/yields'); status(st, `${data.source} · ${data.curves[0].date}`); drawRest(); drawCurve(); drawSpread() }
        catch (e) { status(st, 'błąd: ' + e.message, true) }
      })()
    },

    // ---- 4. seasonality --------------------------------------------------------------------------------------
    seasonal(pane) {
      const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'], DAYS = ['pon', 'wt', 'śr', 'czw', 'pt']
      let symbol = store.get('seasonal', 'NQ1!')
      pane.innerHTML = `<header class="ot-head"><b>Sezonowość</b><form class="ot-form"><input name="symbol" value="${esc(symbol)}" aria-label="Instrument" spellcheck="false"><button>Pokaż</button></form><span class="ot-status"></span></header>
        <div class="ot-split"><div class="ot-card grow"><h4>Średnia zmiana w miesiącu <i>(słupek = średnia, etykieta = % lat na plusie)</i></h4><svg class="ot-svg" data-chart="months"></svg></div>
        <div class="ot-card"><h4>Dzień tygodnia <i>(średnia dzienna zmiana, 10 lat)</i></h4><svg class="ot-svg" data-chart="days"></svg></div></div>
        <div class="ot-card"><h4>Miesiąc po miesiącu</h4><div class="ot-table ot-years"></div></div>`
      const st = pane.querySelector('.ot-status'), form = pane.querySelector('form')
      let data = null
      function bars(svg, rows, labels, digits) {
        const r = svg.getBoundingClientRect(), W = r.width, H = r.height
        if (W < 80 || H < 60) return
        const vals = rows.map(x => x.avg).filter(Number.isFinite), max = Math.max(0.01, ...vals.map(Math.abs)) * 1.15
        const pad = { l: 58, r: 8, t: 18, b: 22 }, bw = (W - pad.l - pad.r) / rows.length, Y = v => pad.t + (max - v) / (2 * max) * (H - pad.t - pad.b)
        let g = `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0)}" y2="${Y(0)}" class="base"/><text x="${pad.l - 6}" y="${Y(max / 1.15) + 4}" text-anchor="end" class="axis">${pct(max / 1.15, digits)}</text><text x="${pad.l - 6}" y="${Y(-max / 1.15) + 4}" text-anchor="end" class="axis">${pct(-max / 1.15, digits)}</text>`
        rows.forEach((x, i) => {
          const cx = pad.l + i * bw, w = Math.max(2, bw - 6), y0 = Y(0), y1 = Number.isFinite(x.avg) ? Y(x.avg) : y0
          g += `<rect x="${cx + 3}" y="${Math.min(y0, y1)}" width="${w}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="2" fill="${diverging(x.avg >= 0 ? 1 : -1)}" data-i="${i}"/>`
          g += `<rect x="${cx}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" fill="transparent" data-i="${i}"/>`
          g += `<text x="${cx + bw / 2}" y="${H - 6}" text-anchor="middle" class="axis">${labels[i]}</text>`
          if (Number.isFinite(x.up) && bw > 26) g += `<text x="${cx + bw / 2}" y="${x.avg >= 0 ? y1 - 4 : y1 + 12}" text-anchor="middle" class="lbl small">${Math.round(x.up * 100)}%</text>`
        })
        svg.innerHTML = g
        svg.onpointermove = e => {
          const i = e.target.dataset?.i
          if (i === undefined) return hideTip()
          const x = rows[i]
          showTip(`<b>${labels[i]}</b><br>średnio ${pct(x.avg, digits)} · mediana ${pct(x.median, digits)}<br>na plusie ${Number.isFinite(x.up) ? Math.round(x.up * 100) + '%' : '—'} (${x.n} ${digits > 2 ? 'sesji' : 'lat'})`, e)
        }
        svg.onpointerleave = hideTip
      }
      const draw = () => {
        if (!data) return
        bars(pane.querySelector('[data-chart="months"]'), data.months, MONTHS, 2)
        bars(pane.querySelector('[data-chart="days"]'), data.weekdays, DAYS, 3)
        const years = Object.keys(data.years).sort().reverse()
        pane.querySelector('.ot-years').innerHTML = `<table class="ot-heat"><thead><tr><th>Rok</th>${MONTHS.map(m => `<th>${m}</th>`).join('')}<th>Rok</th></tr></thead><tbody>${years.map(y => {
          const row = data.years[y], total = row.filter(Number.isFinite).reduce((a, v) => a * (1 + v / 100), 1) - 1
          return `<tr><th>${y}</th>${row.map(v => { const bg = Number.isFinite(v) ? diverging(v / 8) : 'transparent'; return `<td style="background:${bg};color:${Number.isFinite(v) ? inkOn(bg) : css('--dim')}">${Number.isFinite(v) ? pct(v, 1) : ''}</td>` }).join('')}<td><b>${pct(total * 100, 1)}</b></td></tr>`
        }).join('')}</tbody></table>`
      }
      const load = async () => {
        status(st, 'pobieranie…')
        try { data = await json('/api/extra/seasonal?symbol=' + encodeURIComponent(symbol)); status(st, `${data.name} · od ${new Date(data.from * 1000).getUTCFullYear()} · miesięczne zamknięcia z Yahoo`); draw() }
        catch (e) { status(st, 'błąd: ' + e.message, true) }
      }
      form.onsubmit = e => { e.preventDefault(); symbol = form.symbol.value.trim().toUpperCase(); store.put('seasonal', symbol); load() }
      pane.querySelectorAll('svg').forEach(s => new ResizeObserver(() => draw()).observe(s))
      repaint.seasonal = draw
      load()
    },

    // ---- 5. earnings with the price reaction -----------------------------------------------------------------
    earnings(pane) {
      let symbol = store.get('earnings', 'NVDA')
      pane.innerHTML = `<header class="ot-head"><b>Wyniki spółek i reakcja ceny</b><form class="ot-form"><input name="symbol" value="${esc(symbol)}" aria-label="Ticker spółki" spellcheck="false"><button>Pokaż</button></form><span class="ot-status"></span></header>
        <div class="ot-tiles"></div><div class="ot-card"><h4>Ruch ceny w sesji po publikacji <i>(zamknięcie do zamknięcia)</i></h4><svg class="ot-svg" data-chart="react"></svg></div>
        <div class="ot-card"><div class="ot-table" data-list></div></div>`
      const st = pane.querySelector('.ot-status'), form = pane.querySelector('form'), svg = pane.querySelector('svg')
      const TIMING = { AMC: 'po sesji', BMO: 'przed sesją', DMH: 'w trakcie', '?': 'godzina nieznana' }
      let data = null
      const draw = () => {
        if (!data) return
        const list = [...data.reports].reverse().filter(r => Number.isFinite(r.move))
        const r = svg.getBoundingClientRect(), W = r.width, H = r.height
        if (W > 80 && H > 60 && list.length) {
          const max = Math.max(1, ...list.map(x => Math.abs(x.move))) * 1.2, pad = { l: 40, r: 8, t: 16, b: 22 }, bw = (W - pad.l - pad.r) / list.length, Y = v => pad.t + (max - v) / (2 * max) * (H - pad.t - pad.b)
          let g = `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(0)}" y2="${Y(0)}" class="base"/>`
          if (Number.isFinite(data.avgAbsMove)) for (const s of [1, -1]) g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(s * data.avgAbsMove)}" y2="${Y(s * data.avgAbsMove)}" class="grid dashed"/>`
          g += `<text x="${pad.l - 6}" y="${Y(data.avgAbsMove || 0) + 4}" text-anchor="end" class="axis">±${(data.avgAbsMove || 0).toFixed(1)}%</text>`
          list.forEach((x, i) => {
            const cx = pad.l + i * bw, y0 = Y(0), y1 = Y(x.move)
            g += `<rect x="${cx + 3}" y="${Math.min(y0, y1)}" width="${Math.max(2, bw - 6)}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="2" fill="${diverging(x.move >= 0 ? 1 : -1)}"/><rect x="${cx}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" fill="transparent" data-i="${i}"/>`
            if (bw > 34) g += `<text x="${cx + bw / 2}" y="${x.move >= 0 ? y1 - 4 : y1 + 12}" text-anchor="middle" class="lbl small">${pct(x.move, 1)}</text>`
            if (bw > 44 || i % 2 === 0) g += `<text x="${cx + bw / 2}" y="${H - 6}" text-anchor="middle" class="axis">${x.day.slice(2, 7)}</text>`
          })
          svg.innerHTML = g
          svg.onpointermove = e => {
            const i = e.target.dataset?.i
            if (i === undefined) return hideTip()
            const x = list[i]
            showTip(`<b>${x.day}</b> ${TIMING[x.timing] || ''}<br>EPS ${num(x.actual)} vs prognoza ${num(x.estimate)} (${Number.isFinite(x.surprise) ? pct(x.surprise, 1) : '—'})<br>luka ${pct(x.gap)} · sesja ${x.reactionDay}: <b>${pct(x.move)}</b>`, e)
          }
          svg.onpointerleave = hideTip
        } else svg.innerHTML = ''
        const tile = (label, v) => `<div class="ot-tile"><small>${label}</small><b>${v}</b></div>`
        pane.querySelector('.ot-tiles').innerHTML = tile('Spółka', esc(data.name)) + tile('Następne wyniki', data.next ? new Date(data.next * 1000).toLocaleDateString('pl-PL') : '—') + tile('Średni ruch (|%|)', Number.isFinite(data.avgAbsMove) ? data.avgAbsMove.toFixed(2) + '%' : '—') + tile('Sesje na plusie', Number.isFinite(data.upShare) ? Math.round(data.upShare * 100) + '%' : '—')
        pane.querySelector('[data-list]').innerHTML = `<table><thead><tr><th>Publikacja</th><th>Pora</th><th>EPS prognoza</th><th>EPS wynik</th><th>Zaskoczenie</th><th>Luka</th><th>Ruch w sesji</th></tr></thead><tbody>${data.reports.map(x => `<tr><td>${x.day}${x.quarter ? ` <small>${esc(x.quarter)}</small>` : ''}</td><td>${TIMING[x.timing] || '—'}</td><td>${num(x.estimate)}</td><td>${num(x.actual)}</td><td>${Number.isFinite(x.surprise) ? pct(x.surprise, 1) : '—'}</td><td>${pct(x.gap)}</td><td><b>${pct(x.move)}</b></td></tr>`).join('')}</tbody></table>`
      }
      const load = async () => {
        status(st, 'pobieranie…')
        try { data = await json('/api/extra/earnings-history?symbol=' + encodeURIComponent(symbol)); status(st, `${data.reports.length} publikacji · Yahoo Finance`); draw() }
        catch (e) { status(st, 'błąd: ' + e.message, true) }
      }
      form.onsubmit = e => { e.preventDefault(); symbol = form.symbol.value.trim().toUpperCase(); store.put('earnings', symbol); load() }
      new ResizeObserver(() => draw()).observe(svg)
      repaint.earnings = draw
      load()
    },

    // ---- 6. trade journal ------------------------------------------------------------------------------------
    // The journal itself is journal.js (modelled on LuxAlgo Trade Journal); this page supplies what only it knows:
    // the quarter / session context of a moment, the active chart symbol and an off-screen chart snapshot.
    journal(pane) {
      const SESSION = { Q1: 'Azja', Q2: 'Londyn', Q3: 'NY AM', Q4: 'NY PM' }
      function context(symbol, ms) {
        const q = typeof DayHighs !== 'undefined' ? DayHighs.quarters(ms) : null
        const monthly = typeof DayHighs !== 'undefined' ? DayHighs.monthly(ms) : null
        const cycles = (typeof cycleCache !== 'undefined' && cycleCache[symbol]?.data) || (typeof stash !== 'undefined' && stash.get('highs:' + symbol)) || null
        return { monthly, weekly: q?.weekly, daily: q?.daily, m90: q?.m90, micro: q?.micro, session: q ? SESSION[q.daily] : null,
          weekday: new Date(ms).toLocaleDateString('pl-PL', { weekday: 'short', timeZone: 'America/New_York' }),
          cycles: cycles ? { hotd: cycles.hotd, lotd: cycles.lotd, hotw: cycles.hotw, lotw: cycles.lotw } : null }
      }
      // The chart pages are hidden while this one is open, so the snapshot is drawn on its own chart off screen,
      // with the entry, stop and target marked.
      async function snapshot(t) {
        let candles = typeof panels !== 'undefined' ? panels.find(p => p.symbol === t.symbol && p.candles?.length)?.candles : null
        if (!candles) try { candles = (await json(`/api/chart?symbol=${encodeURIComponent(t.symbol)}&interval=${typeof frame !== 'undefined' ? frame : '1D'}`)).candles } catch { return null }
        if (!candles?.length) return null
        const host = document.createElement('div')
        host.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;height:520px'
        document.body.append(host)
        try {
          const c = LightweightCharts.createChart(host, { width: 960, height: 520, ...chartTheme(), timeScale: { ...chartTheme().timeScale, timeVisible: true } })
          const candle = c.addSeries(LightweightCharts.CandlestickSeries, { ...seriesTheme(), priceLineVisible: false })
          candle.setData(candles)
          for (const [price, title, style] of [[t.entry, 'wejście', 0], [t.stop, 'stop', 2], [t.target, 'cel', 2]]) if (Number.isFinite(price)) candle.createPriceLine({ price, title, color: css('--ink'), lineWidth: 1, lineStyle: style })
          const count = candles.length
          c.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 120), to: count + 6 })
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
          const image = c.takeScreenshot().toDataURL('image/jpeg', 0.82)
          c.remove()
          return { symbol: t.symbol, frame: typeof frame !== 'undefined' ? frame : '', image }
        } catch { return null } finally { host.remove() }
      }
      const currentSymbol = () => typeof panels !== 'undefined' ? panels[active]?.symbol || '' : ''
      const journal = Journal.mount(pane, { context, snapshot, currentSymbol })
      refreshers.journal = journal.refresh
    },

    // ---- 7. Commitments of Traders ---------------------------------------------------------------------------
    cot(pane) {
      const MARKETS = TerminalExtraData.COT
      let market = store.get('cot', 'NQ')
      pane.innerHTML = `<header class="ot-head"><b>COT: pozycje dużych graczy</b><select aria-label="Rynek">${Object.entries(MARKETS).map(([k, m]) => `<option value="${k}"${k === market ? ' selected' : ''}>${k} · ${esc(m.name)}</option>`).join('')}</select>
        <span>raport CFTC, co tydzień (stan na wtorek, publikacja w piątek)</span><span class="grow"></span><span class="ot-status"></span></header>
        <div class="ot-card"><div class="ot-table" data-latest></div></div>
        <div class="ot-card grow"><h4>Pozycja netto (long − short), kontrakty</h4><div class="ot-legend"></div><div class="ot-lw"></div></div>
        <div class="ot-card"><h4>Open interest</h4><div class="ot-lw small" data-oi></div></div>`
      const st = pane.querySelector('.ot-status'), select = pane.querySelector('select')
      let data = null, chart = null, oiChart = null, lines = [], oiLine = null
      const draw = () => {
        if (!data) return
        if (!chart) chart = lwChart(pane.querySelector('.ot-lw'))
        if (!oiChart) oiChart = lwChart(pane.querySelector('[data-oi]'))
        lines.forEach(l => chart.removeSeries(l)); lines = []
        const groups = data.series.at(-1).groups.map(g => g.name)
        groups.forEach((name, i) => {
          const l = chart.addSeries(LightweightCharts.LineSeries, { color: series(i), lineWidth: 2, title: name, priceLineVisible: false, priceFormat: { type: 'volume' } })
          l.setData(data.series.map(r => ({ time: r.date, value: r.groups[i].net })))
          if (!i) l.createPriceLine({ price: 0, color: css('--dim'), lineWidth: 1, lineStyle: 2, axisLabelVisible: false })
          lines.push(l)
        })
        chart.timeScale().fitContent()
        if (oiLine) oiChart.removeSeries(oiLine)
        oiLine = oiChart.addSeries(LightweightCharts.HistogramSeries, { color: css('--dim'), priceFormat: { type: 'volume' }, priceLineVisible: false })
        oiLine.setData(data.series.map(r => ({ time: r.date, value: r.openInterest })))
        oiChart.timeScale().fitContent()
        pane.querySelector('.ot-legend').innerHTML = groups.map((g, i) => `<span><i style="background:${series(i)}"></i>${esc(g)}</span>`).join('')
        // COT index: where this week's net stands inside its 3-year range (0 = most short, 100 = most long).
        const last = data.series.at(-1), prev = data.series.at(-2)
        pane.querySelector('[data-latest]').innerHTML = `<table><thead><tr><th>Grupa (${last.date})</th><th>Long</th><th>Short</th><th>Netto</th><th>Zmiana t/t</th><th>COT index 3L</th></tr></thead><tbody>${last.groups.map((g, i) => {
          const nets = data.series.map(r => r.groups[i].net), lo = Math.min(...nets), hi = Math.max(...nets), idx = hi > lo ? (g.net - lo) / (hi - lo) * 100 : null, ch = prev ? g.net - prev.groups[i].net : null
          return `<tr><td><i class="sw" style="background:${series(i)}"></i>${esc(g.name)}</td><td>${big(g.long)}</td><td>${big(g.short)}</td><td><b>${big(g.net)}</b></td><td>${ch === null ? '—' : (ch >= 0 ? '+' : '−') + big(Math.abs(ch))}</td><td>${idx === null ? '—' : `<span class="ot-bar"><span style="width:${idx}%"></span></span> ${Math.round(idx)}`}</td></tr>`
        }).join('')}<tr><td>Open interest</td><td colspan="2"></td><td><b>${big(last.openInterest)}</b></td><td>${prev ? (last.openInterest - prev.openInterest >= 0 ? '+' : '−') + big(Math.abs(last.openInterest - prev.openInterest)) : '—'}</td><td></td></tr></tbody></table>`
      }
      const load = async () => {
        status(st, 'pobieranie…')
        try { data = await json('/api/extra/cot?market=' + encodeURIComponent(market)); status(st, `${data.name} · ${data.series.length} tygodni · CFTC`); draw() }
        catch (e) { status(st, 'błąd: ' + e.message, true) }
      }
      select.onchange = () => { market = select.value; store.put('cot', market); load() }
      repaint.cot = () => { if (chart) { chart.applyOptions(chartTheme()); oiChart.applyOptions(chartTheme()); draw() } }
      load()
    },

    // ---- 8. AI assistant -------------------------------------------------------------------------------------
    ai(pane) {
      let history = []
      try { history = JSON.parse(sessionStorage.getItem('ai-chat') || '[]') } catch {}
      pane.innerHTML = `<header class="ot-head"><b>Asystent AI</b><span>odpowiada na podstawie tego, co pokazuje terminal: ceny, wykresy, cykle, kalendarz i nagłówki</span><span class="grow"></span><button class="ot-mini" data-act="new">nowa rozmowa</button></header>
        <div class="ot-chat" aria-live="polite"></div>
        <div class="ot-suggest">${['Podsumuj, co dziś dzieje się na rynku', 'Jakie wydarzenia z kalendarza mogą dziś ruszyć NQ?', 'W jakim kwartale powstały HOTD i LOTD na NQ i co z tego wynika?', 'Co mówią nagłówki o ryzyku geopolitycznym?'].map(q => `<button class="ot-mini" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <form class="ot-ask"><textarea name="q" rows="2" placeholder="Zapytaj o rynek… (Enter wysyła, Shift+Enter nowa linia)" aria-label="Pytanie do asystenta"></textarea><button>Wyślij</button></form>`
      const box = pane.querySelector('.ot-chat'), form = pane.querySelector('form'), input = form.q
      let busy = false
      const persist = () => { try { sessionStorage.setItem('ai-chat', JSON.stringify(history.slice(-24))) } catch {} }
      // Only the question is shown; the snapshot sent with it stays in the stored turn so later turns keep the same prefix (prompt cache).
      const shown = t => t.role === 'user' ? t.content.split('\n<terminal>')[0] : t.content
      function render(streaming) {
        box.innerHTML = history.map(t => `<div class="ot-msg ${t.role}"><b>${t.role === 'user' ? 'Ty' : 'AI'}</b><div>${esc(shown(t)).replace(/\n/g, '<br>')}</div></div>`).join('') +
          (streaming !== undefined ? `<div class="ot-msg assistant"><b>AI</b><div>${streaming ? esc(streaming).replace(/\n/g, '<br>') : '<i>analizuję dane terminala…</i>'}</div></div>` : '') ||
          '<p class="ot-empty">Zadaj pytanie albo wybierz podpowiedź. Do pytania dołączam aktualny obraz terminala (ceny, wykresy i cykle, kalendarz na dziś, nagłówki).</p>'
        box.scrollTop = box.scrollHeight
      }
      async function snapshot() {
        // Charts only refresh while on screen; make sure the assistant sees current candles and cycle labels.
        if (typeof refresh === 'function' && typeof panels !== 'undefined' && !panels.some(p => p.candles?.length)) { try { await refresh() } catch {} }
        const now = Date.now(), q = typeof DayHighs !== 'undefined' ? DayHighs.quarters(now) : null
        const chartsNow = typeof panels === 'undefined' ? [] : panels.filter(p => p.candles?.length).map(p => {
          const c = p.candles, last = c.at(-1), cyc = (typeof cycleCache !== 'undefined' && cycleCache[p.symbol]?.data) || null
          return { symbol: p.symbol, timeframe: frame, last: last.close, recentCandles: c.slice(-8).map(x => [new Date(x.time * 1000).toISOString().slice(0, 16), +x.open.toFixed(2), +x.high.toFixed(2), +x.low.toFixed(2), +x.close.toFixed(2)]),
            cycles: cyc ? { HOTM: cyc.hotm, LOTM: cyc.lotm, HOTW: cyc.hotw, LOTW: cyc.lotw, HOTD: cyc.hotd, LOTD: cyc.lotd } : null }
        })
        let calendar = []
        try { const ev = await json('/api/events'); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now); calendar = ev.events.filter(e => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(e.date)) >= day).slice(0, 25).map(e => ({ time: e.date, event: e.title, impact: e.impact, forecast: e.forecast, previous: e.previous })) } catch {}
        const tape = (typeof stash !== 'undefined' && stash.get('tape')) || []
        const news = (typeof headlines !== 'undefined' ? headlines : []).slice(0, 20).map(h => `${new Date(h.time).toISOString().slice(11, 16)}Z ${h.title}`)
        return { asOf: new Date(now).toISOString(), newYorkTime: new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York' }),
          currentQuarters: q ? { monthly: DayHighs.monthly(now), weekly: q.weekly, daily: q.daily, m90: q.m90, micro: q.micro, session: { Q1: 'Asia', Q2: 'London', Q3: 'NY AM', Q4: 'NY PM' }[q.daily] } : null,
          quotes: tape.slice(0, 50).map(t => ({ symbol: t.symbol, price: t.price, changePct: t.change })), charts: chartsNow, economicCalendarUSD: calendar, headlines: news }
      }
      async function ask(question) {
        if (busy || !question.trim()) return
        if (location.protocol === 'file:') { history.push({ role: 'user', content: question }, { role: 'assistant', content: 'Asystent działa na stronie w przeglądarce: klucz AI jest na serwerze, a aplikacja na Macu go nie ma.' }); render(); return }
        busy = true; form.querySelector('button').disabled = true
        const ctx = await snapshot()
        const { headlines: news, ...data } = ctx
        history.push({ role: 'user', content: `${question.trim()}\n<terminal>\n${JSON.stringify(data)}\n</terminal>\n<headlines>\n${news.join('\n')}\n</headlines>` })
        if (history.length > 23) history = history.slice(-23)
        while (history[0]?.role !== 'user') history.shift()
        render('')
        let text = ''
        try {
          const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) })
          if (!response.ok) {
            const err = await response.json().catch(() => ({}))
            text = err.error === 'ai-not-configured' ? 'Asystent nie jest jeszcze włączony: na serwerze brakuje klucza ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables).' : 'Błąd: ' + (err.error || 'HTTP ' + response.status)
          } else {
            const reader = response.body.getReader(), decoder = new TextDecoder()
            for (;;) { const { value, done } = await reader.read(); if (done) break; text += decoder.decode(value, { stream: true }); render(text) }
          }
        } catch (e) { text = text || 'Błąd połączenia: ' + e.message }
        history.push({ role: 'assistant', content: text.trim() || '(brak odpowiedzi)' }); persist()
        busy = false; form.querySelector('button').disabled = false; render()
      }
      form.onsubmit = e => { e.preventDefault(); const q = input.value; input.value = ''; ask(q) }
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit() } })
      pane.querySelector('.ot-suggest').onclick = e => { const q = e.target.closest('[data-q]')?.dataset.q; if (q) ask(q) }
      pane.querySelector('[data-act="new"]').onclick = () => { if (busy) return; history = []; persist(); render() }
      render()
    },
  }

  function unmountWidgets() {
    if (!root.firstChild) return
    const body = root.querySelector('.ot-body')
    TOOLS.forEach(([id]) => { if (panes[id].parentElement !== body) body.append(panes[id]); panes[id].hidden = true })
    root.querySelector('.ot').append(tip)
    hideTip()
    widgetTools = []
  }
  function startTimer() {
    clearInterval(timer)
    timer = setInterval(() => { if (visible && !document.hidden && (current === 'heatmap' && !widgetTools.length || widgetTools.includes('heatmap'))) refreshers.heatmap?.() }, 60000)
  }
  return {
    show(tool) {
      visible = true
      if (!root.firstChild) build()
      unmountWidgets()
      open(tool || current)
      startTimer()
    },
    showWidgets(ids) {
      visible = true
      if (!root.firstChild) build()
      unmountWidgets()
      widgetTools = ids.filter(id => panes[id])
      widgetTools.forEach(id => {
        const host = document.querySelector(`#homeGrid .widget[data-id="other-${id}"] .wbody`)
        if (!host) return
        const pane = panes[id]
        host.append(pane); pane.hidden = false
        if (!rendered[id]) { rendered[id] = true; tools[id](pane) }
        else repaint[id]?.()
      })
      startTimer()
    },
    unmountWidgets,
    hide() { visible = false; clearInterval(timer); hideTip() },
  }
})()
