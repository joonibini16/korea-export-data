"""관세청 잠정치·확정치 발표 PDF 텍스트(provisional_text/*.txt)에서 품목·국가별 수출입 표를 읽어 provisional_items.csv 로 저장.

- 1~10일(D10)·1~20일(D20) 잠정치 붙임 표: 수출/수입 주요품목 10개 + 주요국가 10개 (금액 백만 달러, 전년동기대비 %)
- 월간 확정치(FINAL) 표: 월 전체 품목·국가 (형식이 다르면 가능한 범위만)
- 총계는 provisional_official.csv 의 수출 총액을 함께 기록(kind=total)
- 전년동기 금액은 금액/(1+증감률) 로 역산(prev_usd_mn)
"""
import csv, pathlib, re

SRC = pathlib.Path('provisional_text')
OUT = pathlib.Path('provisional_items.csv')
FIELDS = ['month', 'release', 'end_day', 'kind', 'flow', 'name', 'usd_mn', 'yoy_pct', 'prev_usd_mn', 'source']
NUM = r'(?:\d{1,3}(?:,\d{3})+|\d+)'
YOY = r'(?:△\s*)?\d+(?:\.\d+)?|-'
ROW2 = re.compile(rf'^\s*(?P<n1>[가-힣()·\s]+?)\s+(?P<a1>{NUM})\s+(?P<y1>{YOY})\s+(?P<n2>[가-힣()·\s]+?)\s+(?P<a2>{NUM})\s+(?P<y2>{YOY})\s*$')
ROW1 = re.compile(rf'^\s*(?P<n1>[가-힣()·\s]+?)\s+(?P<a1>{NUM})\s+(?P<y1>{YOY})\s*$')
FINAL_ALIAS = {'승용자동차': '승용차', '반도체': '반도체', '선박': '선박', '유럽연합': '유럽연합(EU)'}
ALIAS = {'무선통신기기': '무선통신기기', '반도체제조장비': '반도체제조장비', '유럽연합': '유럽연합(EU)', 'EU': '유럽연합(EU)'}


def nm(s):
    s = re.sub(r'\s+', '', s)
    return ALIAS.get(s, s)


def yv(s):
    s = s.replace(' ', '')
    if s in ('-', ''):
        return None
    return -float(s[1:]) if s.startswith('△') else float(s)


def end_of(month, rel):
    import calendar
    y, m = map(int, month.split('.'))
    return {'D10': 10, 'D20': 20}.get(rel, calendar.monthrange(y, m)[1])


def parse_block(lines, kind, month, rel, src):
    out = []
    for ln in lines:
        m = ROW2.match(ln)
        pairs = []
        if m:
            pairs = [('export', m['n1'], m['a1'], m['y1']), ('import', m['n2'], m['a2'], m['y2'])]
        else:
            m = ROW1.match(ln)
            if m:
                pairs = [('export', m['n1'], m['a1'], m['y1'])]
        for flow, n, a, y in pairs:
            n = nm(n)
            if not n or n in ('주요품목', '주요국가', '금액', '증감률'):
                continue
            usd = float(a.replace(',', ''))
            yy = yv(y)
            prev = round(usd / (1 + yy / 100), 1) if yy is not None and yy > -100 else ''
            out.append({'month': month, 'release': rel, 'end_day': end_of(month, rel), 'kind': kind, 'flow': flow,
                        'name': n, 'usd_mn': usd, 'yoy_pct': '' if yy is None else yy, 'prev_usd_mn': prev, 'source': src})
    return out


def parse_file(f):
    month, rel = f.stem.split('_')
    txt = f.read_text(encoding='utf-8')
    head = txt.splitlines()[:2]
    src = head[1][2:].strip() if len(head) > 1 and head[1].startswith('# ') else ''
    lines = txt.splitlines()
    rows = []
    # 총괄 표: '구분' 다음 처음 나오는 숫자 5개 줄 = 수출 [전년 당월, 전년 누계, 전월, 당월, 누계]
    if rel in ('D10', 'D20', 'MONTH'):
        for i, ln in enumerate(lines):
            if re.sub(r'\s+', '', ln) .startswith('구분'):
                for ln2 in lines[i + 1:i + 12]:
                    v = re.findall(r'-?\d{1,3}(?:,\d{3})+', ln2)
                    if len(v) >= 5:
                        prev, cur = float(v[0].replace(',', '')), float(v[3].replace(',', ''))
                        rows.append({'month': month, 'release': rel, 'end_day': end_of(month, rel), 'kind': 'total', 'flow': 'export', 'name': '총계',
                                     'usd_mn': cur, 'yoy_pct': round((cur / prev - 1) * 100, 1), 'prev_usd_mn': prev, 'source': src})
                        break
                break
    # MONTH 발표의 월별 수출 표(전년·당해 12개월 금액)
    if rel == 'MONTH':
        y = int(month[:4])
        amt = {}
        for i, ln in enumerate(lines):
            t = ln.strip()
            m = re.match(r'^(?:수출\s+)?금액\s+(.*)$', t)
            if m and len(amt) < 2:
                nxt = ' '.join(lines[i + 1:i + 3])
                yr = re.search(r'\b(20\d\d)\b', nxt) or re.search(r'\b(20\d\d)\b', lines[i + 1] if i + 1 < len(lines) else '')
                vals = [float(x.replace(',', '')) for x in re.findall(r'-?\d{1,3}(?:,\d{3})+|-?\d+', m.group(1))]
                yrv = int(yr.group(1)) if yr else (y - 1 if not amt else y)
                amt[yrv] = vals
        if y in amt and y - 1 in amt:
            for k in range(int(month[5:])):
                v = amt[y][k]
                p = amt[y - 1][k]
                rows.append({'month': f'{y}.{k + 1:02d}', 'release': 'MONTHLY', 'end_day': end_of(f'{y}.{k + 1:02d}', 'MONTH'), 'kind': 'total', 'flow': 'export',
                             'name': '총계', 'usd_mn': v, 'yoy_pct': round((v / p - 1) * 100, 1), 'prev_usd_mn': p, 'source': src})
    # 월간 확정치 상세 통계표: '1. 수출 실적 / 가. 품목별'(수출) · '2. 수입 실적 / 가. 품목별'(수입) · '나. 국가(지역)별'
    if rel == 'FINAL':
        flow = None; kind = None
        for ln in lines:
            t = re.sub(r'\s+', '', ln)
            if t.startswith('□') and ('출항일' in t or '선적일' in t or '보조통계' in t):
                break  # 잠정치와 같은 '수리일 기준' 표만 사용
            if '수출실적' in t: flow = 'export'
            elif '수입실적' in t: flow = 'import'
            elif '용도별' in t: flow = None
            if t.endswith('품목별') or '가.품목별' in t: kind = 'item'; continue
            if '국가(지역)별' in t: kind = 'country'; continue
            if not flow or not kind:
                continue
            m = re.match(rf'^\s*(?P<n>[^\d△]+?)\s+(?P<p>{NUM})\s+(?P<c>{NUM})\s+(?P<y>{YOY})\s+(?P<pp>{NUM})\s+(?P<cc>{NUM})\s+(?P<yy>{YOY})\s*$', ln)
            if not m:
                continue
            n = re.sub(r'^(?:\d+\.|ㅇ|-)', '', re.sub(r'[\s()]', '', m['n']))
            n = FINAL_ALIAS.get(n, n)
            if n in ('전체수출', '전체수입'):
                n = '총계'
            c, p = float(m['c'].replace(',', '')), float(m['p'].replace(',', ''))
            rows.append({'month': month, 'release': 'FINAL', 'end_day': end_of(month, 'FINAL'), 'kind': 'total' if n == '총계' else kind, 'flow': flow,
                         'name': n, 'usd_mn': c, 'yoy_pct': yv(m['y']), 'prev_usd_mn': p, 'source': src})
    # □ 주요품목 / □ 주요국가 블록 (붙임 표) — 다음 '□' 또는 페이지 꼬리까지
    for i, ln in enumerate(lines):
        t = re.sub(r'\s+', '', ln)
        kind = 'item' if t.startswith('□주요품목') or t.startswith('□품목별') else 'country' if t.startswith('□주요국가') or t.startswith('□국가별') else None
        if not kind:
            continue
        blk = []
        for ln2 in lines[i + 1:]:
            if ln2.strip().startswith('□') or re.match(r'^\s*-\s*\d+\s*-\s*$', ln2):
                break
            blk.append(ln2)
        rows += parse_block(blk, kind, month, rel, src)
    return rows


def main():
    # 같은 키는 나중 발표(정정 반영) 값으로 덮어씀
    latest = {}
    for f in sorted(SRC.glob('*_*.txt')):
        if f.name.startswith('_'):
            continue
        for r in parse_file(f):
            latest[(r['month'], r['release'], r['kind'], r['flow'], r['name'])] = r
    rows = list(latest.values())
    # 총계: provisional_official.csv(잠정치 발표문 본문) — 품목 표와 같은 발표 기준
    po = pathlib.Path('provisional_official.csv')
    have = {(r['month'], r['release']) for r in rows}
    if po.exists():
        for r in csv.DictReader(po.open(encoding='utf-8-sig')):
            k = (r['기준월'], r['기간구분'])
            if k not in have and r['기간구분'] != 'MONTH':
                continue
            try:
                usd, prev, yy = float(r['수출_USD_mn']), float(r['전년동기수출_USD_mn']), float(r['수출YoY_pct'])
            except ValueError:
                continue
            rows.append({'month': k[0], 'release': k[1], 'end_day': r['종료일'], 'kind': 'total', 'flow': 'export', 'name': '총계',
                         'usd_mn': usd, 'yoy_pct': yy, 'prev_usd_mn': prev, 'source': r['출처URL']})
    # 기존 파일의 행은 지우지 않음(이후 원문이 사라져도 이력 보존): 같은 키는 새 값으로 갱신
    old = []
    if OUT.exists():
        old = list(csv.DictReader(OUT.open(encoding='utf-8-sig')))
    key = lambda r: (r['month'], r['release'], r['kind'], r['flow'], r['name'])
    merged = {key(r): r for r in old}
    merged.update({key(r): r for r in rows})
    order = {'D10': 0, 'D20': 1, 'MONTH': 2, 'MONTHLY': 3, 'FINAL': 4}
    out = sorted(merged.values(), key=lambda r: (r['month'], order.get(r['release'], 9), r['kind'], r['flow'], -float(r['usd_mn'] or 0)))
    with OUT.open('w', encoding='utf-8-sig', newline='') as fo:
        w = csv.DictWriter(fo, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out)
    n = {}
    for r in out:
        n[r['release']] = n.get(r['release'], 0) + 1
    print(len(out), 'rows', n)


if __name__ == '__main__':
    main()
