// 실적 분석 탭: 매출 가이던스(직전 분기 회사 제시) 대비 실제 매출 · 공식 IR 기준 · 분기별 해석
(async function(){
 const sec=document.getElementById('revGuidePanel');if(!sec)return;
 const $=id=>document.getElementById(id);
 const C={band:'rgba(124,139,163,.55)',next:'rgba(201,133,0,.45)',beat:'#f87171',miss:'#60a5fa',grid:'#22314f',tick:'#a9b8ce'};
 let G,W;
 try{[G,W]=await Promise.all(['global_revenue_guidance.json','global_earnings.json'].map(f=>fetch('./'+f+'?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(f+' HTTP '+r.status);return r.json();})));}
 catch(e){$('rgMeta').textContent='매출 가이던스 자료를 읽지 못했습니다.';return;}
 const info=new Map((W.watchlist||[]).map(x=>[x.ticker,x])),byT=new Map((G.companies||[]).map(c=>[c.ticker,c])),pend=new Map((G.pending||[]).map(p=>[p.ticker,p.reason]));
 $('rgMeta').textContent=`자료: ${G.method} · 자료 검토일 ${G.updated_at} · 대상 ${byT.size}개 기업(분기 매출 가이던스를 숫자로 제시하는 기업)`;
 const sym=c=>c==='EUR'?'€':c==='USD'?'$':c+' ';
 const bn=(v,cur)=>v===null||v===undefined?'—':sym(cur)+(v/1000).toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})+'bn';
 const pct=(v,d=1)=>v===null||v===undefined||!isFinite(v)?'—':(v>0?'+':'')+v.toFixed(d)+'%';
 const mid=(lo,hi)=>lo===undefined||lo===null?null:(lo+hi)/2;
 const lab=x=>x.report_date?x.report_date.slice(2,4)+'.'+x.report_date.slice(5,7):x.period;
 // 분기별 지표 계산
 function metrics(c){
  const q=c.quarters;return q.map((x,i)=>{const m=mid(x.guide_low,x.guide_high),a=x.actual;
   const vs=m?(a-m)/m*100:null,pos=(m&&x.guide_high>x.guide_low)?(a-x.guide_low)/(x.guide_high-x.guide_low)*100:null;
   const nm=mid(x.next_guide_low,x.next_guide_high),impl=nm?(nm/a-1)*100:null;
   const p=q[i-1],pImpl=p&&mid(p.next_guide_low,p.next_guide_high)?(mid(p.next_guide_low,p.next_guide_high)/p.actual-1)*100:null;
   const y=q.find(o=>o.quarter_end&&x.quarter_end&&Math.abs(new Date(x.quarter_end)-new Date(o.quarter_end)-365*864e5)<20*864e5);
   const yoy=y?(a/y.actual-1)*100:null,qoq=p?(a/p.actual-1)*100:null;
   return {x,m,vs,pos,nm,impl,pImpl,yoy,qoq};});
 }
 function zone(r){const x=r.x;if(r.m===null)return '가이던스 없음';if(x.guide_high===x.guide_low)return r.vs>=0?'단일 가이던스 상회':'단일 가이던스 하회';
  if(r.x.actual>x.guide_high)return '가이던스 상단 초과';if(r.x.actual<x.guide_low)return '가이던스 하단 미달';return r.pos>=50?'범위 상단부':'범위 하단부';}
 function interpret(rows,i,cur){
  const r=rows[i],x=r.x,out=[];
  const others=rows.filter((o,j)=>j!==i&&o.vs!==null).map(o=>o.vs),avg=others.length?others.reduce((s,v)=>s+v,0)/others.length:null;
  if(r.m!==null){
   let s=`실적 ${bn(x.actual,cur)}, 가이던스 중간값 ${bn(r.m,cur)} 대비 ${pct(r.vs)} (${zone(r)}${r.pos!==null&&r.pos>=0&&r.pos<=100?`, 범위 내 ${r.pos.toFixed(0)}% 위치`:''}).`;
   if(avg!==null){const d=r.vs-avg;s+=Math.abs(d)<1.5?` 2년 평균 상회 폭(${pct(avg)})과 비슷한 통상적 결과.`:d>0?` 평균 상회 폭(${pct(avg)})보다 ${d.toFixed(1)}%p 커 수요가 회사 예상보다 강했음.`:` 평균 상회 폭(${pct(avg)})보다 ${(-d).toFixed(1)}%p 작아 상회 여력 축소 신호.`;}
   out.push(s);
  }else out.push(`실적 ${bn(x.actual,cur)} · 직전 분기 숫자 가이던스 없음.`);
  const g=[];if(r.yoy!==null)g.push(`전년 동기 대비 ${pct(r.yoy)}`);if(r.qoq!==null)g.push(`전 분기 대비 ${pct(r.qoq)}`);if(g.length)out.push('성장: '+g.join(', ')+'.');
  if(r.nm!==null){let s=`다음 분기 가이던스 중간값 ${bn(r.nm,cur)} = 이번 실적 대비 ${pct(r.impl)}.`;
   if(r.pImpl!==null){const d=r.impl-r.pImpl;s+=Math.abs(d)<2?' 직전 분기에 제시한 성장 속도와 비슷.':d>0?` 직전 가이던스가 함의한 성장률(${pct(r.pImpl)})보다 높아 회사 전망이 가속.`:` 직전 가이던스가 함의한 성장률(${pct(r.pImpl)})보다 낮아 회사 전망이 둔화.`;}
   if(r.impl<0)s+=' 회사가 다음 분기 매출 감소를 예고.';out.push(s);}
  return out;
 }
 let chart=null,cur=null;
 function draw(t){
  if(t===cur)return;cur=t;if(chart){chart.destroy();chart=null;}const list=$('rgNotes');list.replaceChildren();
  const c=byT.get(t),w=info.get(t),name=w?`${w.name} (${t})`:t;
  if(!t){$('rgCompany').textContent='기업을 선택하세요.';$('rgBody').hidden=true;return;}
  if(!c){$('rgCompany').textContent=`${name}: ${pend.get(t)?pend.get(t):'분기 매출 가이던스를 숫자로 제시하지 않거나 수집 대상이 아닙니다.'}`;$('rgBody').hidden=true;return;}
  $('rgBody').hidden=false;const rows=metrics(c),cc=c.currency,v=rows.filter(r=>r.vs!==null);
  const above=v.filter(r=>r.x.actual>r.x.guide_high||(r.x.guide_high===r.x.guide_low&&r.vs>0)).length,avg=v.length?v.reduce((s,r)=>s+r.vs,0)/v.length:null;
  $('rgCompany').textContent=`${name} · ${cc} · 최근 ${rows.length}분기 중 가이던스 비교 ${v.length}회 · 상단(또는 단일값) 초과 ${above}회 · 중간값 대비 평균 ${pct(avg)}`;
  const last=rows.at(-1).x,hasNext=last.next_guide_low!==undefined&&last.next_guide_low!==null;
  const L=rows.map(r=>lab(r.x)).concat(hasNext?['다음 분기(가이던스)']:[]);
  const band=rows.map(r=>r.m===null?null:[r.x.guide_low/1000,r.x.guide_high/1000]).concat(hasNext?[[last.next_guide_low/1000,last.next_guide_high/1000]]:[]);
  const pc=rows.map(r=>r.vs===null?'#e2e8f0':r.vs>=0?C.beat:C.miss);
  const lbl={id:'rgLabel',afterDatasetsDraw(ch){const m=ch.getDatasetMeta(2),g=ch.ctx;g.save();g.font='600 11px Arial,"Noto Sans KR",sans-serif';g.textAlign='center';g.textBaseline='bottom';
   m.data.forEach((pt,i)=>{const r=rows[i];if(!r||r.vs===null||!isFinite(pt.y))return;const t=pct(r.vs),w=g.measureText(t).width+8,y=pt.y-10;g.fillStyle='rgba(11,20,38,.88)';g.beginPath();g.roundRect?g.roundRect(pt.x-w/2,y-14,w,15,4):g.rect(pt.x-w/2,y-14,w,15);g.fill();g.fillStyle=pc[i];g.fillText(t,pt.x,y);});g.restore();}};
  if(window.Chart){
   chart=new Chart($('rgChart'),{type:'bar',data:{labels:L,datasets:[
    {label:'가이던스 범위(직전 분기 제시)',data:band,backgroundColor:band.map((b,i)=>i===rows.length?C.next:C.band),borderRadius:3,borderSkipped:false,maxBarThickness:30,order:2,pointStyle:'rect'},
    {type:'line',label:'가이던스 중간값(단일값 포함)',data:rows.map(r=>r.m===null?null:r.m/1000).concat(hasNext?[mid(last.next_guide_low,last.next_guide_high)/1000]:[]),showLine:false,pointStyle:'line',pointRadius:13,pointHoverRadius:13,borderWidth:2,pointBorderWidth:2.5,borderColor:'#e2e8f0',backgroundColor:'#e2e8f0',pointBorderColor:'#e2e8f0',order:1},
    {type:'line',label:'실제 매출 (빨강 중간값 상회·파랑 하회)',data:rows.map(r=>r.x.actual/1000),showLine:false,pointRadius:6,pointHoverRadius:8,pointBackgroundColor:pc,pointBorderColor:'#0b1426',pointBorderWidth:2,backgroundColor:C.beat,borderColor:C.beat,order:1,pointStyle:'circle'}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,layout:{padding:{top:16}},interaction:{mode:'index',intersect:false},
     plugins:{title:{display:true,text:`분기 매출: 회사 가이던스 범위(막대) vs 실제(점) · ${sym(cc)}bn · 점 위 % = 중간값 대비`,color:'#e2e8f0',font:{size:13}},
      legend:{labels:{color:C.tick,usePointStyle:true,sort:(a,b)=>a.datasetIndex-b.datasetIndex,generateLabels:ch=>Chart.defaults.plugins.legend.labels.generateLabels(ch).map(l=>l.datasetIndex===2?Object.assign(l,{fillStyle:C.beat,strokeStyle:'#0b1426'}):l)}},
      tooltip:{callbacks:{label:ctx=>{const i=ctx.dataIndex,r=rows[i];if(ctx.datasetIndex===2)return `실제: ${bn(r.x.actual,cc)} (중간값 대비 ${pct(r.vs)})`;if(ctx.datasetIndex===1)return `가이던스 중간값: ${bn(ctx.parsed.y*1000,cc)}`;const x=i<rows.length?r.x:null;return x?`가이던스: ${bn(x.guide_low,cc)}~${bn(x.guide_high,cc)}`:`다음 분기 가이던스: ${bn(last.next_guide_low,cc)}~${bn(last.next_guide_high,cc)}`;}}}},
     scales:{x:{ticks:{color:C.tick},grid:{display:false}},y:{ticks:{color:C.tick,callback:v=>sym(cc)+v.toLocaleString('ko-KR',{maximumFractionDigits:1})+'bn'},grid:{color:C.grid},grace:'8%'}}},plugins:[lbl]});
  }
  rows.map((r,i)=>[r,i]).reverse().forEach(([r,i])=>{const x=r.x,li=document.createElement('li');
   const h=document.createElement('b');h.textContent=`${x.period} · 발표 ${x.report_date||'—'} · ${zone(r)}`;h.className=r.vs===null?'':r.vs>=0?'up':'down';li.append(h);
   const p=document.createElement('p');p.textContent='분석: '+interpret(rows,i,cc).join(' ');li.append(p);
   if(x.driver_note){const d=document.createElement('p');d.className='rg-driver';d.textContent='회사 설명: '+x.driver_note;li.append(d);}
   const s=document.createElement('p');s.className='rg-src';s.append('가이던스: '+(x.guide_text||'—')+' · ');
   for(const [u,t] of [[x.source,'이번 분기 발표'],[x.guide_source,'가이던스 원문']]){if(u&&/^https:\/\//.test(u)){const a=document.createElement('a');a.href=u;a.textContent=t;a.target='_blank';a.rel='noopener noreferrer';s.append(a,' ');}}
   li.append(s);list.append(li);});
 }
 const sync=()=>{const v=$('companyPick')?.value||'';if(v!==cur)draw(v);};
 $('companyPick')?.addEventListener('change',sync);setInterval(sync,600);
 window.addEventListener('resize',()=>chart&&chart.resize());
 // 대상 기업 바로가기
 const chips=$('rgHave');for(const c of G.companies||[]){const w=info.get(c.ticker);if(!w)continue;const b=document.createElement('button');b.type='button';b.textContent=w.name;b.onclick=()=>{const sel=$('sector'),pick=$('companyPick');if(sel&&sel.value&&sel.value!==w.sector){sel.value=w.sector;sel.dispatchEvent(new Event('change'));}if(pick){pick.value=c.ticker;pick.dispatchEvent(new Event('change'));}draw(c.ticker);};chips.append(b);}
 sync();
})();
