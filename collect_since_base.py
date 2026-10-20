"""기준일(2026-07-30) 종가 대비 현재가 — 코스피·코스닥 전 종목.

- 기준 종가: KRX 정보데이터시스템 일별 전종목 시세(foreign_buy_days/2026-07-30.json.gz, 이미 수집된 원본)
- 현재가: 네이버 증권 시가총액 순위 API(m.stock.naver.com/api/stocks/marketValue, 장중엔 현재가·장 마감 후엔 종가)
- 지수: 네이버 지수 API 현재값, 기준일 지수 종가는 market_daily.csv(^KS11·^KQ11)
Output: since_base.json
"""
import csv, gzip, json, time, urllib.request, pathlib, datetime as dt

BASE = '2026-07-30'
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
    rows, page = [], 1
    while True:
        j = json.loads(get(f'https://m.stock.naver.com/api/stocks/marketValue/{mkt}?page={page}&pageSize=100'))
        st = j.get('stocks') or []; rows += st
        if not st or page * 100 >= int(j.get('totalCount') or 0): break
        page += 1; time.sleep(0.2)
    return rows


def adj_base(code):
    """네이버 일봉(수정주가)에서 기준일 종가 — 액면분할·병합·무상증자 반영."""
    import re
    t = get(f'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=90&requestType=0')
    for d in re.findall(r'<item data="([^"]+)"', t):
        p = d.split('|')
        if p[0] == BASE.replace('-', ''): return f(p[4])
    return None


def main():
    base = json.loads(gzip.decompress((ROOT / 'foreign_buy_days' / f'{BASE}.json.gz').read_bytes()))
    sector = {r['code']: r['sector'] for r in csv.DictReader((ROOT / 'market_sector_catalog.csv').open(encoding='utf-8-sig'))}
    grp = {r['KIND업종']: r['대분류'] for r in csv.DictReader((ROOT / 'sector_group_map.csv').open(encoding='utf-8-sig'))}
    idx_base = {}
    for r in csv.DictReader((ROOT / 'market_daily.csv').open(encoding='utf-8-sig')):
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
                    ab = adj_base(code); time.sleep(0.1)
                except Exception:
                    ab = None
                if ab and abs(ab / bpx - 1) > 0.01: bpx, adj = ab, '수정'
                else: adj = '주식수 변동'
            sec = sector.get(code, '')
            rows.append([code, s.get('stockName') or name, bpx, px, round((px / bpx - 1) * 100, 2), round(cap) if cap else round(bcap / 1e8),
                         f(s.get('fluctuationsRatio')), sec, grp.get(sec, ''), s.get('stockEndType', ''), adj])
        rows.sort(key=lambda r: -r[4])
        try:
            ij = json.loads(get(f'https://m.stock.naver.com/api/index/{mkt}/basic'))
            icur = f(ij.get('closePrice'))
        except Exception:
            icur = None
        ib = idx_base.get(sym)
        out['index'][mkt] = dict(base=ib[1] if ib else None, base_date=ib[0] if ib else None, cur=icur, chg=round((icur / ib[1] - 1) * 100, 2) if icur and ib and ib[1] else None)
        out['markets'][mkt] = dict(traded_at=at, columns=['code', 'name', 'base_close', 'price', 'chg_pct', 'cap_eok', 'day_chg_pct', 'sector', 'group', 'type', 'adj'], rows=rows,
                                   missing_from_base=len(b) - len(rows))
        print(mkt, len(rows), 'rows', out['index'][mkt])
    (ROOT / 'since_base.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    main()
