"""TSMC 분기 매출총이익률·영업이익률·순이익률 수집 — 원본: TSMC가 SEC에 제출한 6-K 실적발표문(Earnings Release).

실적발표문의 정형 문장 "Gross margin for the quarter was xx.x%, operating margin was xx.x%, and net profit margin was xx.x%"를 읽고,
global_products.csv에 이미 있는 TSM 분기 매출(USD 백만, 경영보고서 기준)에 곱해 gross_profit·op_income·net_income 행을 갱신합니다.
SEC 공정 접근 규칙(초당 10회 이하, 연락처 User-Agent)을 지킵니다.
"""
import csv, json, re, time, gzip, pathlib, urllib.request

UA = {'User-Agent': 'korea-export-data research dashboard knwy26@gmail.com', 'Accept-Encoding': 'gzip'}
ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV = ROOT / 'global_products.csv'
CIK = 1046179
last = [0.0]


def get(url):
    for a in range(4):
        w = 0.15 - (time.time() - last[0])
        if w > 0: time.sleep(w)
        last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip': b = gzip.decompress(b)
                return b.decode('utf-8', 'replace')
        except Exception:
            if a == 3: raise
            time.sleep(2 * (a + 1))


def filings():
    sub = json.loads(get(f'https://data.sec.gov/submissions/CIK{CIK:010d}.json'))
    blocks = [sub['filings']['recent']] + [json.loads(get('https://data.sec.gov/submissions/' + f['name'])) for f in sub['filings'].get('files', [])]
    out = []
    for b in blocks:
        for i, form in enumerate(b['form']):
            if form == '6-K' and b['filingDate'][i] >= '2018-04-01':
                out.append((b['accessionNumber'][i], b['primaryDocument'][i], b['filingDate'][i]))
    return out


def main():
    res = {}
    for acc, doc, fdate in filings():
        if not re.search(r'\dq\d\de', doc, re.I):
            continue
        m = re.search(r'(\d)q(\d\d)e', doc, re.I)
        per = f'20{m.group(2)}-Q{m.group(1)}'
        if per in res: continue
        url = f'https://www.sec.gov/Archives/edgar/data/{CIK}/{acc.replace("-", "")}/{doc}'
        try:
            t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', get(url)))
        except Exception as e:
            print(per, 'error', e); continue
        g = re.search(r'[Gg]ross margin for the quarter was ([\d.]+)%', t)
        o = re.search(r'operating margin was ([\d.]+)%', t)
        n = re.search(r'net profit margin was ([\d.]+)%', t)
        if g and o:
            res[per] = dict(gm=float(g.group(1)), om=float(o.group(1)), nm=float(n.group(1)) if n else None, url=url)
            print(per, res[per])
    rows = list(csv.DictReader(CSV.open(encoding='utf-8-sig')))
    rev = {r['period']: float(r['value']) for r in rows if r['company'] == 'TSM' and r['kind'] == 'revenue'}
    keep = [r for r in rows if not (r['company'] == 'TSM' and r['kind'] in ('gross_profit', 'op_income', 'net_income'))]
    for per, m in sorted(res.items()):
        if per not in rev: continue
        src = m['url'] + ' (6-K 실적발표문의 이익률 × 분기 매출)'
        for k, key, nm in (('gross_profit', 'gm', '매출총이익'), ('op_income', 'om', '영업이익'), ('net_income', 'nm', '순이익')):
            if m[key] is None: continue
            keep.append(dict(company='TSM', period=per, kind=k, item=nm, value=round(rev[per] * m[key] / 100, 1), unit='USD mn', source=src))
    with CSV.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['company', 'period', 'kind', 'item', 'value', 'unit', 'source']); w.writeheader(); w.writerows(keep)
    print(len(res), 'quarters with margins')


if __name__ == '__main__':
    main()
