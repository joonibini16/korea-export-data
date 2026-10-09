"""Derive standalone quarters from dated financial statement observations.

Latest comparative figures take precedence. Q4 needs FY and Q3 YTD; no interpolation.
"""
def derive(manifest):
 quarterly,cumulative,annual={},{},{}
 for r in sorted(manifest['reports'],key=lambda r:(r['year'],r['quarter'])):
  cid,basis,q=r['company_id'],r['basis'],r['quarter']
  assert basis in ('연결','별도') and q in (1,2,3,4) and r['source'].startswith('https://')
  rv,op=r['revenue'],r['operating_profit'];assert len(rv)==len(op)
  assert all(type(v) is int for v in rv+op) and all(v>=0 for v in rv)
  for offset in range(min(2,len(rv) if q in (1,4) else len(rv)//2)):
   y=r['year']-offset
   if y<2020:continue
   def put(target,quarter,values,method):
    target[cid,basis,y,quarter]=dict(company_id=cid,period=f'{y}-Q{quarter}',revenue_KRW=str(values[0]),operating_profit_KRW=str(values[1]),basis=basis,status=method,source=r['source'],source_secondary='')
   if q==4:
    put(annual,4,(rv[offset],op[offset]),'사업보고서 연간');continue
   j=offset if q==1 else offset*2
   put(quarterly,q,(rv[j],op[j]),'분기 공시 · 3개월')
   put(cumulative,q,(rv[j] if q==1 else rv[j+1],op[j] if q==1 else op[j+1]),'공시 누적')
   if q==2 and not any(p.startswith(str(y)+'.') and p[5:7]>'03' for p in r.get('period_starts',[])):
    put(quarterly,1,(rv[j+1]-rv[j],op[j+1]-op[j]),'반기 누적−2분기')
 issues=[]
 for key,a in annual.items():
  cid,basis,y,_=key;c=cumulative.get((cid,basis,y,3))
  if not c:continue
  values={f:str(int(a[f])-int(c[f])) for f in ('revenue_KRW','operating_profit_KRW')}
  if int(values['revenue_KRW'])<0:issues.append(dict(company_id=cid,basis=basis,year=y,error='negative Q4'));continue
  quarterly[key]={**a,**values,'status':'사업보고서 연간−3분기 누적','source_secondary':c['source']}
 # Reconcile independently reported quarters with the Q3 YTD when available.
 for (cid,basis,y,q),c in cumulative.items():
  if q!=3:continue
  qs=[quarterly.get((cid,basis,y,k)) for k in (1,2,3)]
  if not all(qs):continue
  if any(sum(int(a[f]) for a in qs)!=int(c[f]) for f in ('revenue_KRW','operating_profit_KRW')):
   issues.append(dict(company_id=cid,basis=basis,year=y,error='Q1–Q3 differs from YTD; review restatement'))
   for k in range(1,5):quarterly.pop((cid,basis,y,k),None)
 rows=[r for r in quarterly.values() if manifest['start_period']<=r['period']<=manifest['end_period'] and int(r['revenue_KRW'])>=0]
 return rows,issues
