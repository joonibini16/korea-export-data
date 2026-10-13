"""컨센서스 추이(상향·하향 흐름) 수집: 네이버 증권 기업분석(와이즈리포트) '컨센서스 추이'.

회사·회계기간마다 과거 시점별 컨센서스(평균·최저·최고)를 받아 누적 저장합니다.
- 연간(frq=Y): 회계연도별 최근 약 1년의 월말 시점 컨센서스
- 분기(frq=Q): 분기별 최근 약 3개월의 주간 시점 컨센서스
- 항목: 매출액(121000)·영업이익(121500)·순이익(122700) 요청 시 EPS가 함께 옵니다.
소스는 과거 기준일을 넣어도 항상 최근 약 1년치만 주므로, 매 실행 결과를 기존 파일과 (회사, 주기, 기간, 항목, 시점) 기준으로 합쳐, 시간이 지날수록 이력이 길어집니다.
비공식 내부 JSON이라 형식이 바뀌면 그 회사만 실패로 기록하고 기존 값은 유지합니다.
Output: consensus_trend.csv, consensus_trend_status.json
"""
import csv, json, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
BASE = 'https://navercomp.wisereport.co.kr/company/ajax/'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Referer': 'https://navercomp.wisereport.co.kr/v2/company/c1050001.aspx'}
ITEMS = {'121000': 'revenue', '121500': 'op', '122700': 'ni'}
OUT, STATUS = Path('consensus_trend.csv'), Path('consensus_trend_status.json')
FIELDS = ['company_id', 'freq', 'period', 'item', 'date', 'avg', 'min', 'max', 'unit', 'retrieved']


def get(url, tries=3):
    last = None
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            last = e; time.sleep(1.5 * (a + 1))
    raise RuntimeError(str(last)[:120])


def periods(cid, frq, dt):
    j = get(BASE + 'c1050001_data.aspx?' + urllib.parse.urlencode(dict(flag=3, cmp_cd=cid, finGubun='MAIN', frq=frq, sDT=dt, chartType='svg')))
    return [x['YYMM'] for x in j.get('JsonData') or []]


def series(cid, frq, yymm, acc, dt):
    j = get(BASE + 'cF5002.aspx?' + urllib.parse.urlencode(dict(cmp_cd=cid, dt=dt, yymm=yymm, frq=frq, acc_cd=acc, fingubun='MAIN', chartType='svg')))
    out = []
    if not j:
        return out
    for key, item in (('chart2', ITEMS[acc]), ('chart1', 'eps')):
        if not j.get(key):
            continue
        c = json.loads(j[key])
        for d, a, mm in zip(c.get('categories') or [], c.get('avg') or [], c.get('min_max') or [[None, None]] * 999):
            if a is None:
                continue
            out.append(dict(freq=frq, period=f'{yymm[:4]}/{yymm[4:]}', item=item, date=d.replace('/', '-'), avg=a,
                            min=(mm or [None, None])[0], max=(mm or [None, None])[1], unit=c.get('item_unit', '')))
    return out


def one(cid, dt, today):
    rows = []
    ys = [p for p in periods(cid, 0, dt) if int(p[:4]) >= today.year - 1]
    qs = periods(cid, 1, dt)
    for yymm in ys:
        for acc in ITEMS:
            rows += series(cid, 'Y', yymm, acc, dt); time.sleep(0.25)
    for yymm in qs[-6:]:  # 최근·향후 분기
        for acc in ('121000', '121500'):
            rows += series(cid, 'Q', yymm, acc, dt); time.sleep(0.25)
    for r in rows:
        r['company_id'] = cid
    return rows


def merge_file(new_path):
    """커밋 직전 최신 원격 파일에 이번 실행분(new_path)을 다시 합칩니다(동시 실행 충돌 방지)."""
    key = lambda r: (r['company_id'], r['freq'], r['period'], r['item'], r['date'])
    old = {key(r): r for r in csv.DictReader(OUT.open(encoding='utf-8'))} if OUT.exists() else {}
    for r in csv.DictReader(Path(new_path).open(encoding='utf-8')):
        k = key(r)
        if k in old and old[k]['date'] < r['retrieved'][:10]:
            continue  # 이미 저장된 과거 시점 값은 덮어쓰지 않음(기록 보존)
        old[k] = r
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(sorted(old.values(), key=key))
    print('merged', len(old))


def main():
    import sys
    if '--merge' in sys.argv:
        return merge_file(sys.argv[sys.argv.index('--merge') + 1])
    now = datetime.now(KST); dt = now.strftime('%Y%m%d'); stamp = now.isoformat(timespec='seconds')
    ids = [c['id'] for c in json.loads(Path('company_watchlist.json').read_text())['companies'] if c['id'].isdigit()]
    fails, got = [], []
    def job(cid):
        try:
            return one(cid, dt, now)
        except Exception as e:
            fails.append(dict(id=cid, error=str(e)[:120])); return []
    with ThreadPoolExecutor(4) as pool:
        for rows in pool.map(job, ids):
            got += rows
    key = lambda r: (r['company_id'], r['freq'], r['period'], r['item'], r['date'])
    old = {key(r): r for r in csv.DictReader(OUT.open(encoding='utf-8'))} if OUT.exists() else {}
    for r in got:
        r['retrieved'] = stamp
        kk = key(r)
        if kk in old and old[kk]['date'] < stamp[:10]:
            continue  # 과거 시점 값은 처음 저장된 그대로 보존
        old[kk] = {k: r.get(k, '') for k in FIELDS}
    with Path('consensus_trend_new.csv').open('w', encoding='utf-8', newline='') as f:  # 이번 실행분(커밋 단계 재병합용)
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(sorted(({k: r.get(k, '') for k in FIELDS} for r in got), key=key))
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader()
        w.writerows(sorted(old.values(), key=key))
    covered = sorted({r['company_id'] for r in got})
    STATUS.write_text(json.dumps(dict(updated_at=stamp, companies=len(ids), with_data=len(covered), rows_fetched=len(got),
                                      rows_stored=len(old), failures=fails), ensure_ascii=False, indent=1))
    print('companies', len(ids), 'with data', len(covered), 'rows', len(got), 'stored', len(old), 'fails', len(fails))
    if not got:
        raise SystemExit('no consensus trend rows')


if __name__ == '__main__':
    main()
