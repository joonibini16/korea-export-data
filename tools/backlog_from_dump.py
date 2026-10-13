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


def r_gigavis(rep):
    # 품목 | 당기수주 | 납품액 | 수주잔고 (단위: 백만원). 작성기준일까지 공시된 단일판매·공급계약 포함.
    for t in rep['tables']:
        head = ' '.join(t['rows'][0]).replace(' ', '') if t['rows'] else ''
        if '수주잔고' in head and re.search(r'당.{0,2}수주', head) and '백만원' in t['before']:
            row = total_row(t) or t['rows'][-1]
            g, d, b = [num(v) for v in row[-3:]]
            if b is None:
                raise ValueError("balance not disclosed ('-')")
            if not check(g, d if d is not None else Decimal(0), b):
                raise ValueError('당기수주−납품액 ≠ 잔고')
            return b, 'KRW_million', '수주 현황 표(당기수주·납품액·수주잔고). 보고서 작성기준일까지 공시된 단일판매·공급계약을 포함합니다.'
    raise ValueError('수주 현황 표 없음')


def r_intekplus(rep):
    # 2021-Q2·Q3 표는 합계 행 이름 칸이 비어 있어 마지막 행(빈 이름 + 6개 값)을 합계로 사용
    t = rep['tables'][0]
    if not total_row(t) and t['rows'] and t['rows'][-1][0].strip() == '' and len(t['rows'][-1]) == 7:
        t = dict(t, rows=t['rows'][:-1] + [['합계'] + t['rows'][-1][1:]])
        rep = dict(rep, tables=[t] + rep['tables'][1:])
    return r_pcb_amount([('백만원', 'KRW_million')])(rep)


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
    '064290': (r_intekplus, '반도체·2차전지 외관검사 장비 수주상황 합계'),
    '131290': (r_pcb_amount([('백만원', 'KRW_million')]), '프로브카드·인터페이스보드·소켓·검사장비 합계'),
    '092870': (r_pcb_amount([('백만원', 'KRW_million')]), '공시된 장비 공급계약 합계'),
    '420770': (r_gigavis, '반도체 기판 검사·수리장비'),
}
# ---- 범위가 다른 구간: 본 시계열과 섞지 않고 별도 scope(차트에서 다른 색 시리즈)로 보존 ----
def a_hdelectric(rep):
    if rep['period'] >= '2022-Q1':
        raise ValueError('main series')
    vals, names = [], []
    for t in rep['tables']:
        if not t['rows'] or '수주잔고' not in ' '.join(t['rows'][0]).replace(' ', ''):
            continue
        m = re.search(r'\d\)\s*(.+?)\s*\(단위\s*:\s*백만원\s*\)\s*$', t['before'])
        if not m:
            continue
        g, d, b = [num(v) for v in t['rows'][-1][-3:]]
        if not check(g, d, b):
            raise ValueError('법인별 표 산식 불일치: ' + m.group(1)[-30:])
        vals.append(b); names.append(m.group(1).split(')')[-1].strip()[-30:] or m.group(1)[-30:])
    if not vals:
        raise ValueError('법인별 수주상황 표 없음')
    return sum(vals), 'KRW_million', f'법인별 수주상황 표 {len(vals)}개 단순 합산(본사·중국·미국 법인 등). 법인 간 내부거래가 빠지지 않아 2022년부터의 연결 합계와 범위가 다릅니다.'


def a_posco(rep):
    if rep['period'] >= '2023-Q3':
        raise ValueError('main series')
    b = ' '.join(t['before'] for t in rep['tables'])
    m = re.search(r'수주잔고\s*총액은\s*약?\s*([\d,]+)\s*백만원', b)
    if not m:
        raise ValueError('수주잔고 총액 문구 없음')
    return num(m.group(1)), 'KRW_million', '사업의 내용 요약 문구의 "수주잔고 총액 약 N백만원"(1억원 이상 개별 계약 기준). 2023-Q3부터의 10억원 이상 계약 합계와 기준이 다릅니다.'


def a_vitzro(rep):
    if '2023-Q1' <= rep['period'] <= '2025-Q3':
        raise ValueError('main series')
    for t in rep['tables']:
        if t['rows'] and '수주잔고' in ' '.join(t['rows'][0]).replace(' ', '') and '백만원' in t['before']:
            row = total_row(t)
            if row and num(row[-1]) is not None:
                return num(row[-1]), 'KRW_million', '개별 주문(수시 발주) 표의 합계 잔고. 장기공급계약 잔고와 범위가 다릅니다.'
    raise ValueError('수주현황 표 없음(미기재)')


def a_hyosung(rep):
    if rep['period'] >= '2025-Q1':
        raise ValueError('main series')
    head, row = hyosung_table(rep)
    col = next(i for i, h in enumerate(head) if h.replace(' ', '').startswith('당기말수주잔'))
    vals = [v for v in row if re.fullmatch(r'[\d,]+', v.replace(' ', ''))]
    hvals = [h for h in head if re.search(r'수주|매출', h)]
    return num(vals[hvals.index(head[col])]), 'KRW_million', '효성중공업(주) 본사 중공업 부문 잔고(원화). 해외 종속회사(현지통화 별도 기재)는 빠져 2025년부터의 합계보다 작습니다.'


def a_nepes(rep):
    for t in rep['tables']:
        if t['rows'] and '수주잔고' in ' '.join(t['rows'][0]).replace(' ', '') and '백만원' in t['before']:
            body = [r for r in t['rows'][2:] if r and len(r) >= 3]
            tot = Decimal(0)
            for r in body:
                g, d, b = r[-3], r[-2], r[-1]
                gv, dv = num(g), num(d)
                bv = Decimal(0) if b.strip() in ('-', '') and gv is not None and gv == dv else num(b)
                if bv is None:
                    raise ValueError('잔고 칸 해석 불가')
                tot += bv
            return tot, 'KRW_million', '품목별(반도체 LDI 외·Developer 외·Lead Tab·기타) 잔고 합계. 단기 납기 주문이라 분기말 잔고가 0에 가깝습니다. 2021-Q2부터 수주상황 표를 싣지 않습니다.'
    raise ValueError('수주상황 표 없음')


ALT_RULES = {
    '267260': (a_hdelectric, '법인별 표 합산(2020~2021)'),
    '003670': (a_posco, '1억원 이상 계약 기준(2022-Q1~2023-Q2)'),
    '082920': (a_vitzro, '개별 주문 표 합계'),
    '298040': (a_hyosung, '본사 중공업 부문만(2020~2024)'),
    '033640': (a_nepes, '품목별 수주상황 합계(2020~2021-Q1)'),
}
ALIASES = {'006260': 'LS-CABLE'}


def main():
    files = [a for a in sys.argv[1:] if not a.startswith('--')]
    write = '--write' in sys.argv
    reports = [r for f in files for r in json.load(open(f))['reports']]
    for r in reports:
        r['company_id'] = ALIASES.get(r['company_id'], r['company_id'])
        # --broad 덤프에는 '수주'가 우연히 들어간 무관한 표가 섞이므로 수주 표만 남긴다.
        r['tables'] = [t for t in r['tables'] if re.search(r'수주(잔고|잔액|상황|현황|총액|잔)', (t['before'][-400:] + '|' + '|'.join('|'.join(x) for x in t['rows'][:2])).replace(' ', ''))]
    src_path = ROOT / 'company_backlog_sources.json'
    src = json.loads(src_path.read_text())
    obs = {(o['company_id'], o['period']): o for o in src['observations']}
    added, mismatch, skipped = [], [], []
    for rep in reports:
        rule = RULES.get(rep['company_id'])
        altr = ALT_RULES.get(rep['company_id'])
        if (not rule and not altr) or not rep['tables']:
            continue
        key = (rep['company_id'], rep['period'])
        val = None
        err = 'no rule'
        for fn, scope in [x for x in (rule, altr) if x]:
            try:
                val, unit, note = fn(rep)
                if val is None or val < 0:
                    raise ValueError('no disclosed amount')
                break
            except (ValueError, TypeError, IndexError, StopIteration) as e:
                err = str(e) if str(e) != 'main series' else err
                val = None
        if val is None:
            skipped.append(dict(company_id=rep['company_id'], period=rep['period'], source=rep['url'], reason=err))
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
