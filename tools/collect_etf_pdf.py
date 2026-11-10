"""액티브 ETF 구성종목(PDF) 비중 일별 기록 → etf_pdf/<ETF코드>.json, etf_pdf/index.json

원본: KRX 정보데이터시스템 'ETF 구성종목(PDF)'(MDCSTAT05001, 일자별 전체 구성종목·비중) — 사용자 본인 KRX 계정(GitHub Secrets)
대상 ETF는 이름으로 찾습니다(KRX ETF 전종목 기본정보 MDCSTAT04601). 이미 받은 날짜는 다시 받지 않고 기존 기록은 지우지 않습니다.
환경변수 PDF_FROM(YYYY-MM-DD)으로 과거 날짜를 채울 수 있습니다(기본: 최근 25거래일).
"""
import datetime as dt, json, os, pathlib, re, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import collect_foreign_buy as fb

OUT = ROOT / 'etf_pdf'; OUT.mkdir(exist_ok=True)
KST = dt.timezone(dt.timedelta(hours=9))
# (화면 표시 이름, 찾을 이름 패턴 — 공백 무시·대소문자 무시)
TARGETS = [
    ('DS AI반도체액티브', r'^DS.*AI반도체.*액티브'),
    ('KoAct 코스닥액티브', r'^KoAct코스닥액티브'),
    ('TIME 코스닥액티브', r'^TIME코스닥액티브'),
    ('TIGER 코스닥액티브', r'^TIGER코스닥액티브'),
    ('DS 코스닥액티브', r'^DS코스닥액티브'),
    ('RISE 2차전지액티브', r'^RISE2차전지액티브'),
    ('TIGER 코리아테크액티브', r'^TIGER코리아테크액티브'),
    ('MIDAS 코스닥액티브', r'^MIDAS코스닥액티브'),
]
st = {'run': dt.datetime.now(KST).isoformat(timespec='seconds'), 'resolved': {}, 'errors': []}
num = lambda s: float(str(s).replace(',', '')) if re.fullmatch(r'-?[\d,]+(\.\d+)?', str(s or '').strip()) else None


def master():
    day = dt.datetime.now(KST).strftime('%Y%m%d')
    j = fb.krx('dbms/MDC/STAT/standard/MDCSTAT04601', trdDd=day, share='1', csvxls_isNo='false')
    rows = j.get('output') or j.get('OutBlock_1') or []
    return [(r.get('ISU_ABBRV') or r.get('ISU_NM') or '', r.get('ISU_CD'), r.get('ISU_SRT_CD')) for r in rows]


def pdf(isin, day):
    j = fb.krx('dbms/MDC/STAT/standard/MDCSTAT05001', trdDd=day, isuCd=isin, share='1', money='1', csvxls_isNo='false')
    out = []
    for r in j.get('output') or j.get('OutBlock_1') or []:
        code = (r.get('COMPST_ISU_CD') or '').strip(); name = (r.get('COMPST_ISU_NM') or '').strip()
        w = num(r.get('COMPST_RTO')); amt = num(r.get('VALU_AMT'))
        if name: out.append((code[-6:] if re.fullmatch(r'KR7\w{9}', code) else code, name, w, amt))
    return out


def main():
    if not fb.login():
        st['errors'].append('KRX 로그인 실패'); return
    M = master(); st['master_n'] = len(M)
    norm = lambda s: re.sub(r'\s+', '', s or '')
    days = fb.trade_days(60)
    start = (os.environ.get('PDF_FROM') or '').replace('-', '')
    days = sorted(d for d in days if (not start or d >= start))[-25 if not start else None:]
    if start:  # 과거 채우기: 시작일부터 오늘까지 평일 전체(휴장일은 빈 결과로 건너뜀)
        d0 = dt.date(int(start[:4]), int(start[4:6]), int(start[6:])); days = []
        while d0 <= dt.datetime.now(KST).date():
            if d0.weekday() < 5: days.append(d0.strftime('%Y%m%d'))
            d0 += dt.timedelta(days=1)
    index = []
    for label, pat in TARGETS:
        hit = [m for m in M if re.search(pat, norm(m[0]), re.I)]
        if not hit:
            st['resolved'][label] = None; continue
        nm, isin, code = sorted(hit, key=lambda x: len(x[0]))[0]
        st['resolved'][label] = [nm, code]
        f = OUT / f'{code}.json'
        J = json.loads(f.read_text()) if f.exists() else {'code': code, 'name': nm, 'label': label, 'dates': [], 'w': {}, 'names': {}}
        have = set(J['dates'])
        for d in days:
            ds = f'{d[:4]}-{d[4:6]}-{d[6:]}'
            if ds in have: continue
            try:
                rows = pdf(isin, d); time.sleep(0.3)
            except Exception as e:
                st['errors'].append(f'{label} {ds} {str(e)[:80]}'); continue
            if not rows: continue
            tot = sum(r[3] or 0 for r in rows)
            k = len(J['dates']); J['dates'].append(ds)
            for c, n, w, amt in rows:
                key = c or n
                if w is None and tot: w = (amt or 0) / tot * 100
                J['names'][key] = n
                a = J['w'].setdefault(key, []); a.extend([None] * (k - len(a))); a.append(round(w, 2) if w is not None else None)
        # 날짜순 정렬(과거 채우기로 순서가 섞일 수 있음)
        order = sorted(range(len(J['dates'])), key=lambda i: J['dates'][i])
        J['dates'] = [J['dates'][i] for i in order]
        for key, a in J['w'].items():
            a.extend([None] * (len(order) - len(a))); J['w'][key] = [a[i] for i in order]
        J['updated_at'] = st['run']
        f.write_text(json.dumps(J, ensure_ascii=False, separators=(',', ':')))
        index.append(dict(code=code, name=nm, label=label, days=len(J['dates']), last=J['dates'][-1] if J['dates'] else None))
    (OUT / 'index.json').write_text(json.dumps(dict(updated_at=st['run'], etfs=index), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    try:
        main()
    finally:
        (ROOT / 'etf_pdf_status.json').write_text(json.dumps(st, ensure_ascii=False, indent=1))
        print(json.dumps(st, ensure_ascii=False)[:1500])
