"""Dump every '수주잔고' table from 2020-Q1~ periodic reports (KIND) for review.

Reuses collect_company_history.catalog/process and its .history-cache.
Output: backlog_tables_dump.json (not published; review material only).
"""
import json, sys, pathlib, concurrent.futures
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import collect_company_history as h

def main():
    ids = sys.argv[1:]
    companies = json.loads((h.ROOT / 'company_watchlist.json').read_text())['companies']
    companies = [c for c in companies if c['id'].isdigit() and (not ids or c['id'] in ids)]
    out, fails = [], []
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        cats = list(pool.map(h.catalog, companies))
    todo = [r for c in cats for r in c['reports']]
    for c in cats:
        if c.get('error'):
            fails.append(dict(company_id=c['company_id'], error=c['error']))
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for r in pool.map(h.process, todo):
            if r.get('error'):
                fails.append(dict(company_id=r['company_id'], period=r['period'], error=r['error'])); continue
            tabs = []
            for t in r['backlog_tables']:
                rows = [[c[:80] for c in row[:14]] for row in t['rows'][:40]]
                tabs.append(dict(before=t['before'][-500:], rows=rows))
            out.append(dict(company_id=r['company_id'], name=r['name'], period=r['period'], url=r['url'], title=r['title'], tables=tabs))
            print(r['company_id'], r['period'], len(tabs), flush=True)
    out.sort(key=lambda x: (x['company_id'], x['period']))
    pathlib.Path('backlog_tables_dump.json').write_text(json.dumps(dict(reports=out, failures=fails), ensure_ascii=False, indent=0))
    print('reports', len(out), 'failures', len(fails))

if __name__ == '__main__':
    main()
