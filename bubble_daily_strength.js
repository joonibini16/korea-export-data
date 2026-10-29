/* OBOS v2: count-normalized breadth persistence; no photo fitting. */
(function(){
 'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const fmt=(x,unit='점')=>finite(x)?(x>0?'+':'')+x.toFixed(2)+unit:'—';
 function signal(x){return !finite(x)?'판단 보류':x>=60?'극단 과매수':x>=40?'과매수':x<=-60?'극단 과매도':x<=-40?'과매도':'중립';}
 const color=x=>!finite(x)?'#94a3b8':x>=40?'#f87171':x<=-40?'#60a5fa':'#cbd5e1';
 function ad(row){
  if(!row)return null;
  const {up,down,flat,total,missing}=row;
  if(![up,down,flat,total,missing].every(x=>Number.isInteger(x)&&x>=0)||!total)return null;
  const n=up+down+flat;
  if(n+missing!==total||n/total<.95)return null;
  return 100*(up-down)/n;
 }
 function average(rows,i,n,key){
  if(i+1<n)return null;
  const v=rows.slice(i+1-n,i+1).map(r=>r[key]);
  return v.every(finite)?v.reduce((a,b)=>a+b,0)/n:null;
 }
 function calculate(input){
  const rows=[...new Map(input.map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>({...r,ad:ad(r)}));
  for(let i=0;i<rows.length;i++){
   const r=rows[i];r.ma5=average(rows,i,5,'ad');r.ma10=average(rows,i,10,'ad');
   r.score=finite(r.ma5)&&finite(r.ma10)?r.ma5*.6+r.ma10*.4:null;
   r.delta=finite(r.score)&&finite(rows[i-1]?.score)?r.score-rows[i-1].score:null;
  }
  return rows;
 }
 const direction=r=>!finite(r?.delta)?'전일 비교 부족':r.delta>1?'점수 상승 · 매수 쏠림 강화 / 매도 압력 완화':r.delta< -1?'점수 하락 · 매도 쏠림 강화 / 매수 압력 완화':'전일 대비 큰 변화 없음 (±1점)';
 async function run(){
  const root=document.getElementById('dailyStrength');if(!root)return;
  const text=(tag,value,parent=root)=>{const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;};
  try{
   const response=await fetch('size_breadth.json?v='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const D=await response.json();
   const groups=(D.daily_strength?.groups||[]).map(g=>({...g,rows:calculate(g.rows||[])}));
   if(!groups.length)throw Error('기초 상승·하락 종목 수 없음');
   root.replaceChildren();
   const title=document.getElementById('dailyStrengthTitle');if(title)title.textContent='시장 내부 체력 · 자체 과매수·과매도 지수';
   text('h2','결론 먼저 · 자체 OBOS 지수');
   text('p','기준 거래일 '+D.live_day+' · 원자료 수집 '+D.updated_at+' · 수집 시점 가격 기준, 당일 값은 장중 잠정일 수 있습니다.').className='muted';
   text('p','−100~+100점: +40 이상 과매수 · −40 이하 과매도 · ±60 이상 극단. 현재 상태와 전일 방향은 별개입니다. 과매도는 매수 확정, 과매수는 매도 확정 신호가 아닙니다.');
   const grid=document.createElement('div');grid.className='db-grid';root.append(grid);
   for(const g of groups){
    const card=document.createElement('article');card.className='db-card';grid.append(card);
    const latest=g.rows.at(-1),x=latest?.date===D.live_day?latest:null;
    text('h3',g.name,card);
    const headline=text('p',fmt(x?.score)+' · '+signal(x?.score),card);headline.style.cssText='font-size:22px;font-weight:700;color:'+color(x?.score);
    text('p','전일 '+fmt(x?.delta)+' · '+direction(x),card);
    text('p',!finite(x?.score)?'유효한 10거래일 연속 표본이 없어 판단을 보류합니다.':x.score<=-40?'매도 쏠림이 누적된 과매도권. 가격 저평가나 바닥을 뜻하지 않습니다. 점수 상승 전환과 가격 안정 여부를 함께 확인하세요.':x.score>=40?'매수 쏠림이 누적된 과매수권. 강한 상승 추세가 지속될 수 있습니다. 점수 하락 전환과 가격 약화 여부를 함께 확인하세요.':'누적 쏠림은 중립권입니다. 중립은 시장 안전이나 방향 전환을 보장하지 않습니다.',card);
    text('p','5일 평균 '+fmt(x?.ma5)+' × 60% + 10일 평균 '+fmt(x?.ma10)+' × 40%',card);
    text('p','당일 수급폭 '+fmt(x?.ad,'%')+' · 상승 '+(x?.up??'—')+' / 하락 '+(x?.down??'—')+' / 보합 '+(x?.flat??'—')+' / 누락 '+(x?.missing??'—'),card);
    text('p',x?.total?'표본 충족률 '+((x.up+x.down+x.flat)/x.total*100).toFixed(1)+'% · '+x.date:'최신 거래일 표본 없음',card);
    const wrap=document.createElement('div');wrap.style.cssText='height:290px;position:relative';const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',g.name+' 자체 과매수 과매도 점수 추이');wrap.append(canvas);card.append(wrap);
    const rows=g.rows.slice(-120);
    if(typeof Chart!=='undefined')new Chart(canvas,{type:'line',data:{labels:rows.map(r=>r.date),datasets:[
     {label:'자체 OBOS 점수',data:rows.map(r=>r.score),borderColor:'#a78bfa',borderWidth:3,pointRadius:3,pointBackgroundColor:rows.map(r=>color(r.score)),spanGaps:false},
     {label:'5일 수급폭 평균',data:rows.map(r=>r.ma5),borderColor:'#34d399',borderWidth:1.5,pointRadius:0,spanGaps:false},
     {label:'10일 수급폭 평균',data:rows.map(r=>r.ma10),borderColor:'#fbbf24',borderWidth:1.5,pointRadius:0,spanGaps:false},
     {label:'당일 수급폭',data:rows.map(r=>r.ad),borderColor:'#94a3b866',borderWidth:1,pointRadius:0,spanGaps:false},
     ...[40,-40,60,-60].map(v=>({label:'판정선 '+v,data:rows.map(()=>v),borderColor:v>0?'#ef444466':'#38bdf866',borderDash:[4,4],pointRadius:0,borderWidth:1}))
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#cbd5e1',filter:item=>item.datasetIndex<4}},tooltip:{filter:item=>item.datasetIndex<4,callbacks:{label:c=>c.dataset.label+': '+fmt(c.parsed.y),afterBody:items=>{const r=rows[items[0]?.dataIndex];return r?signal(r.score)+' · 전일 '+fmt(r.delta):'';}}}},scales:{x:{ticks:{color:'#94a3b8',maxTicksLimit:5}},y:{min:-100,max:100,title:{display:true,text:'점수 / 수급폭(%)',color:'#94a3b8'},ticks:{color:'#94a3b8'}}}}});
   }
   const details=document.createElement('details');details.open=true;root.append(details);text('summary','최근 20거래일 · 종합점수 / 전일 변화 / 판정',details);
   const scroll=document.createElement('div');scroll.style.overflowX='auto';details.append(scroll);
   const table=document.createElement('table');table.className='db-data-table';scroll.append(table);
   const head=document.createElement('thead'),tr=document.createElement('tr');head.append(tr);table.append(head);
   ['날짜',...groups.map(g=>g.name)].forEach(s=>text('th',s,tr));const body=document.createElement('tbody');table.append(body);
   const dates=[...new Set(groups.flatMap(g=>g.rows.map(r=>r.date)))].sort().slice(-20).reverse();
   for(const date of dates){const row=document.createElement('tr');text('td',date,row);for(const g of groups){const x=g.rows.find(r=>r.date===date);const cell=text('td',fmt(x?.score)+' / Δ '+fmt(x?.delta)+' / '+signal(x?.score),row);cell.style.color=color(x?.score);}body.append(row);}
   const method=document.createElement('details');root.append(method);text('summary','산식·판정 기준·한계 (자체 설계 v2)',method);
   text('p','D = 100 × (상승−하락) ÷ (상승+하락+보합). 보합을 포함해 움직인 종목이 적을 때 과장되는 것을 줄입니다. S5 = 최근 5거래일 D의 단순평균, S10 = 최근 10거래일 D의 단순평균. OBOS = 0.6×S5 + 0.4×S10. 최근 5일은 각 16%, 이전 5일은 각 4% 가중치입니다. 계산은 반올림 전 원값을 사용합니다.',method);
   text('p','+60 이상 극단 과매수, +40 이상 과매수, −40 이하 과매도, −60 이하 극단 과매도, 그 외 중립. 전일 점수 대비 ±1점 초과를 상승·하락으로 따로 표시합니다. 경계·가중치는 자체 초기 운영 규칙이며 사진의 산식을 복원하거나 수익률 백테스트로 최적화한 기준이 아닙니다.',method);
   text('p','유효 표본 95% 미만, 음수·누락·불일치 개수는 공란 처리합니다. 10개 연속 관측행이 모두 유효해야 점수를 표시하며 유효값만 골라 평균내지 않습니다. 원자료에서 거래일 자체가 통째 누락된 경우는 검출하지 못할 수 있습니다. 기존 과거 상승·하락 종목 수로 계산한 이력이며 당시 구성원을 복원한 백테스트는 아닙니다.',method);
   text('p','시총 상위 200/150은 현재 시총 대용군으로 공식 KOSPI200·KOSDAQ150과 다릅니다. 생존·구성 편향, 원종가의 분할·권리락, 거래정지 보합 등의 영향이 있습니다. 네이버 수집 시점 가격을 사용하므로 KRX 확정 종가나 20시까지 전체거래 반영을 보장하지 않습니다. 원자료 기준일과 수집시각은 구분합니다.',method);
   text('p','source: size_breadth.json의 daily_strength 상승·하락·보합 수. 기존 규모별 Breadth 자동 수집 일정에 따라 다시 계산하며 별도 유료 데이터·사진 수치·임의의 과거값은 사용하지 않습니다. 이 지표는 가격의 고평가·저평가가 아니라 시장 참여의 단기 쏠림을 측정합니다.',method);
  }catch(error){root.textContent='자체 OBOS 지표: '+error.message+' — 자료 부족은 0점·중립으로 처리하지 않습니다.';}
 }
 if(typeof module!=='undefined')module.exports={signal,fmt,ad,calculate};
 if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();}
})();
