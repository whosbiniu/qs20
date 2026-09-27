(() => {
  const body = document.getElementById('economic-events');
  const head = document.getElementById('economic-head');
  const status = document.getElementById('economic-status');
  const format = new Intl.DateTimeFormat('pl-PL', {timeZone:'America/New_York',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const dateOnly = new Intl.DateTimeFormat('pl-PL', {timeZone:'America/New_York',day:'2-digit',month:'2-digit'});
  const dayFormat = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const panel = document.querySelector('.economic');
  const range = document.getElementById('economic-range');
  // Next week / month / quarter and earnings come from meta endpoints; the static Pages build has none.
  const rangeMeta = document.querySelector('meta[name="events-range-endpoint"]');
  const earningsMeta = document.querySelector('meta[name="earnings-endpoint"]');
  const rangeButtons = {'next-week':'eventsNextWeek', month:'eventsMonth', quarter:'eventsQuarter'};
  const rangeLabels = {today:'Dzisiaj', week:'Bieżący tydzień', 'next-week':'Następny tydzień', month:'Następny miesiąc', quarter:'Następny kwartał'};
  const ranges = {}, earnings = {};
  const levels = {High:['Wysoki','high'],Medium:['Średni','medium'],Low:['Niski','low'],Holiday:['Święto','holiday']};
  const timings = {BMO:'przed sesją', AMC:'po sesji', TAS:'godzina potwierdzona', TNS:'brak godziny', DMH:'w trakcie sesji'};
  let payload, scope = 'today', mode = 'events';
  // Impact filter: no button pressed = everything; pressed buttons narrow the list to those impacts.
  let impacts = new Set();
  try { impacts = new Set(JSON.parse(localStorage.getItem('impactFilter') || '[]').filter(v => levels[v])); } catch {}

  function syncButtons() {
    for (const [key, id] of Object.entries({today:'eventsToday', week:'eventsWeek', ...rangeButtons})) document.getElementById(id).setAttribute('aria-pressed', String(scope === key));
    document.getElementById('modeEvents').setAttribute('aria-pressed', String(mode === 'events'));
    document.getElementById('modeEarnings').setAttribute('aria-pressed', String(mode === 'earnings'));
    document.getElementById('impactFilters').hidden = mode !== 'events';
    document.querySelectorAll('#impactFilters button').forEach(b => b.setAttribute('aria-pressed', String(impacts.has(b.dataset.impact))));
    panel.classList.toggle('today-view', scope === 'today' && mode === 'events');
  }
  function selectScope(value) {
    scope = value;
    syncButtons();
    if (mode === 'events' && rangeButtons[scope] && !ranges[scope]) loadRange(scope);
    if (mode === 'earnings' && !earnings[scope]) loadEarnings(scope);
    render();
    panel.querySelector('.economic-scroll').scrollTop = 0;
  }
  function selectMode(value) {
    mode = value;
    selectScope(scope);
  }
  document.getElementById('eventsToday').onclick = () => selectScope('today');
  document.getElementById('eventsWeek').onclick = () => selectScope('week');
  for (const [key, id] of Object.entries(rangeButtons)) {
    const button = document.getElementById(id);
    if (!rangeMeta) button.hidden = true;
    else button.onclick = () => selectScope(key);
  }
  document.getElementById('modeEvents').onclick = () => selectMode('events');
  const earningsButton = document.getElementById('modeEarnings');
  if (!earningsMeta) earningsButton.hidden = true; else earningsButton.onclick = () => selectMode('earnings');
  document.getElementById('impactFilters').onclick = event => {
    const button = event.target.closest('[data-impact]');
    if (!button) return;
    impacts.has(button.dataset.impact) ? impacts.delete(button.dataset.impact) : impacts.add(button.dataset.impact);
    try { localStorage.setItem('impactFilter', JSON.stringify([...impacts])); } catch {}
    syncButtons();
    render();
  };

  async function fetchJson(url) {
    const response = await fetch(url, {signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw new Error('unavailable');
    return response.json();
  }
  async function loadRange(key) {
    range.textContent = rangeLabels[key] + ' · pobieranie…';
    try {
      const data = await fetchJson(rangeMeta.content + encodeURIComponent(key));
      if (!Array.isArray(data.events)) throw new Error('invalid');
      ranges[key] = data;
    } catch {
      if (mode === 'events' && scope === key) range.textContent = rangeLabels[key] + ' · kalendarz jest chwilowo niedostępny. Spróbuj ponownie za chwilę.';
      return;
    }
    if (mode === 'events' && scope === key) render();
  }
  async function loadEarnings(key) {
    range.textContent = 'Earnings · ' + rangeLabels[key] + ' · pobieranie…';
    try {
      const data = await fetchJson(earningsMeta.content + encodeURIComponent(key));
      if (!Array.isArray(data.items)) throw new Error('invalid');
      earnings[key] = data;
    } catch {
      if (mode === 'earnings' && scope === key) range.textContent = 'Earnings · dane Yahoo Finance są chwilowo niedostępne. Spróbuj ponownie za chwilę.';
      return;
    }
    if (mode === 'earnings' && scope === key) render();
  }

  const setHead = labels => { const row = document.createElement('tr'); labels.forEach(text => { const th = document.createElement('th'); th.textContent = text; row.append(th); }); head.replaceChildren(row); };
  const num = (value, digits = 2) => value === null || value === undefined ? '—' : value.toFixed(digits);
  const cap = value => value === null || value === undefined ? '—' : value >= 1e12 ? (value / 1e12).toFixed(2) + ' bln $' : value >= 1e9 ? (value / 1e9).toFixed(1) + ' mld $' : (value / 1e6).toFixed(0) + ' mln $';
  const setNote = text => {
    const note = panel.querySelector('.economic-note');
    if (!note.dataset.base) note.dataset.base = note.textContent;
    note.textContent = text || note.dataset.base;
  };

  function renderEarnings() {
    setHead(['Data / czas ET', 'Spółka', 'Pora', 'EPS prognoza', 'EPS wynik', 'Zaskoczenie', 'Kapitalizacja']);
    const data = earnings[scope];
    if (!data) return;
    range.textContent = `Earnings · ${rangeLabels[scope]} · ${data.from} – ${data.to} ET · ${data.items.length} spółek USA · źródło: Yahoo Finance`;
    setNote('Źródło: Yahoo Finance · spółki z USA posortowane według daty i kapitalizacji. Godziny i prognozy mogą ulec zmianie.');
    const now = Date.now(), next = data.items.find(e => Date.parse(e.date) >= now);
    for (const item of data.items) {
      const row = document.createElement('tr');
      if (item === next) row.className = 'upcoming';
      const when = item.timing === 'TNS' ? dateOnly.format(new Date(item.date)) : format.format(new Date(item.date));
      const values = [when, item.symbol, timings[item.timing] || item.timing || '—', num(item.epsEstimate), num(item.epsActual),
        item.surprise === null ? '—' : (item.surprise >= 0 ? '+' : '−') + Math.abs(item.surprise).toFixed(1) + '%', cap(item.marketCap)];
      values.forEach((value, index) => {
        const cell = document.createElement('td');
        if (index === 1) { const strong = document.createElement('strong'); strong.textContent = value; const name = document.createElement('span'); name.className = 'event-timing'; name.textContent = item.name; cell.append(strong, name); }
        else cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    }
    if (!data.items.length) { const row = body.insertRow(); const cell = row.insertCell(); cell.colSpan = 7; cell.className = 'economic-empty'; cell.textContent = 'Brak spółek z publikacją wyników w tym zakresie. Yahoo udostępnia te dane z niewielkim wyprzedzeniem.'; }
  }

  function render() {
    body.replaceChildren();
    if (mode === 'earnings') return renderEarnings();
    setHead(['Data / czas ET', 'Wpływ', 'Wydarzenie · USD', 'Prognoza', 'Poprzednio']);
    if (!payload) return;
    const now = Date.now(), today = dayFormat.format(new Date(now));
    const extended = rangeButtons[scope] ? ranges[scope] : null;
    if (rangeButtons[scope] && !extended) return;
    const base = extended ? extended.events : payload.events.filter(e => scope === 'week' || dayFormat.format(new Date(e.date)) === today);
    const visible = impacts.size ? base.filter(e => impacts.has(e.impact)) : base;
    const past = visible.filter(e => Date.parse(e.date) < now).length;
    const filterText = impacts.size ? ` · filtr: ${[...impacts].map(v => levels[v][0].toLowerCase()).join(', ')} (${visible.length} z ${base.length})` : '';
    if (extended) {
      const coverage = extended.partial ? ` · dane dostępne do ${extended.availableTo || 'brak'} (kalendarze są publikowane z kilkutygodniowym wyprzedzeniem)` : '';
      range.textContent = `${rangeLabels[scope]} · ${extended.from} – ${extended.to} ET · ${visible.length} wydarzeń USD · źródło: ${extended.source}${coverage}${filterText}`;
      setNote(`Źródło: ${extended.source} · zdarzenia USD, czas Nowego Jorku. Godziny i prognozy mogą ulec zmianie.`);
    } else {
      range.textContent = `${scope === 'today' ? 'Dzisiaj · '+today+' ET' : 'Bieżący tydzień'} · ${visible.length} wydarzeń · ${past} z minioną godziną${filterText}`;
      setNote();
    }
    const next = visible.find(e => Date.parse(e.date) >= now);
    for (const event of visible) {
      const row = document.createElement('tr');
      if (event === next) row.className = 'upcoming';
      const [label, cls] = levels[event.impact] || ['Inny',''];
      const values = [format.format(new Date(event.date)), label, event.title, event.forecast || '—', event.previous || '—'];
      values.forEach((value, index) => {
        const cell = document.createElement('td');
        if (index === 1) {const badge = document.createElement('span');badge.className = 'impact '+cls;badge.textContent = value;cell.append(badge);}
        else cell.textContent = value;
        if (index === 0) {const timing = document.createElement('span');timing.className = 'event-timing';timing.textContent = Date.parse(event.date) < now ? 'Godzina minęła' : 'Nadchodzące';cell.append(timing);}
        row.append(cell);
      });
      body.append(row);
    }
    if (!visible.length) {const row = body.insertRow();const cell = row.insertCell();cell.colSpan = 5;cell.className = 'economic-empty';cell.textContent = impacts.size && base.length ? 'Żadne wydarzenie nie pasuje do wybranego wpływu. Wyłącz filtr, aby zobaczyć wszystkie.' : extended ? 'Brak opublikowanych wydarzeń USD w tym zakresie. Źródła udostępniają kalendarz z kilkutygodniowym wyprzedzeniem.' : scope === 'today' ? 'Brak wydarzeń USD na dzisiaj w eksporcie. Możesz sprawdzić cały tydzień.' : 'Brak wydarzeń USD w eksporcie tego tygodnia.';}
  }
  async function refresh() {
    try {
      const endpoint = document.querySelector('meta[name="events-endpoint"]').content;
      const response = await fetch(endpoint, {signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (!Array.isArray(data.events) || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error('invalid');
      payload = data;render();
      window.dispatchEvent(new CustomEvent('calendar-data', {detail: data}));
      status.textContent = `Aktualizacja: ${format.format(new Date(data.updatedAt))} ET · ${data.events.length} wydarzeń USD`;
      if (data.stale) status.textContent = `Kopia eksportu z ${format.format(new Date(data.updatedAt))} ET · ${data.events.length} wydarzeń USD. Pobieranie na żywo jest niedostępne; godziny i wartości mogły się zmienić. Sprawdź Forex Factory.`;
    } catch {
      status.textContent = payload ? 'Nie udało się odświeżyć danych. Widoczne są ostatnio pobrane wydarzenia — sprawdź aktualność w Forex Factory.' : 'Kalendarz jest chwilowo niedostępny. Sprawdź wydarzenia w Forex Factory. Ponowimy pobieranie automatycznie.';
    }
  }
  selectScope('today');
  refresh();setInterval(refresh, 15 * 60 * 1000);setInterval(() => {if(payload && mode === 'events') render();}, 60000);
})();
