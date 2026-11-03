// 미국 하이일드 스프레드 전용 패널: ICE BofA US High Yield OAS(FRED BAMLH0A0HYM2, bp) + CCC 이하 + S&P500(오른쪽 축)
(function(){
 const box=document.getElementById('hyBox');if(!box||!window.Chart)return;
 const csv=t=>{const L=t.trim().split(/\r?\n/),h=L[0].replace(/^﻿/,'').split(',');return L.slice(1).map(l=>{const v=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,v[i]]));});};
 let F={},SP=[],rng='2000',ccc=false,ch=null;
 const get=s=>(F[s]||[]);
 function draw(){
  const hy=get('BAMLH0A0HYM2');if(!hy.length){box.querySelector('.hy-c').innerHTML='<p class="muted">자료가 아직 없습니다.</p>';return;}
  const last=hy.at(-1),d0=new Date(last.d);d0.setMonth(d0.getMonth()-(rng==='3m'?3:rng==='6m'?6:rng==='1y'?12:rng==='5y'?60:400));const S=rng==='2000'?'2000-01-01':d0.toISOString().slice(0,10);
  const R=hy.filter(x=>x.d>=S),labels=R.map(x=>x.d),cm=new Map(get('BAMLH0A3HYC').map(x=>[x.d,x.v])),sm=new Map(SP.map(x=>[x.d,x.v]));
  let ls=null;const spx=labels.map(d=>{if(sm.has(d))ls=sm.get(d);return ls;});
  const ds=[{label:'하이일드 스프레드 (bp)',data:R.map(x=>x.v),borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.08)',fill:true,borderWidth:2.6,pointRadius:0,yAxisID:'y'},
   {label:'S&P500 (오른쪽)',data:spx,borderColor:'#94a3b8',backgroundColor:'#94a3b8',borderWidth:1.3,pointRadius:0,yAxisID:'y1'}];
  if(ccc)ds.splice(1,0,{label:'CCC 이하 (bp)',data:labels.map(d=>cm.get(d)??null),borderColor:'#f59e0b',backgroundColor:'#f59e0b',borderWidth:1.6,pointRadius:0,yAxisID:'y'});
  const lines={id:'hyl',beforeDatasetsDraw(c){const y=c.scales.y,a=c.chartArea,x=c.ctx;x.save();for(const [v,col,t] of [[400,'rgba(251,191,36,.7)','주의 400'],[500,'rgba(239,68,68,.8)','경고 500']]){const p=y.getPixelForValue(v);if(p<a.top||p>a.bottom)continue;x.strokeStyle=col;x.setLineDash([5,4]);x.beginPath();x.moveTo(a.left,p);x.lineTo(a.right,p);x.stroke();x.fillStyle=col;x.font='11px sans-serif';x.fillText(t,a.left+4,p-3);}x.restore();}};
  if(ch)ch.destroy();
  ch=new Chart(box.querySelector('canvas'),{type:'line',data:{labels,datasets:ds},plugins:[lines],options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
   plugins:{legend:{position:'bottom',labels:{boxHeight:2}},tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='y1'?` S&P500 ${c.parsed.y?.toLocaleString(undefined,{maximumFractionDigits:0})}`:` ${c.dataset.label.split(' (')[0]} ${c.parsed.y?.toFixed(0)}bp`}}},
   scales:{x:{ticks:{maxTicksLimit:rng==='2000'?14:8,callback:function(v){const l=this.getLabelForValue(v);return rng==='2000'?l.slice(0,4):l.slice(2,7).replace('-','.');}},grid:{display:false}},
    y:{position:'left',title:{display:true,text:'bp'},grid:{color:'rgba(148,163,184,.12)'},suggestedMin:200,suggestedMax:(ccc||rng==='2000'||rng==='5y')?null:520},
    y1:{position:'right',type:rng==='2000'?'logarithmic':'linear',grid:{display:false},ticks:{color:'#94a3b8',maxTicksLimit:6,callback:v=>Number(v).toLocaleString()}}}}});
  // 요약: 현재, 1·3개월 변화, 보유 기간 내 백분위
  const back=n=>hy.length>n?last.v-hy.at(-1-n).v:null,c1=back(21),c3=back(63),all=hy.map(x=>x.v),mn=Math.min(...all),mx=Math.max(...all),pc=all.filter(v=>v<=last.v).length/all.length*100;
  const st=last.v>=500||(c3!=null&&c3>=100)?['경고','#ef4444']:last.v>=400||(c3!=null&&c3>=50)?['주의','#f59e0b']:['안정','#22c55e'];
  const sg=v=>v==null?'—':(v>0?'+':'')+v.toFixed(0)+'bp';
  box.querySelector('.hy-sum').innerHTML=`<span class="hy-badge" style="background:${st[1]}">${st[0]}</span> <b>${last.d}</b> 하이일드 스프레드 <b style="color:#ef4444">${last.v.toFixed(0)}bp</b> (${(last.v/100).toFixed(2)}%p) · 1개월 ${sg(c1)} · 3개월 ${sg(c3)} · ${hy[0].d.slice(0,4)}년 이후 범위 ${mn.toFixed(0)}~${mx.toFixed(0)}bp · 백분위 ${pc.toFixed(0)}% (높을수록 스프레드가 넓은 쪽)`;
 }
 box.querySelectorAll('[data-hr]').forEach(b=>b.onclick=()=>{rng=b.dataset.hr;box.querySelectorAll('[data-hr]').forEach(x=>x.classList.toggle('on',x===b));draw();});
 box.querySelector('[data-ccc]').onclick=e=>{ccc=!ccc;e.target.classList.toggle('on',ccc);draw();};
 const opt=u=>fetch(u+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').catch(()=>'');
 Promise.all([fetch('fred_data.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text()),fetch('market_daily.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text()),opt('hy_oas_long.csv'),opt('sp500_long.csv')]).then(([f,m,hl,sl])=>{
  // 장기 이력(ALFRED 과거 발표본·Yahoo) 먼저, 같은 날짜는 최신 FRED·market_daily 값으로 덮어씀
  const HM=new Map();if(hl)for(const r of csv(hl)){const v=parseFloat(r.value);if(isFinite(v))HM.set(r.date,v*100);}
  const SM=new Map();if(sl)for(const r of csv(sl)){const v=+r.close;if(v)SM.set(r.date,v);}
  for(const r of csv(f)){if(r.series!=='BAMLH0A0HYM2'&&r.series!=='BAMLH0A3HYC')continue;const v=parseFloat(r.value);if(!isFinite(v))continue;(F[r.series]=F[r.series]||[]).push({d:r.date,v:v*100});}
  for(const x of F.BAMLH0A0HYM2||[])HM.set(x.d,x.v);F.BAMLH0A0HYM2=[...HM].map(([d,v])=>({d,v}));
  for(const k in F)F[k].sort((a,b)=>a.d.localeCompare(b.d));
  for(const r of csv(m))if(r.symbol==='^GSPC'&&r.close)SM.set(r.date,+r.close);SP=[...SM].map(([d,v])=>({d,v})).sort((a,b)=>a.d.localeCompare(b.d));draw();})
 .catch(e=>{box.querySelector('.hy-c').innerHTML='<p class="muted">자료를 읽지 못했습니다.</p>';});
})();
