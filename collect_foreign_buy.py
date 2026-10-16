"""당일 외국인 '매수' 거래대금(순매수 아님) ÷ 시가총액 순위 → foreign_buy.json (+ 날짜별 누적 foreign_buy_hist.csv)

출처
- 외국인 매수·매도 거래대금: KRX 정보데이터시스템 '투자자별 순매수상위종목'(MDCSTAT02401, 투자자=외국인)
- 시가총액: KRX Open API 일별매매정보(stk_bydd_trd / ksq_bydd_trd, KRX_API_KEY) — 실패 시 KRX 정보데이터시스템 전종목 시세(MDCSTAT01501)
"""
import csv, datetime as dt, gzip, json, os, pathlib, sys, time, urllib.request
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


def login():
    """KRX 정보데이터시스템은 2025년부터 조회에 로그인이 필요. 사용자 본인 계정(GitHub Secrets KRX_ID/KRX_PW)으로 로그인."""
    uid, pw = (os.environ.get('KRX_ID') or '').strip(), (os.environ.get('KRX_PW') or '').strip()
    if not uid or not pw:
        log(step='login', skipped='KRX_ID/KRX_PW 시크릿 없음'); return False
    S.get('https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001.cmd', timeout=30)
    url = 'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001D1.cmd'
    form = {'mbrNm': '', 'telNo': '', 'di': '', 'certType': '', 'mbrId': uid, 'pw': pw}
    r = S.post(url, data=form, timeout=30, headers={'Referer': 'https://data.krx.co.kr/contents/MDC/COMS/client/MDCCOMS001.cmd'})
    try: j = r.json()
    except Exception: j = {'raw': r.text[:120]}
    code = j.get('_error_code') or j.get('error_code')
    if code == 'CD011':  # 중복 로그인 → 기존 세션 종료 후 재시도
        r = S.post(url, data=form | {'skipDup': 'Y'}, timeout=30); j = r.json() if r.text.strip().startswith('{') else {'raw': r.text[:120]}
        code = j.get('_error_code')
    log(step='login', id_len=len(uid), status=r.status_code, code=code, msg=str(j.get('_error_message') or j.get('raw') or '')[:80])
    return code in ('CD001', None) and r.status_code == 200


DAYS = pathlib.Path('foreign_buy_days'); HOL = DAYS / '_holidays.json'
PERIODS = [('1d', '당일', 0), ('1w', '최근 1주', 7), ('2w', '최근 2주', 14), ('1m', '최근 1달', 30), ('3m', '최근 3달', 91)]


def fetch_day(day):
    """하루치: 시장별 [코드, 이름, 외국인매수, 외국인매도, 시총, 종가, 등락률, 거래대금] (금액 원). 휴장일이면 None."""
    out = {}
    for m, (mid, _) in MKT.items():
        j = krx('dbms/MDC/STAT/standard/MDCSTAT02401', mktId=mid, invstTpCd='9000', strtDd=day, endDd=day, share='1', money='1', csvxls_isNo='false')
        inv = j.get('output') or j.get('OutBlock_1') or []
        if not inv:
            return None
        time.sleep(0.4)
        caps = caps_krx(m, day); time.sleep(0.4)
        rows = []
        for r in inv:
            c = caps.get(r.get('ISU_SRT_CD'))
            if not c or not c['cap']:
                continue
            rows.append([r['ISU_SRT_CD'], r.get('ISU_NM') or c['name'], int(num(r.get('BID_TRDVAL'))), int(num(r.get('ASK_TRDVAL'))), int(c['cap']), c['close'], c['chg'], int(c['val'])])
        out[m] = rows
    return out


def load_day(d):
    f = DAYS / f'{d}.json.gz'
    return json.loads(gzip.decompress(f.read_bytes())) if f.exists() else None


# 투자자 구분: KRX 투자자 코드 · 이름 · 출력 파일 접두어
INV = {'F': ('9000', '외국인', 'foreign_buy'), 'I': ('7050', '기관 합계', 'inst_buy'), 'T': ('3000', '투신', 'trust_buy'), 'P': ('3100', '사모', 'pe_buy'), 'B': ('1000', '금융투자', 'fi_buy'), 'O': ('7100', '기타법인', 'corp_buy')}
IDAYS = pathlib.Path('invest_days')


def fetch_inv(day, key):
    """기관·투신·사모 하루치: 시장별 [코드, 매수, 매도](원). 휴장일이면 None."""
    out = {}
    for m, (mid, _) in MKT.items():
        j = krx('dbms/MDC/STAT/standard/MDCSTAT02401', mktId=mid, invstTpCd=INV[key][0], strtDd=day, endDd=day, share='1', money='1', csvxls_isNo='false')
        rows = j.get('output') or j.get('OutBlock_1') or []
        time.sleep(0.35)
        out[m] = [[r['ISU_SRT_CD'], int(num(r.get('BID_TRDVAL'))), int(num(r.get('ASK_TRDVAL')))] for r in rows]
    return out if any(out.values()) else None


def load_inv(key, d):
    f = IDAYS / key / f'{d}.json.gz'
    return json.loads(gzip.decompress(f.read_bytes())) if f.exists() else None


def build(asof, inv='F'):
    """투자자별 기간 순위({접두어}_periods.json)·종목별 일별 추이({접두어}_series.json). 외국인은 당일 파일(foreign_buy.json)도."""
    files = sorted(f.name[:10] for f in DAYS.glob('*.json.gz'))
    files = [d for d in files if d <= asof]
    end = dt.date.fromisoformat(asof)
    data = {d: load_day(d) for d in files if d > (end - dt.timedelta(days=92)).isoformat()}
    if inv != 'F':
        # 시총·종가·등락률은 외국인 일별 파일(전 종목 시세)을 쓰고 매수·매도만 해당 투자자 값으로 교체
        for d in list(data):
            iv = load_inv(inv, d)
            if not iv:
                del data[d]; continue
            bs = {r[0]: r for m in iv.values() for r in m}
            data[d] = {m: [[r[0], r[1], bs.get(r[0], [0, 0, 0])[1], bs.get(r[0], [0, 0, 0])[2], *r[4:]] for r in rows] for m, rows in data[d].items()}
    dates = sorted(data)
    if asof not in data and dates:
        asof = dates[-1]
    pre = INV[inv][2]
    res = {'asof': asof, 'investor': INV[inv][1], 'updated_at': status['run'], 'source': f'KRX 정보데이터시스템 투자자별 거래실적({INV[inv][1]}) · 전종목 시세(시가총액)', 'periods': {}}
    names, mk = {}, {}
    for d in dates:
        for m, rows in data[d].items():
            for r in rows: names[r[0]] = r[1]; mk[r[0]] = m
    for key, lab, n in PERIODS:
        ds = [asof] if n == 0 else [d for d in dates if d > (end - dt.timedelta(days=n)).isoformat()]
        ds = [d for d in ds if d in data]
        acc = {}
        for d in ds:
            for m, rows in data[d].items():
                for code, nm, buy, sell, cap, close, chg, val in rows:
                    a = acc.setdefault(code, [0, 0, 0, 0, 0, 1.0, close, 0])
                    a[0] += buy; a[1] += sell; a[2] += cap; a[3] += 1; a[4] += val
                    a[5] *= 1 + (chg or 0) / 100; a[6] = close
        rows = []
        for code, (buy, sell, capsum, k, val, g, close, _) in acc.items():
            cap = capsum / k
            if buy <= 0 or cap <= 0:
                continue
            # 금액은 억원(소수 1자리), 비율 %
            rows.append([code, names[code], mk[code], round(buy / 1e8, 1), round(sell / 1e8, 1), round(cap / 1e8), round(buy / cap * 100 / k, 4),  # 일평균 매수/시총 = 기간 누적 매수 ÷ 평균 시총 ÷ 거래일수
                         round((g - 1) * 100, 2), close, round(buy / val * 100, 1) if val else None, k])
        rows.sort(key=lambda x: -x[6])
        res['periods'][key] = {'label': lab, 'from': ds[0] if ds else None, 'to': ds[-1] if ds else None, 'days': len(ds), 'rows': rows}
    res['cols'] = ['code', 'name', 'market', 'buy_eok', 'sell_eok', 'avgcap_eok', 'ratio_pct', 'ret_pct', 'close', 'buy_share_pct', 'days']
    pathlib.Path(f'{pre}_periods.json').write_text(json.dumps(res, ensure_ascii=False, separators=(',', ':')))
    # 종목별 일별 추이: 3달 평균 시총 300억 이상 종목만(용량 관리)
    keep = {r[0] for r in res['periods']['3m']['rows'] if r[5] >= 300}
    ser = {'dates': dates, 'cols': ['buy_eok', 'net_eok', 'ratio_pct'], 's': {}}
    idx = {d: {r[0]: r for m in data[d].values() for r in m} for d in dates}
    for code in keep:
        a = []
        for d in dates:
            r = idx[d].get(code)
            a.append(None if not r else [round(r[2] / 1e8, 1), round((r[2] - r[3]) / 1e8, 1), round(r[2] / r[4] * 100, 3) if r[4] else None])
        ser['s'][code] = a
    pathlib.Path(f'{pre}_series.json').write_text(json.dumps(ser, ensure_ascii=False, separators=(',', ':')))
    # 당일(기존 화면 호환)
    today = data.get(asof) if inv == 'F' else None
    if today:
        out = {'asof': asof, 'updated_at': status['run'], 'source': res['source'], 'markets': {}}
        for m, rws in today.items():
            L = [dict(code=r[0], name=r[1], buy=r[2], sell=r[3], net=r[2] - r[3], cap=r[4], close=r[5], chg=r[6], val=r[7], ratio=round(r[2] / r[4] * 100, 4), buy_share=round(r[2] / r[7] * 100, 1) if r[7] else None) for r in rws if r[2] > 0]
            L.sort(key=lambda x: -x['ratio']); out['markets'][m] = {'n': len(L), 'rows': L}
        OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
        old = list(csv.DictReader(HIST.open(encoding='utf-8'))) if HIST.exists() else []
        old = [r for r in old if r.get('date') != asof]
        new = [{'date': asof, 'market': m, 'rank': i, 'code': x['code'], 'name': x['name'], 'buy_krw': x['buy'], 'net_krw': x['net'], 'mktcap_krw': x['cap'], 'ratio_pct': x['ratio']}
               for m, M in out['markets'].items() for i, x in enumerate(M['rows'][:100], 1)]
        with HIST.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(new[0].keys())); w.writeheader(); w.writerows(old + new)
    log(step='build', investor=inv, days=len(dates), series=len(ser['s']))


def main():
    try:
        g = S.get(LOADER, timeout=30); log(step='loader', status=g.status_code)
    except Exception as e:
        log(step='loader', error=str(e)[:200])
    if not login():
        STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=1)); return 1
    DAYS.mkdir(exist_ok=True)
    hol = set(json.loads(HOL.read_text())) if HOL.exists() else set()
    today = dt.datetime.now(KST).date()
    back = os.environ.get('BACKFILL_FROM', '').strip()  # 예: 2026-01-02 → 그날까지 과거 일별 자료를 채움(이미 있는 날은 건너뜀)
    span = (today - dt.date.fromisoformat(back)).days + 1 if back else 95
    cand = [today - dt.timedelta(days=i) for i in range(0, max(95, span))]
    cand = [d for d in cand if d.weekday() < 5 and d.isoformat() not in hol]
    have = {f.name[:10] for f in DAYS.glob('*.json.gz')}
    latest_have = max(have) if have else ''
    # 최근 2거래일은 매번 다시 받음(장중·지연 확정 반영), 나머지는 없는 날만
    todo = [d for d in cand if d.isoformat() not in have] + [d for d in cand[:2] if d.isoformat() in have]
    todo = sorted(set(todo), reverse=True)[:int(os.environ.get('MAX_DAYS', '70'))]
    got = 0
    for d in todo:
        ds = d.strftime('%Y%m%d')
        try:
            r = fetch_day(ds)
        except Exception as e:
            log(step='day', day=d.isoformat(), error=str(e)[:200]); break
        if r is None:
            if d < today: hol.add(d.isoformat())
            continue
        (DAYS / f'{d.isoformat()}.json.gz').write_bytes(gzip.compress(json.dumps(r, ensure_ascii=False, separators=(',', ':')).encode(), 9))
        got += 1
    HOL.write_text(json.dumps(sorted(hol)))
    have = sorted(f.name[:10] for f in DAYS.glob('*.json.gz'))
    log(step='days', fetched=got, total=len(have), latest=have[-1] if have else None)
    # 기관 합계·투신·사모: 외국인 파일이 있는 거래일 기준으로 없는 날 + 최근 2거래일을 받음
    for key in ('I', 'T', 'P', 'B', 'O'):
        (IDAYS / key).mkdir(parents=True, exist_ok=True)
        hk = {f.name[:10] for f in (IDAYS / key).glob('*.json.gz')}
        need = [d for d in have if d not in hk] + have[-2:]
        need = sorted(set(need), reverse=True)[:int(os.environ.get('MAX_DAYS', '70'))]
        n = 0
        for d in need:
            try:
                r = fetch_inv(d.replace('-', ''), key)
            except Exception as e:
                log(step='inv_day', investor=key, day=d, error=str(e)[:200]); break
            if r:
                (IDAYS / key / f'{d}.json.gz').write_bytes(gzip.compress(json.dumps(r, separators=(',', ':')).encode(), 9)); n += 1
        log(step='inv_days', investor=key, fetched=n)
    if have:
        for key in INV:
            build(have[-1], key)
        status['ok'] = True
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
