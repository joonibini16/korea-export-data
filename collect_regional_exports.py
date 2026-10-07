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
import urllib.error
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

def parse_xml(body, hs, query_sido, start, end, stamp, stored_sido=None):
    stored_sido = stored_sido or query_sido
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
        key = (month, hs, stored_sido, region)
        if key in seen:
            raise DataError('duplicate response key')
        seen.add(key)
        result.append(dict(zip(FIELDS, [month,hs,stored_sido,region,number(item.findtext('expUsdAmt')),
            'API_EXP_USD_AMT_UNVERIFIED_SCALE',SOURCE,stamp])))
    return result

def request(hs, sido, start, end, key, stamp, stored_sido=None):
    query = urllib.parse.urlencode(dict(serviceKey=urllib.parse.unquote(key),
        strtYymm=start,endYymm=end,HsSgn=hs,sidoCd=sido))
    for attempt in range(3):
        try:
            with urllib.request.urlopen(URL+'?'+query,timeout=45) as response:
                data = response.read()
            return parse_xml(data,hs,sido,start,end,stamp,stored_sido)
        except urllib.error.HTTPError as exc:
            body = exc.read().decode('utf-8',errors='replace')
            known = ['SERVICE_ACCESS_DENIED_ERROR','SERVICE_KEY_IS_NOT_REGISTERED_ERROR','PERMISSION_DENIED','SERVICE_KEY_IS_NULL','LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR']
            reason = next((name for name in known if name in body), 'HTTP_' + str(exc.code))
            if exc.code in (400,401,403,404):
                raise DataError('API_ERROR_' + reason) from None
            failure = reason
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

def sites(company, hs):
    return [s for s in company.get('sites', [company]) if hs in s.get('hs_codes', company['hs_codes'])]

def query_code(company, hs):
    # An explicit reviewed mapping. The managed HS file is never modified.
    code = company.get('regional_hs', {}).get(hs, hs if len(hs) == 6 else None)
    if code is not None and (not re.fullmatch(r'\d{6}', code) or not hs.startswith(code)):
        raise DataError('invalid reviewed HS6 parent mapping')
    return code

def first_year(code):
    # HS2022 codes: do not invent narrower historical city data from broad legacy HS6.
    return 2022 if code in ('300249', '854143') else 2020

def period_segments(sido, start, end):
    """Return API province-code segments across the 2026-07 administration change.

    The CSV keeps the watchlist's current canonical code; only the request code
    changes. This prevents Gangwon/Jeonbuk and the merged Gwangju-Jeonnam area
    from losing pre/post-reorganization months.
    """
    aliases = {
        '51': [('42', '202001', '202606'), ('51', '202607', end)],
        '52': [('45', '202001', '202606'), ('52', '202607', end)],
        '42': [('42', start, min(end, '202606'))],
        '45': [('45', start, min(end, '202606'))],
        '12': [('29', start, min(end, '202606')), ('46', start, min(end, '202606'))],
        '46': [('46', start, min(end, '202606')), ('12', '202607', end)],
        '29': [('29', start, min(end, '202606')), ('12', '202607', end)],
    }
    return [(q, max(start, a), min(end, b)) for q, a, b in aliases.get(sido, [(sido, start, end)])
            if max(start, a) <= min(end, b)]

def main():
    now = datetime.now(timezone(timedelta(hours=9)))
    stamp = now.isoformat(timespec='seconds')
    # Match the confirmed nationwide coverage; do not collect future/unreleased months.
    with open('summary_all.csv',encoding='utf-8-sig') as f:
        end = max(r['월'] for r in csv.DictReader(f)).replace('.','')
    with open('hs_codes.csv',encoding='utf-8-sig') as f:
        allowed = {r[0] for r in list(csv.reader(f))[1:] if r}
    companies = json.loads(Path('company_watchlist.json').read_text())['companies']
    if any(hs not in allowed for c in companies for hs in c['hs_codes']):
        raise DataError('watchlist logical HS must exist in hs_codes.csv')
    targets = sorted({(s['sido_code'], query_code(c, hs)) for c in companies
        for hs in c['hs_codes'] if query_code(c, hs) for s in sites(c, hs)})
    path = Path('regional_exports.csv')
    old = list(csv.DictReader(path.open(encoding='utf-8-sig'))) if path.exists() else []
    def identity(r): return tuple(r[k] for k in ['month','hs_code','sido_code','region'])
    merged = {identity(r):r for r in old}
    if len(merged) != len(old): raise DataError('duplicate existing CSV keys')
    for row in old: number(row['export_amount_raw'])
    failures, received, requested = [], 0, 0
    key = os.environ.get('REGIONAL_CUSTOMS_API_KEY') or os.environ.get('CUSTOMS_API_KEY','')
    if not key:
        failures.append({'error':'CUSTOMS_API_KEY missing'})
    else:
        from concurrent.futures import ThreadPoolExecutor
        from threading import Event
        stop = Event()
        def collect_target(target):
            sido, hs = target
            collected, errors, count = [], [], 0
            keywords = {s['region_keyword'] for c in companies for logical in c['hs_codes']
                if query_code(c, logical) == hs for s in sites(c, logical) if s['sido_code'] == sido}
            # Retry missing years; refresh current and prior year for corrections.
            for year in range(first_year(hs),int(end[:4])+1):
                if stop.is_set(): break
                months = [f'{year}.{m:02}' for m in range(1,(int(end[4:]) if year==int(end[:4]) else 12)+1)]
                complete = all(set(months) <= {r['month'] for r in old if r['sido_code']==sido
                    and r['hs_code']==hs and keyword in r['region']} for keyword in keywords)
                if year < int(end[:4])-1 and complete: continue
                start, finish = f'{year}01', min(f'{year}12',end)
                for query_sido, seg_start, seg_end in period_segments(sido, start, finish):
                    count += 1
                    try:
                        rows = request(hs,query_sido,seg_start,seg_end,key,stamp,sido)
                        collected.extend(rows)
                        print(f'{sido}[{query_sido}]/{hs}/{seg_start}-{seg_end}: {len(rows)} rows',flush=True)
                    except DataError as exc:
                        # Some API deployments reject the retired province code
                        # for historical periods. Retry that same period with
                        # the current code before declaring it missing.
                        fallback_ok = False
                        if str(exc) == 'API_ERROR_99' and query_sido != sido:
                            try:
                                rows = request(hs,sido,seg_start,seg_end,key,stamp,sido)
                                collected.extend(rows)
                                print(f'{sido}[fallback]/{hs}/{seg_start}-{seg_end}: {len(rows)} rows',flush=True)
                                fallback_ok = True
                            except DataError:
                                fallback_ok = False
                        if fallback_ok:
                            time.sleep(1)
                            continue
                        errors.append(dict(sido=sido,query_sido=query_sido,hs=hs,start=seg_start,end=seg_end,error=str(exc)))
                        errors.append(dict(sido=sido,query_sido=query_sido,hs=hs,start=seg_start,end=seg_end,error=str(exc)))
                        print(f'{sido}[{query_sido}]/{hs}/{seg_start}-{seg_end}: {exc}',flush=True)
                        if any(token in str(exc) for token in ('SERVICE_KEY', 'ACCESS_DENIED', 'PERMISSION', 'HTTP_401', 'HTTP_403', 'LIMITED_NUMBER')):
                            stop.set()
                            break
                    time.sleep(1)
                if stop.is_set(): break
            return collected, errors, count
        # At most three independent requests; retries and pauses remain bounded.
        with ThreadPoolExecutor(max_workers=3) as pool:
            for rows, errors, count in pool.map(collect_target, targets):
                merged.update({identity(r):r for r in rows})
                received += len(rows)
                failures.extend(errors)
                requested += count
    if received:
        import io
        buffer = io.StringIO(newline='')
        writer=csv.DictWriter(buffer,fieldnames=FIELDS);writer.writeheader()
        writer.writerows(sorted(merged.values(),key=identity))
        save(path,buffer.getvalue())
    coverage=[]
    for c in companies:
        for hs in c['hs_codes']:
            code = query_code(c, hs)
            for site in sites(c, hs):
                present={r['month'] for r in merged.values() if r['hs_code']==code and r['sido_code']==site['sido_code'] and site['region_keyword'] in r['region']}
                expected=[f'{y}.{m:02}' for y in range(first_year(code),int(end[:4])+1) for m in range(1,13) if f'{y}{m:02}'<=end] if code else []
                coverage.append(dict(company=c['id'],hs=hs,query_hs=code,region=site['region_keyword'],sido=site['sido_code'],months=len(present),
                    expected_months=len(expected),missing=[m for m in expected if m not in present],
                    scope='HS6' if code==hs else 'parent_HS6_proxy' if code else 'unsupported_HS4',
                    historical_note='2020~2021 지역 HS 연결 미확보' if first_year(code)==2022 else ''))
    status=dict(updated_at=stamp,source=SOURCE,requested_ranges=requested,received_rows=received,
        stored_rows=len(merged),failures=failures,coverage=coverage,currency_scale_verified=False,
        note='지역 원본 HS6 보존. 관리 HS10과 상위 HS6 proxy 구분. HS4 미지원. 2022년 신설 HS의 과거 지역 데이터는 미연결. 절대 USD 배율 미검증.')
    save(Path('regional_status.json'),json.dumps(status,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(status,ensure_ascii=False))
    return 1 if failures or any(c['missing'] for c in coverage) else 0

if __name__=='__main__':
    raise SystemExit(main())
