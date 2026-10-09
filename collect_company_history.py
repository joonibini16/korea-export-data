"""Collect public KIND quarterly statements from 2020; preserve verified data.

Backlog extraction is limited to reviewed table formats. Ambiguous formats stay missing.
"""
import json,re,time,urllib.request,urllib.parse,hashlib,pathlib,concurrent.futures
from lxml import html
ROOT=pathlib.Path(__file__).resolve().parent;CACHE=ROOT/'.history-cache';CACHE.mkdir(exist_ok=True)
def get(url,data=None):
 p=CACHE/(hashlib.sha256((url+str(data)).encode()).hexdigest()+'.html')
 if p.exists():return p.read_text()
 if data is None:
  for folder in ('filing-cache','/tmp/earnings-cache'):
   old=pathlib.Path(folder)/(hashlib.sha256(url.encode()).hexdigest()+'.html')
   if old.exists():
    raw=old.read_text(errors='replace');p.write_text(raw);return raw
 req=urllib.request.Request(url,data=urllib.parse.urlencode(data).encode() if data else None)
 raw=urllib.request.urlopen(req,timeout=40).read().decode('utf-8',errors='replace')
 if len(raw)<100:raise ValueError('Empty response')
 p.write_text(raw);return raw

def catalog(c):
 out=[]
 try:
  for start,end in [(f'{y}-01-01',f'{y}-12-31' if y<2026 else '2026-10-09') for y in range(2020,2027)]:
   p=dict(method='searchDetailsSub',forward='details_sub',repIsuSrtCd='A'+c['id'],searchCodeType='number',searchCorpName=c['id'],fromDate=start,toDate=end,disclosureType05='0501|0502|0503',currentPageSize='100',pageIndex='1')
   s=get('https://kind.krx.co.kr/disclosure/details.do',p)
   doc=html.fromstring(s)
   for a in doc.xpath('//a[contains(@onclick,"openDisclsViewer")]'):
    title=''.join(a.itertext());m=re.search(r'(사업|반기|분기)보고서.*\((20\d{2})\.(03|06|09|12)\)',title)
    if not m:continue
    y,month=int(m[2]),int(m[3]);period=f'{y}-Q{month//3}'
    if not '2020-Q1'<=period<='2026-Q2':continue
    acpt=re.search(r"openDisclsViewer\('(\d+)'",a.get('onclick'))[1]
    out.append(dict(company_id=c['id'],name=c['name'],period=period,acpt=acpt,title=title))
  # Most recently submitted correction for each period.
  selected={}
  for r in sorted(out,key=lambda r:r['acpt']):selected[r['period']]=r
  return dict(company_id=c['id'],reports=list(selected.values()))
 except Exception as e:return dict(company_id=c['id'],error=str(e),reports=out)

from decimal import Decimal
def text(e):return ' '.join(''.join(e.itertext()).split())
def rows(t):return [[text(c) for c in tr.xpath('./td|./th')] for tr in t.xpath('.//tr')]
def process(r):
 try:
  acpt=r['acpt'];v=get('https://kind.krx.co.kr/common/disclsviewer.do?method=searchInitInfo&acptNo='+acpt+'&docNo=')
  d=html.fromstring(v);op=d.xpath('//select[@id="mainDoc"]/option[@selected]')
  if not op:op=d.xpath('//select[@id="mainDoc"]/option[contains(@value,"|")]')
  if not op:raise ValueError('No main document')
  docno=op[0].get('value').split('|')[0]
  form='11011' if r['period'].endswith('Q4') else '11012' if r['period'].endswith('Q2') else '11013'
  u=f'https://kind.krx.co.kr/external/{acpt[:4]}/{acpt[4:6]}/{acpt[6:8]}/{acpt[8:]}/{docno}/{form}.htm'
  raw=get(u);d=html.fromstring(raw);ts=d.xpath('//table');found=[]
  # Exact title tables immediately precede standardized statement tables.
  for i,t in enumerate(ts):
   title=text(t).replace(' ','')
   if len(title)<600 and not re.search(r'(포괄)?손익계산서',title):
    previous=t.xpath('preceding-sibling::*[1]')
    if previous and re.fullmatch(r'(?:연결)?(?:포괄)?손익계산서',text(previous[0]).replace(' ','')):
     title=text(previous[0]).replace(' ','')
   if len(title)>600 or not re.search(r'(포괄)?손익계산서',title):continue
   basis='연결' if '연결' in title else '별도'
   context=ts[i:i+4]
   rr=[row for tb in context for row in rows(tb)]
   revenue=next((row for row in rr if row and re.sub(r'\s','',row[0]) in ('수익','수익(매출액)','매출액','영업수익','매출','Ⅰ.매출액')),None)
   profit=next((row for row in rr if row and re.sub(r'\s','',row[0]) in ('영업이익','영업이익(손실)','영업손익','영업손실')),None)
   unit=re.search(r'단위\s*:\s*(백만원|천원|원)', ' '.join(text(t) for t in context))
   if revenue and profit and unit:
    found.append(dict(basis=basis,unit=unit[1],revenue=revenue,profit=profit,header=rr[:8]))
  # Preserve small relevant tables for careful backlog validation; do not guess column order.
  bt=[]
  for i,t in enumerate(ts):
   tx=text(t)
   if ('수주잔고' in tx.replace(' ','') or '수주잔액' in tx.replace(' ','')) and len(tx)<45000:
    before=' '.join(text(e) for e in t.xpath('preceding-sibling::*[position()<=3]'))[-1300:]
    bt.append(dict(before=before,rows=rows(t)))
  return dict(**r,url=u,financial=found,backlog_tables=bt)
 except Exception as e:return dict(**r,error=str(e))

def number(s):
 s=s.replace(',','').replace(' ','').replace('−','-')
 if re.fullmatch(r'\([\d.]+\)',s):s='-'+s[1:-1]
 if not re.fullmatch(r'-?\d+(?:\.\d+)?',s):raise ValueError('non-number '+repr(s))
 return Decimal(s)
def extract(r,f):
 y=int(r['period'][:4]);q=int(r['period'][-1]);factor={'원':1,'천원':1000,'백만원':1000000}[f['unit']]
 header=' '.join(' '.join(a) for a in f['header'])
 if not re.search(str(y)+r'\s*[.년]',header):raise ValueError('report year missing')
 rev=[int(number(x)*factor) for x in f['revenue'][1:]];op=[int(number(x)*factor) for x in f['profit'][1:]]
 if len(rev)!=len(op) or any(x<0 for x in rev):raise ValueError('invalid amounts')
 a=dict(company_id=r['company_id'],year=y,quarter=q,basis=f['basis'],source=r['url'],revenue=rev,operating_profit=op,period_starts=[re.search(r'(20\d{2}\.\d{2}\.\d{2})', ' '.join(row))[1] for row in f['header'] if re.search(r'20\d{2}\.\d{2}\.\d{2}.*부터',' '.join(row))])
 if q in (2,3):
  if len(rev) not in (2,4) or '3개월' not in header or '누적' not in header:raise ValueError('ambiguous quarterly columns')
 elif q==1:
  if len(rev)==4 and rev[0]==rev[1] and rev[2]==rev[3] and op[0]==op[1] and op[2]==op[3]:
   a['revenue']=rev[::2];a['operating_profit']=op[::2]
  elif len(rev)==2 and '3개월' in header and '누적' in header and rev[0]==rev[1] and op[0]==op[1] and str(y-1)+'.' not in header:
   a['revenue']=rev[:1];a['operating_profit']=op[:1]
  elif len(rev)!=2:raise ValueError('ambiguous Q1 columns')
 else:
  if len(rev) not in (1,2,3):raise ValueError('ambiguous annual columns')
 return a



def main():
 import argparse,datetime,csv,os
 parser=argparse.ArgumentParser()
 parser.add_argument('--companies',nargs='*')
 args=parser.parse_args()
 companies=json.loads((ROOT/'company_watchlist.json').read_text())['companies']
 if args.companies:companies=[c for c in companies if c['id'] in args.companies]
 history_path=ROOT/'company_financial_history_sources.json'
 history=json.loads(history_path.read_text()) if history_path.exists() else dict(start_period='2020-Q1',end_period='2026-Q2',reports=[])
 report_map={(r['company_id'],r['year'],r['quarter'],r['basis']):r for r in history['reports']}
 backlog_path=ROOT/'company_backlog_sources.json'
 backlog=json.loads(backlog_path.read_text());observations={(r['company_id'],r['period']):r for r in backlog['observations']}
 failures=[];catalogs=[];simple={'222800','353200','007660','007810','051370','064760','103590'}
 scopes={r['company_id']:r['scope'] for r in backlog['observations']}
 with concurrent.futures.ThreadPoolExecutor(3) as pool:
  for result in pool.map(catalog,[c for c in companies if c['id'].isdigit()]):
   catalogs.append(result)
   if result.get('error'):failures.append(result)
   print('Catalog',result['company_id'],len(result['reports']),flush=True)
 # Fetch each source quarter for backlog; the same report supplies both financial bases.
 todo=[r for c in catalogs for r in c['reports']]
 issues=[];reviewed=[]
 with concurrent.futures.ThreadPoolExecutor(3) as pool:
  for r in pool.map(process,todo):
   if r.get('error'):
    failures.append(dict(company_id=r['company_id'],period=r['period'],error=r['error']));continue
   reviewed.append(dict(company_id=r['company_id'],period=r['period'],source=r['url']))
   for f in r['financial']:
    try:
     a=extract(r,f);report_map[a['company_id'],a['year'],a['quarter'],a['basis']]=a
    except Exception as error:issues.append(dict(company_id=r['company_id'],period=r['period'],metric='financial',reason=str(error)))
   cid=r['company_id'];key=(cid,r['period'])
   if cid in simple and key not in observations:
    candidates=[]
    for t in r['backlog_tables']:
     rr=t['rows'];header=' '.join(' '.join(a) for a in rr[:2]).replace(' ','');before=t['before'].replace(' ','')
     if not all(x in header for x in ('수주','기납','잔')):continue
     if cid=='007660' and '수주상황' not in t['before']:continue
     unit='USD_thousand' if ('천USD' in before or '천US$' in before) else 'KRW_million' if '백만원' in before else 'KRW_100m' if '억원' in before else 'KRW_thousand' if '천원' in before else None
     if not unit:continue
     totals=[a for a in rr[2:] if a and a[0].replace(' ','') in ('합계','계','총계')]
     if not totals:continue
     try:
      vals=totals[-1][1:]
      if len(vals)==6:amt=[number(x) for x in vals[1::2]]
      elif len(vals)==3 and ('금액' in header or '수량' not in header):amt=[number(x) for x in vals]
      else:continue
      gross,delivered,balance=amt
      if min(amt)<0 or (cid=='222800' and abs(gross-delivered-balance)>max(Decimal(2),gross*Decimal('0.00001'))):raise ValueError('공시 표 금액 산식 불일치')
      details=[a for a in rr[2:] if a and a[0].replace(' ','') not in ('합계','계','총계') and len(a)>=len(vals)]
      if details and abs(sum(number(a[-1]) for a in details)-balance)>Decimal(len(details)):raise ValueError('품목별 잔고 합계 불일치')
      candidates.append((unit,balance))
     except ValueError as error:issues.append(dict(company_id=cid,period=r['period'],metric='backlog',source=r['url'],reason=str(error)))
    candidates=list(dict.fromkeys(candidates))
    if len(candidates)==1:
     unit,value=candidates[0];old=next(a for a in backlog['observations'] if a['company_id']==cid)
     if ('USD' in old['raw_unit'])==('USD' in unit):
      observations[key]=dict(company_id=cid,period=r['period'],raw_value=str(value),raw_unit=unit,scope=scopes[cid],source=r['url'],status='공시 확인',notes='공시 수주상황의 명시적 잔고 금액 · 품목별 합계 대조')
   print(r['company_id'],r['period'],'statements',len(r['financial']),flush=True)
 history.update(reviewed_at=datetime.date.today().isoformat(),reports=list(report_map.values()),extraction_errors=issues)
 backlog.update(reviewed_at=history['reviewed_at'],start_period='2020-Q1',end_period='2026-Q2',observations=list(observations.values()),history_issues=[x for x in issues if x['metric']=='backlog'])
 for path,data in [(history_path,history),(backlog_path,backlog),(ROOT/'company_history_collection_status.json',dict(updated_at=history['reviewed_at'],start_period='2020-Q1',end_period='2026-Q2',reports_reviewed=reviewed,failures=failures,issues=issues))]:
  tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');os.replace(tmp,path)
 print('Completed',len(reviewed),'reports;',len(failures),'fetch failures;',len(issues),'validation issues')
 if not reviewed:raise SystemExit('No report could be verified; existing data retained')

if __name__=='__main__':main()
