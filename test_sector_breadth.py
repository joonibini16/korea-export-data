import unittest
from collect_sector_breadth import choose,compute_group,members,last_confirmed,published_during_session,batch_limit

class SectorTest(unittest.TestCase):
 def test_choose_unfinished_largest_first(self):
  groups={'KOSPI|A':[{'code':'1'},{'code':'2'},{'code':'3'}], 'KOSPI|B':[{'code':'1'}], 'KOSPI|C':[{'code':'1'},{'code':'2'}]}
  status={'groups':{'KOSPI|A':{'updated_at':'2026-10-13'}}}
  self.assertEqual(choose(groups,status,2),['KOSPI|C','KOSPI|B'])
 def test_batch_shrinks_after_all_groups_are_collected(self):
  groups={f'KOSPI|{i}':[{'code':str(i)}] for i in range(138)}
  self.assertEqual(batch_limit(groups,{'groups':{}},140),138)
  done={k:{'members':members(v)} for k,v in groups.items()}
  self.assertEqual(batch_limit(groups,{'groups':done},140),48)
 def test_breadth_and_hli(self):
  from datetime import datetime,timedelta,timezone
  today=datetime.now(timezone(timedelta(hours=9))).date()
  dates=[(today-timedelta(days=299-i)).isoformat() for i in range(300)]
  rows,stock=compute_group('KOSPI','전자부품 제조업',{'A':dict(zip(dates,range(1,301))),'B':dict(zip(dates,range(500,200,-1)))})
  self.assertEqual(rows[-1]['n60'],2)
  self.assertEqual(rows[-1]['breadth60'],50)
  self.assertEqual(rows[-1]['nh'],1)
  self.assertEqual(rows[-1]['nl'],1)
  self.assertEqual(rows[-1]['hli'],50)
  self.assertEqual(len(stock),2)
 def test_membership_change_is_revisited(self):
  groups={'KOSPI|A':[{'code':'000001'},{'code':'000002'}], 'KOSPI|B':[{'code':'000003'}]}
  status={'groups':{'KOSPI|A':{'members':members(groups['KOSPI|A']),'updated_at':'2026-01-01'},'KOSPI|B':{'members':members(groups['KOSPI|B']),'updated_at':'2026-01-01'}}}
  self.assertEqual(choose(groups,status,1),['KOSPI|A'])
  groups['KOSPI|B'].append({'code':'000004'})
  self.assertEqual(choose(groups,status,1),['KOSPI|B'])
 def test_failed_group_does_not_block_next_batch(self):
  groups={'KOSPI|A':[{'code':'000001'},{'code':'000002'}], 'KOSPI|B':[{'code':'000003'}]}
  self.assertEqual(choose(groups,{'groups':{},'attempts':{'KOSPI|A':1}},1),['KOSPI|B'])
 def test_intraday_bar_excluded_and_old_session_detected(self):
  from datetime import datetime,timezone,timedelta
  k=timezone(timedelta(hours=9))
  self.assertEqual(last_confirmed(datetime(2026,10,14,9,30,tzinfo=k)),'2026-10-13')
  self.assertEqual(last_confirmed(datetime(2026,10,14,16,30,tzinfo=k)),'2026-10-14')
  self.assertTrue(published_during_session({'latest':'2026-10-14','updated_at':'2026-10-14T09:27:13+09:00'}))
  self.assertFalse(published_during_session({'latest':'2026-10-14','updated_at':'2026-10-14T16:50:13+09:00'}))
 def test_zero_new_high_is_zero_not_missing(self):
  from datetime import datetime,timedelta,timezone
  today=datetime.now(timezone(timedelta(hours=9))).date()
  dates=[(today-timedelta(days=259-i)).isoformat() for i in range(260)]
  values=[100+i%20 for i in range(260)];values[-1]=105
  rows,_=compute_group('KOSDAQ','example',{'A':dict(zip(dates,values))})
  self.assertEqual(rows[-1]['n250'],1)
  self.assertEqual(rows[-1]['hli'],0)
 def test_new_listing_keeps_price_without_a_breadth_denominator(self):
  from datetime import datetime,timedelta,timezone
  today=datetime.now(timezone(timedelta(hours=9))).date()
  dates=[(today-timedelta(days=29-i)).isoformat() for i in range(30)]
  rows,stocks=compute_group('KOSDAQ','new industry',{'A':dict(zip(dates,range(100,130)))})
  self.assertEqual(rows,[])
  self.assertEqual(len(stocks),1)
  self.assertEqual(stocks[0]['sma60'],'')
if __name__=='__main__':unittest.main()
