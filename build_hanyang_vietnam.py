"""Build a company research proxy from preserved Customs country CSVs; never query or overwrite source data."""
import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))
def number(v):
    if v is None or str(v).strip() == '':
        return None
    n = float(v)
    if not math.isfinite(n) or n < 0:
        raise ValueError(f'Invalid nonnegative value: {v}')
    return int(n) if n.is_integer() else n
def ratio(a, b):
    return round((a / b - 1) * 100, 6) if a is not None and b is not None and b > 0 else None
def shift(m, n):
    y, mo = map(int, m.split('.'))
    x = y * 12 + mo - 1 + n
    return f'{x // 12:04d}.{x % 12 + 1:02d}'
def period_months(p):
    y, q = p.split('-Q')
    return [f'{y}.{m:02d}' for m in range((int(q)-1)*3+1, int(q)*3+1)]
def write_csv(path, rows):
    if not rows:
        raise ValueError('Refusing empty output')
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

def build():
    config = json.loads((ROOT/'hanyang_vietnam_config.json').read_text(encoding='utf-8'))
    hs = {r['hs_code'] for r in read_csv(ROOT/'hs_codes.csv')}
    monthly, quarterly, sources, coverage = [], [], {}, []
    for spec in config['series']:
        code = spec['hs_code']
        if code not in hs:
            raise ValueError(f'Unregistered HS code {code}')
        path = ROOT/f'country_{code}.csv'
        rows = read_csv(path)
        seen, world, local = set(), {}, {}
        for r in rows:
            if r['HS코드'] != code:
                raise ValueError('HS mapping mismatch')
            key = (r['월'], r['국가코드'])
            if key in seen:
                raise ValueError(f'Duplicate source key {key}')
            seen.add(key)
            usd, kg = number(r['수출금액_USD']), number(r['수출중량_KG'])
            world.setdefault(r['월'], []).append(usd)
            if r['국가코드'] == config['country_code']:
                local[r['월']] = {'export_usd': usd, 'weight_kg': kg}
        if not local:
            raise ValueError(f'No VN data for {code}')
        start, end = min(world), max(world)
        months, m = [], start
        while m <= end:
            months.append(m)
            m = shift(m, 1)
        series_rows = []
        for m in months:
            v = local.get(m, {'export_usd': None, 'weight_kg': None})
            cur, prev, year = v['export_usd'], local.get(shift(m,-1),{}), local.get(shift(m,-12),{})
            kg = v['weight_kg']
            last3 = [local.get(shift(m,-i),{}).get('export_usd') for i in range(3)]
            total = sum(world[m]) if all(v is not None for v in world[m]) else None
            r = dict(month=m, hs_code=code, name=spec['name'], role=spec['role'], country_code='VN', export_usd=cur, weight_kg=kg,
                     usd_per_kg=round(cur/kg,6) if cur is not None and kg is not None and kg>0 else None,
                     export_yoy_pct=ratio(cur,year.get('export_usd')), export_mom_pct=ratio(cur,prev.get('export_usd')),
                     weight_yoy_pct=ratio(kg,year.get('weight_kg')),
                     export_ma3_usd=round(sum(last3)/3,6) if all(x is not None for x in last3) else None,
                     vn_share_pct=round(cur/total*100,6) if cur is not None and total is not None and total>0 else None,
                     status='observed' if cur is not None and kg is not None else 'missing')
            monthly.append(r); series_rows.append(r)
        qmap = {}
        for m in months:
            qmap.setdefault(f'{m[:4]}-Q{(int(m[5:])-1)//3+1}', [])
        for p in qmap:
            ms = period_months(p)
            vals = [local.get(m,{}).get('export_usd') for m in ms]
            kgs = [local.get(m,{}).get('weight_kg') for m in ms]
            complete = all(x is not None for x in vals)
            usd = sum(vals) if complete else None
            kg = sum(kgs) if all(x is not None for x in kgs) else None
            qmap[p] = dict(period=p, hs_code=code, name=spec['name'], role=spec['role'], country_code='VN',
                           export_usd=usd, partial_export_usd=sum(x for x in vals if x is not None),weight_kg=kg,
                           usd_per_kg=round(usd/kg,6) if usd is not None and kg is not None and kg>0 else None,
                           export_yoy_pct=None, export_qoq_pct=None,weight_yoy_pct=None,
                           observed_months=sum(x is not None for x in vals),expected_months=3,status='complete' if complete else 'partial')
        for p, r in qmap.items():
            y,q = p.split('-Q'); prev = f'{int(y)-1}-Q4' if q=='1' else f'{y}-Q{int(q)-1}'
            old=qmap.get(f'{int(y)-1}-Q{q}',{})
            r['export_yoy_pct']=ratio(r['export_usd'],old.get('export_usd'))
            r['export_qoq_pct']=ratio(r['export_usd'],qmap.get(prev,{}).get('export_usd'))
            r['weight_yoy_pct']=ratio(r['weight_kg'],old.get('weight_kg'))
            quarterly.append(r)
        coverage.append({'hs_code':code,'first_month':start,'last_month':end,'expected_months':len(months),'observed_months':len(local),'missing_months':[r['month'] for r in series_rows if r['status']=='missing']})
        sources[path.name]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'data_end':end}
    financials=[]
    for r in read_csv(ROOT/'company_financials.csv'):
        if r['company_id'] == config['company_id']:
            financials.append({'period':r['period'],'revenue_krw':number(r['revenue_KRW']),
                               'operating_profit_krw':float(r['operating_profit_KRW']) if r['operating_profit_KRW'] else None,
                               'basis':r['basis'],'source':r['source']})
    # Product-table totals are tied to the actual fiscal period, unlike a later filing's
    # current/comparative statement columns. Override this tracker only; keep shared CSVs intact.
    product_path=ROOT/'hanyang_product_revenue.csv'
    if product_path.exists():
        verified={r['period']:r for r in read_csv(product_path) if r['segment']=='memory_module' and r.get('company_revenue_krw')}
        for r in financials:
            v=verified.get(r['period'])
            if v:
                verified_revenue=number(v['company_revenue_krw'])
                # Retain existing profit only when the same quarter's revenue reconciles
                # within the source table's rounding tolerance; preserve its own source.
                profit=r['operating_profit_krw'] if r['revenue_krw'] is not None and abs(r['revenue_krw']-verified_revenue)<=2000000 else None
                r['operating_profit_source']=r['source'] if profit is not None else None
                r.update(revenue_krw=verified_revenue,operating_profit_krw=profit,
                         source=v['source'],basis='연결',precision=v['precision'])
        sources[product_path.name]={'sha256':hashlib.sha256(product_path.read_bytes()).hexdigest()}
    financials.sort(key=lambda r:r['period'])
    for r in financials:
        p=r['period'];old=next((f for f in financials if f['period']==f'{int(p[:4])-1}{p[4:]}'),{})
        r['revenue_yoy_pct']=ratio(r['revenue_krw'],old.get('revenue_krw'))
        r['opm_pct']=round(r['operating_profit_krw']/r['revenue_krw']*100,6) if r['revenue_krw'] and r['operating_profit_krw'] is not None else None
    for data,key in [(monthly,lambda r:(r['month'],r['hs_code'])),(quarterly,lambda r:(r['period'],r['hs_code']))]:
        if len({key(r) for r in data}) != len(data): raise ValueError('Duplicate output')
    for name in ['company_financials.csv','hs_codes.csv','hanyang_vietnam_config.json','build_hanyang_vietnam.py']:
        sources[name]={'sha256':hashlib.sha256((ROOT/name).read_bytes()).hexdigest()}
    target=ROOT/'hanyang_vietnam.json'
    if target.exists() and json.loads(target.read_text(encoding='utf-8')).get('source_files')==sources:
        print('Validated inputs unchanged; preserving existing outputs')
        return
    payload={**config,'built_at':datetime.now(timezone.utc).isoformat(),'coverage':coverage,'source_files':sources,'monthly':monthly,'quarterly':quarterly,'financials':financials}
    text=json.dumps(payload,ensure_ascii=False,allow_nan=False,indent=2)+'\n'
    write_csv(ROOT/'hanyang_vietnam_monthly.csv',monthly)
    write_csv(ROOT/'hanyang_vietnam_quarterly.csv',quarterly)
    (ROOT/'hanyang_vietnam.json').write_text(text,encoding='utf-8')
    print(json.dumps({'monthly_rows':len(monthly),'quarterly_rows':len(quarterly),'financial_quarters':len(financials),'coverage':coverage},ensure_ascii=False))
if __name__=='__main__': build()
