"""미국 하이일드 스프레드(ICE BofA US High Yield OAS) 장기 이력(1996~) → hy_oas_long.csv · sp500_long.csv · credit_long.csv

FRED는 ICE 지수를 최근 약 3년만 내려줍니다(ALFRED 과거 발표본도 같은 제한, 2026-11 확인). 받은 값은 지우지 않고 계속 쌓으며,
2023년 이전은 장기 신용 스프레드 대리지표(credit_long.csv)로 보여줍니다.
기존 파일의 행은 지우지 않고, 새로 받은 날짜만 추가·갱신합니다.
"""
import csv, io, json, pathlib, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'hy_oas_long.csv'; ST = ROOT / 'hy_oas_long_status.json'
SID = 'BAMLH0A0HYM2'
TRY = [
    ('FRED 최신', f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={SID}&cosd=1996-12-31'),
]


T0 = time.time(); BUDGET = 18 * 60


def get(u):
    last = None
    for a in range(2):
        if time.time() - T0 > BUDGET: raise TimeoutError('전체 제한시간 초과')
        try:
            with urllib.request.urlopen(urllib.request.Request(u), timeout=75) as r:
                return r.read().decode('utf-8-sig')
        except Exception as e:
            last = e; time.sleep(5 * (a + 1))
    raise last


def spx_long(st):
    """비교용 S&P500 일별 종가(2000~), Yahoo Finance 차트(기존 market_daily와 같은 출처) → sp500_long.csv"""
    import datetime as dt
    try:
        u = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=946684800&period2=' + str(int(time.time())) + '&interval=1d'
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
        j = json.loads(urllib.request.urlopen(req, timeout=60).read())['chart']['result'][0]
        ts, cl = j['timestamp'], j['indicators']['quote'][0]['close']
        rows = [(dt.datetime.utcfromtimestamp(t).strftime('%Y-%m-%d'), round(c, 2)) for t, c in zip(ts, cl) if c]
        with (ROOT / 'sp500_long.csv').open('w', encoding='utf-8', newline='') as f:
            w = csv.writer(f); w.writerow(['date', 'close']); w.writerows(rows)
        st['spx'] = dict(rows=len(rows), first=rows[0][0], last=rows[-1][0])
    except Exception as e:
        st['spx'] = dict(error=str(e)[:200])


def proxies(st):
    """하이일드 OAS의 2023년 이전 공백을 메울 장기 신용 스프레드(원본 공식 자료) → credit_long.csv (series,date,value, %p)
    - BAA10Y: 무디스 Baa 회사채 수익률 − 10년 국채(FRED, 일별, 1986~)
    - GZ: 연준 Gilchrist-Zakrajšek 회사채 스프레드(federalreserve.gov FEDS Notes, 월별, 1973~)"""
    out = []
    try:
        t = get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAA10Y&cosd=2000-01-01')
        out += [('BAA10Y', d, v) for d, v in list(csv.reader(io.StringIO(t)))[1:] if v not in ('', '.')]
        st['baa10y'] = len(out)
    except Exception as e:
        st['baa10y'] = str(e)[:150]
    try:
        with urllib.request.urlopen(urllib.request.Request('https://www.federalreserve.gov/econres/notes/feds-notes/ebp_csv.csv', headers={'User-Agent': 'Mozilla/5.0'}), timeout=60) as r:
            t = r.read().decode('utf-8-sig')
        g = [('GZ', row['date'], row['gz_spread']) for row in csv.DictReader(io.StringIO(t)) if row['date'] >= '2000' and row['gz_spread']]
        out += g; st['gz'] = dict(rows=len(g), last=g[-1][1] if g else None)
    except Exception as e:
        st['gz'] = str(e)[:150]
    p = ROOT / 'credit_long.csv'; old = {}
    if p.exists():
        for r in csv.DictReader(p.open(encoding='utf-8')): old[(r['series'], r['date'])] = r['value']
    for k, d, v in out: old[(k, d)] = str(round(float(v), 4))
    if old:
        with p.open('w', encoding='utf-8', newline='') as f:
            w = csv.writer(f); w.writerow(['series', 'date', 'value']); w.writerows(sorted((k, d, v) for (k, d), v in old.items()))


def main():
    st = {'tries': []}; data = {}
    spx_long(st); proxies(st)
    if OUT.exists():
        for r in csv.DictReader(OUT.open(encoding='utf-8')): data[r['date']] = r
    got = {}
    for name, u in TRY:
        try:
            t = get(u); rows = list(csv.reader(io.StringIO(t)))
            vals = [(d, v) for d, v in rows[1:] if v not in ('', '.')]
            st['tries'].append(dict(name=name, rows=len(vals), first=vals[0][0] if vals else None, last=vals[-1][0] if vals else None, header=rows[0] if rows else None))
            got[name] = vals
        except Exception as e:
            st['tries'].append(dict(name=name, error=str(e)[:200]))
        ST.write_text(json.dumps(st, ensure_ascii=False, indent=1)); print(st['tries'][-1], flush=True)
    # 오래된 발표본부터 넣고, 최신 FRED 값으로 덮어씀
    for name, _ in reversed(TRY):
        for d, v in got.get(name, []):
            data[d] = dict(date=d, value=v, source=name)
    rows = sorted(data.values(), key=lambda r: r['date'])
    if rows:
        with OUT.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['date', 'value', 'source']); w.writeheader(); w.writerows(rows)
    st['rows'] = len(rows); st['first'] = rows[0]['date'] if rows else None; st['last'] = rows[-1]['date'] if rows else None
    ST.write_text(json.dumps(st, ensure_ascii=False, indent=1)); print(json.dumps(st, ensure_ascii=False)[:1500])


if __name__ == '__main__':
    main()
