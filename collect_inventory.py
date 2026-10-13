"""Quarter-end inventory (재고자산) from KIND periodic reports, 2020-Q1 onward.

Reuses collect_company_history.catalog/process and its .history-cache. For each report the
statement of financial position (연결 재무상태표, else 재무상태표) is located by its title and
the first-period column of the '재고자산' row is taken as the quarter-end balance.
Checks: unit must be stated (원/천원/백만원); the Q4 balance must equal the prior-year-end
column of the next Q1 report (reported as an issue, value kept).
Output: company_inventory.csv, company_inventory_status.json
"""
import csv, json, re, sys, pathlib, concurrent.futures, datetime
from decimal import Decimal
from lxml import html

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import collect_company_history as h

OUT = ROOT / 'company_inventory.csv'
STATUS = ROOT / 'company_inventory_status.json'
# '유동재고자산' is the XBRL standard label used in KIND statements from 2023-Q3 onward.
LABEL = re.compile(r'^(?:\(\d+\)|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ\d]+[.)]?)?(?:유동)?재고자산(?:\(주[^)]*\)|\(주석[^)]*\)|\([\d,\s]+\))?$')
UNIT = {'원': 1, '천원': 1000, '백만원': 1000000, 'USD': 1, '천USD': 1000, '백만USD': 1000000}
CUR = {k: ('USD' if 'USD' in k else 'KRW') for k in UNIT}
UNIT_RE = re.compile(r'단위\s*[:：]\s*(백만\s*원|천\s*원|원|(?:백만|천)?\s*(?:US\s*\$|USD|U\.S\.\s*달러|미국\s*달러|달러))')


def unit_of(text):
    m = UNIT_RE.search(text)
    if not m:
        return None
    u = m.group(1).replace(' ', '')
    if '원' in u:
        return u
    scale = '백만' if u.startswith('백만') else '천' if u.startswith('천') else ''
    return scale + 'USD'


def numcell(s):
    s = s.replace(',', '').replace(' ', '').replace('−', '-')
    if re.fullmatch(r'\([\d.]+\)', s):
        s = '-' + s[1:-1]
    return Decimal(s) if re.fullmatch(r'-?\d+(\.\d+)?', s) else None


def balance_sheets(doc):
    ts = doc.xpath('//table')
    found = []
    for i, t in enumerate(ts):
        title = h.text(t).replace(' ', '')
        prev = t.xpath('preceding-sibling::*[1]')
        ptxt = h.text(prev[0]).replace(' ', '') if prev else ''
        # Title is either a short table of its own ("연결 재무상태표 제 N 기 ... 현재 (단위 : 원)")
        # or the paragraph right before the data table.
        src = title if len(title) < 600 and re.search(r'재무상태표', title) else ptxt if len(ptxt) < 120 and re.search(r'재무상태표', ptxt) else ''
        if not src or '요약' in src or '자본변동' in src:
            continue
        if not re.match(r'^(?:\d+(?:-\d+)*[.)]?|[가-하]\.)?(?:연결)?재무상태표', src):
            continue
        name = '연결' if '연결' in src.split('재무상태표')[0] else '별도'
        if name == '별도':
            # Some reports title both sheets just "재무상태표"; the section heading ("2. 연결재무제표" vs "4. 재무제표") decides.
            sec = [h.text(e).replace(' ', '') for e in t.xpath('preceding::p[contains(.,"재무제표")]')[-40:]]
            sec = [x for x in sec if re.fullmatch(r'\d+\.(연결)?재무제표', x)]
            if sec and sec[-1].endswith('연결재무제표'):
                name = '연결'
        ctx = ts[i:i + 4]
        joined = ' '.join(h.text(x) for x in ctx)
        u = unit_of(joined)
        rows = [r for tb in ctx for r in h.rows(tb)]
        header = ' '.join(' '.join(r) for r in rows[:6])
        if any(r and LABEL.fullmatch(r[0].replace(' ', '')) for r in rows) and not any(f['basis'] == name for f in found):
            found.append(dict(basis=name, unit=u, rows=rows, header=header))
    return found


def extract(sheet, period):
    if not sheet['unit']:
        raise ValueError('단위 미기재')
    y = period[:4]
    restated = '수정후' in sheet['header'].replace(' ', '')
    if y not in sheet['header'] and not restated:
        raise ValueError('보고 연도 헤더 없음')
    note = '주석' in sheet['header']
    for r in sheet['rows']:
        if r and LABEL.fullmatch(r[0].replace(' ', '')):
            cells = r[1:]
            if note and cells and (numcell(cells[0]) is None or len(cells) >= 3):
                cells = cells[1:]
            vals = [numcell(c) for c in cells if c.strip() not in ('',)]
            vals = [v for v in vals if v is not None]
            if restated and len(vals) >= 2:
                vals = vals[len(vals) // 2:]  # 정정 보고서의 '수정전 | 수정후' 표는 뒤쪽 절반이 수정후 값
            if len(vals) < 1:
                raise ValueError('재고자산 숫자 없음')
            cur = vals[0] * UNIT[sheet['unit']]
            prior = vals[1] * UNIT[sheet['unit']] if len(vals) > 1 else None
            if cur <= 0:
                raise ValueError('재고 0 또는 음수 · 표 구조 확인 필요')
            return int(cur), (int(prior) if prior is not None else None)
    raise ValueError('재고자산 행 없음')


REV_LABEL = re.compile(r'^(?:[ⅠⅡⅢⅣ\d]+[.)]?)?(?:매출액|매출액\(매출액\)|수익\(매출액\)|영업수익|매출|수익)(?:\((?:주|주석|Note)[^)]*\))?$')


def income_statements(doc):
    ts = doc.xpath('//table')
    found = []
    for i, t in enumerate(ts):
        title = h.text(t).replace(' ', '')
        prev = t.xpath('preceding-sibling::*[1]')
        ptxt = h.text(prev[0]).replace(' ', '') if prev else ''
        src = title if len(title) < 600 and re.search(r'손익계산서', title) else ptxt if len(ptxt) < 120 and re.search(r'손익계산서', ptxt) else ''
        if not src or '요약' in src:
            continue
        if not re.match(r'^(?:\d+(?:-\d+)*[.)]?|[가-하]\.)?(?:연결)?(?:포괄)?손익계산서', src):
            continue
        name = '연결' if '연결' in src.split('손익계산서')[0] else '별도'
        if name == '별도':
            sec = [h.text(e).replace(' ', '') for e in t.xpath('preceding::p[contains(.,"재무제표")]')[-40:]]
            sec = [x for x in sec if re.fullmatch(r'\d+\.(연결)?재무제표', x)]
            if sec and sec[-1].endswith('연결재무제표'):
                name = '연결'
        ctx = ts[i:i + 4]
        joined = ' '.join(h.text(x) for x in ctx)
        u = unit_of(joined)
        rows = [r for tb in ctx for r in h.rows(tb)]
        header = ' '.join(' '.join(r) for r in rows[:6])
        rev = next((r for r in rows if r and REV_LABEL.fullmatch(r[0].replace(' ', ''))), None)
        op = next((r for r in rows if r and OP_LABEL.fullmatch(r[0].replace(' ', ''))), None)
        # 당기순이익과 그 귀속(지배기업 소유주) — 포괄손익 귀속 행보다 앞의 첫 지배 행을 쓴다.
        ni_i = next((k for k, r in enumerate(rows) if r and NI_LABEL.fullmatch(r[0].replace(' ', ''))), None)
        ni = rows[ni_i] if ni_i is not None else None
        ctrl = None
        if ni_i is not None:
            # 순서: 당기순이익 → 기타포괄손익 → 총포괄이익 → 당기순이익의 귀속(지배/비지배) → 총포괄이익의 귀속.
            for r in rows[ni_i + 1:]:
                lab = r[0].replace(' ', '') if r else ''
                if ('포괄' in lab and '귀속' in lab) or '주당' in lab:
                    break
                if CTRL_LABEL.match(lab) and '포괄' not in lab:
                    ctrl = r; break
        if rev and u and not any(f['basis'] == name for f in found):
            found.append(dict(basis=name, unit=u, header=header, row=rev, op_row=op, ni_row=ni, ctrl_row=ctrl))
    return found


OP_LABEL = re.compile(r'^(?:[ⅠⅡⅢⅣⅤⅥⅦ\d]+[.)]?)?(?:영업이익\(손실\)|영업이익|영업손실|영업손익|영업이익\(손익\))(?:\((?:주|주석|Note)[^)]*\))?$')


def signed(c):
    c = c.strip()
    neg = c.startswith('(') and c.endswith(')') or c.startswith('-') or c.startswith('△') or c.startswith('▽')
    v = numcell(c.strip('()-△▽ '))
    return None if v is None else (-v if neg else v)


NI_LABEL = re.compile(r'^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ\d]+[.)]?)?(?:연결)?(?:당기|분기|반기|당분기|당반기)?순(?:이익|손익|손실)(?:\(손실\))?(?:\((?:주|주석|Note)[^)]*\))?$')
CTRL_LABEL = re.compile(r'^(?:\d+[.)]?)?(?:지배기업|지배회사|지배주주|모회사)(?:의)?(?:소유주|주주|지분|소유지분)?')


def op_values(st, key='op_row'):
    if not st.get(key):
        return []
    cells = st[key][1:]
    if '주석' in st['header'] and cells and (signed(cells[0]) is None or len(cells) >= 3):
        cells = cells[1:]
    vals = [signed(c) for c in cells if c.strip()]
    vals = [v * UNIT[st['unit']] for v in vals if v is not None]
    if '수정후' in st['header'].replace(' ', '') and len(vals) >= 2:
        vals = vals[len(vals) // 2:]
    return vals


def revenue_values(st):
    cells = st['row'][1:]
    if '주석' in st['header'] and cells and (numcell(cells[0]) is None or len(cells) >= 3):
        cells = cells[1:]
    vals = [numcell(c) for c in cells if c.strip()]
    vals = [v * UNIT[st['unit']] for v in vals if v is not None]
    if '수정후' in st['header'].replace(' ', '') and len(vals) >= 2:
        vals = vals[len(vals) // 2:]
    return vals


def main():
    watch = json.loads((ROOT / 'company_watchlist.json').read_text())['companies']
    companies = [c for c in watch if c['id'].isdigit() and (len(sys.argv) < 2 or c['id'] in sys.argv[1:])]
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        cats = list(pool.map(h.catalog, companies))
    todo = [r for c in cats for r in c['reports']]
    out, issues, failures = {}, [], [dict(company_id=c['company_id'], error=c['error']) for c in cats if c.get('error')]
    priors = {}
    revs = {}
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for r in pool.map(h.process, todo):
            if r.get('error'):
                failures.append(dict(company_id=r['company_id'], period=r['period'], error=r['error'])); continue
            try:
                doc = html.fromstring(h.get(r['url']))
                sheets = balance_sheets(doc)
            except Exception as e:
                failures.append(dict(company_id=r['company_id'], period=r['period'], error=str(e)[:200])); continue
            got = False
            for basis in ('연결', '별도'):
                sh = next((s for s in sheets if s['basis'] == basis), None)
                if not sh:
                    continue
                try:
                    cur, prior = extract(sh, r['period'])
                except ValueError as e:
                    issues.append(dict(company_id=r['company_id'], period=r['period'], basis=basis, source=r['url'], reason=str(e))); continue
                out[(r['company_id'], r['period'], basis)] = dict(company_id=r['company_id'], period=r['period'], basis=basis,
                    inventory_KRW=cur, source=r['url'], currency=CUR[sh['unit']], unit_raw=sh['unit'])
                if r['period'].endswith('Q1') and prior is not None:
                    priors[(r['company_id'], f"{int(r['period'][:4]) - 1}-Q4", basis)] = prior
                got = True
            try:
                for st in income_statements(doc):
                    v = revenue_values(st)
                    if not v:
                        continue
                    q = int(r['period'][-1])
                    key = (r['company_id'], r['period'], st['basis'])
                    if q == 1:
                        revs[key] = dict(value=int(v[0]), cum=int(v[0]), method='1분기 3개월')
                    elif q in (2, 3):
                        if '3개월' in st['header'] and '누적' in st['header'] and len(v) >= 2:
                            revs[key] = dict(value=int(v[0]), cum=int(v[1]), method=f'{q}분기 3개월')
                    else:
                        revs[key] = dict(value=None, annual=int(v[0]), method='연간−3분기 누적')
                    if key not in revs:
                        continue
                    for fld, rk in (('ni', 'ni_row'), ('nic', 'ctrl_row')):
                        nv = op_values(st, rk)
                        if nv:
                            if q == 1:
                                revs[key].update({fld: int(nv[0]), fld + '_cum': int(nv[0])})
                            elif q in (2, 3) and len(nv) >= 2:
                                revs[key].update({fld: int(nv[0]), fld + '_cum': int(nv[1])})
                            elif q == 4:
                                revs[key].update({fld + '_annual': int(nv[0])})
                    o = op_values(st)
                    if o:
                        if q == 1:
                            revs[key].update(op=int(o[0]), op_cum=int(o[0]))
                        elif q in (2, 3) and len(o) >= 2:
                            revs[key].update(op=int(o[0]), op_cum=int(o[1]))
                        elif q == 4:
                            revs[key].update(op_annual=int(o[0]))
                    revs[key].update(company_id=r['company_id'], period=r['period'], basis=st['basis'], source=r['url'], currency=CUR[st['unit']], unit_raw=st['unit'])
            except Exception as e:
                issues.append(dict(company_id=r['company_id'], period=r['period'], reason='매출 추출 오류: ' + str(e)[:100]))
            if f"{r['company_id']}:{r['period']}" in __import__('os').environ.get('INV_DEBUG', ''):
                dbg = [f"{e.tag}:{h.text(e)[:90]}" for e in doc.xpath('//*[self::p or self::td or self::span][contains(text(),"재무상태표") or contains(text(),"손익계산서") or contains(text(),"재무제표")]')[:30]]
                dbg += ['IS:' + st['basis'] + ' ' + st['unit'] + ' | ' + st['header'][:200] + ' | ' + ' / '.join(st['row'][:6]) for st in income_statements(doc)]
                dbg += ['BS:' + sh['basis'] + ' ' + str(sh['unit']) + ' | ' + sh['header'][:160] for sh in sheets]
                for tr in doc.xpath('//tr')[:6000]:
                    cc = tr.xpath('./td|./th')
                    if cc and re.match(r'^(?:[ⅠⅡ\d.()]*)?(유동)?(재고자산|매출액|수익\(매출액\)|영업수익)', h.text(cc[0]).replace(' ', '')):
                        dbg.append('ROW: ' + ' | '.join(h.text(x)[:25] for x in cc[:5]))
                        if sum(x.startswith('ROW') for x in dbg) >= 8: break
                for t in doc.xpath('//table'):
                    pv = t.xpath('preceding-sibling::*[1]')
                    tt = (h.text(t)[:80] if len(h.text(t)) < 600 else '') + ' || ' + (h.text(pv[0])[:80] if pv else '')
                    if '손익계산서' in tt:
                        rr = h.rows(t)[:3]
                        dbg.append('ISCAND: ' + tt + ' :: ' + ' / '.join('|'.join(x[:4]) for x in rr)[:300])
                        if sum(x.startswith('ISCAND') for x in dbg) >= 6: break
                dbg += [f"TITLE={r['title']}", f"URL={r['url']}", f"tables={len(doc.xpath('//table'))}"]
                issues.append(dict(company_id=r['company_id'], period=r['period'], reason='DEBUG', debug=dbg))
            if got and not any(sh['basis'] == '연결' for sh in sheets) and doc.xpath('//p[contains(normalize-space(.),"연결 재무상태표")]'):
                dbg = []
                for e in doc.xpath('//p[contains(normalize-space(.),"연결 재무상태표")]')[:2]:
                    nxt = e.xpath('following-sibling::*[position()<=3]')
                    dbg.append('TITLE: ' + h.text(e)[:60] + ' → ' + ' || '.join(f'{x.tag}:{h.text(x)[:160]}' for x in nxt))
                issues.append(dict(company_id=r['company_id'], period=r['period'], basis='연결', source=r['url'], reason='연결 재무상태표 해석 실패', debug=dbg))
            if not got and not any(i['company_id'] == r['company_id'] and i['period'] == r['period'] for i in issues):
                dbg = []
                for e in doc.xpath('//*[contains(text(),"재무상태표") or contains(text(),"재 무 상 태 표")]')[:8]:
                    dbg.append(f'{e.tag}: {h.text(e)[:100]}')
                for tr in doc.xpath('//tr')[:4000]:
                    c = tr.xpath('./td|./th')
                    if c and '재고' in h.text(c[0]).replace(' ', '')[:8]:
                        dbg.append('ROW: ' + ' | '.join(h.text(x)[:30] for x in c[:5])); 
                        if sum(x.startswith('ROW') for x in dbg) >= 4: break
                issues.append(dict(company_id=r['company_id'], period=r['period'], source=r['url'], reason='재무상태표 미확인', debug=dbg))
            print(r['company_id'], r['period'], 'ok' if got else 'missing', flush=True)
    for k, p in priors.items():
        v = out.get(k)
        if v and abs(v['inventory_KRW'] - p) > max(1_000_000, p * 0.001):
            issues.append(dict(company_id=k[0], period=k[1], basis=k[2], reason=f'다음 해 1분기 보고서의 전기말 값과 다름 ({v["inventory_KRW"]:,} vs {p:,}) · 재작성 가능성'))
    rev_rows = []
    for k, v in revs.items():
        if v.get('annual') is not None:
            q3 = revs.get((k[0], k[1][:4] + '-Q3', k[2]))
            parts = [revs.get((k[0], k[1][:4] + f'-Q{i}', k[2]), {}).get('value') for i in (1, 2, 3)]
            if q3 and q3.get('cum') and v['annual'] - q3['cum'] > 0:
                v['value'] = v['annual'] - q3['cum']
            elif all(parts) and v['annual'] - sum(parts) > 0:
                v['value'] = v['annual'] - sum(parts); v['method'] = '연간−(1~3분기 합)'
            else:
                continue
        for fld in ('ni', 'nic'):
            if v.get(fld + '_annual') is not None:
                q3 = revs.get((k[0], k[1][:4] + '-Q3', k[2])) or {}
                parts = [revs.get((k[0], k[1][:4] + f'-Q{i}', k[2]), {}).get(fld) for i in (1, 2, 3)]
                v[fld] = v[fld + '_annual'] - q3[fld + '_cum'] if q3.get(fld + '_cum') is not None else (v[fld + '_annual'] - sum(parts) if all(x is not None for x in parts) else None)
        if v.get('op_annual') is not None:
            q3 = revs.get((k[0], k[1][:4] + '-Q3', k[2])) or {}
            parts = [revs.get((k[0], k[1][:4] + f'-Q{i}', k[2]), {}).get('op') for i in (1, 2, 3)]
            v['op'] = v['op_annual'] - q3['op_cum'] if q3.get('op_cum') is not None else (v['op_annual'] - sum(parts) if all(x is not None for x in parts) else None)
        if v.get('value') and v['value'] > 0:
            rev_rows.append(dict(company_id=v['company_id'], period=v['period'], basis=v['basis'], revenue_KRW=v['value'], method=v['method'], source=v['source'], currency=v.get('currency', 'KRW'), unit_raw=v.get('unit_raw', ''),
                                 operating_profit_KRW='' if v.get('op') is None else v['op'],
                                 net_income_KRW='' if v.get('ni') is None else v['ni'],
                                 net_income_ctrl_KRW='' if v.get('nic') is None else v['nic']))
    run_ids = {c['id'] for c in companies}
    rev_path = ROOT / 'company_revenue_kind.csv'
    if rev_path.exists():
        with rev_path.open(encoding='utf-8', newline='') as f:
            rev_rows += [r for r in csv.DictReader(f) if r['company_id'] not in run_ids]
    if rev_rows:
        with rev_path.open('w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=['company_id', 'period', 'basis', 'revenue_KRW', 'method', 'source', 'operating_profit_KRW', 'currency', 'unit_raw', 'net_income_KRW', 'net_income_ctrl_KRW'], extrasaction='ignore', restval=''); w.writeheader()
            w.writerows(sorted(rev_rows, key=lambda r: (r['company_id'], r['basis'], r['period'])))
    run_ids = {c['id'] for c in companies}
    # A partial run (company ids given) keeps every other company's existing rows.
    def keep_old(path):
        if not path.exists():
            return []
        with path.open(encoding='utf-8', newline='') as f:
            return [r for r in csv.DictReader(f) if r['company_id'] not in run_ids]
    rows = sorted(list(out.values()) + keep_old(OUT), key=lambda r: (r['company_id'], r['basis'], r['period']))
    if not rows:
        print('no rows'); sys.exit(1)
    with OUT.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['company_id', 'period', 'basis', 'inventory_KRW', 'source', 'currency', 'unit_raw'], extrasaction='ignore', restval=''); w.writeheader(); w.writerows(rows)
    cov = {}
    for r in rows:
        cov.setdefault(r['company_id'], {}).setdefault(r['basis'], []).append(r['period'])
    STATUS.write_text(json.dumps(dict(updated_at=datetime.datetime.now().isoformat(timespec='seconds'), reports=len(todo), rows=len(rows),
        coverage={k: {b: [min(v), max(v), len(v)] for b, v in d.items()} for k, d in cov.items()}, issues=issues, failures=failures),
        ensure_ascii=False, indent=1))
    print('rows', len(rows), 'revenue rows', len(rev_rows), 'issues', len(issues), 'failures', len(failures))


if __name__ == '__main__':
    main()
