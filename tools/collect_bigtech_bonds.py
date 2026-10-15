"""빅테크 회사채 수익률·국채 대비 스프레드 일별 수집 (GitHub Actions).

- 회사채: divvydiary 채권 페이지의 현재수익률(Current yield)로 가격을 역산(가격 = 쿠폰 ÷ 현재수익률)한 뒤
  반기 이표·만기 상환 기준 만기수익률(YTM)을 직접 계산. 페이지의 YTM 표기도 함께 기록.
- 국채: FRED 미 국채 고정만기 수익률(DGS1·2·3·5·7·10·20)을 남은 만기로 선형 보간.
- 스프레드 = 회사채 YTM − 같은 만기 국채, 5년 내 부도확률 = 1 − exp(−5 × 스프레드 ÷ (1 − 회수율 40%)).
결과: bigtech_bonds_log.csv(date,ticker,price,ytm,ytm_page,ust,spread_bp,pd5y,source) — 날짜·종목별로 덮어쓰기, 과거 행 보존.
수동 기록(bigtech_bonds_manual.csv: date,ticker,ytm,ust,source)이 있으면 같은 날짜 자동값보다 우선.
"""
import csv, datetime as dt, json, math, pathlib, re, urllib.request

META = json.loads(pathlib.Path('bigtech_bonds.json').read_text(encoding='utf-8'))['bonds']
LOG = pathlib.Path('bigtech_bonds_log.csv')
MAN = pathlib.Path('bigtech_bonds_manual.csv')
FIELDS = ['date', 'ticker', 'price', 'ytm', 'ytm_page', 'ust', 'spread_bp', 'pd5y', 'source']
KST = dt.timezone(dt.timedelta(hours=9))
today = dt.datetime.now(KST).date()


def get(url, ua=True):
    h = {'User-Agent': 'Mozilla/5.0 (compatible; korea-export-data/1.0; +https://joonibini16.github.io/korea-export-data/)'} if ua else {}
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=60) as r:
        return r.read().decode('utf-8', 'replace')


def ust_curve():
    pts = {}
    for sid, yrs in [('DGS1', 1), ('DGS2', 2), ('DGS3', 3), ('DGS5', 5), ('DGS7', 7), ('DGS10', 10), ('DGS20', 20)]:
        start = (today - dt.timedelta(days=20)).isoformat()
        rows = [l.split(',') for l in get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={start}', ua=False).strip().splitlines()[1:]]
        rows = [(d, float(v)) for d, v in rows if v not in ('', '.')]
        if rows:
            pts[yrs] = rows[-1]
    return pts


def interp(curve, yrs):
    ks = sorted(curve)
    if yrs <= ks[0]:
        return curve[ks[0]][1]
    for a, b in zip(ks, ks[1:]):
        if yrs <= b:
            return curve[a][1] + (curve[b][1] - curve[a][1]) * (yrs - a) / (b - a)
    return curve[ks[-1]][1]


def ytm_from_price(price, coupon, maturity, settle):
    """반기 이표, 경과이자 반영(가격 = 클린가격 가정)."""
    m = dt.date.fromisoformat(maturity)
    cds = []
    d = m
    while d > settle:
        cds.append(d)
        y, mo = (d.year, d.month - 6) if d.month > 6 else (d.year - 1, d.month + 6)
        d = d.replace(year=y, month=mo, day=min(d.day, 28)) if d.day > 28 else d.replace(year=y, month=mo)
    cds = sorted(cds)
    prev = d
    accr = coupon / 2 * (settle - prev).days / max(1, (cds[0] - prev).days)
    dirty = price + accr

    def pv(y):
        s = 0.0
        for i, cd in enumerate(cds):
            t = (cd - settle).days / 365.25 * 2
            cf = coupon / 2 + (100 if i == len(cds) - 1 else 0)
            s += cf / (1 + y / 2) ** t
        return s
    lo, hi = -0.05, 0.6
    for _ in range(200):
        mid = (lo + hi) / 2
        if pv(mid) > dirty:
            lo = mid
        else:
            hi = mid
    return mid * 100


rows = {}
if LOG.exists():
    for r in csv.DictReader(LOG.open(encoding='utf-8')):
        rows[(r['date'], r['ticker'])] = r

curve = ust_curve()
ust_date = max(v[0] for v in curve.values())
print('UST', ust_date, {k: v[1] for k, v in curve.items()})
errors = []
for b in META:
    if not b.get('url'):
        continue
    try:
        h = get(b['url'])
        t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', re.sub(r'<script[^>]*>.*?</script>', ' ', h, flags=re.S)))
        cy = float(re.search(r'Current yield\s*([\d.]+)\s*%', t).group(1))
        yp = re.search(r'Yield to maturity\s*([\d.]+)\s*%', t)
        price = b['coupon'] / cy * 100
        y = ytm_from_price(price, b['coupon'], b['maturity'], today + dt.timedelta(days=1))
        yrs = (dt.date.fromisoformat(b['maturity']) - today).days / 365.25
        u = interp(curve, yrs)
        s = (y - u) * 100
        pd = (1 - math.exp(-5 * (s / 1e4) / 0.6)) * 100 if s > 0 else 0.0
        rows[(today.isoformat(), b['t'])] = dict(date=today.isoformat(), ticker=b['t'], price=f'{price:.2f}', ytm=f'{y:.3f}', ytm_page=yp.group(1) if yp else '',
                                                 ust=f'{u:.3f}', spread_bp=f'{s:.0f}', pd5y=f'{pd:.1f}', source=f'divvydiary 현재수익률 {cy}% → 가격 역산 · FRED 국채({ust_date}) 보간')
        print(b['t'], rows[(today.isoformat(), b['t'])])
    except Exception as e:
        errors.append(f"{b['t']}: {e}")

if MAN.exists():
    for r in csv.DictReader(MAN.open(encoding='utf-8')):
        y, u = float(r['ytm']), float(r['ust'])
        s = (y - u) * 100
        rows[(r['date'], r['ticker'])] = dict(date=r['date'], ticker=r['ticker'], price='', ytm=f'{y:.3f}', ytm_page='', ust=f'{u:.3f}', spread_bp=f'{s:.0f}',
                                              pd5y=f'{(1 - math.exp(-5 * (s / 1e4) / 0.6)) * 100:.1f}', source=r.get('source') or '수동 기록')

with LOG.open('w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator='\n')
    w.writeheader()
    w.writerows(sorted(rows.values(), key=lambda r: (r['date'], r['ticker'])))
pathlib.Path('bigtech_bonds_status.json').write_text(json.dumps(dict(updated=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), ust_date=ust_date, errors=errors), ensure_ascii=False, indent=1))
print('errors', errors)
