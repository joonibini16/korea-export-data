"""Fetch candidate URLs from Actions and save status + head of body (review only). Args: URLs."""
import json, os, sys, urllib.request, pathlib
out = []
for u in (sys.argv[1:] or os.environ.get('URLS', '').split()):
    try:
        data = None; hdr_ct = None
        if u.startswith('POST::'):
            _, u, body = u.split('::', 2); data = body.encode()
            if body.startswith('{'): hdr_ct = 'application/json'
        req = urllib.request.Request(u, data=data, headers=({'Content-Type': hdr_ct} if hdr_ct else {}) | {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://comp.fnguide.com/' if 'fnguide' in u else 'http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd' if 'krx' in u else 'https://navercomp.wisereport.co.kr/'})
        with urllib.request.urlopen(req, timeout=40) as r:
            b = r.read()
        try: t = b.decode('utf-8-sig')
        except UnicodeDecodeError: t = b.decode('euc-kr', 'replace')
        out.append(dict(url=u, status=200, length=len(b), head=t[:int(os.environ.get('MAXLEN','300000'))]))
    except Exception as e:
        out.append(dict(url=u, error=str(e)[:300]))
    print(u, out[-1].get('status'), out[-1].get('length'), out[-1].get('error', ''), flush=True)
pathlib.Path('url_probe.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
