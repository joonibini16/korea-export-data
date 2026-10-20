(function(){
 'use strict';
 const $=id=>document.getElementById(id),colors={bad:'#f87171',warn:'#fbbf24',ok:'#4ade80',na:'#64748b'},names={bad:'경고',warn:'주의',ok:'정상',na:'자료 없음'};
 if(!$('signal-history-chart'))return;
 let data,chart,visible=[],loading=false;
 const fmt=t=>new Date(t).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
 function detail(date){
  const records=data.records,index=records.findIndex(r=>r.date===date),r=records[index],prior=records[index-1];if(!r)return;
  $('signal-history-date').value=date;
  $('signal-history-detail').textContent=`${date} · ${names[r.state]} · 경고 ${r.bad} / 주의 ${r.warn} / 정상 ${r.ok} · 유효 지표 ${r.total}개 · ${r.kind==='observed'?'실제 관측 '+fmt(r.observed_at)+' KST':'과거 재계산'}`;
  $('signal-history-detail').style.color=colors[r.state];
  const before=new Map((prior?.signals||[]).map(s=>[s.name,s]));
  const changes=r.signals.filter(s=>before.has(s.name)&&before.get(s.name).state!==s.state);
  $('signal-history-changes').textContent=prior?`직전 기록 ${prior.date} 대비: `+(changes.length?changes.map(s=>`${s.name} ${names[before.get(s.name).state]} → ${names[s.state]}`).join(' · '):'상태가 바뀐 지표 없음'):'직전 비교 기록 없음';
  const body=$('signal-history-rows');body.replaceChildren();
  for(const s of r.signals){const tr=document.createElement('tr');const old=before.get(s.name);for(const text of [s.name,names[s.state],s.value,s.data_date||'복합 지표',old?names[old.state]+' → '+names[s.state]:'—']){const td=document.createElement('td');td.textContent=text;tr.append(td);}tr.children[1].style.color=colors[s.state];tr.title=s.basis;body.append(tr);}
 }
 function render(){
  const all=data.records,last=all.at(-1),days=$('signal-history-range').value,start=new Date(last.date+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-Number(days||36500));
  visible=all.filter(r=>r.date>=start.toISOString().slice(0,10));
  const prev=all.at(-2),delta=prev?` · 직전(${prev.date}) 대비 경고 ${last.bad-prev.bad>=0?'+':''}${last.bad-prev.bad}개 / 주의 ${last.warn-prev.warn>=0?'+':''}${last.warn-prev.warn}개`:'';
  $('signal-history-summary').textContent=`최근 ${last.date}: ${names[last.state]} · 경고 ${last.bad} · 주의 ${last.warn} / ${last.total}${delta}`;
  $('signal-history-summary').style.color=colors[last.state];
  $('signal-history-updated').textContent=`일별 이력 갱신 ${fmt(data.updated_at)} KST · ${all.length}일 저장 · ${all.filter(r=>r.kind==='observed').length}일 실제 관측 · 최신일은 장중 수집에 따라 변경될 수 있습니다.`;
  const selected=$('signal-history-date').value,select=$('signal-history-date');select.replaceChildren();
  for(const r of [...visible].reverse()){const o=document.createElement('option');o.value=r.date;o.textContent=r.date+(r.kind==='observed'?' · 실제 관측':' · 재계산');select.append(o);}
  const maxSignals=Math.max(...all.map(r=>r.signals.length));
  const avg=new Map(all.map((r,i)=>{const w=all.slice(i-6,i+1);return[r.date,w.length===7?w.reduce((sum,x)=>sum+x.pressure,0)/7:null];}));
  const datasets=[['bad','경고'],['warn','주의'],['ok','정상'],['na','자료 없음']].map(([key,label])=>({type:'bar',label,data:visible.map(r=>key==='na'?maxSignals-r.total:r[key]),backgroundColor:colors[key],borderWidth:0,stack:'counts',yAxisID:'y',order:2}));
  datasets.push({type:'line',label:'경고·주의 비율 7관측일 평균',data:visible.map(r=>avg.get(r.date)),borderColor:'#93c5fd',backgroundColor:'#93c5fd',borderWidth:2.5,pointRadius:0,pointHitRadius:10,yAxisID:'y1',order:0,spanGaps:false});
  chart?.destroy();chart=new Chart($('signal-history-chart'),{type:'bar',data:{labels:visible.map(r=>r.date),datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},onClick:(_,items)=>{if(items.length)detail(visible[items[0].index].date);},plugins:{legend:{position:'bottom'},tooltip:{callbacks:{title:items=>{const r=visible[items[0].dataIndex];return r.date+' · '+(r.kind==='observed'?'실제 관측':'과거 재계산');},label:c=>c.dataset.type==='line'?c.dataset.label+': '+c.parsed.y.toFixed(1)+'%':c.dataset.label+': '+c.parsed.y+'개',footer:items=>{const r=visible[items[0].dataIndex];return `경고·주의 ${r.bad+r.warn} / 유효 ${r.total}개 (${r.pressure.toFixed(1)}%)\n클릭하면 지표별 변화를 아래에 표시합니다.`;}}}},scales:{x:{stacked:true,ticks:{maxTicksLimit:8},grid:{display:false}},y:{stacked:true,min:0,max:maxSignals,ticks:{stepSize:3},title:{display:true,text:'지표 개수'}},y1:{position:'right',min:0,max:100,grid:{drawOnChartArea:false},title:{display:true,text:'경고·주의 비율 (%)'}}}}});
  detail(visible.some(r=>r.date===selected)?selected:last.date);
 }
 async function load(){if(loading)return;loading=true;try{const r=await fetch('./bubble_signal_history.json?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const next=await r.json();if(!next.records?.length)throw Error('저장된 이력 없음');data=next;render();}catch(e){$('signal-history-updated').textContent='일별 이력 갱신 실패: '+e.message+(data?' · 마지막 정상 이력을 유지합니다.':'');}finally{loading=false;}}
 $('signal-history-range').addEventListener('change',render);$('signal-history-date').addEventListener('change',e=>detail(e.target.value));$('signal-history-refresh').addEventListener('click',load);
 setInterval(()=>{if(!document.hidden)load();},15*60*1000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});load();
})();
