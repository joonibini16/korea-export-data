"""해외(미국 SEC 공시) 기업 제품·부문별 분기 매출 수집 — 원본: SEC EDGAR 10-Q/10-K 인라인 XBRL.

- 회사 공시 본문(primary document, iXBRL)에서 매출 계정(us-gaap Revenues / RevenueFromContractWithCustomer...) 사실 중
  제품·서비스 축(srt:ProductOrServiceAxis) 또는 사업부문 축(us-gaap:StatementBusinessSegmentsAxis) 한 개로만 나뉜 값을 모읍니다.
- 3개월 기간 값은 그대로, 10-K(연간)의 4분기는 연간 − (1~3분기 합)으로 계산합니다.
- 항목 이름은 XBRL 멤버 이름(예: nvda:ComputeMember → Compute)에서 만듭니다.
- 출력: global_segments_sec.csv (company,period,kind,item,value,unit,source) · kind = segment_revenue / share / revenue
  period = 회계분기 말일이 속한 '달력' 분기(YYYY-Qn).
SEC 공정 접근 규칙(초당 10회 이하, 연락처 User-Agent)을 지킵니다. 이미 처리한 공시는 캐시(.secseg-cache)에서 건너뜁니다.
"""
import csv, json, re, sys, time, gzip, pathlib, datetime as dt, urllib.request
from collections import defaultdict

UA = {'User-Agent': 'korea-export-data research dashboard knwy26@gmail.com', 'Accept-Encoding': 'gzip'}
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'global_segments_sec.csv'
CACHE = ROOT / '.secseg-cache'; CACHE.mkdir(exist_ok=True)
REV = {'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'RevenuesNetOfInterestExpense'}
AXES = ['ProductOrServiceAxis', 'StatementBusinessSegmentsAxis']
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


def qlabel(end):
    d = dt.date.fromisoformat(end)
    # 말일이 분기 첫 며칠이면(예: 52/53주 회계) 직전 분기로
    if d.day <= 7 and d.month in (1, 4, 7, 10): d = d - dt.timedelta(days=10)
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
        if concept not in REV or cr.group(1) not in ctx: continue
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
        seg = defaultdict(dict); tot = {}; src = {}
        for f in fl:
            cf = CACHE / f"{t}_{f['acc']}.json"
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
                if not dims:
                    tot.setdefault((s, e), v); src.setdefault((s, e), url); continue
                if len(dims) != 1: continue
                axis, mem = dims[0][0].split(':')[-1], dims[0][1]
                if axis not in AXES: continue
                seg[(axis, mem)].setdefault((s, e), v); src.setdefault((s, e), url)
        if not seg:
            status[t] = f'{len(fl)} filings, no segment facts'; continue
        # 축 선택: 분기 수 × 합계 일치도가 가장 좋은 축
        best = None
        for axis in AXES:
            mems = [k for k in seg if k[0] == axis]
            if not mems: continue
            q = defaultdict(dict)
            for k in mems:
                for (s, e), v in seg[k].items(): q[(s, e)][k[1]] = v
            ok = sum(1 for p, d in q.items() if p in tot and tot[p] and abs(sum(d.values()) / tot[p] - 1) < 0.03)
            score = (ok, len(q))
            if not best or score > best[0]: best = (score, axis, mems)
        _, axis, mems = best
        # 분기값 만들기: 3개월 값 우선, 없으면 연간 − 같은 회계연도 3개 분기 합
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
        per_item = {k[1]: quarters(seg[k]) for k in mems}
        ends = sorted(set(e for d in per_item.values() for e in d))
        n = 0
        for e in ends:
            vals = {label(m): d[e][0] for m, d in per_item.items() if e in d and d[e][0] > 0}
            if len(vals) < 2: continue
            per = qlabel(e); s_e = next(d[e][1] for d in per_item.values() if e in d); u = src.get(s_e, '')
            total = sum(vals.values())
            if e in tq: rows.append(dict(company=t, period=per, kind='revenue', item='매출(합계)', value=round(tq[e][0] / 1e6, 1), unit='USD mn', source=u))
            for it, v in vals.items():
                rows.append(dict(company=t, period=per, kind='segment_revenue', item=it, value=round(v / 1e6, 1), unit='USD mn', source=u + f' (SEC XBRL {axis})'))
                rows.append(dict(company=t, period=per, kind='share', item=it, value=round(v / total * 100, 2), unit='%', source=u + ' (항목 합 대비)'))
            n += 1
        status[t] = f'{axis} · {len(mems)} items · {n} quarters'
        print(t, status[t], flush=True)
    with OUT.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['company', 'period', 'kind', 'item', 'value', 'unit', 'source']); w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r['company'], r['period'], r['kind'], r['item'])))
    (ROOT / 'global_segments_sec_status.json').write_text(json.dumps(dict(updated=dt.datetime.utcnow().isoformat(timespec='seconds'), companies=status), ensure_ascii=False, indent=1))
    print(len(rows), 'rows')


if __name__ == '__main__':
    main()
