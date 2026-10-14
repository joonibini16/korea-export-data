// 대만 업종별 합산 월매출: 업종(밸류체인)별 회사 매출을 더한 막대와 YoY 선(전년 같은 달 자료가 있는 회사끼리 비교).
(function(){
 const G=[
  ['대만 IT 합산 (관심 52개사)',null],
  ['Foundry',['2330','2303']],['팹리스',['2454','5274']],['Memory',['2408','2344','8299']],['후공정 (OSAT)',['3711','2449']],
  ['테스트 소모품',['6515']],['실리콘 웨이퍼',['6488']],['ABF 기판',['3037','3189','8046']],['MLB+HDI·FPCB',['2368','3044','5469','5439','3715','2313','4958']],
  ['CCL·Glass Fiber',['2383','6274','6213','1815','5340']],['PCB 소재·장비 (동박·드릴·PI)',['8358','8021','5498','3167','3645']],
  ['서버 ODM·EMS',['2317','2382','6669','3231','2376']],['서버 부품 (냉각·커넥터)',['3017','6805']],['PC·네트워크',['2353','2357','2345']],
  ['전력기기',['2308','1519','1503','1513']],['MLCC·수동부품',['2327','2492','3090']],['Lens',['3008','6209']],['Leadframe',['8070','2351']]];
 let range='2022',charts=[],D=null;
 const mid=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7))-1,lab=i=>`${Math.floor(i/12)}.${String(i%12+1).padStart(2,'0')}`;
 async function load(){const t=await (await fetch('taiwan_monthly_revenue.csv?v='+Date.now(),{cache:'no-store'})).text();const L=t.replace(/^﻿/,'').trim().split(/\r?\n/),h=L.shift().split(',');
  const im=h.indexOf('month'),ic=h.indexOf('company_id'),iv=h.indexOf('revenue_kNTD');const m=new Map();
  for(const l of L){const f=l.split(',');const v=Number(f[iv]);if(!(v>0))continue;m.set(f[ic]+'|'+f[im],v);}return m;}
 function series(ids,months){return months.map(mo=>{let s=0,n=0,cur=0,prev=0;const pm=lab(mid(mo)-12);
  for(const id of ids){const v=D.get(id+'|'+mo);if(v!=null){s+=v;n++;const p=D.get(id+'|'+pm);if(p!=null){cur+=v;prev+=p;}}}
  return {m:mo,v:n?s/1e6:null,yoy:prev>0?(cur/prev-1)*100:null,n};});}
 function draw(){charts.forEach(c=>c.destroy());charts=[];const box=document.getElementById('twGroupGrid');box.replaceChildren();
  const all=[...new Set([...D.keys()].map(k=>k.split('|')[0]))];const last=[...new Set([...D.keys()].map(k=>k.split('|')[1]))].sort().at(-1);
  const start=range==='2022'?'2022.01':lab(mid(last)-12);const months=[];for(let i=mid(start);i<=mid(last);i++)months.push(lab(i));
  G.forEach(([name,ids],gi)=>{const S=series(ids||all,months);const lv=S.at(-1);
   const card=document.createElement('div');card.className='twg-card'+(gi===0?' wide':'');
   card.innerHTML=`<div class="twg-h"><b>${name}</b><span>${lv.m} · ${lv.v==null?'—':lv.v.toFixed(lv.v<10?2:1)}십억 NT$ · YoY <em class="${lv.yoy>0?'up':lv.yoy<0?'dn':''}">${lv.yoy==null?'—':(lv.yoy>0?'+':'')+lv.yoy.toFixed(1)+'%'}</em></span></div><div class="twg-c" style="height:${gi===0?300:220}px"><canvas></canvas></div><small>${ids?ids.length+'개사':'전체'} 합산 · 막대 = 월매출(십억 NT$, 좌) · 선 = YoY(우, 전년 같은 달 자료가 있는 회사끼리)</small>`;
   box.append(card);
   charts.push(new Chart(card.querySelector('canvas'),{data:{labels:months.map(m=>"'"+m.slice(2)),datasets:[
    {type:'line',label:'YoY (%)',data:S.map(x=>x.yoy),borderColor:'#3b82f6',backgroundColor:'#0b1220',pointBorderColor:'#3b82f6',pointRadius:range==='2022'?2:3.5,borderWidth:2.2,yAxisID:'y1',order:0,spanGaps:true},
    {type:'bar',label:'월매출 (십억 NT$)',data:S.map(x=>x.v),backgroundColor:S.map((x,i)=>i===S.length-1?'rgba(96,165,250,.85)':'rgba(203,213,225,.55)'),yAxisID:'y',order:1}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:t=>t.dataset.yAxisID==='y1'?`YoY ${t.parsed.y==null?'—':t.parsed.y.toFixed(1)+'%'}`:`매출 ${t.parsed.y==null?'—':t.parsed.y.toFixed(2)}십억 NT$`}}},
     scales:{x:{ticks:{maxTicksLimit:range==='2022'?10:13,maxRotation:0},grid:{display:false}},y:{position:'left',beginAtZero:true,grid:{color:'rgba(148,163,184,.12)'}},y1:{position:'right',grid:{display:false},ticks:{callback:v=>v+'%'}}}},
    plugins:[{id:'zero',afterDatasetsDraw(ch){const y=ch.scales.y1;if(!y||y.min>0||y.max<0)return;const p=y.getPixelForValue(0),c=ch.ctx;c.save();c.setLineDash([4,3]);c.strokeStyle='rgba(226,232,240,.6)';c.beginPath();c.moveTo(ch.chartArea.left,p);c.lineTo(ch.chartArea.right,p);c.stroke();c.restore();}}]}));});
  document.getElementById('twGroupNote').textContent=`최신 ${last} · 업종 묶음은 관심 52개사 기준이라 증권사 자료의 업종 합산과 회사 구성이 다를 수 있습니다(예: ABF = Unimicron·Kinsus·Nan Ya PCB). 원화·달러가 아닌 대만달러(NT$) 기준. 출처: MOPS 월매출 공시.`;}
 async function run(){const sec=document.getElementById('twGroups');if(!sec)return;try{D=await load();}catch(e){sec.querySelector('#twGroupGrid').textContent='자료를 읽지 못했습니다.';return;}draw();}
 document.addEventListener('click',e=>{const b=e.target.closest('#twgRange button');if(!b)return;range=b.dataset.r;document.querySelectorAll('#twgRange button').forEach(x=>x.classList.toggle('on',x===b));draw();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
