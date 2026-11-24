"""말레이시아 리튬이온 배터리(HS 8507.60) 월별 수출 — 원통형 셀 추정용 → malaysia_cells.csv

출처: UN Comtrade 공개 API(무료, 키 없음) — 말레이시아 통계청(DOSM)이 UN에 보고한 월별 수출(FOB, 미 달러), 목적지별.
말레이시아 관세분류에는 '원통형 셀' 전용 코드가 없어 HS 8507.60 전체를 씁니다. 말레이시아 리튬이온 수출은
삼성SDI 스름반·EVE 등 원통형 셀 공장이 대부분이라 원통형 셀 수출의 대리지표로 봅니다(개당 단가로 셀/팩 성격 점검).
기존 행은 지우지 않고, 최근 6개월과 아직 없는 달만 다시 받아 같은 (월, 목적지) 값을 갱신합니다.
"""
import csv, json, time, urllib.request, pathlib, datetime as dt

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'malaysia_cells.csv'; STATUS = ROOT / 'malaysia_cells_status.json'
API = 'https://comtradeapi.un.org/public/v1/preview/C/M/HS?reporterCode=458&period={p}&cmdCode=850760&flowCode=X'
NAMES = {0: '전체', 842: '미국', 156: '중국', 410: '한국', 392: '일본', 276: '독일', 528: '네덜란드', 704: '베트남', 702: '싱가포르',
         764: '태국', 484: '멕시코', 348: '헝가리', 616: '폴란드', 360: '인도네시아', 699: '인도', 344: '홍콩', 490: '대만', 124: '캐나다',
         826: '영국', 251: '프랑스', 380: '이탈리아', 203: '체코', 36: '호주', 608: '필리핀', 458: '말레이시아'}
FIELDS = ['period', 'partner_code', 'partner', 'value_usd', 'qty_units', 'net_kg', 'src']
st = {'run': dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec='seconds'), 'months': {}, 'errors': []}


def get(p):
    for a in range(4):
        try:
            req = urllib.request.Request(API.format(p=p), headers={'User-Agent': 'korea-export-data/1.0 (personal dashboard)'})
            return json.loads(urllib.request.urlopen(req, timeout=60).read()).get('data') or []
        except Exception as e:
            if a == 3:
                st['errors'].append(f'{p} {str(e)[:80]}'); return None
            time.sleep(5 * (a + 1))


def main():
    old = {(r['period'], r['partner_code']): r for r in csv.DictReader(OUT.open(encoding='utf-8'))} if OUT.exists() else {}
    have = {k[0] for k in old}
    today = dt.date.today(); months = []
    y, m = 2019, 1
    while (y, m) <= (today.year, today.month):
        months.append(f'{y}{m:02d}'); m += 1
        if m > 12: y, m = y + 1, 1
    recent = set(months[-6:])
    for p in months:
        key = f'{p[:4]}-{p[4:]}'
        if key in have and p not in recent:
            continue
        rows = get(p); time.sleep(1.2)
        if rows is None:
            continue
        n = 0
        for r in rows:
            if r.get('partner2Code') not in (0, None) or str(r.get('motCode', 0)) not in ('0',) or r.get('customsCode') not in ('C00', None):
                continue
            pc = int(r['partnerCode'])
            old[(key, str(pc))] = dict(period=key, partner_code=pc, partner=NAMES.get(pc, ''), value_usd=round(r.get('primaryValue') or 0),
                                       qty_units=round(r['qty']) if r.get('qty') else '', net_kg=round(r['netWgt']) if r.get('netWgt') else '',
                                       src='UN Comtrade (DOSM 보고)')
            n += 1
        if n: st['months'][key] = n
    rows = sorted(old.values(), key=lambda r: (r['period'], int(r['partner_code'])))
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(rows)
    st['rows'] = len(rows); st['last'] = max((r['period'] for r in rows if str(r['partner_code']) == '0'), default=None)
    STATUS.write_text(json.dumps(st, ensure_ascii=False, indent=1))
    print(json.dumps(st, ensure_ascii=False)[:800])


if __name__ == '__main__':
    main()
