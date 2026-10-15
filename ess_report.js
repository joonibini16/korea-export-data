// 하나증권 ESS Battery Monthly 도표 1~12 재구성 (ess_installs.csv · ess_chem.csv)
(function(){
 const box=document.getElementById('essReport');if(!box)return;
 const parse=t=>{const L=t.replace(/^﻿/,'').trim().split(/\r?\n/),h=L.shift().split(',');return L.map(l=>{const f=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,f[i]??'']));});};
 const num=v=>v===''||v==null?null:Number(v);
 const DEF=[
  {id:'g',t:'도표 1. 글로벌 ESS 신규 설치량',kind:'reg',cat:'글로벌'},
  {id:'chem',t:'도표 2. ESS 케미스트리별 비중',kind:'chem'},
  {id:'na',t:'도표 3. 북미 ESS 신규 설치량',kind:'reg',cat:'북미'},
  {id:'eu',t:'도표 4. 유럽 ESS 신규 설치량',kind:'reg',cat:'유럽'},
  {id:'cn',t:'도표 5. 중국 ESS 신규 설치량',kind:'reg',cat:'중국'},
  {id:'ot',t:'도표 6. 기타 지역 ESS 신규 설치량',kind:'reg',cat:'기타'},
  {id:'sa',t:'도표 7. Grid(독립형 ESS) 배터리 신규 설치량',kind:'link',cats:['Stand-alone'],lab:'Grid(독립형)',col:'#60a5fa'},
  {id:'ws',t:'도표 8. Wind+Solar 연계 ESS 배터리 신규 설치량',kind:'link',cats:['Wind+Solar'],lab:'Wind+Solar',col:'#22d3ee'},
  {id:'wi',t:'도표 9. Wind 연계 ESS 배터리 신규 설치량',kind:'link',cats:['Wind'],lab:'Wind',col:'#34d399'},
  {id:'so',t:'도표 10. Solar 연계 ESS 배터리 신규 설치량',kind:'link',cats:['Solar'],lab:'Solar',col:'#f59e0b'},
  {id:'gp',t:'도표 11. Gas Plant & Other 연계 ESS 배터리 신규 설치량',kind:'link',cats:['기타'],lab:'Gas Plant&Other',col:'#94a3b8'},
  {id:'re',t:'도표 12. 풍력+태양광+하이브리드 연계 ESS 배터리 신규 설치량',kind:'link',cats:['Wind+Solar','Wind','Solar'],lab:'풍력+태양광+하이브리드',col:'#a3e635'}];
 box.innerHTML=`<div class="g2 rp">${DEF.map(d=>`<section class="panel"><h2 style="font-size:16px">${d.t}</h2><div class="chart" style="height:300px"><canvas id="rp_${d.id}"></canvas></div><p class="muted" id="rpn_${d.id}"></p></section>`).join('')}</div>`;
 Promise.all([fetch('ess_installs.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text()),fetch('ess_chem.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text())]).then(([a,b])=>{
  const R=parse(a),C=parse(b);
  const M=new Map();R.forEach(r=>M.set([r.table,r.span,r.period,r.category,r.segment].join('|'),r));
  const g=(t,s,p,c,sg)=>M.get([t,s,p,c,sg].join('|'));
  const months=[...new Set(R.filter(r=>r.span==='month'&&r.table==='region'&&r.category==='글로벌'&&r.gwh!=='').map(r=>r.period))].sort();
  const labs=months.map(p=>p.slice(2).replace('-','.'));
  const ytdKey=p=>`${p.slice(0,4)}-01~${p.slice(5)}`;
  const ytdYoY=(t,cats,sg,p)=>{if(p.endsWith('-01')){// 1월: 누적 = 월간
     let cur=0,prv=0,ok=true;cats.forEach(c=>{const r=g(t,'month',p,c,sg);const v=num(r?.gwh),y=num(r?.yoy_pct);if(v==null||y==null||y<=-100){ok=false;return;}cur+=v;prv+=v/(1+y/100);});return ok&&prv>0?(cur/prv-1)*100:null;}
   let cur=0,prv=0,ok=true;cats.forEach(c=>{const r=g(t,'ytd',ytdKey(p),c,sg);const v=num(r?.gwh),y=num(r?.yoy_pct);if(v==null||y==null||y<=-100){ok=false;return;}cur+=v;prv+=v/(1+y/100);});
   if(!ok)return null;if(cats.length===1){const r=g(t,'ytd',ytdKey(p),cats[0],sg);return num(r?.yoy_pct);}return prv>0?(cur/prv-1)*100:null;};
  const base=(yTitle)=>({responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
   plugins:{legend:{position:'bottom',labels:{boxWidth:10}},tooltip:{callbacks:{label:x=>`${x.dataset.label}: ${x.parsed.y==null?'—':x.parsed.y.toFixed(1)}${x.dataset.yAxisID==='y1'?'%':' GWh'}`}}},
   scales:{x:{stacked:true,ticks:{maxRotation:0,autoSkip:true}},y:{stacked:true,beginAtZero:true,title:{display:true,text:yTitle||'GWh'}},y1:{position:'right',grid:{drawOnChartArea:false},title:{display:true,text:'누적 YoY (%)'}}}});
  const est=p=>{const r=g('region','month',p,'글로벌','total');return r&&r.basis!=='reported';};
  const yoyLine=data=>({type:'line',label:'누적 Total YoY(우)',data,yAxisID:'y1',borderColor:'#fbbf24',backgroundColor:'#fbbf24',borderWidth:2,pointRadius:2,spanGaps:true,order:0,rnSkip:true});
  const nEst=months.filter(est).length;
  DEF.forEach(d=>{const cv=document.getElementById('rp_'+d.id);let cfg,note='';
   if(d.kind==='reg'){
    const G=months.map(p=>num(g('region','month',p,d.cat,'grid')?.gwh)),B=months.map(p=>num(g('region','month',p,d.cat,'btm')?.gwh));
    const Y=months.map(p=>ytdYoY('region',[d.cat],'total',p));
    cfg={type:'bar',data:{labels:labs,datasets:[{label:'Grid(좌)',data:G,backgroundColor:months.map(p=>est(p)?'rgba(96,165,250,.45)':'#3b82f6'),stack:'s',order:1},{label:'BTM(좌)',data:B,backgroundColor:months.map(p=>est(p)?'rgba(148,163,184,.45)':'#94a3b8'),stack:'s',order:1},yoyLine(Y)]},options:base()};
    const p=months.at(-1),t=g('region','month',p,d.cat,'total'),yt=Y.at(-1);note=`최근 ${p.replace('-','.')}: ${t?num(t.gwh).toFixed(1):'—'}GWh (YoY ${t&&t.yoy_pct!==''?num(t.yoy_pct).toFixed(1)+'%':'—'}) · 누적 YoY ${yt==null?'—':yt.toFixed(1)+'%'}`;}
   else if(d.kind==='link'){
    const V=months.map(p=>{let s=0,ok=false;d.cats.forEach(c=>{const v=num(g('grid_link','month',p,c,'grid')?.gwh);if(v!=null){s+=v;ok=true;}});return ok?s:null;});
    const Y=months.map(p=>ytdYoY('grid_link',d.cats,'grid',p));
    cfg={type:'bar',data:{labels:labs,datasets:[{label:d.lab+'(좌)',data:V,backgroundColor:months.map(p=>est(p)?d.col+'73':d.col),order:1},yoyLine(Y)]},options:base()};
    cfg.data.datasets[1].label='누적 YoY(우)';
    const i=V.length-1;note=`최근 ${months[i].replace('-','.')}: ${V[i]==null?'—':V[i].toFixed(1)}GWh · 누적 YoY ${Y[i]==null?'—':Y[i].toFixed(1)+'%'}`;}
   else{const P=C.map(r=>r.period),K=[['LFP','#60a5fa'],['NCM','#f87171'],['Flow','#34d399'],['Sodium','#f59e0b'],['기타','#94a3b8']];
    cfg={type:'bar',data:{labels:P.map(p=>p.slice(2).replace('-','.')),datasets:K.map(([k,c])=>({label:k==='Flow'?'Flow Battery':k==='Sodium'?'Sodium based':k,data:C.map(r=>num(r[k])),backgroundColor:c}))},
     options:{...base('%'),plugins:{legend:{position:'bottom',labels:{boxWidth:10}},tooltip:{callbacks:{label:x=>`${x.dataset.label}: ${x.parsed.y.toFixed(1)}%`}}},scales:{x:{stacked:true},y:{stacked:true,min:0,max:100,title:{display:true,text:'%'}}}}};
    const l=C.at(-1);note=l?`${l.period.replace('-','.')}: LFP ${l.LFP}% · NCM ${l.NCM}% · Flow ${l.Flow}% · Sodium ${l.Sodium}% · 기타 ${l['기타']}% (리포트 본문 수치, 2025.8~)`:'';}
   new Chart(cv,cfg);const el=document.getElementById('rpn_'+d.id);if(el)el.textContent=note;});
  const fn=document.getElementById('rpNote');if(fn)fn.textContent=`진한 막대 = 리포트 표의 보고치, 옅은 막대 = 다음 해 리포트의 YoY로 역산한 추정치(${nEst}개월). 누적 YoY 선은 각 월 리포트의 '누적' 표 값입니다(2026-08은 사용자 제공 화면). BMI는 매월 과거 수치를 수정하므로 원 리포트 도표(최신 수정치)와 일부 다를 수 있습니다.`;
 });
})();
