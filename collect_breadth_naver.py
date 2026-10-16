"""한국 시장폭(Breadth) 수집: 코스피·코스닥 전 종목 종가로 계산.

- 종목 목록: KIND 상장법인목록(시장별, 스팩 제외)
- 종가: 네이버 fchart 일봉(최근 약 600거래일)
- 계산(종가 기준, 시장별):
    breadth60 = 종가가 60일 이동평균보다 높은 종목 비율(%)   (60일 이상 거래 이력 종목 대상)
    nh / nl   = 종가가 최근 250거래일(52주) 최고 / 최저인 종목 수 (250일 이상 이력 종목 대상)
    hli       = 신고가 비율 = nh / (nh + nl) × 100      (둘 다 0이면 공란)
  5일·10일 이동평균은 화면에서 계산합니다.
- 주의: 현재 상장 종목만으로 과거를 계산하므로 그 사이 상장폐지된 종목은 빠져 있습니다(생존 편향).
Output: breadth_kr.csv (date,market,n60,above60,breadth60,n250,nh,nl,hli), breadth_naver_status.json
KRX 키 기반 collect_breadth.py(breadth_daily.json)가 비어 있는 동안 화면의 대체 자료로 쓰입니다.
"""
import csv, json, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

KST = timezone(timedelta(hours=9))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}
COUNT = 620


def get(url, timeout=30, tries=3):
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            last = e; time.sleep(2 * (a + 1))
    raise RuntimeError(str(last)[:120])


class Table(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows, self.row, self.cell, self.on = [], None, [], False
    def handle_starttag(self, t, a):
        if t == 'tr': self.row = []
        elif t in ('td', 'th') and self.row is not None: self.on, self.cell = True, []
    def handle_endtag(self, t):
        if t in ('td', 'th') and self.on: self.row.append(''.join(self.cell).strip()); self.on = False
        elif t == 'tr' and self.row is not None: self.rows.append(self.row); self.row = None
    def handle_data(self, d):
        if self.on: self.cell.append(d)


def listing(mkt):
    html = get(f'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&marketType={mkt}', 60).decode('euc-kr', 'replace')
    p = Table(); p.feed(html)
    head = p.rows[0]; i_name, i_code = head.index('회사명'), head.index('종목코드')
    out = []
    for r in p.rows[1:]:
        if len(r) <= i_code: continue
        code, name = r[i_code].strip().zfill(6), r[i_name]
        if re.fullmatch(r'[0-9A-Z]{6}', code) and '스팩' not in name and 'SPAC' not in name.upper():
            out.append((code, name))
    return out


def closes(code, with_volumes=False):
    t = get(f'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count={COUNT}&requestType=0').decode('euc-kr', 'replace')
    out, volumes = {}, {}
    for m in re.finditer(r'data="(\d{8})\|[^|]*\|[^|]*\|[^|]*\|([0-9.]+)\|(\d+)"', t):
        d, c = m.group(1), float(m.group(2))
        if c > 0:
            day = f'{d[:4]}-{d[4:6]}-{d[6:]}'
            out[day] = c
            volumes[day] = int(m.group(3))
    return (out, volumes) if with_volumes else out


def compute(series, dates):
    import pandas as pd
    df = pd.DataFrame({i: pd.Series(x) for i, x in enumerate(series)}).reindex(dates)
    sma = df.rolling(60, min_periods=55).mean()
    v60 = df.notna() & sma.notna()
    n60 = v60.sum(axis=1); up = ((df > sma) & v60).sum(axis=1)
    hi = df.rolling(250, min_periods=230).max(); lo = df.rolling(250, min_periods=230).min()
    v250 = df.notna() & hi.notna()
    n250 = v250.sum(axis=1); nh = ((df >= hi) & v250).sum(axis=1); nl = ((df <= lo) & v250 & ~(df >= hi)).sum(axis=1)
    rows = []
    for d in dates:
        if n60[d] < 50: continue
        k = int(n250[d])
        rows.append(dict(date=d, n60=int(n60[d]), above60=int(up[d]), breadth60=round(float(up[d] / n60[d] * 100), 2), n250=k or '',
                         nh=int(nh[d]) if k else '', nl=int(nl[d]) if k else '',
                         hli=round(float(nh[d] / (nh[d] + nl[d]) * 100), 2) if k and nh[d] + nl[d] else ''))
    return rows


def compute_db_proxy(series, dates, volume_series=None):
    """DB 화면에서 추론한 별도 지표. DB 원본 산식·모집단은 미확인."""
    import pandas as pd
    df = pd.DataFrame({i: pd.Series(x) for i, x in enumerate(series)}).reindex(dates)
    hi = df.rolling(60, min_periods=60).max()
    lo = df.rolling(60, min_periods=60).min()
    valid = df.notna() & hi.notna()
    if volume_series is not None:
        volumes = pd.DataFrame({i: pd.Series(x) for i, x in enumerate(volume_series)}).reindex(dates)
        valid &= volumes.gt(0)  # 거래정지·무거래 종목의 고정 종가를 신고가로 세지 않음
    high = (df >= hi) & valid
    low = (df <= lo) & valid & ~high  # 정체 종목을 이중 집계하지 않음
    nh, nl, n = high.sum(axis=1), low.sum(axis=1), valid.sum(axis=1)
    breadth = (nh - nl).where(n >= 50)
    hli = (100 * nh / (nh + nl).replace(0, float('nan'))).where(n >= 50)
    sma5, sma10 = breadth.rolling(5, min_periods=5).mean(), hli.rolling(10, min_periods=10).mean()
    def number(x):
        return round(float(x), 2) if pd.notna(x) else None
    return [dict(date=d, n=int(n[d]), nh60=int(nh[d]), nl60=int(nl[d]),
                 breadth60=int(breadth[d]), breadth5sma=number(sma5[d]),
                 hli=number(hli[d]), hli10sma=number(sma10[d]))
            for d in dates if pd.notna(breadth[d])]


def main():
    fails, out, info, proxy = [], [], {}, {}
    for mkt, name in (('stockMkt', 'KOSPI'), ('kosdaqMkt', 'KOSDAQ')):
        lst = listing(mkt)
        res, volumes = {}, {}
        def one(cn):
            try:
                prices, volume = closes(cn[0], with_volumes=True)
                return cn[0], prices, volume
            except Exception as e: fails.append(dict(code=cn[0], error=str(e)[:80])); return cn[0], {}, {}
        with ThreadPoolExecutor(6) as pool:
            for code, s, v in pool.map(one, lst):
                res[code], volumes[code] = s, v
        codes = [code for code, s in res.items() if len(s) >= 20]
        series = [res[code] for code in codes]
        cnt = {}
        for s in series:
            for d in s: cnt[d] = cnt.get(d, 0) + 1
        dates = sorted(d for d, k in cnt.items() if k >= len(series) * 0.5)  # 거래일만
        rows = compute(series, dates)
        proxy[name] = compute_db_proxy(series, dates, [volumes[code] for code in codes])
        if len(series) < len(lst) * 0.95 or not rows or not proxy[name]:
            raise RuntimeError(f'{name}: insufficient coverage; keep existing output')
        for r in rows: r['market'] = name
        out += rows
        info[name] = dict(listed=len(lst), with_prices=len(series), first=rows[0]['date'] if rows else None, last=rows[-1]['date'] if rows else None)
        print(name, info[name], flush=True)
    if not out:
        raise SystemExit('no breadth rows')
    proxy_path = Path('breadth_db_proxy.json')
    old = json.loads(proxy_path.read_text()) if proxy_path.exists() else {}
    for market, rows in proxy.items():
        existing = {r['date']: r for r in old.get('markets', {}).get(market, [])}
        if existing and rows[-1]['date'] < max(existing):
            raise RuntimeError(f'{market}: stale response; keep existing output')
        existing.update({r['date']: r for r in rows})
        proxy[market] = sorted(existing.values(), key=lambda r: r['date'])
    comparisons = []
    snapshots = Path('breadth_external_snapshots.json')
    if snapshots.exists():
        for snapshot in json.loads(snapshots.read_text()).get('snapshots', []):
            day = snapshot['captured_at'][:10]
            for observed in snapshot['markets']:
                calculated = next((r for r in proxy.get(observed['market'], []) if r['date'] == day), None)
                if calculated:
                    comparisons.append(dict(date=day, market=observed['market'],
                        differences={k: round(calculated[k] - observed[k], 2)
                            for k in ('breadth60', 'breadth5sma', 'hli', 'hli10sma')
                            if calculated.get(k) is not None and observed.get(k) is not None}))
    proxy_path.write_text(json.dumps(dict(updated_at=datetime.now(KST).isoformat(timespec='seconds'),
        method='추정: 60일 종가 신고가 수−신저가 수; HLI=신고가 수/(신고가 수+신저가 수)*100; 당일 거래량 0 제외',
        verified_db_method=False, markets=proxy, snapshot_comparisons=comparisons), ensure_ascii=False, indent=1))
    with Path('breadth_kr.csv').open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['date', 'market', 'n60', 'above60', 'breadth60', 'n250', 'nh', 'nl', 'hli']); w.writeheader()
        w.writerows(sorted(out, key=lambda r: (r['market'], r['date'])))
    Path('breadth_naver_status.json').write_text(json.dumps(dict(updated_at=datetime.now(KST).isoformat(timespec='seconds'), markets=info,
        failures=len(fails), failure_sample=fails[:10]), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()

