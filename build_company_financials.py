"""Rebuild verified quarterly earnings and audit every watchlist company.

The source manifest contains exact KRW figures read from consolidated filings.
H1/Q3 columns: current quarter, current YTD, prior quarter, prior YTD.
FY columns: current year, previous year, two years prior.
No missing observation is estimated or replaced by zero.
"""
import argparse
import csv
import io
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
METRICS = ('revenue_KRW', 'operating_profit_KRW')

def quarter_range(start, end):
    def qi(p):
        year, q = p.split('-Q')
        assert q in ('1', '2', '3', '4'), p
        return int(year) * 4 + int(q) - 1
    return [f'{q // 4}-Q{q % 4 + 1}' for q in range(qi(start), qi(end) + 1)]

def build(manifest, existing, companies):
    expected = quarter_range(manifest['start_period'], manifest['end_period'])
    ids = {c['id'] for c in companies}
    reports, observations, annual = {}, {}, {}
    for r in manifest['reports']:
        cid, year, kind = r['company_id'], r['year'], r['report']
        assert cid in ids and r['basis'] == '연결' and r['unit'] == 'KRW'
        assert kind in ('H1', 'Q3', 'FY')
        key = (cid, year, kind)
        assert key not in reports, key
        reports[key] = r
        assert len(r['revenue']) == len(r['operating_profit']) == (3 if kind == 'FY' else 4)
        assert all(type(v) is int for v in r['revenue'] + r['operating_profit'])
        assert all(v >= 0 for v in r['revenue'])
        for offset in range(2):
            y = year - offset
            rev, op = r['revenue'], r['operating_profit']
            if kind == 'FY':
                annual[cid, y] = (rev[offset], op[offset], r['source'])
                continue
            q = 2 if kind == 'H1' else 3
            vals = rev[2 * offset], op[2 * offset]
            observations[cid, f'{y}-Q{q}'] = (*vals, r['source'], '반기보고서 · 3개월' if q == 2 else '분기보고서 · 3개월', '')
            if q == 2:
                observations[cid, f'{y}-Q1'] = (rev[2*offset+1]-vals[0], op[2*offset+1]-vals[1], r['source'], '반기 누적−2분기', '')
    for (cid, y), (rev, op, source) in annual.items():
        q3 = reports.get((cid, y, 'Q3')) or reports.get((cid, y+1, 'Q3'))
        if not q3:
            continue
        j = 1 if q3['year'] == y else 3
        observations[cid, f'{y}-Q4'] = (rev-q3['revenue'][j], op-q3['operating_profit'][j], source, '사업보고서 연간−3분기 누적', q3['source'])
        # Independently verify Q1+Q2+Q3 agrees with the Q3 cumulative figure.
        for index, field in enumerate(('revenue', 'operating_profit')):
            first_three = [observations[cid, f'{y}-Q{q}'][index] for q in range(1,4)]
            assert sum(first_three) == q3[field][j], (cid, y, field, 'YTD mismatch')
            assert sum(first_three) + observations[cid, f'{y}-Q4'][index] == (rev,op)[index]
    rows = {}
    for r in existing:
        key = r['company_id'], r['period']
        assert key not in rows, ('duplicate', key)
        rows[key] = dict(r)
    covered = {r['company_id'] for r in manifest['reports']}
    for (cid,p), (rev,op,source,method,secondary) in observations.items():
        if p not in expected:
            continue
        assert rev >= 0 and source.startswith('https://')
        rows[cid,p] = dict(company_id=cid,period=p,revenue_KRW=str(rev),basis='연결',status=method,source=source,operating_profit_KRW=str(op),source_secondary=secondary)
    audit=[]
    for c in companies:
        missing=[p for p in expected if (c['id'],p) not in rows or any(rows[c['id'],p].get(k,'')=='' for k in METRICS)]
        audit.append(dict(company_id=c['id'],name=c['name'],expected_quarters=len(expected),complete_quarters=len(expected)-len(missing),missing_periods=missing,status='complete' if not missing else 'not_collected' if len(missing)==len(expected) else 'incomplete'))
        if c['id'] in covered:
            assert not missing, (c['name'],missing)
    return [rows[k] for k in sorted(rows)], dict(reviewed_at=manifest['reviewed_at'],start_period=expected[0],end_period=expected[-1],companies=audit)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    manifest=json.loads((ROOT/'company_financial_sources.json').read_text())
    companies=json.loads((ROOT/'company_watchlist.json').read_text())['companies']
    path=ROOT/'company_financials.csv'
    with path.open(newline='') as f:
        reader=csv.DictReader(f); fields=list(reader.fieldnames); old=list(reader)
    if 'source_secondary' not in fields: fields.append('source_secondary')
    rows,audit=build(manifest,old,companies)
    out=io.StringIO(newline='');writer=csv.DictWriter(out,fieldnames=fields,lineterminator='\n');writer.writeheader();writer.writerows(rows)
    audit_text=json.dumps(audit,ensure_ascii=False,indent=2)+'\n'
    if args.check:
        assert path.read_text()==out.getvalue(), 'CSV differs from verified source calculation'
        assert (ROOT/'company_financial_coverage.json').read_text()==audit_text, 'Coverage audit stale'
    else:
        path.write_text(out.getvalue())
        (ROOT/'company_financial_coverage.json').write_text(audit_text)
    print(f"Verified {len(rows)} rows; complete {sum(c['status']=='complete' for c in audit['companies'])}/{len(companies)} companies; interval {audit['start_period']}–{audit['end_period']}")

if __name__=='__main__': main()
