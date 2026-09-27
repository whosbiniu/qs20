// Strona główna: a dashboard of panels. Every page of the terminal can be added as a widget, resized,
// reordered, opened full-size or removed. Charts, Terminal and Monitor are single instances, so their section is
// moved into the widget while the dashboard is open and moved back when another page is shown; the
// framed pages and the headline list are simply created again inside the widget.
const Home = (() => {
  const WIDGETS = {
    charts: { title: 'Wykresy', move: true },
    'hyper-terminal': { title: 'Terminal', move: true },
    news: { title: 'Wydarzenia · FinancialJuice', news: true },
    calendar: { title: 'Kalendarz ekonomiczny', url: () => CALENDAR_URL },
    quarters: { title: 'Kwartały', url: () => QUARTERS_URL },
    highs: { title: 'Aktualne L/H', url: () => HIGHS_URL },
    monitor: { title: 'Monitor', move: true },
  };
  // size 0: one column, 1: full width, 2: full width and tall
  const SIZES = [{ span: 1, height: 420, icon: '▫' }, { span: 2, height: 420, icon: '▭' }, { span: 2, height: 720, icon: '▣' }];
  const SIZE_NAMES = ['wąski (1 kolumna)', 'szeroki (cała szerokość)', 'szeroki i wysoki'];
  // Instant tooltips for the widget buttons (native title= is slow and easy to miss) + drag styling.
  document.head.insertAdjacentHTML('beforeend', `<style>
    .widget>header button{position:relative}
    .widget>header button[data-tip]:hover::after,.widget>header button[data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);right:0;z-index:60;width:max-content;max-width:240px;padding:6px 9px;background:var(--bg);border:1px solid var(--ink);color:var(--ink);font-weight:400;text-align:left;white-space:normal;line-height:1.4;pointer-events:none}
    .widget>header{cursor:grab;user-select:none;touch-action:none}
    .widget>header button{cursor:pointer}
    .widget.dragging{position:relative;z-index:40;opacity:.9;outline:1px solid var(--ink);box-shadow:0 8px 30px #000;pointer-events:none}
    .widget.dragging>header{cursor:grabbing}
    #homeGrid.reordering{cursor:grabbing;user-select:none}#homeGrid.reordering iframe{pointer-events:none}
    #homeGrid .drop-hint{grid-column:1 / -1;font-size:11px;color:var(--dim)}
  </style>`);
  let items = [{ id: 'charts', size: 2 }, { id: 'news', size: 0 }];
  try {
    const saved = JSON.parse(localStorage.getItem('home') || 'null');
    if (Array.isArray(saved)) items = saved.filter(w => WIDGETS[w?.id] && SIZES[w.size]).filter((w, i, all) => all.findIndex(x => x.id === w.id) === i);
  } catch {}
  const save = () => { try { localStorage.setItem('home', JSON.stringify(items)); } catch {} };
  const has = id => items.some(w => w.id === id);
  const main = () => document.querySelector('main');
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Sections that live in a widget while the dashboard is shown go back to <main> first.
  function leave() {
    for (const id of Object.keys(WIDGETS).filter(k => WIDGETS[k].move)) {
      const section = document.getElementById(id);
      if (section.parentElement !== main()) { main().append(section); section.classList.remove('in-widget'); section.hidden = true; }
    }
  }

  function render() {
    const grid = document.getElementById('homeGrid');
    grid.replaceChildren();
    items.forEach((item, index) => {
      const def = WIDGETS[item.id], size = SIZES[item.size];
      const widget = document.createElement('article');
      widget.className = 'widget';
      widget.dataset.id = item.id;
      widget.style.setProperty('--h', size.height + 'px');
      if (size.span === 2) widget.classList.add('wide');
      widget.innerHTML = `<header><b title="Przytrzymaj i przeciągnij, aby zmienić położenie panelu">${esc(def.title)}</b><span class="grow"></span>
        <button data-act="open" data-tip="Otwórz na pełnej stronie: ${esc(def.title)}" aria-label="Otwórz na pełnej stronie: ${esc(def.title)}">↗</button>
        <button data-act="size" data-tip="Zmień rozmiar panelu. Teraz: ${SIZE_NAMES[item.size]}. Kliknij, aby przełączyć na: ${SIZE_NAMES[(item.size + 1) % SIZES.length]}" aria-label="Zmień rozmiar panelu">${size.icon}</button>
        <button data-act="up" data-tip="Przesuń panel wyżej (albo przeciągnij go za nagłówek)" aria-label="Przesuń panel wyżej"${index === 0 ? ' disabled' : ''}>↑</button>
        <button data-act="down" data-tip="Przesuń panel niżej (albo przeciągnij go za nagłówek)" aria-label="Przesuń panel niżej"${index === items.length - 1 ? ' disabled' : ''}>↓</button>
        <button data-act="remove" data-tip="Zamknij panel — usuwa go ze strony głównej (możesz dodać go ponownie u góry)" aria-label="Zamknij panel: usuń ze strony głównej">✕</button></header><div class="wbody"></div>`;
      const body = widget.querySelector('.wbody');
      if (def.url) body.innerHTML = `<iframe src="${esc(def.url())}" title="${esc(def.title)}" loading="lazy"></iframe>`;
      else if (def.news) body.innerHTML = '<div class="feed" data-news></div>';
      grid.append(widget);
      if (def.move) {
        const section = document.getElementById(item.id);
        section.classList.add('in-widget'); section.hidden = false;
        body.append(section);
      }
    });
    const missing = Object.keys(WIDGETS).filter(id => !has(id));
    document.getElementById('homeAdd').innerHTML = missing.length
      ? '<span>dodaj panel</span>' + missing.map(id => `<button data-add="${id}">+ ${esc(WIDGETS[id].title)}</button>`).join('')
      : '<span>wszystkie panele są na stronie głównej</span>';
    document.getElementById('homeEmpty').hidden = items.length > 0;
    if (typeof renderNews === 'function') renderNews();
  }

  function enter() {
    render();
    // The moved sections were laid out at another size: let charts and the map adapt.
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  function add(id) { if (WIDGETS[id] && !has(id)) { items.push({ id, size: WIDGETS[id].move ? 2 : 1 }); save(); } }
  function remove(id) { leave(); items = items.filter(w => w.id !== id); save(); }
  function onHome() { return !document.getElementById('home').hidden; }
  function refreshHome() { leave(); render(); requestAnimationFrame(() => tab('home')); }

  document.addEventListener('click', event => {
    const grid = event.target.closest('#homeGrid');
    const widget = event.target.closest('.widget');
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (grid && widget && act) {
      const id = widget.dataset.id, index = items.findIndex(w => w.id === id);
      if (act === 'open') return tab(id);
      if (act === 'remove') remove(id);
      if (act === 'size') items[index].size = (items[index].size + 1) % SIZES.length;
      if (act === 'up' && index > 0) [items[index - 1], items[index]] = [items[index], items[index - 1]];
      if (act === 'down' && index < items.length - 1) [items[index + 1], items[index]] = [items[index], items[index + 1]];
      save(); tab('home');
      return;
    }
    const addButton = event.target.closest('[data-add]');
    if (addButton) { add(addButton.dataset.add); tab('home'); return; }
  });

  // Drag a panel by its header to reorder. The dragged widget follows the pointer; the others make room live.
  let drag = null;
  document.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const header = event.target.closest('#homeGrid .widget > header');
    if (!header) return;
    const widget = header.parentElement, rect = widget.getBoundingClientRect();
    drag = { widget, header, id: event.pointerId, startX: event.clientX, startY: event.clientY, offX: event.clientX - rect.left, offY: event.clientY - rect.top, active: false };
  });
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const grid = document.getElementById('homeGrid'), { widget } = drag;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
      drag.active = true;
      drag.header.setPointerCapture(drag.id);
      widget.classList.add('dragging'); grid.classList.add('reordering');
    }
    // Which other widget is the pointer over? Move the dragged one before/after it.
    const target = [...grid.querySelectorAll('.widget')].find(w => {
      if (w === widget) return false;
      const r = w.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    });
    if (target) {
      // dragging down past a widget puts it after that one, dragging up puts it before
      if (target.compareDocumentPosition(widget) & Node.DOCUMENT_POSITION_FOLLOWING) target.before(widget); else target.after(widget);
    }
    // Keep the widget under the pointer: measure its natural place, then offset by the difference.
    widget.style.transform = '';
    const natural = widget.getBoundingClientRect();
    widget.style.transform = `translate(${event.clientX - drag.offX - natural.left}px, ${event.clientY - drag.offY - natural.top}px)`;
    // scroll the page while dragging near the edges
    const main = document.querySelector('main'), mr = main.getBoundingClientRect();
    if (event.clientY > mr.bottom - 40) main.scrollBy(0, 14); else if (event.clientY < mr.top + 40) main.scrollBy(0, -14);
  });
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const { widget, active } = drag;
    drag = null;
    if (!active) return;
    widget.classList.remove('dragging'); widget.style.transform = '';
    document.getElementById('homeGrid').classList.remove('reordering');
    const order = [...document.querySelectorAll('#homeGrid .widget')].map(w => w.dataset.id);
    items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    save();
    // refresh the ↑ / ↓ disabled states without rebuilding (and reloading) the panels
    document.querySelectorAll('#homeGrid .widget').forEach((w, i, all) => {
      w.querySelector('[data-act=up]').disabled = i === 0;
      w.querySelector('[data-act=down]').disabled = i === all.length - 1;
    });
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  return { has, enter, leave, render, onHome };
})();
