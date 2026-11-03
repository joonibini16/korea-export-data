"""미국 하이일드 스프레드(ICE BofA US High Yield OAS) 장기 이력(1996~) → hy_oas_long.csv

FRED는 ICE 지수를 최근 약 3년만 내려주므로, 과거 구간은 ALFRED(FRED 과거 발표본, 같은 St. Louis Fed)의
예전 발표본(vintage)에서 받습니다. 같은 시리즈(BAMLH0A0HYM2)의 공식 발표값이며, 날짜가 겹치면 최신 FRED 값을 우선합니다.
기존 파일의 행은 지우지 않고, 새로 받은 날짜만 추가·갱신합니다.
"""
import csv, io, json, pathlib, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'hy_oas_long.csv'; ST = ROOT / 'hy_oas_long_status.json'
SID = 'BAMLH0A0HYM2'
TRY = [
    ('FRED 최신', f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={SID}&cosd=1996-12-31'),
    ('ALFRED 2023-01-03 발표본', f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={SID}&cosd=1996-12-31&vintage_date=2023-01-03'),
    ('ALFRED 2022-01-03 발표본', f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={SID}&cosd=1996-12-31&vintage_date=2022-01-03'),
    ('ALFRED 2023-01-03 (alfred)', f'https://alfred.stlouisfed.org/graph/alfredgraph.csv?id={SID}&cosd=1996-12-31&vintage_date=2023-01-03'),
    ('ALFRED 2020-06-01 발표본', f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={SID}&cosd=1996-12-31&vintage_date=2020-06-01'),
]


def get(u):
    last = None
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'korea-export-data research (python urllib)'}), timeout=150) as r:
                return r.read().decode('utf-8-sig')
        except Exception as e:
            last = e; time.sleep(5 * (a + 1))
    raise last


def main():
    st = {'tries': []}; data = {}
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
