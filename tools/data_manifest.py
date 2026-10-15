"""데이터 파일별 '기준일'(데이터 안의 마지막 날짜)과 '수집'(마지막 갱신 커밋 시각) → data_updated.json.

화면 제목 옆에 '기준일 2026-10-15 · 수집 2026-10-15 15:55' 형식으로 표시하는 데 씁니다.
기준일 추정: JSON 최상위 asof/as_of/기준일 키 → CSV 날짜 열(date·period·month 등)의 최댓값 → 본문 날짜 패턴의 최댓값.
미래 날짜(만기일·예측 분기 등)는 제외합니다.
"""
import csv, datetime as dt, io, json, pathlib, re, subprocess

KST = dt.timezone(dt.timedelta(hours=9))
now = dt.datetime.now(KST)
today = now.date().isoformat()
this_month = today[:7]
files = [f for f in subprocess.run(['git', 'ls-files', '*.csv', '*.json'], capture_output=True, text=True).stdout.split()
         if '/' not in f and f != 'data_updated.json']
want = set(files); seen = {}
log = subprocess.run(['git', 'log', '--format=@@%cI', '--name-only', '--', *files], capture_output=True, text=True).stdout
cur = None
for line in log.splitlines():
    if line.startswith('@@'):
        cur = line[2:]
    elif line in want and line not in seen:
        seen[line] = cur
        if len(seen) == len(want):
            break

D_FULL = re.compile(r'(?<!\d)(20\d\d)[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\d|3[01])(?!\d)')
D_MON = re.compile(r'(?<!\d)(20\d\d)[-./]?(0[1-9]|1[0-2])(?![\d.\-/])')
DATE_COLS = ('date', 'trade_date', 'tradedate', 'period', 'month', 'ym', 'yyyymm', 'base_date', 'asof', 'as_of', '기준일', '날짜', '일자', '월')


def norm(v):
    v = str(v).strip()
    m = D_FULL.search(v)
    if m:
        d = f'{m.group(1)}-{m.group(2)}-{m.group(3)}'
        return d if d <= today else None
    m = D_MON.search(v)
    if m:
        d = f'{m.group(1)}-{m.group(2)}'
        return d if d <= this_month else None
    return None


def best(vals):
    vals = [v for v in vals if v]
    if not vals:
        return None
    full = [v for v in vals if len(v) == 10]
    mon = [v for v in vals if len(v) == 7]
    mf, mm = (max(full) if full else None), (max(mon) if mon else None)
    if mf and (not mm or mf[:7] >= mm):
        return mf
    return mm


def asof(path):
    try:
        txt = pathlib.Path(path).read_text(encoding='utf-8-sig', errors='replace')
    except Exception:
        return None
    if path.endswith('.json'):
        try:
            j = json.loads(txt)
            if isinstance(j, dict):
                for k in ('asof', 'as_of', 'asOf', '기준일', 'base_date', 'latest_date', 'data_date'):
                    if k in j and norm(j[k]):
                        return norm(j[k])
        except Exception:
            pass
        # 갱신 시각 키(updated 등)는 제외하고 본문 날짜 사용
        txt = re.sub(r'"(updated|updated_at|generated|collected|fetched)[^"]*"\s*:\s*"[^"]*"', '', txt)
        return best(norm(m.group(0)) for m in D_FULL.finditer(txt)) or best(norm(m.group(0)) for m in D_MON.finditer(txt))
    rows = list(csv.reader(io.StringIO(txt)))
    if not rows:
        return None
    head = [h.strip().lower() for h in rows[0]]
    idx = [i for i, h in enumerate(head) if h in DATE_COLS or h.endswith('_date') or h.endswith('date')]
    if idx:
        v = best(norm(r[i]) for r in rows[1:] for i in idx if i < len(r))
        if v:
            return v
    return best(norm(m.group(0)) for m in D_FULL.finditer(txt)) or best(norm(m.group(0)) for m in D_MON.finditer(txt))


out = {'files': {}}
for f, t in sorted(seen.items()):
    out['files'][f] = {'c': dt.datetime.fromisoformat(t).astimezone(KST).isoformat(timespec='minutes'), 'a': asof(f)}
pathlib.Path('data_updated.json').write_text(json.dumps(out, ensure_ascii=False, indent=0))
print(len(out['files']), 'files')
