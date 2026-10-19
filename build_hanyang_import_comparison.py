"""Join Vietnamese finished-memory imports to Hanyang product revenue, keeping gaps explicit."""
import csv,json,hashlib
from pathlib import Path
from datetime import datetime,timezone
from build_hanyang_vietnam import number,ratio,shift,period_months,write_csv
ROOT=Path(__file__).resolve().parent
MAP={'8523511000':('ssd','SSD'),'8473304060':('memory_module','메모리모듈')}
def read(name):return list(csv.DictReader((ROOT/name).open(encoding='utf-8-sig')))
def build():
    names=['hanyang_vietnam_imports.csv','hanyang_product_revenue.csv']
    digest=hashlib.sha256(b''.join((ROOT/n).read_bytes() for n in names)+Path(__file__).read_bytes()).hexdigest()
    out=ROOT/'hanyang_import_comparison.json'
    if out.exists() and json.loads(out.read_text())['fingerprint']==digest:return
    raw=read(names[0]);rev=read(names[1]);keys=set();monthly=[];quarterly=[]
    registered={r['hs_code'] for r in read('hs_codes.csv')};assert set(MAP)<=registered
    for r in raw:
        key=(r['월'],r['HS코드'])
        if key in keys or r['국가코드']!='VN':raise ValueError('duplicate or country mismatch')
        keys.add(key);number(r['수입금액_USD']);number(r['수입중량_KG'])
    rk=[(r['period'],r['segment']) for r in rev]
    if len(rk)!=len(set(rk)):raise ValueError('duplicate revenue')
    revenues={(r['period'],r['segment']):r for r in rev}
    for code,(segment,name) in MAP.items():
        values={r['월']:dict(usd=number(r['수입금액_USD']),kg=number(r['수입중량_KG'])) for r in raw if r['HS코드']==code}
        if not values:continue
        start,end=min(values),max(values);months=[];m=start
        while m<=end:months.append(m);m=shift(m,1)
        for m in months:
            v=values.get(m,{});usd,kg=v.get('usd'),v.get('kg');last3=[values.get(shift(m,-i),{}).get('usd') for i in range(3)]
            monthly.append(dict(month=m,hs_code=code,segment=segment,name=name,import_usd=usd,weight_kg=kg,
                usd_per_kg=usd/kg if usd is not None and kg is not None and kg>0 else None,
                import_yoy_pct=ratio(usd,values.get(shift(m,-12),{}).get('usd')),
                import_mom_pct=ratio(usd,values.get(shift(m,-1),{}).get('usd')),
                weight_yoy_pct=ratio(kg,values.get(shift(m,-12),{}).get('kg')),
                import_ma3_usd=sum(last3)/3 if all(x is not None for x in last3) else None))
        periods=sorted({f'{m[:4]}-Q{(int(m[-2:])-1)//3+1}' for m in months}|{p for p,s in revenues if s==segment})
        def total(p,field):
            a=[values.get(m,{}).get(field) for m in period_months(p)]
            return sum(a) if all(x is not None for x in a) else None
        for p in periods:
            usd,kg=total(p,'usd'),total(p,'kg');py=str(int(p[:4])-1)+p[4:];pq=p[:4]+'-Q'+str(int(p[-1])-1) if p[-1]!='1' else str(int(p[:4])-1)+'-Q4'
            r=revenues.get((p,segment),{});revenue=number(r.get('revenue_krw'))
            prev=number(revenues.get((py,segment),{}).get('revenue_krw'));prior=number(revenues.get((pq,segment),{}).get('revenue_krw'))
            quarterly.append(dict(period=p,hs_code=code,segment=segment,name=name,import_usd=usd,weight_kg=kg,
                import_yoy_pct=ratio(usd,total(py,'usd')),import_qoq_pct=ratio(usd,total(pq,'usd')),
                weight_yoy_pct=ratio(kg,total(py,'kg')),revenue_krw=revenue,revenue_yoy_pct=ratio(revenue,prev),revenue_qoq_pct=ratio(revenue,prior),
                observed_months=sum(values.get(m,{}).get('usd') is not None for m in period_months(p)),
                revenue_basis=r.get('basis'),revenue_source=r.get('source'),revenue_prior_source=r.get('prior_source')))
    j=dict(built_at=datetime.now(timezone.utc).isoformat(),fingerprint=digest,monthly=monthly,quarterly=quarterly,
        products=[dict(hs_code=c,segment=s,name=n) for c,(s,n) in MAP.items()],
        source='https://www.data.go.kr/data/15100475/openapi.do',
        notes=['수입금액은 CIF·USD, 회사 제품별 연결매출은 KRW. 서로 다른 금액을 이중축으로 비교합니다.',
               '회사 제품별 매출은 공시 사업의 내용 표(백만원 반올림). 2~4분기는 당해 누적에서 직전 누적 차감.',
               '국가 전체 수입에는 다른 업체 제품이 포함됩니다. 수입가격과 조립·테스트 매출 인식 범위가 다를 수 있어 점유율로 해석하지 않습니다.',
               '미공시 회사 매출과 누락된 수입 월은 빈 값으로 유지하며 월 매출을 분기 매출에서 인위적으로 나누지 않습니다.'])
    out.write_text(json.dumps(j,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    write_csv(ROOT/'hanyang_import_comparison_quarterly.csv',quarterly)
    print('import monthly',len(monthly),'quarterly comparison',len(quarterly),'product revenue',sum(r['revenue_krw'] is not None for r in quarterly))
if __name__=='__main__':build()
