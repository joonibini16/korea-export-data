"""부문(제품)별 분기 매출·영업이익 수집: KIND 정기보고서 주석 '영업부문 정보' 표.

- 표 찾기: 매출(수익) 행과 영업이익(부문손익) 행을 함께 담고, 머리글에 부문 이름이 있는 첫 표(연결 주석이 먼저 나옴).
- 값: 보고서마다 누적(YTD) 값을 저장하고, 분기 값 = 이번 누적 − 직전 분기 누적(1분기는 그대로).
  표에 '3개월/누적' 열이 따로 있으면 누적 열을 씁니다.
- 합계·연결조정 열은 '합계'·'조정'으로 따로 둡니다. 검증: 부문 합계(조정 포함)가 회사 연결 매출(company_financials.csv)과
  2% 안에서 맞는지 status에 기록합니다.
- 단일 부문 회사는 표가 없어 수집되지 않습니다(status 파일에 사유 기록).
Output: company_segments.csv, company_segments_status.json
"""
import csv, json, re, sys, concurrent.futures
from decimal import Decimal
from pathlib import Path
from lxml import html
import collect_company_history as h

ROOT = Path(__file__).resolve().parent
OUT, STATUS = ROOT / 'company_segments.csv', ROOT / 'company_segments_status.json'
REV = ['매출액', '매출', '영업수익', '외부고객으로부터의수익', '외부수익', '수익', '순매출액', '매출액(외부)', '외부매출', '총매출액', '총부문수익', '부문수익']
OP = ['영업이익', '영업이익(손실)', '영업손익', '부문영업이익', '부문영업손익', '부문이익', '부문손익', '부문이익(손실)', '계속영업이익(손실)', '영업손실', '보고부문영업이익(손실)', '부문영업이익(손실)']
UNIT = {'원': Decimal(1), '천원': Decimal(1000), '백만원': Decimal(10**6), '억원': Decimal(10**8)}
TOTAL = re.compile(r'^(부문합계|합계|계|총계|연결|연결합계|연결후금액|연결재무제표|부문의합계합계|합계금액)$')
ADJ = re.compile(r'조정|제거|내부거래|연결조정|중요한조정사항|상계')
FIELDS = ['company_id', 'period', 'segment', 'role', 'cum_revenue', 'cum_op', 'q_revenue', 'q_op', 'unit', 'source', 'check']


def norm(s): return re.sub(r'\s|　', '', s or '')


def num(s):
    s = norm(s).replace('−', '-').replace('△', '-')
    if s in ('', '-', '–'): return Decimal(0)
    if re.fullmatch(r'\(-?[\d,.]+\)', s): s = '-' + s[1:-1].lstrip('-')
    s = s.replace(',', '')
    if not re.fullmatch(r'-?\d+(\.\d+)?', s): return None
    return Decimal(s)


def doc_url(r):
    acpt = r['acpt']; v = h.get('https://kind.krx.co.kr/common/disclsviewer.do?method=searchInitInfo&acptNo=' + acpt + '&docNo=')
    d = html.fromstring(v); op = d.xpath('//select[@id="mainDoc"]/option[@selected]') or d.xpath('//select[@id="mainDoc"]/option[contains(@value,"|")]')
    docno = op[0].get('value').split('|')[0]
    form = '11011' if r['period'].endswith('Q4') else '11012' if r['period'].endswith('Q2') else '11013'
    return f'https://kind.krx.co.kr/external/{acpt[:4]}/{acpt[4:6]}/{acpt[6:8]}/{acpt[8:]}/{docno}/{form}.htm'


def grid(t):
    """colspan/rowspan을 펼친 표 격자(문자열)."""
    out, span = [], {}
    for ri, tr in enumerate(t.xpath('.//tr')):
        row, ci = [], 0
        for cell in tr.xpath('./td|./th'):
            while (ri, ci) in span: row.append(span.pop((ri, ci))); ci += 1
            txt = h.text(cell); cs = int(cell.get('colspan') or 1); rs = int(cell.get('rowspan') or 1)
            for k in range(cs):
                row.append(txt)
                for d in range(1, rs): span[(ri + d, ci)] = txt
                ci += 1
        while (ri, ci) in span: row.append(span.pop((ri, ci))); ci += 1
        out.append(row)
    return out


SKIPH = {'', '부문', '보고부문', '영업부문', '부문의합계', '구분', '구 분', '과목', '사업부문'}


def parse_table(rows, before):
    """rows: 펼친 격자. Return list of (name, revenue_cum, op_cum) or None."""
    lab = [norm(r[0]) if r else '' for r in rows]
    ri = next((i for k in REV for i, l in enumerate(lab) if l == k), None)
    oi = next((i for k in OP for i, l in enumerate(lab) if l == k), None)
    if ri is None or oi is None: return None
    first = min(ri, oi)
    rv, ov = rows[ri][1:], rows[oi][1:]
    if len(rv) != len(ov) or len(rv) < 2: return None
    n = len(rv); heads = rows[:first]
    if not heads: return None
    cols = []
    cum_idx = None
    for j in range(1, n + 1):
        cells = [norm(hr[j]) for hr in heads if len(hr) > j]
        if cells and cells[-1] in ('3개월', '누적'):
            cum_idx = cum_idx or []
            if cells[-1] == '누적': cum_idx.append(j - 1)
            cells = cells[:-1]
        name = next((c for c in reversed(cells) if c not in SKIPH), None)
        if not name: return None
        cols.append(name)
    if any(len(x) > 25 or re.fullmatch(r'(당|전)?(기|반기|분기)(말)?|20\d\d.*|제\d+기.*|금액|비중|비율.*|\d+.*', x) for x in cols): return None
    idx = cum_idx if cum_idx else list(range(n))
    return [(cols[i], rv[i], ov[i]) for i in idx]


def unit_of(before):
    m = re.findall(r'단위\s*[:：]\s*(백만원|천원|억원|원)', before)
    return m[-1] if m else None


DEBUG = '--debug' in sys.argv


def scan(r):
    try:
        u = doc_url(r); d = html.fromstring(h.get(u)); cand = []
        for t in d.xpath('//table'):
            tx = norm(h.text(t))
            if len(tx) > 20000 or not re.search(r'영업이익|영업손익|부문이익|부문손익|계속영업이익', tx): continue
            before = ' '.join(h.text(e) for e in t.xpath('preceding-sibling::*[position()<=3]'))[-500:]
            if not re.search(r'부문', before + tx[:400]): continue
            unit = unit_of(before)
            if DEBUG: cand.append(dict(before=before[-300:], unit=unit, grid=[[c[:40] for c in row[:16]] for row in grid(t)[:14]]))
            if not unit: continue
            p = parse_table(grid(t), before)
            if not p: continue
            out = []
            for name, rv, ov in p:
                a, b = num(rv), num(ov)
                if a is None or b is None: break
                role = 'total' if TOTAL.match(name) else 'adj' if ADJ.search(name) else 'segment'
                out.append(dict(segment=name, role=role, rev=a * UNIT[unit], op=b * UNIT[unit]))
            else:
                segs = [x for x in out if x['role'] == 'segment']
                if len(segs) >= 2 or (len(segs) == 1 and any(x['role'] != 'segment' for x in out)):
                    if DEBUG: continue
                    return dict(company_id=r['company_id'], period=r['period'], url=u, rows=out, unit=unit)
        return dict(company_id=r['company_id'], period=r['period'], url=u, rows=[], cand=cand, reason='부문 표 없음(단일 부문 또는 형식 불일치)')
    except Exception as e:
        return dict(company_id=r['company_id'], period=r['period'], error=str(e)[:160])


def main():
    ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    watch = json.loads((ROOT / 'company_watchlist.json').read_text())['companies']
    comps = [c for c in watch if (c['id'] in ids if ids else c['id'].isdigit())]
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        cats = list(pool.map(h.catalog, comps))
    todo = [r for c in cats for r in c.get('reports', [])]
    if DEBUG:
        todo = [r for c in cats for r in sorted(c.get('reports', []), key=lambda r: r['period'])[-1:] + sorted(c.get('reports', []), key=lambda r: r['period'])[-3:-2]]
        with concurrent.futures.ThreadPoolExecutor(3) as pool:
            res = list(pool.map(scan, todo))
        (ROOT / 'segment_debug.json').write_text(json.dumps(res, ensure_ascii=False))
        Path(OUT).write_text(''); STATUS.write_text('{}'); return
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        res = list(pool.map(scan, todo))
    fin = {}
    for x in csv.DictReader((ROOT / 'company_financials.csv').open(encoding='utf-8-sig')):
        try: fin[(x['company_id'], x['period'])] = Decimal(x['revenue_KRW'])
        except Exception: pass
    old = {}
    if OUT.exists():
        for x in csv.DictReader(OUT.open(encoding='utf-8')): old.setdefault(x['company_id'], []).append(x)
    rows, status = [], {}
    by = {}
    for r in res:
        if r.get('rows'): by[(r['company_id'], r['period'])] = r
    for c in comps:
        cid = c['id']; got = sorted(p for (i, p) in by if i == cid)
        st = dict(name=c['name'], periods=len(got), first=got[0] if got else None, last=got[-1] if got else None,
                  segments=sorted({x['segment'] for p in got for x in by[(cid, p)]['rows'] if x['role'] == 'segment'}))
        if not got:
            st['reason'] = next((r.get('reason') or r.get('error') for r in res if r['company_id'] == cid), '보고서 없음')
            # 이번에 못 읽으면 기존 값 유지
            rows += old.get(cid, []); status[cid] = st; continue
        for p in got:
            rep = by[(cid, p)]; y, q = p[:4], int(p[-1])
            prev = by.get((cid, f'{y}-Q{q-1}')) if q > 1 else None
            pv = {x['segment']: x for x in prev['rows']} if prev else {}
            tot_rev = sum(x['rev'] for x in rep['rows'] if x['role'] != 'total')
            ytd = [fin.get((cid, f'{y}-Q{k}')) for k in range(1, q + 1)]
            chk = ''
            if all(v is not None for v in ytd) and sum(ytd):
                diff = abs(tot_rev / sum(ytd) - 1)
                chk = 'ok' if diff <= Decimal('0.02') else f'diff {diff*100:.1f}%'
            for x in rep['rows']:
                qrev = x['rev'] if q == 1 else (x['rev'] - pv[x['segment']]['rev'] if x['segment'] in pv else '')
                qop = x['op'] if q == 1 else (x['op'] - pv[x['segment']]['op'] if x['segment'] in pv else '')
                rows.append(dict(company_id=cid, period=p, segment=x['segment'], role=x['role'], cum_revenue=x['rev'], cum_op=x['op'],
                                 q_revenue=qrev, q_op=qop, unit='KRW', source=rep['url'], check=chk))
        status[cid] = st
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(sorted(rows, key=lambda x: (x['company_id'], x['period'], x['role'] != 'segment', x['segment'])))
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=1))
    print('companies', len(comps), 'with segments', sum(1 for s in status.values() if s['periods']))


if __name__ == '__main__':
    main()
