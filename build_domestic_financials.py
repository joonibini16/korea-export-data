"""Extend separate-company revenue without filling undisclosed quarters."""
import csv,io,json,os
from pathlib import Path
from financial_history import derive
ROOT=Path(__file__).resolve().parent
def main():
 path=ROOT/'company_domestic_financials.csv'
 with path.open() as f:
  reader=csv.DictReader(f);fields=list(reader.fieldnames);rows={(r['company_id'],r['period']):r for r in reader}
 for field in ('operating_profit_KRW','source_secondary'):
  if field not in fields:fields.append(field)
 history=json.loads((ROOT/'company_financial_history_sources.json').read_text());new,issues=derive(history)
 for r in new:
  if r['basis']=='별도' and (r['company_id'],r['period']) not in rows:rows[r['company_id'],r['period']]={**r,'domestic_revenue_KRW':r['revenue_KRW']}
 out=io.StringIO();w=csv.DictWriter(out,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(rows[k] for k in sorted(rows))
 tmp=path.with_suffix('.tmp');tmp.write_text(out.getvalue());os.replace(tmp,path)
 print('Separate-company quarters:',len(rows))
if __name__=='__main__':main()
