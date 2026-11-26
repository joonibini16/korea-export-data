"""국내 상장 '국내 주식형' ETF 전체의 구성종목(PDF) 일별 스냅샷 → etf_all/YYYY-MM-DD.json.gz, 종목별 집계 → etf_all_table.json

원본: KRX 정보데이터시스템 ETF 전종목 기본정보(MDCSTAT04601)로 대상 선정(기초시장 '국내' · 자산 '주식'),
      ETF 구성종목(MDCSTAT05001)으로 종목별 CU당 주식 수·비중 — 사용자 본인 KRX 계정(GitHub Secrets).
- 하루 1회(장 마감 후). 스냅샷은 지우지 않고 날짜별로 쌓음.
- ALL_DAYS=N: 최근 N거래일 중 없는 날짜도 채움(한 번 실행당 호출 상한 CALL_BUDGET, 기본 2,400건 — 남으면 다음 실행에서 이어서).
- 집계표: 최신일 대비 1·5·20거래일 전 — 보유 ETF 수, 신규·편출, 수량 증가·감소·유지 ETF 수, 평균 비중, 수량 증가/감소 ETF 목록.
"""
import datetime as dt, gzip, json, os, pathlib, re, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import collect_foreign_buy as fb

OUT = ROOT / 'etf_all'; OUT.mkdir(exist_ok=True)
KST = dt.timezone(dt.timedelta(hours=9))
now = dt.datetime.now(KST); today = now.strftime('%Y%m%d'); closed = now.hour * 60 + now.minute >= 15 * 60 + 40
st = {'run': now.isoformat(timespec='seconds'), 'errors': [], 'calls': 0, 'dates': {}}
num = lambda s: float(str(s).replace(',', '')) if re.fullmatch(r'-?[\d,]+(\.\d+)?', str(s or '').strip()) else None
BUDGET = int(os.environ.get('CALL_BUDGET') or 2400)
SKIP = re.compile(r'레버리지|인버스|2X|합성')  # 파생 재조정으로 CU 수량이 매일 바뀌는 ETF는 제외


def call(path, **q):
    for att in range(4):
        try:
            st['calls'] += 1
            return fb.krx(path, **q)
        except Exception as e:
            if att == 3: raise
            time.sleep(8 * (att + 1))
            try: fb.login()
            except Exception as le: st['errors'].append(f'재로그인 실패 {str(le)[:60]}')


def targets():
    j = call('dbms/MDC/STAT/standard/MDCSTAT04601', trdDd=today, share='1', csvxls_isNo='false')
    out = []
    for r in j.get('output') or j.get('OutBlock_1') or []:
        if r.get('IDX_MKT_CLSS_NM') == '국내' and r.get('IDX_ASST_CLSS_NM') == '주식' and not SKIP.search(r.get('ISU_ABBRV') or ''):
            out.append((r.get('ISU_SRT_CD'), r.get('ISU_CD'), r.get('ISU_ABBRV') or r.get('ISU_NM')))
    return out


def pdf(isin, day):
    j = call('dbms/MDC/STAT/standard/MDCSTAT05001', trdDd=day, isuCd=isin, share='1', money='1', csvxls_isNo='false')
    h = {}
    for r in j.get('output') or j.get('OutBlock_1') or []:
        c = (r.get('COMPST_ISU_CD') or '').strip(); n = (r.get('COMPST_ISU_NM') or '').strip()
        if not re.fullmatch(r'[0-9A-Z]{6}', c) or not n: continue  # 국내 상장 종목만(현금·선물·해외 제외)
        h[c] = [num(r.get('COMPST_ISU_CU1_SHRS')), num(r.get('COMPST_RTO')), n]
    return h


def load(ds):
    f = OUT / f'{ds}.json.gz'
    return json.loads(gzip.decompress(f.read_bytes())) if f.exists() else None


def save(ds, S):
    (OUT / f'{ds}.json.gz').write_bytes(gzip.compress(json.dumps(S, ensure_ascii=False, separators=(',', ':')).encode(), 9))


def collect():
    if not fb.login():
        st['errors'].append('KRX 로그인 실패'); return
    T = targets(); st['etfs'] = len(T)
    days = fb.trade_days(int(os.environ.get('ALL_DAYS') or 1) + 2)
    days = [d for d in sorted(days) if d < today or closed][-int(os.environ.get('ALL_DAYS') or 1):]
    for d in sorted(days, reverse=True):  # 최신일부터
        ds = f'{d[:4]}-{d[4:6]}-{d[6:]}'
        S = load(ds) or {'date': ds, 'etfs': {}}
        todo = [t for t in T if t[0] not in S['etfs']]
        got = 0
        for code, isin, nm in todo:
            if st['calls'] >= BUDGET: break
            try:
                h = pdf(isin, d); time.sleep(0.45)
            except Exception as e:
                st['errors'].append(f'{nm} {ds} {str(e)[:60]}'); continue
            if h: S['etfs'][code] = {'n': nm, 'h': h}; got += 1
            if got and got % 100 == 0: save(ds, S)
        save(ds, S); st['dates'][ds] = dict(etfs=len(S['etfs']), added=got, remaining=len([t for t in T if t[0] not in S['etfs']]))
        if st['calls'] >= BUDGET: st['budget_hit'] = True; break


def build():
    files = sorted(OUT.glob('*.json.gz'))
    snaps = [f.name[:10] for f in files]
    if not snaps: return
    B = load(snaps[-1]); res = {'updated_at': st['run'], 'latest': snaps[-1], 'dates': snaps, 'views': {}}
    for N in (1, 5, 20):
      if len(snaps) <= N: continue
      A = load(snaps[-1 - N])
      for scope in ('all', 'act'):
        common = {e for e in set(A['etfs']) & set(B['etfs']) if not SKIP.search(B['etfs'][e]['n']) and (scope == 'all' or '액티브' in B['etfs'][e]['n'])}  # 두 날짜 모두 받은 ETF만 비교
        M = {}
        for e in common:
            ha, hb, lab = A['etfs'][e]['h'], B['etfs'][e]['h'], B['etfs'][e]['n']
            for k in set(ha) | set(hb):
                a, b = ha.get(k), hb.get(k)
                r = M.setdefault(k, {'n': (b or a)[2], 'ha': 0, 'hb': 0, 'nw': 0, 'ex': 0, 'inc': 0, 'dec': 0, 'keep': 0, 'sa': 0.0, 'sb': 0.0, 'il': [], 'dl': []})
                if a: r['ha'] += 1; r['sa'] += a[1] or 0
                if b: r['hb'] += 1; r['sb'] += b[1] or 0
                if a and not b: r['ex'] += 1; r['dl'].append([lab, None, a[1]]); continue
                if b and not a: r['nw'] += 1; r['il'].append([lab, None, b[1]]); continue
                qa, qb = a[0], b[0]
                if qa is None or qb is None or qa == qb: r['keep'] += 1; continue
                pct = (qb / qa - 1) * 100 if qa else None
                (r['il'] if qb > qa else r['dl']).append([lab, None if pct is None else round(pct, 1), b[1]])
                r['inc' if qb > qa else 'dec'] += 1
        rows = []
        for k, r in M.items():
            wa = r['sa'] / r['ha'] if r['ha'] else None; wb = r['sb'] / r['hb'] if r['hb'] else None
            il = sorted(r['il'], key=lambda x: -(x[2] or 0))[:12]; dl = sorted(r['dl'], key=lambda x: -(x[2] or 0))[:12]
            rows.append([k, r['n'], r['ha'], r['hb'], r['nw'], r['ex'], r['inc'], r['dec'], r['keep'],
                         None if wa is None else round(wa, 2), None if wb is None else round(wb, 2), round((wb or 0) - (wa or 0), 2),
                         [[x[0], x[1]] for x in il], [[x[0], x[1]] for x in dl], len(r['il']), len(r['dl'])])
        rows.sort(key=lambda x: (-(x[6] + x[4] - x[7] - x[5]), -x[3]))
        res['views'][str(N) + ('' if scope == 'all' else 'a')] = {'from': snaps[-1 - N], 'to': snaps[-1], 'etfs': len(common),
                                'columns': ['code', 'name', 'ha', 'hb', 'nw', 'ex', 'inc', 'dec', 'keep', 'wa', 'wb', 'dw', 'inc_list', 'dec_list', 'inc_n', 'dec_n'], 'rows': rows}
    (ROOT / 'etf_all_table.json').write_text(json.dumps(res, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    try:
        if not os.environ.get('BUILD_ONLY'): collect()
        build()
    finally:
        (ROOT / 'etf_all_status.json').write_text(json.dumps(st, ensure_ascii=False, indent=1))
        print(json.dumps(st, ensure_ascii=False)[:1500])
