(function (root) {
  const SESSION_BY_COUNTRY = {
    JPY: 'asia', AUD: 'asia', NZD: 'asia', CNY: 'asia', HKD: 'asia', SGD: 'asia',
    GBP: 'london', EUR: 'london', CHF: 'london',
    USD: 'ny', CAD: 'ny',
  };
  const QUARTERS = {asia: [1], london: [2], ny: [3, 4]};
  const SESSION_NAMES = {asia: 'Azja', london: 'Londyn', ny: 'Nowy Jork'};
  const MARKET_NAMES = {
    JPY: 'Tokio', AUD: 'Australia', NZD: 'Nowa Zelandia', CNY: 'Chiny', HKD: 'Hongkong', SGD: 'Singapur',
    GBP: 'Londyn', EUR: 'Strefa euro', CHF: 'Szwajcaria',
    USD: 'USA', CAD: 'Kanada',
  };

  function isBankHoliday(event) {
    if (String(event && event.impact) !== 'Holiday') return false;
    return !/daylight saving/i.test(String(event.title || ''));
  }

  function sessionOf(country) {
    return SESSION_BY_COUNTRY[country] || null;
  }

  function group(holidays, windowStart, horizonDays, stamp) {
    const days = new Map();
    for (const holiday of holidays || []) {
      if (/daylight saving/i.test(String(holiday.title || ''))) continue;
      const session = sessionOf(holiday.country);
      if (!session) continue;
      const offset = stamp(new Date(holiday.date)) - windowStart;
      if (offset < 0 || offset >= horizonDays * 86400000) continue;
      const day = Math.floor(offset / 86400000);
      let entry = days.get(day);
      if (!entry) {
        entry = {day, sessions: new Set(), labels: []};
        days.set(day, entry);
      }
      entry.sessions.add(session);
      const market = MARKET_NAMES[holiday.country] || holiday.country;
      const label = `${SESSION_NAMES[session]} · ${market}`;
      if (!entry.labels.includes(label)) entry.labels.push(label);
    }
    return [...days.values()].map((entry) => {
      const sessions = [...entry.sessions];
      const whole = sessions.length > 1;
      return {
        day: entry.day,
        whole,
        sessions,
        quarters: whole ? [1, 2, 3, 4] : sessions.flatMap((session) => QUARTERS[session]),
        labels: entry.labels,
      };
    });
  }

  const api = {group, isBankHoliday, sessionOf, QUARTERS, SESSION_NAMES, MARKET_NAMES};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BankHolidays = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
