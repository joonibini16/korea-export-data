"""Bubble / stress monitor data: global equity indices, risk assets, liquidity, credit spreads, exports by country.

Yahoo Finance chart API (daily close, 3y) → market_daily.csv (symbol,date,close)
FRED fredgraph CSV (no key)              → fred_data.csv   (series,date,value)
한국은행 ECOS 시장금리(일별, 817Y002; 환경변수 ECOS_API_KEY) → ecos_rates.csv (series,date,value)
KRX Open API 파생상품지수(VKOSPI; 환경변수 KRX_API_KEY, 선택)   → vkospi.csv (date,close)
금융투자협회 FreeSIS 증시자금·신용공여(일별, 키 불필요)          → kofia_daily.csv (백만원)
Status → bubble_status.json. Unofficial endpoints: failures are recorded and earlier data kept.
"""
import csv, json, os, time, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

KST = timezone(timedelta(hours=9))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}
YAHOO = ['^GSPC', '^IXIC', '^SOX', '^KS11', '^KQ11', '^TWII', '^N225', '000001.SS', '^HSI', '^GDAXI', '^FCHI', '^FTSE', '^STOXX50E',
         '^NSEI', '^BVSP', '^GSPTSE', '^AXJO', '^JKSE', '^MXX', '^VIX', 'BTC-USD', 'HG=F', 'GC=F', 'CL=F', 'DX-Y.NYB', 'JPY=X', 'KRW=X',
         'ORCL', 'NVDA', 'MSFT', 'META', 'AMZN', 'GOOGL', 'AVGO', 'TSM', 'CRWV', 'AMD', 'HYG', 'LQD', 'TLT', '^MOVE', '^VIX3M']
FRED = ['WALCL', 'WTREGEN', 'RRPONTSYD', 'WRESBAL', 'TOTBKCR', 'BUSLOANS', 'CONSUMER', 'REALLN', 'M2SL', 'CPFF',
        'BAMLH0A0HYM2', 'BAMLC0A0CM', 'BAMLH0A3HYC', 'BAMLC0A4CBBB', 'VIXCLS', 'T10Y2Y', 'T10Y3M', 'DFII10', 'NFCI', 'STLFSI4',
        'ICSA', 'SAHMREALTIME', 'DTWEXBGS', 'SOFR', 'IORB', 'DRTSCILM',
        'XTEXVA01KRM667S', 'XTEXVA01CNM667S', 'XTEXVA01JPM667S', 'XTEXVA01DEM667S', 'XTEXVA01FRM667S', 'XTEXVA01GBM667S',
        'XTEXVA01INM667S', 'XTEXVA01BRM667S', 'XTEXVA01CAM667S', 'XTEXVA01AUM667S', 'XTEXVA01MXM667S', 'XTEXVA01IDM667S', 'BOPTEXP']


def get(url, timeout=90, tries=4, ua=True):
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA if ua else {}), timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            last = e; time.sleep(3 * (a + 1))
    raise RuntimeError(str(last)[:150])


def yahoo(sym):
    j = json.loads(get('https://query1.finance.yahoo.com/v8/finance/chart/' + urllib.parse.quote(sym) + ('?period1=1420070400&period2=' + str(int(time.time())) if sym in ('^KS11', '^KQ11') else '?range=5y') + '&interval=1d', 40))  # range=max는 월간으로 내려와서 2015-01-01부터 기간 지정
    r = j['chart']['result'][0]
    if r.get('meta', {}).get('dataGranularity', '1d') != '1d':
        raise RuntimeError('not daily: ' + str(r['meta'].get('dataGranularity')))
    ts, cl = r.get('timestamp') or [], r['indicators']['quote'][0].get('close') or []
    out = []
    for t, c in zip(ts, cl):
        if c is not None:
            out.append(dict(symbol=sym, date=datetime.fromtimestamp(t, timezone.utc).date().isoformat(), close=f'{c:.6g}'))
    return out


def fred(sid):
    t = get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd=2015-01-01', timeout=60, tries=2, ua=False)
    out = []
    for line in t.splitlines()[1:]:
        p = line.split(',')
        if len(p) == 2 and p[1] not in ('', '.'):
            out.append(dict(series=sid, date=p[0], value=p[1]))
    if not out:
        raise RuntimeError('empty')
    return out


ECOS = {'010200000': 'KTB3Y', '010210000': 'KTB10Y', '010300000': 'CORP_AA', '010320000': 'CORP_BBB', '010502000': 'CD91', '010503000': 'CP91'}


def ecos(key):
    end = datetime.now(KST).strftime('%Y%m%d')
    out = []
    for code, name in ECOS.items():
        j = json.loads(get(f'https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/100000/817Y002/D/20150101/{end}/{code}', timeout=60, tries=3))
        rows = (j.get('StatisticSearch') or {}).get('row') or []
        if not rows:
            raise RuntimeError(f'{name}: ' + json.dumps(j.get('RESULT', j), ensure_ascii=False)[:120])
        for r in rows:
            t, v = r['TIME'], r['DATA_VALUE']
            if v not in ('', None):
                out.append(dict(series=name, date=f'{t[:4]}-{t[4:6]}-{t[6:8]}', value=v))
        time.sleep(0.3)
    return out


def vkospi(key, fails):
    path = Path('vkospi.csv')
    have = {r['date']: r['close'] for r in csv.DictReader(path.open(encoding='utf-8'))} if path.exists() else {}
    today = datetime.now(KST).date()
    days = [today - timedelta(days=i) for i in range(1, 400)]
    todo = [d for d in days if d.weekday() < 5 and d.isoformat() not in have][:300]
    miss = 0
    for d in todo:
        try:
            req = urllib.request.Request(f'https://data-dbg.krx.co.kr/svc/apis/idx/drvprod_dd_trd?basDd={d:%Y%m%d}', headers={'AUTH_KEY': key})
            with urllib.request.urlopen(req, timeout=30) as r:
                j = json.loads(r.read().decode('utf-8'))
        except Exception as e:
            fails.append(dict(id='VKOSPI', error=str(e)[:150])); break
        for x in j.get('OutBlock_1') or []:
            if '변동성' in x.get('IDX_NM', '') and '200' in x.get('IDX_NM', '') and x.get('CLSPRC_IDX') not in ('', '-', None):
                have[d.isoformat()] = x['CLSPRC_IDX'].replace(',', ''); break
        else:
            miss += 1  # 휴장일
        time.sleep(0.15)
    if have:
        with path.open('w', encoding='utf-8', newline='') as f:
            w = csv.writer(f); w.writerow(['date', 'close']); [w.writerow([k, have[k]]) for k in sorted(have)]
    return len(have)


KOFIA_URL = 'https://freesis.kofia.or.kr/meta/getMetaDataList.do'
KOFIA = {'STATSCU0100000060BO': ['deposit', 'deriv_deposit', 'rp', 'unsettled', 'forced_sale', 'forced_ratio'],
         'STATSCU0100000070BO': ['credit_total', 'credit_kospi', 'credit_kosdaq', 'short_total', 'short_kospi', 'short_kosdaq', 'ipo_loan', 'secured_loan']}


def kofia(fails):
    end = datetime.now(KST).strftime('%Y%m%d')
    path = Path('kofia_daily.csv')
    by = {r['date']: {k: v for k, v in r.items() if k != 'date' and v != ''} for r in csv.DictReader(path.open(encoding='utf-8'))} if path.exists() else {}
    for obj, cols in KOFIA.items():
        for y in range(2015, int(end[:4]) + 1):
            body = json.dumps({'dmSearch': {'tmpV40': '1000000', 'tmpV41': '1', 'tmpV1': 'D', 'tmpV45': f'{y}0101', 'tmpV46': min(f'{y}1231', end), 'OBJ_NM': obj}}).encode()
            req = urllib.request.Request(KOFIA_URL, data=body, headers={'Content-Type': 'application/json', **UA})
            rows = None
            for a in range(4):
                try:
                    with urllib.request.urlopen(req, timeout=60) as r:
                        rows = json.loads(r.read().decode('utf-8')).get('ds1') or []
                    break
                except Exception as e:
                    if a == 3: fails.append(dict(id=f'KOFIA {obj[-6:]} {y}', error=str(e)[:100]))  # 그 해는 기존 값 유지
                    time.sleep(4)
            rows = rows or []
            for x in rows:
                t = x['TMPV1']; d = by.setdefault(f'{t[:4]}-{t[4:6]}-{t[6:8]}', {})
                for i, c in enumerate(cols):
                    v = x.get(f'TMPV{i + 2}')
                    if v is not None: d[c] = v
            time.sleep(0.3)
    if not by:
        raise RuntimeError('empty')
    fields = ['date'] + [c for cs in KOFIA.values() for c in cs]
    with Path('kofia_daily.csv').open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        for k in sorted(by): w.writerow({'date': k, **by[k]})
    return len(by)


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
    # FRED는 동시 요청에 느려지므로 순차·짧은 제한시간·전체 예산(12분)으로 받고, 못 받은 시리즈는 기존 값을 유지합니다.
    t0 = time.time()
    for sid in FRED:
        if time.time() - t0 > 720:
            fails.append(dict(id=sid, error='time budget exceeded')); continue
        F += _safe(fred, sid, fails)
        time.sleep(0.5)
    E, nv = [], None
    if os.environ.get('ECOS_API_KEY'):
        E = _safe(ecos, os.environ['ECOS_API_KEY'], fails)
        if E: merge(Path('ecos_rates.csv'), E, 'series', ['series', 'date', 'value'], {r['series'] for r in E})
    if os.environ.get('KRX_API_KEY'):
        nv = vkospi(os.environ['KRX_API_KEY'], fails)
    nk = None
    try:
        nk = kofia(fails)
    except Exception as e:
        fails.append(dict(id='KOFIA', error=str(e)[:150]))
    if Y: merge(Path('market_daily.csv'), Y, 'symbol', ['symbol', 'date', 'close'], {r['symbol'] for r in Y})
    if F: merge(Path('fred_data.csv'), F, 'series', ['series', 'date', 'value'], {r['series'] for r in F})
    last = {}
    for r in F: last[r['series']] = max(last.get(r['series'], ''), r['date'])
    Path('bubble_status.json').write_text(json.dumps(dict(updated_at=datetime.now(KST).isoformat(timespec='seconds'), yahoo_rows=len(Y), fred_rows=len(F), ecos_rows=len(E), ecos_key=bool(os.environ.get('ECOS_API_KEY')), vkospi_rows=nv, kofia_rows=nk, krx_key=bool(os.environ.get('KRX_API_KEY')),
        fred_last=last, failures=fails), ensure_ascii=False, indent=1))
    print('yahoo', len(Y), 'fred', len(F), 'fails', len(fails))


def _safe(fn, s, fails):
    try:
        return fn(s)
    except Exception as e:
        fails.append(dict(id=s, error=str(e)[:150])); return []


if __name__ == '__main__':
    main()
