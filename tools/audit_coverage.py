"""Coverage audit: quarterly revenue, inventory, regional exports, national summaries (2020-Q1 ~ latest)."""
import csv, json, collections, os, sys
from pathlib import Path
R = Path(__file__).resolve().parents[1]
def rows(f, enc='utf-8-sig'):
    p = R / f
    return list(csv.DictReader(p.open(encoding=enc))) if p.exists() else []
W = json.loads((R / 'company_watchlist.json').read_text())['companies']
END_Q = sys.argv[1] if len(sys.argv) > 1 else '2026-Q2'
END_M = sys.argv[2] if len(sys.argv) > 2 else '2026.08'
Q = [f'{y}-Q{q}' for y in range(2020, 2027) for q in range(1, 5) if f'{y}-Q{q}' <= END_Q]
M = [f'{y}.{m:02d}' for y in range(2020, 2027) for m in range(1, 13) if f'{y}.{m:02d}' <= END_M]
fin = collections.defaultdict(set); dom = collections.defaultdict(set); kind = collections.defaultdict(set); nav = collections.defaultdict(set); inv = collections.defaultdict(set)
for r in rows('company_financials.csv'): fin[r['company_id']].add(r['period'])
for r in rows('company_domestic_financials.csv'): dom[r['company_id']].add(r['period'])
for r in rows('company_revenue_kind.csv'): kind[(r['company_id'], r['basis'])].add(r['period'])
for r in rows('naver_consensus.csv'):
    if r['is_estimate'] == '0' and r['revenue_100m']: nav[r['company_id']].add(r['period'])
for r in rows('company_inventory.csv'):
    if int(r['inventory_KRW'] or 0) > 0: inv[(r['company_id'], r['basis'])].add(r['period'])
reg = collections.defaultdict(set)
for r in rows('regional_exports.csv'): reg[(r['hs_code'], r['sido_code'], r['region'])].add(r['month'])
# 공시 자체가 없는 구간(상장·분할 이전, 재고자산 계정 없음)은 누락이 아니라 구조적 공백으로 분리한다.
STRUCTURAL = {
    ('353200', 'rev'): ('2020-Q1', '2020-05 인적분할 신설 전'), ('353200', 'inv'): ('2020-Q1', '2020-05 인적분할 신설 전'),
    ('373220', 'rev'): ('2020-Q4', '2020-12 물적분할 신설 · 2020년 분기보고서 없음'), ('373220', 'inv'): ('2020-Q4', '2020-12 물적분할 신설'),
    ('330860', 'inv'): ('2020-Q3', '2020-10 상장 전 분기보고서 없음'), ('330860', 'rev'): ('2020-Q3', '2020-10 상장 전'),
    ('172670', 'inv'): ('2023-Q1', '2023-07 상장 전 분기보고서 없음'), ('172670', 'rev'): ('2021-Q4', '2023-07 상장 전 · 2022년부터 증권신고서 기준 매출만 확인'),
    ('131970', 'inv'): ('2023-Q4', '2020~2023 재무상태표에 재고자산 계정 없음(테스트 전문)'),
    ('200470', 'inv'): ('2022-Q3', '2020~2022-Q3 재고자산 0(\'-\') 공시'),
    ('252990', 'inv'): ('2021-Q1', '2021-05 상장 전 분기보고서 없음'),
    ('446540', 'inv'): ('2023-Q3', '2023-11 상장 전 분기보고서 없음'), ('446540', 'rev'): ('2023-Q4', '2023-11 상장 전 · 2023-Q4는 첫 사업보고서(연간)만 있어 분기 단독 매출 미산출'),
    ('420770', 'inv'): ('2024-Q3', '2024-11 상장 전 분기보고서 없음'), ('420770', 'rev'): ('2021-Q4', '2024-11 상장 전 · 2022년부터 증권신고서·재무 자료 기준 매출만 확인'),
}
def structural(cid, kind, q):
    v = STRUCTURAL.get((cid, kind))
    return bool(v) and q <= v[0]
out = []
for c in W:
    cid = c['id']
    ib = '연결' if len(inv[(cid, '연결')]) >= 8 else '별도'
    if ib == '연결' or not inv[(cid, '별도')]:
        rev = fin[cid] | nav[cid] | kind[(cid, '연결')]
        first = min(rev) if rev else '9999'
        rev |= {p for p in kind[(cid, '별도')] if p < first}
        if len(rev) < 8: rev |= dom[cid] | kind[(cid, '별도')]
    else:
        rev = dom[cid] | kind[(cid, '별도')]
    ob = '별도' if ib == '연결' else '연결'
    invq = inv[(cid, ib)] | {p for p in inv[(cid, ob)] if p < min(inv[(cid, ib)] or ['9999'])}
    listed = min([p for p in (rev | invq)] or ['9999'])
    exp = [q for q in Q if q >= listed]
    regmiss = {}
    for h in c['hs_codes']:
        q = (c.get('regional_hs') or {}).get(h, h if len(h) == 6 else None)
        if not q: continue
        for s in (c.get('sites') or [c]):
            if s.get('hs_codes') and h not in s['hs_codes']: continue
            keys = [k for k in reg if k[0] == q and k[1] == s['sido_code'] and s['region_keyword'] in k[2]]
            have = set().union(*[reg[k] for k in keys]) if keys else set()
            miss = [m for m in M if m not in have]
            if miss: regmiss[f"{q}/{s['region_keyword']}"] = miss
    exp = [q for q in Q]
    rev_struct = [q for q in exp if q not in rev and structural(cid, 'rev', q)]
    inv_struct = [q for q in exp if q not in invq and structural(cid, 'inv', q)]
    out.append(dict(id=cid, name=c['name'], rev_missing=[q for q in exp if q not in rev and not structural(cid, 'rev', q)],
                    inv_missing=[q for q in exp if q not in invq and not structural(cid, 'inv', q)] if cid != 'LS-CABLE' else [],
                    structural=dict(rev=rev_struct, inv=inv_struct, note=[v[1] for (k, t), v in STRUCTURAL.items() if k == cid]),
                    first=listed, regional_missing={k: (len(v), v[:6]) for k, v in regmiss.items()}))
nat_missing = {}
for r in rows('hs_codes.csv'):
    f = R / f"summary_{r['hs_code']}.csv"
    if not f.exists(): nat_missing[r['hs_code']] = 'no file'; continue
    have = {x['월'] for x in rows(f.name)}
    miss = [m for m in M if m not in have]
    if miss: nat_missing[r['hs_code']] = (len(miss), miss[:6])
summary = dict(companies=len(out), rev_gap_companies=sum(bool(o['rev_missing']) for o in out), rev_gap_quarters=sum(len(o['rev_missing']) for o in out),
               inv_gap_companies=sum(bool(o['inv_missing']) for o in out), inv_gap_quarters=sum(len(o['inv_missing']) for o in out),
               regional_gap_series=sum(len(o['regional_missing']) for o in out), regional_gap_months=sum(v[0] for o in out for v in o['regional_missing'].values()),
               national_gaps=nat_missing)
json.dump(dict(summary=summary, companies=out), open(R / 'coverage_audit.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(summary, ensure_ascii=False))
for o in out:
    if o['rev_missing'] or o['inv_missing'] or o['regional_missing']:
        print(o['name'], '| rev', o['rev_missing'][:8], len(o['rev_missing']), '| inv', o['inv_missing'][:6], len(o['inv_missing']), '| reg', {k: v[0] for k, v in o['regional_missing'].items()})
