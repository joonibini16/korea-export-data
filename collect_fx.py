"""Monthly average exchange rates: KRW/USD (원/달러) and TWD/USD (대만달러/달러).

Source: FRED DEXKOUS (daily noon buying rate, KRW per USD). Monthly value = mean of
available business days in the month. Months with fewer than 10 observations are
marked partial (current month). Output: fx_krw_usd.csv
"""
import csv, urllib.request, statistics, datetime
from collections import defaultdict
from pathlib import Path

SERIES = [('DEXKOUS', 'fx_krw_usd.csv', 'krw_per_usd'), ('DEXTAUS', 'fx_twd_usd.csv', 'twd_per_usd')]

def main():
    for sid, out, col in SERIES:
        one(sid, Path(out), col)

def one(sid, OUT, col):
    URL = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd=2015-01-01'
    with urllib.request.urlopen(URL, timeout=60) as r:
        text = r.read().decode('utf-8')
    by = defaultdict(list)
    for row in list(csv.reader(text.splitlines()))[1:]:
        if len(row) == 2 and row[1] not in ('', '.'):
            by[row[0][:4] + '.' + row[0][5:7]].append(float(row[1]))
    if not by:
        raise SystemExit('no FX data')
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['month', col, 'days', 'status', 'source'])
        for m in sorted(by):
            v = by[m]
            w.writerow([m, f'{statistics.mean(v):.2f}', len(v), '확정' if len(v) >= 15 else '부분(월중)', f'FRED {sid} 일별 평균'])
    print(sid, 'months', len(by), 'last', max(by))

if __name__ == '__main__':
    main()
