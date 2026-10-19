"""Exploratory indicator audit. No optimized composite, no causal or validated forecast claim."""
import csv,json,math,statistics
from datetime import datetime,timezone,timedelta
from pathlib import Path
from lxml import html
import collect_company_history as h
from build_hanyang_vietnam import ratio,shift,period_months

ROOT=Path(__file__).resolve().parent
def read(f):return list(csv.DictReader((ROOT/f).open(encoding='utf-8-sig')))
def clean(s):return ''.join(s.split())
def val(s):
    s=clean(s).replace(',','').replace('%','')
    try:return float(s)
    except:return None
def correlation(p):
    if len(p)<3:return None
    x=statistics.mean(a for a,b in p);y=statistics.mean(b for a,b in p)
    xx=sum((a-x)**2 for a,b in p);yy=sum((b-y)**2 for a,b in p)
    return sum((a-x)*(b-y) for a,b in p)/math.sqrt(xx*yy) if xx*yy else None
def extract():
    src={r['period']:r['source'] for r in read('hanyang_product_revenue.csv') if r['segment']=='memory_module'}
    records=[]
    for p,u in sorted(src.items()):
        doc=html.fromstring(h.get(u));found={};phase=None
        for t in doc.xpath('//table')[:130]:
            rows=[[clean(''.join(c.itertext())) for c in tr.xpath('./td|./th')] for tr in t.xpath('.//tr')]
            tx=clean(''.join(t.itertext()));before=clean(''.join(''.join(e.itertext()) for e in t.xpath('preceding-sibling::*[position()<=4]')))
            if len(tx)>3500:continue
            if '사업소' in tx and '한양디지텍VINA' in tx and '시간당생산량' not in tx:
                if '생산실적' in before:phase='production'
                elif '생산능력' in before:phase='capacity'
                if phase:
                    for row in rows:
                        if '한양디지텍VINA' not in ''.join(row):continue
                        seg='memory_module' if '메모리모듈' in ''.join(row) else 'ssd' if 'SSD' in ''.join(row) else None
                        if not seg:continue
                        idx=next((i for i,c in enumerate(row) if '한양디지텍VINA' in c),None)
                        n=val(row[idx+1]) if idx is not None and len(row)>idx+1 else None
                        if n is not None:found.setdefault(seg,{})[phase+'_ytd']=n
            if '품목' in tx and '주요제품등의가격변동추이' in before and '단위:원' in before:
                for row in rows:
                    if row and row[0] in ['메모리모듈','SSD'] and len(row)>1:
                        found.setdefault('ssd' if row[0]=='SSD' else 'memory_module',{})['reported_unit_price_ytd_krw']=val(row[1])
            if '평균가동률' in tx and len(rows)>1:
                for row in rows[1:]:
                    if not row or len(row)<4:continue
                    seg='memory_module' if '메모리모듈' in row[0] else 'ssd' if 'SSD' in row[0] else None
                    if seg is None and '한양디지텍VINA' in row[0]:
                        seg='ssd' if before.rfind('SSD')>before.rfind('메모리모듈') else 'memory_module'
                    if seg:found.setdefault(seg,{}).update(available_hours_ytd=val(row[-3]),worked_hours_ytd=val(row[-2]),reported_utilization_ytd_pct=val(row[-1]))
        for seg,values in found.items():records.append(dict(period=p,segment=seg,source=u,**values))
    mp={(r['period'],r['segment']):r for r in records}
    revenues={(r['period'],r['segment']):float(r['revenue_krw']) for r in read('hanyang_product_revenue.csv') if r['revenue_krw']}
    for r in records:
        p,s=r['period'],r['segment'];q=int(p[-1]);prev=mp.get((p[:4]+'-Q'+str(q-1),s),{}) if q>1 else {}
        for f in ['production','capacity','available_hours','worked_hours']:
            a,b=r.get(f+'_ytd'),prev.get(f+'_ytd')
            r[f+'_quarter']=a if q==1 else a-b if a is not None and b is not None else None
        r['quality_flags']=[]
        if r.get('capacity_quarter') is not None and r['capacity_quarter']<0:
            r['capacity_quarter']=None;r['quality_flags'].append('생산능력 산출 기준 변경 가능: 누적 차감 불가')
        a,b=r.get('worked_hours_quarter'),r.get('available_hours_quarter')
        r['utilization_quarter_pct']=a/b*100 if a is not None and b is not None and b>0 else None
        if r['utilization_quarter_pct'] is not None and not 0<=r['utilization_quarter_pct']<=100:
            r['utilization_quarter_pct']=None;r['quality_flags'].append('가동시간 산출 기준 변경 가능: 분기 가동률 미산출')
        r['revenue_krw']=revenues.get((p,s));qty=r.get('production_quarter')
        r['revenue_per_produced_unit_krw']=r['revenue_krw']/qty if r['revenue_krw'] is not None and qty is not None and qty>0 else None
    return records

def model_error(pairs,minimum):
    # Expanding-window, ordered one-variable growth regression. No random split.
    pred=[]
    for i in range(minimum,len(pairs)):
        train=pairs[:i];test=pairs[i];mx=statistics.mean(a[1] for a in train);my=statistics.mean(a[2] for a in train)
        var=sum((a[1]-mx)**2 for a in train)
        if not var:continue
        slope=sum((a[1]-mx)*(a[2]-my) for a in train)/var
        y=my+slope*(test[1]-mx)
        pred.append(dict(period=test[0],actual=test[2],predicted=y,baseline_zero=0,baseline_training_mean=my,baseline_previous_growth=train[-1][2]))
    if not pred:return dict(n=0)
    mae=statistics.mean(abs(r['predicted']-r['actual']) for r in pred);zero=statistics.mean(abs(r['actual']) for r in pred);mean=statistics.mean(abs(r['baseline_training_mean']-r['actual']) for r in pred)
    persistence=statistics.mean(abs(r['baseline_previous_growth']-r['actual']) for r in pred)
    return dict(n=len(pred),mae_pp=mae,zero_growth_mae_pp=zero,training_mean_mae_pp=mean,previous_growth_mae_pp=persistence,improves_both=mae<zero and mae<mean,improves_all=mae<min(zero,mean,persistence),
        directional_accuracy=sum((r['predicted']>0)==(r['actual']>0) for r in pred)/len(pred),predictions=pred)

def audit(company):
    revenues={(r['period'],r['segment']):float(r['revenue_krw']) for r in read('hanyang_product_revenue.csv') if r['revenue_krw']}
    monthly={}
    config=json.loads((ROOT/'hanyang_vietnam_config.json').read_text())
    for spec in config['series']:
        code=spec['hs_code']
        for field,label in [('수출금액_USD','usd'),('수출중량_KG','kg')]:
            monthly[('export',code,label)]={r['월']:float(r[field]) for r in read('country_'+code+'.csv') if r['국가코드']=='VN' and r[field]!=''}
    for code in ['8473304060','8523511000']:
        for field,label in [('수입금액_USD','usd'),('수입중량_KG','kg')]:
            monthly[('import',code,label)]={r['월']:float(r[field]) for r in read('hanyang_vietnam_imports.csv') if r['HS코드']==code and r[field]!=''}
    fx={r['month']:float(r['krw_per_usd']) for r in read('fx_krw_usd.csv') if r['krw_per_usd']}
    for (direction,code,metric),values in list(monthly.items()):
        if metric!='usd':continue
        monthly[(direction,code,'krw_fx')]={m:v*fx[m] for m,v in values.items() if m in fx}
        kg=monthly[direction,code,'kg']
        monthly[(direction,code,'usd_per_kg')]={m:v/kg[m] for m,v in values.items() if kg.get(m,0)>0}
    results=[]
    for segment in ['memory_module','ssd']:
        target={p:v for (p,s),v in revenues.items() if s==segment}
        for (direction,code,metric),m in monthly.items():
            def aggregate(months):
                if metric=='usd_per_kg':
                    a=[monthly[direction,code,'usd'].get(t) for t in months];b=[monthly[direction,code,'kg'].get(t) for t in months]
                    return sum(a)/sum(b) if all(v is not None for v in a+b) and sum(b)>0 else None
                a=[m.get(t) for t in months]
                return sum(a) if all(v is not None for v in a) else None
            # 0,1,2 months before the quarter, fixed before inspecting results.
            for lag in [0,1,2]:
                sums={}
                for p in target:
                    a=aggregate([shift(t,-lag) for t in period_months(p)])
                    if a is not None:sums[p]=a
                for growth in ['yoy','qoq']:
                    pairs=[]
                    for p in sorted(target):
                        q=int(p[-1]);prior=str(int(p[:4])-1)+p[4:] if growth=='yoy' else p[:4]+'-Q'+str(q-1) if q>1 else str(int(p[:4])-1)+'-Q4'
                        # Feature denominator is fetched by calendar, not target availability.
                        prev=aggregate([shift(t,-lag) for t in period_months(prior)])
                        x=ratio(sums.get(p),prev);y=ratio(target[p],target.get(prior))
                        if x is not None and y is not None:pairs.append((p,x,y))
                    train=[(x,y) for p,x,y in pairs if p<='2024-Q4'];test=[(x,y) for p,x,y in pairs if p>'2024-Q4']
                    full=correlation([(x,y) for p,x,y in pairs]);a=correlation(train);b=correlation(test)
                    walk=model_error(pairs,12 if segment=='memory_module' else 8)
                    stable=full is not None and a is not None and b is not None and min(full,a,b)>0.3 and len(train)>=10 and len(test)>=6
                    passed=stable and walk['n']>=6 and walk.get('improves_all',False)
                    results.append(dict(segment=segment,direction=direction,hs_code=code,metric=metric,lead_months=lag,growth=growth,
                        n=len(pairs),correlation=full,train_n=len(train),train_correlation=a,test_n=len(test),test_correlation=b,
                        walk_forward=walk,stable_positive=stable,passes_exploratory_screen=passed))
    # Company production is an explanatory factor, disclosed alongside results, not an advance signal.
    internal=[]
    for seg in ['memory_module','ssd']:
        rows={r['period']:r for r in company if r['segment']==seg}
        for field in ['production_quarter','reported_unit_price_ytd_krw','utilization_quarter_pct']:
            pairs=[]
            for p,r in sorted(rows.items()):
                prior=str(int(p[:4])-1)+p[4:];old=rows.get(prior,{})
                x=ratio(r.get(field),old.get(field));y=ratio(r.get('revenue_krw'),old.get('revenue_krw'))
                if x is not None and y is not None:pairs.append((x,y))
            internal.append(dict(segment=seg,field=field,n=len(pairs),yoy_correlation=correlation(pairs),availability='분기 공시와 동시 공개. 선행 예측 변수로 평가하지 않음.'))
    return results,internal

def main():
    company=extract();external,internal=audit(company)
    j=dict(as_of=datetime.now(timezone(timedelta(hours=9))).date().isoformat(),company_operations=company,external_audit=external,internal_audit=internal,
        tested_specs=len(external),notes=['탐색적 비교이며 다중검정·선택편향을 제거한 최종 검증이 아닙니다.',
        '금액·중량의 단일 변수만 비교. 임의 가중치 합성지수와 미래 수치 생성 없음.',
        '학습 2024Q4까지/비교 2025Q1~2026Q2. SSD는 학습 표본이 부족해 통과 인정 불가.',
        '순차 모형은 과거 분기만 학습하되 공시일·통계 수정 시점별 원본 이력을 재현하지 않은 잠정값 기준 검증입니다.',
        '회사 생산량·가동률·단가는 실적과 함께 공개되는 사후 설명 자료이며 선행지표가 아닙니다.',
        '매출/생산량은 판매단가와 동일하지 않으며 생산·판매·재고 차이를 포함합니다.'])
    (ROOT/'hanyang_driver_audit.json').write_text(json.dumps(j,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    fields=['segment','direction','hs_code','metric','lead_months','growth','n','correlation','train_n','train_correlation','test_n','test_correlation','stable_positive','passes_exploratory_screen']
    with (ROOT/'hanyang_driver_audit.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(external)
    selected=[r for r in external if r['lead_months']==0 and (r['direction']=='export' and r['hs_code']=='8542321010' and ((r['metric']=='usd' and r['growth']=='yoy') or (r['metric']=='kg' and r['growth']=='qoq')) or r['direction']=='import' and r['hs_code'] in ['8473304060','8523511000'] and r['metric']=='usd' and r['growth']=='yoy' or r['direction']=='export' and r['hs_code']=='8542321030' and r['metric']=='kg' and r['growth']=='yoy')]
    selected=[{**r,'walk_forward':{k:v for k,v in r['walk_forward'].items() if k!='predictions'}} for r in selected]
    summary={k:v for k,v in j.items() if k!='external_audit'};summary['selected_external']=selected
    summary['notes']+=['선행 1개월은 목표 분기의 월별 합계 창을 한 달 앞당긴 값입니다(예: 4~6월 대신 3~5월). 완전히 이전 분기만 사용하는 예측과 다릅니다.',
        '금액은 월별 합산, 중량당 금액은 해당 3개월 USD 합계/KG 합계, 원화환산은 월별 USD×월평균 KRW/USD 합계.',
        '상관은 Pearson. 성장률의 중첩·표본 크기·사후 지표 선택으로 유의성이 과장될 수 있어 보조 후보로만 분류합니다.']
    summary['sources']=[dict(label='공시·생산수량·단가·산출기준',url='https://kind.krx.co.kr/external/2026/05/14/000548/20260514001234/11013.htm'),
        dict(label='최신 반기 공시',url='https://kind.krx.co.kr/external/2026/08/13/000590/20260813001569/11012.htm'),
        dict(label='베트남 법인별 선적 공개 표본·DDR5 모델/수량 확인',url='https://www.volza.com/company-profile/hanyang-digitech-vina-company-ltd-64429316/export/'),
        dict(label='베트남 법인별 국가·HS 분류 소개(정확한 수치 시계열 검증 전)',url='https://www.trademo.com/companies/cong-ty-tnhh-hanyang-digitech-vina/33116454')]
    summary['trade_scope_warning']='한국 HS 8523511000 통계를 한양디지텍 SSD 전체 출하로 간주하지 않습니다. 베트남 법인 선적 소개에 847170 저장장치 분류와 여러 도착지가 나타나므로 제품 설명·신고국별 분류·물류경로를 대조해야 합니다. 기존 hs_codes.csv는 변경하지 않았습니다.'
    (ROOT/'hanyang_driver_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    keys=sorted({k for r in company for k in r})
    with (ROOT/'hanyang_company_operations.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows({**r,'quality_flags':' / '.join(r['quality_flags'])} for r in company)
    print('company records',len(company),'tested',len(external),'screen passes',sum(r['passes_exploratory_screen'] for r in external))
    print('internal',json.dumps(internal,ensure_ascii=False))
    for seg in ['memory_module','ssd']:
        a=[r for r in external if r['segment']==seg and r['growth']=='yoy'];a.sort(key=lambda r:r['correlation'] if r['correlation'] is not None else -2,reverse=True)
        print('TOP',seg,json.dumps([{k:v for k,v in r.items() if k!='walk_forward'}|{'wf_n':r['walk_forward']['n'],'wf_improves_both':r['walk_forward'].get('improves_both')} for r in a[:6]],ensure_ascii=False))
if __name__=='__main__':main()
