// Your own Pine Script indicators in the terminal: a script library, an editor, and per-chart drawing of the results
// computed by pine-engine.js. Scripts live in the browser (localStorage "pine-scripts"); which of them each chart
// shows, and their settings (input.*), are stored with that chart. TerminalPine.extend(studies, …) wraps a chart's
// studies object, so the charts that already refresh their studies refresh Pine scripts the same way.
(function (root) {
  'use strict';
  const Engine = root.PineEngine;
  const KEY = 'pine-scripts', PREFIX = 'pine:';
  const SPAN = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '8h': 28800, '12h': 43200, '1d': 86400, '3d': 259200, '1w': 604800, '1M': 2592000 };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const save = (key, value) => (root.Store?.set || ((k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }))(key, JSON.stringify(value));
  const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; } };
  const isPine = id => typeof id === 'string' && id.startsWith(PREFIX);

  // ==== library ====================================================================================================
  const valid = s => s && typeof s.id === 'string' && /^[a-z0-9]{6,20}$/.test(s.id) && typeof s.source === 'string' && s.source.length <= 200000 && typeof s.name === 'string';
  let scripts = read(KEY, []).filter(valid);
  const compiled = new Map();   // id → { source, program, error }
  function compiledOf(script) {
    let c = compiled.get(script.id);
    if (!c || c.source !== script.source) {
      c = { source: script.source };
      try { c.program = Engine.compile(script.source); } catch (e) { c.error = e; }
      compiled.set(script.id, c);
    }
    return c;
  }
  function syncCatalog() {
    const catalog = root.TerminalIndicators?.catalog;
    if (catalog) {
      for (let i = catalog.length - 1; i >= 0; i--) if (catalog[i].pine) catalog.splice(i, 1);
      for (const s of scripts) {
        const d = Engine.describe(s.source);
        catalog.push({ id: PREFIX + s.id, title: s.name || d.title, chip: (s.name || d.title).slice(0, 24), group: 'Własne · Pine Script', pine: true,
          description: `${d.overlay ? 'Rysowany na wykresie' : 'W osobnym panelu pod wykresem'} · własny skrypt Pine. „Edytuj”, aby zmienić kod.` });
      }
    }
    root.dispatchEvent?.(new CustomEvent('pinelibrary'));
  }
  const library = {
    list: () => scripts.slice(),
    get: id => scripts.find(s => s.id === id) || null,
    save({ id, name, source }) {
      const now = Date.now();
      let s = id && scripts.find(x => x.id === id);
      if (s) Object.assign(s, { name, source, updated: now });
      else { s = { id: now.toString(36) + Math.random().toString(36).slice(2, 8), name, source, created: now, updated: now }; scripts.push(s); }
      if (!save(KEY, scripts)) throw new Error('Skrypt nie zmieścił się w pamięci przeglądarki.');
      syncCatalog();
      return s.id;
    },
    remove(id) { scripts = scripts.filter(s => s.id !== id); compiled.delete(id); save(KEY, scripts); syncCatalog(); },
  };
  // Another tab changed the library.
  root.addEventListener?.('storage', e => { if (e.key === KEY) { scripts = read(KEY, []).filter(valid); syncCatalog(); } });

  // ==== drawing on a chart ==========================================================================================
  const LINE_STYLE = { solid: 0, dotted: 1, dashed: 2 };
  const MARKER_SHAPE = { triangleup: 'arrowUp', arrowup: 'arrowUp', labelup: 'arrowUp', triangledown: 'arrowDown', arrowdown: 'arrowDown', labeldown: 'arrowDown',
    circle: 'circle', char: 'circle', square: 'square', diamond: 'square', flag: 'square', xcross: 'circle', cross: 'circle' };
  const MARKER_POSITION = { abovebar: 'aboveBar', top: 'aboveBar', belowbar: 'belowBar', bottom: 'belowBar', absolute: 'atPriceMiddle' };
  const MARKER_SIZE = { tiny: .5, small: .75, normal: 1, auto: 1, large: 1.5, huge: 2 };
  const withAlpha = (color, alpha) => { const c = Engine.parseColor(color); return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})` : color; };

  function attach({ pop, storageKey = 'hl-pine' } = {}) {
    const state = read(storageKey, { on: {}, inputs: {} });
    state.on = state.on && typeof state.on === 'object' ? state.on : {};
    state.inputs = state.inputs && typeof state.inputs === 'object' ? state.inputs : {};
    const persist = () => save(storageKey, state);
    let panel = null, ticker = '', period = '', suspended = false, timer = 0, lastRun = 0, open = null, statusEl = null;
    const views = new Map(), results = new Map();
    const host = document.createElement('div');
    host.className = 'pine-settings'; host.hidden = true;
    if (pop) pop.insertBefore(host, pop.querySelector('.ht-ind-pop-empty') || null);
    const enabledIds = () => Object.keys(state.on).filter(id => state.on[id] && library.get(id));

    function seriesFor(plot, meta) {
      const L = root.LightweightCharts, color = plot.colors.find(Boolean) || 'rgba(41, 98, 255, 1)';
      const common = { priceLineVisible: false, lastValueVisible: plot.display !== 'none', title: '', crosshairMarkerVisible: true };
      if (meta.precision !== null && meta.precision !== undefined) common.priceFormat = { type: 'price', precision: meta.precision, minMove: 10 ** -meta.precision };
      switch (plot.style) {
        case 'histogram': case 'columns': return [L.HistogramSeries, { ...common, color, base: plot.histbase || 0 }];
        case 'area': case 'areabr': return [L.AreaSeries, { ...common, lineColor: color, topColor: withAlpha(color, .32), bottomColor: withAlpha(color, 0), lineWidth: Math.min(4, plot.linewidth) }];
        case 'circles': case 'cross': return [L.LineSeries, { ...common, color, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 1.5 + plot.linewidth }];
        default: return [L.LineSeries, { ...common, color, lineWidth: Math.min(4, plot.linewidth), lineType: /step/.test(plot.style) ? 1 : 0 }];
      }
    }
    const signature = out => JSON.stringify([out.meta.overlay, out.plots.map(p => [p.style, p.display === 'none']), out.hlines.length, out.fills.length > 0 || Object.keys(out.bgcolors).length > 0, out.shapes.length > 0]);
    function create(out) {
      const chart = panel.chart, L = root.LightweightCharts, overlay = !!out.meta.overlay;
      const paneIndex = overlay ? 0 : chart.panes().length;
      const view = { sig: signature(out), overlay, series: [], extra: [], lines: [], out };
      for (const p of out.plots) {
        if (p.display === 'none') { view.series.push(null); continue; }
        const [type, options] = seriesFor(p, out.meta);
        view.series.push(chart.addSeries(type, options, paneIndex));
      }
      // Levels, fills and shapes hang on a series of the same pane: the candles on the chart, or the first plot below it.
      view.anchor = overlay ? panel.series : view.series.find(Boolean);
      if (!view.anchor) { view.anchor = chart.addSeries(L.LineSeries, { visible: false, lastValueVisible: false, priceLineVisible: false }, paneIndex); view.extra.push(view.anchor); }
      view.lines = out.hlines.map(h => view.anchor.createPriceLine({ price: h.price, color: h.color, lineStyle: LINE_STYLE[h.style] ?? 2, lineWidth: Math.min(4, h.linewidth || 1), axisLabelVisible: false, title: '' }));
      view.prim = { attached(p) { view.request = p.requestUpdate; }, detached() { view.request = null; }, paneViews: () => [{ zOrder: () => 'bottom', renderer: () => ({ draw: target => paintBackground(view, target) }) }] };
      view.anchor.attachPrimitive(view.prim);
      if (out.shapes.length && L.createSeriesMarkers) view.markers = L.createSeriesMarkers(overlay ? panel.series : view.anchor, []);
      if (!overlay) try { chart.panes().slice(1).forEach(p => p.setHeight(110)); } catch {}
      return view;
    }
    function update(view, out) {
      view.out = out;
      const times = out.times;
      out.plots.forEach((p, i) => {
        const s = view.series[i];
        if (!s) return;
        const area = p.style === 'area' || p.style === 'areabr', breaks = /br$/.test(p.style);
        s.setData(times.map((time, j) => {
          const v = p.values[j];
          if (!Number.isFinite(v)) return { time };
          // The chart joins points across a gap with the colour of the point before it: for the "…br" styles that
          // point is made transparent, so the line breaks at na like on TradingView.
          const c = breaks && j + 1 < times.length && !Number.isFinite(p.values[j + 1]) ? 'rgba(0, 0, 0, 0)' : p.colors[j];
          return !c ? { time, value: v } : area ? { time, value: v, lineColor: c } : { time, value: v, color: c };
        }));
      });
      out.hlines.forEach((h, i) => view.lines[i]?.applyOptions({ price: h.price }));
      view.markers?.setMarkers(out.shapes.filter(s => times[s.bar] !== undefined).slice(-2000).sort((a, b) => a.bar - b.bar).map(s => {
        const position = MARKER_POSITION[s.location] || 'aboveBar', marker = { time: times[s.bar], position, color: s.color, shape: MARKER_SHAPE[s.style] || 'circle', size: MARKER_SIZE[s.size] || 1, text: s.text || (s.style === 'char' ? s.char : '') };
        if (position === 'atPriceMiddle') marker.price = s.price;
        return marker;
      }));
      view.request?.();
    }
    // bgcolor() and fill() on the chart's canvas, only for the bars on screen.
    function paintBackground(view, target) {
      const out = view.out;
      if (!out || !panel) return;
      const fills = out.fills, bg = out.bgcolors, times = out.times;
      if (!fills.length && !Object.keys(bg).length) return;
      target.useMediaCoordinateSpace(({ context: c, mediaSize: size }) => {
        const ts = panel.chart.timeScale(), range = ts.getVisibleLogicalRange(), spacing = ts.options().barSpacing;
        if (!range) return;
        const from = Math.max(0, Math.floor(range.from) - 1), to = Math.min(times.length - 1, Math.ceil(range.to) + 1);
        for (let i = from; i <= to; i++) {
          if (!bg[i]) continue;
          const x = ts.timeToCoordinate(times[i]);
          if (x === null) continue;
          c.fillStyle = bg[i]; c.fillRect(x - spacing / 2, 0, spacing + .5, size.height);
        }
        const valueOf = (ref, i) => ref.kind === 'hline' ? ref.price : ref.values[i];
        for (const f of fills) for (let i = from; i < to; i++) {
          const color = f.colors[i];
          if (!color) continue;
          const a0 = valueOf(f.a, i), a1 = valueOf(f.a, i + 1), b0 = valueOf(f.b, i), b1 = valueOf(f.b, i + 1);
          if (![a0, a1, b0, b1].every(Number.isFinite)) continue;
          const x0 = ts.timeToCoordinate(times[i]), x1 = ts.timeToCoordinate(times[i + 1]);
          const y = v => view.anchor.priceToCoordinate(v);
          const ya0 = y(a0), ya1 = y(a1), yb0 = y(b0), yb1 = y(b1);
          if ([x0, x1, ya0, ya1, yb0, yb1].some(v => v === null)) continue;
          c.fillStyle = color; c.beginPath(); c.moveTo(x0, ya0); c.lineTo(x1, ya1); c.lineTo(x1, yb1); c.lineTo(x0, yb0); c.closePath(); c.fill();
        }
      });
    }
    function clear(id) {
      const view = views.get(id);
      if (!view || !panel) return;
      views.delete(id);
      try { view.markers?.detach?.(); } catch {}
      try { view.anchor.detachPrimitive(view.prim); } catch {}
      for (const line of view.lines) try { view.anchor.removePriceLine(line); } catch {}
      const own = [...view.series.filter(Boolean), ...view.extra];
      let paneIndex = -1;
      try { paneIndex = own[0]?.getPane().paneIndex() ?? -1; } catch {}
      const before = panel.chart.panes().length;
      for (const s of own) try { panel.chart.removeSeries(s); } catch {}
      // An emptied pane below the chart goes away with its series.
      try { if (paneIndex > 0 && panel.chart.panes().length === before) panel.chart.removePane(paneIndex); } catch {}
    }
    function status() {
      if (!panel) return;
      if (!statusEl) { statusEl = document.createElement('div'); statusEl.className = 'pine-status'; panel.el.append(statusEl); }
      const errors = enabledIds().map(id => [library.get(id), results.get(id)?.error]).filter(([, e]) => e);
      statusEl.hidden = !errors.length;
      statusEl.innerHTML = errors.map(([s, e]) => `<div>⚠ ${esc(s.name)}: ${esc(e.message)}${e.line ? ` (linia ${e.line})` : ''}</div>`).join('');
    }
    function compute() {
      timer = 0; lastRun = Date.now();
      if (!panel || suspended) return;
      const candles = panel.candles || [];
      for (const id of [...views.keys()]) if (!state.on[id] || !library.get(id)) clear(id);
      for (const id of enabledIds()) {
        const script = library.get(id), c = compiledOf(script);
        if (c.error) { results.set(id, { error: c.error }); clear(id); continue; }
        if (!candles.length) continue;
        try {
          const out = Engine.run(c.program, candles, { inputs: state.inputs[id] || {}, ticker, period, span: SPAN[period] });
          results.set(id, { out });
          let view = views.get(id);
          if (view && view.sig !== signature(out)) { clear(id); view = null; }
          if (!view) { view = create(out); views.set(id, view); }
          update(view, out);
        } catch (e) { results.set(id, { error: e }); clear(id); }
      }
      status();
      if (open) renderSettings(open);
    }
    function refresh() {
      if (suspended || timer) return;
      // At most about once a second: a forming candle updates often, a script recalculates every bar.
      timer = setTimeout(compute, Date.now() - lastRun > 1000 ? 0 : 1000 - (Date.now() - lastRun));
    }
    // ---- settings of one script (its input.* values) in the indicator popover ------------------------------
    function renderSettings(id) {
      const script = library.get(id);
      if (!script) { host.hidden = true; return false; }
      const r = results.get(id), inputs = r?.out?.inputs || [], values = state.inputs[id] || {};
      const field = inp => {
        const v = values[inp.index] ?? inp.defval, name = `data-pine-input="${inp.index}"`;
        if (inp.kind === 'bool') return `<label><input type="checkbox" ${name} ${v ? 'checked' : ''}> ${esc(inp.title)}</label>`;
        if (inp.options || inp.kind === 'source') {
          const options = inp.options || [];
          return `<label>${esc(inp.title)} <select ${name}>${options.map(o => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
        }
        if (inp.kind === 'color') { const c = Engine.parseColor(v) || [41, 98, 255, 1], hex = '#' + c.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join(''); return `<label>${esc(inp.title)} <input type="color" ${name} value="${hex}"></label>`; }
        if (inp.kind === 'int' || inp.kind === 'float') return `<label>${esc(inp.title)} <input type="number" ${name} value="${esc(v)}" ${inp.min !== undefined ? `min="${esc(inp.min)}"` : ''} ${inp.max !== undefined ? `max="${esc(inp.max)}"` : ''} step="${esc(inp.step ?? (inp.kind === 'int' ? 1 : 'any'))}"></label>`;
        return `<label>${esc(inp.title)} <input type="text" ${name} value="${esc(v)}"></label>`;
      };
      host.innerHTML = `${r?.error ? `<p class="pine-error">⚠ ${esc(r.error.message)}${r.error.line ? ` · linia ${r.error.line}` : ''}</p>` : ''}
        ${inputs.length ? `<div class="pine-inputs">${inputs.map(field).join('')}</div>` : `<p class="pine-note">${r?.out ? 'Ten skrypt nie ma ustawień (input.*).' : ''}</p>`}
        ${r?.out?.warnings?.length ? `<p class="pine-note">${r.out.warnings.map(esc).join('<br>')}</p>` : ''}
        <div class="pine-actions"><button type="button" data-pine-edit="${esc(id)}">Edytuj kod</button>${inputs.length ? '<button type="button" data-pine-reset>Przywróć domyślne</button>' : ''}</div>`;
      host.hidden = false;
      return true;
    }
    host.addEventListener('change', e => {
      const index = e.target.dataset.pineInput;
      if (index === undefined || !open) return;
      const inp = results.get(open)?.out?.inputs?.[index];
      if (!inp) return;
      let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      if (inp.kind === 'int' || inp.kind === 'float') { v = Number(v); if (!Number.isFinite(v)) return; if (inp.kind === 'int') v = Math.round(v); if (Number.isFinite(inp.min)) v = Math.max(inp.min, v); if (Number.isFinite(inp.max)) v = Math.min(inp.max, v); }
      if (inp.kind === 'color') { const h = String(v); v = `rgba(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)}, 1)`; }
      (state.inputs[open] ||= {})[index] = v;
      persist(); compute();
    });
    host.addEventListener('click', e => {
      if (e.target.closest('[data-pine-reset]') && open) { delete state.inputs[open]; persist(); compute(); }
      const edit = e.target.closest('[data-pine-edit]')?.dataset.pineEdit;
      if (edit) editor.open({ id: edit, candles: () => panel?.candles || [] });
    });
    const onLibrary = () => { for (const id of Object.keys(state.on)) if (!library.get(id)) { delete state.on[id]; delete state.inputs[id]; } persist(); refresh(); };
    root.addEventListener?.('pinelibrary', onLibrary);

    return {
      isEnabled: id => !!state.on[id.slice(PREFIX.length)],
      setEnabled(id, value) {
        const key = id.slice(PREFIX.length);
        if (value) state.on[key] = true; else { delete state.on[key]; clear(key); }
        persist(); compute();
      },
      showSettings(id) { open = isPine(id) ? id.slice(PREFIX.length) : null; if (!open) { host.hidden = true; return false; } return renderSettings(open); },
      bindPanel(next) { panel = next; refresh(); },
      setMarket(coin, interval) { ticker = coin || ''; period = interval || ''; refresh(); },
      refresh,
      suspend() { suspended = true; clearTimeout(timer); timer = 0; },
      resume() { if (!suspended) return; suspended = false; refresh(); },
      candles: () => panel?.candles || [],
      results: () => results,
    };
  }

  // Wraps a chart's studies object: Pine ids go to the Pine controller, everything else to the studies as before.
  function extend(studies, options) {
    const pine = attach(options);
    return { ...studies,
      isEnabled: id => isPine(id) ? pine.isEnabled(id) : studies.isEnabled(id),
      setEnabled: (id, value) => isPine(id) ? pine.setEnabled(id, value) : studies.setEnabled(id, value),
      showSettings(id) { const own = studies.showSettings(isPine(id) ? null : id); return pine.showSettings(id) || own; },
      bindPanel(panel) { studies.bindPanel(panel); pine.bindPanel(panel); },
      setMarket(coin, interval) { studies.setMarket(coin, interval); pine.setMarket(coin, interval); },
      refresh() { studies.refresh(); pine.refresh(); },
      suspend() { studies.suspend?.(); pine.suspend(); },
      resume() { studies.resume?.(); pine.resume(); },
      pine,
    };
  }

  // ==== editor =======================================================================================================
  const TEMPLATE = `//@version=5
indicator("Mój wskaźnik", overlay = true)

length = input.int(20, "Długość", minval = 1)
src = input.source(close, "Źródło")

basis = ta.ema(src, length)
plot(basis, "EMA", color = basis > basis[1] ? color.green : color.red, linewidth = 2)
plotshape(ta.crossover(src, basis), "Przecięcie w górę", style = shape.triangleup, location = location.belowbar, color = color.green)
`;
  const editor = (() => {
    let el = null, current = null, candlesOf = () => [];
    function build() {
      el = document.createElement('div');
      el.className = 'pine-editor'; el.hidden = true;
      el.innerHTML = `<div class="pine-box" role="dialog" aria-modal="true" aria-labelledby="pine-title">
        <header><strong id="pine-title">Pine Script</strong><input class="pine-name" type="text" maxlength="60" placeholder="Nazwa wskaźnika" aria-label="Nazwa wskaźnika">
          <span class="pine-grow"></span><button type="button" data-pe="import">Importuj plik…</button><button type="button" data-pe="close" aria-label="Zamknij">×</button></header>
        <div class="pine-code"><pre class="pine-gutter" aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Kod Pine Script" wrap="off"></textarea></div>
        <p class="pine-msg" role="status" aria-live="polite"></p>
        <footer><button type="button" data-pe="delete">Usuń skrypt</button><span class="pine-help">Pine v5/v6: indicator, ta.*, math.*, input.*, plot, plotshape, hline, fill, bgcolor. Bez strategii, request.security i rysunków.</span>
          <span class="pine-grow"></span><button type="button" data-pe="check">Sprawdź</button><button type="button" data-pe="save" class="pine-primary">Zapisz</button></footer>
        <input type="file" accept=".pine,.txt,text/plain" hidden></div>`;
      document.body.append(el);
      const area = el.querySelector('textarea'), gutter = el.querySelector('.pine-gutter');
      const lines = () => { const n = area.value.split('\n').length; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); gutter.scrollTop = area.scrollTop; };
      area.addEventListener('input', lines);
      area.addEventListener('scroll', () => { gutter.scrollTop = area.scrollTop; });
      area.addEventListener('keydown', e => {
        // Tab indents by four spaces (a Pine block); Shift+Tab takes them back.
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const { selectionStart: a, selectionEnd: b, value } = area;
        if (e.shiftKey) {
          const start = value.lastIndexOf('\n', a - 1) + 1, cut = value.slice(start, start + 4).match(/^ {1,4}/)?.[0].length || 0;
          area.value = value.slice(0, start) + value.slice(start + cut); area.selectionStart = area.selectionEnd = Math.max(start, a - cut);
        } else { area.value = value.slice(0, a) + '    ' + value.slice(b); area.selectionStart = area.selectionEnd = a + 4; }
        lines();
      });
      el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
      el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
      const file = el.querySelector('input[type=file]');
      file.addEventListener('change', async () => {
        const f = file.files?.[0]; file.value = '';
        if (!f) return;
        if (f.size > 200000) { message('Plik jest za duży (limit 200 kB).', true); return; }
        area.value = await f.text(); lines();
        if (!el.querySelector('.pine-name').value) el.querySelector('.pine-name').value = Engine.describe(area.value).title;
        check();
      });
      el.addEventListener('click', e => {
        const action = e.target.closest('[data-pe]')?.dataset.pe;
        if (action === 'close') close();
        if (action === 'import') file.click();
        if (action === 'check') check();
        if (action === 'save') submit();
        if (action === 'delete' && current.id && confirm('Usunąć ten skrypt ze wszystkich wykresów?')) { library.remove(current.id); close(); }
      });
      el.lines = lines;
    }
    function message(text, bad) { const m = el.querySelector('.pine-msg'); m.textContent = text; m.classList.toggle('bad', !!bad); }
    function mark(line) {
      const area = el.querySelector('textarea');
      if (!line) return;
      const rows = area.value.split('\n'), start = rows.slice(0, line - 1).reduce((n, r) => n + r.length + 1, 0);
      area.focus(); area.setSelectionRange(start, start + (rows[line - 1] || '').length);
      area.scrollTop = Math.max(0, (line - 4) * 17);
    }
    // Compile, then run once on the chart's candles to catch runtime errors too.
    function check() {
      const source = el.querySelector('textarea').value;
      try {
        const program = Engine.compile(source), candles = candlesOf();
        if (!candles.length) { message('Składnia poprawna.'); return program; }
        const out = Engine.run(program, candles);
        message(`Działa: ${out.plots.length} wykresów, ${out.hlines.length} poziomów, ${out.shapes.length} znaczników, ${out.inputs.length} ustawień · ${out.meta.overlay ? 'na wykresie' : 'w panelu pod wykresem'}${out.warnings.length ? ' · ' + out.warnings.join(' ') : ''}`);
        return program;
      } catch (e) {
        message(`Błąd${e.line ? ` w linii ${e.line}` : ''}: ${e.message}`, true); mark(e.line);
        return null;
      }
    }
    function submit() {
      if (!check()) return;
      const source = el.querySelector('textarea').value, name = el.querySelector('.pine-name').value.trim() || Engine.describe(source).title;
      try {
        const id = library.save({ id: current.id, name, source });
        const onSaved = current.onSaved;
        close();
        onSaved?.(id);
      } catch (e) { message(e.message, true); }
    }
    function open({ id = null, onSaved = null, candles = null } = {}) {
      if (!el) build();
      const script = id ? library.get(id) : null;
      current = { id: script?.id || null, onSaved };
      candlesOf = candles || (() => []);
      el.querySelector('.pine-name').value = script?.name || '';
      el.querySelector('textarea').value = script?.source || TEMPLATE;
      el.querySelector('[data-pe=delete]').hidden = !script;
      el.querySelector('#pine-title').textContent = script ? 'Edytuj skrypt Pine' : 'Nowy skrypt Pine';
      message('');
      el.hidden = false; el.lines();
      el.querySelector('textarea').focus();
    }
    function close() { if (el) el.hidden = true; current = null; }
    return { open, close, isOpen: () => !!el && !el.hidden };
  })();

  // ==== styles =======================================================================================================
  if (root.document) {
    const style = document.createElement('style');
    style.textContent = `.pine-settings{display:grid;gap:8px;padding:4px 0}.pine-settings[hidden]{display:none}
.pine-inputs{display:grid;gap:7px}.pine-inputs label{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;color:var(--dim)}
.pine-inputs label:has(input[type=checkbox]){display:flex;justify-content:flex-start}
.pine-inputs input[type=number],.pine-inputs input[type=text],.pine-inputs select{width:110px;font:inherit;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:3px;padding:2px 5px}
.pine-inputs input[type=color]{width:34px;height:22px;padding:0 2px;border:1px solid var(--line);background:transparent}
.pine-actions{display:flex;gap:6px}.pine-actions button{font:inherit;font-size:10px;background:transparent;color:var(--dim);border:1px solid var(--line);border-radius:4px;padding:3px 8px;cursor:pointer}.pine-actions button:hover{color:var(--ink)}
.pine-error{margin:0;color:#ff8a80}.pine-note{margin:0;color:var(--dim);font-size:10px;line-height:1.5}
.pine-status{position:absolute;left:44px;bottom:28px;z-index:6;max-width:calc(100% - 140px);font:10px/1.5 ui-monospace,Menlo,monospace;color:#ff8a80;background:var(--bg);padding:2px 6px;border:1px solid #ff8a8055;pointer-events:none}.pine-status[hidden]{display:none}
.pine-editor{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:#0009}.pine-editor[hidden]{display:none}
.pine-box{width:min(980px,calc(100vw - 32px));height:min(760px,calc(100vh - 32px));display:flex;flex-direction:column;background:var(--bg);color:var(--ink);border:1px solid var(--line);box-shadow:0 20px 60px #000a;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.pine-box header,.pine-box footer{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--line)}.pine-box footer{border-bottom:0;border-top:1px solid var(--line)}
.pine-box button{font:inherit;background:transparent;color:var(--dim);border:1px solid var(--line);padding:4px 10px;cursor:pointer}.pine-box button:hover{color:var(--ink);border-color:var(--ink)}
.pine-box .pine-primary{background:var(--ink);color:var(--bg);border-color:var(--ink)}.pine-box .pine-primary:hover{color:var(--bg)}
.pine-name{flex:0 1 260px;font:inherit;background:transparent;color:var(--ink);border:1px solid var(--line);padding:4px 8px}
.pine-grow{flex:1}.pine-help{color:var(--dim);font-size:10px}
.pine-code{flex:1;min-height:0;display:flex;overflow:hidden}
.pine-gutter{margin:0;padding:10px 8px;min-width:42px;text-align:right;color:var(--dim);opacity:.6;overflow:hidden;border-right:1px solid var(--line);font:12px/17px ui-monospace,SFMono-Regular,Menlo,monospace;user-select:none}
.pine-code textarea{flex:1;resize:none;border:0;outline:0;background:transparent;color:var(--ink);padding:10px;font:12px/17px ui-monospace,SFMono-Regular,Menlo,monospace;tab-size:4;white-space:pre;overflow:auto}
.pine-msg{margin:0;padding:6px 10px;min-height:28px;color:var(--dim);border-top:1px solid var(--line)}.pine-msg.bad{color:#ff8a80}`;
    document.head.append(style);
  }

  syncCatalog();
  const api = { attach, extend, library, editor, isPine, TEMPLATE };
  root.TerminalPine = api;
})(globalThis);
