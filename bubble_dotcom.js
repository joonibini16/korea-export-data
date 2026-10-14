// 버블 경로 비교(참고용): 닷컴 버블 나스닥(1995~2002)과 현재 코스피 강세장을 같은 기준으로 겹쳐 봅니다.
(function(){
 const NQ_START='1995-01-03',KS_START='2025-04-09'; // 강세장 시작 = 직전 저점(코스피 2025-04-09 2,293.7)
 const DAY=864e5,ts=d=>Date.parse(d+'T00:00:00Z');
 const csv=t=>t.replace(/^﻿/,'').trim().split(/\r?\n/).slice(1).map(l=>l.split(','));
 const ma=(a,n)=>a.map((_,i)=>i+1<n?null:a.slice(i-n+1,i+1).reduce((s,x)=>s+x.v,0)/n);
 const fmt=(v,d=1)=>v==null?'—':(v>0?'+':'')+v.toFixed(d);
 let charts=[];
 function mk(id,cfg){const c=document.getElementById(id);if(!c)return;const ch=new Chart(c,cfg);charts.push(ch);}
 async function run(){const box=document.getElementById('dotcomBox');if(!box)return;
  let nq,ks;
  try{const [a,b]=await Promise.all([fetch('dotcom_nasdaq.csv').then(r=>r.text()),fetch('market_daily.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text())]);
   nq=csv(a).map(([d,c])=>({d,v:+c}));ks=csv(b).filter(r=>r[0]==='^KS11').map(r=>({d:r[1],v:+r[2]})).filter(x=>x.v>0).sort((x,y)=>x.d.localeCompare(y.d));}
  catch(e){box.innerHTML='<p class="muted">비교 자료를 읽지 못했습니다.</p>';return;}
  const prep=(s,start)=>{const i0=s.findIndex(x=>x.d>=start),b=s[i0].v,m=ma(s,100);return s.map((x,i)=>({d:x.d,v:x.v,y:(ts(x.d)-ts(s[i0].d))/365.25/DAY,idx:x.v/b*100,disp:m[i]?(x.v/m[i]-1)*100:null})).filter(x=>x.y>=-0.25);};
  const N=prep(nq,NQ_START),K=prep(ks,KS_START);
  const pk=a=>a.reduce((m,x)=>x.v>m.v?x:m,a[0]);const nP=pk(N),kP=pk(K),kL=K.at(-1);
  const after=(a,p)=>a.filter(x=>x.d>=p.d).map(x=>({d:x.d,t:(ts(x.d)-ts(p.d))/DAY,dd:(x.v/p.v-1)*100}));
  const nA=after(N,nP).filter(x=>x.t<=1000),kA=after(K,kP);
  const kNow=kA.at(-1),nSame=nA.reduce((m,x)=>Math.abs(x.t-kNow.t)<Math.abs(m.t-kNow.t)?x:m,nA[0]);
  const nSameDD=nA.find(x=>x.dd<=kNow.dd);
  const kDmax=K.reduce((m,x)=>x.disp!=null&&x.disp>(m?.disp??-1e9)?x:m,null),nDmax=N.reduce((m,x)=>x.disp!=null&&x.disp>(m?.disp??-1e9)?x:m,null);
  // 고점 이후 1차 저점·반등(코스피)
  const kLow1=kA.reduce((m,x)=>x.dd<m.dd?x:m,kA[0]);const kReb=kA.filter(x=>x.t>kLow1.t).reduce((m,x)=>!m||x.dd>m.dd?x:m,null);
  box.innerHTML=`<div class="dc-sum">
   <div><b>코스피 현재</b><span>${kL.d} · ${Math.round(kL.v).toLocaleString()} · 시작 대비 ${Math.round(kL.idx)} · 고점 대비 ${fmt(kNow.dd)}% · 고점 후 ${Math.round(kNow.t)}일</span></div>
   <div><b>강세장 속도</b><span>코스피 고점 ${Math.round(kP.idx)}을 ${kP.y.toFixed(1)}년 만에 기록 · 나스닥은 고점 ${Math.round(nP.idx)}까지 ${nP.y.toFixed(1)}년</span></div>
   <div><b>100일 이격도 최고치</b><span>코스피 ${fmt(kDmax?.disp)}% (${kDmax?.d}) vs 나스닥 ${fmt(nDmax?.disp)}% (${nDmax?.d}) · 1929년 다우 약 +20%(증권사 자료)</span></div>
   <div><b>고점 이후 경로</b><span>코스피 1차 저점 ${fmt(kLow1.dd)}% (${kLow1.d})${kReb&&kReb.d>kLow1.d?` → 반등 ${fmt(kReb.dd)}% (${kReb.d})`:''} → 현재 ${fmt(kNow.dd)}%. 나스닥은 고점 후 같은 ${Math.round(kNow.t)}일째(${nSame.d}) ${fmt(nSame.dd)}%, 같은 낙폭은 ${nSameDD?nSameDD.d+'('+Math.round(nSameDD.t)+'일째)':'없음'}에 처음 도달</span></div></div>
   <div class="g3 dc-g"><div><h3>강세장 시작 = 100 (로그)</h3><div class="chart"><canvas id="dcIdx"></canvas></div></div><div><h3>100일 이격도 (%)</h3><div class="chart"><canvas id="dcDisp"></canvas></div></div><div><h3>고점 이후 낙폭 (%) · 고점 후 경과일</h3><div class="chart"><canvas id="dcDD"></canvas></div></div></div>
   <p class="muted">참고용 비교입니다(예측 아님). 나스닥 종합 1995-01-03, 코스피 2025-04-09(직전 저점 2,293.7)을 강세장 시작으로 맞췄습니다. 가로축은 시작(또는 고점) 이후 경과 시간이라 실제 날짜가 다릅니다. 닷컴은 이익 없는 성장주가 주도했고, 현재 코스피는 반도체 실적 증가가 동반된다는 차이가 있습니다. 출처: 나스닥 Yahoo Finance(^IXIC), 코스피 market_daily.csv(매일 갱신).</p>`;
  charts.forEach(c=>c.destroy());charts=[];
  const lineDS=(label,data,color,w=2)=>({label,data,borderColor:color,backgroundColor:color,borderWidth:w,pointRadius:0,tension:0,parsing:false});
  const now=(a,key,lab)=>({label:lab,data:[a],borderColor:'#fbbf24',backgroundColor:'#fbbf24',pointRadius:5,showLine:false,parsing:false});
  const base={responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:10}}}};
  mk('dcIdx',{type:'line',data:{datasets:[lineDS('닷컴 나스닥 (1995.1~)',N.filter(x=>x.y<=8).map(x=>({x:x.y,y:x.idx})),'#d4a017'),lineDS('코스피 (2025.4~)',K.map(x=>({x:x.y,y:x.idx})),'#ef4444',2.5),now({x:kL.y,y:kL.idx},'','현재')]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: T+${t.parsed.x.toFixed(2)}년 · ${t.parsed.y.toFixed(0)}`}}},scales:{x:{type:'linear',min:0,max:8,title:{display:true,text:'강세장 시작 후 경과 (년)'},ticks:{callback:v=>'T+'+v+'Y'}},y:{type:'logarithmic',min:80,title:{display:true,text:'시작=100'}}}}});
  mk('dcDisp',{type:'line',data:{datasets:[lineDS('닷컴 나스닥',N.filter(x=>x.disp!=null&&x.y<=8).map(x=>({x:x.y,y:x.disp})),'#d4a017',1.2),lineDS('코스피',K.filter(x=>x.disp!=null).map(x=>({x:x.y,y:x.disp})),'#ef4444',1.8),
    lineDS('나스닥 최고 +'+nDmax.disp.toFixed(0)+'%',[{x:0,y:nDmax.disp},{x:8,y:nDmax.disp}],'rgba(212,160,23,.55)',1),lineDS('1929 다우 약 +20%',[{x:0,y:20},{x:8,y:20}],'rgba(148,163,184,.6)',1)]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: T+${t.parsed.x.toFixed(2)}년 · ${t.parsed.y.toFixed(1)}%`}}},scales:{x:{type:'linear',min:0,max:8,title:{display:true,text:'강세장 시작 후 경과 (년)'},ticks:{callback:v=>'T+'+v+'Y'}},y:{title:{display:true,text:'종가 ÷ 100일 평균 − 1 (%)'}}}}});
  mk('dcDD',{type:'line',data:{datasets:[lineDS('나스닥 (2000.3.10 고점)',nA.map(x=>({x:x.t,y:x.dd})),'#d4a017'),lineDS('코스피 ('+kP.d+' 고점)',kA.map(x=>({x:x.t,y:x.dd})),'#ef4444',2.5),now({x:kNow.t,y:kNow.dd},'','현재')]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: ${Math.round(t.parsed.x)}일 · ${t.parsed.y.toFixed(1)}%`}}},scales:{x:{type:'linear',min:0,max:1000,title:{display:true,text:'고점 이후 경과일'}},y:{max:0,title:{display:true,text:'고점 대비 (%)'}}}}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
