"""Independent city/HS6 collector. Never edits monthly/country/provisional CSVs.

Public source: https://www.data.go.kr/data/15134343/openapi.do
Retains expUsdAmt in the API's original numeric unit: currency scale is not
assumed. Regional dashboard uses scale-invariant YoY/index until verified.
"""
import csv
import json
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

URL = 'https://apis.data.go.kr/1220000/sigunguperprlstperacrs/getSigunguPerPrlstPerAcrs'
SOURCE = 'https://www.data.go.kr/data/15134343/openapi.do'
FIELDS = ['month','hs_code','sido_code','region','export_amount_raw','amount_unit','source','retrieved_at']

class DataError(Exception):
    pass

def number(value):
    if value is None or not value.strip():
        raise DataError('missing amount')
    try:
        n = Decimal(value.strip().replace(',', ''))
    except InvalidOperation:
        raise DataError('invalid numeric format') from None
    if not n.is_finite() or n < 0:
        raise DataError('negative/non-finite amount')
    return str(n)

def parse_xml(body, hs, sido, start, end, stamp):
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        raise DataError('invalid XML') from None
    code = root.findtext('.//resultCode') or root.findtext('.//returnReasonCode')
    if code and code.strip() not in ('00','0','000'):
        # Never log exception URLs or service keys.
        raise DataError('API_ERROR_' + re.sub(r'[^A-Za-z0-9_]', '', code)[:20])
    items = root.findall('.//item')
    total = root.findtext('.//totalCount')
    if total is not None and int(total) != len(items):
        raise DataError('incomplete response count')
    if not items:
        raise DataError('empty response; not zero')
    result, seen = [], set()
    for item in items:
        month = (item.findtext('priodTitle') or '').strip()
        region = (item.findtext('sggNm') or '').strip()
        actual_hs = (item.findtext('hsSgn') or '').strip()
        if not re.fullmatch(r'\d{4}\.(0[1-9]|1[0-2])', month):
            raise DataError('unexpected period schema')
        if not start <= month.replace('.','') <= end or actual_hs != hs or not region:
            raise DataError('response scope mismatch')
        key = (month, hs, sido, region)
        if key in seen:
            raise DataError('duplicate response key')
        seen.add(key)
        result.append(dict(zip(FIELDS, [month,hs,sido,region,number(item.findtext('expUsdAmt')),
            'API_EXP_USD_AMT_UNVERIFIED_SCALE',SOURCE,stamp])))
    return result

def request(hs, sido, start, end, key, stamp):
    query = urllib.parse.urlencode(dict(serviceKey=urllib.parse.unquote(key),
        strtYymm=start,endYymm=end,HsSgn=hs,sidoCd=sido))
    for attempt in range(3):
        try:
            with urllib.request.urlopen(URL+'?'+query,timeout=45) as response:
                data = response.read()
            return parse_xml(data,hs,sido,start,end,stamp)
        except DataError as exc:
            if str(exc).startswith('API_ERROR_'):
                raise
            failure = str(exc)
        except Exception as exc:
            failure = type(exc).__name__  # exception text can contain credential
        if attempt < 2:
            time.sleep(2 ** (attempt+1))
    raise DataError(failure)

def save(path, text):
    temp = Path(str(path)+'.tmp')
    temp.write_text(text,encoding='utf-8')
    temp.replace(path)

def main():
    now = datetime.now(timezone(timedelta(hours=9)))
    stamp = now.isoformat(timespec='seconds')
    # Match the confirmed nationwide coverage; do not collect future/unreleased months.
    with open('summary_all.csv',encoding='utf-8-sig') as f:
        end = max(r['월'] for r in csv.DictReader(f)).replace('.','')
    with open('hs_codes.csv',encoding='utf-8-sig') as f:
        allowed = {r[0] for r in list(csv.reader(f))[1:] if r}
    companies = json.loads(Path('company_watchlist.json').read_text())['companies']
    targets = sorted({(c['sido_code'],hs) for c in companies for hs in c['hs_codes']})
    if any(hs not in allowed or not re.fullmatch(r'\d{6}',hs) for _,hs in targets):
        raise DataError('watchlist must use existing HS6 in hs_codes.csv')
    path = Path('regional_exports.csv')
    old = list(csv.DictReader(path.open(encoding='utf-8-sig'))) if path.exists() else []
    def identity(r): return tuple(r[k] for k in ['month','hs_code','sido_code','region'])
    merged = {identity(r):r for r in old}
    if len(merged) != len(old): raise DataError('duplicate existing CSV keys')
    for row in old: number(row['export_amount_raw'])
    failures, received, requested = [], 0, 0
    key = os.environ.get('CUSTOMS_API_KEY','')
    if not key:
        failures.append({'error':'CUSTOMS_API_KEY missing'})
    else:
        for sido, hs in targets:
            # Retry missing years; refresh current and prior year for corrections.
            for year in range(2020,int(end[:4])+1):
                months = [f'{year}.{m:02}' for m in range(1,(int(end[4:]) if year==int(end[:4]) else 12)+1)]
                existing = {r['month'] for r in old if r['sido_code']==sido and r['hs_code']==hs}
                if year < int(end[:4])-1 and set(months) <= existing: continue
                start, finish = f'{year}01', min(f'{year}12',end)
                requested += 1
                try:
                    rows = request(hs,sido,start,finish,key,stamp)
                    merged.update({identity(r):r for r in rows})
                    received += len(rows)
                    print(f'{sido}/{hs}/{year}: {len(rows)} rows',flush=True)
                except DataError as exc:
                    failures.append(dict(sido=sido,hs=hs,start=start,end=finish,error=str(exc)))
                    print(f'{sido}/{hs}/{year}: {exc}',flush=True)
                    if str(exc).startswith('API_ERROR_'): break
                time.sleep(1)
    if received:
        import io
        buffer = io.StringIO(newline='')
        writer=csv.DictWriter(buffer,fieldnames=FIELDS);writer.writeheader()
        writer.writerows(sorted(merged.values(),key=identity))
        save(path,buffer.getvalue())
    coverage=[]
    for c in companies:
        for hs in c['hs_codes']:
            present={r['month'] for r in merged.values() if r['hs_code']==hs and r['sido_code']==c['sido_code'] and c['region_keyword'] in r['region']}
            expected=[f'{y}.{m:02}' for y in range(2020,int(end[:4])+1) for m in range(1,13) if f'{y}{m:02}'<=end]
            coverage.append(dict(company=c['id'],hs=hs,months=len(present),missing=[m for m in expected if m not in present]))
    status=dict(updated_at=stamp,source=SOURCE,requested_ranges=requested,received_rows=received,
        stored_rows=len(merged),failures=failures,coverage=coverage,currency_scale_verified=False,
        note='지역 수출액은 API 원단위 보존. 절대 USD 및 중량·단가 미표시. 지역 YoY·지수만 사용.')
    save(Path('regional_status.json'),json.dumps(status,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(status,ensure_ascii=False))
    return 1 if failures or any(c['missing'] for c in coverage) else 0

if __name__=='__main__':
    raise SystemExit(main())
