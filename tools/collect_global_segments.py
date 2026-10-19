"""해외(미국 SEC 공시) 기업 제품·부문별 분기 매출 수집 — 원본: SEC EDGAR 10-Q/10-K 인라인 XBRL.

- 회사 공시 본문(primary document, iXBRL)에서 매출 계정(us-gaap Revenues / RevenueFromContractWithCustomer...) 사실 중
  제품·서비스 축(srt:ProductOrServiceAxis) 또는 사업부문 축(us-gaap:StatementBusinessSegmentsAxis) 한 개로만 나뉜 값을 모읍니다.
- 3개월 기간 값은 그대로, 10-K(연간)의 4분기는 연간 − (1~3분기 합)으로 계산합니다.
- 항목 이름은 XBRL 멤버 이름(예: nvda:ComputeMember → Compute)에서 만듭니다.
- 출력: global_segments_sec.csv (company,period,kind,item,value,unit,source) · kind = segment_revenue / share / revenue
  period = 회계분기 말일이 속한 '달력' 분기(YYYY-Qn).
SEC 공정 접근 규칙(초당 10회 이하, 연락처 User-Agent)을 지킵니다. 이미 처리한 공시는 캐시(.secseg-cache)에서 건너뜁니다.
"""
import csv, json, re, sys, time, gzip, itertools, pathlib, datetime as dt, urllib.request
from collections import defaultdict

UA = {'User-Agent': 'korea-export-data research dashboard knwy26@gmail.com', 'Accept-Encoding': 'gzip'}
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'global_segments_sec.csv'
CACHE = ROOT / '.secseg-cache'; CACHE.mkdir(exist_ok=True)
PROFIT = {'OperatingIncomeLoss': 'op_income', 'GrossProfit': 'gross_profit', 'NetIncomeLoss': 'net_income'}
REV = {'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'}
GENERIC = {'product', 'products', 'service', 'services', 'productandservice', 'productsandservices', 'serviceandother', 'serviceother', 'productother'}
PS = re.compile(r'^(Products?|Services?|Product.*Excluding|Services? And|Subscriptions? ?and Services|Product And Service)', re.I)
EXCL = re.compile(r'Geograph|LegalEntity|ConsolidationItems|Range|Scenario|Concentration|Customer|Restatement|Adjustment|Currency|Country|Region|Statement(Equity|ClassOfStock)|Counterparty|Maturity|FinancialInstrument|Hedg|Derivative|Location|Market(s)?Axis')
START = '2018-01-01'
last = [0.0]


def get(url, binary=False):
    for a in range(4):
        wait = 0.12 - (time.time() - last[0])
        if wait > 0: time.sleep(wait)
        last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip': b = gzip.decompress(b)
                return b if binary else b.decode('utf-8', 'replace')
        except Exception as e:
            if a == 3: raise
            time.sleep(2 * (a + 1))


def label(member):
    m = member.split(':')[-1]
    m = re.sub(r'(Segment)?Member$', '', m)
    m = re.sub(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])', ' ', m)
    return m.strip()


def qlabel(span):
    """회계분기의 가운데 날짜가 속한 달력 분기."""
    s, e = (dt.date.fromisoformat(x) for x in span)
    if (e - s).days > 100: s = e - dt.timedelta(days=91)
    d = s + (e - s) / 2
    return f'{d.year}-Q{(d.month - 1) // 3 + 1}'


def parse(html):
    """iXBRL → [(concept, axis, member, start, end, value)] (단일 축) 와 총매출."""
    ctx = {}
    for m in re.finditer(r'<xbrli:context\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</xbrli:context>', html, re.S):
        cid, body = m.group(1), m.group(2)
        dims = re.findall(r'<xbrldi:explicitMember[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*<', body)
        s = re.search(r'<xbrli:startDate>([^<]+)<', body); e = re.search(r'<xbrli:endDate>([^<]+)<', body)
        if s and e: ctx[cid] = (s.group(1).strip(), e.group(1).strip(), dims)
    facts = []
    for m in re.finditer(r'<ix:nonFraction\b([^>]*)>(.*?)</ix:nonFraction>', html, re.S):
        attrs, txt = m.group(1), re.sub(r'<[^>]+>', '', m.group(2))
        nm = re.search(r'\bname="([^"]+)"', attrs); cr = re.search(r'\bcontextRef="([^"]+)"', attrs)
        if not nm or not cr: continue
        concept = nm.group(1).split(':')[-1]
        if (concept not in REV and concept not in PROFIT) or cr.group(1) not in ctx: continue
        t = txt.strip().replace(',', '')
        if not re.fullmatch(r'-?[\d.]+', t or ''): continue
        sc = re.search(r'\bscale="(-?\d+)"', attrs)
        v = float(t) * 10 ** int(sc.group(1) if sc else 0)
        if re.search(r'\bsign="-"', attrs): v = -v
        s, e, dims = ctx[cr.group(1)]
        facts.append((concept, dims, s, e, v))
    return facts


def main():
    wl = json.loads((ROOT / 'global_earnings.json').read_text())['watchlist']
    tick = {r['ticker'].upper(): r for r in json.loads(get('https://www.sec.gov/files/company_tickers.json')).values()}
    only = [a.upper() for a in sys.argv[1:] if not a.startswith('-')]
    rows, status = [], {}
    for c in wl:
        t = c['ticker'].upper()
        if only and t not in only: continue
        if t not in tick: continue
        cik = int(tick[t]['cik_str'])
        try:
            sub = json.loads(get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json'))
        except Exception as e:
            status[t] = f'submissions error {e}'; continue
        rec = sub['filings']['recent']
        fl = [dict(form=rec['form'][i], acc=rec['accessionNumber'][i], date=rec['reportDate'][i], doc=rec['primaryDocument'][i], filed=rec['filingDate'][i])
              for i in range(len(rec['form'])) if rec['form'][i] in ('10-Q', '10-K') and rec['reportDate'][i] >= START and rec['primaryDocument'][i].endswith('.htm')]
        # 회사별: (axis, member) → {(start,end): value}, 총매출 {(start,end): value}
        seg = defaultdict(dict); tot = {}; src = {}; geo_parts = {}; ptot = defaultdict(dict); pseg = defaultdict(dict)
        for f in fl:
            cf = CACHE / f"{t}_{f['acc']}_v2.json"
            if cf.exists():
                facts = json.loads(cf.read_text())
            else:
                url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{f['acc'].replace('-', '')}/{f['doc']}"
                try:
                    facts = parse(get(url))
                except Exception as e:
                    print(t, f['acc'], 'error', e); continue
                cf.write_text(json.dumps(facts))
            url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{f['acc'].replace('-', '')}/{f['doc']}"
            for concept, dims, s, e, v in facts:
                span = (dt.date.fromisoformat(e) - dt.date.fromisoformat(s)).days
                if not (80 <= span <= 100 or 350 <= span <= 380): continue
                if concept in PROFIT:
                    k = PROFIT[concept]
                    if not dims: ptot[k].setdefault((s, e), v); src.setdefault((s, e), url)
                    elif k == 'op_income':
                        d2 = [d for d in dims if not (d[0].endswith('ConsolidationItemsAxis') and d[1].endswith('OperatingSegmentsMember'))]
                        if len(d2) == 1 and d2[0][0].endswith('StatementBusinessSegmentsAxis'):
                            pseg[d2[0][1]].setdefault((s, e), v)
                    continue
                if not dims:
                    tot.setdefault((s, e), v); src.setdefault((s, e), url); continue
                # 운영부문 표시(ConsolidationItemsAxis=OperatingSegmentsMember)는 의미 없는 보조 축이라 제거
                dims = [d for d in dims if not (d[0].endswith('ConsolidationItemsAxis') and d[1].endswith('OperatingSegmentsMember'))]
                if not dims:
                    tot.setdefault((s, e), v); src.setdefault((s, e), url); continue
                if len(dims) == 2:
                    geo = [d for d in dims if 'Geograph' in d[0]]
                    oth = [d for d in dims if 'Geograph' not in d[0]]
                    if len(geo) == 1 and len(oth) == 1 and not EXCL.search(oth[0][0].split(':')[-1]):
                        key = (oth[0][0].split(':')[-1] + '#geo', oth[0][1])
                        g = geo_parts.setdefault((key, (s, e)), {})
                        g.setdefault(geo[0][1], v); src.setdefault((s, e), url)
                    continue
                if len(dims) != 1: continue
                axis, mem = dims[0][0].split(':')[-1], dims[0][1]
                if EXCL.search(axis): continue
                seg[(axis, mem)].setdefault((s, e), v); src.setdefault((s, e), url)
        # 지역별로만 나뉜 제품 매출은 지역 합으로 제품 값을 만듦(같은 제품의 단일 축 값이 없을 때만)
        for (key, span), parts in geo_parts.items():
            base = (key[0][:-4], key[1])
            if span in seg.get(base, {}): continue
            seg[key][span] = sum(parts.values())
        if not seg:
            status[t] = f'{len(fl)} filings, no segment facts'; continue

        def quarters(series):
            out = {}
            for (s, e), v in series.items():
                if (dt.date.fromisoformat(e) - dt.date.fromisoformat(s)).days <= 100: out[e] = (v, (s, e))
            for (s, e), v in series.items():
                if (dt.date.fromisoformat(e) - dt.date.fromisoformat(s)).days < 350 or e in out: continue
                qs = [(qe, qv) for qe, qv in out.items() if s < qe < e]
                if len(qs) == 3: out[e] = (v - sum(qv[0] for _, qv in qs), (s, e))
            return out
        tq = quarters(tot)
        q_axis = defaultdict(lambda: defaultdict(dict))   # axis → end → {member: (v, span)}
        for (axis, mem), ser in seg.items():
            for e, vs in quarters(ser).items():
                if vs[0] != 0: q_axis[axis][e][mem] = vs
        pref = lambda ax: (0 if 'Product' in ax else 1 if 'Segment' in ax else 2) + (0.5 if ax.endswith('#geo') else 0)

        def fit(items, total):
            spec = {k: v for k, v in items.items() if label(k).replace(' ', '').lower() not in GENERIC}
            r = fit0(spec, total) if len(spec) >= 2 else None
            return r if r else fit0(items, total)

        def fit0(items, total):
            """항목 합이 총매출과 맞는 가장 많은 항목 조합(상위·하위 항목 중복 제거)."""
            if not total: return items
            ks = list(items)
            if abs(sum(v[0] for v in items.values()) / total - 1) < 0.02: return items
            if len(ks) > 14: return None
            best = None
            for r in range(len(ks), 1, -1):
                for comb in itertools.combinations(ks, r):
                    if abs(sum(items[k][0] for k in comb) / total - 1) < 0.02:
                        best = {k: items[k] for k in comb}; break
                if best: break
            return best
        ends = sorted(set(e for ax in q_axis for e in q_axis[ax]))
        n = 0; used = defaultdict(int)
        for e in ends:
            total = tq.get(e, (None,))[0]
            cands = []
            for ax in q_axis:
                items = q_axis[ax].get(e, {})
                if len(items) < 2: continue
                f2 = fit(items, total)
                if f2 and ax.endswith('#geo') and len(f2) != len(items): f2 = None
                if f2 and len(f2) >= 2:
                    # '제품/서비스'처럼 정보가 적은 구분보다 사업부문·제품군 구분을 우선
                    gen = sum(1 for m in f2 if PS.search(label(m))) / len(f2)
                    hasg = any(label(m).replace(' ', '').lower() in {'product', 'products', 'serviceother', 'productother', 'productandservice', 'productsandservices'} for m in f2)
                    cands.append(((hasg, gen >= 0.5, len(f2) < 3, pref(ax), -len(f2)), ax, f2))
            if not cands: continue
            _, ax, items = min(cands, key=lambda c: c[0]); used[ax] += 1
            span = next(iter(items.values()))[1]; u = src.get(span, '')
            per = qlabel(span)
            items = {m: v for m, v in items.items() if v[0] > 0}
            ssum = sum(v[0] for v in items.values())
            if total: rows.append(dict(company=t, period=per, kind='revenue', item='매출(합계)', value=round(total / 1e6, 1), unit='USD mn', source=u))
            merged = defaultdict(float)
            for m, (v, _) in items.items(): merged[label(m)] += v
            for it, v in merged.items():
                rows.append(dict(company=t, period=per, kind='segment_revenue', item=it, value=round(v / 1e6, 1), unit='USD mn', source=u + f" (SEC XBRL {ax.replace('#geo', ', 지역 합산')})"))
                rows.append(dict(company=t, period=per, kind='share', item=it, value=round(v / ssum * 100, 2), unit='%', source=u + ' (항목 합 대비)'))
            n += 1
        # 이익(회사 전체: 매출총이익·영업이익·순이익, 사업부문 영업이익)
        npf = 0
        for k, ser in ptot.items():
            for e, (v, span) in quarters(ser).items():
                rows.append(dict(company=t, period=qlabel(span), kind=k, item={'op_income': '영업이익', 'gross_profit': '매출총이익', 'net_income': '순이익'}[k], value=round(v / 1e6, 1), unit='USD mn', source=src.get(span, '') + ' (SEC XBRL)')); npf += 1
        for mem, ser in pseg.items():
            rser = seg.get(('StatementBusinessSegmentsAxis', mem))
            if rser:
                for e, (v, span) in quarters(rser).items():
                    if v > 0: rows.append(dict(company=t, period=qlabel(span), kind='seg_revenue', item=label(mem), value=round(v / 1e6, 1), unit='USD mn', source=src.get(span, '') + ' (SEC XBRL 사업부문 매출)'))
            for e, (v, span) in quarters(ser).items():
                rows.append(dict(company=t, period=qlabel(span), kind='seg_op_income', item=label(mem), value=round(v / 1e6, 1), unit='USD mn', source=src.get(span, '') + ' (SEC XBRL 사업부문 영업이익)'))
        status[t] = f'{n} quarters · profit {npf} · seg-op {len(pseg)} · axes ' + ', '.join(f'{a}({c})' for a, c in used.items())
        print(t, status[t], flush=True)
    with OUT.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['company', 'period', 'kind', 'item', 'value', 'unit', 'source']); w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r['company'], r['period'], r['kind'], r['item'])))
    (ROOT / 'global_segments_sec_status.json').write_text(json.dumps(dict(updated=dt.datetime.utcnow().isoformat(timespec='seconds'), companies=status), ensure_ascii=False, indent=1))
    print(len(rows), 'rows')


if __name__ == '__main__':
    main()
