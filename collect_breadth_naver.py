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


def closes(code):
    t = get(f'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count={COUNT}&requestType=0').decode('euc-kr', 'replace')
    out = {}
    for m in re.finditer(r'data="(\d{8})\|[^|]*\|[^|]*\|[^|]*\|([0-9.]+)\|(\d+)"', t):
        d, c = m.group(1), float(m.group(2))
        if c > 0: out[f'{d[:4]}-{d[4:6]}-{d[6:]}'] = c
    return out


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


def main():
    fails, out, info = [], [], {}
    for mkt, name in (('stockMkt', 'KOSPI'), ('kosdaqMkt', 'KOSDAQ')):
        lst = listing(mkt)
        res = {}
        def one(cn):
            try: return cn[0], closes(cn[0])
            except Exception as e: fails.append(dict(code=cn[0], error=str(e)[:80])); return cn[0], {}
        with ThreadPoolExecutor(6) as pool:
            for code, s in pool.map(one, lst): res[code] = s
        series = [s for s in res.values() if len(s) >= 20]
        cnt = {}
        for s in series:
            for d in s: cnt[d] = cnt.get(d, 0) + 1
        dates = sorted(d for d, k in cnt.items() if k >= len(series) * 0.5)  # 거래일만
        rows = compute(series, dates)
        for r in rows: r['market'] = name
        out += rows
        info[name] = dict(listed=len(lst), with_prices=len(series), first=rows[0]['date'] if rows else None, last=rows[-1]['date'] if rows else None)
        print(name, info[name], flush=True)
    if not out:
        raise SystemExit('no breadth rows')
    with Path('breadth_kr.csv').open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['date', 'market', 'n60', 'above60', 'breadth60', 'n250', 'nh', 'nl', 'hli']); w.writeheader()
        w.writerows(sorted(out, key=lambda r: (r['market'], r['date'])))
    Path('breadth_naver_status.json').write_text(json.dumps(dict(updated_at=datetime.now(KST).isoformat(timespec='seconds'), markets=info,
        failures=len(fails), failure_sample=fails[:10]), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
