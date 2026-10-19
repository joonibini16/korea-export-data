"""Country-level memory trade weights. Explicit gaps and calendar-aligned comparisons."""
import csv,json,math,hashlib,statistics
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parent
def read(name):return list(csv.DictReader((ROOT/name).open(encoding='utf-8-sig')))
def num(v):
    if v is None or str(v).strip()=='':return None
    n=float(str(v).replace(',',''))
    if not math.isfinite(n) or n<0:raise ValueError('invalid nonnegative number')
    return int(n) if n.is_integer() else n
def shift(m,n):
    y,x=map(int,m.split('.'));k=y*12+x-1+n
    return f'{k//12}.{k%12+1:02}'
def ratio(a,b):return (a/b-1)*100 if a is not None and b is not None and b>0 else None
def months(p):
    y,q=p.split('-Q');return [f'{y}.{i:02}' for i in range((int(q)-1)*3+1,int(q)*3+1)]
def corr(p):
    if len(p)<8:return None
    x=statistics.mean(a for a,b in p);y=statistics.mean(b for a,b in p)
    xx=sum((a-x)**2 for a,b in p);yy=sum((b-y)**2 for a,b in p)
    return sum((a-x)*(b-y) for a,b in p)/math.sqrt(xx*yy) if xx*yy else None
def save(name,rows):
    if not rows:raise ValueError('refusing empty output')
    with (ROOT/name).open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
def build():
    cfg=json.loads((ROOT/'memory_trade_config.json').read_text());registered={r['hs_code'] for r in read('hs_codes.csv')}
    assert {i['hs_code'] for i in cfg['items']}<=registered
    raw=read('memory_trade_raw.csv');seen=set();data={}
    for r in raw:
        key=r['월'],r['HS코드']
        if key in seen or r['국가코드']!=cfg['country_code']:raise ValueError('duplicate/country mismatch')
        if r['HS코드'] not in {i['hs_code'] for i in cfg['items']}:raise ValueError('HS mismatch')
        seen.add(key);data[key]={k:num(r[k]) for k in ['수출금액_USD','수출중량_KG','수입금액_USD','수입중량_KG']}
    monthly=[];quarterly=[];coverage=[];validation=[]
    for item in cfg['items']:
        code=item['hs_code'];obs={m:v for (m,c),v in data.items() if c==code}
        if not obs:raise ValueError('no observations for '+code)
        first,last=min(obs),max(obs);ms=[];m=first
        while m<=last:ms.append(m);m=shift(m,1)
        for direction,kr in [('export','수출'),('import','수입')]:
            vals={m:v[kr+'중량_KG'] for m,v in obs.items()};missing=[]
            for m in ms:
                w=vals.get(m);a=[vals.get(shift(m,-i)) for i in range(3)]
                if w is None:missing.append(m)
                monthly.append(dict(month=m,hs_code=code,name=item['name'],country_code=cfg['country_code'],direction=direction,
                    weight_kg=w,yoy_pct=ratio(w,vals.get(shift(m,-12))),mom_pct=ratio(w,vals.get(shift(m,-1))),
                    ma3_kg=sum(a)/3 if all(x is not None for x in a) else None,status='observed' if w is not None else 'missing'))
            qmap={}
            for p in sorted({f'{m[:4]}-Q{(int(m[-2:])-1)//3+1}' for m in ms}):
                a=[vals.get(m) for m in months(p)];complete=all(x is not None for x in a)
                qmap[p]=dict(period=p,hs_code=code,name=item['name'],country_code=cfg['country_code'],direction=direction,
                    weight_kg=sum(a) if complete else None,partial_weight_kg=sum(x for x in a if x is not None),
                    yoy_pct=None,qoq_pct=None,observed_months=sum(x is not None for x in a),expected_months=3,status='complete' if complete else 'partial')
            for p,r in qmap.items():
                q=int(p[-1]);pq=p[:4]+'-Q'+str(q-1) if q>1 else str(int(p[:4])-1)+'-Q4';py=str(int(p[:4])-1)+p[4:]
                r['yoy_pct']=ratio(r['weight_kg'],qmap.get(py,{}).get('weight_kg'));r['qoq_pct']=ratio(r['weight_kg'],qmap.get(pq,{}).get('weight_kg'));quarterly.append(r)
            coverage.append(dict(hs_code=code,name=item['name'],direction=direction,first_month=first,last_month=last,expected=len(ms),observed=len(ms)-len(missing),missing=missing))
        # Export weights shifted 0..3 months against imports. No optimization or sales inference.
        for lag in [0,1,2,3]:
            for growth in ['yoy','qoq']:
                pairs=[]
                for r in quarterly:
                    if r['hs_code']!=code or r['direction']!='import':continue
                    p=r['period'];q=int(p[-1]);prior=str(int(p[:4])-1)+p[4:] if growth=='yoy' else p[:4]+'-Q'+str(q-1) if q>1 else str(int(p[:4])-1)+'-Q4'
                    a=[obs.get(shift(m,-lag),{}).get('수출중량_KG') for m in months(p)]
                    b=[obs.get(shift(m,-lag),{}).get('수출중량_KG') for m in months(prior)]
                    x=ratio(sum(a),sum(b)) if all(v is not None for v in a+b) else None;y=r[growth+'_pct'] if growth=='yoy' else r['qoq_pct']
                    if x is not None and y is not None:pairs.append((p,x,y))
                past=[(x,y) for p,x,y in pairs if p<='2024-Q4'];recent=[(x,y) for p,x,y in pairs if p>'2024-Q4']
                validation.append(dict(hs_code=code,name=item['name'],export_lead_months=lag,growth=growth,n=len(pairs),r=corr([(x,y) for p,x,y in pairs]),
                    past_n=len(past),past_r=corr(past),recent_n=len(recent),recent_r=corr(recent),recent_start='2025-Q1'))
    fingerprint=hashlib.sha256(b''.join((ROOT/n).read_bytes() for n in ['memory_trade_raw.csv','memory_trade_config.json','build_memory_trade.py'])).hexdigest()
    out=ROOT/'memory_trade.json'
    if out.exists() and json.loads(out.read_text()).get('fingerprint')==fingerprint:return
    payload=dict(**cfg,built_at=datetime.now(timezone.utc).isoformat(),fingerprint=fingerprint,monthly=monthly,quarterly=quarterly,coverage=coverage,flow_validation=validation,
        notes=['중량 KG는 제품 개수·메모리 비트 출하량이 아닙니다. 제품/포장/믹스 변화가 포함됩니다.',
        '국가 전체 흐름입니다. 수출입의 기업·용도·거래경로가 같다는 보장은 없습니다.',
        '서로 다른 국가의 HS분류를 기계적으로 대응시키지 않습니다. SSD 전체 시장 포괄 여부는 별도 검증이 필요합니다.',
        '수출입 시차 상관은 물류 흐름 참고용이며 기업 실적 선행 추정력이나 인과관계를 검증한 결과가 아닙니다.',
        '상관 표본이 8분기 미만이면 계산하지 않습니다. 최근 구간 표본이 작으면 안정성 확인 불가로 표시합니다.',
        '선행 창 1개월은 목표 4~6월 대신 수출 3~5월을 사용하는 방식이며, 통계 발표 지연도 고려해야 합니다.'],
        source='https://www.data.go.kr/data/15100475/openapi.do')
    out.write_text(json.dumps(payload,ensure_ascii=False,indent=2,allow_nan=False)+'\n');save('memory_trade_monthly.csv',monthly);save('memory_trade_quarterly.csv',quarterly);save('memory_trade_flow_validation.csv',validation)
    print('monthly',len(monthly),'quarterly',len(quarterly),'missing',sum(len(x['missing']) for x in coverage))
if __name__=='__main__':build()
