// Data layer of the terminal: Yahoo charts, cycle labels of the extremes, ticker tape and
// FinancialJuice headlines (translated to Polish). Transport-agnostic: `create(fetchText)` takes
// `fetchText(url) -> Promise<{status, text}>`, so the same code runs in Node (Next routes, dev server)
// and inside the macOS app (through its native proxy).
(function (root) {
  'use strict';
  const DayHighs = typeof module !== 'undefined' && module.exports ? require('./day-highs.js') : null;
  const dayHighs = () => DayHighs || root.DayHighs;

  // Terminal timeframe -> Yahoo interval/range. 6H has no Yahoo interval, so it is built from 1h candles.
  const FRAMES = {
    '1M': { interval: '1mo', range: 'max' },
    '1W': { interval: '1wk', range: '10y' },
    '1D': { interval: '1d', range: '2y' },
    '6H': { interval: '60m', range: '3mo', bucket: 6 * 3600 },
  };

  // Terminal symbol -> Yahoo feed. "X1!" is the continuous future X=F (TradingView style), DXY1! is the
  // ICE index, and any other Yahoo symbol (AAPL, BTC-USD, ...) passes through.
  function feedFor(symbol) {
    if (typeof symbol !== 'string') return null;
    if (symbol === 'DXY1!') return 'DX-Y.NYB';
    const future = symbol.match(/^([A-Z0-9]{1,6})1!$/);
    if (future) return future[1] + '=F';
    return /^[A-Z0-9][A-Z0-9.^=-]{0,14}$/.test(symbol) ? symbol : null;
  }

  // Ticker tape: 50 of the world's most followed instruments (label -> Yahoo symbol).
  const TAPE = [
    ['NQ1!', 'NQ=F'], ['ES1!', 'ES=F'], ['YM1!', 'YM=F'], ['DXY', 'DX-Y.NYB'], ['SPX', '^GSPC'], ['NDX', '^IXIC'], ['DJI', '^DJI'], ['RUT', '^RUT'],
    ['VIX', '^VIX'], ['DAX', '^GDAXI'], ['FTSE', '^FTSE'], ['N225', '^N225'], ['US10Y', '^TNX'],
    ['GOLD', 'GC=F'], ['SILVER', 'SI=F'], ['WTI', 'CL=F'], ['NATGAS', 'NG=F'],
    ['BTC', 'BTC-USD'], ['ETH', 'ETH-USD'], ['SOL', 'SOL-USD'], ['XRP', 'XRP-USD'], ['BNB', 'BNB-USD'],
    ['EURUSD', 'EURUSD=X'], ['USDJPY', 'JPY=X'], ['GBPUSD', 'GBPUSD=X'],
    ['AAPL', 'AAPL'], ['MSFT', 'MSFT'], ['NVDA', 'NVDA'], ['AMZN', 'AMZN'], ['GOOGL', 'GOOGL'], ['META', 'META'], ['TSLA', 'TSLA'],
    ['BRK.B', 'BRK-B'], ['AVGO', 'AVGO'], ['LLY', 'LLY'], ['JPM', 'JPM'], ['V', 'V'], ['WMT', 'WMT'], ['XOM', 'XOM'], ['MA', 'MA'],
    ['ORCL', 'ORCL'], ['COST', 'COST'], ['NFLX', 'NFLX'], ['AMD', 'AMD'], ['PLTR', 'PLTR'], ['TSM', 'TSM'], ['BABA', 'BABA'],
    ['SPY', 'SPY'], ['QQQ', 'QQQ'], ['IWM', 'IWM'],
  ];

  function aggregate(candles, seconds) {
    const out = [];
    for (const c of candles) {
      const time = Math.floor(c.time / seconds) * seconds;
      const last = out[out.length - 1];
      if (last && last.time === time) {
        last.high = Math.max(last.high, c.high);
        last.low = Math.min(last.low, c.low);
        last.close = c.close;
      } else out.push({ ...c, time });
    }
    return out;
  }

  const decode = t => t.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[e.toLowerCase()]) return named[e.toLowerCase()];
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });

  function parseRss(xml) {
    const field = (item, tag) => decode(item.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'))?.[1] || '').trim();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
      id: field(item, 'guid'),
      title: field(item, 'title').replace(/^FinancialJuice:\s*/, ''),
      link: field(item, 'link'),
      time: Date.parse(field(item, 'pubDate')),
    })).filter(i => i.title && Number.isFinite(i.time) && /^https:\/\/(www\.)?financialjuice\.com\//.test(i.link));
  }

  // ---- Economic calendar beyond the current week --------------------------------------------------
  // Forex Factory's public feed only has this week's file, and its site is behind Cloudflare, so the next
  // week uses the Forex Factory file when published and otherwise TradingView's public calendar, which is
  // the only source here for whole months and quarters. Events are US only, like the current-week view.
  const etDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  const isoDay = date => date.toISOString().slice(0, 10);
  function rangeBounds(range, now = Date.now()) {
    const [y, m, d] = etDay(now).split('-').map(Number);
    const today = new Date(Date.UTC(y, m - 1, d));
    if (range === 'next-week') {
      const start = new Date(today);
      start.setUTCDate(d - (today.getUTCDay() + 6) % 7 + 7);
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      return { from: isoDay(start), to: isoDay(end) };
    }
    if (range === 'month') return { from: isoDay(new Date(Date.UTC(y, m, 1))), to: isoDay(new Date(Date.UTC(y, m + 1, 0))) };
    if (range === 'quarter') {
      const first = (Math.floor((m - 1) / 3) + 1) * 3;
      return { from: isoDay(new Date(Date.UTC(y, first, 1))), to: isoDay(new Date(Date.UTC(y, first + 3, 0))) };
    }
    return null;
  }
  const scaleTag = { K: 'K', M: 'M', B: 'B', T: 'T' };
  function tvValue(value, unit, scale) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
    const number = String(Math.round(Number(value) * 1000) / 1000);
    return number + (unit === '%' ? '%' : '') + (scaleTag[scale] || '');
  }
  function fromTradingView(rows) {
    return rows.filter(e => typeof e.title === 'string' && Number.isFinite(Date.parse(e.date))).map(e => ({
      title: e.title, date: new Date(e.date).toISOString(),
      impact: e.importance >= 1 ? 'High' : e.importance === 0 ? 'Medium' : 'Low',
      forecast: tvValue(e.forecast, e.unit, e.scale), previous: tvValue(e.previous, e.unit, e.scale),
    }));
  }

  function create(fetchText) {
    async function getText(url) {
      const r = await fetchText(url);
      if (r.status !== 200) throw new Error('upstream HTTP ' + r.status);
      return r.text;
    }
    const getJson = async url => JSON.parse(await getText(url));
    const yahoo = (feed, interval, range, extra = '') =>
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(feed)}?interval=${interval}&range=${range}${extra}`;

    // Previous session close from daily bars (chartPreviousClose is relative to the requested range).
    const closes = new Map();
    async function previousClose(feed) {
      const hit = closes.get(feed);
      if (hit && Date.now() - hit.at < 300000) return hit.value;
      const list = ((await getJson(yahoo(feed, '1d', '5d'))).chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
      const value = list.length > 1 ? list[list.length - 2] : null;
      closes.set(feed, { at: Date.now(), value });
      return value;
    }

    const charts = new Map();
    async function chart(symbol, frame) {
      const feed = feedFor(symbol), spec = FRAMES[frame];
      if (!feed || !spec) throw Object.assign(new Error('bad symbol or interval'), { status: 400 });
      const key = symbol + frame;
      const hit = charts.get(key);
      if (hit && Date.now() - hit.at < 15000) return hit.data;
      const result = (await getJson(yahoo(feed, spec.interval, spec.range, '&includePrePost=true'))).chart?.result?.[0];
      if (!result?.timestamp) throw new Error('no data');
      const q = result.indicators.quote[0];
      const candles = [];
      result.timestamp.forEach((time, i) => {
        const [open, high, low, close] = [q.open[i], q.high[i], q.low[i], q.close[i]];
        if ([open, high, low, close].every(Number.isFinite)) candles.push({ time, open, high, low, close });
      });
      const prev = await previousClose(feed).catch(() => null);
      const meta = result.meta;
      const data = {
        symbol, feed, name: meta.shortName || symbol, currency: meta.currency,
        price: meta.regularMarketPrice, previousClose: prev ?? meta.chartPreviousClose,
        candles: spec.bucket ? aggregate(candles, spec.bucket) : candles, source: 'Yahoo Finance', fetchedAt: Date.now(),
      };
      if (charts.size > 200) charts.clear();
      charts.set(key, { at: Date.now(), data });
      return data;
    }

    // Cycle labels of the current month/week/day extremes, following the timeline's rules:
    // month -> [Quarterly, Monthly, Weekly], week -> [Monthly, Weekly, Daily], day -> [Weekly, Daily, Session].
    const highsCache = new Map();
    async function highs(symbol) {
      const feed = feedFor(symbol);
      if (!feed) throw Object.assign(new Error('bad symbol'), { status: 400 });
      const hit = highsCache.get(symbol);
      if (hit?.data && Date.now() - hit.at < 60000) return hit.data;
      if (hit?.pending) return hit.pending;
      const DH = dayHighs();
      DH.register(symbol, feed);
      const load = (interval, range) => getJson(yahoo(feed, interval, range, '&includePrePost=true')).then(j => j.chart?.result?.[0] || null).catch(() => null);
      const pending = (async () => {
        const [intraday, history] = await Promise.all([load('1m', '5d'), load('5m', '60d')]);
        const { periods } = DH.summarizeAll(intraday, history, symbol);
        const labels = (scope, side, keys) => {
          const v = periods[scope]?.[side];
          return v && !v.error ? keys.map(k => k === 'session' ? DH.sessionLabel(v.quarters.daily) : v.quarters[k]) : null;
        };
        const data = {
          symbol,
          hotm: labels('month', 'high', ['quarterly', 'monthly', 'weekly']), lotm: labels('month', 'low', ['quarterly', 'monthly', 'weekly']),
          hotw: labels('week', 'high', ['monthly', 'weekly', 'daily']), lotw: labels('week', 'low', ['monthly', 'weekly', 'daily']),
          hotd: labels('day', 'high', ['weekly', 'daily', 'session']), lotd: labels('day', 'low', ['weekly', 'daily', 'session']),
        };
        highsCache.set(symbol, { at: Date.now(), data });
        return data;
      })();
      highsCache.set(symbol, { ...hit, pending });
      try { return await pending; } finally { const cur = highsCache.get(symbol); if (cur) delete cur.pending; }
    }

    let tapeCache = null;
    async function tape() {
      if (tapeCache && Date.now() - tapeCache.at < 60000) return tapeCache.data;
      const data = [];
      for (let i = 0; i < TAPE.length; i += 10) {
        const chunk = TAPE.slice(i, i + 10);
        try {
          const json = await getJson(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${chunk.map(([, y]) => encodeURIComponent(y)).join(',')}&range=5d&interval=1d`);
          for (const [label, feed] of chunk) {
            const q = json[feed];
            // `chart` is the terminal symbol to open when the quote is clicked (NQ=F -> NQ1!, DX-Y.NYB -> DXY1!).
            const chart = feed === 'DX-Y.NYB' ? 'DXY1!' : /^[A-Z0-9]{1,6}=F$/.test(feed) ? feed.slice(0, -2) + '1!' : feed;
            if (Number.isFinite(q?.fulldayPrice)) data.push({ symbol: label, chart, price: q.fulldayPrice, change: Number.isFinite(q.fulldayChangePercent) ? q.fulldayChangePercent : null });
          }
        } catch {}
      }
      if (!data.length) { if (tapeCache) return tapeCache.data; throw new Error('no quotes'); }
      tapeCache = { at: Date.now(), data };
      return data;
    }

    // Polish translation of headlines (Google Translate web endpoint, no API key), cached per id.
    const translations = new Map();
    async function translate(text) {
      const json = await getJson('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pl&dt=t&q=' + encodeURIComponent(text));
      const out = Array.isArray(json?.[0]) ? json[0].map(p => p?.[0] || '').join('').trim() : '';
      if (!out) throw new Error('empty translation');
      return out;
    }
    async function translateItems(items) {
      const todo = items.filter(i => !translations.has(i.id)).slice(0, 60);
      let index = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (index < todo.length) {
          const item = todo[index++];
          try { translations.set(item.id, await translate(item.title)); } catch {}
        }
      }));
      if (translations.size > 1000) for (const key of [...translations.keys()].slice(0, 300)) translations.delete(key);
    }

    let newsCache = null, newsRetryAfter = 0;
    const withTranslations = () => ({ ...newsCache.data, items: newsCache.data.items.map(i => ({ ...i, pl: translations.get(i.id) || '' })) });
    async function news() {
      if (newsCache && Date.now() - newsCache.at < 60000) return withTranslations();
      if (Date.now() < newsRetryAfter) { if (newsCache) return withTranslations(); throw new Error('FinancialJuice rate limit, retrying shortly'); }
      try {
        const items = parseRss(await getText('https://www.financialjuice.com/feed.ashx?xy=rss'));
        if (!items.length) throw new Error('empty feed');
        await translateItems(items);
        newsCache = { at: Date.now(), data: { items, source: 'FinancialJuice', fetchedAt: Date.now() } };
      } catch (error) {
        newsRetryAfter = Date.now() + 180000;
        if (!newsCache) throw error;
      }
      return withTranslations();
    }

    const calendars = new Map();
    async function calendar(range) {
      const bounds = rangeBounds(range);
      if (!bounds) throw Object.assign(new Error('bad range'), { status: 400 });
      const hit = calendars.get(range);
      if (hit && Date.now() - hit.at < 900000) return hit.data;
      const inRange = list => list.filter(e => { const day = etDay(Date.parse(e.date)); return day >= bounds.from && day <= bounds.to; })
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      let events = null, source = 'TradingView';
      if (range === 'next-week') {
        try {
          const rows = JSON.parse(await getText('https://nfs.faireconomy.media/ff_calendar_nextweek.json'));
          const usd = rows.filter(e => e.country === 'USD' && typeof e.title === 'string' && Number.isFinite(Date.parse(e.date)))
            .map(e => ({ title: e.title, date: e.date, impact: String(e.impact || ''), forecast: String(e.forecast || ''), previous: String(e.previous || '') }));
          if (Array.isArray(rows) && usd.length) { events = inRange(usd); source = 'Forex Factory'; }
        } catch {}
      }
      if (!events) {
        const start = new Date(bounds.from + 'T00:00:00Z'), end = new Date(bounds.to + 'T00:00:00Z');
        start.setUTCDate(start.getUTCDate() - 1);
        end.setUTCDate(end.getUTCDate() + 2);
        const json = await getJson(`https://economic-calendar.tradingview.com/events?from=${start.toISOString()}&to=${end.toISOString()}&countries=US`);
        if (json.status !== 'ok') throw new Error('invalid calendar');
        // Beyond its publication horizon (about four weeks) the answer is simply empty.
        events = inRange(fromTradingView(Array.isArray(json.result) ? json.result : []));
      }
      // Providers publish releases only a few weeks ahead; report how far this list actually reaches.
      const availableTo = events.length ? etDay(Date.parse(events[events.length - 1].date)) : null;
      const data = { events, holidays: [], updatedAt: new Date().toISOString(), range, source, ...bounds, availableTo, partial: availableTo === null || availableTo < isoDay(new Date(Date.parse(bounds.to + 'T00:00:00Z') - 3 * 86400000)) };
      calendars.set(range, { at: Date.now(), data });
      return data;
    }

    return { chart, highs, tape, news, calendar };
  }

  // Node transport (Next route handlers, dev server).
  function nodeTransport() {
    return async url => {
      // TradingView's calendar endpoint only answers requests that carry its own origin.
      const headers = { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' };
      if (new URL(url).hostname === 'economic-calendar.tradingview.com') headers.Origin = 'https://www.tradingview.com';
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000), headers });
      return { status: response.status, text: await response.text() };
    };
  }

  const api = { FRAMES, TAPE, feedFor, aggregate, parseRss, rangeBounds, tvValue, fromTradingView, create, nodeTransport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TerminalData = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
