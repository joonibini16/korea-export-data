"""Japan export collector: MOF trade statistics via e-Stat API (品別国別表 輸出).

Statistics: 貿易統計 (statsCode 00350300), table family "貿易統計_全国分 品別国別表 輸出".
Each table holds whole years with 12 monthly amount columns (unit 千円) by 9-digit
item and country. Items in japan_items.json are summed by HS prefix; countries are
kept for KR/CN/TW/US/VN, everything else is "OTHER", and WORLD is the sum of all.
USD amounts use FRED EXJPUS monthly average (JPY per USD); left blank if unavailable.
Requires ESTAT_APP_ID. Nothing is interpolated; unpublished months are absent.
"""
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
API = 'https://api.e-stat.go.jp/rest/3.0/app/json/'
FAMILY = '貿易統計_全国分 品別国別表 輸出'
OUT = Path('japan_exports.csv')
STATUS = Path('japan_exports_status.json')
ITEMS = Path('japan_items.json')
FX_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXJPUS'
FIELDS = ['month', 'item', 'country', 'amount_kJPY', 'amount_USD', 'jpy_per_usd', 'stats_data_id', 'retrieved_at']


def api(endpoint, **params):
    params['appId'] = os.environ['ESTAT_APP_ID']
    url = API + endpoint + '?' + urllib.parse.urlencode(params)
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'{endpoint} failed: {last}')


def as_list(x):
    return x if isinstance(x, list) else ([] if x is None else [x])


def tables():
    d = api('getStatsList', statsCode='00350300', searchWord='品別国別表 輸出', limit=300)
    out = []
    for t in as_list(d['GET_STATS_LIST'].get('DATALIST_INF', {}).get('TABLE_INF')):
        name = t.get('STATISTICS_NAME')
        if isinstance(name, dict):
            name = name.get('$')
        if (name or '').strip() == FAMILY:
            out.append(t['@id'])
    if not out:
        raise RuntimeError('no 品別国別表 輸出 tables found')
    return sorted(out)


def meta(sid):
    d = api('getMetaInfo', statsDataId=sid)
    objs = {o['@id']: as_list(o['CLASS']) for o in as_list(d['GET_META_INFO']['METADATA_INF']['CLASS_INF']['CLASS_OBJ'])}
    months = {}
    for c in objs.get('cat02', []):
        m = re.fullmatch(r'(\d{1,2})月_金額', c.get('@name', ''))
        if m:
            months[c['@code']] = int(m.group(1))
    years = {c['@code']: int(c['@code'][:4]) for c in objs.get('time', [])}
    areas = {c['@code']: c.get('@name', '') for c in objs.get('area', [])}
    items = [c['@code'] for c in objs.get('cat01', [])]
    return {'months': months, 'years': years, 'areas': areas, 'items': items}


def fx_rates():
    try:
        with urllib.request.urlopen(FX_URL, timeout=60) as r:
            text = r.read().decode('utf-8')
        rates = {}
        for row in list(csv.reader(text.splitlines()))[1:]:
            if len(row) == 2 and row[1] not in ('', '.'):
                rates[row[0][:4] + '.' + row[0][5:7]] = float(row[1])
        return rates
    except Exception as e:
        print('FX unavailable:', e, file=sys.stderr)
        return {}


def main():
    if not os.environ.get('ESTAT_APP_ID'):
        print('ESTAT_APP_ID missing', file=sys.stderr)
        sys.exit(2)
    cfg = json.loads(ITEMS.read_text(encoding='utf-8'))
    start = int(cfg.get('start_year', 2015))
    stamp = datetime.now(KST).strftime('%Y-%m-%dT%H:%M:%S%z')

    # choose, for every year, the newest table that contains it
    metas, year_table = {}, {}
    for sid in tables():
        m = meta(sid)
        if not any(y >= start for y in m['years'].values()):
            continue
        metas[sid] = m
        for code, y in m['years'].items():
            if y >= start and (y not in year_table or sid > year_table[y][0]):
                year_table[y] = (sid, code)
        time.sleep(0.5)

    agg = defaultdict(float)
    seen = set()
    failures = []
    for sid in sorted({s for s, _ in year_table.values()}):
        m = metas[sid]
        tcodes = [c for y, (s, c) in year_table.items() if s == sid]
        area_key = {}
        for code, name in m['areas'].items():
            area_key[code] = next((c['key'] for c in cfg['countries'] if c['match'] in name), 'OTHER')
        for it in cfg['items']:
            codes = [c for c in m['items'] if any(c.startswith(p) for p in it['prefixes'])]
            if not codes:
                failures.append({'table': sid, 'item': it['key'], 'error': 'NO_ITEM_CODES'})
                continue
            pos = 1
            while True:
                try:
                    d = api('getStatsData', statsDataId=sid, cdCat01=','.join(codes),
                            cdCat02=','.join(m['months']), cdTime=','.join(tcodes),
                            startPosition=pos, limit=100000, metaGetFlg='N', cntGetFlg='N')
                except RuntimeError as e:
                    failures.append({'table': sid, 'item': it['key'], 'error': str(e)[:200]})
                    break
                res = d['GET_STATS_DATA']
                if res['RESULT']['STATUS'] not in (0, 1):
                    failures.append({'table': sid, 'item': it['key'], 'error': res['RESULT']['ERROR_MSG']})
                    break
                sd = res.get('STATISTICAL_DATA', {})
                for v in as_list(sd.get('DATA_INF', {}).get('VALUE')):
                    raw = (v.get('$') or '').replace(',', '')
                    if not re.fullmatch(r'-?\d+(\.\d+)?', raw):
                        continue
                    month = f"{m['years'][v['@time']]}.{m['months'][v['@cat02']]:02d}"
                    amount = float(raw)
                    country = area_key.get(v.get('@area'), 'OTHER')
                    agg[(month, it['key'], country)] += amount
                    agg[(month, it['key'], 'WORLD')] += amount
                    seen.add((month, it['key']))
                nxt = sd.get('RESULT_INF', {}).get('NEXT_KEY')
                if not nxt:
                    break
                pos = int(nxt)
                time.sleep(0.5)
            time.sleep(0.5)

    # a month counts as published only if several items have positive world totals
    per_month = defaultdict(int)
    for (month, item, country), v in agg.items():
        if country == 'WORLD' and v > 0:
            per_month[month] += 1
    published = {mo for mo, n in per_month.items() if n >= max(2, len(cfg['items']) // 2)}

    fx = fx_rates()
    rows = []
    year_sid = {y: s for y, (s, _) in year_table.items()}
    for (month, item, country), v in sorted(agg.items()):
        if month not in published:
            continue
        rate = fx.get(month)
        rows.append({'month': month, 'item': item, 'country': country, 'amount_kJPY': f'{v:.0f}',
                     'amount_USD': f'{v * 1000 / rate:.0f}' if rate else '', 'jpy_per_usd': f'{rate:.4f}' if rate else '',
                     'stats_data_id': year_sid[int(month[:4])], 'retrieved_at': stamp})
    if not rows:
        print('no rows collected; existing data retained', file=sys.stderr)
        STATUS.write_text(json.dumps({'updated_at': stamp, 'failures': failures or [{'error': 'NO_ROWS'}]}, ensure_ascii=False, indent=1), encoding='utf-8')
        sys.exit(1)
    with OUT.open('w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    months = sorted(published)
    STATUS.write_text(json.dumps({
        'updated_at': stamp, 'range': [months[0], months[-1]],
        'tables': {str(y): s for y, s in sorted(year_sid.items())},
        'fx_source': FX_URL if fx else None, 'fx_last': max(fx) if fx else None,
        'failures': failures}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'rows={len(rows)} months={months[0]}~{months[-1]} failures={len(failures)}')
    if failures:
        sys.exit(1)


if __name__ == '__main__':
    main()
