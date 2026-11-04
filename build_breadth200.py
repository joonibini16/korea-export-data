"""200일 이동평균선 위 종목 비율(코스피·코스닥) → breadth200.csv

원본: KRX 정보데이터시스템 전종목 일별 종가 — krx_hist/YYYY.json.gz(2000~2025-09) + foreign_buy_days/*.json.gz(2025-10~)
- 그날 상장돼 있던 전 종목 기준(상장폐지 종목 포함 → 생존편향 없음), 보통주·우선주 모두 포함(KRX 시세 그대로)
- 주식 수가 하루 15% 넘게 바뀌면(분할·병합·무상증자) 이전 가격을 그 비율로 보정해 이동평균이 왜곡되지 않게 함
- 200거래일 이상 시세가 쌓인 종목만 분모에 넣음
출력 열: date, market, n(분모), above(200일선 위), pct(%)
추가 출력 breadth_hl60.csv(2024~): 60일 종가 신고가·신저가 종목 수와 Breadth = (신고가−신저가)÷(신고가+신저가)×100
"""
import csv, gzip, json, pathlib
from collections import deque

ROOT = pathlib.Path(__file__).resolve().parent
N = 200


def days():
    out = {}
    for f in sorted((ROOT / 'krx_hist').glob('*.json.gz')):
        for d, v in json.loads(gzip.decompress(f.read_bytes())).items():
            if d.startswith('_'): continue
            out[d] = {m: [(r[0], r[1], r[2]) for r in rows] for m, rows in v.items()}
    for f in sorted((ROOT / 'foreign_buy_days').glob('20*.json.gz')):
        d = f.name[:10]
        if d in out: continue
        v = json.loads(gzip.decompress(f.read_bytes()))
        out[d] = {m: [(r[0], r[5], round(r[4] / r[5]) if r[5] else 0) for r in rows if r[5] and r[4]] for m, rows in v.items()}
    return out


def main():
    D = days(); rows = []; hl = []
    W = {}  # (market, code) -> [deque(prices), last_shares, running_sum]
    H = {}  # (market, code) -> deque(최근 60 종가, 보정)
    for d in sorted(D):
        for m, recs in D[d].items():
            n = above = 0; hn = nh = nl = 0; doHL = d >= '2024-01-01'
            for code, close, sh in recs:
                k = (m, code); w = W.get(k)
                if w is None: w = W[k] = [deque(maxlen=N), sh, 0.0]
                q = w[0]
                if w[1] and sh and (sh / w[1] > 1.15 or sh / w[1] < 1 / 1.15):
                    r = sh / w[1]
                    for i in range(len(q)): q[i] /= r
                    w[2] = sum(q)
                    hh = H.get(k)
                    if hh:
                        for i in range(len(hh)): hh[i] /= r
                w[1] = sh or w[1]
                if len(q) == N: w[2] -= q[0]
                h = H.get(k)
                if h is None: h = H[k] = deque(maxlen=60)
                q.append(close); w[2] += close
                h.append(close)
                if doHL and len(h) == 60:
                    hn += 1
                    if close >= max(h): nh += 1
                    elif close <= min(h): nl += 1
                if len(q) == N:
                    n += 1
                    if close > w[2] / N: above += 1
            if n >= 50: rows.append(dict(date=d, market=m, n=n, above=above, pct=round(above / n * 100, 2)))
            if hn >= 50 and doHL: hl.append(dict(date=d, market=m, n=hn, nh=nh, nl=nl, breadth=round((nh - nl) / (nh + nl) * 100, 1) if nh + nl else 0.0))
    with (ROOT / 'breadth200.csv').open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['date', 'market', 'n', 'above', 'pct']); w.writeheader(); w.writerows(rows)
    with (ROOT / 'breadth_hl60.csv').open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['date', 'market', 'n', 'nh', 'nl', 'breadth']); w.writeheader(); w.writerows(hl)
    print(len(rows), rows[0]['date'] if rows else None, rows[-1] if rows else None)


if __name__ == '__main__':
    main()
