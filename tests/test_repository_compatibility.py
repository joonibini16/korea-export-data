"""Exercise the checked-in data using copies; never call the real API."""
import contextlib
import io
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests

from test_collectors import Response, client, common, countries, items, row, xml

REPOSITORY = Path(__file__).resolve().parents[1]


class RepositoryCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.previous = Path.cwd()
        self.temp = tempfile.TemporaryDirectory()
        for source in REPOSITORY.glob('*.csv'):
            shutil.copyfile(source, Path(self.temp.name) / source.name)
        os.chdir(self.temp.name)
        self.before = {p.name: p.read_bytes() for p in Path('.').glob('*.csv')}
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.environment = patch.dict(os.environ, {
            'CUSTOMS_REQUIRE_FRESH_TOTALS': '0',
            'CUSTOMS_REQUEST_INTERVAL': '1',
            'CUSTOMS_MAX_REQUESTS': '200',
        })
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        self.output.__exit__(None, None, None)
        os.chdir(self.previous)
        self.temp.cleanup()

    def assert_data_preserved(self):
        # Diagnostics are deliberately regenerated, unlike historical data.
        for name, payload in self.before.items():
            if name not in ('export_failed.csv', 'country_failed.csv'):
                self.assertEqual(Path(name).read_bytes(), payload, name)

    def test_existing_hs_configuration_and_csv_schemas(self):
        configuration = common.read_hs_codes()
        self.assertTrue(configuration)
        self.assertEqual(len(configuration), len({r['hs_code'] for r in configuration}))
        schemas = {
            'export_[0-9]*.csv': items.DETAIL_FIELDS,
            'summary_[0-9]*.csv': items.SUMMARY_FIELDS,
            'summary_all.csv': items.SUMMARY_FIELDS,
            'latest.csv': items.SUMMARY_FIELDS,
            'country_[0-9]*.csv': countries.FIELDNAMES,
            'country_all.csv': countries.FIELDNAMES,
            'country_latest.csv': countries.FIELDNAMES,
        }
        for pattern, fields in schemas.items():
            for path in Path('.').glob(pattern):
                for record in common.read_csv(path):
                    self.assertEqual(list(record), fields, path.name)
        self.assert_data_preserved()

    def test_general_429_and_timeout_preserve_checked_in_data(self):
        for response in (Response(status=429), requests.exceptions.Timeout('mock timeout')):
            with self.subTest(response=type(response).__name__):
                api = client([response] * 3)
                with patch.object(items, 'CustomsClient', return_value=api):
                    self.assertEqual(items.main(), 2)
                self.assertEqual(len(api.session.calls), 3)
                self.assert_data_preserved()

    def test_country_429_preserves_checked_in_data(self):
        api = client([Response(status=429)] * 3)
        with patch.object(countries, 'CustomsClient', return_value=api):
            self.assertEqual(countries.main(), 1)
        self.assertEqual(len(api.session.calls), 3)
        self.assert_data_preserved()

    def test_partial_general_success_preserves_omitted_and_historical_months(self):
        hs = next(item for item in common.read_hs_codes()
                  if Path(f"export_{item['hs_code']}.csv").exists())
        detail_path = Path(f"export_{hs['hs_code']}.csv")
        original = common.read_csv(detail_path)
        target = max(record['월'] for record in original)
        end = target.replace('.', '')
        start = common.prev_month(end)
        code = next(record['세부_HS코드'] for record in original if record['월'] == target)
        api = client([Response(xml([row(target, code=code, usd=123, kg=2)])),
                      Response(xml(total=0))])
        with patch.object(items, 'build_ranges', return_value=[(start, end)]):
            failures, refreshed = items.update_one_item(api, hs['hs_code'], hs['name'])
        self.assertTrue(failures)
        self.assertEqual(refreshed, {target})
        self.assertEqual([r for r in common.read_csv(detail_path) if r['월'] != target],
                         [r for r in original if r['월'] != target])
        self.assertEqual(next(r for r in common.read_csv(f"summary_{hs['hs_code']}.csv")
                              if r['월'] == target)['수출금액_USD'], '123')
        for name, payload in self.before.items():
            if name not in (detail_path.name, f"summary_{hs['hs_code']}.csv"):
                self.assertEqual(Path(name).read_bytes(), payload, name)


if __name__ == '__main__':
    unittest.main()
