"""Industry-by-industry market breadth for every current KOSPI/KOSDAQ listed company.

KIND's official 업종 labels are the groups; Naver daily closing prices are the price source.
Each run fetches a bounded number of whole industry groups. Prior verified groups are retained.
"""
import argparse
import csv
import json
import math
import re
import hashlib
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

from collect_breadth_naver import KST, Table, closes, get

FIELDS = ('date','market','sector','n60','above60','breadth60','n250','nh','nl','hli')
STOCK_FIELDS = ('market','sector','code','name','date','close','sma60','above60','high250','low250','new_high','new_low')
CATALOG_FIELDS = ('market','sector','code','name','listed_date')

def catalog():
    result = {}
    for code, market in [('stockMkt','KOSPI'),('kosdaqMkt','KOSDAQ')]:
        html = get(f'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&marketType={code}',60).decode('euc-kr','replace')
        p = Table();p.feed(html)
        if not p.rows: raise ValueError(market+' KIND empty')
        head = p.rows[0]
        col = {k:head.index(k) for k in ('회사명','종목코드','업종','상장일')}
        for r in p.rows[1:]:
            if len(r)<=max(col.values()): continue
            stock = r[col['종목코드']].strip().zfill(6)
            if not re.fullmatch(r'[0-9A-Z]{6}',stock): continue
            if (market,stock) in result: raise ValueError('KIND duplicate '+market+' '+stock)
            row = dict(market=market,sector=r[col['업종']].strip() or '업종 미분류',code=stock,name=r[col['회사명']].strip(),listed_date=r[col['상장일']].strip())
            result[market,stock]=row
    if len(result)<2000: raise ValueError('KIND listing unexpectedly short')
    return sorted(result.values(),key=lambda r:(r['market'],r['sector'],r['code']))

def readcsv(path):
    if not Path(path).exists(): return []
    with open(path,encoding='utf-8-sig',newline='') as f: return list(csv.DictReader(f))

def writecsv(path,fields,rows):
    dest=Path(path);tmp=dest.with_suffix(dest.suffix+'.tmp')
    with tmp.open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
    tmp.replace(dest)

def atomic_json(path,obj):
    dest=Path(path);tmp=dest.with_suffix(dest.suffix+'.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=1)+'\n');tmp.replace(dest)

def compute_group(market, sector, prices, window=540):
    """Compute a sector with the same rolling definitions as the existing Naver fallback."""
    import pandas as pd
    today=datetime.now(KST).date(); cutoff=(today-timedelta(days=window+390)).isoformat()
    raw={code:{d:v for d,v in vals.items() if d>=cutoff} for code,vals in prices.items() if vals}
    if not raw: raise ValueError('no stock closes')
    data=pd.DataFrame({code:pd.Series(p,dtype='float64') for code,p in raw.items()}).sort_index()
    if data.empty: raise ValueError('no observations')
    # Companies without a quote on a date remain absent (not forward filled).
    sma=data.rolling(60,min_periods=55).mean(); high=data.rolling(250,min_periods=230).max(); low=data.rolling(250,min_periods=230).min()
    valid60=data.notna()&sma.notna(); valid250=data.notna()&high.notna()
    # Same exclusive low/high classification as the existing full-market collector.
    is_high=(data>=high)&valid250;is_low=(data<=low)&valid250&~is_high
    out=[]; recent=(today-timedelta(days=window)).isoformat()
    for d in data.index[data.index>=recent]:
        n=int(valid60.loc[d].sum());hi=int(is_high.loc[d].sum());lo=int(is_low.loc[d].sum());k=int(valid250.loc[d].sum());above=int(((data.loc[d]>sma.loc[d])&valid60.loc[d]).sum())
        if not n: continue
        out.append(dict(date=d,market=market,sector=sector,n60=n,above60=above,breadth60=round(100*above/n,2),n250=k,nh=hi,nl=lo,hli=round(100*hi/k,2) if k else ''))
    latest=data.index[-1];stock=[]
    for code in prices:
        if code not in data or not prices[code]:continue
        ds=data[code].dropna();d=ds.index[-1];c=float(ds.iloc[-1]);m=sma.at[d,code];h=high.at[d,code];l=low.at[d,code]
        stock.append(dict(market=market,sector=sector,code=code,name='',date=d,close=c,sma60=round(float(m),3) if math.isfinite(m) else '',above60=int(c>m) if math.isfinite(m) else '',high250=round(float(h),3) if math.isfinite(h) else '',low250=round(float(l),3) if math.isfinite(l) else '',new_high=int(c>=h) if math.isfinite(h) else '',new_low=int(c<=l and c<h) if math.isfinite(l) and math.isfinite(h) else ''))
    if not out:raise ValueError('no eligible 60-day observations')
    return out,stock

def choose(groups,status,limit):
    # Newly discovered groups first by company count; then oldest verified group.
    last=status.get('groups',{})
    attempts=status.get('attempts',{})
    return sorted(groups,key=lambda k:(1 if last.get(k,{}).get('members')==members(groups[k]) else 0,attempts.get(k,0),last.get(k,{}).get('updated_at',''),-len(groups[k]),k))[:limit]

def members(records):
    return hashlib.sha256(','.join(sorted(r['code'] for r in records)).encode()).hexdigest()

def last_confirmed(now=None):
    """Do not treat the live Naver fchart bar as a final daily close before 16:30 KST."""
    now=now or datetime.now(KST)
    day=now.date() if (now.hour,now.minute)>=(16,30) else now.date()-timedelta(days=1)
    return day.isoformat()

def published_during_session(meta):
    """Identify same-day bars saved by older collector revisions during market hours."""
    try:
        at=datetime.fromisoformat(meta['updated_at']).astimezone(KST)
        return meta.get('latest')==at.date().isoformat() and (at.hour,at.minute)<(16,30)
    except (KeyError,ValueError,TypeError):return False

def main():
    arg=argparse.ArgumentParser();arg.add_argument('--groups',type=int,default=12);args=arg.parse_args()
    if not 1<=args.groups<=24:arg.error('--groups must be 1..24')
    latest=catalog();groups=defaultdict(list)
    for r in latest:groups[r['market']+'|'+r['sector']].append(r)
    prior=json.loads(Path('sector_breadth_status.json').read_text()) if Path('sector_breadth_status.json').exists() else {}
    confirmed=last_confirmed()
    status={'updated_at':datetime.now(KST).isoformat(timespec='seconds'),'source':'KIND 상장법인목록 + 네이버 fchart 확정 종가','confirmed_through':confirmed,'groups':prior.get('groups',{}),'attempts':prior.get('attempts',{}),'issues':[], 'listed':len(latest)}
    invalid={k for k,v in status['groups'].items() if v.get('latest','')>confirmed or published_during_session(v)}
    stored={(r['market'],r['sector'],r['date']):r for r in readcsv('sector_breadth.csv') if r['date']<=confirmed and not (r['market']+'|'+r['sector'] in invalid and r['date']>=status['groups'][r['market']+'|'+r['sector']]['latest'])}
    stocks={(r['market'],r['code']):r for r in readcsv('sector_stock_latest.csv') if r['date']<=confirmed and not (r['market']+'|'+r['sector'] in invalid and r['date']>=status['groups'][r['market']+'|'+r['sector']]['latest'])}
    writecsv('market_sector_catalog.csv',CATALOG_FIELDS,latest)
    selected=sorted(invalid & set(groups),key=lambda k:(-len(groups[k]),k))[:args.groups]
    if len(selected)<args.groups:
        selected+= [k for k in choose(groups,status,len(groups)) if k not in selected and k not in invalid][:args.groups-len(selected)]
    for key in invalid:status['groups'].pop(key,None)
    for key in selected:
        records=groups[key];market,sector=key.split('|',1);fetched={};errors=[]
        status['attempts'][key]=status['attempts'].get(key,0)+1
        def one(r):
            try:return r['code'],{d:v for d,v in closes(r['code']).items() if d<=confirmed},None
            except Exception as e:return r['code'],{},type(e).__name__
        with ThreadPoolExecutor(max_workers=6) as pool:
            for code,series,error in pool.map(one,records):
                fetched[code]=series
                if error:errors.append({'code':code,'error':error})
        verified=sum(bool(v) for v in fetched.values()); total=len(records)
        # A successful HTTP response with no price history is distinct from a failed request.
        # It remains in the full listing, but cannot enter either moving-average denominator.
        no_history=[r['code'] for r in records if not fetched[r['code']] and r['code'] not in {e['code'] for e in errors}]
        if errors or not verified:
            status['issues'].append({'market':market,'sector':sector,'success':verified,'target':total,'unavailable':no_history[:20],'failed':errors[:20]})
            print('INCOMPLETE',market,sector,verified,total,flush=True)
            continue
        try:observations,individual=compute_group(market,sector,fetched)
        except Exception as e:
            status['issues'].append({'market':market,'sector':sector,'error':str(e)[:120]});continue
        for row in observations:stored[market,sector,row['date']]=row
        for r in records:
            item=next((s for s in individual if s['code']==r['code']),None)
            if item:item['name']=r['name'];stocks[market,r['code']]=item
        status['groups'][key]={'market':market,'sector':sector,'target':total,'success':verified,'unavailable':no_history,'members':members(records),'latest':observations[-1]['date'],'updated_at':status['updated_at'],'observations':len(observations)}
        status['attempts'][key]=0
        print('OK',market,sector,verified,total,flush=True)
    # Delete delisted company from the *current* constituents table; retain historical sector series.
    allowed={(r['market'],r['code']) for r in latest}
    stocks={k:v for k,v in stocks.items() if k in allowed}
    writecsv('sector_breadth.csv',FIELDS,sorted(stored.values(),key=lambda r:(r['market'],r['sector'],r['date'])))
    writecsv('sector_stock_latest.csv',STOCK_FIELDS,sorted(stocks.values(),key=lambda r:(r['market'],r['sector'],r['code'])))
    status['industry_total']=len(groups)
    done={k for k in groups if status['groups'].get(k,{}).get('members')==members(groups[k])}
    status['industry_done']=len(done)
    status['stock_done']=sum(status['groups'][k]['success'] for k in done)
    atomic_json('sector_breadth_status.json',status)
    print('progress',status['industry_done'],status['industry_total'],status['stock_done'],len(latest),flush=True)

if __name__=='__main__':main()
