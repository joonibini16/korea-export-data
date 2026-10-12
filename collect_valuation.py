"""Monthly adjusted close, shares outstanding and Naver EPS/net-income consensus snapshots for FPER bands.

- Prices: Naver chart (fchart.stock.naver.com, monthly, split-adjusted close) → stock_prices_monthly.csv
- Shares: market cap ÷ price from m.stock.naver.com/api/stock/{code}/integration → stock_shares.csv
- Consensus: m.stock.naver.com/api/stock/{code}/finance/annual|quarter (isConsensus=Y) → appended dated
  snapshots in valuation_consensus.csv so point-in-time consensus accumulates from the first run on.
Amounts: EPS 원, net income 억원.
"""
import csv, json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

KST = timezone(timedelta(hours=9))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'Referer': 'https://m.stock.naver.com/'}
PRICES, SHARES, CONS, STATUS = Path('stock_prices_monthly.csv'), Path('stock_shares.csv'), Path('valuation_consensus.csv'), Path('valuation_status.json')
CFIELDS = ['snapshot_date', 'company_id', 'freq', 'period', 'is_estimate', 'eps', 'net_income_100m', 'ctrl_net_income_100m', 'source']


def get(url, enc='utf-8'):
    last = None
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read().decode(enc, 'replace')
        except Exception as e:
            last = e; time.sleep(2 * (a + 1))
    raise RuntimeError(f'{url}: {last}')


def n(v):
    v = (v or '').replace(',', '').strip()
    return v if re.fullmatch(r'-?\d+(\.\d+)?', v) else ''


def prices(code):
    t = get(f'https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=month&count=120&requestType=0', 'euc-kr')
    out = []
    for d in re.findall(r'data="([^"]+)"', t):
        f = d.split('|')
        out.append(dict(company_id=code, month=f[0][:4] + '.' + f[0][4:6], date=f[0], close=f[4]))
    return out


def shares(code):
    j = json.loads(get(f'https://m.stock.naver.com/api/stock/{code}/integration'))
    info = {x.get('code'): x.get('value', '') for x in j.get('totalInfos', [])}
    mv = info.get('marketValue', '')
    won = 0
    for amt, unit in re.findall(r'([\d,]+)\s*(조|억)', mv):
        won += int(amt.replace(',', '')) * (10**12 if unit == '조' else 10**8)
    price = int(n(info.get('lastClosePrice', '')) or 0) or None
    if not won or not price:
        raise ValueError('시가총액/주가 없음: ' + mv)
    return dict(company_id=code, shares=round(won / price), market_cap_100m=round(won / 1e8), price=price, as_of=datetime.now(KST).date().isoformat())


def consensus(code, today):
    rows = []
    for freq in ('annual', 'quarter'):
        url = f'https://m.stock.naver.com/api/stock/{code}/finance/{freq}'
        j = json.loads(get(url))['financeInfo']
        titles = {t['key']: t for t in j['trTitleList']}
        rl = {r['title']: r['columns'] for r in j['rowList']}
        for key, t in titles.items():
            y, m = key[:4], int(key[4:6])
            period = y if freq == 'annual' else f'{y}-Q{(m + 2) // 3}'
            g = lambda name: n((rl.get(name, {}).get(key) or {}).get('value'))
            rows.append(dict(snapshot_date=today, company_id=code, freq=freq, period=period, is_estimate='1' if t['isConsensus'] == 'Y' else '0',
                             eps=g('EPS'), net_income_100m=g('당기순이익'), ctrl_net_income_100m=g('지배주주순이익'), source=url))
    return rows


def main():
    watch = [c['id'] for c in json.loads(Path('company_watchlist.json').read_text())['companies'] if c['id'].isdigit()]
    today = datetime.now(KST).date().isoformat()
    P, S, C, fails = [], [], [], []
    def job(code):
        res = {}
        for name, fn in (('prices', lambda: prices(code)), ('shares', lambda: shares(code)), ('cons', lambda: consensus(code, today))):
            try: res[name] = fn()
            except Exception as e: fails.append(dict(company_id=code, step=name, error=str(e)[:200]))
            time.sleep(0.3)
        return res
    with ThreadPoolExecutor(4) as pool:
        for r in pool.map(job, watch):
            P += r.get('prices', []); C += r.get('cons', [])
            if r.get('shares'): S.append(r['shares'])
    if P:
        got = {p['company_id'] for p in P}
        old = [r for r in csv.DictReader(PRICES.open(encoding='utf-8'))] if PRICES.exists() else []
        keep = [r for r in old if r['company_id'] not in got]
        with PRICES.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['company_id', 'month', 'date', 'close']); w.writeheader()
            w.writerows(sorted(keep + P, key=lambda r: (r['company_id'], r['month'])))
    if S:
        got = {s['company_id'] for s in S}
        old = [r for r in csv.DictReader(SHARES.open(encoding='utf-8'))] if SHARES.exists() else []
        with SHARES.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['company_id', 'shares', 'market_cap_100m', 'price', 'as_of']); w.writeheader()
            w.writerows(sorted([r for r in old if r['company_id'] not in got] + S, key=lambda r: r['company_id']))
    if C:
        old = [r for r in csv.DictReader(CONS.open(encoding='utf-8'))] if CONS.exists() else []
        old = [r for r in old if r['snapshot_date'] != today]
        with CONS.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=CFIELDS); w.writeheader()
            w.writerows(sorted(old + C, key=lambda r: (r['snapshot_date'], r['company_id'], r['freq'], r['period'])))
    STATUS.write_text(json.dumps(dict(updated_at=datetime.now(KST).isoformat(timespec='seconds'), companies=len(watch), price_rows=len(P), shares=len(S), consensus_rows=len(C), failures=fails), ensure_ascii=False, indent=1))
    print('prices', len(P), 'shares', len(S), 'cons', len(C), 'fails', len(fails))
    if not P:
        sys.exit(1)


if __name__ == '__main__':
    main()
