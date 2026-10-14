"""부문(제품)별 매출·영업이익 표 탐색용 덤프. 회사별 최근 N개 정기보고서에서
'부문' 문맥 + 매출·영업이익(손익)을 함께 담은 표를 저장합니다. Args: ids... [--last=3]
Output: segment_dump.json
"""
import json, re, sys, pathlib, concurrent.futures
from lxml import html
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import collect_company_history as h

def doc_url(r):
    acpt = r['acpt']; v = h.get('https://kind.krx.co.kr/common/disclsviewer.do?method=searchInitInfo&acptNo=' + acpt + '&docNo=')
    d = html.fromstring(v); op = d.xpath('//select[@id="mainDoc"]/option[@selected]') or d.xpath('//select[@id="mainDoc"]/option[contains(@value,"|")]')
    docno = op[0].get('value').split('|')[0]
    form = '11011' if r['period'].endswith('Q4') else '11012' if r['period'].endswith('Q2') else '11013'
    return f'https://kind.krx.co.kr/external/{acpt[:4]}/{acpt[4:6]}/{acpt[6:8]}/{acpt[8:]}/{docno}/{form}.htm'

def scan(r):
    try:
        u = doc_url(r); d = html.fromstring(h.get(u)); out = []
        for t in d.xpath('//table'):
            tx = h.text(t).replace(' ', '')
            if len(tx) > 30000: continue
            if not re.search(r'매출|수익', tx) or not re.search(r'영업이익|영업손익|영업손실|부문이익|부문손익|세그먼트', tx): continue
            before = ' '.join(h.text(e) for e in t.xpath('preceding-sibling::*[position()<=4]'))[-700:]
            if not re.search(r'부문|사업부|세그먼트|제품', before + tx[:300]): continue
            out.append(dict(before=before, rows=[[c[:60] for c in row[:14]] for row in h.rows(t)[:40]]))
        return dict(company_id=r['company_id'], name=r['name'], period=r['period'], url=u, tables=out[:12])
    except Exception as e:
        return dict(company_id=r['company_id'], period=r['period'], error=str(e)[:200])

def main():
    ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    last = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--last=')), 3))
    watch = json.loads((h.ROOT / 'company_watchlist.json').read_text())['companies']
    comps = [c for c in watch if c['id'] in ids] if ids else [c for c in watch if c['id'].isdigit()]
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        cats = list(pool.map(h.catalog, comps))
    todo = [r for c in cats for r in sorted(c.get('reports', []), key=lambda r: r['period'])[-last:]]
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        res = list(pool.map(scan, todo))
    pathlib.Path('segment_dump.json').write_text(json.dumps(dict(reports=res), ensure_ascii=False, indent=0))
    print('reports', len(res), 'with tables', sum(1 for r in res if r.get('tables')))

if __name__ == '__main__':
    main()
