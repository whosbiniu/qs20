// Chart appearance of the BBB / UNC terminals, modelled on TradingView's "Chart settings": candles (bodies, borders,
// wicks, hollow candles, colour by previous close), last price line, volume, scales, background and grid, crosshair,
// text and a watermark, plus templates. Settings are shared by both layouts, and either layout may keep its own.
// Empty colours follow the site theme. Charts read their options from here and re-theme on "terminalappearance".
(function (root) {
  'use strict';
  const KEY = 'terminal-appearance-v1';
  const DEFAULTS = {
    style: 'candles', body: true, borders: true, wick: true,
    upBody: '', downBody: '', upBorder: '', downBorder: '', upWick: '', downWick: '', prevClose: false,
    lastLine: true, lastLineStyle: 2, lastLabel: true, precision: 'auto',
    volUp: '', volDown: '', volOpacity: 40,
    bgType: 'solid', bg: '', bg2: '', vGrid: false, hGrid: false, gridColor: '', gridStyle: 0,
    text: '', fontSize: 10, font: 'mono', scaleLine: '',
    crossMode: 'normal', crossColor: '', crossStyle: 3, crossWidth: 1, crossLabels: true,
    scaleMode: 0, invert: false, marginTop: 10, marginBottom: 10, timeVisible: true, seconds: false,
    watermark: false, wmText: '{symbol} · {interval}', wmColor: '', wmSize: 48,
  };
  const TEMPLATES = {
    theme: { name: 'Motyw strony', values: {} },
    tradingview: { name: 'TradingView (ciemny)', values: { upBody: '#26a69a', downBody: '#ef5350', upBorder: '#26a69a', downBorder: '#ef5350', upWick: '#26a69a', downWick: '#ef5350', bg: '#131722', vGrid: true, hGrid: true, gridColor: '#2a2e39', text: '#b2b5be', scaleLine: '#2a2e39', crossColor: '#758696', volUp: '#26a69a', volDown: '#ef5350', volOpacity: 50, font: 'system', fontSize: 11 } },
    classic: { name: 'Klasyczny zielono-czerwony', values: { upBody: '#089981', downBody: '#f23645', upBorder: '#089981', downBorder: '#f23645', upWick: '#089981', downWick: '#f23645', volUp: '#089981', volDown: '#f23645', hGrid: true, gridColor: '#80808026' } },
    hollow: { name: 'Puste świece', values: { style: 'hollow', upBorder: '#26a69a', upWick: '#26a69a', downBody: '#ef5350', downBorder: '#ef5350', downWick: '#ef5350', volUp: '#26a69a', volDown: '#ef5350' } },
    contrast: { name: 'Wysoki kontrast', values: { upBody: '#00e676', downBody: '#ff1744', upBorder: '#00e676', downBorder: '#ff1744', upWick: '#00e676', downWick: '#ff1744', bg: '#000000', text: '#ffffff', crossColor: '#ffffff', crossStyle: 0, volUp: '#00e676', volDown: '#ff1744', volOpacity: 55, fontSize: 11 } },
    blue: { name: 'Niebieski / pomarańczowy (dla daltonistów)', values: { upBody: '#3987e5', downBody: '#e8773a', upBorder: '#3987e5', downBorder: '#e8773a', upWick: '#3987e5', downWick: '#e8773a', volUp: '#3987e5', volDown: '#e8773a' } },
  };
  const clampNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
  // Stored values are untrusted: known keys only, with their type and range.
  function clean(v) {
    if (!v || typeof v !== 'object') return null;
    const out = {};
    for (const [k, d] of Object.entries(DEFAULTS)) {
      const x = v[k];
      if (x === undefined) continue;
      if (typeof d === 'boolean') out[k] = !!x;
      else if (typeof d === 'number') out[k] = clampNum(x, k === 'wmSize' ? 12 : k === 'fontSize' ? 8 : 0, k === 'wmSize' ? 160 : k === 'fontSize' ? 18 : k === 'volOpacity' ? 100 : k.startsWith('margin') ? 45 : 4, d);
      else if (k === 'wmText') out[k] = String(x).slice(0, 60);
      else if (['style', 'bgType', 'font', 'crossMode', 'precision'].includes(k)) out[k] = String(x).slice(0, 12);
      else out[k] = typeof x === 'string' && (x === '' || HEX.test(x)) ? x : d;
    }
    return out;
  }
  function read() {
    let s; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    const templates = {};
    for (const [name, v] of Object.entries(s?.templates || {})) if (typeof name === 'string' && name.length <= 40) { const c = clean(v); if (c) templates[name] = c; }
    return { shared: clean(s?.shared) || {}, BBB: clean(s?.BBB), UNC: clean(s?.UNC), templates };
  }
  let state = read();
  const write = () => (root.Store?.set || ((k, v) => localStorage.setItem(k, v)))(KEY, JSON.stringify(state));
  const changed = () => root.dispatchEvent?.(new CustomEvent('terminalappearance'));
  root.addEventListener?.('storage', e => { if (e.key === KEY) { state = read(); changed(); } });
  const layoutOf = scope => scope === 'UNC' || scope === 'BBB' ? scope : 'BBB';
  const get = scope => ({ ...DEFAULTS, ...(state[layoutOf(scope)] || state.shared) });

  // '#rrggbbaa' → rgba(); '' → the theme colour.
  const css = (v, fallback) => {
    if (!v) return fallback;
    if (v.length === 9) { const n = [1, 3, 5, 7].map(i => parseInt(v.slice(i, i + 2), 16)); return `rgba(${n[0]},${n[1]},${n[2]},${(n[3] / 255).toFixed(3)})`; }
    return v;
  };
  const withAlpha = (color, pct) => {
    const m = /^#([0-9a-f]{6})/i.exec(color || '');
    if (m) return '#' + m[1] + Math.round(pct / 100 * 255).toString(16).padStart(2, '0');
    const r = /rgba?\(([^)]+)\)/.exec(color || '');
    if (r) { const p = r[1].split(',').map(x => x.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${(pct / 100).toFixed(3)})`; }
    return color;
  };
  const FONTS = { mono: 'ui-monospace, Menlo, monospace', system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' };

  // palette: { bg, ink, dim, line, up, down } of the terminal theme.
  function chartOptions(scope, p) {
    const s = get(scope), bg = css(s.bg, p.bg), grid = css(s.gridColor, p.line), cross = css(s.crossColor, p.dim), scaleLine = css(s.scaleLine, p.line);
    const gradient = LightweightCharts.ColorType?.VerticalGradient || 'gradient';
    return {
      layout: { background: s.bgType === 'gradient' ? { type: gradient, topColor: bg, bottomColor: css(s.bg2, p.bg) } : { type: 'solid', color: bg }, textColor: css(s.text, p.dim), fontFamily: FONTS[s.font] || FONTS.mono, fontSize: s.fontSize },
      grid: { vertLines: { visible: s.vGrid, color: grid, style: s.gridStyle }, horzLines: { visible: s.hGrid, color: grid, style: s.gridStyle } },
      rightPriceScale: { borderColor: scaleLine, mode: s.scaleMode, invertScale: s.invert, scaleMargins: { top: s.marginTop / 100, bottom: s.marginBottom / 100 } },
      timeScale: { borderColor: scaleLine, timeVisible: s.timeVisible, secondsVisible: s.seconds },
      crosshair: { mode: s.crossMode === 'magnet' ? 1 : s.crossMode === 'hidden' ? 2 : 0,
        vertLine: { color: cross, style: s.crossStyle, width: s.crossWidth, labelVisible: s.crossLabels, labelBackgroundColor: cross },
        horzLine: { color: cross, style: s.crossStyle, width: s.crossWidth, labelVisible: s.crossLabels, labelBackgroundColor: cross } },
    };
  }
  function candleColors(scope, p) {
    const s = get(scope), up = p.up || p.ink, down = p.down || p.bg;
    const upBody = css(s.upBody, up), downBody = css(s.downBody, down);
    return { upBody: s.style === 'hollow' ? 'rgba(0,0,0,0)' : upBody, downBody, upBorder: css(s.upBorder, upBody), downBorder: css(s.downBorder, downBody), upWick: css(s.upWick, css(s.upBorder, upBody)), downWick: css(s.downWick, css(s.downBorder, downBody)) };
  }
  function seriesOptions(scope, p) {
    const s = get(scope), c = candleColors(scope, p);
    return { upColor: s.body ? c.upBody : 'rgba(0,0,0,0)', downColor: s.body ? c.downBody : 'rgba(0,0,0,0)', borderVisible: s.borders || s.style === 'hollow', borderUpColor: c.upBorder, borderDownColor: c.downBorder,
      wickVisible: s.wick, wickUpColor: c.upWick, wickDownColor: c.downWick,
      priceLineVisible: s.lastLine, priceLineStyle: s.lastLineStyle, lastValueVisible: s.lastLabel };
  }
  // Price precision: automatic from the price, or fixed.
  function priceFormat(scope, last) {
    const s = get(scope), auto = last > 100 ? 2 : last > 1 ? 4 : 8, precision = s.precision === 'auto' ? auto : clampNum(s.precision, 0, 10, auto);
    return { type: 'price', precision, minMove: 10 ** -precision };
  }
  // "auto" volume follows the candle colours (the border for hollow up candles).
  const volumeColor = (scope, p, up) => { const s = get(scope), c = candleColors(scope, p); return withAlpha(css(up ? s.volUp : s.volDown, up ? (s.style === 'hollow' ? c.upBorder : c.upBody) : c.downBody), s.volOpacity); };
  // TradingView's "colour bars based on previous close": each bar takes the colour of close vs the previous close.
  function colorBars(candles, scope, p) {
    const s = get(scope);
    if (!s.prevClose) return candles;
    const c = candleColors(scope, p);
    return candles.map((b, i) => { const upBar = i === 0 || b.close >= candles[i - 1].close; return { ...b, color: upBar ? (s.body ? c.upBody : 'rgba(0,0,0,0)') : (s.body ? c.downBody : 'rgba(0,0,0,0)'), borderColor: upBar ? c.upBorder : c.downBorder, wickColor: upBar ? c.upWick : c.downWick }; });
  }
  const colorBar = (bar, prev, scope, p) => get(scope).prevClose ? colorBars(prev ? [prev, bar] : [bar], scope, p).at(-1) : bar;
  // A text watermark in the middle of the price pane.
  const marks = new WeakMap();
  function watermark(chart, scope, p, vars = {}) {
    if (!chart?.panes || !LightweightCharts.createTextWatermark) return;
    const s = get(scope);
    let wm = marks.get(chart);
    if (!s.watermark) { if (wm) { try { wm.detach(); } catch {} marks.delete(chart); } return; }
    const text = s.wmText.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    const options = { horzAlign: 'center', vertAlign: 'center', lines: [{ text, color: css(s.wmColor, withAlpha(p.dim, 22)), fontSize: s.wmSize, fontStyle: '600' }] };
    try { if (wm) wm.applyOptions(options); else marks.set(chart, LightweightCharts.createTextWatermark(chart.panes()[0], options)); } catch {}
  }

  // ---- settings dialog --------------------------------------------------------------------------------------------
  const TABS = [['candles', 'Świece'], ['volume', 'Wolumen'], ['scales', 'Skale i czas'], ['canvas', 'Tło i siatka'], ['cross', 'Kursor'], ['watermark', 'Znak wodny']];
  const LINE_STYLES = [[0, 'ciągła'], [1, 'kropkowana'], [2, 'kreskowana'], [3, 'długie kreski'], [4, 'rzadkie kropki']];
  let dialog = null;
  function open({ scope = 'BBB', palette } = {}) {
    if (dialog) return;
    const esc = t => String(t ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const before = JSON.stringify(state);
    let target = state[scope] ? scope : 'shared', tab = 'candles';
    const values = () => ({ ...DEFAULTS, ...(target === 'shared' ? state.shared : state[target] || state.shared) });
    const p = palette();
    const auto = { upBody: p.up || p.ink, downBody: p.down || p.bg, upBorder: p.up || p.ink, downBorder: p.down || p.bg, upWick: p.up || p.ink, downWick: p.down || p.bg, volUp: p.up || p.ink, volDown: p.down || p.dim, bg: p.bg, bg2: p.bg, gridColor: p.line, text: p.dim, scaleLine: p.line, crossColor: p.dim, wmColor: p.dim };
    const toHex = c => { if (/^#[0-9a-f]{6}/i.test(c || '')) return c.slice(0, 7); const m = /rgba?\(([^)]+)\)/.exec(c || ''); return m ? '#' + m[1].split(',').slice(0, 3).map(x => Math.round(Number(x)).toString(16).padStart(2, '0')).join('') : '#808080'; };
    const color = (key, label) => {
      const v = values()[key], alpha = v && v.length === 9 ? Math.round(parseInt(v.slice(7), 16) / 255 * 100) : 100;
      return `<div class="ta-row"><span>${label}</span><span class="ta-color${v ? '' : ' auto'}"><input type="color" data-color="${key}" value="${toHex(v || auto[key])}" aria-label="${esc(label)}"><input type="range" min="10" max="100" step="5" data-alpha="${key}" value="${alpha}" title="Krycie ${alpha}%" aria-label="Krycie: ${esc(label)}"><button type="button" data-auto="${key}" title="Kolor z motywu strony" aria-pressed="${!v}">auto</button></span></div>`;
    };
    const check = (key, label) => `<label class="ta-row ta-check"><input type="checkbox" data-key="${key}" ${values()[key] ? 'checked' : ''}><span>${label}</span></label>`;
    const select = (key, label, options) => `<label class="ta-row"><span>${label}</span><select data-key="${key}">${options.map(([v, n]) => `<option value="${v}" ${String(values()[key]) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
    const number = (key, label, min, max, step = 1) => `<label class="ta-row"><span>${label}</span><input type="number" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${values()[key]}"></label>`;
    const text = (key, label, hint) => `<label class="ta-row"><span>${label}</span><input type="text" data-key="${key}" value="${esc(values()[key])}" maxlength="60" placeholder="${esc(hint)}"></label>`;
    const h = t => `<h5>${t}</h5>`;
    const panes = {
      candles: () => select('style', 'Typ', [['candles', 'świece'], ['hollow', 'puste świece (wzrostowe)']]) + check('body', 'Korpus') + color('upBody', 'Korpus wzrostowy') + color('downBody', 'Korpus spadkowy')
        + check('borders', 'Obramowanie') + color('upBorder', 'Obramowanie wzrostowe') + color('downBorder', 'Obramowanie spadkowe')
        + check('wick', 'Knoty') + color('upWick', 'Knot wzrostowy') + color('downWick', 'Knot spadkowy')
        + check('prevClose', 'Koloruj według poprzedniego zamknięcia') + h('Ostatnia cena') + check('lastLine', 'Linia ostatniej ceny') + select('lastLineStyle', 'Styl linii', LINE_STYLES) + check('lastLabel', 'Etykieta ceny na skali')
        + select('precision', 'Dokładność ceny', [['auto', 'automatyczna'], ...[0, 1, 2, 3, 4, 5, 6, 8].map(n => [n, n + ' miejsc'])]),
      volume: () => color('volUp', 'Wolumen wzrostowy') + color('volDown', 'Wolumen spadkowy') + number('volOpacity', 'Krycie słupków (%)', 5, 100, 5) + '<p class="ta-note">Wolumen włączasz w bibliotece indykatorów (ƒx).</p>',
      scales: () => select('scaleMode', 'Skala ceny', [[0, 'zwykła'], [1, 'logarytmiczna'], [2, 'procentowa'], [3, 'indeksowana do 100']]) + check('invert', 'Odwróć skalę')
        + number('marginTop', 'Margines górny (%)', 0, 45) + number('marginBottom', 'Margines dolny (%)', 0, 45) + color('scaleLine', 'Linie skal')
        + h('Oś czasu') + check('timeVisible', 'Pokaż godziny') + check('seconds', 'Pokaż sekundy'),
      canvas: () => select('bgType', 'Tło', [['solid', 'jednolite'], ['gradient', 'gradient']]) + color('bg', 'Kolor tła (góra)') + (values().bgType === 'gradient' ? color('bg2', 'Kolor tła (dół)') : '')
        + h('Siatka') + check('vGrid', 'Linie pionowe') + check('hGrid', 'Linie poziome') + color('gridColor', 'Kolor siatki') + select('gridStyle', 'Styl siatki', LINE_STYLES)
        + h('Tekst') + color('text', 'Kolor tekstu') + number('fontSize', 'Rozmiar tekstu', 8, 18) + select('font', 'Czcionka', [['mono', 'monospace'], ['system', 'systemowa']]),
      cross: () => select('crossMode', 'Tryb kursora', [['normal', 'swobodny'], ['magnet', 'magnes (przyciąga do ceny zamknięcia)'], ['hidden', 'ukryty']]) + color('crossColor', 'Kolor') + select('crossStyle', 'Styl linii', LINE_STYLES)
        + number('crossWidth', 'Grubość', 1, 4) + check('crossLabels', 'Etykiety na osiach'),
      watermark: () => check('watermark', 'Pokaż znak wodny') + text('wmText', 'Tekst', '{symbol} · {interval}') + '<p class="ta-note">{symbol} i {interval} zamieniają się na instrument i interwał wykresu.</p>' + color('wmColor', 'Kolor') + number('wmSize', 'Rozmiar', 12, 160, 2),
    };
    const templates = () => [...Object.entries(TEMPLATES).map(([k, t]) => [k, t.name]), ...Object.keys(state.templates).map(n => ['user:' + n, n + ' (własny)'])];
    const el = document.createElement('div');
    el.className = 'ta-backdrop';
    el.innerHTML = `<div class="ta-dialog" role="dialog" aria-modal="true" aria-labelledby="ta-title"><header><h4 id="ta-title">Ustawienia wykresu</h4><button type="button" class="ta-x" data-cancel aria-label="Zamknij">×</button></header>
      <div class="ta-scope" role="group" aria-label="Zakres ustawień"></div>
      <div class="ta-main"><div class="ta-tabs" role="tablist" aria-label="Sekcje ustawień">${TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}">${n}</button>`).join('')}</div><div class="ta-pane"></div></div>
      <footer><label class="ta-tpl">Szablon <select data-template><option value="">wybierz…</option></select></label><button type="button" data-savetpl>Zapisz jako szablon</button><span class="ta-grow"></span><button type="button" data-reset>Przywróć domyślne</button><button type="button" data-cancel>Anuluj</button><button type="button" class="ta-ok" data-ok>OK</button></footer></div>`;
    document.body.append(el);
    dialog = el;
    function render() {
      const own = s => !!state[s];
      el.querySelector('.ta-scope').innerHTML = `<span>Dotyczy:</span>${[['shared', 'obu terminali'], ['BBB', 'tylko BBB'], ['UNC', 'tylko UNC']].map(([k, n]) => `<button type="button" data-target="${k}" aria-pressed="${target === k}">${n}${k !== 'shared' && own(k) ? ' ●' : ''}</button>`).join('')}
        <small>${target === 'shared' ? `Wspólne dla BBB i UNC${own('BBB') || own('UNC') ? ` (poza ${['BBB', 'UNC'].filter(own).join(' i ')}, które mają własne)` : ''}.` : own(target) ? `${target} ma własne ustawienia. <button type="button" class="ta-link" data-drop>Wróć do wspólnych</button>` : `${target} używa wspólnych. Pierwsza zmiana utworzy własne ustawienia ${target}.`}</small>`;
      el.querySelectorAll('[data-tab]').forEach(b => { b.setAttribute('aria-current', String(b.dataset.tab === tab)); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); });
      el.querySelector('.ta-pane').innerHTML = panes[tab]();
      el.querySelector('[data-template]').innerHTML = '<option value="">wybierz…</option>' + templates().map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('');
    }
    function set(patch) {
      if (target === 'shared') state.shared = clean({ ...state.shared, ...patch });
      else state[target] = clean({ ...(state[target] || state.shared), ...patch });
      changed();
    }
    const close = keep => { if (!keep) { state = JSON.parse(before); changed(); } else write(); el.remove(); dialog = null; document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', e => {
      if (e.target === el) { close(false); return; }
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset;
      if (d.cancel !== undefined) close(false);
      else if (d.ok !== undefined) close(true);
      else if (d.tab) { tab = d.tab; render(); }
      else if (d.target) { target = d.target; render(); }
      else if (d.drop !== undefined) { state[target] = null; changed(); render(); }
      else if (d.auto) { set({ [d.auto]: '' }); render(); }
      else if (d.reset !== undefined) { if (target === 'shared') state.shared = {}; else state[target] = {}; changed(); render(); }
      else if (d.savetpl !== undefined) {
        const name = (prompt('Nazwa szablonu:') || '').trim().slice(0, 40);
        if (name) { state.templates[name] = values(); write(); render(); }
      }
    });
    el.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.color || t.dataset.alpha) {
        const key = t.dataset.color || t.dataset.alpha, row = t.closest('.ta-color'), hex = row.querySelector('[data-color]').value, a = Number(row.querySelector('[data-alpha]').value);
        set({ [key]: a >= 100 ? hex : hex + Math.round(a / 100 * 255).toString(16).padStart(2, '0') });
        row.classList.remove('auto'); row.querySelector('[data-auto]').setAttribute('aria-pressed', 'false'); row.querySelector('[data-alpha]').title = `Krycie ${a}%`;
      } else if (t.dataset.key && t.type === 'text') set({ [t.dataset.key]: t.value });
    });
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.template !== undefined) {
        const v = t.value; if (!v) return;
        const values = v.startsWith('user:') ? state.templates[v.slice(5)] : TEMPLATES[v]?.values;
        if (values) { if (target === 'shared') state.shared = clean(values) || {}; else state[target] = clean(values) || {}; changed(); render(); }
        return;
      }
      const key = t.dataset.key; if (!key || t.type === 'text') return;
      const d = DEFAULTS[key];
      set({ [key]: t.type === 'checkbox' ? t.checked : typeof d === 'number' ? Number(t.value) : t.value });
      if (key === 'bgType') render();
    });
    render();
    el.querySelector('[data-tab]').focus();
  }

  const style = typeof document !== 'undefined' && document.createElement ? document.createElement('style') : {};
  style.textContent = `.ta-backdrop{position:fixed;inset:0;z-index:1000;background:#0008;display:grid;place-items:center}
.ta-dialog{width:min(640px,calc(100vw - 24px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;background:var(--tw-chrome,var(--bg));color:var(--ink);border:1px solid var(--line);border-radius:8px;box-shadow:0 20px 60px #000a;font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.ta-dialog header{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}.ta-dialog h4{margin:0;flex:1;font-size:14px;font-weight:600}
.ta-dialog button,.ta-dialog select,.ta-dialog input[type=number],.ta-dialog input[type=text]{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:4px 8px}.ta-dialog button{cursor:pointer}.ta-dialog button:hover{border-color:var(--dim)}
.ta-dialog .ta-x{border:0;background:none;font-size:18px;color:var(--dim)}
.ta-scope{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:10px 16px;border-bottom:1px solid var(--line);color:var(--dim)}.ta-scope button[aria-pressed=true]{border-color:var(--ink);background:var(--faint)}.ta-scope small{flex-basis:100%}.ta-dialog .ta-link{border:0;background:none;padding:0;text-decoration:underline;color:var(--ink)}
.ta-main{display:flex;min-height:0;flex:1}.ta-tabs{display:flex;flex-direction:column;gap:2px;padding:10px;border-right:1px solid var(--line);flex:none;width:150px}.ta-tabs button{text-align:left;border:0;background:none;color:var(--dim);padding:7px 10px}.ta-tabs button[aria-current=true]{background:var(--faint);color:var(--ink)}
.ta-pane{flex:1;overflow:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px;min-height:360px}.ta-pane h5{margin:8px 0 0;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);font-weight:500}
.ta-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.ta-row>span:first-child{color:var(--ink)}.ta-row select,.ta-row input[type=number],.ta-row input[type=text]{min-width:170px}.ta-row input[type=number]{min-width:0;width:80px}
.ta-check{justify-content:flex-start}.ta-check input{margin:0}
.ta-color{display:flex;align-items:center;gap:6px}.ta-color input[type=color]{width:32px;height:24px;padding:0 2px;border:1px solid var(--line);border-radius:4px;background:transparent;cursor:pointer}.ta-color input[type=range]{width:80px}.ta-color button{font-size:10px!important;padding:2px 6px!important;color:var(--dim)!important}.ta-color button[aria-pressed=true]{color:var(--ink)!important;border-color:var(--ink)!important}.ta-color.auto input{opacity:.5}
.ta-note{margin:0;color:var(--dim);font-size:11px}
.ta-dialog footer{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--line)}.ta-grow{flex:1}.ta-tpl{display:flex;align-items:center;gap:6px;color:var(--dim)}.ta-dialog .ta-ok{background:var(--ink);color:var(--bg);border-color:var(--ink)}
@media(max-width:560px){.ta-main{flex-direction:column}.ta-tabs{width:auto;flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--line)}}`;
  if (typeof document !== 'undefined' && document.head?.append) document.head.append(style);

  root.TerminalAppearance = { DEFAULTS, TEMPLATES, get, clean, chartOptions, seriesOptions, priceFormat, volumeColor, colorBars, colorBar, watermark, open,
    // for tests
    _reset() { state = read(); } };
})(globalThis);
