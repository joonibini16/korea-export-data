"""테마 ETF 보드 수집: ETF 일별 종가(약 6개월) + 상위 구성종목과 그 종목들의 당일 등락률.

- 가격: 네이버 fchart(sise.nhn, 일봉 XML)
- 구성종목: 네이버 증권 ETF 분석(m.stock.naver.com/api/stock/{code}/etfAnalysis)의 상위 10종목
실패한 ETF는 직전 파일 값을 유지하고 status에 기록합니다.
Output: etf_board.json
"""
import json, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Referer': 'https://m.stock.naver.com/'}
OUT = Path('etf_board.json')


def get(url, tries=3):
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                b = r.read()
            try:
                return b.decode('utf-8')
            except UnicodeDecodeError:
                return b.decode('euc-kr', 'replace')
        except Exception as e:
            last = e; time.sleep(1.5 * (a + 1))
    raise RuntimeError(str(last)[:120])


def daily(code, count):
    t = get(f'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count={count}&requestType=0')
    rows = []
    for d in re.findall(r'<item data="([^"]+)"', t):
        f = d.split('|')
        if len(f) >= 5 and f[4] not in ('', 'null'):
            rows.append([f'{f[0][:4]}-{f[0][4:6]}-{f[0][6:8]}', float(f[4])])
    if not rows:
        raise RuntimeError('no price rows')
    return rows


def chg(rows):
    return round((rows[-1][1] / rows[-2][1] - 1) * 100, 2) if len(rows) >= 2 and rows[-2][1] else None


def holdings(code):
    j = json.loads(get(f'https://m.stock.naver.com/api/stock/{code}/etfAnalysis'))
    out = []
    for h in j.get('etfTop10MajorConstituentAssets') or []:
        w = str(h.get('etfWeight') or '').replace('%', '').replace(',', '')
        out.append(dict(code=h.get('itemCode') or '', name=h.get('itemName') or '', weight=float(w) if re.fullmatch(r'-?\d+(\.\d+)?', w) else None))
    return out, dict(nav=j.get('nav'), market_value=j.get('marketValue'), base_index=j.get('etfBaseIndex'), issuer=j.get('issuerName'),
                     ret_1m=next((x['value'] for x in j.get('returnPerformanceList') or [] if x.get('periodTypeCode') == 'M1'), None),
                     ret_3m=next((x['value'] for x in j.get('returnPerformanceList') or [] if x.get('periodTypeCode') == 'M3'), None),
                     ret_6m=next((x['value'] for x in j.get('returnPerformanceList') or [] if x.get('periodTypeCode') == 'M6'), None),
                     ret_ytd=next((x['value'] for x in j.get('returnPerformanceList') or [] if x.get('periodTypeCode') == 'YTD'), None),
                     flow_1m=(j.get('cumulativeNetInflowList') or {}).get('cumulativeNetInflow1m'))


def main():
    cfg = json.loads(Path('etf_watchlist.json').read_text())
    n = int(cfg.get('spark_days', 120)) + 1
    old = {e['code']: e for e in json.loads(OUT.read_text()).get('etfs', [])} if OUT.exists() else {}
    fails, etfs = [], []

    def job(e):
        try:
            px = daily(e['code'], n)
            hs, info = holdings(e['code'])
            return dict(code=e['code'], name=e['name'], closes=px, chg=chg(px), holdings=hs, info=info), None
        except Exception as ex:
            return None, dict(code=e['code'], name=e['name'], error=str(ex)[:120])

    with ThreadPoolExecutor(4) as pool:
        res = list(pool.map(job, cfg['etfs']))
    for e, (r, f) in zip(cfg['etfs'], res):
        if f:
            fails.append(f)
            if e['code'] in old:
                etfs.append(dict(old[e['code']], stale=True))
            continue
        etfs.append(r)
    # 구성종목 당일 등락률(6자리 국내 종목만)
    codes = sorted({h['code'] for e in etfs for h in e['holdings'][:10] if re.fullmatch(r'[0-9A-Z]{6}', h['code'] or '')})
    def sj(c):
        try:
            px = daily(c, 3); return c, dict(chg=chg(px), date=px[-1][0], close=px[-1][1])
        except Exception:
            return c, None
    with ThreadPoolExecutor(6) as pool:
        stock = dict(pool.map(sj, codes))
    for e in etfs:
        for h in e['holdings']:
            s = stock.get(h['code'])
            if s:
                h.update(s)
    asof = max((e['closes'][-1][0] for e in etfs if e.get('closes')), default=None)
    now = datetime.now(KST).isoformat(timespec='seconds')
    OUT.write_text(json.dumps(dict(updated_at=now, asof=asof, spark_days=n - 1, etfs=etfs, failures=fails,
                                   source=['https://fchart.stock.naver.com/sise.nhn', 'https://m.stock.naver.com/api/stock/{code}/etfAnalysis']),
                              ensure_ascii=False, separators=(',', ':')))
    print('etfs', len(etfs), 'fails', len(fails), 'stocks', len(stock), 'asof', asof)
    if not etfs:
        raise SystemExit('no etf data')


if __name__ == '__main__':
    main()
