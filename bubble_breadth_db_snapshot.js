/* DB 관측값으로 추론한 지표. 공식 DB 산식·모집단 미확인. */
(async()=>{
 const root=document.getElementById('dbSnapshot'),status=document.getElementById('dbSnapshotStatus');
 if(!root||!status)return;
 const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const get=async file=>{const r=await fetch('./'+file+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
 const results=await Promise.allSettled([get('breadth_db_proxy.json'),get('breadth_external_snapshots.json')]);
 const data=results[0].status==='fulfilled'?results[0].value:null;
 const snapshots=results[1].status==='fulfilled'?results[1].value.snapshots||[]:[];
 const latest=snapshots.filter(x=>x.captured_at).sort((a,b)=>a.captured_at.localeCompare(b.captured_at)).at(-1);
 document.getElementById('dbSnapshotTitle').textContent='DB 산식 추정 · 매일 자동 계산';
 status.textContent='Breadth_60 = 60일 종가 신고가 수 − 신저가 수 · HLI = 신고가 수 ÷ (신고가 수 + 신저가 수) × 100. KIND 상장법인·네이버 일봉 기준, 당일 거래량 0인 종목은 제외합니다. DB 원본 산식·모집단은 미확인으로 실제 DB 값과 차이가 날 수 있습니다. 평일 09:30·10:30·13:00·15:40·20:40·21:30 수집 예약(실제 완료·배포는 지연될 수 있음). '+(data?'수집 시각 '+data.updated_at.replace('T',' ')+' · 거래일별 종가 기반, 장중 값은 잠정.':'첫 자동 계산 결과를 기다리는 중입니다. 아래는 기존 사진 참고값입니다.');
 root.replaceChildren();
 for(const market of ['KOSPI','KOSDAQ']){
  const rows=data?.markets?.[market]||[],x=rows.at(-1);
  const observed=latest?.markets.find(r=>r.market===market);
  const card=document.createElement('article');card.className='db-card';
  const head=document.createElement('div');head.className='db-head';
  const title=document.createElement('h3');title.textContent=(market==='KOSPI'?'코스피':'코스닥')+' · '+(x?'산식 추정':'DB 사진 참고');
  const date=document.createElement('span');date.textContent='기준일 '+(x?.date||latest?.captured_at.slice(0,10)||'—');
  head.append(title,date);card.append(head);
  const table=document.createElement('table');table.className='db-data-table';const body=document.createElement('tbody');
  for(const [label,key] of [['Breadth_60','breadth60'],['5-SMA','breadth5sma'],['HLI (%)','hli'],['10-SMA (%)','hli10sma']]){
   const tr=document.createElement('tr'),a=document.createElement('th'),b=document.createElement('td');a.scope='row';a.textContent=label;b.textContent=fmt((x||observed)?.[key]);tr.append(a,b);body.append(tr);
  }
  table.append(body);card.append(table);
  const note=document.createElement('p');note.className='muted';
  note.textContent=x?'계산 표본 '+fmt(x.n,0)+'개 · 신고가 '+fmt(x.nh60,0)+'개 / 신저가 '+fmt(x.nl60,0)+'개. 5-SMA·10-SMA는 각각 5·10거래일 평균.':'자동 계산 대기 · 사진의 날짜와 값은 자동 갱신값이 아닙니다.';card.append(note);
  root.append(card);
  if(x&&typeof Chart!=='undefined'){
   for(const [keys,names] of [[['breadth60','breadth5sma'],['Breadth_60','5-SMA']],[['hli','hli10sma'],['HLI (%)','10-SMA (%)']]]){
    const box=document.createElement('div');box.style.cssText='height:210px;position:relative;margin-top:12px';const canvas=document.createElement('canvas');box.append(canvas);card.append(box);
    const recent=rows.slice(-120);new Chart(canvas,{type:'line',data:{labels:recent.map(r=>r.date),datasets:keys.map((k,i)=>({label:names[i],data:recent.map(r=>r[k]),borderColor:i?'#f59e0b':'#38bdf8',borderWidth:i?2:1.5,pointRadius:0,pointHitRadius:8,spanGaps:false}))},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#cbd5e1'}}},scales:{x:{ticks:{color:'#94a3b8',maxTicksLimit:5}},y:{ticks:{color:'#94a3b8'},...(keys[0]==='hli'?{min:0,max:100}:{})}}}});
   }
  }
  if(observed&&x){
   const ref=document.createElement('p');ref.className='muted';
   const same=rows.find(r=>r.date===latest.captured_at.slice(0,10));
   ref.textContent='DB 사진 참고 ('+latest.captured_at.slice(0,10)+'): Breadth '+fmt(observed.breadth60)+', HLI '+fmt(observed.hli)+'%. '+(same?'동일 날짜 계산값과 차이: Breadth '+fmt(same.breadth60-observed.breadth60)+', HLI '+fmt(same.hli-observed.hli)+'%p.':'동일 날짜 비교 자료 없음.');card.append(ref);
  }
 }
})();
