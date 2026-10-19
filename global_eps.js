// 실적 분석 탭: 분기 EPS 실제 vs 컨센서스(최근 2년) · 선택 기업 차트 + 업종 내 전체 기업 요약
(async function(){
 const sec=document.getElementById('epsPanel');if(!sec)return;
 const $=id=>document.getElementById(id);
 const C={est:'#7c8ba3',act:'#fbbf24',beat:'#f87171',miss:'#60a5fa',grid:'#22314f',tick:'#a9b8ce'};
 let E,W;
 try{[E,W]=await Promise.all(['global_eps_surprise.json','global_earnings.json'].map(f=>fetch('./'+f+'?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(f+' HTTP '+r.status);return r.json();})));}
 catch(e){$('epsMeta').textContent='EPS 컨센서스 자료가 아직 없습니다. (수집 대기)';return;}
 const list=W.watchlist||[],info=new Map(list.map(x=>[x.ticker,x])),byT=new Map((E.companies||[]).map(c=>[c.ticker,c])),miss=new Map((E.missing||[]).map(m=>[m.ticker,m.reason]));
 const fmt=(v,d=2)=>v===null||v===undefined?'—':Number(v).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
 const pct=v=>v===null||v===undefined?'—':(v>0?'+':'')+fmt(v,1)+'%';
 const lab=d=>d.slice(2,4)+'.'+d.slice(5,7);
 const cls=v=>v===null||v===undefined?'':v>0?'up':v<0?'down':'flat';
 const valid=c=>(c?.quarters||[]).filter(q=>q.eps_estimate!==null&&q.eps_estimate!==undefined);
 function stats(c){const q=valid(c),s=q.map(x=>x.surprise_pct).filter(v=>v!==null&&isFinite(v));const beat=q.filter(x=>x.eps_actual>x.eps_estimate).length;
  const sorted=[...s].sort((a,b)=>a-b),med=sorted.length?sorted[Math.floor((sorted.length-1)/2)]/2+sorted[Math.ceil((sorted.length-1)/2)]/2:null;
  return {n:q.length,beat,med,last:q.at(-1)||null};}
 $('epsMeta').textContent=`자료: ${E.provider} · 수집 ${String(E.updated_at).slice(0,16).replace('T',' ')} KST · ${E.method}`;
 let charts=[],cur=null;
 const opts=(title,yFmt)=>({responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
  plugins:{title:{display:true,text:title,color:'#e2e8f0',font:{size:13}},legend:{labels:{color:C.tick,boxWidth:12}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${yFmt(ctx.parsed.y)}`}}},
  scales:{x:{ticks:{color:C.tick},grid:{display:false}},y:{ticks:{color:C.tick,callback:v=>yFmt(v)},grid:{color:C.grid}}}});
 function draw(t){
  if(t===cur)return;cur=t;charts.forEach(c=>c.destroy());charts=[];const body=$('epsRows');body.replaceChildren();
  const c=byT.get(t),w=info.get(t),name=w?`${w.name} (${t})`:t;
  if(!t){$('epsCompany').textContent='기업을 선택하세요.';$('epsCharts').hidden=true;return;}
  const q=c?.quarters||[];
  if(!q.length){$('epsCompany').textContent=`${name}: 최근 2년 EPS 컨센서스 자료가 없습니다.${miss.get(t)?' ('+miss.get(t)+')':''}`;$('epsCharts').hidden=true;return;}
  const s=stats(c);$('epsCharts').hidden=false;
  $('epsCompany').textContent=`${name} · 통화 ${c.currency||'—'} · 최근 ${q.length}회 발표 중 컨센서스 상회 ${s.beat}회/${s.n}회 · 서프라이즈 중앙값 ${pct(s.med)}`+(c.method==='earnings_history'?' · 발표일 대신 분기 말일 표시(대체 자료)':'');
  const L=q.map(x=>lab(x.date));
  if(window.Chart){
   charts.push(new Chart($('epsChart'),{type:'bar',data:{labels:L,datasets:[
    {label:'컨센서스 EPS',data:q.map(x=>x.eps_estimate),backgroundColor:C.est,borderRadius:4,maxBarThickness:22},
    {label:'실제 EPS',data:q.map(x=>x.eps_actual),backgroundColor:C.act,borderRadius:4,maxBarThickness:22}]},
    options:opts('분기 EPS: 컨센서스 vs 실제 (발표 월)',v=>fmt(v))}));
   const sp=q.map(x=>x.surprise_pct);
   charts.push(new Chart($('epsSurprise'),{type:'bar',data:{labels:L,datasets:[{label:'EPS 서프라이즈(%)',data:sp,backgroundColor:sp.map(v=>v>=0?C.beat:C.miss),borderRadius:4,maxBarThickness:22}]},
    options:Object.assign(opts('컨센서스 대비 서프라이즈(%) · 빨강 상회 / 파랑 하회',v=>pct(v)),{plugins:{title:{display:true,text:'컨센서스 대비 서프라이즈(%) · 빨강 상회 / 파랑 하회',color:'#e2e8f0',font:{size:13}},legend:{display:false},tooltip:{callbacks:{label:ctx=>'서프라이즈: '+pct(ctx.parsed.y)}}}})}));
  }
  for(const x of [...q].reverse()){const tr=document.createElement('tr');
   for(const [v,k] of [[x.date,''],[fmt(x.eps_estimate),''],[fmt(x.eps_actual),''],[pct(x.surprise_pct),cls(x.surprise_pct)],[x.result||'—',cls(x.surprise_pct)]]){const td=document.createElement('td');td.textContent=v;if(k)td.className=k;tr.append(td);}
   body.append(tr);}
 }
 function table(){
  const s=$('sector')?.value||'',body=$('epsSummary');body.replaceChildren();
  const rows=list.filter(x=>!s||x.sector===s).map(x=>({x,c:byT.get(x.ticker)})).map(o=>({...o,s:o.c?stats(o.c):null}))
   .sort((a,b)=>(b.s?.n?1:0)-(a.s?.n?1:0)||((b.s?.n||0)>=4)-((a.s?.n||0)>=4)||(b.s?.med??-1e9)-(a.s?.med??-1e9));
  $('epsSummaryTitle').textContent=`${s||'전체 업종'} · 기업별 EPS 컨센서스 상회 이력 (최근 2년)`;
  for(const {x,c,s:st} of rows){const tr=document.createElement('tr');tr.tabIndex=0;tr.dataset.t=x.ticker;if(x.ticker===cur)tr.setAttribute('aria-selected','true');
   const cells=st&&st.n?[[`${x.name} (${x.ticker})`,''],[x.sector,''],[`${st.beat}/${st.n}`,''],[fmt(st.n?st.beat/st.n*100:null,0)+'%',''],[pct(st.med),cls(st.med)],[st.last?pct(st.last.surprise_pct):'—',cls(st.last?.surprise_pct)],[st.last?.date||'—','']]
    :[[`${x.name} (${x.ticker})`,''],[x.sector,''],['—','wait'],['—','wait'],['자료 없음','wait'],['—','wait'],['—','wait']];
   for(const [v,k] of cells){const td=document.createElement('td');td.textContent=v;if(k)td.className=k;tr.append(td);}
   body.append(tr);}
 }
 $('epsSummary').addEventListener('click',e=>{const tr=e.target.closest('tr[data-t]');if(!tr)return;const w=info.get(tr.dataset.t),sel=$('sector'),pick=$('companyPick');
  if(sel&&w&&sel.value&&sel.value!==w.sector){sel.value=w.sector;sel.dispatchEvent(new Event('change'));}
  if(pick){pick.value=tr.dataset.t;pick.dispatchEvent(new Event('change'));}draw(tr.dataset.t);table();sec.scrollIntoView({behavior:'smooth'});});
 $('epsSummary').addEventListener('keydown',e=>{if(e.key==='Enter')e.target.closest('tr[data-t]')?.click();});
 $('sector')?.addEventListener('change',table);
 const sync=()=>{const v=$('companyPick')?.value||'';if(v!==cur){draw(v);table();}};
 $('companyPick')?.addEventListener('change',sync);setInterval(sync,600);
 window.addEventListener('resize',()=>charts.forEach(c=>c.resize()));
 table();sync();
})();
