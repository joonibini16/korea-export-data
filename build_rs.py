"""RS(상대강도) 순위 — 코스피·코스닥 전 종목.

원본: KRX 정보데이터시스템 일별 전종목 시세(foreign_buy_days/*.json.gz: 종가·시가총액·거래대금, 이미 수집된 원본)
계산(IBD 방식 응용)
- 수정종가: 시가총액÷종가로 구한 주식 수가 하루에 15% 넘게 바뀌면(액면분할·병합·무상증자) 이전 가격을 그 비율로 보정
- RS 점수 = 0.4×최근 3개월 수익률 + 0.2×6개월 + 0.2×9개월 + 0.2×12개월 (거래일 63·126·189·252일, 자료가 모자라면 가능한 가장 긴 구간으로 대체)
- RS 등급 = 전 종목(코스피+코스닥 보통주) RS 점수의 백분위 1~99
- 1주·4주 전 등급과 비교해 변화 표시, 지수 대비 상대강도선(RS line) 신고가 여부
Output: rs_rank.json
"""
import csv, gzip, json, pathlib, datetime as dt, statistics as st

ROOT = pathlib.Path(__file__).resolve().parent
DAYS = ROOT / 'foreign_buy_days'
KST = dt.timezone(dt.timedelta(hours=9))
W = [(63, .4), (126, .2), (189, .2), (252, .2)]


def load():
    days = []
    for fp in sorted(DAYS.glob('20*.json.gz')):
        try: days.append((fp.name[:10], json.loads(gzip.decompress(fp.read_bytes()))))
        except Exception: pass
    return days


def series(days):
    S = {}
    for d, mk in days:
        for m, rows in mk.items():
            for r in rows:
                code, name, cap, close, val = r[0], r[1], r[4], r[5], (r[7] if len(r) > 7 else None)
                if not close or not cap: continue
                s = S.setdefault(code, {'name': name, 'mkt': m, 'd': [], 'p': [], 'sh': [], 'cap': cap, 'val': []})
                s['name'], s['mkt'], s['cap'] = name, m, cap
                s['d'].append(d); s['p'].append(close); s['sh'].append(cap / close); s['val'].append(val or 0)
    for s in S.values():  # 주식 수 급변(분할·병합·무상증자) → 과거 가격 보정
        adj = s['p'][:]
        for i in range(len(adj) - 1, 0, -1):
            k = s['sh'][i] / s['sh'][i - 1] if s['sh'][i - 1] else 1
            if k > 1.15 or k < 1 / 1.15:
                for j in range(i): adj[j] /= k
        s['a'] = adj
    return S


def score(a, end, idx_len):
    """end 위치까지의 RS 점수. 구간이 모자라면 가능한 최장 구간으로 대체."""
    if end < 20: return None
    tot, wsum = 0, 0
    for n, w in W:
        back = min(n, end)
        if back < 20: continue
        tot += w * (a[end] / a[end - back] - 1) * 100; wsum += w
    return tot / wsum if wsum else None


def pct_rank(vals):
    xs = sorted(v for v in vals.values() if v is not None); n = len(xs)
    import bisect
    return {k: (max(1, min(99, round(bisect.bisect_left(xs, v) / max(n - 1, 1) * 98 + 1))) if v is not None else None) for k, v in vals.items()}


def main():
    days = load(); S = series(days); dates = [d for d, _ in days]
    sector = {}; grp = {}
    try:
        sector = {r['code']: r['sector'] for r in csv.DictReader((ROOT / 'market_sector_catalog.csv').open(encoding='utf-8-sig'))}
        grp = {r['KIND업종']: r['대분류'] for r in csv.DictReader((ROOT / 'sector_group_map.csv').open(encoding='utf-8-sig'))}
    except Exception: pass
    idx = {}
    for r in csv.DictReader((ROOT / 'market_daily.csv').open(encoding='utf-8-sig')):
        if r['symbol'] in ('^KS11', '^KQ11') and r['close']: idx.setdefault(r['symbol'], {})[r['date']] = float(r['close'])
    last = dates[-1]
    # 마지막 거래일에 시세가 있는 보통주(우선주 코드 끝자리 5·7·9 등 제외, catalog 있으면 catalog 기준)
    U = {c: s for c, s in S.items() if s['d'] and s['d'][-1] == last and (c in sector if sector else c[-1] == '0') and '스팩' not in s['name'] and '기업인수목적' not in s['name']}
    def ranks_at(lag):
        sc = {}
        for c, s in U.items():
            end = len(s['a']) - 1 - lag
            sc[c] = score(s['a'], end, len(dates)) if end >= 0 else None
        return sc, pct_rank(sc)
    sc0, r0 = ranks_at(0); _, r1 = ranks_at(5); _, r4 = ranks_at(20)
    rows = []
    for c, s in U.items():
        a = s['a']; n = len(a) - 1
        ret = lambda k: round((a[n] / a[n - k] - 1) * 100, 2) if n - k >= 0 else None
        isym = '^KS11' if s['mkt'] == 'KOSPI' else '^KQ11'; I = idx.get(isym, {})
        rl = [a[i] / I[s['d'][i]] for i in range(len(a)) if s['d'][i] in I]
        rl_hi = bool(rl) and rl[-1] >= max(rl) * 0.999
        hi = max(a); val20 = st.mean(s['val'][-20:]) / 1e8 if s['val'] else 0
        sec = sector.get(c, '')
        rows.append([c, s['name'], s['mkt'], r0[c], (r0[c] - r1[c]) if r0[c] and r1.get(c) else None, (r0[c] - r4[c]) if r0[c] and r4.get(c) else None,
                     round(sc0[c], 2) if sc0[c] is not None else None, ret(5), ret(21), ret(63), ret(126), round((a[n] / hi - 1) * 100, 2),
                     rl_hi, round(s['cap'] / 1e8), round(val20, 1), s['p'][-1], sec, grp.get(sec, ''), len(a)])
    rows.sort(key=lambda r: (r[3] is None, -(r[3] or 0), -(r[6] or 0)))
    out = dict(asof=last, first=dates[0], n_days=len(dates), updated_at=dt.datetime.now(KST).isoformat(timespec='seconds'),
               method='RS 점수 = 0.4×3개월 + 0.2×6개월 + 0.2×9개월 + 0.2×12개월 수익률(수정종가), 등급 = 전 종목 백분위 1~99',
               columns=['code', 'name', 'market', 'rs', 'rs_chg_1w', 'rs_chg_4w', 'score', 'ret_1w', 'ret_1m', 'ret_3m', 'ret_6m', 'from_high', 'rs_line_high', 'cap_eok', 'val20_eok', 'close', 'sector', 'group', 'days'],
               rows=rows)
    (ROOT / 'rs_rank.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(last, len(rows), 'stocks', len(dates), 'days')


if __name__ == '__main__':
    main()
