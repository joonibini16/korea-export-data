import unittest
from unittest.mock import patch
import country_test as collector


class CountrySchedulingTests(unittest.TestCase):
    def test_all_latest_periods_precede_history(self):
        items = [{'hs_code': str(i), 'name': str(i)} for i in range(36)]
        ranges = [('202601', '202608'), ('202501', '202512'), ('202001', '202012')]
        with patch.object(collector, 'read_csv', return_value=[]), patch.object(
                collector, 'build_ranges', return_value=ranges):
            tasks = collector.collection_tasks(items)
        self.assertEqual(len(tasks), 108)
        self.assertEqual({t[0]['hs_code'] for t in tasks[:36]}, {str(i) for i in range(36)})
        self.assertTrue(all(t[2] == '202608' for t in tasks[:36]))

    def test_less_covered_items_win_equal_period(self):
        items = [{'hs_code': 'old', 'name': 'old'}, {'hs_code': 'new', 'name': 'new'}]
        with patch.object(collector, 'read_csv', return_value=[]), patch.object(
                collector, 'collection_priority', side_effect=lambda x: (x['hs_code'] == 'old', 0)), patch.object(
                collector, 'build_ranges', return_value=[('202606', '202608')]):
            tasks = collector.collection_tasks(items)
        self.assertEqual(tasks[0][0]['hs_code'], 'new')
