"""Taiwan listed-company monthly revenue collector (MOPS 每月營收彙總表).

Source: MOPS monthly revenue summary pages, one per market / ROC year / month:
  https://mopsov.twse.com.tw/nas/t21/{sii|otc}/t21sc03_{rocYear}_{month}_{0|1}.html
  (_0 = domestic-incorporated, _1 = foreign-incorporated "KY" companies)
Amounts are NT$ thousand as published. Only companies in taiwan_watchlist.json
are stored. Values are kept as published; nothing is interpolated or zero-filled.

Usage:
  python collect_taiwan_revenue.py            # backfill missing months + refresh recent 3
  python collect_taiwan_revenue.py --full     # re-download every month from start_month (2015.01)
"""
import csv
import json
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

KST = timezone(timedelta(hours=9))
HOSTS = ['https://mopsov.twse.com.tw', 'https://mops.twse.com.tw']
OUT = Path('taiwan_monthly_revenue.csv')
STATUS = Path('taiwan_revenue_status.json')
WATCH = Path('taiwan_watchlist.json')
FIELDS = ['month', 'company_id', 'name_local', 'market', 'revenue_kNTD', 'prev_month_kNTD',
          'prev_year_kNTD', 'mom_pct', 'yoy_pct', 'cum_kNTD', 'prev_cum_kNTD', 'cum_yoy_pct',
          'note', 'source', 'retrieved_at']
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
}


class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell, self.in_cell = [], None, [], False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.in_cell, self.cell = True, []

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.row is not None and self.in_cell:
            self.row.append(''.join(self.cell).strip())
            self.in_cell = False
        elif tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.in_cell:
            self.cell.append(data.replace('\xa0', ' '))


def clean_num(v):
    v = (v or '').strip().replace(',', '')
    if v in ('', '-', '--', 'N/A'):
        return ''
    try:
        float(v)
    except ValueError:
        return ''
    return v


def fetch(market, year, month, kind):
    roc = year - 1911
    path = f'/nas/t21/{market}/t21sc03_{roc}_{month}_{kind}.html'
    last = None
    for host in HOSTS:
        url = host + path
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=40) as r:
                    raw = r.read()
                for enc in ('cp950', 'big5hkscs', 'utf-8'):
                    try:
                        return raw.decode(enc), url
                    except UnicodeDecodeError:
                        continue
                return raw.decode('cp950', errors='replace'), url
            except urllib.error.HTTPError as e:
                last = f'HTTP_{e.code} {url}'
                if e.code == 404:
                    break
            except Exception as e:  # network / timeout
                last = f'{type(e).__name__} {url}: {e}'
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(last or 'fetch failed')


def parse(html, wanted):
    p = Rows()
    p.feed(html)
    found = {}
    for r in p.rows:
        if len(r) < 10 or not re.fullmatch(r'\d{4,6}[A-Z]?', r[0]):
            continue
        if r[0] not in wanted:
            continue
        found[r[0]] = {
            'name_local': r[1], 'revenue_kNTD': clean_num(r[2]), 'prev_month_kNTD': clean_num(r[3]),
            'prev_year_kNTD': clean_num(r[4]), 'mom_pct': clean_num(r[5]), 'yoy_pct': clean_num(r[6]),
            'cum_kNTD': clean_num(r[7]), 'prev_cum_kNTD': clean_num(r[8]), 'cum_yoy_pct': clean_num(r[9]),
            'note': (r[10] if len(r) > 10 else '').strip()[:200],
        }
    return found


def months(start, end):
    y, m = start
    while (y, m) <= end:
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def main():
    full = '--full' in sys.argv
    watch = json.loads(WATCH.read_text(encoding='utf-8'))
    companies = {c['id']: c for c in watch['companies']}
    sy, sm = map(int, watch.get('start_month', '2015.01').split('.'))
    now = datetime.now(KST)
    # month M is due by day 10 of M+1; collect through previous month
    ly, lm = (now.year, now.month - 1) if now.month > 1 else (now.year - 1, 12)

    existing = {}
    if OUT.exists():
        with OUT.open(encoding='utf-8-sig', newline='') as f:
            for r in csv.DictReader(f):
                existing[(r['month'], r['company_id'])] = r

    all_months = list(months((sy, sm), (ly, lm)))
    recent = set(all_months[-3:])
    stamp = now.strftime('%Y-%m-%dT%H:%M:%S%z')
    failures, fetched_months = [], 0

    for y, m in all_months:
        label = f'{y}.{m:02d}'
        have = {cid for (mo, cid) in existing if mo == label}
        # past months are fetched once; later-listed companies stay absent there
        if not full and (y, m) not in recent and have:
            continue
        for market in sorted({c['market'] for c in companies.values()}):
            wanted = {cid for cid, c in companies.items() if c['market'] == market}
            got = {}
            for kind in (0, 1):
                try:
                    html, url = fetch(market, y, m, kind)
                except RuntimeError as e:
                    if kind == 0:
                        failures.append({'month': label, 'market': market, 'error': str(e)})
                    continue
                for cid, row in parse(html, wanted - set(got)).items():
                    row['source'] = url
                    got[cid] = row
                time.sleep(1.2)
            for cid, row in got.items():
                existing[(label, cid)] = {'month': label, 'company_id': cid, 'market': market,
                                          'retrieved_at': stamp, **row}
            missing = wanted - set(got)
            # companies listed later than start_month are simply absent in early months
            if missing and (y, m) in recent and not any(f['month'] == label and f['market'] == market for f in failures):
                failures.append({'month': label, 'market': market,
                                 'error': 'NOT_IN_TABLE ' + ','.join(sorted(missing))})
        fetched_months += 1

    rows = sorted(existing.values(), key=lambda r: (r['company_id'], r['month']))
    with OUT.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)

    coverage = []
    for cid, c in companies.items():
        ms = sorted(r['month'] for r in rows if r['company_id'] == cid and r.get('revenue_kNTD'))
        expected = [f'{y}.{m:02d}' for y, m in all_months if ms and f'{y}.{m:02d}' >= ms[0]]
        coverage.append({'company_id': cid, 'name': c['name'], 'months': len(ms), 'expected': len(expected),
                         'first': ms[0] if ms else None, 'last': ms[-1] if ms else None,
                         'missing': [x for x in expected if x not in ms][:24]})
    STATUS.write_text(json.dumps({'updated_at': stamp, 'range': [f'{sy}.{sm:02d}', f'{ly}.{lm:02d}'],
                                  'months_fetched_this_run': fetched_months, 'failures': failures,
                                  'coverage': coverage}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'rows={len(rows)} fetched_months={fetched_months} failures={len(failures)}')
    # fail only when nothing could be fetched for the latest due month
    latest = f'{ly}.{lm:02d}'
    if not any(r['month'] == latest for r in rows) and now.day >= 11:
        print('latest month missing after due date', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
