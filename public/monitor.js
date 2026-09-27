// Monitor tab: a world map drawn on a canvas (Mercator, Natural Earth outlines from world-data.js).
// Live layers come from /api/monitor (USGS, NASA EONET, adsb.lol, NWS, Environment Canada, GDELT);
// reference layers (conflicts, bases, cables, ...) come from monitor-geo.js. Layers are told apart by
// shape and glyph, not colour, to match the terminal look. All text follows the global `lang` (pl / en).
const Monitor = (() => {
  const bg = () => Theme.css('--bg')
  const MAX_LAT = 85
  const RANGES = ['24h', '48h', '7d', '30d']
  // key → [shape, glyph, label en, label pl]. Every layer has its own colour (COLORS); shape and glyph stay as a second cue.
  const LAYERS = {
    conflicts: ['circle', '✕', 'Conflicts', 'Konflikty'],
    instability: ['zone', '', 'Instability', 'Niestabilność'],
    military: ['plane', '', 'Military flights', 'Loty wojskowe'],
    hotspots: ['triangle', '!', 'Hotspots', 'Punkty zapalne'],
    bases: ['square', 'B', 'Military bases', 'Bazy wojskowe'],
    nuclear: ['hex', 'N', 'Nuclear', 'Obiekty jądrowe'],
    cables: ['line', '', 'Undersea cables', 'Kable podmorskie'],
    pipelines: ['line', '', 'Pipelines', 'Rurociągi'],
    shipping: ['line', '', 'Shipping lanes', 'Szlaki morskie'],
    waterways: ['square', '≈', 'Waterways', 'Cieśniny i kanały'],
    sanctions: ['slash', '', 'Sanctions', 'Sankcje'],
    weather: ['round', 'W', 'Weather alerts', 'Alerty pogodowe'],
    canadaAlerts: ['round', 'CA', 'Canada alerts', 'Alerty Kanady'],
    economic: ['diamond', '$', 'Economic centres', 'Centra ekonomiczne'],
    natural: ['quake', '', 'Natural events', 'Zdarzenia naturalne'],
  }
  // Two palettes: the bright one for the black page, a deeper one that keeps its contrast on the light page.
  const COLORS_DARK = {
    conflicts: '#ff4d4d', instability: '#ff9a1f', military: '#ff9a1f', hotspots: '#ff7ac6', bases: '#a78bfa', nuclear: '#a3e635',
    cables: '#38bdf8', pipelines: '#d4a017', shipping: '#2dd4bf', waterways: '#2dd4bf', sanctions: '#cbd5e1',
    weather: '#fde047', canadaAlerts: '#f0abfc', economic: '#86efac', natural: '#f5f5f5',
  }
  const LEVELS_DARK = { critical: '#ff4d4d', high: '#ff9a1f', elevated: '#fde047', low: '#4ade80' }
  const COLORS_LIGHT = {
    conflicts: '#d61f1f', instability: '#d9710a', military: '#d9710a', hotspots: '#c2338f', bases: '#6d4de0', nuclear: '#4d8f0a',
    cables: '#0a7fc0', pipelines: '#a67a00', shipping: '#0e8f80', waterways: '#0e8f80', sanctions: '#5b6675',
    weather: '#a68a00', canadaAlerts: '#a23cc4', economic: '#1f8f4a', natural: '#111111',
  }
  const LEVELS_LIGHT = { critical: '#d61f1f', high: '#d9710a', elevated: '#a68a00', low: '#1f8f4a' }
  let COLORS = COLORS_DARK, LEVELS = LEVELS_DARK
  const pickPalette = () => { const light = document.documentElement.dataset.colorMode === 'light'; COLORS = light ? COLORS_LIGHT : COLORS_DARK; LEVELS = light ? LEVELS_LIGHT : LEVELS_DARK }
  pickPalette()
  // registered at load, not on first open: the palette must follow the theme even while the map has not been shown yet
  window.addEventListener('themechange', () => { pickPalette(); if (typeof rerender === 'function') rerender() })
  const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`
  const PATHS = ['cables', 'pipelines', 'shipping']   // layers drawn as lines
  const ORDER = Object.keys(LAYERS)
  const PANES = ['events', 'risk', 'military', 'ai', 'news']
  // Styles specific to the extended monitor; the base .mon-* rules live in index.html.
  document.head.insertAdjacentHTML('beforeend', `<style>
    .mon-bar{flex-wrap:wrap;row-gap:6px}.mon-bar .layers{flex:1 1 100%;order:5;display:flex;flex-wrap:wrap;gap:5px}
    .mon-bar .ranges{display:flex;gap:6px}.mon-bar .grow{flex:1}
    .mon.compact .mon-bar{flex-wrap:nowrap}.mon.compact .mon-bar>*{flex:none}.mon.compact .mon-bar .layers{flex:1 1 0;order:0;min-width:0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--line) var(--bg)}.mon.compact .mon-bar .grow{display:none}
    .mon-bar button b{font-weight:400;margin-right:4px}
    .mon-bar button{padding:2px 8px;font-size:11px;white-space:nowrap}
    .mon-bar button[data-l]{border-left:3px solid var(--c)}
    .mon-bar button[data-l].active{background:var(--c);border-color:var(--c);color:#050505}
    html[data-color-mode=light] .mon-bar button[data-l].active{color:#fff}
    .mon-foot .legend{display:flex;flex-wrap:wrap;gap:4px 14px}.mon-foot .legend b{font-weight:400;color:var(--c)}
    .mon.compact .legend{display:none}.mon.compact .mon-foot{padding:3px 10px}
    .mon-side{gap:0}.mon-side #monPane{flex:1 1 auto;min-height:160px;max-height:none;overflow-y:auto}
    .mon-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:10px 0 6px}
    .mon-tabs button{background:transparent;border:1px solid var(--line);color:var(--dim);font:inherit;font-size:11px;padding:2px 7px;cursor:pointer;text-transform:uppercase;letter-spacing:.06em}
    .mon-tabs button:hover{color:var(--ink);border-color:var(--ink)}.mon-tabs button.active{background:var(--ink);color:var(--bg);border-color:var(--ink)}
    .risk{display:block;padding:7px 0;border-top:1px solid var(--faint);color:var(--ink);text-decoration:none}
    .risk .row{display:flex;gap:8px;align-items:baseline}.risk .n{flex:1;min-width:0}.risk .s{font-weight:700;color:var(--c)}
    .risk .bar{height:4px;background:var(--faint);margin-top:5px}.risk .bar i{display:block;height:100%;background:var(--c)}
    .risk .sub{color:var(--dim);font-size:11px;margin-top:3px}
    .pane-note{color:var(--dim);font-size:11px;line-height:1.5;padding:6px 0;border-top:1px solid var(--faint)}
    .ai-box{border:1px solid var(--line);padding:8px 10px;line-height:1.55;white-space:pre-wrap;margin-top:8px}
    .mon-side .go{background:var(--ink);color:var(--bg);border:0;font:inherit;padding:5px 10px;cursor:pointer;text-transform:uppercase;letter-spacing:.08em}
    .mon-side .go:disabled{opacity:.5;cursor:wait}
    .tv-btn{background:transparent;border:1px solid var(--line);color:var(--ink);font:inherit;font-size:11px;padding:2px 8px;cursor:pointer;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
    .tv-btn:hover{border-color:var(--ink)}.tv-btn.active{background:var(--ink);color:var(--bg);border-color:var(--ink)}
    .tv-panel{position:absolute;left:10px;bottom:10px;width:clamp(360px,58%,860px);max-width:calc(100% - 20px);background:#000;border:1px solid var(--ink);box-shadow:0 8px 30px rgba(0,0,0,.6);z-index:5;display:flex;flex-direction:column}
    .tv-panel[hidden]{display:none}
    .tv-head{display:flex;align-items:center;gap:10px;padding:4px 8px;background:var(--bg);color:var(--dim);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
    .tv-head b{color:var(--ink);font-weight:400}.tv-head .grow{flex:1}.tv-head a,.tv-head button{color:var(--ink);background:none;border:0;font:inherit;cursor:pointer;text-decoration:none;padding:0 2px}
    .tv-box{position:relative;aspect-ratio:16/9;background:#000;display:flex;align-items:center;justify-content:center;color:var(--dim)}.tv-box iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    .mon.compact .tv-panel{width:calc(100% - 20px)}
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
    alert: ['alert', 'alert'], cable: ['undersea cable', 'kabel podmorski'], outages: ['Internet outages: source unavailable', 'Awarie internetu: brak źródła'],
    ago: [' ago', ' temu'], min: ['min', 'min'], h: ['h', 'h'], d: ['d', 'd'],
    tabs: { events: ['Events', 'Zdarzenia'], risk: ['Instability', 'Niestabilność'], military: ['Military', 'Wojsko'], ai: ['AI forecast', 'Prognoza AI'], news: ['Reports', 'Doniesienia'] },
    level: { critical: ['critical', 'krytyczny'], high: ['high', 'wysoki'], elevated: ['elevated', 'podwyższony'], low: ['low', 'niski'] },
    riskNote: ['Index 0–100 = 70% structural baseline (editorial) + live signals: military aircraft, M4.5+ quakes and natural events inside the region. Trend compares with the last 24 h recorded in this browser.', 'Indeks 0–100 = 70% wartości bazowej (ocena redakcyjna) + sygnały na żywo: samoloty wojskowe, trzęsienia M4.5+ i zdarzenia naturalne w regionie. Trend porównuje z ostatnimi 24 h zapisanymi w tej przeglądarce.'],
    aircraft: ['aircraft', 'samolotów'], trend: ['trend', 'trend'], noTrend: ['collecting history…', 'zbieram historię…'], score: ['index', 'indeks'],
    milNote: ['Military aircraft (adsb.lol) per region. Only aircraft that broadcast ADS-B are visible, so counts are a lower bound.', 'Samoloty wojskowe (adsb.lol) w regionach. Widać tylko maszyny nadające ADS-B, więc liczby są dolną granicą.'],
    milTotal: ['military aircraft tracked worldwide', 'śledzonych samolotów wojskowych na świecie'], outside: ['outside monitored regions', 'poza monitorowanymi regionami'], types: ['types', 'typy'],
    fcTitle: ['Outlook for the next 24 h (heuristic)', 'Perspektywa na najbliższe 24 h (heurystyka)'], fcNote: ['Projection = index + 60% of the recent change. It is a trend extrapolation, not a prediction of events.', 'Projekcja = indeks + 60% ostatniej zmiany. To ekstrapolacja trendu, nie przewidywanie zdarzeń.'],
    aiButton: ['Generate AI briefing', 'Wygeneruj analizę AI'], aiBusy: ['Analysing…', 'Analizuję…'], aiNote: ['Written by Claude from the scores and headlines above. It can be wrong; treat it as a summary, not intelligence.', 'Tekst pisze Claude na podstawie powyższych wyników i nagłówków. Może się mylić — to streszczenie, nie wywiad.'],
    aiOff: ['AI briefing is not configured on the server (set ANTHROPIC_API_KEY).', 'Analiza AI nie jest skonfigurowana na serwerze (ustaw ANTHROPIC_API_KEY).'], aiFail: ['AI briefing failed: ', 'Analiza AI nie powiodła się: '],
    region: ['region', 'region'], rising: ['rising', 'rośnie'], falling: ['falling', 'spada'], steady: ['steady', 'stabilnie'],
    pipeline: ['pipeline', 'rurociąg'], lane: ['shipping lane', 'szlak morski'],
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

  const REGIONS = () => (window.MONITOR_GEO?.regions || []).map(r => ({ id: r[0], lat: r[1], lon: r[2], km: r[3], base: r[4], name: r[5], namePl: r[6] }))
  const distanceKm = (aLat, aLon, bLat, bLon) => {
    const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2
    return 12742 * Math.asin(Math.sqrt(h))
  }
  const levelOf = score => score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 35 ? 'elevated' : 'low'
  // Per-browser history of (aircraft, score) per region: the only source for trends, sampled at most every 10 minutes.
  let history = {}
  try { history = JSON.parse(localStorage.getItem('monHist') || '{}') } catch {}
  function recordHistory(rows) {
    const now = Date.now()
    for (const r of rows) {
      const list = history[r.id] = (history[r.id] || []).filter(x => now - x[0] < 48 * 3600000)
      if (!list.length || now - list[list.length - 1][0] >= 600000) list.push([now, r.aircraft, r.score])
    }
    try { localStorage.setItem('monHist', JSON.stringify(history)) } catch {}
  }
  function analyse(live) {
    const rows = REGIONS().map(r => {
      const inside = i => distanceKm(r.lat, r.lon, i.lat, i.lon) <= r.km
      const planes = live.aircraft.filter(inside)
      const quakes = live.quakes.filter(q => q.mag >= 4.5 && inside(q)).length, events = live.events.filter(inside).length
      const score = Math.min(100, Math.round(r.base * 0.7 + Math.min(20, planes.length * 2.5) + Math.min(6, quakes * 2) + Math.min(4, events)))
      const types = {}
      for (const a of planes) if (a.type) types[a.type] = (types[a.type] || 0) + 1
      return { ...r, score, level: levelOf(score), aircraft: planes.length, quakes, events, types: Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 4) }
    })
    // trend: current score against the average of samples 30 min – 24 h old (needs two of them)
    const now = Date.now()
    for (const r of rows) {
      const old = (history[r.id] || []).filter(x => now - x[0] > 1800000 && now - x[0] < 86400000)
      r.delta = old.length >= 2 ? Math.round(r.score - old.reduce((a, x) => a + x[2], 0) / old.length) : null
      r.projected = Math.max(0, Math.min(100, Math.round(r.score + (r.delta ?? 0) * 0.6)))
    }
    recordHistory(rows)
    return rows
  }

  function build() {
    const geo = window.MONITOR_GEO || {}
    for (const layer of STATIC) items[layer] = (geo[layer] || []).map((r, i) => ({ id: layer + i, layer, lat: r[0], lon: r[1], name: r[2], namePl: r[3], note: r[4], notePl: r[5] }))
    for (const layer of PATHS) items[layer] = (geo[layer] || []).map((c, i) => {
      const path = c[2], mid = path[Math.floor(path.length / 2)]
      return { id: layer + i, layer, lat: mid[1], lon: mid[0], name: c[0], namePl: c[1], path, note: c[3] || '', notePl: c[4] || '' }
    })
    const live = data || { quakes: [], events: [], aircraft: [], weather: [], canada: [] }
    items.natural = [...live.quakes.map(q => ({ ...q, layer: 'natural', kind: 'quake' })), ...live.events.map(e => ({ ...e, layer: 'natural', kind: 'event' }))]
    items.military = live.aircraft.map(a => ({ ...a, layer: 'military' }))
    items.weather = live.weather.map(w => ({ ...w, layer: 'weather' }))
    items.canadaAlerts = live.canada.map(w => ({ ...w, layer: 'canadaAlerts' }))
    items.instability = loadedOnce ? analyse(live).map(r => ({ ...r, id: 'risk-' + r.id, layer: 'instability' })) : []
  }
  const flat = () => ORDER.flatMap(k => items[k] || [])

  // Land outlines in world units (x = unitX, y = mercY), built once.
  let landCache = null
  function landPath() {
    if (landCache) return landCache
    landCache = new Path2D()
    for (const polygon of land) for (const ring of polygon) {
      // Keep rings continuous across the antimeridian; the three world copies cover the seam.
      let previous = null
      for (let i = 0; i < ring.length; i += 2) {
        let lon = ring[i]
        if (previous !== null) { while (lon - previous > 180) lon -= 360; while (lon - previous < -180) lon += 360 }
        previous = lon
        const x = unitX(lon), y = mercY(ring[i + 1])
        i ? landCache.lineTo(x, y) : landCache.moveTo(x, y)
      }
      landCache.closePath()
    }
    return landCache
  }
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
    ctx.fillStyle = bg()
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
    // The projection is affine in world units, so the coastlines are one cached path drawn with a transform:
    // panning and zooming no longer re-project ~10 000 points per frame.
    const path = landPath()
    for (const k of copies) {
      const left = (k - view.cx) * view.scale + size.w / 2
      if (left > size.w || left + view.scale < 0) continue   // this copy of the world is off screen
      ctx.setTransform(size.dpr * view.scale, 0, 0, size.dpr * view.scale, size.dpr * left, size.dpr * (size.h / 2 - view.cy * view.scale))
      ctx.lineWidth = 0.8 / view.scale
      ctx.fill(path, 'evenodd'); ctx.stroke(path)
    }
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
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
    // instability zones sit under everything else: a translucent disc per region, coloured by level
    if (on('instability')) for (const r of items.instability) place(r, (x, y) => {
      const col = LEVELS[r.level], rad = Math.max(10, r.km / 111.32 / Math.max(.2, Math.cos(r.lat * Math.PI / 180)) * view.scale / 360)
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = rgba(col, .1); ctx.fill()
      ctx.strokeStyle = rgba(col, .6); ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = col; ctx.font = '700 11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(r.score), x, y); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
    })
    // lines: each layer has its own colour and dash style (cables dashed, pipelines solid and thick, sea lanes dotted)
    const DASH = { cables: [5, 3], pipelines: [], shipping: [1, 4] }
    for (const layer of PATHS) {
      if (!on(layer)) continue
      ctx.strokeStyle = COLORS[layer]; ctx.lineWidth = layer === 'pipelines' ? 2 : 1.4; ctx.setLineDash(DASH[layer]); ctx.lineCap = layer === 'shipping' ? 'round' : 'butt'
      for (const c of items[layer]) for (const k of copies) {
        ctx.beginPath()
        let previous = null
        c.path.forEach(([lon, lat], i) => {
          if (previous !== null) { while (lon - previous > 180) lon -= 360; while (lon - previous < -180) lon += 360 }
          previous = lon
          const [x, y] = project(lon, lat, k); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        })
        ctx.stroke()
      }
      ctx.setLineDash([]); ctx.lineCap = 'butt'
      for (const c of items[layer]) place(c, (x, y) => { ctx.fillStyle = COLORS[layer]; ctx.fillRect(x - 2.5, y - 2.5, 5, 5) })
    }
    // reference points: outlined shape + glyph in the layer colour
    for (const layer of ['sanctions', 'economic', 'waterways', 'bases', 'nuclear', 'hotspots', 'conflicts', 'weather', 'canadaAlerts']) {
      if (!on(layer)) continue
      const [kind, glyph] = LAYERS[layer], col = COLORS[layer], live = layer === 'weather' || layer === 'canadaAlerts', r = layer === 'conflicts' ? 8 : live ? 6 : 6.5
      for (const item of items[layer]) place(item, (x, y) => {
        shape(kind === 'slash' || kind === 'round' ? 'circle' : kind, x, y, r)
        ctx.fillStyle = layer === 'conflicts' ? rgba(col, .3) : bg(); ctx.fill()
        ctx.strokeStyle = col; ctx.lineWidth = layer === 'conflicts' ? 1.6 : 1; ctx.stroke()
        if (kind === 'slash') { ctx.beginPath(); ctx.moveTo(x - r * .7, y + r * .7); ctx.lineTo(x + r * .7, y - r * .7); ctx.stroke() }
        if (glyph) { ctx.fillStyle = col; ctx.font = `${glyph.length > 1 ? 7 : 9}px ui-monospace,Menlo,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, x, y + .5); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic' }
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
    // military flights: an arrow with a short trail behind it showing where it came from
    if (on('military')) for (const a of items.military) place(a, (x, y) => {
      const col = COLORS.military
      ctx.save(); ctx.translate(x, y); ctx.rotate((a.track || 0) * Math.PI / 180)
      ctx.strokeStyle = rgba(col, .55); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, 24); ctx.stroke()
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 3); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill()
      ctx.restore()
      if (zoom > 4 && a.callsign) { ctx.fillStyle = DIM; ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.fillText(a.callsign, x + 8, y + 3) }
    })
    // selection marker
    for (const h of hit) if (h.item === selected) {
      ctx.strokeStyle = COLORS[h.item.layer] || INK; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(h.x, h.y, 15, 0, 7); ctx.stroke(); ctx.setLineDash([])
    }
    ctx.fillStyle = DIM; ctx.font = '11px ui-monospace,Menlo,monospace'
    ctx.fillText(t('zoom') + (view.scale / Math.max(size.w, size.h * 0.9)).toFixed(1), 10, size.h - 10)
  }
  const redraw = () => { if (!frame) frame = requestAnimationFrame(draw) }

  const trendText = r => r.delta === null ? t('noTrend') : `${r.delta > 2 ? '↑ ' + t('rising') : r.delta < -2 ? '↓ ' + t('falling') : '→ ' + t('steady')} (${r.delta > 0 ? '+' : ''}${r.delta})`

  // [title, line 2, line 3] for an item, in the current language.
  function describe(item) {
    const L = pl() ? 1 : 0
    if (STATIC.includes(item.layer)) return [pl() ? item.namePl : item.name, pl() ? item.notePl : item.note, UI.static[item.layer][L]]
    if (PATHS.includes(item.layer)) return [pl() ? item.namePl : item.name, pl() ? item.notePl : item.note, item.layer === 'cables' ? t('cable') : item.layer === 'pipelines' ? t('pipeline') : t('lane')]
    if (item.layer === 'instability') return [`${pl() ? item.namePl : item.name}`, `${t('score')} ${item.score}/100 · ${UI.level[item.level][L]}`, `${item.aircraft} ${t('aircraft')} · ${trendText(item)}`]
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

  let pane = PANES.includes(localStorage.getItem('monPane')) ? localStorage.getItem('monPane') : 'events'
  let aiState = { text: '', busy: false, error: '', lang: '' }
  const riskRows = () => [...(items.instability || [])].sort((a, b) => b.score - a.score)
  const rowHtml = (i, time, text) => `<a class="item" href="#" data-i="${i}"><time>${time}</time><span class="t">${esc(text)}</span></a>`

  // Bloomberg TV: a floating panel over the map, opened from the button in the footer. The stream is only created while it is open.
  let tv = { open: false, id: '', error: '', busy: false }
  // In the macOS app the player is a native overlay (YouTube refuses file:// pages); the page only reports where the box is.
  const nativeTv = location.protocol === 'file:' && window.webkit?.messageHandlers?.tv
  function tvOverlay() {
    if (!nativeTv) return
    const host = tv.open && tv.id && root?.querySelector('.tv-box')
    if (!host) return nativeTv.postMessage({ hide: true })
    const r = host.getBoundingClientRect()
    nativeTv.postMessage({ id: tv.id, x: r.left, y: r.top, w: r.width, h: r.height })
  }
  function renderTv() {
    if (!root) return
    const panel = root.querySelector('#monTv'), btn = root.querySelector('#monTvBtn')
    btn.classList.toggle('active', tv.open)
    panel.hidden = !tv.open
    if (!tv.open) { panel.querySelector('.tv-box').replaceChildren(); tvOverlay(); return }
    const box = panel.querySelector('.tv-box')
    if (tv.id) {
      if (nativeTv) box.replaceChildren()
      if (!nativeTv && !box.querySelector('iframe')) box.innerHTML = `<iframe src="https://www.youtube.com/embed/${tv.id}?autoplay=1&mute=1&rel=0" title="Bloomberg TV" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
      requestAnimationFrame(tvOverlay)
    } else {
      box.innerHTML = tv.error ? `<span>${esc(tv.error)} <a href="#" id="monTvRetry" style="color:var(--ink)">↻</a></span>` : `<span>${t('connecting')}</span>`
      if (!tv.error && !tv.busy) loadTv()
    }
  }
  async function loadTv() {
    tv.busy = true; tv.error = ''
    try {
      const response = await fetch('/api/tv'), body = await response.json()
      if (!response.ok || !body.id) throw new Error(body.error || 'no live stream')
      tv.id = body.id
    } catch { tv.id = ''; tv.error = 'Bloomberg TV: ' + (pl() ? 'brak transmisji na żywo' : 'no live stream') }
    tv.busy = false
    renderTv()
  }
  function renderPane() {
    if (!root) return
    const box = root.querySelector('#monPane'), rows = []
    root.querySelector('#monTabs').innerHTML = PANES.map(k => `<button data-p="${k}" class="${k === pane ? 'active' : ''}">${esc(UI.tabs[k][pl() ? 1 : 0])}</button>`).join('')
    box.onclick = null
    if (pane === 'events') {
      const feed = [
        ...(items.natural || []).filter(i => i.kind === 'event' || i.mag >= 4.5).map(item => ({ item, time: item.time, text: item.kind === 'quake' ? `M${item.mag.toFixed(1)} · ${quakePlace(item.place)}` : `${pl() ? UI.cat[item.category] || item.category : item.category} · ${fixedTitle(item)}` })),
        ...(items.weather || []).map(item => ({ item, time: item.time, text: `${fixedTitle(item)} · ${item.area}` })),
        ...(items.canadaAlerts || []).map(item => ({ item, time: item.time, text: `${fixedTitle(item)} · ${item.area}` })),
      ].filter(r => layersOn[r.item.layer]).sort((a, b) => b.time - a.time).slice(0, 60)
      feed.forEach(r => rows.push(r.item))
      box.innerHTML = feed.map((r, i) => rowHtml(i, hhmm(r.time), r.text)).join('') || `<div class="none">${t('noEvents')}</div>`
    } else if (pane === 'risk') {
      const list = riskRows()
      list.forEach(r => rows.push(r))
      box.innerHTML = list.map((r, i) => `<a class="risk" href="#" data-i="${i}" style="--c:${LEVELS[r.level]}"><div class="row"><span class="n">${esc(pl() ? r.namePl : r.name)}</span><span class="s">${r.score}</span></div>
        <div class="bar"><i style="width:${r.score}%"></i></div><div class="sub">${UI.level[r.level][pl() ? 1 : 0]} · ${esc(trendText(r))} · ${r.aircraft} ${t('aircraft')}</div></a>`).join('') + `<div class="pane-note">${t('riskNote')}</div>`
    } else if (pane === 'military') {
      const list = riskRows().filter(r => r.aircraft).sort((a, b) => b.aircraft - a.aircraft)
      const total = (items.military || []).length, inRegions = list.reduce((n, r) => n + r.aircraft, 0)
      list.forEach(r => rows.push(r))
      const max = Math.max(1, ...list.map(r => r.aircraft))
      box.innerHTML = `<div class="pane-note" style="border:0;padding-top:0"><b style="color:${COLORS.military}">${total}</b> ${t('milTotal')} · ${Math.max(0, total - inRegions)} ${t('outside')}</div>` +
        list.map((r, i) => `<a class="risk" href="#" data-i="${i}" style="--c:${COLORS.military}"><div class="row"><span class="n">${esc(pl() ? r.namePl : r.name)}</span><span class="s">${r.aircraft}</span></div>
          <div class="bar"><i style="width:${r.aircraft / max * 100}%"></i></div><div class="sub">${r.types.length ? t('types') + ': ' + esc(r.types.map(([n, c]) => n + '×' + c).join(', ')) : '—'}</div></a>`).join('') + `<div class="pane-note">${t('milNote')}</div>`
    } else if (pane === 'ai') {
      const top = riskRows().map(r => ({ ...r })).sort((a, b) => b.projected - a.projected).slice(0, 6)
      top.forEach(r => rows.push(r))
      const arrow = r => r.projected - r.score > 1 ? '↑' : r.projected - r.score < -1 ? '↓' : '→'
      box.innerHTML = `<div class="pane-note" style="border:0;padding-top:0"><b>${t('fcTitle')}</b></div>` +
        top.map((r, i) => `<a class="risk" href="#" data-i="${i}" style="--c:${LEVELS[levelOf(r.projected)]}"><div class="row"><span class="n">${esc(pl() ? r.namePl : r.name)}</span><span class="s">${r.score} ${arrow(r)} ${r.projected}</span></div></a>`).join('') +
        `<div class="pane-note">${t('fcNote')}</div><button class="go" id="monAi"${aiState.busy ? ' disabled' : ''}>${aiState.busy ? t('aiBusy') : t('aiButton')}</button>` +
        (aiState.error ? `<div class="ai-box" style="color:#ff7a7a">${esc(aiState.error)}</div>` : aiState.text && aiState.lang === (pl() ? 'pl' : 'en') ? `<div class="ai-box">${esc(aiState.text)}</div><div class="pane-note">${t('aiNote')}</div>` : '')
    } else {
      box.innerHTML = (data?.articles || []).map(a =>
        `<a class="item" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="${esc(a.domain)}"><time>${hhmm(a.time)}</time><span class="t">${esc(pl() && a.pl ? a.pl : a.title)}</span></a>`).join('')
        || `<div class="none">${data?.failed.includes('articles') ? t('gdeltDown') : t('noReports')}</div>`
    }
    box.onclick = e => {
      if (e.target.closest('#monAi')) return askAi()
      const a = e.target.closest('[data-i]'); if (!a || !rows.length) return
      e.preventDefault(); select(rows[+a.dataset.i], true)
    }
  }
  const renderLists = renderPane

  // Optional AI briefing: the server (which holds the API key) asks Claude to summarise the scores and headlines.
  async function askAi() {
    if (aiState.busy || !data) return
    const language = pl() ? 'pl' : 'en'
    aiState = { text: '', busy: true, error: '', lang: language }; renderPane()
    try {
      const response = await fetch('/api/forecast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: language,
          regions: riskRows().slice(0, 14).map(r => ({ name: r.name, score: r.score, projected: r.projected, aircraft: r.aircraft, trend: r.delta })),
          headlines: [...(data.articles || []).map(a => a.title), ...(data.events || []).map(e => e.title)].slice(0, 16),
        }),
      })
      const payload = await response.json()
      if (response.status === 503) throw Object.assign(new Error(t('aiOff')), { plain: true })
      if (!response.ok) throw new Error(payload.error || response.status)
      aiState = { text: payload.text, busy: false, error: '', lang: language }
    } catch (error) {
      aiState = { text: '', busy: false, error: error.plain ? error.message : t('aiFail') + error.message, lang: language }
    }
    renderPane()
  }

  function renderBar() {
    const glyph = { conflicts: '✕', instability: '◌', military: '▲', hotspots: '!', bases: 'B', nuclear: 'N', cables: '┄', pipelines: '━', shipping: '⋯', waterways: '≈', sanctions: '⊘', weather: 'W', canadaAlerts: 'CA', economic: '$', natural: '◯' }
    root.querySelector('#monLayers').innerHTML = ORDER.map(key =>
      `<button data-l="${key}" style="--c:${COLORS[key]}" class="${layersOn[key] ? 'active' : ''}"><b>${glyph[key]}</b>${esc(label(key))}${loadedOnce ? ` <i>${(items[key] || []).length}</i>` : ''}</button>`).join('')
    root.querySelector('#monRange').innerHTML = RANGES.map(r => `<button data-r="${r}" class="${r === range ? 'active' : ''}">${r}</button>`).join('')
    root.querySelector('#monLang').textContent = pl() ? 'PL' : 'EN'
    root.querySelector('#monLabel').textContent = t('layers')
    root.querySelector('#monRangeLabel').textContent = t('range')
    root.querySelector('[data-z="in"]').setAttribute('aria-label', t('zoomIn'))
    root.querySelector('[data-z="out"]').setAttribute('aria-label', t('zoomOut'))
    root.querySelector('[data-z="reset"]').setAttribute('aria-label', t('world'))
    root.querySelector('#monH-sel').textContent = t('selected')
    root.querySelector('#monLegend').textContent = '⚠ ' + t('outages')
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
          <div class="mon-map"><canvas id="monCanvas"></canvas><div id="monTip" hidden></div>
            <div class="tv-panel" id="monTv" hidden><div class="tv-head"><b>Bloomberg TV</b><span class="grow"></span><a href="https://www.youtube.com/@markets/live" target="_blank" rel="noopener noreferrer">YouTube ↗</a><button id="monTvClose" title="Zamknij">×</button></div><div class="tv-box"></div></div></div>
          <div class="mon-foot"><button class="tv-btn" id="monTvBtn">▶ Bloomberg TV</button><span id="monLegend" class="legend"></span><span class="grow"></span><span id="monStatus"></span><span id="monUpdated"></span></div>
        </div>
        <aside class="mon-side"><h4 id="monH-sel"></h4><div id="monSel" class="sel"></div>
          <div class="mon-tabs" id="monTabs"></div><div class="feed" id="monPane"></div></aside>
      </div>`
    canvas = root.querySelector('#monCanvas'); ctx = canvas.getContext('2d'); tip = root.querySelector('#monTip')
    root.querySelector('#monLayers').onclick = e => {
      const key = e.target.closest('[data-l]')?.dataset.l
      if (!key) return
      layersOn[key] = !layersOn[key]
      localStorage.setItem('monLayers2', JSON.stringify(layersOn))
      if (selected && !layersOn[selected.layer]) select(null)
      renderBar(); renderPane(); redraw()
    }
    root.querySelector('#monRange').onclick = e => {
      const r = e.target.closest('[data-r]')?.dataset.r
      if (!r || r === range) return
      range = r; localStorage.setItem('monRange', r)
      renderBar(); load()
    }
    root.querySelector('#monTabs').onclick = e => {
      const k = e.target.closest('[data-p]')?.dataset.p
      if (!k || k === pane) return
      pane = k; localStorage.setItem('monPane', k); renderPane()
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
    new ResizeObserver(tvOverlay).observe(root)
    root.querySelector('#monTvBtn').onclick = () => { tv.open = !tv.open; renderTv() }
    root.querySelector('#monTvClose').onclick = () => { tv.open = false; renderTv() }
    root.querySelector('#monTv').onclick = e => { if (e.target.closest('#monTvRetry')) { e.preventDefault(); loadTv() } }
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
    hide() { visible = false; clearInterval(timer); if (tv.open) { tv.open = false; renderTv() } },
    // Called by the shell whenever the PL / EN switch changes.
    rerender, rerenderLists: rerender,
  }
})()
