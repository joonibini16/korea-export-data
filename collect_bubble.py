"""Bubble / stress monitor data: global equity indices, risk assets, liquidity, credit spreads, exports by country.

Yahoo Finance chart API (daily close, 3y) → market_daily.csv (symbol,date,close)
FRED fredgraph CSV (no key)              → fred_data.csv   (series,date,value)
Status → bubble_status.json. Unofficial endpoints: failures are recorded and earlier data kept.
"""
import csv, json, time, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

KST = timezone(timedelta(hours=9))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}
YAHOO = ['^GSPC', '^IXIC', '^SOX', '^KS11', '^KQ11', '^TWII', '^N225', '000001.SS', '^HSI', '^GDAXI', '^FCHI', '^FTSE', '^STOXX50E',
         '^NSEI', '^BVSP', '^GSPTSE', '^AXJO', '^JKSE', '^MXX', '^VIX', 'BTC-USD', 'HG=F', 'GC=F', 'CL=F', 'DX-Y.NYB', 'JPY=X', 'KRW=X',
         'ORCL', 'NVDA', 'MSFT', 'META', 'AMZN', 'GOOGL', 'AVGO', 'TSM', 'CRWV', 'AMD', 'HYG', 'LQD', 'TLT']
FRED = ['WALCL', 'WTREGEN', 'RRPONTSYD', 'WRESBAL', 'TOTBKCR', 'BUSLOANS', 'CONSUMER', 'REALLN', 'M2SL', 'CPFF',
        'BAMLH0A0HYM2', 'BAMLC0A0CM', 'BAMLH0A3HYC', 'BAMLC0A4CBBB', 'VIXCLS', 'T10Y2Y', 'T10Y3M', 'DFII10', 'NFCI', 'STLFSI4',
        'ICSA', 'SAHMREALTIME', 'DTWEXBGS', 'SOFR', 'IORB', 'DRTSCILM',
        'XTEXVA01KRM667S', 'XTEXVA01CNM667S', 'XTEXVA01JPM667S', 'XTEXVA01DEM667S', 'XTEXVA01FRM667S', 'XTEXVA01GBM667S',
        'XTEXVA01INM667S', 'XTEXVA01BRM667S', 'XTEXVA01CAM667S', 'XTEXVA01AUM667S', 'XTEXVA01MXM667S', 'XTEXVA01IDM667S', 'BOPTEXP']


def get(url, timeout=90, tries=4):
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            last = e; time.sleep(3 * (a + 1))
    raise RuntimeError(str(last)[:150])


def yahoo(sym):
    j = json.loads(get('https://query1.finance.yahoo.com/v8/finance/chart/' + urllib.parse.quote(sym) + '?range=5y&interval=1d', 40))
    r = j['chart']['result'][0]
    ts, cl = r.get('timestamp') or [], r['indicators']['quote'][0].get('close') or []
    out = []
    for t, c in zip(ts, cl):
        if c is not None:
            out.append(dict(symbol=sym, date=datetime.fromtimestamp(t, timezone.utc).date().isoformat(), close=f'{c:.6g}'))
    return out


def fred(sid):
    t = get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd=2015-01-01')
    out = []
    for line in t.splitlines()[1:]:
        p = line.split(',')
        if len(p) == 2 and p[1] not in ('', '.'):
            out.append(dict(series=sid, date=p[0], value=p[1]))
    if not out:
        raise RuntimeError('empty')
    return out


def merge(path, rows, key, fields, got):
    old = [r for r in csv.DictReader(path.open(encoding='utf-8'))] if path.exists() else []
    keep = [r for r in old if r[key] not in got]
    with path.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        w.writerows(sorted(keep + rows, key=lambda r: (r[key], r['date'])))


def main():
    fails, Y, F = [], [], []
    with ThreadPoolExecutor(4) as pool:
        for sym, res in zip(YAHOO, pool.map(lambda s: _safe(yahoo, s, fails), YAHOO)):
            Y += res
    with ThreadPoolExecutor(3) as pool:
        for sid, res in zip(FRED, pool.map(lambda s: _safe(fred, s, fails), FRED)):
            F += res
    if Y: merge(Path('market_daily.csv'), Y, 'symbol', ['symbol', 'date', 'close'], {r['symbol'] for r in Y})
    if F: merge(Path('fred_data.csv'), F, 'series', ['series', 'date', 'value'], {r['series'] for r in F})
    last = {}
    for r in F: last[r['series']] = max(last.get(r['series'], ''), r['date'])
    Path('bubble_status.json').write_text(json.dumps(dict(updated_at=datetime.now(KST).isoformat(timespec='seconds'), yahoo_rows=len(Y), fred_rows=len(F),
        fred_last=last, failures=fails), ensure_ascii=False, indent=1))
    print('yahoo', len(Y), 'fred', len(F), 'fails', len(fails))


def _safe(fn, s, fails):
    try:
        return fn(s)
    except Exception as e:
        fails.append(dict(id=s, error=str(e)[:150])); return []


if __name__ == '__main__':
    main()
