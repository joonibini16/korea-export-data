/* 사용자 제공 DB 화면의 관측값. 자동 수집 지표와 계산식이 다르다. */
(async()=>{
 const root=document.getElementById('dbSnapshot'),status=document.getElementById('dbSnapshotStatus');
 if(!root||!status)return;
 try{
  const res=await fetch('./breadth_external_snapshots.json?v='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json(),latest=(data.snapshots||[]).filter(x=>x.captured_at&&Array.isArray(x.markets)).sort((a,b)=>a.captured_at.localeCompare(b.captured_at)).at(-1);
  if(!latest)throw Error('DB 참고 관측값 없음');
  const at=latest.captured_at.replace('T',' ').replace(/:\d\d\+09:00$/,' KST');
  status.textContent='사용자 제공 DB 화면 · '+at+' · 화면에서 읽은 고정 관측값입니다. 아래 자동 수집 지표와 계산식·표본이 다르며, DB 원본 피드가 없어 새 날짜로 자동 갱신되지 않습니다.';
  root.replaceChildren();
  for(const x of latest.markets){
   const card=document.createElement('article');card.className='db-card';
   const head=document.createElement('div');head.className='db-head';
   const title=document.createElement('h3');title.textContent=x.market==='KOSPI'?'코스피 · DB 참고':'코스닥 · DB 참고';
   const index=document.createElement('span');index.textContent='지수 '+(Number.isFinite(x.index_at_capture)?x.index_at_capture.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—');
   head.append(title,index);card.append(head);
   const table=document.createElement('table');table.className='db-data-table';
   const body=document.createElement('tbody');
   for(const [label,value,unit] of [
    ['Breadth_60',x.breadth60,''],['5-SMA',x.breadth5sma,''],['HLI',x.hli,''],['10-SMA',x.hli10sma,'']
   ]){const tr=document.createElement('tr'),a=document.createElement('th'),b=document.createElement('td');a.scope='row';a.textContent=label;b.textContent=Number.isFinite(value)?(value>0&&label==='Breadth_60'?'+':'')+value.toFixed(1)+unit:'—';tr.append(a,b);body.append(tr);}
   table.append(body);card.append(table);root.append(card);
  }
 }catch(e){status.textContent='DB 참고 관측값을 표시하지 못했습니다: '+e.message;}
})();
