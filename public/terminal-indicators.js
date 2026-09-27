// Registry-driven indicator library. New indicators need only a definition and an adapter.
(function (root) {
  const catalog = [
    { id: 'volume', title: 'Wolumen', group: 'Wolumen', description: 'Wolumen świecowy u dołu wykresu.' },
    { id: 'tpo', title: 'TPO', group: 'Profile', description: 'Profile dzienne, sesyjne, tygodniowe i miesięczne. POC i obszar wartości.' },
    { id: 'footprint', title: 'Footprint', group: 'Order flow', description: 'Bid × Ask przy świecach. Przybliż wykres, aby odczytać liczby.' },
    { id: 'delta', title: 'Delta / CVD', group: 'Order flow', description: 'Delta i skumulowana delta w dolnej części wykresu. Transakcje zebrane w tej karcie.' },
    { id: 'profile', title: 'Volume Profile', group: 'Profile', description: 'Profil po prawej stronie wykresu. POC, VAH i VAL z zebranego zakresu.' },
  ]
  function attach({ button, panel, list, search, active, close, get, set }) {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    function render() {
      const q = search.value.trim().toLocaleLowerCase('pl')
      const entries = catalog.filter(d => `${d.title} ${d.group} ${d.description}`.toLocaleLowerCase('pl').includes(q))
      list.innerHTML = entries.map(d => `<div class="ht-indicator-entry"><div><b>${esc(d.title)}</b><small>${esc(d.group)}</small><p>${esc(d.description)}</p></div><button type="button" data-indicator="${d.id}" aria-label="${get(d.id) ? 'Usuń' : 'Dodaj'} ${esc(d.title)}" aria-pressed="${get(d.id)}">${get(d.id) ? 'Usuń' : '+ Dodaj'}</button></div>`).join('') || '<p>Brak pasujących indykatorów.</p>'
      const selected = catalog.filter(d => get(d.id))
      active.innerHTML = selected.map(d => `<span><button type="button" data-settings="${d.id}" aria-label="Ustawienia: ${esc(d.title)}">${esc(d.title)}</button><button type="button" data-remove="${d.id}" aria-label="Usuń ${esc(d.title)}">×</button></span>`).join('')
      active.hidden = !selected.length
      button.textContent = `ƒx Indykatory${selected.length ? ' · ' + selected.length : ''}`
    }
    function show(value) { panel.hidden = !value; button.setAttribute('aria-expanded', String(value)); if (value) search.focus(); else button.focus() }
    button.addEventListener('click', () => show(panel.hidden))
    close.addEventListener('click', () => show(false))
    search.addEventListener('input', render)
    list.addEventListener('click', e => { const id = e.target.closest('[data-indicator]')?.dataset.indicator; if (catalog.some(d => d.id === id)) { set(id, !get(id)); render() } })
    active.addEventListener('click', e => {
      const remove = e.target.closest('[data-remove]')?.dataset.remove
      if (remove) { set(remove, false); render(); return }
      if (e.target.closest('[data-settings]')) show(true)
    })
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); show(false) } })
    render()
    return { render }
  }
  root.TerminalIndicators = { catalog, attach }
})(globalThis)
