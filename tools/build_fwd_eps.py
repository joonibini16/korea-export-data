"""12개월 선행 EPS(종목별) → fwd_eps.json  (주가 등락률 페이지에서 종가 ÷ 12M 선행 EPS = 12M FPER)

이미 저장소에 쌓고 있는 컨센서스만 씁니다(새로 수집하지 않음).
1) consensus_trend.csv: 연간(Y) EPS 컨센서스 평균, 회계연도별 가장 최근 시점 값 (FY1·FY2가 있음)
2) valuation_consensus.csv: 가장 최근 스냅샷의 연간 추정 EPS(is_estimate=1) — FY2가 없을 때 FY1만 보조로 사용
12M 선행 EPS = FY1 × (FY1 결산까지 남은 개월 ÷ 12) + FY2 × (1 − 남은 개월 ÷ 12). FY2가 없으면 FY1 단독(method=FY1).
"""
import csv, json, datetime as dt, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
today = dt.date.today()


def fye(period):  # '2026/12' 또는 '2026' → 결산일
    y, m = (period.split('/') + ['12'])[:2]
    y, m = int(y), int(m)
    return dt.date(y + (m == 12), 1 if m == 12 else m + 1, 1) - dt.timedelta(days=1)


est = {}  # code -> {period: (date, eps, src)}
p = ROOT / 'consensus_trend.csv'
if p.exists():
    for r in csv.DictReader(p.open(encoding='utf-8')):
        if r['freq'] != 'Y' or r['item'] != 'eps' or not r['avg']:
            continue
        d = est.setdefault(r['company_id'], {})
        k = r['period'] if '/' in r['period'] else r['period'] + '/12'
        if k not in d or r['date'] > d[k][0]:
            d[k] = (r['date'], float(r['avg']), 'trend')
p = ROOT / 'valuation_consensus.csv'
if p.exists():
    rows = [r for r in csv.DictReader(p.open(encoding='utf-8')) if r['freq'] == 'annual' and r['is_estimate'] == '1' and r['eps'] not in ('', None)]
    last = {}
    for r in rows:
        last[r['company_id']] = max(last.get(r['company_id'], ''), r['snapshot_date'])
    for r in rows:
        if r['snapshot_date'] != last[r['company_id']]:
            continue
        d = est.setdefault(r['company_id'], {}); k = r['period'] + '/12'
        if k not in d:  # 추이 자료가 없을 때만 보조
            d[k] = (r['snapshot_date'], float(r['eps']), 'naver')

out = {}
for code, d in est.items():
    fut = sorted((k for k in d if fye(k) >= today), key=fye)
    if not fut:
        continue
    k1 = fut[0]; e1 = d[k1][1]; rem = max(0.0, min(12.0, (fye(k1) - today).days / 30.4375))
    if len(fut) > 1:
        k2 = fut[1]; e2 = d[k2][1]; w = rem / 12; eps = e1 * w + e2 * (1 - w); meth = 'FY1·FY2'
    else:
        k2 = None; e2 = None; eps = e1; meth = 'FY1'
    out[code] = [round(eps, 1), meth, k1, round(e1, 1), k2, None if e2 is None else round(e2, 1), max(d[k1][0], d[k2][0] if k2 else '')]

(ROOT / 'fwd_eps.json').write_text(json.dumps(dict(asof=today.isoformat(), columns=['eps12m', 'method', 'fy1', 'eps_fy1', 'fy2', 'eps_fy2', 'cns_date'], rows=out), ensure_ascii=False, separators=(',', ':')))
print('fwd_eps', len(out), sum(1 for v in out.values() if v[1] == 'FY1·FY2'))
