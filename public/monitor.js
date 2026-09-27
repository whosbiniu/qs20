// Monitor tab: a world map drawn on a canvas (Mercator, Natural Earth outlines from world-data.js) with
// layers fed by /api/monitor: USGS earthquakes, NASA EONET events and military aircraft (adsb.lol),
// plus a list of GDELT headlines. Layers are told apart by shape, not colour, to match the terminal look.
const Monitor = (() => {
  const INK = '#ebe6d3', DIM = '#8c8a7c', LINE = '#3a3a34', BG = '#050505'
  const LAYERS = [['quakes', 'trzęsienia ziemi'], ['events', 'zdarzenia naturalne'], ['aircraft', 'samoloty wojskowe']]
  const MAX_LAT = 85
  let root, canvas, ctx, tip, data = null, timer = null, started = false, visible = false
  let view = { cx: 0.53, cy: 0.33, scale: 1200 }   // centre in unit-world coordinates, pixels per world width
  let size = { w: 0, h: 0, dpr: 1 }
  let layersOn = { quakes: true, events: true, aircraft: true }
  try { Object.assign(layersOn, JSON.parse(localStorage.getItem('monLayers') || '{}')) } catch {}
  // Antarctica is left out: Mercator cannot show it and it would smear across the bottom of the map.
  const land = (window.WORLD_POLYGONS || []).filter(polygon => polygon[0].some((v, i) => i % 2 && v > -60))
  let hit = [], selected = null, hover = null, drag = null, frame = 0

  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const clock = t => new Date(t).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 60 ? m + ' min temu' : m < 1440 ? Math.round(m / 60) + ' h temu' : Math.round(m / 1440) + ' d temu' }
  const mercY = lat => { const p = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180; return 0.5 - Math.log(Math.tan(Math.PI / 4 + p / 2)) / (2 * Math.PI) }
  const unitX = lon => (lon + 180) / 360

  function project(lon, lat, k = 0) {
    return [(unitX(lon) + k - view.cx) * view.scale + size.w / 2, (mercY(lat) - view.cy) * view.scale + size.h / 2]
  }
  function clampView() {
    view.scale = Math.max(Math.max(size.w, size.h * 0.9), Math.min(view.scale, size.w * 80))
    const half = size.h / 2 / view.scale
    view.cy = Math.max(half, Math.min(1 - half, view.cy))
    view.cx = ((view.cx % 1) + 1) % 1
  }

  function draw() {
    frame = 0
    if (!ctx || !visible) return
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, size.w, size.h)
    hit = []
    const copies = [-1, 0, 1]
    // graticule
    ctx.strokeStyle = '#151512'; ctx.lineWidth = 1; ctx.beginPath()
    for (const k of copies) for (let lon = -180; lon <= 180; lon += 30) { const [x] = project(lon, 0, k); ctx.moveTo(x, 0); ctx.lineTo(x, size.h) }
    for (let lat = -60; lat <= 60; lat += 30) { const [, y] = project(0, lat); ctx.moveTo(0, y); ctx.lineTo(size.w, y) }
    ctx.stroke()
    // land
    ctx.fillStyle = '#0d0d0b'; ctx.strokeStyle = '#4a483f'; ctx.lineWidth = 0.8
    for (const k of copies) {
      ctx.beginPath()
      for (const polygon of land) for (const ring of polygon) {
        // Keep rings continuous across the antimeridian; the three world copies cover the seam.
        let previous = null
        for (let i = 0; i < ring.length; i += 2) {
          let lon = ring[i]
          if (previous !== null) { while (lon - previous > 180) lon -= 360; while (lon - previous < -180) lon += 360 }
          previous = lon
          const [x, y] = project(lon, ring[i + 1], k)
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        }
        ctx.closePath()
      }
      ctx.fill('evenodd'); ctx.stroke()
    }
    if (data) {
      const zoom = view.scale / size.w
      const place = (layer, item, drawFn) => {
        for (const k of copies) {
          const [x, y] = project(item.lon, item.lat, k)
          if (x < -20 || y < -20 || x > size.w + 20 || y > size.h + 20) continue
          drawFn(x, y)
          hit.push({ layer, item, x, y })
        }
      }
      if (layersOn.events) for (const e of data.events) place('events', e, (x, y) => {
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath()
        ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.stroke()
      })
      if (layersOn.quakes) for (const q of data.quakes) place('quakes', q, (x, y) => {
        const r = 2 + q.mag * 1.5, fresh = Date.now() - q.time < 3600000
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7)
        ctx.fillStyle = fresh ? 'rgba(235,230,211,.35)' : 'rgba(235,230,211,.08)'; ctx.fill()
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke()
      })
      if (layersOn.aircraft) for (const a of data.aircraft) place('aircraft', a, (x, y) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate((a.track || 0) * Math.PI / 180)
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 3); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill()
        ctx.restore()
        if (zoom > 4 && a.callsign) { ctx.fillStyle = DIM; ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.fillText(a.callsign, x + 8, y + 3) }
      })
      // selection marker
      for (const h of hit) if (h.item === selected) {
        ctx.strokeStyle = INK; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(h.x, h.y, 14, 0, 7); ctx.stroke(); ctx.setLineDash([])
      }
    }
    // scale label
    ctx.fillStyle = DIM; ctx.font = '11px ui-monospace,Menlo,monospace'
    ctx.fillText('zoom ×' + (view.scale / Math.max(size.w, size.h * 0.9)).toFixed(1), 10, size.h - 10)
  }
  const redraw = () => { if (!frame) frame = requestAnimationFrame(draw) }

  function describe(layer, item) {
    if (layer === 'quakes') return [`M${item.mag.toFixed(1)} · trzęsienie ziemi`, item.place, `${clock(item.time)} (${ago(item.time)}) · głębokość ${Math.round(item.depth)} km`]
    if (layer === 'events') return [item.category || 'zdarzenie', item.title, `${clock(item.time)} (${ago(item.time)})`]
    return [`${item.callsign || item.id.toUpperCase()} · samolot wojskowy`, [item.type, item.reg].filter(Boolean).join(' · ') || '—',
      `wysokość ${item.alt === null ? '—' : item.alt + ' ft'} · prędkość ${item.speed === null ? '—' : Math.round(item.speed) + ' kt'}`]
  }
  const layerOf = item => data.quakes.includes(item) ? 'quakes' : data.events.includes(item) ? 'events' : 'aircraft'

  function select(item, center) {
    selected = item
    const box = root.querySelector('#monSel')
    if (!item) { box.innerHTML = '<div class="none">Kliknij punkt na mapie lub pozycję z listy.</div>'; redraw(); return }
    const layer = layerOf(item), [a, b, c] = describe(layer, item)
    const link = item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">otwórz źródło ↗</a>` : ''
    box.innerHTML = `<b>${esc(a)}</b><div>${esc(b)}</div><div class="dim">${esc(c)}</div><div class="dim">${item.lat.toFixed(2)}°, ${item.lon.toFixed(2)}°</div>${link}`
    if (center) { view.cx = unitX(item.lon); view.cy = mercY(item.lat); view.scale = Math.max(view.scale, size.w * 3); clampView() }
    redraw()
  }

  function renderLists() {
    if (!data) return
    const latest = [
      ...data.quakes.filter(q => q.mag >= 4.5).map(item => ({ item, time: item.time, text: `M${item.mag.toFixed(1)} · ${item.place}` })),
      ...data.events.map(item => ({ item, time: item.time, text: `${item.category} · ${item.title}` })),
    ].sort((a, b) => b.time - a.time).slice(0, 40)
    const list = root.querySelector('#monList')
    list.innerHTML = latest.map((row, i) => `<a class="item" href="#" data-i="${i}"><time>${new Date(row.time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><span class="t">${esc(row.text)}</span></a>`).join('') || '<div class="none">brak zdarzeń</div>'
    list.onclick = e => { const a = e.target.closest('[data-i]'); if (!a) return; e.preventDefault(); select(latest[+a.dataset.i].item, true) }
    const pl = typeof lang !== 'undefined' && lang === 'pl'
    root.querySelector('#monNews').innerHTML = data.articles.map(a =>
      `<a class="item" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="${esc(a.domain)}"><time>${new Date(a.time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: false })}</time><span class="t">${esc(pl && a.pl ? a.pl : a.title)}</span></a>`).join('')
      || `<div class="none">${data.failed.includes('articles') ? 'GDELT chwilowo niedostępny (limit zapytań)' : 'brak doniesień'}</div>`
  }

  function renderBar() {
    root.querySelector('#monLayers').innerHTML = LAYERS.map(([key, label]) =>
      `<button data-l="${key}" class="${layersOn[key] ? 'active' : ''}">${label}${data ? ` <i>${data[key].length}</i>` : ''}</button>`).join('')
    const status = root.querySelector('#monStatus')
    if (!data) return
    const names = { quakes: 'USGS', events: 'NASA EONET', aircraft: 'adsb.lol', articles: 'GDELT' }
    status.textContent = data.failed.length ? 'brak danych: ' + data.failed.map(f => names[f]).join(', ') : 'USGS · NASA EONET · adsb.lol · GDELT'
  }

  async function load() {
    try {
      const response = await fetch('/api/monitor')
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error)
      data = payload
      if (selected) selected = [...data.quakes, ...data.events, ...data.aircraft].find(i => i.id === selected.id) || null
      root.querySelector('#monUpdated').textContent = 'aktualizacja: ' + new Date().toLocaleTimeString('pl-PL')
    } catch (error) {
      root.querySelector('#monStatus').textContent = 'błąd pobierania danych: ' + error.message
      return
    }
    renderBar(); renderLists(); redraw()
  }

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect()
    size = { w: Math.max(200, box.width), h: Math.max(200, box.height), dpr: window.devicePixelRatio || 1 }
    canvas.width = size.w * size.dpr; canvas.height = size.h * size.dpr
    canvas.style.width = size.w + 'px'; canvas.style.height = size.h + 'px'
    clampView(); redraw()
  }

  function nearest(x, y) {
    let best = null, bestD = 100   // 10px radius
    for (const h of hit) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bestD) { best = h; bestD = d } }
    return best
  }

  function zoomAt(factor, x, y) {
    const before = [(x - size.w / 2) / view.scale + view.cx, (y - size.h / 2) / view.scale + view.cy]
    view.scale *= factor; clampView()
    view.cx = before[0] - (x - size.w / 2) / view.scale; view.cy = before[1] - (y - size.h / 2) / view.scale
    clampView(); redraw()
  }

  function init() {
    root = document.getElementById('monitor')
    root.innerHTML = `
      <div class="mon">
        <div class="mon-main">
          <div class="mon-bar"><span>warstwy</span><div id="monLayers"></div><span class="grow"></span>
            <button data-z="in" aria-label="Przybliż">+</button><button data-z="out" aria-label="Oddal">−</button><button data-z="reset" aria-label="Widok świata">⌂</button></div>
          <div class="mon-map"><canvas id="monCanvas"></canvas><div id="monTip" hidden></div></div>
          <div class="mon-foot"><span>◯ trzęsienie ziemi</span><span>◇ zdarzenie naturalne</span><span>▲ samolot wojskowy</span><span class="grow"></span><span id="monStatus">łączenie…</span><span id="monUpdated"></span></div>
        </div>
        <aside class="mon-side"><h4>wybrane</h4><div id="monSel" class="sel"></div>
          <h4>zdarzenia</h4><div class="feed" id="monList"></div>
          <h4>doniesienia <i>gdelt</i></h4><div class="feed" id="monNews"></div></aside>
      </div>`
    canvas = root.querySelector('#monCanvas'); ctx = canvas.getContext('2d'); tip = root.querySelector('#monTip')
    root.querySelector('#monLayers').onclick = e => {
      const key = e.target.closest('[data-l]')?.dataset.l
      if (!key) return
      layersOn[key] = !layersOn[key]
      localStorage.setItem('monLayers', JSON.stringify(layersOn))
      if (selected && data && !layersOn[layerOf(selected)]) select(null)
      renderBar(); redraw()
    }
    root.querySelector('.mon-bar').addEventListener('click', e => {
      const z = e.target.closest('[data-z]')?.dataset.z
      if (z === 'in') zoomAt(1.6, size.w / 2, size.h / 2)
      if (z === 'out') zoomAt(1 / 1.6, size.w / 2, size.h / 2)
      if (z === 'reset') { view = { cx: 0.53, cy: 0.33, scale: 1200 }; clampView(); redraw() }
    })
    canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top) }, { passive: false })
    canvas.addEventListener('dblclick', e => { const r = canvas.getBoundingClientRect(); zoomAt(2, e.clientX - r.left, e.clientY - r.top) })
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: false } })
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        view.cx -= dx / view.scale; view.cy -= dy / view.scale; drag.x = e.clientX; drag.y = e.clientY
        clampView(); redraw(); tip.hidden = true; return
      }
      const h = nearest(x, y)
      canvas.style.cursor = h ? 'pointer' : 'grab'
      if (!h) { tip.hidden = true; return }
      const [a, b] = describe(h.layer, h.item)
      tip.innerHTML = `<b>${esc(a)}</b><div>${esc(b)}</div>`
      tip.hidden = false; tip.style.left = Math.min(x + 14, size.w - 260) + 'px'; tip.style.top = Math.min(y + 14, size.h - 60) + 'px'
    })
    canvas.addEventListener('pointerup', e => {
      const moved = drag?.moved; drag = null
      if (moved) return
      const r = canvas.getBoundingClientRect(), h = nearest(e.clientX - r.left, e.clientY - r.top)
      select(h ? h.item : null)
    })
    canvas.addEventListener('pointerleave', () => { tip.hidden = true })
    new ResizeObserver(resize).observe(canvas.parentElement)
    select(null); renderBar(); resize()
  }

  return {
    show() {
      visible = true
      if (!started) { started = true; init(); load() }
      else { resize(); load() }
      clearInterval(timer); timer = setInterval(() => { if (!document.hidden && visible) load() }, 60000)
    },
    hide() { visible = false; clearInterval(timer) },
    rerenderLists: () => { if (root) renderLists() },
  }
})()
