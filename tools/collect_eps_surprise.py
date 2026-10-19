"""해외 관찰 기업 분기 EPS: 실제 vs 컨센서스(최근 2년) 수집 — 자료: Yahoo Finance(yfinance).

- 대상: global_earnings.json 의 watchlist 전체(티커 → Yahoo 심볼 매핑은 YAHOO 사전).
- 1순위 get_earnings_dates(최근 약 3년 발표일·EPS 추정·실제·서프라이즈), 실패하면 earnings_history(최근 4개 분기)로 대체.
- EPS 는 자료 제공자 기준(대개 조정·비GAAP, ADR 은 ADR 1주 기준)이며 회사 공시 GAAP EPS 와 다를 수 있습니다.
- 출력: global_eps_surprise.json
사용: python tools/collect_eps_surprise.py [TICKER ...]
"""
import json, sys, time, math, pathlib, datetime as dt

import yfinance as yf

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'global_eps_surprise.json'
KST = dt.timezone(dt.timedelta(hours=9))
YAHOO = {'CATL': '300750.SZ'}          # 나머지는 watchlist 티커를 그대로 사용
DAYS = 760                             # 최근 2년 + 여유(발표 지연분)


def num(v):
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


def from_dates(t, since):
    df = t.get_earnings_dates(limit=16)
    if df is None or df.empty:
        return []
    rows = []
    for idx, r in df.iterrows():
        d = idx.date() if hasattr(idx, 'date') else None
        act, est = num(r.get('Reported EPS')), num(r.get('EPS Estimate'))
        if d is None or d < since or d > dt.date.today() or act is None:
            continue
        sp = num(r.get('Surprise(%)'))
        rows.append({'date': d.isoformat(), 'eps_estimate': est, 'eps_actual': act, 'surprise_pct': sp})
    return rows


def from_history(t, since):
    df = t.earnings_history
    if df is None or getattr(df, 'empty', True):
        return []
    rows = []
    for idx, r in df.iterrows():
        d = idx.date() if hasattr(idx, 'date') else dt.date.fromisoformat(str(idx)[:10])
        act, est = num(r.get('epsActual')), num(r.get('epsEstimate'))
        if d < since or act is None:
            continue
        sp = num(r.get('surprisePercent'))
        rows.append({'date': d.isoformat(), 'quarter_end': True, 'eps_estimate': est, 'eps_actual': act,
                     'surprise_pct': None if sp is None else round(sp * 100, 2)})
    return rows


def finish(rows):
    seen, out = set(), []
    for r in sorted(rows, key=lambda x: x['date']):
        if r['date'] in seen:
            continue
        seen.add(r['date'])
        e, a = r['eps_estimate'], r['eps_actual']
        if r.get('surprise_pct') is None and e not in (None, 0):
            r['surprise_pct'] = round((a - e) / abs(e) * 100, 2)
        r['result'] = None if e is None else ('상회' if a > e else '하회' if a < e else '부합')
        out.append(r)
    return out


def collect(ticker, since):
    sym = YAHOO.get(ticker, ticker)
    t = yf.Ticker(sym)
    rows, src, err = [], '', ''
    for name, fn in (('earnings_dates', from_dates), ('earnings_history', from_history)):
        for a in range(3):
            try:
                rows = fn(t, since)
                break
            except Exception as e:  # 일시 오류·차단은 재시도
                err = f'{type(e).__name__}: {e}'[:200]
                time.sleep(3 * (a + 1))
        if rows:
            src = name
            break
    cur = ''
    try:
        info = t.info or {}
        cur = info.get('financialCurrency') or info.get('currency') or ''
    except Exception:
        pass
    return {'ticker': ticker, 'yahoo': sym, 'currency': cur, 'method': src,
            'quarters': finish(rows)}, err


def main():
    wl = json.loads((ROOT / 'global_earnings.json').read_text())['watchlist']
    want = set(sys.argv[1:])
    since = dt.date.today() - dt.timedelta(days=DAYS)
    old = {}
    if OUT.exists():
        try:
            old = {c['ticker']: c for c in json.loads(OUT.read_text()).get('companies', [])}
        except Exception:
            old = {}
    companies, missing = [], []
    for w in wl:
        tk = w['ticker']
        if want and tk not in want:
            if tk in old:
                companies.append(old[tk])
            continue
        c, err = collect(tk, since)
        if c['quarters']:
            companies.append(c)
            print(tk, c['yahoo'], c['method'], len(c['quarters']))
        elif tk in old:                       # 이번에 실패하면 이전 값 유지
            companies.append(old[tk])
            missing.append({'ticker': tk, 'reason': '이번 수집 실패 · 이전 값 유지 ' + err})
            print(tk, 'KEEP', err)
        else:
            missing.append({'ticker': tk, 'reason': err or '제공자 EPS 컨센서스 없음'})
            print(tk, 'NONE', err)
        time.sleep(1.0)
    data = {
        'updated_at': dt.datetime.now(KST).isoformat(timespec='seconds'),
        'provider': 'Yahoo Finance (yfinance) EPS 추정·실적',
        'method': '발표일 기준 최근 2년. EPS·컨센서스는 자료 제공자 기준(대개 조정 EPS, ADR은 ADR 1주 기준)으로 회사 공시 GAAP EPS와 다를 수 있습니다. 서프라이즈 = (실제−컨센서스)/|컨센서스|. 반기 보고 기업은 반기 실적만 표시됩니다. 실제 EPS에 지분 평가이익 등 일회성 손익이 포함되면 서프라이즈가 크게 과장될 수 있습니다(예: 투자지분 평가이익이 반영된 분기). 매출 위주로 발표하거나 반기 보고하는 일부 유럽 기업은 제공자 컨센서스가 없어 제외됩니다.',
        'companies': companies,
        'missing': missing,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('companies', len(companies), 'missing', len(missing))


if __name__ == '__main__':
    main()
