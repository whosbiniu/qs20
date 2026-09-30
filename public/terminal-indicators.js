// Registry-driven indicator library. New indicators need only a definition and an adapter.
(function (root) {
  const catalog = [
    { id: 'volume', title: 'Wolumen', group: 'Wolumen', description: 'Wolumen świecowy u dołu wykresu.' },
    { id: 'tpo', title: 'TPO', group: 'Profile', description: 'Profile dzienne, sesyjne, tygodniowe i miesięczne. POC i obszar wartości.' },
    { id: 'footprint', title: 'Footprint', group: 'Order flow', description: 'Bid × Ask, delta albo wolumen na poziomach ceny, imbalance po skosie, strefy stacked imbalance i POC świecy. Przybliż wykres, aby odczytać liczby.' },
    { id: 'delta', title: 'Delta / CVD', group: 'Order flow', description: 'Delta i skumulowana delta w dolnej części wykresu. Transakcje zebrane w tej karcie.' },
    { id: 'profile', title: 'Volume Profile', group: 'Profile', description: 'Profil z wykonanych transakcji: cały zebrany zakres, osobno każda sesja (UTC, Nowy Jork, Warszawa) albo widoczny zakres. POC, VAH i VAL.' },
    { id: 'tradebubbles', title: 'Trade Bubbles', group: 'Order flow', description: 'Duże zlecenia z wykonanych transakcji (te same milisekunda i strona = jedno zlecenie). Wielkość koła rośnie z wolumenem.' },
  ]
  // `pop` (optional): { el, title, empty, remove, close } and `showSettings(id)` → whether that indicator has settings.
  // Clicking an active chip (or ⚙ in the library) opens its settings right next to the chip.
  // `candles()` (optional) gives the Pine editor this chart's candles to test a script on.
  function attach({ button, panel, list, search, active, close, get, set, pop, showSettings, candles }) {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    function render() {
      const q = search.value.trim().toLocaleLowerCase('pl')
      // Own Pine scripts come last, whatever order the catalogue was filled in.
      const entries = catalog.filter(d => `${d.title} ${d.group} ${d.description}`.toLocaleLowerCase('pl').includes(q)).sort((a, b) => (a.pine ? 1 : 0) - (b.pine ? 1 : 0))
      const gear = d => pop && get(d.id) ? `<button type="button" class="ht-indicator-gear" data-open-settings="${d.id}" title="Ustawienia" aria-label="Ustawienia: ${esc(d.title)}">⚙</button>` : ''
      list.innerHTML = entries.map(d => `<div class="ht-indicator-entry"><div><b>${esc(d.title)}</b><small>${esc(d.group)}</small><p>${esc(d.description)}</p></div>${d.unavailable ? '<button type="button" disabled>Niedostępny</button>' : `${gear(d)}${d.pine ? `<button type="button" data-pine-edit="${d.id.slice(5)}" aria-label="Edytuj kod: ${esc(d.title)}">Edytuj</button>` : ''}<button type="button" data-indicator="${d.id}" aria-label="${get(d.id) ? 'Usuń' : 'Dodaj'} ${esc(d.title)}" aria-pressed="${get(d.id)}">${get(d.id) ? 'Usuń' : '+ Dodaj'}</button>`}</div>`).join('') || '<p>Brak pasujących indykatorów.</p>'
      const selected = catalog.filter(d => !d.unavailable && get(d.id))
      active.innerHTML = selected.map(d => `<span${d.id === current ? ' class="open"' : ''}><button type="button" data-settings="${d.id}" title="Ustawienia" aria-label="Ustawienia: ${esc(d.title)}" aria-expanded="${d.id === current}">${esc(d.chip || d.title)}</button><button type="button" data-remove="${d.id}" title="Usuń" aria-label="Usuń ${esc(d.title)}">×</button></span>`).join('')
      active.hidden = !selected.length
      button.textContent = `ƒx Indykatory${selected.length ? ' · ' + selected.length : ''}`
      if (current && !get(current)) closeSettings()
      else if (current) place()
    }
    // ---- settings popover -------------------------------------------------------------------------
    let current = null
    const chipOf = id => active.querySelector?.(`[data-settings="${id}"]`)?.parentElement
    function place() {
      const anchor = chipOf(current), host = pop.el.offsetParent
      if (!anchor || !host) return
      const box = host.getBoundingClientRect(), a = anchor.getBoundingClientRect()
      pop.el.style.left = Math.max(8, Math.min(a.left - box.left, box.width - pop.el.offsetWidth - 8)) + 'px'
      pop.el.style.top = (a.bottom - box.top + 6) + 'px'
    }
    function openSettings(id) {
      if (!pop) return
      if (current === id) { closeSettings(); return }
      current = id
      pop.title.textContent = catalog.find(d => d.id === id)?.title || id
      pop.empty.hidden = !!showSettings(id)
      pop.el.hidden = false
      render()
      pop.el.querySelector?.('input,select,button:not([data-pop-close])')?.focus({ preventScroll: true })
    }
    function closeSettings() {
      if (!pop || !current) return
      current = null; pop.el.hidden = true; showSettings(null); render()
    }
    if (pop) {
      pop.close.addEventListener('click', closeSettings)
      pop.remove.addEventListener('click', () => { const id = current; closeSettings(); set(id, false); render() })
      pop.el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); const id = current; closeSettings(); active.querySelector?.(`[data-settings="${id}"]`)?.focus() } })
      // A click anywhere else closes it (the chips toggle it themselves).
      document.addEventListener('pointerdown', e => { if (current && !pop.el.contains(e.target) && !e.target.closest?.('[data-settings],[data-open-settings]')) closeSettings() })
      window.addEventListener('resize', () => { if (current) place() })
    }
    function show(value) { panel.hidden = !value; button.setAttribute('aria-expanded', String(value)); if (value) search.focus(); else button.focus() }
    // Own Pine Script indicators (terminal-pine.js): a "+ Pine Script" button, "Edytuj" on each script.
    const Pine = root.TerminalPine
    const openEditor = id => { show(false); Pine.editor.open({ id, candles, onSaved: saved => { if (!id) set('pine:' + saved, true); render() } }) }
    if (Pine) {
      const head = panel.querySelector?.('.ht-library-head')
      if (head && !head.querySelector('[data-pine-new]')) {
        const add = document.createElement('button'); add.type = 'button'; add.dataset.pineNew = ''; add.className = 'ht-pine-new'; add.textContent = '+ Pine Script'
        add.title = 'Dodaj własny wskaźnik napisany w Pine Script'
        head.insertBefore(add, head.lastElementChild)
        add.addEventListener('click', () => openEditor(null))
      }
      root.addEventListener?.('pinelibrary', render)
    }
    button.addEventListener('click', () => show(panel.hidden))
    close.addEventListener('click', () => show(false))
    search.addEventListener('input', render)
    list.addEventListener('click', e => {
      const edit = e.target.closest('[data-pine-edit]')?.dataset.pineEdit
      if (edit && Pine) { openEditor(edit); return }
      const open = e.target.closest('[data-open-settings]')?.dataset.openSettings
      if (open) { show(false); current = null; openSettings(open); return }
      const id = e.target.closest('[data-indicator]')?.dataset.indicator; if (catalog.some(d => d.id === id)) { set(id, !get(id)); render() }
    })
    active.addEventListener('click', e => {
      const remove = e.target.closest('[data-remove]')?.dataset.remove
      if (remove) { set(remove, false); render(); return }
      const settings = e.target.closest('[data-settings]')?.dataset.settings
      if (settings) { if (pop) openSettings(settings); else show(true) }
    })
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); show(false) } })
    render()
    return { render, openSettings, closeSettings }
  }
  root.TerminalIndicators = { catalog, attach }
})(globalThis)
