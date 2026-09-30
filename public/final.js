// UNC's Way Final dashboard. Instruments on the left, the selected market's price history as a 3D point terrain
// (WebGL2, drawn by the GPU) in the middle, headlines and diagnostics on the right, a replayable timeline below.
// Data comes from the terminal's own API (/api/chart, /api/highs, /api/news), in the Mac app through its native
// proxy. Rendering runs only while the window is visible and something moves.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GROUPS = [
    { name: 'Indeksy', items: [{ s: 'NQ1!', tag: 'IDX', dot: '#e3f06a' }, { s: 'ES1!', tag: 'IDX', dot: '#ff4f73' }, { s: 'YM1!', tag: 'IDX', dot: '#e05af2' }] },
    { name: 'Makro', items: [{ s: 'DXY1!', tag: 'FX', dot: '#ffb547' }, { s: 'GC1!', label: 'GOLD', tag: 'CMD', dot: '#3f8cff' }, { s: 'CL1!', label: 'WTI', tag: 'CMD', dot: '#37d4ea' }] },
    { name: 'Krypto', items: [{ s: 'BTC1!', label: 'BTC', tag: 'CME', dot: '#56e36f' }, { s: 'ETH1!', label: 'ETH', tag: 'CME', dot: '#8c5cff' }, { s: 'XYZ100', tag: 'HL', dot: '#f3c543' }] },
  ];
  const ALL = GROUPS.flatMap(g => g.items);
  const nameOf = it => it.label || it.s;
  const markets = new Map();          // symbol → { candles, change, price }
  let selected = localStorage.getItem('final-selected') || 'NQ1!';
  if (!ALL.some(i => i.s === selected)) selected = 'NQ1!';
  const latencies = [];

  async function getJson(url) {
    const t0 = performance.now();
    const r = await fetch(url);
    latencies.push(performance.now() - t0); if (latencies.length > 20) latencies.shift();
    const sorted = [...latencies].sort((a, b) => a - b);
    $('latency').textContent = `Opóźnienie: ${Math.round(sorted[Math.floor(sorted.length / 2)])}ms`;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ---- instruments -----------------------------------------------------------------------------------------------
  const closed = new Set(JSON.parse(localStorage.getItem('final-closed') || '[]'));
  function renderGroups() {
    $('groups').innerHTML = GROUPS.map(g => `<div class="fx-group${closed.has(g.name) ? ' closed' : ''}" data-group="${esc(g.name)}">
      <button type="button" aria-expanded="${!closed.has(g.name)}"><svg viewBox="0 0 20 20"><path d="m5 8 5 5 5-5"/></svg>${esc(g.name)}</button>
      <ul>${g.items.map(it => { const m = markets.get(it.s), ch = m?.change;
        return `<li><button type="button" class="fx-unit" style="--dot:${it.dot}" data-symbol="${esc(it.s)}" aria-current="${it.s === selected}"><i></i><span>${esc(nameOf(it))}</span><small class="${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${Number.isFinite(ch) ? (ch > 0 ? '+' : '') + ch.toFixed(2) + '%' : it.tag}</small></button></li>`; }).join('')}</ul></div>`).join('');
  }
  $('groups').addEventListener('click', e => {
    const unit = e.target.closest('[data-symbol]');
    if (unit) { select(unit.dataset.symbol); return; }
    const group = e.target.closest('.fx-group > button')?.parentElement;
    if (group) { const n = group.dataset.group; closed.has(n) ? closed.delete(n) : closed.add(n); localStorage.setItem('final-closed', JSON.stringify([...closed])); renderGroups(); }
  });
  async function loadMarket(symbol) {
    const data = await getJson(`/api/chart?symbol=${encodeURIComponent(symbol)}&interval=1D`);
    const candles = (data.candles || []).filter(c => Number.isFinite(c.close));
    const last = candles.at(-1)?.close, prev = Number.isFinite(data.previousClose) ? data.previousClose : candles.at(-2)?.close;
    const m = { candles, price: last, change: last && prev ? (last / prev - 1) * 100 : NaN };
    markets.set(symbol, m);
    return m;
  }
  async function loadAll() {
    await Promise.allSettled(ALL.map(it => loadMarket(it.s).then(() => { renderGroups(); if (it.s === selected) show(); })));
    renderGroups(); drawArea();
  }
  function select(symbol) {
    if (symbol === selected) return;
    selected = symbol; localStorage.setItem('final-selected', symbol);
    renderGroups(); show();
  }

  // ---- terrain (WebGL2) ------------------------------------------------------------------------------------------
  const canvas = $('terrain');
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' });
  const COLS = 320, ROWS = 150;
  let program, buffer, count = 0, heights = null, peaks = null, window_ = [], marker = Infinity, zoom = 1, playing = true, looping = true, lastFrame = 0, needs = true;
  const cam = { t: 0 };
  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    program = gl.createProgram();
    gl.attachShader(program, sh(gl.VERTEX_SHADER, `#version 300 es
      in vec3 p; in float b; uniform mat4 m; uniform float size; uniform float cursor; out float vb;
      void main() { vec4 q = m * vec4(p, 1.0); gl_Position = q; gl_PointSize = size / q.w;
        float fog = clamp(1.5 - q.w * 0.3, 0.35, 1.0); float hot = 1.0 - smoothstep(0.0, 0.012, abs(p.x - cursor));
        vb = b * fog + hot * 0.35; }`));
    gl.attachShader(program, sh(gl.FRAGMENT_SHADER, `#version 300 es
      precision mediump float; in float vb; out vec4 o;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; o = vec4(vec3(1.0), vb * (1.0 - r * 2.2)); }`));
    gl.linkProgram(program);
    buffer = gl.createBuffer();
  }
  // World coordinates of a terrain column and height (the newest bar is on the right as seen by the camera).
  const X = c => (0.5 - c / (COLS - 1)) * 2.6, Y = h => h * 1.1 - 0.45;
  function build() {
    const m = markets.get(selected);
    if (!m?.candles.length) return;
    const all = m.candles.map(c => c.close), n = Math.max(24, Math.floor(all.length / zoom));
    window_ = m.candles.slice(-n);
    // A mountain range drawn by the price path: time runs across, price level runs into the depth, and every bar
    // raises a ridge at its own price, wider when the bar's range was wider and taller when the price was higher.
    const bars = m.candles.slice(-n), lo = Math.min(...bars.map(b => b.low)), hi = Math.max(...bars.map(b => b.high)), span = hi - lo || 1;
    const sample = c => { const x = c / (COLS - 1) * (bars.length - 1), i = Math.floor(x), f = x - i, a = bars[i], b = bars[i + 1] || a;
      return { p: ((a.close + (b.close - a.close) * f) - lo) / span, w: ((a.high - a.low) + ((b.high - b.low) - (a.high - a.low)) * f) / span }; };
    heights = new Float32Array(COLS * ROWS); peaks = new Int16Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const { p, w } = sample(c), sigma = 0.035 + w * 1.6, top = 0.45 + 0.55 * p;
      let best = 0;
      for (let r = 0; r < ROWS; r++) {
        const d = r / (ROWS - 1) - p, grain = (Math.sin(c * 12.9898 + r * 78.233) * 43758.5453) % 1;
        const ridge = Math.exp(-(d * d) / (2 * sigma * sigma)), foothills = Math.exp(-(d * d) / (2 * (sigma * 3.2) ** 2)) * 0.28;
        const h = top * (ridge + foothills) * (0.9 + 0.1 * Math.abs(grain));
        heights[r * COLS + c] = h;
        if (h > heights[best * COLS + c]) best = r;
      }
      peaks[c] = best;
    }
    const data = new Float32Array(COLS * ROWS * 4);
    const L = [-0.45, 0.8, -0.4], ln = Math.hypot(...L);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const h = heights[r * COLS + c], k = (r * COLS + c) * 4;
      const dx = (heights[r * COLS + Math.min(COLS - 1, c + 1)] - heights[r * COLS + Math.max(0, c - 1)]) * 18;
      const dz = (heights[Math.min(ROWS - 1, r + 1) * COLS + c] - heights[Math.max(0, r - 1) * COLS + c]) * 18;
      const nl = Math.hypot(dx, 1, dz), light = Math.max(0, (-dx * L[0] + L[1] - dz * L[2]) / (nl * ln));
      data[k] = X(c); data[k + 1] = Y(h); data[k + 2] = r / ROWS * 1.9;
      data[k + 3] = Math.min(1, 0.26 + Math.pow(light, 1.2) * (0.5 + 0.95 * h));
    }
    count = COLS * ROWS;
    if (gl) { gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); }
    marker = Math.min(marker, window_.length - 1);
    if (!(marker > 0)) marker = window_.length - 1;
    needs = true; wake();
  }
  // Column-major 4×4 matrices.
  const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
  function perspective(fov, aspect, near, far) { const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); }
  function lookAt(e, t, u) {
    const z = [e[0] - t[0], e[1] - t[1], e[2] - t[2]], zl = Math.hypot(...z); z.forEach((v, i) => z[i] = v / zl);
    const x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]], xl = Math.hypot(...x); x.forEach((v, i) => x[i] = v / xl);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
  }
  function matrix() {
    const w = canvas.clientWidth, h = canvas.clientHeight, a = 0.3 + Math.sin(cam.t * 0.07) * 0.08;
    const eye = [Math.sin(a) * 2.6, 1.05 + Math.sin(cam.t * 0.05) * 0.04, -Math.cos(a) * 1.9];
    return mul(perspective(0.8, w / Math.max(1, h), 0.05, 30), lookAt(eye, [0, 0.0, 0.95], [0, 1, 0]));
  }
  function project(m, p) {
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / w + 1) / 2, (1 - y / w) / 2];
  }
  function render() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const m = matrix();
    const cursorX = window_.length > 1 ? X(marker / (window_.length - 1) * (COLS - 1)) : 99;
    if (gl && count) {
      gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const p = gl.getAttribLocation(program, 'p'), b = gl.getAttribLocation(program, 'b');
      gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(b); gl.vertexAttribPointer(b, 1, gl.FLOAT, false, 16, 12);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'm'), false, m);
      gl.uniform1f(gl.getUniformLocation(program, 'size'), 5.2 * dpr);
      gl.uniform1f(gl.getUniformLocation(program, 'cursor'), cursorX);
      gl.drawArrays(gl.POINTS, 0, count);
    }
    // The reticle sits on the terrain ridge at the timeline marker.
    if (heights && window_.length > 1) {
      const c = Math.round(marker / (window_.length - 1) * (COLS - 1)), r = peaks[c];
      const [sx, sy] = project(m, [X(c), Y(heights[r * COLS + c]) + 0.14, r / ROWS * 1.9]);
      const stage = document.querySelector('.fx-stage');
      stage.style.setProperty('--gx', (Math.min(0.94, Math.max(0.06, sx)) * 100).toFixed(2) + '%');
      stage.style.setProperty('--gy', (Math.min(0.9, Math.max(0.1, sy)) * 100).toFixed(2) + '%');
      const bar = window_[marker];
      $('reticleLabel').textContent = `${fmt(bar.close)} · ${new Date(bar.time * 1000).toISOString().slice(0, 10)}`;
    }
  }
  const fmt = v => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 4 : 2 }) : '—';

  // One loop for everything that moves; it sleeps when nothing does or the window is hidden.
  let frame = 0, playAt = 0;
  function loop(now) {
    frame = 0;
    if (document.hidden) return;
    const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000); lastFrame = now;
    if (playing) {
      cam.t += dt;
      if (playAt && now - playAt > 90 && window_.length) {
        playAt = now;
        if (marker < window_.length - 1) marker++;
        else if (looping) marker = 0;
        else { playAt = 0; }
        drawArea(); diagnostics();
      }
      needs = true;
    }
    $('clock').textContent = clock();
    if (needs) { needs = false; render(); }
    if (playing || needs) frame = requestAnimationFrame(loop);
  }
  function wake() { if (!frame && !document.hidden) { lastFrame = 0; frame = requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', wake);
  new ResizeObserver(() => { needs = true; drawArea(); wake(); }).observe(canvas);
  const clock = () => { const d = new Date(); return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()].map(v => String(v).padStart(2, '0')).join(':') + ':' + String(d.getUTCMilliseconds()).padStart(3, '0'); };
  setInterval(() => { if (!playing && !document.hidden) $('clock').textContent = clock(); }, 250);

  // ---- timeline ------------------------------------------------------------------------------------------------
  const area = $('area');
  function companions() {
    const group = GROUPS.find(g => g.items.some(i => i.s === selected));
    return [ALL.find(i => i.s === selected), ...group.items.filter(i => i.s !== selected), ...ALL.filter(i => !group.items.includes(i))].slice(0, 4);
  }
  function drawArea() {
    const rows = companions();
    $('trackNames').innerHTML = rows.map(it => `<li>${esc(nameOf(it))}[${esc(it.tag)}]</li>`).join('');
    const dpr = Math.min(2, devicePixelRatio || 1), w = area.clientWidth, h = area.clientHeight;
    if (!w || !h) return;
    area.width = w * dpr; area.height = h * dpr;
    const c = area.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const n = window_.length;
    if (n < 2) return;
    const tone = ['#3a3a3e', '#2c2c30', '#232326', '#1b1b1e'];
    // Back to front: the selected market is drawn last, on top.
    [...rows].reverse().forEach((it, k) => {
      const m = markets.get(it.s); if (!m?.candles.length) return;
      const seg = m.candles.slice(-n).map(x => x.close), lo = Math.min(...seg), hi = Math.max(...seg) || 1;
      const band = rows.length - 1 - k, top = 18 + band * 12, bottom = h;
      c.beginPath(); c.moveTo(0, bottom);
      seg.forEach((v, i) => c.lineTo(i / (seg.length - 1) * w, top + (1 - (v - lo) / ((hi - lo) || 1)) * (bottom - top) * 0.62));
      c.lineTo(w, bottom); c.closePath();
      c.fillStyle = tone[band] || tone[3]; c.fill();
    });
    const sel = window_, lo = Math.min(...sel.map(x => x.close)), hi = Math.max(...sel.map(x => x.close));
    const x = marker / (n - 1), y = 18 + (1 - (sel[marker].close - lo) / ((hi - lo) || 1)) * (h - 18) * 0.62;
    const box = $('marker');
    box.style.setProperty('--mx', (x * 100).toFixed(2) + '%');
    box.style.setProperty('--my', (y - 16) + 'px');
    box.classList.toggle('left', x > 0.78);
    const first = sel[0].close, v = sel[marker].close;
    $('tipLabel').textContent = new Date(sel[marker].time * 1000).toISOString().slice(0, 10) + ' · ZMIANA';
    $('tipValue').textContent = `${((v / first - 1) * 100).toFixed(2)}%`;
  }
  function seek(e) {
    const r = area.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (window_.length) { marker = Math.round(f * (window_.length - 1)); drawArea(); diagnostics(); needs = true; wake(); }
  }
  let dragging = false;
  area.parentElement.addEventListener('pointerdown', e => { dragging = true; area.parentElement.setPointerCapture(e.pointerId); seek(e); });
  area.parentElement.addEventListener('pointermove', e => { if (dragging) seek(e); });
  area.parentElement.addEventListener('pointerup', () => { dragging = false; });
  $('pause').onclick = () => { playing = false; playAt = 0; $('pause').classList.add('on'); $('play').classList.remove('on'); };
  $('play').onclick = () => { playing = true; playAt = performance.now(); if (marker >= window_.length - 1) marker = 0; $('play').classList.add('on'); $('pause').classList.remove('on'); wake(); };
  $('loop').onclick = () => { looping = !looping; $('loop').classList.toggle('on', looping); $('loop').setAttribute('aria-pressed', String(looping)); };
  const ZOOMS = [1, 2, 4];
  const setZoom = step => { const i = Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + step)); zoom = ZOOMS[i]; $('zoom').textContent = zoom * 100 + '%'; marker = Infinity; build(); drawArea(); diagnostics(); };
  $('zoomIn').onclick = () => setZoom(1); $('zoomOut').onclick = () => setZoom(-1);

  // ---- right column ----------------------------------------------------------------------------------------------
  let seen = new Set();
  async function loadNews() {
    try {
      const { items = [] } = await getJson('/api/news');
      $('stream').innerHTML = items.slice(0, 14).map(it => {
        const t = new Date(it.time), fresh = seen.size && !seen.has(it.id);
        return `<li${fresh ? ' class="fresh"' : ''}><a href="${esc(it.link)}" target="_blank" rel="noopener" title="${esc(it.pl || it.title)}"><time>[${t.toLocaleTimeString('pl-PL', { hour12: false })}]</time><span>${esc(it.pl || it.title)}</span></a></li>`;
      }).join('');
      seen = new Set(items.map(i => i.id));
    } catch { if (!$('stream').children.length) $('stream').innerHTML = '<li><a><time>[--:--:--]</time><span>Wydarzenia chwilowo niedostępne</span></a></li>'; }
  }
  const SESSIONS = { Q1: 'Azja', Q2: 'Londyn', Q3: 'NY AM', Q4: 'NY PM' };
  function sessionNow() {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    const q = hour >= 18 ? 'Q1' : hour < 6 ? 'Q2' : hour < 12 ? 'Q3' : 'Q4';
    return `${q} · ${SESSIONS[q]}`;
  }
  let highs = {};
  async function loadHighs() {
    try { highs[selected] = await getJson(`/api/highs?symbol=${encodeURIComponent(selected)}`); diagnostics(); } catch {}
  }
  function diagnostics() {
    const it = ALL.find(i => i.s === selected), m = markets.get(selected), h = highs[selected];
    const bar = window_[marker];
    const rows = [['CEL', `${nameOf(it)}[${it.tag}]`], ['CENA', fmt(m?.price)], ['ZMIANA 1D', Number.isFinite(m?.change) ? `${m.change > 0 ? '+' : ''}${m.change.toFixed(2)}%` : '—'],
      ['HOTD', h?.hotd ? h.hotd.join(' · ') : '—'], ['LOTD', h?.lotd ? h.lotd.join(' · ') : '—'], ['SESJA', sessionNow()]];
    $('diag').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('note').textContent = bar ? `Znacznik ${new Date(bar.time * 1000).toISOString().slice(0, 10)}: zamknięcie ${fmt(bar.close)}, zakres ${fmt(bar.low)} – ${fmt(bar.high)}. ${h?.hotw ? `Szczyt tygodnia w ${h.hotw.join(' · ')}, dołek w ${h.lotw.join(' · ')}.` : ''}` : 'Ładowanie danych…';
    $('stageNote').textContent = bar ? `${nameOf(it)} · ${window_.length} świec dziennych · teren: w poprzek czas, w głąb poziom ceny` : '';
  }
  function show() { build(); drawArea(); diagnostics(); if (!highs[selected]) loadHighs(); }

  // Keyboard: ↑/↓ change the market, space plays or pauses.
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const i = ALL.findIndex(x => x.s === selected); select(ALL[(i + (e.key === 'ArrowDown' ? 1 : -1) + ALL.length) % ALL.length].s); }
    if (e.key === ' ') { e.preventDefault(); (playing && playAt ? $('pause') : $('play')).click(); }
  });
  $('refresh').onclick = () => { loadAll(); loadNews(); highs = {}; loadHighs(); };

  // Mac app (UNCsWay Final): the page draws the title bar, so dragging it moves the window.
  const drag = window.webkit?.messageHandlers?.windowDrag;
  if (drag) {
    for (const el of document.querySelectorAll('[data-drag]')) {
      el.addEventListener('mousedown', e => { if (e.button === 0 && !e.target.closest('a,button') && e.detail === 1) drag.postMessage('drag'); });
      el.addEventListener('dblclick', e => { if (!e.target.closest('a,button')) drag.postMessage('zoom'); });
    }
  }

  renderGroups(); diagnostics(); wake();
  $('play').classList.add('on');
  loadAll(); loadNews(); loadHighs();
  setInterval(() => { if (!document.hidden) loadNews(); }, 60000);
  setInterval(() => { if (!document.hidden) { loadAll(); loadHighs(); } }, 300000);
})();
