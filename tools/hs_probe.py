"""Review tool: list 10-digit HSK children (export USD/KG) of given HS codes for given months. Args: HS:YYYYMM-YYYYMM ..."""
import os, sys, json, requests, xml.etree.ElementTree as ET
URL = "http://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"
out = {}
for arg in sys.argv[1:] or os.environ.get('HS_ARGS', '').split():
    hs, rng = arg.split(':'); a, b = rng.split('-')
    r = requests.get(URL, params=dict(serviceKey=os.environ['CUSTOMS_API_KEY'], strtYymm=a, endYymm=b, hsSgn=hs), timeout=120)
    rows = []
    for it in ET.fromstring(r.content).findall('.//item'):
        rows.append({k: (it.findtext(k) or '').strip() for k in ('year', 'hsCode', 'statKor', 'expDlr', 'expWgt')})
    out[arg] = rows
    print(arg, len(rows))
open('hs_probe.json', 'w').write(json.dumps(out, ensure_ascii=False, indent=1))
