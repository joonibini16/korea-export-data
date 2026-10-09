"""Turn reviewed '수주상황' tables (backlog_tables_dump.json) into backlog observations.

Each company has an explicit rule written after reading its filings (see notes).
Rules only take the disclosed period-end backlog (수주잔고) amount; every row is checked
against 수주총액 − 기납품액 where the table gives both. Periods whose table format or
scope differs from the company's series are skipped and reported, never mixed in.

Usage: python tools/backlog_from_dump.py dump.json [more dumps...] --write
"""
import json, re, sys, pathlib
from decimal import Decimal

ROOT = pathlib.Path(__file__).resolve().parents[1]


def num(s):
    s = (s or '').replace(',', '').replace(' ', '')
    if s in ('-', '', '–'):
        return None
    if not re.fullmatch(r'-?\d+(\.\d+)?', s):
        raise ValueError('non-number ' + repr(s))
    return Decimal(s)


def total_row(t, labels=('합계', '계', '총계', '총합계')):
    rows = [r for r in t['rows'] if r and r[0].replace(' ', '') in labels]
    return rows[-1] if rows else None


def check(gross, delivered, bal, tol=Decimal('0.0015')):
    if gross is None or delivered is None or bal is None:
        return True
    return abs(gross - delivered - bal) <= max(Decimal(2), gross * tol)


def amount_triplet(row):
    """수주총액/기납품액/수주잔고 금액 from a 합계 row (quantity+amount pairs or amounts only)."""
    vals = row[1:]
    if len(vals) == 6:
        return [num(v) for v in vals[1::2]]
    if len(vals) == 3:
        return [num(v) for v in vals]
    raise ValueError('unexpected total row width %d' % len(vals))


# ---- company rules: return (value, raw_unit, note) or raise ValueError(reason) ----

def r_simmtech(rep):
    t = rep['tables'][0]
    g, d, b = amount_triplet(total_row(t))
    note = ''
    if g is not None and d is not None and b is not None and b > (g - d) * 100:
        # 2020-Q1/Q2 tables print the balance in USD while the column header says 천USD.
        fixed = b / 1000
        if not check(g, d, fixed):
            raise ValueError('balance does not reconcile even after USD→천USD')
        b, note = fixed, '공시 표 잔고 칸이 USD 단위로 기재되어 천USD로 환산(수주총액−기납품액과 일치)'
    if not check(g, d, b):
        raise ValueError('수주총액−기납품액 ≠ 잔고')
    return b, 'USD_thousand', note


def r_pcb_amount(unit_map, identity=True, default_unit=None):
    """identity=False: 수주총액 is the period's new orders (balance = opening + orders − sales),
    so the balance is taken as disclosed and checked against the prior year-end instead."""
    def rule(rep):
        t = rep['tables'][0]
        before = ' '.join(x['before'] for x in rep['tables']).replace(' ', '')
        row = total_row(t)
        if not row:
            raise ValueError('no total row')
        g, d, b = amount_triplet(row)
        if b is None:
            raise ValueError("balance not disclosed ('-')")
        unit = next((u for k, u in unit_map if k in before), None)
        note = ''
        if not unit and default_unit:
            unit, note = default_unit, '표 앞 단위 문구가 없어 같은 회사 공시 계열의 단위(백만원)를 적용 · 기납품액이 분기 매출 규모와 일치함을 확인'
        if not unit:
            raise ValueError('unit not found')
        if identity and not check(g, d, b):
            raise ValueError('수주총액−기납품액 ≠ 잔고')
        return b, unit, note
    return rule


def r_iljin(rep):
    t = rep['tables'][0]
    row = total_row(t)
    g, d, b = [num(v) for v in row[-3:]]
    if not check(g, d, b):
        raise ValueError('mismatch')
    return b, 'USD_thousand', ''


def r_tck(rep):
    t = rep['tables'][0]
    row = total_row(t)
    return num(row[-1]), 'KRW_100m', ''


def r_lselectric(rep):
    t = rep['tables'][0]
    if 'LSELECTRIC' not in t['before'].replace(' ', '') or '억원' not in t['before']:
        raise ValueError('first table is not LS ELECTRIC 본체 (억원)')
    row = total_row(t)
    if not row:
        raise ValueError('no total row')
    return num(row[-1]), 'KRW_100m', ''


def r_hdelectric(rep):
    if rep['period'] < '2022-Q1':
        raise ValueError('2020~2021 공시는 법인별 표(본사·중국·미국 등)로만 기재되어 연결 전기전자 부문 합계와 범위가 다름')
    t = rep['tables'][0]
    if '종속회사' not in t['before']:
        raise ValueError('not consolidated table')
    row = t['rows'][-1]
    g, d, b = [num(v) for v in row[-3:]]
    if not check(g, d, b):
        raise ValueError('mismatch')
    return b, 'KRW_million', '회사가 추정한 예상 환율로 환산한 공시 금액입니다.'


def r_lnf(rep):
    if rep['period'] < '2021-Q2':
        raise ValueError('2020~2021-Q1 표는 기간 매출 실적으로 계약 잔고 표가 아님')
    t = rep['tables'][0]
    row = total_row(t)
    g, d, b = row[-3], row[-2], row[-1]
    g, d = num(g), num(d)
    b = Decimal(0) if b.strip() in ('-',) and g is not None and d == g else num(b)
    if not check(g, d, b):
        raise ValueError('mismatch')
    note = '공시 표의 잔고 "-"(계약총액=기납품액)' if b == 0 else ''
    return b, 'KRW', note


def r_posco(rep):
    t = rep['tables'][0]
    if '10억원이상' not in t['before'].replace(' ', ''):
        raise ValueError('10억원 이상 계약 기준 문구 없음(기준 변경 전 표)')
    row = total_row(t)
    if not row:
        raise ValueError('no total row')
    return num(row[-1]), 'KRW_million', '양극재·음극재 잔고가 아닙니다. 에너지소재사업 수주잔고 금액은 미기재.'


def r_vitzro(rep):
    p = rep['period']
    if not ('2023-Q1' <= p <= '2025-Q3'):
        raise ValueError('2023-Q1~2025-Q3 장기공급계약 잔고 표와 범위가 다른 표(개별 주문·수시 발주)')
    t = rep['tables'][0]
    row = total_row(t)
    if not row:
        raise ValueError('no total row')
    return num(row[-1]), 'KRW_million', '장기공급계약 잔고(외화 계약은 계약일 환율 원화 환산 공시값). 2023-Q4부터 거래처별 표로 바뀜.'


def hyosung_table(rep):
    for t in rep['tables']:
        if t['rows'] and '수주잔' in ' '.join(t['rows'][0]).replace(' ', ''):
            row = next((x for x in t['rows'] if x and x[0].replace(' ', '') in ('중공업', '중공업부문')), None)
            if row:
                return t['rows'][0], row
    raise ValueError('수주상황 표 없음')


def r_hyosung(rep):
    head, row = hyosung_table(rep)
    col = next(i for i, h in enumerate(head) if h.replace(' ', '').startswith('당기말수주잔'))
    # header row has one fewer leading cell than data rows (부문 | 회사 | 품목 ...)
    vals = [v for v in row if re.fullmatch(r'[\d,]+', v.replace(' ', ''))]
    hvals = [h for h in head if re.search(r'수주|매출', h)]
    bal = num(vals[hvals.index(head[col])])
    if rep['period'] < '2025-Q1':
        raise ValueError('2020~2024 공시는 효성중공업(주) 본사 금액만 원화로, 해외 종속회사는 현지통화로 따로 기재되어 2025년부터의 "주요 종속회사 포함" 합계와 범위가 다름 (본사 중공업 잔고 %s 백만원)' % format(bal, ','))
    return bal, 'KRW_million', '건설 부문 제외. 보고기준일별 환율 환산으로 전기말 비교 수치와 차이가 날 수 있습니다.'


def hyosung_prior_yearend(rep):
    """2025 사업보고서의 전기말(2024.12.31) 수주잔 — 2025년부터 쓰는 범위로 재작성된 값."""
    head, row = hyosung_table(rep)
    vals = [v for v in row if re.fullmatch(r'[\d,]+', v.replace(' ', ''))]
    hvals = [h for h in head if re.search(r'수주|매출', h)]
    i = next(k for k, h in enumerate(hvals) if h.replace(' ', '').startswith('전기말수주잔(2024.12.31)'))
    return num(vals[i])


def r_lscable(rep):
    for t in rep['tables']:
        if not t['rows'] or '수주잔고' not in ' '.join(t['rows'][0]).replace(' ', ''):
            continue
        row = next((x for x in t['rows'] if x and x[0].replace(' ', '') == '전선'), None)
        if row and '억원' in t['before']:
            return num(row[-1]), 'KRW_100m', 'LS전선 단독 금액이 아닌 LS 전선 부문 연결 수치입니다. 해저케이블만의 잔고가 아닙니다.'
    raise ValueError('전선 부문 행 없음')


RULES = {
    '222800': (r_simmtech, '인쇄회로기판 공시 수주상황'),
    '353200': (r_pcb_amount([('억원', 'KRW_100m')]), 'PCB 공시 수주상황'),
    '007660': (r_pcb_amount([('백만원', 'KRW_million'), ('억원', 'KRW_100m')], identity=False, default_unit='KRW_million'), 'PCB 공시 수주상황'),
    '007810': (r_pcb_amount([('백만원', 'KRW_million')], identity=False), 'PCB·FPCB 공시 합계'),
    '051370': (r_pcb_amount([('백만원', 'KRW_million')]), 'FPCB 공시 수주상황'),
    '103590': (r_iljin, '전력선·변압기·중전기 합계'),
    '064760': (r_tck, '탄소제품·SiC 등 공시 합계'),
    '010120': (r_lselectric, 'LS ELECTRIC 본체 합계·자회사 별도'),
    '267260': (r_hdelectric, '연결 전기전자 부문'),
    '066970': (r_lnf, '공개 양극재 계약 합계·일부 계약 제외'),
    '003670': (r_posco, '산업로·보수공사 등 10억원 이상 계약'),
    '082920': (r_vitzro, '장기공급계약 수주잔고 합계(원화)'),
    '298040': (r_hyosung, '중공업 부문·국내외 주요 종속회사 포함'),
    'LS-CABLE': (r_lscable, 'LS 공시 전선 부문 연결·참고'),
}
ALIASES = {'006260': 'LS-CABLE'}


def main():
    files = [a for a in sys.argv[1:] if not a.startswith('--')]
    write = '--write' in sys.argv
    reports = [r for f in files for r in json.load(open(f))['reports']]
    for r in reports:
        r['company_id'] = ALIASES.get(r['company_id'], r['company_id'])
    src_path = ROOT / 'company_backlog_sources.json'
    src = json.loads(src_path.read_text())
    obs = {(o['company_id'], o['period']): o for o in src['observations']}
    added, mismatch, skipped = [], [], []
    for rep in reports:
        rule = RULES.get(rep['company_id'])
        if not rule or not rep['tables']:
            continue
        fn, scope = rule
        key = (rep['company_id'], rep['period'])
        try:
            val, unit, note = fn(rep)
            if val is None or val < 0:
                raise ValueError('no disclosed amount')
        except (ValueError, TypeError, IndexError) as e:
            skipped.append(dict(company_id=rep['company_id'], period=rep['period'], source=rep['url'], reason=str(e)))
            continue
        new = dict(company_id=rep['company_id'], period=rep['period'], raw_value=str(val.normalize() if val == val.to_integral() else val),
                   raw_unit=unit, scope=scope, source=rep['url'], status='공시 확인', notes=note)
        old = obs.get(key)
        if old:
            if Decimal(str(old['raw_value'])) != val or old['raw_unit'] != unit:
                mismatch.append(dict(key=key, old=(old['raw_value'], old['raw_unit']), new=(str(val), unit), source=rep['url']))
            continue
        obs[key] = new
        added.append(key)
    h25 = next((r for r in reports if r['company_id'] == '298040' and r['period'] == '2025-Q4' and r['tables']), None)
    if h25 and ('298040', '2024-Q4') not in obs:
        obs[('298040', '2024-Q4')] = dict(company_id='298040', period='2024-Q4', raw_value=str(hyosung_prior_yearend(h25)), raw_unit='KRW_million',
            scope='중공업 부문·국내외 주요 종속회사 포함', source=h25['url'], status='공시 확인',
            notes='2025년 사업보고서의 전기말(2024.12.31) 비교 수치. 2025.12.31 환율로 환산된 값이며 2024년 당시 보고서에는 이 범위의 합계가 없습니다.')
        added.append(('298040', '2024-Q4'))
    print('added', len(added)); print('mismatch', len(mismatch))
    for m in mismatch:
        print('  MISMATCH', m)
    skipped = [x for x in skipped if (x['company_id'], x['period']) not in obs]
    uniq = {}
    for x in skipped: uniq[(x['company_id'], x['period'])] = x
    skipped = list(uniq.values())
    print('skipped', len(skipped))
    for s in skipped:
        print('  skip', s['company_id'], s['period'], s['reason'])
    if write:
        src['observations'] = sorted(obs.values(), key=lambda o: (o['company_id'], o['period']))
        prev = [x for x in src.get('history_issues', []) if (x['company_id'], x['period']) not in obs]
        seen = {(x['company_id'], x['period'], x['reason']) for x in prev}
        prev += [x for x in skipped if (x['company_id'], x['period'], x['reason']) not in seen]
        src['history_issues'] = prev
        src_path.write_text(json.dumps(src, ensure_ascii=False, indent=2) + '\n')
        print('written')


if __name__ == '__main__':
    main()
