"""코스피·코스닥 시장 거래대금(일별) → market_turnover.csv

출처(원본 우선)
1) KRX 정보데이터시스템 '지수 > 개별지수 시세 추이'(MDCSTAT00301, 코스피·코스닥 지수 구성종목 거래대금)
   — 2025년부터 로그인 필요: 사용자 본인 계정(GitHub Secrets KRX_ID/KRX_PW)
2) 위가 실패하면 KRX Open API 지수 일별시세(idx/kospi_dd_trd · idx/kosdaq_dd_trd, KRX_API_KEY)로 최근 일자만 채움
금액 단위: 백만원(trdval_mn). 기존 행은 지우지 않고 같은 날짜만 최신 값으로 덮어씀.
"""
import csv, datetime as dt, json, os, pathlib, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import collect_foreign_buy as fb  # KRX 세션·로그인 재사용

OUT = ROOT / 'market_turnover.csv'; STATUS = ROOT / 'market_turnover_status.json'
KST = dt.timezone(dt.timedelta(hours=9))
IDX = {'KOSPI': ('1', '001', 'kospi_dd_trd', '코스피'), 'KOSDAQ': ('2', '001', 'kosdaq_dd_trd', '코스닥')}
st = {'run': dt.datetime.now(KST).isoformat(timespec='seconds'), 'steps': []}
num = lambda s: float(str(s).replace(',', '')) if str(s).replace(',', '').replace('.', '').replace('-', '').isdigit() else None


def log(**k):
    st['steps'].append(k); print(k, flush=True)


def load():
    if not OUT.exists(): return {}
    return {(r['date'], r['market']): r for r in csv.DictReader(OUT.open(encoding='utf-8'))}


def mdc(mkt, s, e):
    a, b, _, _ = IDX[mkt]
    j = fb.krx('dbms/MDC/STAT/standard/MDCSTAT00301', indIdx=a, indIdx2=b, strtDd=s, endDd=e, share='2', money='3', csvxls_isNo='false')
    rows = j.get('output') or j.get('OutBlock_1') or []
    out = []
    for r in rows:
        d = r.get('TRD_DD', '').replace('/', '-')
        v = num(r.get('ACC_TRDVAL'))
        if d and v:
            out.append(dict(date=d, market=mkt, close=num(r.get('CLSPRC_IDX')) or '', trdval_mn=v, src='KRX MDCSTAT00301'))
    return out, (rows[0] if rows else None)


def openapi(mkt, day):
    key = os.environ.get('KRX_API_KEY')
    if not key: return []
    req = urllib.request.Request(f'https://data-dbg.krx.co.kr/svc/apis/idx/{IDX[mkt][2]}?basDd={day}', headers={'AUTH_KEY': key})
    rows = json.loads(urllib.request.urlopen(req, timeout=40).read()).get('OutBlock_1', [])
    for r in rows:
        if r.get('IDX_NM') == IDX[mkt][3]:
            v = num(r.get('ACC_TRDVAL'))
            if v:  # Open API 거래대금 단위: 원 → 백만원
                return [dict(date=f'{day[:4]}-{day[4:6]}-{day[6:]}', market=mkt, close=num(r.get('CLSPRC_IDX')) or '', trdval_mn=round(v / 1e6), src='KRX Open API idx')]
    return []


def main():
    data = load(); today = dt.datetime.now(KST).date()
    have = {m: max([d for d, mm in data if mm == m], default=None) for m in IDX}
    ok = fb.login(); log(step='login', ok=ok)
    for mkt in IDX:
        start = dt.date(2015, 1, 1) if not have[mkt] else dt.date.fromisoformat(have[mkt]) - dt.timedelta(days=14)
        got = 0
        if ok:
            s = start
            while s <= today:
                e = min(dt.date(s.year, 12, 31), today)
                try:
                    rows, first = mdc(mkt, s.strftime('%Y%m%d'), e.strftime('%Y%m%d'))
                    if first and not got: log(step='sample', market=mkt, keys=list(first.keys())[:12], row={k: first[k] for k in list(first)[:8]})
                    for r in rows: data[(r['date'], mkt)] = r
                    got += len(rows); log(step='mdc', market=mkt, year=s.year, rows=len(rows))
                except Exception as ex:
                    log(step='mdc', market=mkt, year=s.year, error=str(ex)[:160])
                s = e + dt.timedelta(days=1); time.sleep(0.5)
        if not got:  # 로그인 실패·차단 시 Open API로 최근 15거래일만
            for day in fb.trade_days(15):
                try:
                    for r in openapi(mkt, day): data[(r['date'], mkt)] = r; got += 1
                except Exception as ex:
                    log(step='openapi', market=mkt, day=day, error=str(ex)[:120])
                time.sleep(0.2)
            log(step='openapi', market=mkt, rows=got)
    rows = sorted(data.values(), key=lambda r: (r['date'], r['market']))
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['date', 'market', 'close', 'trdval_mn', 'src']); w.writeheader()
        for r in rows: w.writerow({k: r.get(k, '') for k in w.fieldnames})
    st['rows'] = len(rows); st['last'] = {m: max([r['date'] for r in rows if r['market'] == m], default=None) for m in IDX}
    STATUS.write_text(json.dumps(st, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        import traceback; st['error'] = traceback.format_exc()[-1500:]; STATUS.write_text(json.dumps(st, ensure_ascii=False, indent=1)); raise
