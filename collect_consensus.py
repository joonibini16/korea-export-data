"""Naver Finance '기업실적분석' snapshot: quarterly 매출액/영업이익 actuals and (E) consensus.

Source: Naver Pay 증권 quarterly finance data used by its stock pages
(https://m.stock.naver.com/api/stock/XXXXXX/finance/quarter; columns flagged isConsensus=Y
are consensus estimates). Falls back to the legacy finance.naver.com table. Amounts in 억원.
Each run appends a dated snapshot so consensus revisions can be traced.
Unofficial page: if its layout changes, parsing fails loudly and existing data is kept.
"""
import csv, json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from lxml import html

KST = timezone(timedelta(hours=9))
OUT = Path('naver_consensus.csv')
STATUS = Path('naver_consensus_status.json')
FIELDS = ['snapshot_date', 'company_id', 'period', 'is_estimate', 'revenue_100m', 'operating_profit_100m', 'source']
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9'}


def fetch(code):
    url = f'https://finance.naver.com/item/main.naver?code={code}'
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    for enc in ('euc-kr', 'cp949', 'utf-8'):
        try:
            return raw.decode(enc), url
        except UnicodeDecodeError:
            pass
    return raw.decode('cp949', errors='replace'), url


def txt(e):
    return ' '.join(''.join(e.itertext()).split())


def num(s):
    s = s.replace(',', '').strip()
    return s if re.fullmatch(r'-?\d+(\.\d+)?', s) else ''


def parse(page):
    doc = html.fromstring(page)
    table = None
    for t in doc.xpath('//table'):
        if '매출액' in txt(t) and '최근 분기 실적' in txt(t):
            table = t
            break
    if table is None:
        heads = [txt(t)[:60] for t in doc.xpath('//table')][:12]
        raise ValueError(f'기업실적분석 표 없음 (page {len(page)}B, title {txt(doc.xpath("//title")[0]) if doc.xpath("//title") else "-"}, tables {heads})')
    head_rows = table.xpath('.//thead/tr')
    nq = 6
    for th in head_rows[0].xpath('./th'):
        if '분기' in txt(th):
            nq = int(th.get('colspan') or 6)
    labels = [txt(th) for th in head_rows[1].xpath('./th')]
    qlabels = labels[-nq:]
    def row(name):
        for tr in table.xpath('.//tbody/tr'):
            th = tr.xpath('./th')
            if th and txt(th[0]).replace(' ', '') == name:
                return [txt(td) for td in tr.xpath('./td')]
        return None
    rev, op = row('매출액'), row('영업이익')
    if not rev:
        raise ValueError('매출액 행 없음')
    rev, op = rev[-nq:], (op or [''] * len(rev))[-nq:]
    out = []
    for lab, r, o in zip(qlabels, rev, op):
        m = re.search(r'(20\d{2})\.(\d{2})', lab)
        if not m:
            continue
        period = f'{m[1]}-Q{int(m[2]) // 3}'
        out.append(dict(period=period, is_estimate='1' if '(E)' in lab else '0', revenue_100m=num(r), operating_profit_100m=num(o)))
    if not out:
        raise ValueError('분기 열 해석 실패: ' + '|'.join(labels))
    return out


def from_api(code):
    url = f'https://m.stock.naver.com/api/stock/{code}/finance/quarter'
    req = urllib.request.Request(url, headers={**UA, 'Accept': 'application/json', 'Referer': f'https://m.stock.naver.com/domestic/stock/{code}/finance/quarter'})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode('utf-8'))
    fi = d.get('financeInfo') or d
    cols = fi.get('trTitleList') or []
    rows = {re.sub(r'\s', '', x.get('title', '')): x.get('columns', {}) for x in fi.get('rowList') or []}
    rev, op = rows.get('매출액'), rows.get('영업이익')
    if not cols or rev is None:
        raise ValueError('API 구조 확인 필요: keys=' + ','.join(list(fi.keys())[:10]) + ' rows=' + ','.join(list(rows)[:8]))
    out = []
    for c in cols:
        key, title = str(c.get('key', '')), c.get('title', '')
        m = re.search(r'(20\d{2})\.?(\d{2})', key + ' ' + title)
        if not m:
            continue
        val = lambda col: num(str((col or {}).get(key, {}).get('value', '')))
        out.append(dict(period=f'{m[1]}-Q{int(m[2]) // 3}', is_estimate='1' if str(c.get('isConsensus', 'N')).upper() == 'Y' else '0',
                        revenue_100m=val(rev), operating_profit_100m=val(op)))
    if not out:
        raise ValueError('분기 열 없음')
    return out, f'https://m.stock.naver.com/domestic/stock/{code}/finance/quarter'


def main():
    watch = json.loads(Path('company_watchlist.json').read_text(encoding='utf-8'))['companies']
    ids = [c['id'] for c in watch if c['id'].isdigit()]
    if len(sys.argv) > 1:
        ids = [i for i in ids if i in sys.argv[1:]]
    today = datetime.now(KST).strftime('%Y-%m-%d')
    rows, failures = [], []
    for code in ids:
        try:
            try:
                parsed, url = from_api(code)
            except Exception as api_error:
                page, url = fetch(code)
                try:
                    parsed = parse(page)
                except Exception as e:
                    raise ValueError(f'API: {api_error} / 페이지: {e}')
            for r in parsed:
                rows.append(dict(snapshot_date=today, company_id=code, source=url, **r))
        except Exception as e:
            failures.append(dict(company_id=code, error=f'{type(e).__name__}: {e}'[:1500 if not failures else 200]))
        time.sleep(1.5)
    old = []
    if OUT.exists():
        with OUT.open(encoding='utf-8-sig', newline='') as f:
            old = [r for r in csv.DictReader(f) if r['snapshot_date'] != today]
    if rows:
        allrows = sorted(old + rows, key=lambda r: (r['company_id'], r['period'], r['snapshot_date']))
        with OUT.open('w', encoding='utf-8-sig', newline='') as f:
            w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(allrows)
    est = sum(r['is_estimate'] == '1' and r['revenue_100m'] != '' for r in rows)
    STATUS.write_text(json.dumps(dict(updated_at=datetime.now(KST).isoformat(timespec='seconds'), companies=len(ids),
        parsed=len({r['company_id'] for r in rows}), estimate_rows=est, failures=failures), ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'parsed {len({r["company_id"] for r in rows})}/{len(ids)} companies, estimate rows {est}, failures {len(failures)}')
    if not rows:
        sys.exit(1)


if __name__ == '__main__':
    main()
