// 닷컴버블 vs 현재 · 연준 첫 금리 인상일 정렬 비교 (첫 인상일 종가 = 100, 가로축 = 첫 인상 후 거래일 수)
// 자료: dotcom_nasdaq.csv(1994~2003 나스닥 종가), market_daily.csv(^IXIC·^KS11 일별, 매일 자동 수집)
// 새 금리 결정이 나오면 CUR_HIKES 에 날짜를 추가하면 차트 표시에 반영됩니다.
(function(){
 const DOT_HIKE='1999-06-30';
 const DOT_EVENTS=[['1999-06-30','첫 인상 5.00%'],['1999-08-24','2차 인상 5.25%'],['1999-11-16','3차 인상 5.50%'],['2000-02-02','4차 인상 5.75%'],['2000-03-10','나스닥 고점'],['2000-03-21','5차 인상 6.00%'],['2000-05-16','마지막 인상 6.50%'],['2001-01-03','첫 인하 6.00%'],['2002-10-09','나스닥 바닥']];
 const FED_HIKE='2026-09-16';              // 연준 3년 만의 첫 인상(3.75~4.00%)
 const BOK_HIKE='2026-07-16';              // 한은 3년 6개월 만의 첫 인상(2.75%)
 const CUR_HIKES=[['2026-09-16','연준 첫 인상 3.75~4.00%']];
 const box=document.getElementById('hikeBox');if(!box)return;
 const rows=t=>t.replace(/^﻿/,'').trim().split(/\r?\n/).slice(1).map(l=>l.split(','));
 const align=(s,d0)=>{const i0=s.reduce((k,x,i)=>x.d<=d0?i:k,-1);if(i0<0)return null;const b=s[i0].v;return s.map((x,i)=>({t:i-i0,y:x.v/b*100,d:x.d,v:x.v}));};
 const sg=v=>v==null?'—':(v>=0?'+':'')+v.toFixed(1)+'%';
 const col=v=>v==null?'':v>=0?'#f87171':'#60a5fa';
 let chart,ksAnchor='fed',range='500';
 Promise.all([fetch('dotcom_nasdaq.csv').then(r=>r.text()),fetch('market_daily.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text())]).then(([a,b])=>{
  const dot=rows(a).map(([d,c])=>({d,v:+c})).filter(x=>x.v>0);
  const m={};rows(b).forEach(r=>{if((r[0]==='^IXIC'||r[0]==='^KS11')&&+r[2]>0)(m[r[0]]=m[r[0]]||[]).push({d:r[1],v:+r[2]});});
  Object.values(m).forEach(s=>s.sort((x,y)=>x.d.localeCompare(y.d)));
  const A=align(dot,DOT_HIKE),N=align(m['^IXIC']||[],FED_HIKE);
  box.innerHTML=`<p class="muted" style="margin:0 0 8px">두 시기의 연준 첫 기준금리 인상일 종가를 100으로 맞추고, 가로축을 첫 인상 후 거래일 수로 정렬했습니다. 닷컴 때 나스닥은 첫 인상(1999-06-30) 후 176거래일 만에 고점(+88%)을 찍었고, 그 사이 4차례 더 인상했습니다.</p>
  <div class="ph" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:4px 0 8px"><label>코스피 기준일 <select id="hkAnchor"><option value="fed">연준 첫 인상 (2026-09-16)</option><option value="bok">한은 첫 인상 (2026-07-16)</option></select></label><label>표시 구간 <select id="hkRange"><option value="120">인상 전후 120거래일</option><option value="500" selected>−250 ~ +500거래일</option><option value="900">−250 ~ +900거래일(닷컴 바닥까지)</option></select></label></div>
  <div style="position:relative;height:440px"><canvas id="hkChart"></canvas></div>
  <div style="overflow:auto;margin-top:10px"><table class="dt" id="hkTable" style="width:100%;border-collapse:collapse;font-size:13.5px"></table></div>
  <div id="hkNote" style="margin-top:10px;font-size:13.5px;line-height:1.65;background:#0f1a31;border-left:3px solid #c9a227;padding:8px 12px;border-radius:0 6px 6px 0"></div>
  <p class="muted" style="margin-top:8px">자료: 나스닥 종합지수(1994~2003 일별 종가, 현재는 매일 자동 수집)·코스피 일별 종가. 금리 결정일: FOMC·한국은행 발표일(2026년 연준 인상: <a href="https://investinglive.com/central-banks/fomc-rate-decision-fed-hikes-for-the-first-time-in-three-years/" target="_blank" rel="noopener">investingLive</a>, 한은 인상: <a href="https://wikidocs.net/blog/@goodhosup/24292/" target="_blank" rel="noopener">wikidocs</a>). 장중 수집분은 당일 종가 확정 전 값일 수 있습니다. 시점 정렬은 국면을 가늠하는 참고용이며 같은 경로를 따른다는 예측이 아닙니다.</p>`;
  const draw=()=>{
   const K=align(m['^KS11']||[],ksAnchor==='fed'?FED_HIKE:BOK_HIKE);
   const hi=+range===120?120:+range,lo=+range===120?-120:-250;
   const pts=s=>s?s.filter(x=>x.t>=lo&&x.t<=hi).map(x=>({x:x.t,y:x.y,d:x.d})):[];
   const evIdx=Object.fromEntries(A.map(x=>[x.d,x]));
   const evPts=DOT_EVENTS.map(([d,l])=>{const x=A.filter(p=>p.d<=d).at(-1);return x&&x.t>=lo&&x.t<=hi?{x:x.t,y:x.y,d:x.d,l}:null;}).filter(Boolean);
   const curEv=CUR_HIKES.map(([d,l])=>{const x=N&&N.filter(p=>p.d<=d).at(-1);return x?{x:x.t,y:x.y,d:x.d,l}:null;}).filter(Boolean);
   const ds=[
    {label:'닷컴: 나스닥 (1999-06-30 = 100)',data:pts(A),borderColor:'#f87171',backgroundColor:'#f87171',borderWidth:2.2},
    {label:'현재: 나스닥 (2026-09-16 = 100)',data:pts(N),borderColor:'#60a5fa',backgroundColor:'#60a5fa',borderWidth:2.6},
    {label:`현재: 코스피 (${ksAnchor==='fed'?'2026-09-16':'2026-07-16'} = 100)`,data:pts(K),borderColor:'#34d399',backgroundColor:'#34d399',borderWidth:2.2},
    {label:'닷컴 금리 이벤트',type:'scatter',data:evPts,pointRadius:5,pointBackgroundColor:'#fecaca',pointBorderColor:'#f87171',showLine:false},
    {label:'현재 금리 이벤트',type:'scatter',data:curEv,pointRadius:5,pointBackgroundColor:'#bfdbfe',pointBorderColor:'#60a5fa',showLine:false}
   ].map(o=>Object.assign({type:'line',pointRadius:0,parsing:false,spanGaps:true},o));
   chart&&chart.destroy();
   chart=new Chart(document.getElementById('hkChart'),{type:'line',data:{datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false,axis:'x'},
    plugins:{rangeNav:false,legend:{position:'top',labels:{color:'#cbd5e1',boxWidth:12}},tooltip:{callbacks:{title:it=>`첫 인상 후 ${it[0].parsed.x}거래일`,label:c=>{const r=c.raw;return `${c.dataset.label.split(' (')[0]}: ${r.y.toFixed(1)} (${r.y>=100?'+':''}${(r.y-100).toFixed(1)}%) · ${r.d}${r.l?' · '+r.l:''}`;}}}},
    scales:{x:{type:'linear',min:lo,max:hi,title:{display:true,text:'연준 첫 금리 인상일로부터 거래일 수',color:'#94a3b8'},ticks:{color:'#94a3b8'},grid:{color:c=>c.tick.value===0?'#e2e8f0':'rgba(148,163,184,.12)'}},
     y:{title:{display:true,text:'첫 인상일 종가 = 100',color:'#94a3b8'},ticks:{color:'#94a3b8'},grid:{color:c=>c.tick.value===100?'#64748b':'rgba(148,163,184,.12)'}}}}});
   // 같은 경과일 비교표
   const at=(s,t)=>s&&s.find(x=>x.t===t);
   const line=(name,S)=>{if(!S)return '';const L=S.at(-1),D=at(A,L.t),pre=at(S,-250),mx=S.filter(x=>x.t<=0&&x.t>=-250).reduce((q,x)=>x.y>q.y?x:q,{y:-1});
    return `<tr><td>${name}</td><td>${L.t}거래일 (${L.d})</td><td style="color:${col(L.y-100)};font-weight:700">${sg(L.y-100)}</td><td style="color:${col(D?D.y-100:null)}">${D?sg(D.y-100)+' ('+D.d+')':'—'}</td><td>${pre?sg(100/pre.y*100-100):'—'}</td><td>${mx.y>0?mx.y.toFixed(1)+' ('+mx.d+')':'—'}</td></tr>`;};
   const dPre=at(A,-250);
   document.getElementById('hkTable').innerHTML=`<thead><tr style="text-align:left;color:#93a3bd"><th>지수</th><th>첫 인상 후 경과</th><th>현재 (인상일 대비)</th><th>닷컴 나스닥 같은 시점</th><th>인상 전 1년 상승률</th><th>인상 전 1년 고점(=100 기준)</th></tr></thead><tbody>${line('현재 나스닥',N)}${line('현재 코스피',K)}<tr style="color:#93a3bd"><td>닷컴 나스닥</td><td>고점까지 176거래일</td><td>고점 +88.0%</td><td>—</td><td>${dPre?sg(100/dPre.y*100-100):'—'}</td><td>—</td></tr></tbody>`;
   // 해석(자동)
   const nl=N&&N.at(-1),kl=K&&K.at(-1),nd=nl&&at(A,nl.t),kd=kl&&at(A,kl.t),out=[];
   if(nl&&nd){const g=nl.y-nd.y;out.push(`<b>나스닥</b>: 첫 인상 ${nl.t}거래일 후 ${sg(nl.y-100)}로 닷컴 같은 시점(${sg(nd.y-100)})과 ${Math.abs(g)<5?'<em>거의 같은 경로</em>':g>0?'비교해 <em>더 강한</em> 흐름':'비교해 <em>더 약한</em> 흐름'}입니다. 닷컴 때는 인상 후 약 3개월(60거래일) 동안 ±10% 안에서 소화한 뒤 급등했습니다.`);}
   if(kl&&kd){const mx=K.filter(x=>x.t<=0&&x.t>=-250).reduce((q,x)=>x.y>q.y?x:q,{y:-1});out.push(`<b>코스피</b>: ${ksAnchor==='fed'?'연준':'한은'} 첫 인상 후 ${sg(kl.y-100)}(닷컴 나스닥 같은 시점 ${sg(kd.y-100)}). ${mx.y>110?`인상 전 1년 안에 이미 ${mx.y.toFixed(0)}까지 오른 뒤(고점 ${mx.d}) 꺾여, 닷컴으로 치면 <em>고점 이후 하락 구간</em>에 가까운 모양입니다.`:'인상 전 과열 정도는 닷컴보다 낮습니다.'}`);}
   if(dPre){const npre=at(N,-250);if(npre)out.push(`<b>인상 전 과열도</b>: 닷컴 나스닥은 인상 전 1년 ${sg(100/dPre.y*100-100)}, 현재 나스닥은 ${sg(100/npre.y*100-100)}입니다. 닷컴 이후 고점까지 연준은 4차례 더 올렸으므로, 추가 인상 횟수·속도가 미국 경로를 가를 변수입니다.`);}
   document.getElementById('hkNote').innerHTML=out.map(s=>'· '+s).join('<br>');
  };
  draw();
  box.querySelector('#hkAnchor').onchange=e=>{ksAnchor=e.target.value;draw();};
  box.querySelector('#hkRange').onchange=e=>{range=e.target.value;draw();};
 }).catch(e=>{box.innerHTML='<p class="muted">비교 자료를 읽지 못했습니다: '+e.message+'</p>';});
})();
