"""Build validated backlog CSV from manually reviewed public filings.

No new-order totals, intangible-asset carrying amounts, or undisclosed values
are treated as order backlog. Add reviewed observations to the source manifest.
"""
import csv,json,math,pathlib,re,io,os
from decimal import Decimal
ROOT=pathlib.Path(__file__).resolve().parent
CONVERT={'KRW':('KRW_100m','억원',Decimal('0.00000001')),'KRW_million':('KRW_100m','억원',Decimal('0.01')),'KRW_100m':('KRW_100m','억원',Decimal(1)),'USD_thousand':('M_USD','백만 USD',Decimal('0.001')),'M_USD':('M_USD','백만 USD',Decimal(1))}
def build():
 source=json.loads((ROOT/'company_backlog_sources.json').read_text())
 ids={c['id'] for c in json.loads((ROOT/'company_watchlist.json').read_text())['companies']}
 reviews=source['companies'];assert len(reviews)==len(ids) and {r['company_id'] for r in reviews}==ids,'Coverage must include every company exactly once'
 rows=[];seen=set();scopes={}
 for r in source['observations']:
  cid,p=r['company_id'],r['period'];assert cid in ids and re.fullmatch(r'\d{4}-Q[1-4]',p)
  key=(cid,p);assert key not in seen,'Duplicate '+str(key);seen.add(key)
  unit,label,factor=CONVERT[r['raw_unit']];v=Decimal(str(r['raw_value']));assert v.is_finite() and v>=0
  assert r['source'].startswith('https://') and r['scope']
  scope=(unit,r['scope']);assert cid not in scopes or scopes[cid]==scope,'Incomparable series '+cid;scopes[cid]=scope
  rows.append(dict(company_id=cid,period=p,value=format(v*factor,'f'),unit=unit,unit_label=label,status=r['status'],source=r['source'],scope=r['scope'],notes=r.get('notes','')))
 # Validate preservation before either output is replaced.
 existing=ROOT/'company_backlog.csv'
 if existing.exists():
  old={(r['company_id'],r['period']) for r in csv.DictReader(existing.open())}
  assert old<=seen,'Historical records would be removed'
 buf=io.StringIO();w=csv.DictWriter(buf,fieldnames=['company_id','period','value','unit','unit_label','status','source','scope','notes']);w.writeheader();w.writerows(sorted(rows,key=lambda r:(r['company_id'],r['period'])))
 coverage={k:source[k] for k in ['reviewed_at','review_scope','companies']}
 for name,text in [('company_backlog.csv',buf.getvalue()),('company_backlog_coverage.json',json.dumps(coverage,ensure_ascii=False,indent=2)+'\n')]:
  path=ROOT/name;tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(text);os.replace(tmp,path)
 print(f'{len(ids)} companies reviewed; {len(scopes)} with amounts; {len(rows)} observations')
if __name__=='__main__':build()
