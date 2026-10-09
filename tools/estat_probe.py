"""Probe e-Stat trade tables (diagnostic only)."""
import json, os, sys, urllib.parse, urllib.request
KEY = os.environ['ESTAT_APP_ID']
B = 'https://api.e-stat.go.jp/rest/3.0/app/json/'
def get(ep, **p):
    p['appId'] = KEY
    with urllib.request.urlopen(B + ep + '?' + urllib.parse.urlencode(p), timeout=60) as r:
        return json.load(r)
mode = sys.argv[1] if len(sys.argv) > 1 else 'list'
if mode == 'list':
    for word in sys.argv[2:] or ['輸出 品別国別']:
        d = get('getStatsList', statsCode='00350300', searchWord=word, limit=60)
        res = d['GET_STATS_LIST']
        print('==', word, res['RESULT'], res.get('DATALIST_INF', {}).get('NUMBER'))
        tabs = res.get('DATALIST_INF', {}).get('TABLE_INF', [])
        tabs = tabs if isinstance(tabs, list) else [tabs]
        for t in tabs:
            title = t.get('TITLE'); title = title.get('$') if isinstance(title, dict) else title
            print(t['@id'], '|', t.get('STATISTICS_NAME'), '|', title, '|', t.get('CYCLE'), '|', t.get('SURVEY_DATE'), '|', t.get('OVERALL_TOTAL_NUMBER'))
elif mode == 'meta':
    d = get('getMetaInfo', statsDataId=sys.argv[2])
    objs = d['GET_META_INFO']['METADATA_INF']['CLASS_INF']['CLASS_OBJ']
    for o in objs:
        cl = o['CLASS'] if isinstance(o['CLASS'], list) else [o['CLASS']]
        print('##', o['@id'], o['@name'], len(cl))
        for c in cl[:12]: print('  ', c.get('@code'), c.get('@name'), c.get('@level',''))
        hits = [c for c in cl if any(k in c.get('@code','') for k in sys.argv[3:])]
        for c in hits[:20]: print('  hit', c.get('@code'), c.get('@name'))
elif mode == 'data':
    p = dict(x.split('=', 1) for x in sys.argv[3:])
    d = get('getStatsData', statsDataId=sys.argv[2], limit=40, **p)
    print(json.dumps(d['GET_STATS_DATA']['RESULT'], ensure_ascii=False))
    v = d['GET_STATS_DATA'].get('STATISTICAL_DATA', {}).get('DATA_INF', {}).get('VALUE', [])
    for x in (v if isinstance(v, list) else [v])[:40]: print(x)
