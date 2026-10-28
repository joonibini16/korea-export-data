"""기준일(2026-07-30) 종가 대비 현재가 — 코스피·코스닥 전 종목.

- 기준 종가: KRX 정보데이터시스템 일별 전종목 시세(foreign_buy_days/2026-07-30.json.gz, 이미 수집된 원본)
- 현재가: 네이버 증권 시가총액 순위 API(m.stock.naver.com/api/stocks/marketValue, 장중엔 현재가·장 마감 후엔 종가)
- 지수: 네이버 지수 API 현재값, 기준일 지수 종가는 market_daily.csv(^KS11·^KQ11)
Output: since_base.json(2026-07-30 기준), since_base_1016.json(2026-10-16 기준), since_base_1026.json(2026-10-26 기준)
"""
import csv, gzip, json, time, urllib.request, pathlib, datetime as dt

BASES = {'2026-07-30': 'since_base.json', '2026-10-16': 'since_base_1016.json', '2026-10-26': 'since_base_1026.json'}
BASE = '2026-07-30'
_RANK = {}
ROOT = pathlib.Path(__file__).resolve().parent
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Referer': 'https://m.stock.naver.com/'}
KST = dt.timezone(dt.timedelta(hours=9))


def get(url):
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception:
            if a == 2: raise
            time.sleep(2 * (a + 1))


def f(x):
    try: return float(str(x).replace(',', ''))
    except Exception: return None


def ranking(mkt):
    if mkt in _RANK: return _RANK[mkt]
    rows, page = [], 1
    while True:
        j = json.loads(get(f'https://m.stock.naver.com/api/stocks/marketValue/{mkt}?page={page}&pageSize=100'))
        st = j.get('stocks') or []; rows += st
        if not st or page * 100 >= int(j.get('totalCount') or 0): break
        page += 1; time.sleep(0.2)
    _RANK[mkt] = rows
    return rows


def adj_hist(code):
    """네이버 일봉(수정주가) {YYYYMMDD: 종가}."""
    import re
    t = get(f'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=260&requestType=0')
    out = {}
    for d in re.findall(r'<item data="([^"]+)"', t):
        p = d.split('|')
        if len(p) >= 5 and f(p[4]): out[p[0]] = f(p[4])
    return out


def ytd_stats():
    """올해(1/2~) 일별 KRX 종가로 종목별 최고 종가·날짜와 주식 수 변동 여부."""
    y = str(dt.datetime.now(KST).year)
    hi, sh = {}, {}
    for fp in sorted((ROOT / 'foreign_buy_days').glob(f'{y}-*.json.gz')):
        d = fp.name[:10]
        for mkt, rows in json.loads(gzip.decompress(fp.read_bytes())).items():
            for r in rows:
                code, cap, close = r[0], r[4], r[5]
                if not close: continue
                if code not in hi or close > hi[code][0]: hi[code] = (close, d)
                if cap: s = cap / close; a = sh.setdefault(code, [s, s]); a[0] = min(a[0], s); a[1] = max(a[1], s)
    changed = {c for c, (lo, up) in sh.items() if lo and up / lo > 1.15}
    return hi, changed


def adj_base(code, BASE):
    """네이버 일봉(수정주가)에서 기준일 종가 — 액면분할·병합·무상증자 반영."""
    import re
    t = get(f'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=260&requestType=0')
    for d in re.findall(r'<item data="([^"]+)"', t):
        p = d.split('|')
        if p[0] == BASE.replace('-', ''): return f(p[4])
    return None


def main(BASE, OUT, HI, CHG, icur_cache):
    base = json.loads(gzip.decompress((ROOT / 'foreign_buy_days' / f'{BASE}.json.gz').read_bytes()))
    sector = {r['code']: r['sector'] for r in csv.DictReader((ROOT / 'market_sector_catalog.csv').open(encoding='utf-8-sig'))}
    grp = {r['KIND업종']: r['대분류'] for r in csv.DictReader((ROOT / 'sector_group_map.csv').open(encoding='utf-8-sig'))}
    idx_base = {}; IDX = {'^KS11': [], '^KQ11': []}
    for r in csv.DictReader((ROOT / 'market_daily.csv').open(encoding='utf-8-sig')):
        if r['symbol'] in IDX and f(r['close']): IDX[r['symbol']].append(r)
        if r['symbol'] in ('^KS11', '^KQ11') and r['date'] <= BASE: idx_base[r['symbol']] = (r['date'], f(r['close']))
    out = dict(base_date=BASE, updated_at=dt.datetime.now(KST).isoformat(timespec='seconds'), markets={}, index={})
    for mkt, sym in (('KOSPI', '^KS11'), ('KOSDAQ', '^KQ11')):
        b = {r[0]: (r[1], r[5], r[4]) for r in base[mkt]}   # code → (name, close, cap)
        cur = ranking(mkt); at = ''
        rows = []
        for s in cur:
            code = s.get('itemCode', ''); px = f(s.get('closePrice')); cap = f(s.get('marketValue'))
            at = at or s.get('localTradedAt', '')
            if code not in b or not px or not b[code][1]: continue
            name, bpx, bcap = b[code]
            adj = ''
            # 주가 비율과 시총 비율이 크게 어긋나면 주식 수가 바뀐 것(분할·병합·증자) → 수정주가 기준가로 교체
            if cap and bcap and abs((px / bpx) / ((cap * 1e8) / bcap) - 1) > 0.15:
                try:
                    ab = adj_base(code, BASE); time.sleep(0.1)
                except Exception:
                    ab = None
                if ab and abs(ab / bpx - 1) > 0.01: bpx, adj = ab, '수정'
                else: adj = '주식수 변동'
            # 올해 고점 대비 낙폭(MDD): 종가 기준, 주식 수가 바뀐 종목은 수정주가 일봉으로 계산
            hpx, hdate = HI.get(code, (None, ''))
            if code in CHG or adj:
                try:
                    hist = adj_hist(code); time.sleep(0.1)
                    ys = {k: v for k, v in hist.items() if k[:4] == BASE[:4]}
                    if ys:
                        k = max(ys, key=ys.get); hpx, hdate = ys[k], f'{k[:4]}-{k[4:6]}-{k[6:]}'
                        if adj == '' and BASE.replace('-', '') in hist: pass
                except Exception:
                    pass
            if hpx and px > hpx: hpx, hdate = px, dt.datetime.now(KST).date().isoformat()
            mdd = round((px / hpx - 1) * 100, 2) if hpx else None
            sec = sector.get(code, '')
            rows.append([code, s.get('stockName') or name, bpx, px, round((px / bpx - 1) * 100, 2), round(cap) if cap else round(bcap / 1e8),
                         f(s.get('fluctuationsRatio')), sec, grp.get(sec, ''), s.get('stockEndType', ''), adj, hpx, hdate, mdd])
        rows.sort(key=lambda r: -r[4])
        if mkt not in icur_cache:
            try:
                ij = json.loads(get(f'https://m.stock.naver.com/api/index/{mkt}/basic'))
                icur_cache[mkt] = f(ij.get('closePrice'))
            except Exception:
                icur_cache[mkt] = None
        icur = icur_cache[mkt]
        ib = idx_base.get(sym)
        ihi = max([f(r2['close']) for r2 in IDX[sym] if r2['date'][:4] == BASE[:4]] + ([icur] if icur else []), default=None)
        out['index'][mkt] = dict(base=ib[1] if ib else None, base_date=ib[0] if ib else None, cur=icur, chg=round((icur / ib[1] - 1) * 100, 2) if icur and ib and ib[1] else None, ytd_high=ihi, mdd=round((icur / ihi - 1) * 100, 2) if icur and ihi else None)
        out['markets'][mkt] = dict(traded_at=at, columns=['code', 'name', 'base_close', 'price', 'chg_pct', 'cap_eok', 'day_chg_pct', 'sector', 'group', 'type', 'adj', 'ytd_high', 'ytd_high_date', 'mdd_pct'], rows=rows,
                                   missing_from_base=len(b) - len(rows))
        print(BASE, mkt, len(rows), 'rows', out['index'][mkt])
    (ROOT / OUT).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    HI, CHG = ytd_stats(); ic = {}
    for b, out in BASES.items():
        main(b, out, HI, CHG, ic)
