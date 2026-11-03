// 200일선 상회 종목 비율(회색 면, 50% 기준) + 지수(빨강, 로그 눈금) — 코스피·코스닥 각각, 2000년~
(function(){
 const box=document.getElementById('b200Box');if(!box||!window.Chart)return;
 const csv=t=>{const L=t.trim().split(/\r?\n/),h=L[0].replace(/^﻿/,'').split(',');return L.slice(1).map(l=>{const v=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,v[i]]));});};
 let B={KOSPI:[],KOSDAQ:[]},I={KOSPI:new Map(),KOSDAQ:new Map()},rng='all',charts={};
 const NM={KOSPI:'코스피',KOSDAQ:'코스닥'};
 function draw(m){
  const all=B[m];const c=box.querySelector(`[data-m="${m}"]`);if(!all.length){c.querySelector('.b2-sum').textContent='자료 수집 중입니다.';return;}
  const last=all.at(-1).d,y=+last.slice(0,4),S=rng==='all'?'0000':rng==='10y'?(y-10)+last.slice(4):rng==='5y'?(y-5)+last.slice(4):(y-1)+last.slice(4);
  const R=all.filter(x=>x.d>=S),labels=R.map(x=>x.d),short=R.length&&(new Date(R.at(-1).d)-new Date(R[0].d))<730*864e5,idx=I[m];let li=null;const iv=labels.map(d=>{if(idx.has(d))li=idx.get(d);return li;});
  // 회색 면: 50% 선을 기준으로 위·아래 채움
  const base={id:'b50',beforeDatasetsDraw(ch){const ys=ch.scales.y,a=ch.chartArea,x=ch.ctx,p=ys.getPixelForValue(50);x.save();x.strokeStyle='#e2e8f0';x.lineWidth=1.4;x.beginPath();x.moveTo(a.left,p);x.lineTo(a.right,p);x.stroke();x.restore();}};
  if(charts[m])charts[m].destroy();
  charts[m]=new Chart(c.querySelector('canvas'),{type:'line',data:{labels,datasets:[
   {label:'200일선 상회 종목 비율 (좌, %)',data:R.map(x=>x.v),borderColor:'rgba(160,170,185,.9)',backgroundColor:'rgba(160,170,185,.45)',borderWidth:.8,pointRadius:0,fill:{value:50},yAxisID:'y',order:2},
   {label:NM[m]+' (우, 로그)',data:iv,borderColor:'#ef4444',backgroundColor:'#ef4444',borderWidth:2.2,pointRadius:0,yAxisID:'y1',order:1}]},plugins:[base],
   options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'top',align:'start',labels:{boxHeight:8}},tooltip:{callbacks:{label:c=>c.datasetIndex?` ${NM[m]} ${c.parsed.y?.toLocaleString(undefined,{maximumFractionDigits:0})}`:` 200일선 상회 ${c.parsed.y?.toFixed(1)}%`}}},
    scales:{x:{ticks:{maxTicksLimit:rng==='1y'?12:14,callback:function(v){const l=this.getLabelForValue(v);return short?l.slice(2,7).replace('-','.'):l.slice(0,4);}},grid:{display:false}},
     y:{position:'left',min:0,max:100,ticks:{stepSize:20,callback:v=>v+'%'},grid:{color:'rgba(148,163,184,.10)'}},
     y1:{position:'right',type:'logarithmic',grid:{display:false},ticks:{color:'#f87171',maxTicksLimit:6,callback:v=>Number(v).toLocaleString()}}}}});
  const L=all.at(-1),pc=all.filter(x=>x.v<=L.v).length/all.length*100,w4=all.length>20?L.v-all.at(-21).v:null;
  const zone=L.v>=80?['과열권(80%↑)','#f59e0b']:L.v<=20?['극단적 약세(20%↓) — 과거 바닥권','#60a5fa']:L.v>=50?['50% 위 — 다수 종목 장기 상승 추세','#22c55e']:['50% 아래 — 다수 종목 장기 하락 추세','#f87171'];
  c.querySelector('.b2-sum').innerHTML=`<b>${L.d}</b> 200일선 상회 <b style="color:${zone[1]}">${L.v.toFixed(1)}%</b> (${L.n.toLocaleString()}종목 중 ${L.a.toLocaleString()}) · 4주 변화 ${w4==null?'—':(w4>0?'+':'')+w4.toFixed(1)+'%p'} · ${all[0].d.slice(0,4)}년 이후 백분위 ${pc.toFixed(0)}% · <span style="color:${zone[1]}">${zone[0]}</span>`;
 }
 const drawAll=()=>['KOSPI','KOSDAQ'].forEach(draw);
 box.querySelectorAll('[data-br]').forEach(b=>b.onclick=()=>{rng=b.dataset.br;box.querySelectorAll('[data-br]').forEach(x=>x.classList.toggle('on',x===b));drawAll();});
 const get=u=>fetch(u+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').catch(()=>'');
 Promise.all([get('breadth200.csv'),get('market_turnover.csv'),get('market_daily.csv')]).then(([b,t,md])=>{
  if(b)for(const r of csv(b))if(B[r.market])B[r.market].push({d:r.date,v:+r.pct,n:+r.n,a:+r.above});
  for(const k in B)B[k].sort((x,y)=>x.d.localeCompare(y.d));
  // 지수: KRX 정보데이터시스템 지수 종가(market_turnover.csv, 2000~) 우선, 없으면 market_daily
  if(md)for(const r of csv(md)){const m=r.symbol==='^KS11'?'KOSPI':r.symbol==='^KQ11'?'KOSDAQ':null;if(m&&+r.close)I[m].set(r.date,+r.close);}
  if(t)for(const r of csv(t))if(I[r.market]&&+r.close)I[r.market].set(r.date,+r.close);
  const s=box.querySelector('.b2-src');const f=B.KOSPI[0]?.d;if(s&&f&&f>'2001')s.textContent=`※ 과거 일별 종가를 KRX에서 받는 중이라 현재는 ${f}부터 표시됩니다(2000년까지 순차 채움, 자동 갱신).`;
  drawAll();});
})();
