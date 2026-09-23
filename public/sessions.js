/* Sesje dzienne (wiersz DAILY) i święta giełdowe.
   Kwartały dzienne (czas ET):
     Q1 18:00–00:00  → sesja azjatycka  → Tokio (JPX)
     Q2 00:00–06:00  → sesja londyńska  → Londyn (LSE)
     Q3 06:00–12:00  → sesja nowojorska (AM) → Nowy Jork (NYSE)
     Q4 12:00–18:00  → sesja nowojorska (PM) → Nowy Jork (NYSE)
   Jeśli dla giełdy powiązanej z sesją wypada bank holiday, podświetlamy tę
   sesję na zielono. Jeśli w danym dniu (18:00–18:00 ET) święto obejmuje kilka
   sesji, podświetlamy cały dzień. */
(function (root) {
  const SESSIONS = {
    1: { name: 'Azja', exchange: 'Tokio (JPX)', tz: 'Asia/Tokyo', code: 'JPX' },
    2: { name: 'Londyn', exchange: 'Londyn (LSE)', tz: 'Europe/London', code: 'LSE' },
    3: { name: 'Nowy Jork (AM)', exchange: 'Nowy Jork (NYSE)', tz: 'America/New_York', code: 'NYSE' },
    4: { name: 'Nowy Jork (PM)', exchange: 'Nowy Jork (NYSE)', tz: 'America/New_York', code: 'NYSE' },
  };

  const HOLIDAYS = {
    NYSE: {
      '2026-01-01': 'Nowy Rok',
      '2026-01-19': 'Dzień Martina Luthera Kinga',
      '2026-02-16': 'Dzień Prezydentów',
      '2026-04-03': 'Wielki Piątek',
      '2026-05-25': 'Memorial Day',
      '2026-06-19': 'Juneteenth',
      '2026-07-03': 'Dzień Niepodległości (obserwowany)',
      '2026-09-07': 'Labor Day',
      '2026-11-26': 'Święto Dziękczynienia',
      '2026-12-25': 'Boże Narodzenie',
    },
    LSE: {
      '2026-01-01': 'Nowy Rok',
      '2026-04-03': 'Wielki Piątek',
      '2026-04-06': 'Poniedziałek Wielkanocny',
      '2026-05-04': 'Early May Bank Holiday',
      '2026-05-25': 'Spring Bank Holiday',
      '2026-08-31': 'Summer Bank Holiday',
      '2026-12-25': 'Boże Narodzenie',
      '2026-12-28': 'Boxing Day (zastępczy)',
    },
    JPX: {
      '2026-01-01': 'Nowy Rok',
      '2026-01-02': 'Przerwa noworoczna (JPX)',
      '2026-01-03': 'Przerwa noworoczna (JPX)',
      '2026-01-12': 'Dzień Pełnoletności',
      '2026-02-11': 'Dzień Państwowości',
      '2026-02-23': 'Urodziny Cesarza',
      '2026-03-20': 'Równonoc wiosenna',
      '2026-04-29': 'Dzień Showa',
      '2026-05-03': 'Dzień Konstytucji',
      '2026-05-04': 'Dzień Zieleni',
      '2026-05-05': 'Dzień Dziecka',
      '2026-05-06': 'Dzień wolny (zastępczy)',
      '2026-07-20': 'Dzień Morza',
      '2026-08-11': 'Dzień Gór',
      '2026-09-21': 'Dzień Szacunku dla Starszych',
      '2026-09-22': 'Dzień wolny (Silver Week)',
      '2026-09-23': 'Równonoc jesienna',
      '2026-10-12': 'Dzień Sportu',
      '2026-11-03': 'Dzień Kultury',
      '2026-11-23': 'Święto Pracy i Dziękczynienia',
      '2026-12-31': 'Zamknięcie roku (JPX)',
    },
  };

  function tzOffset(tz, utcMs) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const p = Object.fromEntries(dtf.formatToParts(utcMs).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUTC - utcMs;
  }

  // Zamienia czas ścienny w danej strefie na instant UTC (dwie iteracje na wypadek DST).
  function zonedTimeToUtc(y, mo, d, h, tz) {
    const wall = Date.UTC(y, mo - 1, d, h);
    let utc = wall - tzOffset(tz, wall);
    utc = wall - tzOffset(tz, utc);
    return utc;
  }

  function localDate(tz, utcMs) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(utcMs).filter(x => x.type !== 'literal').map(x => [x.type, x.value])
    );
    return `${p.year}-${p.month}-${p.day}`;
  }

  // Zwraca informację o święcie dla sesji (kwartał 1–4) o zadanym instancie UTC startu.
  function holidayFor(quarter, sessionStartUtc) {
    const session = SESSIONS[quarter];
    if (!session) return null;
    const date = localDate(session.tz, sessionStartUtc);
    const name = HOLIDAYS[session.code] && HOLIDAYS[session.code][date];
    return name ? { ...session, date, name } : null;
  }

  root.MarketSessions = { SESSIONS, HOLIDAYS, zonedTimeToUtc, localDate, holidayFor };
})(window);
