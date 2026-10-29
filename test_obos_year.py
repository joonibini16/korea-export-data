import unittest
from collect_size_breadth import year_dates, daily_strength

class YearTests(unittest.TestCase):
    def test_warmup(self):
        dates=['2025-12-'+str(i) for i in range(10,32)]+['2026-01-02','2026-01-05']
        self.assertEqual(year_dates(dates,'2026-01-05'),dates[-12:])
    def test_missing_session(self):
        rank={'KOSPI':[{'code':'A'}], 'KOSDAQ':[{'code':'A'}]}
        hist={'A':[['2026-01-02',100],['2026-01-06',110],['2026-01-07',111]]}
        result=daily_strength(rank,hist,['2026-01-06','2026-01-07'],{'2026-01-06':'2026-01-05','2026-01-07':'2026-01-06'})
        for group in result['groups']:
            self.assertIsNone(group['rows'][0]['value'])
            self.assertEqual(group['rows'][0]['missing'],1)
            self.assertEqual(group['rows'][1]['value'],100)

if __name__=='__main__': unittest.main()
