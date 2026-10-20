"""Future Electronics Market Conditions Report → future_mcr_log.csv (monthly lead time / trend / pricing).

The PDF is downloaded to a temp dir and never committed (Future's Terms of Use: republishing needs written
permission). Rows are appended per report month; past months are kept. Status → future_mcr_status.json.
"""
import csv, datetime as dt, json, pathlib, sys, tempfile, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import parse_future_mcr as P

URL = 'https://media.futureelectronics.com/doc/Market-Conditions-Report.pdf'
LOG, STATUS = pathlib.Path('future_mcr_log.csv'), pathlib.Path('future_mcr_status.json')
UA = {'User-Agent': 'Mozilla/5.0 (compatible; korea-export-data/1.0; +https://joonibini16.github.io/korea-export-data/)'}
status = json.loads(STATUS.read_text()) if STATUS.exists() else {}
with tempfile.TemporaryDirectory() as d:
    pdf = f'{d}/r.pdf'
    with urllib.request.urlopen(urllib.request.Request(URL, headers=UA), timeout=120) as r:
        pathlib.Path(pdf).write_bytes(r.read())
        last_mod = r.headers.get('Last-Modified')
    if last_mod and last_mod == status.get('last_modified'):
        print('unchanged', last_mod)
        sys.exit(0)
    P.main(pdf, f'{d}/new.csv')
    new = list(csv.DictReader(open(f'{d}/new.csv', encoding='utf-8')))
if not new:
    sys.exit('no rows parsed')
month = new[0]['report_month']
old = list(csv.DictReader(LOG.open(encoding='utf-8'))) if LOG.exists() else []
rows = [r for r in old if r['report_month'] != month] + new  # same month re-issued → keep the latest
rows.sort(key=lambda r: (dt.datetime.strptime(r['report_month'], '%B %Y'), int(r['page'])))
with LOG.open('w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(new[0]), lineterminator='\n')
    w.writeheader()
    w.writerows(rows)
unparsed = sum(1 for r in new if not r['lead_min'])
STATUS.write_text(json.dumps(dict(updated=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), report_month=month,
                                  report_updated=new[0]['updated'], last_modified=last_mod, rows=len(new), lead_unparsed=unparsed,
                                  source='Future Electronics Market Conditions Report', url=URL), ensure_ascii=False, indent=1))
print(month, len(new), 'rows; unparsed lead', unparsed)
