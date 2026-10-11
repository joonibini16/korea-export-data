"""Quarter-end inventory (재고자산) from KIND periodic reports, 2020-Q1 onward.

Reuses collect_company_history.catalog/process and its .history-cache. For each report the
statement of financial position (연결 재무상태표, else 재무상태표) is located by its title and
the first-period column of the '재고자산' row is taken as the quarter-end balance.
Checks: unit must be stated (원/천원/백만원); the Q4 balance must equal the prior-year-end
column of the next Q1 report (reported as an issue, value kept).
Output: company_inventory.csv, company_inventory_status.json
"""
import csv, json, re, sys, pathlib, concurrent.futures, datetime
from decimal import Decimal
from lxml import html

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import collect_company_history as h

OUT = ROOT / 'company_inventory.csv'
STATUS = ROOT / 'company_inventory_status.json'
LABEL = re.compile(r'^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ\d]+[.)]?)?재고자산(?:\(주[^)]*\)|\(주석[^)]*\)|\([\d,\s]+\))?$')
UNIT = {'원': 1, '천원': 1000, '백만원': 1000000}


def numcell(s):
    s = s.replace(',', '').replace(' ', '').replace('−', '-')
    if re.fullmatch(r'\([\d.]+\)', s):
        s = '-' + s[1:-1]
    return Decimal(s) if re.fullmatch(r'-?\d+(\.\d+)?', s) else None


def balance_sheets(doc):
    ts = doc.xpath('//table')
    found = []
    for i, t in enumerate(ts):
        title = h.text(t).replace(' ', '')
        prev = t.xpath('preceding-sibling::*[1]')
        ptxt = h.text(prev[0]).replace(' ', '') if prev else ''
        # Title is either a short table of its own ("연결 재무상태표 제 N 기 ... 현재 (단위 : 원)")
        # or the paragraph right before the data table.
        src = title if len(title) < 600 and re.search(r'재무상태표', title) else ptxt if len(ptxt) < 120 and re.search(r'재무상태표', ptxt) else ''
        if not src or '요약' in src or '자본변동' in src:
            continue
        if not re.match(r'^(?:\d+[.)-]*|[가-하]\.)?(?:연결)?재무상태표', src):
            continue
        name = '연결' if '연결' in src.split('재무상태표')[0] else '별도'
        ctx = ts[i:i + 4]
        joined = ' '.join(h.text(x) for x in ctx)
        u = re.search(r'단위\s*[:：]\s*(백만원|천원|원)', joined)
        rows = [r for tb in ctx for r in h.rows(tb)]
        header = ' '.join(' '.join(r) for r in rows[:6])
        if any(r and LABEL.fullmatch(r[0].replace(' ', '')) for r in rows) and not any(f['basis'] == name for f in found):
            found.append(dict(basis=name, unit=u.group(1) if u else None, rows=rows, header=header))
    return found


def extract(sheet, period):
    if not sheet['unit']:
        raise ValueError('단위 미기재')
    y = period[:4]
    if y not in sheet['header']:
        raise ValueError('보고 연도 헤더 없음')
    note = '주석' in sheet['header']
    for r in sheet['rows']:
        if r and LABEL.fullmatch(r[0].replace(' ', '')):
            cells = r[1:]
            if note and cells and (numcell(cells[0]) is None or len(cells) >= 3):
                cells = cells[1:]
            vals = [numcell(c) for c in cells if c.strip() not in ('',)]
            vals = [v for v in vals if v is not None]
            if len(vals) < 1:
                raise ValueError('재고자산 숫자 없음')
            cur = vals[0] * UNIT[sheet['unit']]
            prior = vals[1] * UNIT[sheet['unit']] if len(vals) > 1 else None
            if cur <= 0:
                raise ValueError('재고 0 또는 음수 · 표 구조 확인 필요')
            return int(cur), (int(prior) if prior is not None else None)
    raise ValueError('재고자산 행 없음')


def main():
    watch = json.loads((ROOT / 'company_watchlist.json').read_text())['companies']
    companies = [c for c in watch if c['id'].isdigit() and (len(sys.argv) < 2 or c['id'] in sys.argv[1:])]
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        cats = list(pool.map(h.catalog, companies))
    todo = [r for c in cats for r in c['reports']]
    out, issues, failures = {}, [], [dict(company_id=c['company_id'], error=c['error']) for c in cats if c.get('error')]
    priors = {}
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for r in pool.map(h.process, todo):
            if r.get('error'):
                failures.append(dict(company_id=r['company_id'], period=r['period'], error=r['error'])); continue
            try:
                doc = html.fromstring(h.get(r['url']))
                sheets = balance_sheets(doc)
            except Exception as e:
                failures.append(dict(company_id=r['company_id'], period=r['period'], error=str(e)[:200])); continue
            got = False
            for basis in ('연결', '별도'):
                sh = next((s for s in sheets if s['basis'] == basis), None)
                if not sh:
                    continue
                try:
                    cur, prior = extract(sh, r['period'])
                except ValueError as e:
                    issues.append(dict(company_id=r['company_id'], period=r['period'], basis=basis, source=r['url'], reason=str(e))); continue
                out[(r['company_id'], r['period'], basis)] = dict(company_id=r['company_id'], period=r['period'], basis=basis,
                    inventory_KRW=cur, source=r['url'])
                if r['period'].endswith('Q1') and prior is not None:
                    priors[(r['company_id'], f"{int(r['period'][:4]) - 1}-Q4", basis)] = prior
                got = True
            if not got and not any(i['company_id'] == r['company_id'] and i['period'] == r['period'] for i in issues):
                dbg = []
                for e in doc.xpath('//*[contains(text(),"재무상태표") or contains(text(),"재 무 상 태 표")]')[:8]:
                    dbg.append(f'{e.tag}: {h.text(e)[:100]}')
                for tr in doc.xpath('//tr')[:4000]:
                    c = tr.xpath('./td|./th')
                    if c and '재고' in h.text(c[0]).replace(' ', '')[:8]:
                        dbg.append('ROW: ' + ' | '.join(h.text(x)[:30] for x in c[:5])); 
                        if sum(x.startswith('ROW') for x in dbg) >= 4: break
                issues.append(dict(company_id=r['company_id'], period=r['period'], source=r['url'], reason='재무상태표 미확인', debug=dbg))
            print(r['company_id'], r['period'], 'ok' if got else 'missing', flush=True)
    for k, p in priors.items():
        v = out.get(k)
        if v and abs(v['inventory_KRW'] - p) > max(1_000_000, p * 0.001):
            issues.append(dict(company_id=k[0], period=k[1], basis=k[2], reason=f'다음 해 1분기 보고서의 전기말 값과 다름 ({v["inventory_KRW"]:,} vs {p:,}) · 재작성 가능성'))
    rows = sorted(out.values(), key=lambda r: (r['company_id'], r['basis'], r['period']))
    if not rows:
        print('no rows'); sys.exit(1)
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['company_id', 'period', 'basis', 'inventory_KRW', 'source']); w.writeheader(); w.writerows(rows)
    cov = {}
    for r in rows:
        cov.setdefault(r['company_id'], {}).setdefault(r['basis'], []).append(r['period'])
    STATUS.write_text(json.dumps(dict(updated_at=datetime.datetime.now().isoformat(timespec='seconds'), reports=len(todo), rows=len(rows),
        coverage={k: {b: [min(v), max(v), len(v)] for b, v in d.items()} for k, d in cov.items()}, issues=issues, failures=failures),
        ensure_ascii=False, indent=1))
    print('rows', len(rows), 'issues', len(issues), 'failures', len(failures))


if __name__ == '__main__':
    main()
