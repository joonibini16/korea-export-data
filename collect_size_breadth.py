"""규모별 Breadth Desk 수집: 코스피(대형·중형·소형) / 코스닥(K100·MID·SMALL)의 60일 신고가·신저가 폭.

정의(종가 또는 장중 현재가 기준)
- 규모 구분: 그날 네이버 시가총액 순위. 코스피 1~100 대형·101~300 중형·301~ 소형(거래소 규모별 지수 기준),
  코스닥 1~100 K100·101~400 MID·401~ SMALL. 보통주(ETF·ETN·스팩·우선주 제외).
- 60일 신고가: 현재가 ≥ 직전 59거래일 포함 60일 최고 종가 / 신저가: ≤ 60일 최저 종가 (60일 이력 있는 종목만).
- Breadth = (신고가 수 − 신저가 수) ÷ max(신고가 수 + 신저가 수, 10) × 100  (−100 ~ +100, 신고가·신저가 중 어느 쪽이 우세한지. 표본이 10개 미만이면 10으로 나눠 과장을 막음)
- 구간 지수 등락률 = 구간 종목 시가총액 가중 등락률(전일 시총 가중). 종합은 실제 코스피·코스닥 지수 등락률.
- 과거 10거래일 막대는 각 날짜 종가 기준으로 같은 방식으로 계산(오늘은 수집 시점 현재가).

출처: 네이버 증권 시가총액 순위 API(m.stock.naver.com/api/stocks/marketValue), fchart 일봉.
일봉 이력은 Actions 캐시(.sb-cache)에 보관해 하루 첫 실행에만 전 종목을 다시 받습니다.
Output: size_breadth.json(최신), size_breadth_log.csv(실행마다 누적, 삭제하지 않음)
"""
import csv, gzip, json, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Referer': 'https://m.stock.naver.com/'}
CACHE = Path('.sb-cache'); HIST = CACHE / 'hist.json.gz'
OUT, LOG = Path('size_breadth.json'), Path('size_breadth_log.csv')
BUCKETS = {'KOSPI': [('대형', 1, 100), ('중형', 101, 300), ('소형', 301, 10**9)],
           'KOSDAQ': [('K100', 1, 100), ('MID', 101, 400), ('SMALL', 401, 10**9)]}
LOGF = ['ts', 'date', 'market', 'bucket', 'breadth', 'nh', 'nl', 'n', 'idx_chg', 'grade']


def get(url, tries=3, timeout=30):
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                b = r.read()
            try: return b.decode('utf-8')
            except UnicodeDecodeError: return b.decode('euc-kr', 'replace')
        except Exception as e:
            last = e; time.sleep(1.5 * (a + 1))
    raise RuntimeError(str(last)[:120])


def f(x):
    try: return float(str(x).replace(',', ''))
    except Exception: return None


def daily(sym, count):
    t = get(f'https://fchart.stock.naver.com/sise.nhn?symbol={sym}&timeframe=day&count={count}&requestType=0')
    out = []
    for d in re.findall(r'<item data="([^"]+)"', t):
        p = d.split('|')
        if len(p) >= 5 and f(p[4]):
            out.append([f'{p[0][:4]}-{p[0][4:6]}-{p[0][6:8]}', f(p[4])])
    return out


def ranking(mkt):
    rows, page = [], 1
    while True:
        j = json.loads(get(f'https://m.stock.naver.com/api/stocks/marketValue/{mkt}?page={page}&pageSize=100'))
        st = j.get('stocks') or []
        rows += st
        if not st or page * 100 >= int(j.get('totalCount') or 0): break
        page += 1; time.sleep(0.2)
    out = []
    for s in rows:
        name, code = s.get('stockName', ''), s.get('itemCode', '')
        if s.get('stockEndType') != 'stock' or '스팩' in name or 'SPAC' in name.upper(): continue
        if not re.fullmatch(r'[0-9A-Z]{5}0', code): continue  # 보통주만(우선주 코드 끝자리 5·7·K 등 제외)
        px, mv, ch = f(s.get('closePrice')), f(s.get('marketValue')), f(s.get('fluctuationsRatio'))
        if not px or not mv: continue
        out.append(dict(code=code, name=name, price=px, cap=mv, chg=ch or 0.0, at=s.get('localTradedAt', '')))
    out.sort(key=lambda r: -r['cap'])
    for i, r in enumerate(out, 1): r['rank'] = i
    return out


def grade(b):
    return '매우강세' if b >= 50 else '강세' if b >= 15 else '중립' if b > -15 else '약세' if b > -50 else '매우약세'


def stat(members, hist, day, price_of):
    """members: 종목 목록, day: 기준일, price_of(code)->그날 가격."""
    nh = nl = n = 0
    for m in members:
        h = [c for d, c in hist.get(m['code'], []) if d < day][-59:]
        p = price_of(m['code'])
        if p is None or len(h) < 59: continue
        n += 1
        if p >= max(h): nh += 1
        elif p <= min(h): nl += 1
    return dict(n=n, nh=nh, nl=nl, breadth=round((nh - nl) / max(nh + nl, 10) * 100, 1) if n else None)


def main():
    now = datetime.now(KST); today = now.date().isoformat(); ts = now.isoformat(timespec='seconds')
    CACHE.mkdir(exist_ok=True)
    hist = json.loads(gzip.decompress(HIST.read_bytes())) if HIST.exists() else {}
    idx = {m: daily(m, 15) for m in ('KOSPI', 'KOSDAQ')}
    tdays = [d for d, _ in idx['KOSPI']]
    live_day = tdays[-1]  # 오늘(장중 포함) 또는 마지막 거래일
    prev_day = tdays[-2]
    rank = {m: ranking(m) for m in BUCKETS}
    codes = sorted({r['code'] for m in rank for r in rank[m]})
    stale = [c for c in codes if not hist.get(c) or hist[c][-1][0] < prev_day]
    print('stocks', len(codes), 'refetch', len(stale), flush=True)

    def one(c):
        try: return c, daily(c, 80)
        except Exception: return c, None
    with ThreadPoolExecutor(8) as pool:
        for c, s in pool.map(one, stale):
            if s: hist[c] = s
    # 오늘 값은 시총 순위 API의 현재가로 덮어씀(장중 실시간)
    for m in rank:
        for r in rank[m]:
            h = [x for x in hist.get(r['code'], []) if x[0] < live_day]
            hist[r['code']] = (h + [[live_day, r['price']]])[-90:]
    HIST.write_bytes(gzip.compress(json.dumps(hist, separators=(',', ':')).encode()))

    res = dict(updated_at=ts, live_day=live_day, markets={})
    log_rows = []
    days10 = tdays[-10:]
    for m, bks in BUCKETS.items():
        R = rank[m]
        ich = round((idx[m][-1][1] / idx[m][-2][1] - 1) * 100, 2)
        def price_on(day):
            return lambda c: next((x[1] for x in hist.get(c, []) if x[0] == day), None)
        def bucket_members(lo, hi): return [r for r in R if lo <= r['rank'] <= hi]
        groups = [('종합', R)] + [(nm, bucket_members(lo, hi)) for nm, lo, hi in bks]
        mk = dict(index_chg=ich, index=idx[m][-1][1], buckets=[])
        for nm, mem in groups:
            cur = stat(mem, hist, live_day, price_on(live_day))
            trend = []
            for d in days10:
                s = cur if d == live_day else stat(mem, hist, d, price_on(d))
                trend.append(dict(date=d, breadth=s['breadth']))
            if nm == '종합': chg = ich
            else:
                w = sum(r['cap'] / (1 + r['chg'] / 100) for r in mem)
                chg = round(sum(r['cap'] / (1 + r['chg'] / 100) * r['chg'] for r in mem) / w, 2) if w else None
            g = grade(cur['breadth']) if cur['breadth'] is not None else None
            badge = None
            if cur['breadth'] is not None and chg is not None:
                if chg > 0 and cur['breadth'] <= -15: badge = '쏠림 랠리'
                elif chg < 0 and cur['breadth'] >= 15: badge = '저가매수 유입'
            mk['buckets'].append(dict(name=nm, idx_chg=chg, grade=g, badge=badge, members=len(mem), trend=trend, **cur))
            log_rows.append(dict(ts=ts, date=live_day, market=m, bucket=nm, breadth=cur['breadth'], nh=cur['nh'], nl=cur['nl'], n=cur['n'], idx_chg=chg, grade=g))
        res['markets'][m] = mk
    OUT.write_text(json.dumps(res, ensure_ascii=False, separators=(',', ':')))
    new = not LOG.exists()
    with LOG.open('a', encoding='utf-8', newline='') as fh:
        w = csv.DictWriter(fh, fieldnames=LOGF)
        if new: w.writeheader()
        w.writerows(log_rows)
    for m in res['markets']:
        print(m, [(b['name'], b['breadth'], b['grade'], b['idx_chg'], b['badge']) for b in res['markets'][m]['buckets']])


if __name__ == '__main__':
    main()
