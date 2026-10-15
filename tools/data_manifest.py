"""데이터 파일별 마지막 갱신(커밋) 시각 목록 → data_updated.json (화면 제목 옆 '업데이트 시각' 표시용)."""
import json, subprocess, datetime as dt, pathlib
files = [f for f in subprocess.run(['git', 'ls-files', '*.csv', '*.json'], capture_output=True, text=True).stdout.split() if '/' not in f and f != 'data_updated.json']
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
KST = dt.timezone(dt.timedelta(hours=9))
out = {'files': {f: dt.datetime.fromisoformat(t).astimezone(KST).isoformat(timespec='minutes') for f, t in sorted(seen.items())}}
pathlib.Path('data_updated.json').write_text(json.dumps(out, ensure_ascii=False, indent=0))
print(len(out['files']), 'files')
