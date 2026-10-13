"""기록 보존 검사: 누적 파일에서 '오늘 이전' 행이 하나라도 사라지거나 바뀌면 실패합니다.

사용: python tools/check_history.py 파일:날짜칸 [파일:날짜칸 ...]
마지막 커밋(HEAD) 버전과 비교합니다. 오늘 날짜 행은 같은 날 재실행으로 갱신될 수 있어 검사에서 제외합니다.
"""
import csv, io, subprocess, sys
from datetime import datetime, timedelta, timezone

today = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')
bad = 0
for arg in sys.argv[1:]:
    path, col = arg.split(':')
    try:
        old_txt = subprocess.run(['git', 'show', f'HEAD:{path}'], capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        print(path, 'new file'); continue
    def rows(t):
        r = list(csv.reader(io.StringIO(t.lstrip('﻿'))))
        if not r: return set(), None
        h = r[0]; i = h.index(col)
        # 열이 뒤에 추가된 경우(예: snapshot_time)를 고려해 공통 열만 비교
        return {tuple(x) for x in r[1:] if x and len(x) > i and x[i][:10] < today}, h
    old, oh = rows(old_txt)
    new, nh = rows(open(path, encoding='utf-8-sig').read())
    common = [c for c in oh if c in nh]
    proj = lambda rs, h: {tuple(x[h.index(c)] if h.index(c) < len(x) else '' for c in common) for x in rs}
    missing = proj(old, oh) - proj(new, nh)
    print(f'{path}: 이전 행 {len(old)} · 사라지거나 바뀐 행 {len(missing)}')
    if missing:
        bad += 1
        for m in list(missing)[:3]: print('   ', m[:8])
sys.exit(1 if bad else 0)
