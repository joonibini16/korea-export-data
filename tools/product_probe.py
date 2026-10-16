"""정기보고서 '주요 제품 매출'·'가격변동추이' 표 구조 확인용(검토 전용). Args: company ids. Output: product_probe.json"""
import json, re, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import collect_company_history as h
import collect_segments as s
from lxml import html
out = {}
for cid in sys.argv[1:]:
    cat = h.catalog(dict(id=cid, name=cid))
    reps = sorted(cat.get('reports', []), key=lambda r: r['period'])
    if not reps: out[cid] = {'error': 'no reports'}; continue
    r = reps[-1]
    try:
        u = s.doc_url(r); d = html.fromstring(h.get(u))
    except Exception as e:
        out[cid] = {'error': str(e)[:200]}; continue
    res = []
    for t in d.xpath('//table'):
        before = ' '.join(h.text(e) for e in t.xpath('preceding-sibling::*[position()<=4]'))[-400:]
        if not re.search(r'주요\s*제품|매출\s*실적|가격\s*변동|매출\s*현황|판매\s*실적', before): continue
        g = s.grid(t)
        res.append({'before': before[-250:], 'grid': g[:14]})
        if len(res) >= 8: break
    out[cid] = {'period': r['period'], 'url': u, 'tables': res}
    print(cid, r['period'], len(res), flush=True)
pathlib.Path('product_probe.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
