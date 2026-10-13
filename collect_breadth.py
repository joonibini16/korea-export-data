"""KRX daily full-market snapshots -> breadth_daily.json. No authentication bypass.
Uses existing market_daily.csv index sessions as the calendar; complete history required.
Raw snapshots cached outside published outputs, derived historical values preserved.
"""
import csv, gzip, json, math, os, time, urllib.request
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
CACHE = Path('.breadth-cache')
APIS = {'KOSPI': 'stk_bydd_trd', 'KOSDAQ': 'ksq_bydd_trd'}

def atomic(path, value):
    p = Path(path); temp = p.with_suffix(p.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8'); temp.replace(p)

def parse_snapshot(rows, day):
    if not isinstance(rows, list) or not rows: raise ValueError('empty snapshot on index trading date')
    out = {}; seen = set()
    for r in rows:
        code = r['ISU_CD']; stamp = r.get('BAS_DD', '').replace('-', '')
        if stamp and stamp != day.replace('-', ''): raise ValueError('response date mismatch')
        if code in seen: raise ValueError('duplicate stock code')
        seen.add(code)
        v = r.get('TDD_CLSPRC')
        if v in (None, '', '-'): continue
        x = float(str(v).replace(',', ''))
        if not math.isfinite(x) or x < 0: raise ValueError('invalid price')
        if x > 0: out[code] = x
    if not out: raise ValueError('no valid closes')
    return out

def snapshot(market, day, key):
    path = CACHE / f'{market}-{day}.json.gz'
    if path.exists():
        with gzip.open(path, 'rt', encoding='utf-8') as f: return json.load(f)
    req = urllib.request.Request(f'https://data-dbg.krx.co.kr/svc/apis/sto/{APIS[market]}?basDd={day.replace("-", "")}', headers={'AUTH_KEY': key})
    # Authentication/permission errors stop this market, never fall back to sample data.
    with urllib.request.urlopen(req, timeout=30) as r: data = json.load(r)
    result = parse_snapshot(data.get('OutBlock_1'), day)
    CACHE.mkdir(exist_ok=True)
    temp = path.with_suffix('.tmp')
    with gzip.open(temp, 'wt', encoding='utf-8') as f: json.dump(result, f)
    temp.replace(path); time.sleep(0.25)
    return result

def calculate(market, snapshots):
    """None snapshot or an absent stock breaks that stock's contiguous window."""
    windows = {}; output = []
    for day, prices in snapshots:
        if prices is None:
            windows = {}; output.append(dict(market=market,date=day,total=0,eligible_60=0,above_60=0,eligible_252=0,new_high=0,breadth_60=None,hli=None)); continue
        for code in list(windows):
            if code not in prices: del windows[code]
        e60 = above = e252 = highs = 0
        for code, price in prices.items():
            w = windows.setdefault(code, deque(maxlen=252)); w.append(price)
            if len(w) >= 60:
                e60 += 1; above += price > sum(list(w)[-60:]) / 60
            if len(w) == 252:
                e252 += 1; highs += price >= max(w)
        output.append(dict(market=market,date=day,total=len(prices),eligible_60=e60,above_60=above,eligible_252=e252,new_high=highs,
                           breadth_60=round(100*above/e60,6) if e60 else None,hli=round(100*highs/e252,6) if e252 else None))
    return output

def main():
    key = os.environ.get('KRX_API_KEY'); now = datetime.now(KST)
    status = dict(updated_at=now.isoformat(timespec='seconds'), failures=[], markets={})
    if not key:
        status.update(state='blocked',message='KRX 인증키 미등록: 전 종목 종가 수집 대기. 유가증권·코스닥 일별매매정보 이용승인과 KRX_API_KEY 등록이 필요합니다. 기존 관측값이 있으면 유지합니다.')
        atomic('breadth_status.json', status); print(status['message']); return
    calendar = defaultdict(set)
    for r in csv.DictReader(Path('market_daily.csv').open(encoding='utf-8-sig')):
        if r['symbol'] in ('^KS11','^KQ11') and r['date'] < now.date().isoformat() and r['date'] >= (now.date()-timedelta(days=820)).isoformat():
            calendar['KOSPI' if r['symbol']=='^KS11' else 'KOSDAQ'].add(r['date'])
    # Use previous dates only: KRX publication timing differs from the index close.
    old = json.loads(Path('breadth_daily.json').read_text()) if Path('breadth_daily.json').exists() else []
    merged = {(r['market'],r['date']):r for r in old}; budget = time.monotonic()+1000
    for market in APIS:
        snapshots = []; days = sorted(calendar[market])
        if not days: status['failures'].append({'market':market,'error':'index calendar missing'}); continue
        for day in days:
            if time.monotonic() > budget:
                status['failures'].append({'market':market,'date':day,'error':'time budget; cache retained for next run'}); break
            try: snapshots.append((day, snapshot(market,day,key)))
            except Exception as e:
                # Never include the secret or request URL in diagnostics.
                status['failures'].append({'market':market,'date':day,'error':type(e).__name__}); break
        calculated = calculate(market,snapshots)
        for r in calculated:
            k=(market,r['date'])
            if k in merged and r['breadth_60'] is None: continue
            if k in merged and r['hli'] is None and merged[k].get('hli') is not None:
                r.update({f:merged[k][f] for f in ('hli','eligible_252','new_high')})
            merged[k]=r
        status['markets'][market] = {'snapshots':len(snapshots),'expected':len(days),'latest':calculated[-1] if calculated else None}
    atomic('breadth_daily.json', sorted(merged.values(), key=lambda r:(r['market'],r['date'])))
    status['state']='partial' if status['failures'] else 'ok'
    status['message']='KRX 종가 수집: '+ ' · '.join(f'{m} {r["snapshots"]}/{r["expected"]}일' for m,r in status['markets'].items())
    if status['failures']: status['message']+=' · 일부 미수집: 다음 실행에서 캐시를 이어서 수집합니다.'
    atomic('breadth_status.json',status); print(status['message'])

if __name__=='__main__': main()
