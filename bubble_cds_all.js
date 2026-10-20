// 주요 기업 5년 CDS 통합 차트 (cds_hana_ref.csv 판독 이력 + cds_manual.csv·cds_series.csv 보도/원자료 점)
(function(){
 const cv=document.getElementById('cdsAll');if(!cv)return;
 const parse=t=>{const L=t.replace(/^﻿/,'').trim().split(/\r?\n/),h=L.shift().split(',');return L.filter(Boolean).map(l=>{const f=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,f[i]??'']));});};
 const DAY=864e5,ts=d=>Date.parse(d+'T00:00:00Z');
 const T=[['ORCL','오라클','#e8608a',3],['SPCX','스페이스X','#475569',2],['AVGO','브로드컴','#f4a3bd',2],['META','메타','#a3a3a3',2],['NVDA','엔비디아','#5eead4',2],['AMZN','아마존','#737373',2],['GOOGL','알파벳','#bae6fd',2],['MSFT','마이크로소프트','#e5e7eb',2],['AAPL','애플','#0f766e',2],['CRWV','코어위브 (우축)','#3b82f6',2.6,'y1']];
 Promise.all(['cds_hana_ref.csv','cds_manual.csv','cds_series.csv','bigtech_bonds_hist.csv'].map(f=>fetch(f+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'date,ticker\n').catch(()=>'date,ticker\n'))).then(([a,b,c,bh])=>{
  const ref=parse(a),man=parse(b),ser=parse(c);
  const S={};T.forEach(([t])=>S[t]={line:[],dots:[]});
  ref.forEach(r=>{if(S[r.ticker])S[r.ticker].line.push({d:r.date,v:+r.cds_5y_bps});});
  // 원자료 우선: 판독 이력 이후 날짜의 일별 원자료(cds_series)는 선에 이어 붙이고, 보도 수치는 점으로 표시
  ser.forEach(r=>{const s=S[r.ticker];if(!s)return;const last=s.line.length?s.line.reduce((m,p)=>p.d>m?p.d:m,''):'';if(r.date>last)s.line.push({d:r.date,v:+r.cds_5y_bps,o:1});});
  man.forEach(r=>{const s=S[r.ticker];if(s&&r.cds_5y_bps)s.dots.push({d:r.date,v:+r.cds_5y_bps,src:r.note||r.source});});
  Object.values(S).forEach(s=>{s.line.sort((p,q)=>p.d.localeCompare(q.d));s.dots.sort((p,q)=>p.d.localeCompare(q.d));
   s.est=[];});
  // 매일 갱신(원본 데이터): 판독 이력 마지막 날 이후는 FINRA 회사채 스프레드(5거래일 중앙값)의 변화폭만큼 CDS를 이어 붙임
  {const BH={};parse(bh).forEach(r=>{if(r.ytm&&r.ust)(BH[r.ticker]=BH[r.ticker]||[]).push({d:r.date,y:+r.ytm,u:+r.ust});});
   const med=a=>{const b=[...a].sort((p,q)=>p-q),n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2;};
   Object.entries(S).forEach(([t,s])=>{const B=(BH[t]||[]).sort((p,q)=>p.d.localeCompare(q.d)).map((p,i,a)=>({d:p.d,s:(med(a.slice(Math.max(0,i-4),i+1).map(q=>q.y))-p.u)*100}));
    const lr=s.line.at(-1);if(!lr||!B.length)return;const base=[...B].reverse().find(p=>p.d<=lr.d);if(!base)return;
    s.est=B.filter(p=>p.d>lr.d).map(p=>({d:p.d,v:Math.max(1,lr.v+(p.s-base.s)),o:3}));s.estBase={d:base.d,s:base.s};});}
  Object.values(S).forEach(s=>{if(s.est.length){s.line.push(...s.est);return;}
   const lastL=s.line.at(-1);s.dots.filter(p=>!lastL||p.d>lastL.d).forEach(p=>s.line.push({d:p.d,v:p.v,o:2}));});
  const ds=[];let mn=Infinity,mx=-Infinity;
  T.forEach(([t,n,c,w,ax])=>{const s=S[t];if(!s.line.length&&!s.dots.length)return;
   const R0=s.line.filter(p=>p.o!==3),E0=s.line.filter(p=>p.o===3);const L=R0.map(p=>({x:ts(p.d),y:p.v}));const LE=E0.length?[R0.at(-1),...E0].map(p=>({x:ts(p.d),y:p.v})):[];LE.forEach(p=>{mn=Math.min(mn,p.x);mx=Math.max(mx,p.x);});L.forEach(p=>{mn=Math.min(mn,p.x);mx=Math.max(mx,p.x);});
   ds.push({type:'line',label:ax?t+' (우)':t,yAxisID:ax||'y',data:L,borderColor:c,backgroundColor:c,borderWidth:w,borderDash:t==='SPCX'?[5,3]:undefined,pointRadius:0,tension:0,parsing:false,spanGaps:true,_n:n});
   if(LE.length)ds.push({type:'line',label:t+' 추정',yAxisID:ax||'y',data:LE,borderColor:c,backgroundColor:c,borderWidth:w,borderDash:[3,3],pointRadius:LE.length<6?2.5:0,tension:0,parsing:false,_n:n+' (FINRA 회사채로 추정)',rnSkip:true});
   /* 보도 수치 점은 판독 선과 겹쳐 표시하지 않음(판독 이후 구간 이어 붙이기에만 사용) */});
  const tick=v=>{const d=new Date(v);return String(d.getUTCFullYear()).slice(2)+'.'+(d.getUTCMonth()+1);};
  new Chart(cv,{type:'line',data:{datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false,axis:'x'},
   plugins:{legend:{position:'top',labels:{boxWidth:14,filter:i=>!/보도$|추정$/.test(i.text)}},
    tooltip:{itemSort:(a,b)=>b.parsed.y-a.parsed.y,callbacks:{title:it=>new Date(it[0].parsed.x).toISOString().slice(0,10),label:t=>{const d=t.dataset;if(d._dots){const p=d._dots[t.dataIndex];return `${d.label}: ${t.parsed.y}bp (${p.src||''})`;}return `${d._n||d.label}: ${Math.round(t.parsed.y)}bp`;}}}},
   scales:{x:{type:'linear',min:mn,max:mx+Math.max((mx-mn)*0.04,10*864e5),ticks:{maxTicksLimit:12,callback:tick}},y:{beginAtZero:true,grace:'8%',title:{display:true,text:'5Y CDS (bp)'}},...(ds.some(d=>d.yAxisID==='y1')?{y1:{position:'right',min:0,grace:'8%',grid:{drawOnChartArea:false},ticks:{color:'#60a5fa'},title:{display:true,text:'코어위브 5Y CDS (bp, 우)',color:'#60a5fa'}}}:{})}}});
  // 오른쪽 'CDS 5년' 표도 같은 일별 이력(판독 → FINRA 매일 추정)으로 최신화
  {const NM={ORCL:'Oracle',SPCX:'SpaceX',AVGO:'Broadcom',META:'Meta',NVDA:'Nvidia',AMZN:'Amazon',GOOGL:'Alphabet',MSFT:'Microsoft',AAPL:'Apple',CRWV:'CoreWeave'};
   const patch=()=>{const tb=document.getElementById('cdsTable');if(!tb||!tb.rows.length)return false;
    const have={};[...tb.rows].forEach(tr=>{const m=(tr.cells[0]?.textContent||'').match(/\(([A-Z]+)\)/);if(m)have[m[1]]=tr;});
    Object.entries(S).forEach(([t,s])=>{const l=s.line.at(-1);if(!l)return;const p=s.line.at(-2);let tr=have[t];
     if(!tr){tr=document.createElement('tr');for(let i=0;i<5;i++)tr.insertCell();tr.cells[0].textContent=(NM[t]||t)+' ('+t+')';tb.append(tr);}
     const old=tr.cells[1].textContent;if(old&&old>l.d)return; // 보도 기록이 더 최신이면 유지
     tr.cells[1].textContent=l.d;tr.cells[2].textContent=Math.round(l.v).toLocaleString();tr.cells[2].style.background=l.v>=200?'#5b1a1a':l.v>=100?'#3b2a12':'';
     tr.cells[3].textContent=p?((l.v-p.v>0?'+':'')+Math.round(l.v-p.v)+'bp'):'—';
     const src=l.o===3?'FINRA 추정':l.o===2?'보도':'판독';const a=tr.cells[4].querySelector('a');tr.cells[4].replaceChildren(document.createTextNode(src+(a?' · ':'')));if(a){a.textContent='보도';tr.cells[4].append(a);}});
    [...tb.rows].sort((x,y)=>(+y.cells[2].textContent.replace(/,/g,'')||0)-(+x.cells[2].textContent.replace(/,/g,'')||0)).forEach(r=>tb.append(r));
    const h=tb.closest('section')?.querySelector('p.muted');if(h&&!h.dataset.daily){h.dataset.daily=1;h.insertAdjacentHTML('beforeend',' <b>최근 기록일·CDS·직전 대비는 아래 통합 차트와 같은 일별 이력(Bloomberg 차트 판독 → 이후 FINRA 회사채로 매일 추정)으로 갱신되며, 출처 칸에 기준을 표시합니다.</b>');}
    return true;};
   let k=0;const iv=setInterval(()=>{if(patch()||++k>40)clearInterval(iv);},250);}
  // 표
  const at=(a,d)=>{let p=null;for(const x of a){if(x.d<=d)p=x;else break;}return p;};const sh=(d,n)=>new Date(ts(d)-n*DAY).toISOString().slice(0,10);
  const rows=T.map(([t,n])=>{const s=S[t];const l=s.line.at(-1);if(!l)return null;const m1=at(s.line,sh(l.d,30)),m3=at(s.line,sh(l.d,91)),y0=s.line.find(p=>p.d>='2025-01-01'),pk=s.line.reduce((m,p)=>p.v>m.v?p:m,s.line[0]);
   return {t,n,l,m1,m3,y0,pk};}).filter(Boolean).sort((p,q)=>q.l.v-p.l.v);
  const ch=(a,b)=>b?`<span class="${a-b>0?'bb-up':'bb-dn'}">${a-b>0?'+':''}${Math.round(a-b)}</span>`:'—';
  const lvl=v=>v>=500?'투기등급(하이일드) 수준':v>=200?'투기등급 근접':v>=100?'우량 기업으로는 이례적':'';
  document.getElementById('cdsAllT').innerHTML='<thead><tr><th>회사</th><th>최근</th><th>기준일</th><th>1개월</th><th>3개월</th><th>시작 대비</th><th>기간 최고</th><th>수준</th></tr></thead><tbody>'+
   rows.map(r=>`<tr><td><b>${r.n}</b> <span class="muted">${r.t}</span></td><td><b>${Math.round(r.l.v)}bp</b></td><td>${r.l.d}${r.l.o===2?' (보도)':r.l.o===3?' (FINRA 추정)':''}</td><td>${ch(r.l.v,r.m1&&r.m1.v)}</td><td>${ch(r.l.v,r.m3&&r.m3.v)}</td><td>${r.y0?(r.l.v/r.y0.v).toFixed(1)+'배 <span class="muted">('+r.y0.d.slice(2,7).replace('-','.')+' '+Math.round(r.y0.v)+')</span>':'—'}</td><td>${Math.round(r.pk.v)} <span class="muted">${r.pk.d.slice(2)}</span></td><td>${lvl(r.l.v)}</td></tr>`).join('')+'</tbody>';
 });
})();
