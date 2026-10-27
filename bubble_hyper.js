// 하이퍼스케일러 크레딧 (추정 구성): 대표 회사채 평균 수익률(빨강) · 같은 만기 미국 국채(파랑) · 평균 스프레드(주황 굵은 선, 오른쪽 축)
// 원본: bigtech_bonds_hist.csv (FINRA TRACE 일별 마지막 체결 → 수익률, FRED 국채 만기 보간)
(function(){
 const box=document.getElementById('hyperCredit');if(!box||!window.Chart)return;
 const SETS={h5:['MSFT','AMZN','GOOGL','META','ORCL'],h6:['MSFT','AMZN','GOOGL','META','ORCL','CRWV']};
 const NM={MSFT:'마이크로소프트',AMZN:'아마존',GOOGL:'알파벳',META:'메타',ORCL:'오라클',CRWV:'코어위브'};
 let rows=null,set='h5',rng='6m',ch=null;
 const num=v=>v===''||v==null?null:+v;
 function build(){
  const T=SETS[set],by=new Map();
  for(const r of rows){if(!T.includes(r.ticker))continue;const y=num(r.ytm),u=num(r.ust),s=num(r.spread_bp);if(y==null||u==null||s==null)continue;
   if(!by.has(r.date))by.set(r.date,{});by.get(r.date)[r.ticker]={y,u,s};}
  // 모든 회사 값이 있는 날만 평균(구성 변화로 생기는 계단 방지)
  const out=[...by.entries()].filter(([,o])=>T.every(t=>o[t])).sort((a,b)=>a[0].localeCompare(b[0])).map(([d,o])=>{const a=k=>T.reduce((s,t)=>s+o[t][k],0)/T.length;return {d,y:a('y'),u:a('u'),s:a('s')};});
  return out;}
 function draw(){
  const all=build();if(!all.length){box.querySelector('.hc-c').innerHTML='<p class="muted">자료가 없습니다.</p>';return;}
  const last=all.at(-1).d,dd=new Date(last);dd.setMonth(dd.getMonth()-(rng==='3m'?3:rng==='6m'?6:rng==='1y'?12:1200));const S=dd.toISOString().slice(0,10);
  const R=all.filter(x=>x.d>=S),L=R.at(-1),F=R[0];
  if(ch)ch.destroy();
  ch=new Chart(box.querySelector('canvas'),{type:'line',data:{labels:R.map(x=>x.d),datasets:[
   {label:'평균 스프레드 (bp, 오른쪽)',data:R.map(x=>x.s),borderColor:'#f5a623',backgroundColor:'#f5a623',borderWidth:3.2,pointRadius:0,yAxisID:'y1',order:0},
   {label:'회사채 평균 수익률 (%)',data:R.map(x=>x.y),borderColor:'#e5534b',backgroundColor:'#e5534b',borderWidth:1.8,pointRadius:0,yAxisID:'y',order:1},
   {label:'같은 만기 미국 국채 (%)',data:R.map(x=>x.u),borderColor:'#4da3f0',backgroundColor:'#4da3f0',borderWidth:1.8,pointRadius:0,yAxisID:'y',order:2}]},
   options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'bottom',labels:{boxHeight:2}},tooltip:{callbacks:{label:c=>c.datasetIndex===0?` 스프레드 ${c.parsed.y.toFixed(0)}bp`:` ${c.dataset.label.replace(' (%)','')} ${c.parsed.y.toFixed(2)}%`}}},
    scales:{x:{ticks:{maxTicksLimit:8,callback:function(v){return this.getLabelForValue(v).slice(2,7).replace('-','.');}},grid:{display:false}},
     y:{position:'left',title:{display:true,text:'수익률 %'},ticks:{callback:v=>v.toFixed(1)+'%'},grid:{color:'rgba(148,163,184,.12)'}},
     y1:{position:'right',title:{display:true,text:'스프레드 bp'},ticks:{color:'#f5a623'},grid:{display:false}}}}});
  const d=(a,b,k,u,p)=>{const v=a[k]-b[k];return (v>0?'+':'')+v.toFixed(p)+u;};
  box.querySelector('.hc-sum').innerHTML=`<b>${L.d}</b> · 스프레드 <b style="color:#f5a623">${L.s.toFixed(0)}bp</b> (구간 시작 대비 ${d(L,F,'s','bp',0)}) · 회사채 수익률 <b style="color:#e5534b">${L.y.toFixed(2)}%</b> (${d(L,F,'y','%p',2)}) · 국채 <b style="color:#4da3f0">${L.u.toFixed(2)}%</b> (${d(L,F,'u','%p',2)})`;
  box.querySelector('.hc-who').textContent='구성: '+SETS[set].map(t=>NM[t]).join(' · ')+' 대표 회사채 각 1종 단순평균';}
 box.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>{set=b.dataset.set;box.querySelectorAll('[data-set]').forEach(x=>x.classList.toggle('on',x===b));draw();});
 box.querySelectorAll('[data-rng]').forEach(b=>b.onclick=()=>{rng=b.dataset.rng;box.querySelectorAll('[data-rng]').forEach(x=>x.classList.toggle('on',x===b));draw();});
 fetch('bigtech_bonds_hist.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text()).then(t=>{const ln=t.trim().split(/\r?\n/),h=ln[0].replace(/^﻿/,'').split(',');
  rows=ln.slice(1).map(l=>{const v=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,v[i]]));});draw();})
 .catch(()=>{box.querySelector('.hc-c').innerHTML='<p class="muted">회사채 자료를 읽지 못했습니다.</p>';});
})();
