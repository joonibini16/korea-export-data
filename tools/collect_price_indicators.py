"""가격 지표 일별 수집 (GitHub Actions에서 실행).

- OpenRouter: 일별 전체 토큰(rankings/models?view=day 전 모델 합) · 모델 가격(api/v1/models)으로 추정 지출액과 가중평균 단가
- GPU 임대: Vast.ai 현재 대여 가능 on-demand 매물의 GPU 1장당 시간당 가격 중앙값 · RunPod 공시가(Secure/Community)
- DRAM: DRAMeXchange 첫 화면 현물가(DDR5 RDIMM 32GB 모듈, DDR5 UDIMM 16GB 모듈, DDR5 16Gb 칩)

결과는 price_indicators_log.csv(date,series,value,unit,source)에 날짜·계열별로 덮어쓰기/추가하며 과거 행은 지우지 않습니다.
"""
import csv, datetime as dt, html, json, math, pathlib, re, statistics as st, sys, urllib.parse, urllib.request

LOG = pathlib.Path('price_indicators_log.csv')
UA = {'User-Agent': 'Mozilla/5.0 (compatible; korea-export-data/1.0; +https://joonibini16.github.io/korea-export-data/)'}


def get(url, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=UA | (headers or {}))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


rows = {}
if LOG.exists():
    for r in csv.DictReader(LOG.open(encoding='utf-8')):
        rows[(r['date'], r['series'])] = r


def put(date, series, value, unit, source):
    if value is None:
        return
    rows[(date, series)] = dict(date=date, series=series, value=f'{value:.6g}' if isinstance(value, float) else str(value), unit=unit, source=source)
    print('  ', date, series, rows[(date, series)]['value'], unit)


errors = []

# ---------- OpenRouter ----------
try:
    day = json.loads(get('https://openrouter.ai/api/frontend/v1/rankings/models?view=day'))['data']
    models = json.loads(get('https://openrouter.ai/api/v1/models'))['data']
    price = {}
    for m in models:
        p = m.get('pricing') or {}
        try:
            pi, po = float(p.get('prompt') or 0), float(p.get('completion') or 0)
        except ValueError:
            continue
        if pi < 0 or po < 0:
            continue
        for k in {m.get('id'), m.get('canonical_slug')} - {None}:
            price[k] = (pi, po)
    by_date = {}
    for r in day:
        d = r['date'][:10]
        t = by_date.setdefault(d, dict(tok=0, pt=0, ct=0, spend=0.0, priced_tok=0, n=0))
        pt, ct = int(r.get('total_prompt_tokens') or 0), int(r.get('total_completion_tokens') or 0)
        t['tok'] += pt + ct; t['pt'] += pt; t['ct'] += ct; t['n'] += 1
        slug = r.get('model_permaslug') or ''
        pr = price.get(slug) or price.get(re.sub(r'-\d{8}$', '', slug)) or price.get(r.get('variant_permaslug') or '')
        if pr:
            t['spend'] += pt * pr[0] + ct * pr[1]; t['priced_tok'] += pt + ct
    d = max(by_date, key=lambda k: by_date[k]['tok'])
    t = by_date[d]
    src = 'OpenRouter rankings(view=day) · api/v1/models 가격'
    put(d, 'or_tokens_t', t['tok'] / 1e12, '조 토큰', src)
    put(d, 'or_prompt_share', t['pt'] / t['tok'] * 100 if t['tok'] else None, '%', src)
    if t['priced_tok']:
        blended = t['spend'] / t['priced_tok'] * 1e6
        put(d, 'or_price_per_m', blended, 'USD/백만 토큰', src)
        put(d, 'or_spend_musd', t['spend'] / t['priced_tok'] * t['tok'] / 1e6, '백만 달러(추정)', src)
        put(d, 'or_priced_cover', t['priced_tok'] / t['tok'] * 100, '%', src)
    put(d, 'or_models', t['n'], '개', src)
except Exception as e:
    errors.append(f'openrouter: {e}')

today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()

# ---------- GPU: Vast.ai ----------
VAST = {'a100': ['A100 SXM4'], 'h100': ['H100 SXM'], 'h200': ['H200'], 'b200': ['B200'], 'rtx5090': ['RTX 5090']}

def valid_gpu_prices(offers):
    prices = []
    for offer in offers:
        try:
            cost, count = float(offer['dph_total']), float(offer['num_gpus'])
            if math.isfinite(cost) and math.isfinite(count) and cost > 0 and count > 0:
                prices.append(cost / count)
        except (KeyError, TypeError, ValueError):
            continue
    return prices

for key, names in VAST.items():
    try:
        q = {'gpu_name': {'in': names} if len(names) > 1 else {'eq': names[0]}, 'rentable': {'eq': True}, 'type': 'on-demand', 'limit': 1000}
        o = json.loads(get('https://console.vast.ai/api/v0/search/asks/?q=' + urllib.parse.quote(json.dumps(q, separators=(',', ':')))))['offers']
        pp = valid_gpu_prices(o)
        if pp:
            src = 'Vast.ai 대여 가능 on-demand 매물 GPU당 시간당 가격 중앙값'
            put(today, f'gpu_{key}_vast', st.median(pp), 'USD/GPU·시간', src)
            put(today, f'gpu_{key}_vast_n', len(pp), '매물 수', src)
        else:
            errors.append(f'vast {key}: 유효 매물 없음(기존값 보존)')
    except Exception as e:
        errors.append(f'vast {key}: {e}')

# ---------- GPU: RunPod ----------
try:
    body = json.dumps({'query': 'query{gpuTypes{id,displayName,securePrice,communityPrice}}'}).encode()
    g = json.loads(get('https://api.runpod.io/graphql', data=body, headers={'Content-Type': 'application/json'}))['data']['gpuTypes']
    RP = {'a100': 'A100 SXM', 'h100': 'H100 SXM', 'h200': 'H200', 'b200': 'B200', 'rtx5090': 'RTX 5090'}
    print('  runpod types:', [(x['id'], x['displayName']) for x in g if any(k in (x['displayName'] or '') for k in ('A100', 'H100', 'B200'))])
    for key, dn in RP.items():
        r = next((x for x in g if (x.get('displayName') or '') == dn), None)
        if r:
            put(today, f'gpu_{key}_runpod_secure', r.get('securePrice'), 'USD/GPU·시간', 'RunPod 공시가(Secure Cloud)')
            put(today, f'gpu_{key}_runpod_comm', r.get('communityPrice') or None, 'USD/GPU·시간', 'RunPod 공시가(Community Cloud)')
except Exception as e:
    errors.append(f'runpod: {e}')

# ---------- DRAM: DRAMeXchange ----------
MON = {m: i for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
try:
    h = get('https://www.dramexchange.com/')
    t = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', h)))

    def upd(label):
        m = re.search(label + r'\s*:?\s*([A-Z][a-z]{2})\.?\s*(\d{1,2})\s+(\d{4})', t)
        return dt.date(int(m.group(3)), MON[m.group(1)], int(m.group(2))).isoformat() if m else today

    def avg(item, after):
        seg = t[t.find(after):] if after in t else t
        m = re.search(re.escape(item) + r'\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)', seg)
        return float(m.group(5).replace(',', '')) if m else None
    dm, dc = upd('Module Spot Price Last Update'), upd('DRAM Spot Price Last Update')
    src = 'DRAMeXchange(TrendForce) 현물가 세션 평균'
    put(dm, 'ddr5_rdimm32_spot', avg('DDR5 RDIMM 32GB 4800/5600', 'Module Spot Price Last Update'), 'USD/모듈', src)
    put(dm, 'ddr5_udimm16_spot', avg('DDR5 UDIMM 16GB 4800/5600', 'Module Spot Price Last Update'), 'USD/모듈', src)
    put(dc, 'ddr5_16gb_chip_spot', avg('DDR5 16Gb (2Gx8) 4800/5600', 'DRAM Spot Price Last Update'), 'USD/칩', src)
    put(dc, 'ddr4_16gb_chip_spot', avg('DDR4 16Gb (2Gx8) 3200', 'DRAM Spot Price Last Update'), 'USD/칩', src)
except Exception as e:
    errors.append(f'dramexchange: {e}')

out = sorted(rows.values(), key=lambda r: (r['date'], r['series']))
with LOG.open('w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['date', 'series', 'value', 'unit', 'source'], lineterminator='\n')
    w.writeheader(); w.writerows(out)
pathlib.Path('price_indicators_status.json').write_text(json.dumps(dict(updated=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), rows=len(out), errors=errors), ensure_ascii=False, indent=1))
print('rows', len(out), 'errors', errors)
if len(errors) >= 4:
    sys.exit(1)

