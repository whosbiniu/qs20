# Daily high quarters

The panel below Active SSMT shows the first candle to reach the highest traded
price of the latest available trading day. Its four columns describe the actual
Weekly, Daily, 90M and Micro quarters at that time; probability substitutions
Q2/Q3 → Q1/Q3 do not change these observations.

Data comes from Yahoo Finance's NQ=F, ES=F and YM=F front-contract minute candles,
mapped to the familiar NQ1!, ES1! and YM1! labels. The instrument tooltip identifies
the actual Yahoo symbol and contract. This is not TradingView's continuous-contract
feed and roll conventions may differ. Yahoo declares delayed CME/CBOT prices;
polling and source outages can add further delay.

The trading day rolls at 18:00 America/New_York, with daylight saving handled by
Intl. Weekly uses the trading date: Monday Q1 through Thursday Q4, and the existing
Friday Q1/Q4 label. Daily quarters last six hours, 90M quarters 90 minutes and Micro
quarters 22.5 minutes. If a minute candle spans a Micro boundary, both possible Qs
are shown: OHLC data cannot identify which half-minute contained its high.
Repeated equal highs retain the first candle. Null highs, zero-volume candles,
future timestamps and weekend trading dates are excluded. Missing symbols are
reported separately; prices from another instrument are never substituted.

Vercel serves the session-protected `/api/market-highs` endpoint with a 60-second
in-process cache. The native app fetches the same Yahoo endpoints through a
restricted WKWebView bridge and uses the shared JS calculations. Both refresh
every minute. GitHub Pages uses an encrypted build-time snapshot, whose timestamp
is checked and labeled when old; its refresh depends on the scheduled Pages build.

Tests: `node scripts/test-day-highs.cjs` covers rollover, DST, ties, invalid data,
instrument identity and ambiguous boundaries. The macOS `--self-test --offline`
uses explicit synthetic fixtures to test the native bridge and five-column UI.
The real application never uses those fixtures.
