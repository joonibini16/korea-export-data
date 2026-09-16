"""Collect countries in periods; publish only complete validated months."""
import os

from customs_common import (
    CollectionError, CustomsClient, aggregate_csv, atomic_csv, build_ranges,
    fetch_months, label, month_range, next_month, number, read_csv, read_hs_codes, save_latest,
)

API_URL = 'https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList'
COUNTRIES = {'US': '미국', 'CN': '중국', 'JP': '일본', 'VN': '베트남',
             'HK': '홍콩', 'FR': '프랑스', 'PL': '폴란드', 'GB': '영국'}
FIELDNAMES = ['월', '품목명', 'HS코드', '국가코드', '국가명', '수출금액_USD', '수출중량_KG']
FAILED_FIELDS = ['품목명', 'HS코드', '국가코드', '국가명', '시작월', '종료월', '오류']


def complete_months(rows):
    codes_by_month = {}
    for row in rows:
        codes_by_month.setdefault(row['월'], set()).add(row['국가코드'])
    required = set(COUNTRIES) | {'OTHER'}
    return {month for month, codes in codes_by_month.items() if required <= codes}


def collection_priority(item):
    """Use saved progress so the 200-request cap cannot always exclude the tail."""
    complete = complete_months(read_csv(f"country_{item['hs_code']}.csv"))
    return max(complete, default=''), len(complete)


def eligible_ranges(start, end, totals):
    """Only request consecutive months with usable general totals."""
    ranges = []
    for month in month_range(start, end):
        if label(month) not in totals:
            continue
        if ranges and next_month(ranges[-1][1]) == month:
            ranges[-1] = (ranges[-1][0], month)
        else:
            ranges.append((month, month))
    return ranges


def update_one_item(client, hs_code, name, requested_ranges=None):
    path = f'country_{hs_code}.csv'
    working = read_csv(path)
    totals = {row['월']: {'usd': number(row['수출금액_USD']), 'kg': number(row['수출중량_KG'])}
              for row in read_csv(f'summary_{hs_code}.csv')}
    if os.environ.get('CUSTOMS_REQUIRE_FRESH_TOTALS') == '1':
        fresh = {row['월'] for row in read_csv('.customs_refreshed.csv') if row['HS코드'] == hs_code}
        totals = {month: value for month, value in totals.items() if month in fresh}
    failures, changed = [], False

    def fail(code, start, end, reason):
        failures.append({'품목명': name, 'HS코드': hs_code, '국가코드': code,
                         '국가명': COUNTRIES.get(code, '기타' if code == 'OTHER' else '-'),
                         '시작월': start, '종료월': end, '오류': reason})

    if not totals:
        fail('-', '-', '-', '일반 품목 summary 없음; 기존 국가 데이터 유지')
        return failures, changed
    print(f'\n{name} / HS {hs_code}: 국가별 기간조회', flush=True)
    ranges = []
    for start, end in (build_ranges(complete_months(working)) if requested_ranges is None else requested_ranges):
        ranges.extend(eligible_ranges(start, end, totals))
        missing = {label(month): True for month in month_range(start, end)
                   if label(month) not in totals}
        for gap_start, gap_end in eligible_ranges(start, end, missing):
            fail('-', gap_start, gap_end, '사용 가능한 일반 품목 합계 없음; 조회 보류')
    for start, end in ranges:
        if client.stopped:
            fail('-', start, end, client.stopped)
            continue
        expected = [label(month) for month in month_range(start, end)]
        results = {}
        for code in COUNTRIES:
            if client.stopped:
                fail(code, start, end, client.stopped)
                continue
            rows, errors = fetch_months(client, API_URL, hs_code, start, end, code)
            for error in errors:
                fail(code, error['시작월'], error['종료월'], error['오류'])
            monthly = {}
            for row in rows:
                values = monthly.setdefault(row['월'], {'usd': 0, 'kg': 0})
                values['usd'] += number(row['수출금액_USD'])
                values['kg'] += number(row['수출중량_KG'])
            results[code] = monthly
        updated = 0
        for month in expected:
            yymm = month.replace('.', '')
            if month not in totals:
                fail('-', yymm, yymm, '일반 품목 합계 없음; 기존 월 유지')
                continue
            if any(month not in results.get(code, {}) for code in COUNTRIES):
                fail('-', yymm, yymm, '8개국 중 누락 응답 있음; 0으로 채우지 않고 기존 월 유지')
                continue
            major_usd = sum(results[code][month]['usd'] for code in COUNTRIES)
            major_kg = sum(results[code][month]['kg'] for code in COUNTRIES)
            other_usd = totals[month]['usd'] - major_usd
            other_kg = totals[month]['kg'] - major_kg
            if other_usd < 0 or other_kg < 0:
                fail('OTHER', yymm, yymm, '주요국 금액/중량 합계가 전체보다 큼; 기존 월 유지')
                continue
            monthly_rows = [
                {'월': month, '품목명': name, 'HS코드': hs_code, '국가코드': code,
                 '국가명': country_name, '수출금액_USD': results[code][month]['usd'],
                 '수출중량_KG': results[code][month]['kg']}
                for code, country_name in COUNTRIES.items()
            ]
            monthly_rows.append({'월': month, '품목명': name, 'HS코드': hs_code,
                                 '국가코드': 'OTHER', '국가명': '기타',
                                 '수출금액_USD': other_usd, '수출중량_KG': other_kg})
            working = [row for row in working if row['월'] != month] + monthly_rows
            updated += 1
        if updated:
            order = {code: index for index, code in enumerate([*COUNTRIES, 'OTHER'])}
            working.sort(key=lambda row: (row['월'], order.get(row['국가코드'], 99)))
            atomic_csv(path, FIELDNAMES, working)
            changed = True
            print(f'  {updated}개월 검증 후 저장', flush=True)
    return failures, changed


def collection_tasks(items):
    """Collect recent periods across all items before any historical backfill."""
    tasks = []
    for item in sorted(items, key=collection_priority):
        complete = complete_months(read_csv(f"country_{item['hs_code']}.csv"))
        for start, end in build_ranges(complete):
            tasks.append((item, start, end))
    # Stable sort retains least-covered item priority within each period.
    return sorted(tasks, key=lambda task: task[2], reverse=True)


def main():
    failures = []
    try:
        items = sorted(read_hs_codes(), key=collection_priority)
        client = CustomsClient()
        changed = False
        for item, start, end in collection_tasks(items):
            if not client.stopped and client.max_requests - client.count < len(COUNTRIES):
                client.stopped = '실행당 호출 잔여량이 8개국 조회에 부족; 다음 실행으로 보류'
            errors, updated = update_one_item(
                client, item['hs_code'], item['name'], requested_ranges=[(start, end)])
            failures.extend(errors)
            changed = changed or updated
        if changed:
            rows = aggregate_csv('country_[0-9]*.csv', 'country_all.csv', FIELDNAMES,
                                 ['월', 'HS코드', '국가코드'])
            save_latest('country_latest.csv', FIELDNAMES, rows)
    except CollectionError as exc:
        failures.append({'품목명': '-', 'HS코드': '-', '국가코드': '-', '국가명': '-',
                         '시작월': '-', '종료월': '-', '오류': str(exc)})
    atomic_csv('country_failed.csv', FAILED_FIELDS, failures, allow_empty=True)
    if failures:
        print(f'수집 미완료 {len(failures)}건: country_failed.csv 확인', flush=True)
        return 1
    print('국가별 데이터 수집 완료', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
