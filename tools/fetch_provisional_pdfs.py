"""관세청 '수출입 현황 [잠정치]' 발표문의 첨부 PDF를 내려받아 텍스트로 저장 (품목별 표 파싱용).

- 게시판(bbsId=1362) 목록을 넘기며 잠정치 발표(1~10일, 1~20일, 월 전체)를 찾고,
  아직 저장하지 않은 발표의 PDF를 받아 pdftotext -layout 결과를 provisional_text/{YYYY.MM}_{D10|D20|MONTH}.txt 로 저장.
- 원문 PDF 자체는 저장하지 않음(텍스트만).
"""
import json, pathlib, re, subprocess, sys, tempfile, time
from urllib.parse import urljoin, urlencode
import requests
from bs4 import BeautifulSoup

BASE = 'https://customs.go.kr'
LIST_URL = BASE + '/kcs/na/ntt/selectNttList.do'
H = {'User-Agent': 'Mozilla/5.0 (compatible; korea-export-data/1.0)'}
OUT = pathlib.Path('provisional_text'); OUT.mkdir(exist_ok=True)
MAX_PAGES = int(sys.argv[1]) if len(sys.argv) > 1 else 60


def key_of(title):
    m = re.search(r'(\d{4})년\s*(\d{1,2})월\s*1일\s*~\s*\d{1,2}월\s*(10|20)일\s*수출입\s*현황', title)
    if m:
        return f'{m.group(1)}.{int(m.group(2)):02d}', 'D10' if m.group(3) == '10' else 'D20'
    m = re.search(r'(\d{4})년\s*(\d{1,2})월\s*수출입\s*현황', title)
    if m and '잠정' in title:
        return f'{m.group(1)}.{int(m.group(2)):02d}', 'MONTH'
    return None


log = {'found': 0, 'saved': [], 'errors': [], 'pages': 0}
s = requests.Session()
empty = 0
for page in range(1, MAX_PAGES + 1):
    try:
        r = s.get(LIST_URL, params={'bbsId': '1362', 'mi': '2891', 'currPage': page}, headers=H, timeout=30)
        r.raise_for_status()
    except Exception as e:
        log['errors'].append(f'list {page}: {e}'); break
    soup = BeautifulSoup(r.text, 'html.parser')
    links = soup.select('a.nttInfoBtn[data-id]') or [a for a in soup.find_all('a') if a.get('data-id')]
    log['pages'] = page
    if not links:
        empty += 1
        if empty >= 2:
            break
        continue
    for a in links:
        title = ' '.join((a.get('title') or a.get_text(' ', strip=True)).split())
        if '잠정치' not in title:
            continue
        k = key_of(title)
        if not k:
            continue
        log['found'] += 1
        f = OUT / f'{k[0]}_{k[1]}.txt'
        if f.exists() and f.stat().st_size > 2000:
            continue
        q = {'bbsId': '1362', 'mi': '2891', 'nttSn': a['data-id']}
        if a.get('data-url'):
            q['nttSnUrl'] = a['data-url']
        url = BASE + '/kcs/na/ntt/selectNttInfo.do?' + urlencode(q)
        try:
            d = s.get(url, headers=H, timeout=30); d.raise_for_status()
            ds = BeautifulSoup(d.text, 'html.parser')
            pdf = None
            for x in ds.find_all('a', href=True):
                if 'nttFileDownload' in x['href'] and '.pdf' in x.get_text(' ', strip=True).lower():
                    pdf = urljoin(BASE, x['href']); break
            if not pdf:
                log['errors'].append(f'{k}: PDF 첨부 없음'); continue
            b = s.get(pdf, headers=H | {'Referer': url}, timeout=60); b.raise_for_status()
            with tempfile.NamedTemporaryFile(suffix='.pdf') as tf:
                tf.write(b.content); tf.flush()
                txt = subprocess.run(['pdftotext', '-layout', tf.name, '-'], capture_output=True, text=True).stdout
            f.write_text(f'# {title}\n# {url}\n' + txt, encoding='utf-8')
            log['saved'].append(f.name)
            time.sleep(0.5)
        except Exception as e:
            log['errors'].append(f'{k}: {e}')
pathlib.Path('provisional_text/_fetch_log.json').write_text(json.dumps(log, ensure_ascii=False, indent=1))
print(json.dumps({k: (v if k != 'saved' else len(v)) for k, v in log.items()}, ensure_ascii=False))
