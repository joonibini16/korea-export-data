"""당일 외국인 '매수' 거래대금(순매수 아님) ÷ 시가총액 순위 → foreign_buy.json (+ 날짜별 누적 foreign_buy_hist.csv)

출처
- 외국인 매수·매도 거래대금: KRX 정보데이터시스템 '투자자별 순매수상위종목'(MDCSTAT02401, 투자자=외국인)
- 시가총액: KRX Open API 일별매매정보(stk_bydd_trd / ksq_bydd_trd, KRX_API_KEY) — 실패 시 KRX 정보데이터시스템 전종목 시세(MDCSTAT01501)
"""
import csv, datetime as dt, json, os, pathlib, sys, time, urllib.request
import requests

KST = dt.timezone(dt.timedelta(hours=9))
OUT = pathlib.Path('foreign_buy.json'); HIST = pathlib.Path('foreign_buy_hist.csv'); STATUS = pathlib.Path('foreign_buy_status.json')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
LOADER = 'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020303'
JSON = 'https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd'
MKT = {'KOSPI': ('STK', 'stk_bydd_trd'), 'KOSDAQ': ('KSQ', 'ksq_bydd_trd')}
status = {'run': dt.datetime.now(KST).isoformat(timespec='seconds'), 'steps': []}
num = lambda s: float(str(s).replace(',', '') or 0) if str(s).replace(',', '').replace('-', '').replace('.', '').isdigit() else 0.0


def log(**k):
    status['steps'].append(k); print(k, flush=True)


S = requests.Session(); S.headers.update({'User-Agent': UA, 'Referer': LOADER, 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json, text/javascript, */*; q=0.01'})


def krx(bld, **params):
    r = S.post(JSON, data={'bld': bld, 'locale': 'ko_KR', **params}, timeout=40)
    if r.status_code != 200 or not r.text.strip().startswith('{'):
        raise RuntimeError(f'{r.status_code} {r.text[:200]!r}')
    return r.json()


def trade_days(n=10):
    d = dt.datetime.now(KST).date(); out = []
    while len(out) < n:
        if d.weekday() < 5: out.append(d.strftime('%Y%m%d'))
        d -= dt.timedelta(days=1)
    return out


def caps_openapi(mkt, day):
    key = os.environ.get('KRX_API_KEY')
    if not key: raise RuntimeError('KRX_API_KEY 없음')
    req = urllib.request.Request(f'https://data-dbg.krx.co.kr/svc/apis/sto/{MKT[mkt][1]}?basDd={day}', headers={'AUTH_KEY': key})
    rows = json.loads(urllib.request.urlopen(req, timeout=40).read()).get('OutBlock_1', [])
    return {r['ISU_CD']: dict(name=r['ISU_NM'], cap=num(r['MKTCAP']), close=num(r['TDD_CLSPRC']), chg=num(r.get('FLUC_RT', 0)) if str(r.get('FLUC_RT', '')).strip('-').replace('.', '').isdigit() else None, val=num(r.get('ACC_TRDVAL', 0))) for r in rows}


def caps_krx(mkt, day):
    j = krx('dbms/MDC/STAT/standard/MDCSTAT01501', mktId=MKT[mkt][0], trdDd=day, share='1', money='1', csvxls_isNo='false')
    return {r['ISU_SRT_CD']: dict(name=r['ISU_ABBRV'], cap=num(r['MKTCAP']), close=num(r['TDD_CLSPRC']), chg=float(r['FLUC_RT']) if r.get('FLUC_RT', '').replace('-', '').replace('.', '').isdigit() else None, val=num(r['ACC_TRDVAL'])) for r in j.get('OutBlock_1', [])}


def main():
    try:
        g = S.get(LOADER, timeout=30); log(step='loader', status=g.status_code, cookies=list(S.cookies.keys()))
    except Exception as e:
        log(step='loader', error=str(e)[:200])
    res = None
    for day in trade_days():
        mk = {}
        try:
            for m, (mid, _) in MKT.items():
                j = krx('dbms/MDC/STAT/standard/MDCSTAT02401', mktId=mid, invstTpCd='9000', strtDd=day, endDd=day, share='1', money='1', csvxls_isNo='false')
                rows = j.get('output') or j.get('OutBlock_1') or []
                mk[m] = rows
            log(step='investor', day=day, n={m: len(v) for m, v in mk.items()}, keys=list(mk['KOSPI'][0].keys()) if mk.get('KOSPI') else None)
        except Exception as e:
            log(step='investor', day=day, error=str(e)[:300]); break
        if not any(mk.values()):
            continue
        res = (day, mk); break
    if not res:
        STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=1)); print('no data'); return 1
    day, mk = res
    out = {'asof': f'{day[:4]}-{day[4:6]}-{day[6:]}', 'updated_at': status['run'], 'source': 'KRX 정보데이터시스템 투자자별 거래(외국인) · 시가총액 KRX', 'markets': {}}
    hist_rows = []
    for m, rows in mk.items():
        try:
            caps = caps_openapi(m, day); src = 'openapi'
            # Open API ISU_CD는 표준코드일 수 있어 단축코드로 맞춤
            if caps and len(next(iter(caps))) == 12:
                caps = {k[3:9]: v for k, v in caps.items()}
        except Exception as e:
            log(step='cap_openapi', market=m, error=str(e)[:200])
            caps = caps_krx(m, day); src = 'krx'
        L = []
        for r in rows:
            code = r.get('ISU_SRT_CD'); c = caps.get(code)
            buy = num(r.get('BID_TRDVAL')); sell = num(r.get('ASK_TRDVAL'))
            if not c or not c['cap'] or buy <= 0: continue
            L.append(dict(code=code, name=r.get('ISU_NM') or c['name'], buy=buy, sell=sell, net=buy - sell, cap=c['cap'], close=c['close'], chg=c['chg'], val=c['val'],
                          ratio=round(buy / c['cap'] * 100, 4), buy_share=round(buy / c['val'] * 100, 1) if c['val'] else None))
        L.sort(key=lambda x: -x['ratio'])
        out['markets'][m] = {'cap_source': src, 'n': len(L), 'rows': L}
        log(step='merge', market=m, n=len(L), cap_source=src)
        for i, x in enumerate(L[:100], 1):
            hist_rows.append({'date': out['asof'], 'market': m, 'rank': i, 'code': x['code'], 'name': x['name'], 'buy_krw': int(x['buy']), 'net_krw': int(x['net']), 'mktcap_krw': int(x['cap']), 'ratio_pct': x['ratio']})
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    # 날짜별 상위 100 누적(같은 날짜는 최신 값으로 교체, 과거는 보존)
    old = list(csv.DictReader(HIST.open(encoding='utf-8'))) if HIST.exists() else []
    old = [r for r in old if r['date'] != out['asof']]
    with HIST.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(hist_rows[0].keys()) if hist_rows else ['date']); w.writeheader(); w.writerows(old + hist_rows)
    status['ok'] = True; STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
