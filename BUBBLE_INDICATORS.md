# Bubble monitor: additional indicators

## Definitions

- `Breadth_60`: count(close > arithmetic mean of last 60 closes) / eligible shares × 100.
- 5-SMA: arithmetic average of five consecutive observed market sessions' Breadth; any missing input yields null.
- `HLI`: count(close >= maximum close in last 252 sessions, including today) / eligible shares × 100. This is the share of closing-price new highs, **not** new highs/(new highs+new lows).
- 10-SMA: ten-session arithmetic average of HLI, with no gap filling.
- Universe: each day's KRX KOSPI/KOSDAQ listed shares, including preferred shares; excludes ETFs/ETNs because stock endpoints are used. IPOs without enough history are excluded from the respective denominator. Delisted issues remain in historical snapshots. No current-universe backfill.
- KRX raw closes are not adjusted; corporate actions may affect the indicator. This is explicitly disclosed in the page.
- RSI(14): Wilder initial mean of 14 changes, then recursive Wilder smoothing. Loss-only=0; gain-only=100; entirely flat=50. Calculated on all available index history before display-range filtering.
- RSI excludes a Korean date captured before 16:00 KST, including previously saved intraday quotes. `bubble_status.updated_at` is the capture checkpoint; an absent timestamp uses prior dates conservatively.

## Collection

`Market Breadth Data` runs at 07:45 / 18:45 KST on weekdays and can be dispatched manually. It requires repository Actions secret **KRX_API_KEY**, with approval for both 유가증권 일별매매정보 (`sto/stk_bydd_trd`) and 코스닥 일별매매정보 (`sto/ksq_bydd_trd`). Never put the key in public files or chat.

KRX service: https://openapi.krx.co.kr/contents/OPP/USES/service/OPPUSES002_S2.cmd?BO_ID=JvJFzlAENzZlPBDNGAWC

- Uses existing index session calendar and prior dates only (latest observation typically T−1).
- Fetches up to 820 calendar days for 252-day warmup and recent display history.
- Gzip snapshot cache is saved even when subsequent steps fail. Run time is bounded; further runs resume from cached snapshots.
- Missing/failed/authentication responses are never recorded as zero. A market stops at its first failed date; existing derived values remain intact. Partial coverage is reported.
- Published `breadth_daily.json` contains derived ratios and numerators/denominators; raw snapshots are Actions cache only.
- No key: `breadth_status.json` reports `blocked`, without changing historical observations. A successful workflow in this state means code ran, **not** that data was collected.
- `breadth_status.json` lists per-market expected/successful snapshot counts and latest observation.

## Corporate credit

`hyperscaler_credit.json` contains a small number of source-verified public observations. Each row records issuer, metric, instrument/tenor, date basis, approximate/exact flag, value in bp, and source URL. `cds_manual.csv` remains unchanged and its existing Oracle history is also displayed.

CDS, primary bond issue spread, secondary bond spread and affiliate debt are distinct. A tenor/currency absent from a publication is labelled unspecified. Approximate statements retain the approximate flag. Report dates are not represented as exact trade dates. Beignet Investor's debt is not Meta parent's debt. Hyperscaler bond values still missing: Microsoft, Amazon, Alphabet. No current daily corporate CDS/bond feed is connected. Old observations display age and are not carried forward or added to the aggregate risk score. Verified observations are points, never an interpolated daily series.

## Verification

`python -m unittest test_breadth.py`

`node test_bubble_indicators.cjs`

Tests cover warmup windows, IPO denominator, missing snapshots, zero vs null, numeric/date parsing, Wilder RSI reference, closed-session filtering, range controls and all eight chart bindings.
