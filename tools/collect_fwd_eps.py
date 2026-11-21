"""전 종목 연간 EPS 컨센서스(FY1·FY2·FY3) 수집 → fwd_eps_raw.json, fwd_eps_hist.csv

출처: 네이버 증권 기업분석(navercomp.wisereport.co.kr, FnGuide 제공) 연간 실적 요약표 c1050001_data(flag=2).
'(E)' 표시 연도만 추정치로 씁니다. 종목 목록은 주가 등락률 자료(since_base_today.json)의 보통주 전체.
사용자 지시로 robots.txt 예외 적용(2026-11-21). 하루 1회, 장 마감 후, 동시 4건·요청 간 0.2초 간격.
fwd_eps_hist.csv는 값이 바뀐 날만 추가하고 기존 행은 지우지 않습니다.
"""
import csv, json, re, sys, time, urllib.request, urllib.parse, pathlib, datetime as dt
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
KST = dt.timezone(dt.timedelta(hours=9))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Referer': 'https://navercomp.wisereport.co.kr/v2/company/c1050001.aspx'}
URL = 'https://navercomp.wisereport.co.kr/company/ajax/c1050001_data.aspx?'
now = dt.datetime.now(KST); day = now.strftime('%Y-%m-%d')


def codes():
    J = json.loads((ROOT / 'since_base_today.json').read_text())
    out = []
    for m in J['markets'].values():
        ci = {c: i for i, c in enumerate(m['columns'])}
        for r in m['rows']:
            c = r[ci['code']]
            if r[ci['type']] == 'stock' and re.fullmatch(r'\d{5}0', c):  # 보통주(끝자리 0)만
                out.append(c)
    return sorted(set(out))


def one(c):
    q = dict(flag=2, cmp_cd=c, finGubun='MAIN', frq=0, sDT=now.strftime('%Y%m%d'), chartType='svg')
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL + urllib.parse.urlencode(q), headers=UA), timeout=25) as r:
                j = json.loads(r.read().decode('utf-8') or '{}')
            break
        except Exception as e:
            if a == 2: return c, None, str(e)[:80]
            time.sleep(1.5 * (a + 1))
    time.sleep(0.2)
    est = {}
    for x in j.get('JsonData') or []:
        m = re.match(r'(\d{4})\.(\d{2})\(E\)', x.get('YYMM', ''))
        v = (x.get('EPS') or '').replace(',', '')
        if m and re.fullmatch(r'-?\d+(\.\d+)?', v):
            est[f'{m[1]}/{m[2]}'] = float(v)
    return c, est, None


def main():
    C = codes(); res = {}; fails = []
    with ThreadPoolExecutor(4) as pool:
        for c, est, err in pool.map(one, C):
            if err: fails.append(c)
            elif est: res[c] = est
    st = dict(updated_at=now.isoformat(timespec='seconds'), codes=len(C), with_consensus=len(res), failures=len(fails))
    print(st)
    if len(res) < 50:
        (ROOT / 'fwd_eps_status.json').write_text(json.dumps(st | dict(error='too few results; kept previous'), ensure_ascii=False, indent=1))
        sys.exit(1)
    (ROOT / 'fwd_eps_raw.json').write_text(json.dumps(dict(date=day, rows=res), ensure_ascii=False, separators=(',', ':')))
    # 이력: (종목, 회계연도)별 마지막 값과 다를 때만 추가
    hp = ROOT / 'fwd_eps_hist.csv'; last = {}
    if hp.exists():
        for r in csv.DictReader(hp.open(encoding='utf-8')):
            last[(r['code'], r['period'])] = r['eps']
    new = [(day, c, p, str(v)) for c, est in sorted(res.items()) for p, v in sorted(est.items()) if last.get((c, p)) != str(v)]
    with hp.open('a', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        if not last: w.writerow(['date', 'code', 'period', 'eps'])
        w.writerows(new)
    st['hist_added'] = len(new)
    (ROOT / 'fwd_eps_status.json').write_text(json.dumps(st, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
