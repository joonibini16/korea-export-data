"""Dump '수주' tables from 2020-Q1~ periodic reports (KIND) for review.

Reuses collect_company_history.catalog/process and its .history-cache.
Args: company ids (watchlist) or extra 'id:name' pairs; --broad keeps any table
mentioning 수주 (not only 수주잔고). Output: backlog_tables_dump.json.
"""
import json, sys, pathlib, concurrent.futures
from lxml import html
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import collect_company_history as h

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    broad = '--broad' in sys.argv
    watch = json.loads((h.ROOT / 'company_watchlist.json').read_text())['companies']
    companies = []
    for a in args:
        if ':' in a:
            i, n = a.split(':', 1); companies.append(dict(id=i, name=n))
        else:
            companies += [c for c in watch if c['id'] == a]
    if not args:
        companies = [c for c in watch if c['id'].isdigit()]
    out, fails = [], []
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        cats = list(pool.map(h.catalog, companies))
    for c in cats:
        if c.get('error'):
            fails.append(dict(company_id=c['company_id'], error=c['error']))
    todo = [r for c in cats for r in c['reports']]
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for r in pool.map(h.process, todo):
            if r.get('error'):
                fails.append(dict(company_id=r['company_id'], period=r['period'], error=r['error'])); continue
            tables = r['backlog_tables']
            if broad:
                doc = html.fromstring(h.get(r['url'])); tables = []
                for t in doc.xpath('//table'):
                    tx = h.text(t)
                    if '수주' in tx.replace(' ', '') and len(tx) < 45000:
                        before = ' '.join(h.text(e) for e in t.xpath('preceding-sibling::*[position()<=3]'))[-1300:]
                        if '수주' in tx.replace(' ', '') or '수주' in before:
                            tables.append(dict(before=before, rows=h.rows(t)))
            tabs = [dict(before=t['before'][-500:], rows=[[c[:80] for c in row[:16]] for row in t['rows'][:45]]) for t in tables]
            out.append(dict(company_id=r['company_id'], name=r['name'], period=r['period'], url=r['url'], title=r['title'], tables=tabs))
            print(r['company_id'], r['period'], len(tabs), flush=True)
    out.sort(key=lambda x: (x['company_id'], x['period']))
    pathlib.Path('backlog_tables_dump.json').write_text(json.dumps(dict(reports=out, failures=fails), ensure_ascii=False, indent=0))
    print('reports', len(out), 'failures', len(fails))

if __name__ == '__main__':
    main()
