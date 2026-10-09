import unittest
from financial_history import derive
class HistoryTests(unittest.TestCase):
 def report(self,q,rv,op=None,year=2021,**kw):
  return dict(company_id='sample',year=year,quarter=q,basis='연결',source='https://example.org/filing',revenue=rv,operating_profit=op or rv,**kw)
 def run_reports(self,reports):return derive(dict(start_period='2020-Q1',end_period='2026-Q2',reports=reports))
 def test_cumulative_and_annual(self):
  rows,issues=self.run_reports([self.report(2,[20,30,10,15]),self.report(3,[30,60,20,35]),self.report(4,[100,50])])
  self.assertFalse(issues)
  self.assertEqual({r['period']:int(r['revenue_KRW']) for r in rows},{'2020-Q1':5,'2020-Q2':10,'2020-Q3':20,'2020-Q4':15,'2021-Q1':10,'2021-Q2':20,'2021-Q3':30,'2021-Q4':40})
 def test_no_zero_before_incorporation(self):
  rows,_=self.run_reports([self.report(2,[10,10],year=2020,period_starts=['2020.05.01'])])
  self.assertEqual([r['period'] for r in rows],['2020-Q2'])
 def test_annual_requires_q3(self):
  rows,_=self.run_reports([self.report(4,[100,80])]);self.assertEqual(rows,[])
 def test_restatement_mismatch_is_excluded(self):
  rows,issues=self.run_reports([self.report(2,[20,30,10,15]),self.report(3,[30,70,20,35])])
  self.assertTrue(issues);self.assertFalse(any(r['period'].startswith('2021') for r in rows))
 def test_profit_can_be_negative(self):
  rows,_=self.run_reports([self.report(1,[20,10],[-5,-3])]);self.assertEqual(rows[0]['operating_profit_KRW'],'-5')
if __name__=='__main__':unittest.main()
