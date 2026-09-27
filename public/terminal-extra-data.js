// Data for the "Inne" tools: market heat map, correlations / comparison, US Treasury yield curve, seasonality,
// earnings with the price reaction, and CFTC Commitments of Traders. Transport-agnostic like terminal-data.js:
// `create(fetchText)` runs in the Next routes (Node fetch) and in the Mac app (native proxy).
(function (root) {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const DAY = 86400;

  // ---- heat map universe: large US companies by GICS sector (market caps are fetched live) -------------------
  const SECTORS = {
    'Technologia': ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'AMD', 'ADBE', 'CSCO', 'ACN', 'IBM', 'QCOM', 'TXN', 'INTU', 'NOW', 'AMAT', 'MU', 'LRCX', 'ADI', 'KLAC', 'PANW', 'ANET', 'SNPS', 'CDNS', 'INTC', 'PLTR'],
    'Komunikacja': ['GOOGL', 'META', 'NFLX', 'TMUS', 'DIS', 'VZ', 'T', 'CMCSA'],
    'Dobra luksusowe': ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'LOW', 'TJX', 'SBUX', 'NKE', 'CMG'],
    'Dobra podstawowe': ['WMT', 'COST', 'PG', 'KO', 'PEP', 'PM', 'MO', 'MDLZ', 'CL'],
    'Finanse': ['BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'SPGI', 'BLK', 'C', 'SCHW', 'PGR', 'CB'],
    'Ochrona zdrowia': ['LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'ISRG', 'DHR', 'AMGN', 'PFE', 'GILD', 'VRTX', 'BSX', 'SYK'],
    'Przemysł': ['GE', 'CAT', 'RTX', 'UNP', 'HON', 'BA', 'DE', 'LMT', 'UPS', 'ETN', 'GEV'],
    'Energia': ['XOM', 'CVX', 'COP', 'SLB', 'EOG'],
    'Użyteczność publiczna': ['NEE', 'SO', 'DUK'],
    'Nieruchomości': ['PLD', 'AMT', 'EQIX'],
    'Surowce': ['LIN', 'SHW', 'APD'],
  };

  // ---- CFTC markets: financial futures come from the TFF report, commodities from the legacy report ----------
  const COT = {
    NQ: { name: 'Nasdaq-100', code: '20974+', report: 'tff' },
    ES: { name: 'S&P 500', code: '13874+', report: 'tff' },
    YM: { name: 'Dow Jones', code: '12460+', report: 'tff' },
    RTY: { name: 'Russell 2000', code: '239742', report: 'tff' },
    ZN: { name: 'UST 10Y', code: '043602', report: 'tff' },
    '6E': { name: 'Euro', code: '099741', report: 'tff' },
    '6J': { name: 'Jen', code: '097741', report: 'tff' },
    '6B': { name: 'Funt', code: '096742', report: 'tff' },
    BTC: { name: 'Bitcoin', code: '133741', report: 'tff' },
    VX: { name: 'VIX', code: '1170E1', report: 'tff' },
    GC: { name: 'Złoto', code: '088691', report: 'legacy' },
    SI: { name: 'Srebro', code: '084691', report: 'legacy' },
    CL: { name: 'Ropa WTI', code: '067651', report: 'legacy' },
    DX: { name: 'Dolar (DXY)', code: '098662', report: 'legacy' },
  };
  const COT_GROUPS = {
    tff: [['Dealerzy', 'dealer_positions_long_all', 'dealer_positions_short_all'], ['Asset managerowie', 'asset_mgr_positions_long', 'asset_mgr_positions_short'],
      ['Fundusze lewarowane', 'lev_money_positions_long', 'lev_money_positions_short'], ['Mali gracze', 'nonrept_positions_long_all', 'nonrept_positions_short_all']],
    legacy: [['Spekulanci (non-commercial)', 'noncomm_positions_long_all', 'noncomm_positions_short_all'], ['Hedgerzy (commercial)', 'comm_positions_long_all', 'comm_positions_short_all'],
      ['Mali gracze', 'nonrept_positions_long_all', 'nonrept_positions_short_all']],
  };
  const COT_DATASET = { tff: 'gpe5-46if', legacy: '6dca-aqww' };

  // ---- pure helpers (tested in scripts/test-terminal-extra.cjs) ----------------------------------------------
  // US Treasury daily par yield curve CSV -> [{ date: 'YYYY-MM-DD', yields: { '1 Mo': 4.04, ... } }], newest first.
  function parseTreasuryCsv(text) {
    const lines = String(text || '').trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const head = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    return lines.slice(1).map(line => {
      const cells = line.split(',');
      const [m, d, y] = (cells[0] || '').split('/');
      const yields = {};
      head.slice(1).forEach((h, i) => { const v = parseFloat(cells[i + 1]); if (Number.isFinite(v)) yields[h] = v; });
      return { date: `${y}-${m}-${d}`, yields };
    }).filter(r => /^\d{4}-\d\d-\d\d$/.test(r.date) && Object.keys(r.yields).length).sort((a, b) => b.date.localeCompare(a.date));
  }
  // The newest row on or before a date.
  const rowOnOrBefore = (rows, date) => rows.find(r => r.date <= date) || null;

  // Daily log returns aligned on common dates; Pearson correlation of each pair.
  function returnsByDate(candles) {
    const out = new Map();
    for (let i = 1; i < candles.length; i++) {
      const a = candles[i - 1].close, b = candles[i].close;
      if (finite(a) && finite(b) && a > 0 && b > 0) out.set(new Date(candles[i].time * 1000).toISOString().slice(0, 10), Math.log(b / a));
    }
    return out;
  }
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 3) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function correlationMatrix(series, days = 60) {
    const returns = series.map(s => returnsByDate(s.candles));
    const matrix = series.map(() => series.map(() => null));
    for (let i = 0; i < series.length; i++) for (let j = i; j < series.length; j++) {
      const dates = [...returns[i].keys()].filter(d => returns[j].has(d)).sort().slice(-days);
      const r = i === j ? 1 : pearson(dates.map(d => returns[i].get(d)), dates.map(d => returns[j].get(d)));
      matrix[i][j] = matrix[j][i] = r === null ? null : Math.round(r * 100) / 100;
    }
    return matrix;
  }
  // Rebase closes to % change from the first candle on or after `from`.
  function rebase(candles, from) {
    const list = candles.filter(c => c.time >= from && finite(c.close));
    if (!list.length) return [];
    const base = list[0].close;
    return list.map(c => ({ time: c.time, value: (c.close / base - 1) * 100 }));
  }

  // Seasonality from monthly and daily candles: average return, median and share of up periods.
  function stats(values) {
    if (!values.length) return { avg: null, median: null, up: null, n: 0 };
    const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
    return { avg: values.reduce((a, b) => a + b, 0) / values.length, median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, up: values.filter(v => v > 0).length / values.length, n: values.length };
  }
  function seasonality(monthly, daily) {
    const byMonth = Array.from({ length: 12 }, () => []), byWeekday = Array.from({ length: 5 }, () => []), years = {};
    for (let i = 1; i < monthly.length; i++) {
      const prev = monthly[i - 1].close, c = monthly[i];
      if (!(finite(prev) && finite(c.close) && prev > 0)) continue;
      const d = new Date(c.time * 1000), r = (c.close / prev - 1) * 100;
      byMonth[d.getUTCMonth()].push(r);
      (years[d.getUTCFullYear()] ||= Array(12).fill(null))[d.getUTCMonth()] = r;
    }
    for (let i = 1; i < daily.length; i++) {
      const prev = daily[i - 1].close, c = daily[i];
      if (!(finite(prev) && finite(c.close) && prev > 0)) continue;
      const w = new Date(c.time * 1000).getUTCDay();
      if (w >= 1 && w <= 5) byWeekday[w - 1].push((c.close / prev - 1) * 100);
    }
    return { months: byMonth.map(stats), weekdays: byWeekday.map(stats), years };
  }

  // Price reaction to each earnings report: after the close -> the next session vs the report day's close;
  // before the open (or unknown) -> the report day vs the previous close. Candles are daily, dates in New York.
  const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const nyHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' });
  function earningsReactions(reports, candles) {
    const days = candles.filter(c => finite(c.close) && finite(c.open)).map(c => ({ ...c, day: nyDate.format(new Date(c.time * 1000)) }));
    return reports.map(r => {
      const when = new Date(r.time * 1000), day = nyDate.format(when), hour = Number(nyHour.format(when));
      const timing = r.timing === 'BMO' || r.timing === 'AMC' ? r.timing : hour >= 16 ? 'AMC' : hour > 0 && hour < 10 ? 'BMO' : hour === 0 ? '?' : 'DMH';
      let i = days.findIndex(c => c.day >= day);
      if (i < 0) return { ...r, day, timing, move: null, gap: null };
      if (days[i].day === day && timing === 'AMC') i += 1;   // reported after the close: the next session reacts
      const c = days[i], prev = days[i - 1];
      if (!c || !prev || c.day < day) return { ...r, day, timing, move: null, gap: null };
      return { ...r, day, timing, reactionDay: c.day, move: (c.close / prev.close - 1) * 100, gap: (c.open / prev.close - 1) * 100 };
    });
  }

  // CFTC rows (newest first) -> weekly net position per group, plus open interest.
  function cotSeries(rows, report) {
    const groups = COT_GROUPS[report] || [];
    return rows.map(row => ({
      date: String(row.report_date_as_yyyy_mm_dd || '').slice(0, 10),
      openInterest: Number(row.open_interest_all),
      groups: groups.map(([name, long, short]) => ({ name, long: Number(row[long]), short: Number(row[short]), net: Number(row[long]) - Number(row[short]) })),
    })).filter(r => /^\d{4}-\d\d-\d\d$/.test(r.date) && r.groups.every(g => finite(g.net))).sort((a, b) => a.date.localeCompare(b.date));
  }

  function create(fetchText) {
    async function getText(url, options) {
      const r = await fetchText(url, options);
      if (r.status !== 200) throw new Error('upstream HTTP ' + r.status);
      return r.text;
    }
    const getJson = async (url, options) => JSON.parse(await getText(url, options));
    const cache = new Map();
    async function cached(key, ms, load) {
      const hit = cache.get(key);
      if (hit?.value && Date.now() - hit.at < ms) return hit.value;
      if (hit?.pending) return hit.pending;
      const pending = load();
      cache.set(key, { ...hit, pending });
      try { const value = await pending; cache.set(key, { at: Date.now(), value }); return value; }
      catch (error) { if (hit?.value) { cache.set(key, hit); return hit.value; } cache.delete(key); throw error; }
    }
    const bad = message => Object.assign(new Error(message), { status: 400 });
    const SYMBOL = /^[A-Z0-9^][A-Z0-9.^=-]{0,14}$/;
    const feedFor = symbol => {   // same aliases as the charts: NQ1! -> NQ=F, DXY1! -> DX-Y.NYB
      if (typeof symbol !== 'string') return null;
      const s = symbol.trim().toUpperCase();
      if (s === 'DXY1!' || s === 'DXY') return 'DX-Y.NYB';
      const future = s.match(/^([A-Z0-9]{1,6})1!$/);
      if (future) return future[1] + '=F';
      return SYMBOL.test(s) ? s : null;
    };

    // Yahoo session cookie + crumb for the quote / quoteSummary / screener endpoints.
    let crumb = null;
    async function yahooCrumb(fresh) {
      if (crumb && !fresh && Date.now() - crumb.at < 3600000) return crumb.value;
      await fetchText('https://fc.yahoo.com').catch(() => null);
      const value = (await getText('https://query1.finance.yahoo.com/v1/test/getcrumb')).trim();
      if (!value || /[<\s]/.test(value)) throw new Error('no crumb');
      crumb = { value, at: Date.now() };
      return value;
    }
    async function withCrumb(build, options) {
      try { return await getJson(build(await yahooCrumb(false)), options); }
      catch { return getJson(build(await yahooCrumb(true)), options); }   // an expired crumb answers 401
    }

    // Daily / weekly / monthly candles for one symbol (closes are what the tools need).
    const RANGES = { '1d': ['2y', '5y', '10y'], '1wk': ['5y', '10y'], '1mo': ['10y', 'max'] };
    async function candles(symbol, interval = '1d', range = '2y') {
      const feed = feedFor(symbol);
      if (!feed || !RANGES[interval]?.includes(range)) throw bad('bad symbol, interval or range');
      return cached(`c:${feed}:${interval}:${range}`, 600000, async () => {
        const result = (await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(feed)}?interval=${interval}&range=${range}`)).chart?.result?.[0];
        const q = result?.indicators?.quote?.[0];
        if (!result?.timestamp || !q) throw new Error('no data for ' + symbol);
        return { symbol, feed, name: result.meta?.shortName || symbol, candles: result.timestamp.map((time, i) => ({ time, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] ?? 0 })).filter(c => [c.open, c.high, c.low, c.close].every(finite)) };
      });
    }

    async function heatmap() {
      return cached('heatmap', 60000, async () => {
        const symbols = Object.values(SECTORS).flat(), sectorOf = new Map(Object.entries(SECTORS).flatMap(([s, list]) => list.map(t => [t, s])));
        const quotes = [];
        for (let i = 0; i < symbols.length; i += 60) {
          const batch = symbols.slice(i, i + 60).join(',');
          const json = await withCrumb(c => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(batch)}&fields=shortName,marketCap,regularMarketPrice,regularMarketChangePercent&crumb=${encodeURIComponent(c)}`);
          quotes.push(...(json?.quoteResponse?.result || []));
        }
        const unique = [...new Map(quotes.map(q => [q.symbol, q])).values()]
        const items = unique.filter(q => finite(q.marketCap) && finite(q.regularMarketChangePercent) && sectorOf.has(q.symbol)).map(q => ({
          symbol: q.symbol, name: String(q.shortName || q.symbol), sector: sectorOf.get(q.symbol), cap: q.marketCap, price: q.regularMarketPrice, change: q.regularMarketChangePercent,
        }));
        if (!items.length) throw new Error('no quotes');
        return { items, sectors: Object.keys(SECTORS), updatedAt: new Date().toISOString() };
      });
    }

    async function correlation(symbols, days = 60) {
      const list = (Array.isArray(symbols) ? symbols : String(symbols || '').split(',')).map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 10);
      if (list.length < 2 || list.some(s => !feedFor(s))) throw bad('need 2-10 valid symbols');
      const span = Math.max(20, Math.min(250, Number(days) || 60));
      const series = await Promise.all(list.map(s => candles(s, '1d', '2y')));
      return { symbols: list, names: series.map(s => s.name), days: span, matrix: correlationMatrix(series, span),
        // one year of closes for the comparison chart (rebased in the browser)
        series: series.map(s => ({ symbol: s.symbol, name: s.name, points: s.candles.filter(c => c.time >= Date.now() / 1000 - 400 * DAY).map(c => [c.time, c.close]) })) };
    }

    async function yields() {
      return cached('yields', 3600000, async () => {
        const year = new Date().getUTCFullYear();
        const url = y => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
        const [current, previous] = await Promise.all([getText(url(year)).then(parseTreasuryCsv), getText(url(year - 1)).then(parseTreasuryCsv).catch(() => [])]);
        const rows = [...current, ...previous].sort((a, b) => b.date.localeCompare(a.date));
        if (!rows.length) throw new Error('no yield data');
        const latest = rows[0], back = days => { const d = new Date(latest.date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - days); return rowOnOrBefore(rows, d.toISOString().slice(0, 10)); };
        const curves = [['Dziś', latest], ['Tydzień temu', back(7)], ['Miesiąc temu', back(30)], ['Rok temu', back(365)]].filter(([, r]) => r).map(([label, r]) => ({ label, date: r.date, yields: r.yields }));
        // 10Y-2Y and 10Y-3M spreads over the last year: the classic recession signals.
        const spreads = rows.filter(r => r.date >= (back(365)?.date || '')).reverse().map(r => ({ date: r.date, s10y2y: r.yields['10 Yr'] - r.yields['2 Yr'], s10y3m: r.yields['10 Yr'] - r.yields['3 Mo'] })).filter(r => finite(r.s10y2y));
        return { maturities: Object.keys(latest.yields), curves, spreads, source: 'U.S. Treasury', updatedAt: new Date().toISOString() };
      });
    }

    async function seasonal(symbol) {
      if (!feedFor(symbol)) throw bad('bad symbol');
      const [monthly, daily] = await Promise.all([candles(symbol, '1mo', 'max'), candles(symbol, '1d', '10y')]);
      return { symbol, name: monthly.name, from: monthly.candles[0]?.time, ...seasonality(monthly.candles, daily.candles) };
    }

    async function earningsHistory(symbol) {
      const ticker = String(symbol || '').trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw bad('bad ticker');
      return cached('eh:' + ticker, 6 * 3600000, async () => {
        // Last four quarters with exact report times (quoteSummary) + older reports from Yahoo's earnings calendar.
        const [summary, screener, price] = await Promise.all([
          withCrumb(c => `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=earnings,calendarEvents,price&crumb=${encodeURIComponent(c)}`).catch(() => null),
          withCrumb(c => `https://query1.finance.yahoo.com/v1/finance/visualization?crumb=${encodeURIComponent(c)}&lang=en-US&region=US`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            size: 40, offset: 0, sortField: 'startdatetime', sortType: 'DESC', entityIdType: 'earnings', includeFields: ['ticker', 'startdatetime', 'startdatetimetype', 'epsestimate', 'epsactual', 'epssurprisepct'],
            query: { operator: 'and', operands: [{ operator: 'eq', operands: ['ticker', ticker] }, { operator: 'gte', operands: ['startdatetime', new Date(Date.now() - 5 * 365 * DAY * 1000).toISOString().slice(0, 10)] }, { operator: 'lt', operands: ['startdatetime', new Date().toISOString().slice(0, 10)] }] } }) }).catch(() => null),
          candles(ticker, '1d', '5y'),
        ]);
        const result = summary?.quoteSummary?.result?.[0];
        const reports = new Map();
        const doc = screener?.finance?.result?.[0]?.documents?.[0];
        if (doc) {
          const col = id => doc.columns.findIndex(c => c.id === id);
          for (const row of doc.rows) {
            const t = Date.parse(row[col('startdatetime')]), actual = row[col('epsactual')];
            if (!Number.isFinite(t) || !finite(actual)) continue;   // only reports that happened
            reports.set(nyDate.format(new Date(t)), { time: t / 1000, timing: row[col('startdatetimetype')], estimate: row[col('epsestimate')] ?? null, actual, surprise: row[col('epssurprisepct')] ?? null });
          }
        }
        for (const q of result?.earnings?.earningsChart?.quarterly || []) {
          const t = q.reportedDate?.raw;
          if (!finite(t)) continue;
          const day = nyDate.format(new Date(t * 1000));
          // the same report can differ by a day between the two sources
          for (const k of [...reports.keys()]) if (Math.abs(Date.parse(k) - Date.parse(day)) <= 2 * DAY * 1000) reports.delete(k);
          reports.set(day, { time: t, timing: null, quarter: q.calendarQuarter || q.date, estimate: q.estimate?.raw ?? null, actual: q.actual?.raw ?? null, surprise: q.surprisePct !== undefined ? Number(q.surprisePct) : null });
        }
        const list = earningsReactions([...reports.values()].sort((a, b) => b.time - a.time).slice(0, 16), price.candles);
        const moves = list.map(r => r.move).filter(finite);
        const next = result?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
        return {
          symbol: ticker, name: result?.price?.shortName || price.name, reports: list, next: finite(next) ? next : null,
          avgAbsMove: moves.length ? moves.reduce((a, b) => a + Math.abs(b), 0) / moves.length : null, upShare: moves.length ? moves.filter(m => m > 0).length / moves.length : null,
        };
      });
    }

    async function cot(market) {
      const spec = COT[market];
      if (!spec) throw bad('unknown market');
      return cached('cot:' + market, 6 * 3600000, async () => {
        const where = encodeURIComponent(`cftc_contract_market_code='${spec.code}'`);
        const rows = await getJson(`https://publicreporting.cftc.gov/resource/${COT_DATASET[spec.report]}.json?$where=${where}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=156`);
        const series = cotSeries(Array.isArray(rows) ? rows : [], spec.report);
        if (!series.length) throw new Error('no COT data');
        return { market, name: spec.name, report: spec.report, series, source: 'CFTC', updatedAt: new Date().toISOString() };
      });
    }

    return { heatmap, correlation, yields, seasonal, earningsHistory, cot, candles };
  }

  const api = { SECTORS, COT, parseTreasuryCsv, correlationMatrix, pearson, rebase, seasonality, earningsReactions, cotSeries, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TerminalExtraData = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
