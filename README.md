# NEPSE Research Desk — v0.3 development build (Phase 2)

Offline-first Android PWA for personal NEPSE position-trading research. No broker integration, automatic market-data feed or order execution.

## Current watchlist
ADBL, CIT, GBIME, HIDCL, ICFC, KBL, MMF1, NBL, NLIC, PRVU, SBL, SFMF

ADBL and CIT are separate scrips. The earlier combined `ADBLCIT` watchlist label has been corrected. Legacy historical price rows saved under `ADBLCIT` are preserved in local storage and backup, but are not reassigned to either company because doing so could misattribute prices.

## Run on Android
1. Extract this ZIP.
2. Publish the contents of `nepse-research-desk-main` to your GitHub Pages repository root (or another static HTTPS host).
3. Open the HTTPS address in Chrome on Android.
4. Chrome menu → Install app / Add to Home screen.
5. Open Data & settings and import authorised CSV data.

A service worker/PWA requires HTTPS (localhost is the usual development exception). Opening `index.html` directly from a file manager will not enable full PWA installation/offline caching.

## Portfolio v0.2

### Moving Weighted-Average Cost (MWAC)
- **Buy:** new WACC = (existing remaining cost + purchase value + entered buy charges/tax) ÷ new total quantity.
- **Sell:** realised P/L = sale value − entered sale charges/tax − cost basis of shares sold at the current WACC.
- A partial sale reduces quantity and remaining acquisition cost at the same WACC.
- A manual existing position is entered as one opening balance with quantity and WACC per share.
- Ledger entries are replayed in transaction-date order; deleting an entry recalculates subsequent balances and realised P/L.
- Current market value and unrealised P/L use the latest imported close for each held symbol. The displayed date is the imported price date, not a live timestamp.
- Portfolio, transaction and price data are stored locally in this browser.

### Limitations
- Dividends, bonus shares, rights issues, splits, mergers and other corporate actions are not yet automated.
- Tax is a user-entered amount, not a Nepal tax calculator. Confirm applicable tax and charges with broker statements and current rules.
- No portfolio sync between devices. Export a backup before browser reset, app replacement or device change.
- Opening balance is intended for existing shares only. Do not enter the same pre-existing shares again as historical buy transactions.
- Avoid entering a second opening balance for a symbol already present in the ledger.

## CSV format
`date,symbol,open,high,low,close,volume,source`

- Date format: YYYY-MM-DD
- Symbol must be in your current watchlist
- OHLCV values must be numeric
- One row per symbol per date
- Duplicate symbol/date imports replace the previous row

## Data rights and sources
This build does not scrape NEPSE, bypass controls, or silently call third-party endpoints. Import data only when the source terms permit personal storage and analysis.

NEPSE's data use is subject to its data-use procedure and fees. A public API endpoint or MIT-licensed scraper code does not by itself grant rights to the underlying exchange data. Confirm permission and permitted personal use with the data owner/provider before connecting an automated feed.

Reference links:
- NEPSE: https://www.nepalstock.com/
- NEPSE data-use procedure reporting / SEBON clarification: https://www.sharesansar.com/newsdetail/sebon-clarifies-that-nepses-api-data-usage-procedure-fees-have-not-increased-2022-09-27
- YONEPSE public dataset docs (unofficial; investigate permissions): https://shubhamnpk.github.io/yonepse/pages/docs.html

## Implemented
- Editable 12-symbol watchlist
- Local browser storage
- CSV import with validation and upsert by symbol/date
- Backup export and local deletion
- Daily price history chart
- EMA 20/50/200, RSI(14), MACD line and volume ratio screen
- Portfolio holdings and manual opening WACC
- Buy/sell transaction ledger using moving weighted-average cost
- Realised and unrealised P/L, subject to imported CMP availability
- Responsive Android-friendly UI
- PWA manifest and versioned offline shell cache

## v0.3 development progress

### Phase 1 — portfolio data safety and migration foundation
- JSON backup restore with structural, OHLCV and ledger validation before replacement.
- Automatic pre-restore safety backup download.
- Restore summary flags future-dated price rows and legacy symbols; these are retained rather than silently discarded.
- Existing v0.2 localStorage key and data model retained for backward compatibility.

### Phase 2 — technical analysis engine
- Wilder RSI(14) time series and EMA(9) of RSI(14), with 30/50/70 reference levels.
- Actual latest-session bullish/bearish RSI-to-EMA cross detection; persistent above/below states are not mislabelled as new crossovers.
- Historical crossover list and chart markers.
- ATR(14) using true range and Wilder smoothing.
- Daily analysis plus weekly (Sunday–Thursday NEPSE trading week) and monthly OHLCV aggregation.
- Weekly/monthly period completeness labels and multi-timeframe momentum agreement/conflict summary.
- Future-dated price records are excluded from watchlist latest prices, portfolio CMP valuation and technical analysis until their dates are eligible.

## Not yet implemented
- Automated external data connector and live quotes
- Dividends and corporate-action adjustments
- Nepal tax/charge automation
- Full MACD signal/histogram, financial fundamentals and sector scoring
- Scheduled background refresh and push notifications
- Broker/order integration

## Important analytical limitations
The technical trend screen requires at least 50 eligible daily observations; EMA200 requires 200. RSI(14) plus EMA(9) of RSI needs at least 23 bars for a fully formed signal line. Weekly and monthly values are aggregated from imported daily records; the current calendar week/month may be provisional. Weekly bars use the Nepal market week (Sunday–Thursday); if a week has a shortened session due to holidays, its completeness cannot be established without an authoritative trading calendar. Monthly completion is based on the calendar month end. Imported prices are not live quotes, and future-dated rows are excluded based on the device date. The initial score model is not presented as a total score because fundamental and sector inputs are not yet populated. Signals are research prompts, not investment advice or trade instructions.

## Developer checks
Run the built-in technical engine tests with Node.js (no external packages required):

```bash
node --check app.js
node --test tests/technical-engine.test.cjs
```
