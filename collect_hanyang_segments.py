"""Product revenue, not the broad manufacturing segment. Main-business product table, KRW millions."""
import csv,json,re,time,urllib.request,hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from lxml import html
import collect_company_history as history

ROOT=Path(__file__).resolve().parent
PRODUCTS={'메모리모듈':'memory_module','SSD':'ssd'}
FIELDS=['period','segment','revenue_krw','cumulative_revenue_krw','company_revenue_krw','company_cumulative_revenue_krw','basis','precision','source','prior_source']
def norm(s):return re.sub(r'\s|　','',s)
def parse(content):
    doc=html.fromstring(content)
    for t in doc.xpath('//table'):
        txt=norm(''.join(t.itertext()))
        if not all(k in txt for k in ['메모리모듈','매출액','비율']):continue
        before=norm(' '.join(''.join(e.itertext()) for e in t.xpath('preceding-sibling::*[position()<=3]')))
        if '단위:백만원' not in before:continue
        found={};total=None;parts=[]
        for tr in t.xpath('.//tr'):
            c=[norm(''.join(x.itertext())) for x in tr.xpath('./td|./th')]
            if len(c)<3:continue
            label=c[0]
            value=c[-2].replace(',','')
            if value=='-':value='0'
            if not re.fullmatch(r'\d+(?:\.\d+)?',value):continue
            n=round(float(value)*1000000)
            if label in PRODUCTS:found[PRODUCTS[label]]=n
            if label in ('합계','계'):total=n
            else:parts.append(n)
        if 'memory_module' in found and total is not None:
            if abs(sum(parts)-total)>3000000:raise ValueError('rounded product sum mismatch')
            return found,total
    raise ValueError('product revenue table unavailable')

def scan(r):
    p=r['period']
    try:
        acpt=r['acpt'];viewer=html.fromstring(history.get('https://kind.krx.co.kr/common/disclsviewer.do?method=searchInitInfo&acptNo='+acpt+'&docNo='))
        options=viewer.xpath('//select[@id="mainDoc"]/option[@selected]') or viewer.xpath('//select[@id="mainDoc"]/option[contains(@value,"|")]')
        docno=options[0].get('value').split('|')[0]
        form='11011' if p.endswith('Q4') else '11012' if p.endswith('Q2') else '11013'
        url=f'https://kind.krx.co.kr/external/{acpt[:4]}/{acpt[4:6]}/{acpt[6:8]}/{acpt[8:]}/{docno}/{form}.htm'
        data=history.get(url)
        body=norm(''.join(html.fromstring(data).xpath('//body')[0].itertext()))[:600]
        dates=re.search(r'사업연도(20\d\d)년01월01일부터(20\d\d)년(\d\d)월\d\d일까지',body)
        if not dates or dates[1]!=p[:4] or dates[2]!=p[:4] or int(dates[3])!=int(p[-1])*3:
            raise ValueError('actual fiscal period does not match catalog')
        vals,total=parse(data)
        return p,dict(values=vals,total=total,source=url,report_title=r['title']),None
    except Exception as e:return p,None,type(e).__name__+': '+str(e)[:150]

def main():
    catalog=history.catalog(dict(id='078350',name='한양디지텍'))
    if catalog.get('error'):raise ValueError('KIND catalog failed: '+catalog['error'])
    todo=catalog['reports']
    results=list(ThreadPoolExecutor(3).map(scan,todo));ym={p:d for p,d,e in results if d};fail=[dict(period=p,error=e) for p,d,e in results if e]
    path=ROOT/'hanyang_product_revenue.csv'
    old=list(csv.DictReader(path.open(encoding='utf-8-sig'))) if path.exists() else []
    rows={(r['period'],r['segment']):r for r in old}
    for p,d in sorted(ym.items()):
        q=int(p[-1]);prior=ym.get(p[:4]+'-Q'+str(q-1)) if q>1 else None
        for seg,cur in d['values'].items():
            value=cur if q==1 else cur-prior['values'][seg] if prior and seg in prior['values'] else None
            if value is not None and value<0:raise ValueError('negative product quarter')
            rows[(p,seg)]=dict(period=p,segment=seg,revenue_krw='' if value is None else value,
                cumulative_revenue_krw=cur,company_revenue_krw=d['total'] if q==1 else d['total']-prior['total'] if prior else '',
                company_cumulative_revenue_krw=d['total'],basis='연결',precision='사업의 내용 매출표·백만원 반올림; Q2~Q4는 누적 차감',
                source=d['source'],prior_source=prior['source'] if prior else '')
    if rows:
        with path.open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(rows[k] for k in sorted(rows))
    missing=[dict(period=p,segment=s,reason='제품 매출 별도 미표시 또는 직전 누적 미확보') for p in sorted(ym) for s in PRODUCTS.values() if (p,s) not in rows or rows[(p,s)]['revenue_krw']=='']
    (ROOT/'hanyang_product_revenue_status.json').write_text(json.dumps(dict(reports=len(todo),parsed=len(ym),failures=fail,missing=missing),ensure_ascii=False,indent=2)+'\n')
    print('reports',len(todo),'parsed',len(ym),'failures',fail,flush=True)

if __name__=='__main__':main()
