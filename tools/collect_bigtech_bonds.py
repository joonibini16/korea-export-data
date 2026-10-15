"""빅테크 회사채 수익률·국채 대비 스프레드 — 원본 출처에서 일별 수집 (GitHub Actions).

- 회사채: FINRA Fixed Income Data(TRACE) 'End-of-Day Prices and Yields' — 채권별 일별 마지막 체결 가격·수익률(최근 5년).
  FINRA Data 웹 화면과 같은 공개 조회 경로(XSRF 토큰 쿠키 → POST)를 사용. 비상업적 이용.
- 국채: FRED 미 국채 고정만기 수익률(DGS1·2·3·5·7·10·20)을 날짜별 남은 만기로 선형 보간(같은 만기 국채).
- 스프레드 = 회사채 수익률 − 같은 만기 국채, 5년 내 부도확률 = 1 − exp(−5 × 스프레드 ÷ (1 − 회수율 40%)).
결과: bigtech_bonds_hist.csv(date,ticker,price,ytm,ust,spread_bp,pd5y,trades) — 매 실행 시 FINRA 5년 이력으로 갱신하되 기존 행은 보존(합집합).
진단: bigtech_bonds_status.json
"""
import csv, datetime as dt, http.cookiejar, json, math, pathlib, urllib.parse, urllib.request

META = json.loads(pathlib.Path('bigtech_bonds.json').read_text(encoding='utf-8'))['bonds']
OUT = pathlib.Path('bigtech_bonds_hist.csv')
FIELDS = ['date', 'ticker', 'price', 'ytm', 'ust', 'spread_bp', 'pd5y', 'source']
BASE = 'https://services-dynarep.ddwa.finra.org/'
TEMPLATE = 'template-b3232ls-8h326-4355-8240-2ks8ka01kz0'  # End-of-Day Prices and Yields
today = dt.date.today()
status = dict(updated=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), bonds={}, errors=[], notes=[])

cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'


def req(url, body=None, extra=None):
    h = {'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.finra.org', 'Referer': 'https://www.finra.org/'}
    tok = next((c.value for c in cj if c.name.upper().startswith('XSRF')), None)
    if tok:
        h['X-XSRF-TOKEN'] = tok
    if body is not None:
        h['Content-Type'] = 'application/json'
        body = json.dumps(body).encode()
    h.update(extra or {})
    with op.open(urllib.request.Request(url, data=body, headers=h), timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def finra_data(dataset, body):
    r = req(BASE + f'public/reporting/v2/data/group/FixedIncomeMarket/name/{dataset}', body)
    rb = r.get('returnBody') or {}
    data = rb.get('data')
    return json.loads(data) if isinstance(data, str) else (data or [])


# 1) 세션·토큰
try:
    req(BASE + f'public/reporting/v2/template/{TEMPLATE}/composite')
except Exception as e:
    status['errors'].append(f'template: {e}')
status['cookies'] = sorted(c.name for c in cj)


# 2) 국채 곡선 이력 (FRED)
def fred(sid):
    url = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={(today - dt.timedelta(days=5 * 366 + 30)).isoformat()}'
    with urllib.request.urlopen(url, timeout=60) as r:
        rows = r.read().decode().strip().splitlines()[1:]
    return {d: float(v) for d, v in (l.split(',') for l in rows) if v not in ('', '.')}


TEN = [(1, 'DGS1'), (2, 'DGS2'), (3, 'DGS3'), (5, 'DGS5'), (7, 'DGS7'), (10, 'DGS10'), (20, 'DGS20')]
UST = {}
for yrs, sid in TEN:
    try:
        UST[yrs] = fred(sid)
    except Exception as e:
        status['errors'].append(f'fred {sid}: {e}')
dates_ust = sorted(set().union(*[set(v) for v in UST.values()])) if UST else []


def ust_on(d, yrs):
    pts = []
    for y, _ in TEN:
        s = UST.get(y) or {}
        v = s.get(d)
        if v is None:  # 직전 영업일 값
            prev = [k for k in s if k <= d]
            v = s[max(prev)] if prev else None
        if v is not None:
            pts.append((y, v))
    if not pts:
        return None
    if yrs <= pts[0][0]:
        return pts[0][1]
    for (a, va), (b, vb) in zip(pts, pts[1:]):
        if yrs <= b:
            return va + (vb - va) * (yrs - a) / (b - a)
    return pts[-1][1]



def ytm_from_price(price, coupon, maturity, settle):
    """반기 이표·클린가격 가정 만기수익률(%) — FINRA가 수익률을 비워 둔 체결(예: RegS 채권)에 사용."""
    m = dt.date.fromisoformat(maturity)
    cds, d = [], m
    while d > settle:
        cds.append(d)
        y, mo = (d.year, d.month - 6) if d.month > 6 else (d.year - 1, d.month + 6)
        d = dt.date(y, mo, min(d.day, 28))
    cds.sort()
    accr = coupon / 2 * (settle - d).days / max(1, (cds[0] - d).days)
    dirty = price + accr

    def pv(r):
        return sum((coupon / 2 + (100 if i == len(cds) - 1 else 0)) / (1 + r / 2) ** ((cd - settle).days / 365.25 * 2) for i, cd in enumerate(cds))
    lo, hi = -0.05, 0.8
    for _ in range(100):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if pv(mid) > dirty else (lo, mid)
    return mid * 100


# 3) 회사채 이력 (FINRA TRACE)
rows = {}
if OUT.exists():
    for r in csv.DictReader(OUT.open(encoding='utf-8')):
        rows[(r['date'], r['ticker'])] = r
start = (today - dt.timedelta(days=1825)).isoformat() + ' 00:00:00.000'
end = today.isoformat() + ' 23:59:00.000'
for b in META:
    if b.get('search_only'):
        status['bonds'][b['t']] = dict(n=0)
        continue
    cusips = b.get('cusips') or [b['isin'][2:11]]
    got = []
    for cu in cusips:
        try:
            body = {'fields': ['cusip', 'productType', 'lastSalePrice', 'lastSaleYield', 'tradeDate'],
                    'orFilters': [{'compareFilters': [{'fieldName': 'cusip', 'fieldValue': cu, 'compareType': 'EQUAL'},
                                                      {'fieldName': 'issueSymbolIdentifier', 'fieldValue': cu, 'compareType': 'EQUAL'}]}],
                    'dateRangeFilters': [{'startDate': start, 'endDate': end, 'fieldName': 'tradeDate'}],
                    'sortFields': ['tradeDate'], 'offset': 0, 'limit': 5000}
            got = finra_data('EndOfDayPriceYield', body)
            if got:
                status['bonds'][b['t']] = dict(cusip=cu, n=len(got), first=str(got[0].get('tradeDate'))[:10], last=str(got[-1].get('tradeDate'))[:10], sample=got[-1])
                break
        except Exception as e:
            status['errors'].append(f"{b['t']} {cu}: {e}")
    if not got:
        status['bonds'].setdefault(b['t'], dict(cusip=cusips, n=0))
        continue
    mat = dt.date.fromisoformat(b['maturity'])
    for r in got:
        d = str(r.get('tradeDate'))[:10]
        y, p = r.get('lastSaleYield'), r.get('lastSalePrice')
        if d < '2015' or (y is None and p is None):
            continue
        calc = y is None
        y = ytm_from_price(float(p), b['coupon'], b['maturity'], dt.date.fromisoformat(d)) if calc else float(y)
        yrs = (mat - dt.date.fromisoformat(d)).days / 365.25
        u = ust_on(d, yrs)
        if u is None or not (0 < y < 40):
            continue
        s = (y - u) * 100
        rows[(d, b['t'])] = dict(date=d, ticker=b['t'], price='' if p is None else f'{float(p):.3f}', ytm=f'{y:.3f}', ust=f'{u:.3f}', spread_bp=f'{s:.0f}',
                                 pd5y=f'{(1 - math.exp(-5 * max(s, 0) / 1e4 / 0.6)) * 100:.1f}', source='FINRA TRACE EOD 가격→수익률 계산 · FRED CMT 보간' if calc else 'FINRA TRACE EOD · FRED CMT 보간')

# 4) 코어위브 등 CUSIP 미확인 종목: 발행사명으로 FINRA 채권 검색(진단용)
for b in META:
    if status['bonds'].get(b['t'], {}).get('n'):
        continue
    try:
        res = finra_data('CorporateAndAgencySecurities', {'fields': ['cusip', 'issueSymbolIdentifier', 'issuerName', 'couponRate', 'maturityDate'],
                                                          'compareFilters': [{'fieldName': 'issuerName', 'fieldValue': b.get('issuer', b['name']), 'compareType': 'CONTAINS'}], 'limit': 50})
        status['bonds'][b['t']]['search'] = res[:50]
    except Exception as e:
        status['errors'].append(f"search {b['t']}: {e}")

with OUT.open('w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator='\n')
    w.writeheader()
    w.writerows(sorted(rows.values(), key=lambda r: (r['ticker'], r['date'])))
status['rows'] = len(rows)
pathlib.Path('bigtech_bonds_status.json').write_text(json.dumps(status, ensure_ascii=False, indent=1, default=str))
print(json.dumps({k: v for k, v in status.items() if k != 'bonds'}, ensure_ascii=False))
for k, v in status['bonds'].items():
    print(k, {kk: vv for kk, vv in v.items() if kk != 'search'})
