"""우라가미 4계절 판단용 자동 지표 → seasons_auto.json

- 한국 실적 추정치 변화: consensus_trend.csv(FnGuide 컨센서스 일별 기록) 영업이익 합계의 1·3개월 변화, 반도체(삼성전자·SK하이닉스) 제외 별도, 상향·하향 종목 수
- 주가 추세: market_daily.csv(코스피·코스닥·S&P500·나스닥) 고점 대비, 200일선 대비, 3개월 변화
- 금리: fred_data.csv(미 10년·2년 국채, 연준 목표 상단), 하이일드 스프레드
"""
import csv, collections, json, pathlib, datetime as dt

ROOT = pathlib.Path(__file__).resolve().parent
SEMI = {'005930', '000660'}


def at(v, d):
    x = [a for dd, a in v if dd <= d]; return x[-1] if x else None


def revisions():
    idx = collections.defaultdict(list)
    for x in csv.DictReader((ROOT / 'consensus_trend.csv').open(encoding='utf-8-sig')):
        if x['item'] == 'op' and x['avg']: idx[(x['freq'], x['company_id'], x['period'])].append((x['date'], float(x['avg'])))
    for k in idx: idx[k].sort()
    last = max(d for v in idx.values() for d, _ in v)
    L = dt.date.fromisoformat(last)
    d1, d3 = (L - dt.timedelta(days=30)).isoformat(), (L - dt.timedelta(days=91)).isoformat()
    y = L.year
    out = {'asof': last}
    for key, f, per in (('fy0', 'Y', f'{y}/12'), ('fy1', 'Y', f'{y + 1}/12'), ('nq', 'Q', f'{y}/12')):
        for ex in (False, True):
            s = {last: 0, d1: 0, d3: 0}; up = dn = n = 0
            for (ff, c, p), v in idx.items():
                if ff != f or p != per or (ex and c in SEMI): continue
                vals = {d: at(v, d) for d in s}
                if None in vals.values(): continue
                n += 1
                for d in s: s[d] += vals[d]
                if vals[last] > vals[d1] * 1.001: up += 1
                elif vals[last] < vals[d1] * 0.999: dn += 1
            if not n: continue
            out[f'{key}{"_ex" if ex else ""}'] = dict(period=per, n=n, total_jo=round(s[last] / 1e4, 1), m1=round((s[last] / s[d1] - 1) * 100, 1), m3=round((s[last] / s[d3] - 1) * 100, 1), up=up, down=dn)
    return out


def prices():
    S = collections.defaultdict(list)
    for r in csv.DictReader((ROOT / 'market_daily.csv').open(encoding='utf-8-sig')):
        if r['symbol'] in ('^KS11', '^KQ11', '^GSPC', '^IXIC') and r['close']: S[r['symbol']].append((r['date'], float(r['close'])))
    out = {}
    for k, v in S.items():
        v.sort(); c = [x for _, x in v]; n = len(c) - 1
        hi = max(c[-252:]); ma = sum(c[-200:]) / min(200, len(c))
        out[k] = dict(date=v[-1][0], close=c[-1], from_high=round((c[-1] / hi - 1) * 100, 1), vs200=round((c[-1] / ma - 1) * 100, 1),
                      m3=round((c[-1] / c[max(0, n - 63)] - 1) * 100, 1), m12=round((c[-1] / c[max(0, n - 252)] - 1) * 100, 1))
    return out


def rates():
    S = collections.defaultdict(list)
    for r in csv.DictReader((ROOT / 'fred_data.csv').open(encoding='utf-8')):
        if r['series'] in ('DGS10', 'DGS2', 'DFEDTARU', 'BAMLH0A0HYM2', 'T10Y3M') and r['value'] not in ('', '.'): S[r['series']].append((r['date'], float(r['value'])))
    out = {}
    for k, v in S.items():
        v.sort(); L = dt.date.fromisoformat(v[-1][0])
        b3 = at(v, (L - dt.timedelta(days=91)).isoformat()); b12 = at(v, (L - dt.timedelta(days=365)).isoformat())
        out[k] = dict(date=v[-1][0], value=v[-1][1], chg3m=round(v[-1][1] - b3, 2) if b3 is not None else None, chg12m=round(v[-1][1] - b12, 2) if b12 is not None else None)
    return out


def main():
    out = dict(updated_at=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec='seconds'))
    for k, f in (('kr_revisions', revisions), ('prices', prices), ('rates', rates)):
        try: out[k] = f()
        except Exception as e: out[k] = {'error': str(e)[:200]}
    (ROOT / 'seasons_auto.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(json.dumps(out, ensure_ascii=False)[:1500])


if __name__ == '__main__':
    main()
