# UNCsWay Native — macOS / Apple Silicon

Independent SwiftUI + AppKit application based on qs2.0. No WKWebView, JavaScript,
localhost server, Node runtime, or third-party Swift dependencies. macOS 14+,
ARM64. This is the first native edition, not a byte-for-byte port of the web UI.

## Build and install

```sh
python3 scripts/build-native-macos.py --install
```

Run from the repository root. Requires Apple's Swift command-line tools and a
macOS SDK. The script builds release ARM64, runs calculation tests, creates and
ad-hoc signs `dist/UNCsWay Native.app`, verifies the signature, then optionally
installs `~/Applications/UNCsWay Native.app`. An existing native installation is
renamed to a timestamped backup. It does not replace the original `UNCsWay.app`.
The package can also be opened in Xcode through `desktop/native/Package.swift`.
Signing for distribution/notarization requires the owner's Apple Developer team.

## Modules

- **Start:** saved panel selection and ordering; terminal, calendar, news and
  live cycle clock cards; shortcuts to the other native modules.
- **Terminal:** Hyperliquid and builder DEX market search, candlesticks, volume,
  live trades and L2 book via URLSession WebSocket, reconnect/backoff, drawing
  persistence per symbol, scroll/pinch zoom and drag pan. AppKit drawing tools:
  trend, horizontal/vertical line, rectangle, Fibonacci, smooth freehand,
  measurement, text and eraser. Delete removes a selected drawing.
- **Indicators:** searchable registry in `Study.all`; every study is drawn in
  the chart, including independently normalized auxiliary traces. TPO daily,
  custom UTC session (including overnight), weekly or monthly; Volume Profile,
  Footprint, Delta/CVD, OHLC, Bar Stats, VWAP ±1σ, Anchored VWAP with date anchor,
  VPVR, daily VPSV, current/previous period H/L/Open, Volume Bubbles, cumulative
  book depth, book profile, book heatmap, OI samples, 14-day funding and trade
  counter. Add/remove through **Indykatory**. Registry uses stable IDs.
- **Wykresy:** 1/2/4 Yahoo Finance charts with independent symbols/intervals,
  volume and drawing tools. Common futures aliases match the original project.
- **Post Creator:** native Aura and layered-chart layouts, image/avatar imports,
  editable profile/ticker/result/date, white/black Aura text, crop zoom/dimming,
  layer positioning/order/size/opacity, native JSON document, import of web `.postcreator` v2 documents, PNG export and
  clipboard. Export uses SwiftUI ImageRenderer at document pixel size.
- **Kalendarz:** Forex Factory this/next week, country/impact/search filters,
  local times, forecast/previous values and ICS export.
- **Wydarzenia:** FinancialJuice RSS, search and source links.
- **Kwartały:** ET clock and trading-date rollover at 18:00, monthly full-week
  rule, Friday Q1/Q4, session/90m/micro/nano timelines, SSMT flags, day and session
  HP windows with exact durations and ICS export. NY AM excludes Q1. Month-crossing
  weeks are Q0, and windows are not filtered by news/holidays.
- **High / Low:** NQ/ES/YM 5-minute highs/lows for ET trading day/week/month,
  associated cycle labels and incomplete-history flag.
- **Monitor:** native MapKit imagery and public USGS, NASA EONET and adsb.lol
  layers, NOAA/Canada weather alerts, GDELT reports, curated reference points from the
  original project, selection list and refresh with per-source errors.
- **TV:** AVKit HLS player for a direct stream URL. The Bloomberg YouTube link
  opens externally; there is no embedded YouTube/WebView or automatic HLS resolver.

## Data semantics and current differences

TPO counts occupied 30-minute candle ranges (one observation per block/row), not
individual tick prints. POC and 70% value area derive from those counts. The
price row auto-adjusts to bound memory. Sessions are UTC; cycle windows are ET.

Footprint, CVD and executed-trade Volume Profile only cover trades received in
this app process, up to 50,000 retained trades. Gaps after reconnect or retention
are indicated. They are not reconstructed historical bid/ask data. VPVR/VPSV
instead distribute candle volume across its price range and are explicitly
labelled OHLCV estimates. Bubbles use candle volume. OI is sampled while running;
book heatmap keeps at most 300 snapshots, sampled every 5 seconds while enabled.

Public endpoints can rate-limit or fail. Charts/news are informational and do
not place orders. The native monitor does not yet reproduce the web route polylines,
instability scoring and optional AI briefing. Cycle views cover the core rules and windows,
not all of the web multi-day chain overlays and holiday annotations. Drawing settings and browser localStorage are not imported automatically.
Web `.postcreator` v2 imports embedded images, layers and common Aura settings;
web-only badge/crop positions and custom canvas dimensions are not reproduced
exactly. Native JSON documents use a separate schema. These differences
are not silently represented by sample data or embedded website screens.

Data lives in `~/Library/Application Support/UNCsWay Native/` and preferences in
`local.uncsway.native`. There are no API keys or account credentials in the app.

## Validation

The build runs `UNCsWayNative --self-test`: TPO counts, 70% profile construction,
volume conservation, delta/CVD signs and buckets, overnight/invalid sessions,
Monday week boundaries, HP chains/NY AM exclusion, Q0 month boundaries, DST,
ET trading-day rollover, study IDs and post-document JSON round trip.

Manual native UI checks: live Hyperliquid markets, book and TPO overlay; freehand
drawing and removal; Yahoo chart panes; calendar/news data; High/Low data; MapKit
rendering; Aura PNG export (verified 2160 × 2880). TV requires a playable HLS URL
and is not covered by these network checks.

SDK 27's command-line tools on the development machine omit the SwiftUI State
macro plugin. `ViewState` aliases the stable State property-wrapper type so this
project builds with those tools without downloading compilers or changing SDKs.
