"""Offline regressions for API throttling, partial responses and CSV preservation."""
import importlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree.ElementTree import Element, SubElement, tostring

import requests
import customs_common as common
import country_test as countries

items = importlib.import_module('test')


def xml(rows=(), *, total=None, code='00'):
    root = Element('response')
    SubElement(SubElement(root, 'header'), 'resultCode').text = code
    body = SubElement(root, 'body')
    if total is not None:
        SubElement(body, 'totalCount').text = str(total)
    container = SubElement(body, 'items')
    for values in rows:
        node = SubElement(container, 'item')
        for key, value in values.items():
            SubElement(node, key).text = str(value)
    return tostring(root)


def row(month='2026.08', code='3304991000', usd=10, kg=2):
    return {'year': month, 'hsCode': code, 'statKor': '테스트', 'expDlr': usd,
            'expWgt': kg, 'impDlr': 3, 'impWgt': 1}


def country_row(month='2026.08', code='3304991000', usd=10, kg=2, country='US'):
    return {'year': month, 'hsCd': code, 'cntyCd': country,
            'expDlr': usd, 'expWgt': kg}


class Response:
    def __init__(self, payload=None, status=200, headers=None):
        self.content = payload if payload is not None else xml([row()])
        self.status_code = status
        self.headers = headers or {}


class Session:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []

    def get(self, url, **kwargs):
        self.calls.append((url, dict(kwargs['params'])))
        if not self.responses:
            raise AssertionError('Unexpected additional API request')
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def client(responses):
    return common.CustomsClient('fake-key', Session(responses), sleep=lambda seconds: None)


class RequestTests(unittest.TestCase):
    def test_country_hscd_response_and_request_parameters(self):
        api = client([Response(xml([country_row('2026.07'), country_row()]))])
        records = api.records('unused', '330499', '202607', '202608', 'US')
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]['세부_HS코드'], '3304991000')
        self.assertEqual(api.session.calls[0][1]['hsSgn'], '330499')
        self.assertEqual(api.session.calls[0][1]['cntyCd'], 'US')

    def test_country_hscd_does_not_bypass_validation(self):
        missing = country_row()
        del missing['hsCd']
        conflict = {**country_row(), 'hsCode': '8504000000'}
        for values in (missing, conflict, country_row(code='8504000000'),
                       country_row(country='CN')):
            with self.subTest(values=values):
                api = client([Response(xml([values]))])
                with self.assertRaises(common.CollectionError):
                    api.records('unused', '330499', '202608', '202608', 'US')

    def test_item_response_still_requires_hscode(self):
        api = client([Response(xml([country_row()]))])
        with self.assertRaises(common.CollectionError):
            api.records('unused', '330499', '202608', '202608')

    def test_429_opens_circuit_without_monthly_fallback(self):
        api = client([Response(status=429)] * 3)
        rows, failures = common.fetch_months(api, 'unused', '330499', '202606', '202608')
        self.assertEqual(rows, [])
        self.assertTrue(failures)
        common.fetch_months(api, 'unused', '8504', '202606', '202608')
        self.assertEqual(len(api.session.calls), 3)

    def test_timeout_exception_does_not_expose_key(self):
        api = client([requests.exceptions.Timeout('https://example/?serviceKey=SECRET')] * 3)
        _, failures = common.fetch_months(api, 'unused', '330499', '202608', '202608')
        self.assertNotIn('SECRET', str(failures))
        self.assertEqual(len(api.session.calls), 3)
        self.assertTrue(api.stopped)

    def test_retry_after_is_respected(self):
        waits = []
        api = client([Response(status=429, headers={'Retry-After': '120'}), Response()])
        api.sleep = waits.append
        self.assertEqual(len(api.records('unused', '330499', '202608', '202608')), 1)
        self.assertIn(120, waits)

    def test_long_retry_after_stops_without_early_retry(self):
        api = client([Response(status=429, headers={'Retry-After': '3600'})])
        with self.assertRaises(common.StopCollection):
            api.records('unused', '330499', '202608', '202608')
        self.assertEqual(len(api.session.calls), 1)

    def test_xml_quota_error_under_http_200(self):
        api = client([Response(xml(code='22'))])
        with self.assertRaises(common.StopCollection):
            api.records('unused', '330499', '202608', '202608')
        self.assertEqual(len(api.session.calls), 1)

    def test_empty_response_is_not_zero_or_retried(self):
        api = client([Response(xml(total=0))])
        rows, failures = common.fetch_months(api, 'unused', '330499', '202606', '202608')
        self.assertEqual(rows, [])
        self.assertTrue(failures)
        self.assertEqual(len(api.session.calls), 1)

    def test_missing_numeric_field_invalidates_entire_response(self):
        invalid = row()
        del invalid['expDlr']
        api = client([Response(xml([invalid]))])
        with self.assertRaises(common.CollectionError):
            api.records('unused', '330499', '202608', '202608')

    def test_pagination_collects_all_rows(self):
        api = client([Response(xml([row()], total=2)),
                      Response(xml([row(code='3304992000')], total=2))])
        rows = api.records('unused', '330499', '202608', '202608')
        self.assertEqual(len(rows), 2)
        self.assertEqual([call[1]['pageNo'] for call in api.session.calls], [1, 2])

    def test_repeated_page_does_not_replace_data(self):
        api = client([Response(xml([row()], total=2))] * 2)
        with self.assertRaises(common.CollectionError):
            api.records('unused', '330499', '202608', '202608')

    def test_partial_period_fetches_only_omitted_month(self):
        api = client([Response(xml([row('2026.06'), row('2026.08')])),
                      Response(xml([row('2026.07')]))])
        rows, failures = common.fetch_months(api, 'unused', '330499', '202606', '202608')
        self.assertEqual(len(rows), 3)
        self.assertEqual(failures, [])
        self.assertEqual(api.session.calls[1][1]['strtYymm'], '202607')
        self.assertEqual(api.session.calls[1][1]['endYymm'], '202607')

    def test_wrong_month_and_duplicate_rows_rejected(self):
        for rows in ([row('2026.09')], [row(), row()]):
            with self.subTest(rows=rows):
                api = client([Response(xml(rows))])
                with self.assertRaises(common.CollectionError):
                    api.records('unused', '330499', '202608', '202608')

    def test_request_budget_prevents_more_calls(self):
        api = client([Response()])
        api.max_requests = 1
        api.records('unused', '330499', '202608', '202608')
        with self.assertRaises(common.StopCollection):
            api.records('unused', '330499', '202608', '202608')
        self.assertEqual(len(api.session.calls), 1)

    def test_single_month_failure_is_not_requested_twice(self):
        api = client([Response(xml(code='10'))])
        _, failures = common.fetch_months(api, 'unused', '330499', '202608', '202608')
        self.assertTrue(failures)
        self.assertEqual(len(api.session.calls), 1)


class FileTests(unittest.TestCase):
    def setUp(self):
        self.cwd = Path.cwd()
        self.temp = tempfile.TemporaryDirectory()
        os.chdir(self.temp.name)
        Path('hs_codes.csv').write_text('hs_code,name\n330499,화장품\n', encoding='utf-8-sig')

    def tearDown(self):
        os.chdir(self.cwd)
        self.temp.cleanup()

    def seed_general(self):
        detail = {'월': '2026.08', '대표품목': '화장품', '조회_HS코드': '330499',
                  '세부_HS코드': '3304991000', '세부품목명': '테스트',
                  '수출금액_USD': 100, '수출중량_KG': 100, '수입금액_USD': 1, '수입중량_KG': 1}
        common.atomic_csv('export_330499.csv', items.DETAIL_FIELDS, [detail])
        summary = items.make_summary('330499', '화장품', [detail])
        for name in ('summary_330499.csv', 'summary_all.csv', 'latest.csv'):
            common.atomic_csv(name, items.SUMMARY_FIELDS, summary)

    def seed_countries(self):
        rows = [{'월': '2026.08', '품목명': '화장품', 'HS코드': '330499',
                 '국가코드': code, '국가명': name, '수출금액_USD': 1, '수출중량_KG': 1}
                for code, name in {**countries.COUNTRIES, 'OTHER': '기타'}.items()]
        for name in ('country_330499.csv', 'country_all.csv', 'country_latest.csv'):
            common.atomic_csv(name, countries.FIELDNAMES, rows)

    def seed_legacy_countries_without_tw(self):
        rows = [{'월': '2026.08', '품목명': '화장품', 'HS코드': '330499',
                 '국가코드': code, '국가명': name, '수출금액_USD': 1, '수출중량_KG': 1}
                for code, name in {**{k: v for k, v in countries.COUNTRIES.items() if k != 'TW'},
                                   'OTHER': '기타'}.items()]
        for name in ('country_330499.csv', 'country_all.csv', 'country_latest.csv'):
            common.atomic_csv(name, countries.FIELDNAMES, rows)

    def snapshot(self):
        return {path.name: path.read_bytes() for path in Path('.').glob('*.csv')}

    def test_general_total_failure_preserves_all_existing_csv(self):
        self.seed_general()
        before = self.snapshot()
        api = client([Response(status=429)] * 3)
        with patch.object(items, 'CustomsClient', return_value=api), \
             patch.object(items, 'build_ranges', return_value=[('202608', '202608')]):
            self.assertEqual(items.main(), 2)
        for name, contents in before.items():
            self.assertEqual(Path(name).read_bytes(), contents, name)

    def test_new_item_failure_does_not_create_empty_data(self):
        api = client([Response(xml(total=0))])
        with patch.object(items, 'build_ranges', return_value=[('202608', '202608')]):
            failures, refreshed = items.update_one_item(api, '330499', '화장품')
        self.assertTrue(failures)
        self.assertFalse(refreshed)
        self.assertFalse(Path('export_330499.csv').exists())
        self.assertFalse(Path('summary_330499.csv').exists())

    def test_general_success_refreshes_summary_and_fresh_month_marker(self):
        self.seed_general()
        api = client([Response(xml([row(usd=200, kg=100)]))])
        with patch.object(items, 'CustomsClient', return_value=api), \
             patch.object(items, 'build_ranges', return_value=[('202608', '202608')]):
            self.assertEqual(items.main(), 0)
        self.assertEqual(common.read_csv('summary_all.csv')[0]['수출금액_USD'], '200')
        self.assertEqual(common.read_csv('.customs_refreshed.csv'), [{'HS코드': '330499', '월': '2026.08'}])

    def test_missing_country_keeps_entire_existing_month(self):
        self.seed_general()
        self.seed_legacy_countries_without_tw()
        before = self.snapshot()
        api = client([Response(xml(total=0))])
        with patch.object(countries, 'CustomsClient', return_value=api), \
             patch.object(countries, 'build_ranges', return_value=[('202608', '202608')]):
            self.assertEqual(countries.main(), 1)
        self.assertEqual(len(api.session.calls), 1)
        self.assertEqual(api.session.calls[0][1]['cntyCd'], 'TW')
        for name, contents in before.items():
            self.assertEqual(Path(name).read_bytes(), contents, name)

    def test_country_negative_other_weight_keeps_month(self):
        self.seed_general()
        self.seed_legacy_countries_without_tw()
        before = Path('country_330499.csv').read_bytes()
        api = client([Response(xml([country_row(country='TW', usd=1, kg=95)]))])
        with patch.object(countries, 'build_ranges', return_value=[('202608', '202608')]):
            failures, changed = countries.update_one_item(api, '330499', '화장품')
        self.assertTrue(failures)
        self.assertFalse(changed)
        self.assertEqual(len(api.session.calls), 1)
        self.assertEqual(Path('country_330499.csv').read_bytes(), before)

    def test_country_success_reconciles_amount_and_weight(self):
        self.seed_general()
        api = client([Response(xml([country_row(country=code)]))
                      for code in countries.COUNTRIES])
        with patch.object(countries, 'build_ranges', return_value=[('202608', '202608')]):
            failures, changed = countries.update_one_item(api, '330499', '화장품')
        self.assertEqual(failures, [])
        self.assertTrue(changed)
        rows = common.read_csv('country_330499.csv')
        self.assertEqual(len(rows), len(countries.COUNTRIES) + 1)
        self.assertEqual(sum(int(row['수출금액_USD']) for row in rows), 100)
        self.assertEqual(sum(int(row['수출중량_KG']) for row in rows), 100)

    def test_new_taiwan_backfill_reuses_existing_major_countries(self):
        self.seed_general()
        self.seed_legacy_countries_without_tw()
        api = client([Response(xml([country_row(country='TW', usd=5, kg=5)]))])
        with patch.object(countries, 'build_ranges', return_value=[('202608', '202608')]):
            failures, changed = countries.update_one_item(api, '330499', '화장품')
        self.assertEqual(failures, [])
        self.assertTrue(changed)
        self.assertEqual(len(api.session.calls), 1)
        self.assertEqual(api.session.calls[0][1]['cntyCd'], 'TW')
        rows = common.read_csv('country_330499.csv')
        self.assertEqual(len(rows), len(countries.COUNTRIES) + 1)
        taiwan = next(row for row in rows if row['국가코드'] == 'TW')
        other = next(row for row in rows if row['국가코드'] == 'OTHER')
        self.assertEqual(int(taiwan['수출금액_USD']), 5)
        self.assertEqual(int(other['수출금액_USD']), 87)

    def test_country_requests_only_months_with_fresh_totals(self):
        self.seed_general()
        common.atomic_csv('.customs_refreshed.csv', ['HS코드', '월'],
                          [{'HS코드': '330499', '월': '2026.08'}])
        api = client([Response(xml([country_row(country=code)]))
                      for code in countries.COUNTRIES])
        with patch.dict(os.environ, {'CUSTOMS_REQUIRE_FRESH_TOTALS': '1'}), \
             patch.object(countries, 'build_ranges', return_value=[('202601', '202608')]):
            failures, changed = countries.update_one_item(api, '330499', '화장품')
        self.assertTrue(changed)
        self.assertEqual(len(api.session.calls), len(countries.COUNTRIES))
        self.assertTrue(all(call[1]['strtYymm'] == '202608' and
                            call[1]['endYymm'] == '202608' for call in api.session.calls))
        self.assertEqual([(r['시작월'], r['종료월']) for r in failures], [('202601', '202607')])

    def test_eligible_country_ranges_split_at_missing_totals(self):
        self.assertEqual(countries.eligible_ranges('202601', '202604',
                         {'2026.01': {}, '2026.03': {}, '2026.04': {}}),
                         [('202601', '202601'), ('202603', '202604')])

    def test_country_saved_progress_moves_uncollected_item_to_front(self):
        self.seed_countries()
        configured = [{'hs_code': '330499'}, {'hs_code': '8504'}]
        self.assertEqual(sorted(configured, key=countries.collection_priority)[0], configured[1])
        complete = common.read_csv('country_330499.csv')
        common.atomic_csv('country_8504.csv', countries.FIELDNAMES,
                          [{**r, 'HS코드': '8504'} for r in complete] +
                          [{**r, 'HS코드': '8504', '월': '2026.07'} for r in complete])
        self.assertEqual(sorted(configured, key=countries.collection_priority)[0], configured[0])

    def test_country_stale_totals_block_requests(self):
        self.seed_general()
        self.seed_countries()
        before = self.snapshot()
        api = client([])
        with patch.dict(os.environ, {'CUSTOMS_REQUIRE_FRESH_TOTALS': '1'}):
            failures, changed = countries.update_one_item(api, '330499', '화장품')
        self.assertTrue(failures)
        self.assertFalse(changed)
        self.assertEqual(api.session.calls, [])
        self.assertEqual(self.snapshot(), before)

    def test_atomic_replace_failure_keeps_original(self):
        Path('sample.csv').write_bytes(b'original')
        with patch.object(common.os, 'replace', side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                common.atomic_csv('sample.csv', ['value'], [{'value': 1}])
        self.assertEqual(Path('sample.csv').read_bytes(), b'original')
        self.assertEqual(list(Path('.').glob('.sample.csv.*')), [])

    def test_empty_write_does_not_erase_original(self):
        Path('sample.csv').write_bytes(b'original')
        self.assertFalse(common.atomic_csv('sample.csv', ['value'], []))
        self.assertEqual(Path('sample.csv').read_bytes(), b'original')

    def test_mom_uses_calendar_previous_month(self):
        details = [{'월': month, '수출금액_USD': value, '수출중량_KG': 1}
                   for month, value in [('2026.06', 100), ('2026.08', 200)]]
        summary = items.make_summary('330499', '화장품', details)
        self.assertEqual(summary[-1]['MoM_pct'], '')

    def test_ranges_do_not_cross_year_and_recent_first(self):
        ranges = common.build_ranges(set(), '202608')
        self.assertEqual(ranges[0], ('202601', '202608'))
        self.assertTrue(all(start[:4] == end[:4] for start, end in ranges))
        self.assertEqual(common.month_range('202601', '202512'), [])

    def test_csv_name_with_comma_and_duplicate_detection(self):
        Path('hs_codes.csv').write_text('hs_code,name\n8534002000,"GDDR기판, FPCB"\n', encoding='utf-8-sig')
        self.assertEqual(common.read_hs_codes()[0]['name'], 'GDDR기판, FPCB')
        Path('hs_codes.csv').write_text('hs_code,name\n330499,화장품\n330499,중복\n', encoding='utf-8-sig')
        with self.assertRaises(common.CollectionError):
            common.read_hs_codes()

    def test_legacy_unquoted_name_keeps_full_name_without_rewriting_csv(self):
        path = Path('hs_codes.csv')
        path.write_text('hs_code,name\n8534002000,GDDR기판, FPCB\n', encoding='utf-8')
        before = path.read_bytes()
        self.assertEqual(common.read_hs_codes(), [
            {'hs_code': '8534002000', 'name': 'GDDR기판, FPCB'}])
        self.assertEqual(path.read_bytes(), before)

    def test_invalid_configuration_is_rejected(self):
        for content in ('name,hs_code\n화장품,330499\n',
                        'hs_code,name\n330499\n', 'hs_code,name\n330499,\n'):
            with self.subTest(content=content):
                Path('hs_codes.csv').write_text(content, encoding='utf-8')
                with self.assertRaises(common.CollectionError):
                    common.read_hs_codes()

    def test_aggregate_preserves_history_without_per_item_file(self):
        fields = ['월', 'HS코드', 'value']
        old = {'월': '2020.01', 'HS코드': '8504', 'value': '10'}
        new = {'월': '2026.08', 'HS코드': '330499', 'value': '20'}
        common.atomic_csv('summary_all.csv', fields, [old])
        common.atomic_csv('summary_330499.csv', fields, [new])
        result = common.aggregate_csv('summary_[0-9]*.csv', 'summary_all.csv',
                                      fields, ['월', 'HS코드'])
        self.assertEqual(result, [old, new])


if __name__ == '__main__':
    unittest.main()
