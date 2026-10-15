// 빅테크 회사채 · 국채 대비 스프레드 (bigtech_bonds_hist.csv: FINRA TRACE 일별 체결 + FRED 국채, 화면은 5거래일 중앙값)
(function(){
 const box=document.getElementById('btBonds');if(!box)return;
 const parse=t=>{const L=t.replace(/^﻿/,'').trim().split(/\r?\n/),h=L.shift().split(',');return L.filter(Boolean).map(l=>{const f=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,f[i]??'']));});};
 const DAY=864e5,ts=d=>Date.parse(d+'T00:00:00Z');
 const PD=s=>s>0?(1-Math.exp(-5*(s/1e4)/0.6))*100:0;
 const COL={CRWV:'#ef4444',ORCL:'#f97316',META:'#60a5fa',AMZN:'#f59e0b',NVDA:'#22c55e',GOOGL:'#a78bfa',MSFT:'#2dd4bf',AAPL:'#e2e8f0'};
 let sel='CRWV',mode='all',charts={};
 const tAx=(mn,mx)=>({type:'linear',min:mn,max:mx,ticks:{maxTicksLimit:9,callback:v=>{const d=new Date(v);return String(d.getUTCFullYear()).slice(2)+'.'+String(d.getUTCMonth()+1).padStart(2,'0');}}});
 Promise.all([fetch('bigtech_bonds.json').then(r=>r.json()),fetch('bigtech_bonds_hist.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text()),
  fetch('bigtech_bonds_ref.csv',{cache:'no-store'}).then(r=>r.ok?r.text():'date,ticker\n').catch(()=>'date,ticker\n')]).then(([M,a,b])=>{
  const B=M.bonds,ref=parse(a),own=parse(b); // ref = FINRA 원본, own = 판독 참고치(대체용)
  const S={};B.forEach(x=>S[x.t]={ref:[],own:[]});
  ref.forEach(r=>{if(S[r.ticker])S[r.ticker].ref.push({d:r.date,y:+r.ytm,u:+r.ust,s:(+r.ytm-+r.ust)*100});});
  // 원본(FINRA) 우선: 원본이 없는 종목·기간에만 판독 참고치(bigtech_bonds_ref.csv)를 채움
  const FB={};own.forEach(r=>{if(!r.ytm)return;(FB[r.ticker]=FB[r.ticker]||[]).push({d:r.date,y:+r.ytm,u:+r.ust,s:(+r.ytm-+r.ust)*100,fb:true});});
  B.forEach(x=>{const s=S[x.t];const d0=s.ref.length?s.ref.map(p=>p.d).sort()[0]:'9999';const fill=(FB[x.t]||[]).filter(p=>!s.ref.length||p.d<d0||p.d>s.ref.map(q=>q.d).sort().at(-1));s.ref.push(...fill);s.fb=fill.length;});
  const med=a=>{const b=[...a].sort((p,q)=>p-q),n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2;};
  B.forEach(x=>{const s=S[x.t];s.ref.sort((p,q)=>p.d.localeCompare(q.d));s.ref=s.ref.map((p,i,a)=>{const w=a.slice(Math.max(0,i-4),i+1).map(q=>q.y);const y=med(w);return {...p,raw:p.y,y,s:(y-p.u)*100};});s.own.sort((p,q)=>p.d.localeCompare(q.d));const lr=s.ref.at(-1);s.own=s.own.filter(o=>!lr||o.d>lr.d);
   // 연결 보정: 첫 자체 수집일의 스프레드를 판독 마지막 값에 맞춤(이후 일별 변화만 반영)
   s.adj=0;if(lr&&s.own.length&&!/수동/.test(s.own[0].src||'')){s.adj=lr.s-s.own[0].s;s.own=s.own.map(o=>({...o,raw:o.s,s:o.s+s.adj,y:o.u+(o.s+s.adj)/100}));}
   s.all=[...s.ref,...s.own];});
  const at=(arr,d)=>{let p=null;for(const x of arr){if(x.d<=d)p=x;else break;}return p;};
  const shift=(d,days)=>new Date(ts(d)-days*DAY).toISOString().slice(0,10);
  const rows=B.map(x=>{const s=S[x.t],l=s.all.at(-1);if(!l)return null;const y1=at(s.all,shift(l.d,365)),m1=at(s.all,shift(l.d,30)),m3=at(s.all,shift(l.d,91));
   const last12=s.all.filter(p=>p.d>=shift(l.d,365)),mx=last12.reduce((m,p)=>p.s>m.s?p:m,last12[0]),mx3=s.all.reduce((m,p)=>p.s>m.s?p:m,s.all[0]);
   return {x,l,y1,m1,m3,mx,mx3,own:!!s.own.length&&l===s.own.at(-1)};}).filter(Boolean).sort((p,q)=>q.l.s-p.l.s);
  const f0=v=>v==null?'—':Math.round(v).toLocaleString(),ch=(a,b)=>a==null||b==null?'—':`<span class="${a-b>0?'bb-up':'bb-dn'}">${a-b>0?'+':''}${Math.round(a-b)}</span>`;
  const asof=rows.reduce((m,r)=>r.l.d>m?r.l.d:m,'');
  // 자동 요약
  const R=Object.fromEntries(rows.map(r=>[r.x.t,r]));const s0=r=>S[r.x.t].all[0].d.slice(0,7).replace('-','.');const pts=[];
  if(R.CRWV){const r=R.CRWV;pts.push(`<b>코어위브</b> 수익률 ${r.l.y.toFixed(2)}%, 스프레드 ${f0(r.l.s)}bp — 최근 1년 고점 ${f0(r.mx.s)}bp(${r.mx.d.slice(2,7).replace('-','.')}) ${r.l.s>=r.mx.s-1?'경신':'대비 '+f0(r.mx.s-r.l.s)+'bp 아래'}`);}
  if(R.ORCL){const r=R.ORCL;pts.push(`<b>오라클</b> ${f0(r.l.s)}bp — ${r.l.s>=r.mx3.s-1?'FINRA 이력('+s0(R.ORCL)+'~) 최고치':'이력 최고 '+f0(r.mx3.s)+'bp'}, 1년 전 ${f0(r.y1&&r.y1.s)}bp의 ${r.y1?(r.l.s/r.y1.s).toFixed(1):'—'}배. 빅테크 중 가장 크게 벌어짐`);}
  const big=rows.filter(r=>!['CRWV','ORCL'].includes(r.x.t)&&r.y1);const wid=big.filter(r=>r.l.s-r.y1.s>=15).map(r=>`${r.x.name} ${r.l.s-r.y1.s>0?'+':''}${Math.round(r.l.s-r.y1.s)}bp`);
  if(wid.length)pts.push(`1년 새 확대: ${wid.join(' · ')}`);
  const nar=rows.filter(r=>r.y1&&r.l.s<r.y1.s).map(r=>`${r.x.name}(${f0(r.y1.s)}→${f0(r.l.s)}bp)`);pts.push(nar.length?`1년 전보다 좁아진 곳: ${nar.join(', ')}`:'1년 전보다 좁아진 곳 없음');
  box.innerHTML=`<ul class="bb-pts">${pts.map(p=>`<li>${p}</li>`).join('')}</ul>
   <div class="g2 bb-g"><div><h3>국채 대비 스프레드 · ${asof} (FINRA 체결 기준)</h3><div class="chart" style="height:${rows.length*38+40}px"><canvas id="bbBar"></canvas></div></div>
   <div style="overflow-x:auto"><table class="bb-t"><thead><tr><th>회사 · 대표 채권</th><th>수익률</th><th>국채</th><th>스프레드</th><th>1개월</th><th>3개월</th><th>1년 전</th><th>1년 변화</th><th>부도확률(5Y)</th></tr></thead><tbody>
   ${rows.map(r=>`<tr data-t="${r.x.t}" class="${r.x.t===sel?'on':''}"><td><b>${r.x.name}</b> <span class="muted">${r.x.t}</span><br><span class="muted">${r.x.bond}</span></td><td>${r.l.y.toFixed(2)}%</td><td>${r.l.u.toFixed(2)}%</td><td><b>${f0(r.l.s)}</b></td><td>${ch(r.l.s,r.m1&&r.m1.s)}</td><td>${ch(r.l.s,r.m3&&r.m3.s)}</td><td>${f0(r.y1&&r.y1.s)}</td><td>${ch(r.l.s,r.y1&&r.y1.s)}</td><td>${PD(r.l.s).toFixed(1)}%</td></tr>`).join('')}</tbody></table>
   <p class="muted" style="margin-top:6px">행을 누르면 아래에 그 회사 차트가 나옵니다. 부도확률 = 1 − exp(−5 × 스프레드 ÷ (1 − 회수율 40%)).</p></div></div>
   <div class="g2 bb-g"><div><div class="bb-h"><h3>스프레드 추이 (bp)</h3><div class="seg" id="bbMode"><button data-m="all" class="${mode==='all'?'on':''}">전체</button><button data-m="big" class="${mode==='big'?'on':''}">빅테크만(코어위브 제외)</button></div></div><div class="chart" style="height:360px"><canvas id="bbTrend"></canvas></div></div>
   <div><div class="bb-h"><h3 id="bbOneT"></h3></div><div class="chart" style="height:360px"><canvas id="bbOne"></canvas></div><p class="muted" id="bbOneN"></p></div></div>
   <p class="muted">회사별 대표 회사채 1종 기준. 원본 출처: 회사채 = FINRA Fixed Income Data(TRACE) 일별 마지막 체결 가격·수익률(최근 5년). 하루 마지막 1건 체결은 소액 거래로 튀는 경우가 많아 화면의 수익률·스프레드는 최근 5거래일 중앙값입니다(원값은 bigtech_bonds_hist.csv), 국채 = FRED 미 국채 고정만기 수익률(DGS1~20)을 날짜별 남은 만기로 보간한 같은 만기 국채. 코어위브(RegS)는 FINRA가 수익률을 비워 둬 체결 가격으로 만기수익률을 직접 계산합니다. 매일 10:37·16:47(KST) 자동 갱신(FINRA는 미국 전 영업일 기준).</p>`;
  Object.values(charts).forEach(c=>c.destroy());charts={};
  charts.bar=new Chart(document.getElementById('bbBar'),{type:'bar',data:{labels:rows.map(r=>r.x.name),datasets:[{data:rows.map(r=>r.l.s),backgroundColor:'#d9582b',borderRadius:2,barPercentage:.7}]},
   options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:false,layout:{padding:{right:230}},plugins:{legend:{display:false},rangeNav:false,tooltip:{callbacks:{label:t=>{const r=rows[t.dataIndex];return `${Math.round(r.l.s)}bp · 부도확률 ${PD(r.l.s).toFixed(1)}% · 수익률 ${r.l.y.toFixed(2)}%`;}}}},
    scales:{x:{beginAtZero:true,title:{display:true,text:'국채 대비 스프레드 (bp)'}},y:{ticks:{color:'#e2e8f0',font:{size:13}}}}},
   plugins:[{id:'bbLab',afterDatasetsDraw(c){const m=c.getDatasetMeta(0),x=c.ctx;x.save();x.font='12.5px system-ui,sans-serif';x.fillStyle='#e2e8f0';x.textBaseline='middle';
    m.data.forEach((el,i)=>{const r=rows[i];x.fillText(`${Math.round(r.l.s)}bp   부도확률 ${PD(r.l.s).toFixed(1)}%   수익률 ${r.l.y.toFixed(2)}%`,el.x+8,el.y);});x.restore();}}]});
  const trend=()=>{if(charts.tr)charts.tr.destroy();const ds=[];let mn=Infinity,mx=-Infinity;
   B.forEach(x=>{if(mode==='big'&&x.t==='CRWV')return;const s=S[x.t];const r=s.ref.map(p=>({x:ts(p.d),y:mode==='big'?p.s:Math.max(5,p.s)})),o=s.own.length?[s.ref.at(-1),...s.own].filter(Boolean).map(p=>({x:ts(p.d),y:Math.max(1,p.s)})):[];
    [...r,...o].forEach(p=>{mn=Math.min(mn,p.x);mx=Math.max(mx,p.x);});
    ds.push({label:x.name,data:r,borderColor:COL[x.t],backgroundColor:COL[x.t],borderWidth:x.t==='ORCL'||x.t==='CRWV'?2.4:1.4,pointRadius:0,parsing:false});
    if(o.length)ds.push({label:x.name+' (자체)',data:o,borderColor:COL[x.t],borderDash:[4,3],borderWidth:1.6,pointRadius:o.length<6?2:0,parsing:false,rnSkip:false});});
   charts.tr=new Chart(document.getElementById('bbTrend'),{type:'line',data:{datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false,axis:'x'},
    plugins:{legend:{position:'bottom',labels:{boxWidth:10,filter:i=>!/\(자체\)/.test(i.text)}},tooltip:{callbacks:{title:it=>new Date(it[0].parsed.x).toISOString().slice(0,10),label:t=>`${t.dataset.label}: ${Math.round(t.parsed.y)}bp`}}},
    scales:{x:tAx(mn,mx),y:mode==='big'?{title:{display:true,text:'스프레드 (bp)'}}:{type:'logarithmic',min:5,title:{display:true,text:'스프레드 (bp, 로그)'}}}}});};
  const one=()=>{if(charts.one)charts.one.destroy();const x=B.find(b=>b.t===sel),s=S[sel],r=rows.find(q=>q.x.t===sel);
   document.getElementById('bbOneT').textContent=`${x.name}  ${x.bond} 만기 회사채`;
   const C=s.all.map(p=>({x:ts(p.d),y:p.y})),U=s.all.map(p=>({x:ts(p.d),y:p.u}));const ownStart=s.own.length?ts(s.own[0].d):null;
   charts.one=new Chart(document.getElementById('bbOne'),{type:'line',data:{datasets:[
     {label:'같은 만기 미 국채',data:U,borderColor:'#94a3b8',backgroundColor:'#94a3b8',borderWidth:2,pointRadius:0,parsing:false},
     {label:x.name+' 회사채',data:C,borderColor:'#e2622b',backgroundColor:'rgba(217,88,43,.16)',fill:'-1',borderWidth:2.4,pointRadius:0,parsing:false,
      segment:{borderDash:c=>ownStart&&c.p0.parsed.x>=ownStart-DAY?[4,3]:undefined}}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',align:'start',labels:{boxWidth:12}},
     tooltip:{callbacks:{title:it=>new Date(it[0].parsed.x).toISOString().slice(0,10),afterBody:it=>{const c=it.find(i=>i.datasetIndex===1),u=it.find(i=>i.datasetIndex===0);return c&&u?`스프레드 ${Math.round((c.parsed.y-u.parsed.y)*100)}bp`:'';},label:t=>`${t.dataset.label}: ${t.parsed.y.toFixed(2)}%`}}},
     scales:{x:tAx(C[0]&&C[0].x,C.at(-1)&&C.at(-1).x),y:{ticks:{callback:v=>v.toFixed(1)+'%'}}}}});
   document.getElementById('bbOneN').innerHTML=r?`수익률 ${r.l.y.toFixed(2)}% · 국채 ${r.l.u.toFixed(2)}% · 국채 대비 <b>+${Math.round(r.l.s)}bp</b>${r.l.p?' · 가격 '+r.l.p.toFixed(1):''} · 5년 내 부도확률 ${PD(r.l.s).toFixed(1)}% · 기준 ${r.l.d}(FINRA TRACE)`:'';};
  trend();one();
  box.addEventListener('click',e=>{const tr=e.target.closest('tr[data-t]');if(tr){sel=tr.dataset.t;box.querySelectorAll('tr[data-t]').forEach(q=>q.classList.toggle('on',q===tr));one();return;}
   const b=e.target.closest('#bbMode button');if(b){mode=b.dataset.m;b.parentElement.querySelectorAll('button').forEach(q=>q.classList.toggle('on',q===b));trend();}});
 }).catch(e=>{box.innerHTML='<p class="muted">회사채 자료를 읽지 못했습니다.</p>';console.warn(e);});
})();
