/* User-supplied DB snapshot. Kept separate from KRX/Naver-derived Breadth. */
(async()=>{
 const root=document.getElementById('dbBreadth'),status=document.getElementById('dbBreadthStatus');
 if(!root||!status)return;
 try{
  const resp=await fetch('./breadth_external_snapshots.json?v='+Date.now(),{cache:'no-store'});
  if(!resp.ok)throw Error('HTTP '+resp.status);
  const data=await resp.json(),s=[...(data.snapshots||[])].sort((a,b)=>a.captured_at.localeCompare(b.captured_at)).at(-1);
  if(!s||!Array.isArray(s.markets)||s.markets.length!==2)throw Error('스냅샷 형식 오류');
  const latest=s.captured_at.replace('T',' ').slice(0,16);
  status.textContent=latest+' KST · 사용자 제공 DB 화면. 과거 네 관측점의 정확한 거래일은 이미지에 표시되지 않았습니다. 이 값은 기존 KRX·네이버 산식과 별도로 표시하며 종합 경고등에는 반영하지 않습니다. 지수 값은 화면 캡처 시점 값으로 확정 종가가 아닐 수 있습니다.';
  const capturedDay=s.captured_at.slice(0,10);
  const labels=['이전 4 · 날짜 미확인','이전 3 · 날짜 미확인','이전 2 · 날짜 미확인','이전 1 · 날짜 미확인',capturedDay];
  for(const x of s.markets){
   const series=[[x.breadth_recent,x.breadth5sma_recent,x.breadth60,x.breadth5sma,'Breadth_60','5-SMA','#fb784e'],[x.hli_recent,x.hli10sma_recent,x.hli,x.hli10sma,'HLI','10-SMA','#22d3ee']];
   if(!['KOSPI','KOSDAQ'].includes(x.market)||series.some(([a,b,v,m])=>!Array.isArray(a)||a.length!==5||!Array.isArray(b)||b.length!==5||![...a,...b,v,m].every(Number.isFinite)||a[4]!==v||Math.abs(b[4]-m)>.001))throw Error('관측값 검증 실패');
   const card=document.createElement('article');card.className='db-card';
   const head=document.createElement('div');head.className='db-head';
   const title=document.createElement('h3');title.textContent=x.market;
   const idx=document.createElement('span');idx.textContent='화면 지수 '+x.index_at_capture.toLocaleString('ko-KR',{minimumFractionDigits:2});
   head.append(title,idx);card.append(head);
   for(const [a,b,v,m,label,ma,color] of series){
    const box=document.createElement('div');box.className='db-metric';
    const p=document.createElement('p');p.textContent=label+' '+v.toFixed(1)+' · '+ma+' '+m.toFixed(1);
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',x.market+' '+label+' 최근 5개 관측과 '+ma);
    const wrap=document.createElement('div');wrap.className='db-plot';wrap.append(canvas);box.append(p,wrap);card.append(box);
    new Chart(canvas,{type:'line',data:{labels,datasets:[
     {label,data:a,borderColor:color,backgroundColor:color+'33',fill:true,borderWidth:3,pointRadius:3,tension:0},
     {label:ma,data:b,borderColor:'#34d399',backgroundColor:'#34d399',borderWidth:2,pointRadius:2,tension:0}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false,axis:'x'},plugins:{legend:{labels:{color:'#cbd5e1'}},tooltip:{mode:'index',intersect:false,callbacks:{title:items=>items[0]?.label||'',label:item=>item.dataset.label+': '+Number(item.parsed.y).toLocaleString('ko-KR',{maximumFractionDigits:1})}}},scales:{x:{ticks:{color:'#94a3b8'},grid:{display:false}},y:{ticks:{color:'#94a3b8'},grid:{color:'rgba(148,163,184,.13)'}}}}});
   }
   const detail=document.createElement('details');
   const summary=document.createElement('summary');summary.textContent='최근 5개 관측값 표로 확인';
   const table=document.createElement('table');table.className='db-data-table';
   const thead=document.createElement('thead');const header=document.createElement('tr');
   ['관측일','Breadth_60','5-SMA','HLI','10-SMA'].forEach(name=>{const th=document.createElement('th');th.textContent=name;header.append(th)});
   thead.append(header);const tbody=document.createElement('tbody');
   for(let i=0;i<5;i++){const row=document.createElement('tr');
    [labels[i],x.breadth_recent[i],x.breadth5sma_recent[i],x.hli_recent[i],x.hli10sma_recent[i]].forEach(value=>{const td=document.createElement('td');td.textContent=typeof value==='number'?value.toLocaleString('ko-KR',{maximumFractionDigits:1}):value;row.append(td)});
    tbody.append(row);
   }
   table.append(thead,tbody);detail.append(summary,table);card.append(detail);
   root.append(card);
  }
 }catch(e){status.textContent='DB 참고 스냅샷을 표시하지 못했습니다: '+e.message;}
})();
