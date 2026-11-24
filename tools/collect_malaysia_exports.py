"""말레이시아에 공장을 둔 한국 기업 관련 품목의 월별 수출 → malaysia_exports.csv

출처: UN Comtrade 공개 API(무료, 키 없음) — 말레이시아 통계청(DOSM)이 UN에 보고한 월별 수출(FOB, 미 달러), 목적지별.
기업별 수출액은 공개되지 않으므로, 말레이시아에서 한국 기업이 주된 생산자인 품목(HS 6단위)의 국가 전체 수출을 봅니다.
품목·기업 대응은 malaysia_items.json. 기존 행은 지우지 않고, 최근 6개월과 아직 없는 달만 다시 받아 같은 (월, 품목, 목적지) 값을 갱신합니다.
"""
import csv, json, time, urllib.request, pathlib, datetime as dt

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'malaysia_exports.csv'; STATUS = ROOT / 'malaysia_exports_status.json'
ITEMS = json.loads((ROOT / 'malaysia_items.json').read_text(encoding='utf-8'))['items']
CODES = sorted({c for it in ITEMS for c in it['hs']})
API = 'https://comtradeapi.un.org/public/v1/preview/C/M/HS?reporterCode=458&period={p}&cmdCode={c}&flowCode=X'
NAMES = {0: '전체', 842: '미국', 156: '중국', 410: '한국', 392: '일본', 276: '독일', 528: '네덜란드', 704: '베트남', 702: '싱가포르',
         764: '태국', 484: '멕시코', 348: '헝가리', 616: '폴란드', 360: '인도네시아', 699: '인도', 344: '홍콩', 490: '대만', 124: '캐나다',
         826: '영국', 251: '프랑스', 380: '이탈리아', 203: '체코', 36: '호주', 608: '필리핀', 458: '말레이시아', 682: '사우디', 784: 'UAE',
         792: '튀르키예', 50: '방글라데시', 586: '파키스탄', 144: '스리랑카', 116: '캄보디아', 104: '미얀마', 381: '이탈리아', 757: '스위스', 56: '벨기에'}
UNIT = {5: '개', 8: 'kg'}
FIELDS = ['period', 'hs', 'partner_code', 'partner', 'value_usd', 'qty', 'qty_unit', 'net_kg', 'src']
st = {'run': dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec='seconds'), 'codes': CODES, 'months': {}, 'errors': []}


def get(p):
    for a in range(4):
        try:
            req = urllib.request.Request(API.format(p=p, c=','.join(CODES)), headers={'User-Agent': 'korea-export-data/1.0 (personal dashboard)'})
            j = json.loads(urllib.request.urlopen(req, timeout=90).read())
            if j.get('count', 0) >= 500: st['errors'].append(f'{p} 500건 한도 도달')
            return j.get('data') or []
        except Exception as e:
            if a == 3:
                st['errors'].append(f'{p} {str(e)[:80]}'); return None
            time.sleep(6 * (a + 1))


def main():
    old = {(r['period'], r['hs'], r['partner_code']): r for r in csv.DictReader(OUT.open(encoding='utf-8'))} if OUT.exists() else {}
    have = {}
    for (p, h, _) in old: have.setdefault(p, set()).add(h)
    today = dt.date.today(); months = []; y, m = 2019, 1
    while (y, m) <= (today.year, today.month):
        months.append(f'{y}{m:02d}'); m += 1
        if m > 12: y, m = y + 1, 1
    recent = set(months[-6:])
    for p in months:
        key = f'{p[:4]}-{p[4:]}'
        if p not in recent and set(CODES) <= have.get(key, set()):
            continue
        rows = get(p); time.sleep(1.5)
        if rows is None: continue
        n = 0
        for r in rows:
            if r.get('partner2Code') not in (0, None) or str(r.get('motCode', 0)) != '0' or r.get('customsCode') not in ('C00', None):
                continue
            pc = int(r['partnerCode'])
            old[(key, r['cmdCode'], str(pc))] = dict(period=key, hs=r['cmdCode'], partner_code=pc, partner=NAMES.get(pc, ''),
                value_usd=round(r.get('primaryValue') or 0), qty=round(r['qty']) if r.get('qty') else '', qty_unit=UNIT.get(r.get('qtyUnitCode'), ''),
                net_kg=round(r['netWgt']) if r.get('netWgt') else '', src='UN Comtrade (DOSM 보고)')
            n += 1
        if n: st['months'][key] = n
    rows = sorted(old.values(), key=lambda r: (r['period'], r['hs'], int(r['partner_code'])))
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(rows)
    st['rows'] = len(rows); st['last'] = {c: max((r['period'] for r in rows if r['hs'] == c and str(r['partner_code']) == '0'), default=None) for c in CODES}
    STATUS.write_text(json.dumps(st, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in st.items() if k != 'months'}, ensure_ascii=False)[:900])


if __name__ == '__main__':
    main()
