# LuxAlgo Trade Journal: calculation engine and statement importers

Unmodified TypeScript sources of `packages/core` (round-trip engine, metrics, equity and drawdown,
P&L calendar, Edge Score, breakdowns) and `packages/importers` (14 broker statement formats) from
https://github.com/LuxAlgo/trade-journal at commit `949bca1993ee284e1facf2e26cfd1fa820b8f5cf`
(2026-09-27). MIT License, Copyright (c) 2026 LuxAlgo Global, LLC: see `LICENSE`.

The journal in "Inne → Dziennik" (`public/journal.js`) uses them through the browser bundle
`public/journal-core.js`, built by `node scripts/build-journal-core.mjs` (esbuild via npx).
The app UI is our own; LuxAlgo's Next.js app, SQLite storage, broker sync and AI are not used.
