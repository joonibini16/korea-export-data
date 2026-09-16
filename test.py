"""Collect item trade data. Run from the repository root: python test.py."""
from customs_common import (
    CollectionError, StopCollection, CustomsClient, aggregate_csv, atomic_csv, build_ranges,
    fetch_months, label, month_range, number, prev_month, read_csv, read_hs_codes, save_latest,
)
from hs_history import split_source_ranges

API_URL = 'https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList'
DETAIL_FIELDS = ['월', '대표품목', '조회_HS코드', '세부_HS코드', '세부품목명',
                 '수출금액_USD', '수출중량_KG', '수입금액_USD', '수입중량_KG']
SUMMARY_FIELDS = ['월', '품목명', 'HS코드', '수출금액_USD', '수출중량_KG',
                  '수출단가_USD_per_KG', 'YoY_pct', 'MoM_pct']
FAILED_FIELDS = ['품목명', 'HS코드', '시작월', '종료월', '오류']
EMPTY_RESPONSE_REASON = '월별 데이터 없는 응답; 0으로 간주하지 않고 기존 값 유지'


def make_summary(hs_code, name, details):
    monthly = {}
    for row in details:
        value = monthly.setdefault(row['월'], {'usd': 0, 'kg': 0})
        value['usd'] += number(row['수출금액_USD'])
        value['kg'] += number(row['수출중량_KG'])
    result = []
    for month, value in sorted(monthly.items()):
        previous_year = f'{int(month[:4]) - 1}.{month[5:]}'
        previous_month = prev_month(month.replace('.', ''))
        previous_month = f'{previous_month[:4]}.{previous_month[4:]}'
        yoy_base = monthly.get(previous_year, {}).get('usd')
        mom_base = monthly.get(previous_month, {}).get('usd')
        result.append({'월': month, '품목명': name, 'HS코드': hs_code,
                       '수출금액_USD': value['usd'], '수출중량_KG': value['kg'],
                       '수출단가_USD_per_KG': round(value['usd'] / value['kg'], 4) if value['kg'] else 0,
                       'YoY_pct': round((value['usd'] / yoy_base - 1) * 100, 2) if yoy_base else '',
                       'MoM_pct': round((value['usd'] / mom_base - 1) * 100, 2) if mom_base else ''})
    return result


def historical_zero_row(month, source_hs):
    return {'월': label(month), '세부_HS코드': source_hs,
            '세부품목명': '과거 HSK 무수출(0)',
            '수출금액_USD': 0, '수출중량_KG': 0,
            '수입금액_USD': 0, '수입중량_KG': 0}


def fetch_logical_months(client, logical_hs, start, end):
    """Fetch one logical series, joining verified predecessor HSK codes when needed."""
    collected, failures = [], []
    for seg_start, seg_end, sources, quality in split_source_ranges(logical_hs, start, end):
        expected = {label(month) for month in month_range(seg_start, seg_end)}
        historical = sources != (logical_hs,)
        source_rows, complete_sets = [], []
        for source_hs in sources:
            rows, errors = fetch_months(client, API_URL, source_hs, seg_start, seg_end)
            complete = {row['월'] for row in rows}
            rows_for_source = list(rows)
            for error in errors:
                reason = error['오류']
                if historical and reason == EMPTY_RESPONSE_REASON:
                    for zero_month in month_range(error['시작월'], error['종료월']):
                        month = label(zero_month)
                        complete.add(month)
                        rows_for_source.append(historical_zero_row(zero_month, source_hs))
                    print(f'  과거 HSK {source_hs} {error["시작월"]}~{error["종료월"]}: '
                          '정상 빈 응답 → 거래 0으로 확정', flush=True)
                else:
                    prefix = f'과거 HSK {source_hs}: ' if historical else ''
                    failures.append({'시작월': error['시작월'], '종료월': error['종료월'],
                                     '오류': prefix + reason})
            source_rows.extend(rows_for_source)
            complete_sets.append(complete)
        complete_months = expected.copy()
        for complete in complete_sets:
            complete_months &= complete
        collected.extend(row for row in source_rows if row['월'] in complete_months)
    return collected, failures


def update_one_item(client, hs_code, name):
    print(f'\n{name} / HS {hs_code}', flush=True)
    detail_path, summary_path = f'export_{hs_code}.csv', f'summary_{hs_code}.csv'
    working = read_csv(detail_path)
    existing_summary = read_csv(summary_path)
    # A summary alone must not hide gaps in the detailed source data.
    complete = {row['월'] for row in working} & {row['월'] for row in existing_summary}
    ranges = build_ranges(complete)
    failures, refreshed = [], set()
    for start, end in ranges:
        if client.stopped:
            failures.append({'시작월': start, '종료월': end, '오류': client.stopped})
            continue
        rows, errors = fetch_logical_months(client, hs_code, start, end)
        failures.extend(errors)
        received = {row['월'] for row in rows}
        if not received:
            continue
        working = [row for row in working if row['월'] not in received]
        working.extend({**row, '대표품목': name, '조회_HS코드': hs_code} for row in rows)
        working.sort(key=lambda row: (row['월'], row['세부_HS코드']))
        # Checkpoint only fully validated responses, using atomic replacement.
        atomic_csv(detail_path, DETAIL_FIELDS, working)
        refreshed.update(received)
    if refreshed:
        summary = {row['월']: row for row in existing_summary}
        summary.update({row['월']: row for row in make_summary(hs_code, name, working)})
        atomic_csv(summary_path, SUMMARY_FIELDS, sorted(summary.values(), key=lambda row: row['월']))
    else:
        print('  유효한 신규 응답 없음: 기존 상세·요약 파일 유지', flush=True)
    return [{'품목명': name, 'HS코드': hs_code, **failure} for failure in failures], refreshed


def main():
    failures, refreshed_rows, blocked = [], [], False
    try:
        items = read_hs_codes()
        client = CustomsClient()
        print(f'일반 품목 {len(items)}개: 최근 3개월 및 누락월 수집', flush=True)
        changed = False
        for item in items:
            errors, updated = update_one_item(client, item['hs_code'], item['name'])
            failures.extend(errors)
            changed = changed or bool(updated)
            refreshed_rows.extend({'HS코드': item['hs_code'], '월': month} for month in sorted(updated))
        blocked = bool(client.stopped)
        # No API success means the existing aggregates remain byte-for-byte intact.
        if changed:
            rows = aggregate_csv('summary_[0-9]*.csv', 'summary_all.csv', SUMMARY_FIELDS, ['월', 'HS코드'])
            save_latest('latest.csv', SUMMARY_FIELDS, rows)
    except CollectionError as exc:
        blocked = isinstance(exc, StopCollection)
        failures.append({'품목명': '-', 'HS코드': '-', '시작월': '-', '종료월': '-', '오류': str(exc)})
    atomic_csv('.customs_refreshed.csv', ['HS코드', '월'], refreshed_rows, allow_empty=True)
    atomic_csv('export_failed.csv', FAILED_FIELDS, failures, allow_empty=True)
    if failures:
        print(f'수집 미완료 {len(failures)}건: export_failed.csv 확인', flush=True)
        return 2 if blocked else 1
    print('일반 품목 데이터 수집 완료', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
