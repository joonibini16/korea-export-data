"""제품별 매출·주요 제품 가격(단가) 수집: KIND 정기보고서 'II. 사업의 내용'의
  (1) '주요 제품 등의 현황/매출 현황' 표 → 품목별 누적 매출액(분기 값은 직전 분기 누적과의 차이)
  (2) '주요 제품 등의 가격변동추이' 표 → 품목별 단가(해당 기간 평균, 보고서 기재 단위 그대로)
원재료 표는 제외. 합계 행과 품목 합의 차이로 검증(check).
Output: company_products.csv, company_prices.csv, company_products_status.json
"""
import csv, json, re, sys, concurrent.futures
from decimal import Decimal
from pathlib import Path
from lxml import html
import collect_company_history as h
import collect_segments as s

ROOT = Path(__file__).resolve().parent
OUT_P, OUT_PR, STATUS = ROOT / 'company_products.csv', ROOT / 'company_prices.csv', ROOT / 'company_products_status.json'
FP = ['company_id', 'period', 'product', 'cum_revenue_KRW', 'q_revenue_KRW', 'share_pct', 'source', 'check']
FPR = ['company_id', 'period', 'product', 'price', 'unit', 'source']
UNIT = {'원': 1, '천원': 10**3, '백만원': 10**6, '억원': 10**8, '십억원': 10**9}
TOTAL = re.compile(r'^(합계|총합계|총계|계|소계|합|매출합계|총매출|내부거래제거|내부거래|연결조정|조정|기타조정|부문간내부거래제거등)$')
NAMECOL = [r'품목', r'주요제품', r'제품명', r'제품', r'부문', r'사업부문', r'구분']
norm = s.norm


def unit_of(txt):
    m = re.search(r'단위\s*[:：]?\s*(십억원|백만원|천원|억원|원)', txt or '')
    return UNIT[m[1]] if m else None


def num(x):
    x = norm(x).replace('△', '-').replace('−', '-')
    m = re.match(r'^\(?(-?[\d,]+(?:\.\d+)?)\)?', x)
    if not m: return None
    v = m[1].replace(',', '')
    try: return Decimal(v) * (-1 if x.startswith('(') and not x.startswith('(-') and not v.startswith('-') and x.endswith(')') and '%' not in x else 1)
    except Exception: return None


def header_rows(g):
    """머리글 행 수(숫자가 처음 나오는 행 전까지, 최대 3)."""
    for i, r in enumerate(g[:4]):
        if any(re.fullmatch(r'\(?-?[\d,]{3,}(\.\d+)?\)?(\(.*\))?', norm(c)) for c in r): return max(1, i)
    return 1


def parse_products(g, unit):
    if len(g) < 2: return None
    hn = header_rows(g); heads = [' '.join(norm(g[r][c]) for r in range(hn)) if c < len(g[0]) else '' for c in range(len(g[0]))]
    amt = next((c for c, t in enumerate(heads) if '매출' in t and '비' not in t.replace('매출액(비율)', '매출액')), None)
    if amt is None: amt = next((c for c, t in enumerate(heads) if '매출' in t), None)
    if amt is None: return None
    namec = None
    for pat in NAMECOL:
        namec = next((c for c, t in enumerate(heads) if re.search(pat, t) and c < amt), None)
        if namec is not None: break
    if namec is None: namec = 0
    rows, total = {}, None
    for r in g[hn:]:
        if amt >= len(r): continue
        nm = norm(r[namec]); v = num(r[amt])
        raw = norm(r[amt])
        if v is None or (raw.endswith('%') and '(' not in raw): continue
        if TOTAL.match(nm) or nm in ('',):
            if TOTAL.match(nm) and nm in ('합계', '총합계', '총계', '계', '매출합계'): total = v * unit
            continue
        if any(TOTAL.match(norm(c)) for c in r[:amt]) and nm != norm(r[0]): continue
        rows[nm] = rows.get(nm, 0) + v * unit
    if not rows or len(rows) > 25: return None
    ssum = sum(rows.values())
    chk = 'ok' if total and abs(ssum - total) <= abs(total) * Decimal('0.03') else ('no_total' if not total else 'mismatch')
    return rows, total, chk


def parse_prices(g, unit_txt):
    if len(g) < 2: return None
    hn = header_rows(g); heads = [' '.join(norm(g[r][c]) for r in range(hn)) for c in range(len(g[0]))]
    first = next((c for c, t in enumerate(heads) if re.search(r'기|년|분기|반기|당기|\d{4}', t) and not re.search(r'품목|구분|부문|비고|단위', t)), None)
    if first is None: return None
    namec = next((c for c, t in enumerate(heads) if re.search(r'품목|품 목|제품|구분', t) and c < first), 0)
    out = {}
    for r in g[hn:]:
        if first >= len(r): continue
        nm = norm(r[namec]); raw = norm(r[first])
        v = num(raw)
        if not nm or v is None or TOTAL.match(nm): continue
        u = re.sub(r'[\d,.\-()△]', '', raw) or unit_txt
        out[nm] = (v, u)
    return out or None


def scan(r):
    try:
        u = s.doc_url(r); d = html.fromstring(h.get(u))
    except Exception as e:
        return dict(company_id=r['company_id'], period=r['period'], error=str(e)[:200])
    prod = price = None
    for t in d.xpath('//table'):
        before = ' '.join(h.text(e) for e in t.xpath('preceding-sibling::*[position()<=3]'))[-260:]
        near = before[-160:]
        if '원재료' in near or '원 재 료' in near: continue
        g = s.grid(t)
        if prod is None and re.search(r'주요\s*제품|제품\s*등의\s*(현황|매출)|품목별\s*매출|매출\s*현황', near) and not re.search(r'가격\s*변동', near):
            unit = unit_of(before) or unit_of(' '.join(' '.join(x) for x in g[:2]))
            if unit:
                p = parse_products(g, unit)
                if p: prod = p
        if price is None and re.search(r'가격\s*변동', near):
            um = re.search(r'단위\s*[:：]?\s*([^)\]]{1,20})', before)
            p = parse_prices(g, um[1].strip() if um else '')
            if p: price = p
        if prod and price: break
    return dict(company_id=r['company_id'], period=r['period'], url=u, prod=prod, price=price)


def main():
    comps = json.loads((ROOT / 'company_watchlist.json').read_text())['companies']
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    comps = [c for c in comps if re.fullmatch(r'\d{6}', c['id']) and (not only or c['id'] in only)]
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        cats = list(pool.map(h.catalog, comps))
    todo = []
    for c, cat in zip(comps, cats):
        for r in cat.get('reports', []): todo.append(dict(r, company_id=c['id']))
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        res = list(pool.map(scan, todo))
    old_p = list(csv.DictReader(OUT_P.open(encoding='utf-8-sig'))) if OUT_P.exists() else []
    old_pr = list(csv.DictReader(OUT_PR.open(encoding='utf-8-sig'))) if OUT_PR.exists() else []
    P, PR, st = {}, {}, {}
    for x in old_p: P[(x['company_id'], x['period'], x['product'])] = x
    for x in old_pr: PR[(x['company_id'], x['period'], x['product'])] = x
    for x in res:
        cid = x['company_id']; e = st.setdefault(cid, {'reports': 0, 'products': 0, 'prices': 0, 'errors': 0})
        e['reports'] += 1
        if x.get('error'): e['errors'] += 1; continue
        if x.get('prod'):
            rows, total, chk = x['prod']; e['products'] += 1
            for nm, v in rows.items():
                P[(cid, x['period'], nm)] = dict(company_id=cid, period=x['period'], product=nm, cum_revenue_KRW=str(int(v)), q_revenue_KRW='',
                                               share_pct='', source=x['url'], check=chk)
        if x.get('price'):
            e['prices'] += 1
            for nm, (v, u) in x['price'].items():
                PR[(cid, x['period'], nm)] = dict(company_id=cid, period=x['period'], product=nm, price=str(v), unit=u, source=x['url'])
    # 분기 값: 같은 회계연도의 직전 분기 누적과의 차이(1분기는 그대로). 비중 = 분기 품목 매출 ÷ 분기 품목 합계
    by = {}
    for (cid, p, nm), x in P.items(): by.setdefault((cid, nm), {})[p] = x
    for (cid, nm), ps in by.items():
        for p, x in ps.items():
            q = int(p[-1]); cum = int(x['cum_revenue_KRW'])
            if q == 1: x['q_revenue_KRW'] = str(cum)
            else:
                prev = ps.get(p[:-1] + str(q - 1))
                x['q_revenue_KRW'] = str(cum - int(prev['cum_revenue_KRW'])) if prev else ''
    tot = {}
    for x in P.values():
        if x['q_revenue_KRW']: tot[(x['company_id'], x['period'])] = tot.get((x['company_id'], x['period']), 0) + int(x['q_revenue_KRW'])
    for x in P.values():
        t = tot.get((x['company_id'], x['period']))
        x['share_pct'] = f"{int(x['q_revenue_KRW']) / t * 100:.2f}" if x['q_revenue_KRW'] and t else ''
    with OUT_P.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FP); w.writeheader(); w.writerows(sorted(P.values(), key=lambda x: (x['company_id'], x['period'], x['product'])))
    with OUT_PR.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FPR); w.writeheader(); w.writerows(sorted(PR.values(), key=lambda x: (x['company_id'], x['period'], x['product'])))
    STATUS.write_text(json.dumps(st, ensure_ascii=False, indent=1))
    print(sum(v['products'] for v in st.values()), 'product tables;', sum(v['prices'] for v in st.values()), 'price tables')


if __name__ == '__main__':
    main()
