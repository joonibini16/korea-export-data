import unittest
from collect_breadth import calculate, parse_snapshot

class BreadthTest(unittest.TestCase):
    def test_windows_and_denominators(self):
        days=[(str(i),{'A':i+1,'B':1000-i}) for i in range(253)]
        x=calculate('KOSPI',days)
        self.assertIsNone(x[58]['breadth_60'])
        self.assertEqual(x[59]['breadth_60'],50)
        self.assertIsNone(x[250]['hli'])
        self.assertEqual(x[251]['hli'],50)
    def test_new_listing_and_missing_snapshot(self):
        days=[(str(i),{'A':i+1,**({'IPO':10} if i>=245 else {})}) for i in range(253)]
        x=calculate('KOSPI',days)
        self.assertEqual(x[-1]['total'],2)
        self.assertEqual(x[-1]['eligible_252'],1)
        self.assertEqual(x[-1]['hli'],100)
        x=calculate('KOSPI',days+ [('missing',None),('next',{'A':300})])
        self.assertIsNone(x[-1]['breadth_60'])
    def test_zero_breadth_is_not_missing(self):
        x=calculate('KOSPI',[(str(i),{'A':1000-i}) for i in range(252)])
        self.assertEqual(x[-1]['breadth_60'],0)
        self.assertEqual(x[-1]['hli'],0)
    def test_snapshot_validation(self):
        self.assertEqual(parse_snapshot([{'ISU_CD':'A','BAS_DD':'20261012','TDD_CLSPRC':'1,500'}],'2026-10-12'),{'A':1500})
        for rows in ([],[{'ISU_CD':'A','TDD_CLSPRC':'NaN'}],[{'ISU_CD':'A','TDD_CLSPRC':'-1'}],[{'ISU_CD':'A','BAS_DD':'20261011','TDD_CLSPRC':'1'}]):
            with self.assertRaises(ValueError):parse_snapshot(rows,'2026-10-12')
if __name__=='__main__':unittest.main()
