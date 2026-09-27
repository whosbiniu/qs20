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
            if (Number.isFinite(q?.fulldayPrice)) data.push({ symbol: label, price: q.fulldayPrice, change: Number.isFinite(q.fulldayChangePercent) ? q.fulldayChangePercent : null });
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

    return { chart, highs, tape, news };
  }

  // Node transport (Next route handlers, dev server).
  function nodeTransport() {
    return async url => {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' } });
      return { status: response.status, text: await response.text() };
    };
  }

  const api = { FRAMES, TAPE, feedFor, aggregate, parseRss, create, nodeTransport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TerminalData = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
