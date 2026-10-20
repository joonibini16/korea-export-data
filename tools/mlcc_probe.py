"""Review-only probe: download Future Electronics Market Conditions Report PDF + related pages,
extract text/tables so the capacitor lead-time table layout can be inspected. Output → probe-mlcc branch."""
import json, pathlib, urllib.request
import pdfplumber
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'}
out = pathlib.Path('probe'); out.mkdir(exist_ok=True)
info = []
def fetch(name, url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
            b = r.read(); info.append(dict(name=name, url=url, status=r.status, length=len(b), headers=dict(r.headers)))
            (out / name).write_bytes(b); return b
    except Exception as e:
        info.append(dict(name=name, url=url, error=str(e)[:300]))
fetch('report.pdf', 'https://media.futureelectronics.com/doc/Market-Conditions-Report.pdf')
for n, u in [('mcr.html', 'https://www.futureelectronics.com/resources/market-conditions-report'),
             ('mcr_mlcc.html', 'https://www.futureelectronics.com/resources/market-conditions-report/mlcc'),
             ('terms.html', 'https://www.futureelectronics.com/policies/terms-of-use'),
             ('robots.txt', 'https://www.futureelectronics.com/robots.txt'),
             ('media_robots.txt', 'https://media.futureelectronics.com/robots.txt')]:
    fetch(n, u)
pdf = out / 'report.pdf'
if pdf.exists():
    with pdfplumber.open(pdf) as doc:
        meta = dict(pages=len(doc.pages), meta=doc.metadata)
        txt, tables, chars = [], [], {}
        for i, p in enumerate(doc.pages):
            t = p.extract_text() or ''
            txt.append(f'===== page {i+1}\n{t}')
            for tb in p.extract_tables():
                tables.append(dict(page=i+1, rows=tb))
            for c in p.chars:
                if ord(c['text'][0]) > 127: chars[c['text']] = chars.get(c['text'], 0) + 1
            meta.setdefault('images_per_page', []).append(len(p.images))
        (out / 'report.txt').write_text('\n'.join(txt))
        (out / 'tables.json').write_text(json.dumps(tables, ensure_ascii=False, indent=1))
        meta['nonascii_chars'] = chars
        info.append(dict(pdf=meta))
(out / 'info.json').write_text(json.dumps(info, ensure_ascii=False, indent=1, default=str))
print(json.dumps(info, ensure_ascii=False, default=str)[:3000])
