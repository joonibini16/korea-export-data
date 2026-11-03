"""KRX 전종목 일별 종가 과거 이력(2000~2025-09) → krx_hist/YYYY.json.gz

원본: KRX 정보데이터시스템 '전종목 시세'(MDCSTAT01501) — 그날 상장돼 있던 모든 종목(이후 상장폐지 종목 포함, 생존편향 없음)
저장: {날짜: {"KOSPI": [[코드, 종가, 상장주식수], ...], "KOSDAQ": [...]}} · 휴장일은 "_holidays"에 기록
2025-10 이후는 foreign_buy_days(같은 원본)를 그대로 씁니다. 이미 받은 날짜는 다시 받지 않고, 기존 자료는 지우지 않습니다.
한 번 실행에 제한시간(기본 150분)까지 받고, 덜 끝나면 워크플로가 자기 자신을 다시 실행합니다.
"""
import datetime as dt, gzip, json, os, pathlib, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import collect_foreign_buy as fb  # KRX 세션·로그인 재사용

OUT = ROOT / 'krx_hist'; OUT.mkdir(exist_ok=True)
ST = ROOT / 'krx_hist_status.json'
START = dt.date.fromisoformat(os.environ.get('HIST_FROM') or '1999-01-04')
END = dt.date(2025, 9, 30)
BUDGET = float(os.environ.get('BUDGET_MIN') or 150) * 60
T0 = time.time()


def load(y):
    f = OUT / f'{y}.json.gz'
    return json.loads(gzip.decompress(f.read_bytes())) if f.exists() else {}


def save(y, d):
    (OUT / f'{y}.json.gz').write_bytes(gzip.compress(json.dumps(d, separators=(',', ':')).encode(), mtime=0))


def main():
    st = {'run': dt.datetime.now().isoformat(timespec='seconds'), 'years': {}}
    ok = fb.login(); st['login'] = ok
    if not ok:
        ST.write_text(json.dumps(st, ensure_ascii=False, indent=1)); return 1
    done = True
    for y in range(START.year, END.year + 1):
        D = load(y); hol = set(D.get('_holidays', [])); fetched = 0; changed = False
        d = max(START, dt.date(y, 1, 1)); e = min(END, dt.date(y, 12, 31))
        while d <= e:
            if time.time() - T0 > BUDGET: done = False; break
            ds = d.isoformat()
            if d.weekday() < 5 and ds not in D and ds not in hol:
                day = {}
                try:
                    for m in ('KOSPI', 'KOSDAQ'):
                        caps = fb.caps_krx(m, d.strftime('%Y%m%d')); time.sleep(0.35)
                        day[m] = [[c, v['close'], round(v['cap'] / v['close'])] for c, v in caps.items() if v['close'] and v['cap']]
                except Exception as ex:
                    st.setdefault('errors', []).append(f'{ds} {str(ex)[:80]}'); time.sleep(3); d += dt.timedelta(days=1); continue
                if day.get('KOSPI') or day.get('KOSDAQ'): D[ds] = day; fetched += 1
                else: hol.add(ds)
                changed = True
                if fetched and fetched % 40 == 0: D['_holidays'] = sorted(hol); save(y, D)
            d += dt.timedelta(days=1)
        if changed: D['_holidays'] = sorted(hol); save(y, D)
        st['years'][y] = dict(days=len([k for k in D if not k.startswith('_')]), fetched=fetched)
        ST.write_text(json.dumps(st, ensure_ascii=False, indent=1))
        if not done: break
    st['complete'] = done; st['elapsed_min'] = round((time.time() - T0) / 60, 1)
    ST.write_text(json.dumps(st, ensure_ascii=False, indent=1)); print(json.dumps(st)[:800])
    pathlib.Path('/tmp/krx_hist_done').write_text('1' if done else '0')
    return 0


if __name__ == '__main__':
    sys.exit(main())
