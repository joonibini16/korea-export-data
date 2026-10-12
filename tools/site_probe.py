"""Find production-site cities and product notes in the latest periodic report of candidate companies.
Args: id:name pairs. Output: site_probe.json (city mention counts near 공장/사업장, snippets)."""
import json, re, sys, pathlib, collections
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import collect_company_history as h
from lxml import html
CITY = re.compile(r'(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원(?:특별자치)?도|충청북도|충청남도|전라북도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)\s*([가-힣]+[시군])?\s*([가-힣]+[구읍면])?')
out = {}
for arg in sys.argv[1:]:
    cid, name = arg.split(':', 1)
    cat = h.catalog(dict(id=cid, name=name))
    reps = sorted(cat['reports'], key=lambda r: r['period'])
    if not reps:
        out[cid] = dict(name=name, error=cat.get('error', 'no reports')); continue
    r = h.process(reps[-1])
    if r.get('error'):
        out[cid] = dict(name=name, error=r['error']); continue
    text = ' '.join(html.fromstring(h.get(r['url'])).itertext())
    text = re.sub(r'\s+', ' ', text)
    counts, snips = collections.Counter(), []
    for m in re.finditer(r'(공장|사업장|생산시설|생산설비|본점|본사)', text):
        win = text[max(0, m.start() - 120): m.end() + 160]
        for c in CITY.finditer(win):
            key = ' '.join(x for x in c.groups() if x)
            counts[key] += 1
        if len(snips) < 6 and CITY.search(win):
            snips.append(win[:260])
    prod = [text[m.start(): m.start() + 200] for m in re.finditer(r'주요 제품|주요제품', text)][:2]
    out[cid] = dict(name=name, period=r['period'], url=r['url'], reports=len(reps), cities=counts.most_common(8), snippets=snips, products=prod)
    print(cid, name, counts.most_common(3), flush=True)
pathlib.Path('site_probe.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
