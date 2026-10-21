"""KRX foreign/institution net flow oscillator, based on the supplied workbook formula.

The uploaded workbook is only a calculation reference. The published observations
come exclusively from the repository's independently collected KRX daily files.
"""
import csv
import datetime as dt
import gzip
import json
from collections import defaultdict
from pathlib import Path

FOREIGN = Path('foreign_buy_days')
INVEST = Path('invest_days')
# 수급 기준: all = 외국인 + 기관 합계(KRX 7050: 금융투자·보험·투신·사모·은행·기타금융·연기금 등)
#           core = 외국인 + 투신 + 사모 + 연기금 등(금융투자·보험·은행 등 제외)
BASES = {
    'all': dict(keys=('I',), inst_label='기관 합계', output='flow_oscillator.json', stock_output='flow_stocks.json', stock_limit=1400,
                title='외국인 + 기관 합계', source='KRX 정보데이터시스템 외국인·기관합계 거래실적 및 전종목 시가총액; KIND 업종→증권사식 업종 매핑'),
    'core': dict(keys=('T', 'P', 'N'), inst_label='투신·사모·연기금', output='flow_oscillator_core.json', stock_output='flow_stocks_core.json', stock_limit=700,
                 title='외국인 + 투신·사모·연기금', source='KRX 정보데이터시스템 외국인·투신·사모·연기금 등 거래실적 및 전종목 시가총액; KIND 업종→증권사식 업종 매핑'),
}
INSTITUTION = INVEST / 'I'
SECTOR_FILE = Path('sector_group_map.csv')
CATALOG_FILE = Path('market_sector_catalog.csv')
OUTPUT = Path('flow_oscillator.json')
STOCK_OUTPUT = Path('flow_stocks.json')


def load(path):
    with gzip.open(path, 'rt', encoding='utf-8') as f:
        return json.load(f)


def ema(values, period):
    out = []
    alpha = 2 / (period + 1)
    for v in values:
        out.append(v if not out else v * alpha + out[-1] * (1 - alpha))
    return out


def oscillator(points):
    rates = [p['net_eok'] / p['cap_eok'] * 100 for p in points]
    fast, slow = ema(rates, 12), ema(rates, 26)
    macd = [a-b for a,b in zip(fast, slow)]
    signal = ema(macd, 9)
    return [[p['date'], round(r, 5), round(m, 5), round(s, 5), round(m-s, 5),
             round(p['foreign_eok'], 1), round(p['institution_eok'], 1), round(p['cap_eok']), p['n']]
            + ([p['close_krw']] if 'close_krw' in p else [])
            for p,r,m,s in zip(points, rates, macd, signal)]


def build(basis='all'):
    cfg = BASES[basis]
    OUTPUT, STOCK_OUTPUT = Path(cfg['output']), Path(cfg['stock_output'])
    fdays = {p.name[:10] for p in FOREIGN.glob('*.json.gz')}
    idays = set.intersection(*[{p.name[:10] for p in (INVEST / k).glob('*.json.gz')} for k in cfg['keys']])
    days = sorted(fdays & idays)
    if len(days) < 30:
        raise ValueError(f'오실레이터 계산에 필요한 공통 거래일 부족: {len(days)}')
    latest = days[-1]
    raw = {}
    for day in days:
        f = load(FOREIGN / f'{day}.json.gz')
        parts = [load(INVEST / k / f'{day}.json.gz') for k in cfg['keys']]
        if not all(f.get(m) and all(i.get(m) for i in parts) for m in ('KOSPI', 'KOSDAQ')):
            continue
        raw[day] = {}
        for market in ('KOSPI', 'KOSDAQ'):
            inst = defaultdict(float)
            for i in parts:
                for r in i[market]:
                    inst[r[0]] += (r[1]-r[2]) / 1e8
            for code, name, buy, sell, cap, close, change, val in f[market]:
                if cap > 0:
                    raw[day][code] = (market, name, cap / 1e8, (buy-sell) / 1e8, inst.get(code, 0),
                                      close if isinstance(close, (int, float)) and close > 0 else None)
    days = sorted(raw)
    if len(days) < 30 or days[-1] != latest:
        raise ValueError('최신일 또는 30거래일 자료가 불완전함')
    current = raw[latest]
    ranks = sorted(current, key=lambda code: -current[code][2])
    top = set(ranks[:700]); next_700 = set(ranks[700:1400])
    sector_map = {}
    with SECTOR_FILE.open(encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            sector_map[r['KIND업종']] = r['중분류'] or r['대분류']
    sectors = {}
    with CATALOG_FILE.open(encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            if r['code'] in current and r['market'] == current[r['code']][0]:
                sectors[r['code']] = sector_map.get(r['sector'], '기타')
    # KIND's legal-manufacturer category puts Samsung Electronics in telecom
    # equipment, while the broad broker sector grouping used by this dashboard
    # tracks its share as a semiconductor name.
    if '005930' in current:
        sectors['005930'] = '반도체와반도체장비'
    for code in current:
        common = code[:-1] + '0'
        if code not in sectors and code.endswith('5') and common in sectors:
            sectors[code] = sectors[common]
    groups = {'top700': ('시가총액 상위 700', top), 'next700': ('시가총액 701~1400', next_700),
              'KOSPI': ('코스피 전체', {c for c in current if current[c][0] == 'KOSPI'}),
              'KOSDAQ': ('코스닥 전체', {c for c in current if current[c][0] == 'KOSDAQ'})}
    for sector in sorted(set(sectors.values())):
        groups['sector:'+sector] = (sector, {c for c,s in sectors.items() if s == sector})
    series = {}
    for key, (name, codes) in groups.items():
        points = []
        for day in days:
            obs = [raw[day][c] for c in codes if c in raw[day]]
            cap = sum(x[2] for x in obs)
            if cap <= 0:
                continue
            points.append({'date':day, 'foreign_eok':sum(x[3] for x in obs),
                           'institution_eok':sum(x[4] for x in obs), 'net_eok':sum(x[3]+x[4] for x in obs),
                           'cap_eok':cap, 'n':len(obs)})
        if len(points) >= 30:
            series[key] = {'name':name, 'universe':len(codes), 'rows':oscillator(points)}
    result = {'asof':latest, 'updated_at':dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec='seconds'),
              'basis':basis, 'basis_title':cfg['title'], 'institution_label':cfg['inst_label'],
              'source':cfg['source'],
              'columns':['date','net_cap_pct','macd','signal','oscillator','foreign_net_eok','institution_net_eok','cap_eok','observed_stocks'],
              'definition':f"({cfg['title']}) 순매수/당일 시총 ×100 → EMA12−EMA26 → EMA9 신호선 → 차이",
              'membership':'최신일 시총 순위와 현재 업종 구성을 과거 전체에 고정; 신규·상폐·종목별 누락은 해당 거래일 집계에서 제외',
              'groups':series}
    stocks = {}
    for rank, code in enumerate(ranks[:cfg['stock_limit']], 1):
        points = []
        for day in days:
            if code not in raw[day]:
                continue
            market, name, cap, foreign, institution, close = raw[day][code]
            points.append({'date':day,'foreign_eok':foreign,'institution_eok':institution,
                           'net_eok':foreign+institution,'cap_eok':cap,'n':1,'close_krw':close})
        if len(points) >= 30:
            market, name, *_ = current[code]
            stocks[code] = {'name':name,'market':market,'sector':sectors.get(code,'기타'),
                            'rank':rank,'rows':oscillator(points)}
    stock_result = {'asof':latest,'columns':result['columns']+['close_krw'],'stocks':stocks}
    if OUTPUT.exists() and STOCK_OUTPUT.exists():
        try:
            old = json.loads(OUTPUT.read_text(encoding='utf-8'))
            if old.get('asof') == latest and old.get('groups') == result['groups']:
                result['updated_at'] = old['updated_at']
        except (ValueError, KeyError):
            pass
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    STOCK_OUTPUT.write_text(json.dumps(stock_result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('flow oscillator',basis+':',latest,'days',len(days),'groups',len(series),'stocks',len(stocks),'bytes',OUTPUT.stat().st_size,STOCK_OUTPUT.stat().st_size)
    return result


if __name__ == '__main__':
    build('all')
    try:
        build('core')
    except (ValueError, FileNotFoundError, TypeError) as e:
        # 연기금 등 일별 자료가 30거래일 이상 쌓이기 전에는 core 기준을 건너뜀
        print('flow oscillator core: 건너뜀 -', e)
