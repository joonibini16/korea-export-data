"""Shared request, validation and safe-file helpers for Customs collectors."""
import csv
import io
import os
import random
import re
import tempfile
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests


class CollectionError(Exception):
    pass


class StopCollection(CollectionError):
    """Do not issue further requests during this collector run."""


def number(value):
    try:
        value = Decimal(str(value).strip().replace(',', ''))
        if not value.is_finite() or value < 0:
            raise ValueError
        return int(value) if value == value.to_integral_value() else float(value)
    except (InvalidOperation, ValueError, TypeError):
        raise CollectionError('필수 수치 누락 또는 잘못된 수치') from None


def next_month(month):
    year, mon = int(month[:4]), int(month[4:])
    return f'{year + (mon == 12):04d}{1 if mon == 12 else mon + 1:02d}'


def prev_month(month):
    year, mon = int(month[:4]), int(month[4:])
    return f'{year - (mon == 1):04d}{12 if mon == 1 else mon - 1:02d}'


def month_range(start, end):
    for month in (start, end):
        if not re.fullmatch(r'\d{4}(0[1-9]|1[0-2])', month):
            raise ValueError('월은 YYYYMM 형식이어야 합니다.')
    months = []
    while start <= end:
        months.append(start)
        start = next_month(start)
    return months


def label(month):
    return f'{month[:4]}.{month[4:]}'


def end_month():
    return prev_month(datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y%m'))


def build_ranges(existing_months, end=None):
    end = end or end_month()
    recent = {end, prev_month(end), prev_month(prev_month(end))}
    targets = [m for m in month_range('202001', end)
               if m in recent or label(m) not in existing_months]
    groups = []
    for month in targets:
        # Never combine missing years into a multi-year request.
        if groups and next_month(groups[-1][1]) == month and groups[-1][0][:4] == month[:4]:
            groups[-1] = (groups[-1][0], month)
        else:
            groups.append((month, month))
    # Recent data first; historical gaps are recovered in subsequent ranges/runs.
    return sorted(groups, key=lambda pair: pair[1], reverse=True)


def read_csv(path):
    if not Path(path).exists():
        return []
    with open(path, encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream))


def read_hs_codes():
    # The existing two-column file has legacy unquoted commas in item names.
    # Accept those without rewriting the user's configuration CSV.
    with open('hs_codes.csv', encoding='utf-8-sig', newline='') as stream:
        reader = csv.reader(stream)
        if next(reader, None) != ['hs_code', 'name']:
            raise CollectionError('hs_codes.csv 헤더는 hs_code,name이어야 합니다.')
        rows = list(reader)
    items, seen = [], set()
    for row in rows:
        if not row:
            continue
        code = row[0].strip()
        name = ','.join(row[1:]).strip()
        if not re.fullmatch(r'\d{2}|\d{4}|\d{6}|\d{10}', code) or not name:
            raise CollectionError('hs_codes.csv 형식 오류: HS코드와 품목명을 확인하세요.')
        if code in seen:
            raise CollectionError(f'중복 HS코드: {code}')
        seen.add(code)
        items.append({'hs_code': code, 'name': name})
    if not items:
        raise CollectionError('hs_codes.csv에 품목이 없습니다.')
    # Refresh previously collected items before the large initial backfill.
    return sorted(items, key=lambda item: not Path(f"export_{item['hs_code']}.csv").exists())


def atomic_csv(path, fields, rows, *, allow_empty=False):
    """Write a complete temp file then replace; never erase data with an empty list."""
    rows = list(rows)
    if not rows and not allow_empty:
        return False
    buffer = io.StringIO(newline='')
    writer = csv.DictWriter(buffer, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    payload = buffer.getvalue().encode('utf-8-sig')
    path = Path(path)
    if path.exists() and path.read_bytes() == payload:
        return False
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f'.{path.name}.', delete=False) as stream:
            temp_path = Path(stream.name)
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_path, path)
        return True
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def aggregate_csv(pattern, destination, fields, keys):
    # Preserve aggregate-only historical rows if a per-item file is missing.
    combined = {tuple(row[key] for key in keys): row for row in read_csv(destination)}
    for path in sorted(Path('.').glob(pattern)):
        if path.name == destination:
            continue
        for row in read_csv(path):
            combined[tuple(row[key] for key in keys)] = row
    rows = sorted(combined.values(), key=lambda row: tuple(row[key] for key in keys))
    atomic_csv(destination, fields, rows)
    return rows


def save_latest(path, fields, rows):
    if rows:
        month = max(row['월'] for row in rows)
        atomic_csv(path, fields, [row for row in rows if row['월'] == month])


def retry_after(value):
    if not value:
        return 0
    try:
        return max(0, float(value))
    except ValueError:
        try:
            when = parsedate_to_datetime(value)
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            return max(0, (when - datetime.now(timezone.utc)).total_seconds())
        except (ValueError, TypeError, OverflowError):
            return 0


class CustomsClient:
    def __init__(self, api_key=None, session=None, sleep=time.sleep):
        self.api_key = (api_key or os.environ.get('CUSTOMS_API_KEY', '')).strip()
        if not self.api_key:
            raise StopCollection('API 인증키 CUSTOMS_API_KEY가 없습니다.')
        self.session = session or requests.Session()
        self.sleep = sleep
        self.interval = max(1.0, float(os.environ.get('CUSTOMS_REQUEST_INTERVAL', '3')))
        self.max_requests = max(1, int(os.environ.get('CUSTOMS_MAX_REQUESTS', '200')))
        self.count = 0
        self.stopped = None

    def stop(self, reason):
        self.stopped = reason
        raise StopCollection(reason)

    def _get(self, url, params):
        if self.stopped:
            raise StopCollection(self.stopped)
        for attempt in range(1, 4):
            if self.count >= self.max_requests:
                self.stop(f'실행당 호출 상한 {self.max_requests}회 도달; 나머지는 다음 실행에서 수집')
            if self.count:
                self.sleep(self.interval)
            self.count += 1
            print(f'  요청 {self.count}/{self.max_requests}, 시도 {attempt}/3', flush=True)
            wait_hint = 0
            try:
                response = self.session.get(url, params=params, timeout=(15, 60))
            except requests.exceptions.RequestException as exc:
                # Exception text can contain a URL and serviceKey; never log it.
                reason = f'네트워크 오류 ({type(exc).__name__})'
            else:
                status = response.status_code
                if status == 429 or status in (408, 500, 502, 503, 504):
                    reason = f'HTTP {status}'
                    wait_hint = retry_after(response.headers.get('Retry-After'))
                elif status != 200:
                    self.stop(f'HTTP {status}; 추가 호출 중단')
                else:
                    try:
                        root = ET.fromstring(response.content)
                    except ET.ParseError:
                        reason = 'XML 파싱 오류'
                    else:
                        for node in root.iter():
                            node.tag = node.tag.split('}')[-1]
                        code = (root.findtext('.//resultCode') or root.findtext('.//returnReasonCode') or '').strip()
                        if code in ('00', '0', '000', 'NORMAL_SERVICE'):
                            return root
                        if code in ('22', '20', '21', '30', '31', '32'):
                            self.stop(f'API 오류 코드 {code}; 할당량 또는 인증/접근 설정 확인 필요')
                        if code == '03':
                            raise CollectionError('API 데이터 없음 (03); 기존 값 유지')
                        if code and code not in ('01', '02', '04', '05'):
                            raise CollectionError(f'API 오류 코드 {code}')
                        reason = f'API 오류 코드 {code}' if code else '정상 응답 코드 누락'
            print(f'  {reason}', flush=True)
            if attempt == 3:
                self.stop(f'{reason}: 3회 실패; 월별 재조회와 나머지 품목 호출 중단')
            if wait_hint > 300:
                self.stop(f'{reason}: Retry-After가 300초 초과; 다음 실행으로 보류')
            wait = max(wait_hint, 30 * 2 ** (attempt - 1) + random.uniform(0, 5))
            print(f'  {wait:.1f}초 대기 후 재시도', flush=True)
            self.sleep(wait)

    def records(self, url, hs_code, start, end, country=None):
        params = {'serviceKey': self.api_key, 'strtYymm': start, 'endYymm': end,
                  'hsSgn': hs_code, 'numOfRows': 10000, 'pageNo': 1}
        if country:
            params['cntyCd'] = country
        raw, fingerprints, total = [], set(), None
        while True:
            root = self._get(url, params)
            page = root.findall('.//item')
            count_text = root.findtext('.//totalCount')
            if count_text is not None:
                try:
                    current_total = int(count_text)
                    if current_total < 0:
                        raise ValueError
                except ValueError:
                    raise CollectionError('잘못된 totalCount') from None
                if total is not None and current_total != total:
                    raise CollectionError('페이지 간 totalCount 변경; 해당 구간 유지')
                total = current_total
            elif params['pageNo'] > 1:
                raise CollectionError('다음 페이지의 totalCount 누락')
            fingerprint = tuple(ET.tostring(item) for item in page)
            if page and fingerprint in fingerprints:
                raise CollectionError('같은 페이지 반복; 해당 구간 유지')
            fingerprints.add(fingerprint)
            raw.extend(page)
            if total is None:
                if len(page) >= params['numOfRows']:
                    raise CollectionError('응답이 페이지 한도에 도달했으나 totalCount가 없음')
                break
            if len(raw) > total:
                raise CollectionError('수신 행 수가 totalCount와 불일치')
            if len(raw) == total:
                break
            if not page:
                raise CollectionError('페이지 누락; 해당 구간 유지')
            params['pageNo'] += 1
        records, seen = [], set()
        for item in raw:
            month = (item.findtext('year') or '').strip()
            if month in ('총계', '합계'):
                continue
            if not re.fullmatch(r'\d{4}\.(0[1-9]|1[0-2])', month):
                raise CollectionError('예상하지 못한 월 형식; 해당 구간 유지')
            if not start <= month.replace('.', '') <= end:
                raise CollectionError('요청 범위 밖 월 수신; 해당 구간 유지')
            # Itemtrade returns hsCode; nitemtrade documents the field as hsCd.
            # Validate both if a response contains both names, rather than hiding
            # a conflicting code behind an alias fallback.
            code_fields = ('hsCd', 'hsCode') if country else ('hsCode',)
            codes = [(item.findtext(field) or '').strip() for field in code_fields]
            codes = [value for value in codes if value]
            if len(set(codes)) > 1:
                raise CollectionError('응답 HS코드 필드 간 불일치')
            code = codes[0] if codes else ''
            if not code or not code.startswith(hs_code):
                raise CollectionError('HS코드 누락 또는 요청 코드 불일치')
            returned_country = (item.findtext('cntyCd') or '').strip()
            if country and returned_country and returned_country != country:
                raise CollectionError('요청 국가코드 불일치')
            identity = (month, code)
            if identity in seen:
                raise CollectionError('중복 월·HS코드 행 수신; 해당 구간 유지')
            seen.add(identity)
            row = {'월': month, '세부_HS코드': code,
                   '세부품목명': (item.findtext('statKor') or '').strip(),
                   '수출금액_USD': number(item.findtext('expDlr')),
                   '수출중량_KG': number(item.findtext('expWgt'))}
            if not country:
                row.update({'수입금액_USD': number(item.findtext('impDlr')),
                            '수입중량_KG': number(item.findtext('impWgt'))})
            records.append(row)
        if not records:
            raise CollectionError('월별 데이터 없는 응답; 0으로 간주하지 않고 기존 값 유지')
        print(f'  {len(records)}행 / {len({r["월"] for r in records})}개월 검증 완료', flush=True)
        return records


def fetch_months(client, url, hs_code, start, end, country=None):
    """Only recover omitted months after a valid, nonempty period response."""
    prefix = f'{hs_code} {country or "전체"} {start}~{end}'
    print(prefix, flush=True)
    failures = []
    try:
        rows = client.records(url, hs_code, start, end, country)
    except CollectionError as exc:
        return [], [{'시작월': start, '종료월': end, '오류': str(exc)}]
    received = {row['월'] for row in rows}
    for month in month_range(start, end):
        if label(month) in received:
            continue
        try:
            recovered = client.records(url, hs_code, month, month, country)
            rows.extend(recovered)
        except CollectionError as exc:
            failures.append({'시작월': month, '종료월': month, '오류': str(exc)})
            if client.stopped:
                # Record the remaining missing months without further requests.
                failures.extend({'시작월': pending, '종료월': pending, '오류': client.stopped}
                                for pending in month_range(next_month(month), end)
                                if label(pending) not in received)
                break
    return rows, failures
