// Monitor tab: a world map drawn on a canvas (Mercator, Natural Earth outlines from world-data.js).
// Live layers come from /api/monitor (USGS, NASA EONET, adsb.lol, NWS, Environment Canada, GDELT);
// reference layers (conflicts, bases, cables, ...) come from monitor-geo.js. Layers are told apart by
// shape and glyph, not colour, to match the terminal look. All text follows the global `lang` (pl / en).
const Monitor = (() => {
  const BG = '#050505'
  const MAX_LAT = 85
  const RANGES = ['24h', '48h', '7d', '30d']
  // key → [shape, glyph, label en, label pl, legend en, legend pl]
  const LAYERS = {
    conflicts: ['circle', '✕', 'Conflicts', 'Konflikty'],
    bases: ['square', 'B', 'Military bases', 'Bazy wojskowe'],
    cables: ['line', '', 'Undersea cables', 'Kable podmorskie'],
    hotspots: ['triangle', '!', 'Hotspots', 'Punkty zapalne'],
    nuclear: ['hex', 'N', 'Nuclear', 'Obiekty jądrowe'],
    sanctions: ['slash', '', 'Sanctions', 'Sankcje'],
    weather: ['round', 'W', 'Weather alerts', 'Alerty pogodowe'],
    canadaAlerts: ['round', 'CA', 'Canada alerts', 'Alerty Kanady'],
    economic: ['diamond', '$', 'Economic centres', 'Centra ekonomiczne'],
    waterways: ['square', '≈', 'Waterways', 'Szlaki wodne'],
    military: ['plane', '', 'Military flights', 'Loty wojskowe'],
    natural: ['quake', '', 'Natural events', 'Zdarzenia naturalne'],
  }
  const ORDER = Object.keys(LAYERS)
  // Styles specific to the extended monitor bar; the base .mon-* rules live in index.html.
  document.head.insertAdjacentHTML('beforeend', `<style>
    .mon-bar{flex-wrap:nowrap}.mon-bar>*{flex:none}.mon-bar .layers{flex:1 1 0;min-width:0;overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--line) var(--bg)}
    .mon-bar .layers,.mon-bar .ranges{display:flex;gap:6px}.mon-bar .grow{display:none}
    .mon-bar button{padding:2px 8px;font-size:11px;white-space:nowrap}.mon-foot .legend{display:flex;flex-wrap:wrap;gap:4px 14px}
    .mon-side .feed{max-height:22vh}.mon.compact .legend{display:none}.mon.compact .mon-foot{padding:3px 10px}
  </style>`)
  const STATIC = ['conflicts', 'bases', 'hotspots', 'nuclear', 'sanctions', 'economic', 'waterways']
  const UI = {
    layers: ['layers', 'warstwy'], range: ['time range', 'zakres'], zoomIn: ['Zoom in', 'Przybliż'], zoomOut: ['Zoom out', 'Oddal'], world: ['World view', 'Widok świata'],
    selected: ['selected', 'wybrane'], hint: ['Click a marker on the map or an entry from the list.', 'Kliknij punkt na mapie lub pozycję z listy.'],
    situation: ['conflict zones', 'strefy konfliktów'], events: ['events', 'zdarzenia'], reports: ['reports', 'doniesienia'],
    connecting: ['connecting…', 'łączenie…'], updated: ['updated: ', 'aktualizacja: '], noEvents: ['no events', 'brak zdarzeń'], noReports: ['no reports', 'brak doniesień'],
    gdeltDown: ['GDELT temporarily unavailable (rate limit)', 'GDELT chwilowo niedostępny (limit zapytań)'], missing: ['no data: ', 'brak danych: '],
    fetchError: ['data error: ', 'błąd pobierania danych: '], source: ['open source ↗', 'otwórz źródło ↗'], zoom: ['zoom ×', 'zoom ×'],
    quake: ['earthquake', 'trzęsienie ziemi'], depth: ['depth', 'głębokość'], plane: ['military aircraft', 'samolot wojskowy'], alt: ['altitude', 'wysokość'], speed: ['speed', 'prędkość'],
    alert: ['alert', 'alert'], cable: ['undersea cable', 'kabel podmorski'], outages: ['Internet outages: source unavailable', 'Awarie internetu: źródło niedostępne'],
    ago: [' ago', ' temu'], min: ['min', 'min'], h: ['h', 'h'], d: ['d', 'd'],
    static: { conflicts: ['conflict zone', 'strefa konfliktu'], bases: ['military base', 'baza wojskowa'], hotspots: ['hotspot', 'punkt zapalny'], nuclear: ['nuclear facility', 'obiekt jądrowy'],
      sanctions: ['sanctioned country', 'kraj objęty sankcjami'], economic: ['economic centre', 'centrum ekonomiczne'], waterways: ['strategic waterway', 'strategiczny szlak wodny'] },
    sev: { Extreme: ['Extreme', 'Ekstremalne'], Severe: ['Severe', 'Poważne'], yellow: ['Yellow', 'Żółty'], orange: ['Orange', 'Pomarańczowy'], red: ['Red', 'Czerwony'] },
    cat: { Wildfires: 'Pożary', 'Severe Storms': 'Silne burze', Volcanoes: 'Wulkany', Floods: 'Powodzie', 'Sea and Lake Ice': 'Lód morski i jeziorny', Drought: 'Susza', 'Dust and Haze': 'Pył i mgła',
      Landslides: 'Osuwiska', Earthquakes: 'Trzęsienia ziemi', Snow: 'Śnieg', 'Temperature Extremes': 'Ekstremalne temperatury', Manmade: 'Zdarzenia antropogeniczne', 'Water Color': 'Barwa wody' },
  }
  let root, canvas, ctx, tip, data = null, timer = null, started = false, visible = false
  let view = { cx: 0.53, cy: 0.33, scale: 1200 }   // centre in unit-world coordinates, pixels per world width
  let size = { w: 0, h: 0, dpr: 1 }
  let layersOn = Object.fromEntries(ORDER.map(k => [k, true]))
  let range = '7d'
  try { Object.assign(layersOn, JSON.parse(localStorage.getItem('monLayers2') || '{}')); if (RANGES.includes(localStorage.getItem('monRange'))) range = localStorage.getItem('monRange') } catch {}
  // Antarctica is left out: Mercator cannot show it and it would smear across the bottom of the map.
  const land = (window.WORLD_POLYGONS || []).filter(polygon => polygon[0].some((v, i) => i % 2 && v > -60))
  const items = {}   // layer → [item] (reference + live), rebuilt on every load
  let hit = [], selected = null, drag = null, frame = 0, loadedOnce = false

  const pl = () => typeof lang !== 'undefined' && lang === 'pl'
  const t = key => UI[key][pl() ? 1 : 0]
  const label = k => LAYERS[k][pl() ? 3 : 2]
  const locale = () => pl() ? 'pl-PL' : 'en-GB'
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const clock = ms => new Date(ms).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  const hhmm = ms => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false })
  const ago = ms => { const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return (m < 60 ? m + ' ' + t('min') : m < 1440 ? Math.round(m / 60) + ' ' + t('h') : Math.round(m / 1440) + ' ' + t('d')) + t('ago') }
  const mercY = lat => { const p = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180; return 0.5 - Math.log(Math.tan(Math.PI / 4 + p / 2)) / (2 * Math.PI) }
  const unitX = lon => (lon + 180) / 360
  const fixedTitle = item => pl() && item.titlePl ? item.titlePl : item.title
  const sev = s => UI.sev[s] ? UI.sev[s][pl() ? 1 : 0] : s
  const quakePlace = place => pl() ? place.replace(/^(\d+) km ([NSEW]{1,3}) of /, '$1 km na $2 od ') : place

  function build() {
    const geo = window.MONITOR_GEO || {}
    for (const layer of STATIC) items[layer] = (geo[layer] || []).map((r, i) => ({ id: layer + i, layer, lat: r[0], lon: r[1], name: r[2], namePl: r[3], note: r[4], notePl: r[5] }))
    items.cables = (geo.cables || []).map((c, i) => {
      const path = c[2], mid = path[Math.floor(path.length / 2)]
      return { id: 'cable' + i, layer: 'cables', lat: mid[1], lon: mid[0], name: c[0], namePl: c[1], path, note: '', notePl: '' }
    })
    const live = data || { quakes: [], events: [], aircraft: [], weather: [], canada: [] }
    items.natural = [...live.quakes.map(q => ({ ...q, layer: 'natural', kind: 'quake' })), ...live.events.map(e => ({ ...e, layer: 'natural', kind: 'event' }))]
    items.military = live.aircraft.map(a => ({ ...a, layer: 'military' }))
    items.weather = live.weather.map(w => ({ ...w, layer: 'weather' }))
    items.canadaAlerts = live.canada.map(w => ({ ...w, layer: 'canadaAlerts' }))
  }
  const flat = () => ORDER.flatMap(k => items[k] || [])

  function project(lon, lat, k = 0) {
    return [(unitX(lon) + k - view.cx) * view.scale + size.w / 2, (mercY(lat) - view.cy) * view.scale + size.h / 2]
  }
  function clampView() {
    view.scale = Math.max(Math.max(size.w, size.h * 0.9), Math.min(view.scale, size.w * 80))
    const half = size.h / 2 / view.scale
    view.cy = Math.max(half, Math.min(1 - half, view.cy))
    view.cx = ((view.cx % 1) + 1) % 1
  }

  function shape(kind, x, y, r) {
    ctx.beginPath()
    if (kind === 'square') ctx.rect(x - r, y - r, r * 2, r * 2)
    else if (kind === 'diamond') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r - 1, y); ctx.closePath() }
    else if (kind === 'triangle') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y + r); ctx.lineTo(x - r - 1, y + r); ctx.closePath() }
    else if (kind === 'hex') for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; i ? ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) : ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a)); if (i === 5) ctx.closePath() }
    else ctx.arc(x, y, r, 0, 7)
  }

  // Continent and country names (English and Polish come with the data), drawn dimmed under the markers.
  const CONTINENTS = [[-102, 46, 'North America', 'Ameryka Północna'], [-60, -14, 'South America', 'Ameryka Południowa'], [16, 51, 'Europe', 'Europa'],
    [21, 4, 'Africa', 'Afryka'], [92, 50, 'Asia', 'Azja'], [134, -25, 'Oceania', 'Oceania']]
  function drawNames(ink, inkRgb) {
    const fit = view.scale / Math.max(size.w, size.h * 0.9)
    const taken = []
    const put = (text, x, y, font, color) => {
      ctx.font = font
      const w = ctx.measureText(text).width, box = [x - w / 2 - 3, y - 8, x + w / 2 + 3, y + 8]
      if (x < -w || y < -10 || x > size.w + w || y > size.h + 10) return
      if (taken.some(t => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) return
      taken.push(box)
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(text, x, y)
    }
    // continents fade out as the map is zoomed in and the countries take over
    const fade = Math.max(0, Math.min(1, (2.4 - fit) / 0.8))
    if (fade > 0) for (const k of [-1, 0, 1]) for (const [lon, lat, en, plName] of CONTINENTS) {
      const [x, y] = project(lon, lat, k)
      put((pl() ? plName : en).toUpperCase(), x, y, '600 12px ui-monospace,Menlo,monospace', `rgba(${inkRgb},${(0.6 * fade).toFixed(2)})`)
    }
    // countries appear once they are wide enough on screen to carry their name
    for (const [lon, lat, area, english, polish] of window.WORLD_LABELS || []) {
      const width = Math.sqrt(area) * view.scale / 360
      if (width < 30) break   // the list is sorted by area, so the rest is smaller still
      for (const k of [-1, 0, 1]) {
        const [x, y] = project(lon, lat, k)
        put(pl() ? polish : english, x, y, '10px ui-monospace,Menlo,monospace', ink)
      }
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
  }
  function draw() {
    frame = 0
    if (!ctx || !visible) return
    const INK = Theme.css('--ink'), DIM = Theme.css('--dim'), inkRgb = Theme.css('--ink-rgb').replace(/ /g, ',')
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, size.w, size.h)
    hit = []
    const copies = [-1, 0, 1]
    // graticule
    ctx.strokeStyle = Theme.css('--faint'); ctx.lineWidth = 1; ctx.beginPath()
    for (const k of copies) for (let lon = -180; lon <= 180; lon += 30) { const [x] = project(lon, 0, k); ctx.moveTo(x, 0); ctx.lineTo(x, size.h) }
    for (let lat = -60; lat <= 60; lat += 30) { const [, y] = project(0, lat); ctx.moveTo(0, y); ctx.lineTo(size.w, y) }
    ctx.stroke()
    // land
    ctx.fillStyle = Theme.css('--land'); ctx.strokeStyle = Theme.css('--border'); ctx.lineWidth = 0.8
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
    drawNames(DIM, inkRgb)
    const zoom = view.scale / size.w
    const on = k => layersOn[k] && items[k]?.length
    const place = (item, drawFn) => {
      for (const k of copies) {
        const [x, y] = project(item.lon, item.lat, k)
        if (x < -20 || y < -20 || x > size.w + 20 || y > size.h + 20) continue
        drawFn(x, y)
        hit.push({ item, x, y })
      }
    }
    ctx.lineJoin = 'round'
    // cables: dashed paths (their hit points are the vertices)
    if (on('cables')) {
      ctx.strokeStyle = DIM; ctx.lineWidth = 1; ctx.setLineDash([5, 3])
      for (const c of items.cables) for (const k of copies) {
        ctx.beginPath()
        let previous = null
        c.path.forEach(([lon, lat], i) => {
          if (previous !== null) { while (lon - previous > 180) lon -= 360; while (lon - previous < -180) lon += 360 }
          previous = lon
          const [x, y] = project(lon, lat, k); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        })
        ctx.stroke()
      }
      ctx.setLineDash([])
      for (const c of items.cables) place(c, (x, y) => { ctx.fillStyle = INK; ctx.fillRect(x - 2, y - 2, 4, 4) })
    }
    // reference points: outlined shape + glyph
    for (const layer of ['sanctions', 'economic', 'waterways', 'bases', 'nuclear', 'hotspots', 'conflicts', 'weather', 'canadaAlerts']) {
      if (!on(layer)) continue
      const [kind, glyph] = LAYERS[layer], live = layer === 'weather' || layer === 'canadaAlerts', r = layer === 'conflicts' ? 8 : live ? 6 : 6.5
      for (const item of items[layer]) place(item, (x, y) => {
        shape(kind === 'slash' || kind === 'round' ? 'circle' : kind, x, y, r)
        ctx.fillStyle = layer === 'conflicts' ? `rgba(${inkRgb},.28)` : BG; ctx.fill()
        ctx.strokeStyle = INK; ctx.lineWidth = layer === 'conflicts' ? 1.6 : 1; ctx.stroke()
        if (kind === 'slash') { ctx.beginPath(); ctx.moveTo(x - r * .7, y + r * .7); ctx.lineTo(x + r * .7, y - r * .7); ctx.stroke() }
        if (glyph) { ctx.fillStyle = INK; ctx.font = `${glyph.length > 1 ? 7 : 9}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, x, y + .5); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic' }
        if (zoom > 3 && !live) { ctx.fillStyle = DIM; ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.fillText(pl() ? item.namePl : item.name, x + r + 4, y + 3) }
      })
    }
    if (on('natural')) for (const item of items.natural) place(item, (x, y) => {
      if (item.kind === 'event') {
        ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath()
        ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.stroke()
        return
      }
      const r = 2 + item.mag * 1.5, fresh = Date.now() - item.time < 3600000
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7)
      ctx.fillStyle = `rgba(${inkRgb},${fresh ? .35 : .08})`; ctx.fill()
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke()
    })
    if (on('military')) for (const a of items.military) place(a, (x, y) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate((a.track || 0) * Math.PI / 180)
      ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 3); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill()
      ctx.restore()
      if (zoom > 4 && a.callsign) { ctx.fillStyle = DIM; ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.fillText(a.callsign, x + 8, y + 3) }
    })
    // selection marker
    for (const h of hit) if (h.item === selected) {
      ctx.strokeStyle = INK; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(h.x, h.y, 15, 0, 7); ctx.stroke(); ctx.setLineDash([])
    }
    ctx.fillStyle = DIM; ctx.font = '11px ui-monospace,Menlo,monospace'
    ctx.fillText(t('zoom') + (view.scale / Math.max(size.w, size.h * 0.9)).toFixed(1), 10, size.h - 10)
  }
  const redraw = () => { if (!frame) frame = requestAnimationFrame(draw) }

  // [title, line 2, line 3] for an item, in the current language.
  function describe(item) {
    const L = pl() ? 1 : 0
    if (STATIC.includes(item.layer)) return [pl() ? item.namePl : item.name, pl() ? item.notePl : item.note, UI.static[item.layer][L]]
    if (item.layer === 'cables') return [pl() ? item.namePl : item.name, t('cable'), '']
    if (item.layer === 'natural' && item.kind === 'quake')
      return [`M${item.mag.toFixed(1)} · ${t('quake')}`, quakePlace(item.place), `${clock(item.time)} (${ago(item.time)}) · ${t('depth')} ${Math.round(item.depth)} km`]
    if (item.layer === 'natural') return [pl() ? UI.cat[item.category] || item.category : item.category || 'event', fixedTitle(item), `${clock(item.time)} (${ago(item.time)})`]
    if (item.layer === 'weather' || item.layer === 'canadaAlerts') return [fixedTitle(item), item.area + (item.province ? ' (' + item.province + ')' : ''), `${sev(item.severity)} · ${clock(item.time)} (${ago(item.time)})`]
    return [`${item.callsign || item.id.toUpperCase()} · ${t('plane')}`, [item.type, item.reg].filter(Boolean).join(' · ') || '—',
      `${t('alt')} ${item.alt === null ? '—' : item.alt + ' ft'} · ${t('speed')} ${item.speed === null ? '—' : Math.round(item.speed) + ' kt'}`]
  }

  function renderSelection(center) {
    const box = root.querySelector('#monSel')
    if (!selected) { box.innerHTML = `<div class="none">${t('hint')}</div>`; return }
    const [a, b, c] = describe(selected)
    const link = selected.url ? `<a href="${esc(selected.url)}" target="_blank" rel="noopener noreferrer">${t('source')}</a>` : ''
    box.innerHTML = `<b>${esc(a)}</b><div>${esc(b)}</div><div class="dim">${esc(c)}</div><div class="dim">${selected.lat.toFixed(2)}°, ${selected.lon.toFixed(2)}°</div>${link}`
    if (center) { view.cx = unitX(selected.lon); view.cy = mercY(selected.lat); view.scale = Math.max(view.scale, size.w * 3); clampView() }
  }
  function select(item, center) { selected = item; renderSelection(center); redraw() }

  function renderLists() {
    const feedRows = [
      ...(items.natural || []).filter(i => i.kind === 'event' || i.mag >= 4.5).map(item => ({ item, time: item.time, text: item.kind === 'quake' ? `M${item.mag.toFixed(1)} · ${quakePlace(item.place)}` : `${pl() ? UI.cat[item.category] || item.category : item.category} · ${fixedTitle(item)}` })),
      ...(items.weather || []).map(item => ({ item, time: item.time, text: `${fixedTitle(item)} · ${item.area}` })),
      ...(items.canadaAlerts || []).map(item => ({ item, time: item.time, text: `${fixedTitle(item)} · ${item.area}` })),
    ].filter(r => layersOn[r.item.layer]).sort((a, b) => b.time - a.time).slice(0, 60)
    const list = root.querySelector('#monList')
    list.innerHTML = feedRows.map((row, i) => `<a class="item" href="#" data-i="${i}"><time>${hhmm(row.time)}</time><span class="t">${esc(row.text)}</span></a>`).join('') || `<div class="none">${t('noEvents')}</div>`
    list.onclick = e => { const a = e.target.closest('[data-i]'); if (!a) return; e.preventDefault(); select(feedRows[+a.dataset.i].item, true) }
    const zones = root.querySelector('#monZones')
    zones.innerHTML = (items.conflicts || []).map((c, i) => `<a class="item" href="#" data-i="${i}"><time>✕</time><span class="t">${esc(pl() ? c.namePl : c.name)}</span></a>`).join('')
    zones.onclick = e => { const a = e.target.closest('[data-i]'); if (!a) return; e.preventDefault(); select(items.conflicts[+a.dataset.i], true) }
    root.querySelector('#monNews').innerHTML = (data?.articles || []).map(a =>
      `<a class="item" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="${esc(a.domain)}"><time>${hhmm(a.time)}</time><span class="t">${esc(pl() && a.pl ? a.pl : a.title)}</span></a>`).join('')
      || `<div class="none">${data?.failed.includes('articles') ? t('gdeltDown') : t('noReports')}</div>`
  }

  function renderBar() {
    root.querySelector('#monLayers').innerHTML = ORDER.map(key =>
      `<button data-l="${key}" class="${layersOn[key] ? 'active' : ''}">${esc(label(key))}${loadedOnce ? ` <i>${items[key].length}</i>` : ''}</button>`).join('')
    root.querySelector('#monRange').innerHTML = RANGES.map(r => `<button data-r="${r}" class="${r === range ? 'active' : ''}">${r}</button>`).join('')
    root.querySelector('#monLang').textContent = pl() ? 'PL' : 'EN'
    root.querySelector('#monLabel').textContent = t('layers')
    root.querySelector('#monRangeLabel').textContent = t('range')
    root.querySelector('[data-z="in"]').setAttribute('aria-label', t('zoomIn'))
    root.querySelector('[data-z="out"]').setAttribute('aria-label', t('zoomOut'))
    root.querySelector('[data-z="reset"]').setAttribute('aria-label', t('world'))
    root.querySelector('#monH-sel').textContent = t('selected')
    root.querySelector('#monH-zones').textContent = t('situation')
    root.querySelector('#monH-events').textContent = t('events')
    root.querySelector('#monH-news').firstChild.textContent = t('reports') + ' '
    root.querySelector('#monLegend').innerHTML = ORDER.filter(k => k !== 'military' && k !== 'natural').map(k => `<span>${LAYERS[k][1] || '┄'} ${esc(label(k))}</span>`).join('') + `<span>▲ ${esc(label('military'))}</span><span>◯ ◇ ${esc(label('natural'))}</span><span title="${esc(t('outages'))}">⚠ ${esc(t('outages'))}</span>`
    const status = root.querySelector('#monStatus')
    if (!data) { status.textContent = t('connecting'); return }
    const names = { quakes: 'USGS', events: 'NASA EONET', aircraft: 'adsb.lol', articles: 'GDELT', weather: 'NWS', canada: 'Environment Canada' }
    status.textContent = data.failed.length ? t('missing') + data.failed.map(f => names[f]).join(', ') : 'USGS · NASA EONET · adsb.lol · NWS · EC · GDELT'
    root.querySelector('#monUpdated').textContent = t('updated') + new Date(data.fetchedAt).toLocaleTimeString(locale())
  }

  async function load() {
    try {
      const response = await fetch('/api/monitor?range=' + range)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error)
      data = payload
    } catch (error) {
      root.querySelector('#monStatus').textContent = t('fetchError') + error.message
      return
    }
    loadedOnce = true
    build()
    if (selected && !flat().some(i => i.id === selected.id)) selected = null
    else if (selected) selected = flat().find(i => i.id === selected.id)
    renderBar(); renderLists(); renderSelection(); redraw()
  }

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect()
    size = { w: Math.max(200, box.width), h: Math.max(200, box.height), dpr: window.devicePixelRatio || 1 }
    canvas.width = size.w * size.dpr; canvas.height = size.h * size.dpr
    canvas.style.width = size.w + 'px'; canvas.style.height = size.h + 'px'
    root.querySelector('.mon').classList.toggle('compact', root.clientHeight < 600)
    clampView(); redraw()
  }

  function nearest(x, y) {
    let best = null, bestD = 100   // 10px radius
    for (const h of hit) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d <= bestD) { best = h; bestD = d } }
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
          <div class="mon-bar"><span id="monLabel"></span><div id="monLayers" class="layers"></div><span class="grow"></span>
            <span id="monRangeLabel"></span><div id="monRange" class="ranges"></div>
            <button data-z="in">+</button><button data-z="out">−</button><button data-z="reset">⌂</button><button id="monLang" class="lang">PL</button></div>
          <div class="mon-map"><canvas id="monCanvas"></canvas><div id="monTip" hidden></div></div>
          <div class="mon-foot"><span id="monLegend" class="legend"></span><span class="grow"></span><span id="monStatus"></span><span id="monUpdated"></span></div>
        </div>
        <aside class="mon-side"><h4 id="monH-sel"></h4><div id="monSel" class="sel"></div>
          <h4 id="monH-zones"></h4><div class="feed" id="monZones"></div>
          <h4 id="monH-events"></h4><div class="feed" id="monList"></div>
          <h4 id="monH-news">&nbsp;<i>gdelt</i></h4><div class="feed" id="monNews"></div></aside>
      </div>`
    canvas = root.querySelector('#monCanvas'); ctx = canvas.getContext('2d'); tip = root.querySelector('#monTip')
    root.querySelector('#monLayers').onclick = e => {
      const key = e.target.closest('[data-l]')?.dataset.l
      if (!key) return
      layersOn[key] = !layersOn[key]
      localStorage.setItem('monLayers2', JSON.stringify(layersOn))
      if (selected && !layersOn[selected.layer]) select(null)
      renderBar(); renderLists(); redraw()
    }
    root.querySelector('#monRange').onclick = e => {
      const r = e.target.closest('[data-r]')?.dataset.r
      if (!r || r === range) return
      range = r; localStorage.setItem('monRange', r)
      renderBar(); load()
    }
    // The language switch is global (headlines, side panel, monitor): delegate to the shell's own toggle.
    root.querySelector('#monLang').onclick = () => document.querySelector('[data-lang]:not(#monLang)')?.click()
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
      const [a, b] = describe(h.item)
      tip.innerHTML = `<b>${esc(a)}</b><div>${esc(b)}</div>`
      tip.hidden = false; tip.style.left = Math.min(x + 14, size.w - 260) + 'px'; tip.style.top = Math.min(y + 14, size.h - 80) + 'px'
    })
    canvas.addEventListener('pointerup', e => {
      const moved = drag?.moved; drag = null
      if (moved) return
      const r = canvas.getBoundingClientRect(), h = nearest(e.clientX - r.left, e.clientY - r.top)
      select(h ? h.item : null)
    })
    canvas.addEventListener('pointerleave', () => { tip.hidden = true })
    new ResizeObserver(resize).observe(canvas.parentElement)
    window.addEventListener('themechange', redraw)
    build(); renderBar(); renderLists(); renderSelection(); resize()
  }

  const rerender = () => { if (root) { renderBar(); renderLists(); renderSelection(); redraw() } }
  return {
    show() {
      visible = true
      if (!started) { started = true; init(); load() }
      else { resize(); load() }
      clearInterval(timer); timer = setInterval(() => { if (!document.hidden && visible) load() }, 60000)
    },
    hide() { visible = false; clearInterval(timer) },
    // Called by the shell whenever the PL / EN switch changes.
    rerender, rerenderLists: rerender,
  }
})()
