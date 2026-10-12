"""LS전선(비상장) 분기 매출 = LS(006260) 정기보고서 '매출실적' 표의 전선 부문 합계(누적)를 분기로 차감.

Usage: python tools/ls_cable_revenue.py dump.json [--write]
dump.json: tools/dump_backlog_tables.py 006260:LS --broad --kw=전선 결과.
전선 부문 연결조정 전 매출이며 LS전선(주) 단독 매출이 아닙니다(수주잔고와 같은 범위).
"""
import csv, json, re, sys, pathlib
from decimal import Decimal
ROOT = pathlib.Path(__file__).resolve().parents[1]

def num(s):
    s = s.replace(',', '').strip()
    return Decimal(s) if re.fullmatch(r'-?\d+(\.\d+)?', s) else None

def cum_value(rep):
    for t in rep['tables']:
        rows = t['rows']
        if not rows or not ('사업부문' in ''.join(rows[0]) and '매출유형' in ''.join(rows[0]).replace(' ', '')):
            continue
        unit = Decimal(10**6) if '백만원' in t['before'] else Decimal(10**8) if '억원' in t['before'] else None
        if unit is None:
            continue
        start = next((i for i, r in enumerate(rows) if r and r[0].replace(' ', '') == '전선'), None)
        if start is None:
            continue
        tot = next((r for r in rows[start + 1:] if r and r[0].replace(' ', '') in ('합계', '소계', '계')), None)
        if tot and num(tot[1]) is not None:
            return num(tot[1]) * unit, rep['url']
    return None

def main():
    d = json.load(open(sys.argv[1]))
    cum = {}
    for rep in d['reports']:
        v = cum_value(rep)
        if v:
            cum[rep['period']] = v
    out = []
    for p, (v, url) in sorted(cum.items()):
        y, q = p[:4], int(p[-1])
        if q == 1:
            val, how = v, '1분기 누적'
        else:
            prev = cum.get(f'{y}-Q{q-1}')
            if not prev:
                print('skip', p, '직전 누적 없음'); continue
            val, how = v - prev[0], f'{q}분기 누적−{q-1}분기 누적'
        out.append(dict(company_id='LS-CABLE', period=p, basis='연결', revenue_KRW=int(val), method='LS 전선 부문 매출(연결조정 전) · ' + how, source=url, operating_profit_KRW=''))
        print(p, round(val / 10**8))
    if '--write' in sys.argv:
        path = ROOT / 'company_revenue_kind.csv'
        rows = [r for r in csv.DictReader(path.open(encoding='utf-8')) if r['company_id'] != 'LS-CABLE']
        fields = ['company_id', 'period', 'basis', 'revenue_KRW', 'method', 'source', 'operating_profit_KRW']
        with path.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore', restval=''); w.writeheader()
            w.writerows(sorted(rows + out, key=lambda r: (r['company_id'], r['basis'], r['period'])))
        print('written', len(out))

if __name__ == '__main__':
    main()
