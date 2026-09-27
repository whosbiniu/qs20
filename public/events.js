(() => {
  const body = document.getElementById('economic-events');
  const status = document.getElementById('economic-status');
  const format = new Intl.DateTimeFormat('pl-PL', {timeZone:'America/New_York',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const dayFormat = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const panel = document.querySelector('.economic');
  const range = document.getElementById('economic-range');
  // Next week / month / quarter come from `events-range-endpoint`; the static Pages build has none.
  const rangeMeta = document.querySelector('meta[name="events-range-endpoint"]');
  const rangeButtons = {'next-week':'eventsNextWeek', month:'eventsMonth', quarter:'eventsQuarter'};
  const rangeLabels = {'next-week':'Następny tydzień', month:'Następny miesiąc', quarter:'Następny kwartał'};
  const ranges = {};
  let payload, scope = 'today';
  function selectScope(value) {
    scope = value;
    document.getElementById('eventsToday').setAttribute('aria-pressed', String(scope === 'today'));
    document.getElementById('eventsWeek').setAttribute('aria-pressed', String(scope === 'week'));
    for (const [key, id] of Object.entries(rangeButtons)) document.getElementById(id).setAttribute('aria-pressed', String(scope === key));
    panel.classList.toggle('today-view', scope === 'today');
    if (rangeButtons[scope] && !ranges[scope]) loadRange(scope);
    if (payload) render();
    panel.querySelector('.economic-scroll').scrollTop = 0;
  }
  document.getElementById('eventsToday').onclick = () => selectScope('today');
  document.getElementById('eventsWeek').onclick = () => selectScope('week');
  for (const [key, id] of Object.entries(rangeButtons)) {
    const button = document.getElementById(id);
    if (!rangeMeta) button.hidden = true;
    else button.onclick = () => selectScope(key);
  }
  async function loadRange(key) {
    range.textContent = rangeLabels[key] + ' · pobieranie…';
    try {
      const response = await fetch(rangeMeta.content + encodeURIComponent(key), {signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (!Array.isArray(data.events)) throw new Error('invalid');
      ranges[key] = data;
    } catch {
      if (scope === key) range.textContent = rangeLabels[key] + ' · kalendarz jest chwilowo niedostępny. Spróbuj ponownie za chwilę.';
      return;
    }
    if (scope === key) render();
  }
  selectScope('today');
  function render() {
    body.replaceChildren();
    const now = Date.now(), today = dayFormat.format(new Date(now));
    const extended = rangeButtons[scope] ? ranges[scope] : null;
    if (rangeButtons[scope] && !extended) return;
    const visible = extended ? extended.events : payload.events.filter(e => scope === 'week' || dayFormat.format(new Date(e.date)) === today);
    const past = visible.filter(e => Date.parse(e.date) < now).length;
    const note = panel.querySelector('.economic-note');
    if (!note.dataset.base) note.dataset.base = note.textContent;
    note.textContent = extended ? `Źródło: ${extended.source} · zdarzenia USD, czas Nowego Jorku. Godziny i prognozy mogą ulec zmianie.` : note.dataset.base;
    if (extended) {
      const coverage = extended.partial ? ` · dane dostępne do ${extended.availableTo || 'brak'} (kalendarze są publikowane z kilkutygodniowym wyprzedzeniem)` : '';
      range.textContent = `${rangeLabels[scope]} · ${extended.from} – ${extended.to} ET · ${visible.length} wydarzeń USD · źródło: ${extended.source}${coverage}`;
    } else range.textContent = `${scope === 'today' ? 'Dzisiaj · '+today+' ET' : 'Bieżący tydzień'} · ${visible.length} wydarzeń · ${past} z minioną godziną`;
    const next = visible.find(e => Date.parse(e.date) >= now);
    for (const event of visible) {
      const row = document.createElement('tr');
      if (event === next) row.className = 'upcoming';
      const levels = {High:['Wysoki','high'],Medium:['Średni','medium'],Low:['Niski','low'],Holiday:['Święto','holiday']};
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
    if (!visible.length) {const row = body.insertRow();const cell = row.insertCell();cell.colSpan = 5;cell.className = 'economic-empty';cell.textContent = extended ? 'Brak opublikowanych wydarzeń USD w tym zakresie. Źródła udostępniają kalendarz z kilkutygodniowym wyprzedzeniem.' : scope === 'today' ? 'Brak wydarzeń USD na dzisiaj w eksporcie. Możesz sprawdzić cały tydzień.' : 'Brak wydarzeń USD w eksporcie tego tygodnia.';}
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
  refresh();setInterval(refresh, 15 * 60 * 1000);setInterval(() => {if(payload) render();}, 60000);
})();
