"""Future Electronics 'Market Conditions Report' PDF → rows (category, manufacturer, product, lead time, trend, pricing).

The report tables are embedded images, so each page is rendered at 300 dpi and read by layout:
- green header bars mark each manufacturer table (name | Lead Time | Trend | Pricing),
- light-gray row bands below the bar are the product rows,
- product / lead-time text is OCR'd (tesseract), trend & pricing arrows are classified from the
  green glyph shape (↔ stable, ↗ increasing, ↙ decreasing, ≡ stretching).
Usage: python tools/parse_future_mcr.py report.pdf out.csv
"""
import csv, re, subprocess, sys, tempfile, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage
import pytesseract

DPI = 300


def render(pdf, page):
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-r', str(DPI), '-png', pdf, f'{d}/p'], check=True)
        f = next(pathlib.Path(d).glob('p*.png'))
        return np.asarray(Image.open(f).convert('RGB')).astype(int)


def green_mask(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (g > 120) & (g - r > 50) & (g - b > 20)


def ocr(a, psm=6, white_on_green=False, whitelist=None):
    if white_on_green:
        gray = 255 - ((a.min(axis=2) > 200) * 255)  # white text → black on white
    else:
        a = a.copy(); a[green_mask(a)] = 255  # drop info icons
        gray = a.mean(axis=2)
    img = Image.fromarray(np.clip(gray, 0, 255).astype('uint8'))
    img = img.resize((img.width * 2, img.height * 2))
    cfg = f'--psm {psm}' + (f' -c tessedit_char_whitelist="{whitelist}"' if whitelist else '')
    return re.sub(r'\s+', ' ', pytesseract.image_to_string(img, config=cfg)).strip()


MAX_WEEKS = 104  # lead times are quoted in weeks; anything longer means a misread '-'/'+'
LEAD_RE = r'~?\d{1,3}(-\d{1,3})?\+?'


def plausible(t):
    return bool(re.fullmatch(LEAD_RE, t)) and all(0 < int(x) <= MAX_WEEKS for x in re.findall(r'\d+', t))


def glyph_pattern(dark):
    """Glyph layout from connected components: D = digit, - = hyphen, + = plus, ~ = tilde, X = unreadable
    (e.g. two digits touching)."""
    lab, n = ndimage.label(dark)
    objs = ndimage.find_objects(lab)
    comps = sorted((sl[1].start, sl[0].stop - sl[0].start, sl[1].stop - sl[1].start, (lab[sl] == k + 1).mean()) for k, sl in enumerate(objs))
    if not comps:
        return ''
    H = max(c[1] for c in comps)
    out = ''
    for _, h, w, fill in comps:
        if h >= 0.8 * H:
            out += 'D' if w <= 0.85 * h else 'X'  # digits are ~0.6 h wide; wider = merged glyphs
        elif h < 0.4 * H and w > h * 1.5:
            out += '~' if fill < 0.6 else ('-' if not out or out[-1] != '-' else '')
        elif 0.4 * H <= h < 0.8 * H and 0.7 < w / h < 1.4:
            out += '+'
    return out


def read_lead(cell):
    """(text, confident) — lead time in weeks (52+, 30-36, ~12-16) or free text (on hold, EOL, TBD).

    Tesseract reads the digits but often drops or mangles the small '-'/'+' glyphs, so the layout of
    glyphs is taken from connected components and the digits from a vote over several OCR variants."""
    a = cell.astype(int); a[green_mask(a)] = 255
    g = a[6:-6, 6:-6].mean(axis=2)
    dark = g < 150
    if not dark.any():
        return '', False
    ys, xs = np.nonzero(dark)
    g = g[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    dark = g < 150
    pat = glyph_pattern(g < 100)  # strict cut keeps '-' apart from digits
    n_digits = pat.count('D')
    readings = []
    gimg = Image.fromarray(np.pad(g, 12, constant_values=255).astype('uint8'))
    readings.append(pytesseract.image_to_string(gimg.resize((gimg.width * 2, gimg.height * 2)), config='--psm 7'))
    for pad, scale, psm in ((10, 1, 7), (10, 1, 8), (10, 2, 8), (25, 1, 7), (10, 3, 13)):
        bw = np.pad(np.where(dark, 0, 255), pad, constant_values=255).astype('uint8')
        img = Image.fromarray(bw); img = img.resize((img.width * scale, img.height * scale))
        readings.append(pytesseract.image_to_string(img, config=f'--psm {psm} -c tessedit_char_whitelist="0123456789-+~"'))
    digits = {}
    for k, t in enumerate(readings):
        d = re.sub(r'\D', '', t.replace('O', '0').replace('o', '0'))
        if len(d) == n_digits and n_digits:
            digits[d] = digits.get(d, 0) + (1.5 if k == 0 else 1)  # grayscale read is the most faithful
    if digits and set(pat) <= set('D-+~'):
        best = max(digits, key=digits.get)
        it = iter(best)
        t = ''.join(next(it) if c == 'D' else c for c in pat)
        if plausible(t):
            return t, digits[best] >= 5
    t = ocr(cell, 7).replace('—', '-').replace('–', '-').strip()
    return t, False


def arrow(cell):
    m = green_mask(cell)
    if m.sum() < 30:
        t = ocr(cell, 7)
        return 'EOL' if 'EOL' in t.upper() else ''
    ys, xs = np.nonzero(m)
    m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = m.shape
    if h < 0.6 * w:  # flat glyph: ↔ or ≡
        full_rows = (m.sum(axis=1) > 0.6 * w)
        lines = np.count_nonzero(np.diff(np.r_[0, full_rows.astype(int)]) == 1)
        return 'stretching' if lines >= 2 else 'stable'
    tr = m[:h // 2, w // 2:].sum(); bl = m[h // 2:, :w // 2].sum()
    return 'increasing' if tr > bl else 'decreasing'


def clean_product(t):
    t = re.sub(r'\s+[—–-]\s+|\s*[—–]\s*', ' - ', t)
    t = re.sub(r'(?<=[A-Za-z)])\s*\d\b', '', t)  # footnote numbers next to info icons
    t = re.sub(r'\b[lI]uf\b', '1uf', t)
    t = re.sub(r'(?<=\w)-(?=Ceramic)', ' - ', t)
    toks = re.sub(r'\s+', ' ', t).strip().split(' ')
    while toks and not re.search(r'[A-Za-z0-9]{2}|^\(|\)$', toks[-1]):
        toks.pop()  # trailing footnote marks (info icon residue)
    return ' '.join(toks).strip(' @©®')


def parse_page(a, category, page):
    g = green_mask(a)
    lab, n = ndimage.label(g)
    rows = []
    # header cells are solid green boxes (~0.16 in tall); a table header = name cell + 3 cells to its right
    cells = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if 30 <= y1 - y0 <= 80 and x1 - x0 > 100 and g[sl].mean() > 0.85:
            cells.append((y0, y1, x0, x1))
    for y0, y1, x0, x1 in cells:
        if x1 - x0 < 400:
            continue  # name cell is the wide one
        segs = [(x0, x1)]
        while len(segs) < 4:
            nxt = [c for c in cells if abs(c[0] - y0) <= 6 and 0 <= c[2] - segs[-1][1] <= 25]
            if not nxt:
                break
            segs.append((nxt[0][2], nxt[0][3]))
        if len(segs) != 4:
            continue
        maker = ocr(a[y0:y1, segs[0][0]:segs[0][1]], 7, white_on_green=True)
        # product rows: light-gray bands below the bar in the lead-time column
        lx0, lx1 = segs[1]
        col = a[:, lx1 - 9:lx1 - 3].mean(axis=(1, 2))  # text-free strip: row fill ~244, separator lines ~238
        y = y1
        while y < a.shape[0] and col[y] < 242:  # skip header edge
            y += 1
        bands, s = [], y
        while y < a.shape[0]:
            if col[y] >= 250:  # page background → table ended
                break
            if col[y] < 241.5:
                if y - s > 40:
                    bands.append((s, y))
                while y < a.shape[0] and col[y] < 241.5:
                    y += 1
                s = y
                continue
            y += 1
        if y - s > 40:
            bands.append((s, y))
        for s, e in bands:
            prod = clean_product(ocr(a[s:e, segs[0][0]:segs[0][1]], 6))
            lead_cell = a[s:e, lx0:lx1].astype('uint8')
            lead, sure = read_lead(lead_cell)
            rows.append(dict(page=page, category=category, manufacturer=maker, product=prod, lead_time=lead,
                             trend=arrow(a[s:e, segs[2][0]:segs[2][1]]), pricing=arrow(a[s:e, segs[3][0]:segs[3][1]]),
                             y=s, x=segs[0][0], lead_cell=lead_cell, lead_sure=sure))
    return sorted(rows, key=lambda r: (r['x'] > a.shape[1] // 2, r['y']))


def digit_glyphs(cell):
    """(layout pattern, list of normalized digit bitmaps) for a lead-time cell."""
    a = cell.astype(int).copy(); a[green_mask(a)] = 255
    dark = a[6:-6, 6:-6].mean(axis=2) < 100  # strict cut keeps '-' apart from digits
    if not dark.any():
        return '', []
    ys, xs = np.nonzero(dark)
    dark = dark[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    pat = glyph_pattern(dark)
    lab, _ = ndimage.label(dark)
    H = dark.shape[0]
    glyphs = []
    for sl in sorted(ndimage.find_objects(lab), key=lambda q: q[1].start):
        if sl[0].stop - sl[0].start >= 0.8 * H:
            g = Image.fromarray((dark[sl] * 255).astype('uint8')).resize((20, 30), Image.BILINEAR)
            glyphs.append(np.asarray(g, float) / 255)
    return pat, glyphs


def refine_leads(rows):
    """Second opinion on OCR digits by template matching against digits learned from this same report.

    OCR sometimes confuses 1/4 and 5/9 on this font. Cells where all OCR variants agreed teach per-digit
    templates; a digit is replaced only when its glyph clearly matches another template."""
    samples, parsed = {}, []
    for r in rows:
        pat, glyphs = digit_glyphs(r['lead_cell'])
        parsed.append((pat, glyphs))
        d = re.sub(r'\D', '', r['lead_time'])
        if r.get('lead_sure') and glyphs and len(d) == len(glyphs) == pat.count('D'):
            for ch, g in zip(d, glyphs):
                samples.setdefault(ch, []).append(g)
    tmpl = {ch: np.median(gs, axis=0) for ch, gs in samples.items() if len(gs) >= 3}
    if len(tmpl) < 8:
        return
    for r, (pat, glyphs) in zip(rows, parsed):
        d = re.sub(r'\D', '', r['lead_time'])
        if not glyphs or 'X' in pat or len(glyphs) != pat.count('D') or len(d) != len(glyphs) or not plausible(r['lead_time']):
            continue
        new = []
        for ch, g in zip(d, glyphs):
            dist = sorted((np.abs(t - g).mean(), c) for c, t in tmpl.items())
            cur = next((x for x, c in dist if c == ch), None)
            new.append(dist[0][1] if dist[0][1] != ch and cur is not None and dist[0][0] < 0.6 * cur else ch)
        it = iter(new)
        t = re.sub(r'\d', lambda m: next(it), r['lead_time'])
        if t != r['lead_time'] and plausible(t):
            r['lead_time'] = t

def lead_range(t):
    t = t.lstrip('~')
    m = re.fullmatch(r'(\d+)\s*-\s*(\d+)\+?', t) or re.fullmatch(r'(\d+)\+?', t)
    if not m:
        return None, None
    lo = int(m.group(1)); hi = int(m.group(2)) if m.lastindex == 2 else lo
    return lo, hi


def main(pdf, out):
    import pdfplumber
    with pdfplumber.open(pdf) as doc:
        cats = []
        for p in doc.pages:
            t = p.extract_text() or ''
            m = re.search(r'FutureElectronics\.com\s+(.+)$', t.strip())
            cats.append(m.group(1).strip() if m else '')
        first = doc.pages[0].extract_text() or ''
    month = re.search(r'([A-Z][a-z]+ \d{4})', first).group(1)
    updated = re.search(r'Last updated on ([A-Z][a-z]+ \d{1,2})(?:st|nd|rd|th)? (\d{4})', first)
    rows = []
    for i, cat in enumerate(cats, 1):
        if i == 1 or not cat:
            continue
        rows += parse_page(render(pdf, i), cat, i)
    refine_leads(rows)
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['report_month', 'updated', 'category', 'manufacturer', 'product', 'lead_time_weeks', 'lead_min', 'lead_max', 'trend', 'pricing', 'page'])
        for r in rows:
            lo, hi = lead_range(r['lead_time'])
            w.writerow([month, ' '.join(updated.groups()) if updated else '', r['category'], r['manufacturer'], r['product'], r['lead_time'], lo or '', hi or '', r['trend'], r['pricing'], r['page']])
    print(month, len(rows), 'rows →', out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
