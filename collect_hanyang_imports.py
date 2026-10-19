"""Vietnam -> Korea finished memory imports. Existing validated rows survive failures."""
import csv, json, os, re, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from decimal import Decimal
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
API = 'https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList'
ITEMS = {'8523511000': 'SSD', '8473304060': 'DRAM 모듈'}
FIELDS = ['월','품목명','HS코드','국가코드','국가명','수입금액_USD','수입중량_KG','데이터출처']

def number(v):
    if v is None or not v.strip(): raise ValueError('missing numeric field')
    n = Decimal(v.replace(',', '').strip())
    if not n.is_finite() or n < 0: raise ValueError('invalid numeric field')
    return int(n) if n == int(n) else float(n)

def fetch(code, start, end):
    key = urllib.parse.unquote(os.environ['CUSTOMS_API_KEY'])
    query = urllib.parse.urlencode(dict(serviceKey=key,strtYymm=start,endYymm=end,hsSgn=code,cntyCd='VN'))
    for attempt in range(3):
        try:
            with urllib.request.urlopen(API+'?'+query, timeout=90) as res: root=ET.fromstring(res.read())
            rc=root.findtext('.//resultCode')
            if rc != '00': raise ValueError('API result code '+str(rc))
            rows={}
            for item in root.findall('.//item'):
                month=(item.findtext('year') or '').strip()
                if not re.fullmatch(r'20\d\d\.\d\d',month): continue
                if not start <= month.replace('.','') <= end: raise ValueError('unexpected period')
                hs=(item.findtext('hsCd') or item.findtext('hsCode') or '').strip()
                country=(item.findtext('statCd') or '').strip()
                if hs and hs != code: raise ValueError('unexpected HS')
                if country and country != 'VN': raise ValueError('unexpected country')
                if month in rows: raise ValueError('duplicate month')
                rows[month]={'월':month,'품목명':ITEMS[code],'HS코드':code,'국가코드':'VN','국가명':'베트남',
                    '수입금액_USD':number(item.findtext('impDlr')),'수입중량_KG':number(item.findtext('impWgt')),
                    '데이터출처':'관세청 품목별 국가별 수출입실적'}
            time.sleep(1)
            return rows
        except Exception as exc:
            # Never log exception text: HTTP errors can contain the service-key URL.
            if attempt==2: raise RuntimeError(type(exc).__name__) from None
            time.sleep(3*(attempt+1))

def main():
    registered={r['hs_code'] for r in csv.DictReader((ROOT/'hs_codes.csv').open(encoding='utf-8-sig'))}
    assert set(ITEMS)<=registered
    out=ROOT/'hanyang_vietnam_imports.csv'
    existing=list(csv.DictReader(out.open(encoding='utf-8-sig'))) if out.exists() else []
    rows={(r['월'],r['HS코드']):r for r in existing}
    if len(rows)!=len(existing): raise ValueError('existing duplicates')
    for r in existing:
        if r['HS코드'] not in ITEMS or r['국가코드']!='VN': raise ValueError('existing mapping')
        number(r['수입금액_USD']); number(r['수입중량_KG'])
    now=datetime.now(timezone.utc); end=f'{now.year-1}12' if now.month==1 else f'{now.year}{now.month-1:02}'
    failures=[]; received=0
    for code in ITEMS:
        missing=[f'{y}.{m:02}' for y in range(2020,int(end[:4])+1) for m in range(1,13)
                 if f'{y}{m:02}'<=end and (f'{y}.{m:02}',code) not in rows]
        years=sorted({int(m[:4]) for m in missing}|{int(end[:4])})
        for year in years:
            start=f'{year}01'; stop=min(f'{year}12',end)
            try:
                got=fetch(code,start,stop)
                for month,r in got.items(): rows[(month,code)]=r
                received+=len(got)
                print(code,start,stop,'validated',len(got),flush=True)
            except RuntimeError as exc:
                failures.append(dict(hs_code=code,start=start,end=stop,error=str(exc)))
                print(code,start,stop,'failed',str(exc),flush=True)
    if rows:
        tmp=out.with_suffix('.tmp')
        with tmp.open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(rows[k] for k in sorted(rows))
        tmp.replace(out)
    missing=[dict(month=f'{y}.{m:02}',hs_code=c) for c in ITEMS for y in range(2020,int(end[:4])+1)
             for m in range(1,13) if f'{y}{m:02}'<=end and (f'{y}.{m:02}',c) not in rows]
    status=dict(checked_at=now.isoformat(),end_month=end,expected=2*((int(end[:4])-2020)*12+int(end[4:])),
                rows=len(rows),received=received,missing=missing,failures=failures,
                source='https://www.data.go.kr/data/15100475/openapi.do',
                note='한국 수입통계·상대국 VN. 빈 응답을 0으로 보완하지 않음. 금액 CIF·순중량 KG.')
    (ROOT/'hanyang_vietnam_import_status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n')
    print('rows',len(rows),'missing',len(missing),'failed',len(failures))

if __name__=='__main__': main()
