"""Regression tests for historical HSK continuity mappings."""
import importlib
import unittest
from unittest.mock import patch

import country_test as countries
from hs_history import source_codes, source_quality, split_source_ranges

items = importlib.import_module('test')


class HistoryMappingTests(unittest.TestCase):
    def test_solar_switches_from_two_old_codes_to_current_code(self):
        self.assertEqual(source_codes('8541430000', '202112'),
                         ('8541409021', '8541409022'))
        self.assertEqual(source_codes('8541430000', '202201'), ('8541430000',))
        self.assertEqual(
            split_source_ranges('8541430000', '202112', '202201'),
            [('202112', '202112', ('8541409021', '8541409022'), 'exact_merge'),
             ('202201', '202201', ('8541430000',), 'current')],
        )

    def test_ncm_old_code_is_explicitly_marked_as_broader_proxy(self):
        self.assertEqual(source_codes('2841909020', '202101'), ('2841909000',))
        self.assertEqual(source_quality('2841909020', '202101'), 'legacy_proxy')
        self.assertEqual(source_codes('2841909020', '202201'), ('2841909020',))

    def test_toxin_uses_old_toxin_subcodes(self):
        expected = ('3002903010', '3002903020', '3002903090')
        self.assertEqual(source_codes('3002491000', '202012'), expected)
        self.assertEqual(source_codes('300249', '202012'), expected)
        self.assertEqual(source_quality('300249', '202012'), 'item_proxy')

    def test_unmapped_code_keeps_same_code_in_history(self):
        self.assertEqual(source_codes('8542900000', '202001'), ('8542900000',))
        self.assertEqual(source_codes('8486902090', '202001'), ('8486902090',))


class HistoricalCollectorTests(unittest.TestCase):
    def test_general_join_accepts_verified_empty_predecessor_as_zero(self):
        row = {'월': '2020.01', '세부_HS코드': '8541409021', '세부품목명': '태양전지',
               '수출금액_USD': 10, '수출중량_KG': 2,
               '수입금액_USD': 1, '수입중량_KG': 1}

        def fake_fetch(client, url, hs_code, start, end, country=None):
            if hs_code == '8541409021':
                return [row], []
            return [], [{'시작월': start, '종료월': end,
                         '오류': items.EMPTY_RESPONSE_REASON}]

        with patch.object(items, 'fetch_months', side_effect=fake_fetch):
            rows, failures = items.fetch_logical_months(
                object(), '8541430000', '202001', '202001')
        self.assertEqual(failures, [])
        self.assertEqual(len(rows), 2)
        self.assertEqual(sum(int(r['수출금액_USD']) for r in rows), 10)
        self.assertEqual({r['세부_HS코드'] for r in rows},
                         {'8541409021', '8541409022'})

    def test_country_join_sums_predecessors_before_reconciliation(self):
        row = {'월': '2020.01', '세부_HS코드': '8541409021',
               '수출금액_USD': 10, '수출중량_KG': 2}
        failures = []

        def fake_fetch(client, url, hs_code, start, end, country=None):
            if hs_code == '8541409021':
                return [row], []
            return [], [{'시작월': start, '종료월': end,
                         '오류': countries.EMPTY_RESPONSE_REASON}]

        def fail(code, start, end, reason):
            failures.append((code, start, end, reason))

        with patch.object(countries, 'fetch_months', side_effect=fake_fetch):
            monthly = countries.fetch_country_logical(
                object(), '8541430000', '202001', '202001', 'US', True, fail)
        self.assertEqual(failures, [])
        self.assertEqual(monthly['2020.01'], {'usd': 10, 'kg': 2})


if __name__ == '__main__':
    unittest.main()
