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
 // 컨센서스 EPS 추정치 리비전: 90일 전 대비 % 변화(공통 기준), 기간별 선
 const RP=[['0q','이번 분기','#3987e5',[]],['+1q','다음 분기','#d95926',[6,4]],['0y','올해(회계)','#199e70',[2,3]],['+1y','내년(회계)','#c98500',[10,3,2,3]]];
 const RX=[['d90','90일 전'],['d60','60일 전'],['d30','30일 전'],['d7','7일 전'],['now','현재']];
 const revChg=(r,from='d90')=>{const a=r?.[from],b=r?.now;if(a===null||a===undefined||b===null||b===undefined||Math.abs(a)<0.05||a*b<0)return null;return (b-a)/Math.abs(a)*100;};
 function drawRevision(c){
  const R=c.revision||{},note=$('epsRevNote');
  const sets=RP.filter(([k])=>R[k]&&revChg(R[k])!==null).map(([k,name,col,dash])=>({label:`${name} ${pct(revChg(R[k]))}`,_n:name,data:RX.map(([f])=>{const a=R[k].d90,v=R[k][f];return v===null||v===undefined?null:(v-a)/Math.abs(a)*100;}),borderColor:col,backgroundColor:col,borderDash:dash,borderWidth:2,pointRadius:3,pointHoverRadius:6,tension:0,spanGaps:true,_k:k}));
  const cnt=RP.filter(([k])=>R[k]&&(R[k].up30!==undefined||R[k].down30!==undefined)).map(([k,name])=>`${name} ↑${R[k].up30??0}·↓${R[k].down30??0}`);
  const skipped=RP.filter(([k])=>R[k]&&revChg(R[k])===null).map(([,n])=>n);
  note.textContent=(cnt.length?'최근 30일 추정치 상향·하향 애널리스트 수: '+cnt.join(' / '):'')+(skipped.length?` · ${skipped.join('·')}: 기준값이 0 근처이거나 부호가 바뀌어 % 변화 생략`:'');
  if(!sets.length){note.textContent='컨센서스 추정치 변화 자료가 없습니다.'+(note.textContent?' '+note.textContent:'');return;}
  const o=opts('컨센서스 EPS 추정치 변화 (90일 전 대비 %, 범례 = 현재값)',v=>pct(v));
  o.plugins.legend.labels.boxWidth=24;o.plugins.legend.labels.boxHeight=2;o.plugins.tooltip.callbacks.label=ctx=>{const d=ctx.dataset,r=R[d._k],f=RX[ctx.dataIndex][0];return `${d._n}: ${pct(ctx.parsed.y)} (EPS ${fmt(r?.[f])})`;};
  o.scales.y.grace='12%';
  charts.push(new Chart($('epsSurprise'),{type:'line',data:{labels:RX.map(x=>x[1]),datasets:sets},options:o}));
 }
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
   // 컨센서스 = 막대, 실제 = 점(상회 빨강·하회 파랑), 점 위에 서프라이즈 % 표기
   const pc=q.map(x=>x.eps_estimate===null?C.act:x.eps_actual>=x.eps_estimate?C.beat:C.miss);
   const surpLabel={id:'surpLabel',afterDatasetsDraw(ch){const m=ch.getDatasetMeta(1),g=ch.ctx;if(m.hidden)return;g.save();g.font='600 11px Arial,"Noto Sans KR",sans-serif';g.textAlign='center';g.textBaseline='bottom';
    m.data.forEach((pt,i)=>{const v=q[i].surprise_pct;if(v===null||v===undefined||!isFinite(pt.y))return;const t=pct(v),w=g.measureText(t).width+8,y=pt.y-10;g.fillStyle='rgba(11,20,38,.88)';g.beginPath();g.roundRect?g.roundRect(pt.x-w/2,y-14,w,15,4):g.rect(pt.x-w/2,y-14,w,15);g.fill();g.fillStyle=pc[i];g.fillText(t,pt.x,y);});g.restore();}};
   const o=opts('분기 EPS: 컨센서스(막대) vs 실제(점) · 점 위 % = 서프라이즈',v=>fmt(v));
   o.layout={padding:{top:16}};o.plugins.legend.labels.usePointStyle=true;o.plugins.legend.labels.sort=(x,y)=>x.datasetIndex-y.datasetIndex;
   o.plugins.tooltip.callbacks.label=ctx=>ctx.datasetIndex===1?`실제 EPS: ${fmt(ctx.parsed.y)} (${pct(q[ctx.dataIndex].surprise_pct)}${q[ctx.dataIndex].result?' '+q[ctx.dataIndex].result:''})`:`컨센서스 EPS: ${fmt(ctx.parsed.y)}`;
   const vals=q.flatMap(x=>[x.eps_estimate,x.eps_actual]).filter(v=>v!==null&&isFinite(v)),hi=Math.max(0,...vals),lo=Math.min(0,...vals),span=(hi-lo)||1;
   o.scales.y.suggestedMax=hi+span*0.12;if(lo<0)o.scales.y.suggestedMin=lo-span*0.05;
   charts.push(new Chart($('epsChart'),{type:'bar',data:{labels:L,datasets:[
    {label:'컨센서스 EPS',data:q.map(x=>x.eps_estimate),backgroundColor:C.est,borderRadius:4,maxBarThickness:30,order:2,pointStyle:'rect'},
    {type:'line',label:'실제 EPS (빨강 상회·파랑 하회)',data:q.map(x=>x.eps_actual),showLine:false,pointRadius:6,pointHoverRadius:8,pointBackgroundColor:pc,pointBorderColor:'#0b1426',pointBorderWidth:2,backgroundColor:C.beat,borderColor:C.beat,order:1,pointStyle:'circle'}]},
    options:o,plugins:[surpLabel]}));
   drawRevision(c);
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
   const cells=st&&st.n?[[`${x.name} (${x.ticker})`,''],[x.sector,''],[`${st.beat}/${st.n}`,''],[fmt(st.n?st.beat/st.n*100:null,0)+'%',''],[pct(st.med),cls(st.med)],[st.last?pct(st.last.surprise_pct):'—',cls(st.last?.surprise_pct)],[st.last?.date||'—',''],[pct(revChg(c?.revision?.['+1y'],'d30')),cls(revChg(c?.revision?.['+1y'],'d30'))]]
    :[[`${x.name} (${x.ticker})`,''],[x.sector,''],['—','wait'],['—','wait'],['자료 없음','wait'],['—','wait'],['—','wait'],['—','wait']];
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
