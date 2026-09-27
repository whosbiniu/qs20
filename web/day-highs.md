# High/low quarter panels

Seven collapsed-by-default native `<details>` panels expose Active SSMT and the
high/low observations for day, week and month. Opening/closing preserves checkbox
state, and incoming data only replaces table rows (not disclosure state).

Day panels show Weekly, Daily, 90M and Micro. Week and month panels show Monthly,
Weekly and Daily. Week panels also name the session (Asia, London, NY AM or NY PM)
corresponding to Daily. This descriptive column does not double-count Daily toward
the three-quarter highlight. Each row represents one instrument's first candle to reach that
period's extreme. Probability substitutions Q2/Q3 → Q1/Q3 do not change these
observed quarters. Repeated equal extrema retain the first candle.

At least three matching quarters in a row highlight only the matching cells in
green, even when they are nonadjacent. Friday's deliberate Weekly Q1/Q4 is eligible
for either Q1 or Q4, as in the timeline. Q0 and uncertain candle-boundary labels
(e.g. Q1 / Q2) cannot confirm a match. Textual Q labels remain readable without color.

Yahoo Finance NQ=F, ES=F and YM=F front contracts are mapped to the familiar NQ1!,
ES1! and YM1! names. Tooltips identify the provider symbol and contract. This is
not TradingView's continuous-contract feed; roll conventions may differ. Prices
are delayed and source outages/polling can add delay.

Days use 1-minute candles over 5 days; weeks and months use 5-minute candles over
60 days, enough for a complete latest month including a month-end weekend. High
and low are calculated independently. A history starting after the period's first
weekday reports incomplete history instead of claiming a full-period extreme.
Missing history leaves available day results intact, and vice versa.

The trading day rolls at 18:00 America/New_York, with DST handled by Intl. Weeks
start with Monday's trading date (Sunday 18:00 ET); months use the trading date's
calendar month. Monthly quarter labels use CycleRules.fullWeekQuarter, including
Q0 for a week crossing months. The observed extrema include those days; Q0 marks
their distortion-week classification rather than silently deleting actual highs.
Daily quarters last six hours, 90M quarters 90 minutes, Micro quarters 22.5 minutes.
A candle spanning a boundary yields both possible Qs. OHLC cannot locate the
extreme more precisely within that candle. Null/invalid extrema, zero-volume bars,
future timestamps and weekend trading dates are excluded.

Vercel's authenticated `/api/market-highs` has a 60-second in-process cache. The
Mac app uses a restricted WKWebView bridge and identical JS calculations. Both
refresh each minute. GitHub Pages serves an encrypted build-time snapshot, labeled
when old; its refresh depends on the scheduled Pages build. Every panel retains
source, delay and period information so past-session extrema are not mistaken for
current-session data.

Tests: `node scripts/test-day-highs.cjs` checks rollover, DST, ties, high/low periods,
incomplete history, month/week boundaries, instrument identity, highlighting and
uncertain boundaries. Mac `--self-test --offline` uses explicit synthetic fixtures
to check all six tables, disclosure behavior and the bridge; fixtures are never
used in normal operation.
