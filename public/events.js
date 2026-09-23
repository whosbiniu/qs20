(() => {
  const body = document.getElementById('economic-events');
  const status = document.getElementById('economic-status');
  const format = new Intl.DateTimeFormat('pl-PL', {timeZone:'America/New_York',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const dayFormat = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const panel = document.querySelector('.economic');
  const range = document.getElementById('economic-range');
  let payload, scope = 'today';
  function selectScope(value) {
    scope = value;
    document.getElementById('eventsToday').setAttribute('aria-pressed', String(scope === 'today'));
    document.getElementById('eventsWeek').setAttribute('aria-pressed', String(scope === 'week'));
    panel.classList.toggle('today-view', scope === 'today');
    if (payload) render();
    panel.querySelector('.economic-scroll').scrollTop = 0;
  }
  document.getElementById('eventsToday').onclick = () => selectScope('today');
  document.getElementById('eventsWeek').onclick = () => selectScope('week');
  selectScope('today');
  function render() {
    body.replaceChildren();
    const now = Date.now(), today = dayFormat.format(new Date(now));
    const visible = payload.events.filter(e => scope === 'week' || dayFormat.format(new Date(e.date)) === today);
    const past = visible.filter(e => Date.parse(e.date) < now).length;
    range.textContent = `${scope === 'today' ? 'Dzisiaj · '+today+' ET' : 'Bieżący tydzień'} · ${visible.length} wydarzeń · ${past} z minioną godziną`;
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
    if (!visible.length) {const row = body.insertRow();const cell = row.insertCell();cell.colSpan = 5;cell.className = 'economic-empty';cell.textContent = scope === 'today' ? 'Brak wydarzeń USD na dzisiaj w eksporcie. Możesz sprawdzić cały tydzień.' : 'Brak wydarzeń USD w eksporcie tego tygodnia.';}
  }
  async function refresh() {
    try {
      const response = await fetch('/api/events', {signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (!Array.isArray(data.events) || !Number.isFinite(Date.parse(data.updatedAt))) throw new Error('invalid');
      payload = data;render();
      status.textContent = `Aktualizacja: ${format.format(new Date(data.updatedAt))} ET · ${data.events.length} wydarzeń USD`;
      if (data.stale) status.textContent = `Kopia eksportu z ${format.format(new Date(data.updatedAt))} ET · ${data.events.length} wydarzeń USD. Pobieranie na żywo jest niedostępne; godziny i wartości mogły się zmienić. Sprawdź Forex Factory.`;
    } catch {
      status.textContent = payload ? 'Nie udało się odświeżyć danych. Widoczne są ostatnio pobrane wydarzenia — sprawdź aktualność w Forex Factory.' : 'Kalendarz jest chwilowo niedostępny. Sprawdź wydarzenia w Forex Factory. Ponowimy pobieranie automatycznie.';
    }
  }
  refresh();setInterval(refresh, 15 * 60 * 1000);setInterval(() => {if(payload) render();}, 60000);
})();
