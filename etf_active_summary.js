// 액티브 ETF 구성비율 변화 — 상단 요약: 여러 ETF에서 공통으로 늘리거나 줄인 종목, 신규 편입·편출, ETF별 핵심 변화
(function(){
 const box=document.getElementById('eaSummary');if(!box)return;
 const get=u=>fetch(u+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
 const isStock=(k,n)=>/^[0-9A-Z]{6}$/.test(k)&&!/현금|예금|선물|원화|USD|CASH|설정액/i.test(n||'');
 const sg=v=>(v>0?'+':'')+v.toFixed(2)+'%p',cl=v=>v>0?'up':v<0?'dn':'';
 let ALL=[],N=1;
 async function init(){
  const idx=await get('etf_pdf/index.json');if(!idx||!idx.etfs?.length){box.innerHTML='<p class="muted">자료 수집 중입니다.</p>';return;}
  ALL=(await Promise.all(idx.etfs.map(e=>get('etf_pdf/'+e.code+'.json').then(j=>j&&{...j,label:e.label})))).filter(j=>j&&j.dates.length>1);
  box.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{N=+b.dataset.n;box.querySelectorAll('[data-n]').forEach(x=>x.classList.toggle('on',x===b));draw();});
  draw();search();
  ['eafq','eafchg'].forEach(id=>document.getElementById(id)?.addEventListener('input',allTbl));document.getElementById('eafchg')?.addEventListener('change',allTbl);document.getElementById('eafxls')?.addEventListener('click',xls);}
 function draw(){
  const last=ALL.map(j=>j.dates.at(-1)).sort().at(-1);
  const agg={},nw=[],out=[],per=[];
  for(const J of ALL){const B=J.dates.length-1,A=Math.max(0,B-N);if(J.dates[B]!==last)continue;
   const ch=[];
   for(const [k,a] of Object.entries(J.w)){const n=J.names[k]||k;if(!isStock(k,n))continue;const wa=a[A]??null,wb=a[B]??null;if(wa==null&&wb==null)continue;
    const d=(wb||0)-(wa||0);if(Math.abs(d)<0.005&&!(wa==null||wb==null))continue;ch.push({k,n,d,wa,wb});
    const g=agg[k]=agg[k]||{k,n,up:[],dn:[],sum:0};g.sum+=d;if(d>0.05)g.up.push([J.label,d]);else if(d<-0.05)g.dn.push([J.label,d]);
    if(wa==null&&wb!=null)nw.push([n,J.label,wb]);if(wa!=null&&wb==null)out.push([n,J.label,wa]);}
   ch.sort((x,y)=>y.d-x.d);per.push({l:J.label,from:J.dates[A],up:ch.slice(0,3).filter(x=>x.d>0),dn:ch.slice(-3).reverse().filter(x=>x.d<0)});}
  const G=Object.values(agg);
  const cu=G.filter(g=>g.up.length>=2).sort((a,b)=>b.up.length-a.up.length||b.sum-a.sum).slice(0,10);
  const cd=G.filter(g=>g.dn.length>=2).sort((a,b)=>b.dn.length-a.dn.length||a.sum-b.sum).slice(0,10);
  const tip=a=>a.map(([l,d])=>`${l} ${sg(d)}`).join('\n');
  const li=(g,side)=>{const a=side==='up'?g.up:g.dn;return `<li data-k="${g.k}" style="cursor:pointer" title="${tip(a)}"><b>${g.n}</b> <span class="muted">${a.length}개 ETF</span> <span class="${cl(g.sum)}">${sg(a.reduce((s,x)=>s+x[1],0))}</span></li>`;};
  const per0=per[0]?.from||'';
  box.querySelector('.es-h').innerHTML=`<b>${last}</b> 기준 · ${N===1?'전 거래일':N+'거래일 전'}(${per0}) 대비 · ETF ${per.length}개 · 비중 변화 0.05%p 이상만 집계 (현금·선물 제외)`;
  box.querySelector('.es-up').innerHTML=cu.length?cu.map(g=>li(g,'up')).join(''):'<li class="muted">2개 이상 ETF가 함께 늘린 종목 없음</li>';
  box.querySelector('.es-dn').innerHTML=cd.length?cd.map(g=>li(g,'dn')).join(''):'<li class="muted">2개 이상 ETF가 함께 줄인 종목 없음</li>';
  const nl=a=>a.length?a.sort((x,y)=>y[2]-x[2]).slice(0,12).map(([n,l,w])=>`<li><b>${n}</b> <span class="muted">${l} · ${w.toFixed(2)}%</span></li>`).join(''):'<li class="muted">없음</li>';
  box.querySelector('.es-new').innerHTML=nl(nw);box.querySelector('.es-out').innerHTML=nl(out);
  box.querySelector('.es-per').innerHTML='<thead><tr><th class="l">ETF</th><th class="l">비중 확대 상위</th><th class="l">비중 축소 상위</th></tr></thead><tbody>'+
   per.map(p=>`<tr><td class="l"><b>${p.l}</b></td><td class="l">${p.up.map(x=>`${x.n} <span class="up">${sg(x.d)}</span>`).join(' · ')||'<span class="muted">—</span>'}</td><td class="l">${p.dn.map(x=>`${x.n} <span class="dn">${sg(x.d)}</span>`).join(' · ')||'<span class="muted">—</span>'}</td></tr>`).join('')+'</tbody>';
  // 한 줄 요약
  const top=(a,f)=>a.slice(0,3).map(f).join(', ');
  box.querySelector('.es-line').innerHTML=[cu.length?`<b class="up">공통 확대</b> ${top(cu,g=>`${g.n}(${g.up.length}개)`)}`:'',cd.length?`<b class="dn">공통 축소</b> ${top(cd,g=>`${g.n}(${g.dn.length}개)`)}`:'',nw.length?`<b>신규 편입</b> ${nw.length}건`:'',out.length?`<b>편출</b> ${out.length}건`:''].filter(Boolean).join(' · ');
  allTbl();
 }

 // 종목 검색: 선택 종목의 ETF별 비중·변화(전일·5·20거래일·최초 대비)와 비중 추이
 function search(){
  const q=document.getElementById('esq'),sug=document.getElementById('essug');if(!q)return;
  const S={};ALL.forEach(J=>Object.entries(J.names).forEach(([k,n])=>{if(isStock(k,n))S[k]=n;}));
  const list=Object.entries(S).map(([k,n])=>({k,n,l:n.toLowerCase()}));let ch=null,cur=-1,items=[];
  const at=(a,i)=>i>=0&&i<a.length?a[i]:null,f2=v=>v==null?'—':v.toFixed(2)+'%',d2=v=>v==null?'—':`<span class="${cl(v)}">${sg(v)}</span>`;
  function show(k){sug.style.display='none';q.value=S[k];
   const rows=[];for(const J of ALL){const a=J.w[k];if(!a||a.every(v=>v==null))continue;const B=J.dates.length-1,wb=at(a,B);
    const dd=n=>{const wa=at(a,Math.max(0,B-n));return wb==null&&wa==null?null:(wb||0)-(wa||0);};
    const fi=a.findIndex(v=>v!=null),hi=Math.max(...a.filter(v=>v!=null));
    rows.push({J,a,wb,d1:dd(1),d5:dd(5),d20:dd(20),d0:(wb||0)-(a[fi]||0),fd:J.dates[fi],hi,out:wb==null});}
   rows.sort((x,y)=>(y.wb||0)-(x.wb||0));
   const nIn=rows.filter(r=>!r.out).length,up=rows.filter(r=>r.d1>0.005).length,dn=rows.filter(r=>r.d1<-0.005).length;
   document.getElementById('esinfo').innerHTML=rows.length?`<b>${S[k]}</b> (${k}) · 현재 ${nIn}개 ETF 보유${rows.length>nIn?` · 과거 보유 후 편출 ${rows.length-nIn}개`:''} · 전일 대비 비중 확대 <b class="up">${up}</b> · 축소 <b class="dn">${dn}</b>`:`<b>${S[k]}</b> — 11개 ETF 중 보유 이력이 없습니다.`;
   document.getElementById('estbl').innerHTML=rows.length?'<thead><tr><th class="l">ETF</th><th>최신 비중</th><th>전일 대비</th><th>5거래일</th><th>20거래일</th><th>최초 편입 대비</th><th>기간 최고 비중</th><th class="l">최초 확인일</th></tr></thead><tbody>'+
    rows.map(r=>`<tr><td class="l"><b>${r.J.label}</b>${r.out?' <span class="dn">편출</span>':''}</td><td>${f2(r.wb)}</td><td>${d2(r.d1)}</td><td>${d2(r.d5)}</td><td>${d2(r.d20)}</td><td>${d2(r.d0)}</td><td>${f2(r.hi)}</td><td class="l">${r.fd}</td></tr>`).join('')+'</tbody>':'';
   const w=document.getElementById('eschw');w.style.display=rows.length?'block':'none';if(ch)ch.destroy();if(!rows.length)return;
   const D=[...new Set(rows.flatMap(r=>r.J.dates))].sort(),C=['#f87171','#60a5fa','#34d399','#fbbf24','#a78bfa','#f472b6','#22d3ee','#fb923c','#e2e8f0','#86efac','#fca5a5'];
   ch=new Chart(document.getElementById('esch'),{type:'line',data:{labels:D,datasets:rows.map((r,i)=>{const m=Object.fromEntries(r.J.dates.map((d,j)=>[d,r.a[j]??null]));return {label:r.J.label,data:D.map(d=>d in m?m[d]:null),borderColor:C[i%C.length],backgroundColor:C[i%C.length],borderWidth:2,pointRadius:0,spanGaps:false};})},
    options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{itemSort:(a,b)=>(b.parsed.y??-1)-(a.parsed.y??-1),callbacks:{label:c=>` ${c.dataset.label} ${c.parsed.y==null?'—':c.parsed.y.toFixed(2)+'%'}`}}},
     scales:{x:{ticks:{maxTicksLimit:10,callback:function(v){const l=this.getLabelForValue(v);return typeof l==='string'?l.slice(5).replace('-','/'):'';}},grid:{display:false}},y:{title:{display:true,text:'비중 %'},grid:{color:'rgba(148,163,184,.12)'}}}}});
   try{history.replaceState(null,'','?q='+k);}catch(e){}}
  function render(){const v=q.value.trim().toLowerCase();if(!v){sug.style.display='none';return;}
   items=list.filter(x=>x.l.includes(v)||x.k.includes(v)).sort((a,b)=>(a.l.startsWith(v)?0:1)-(b.l.startsWith(v)?0:1)||a.n.length-b.n.length).slice(0,12);cur=-1;
   sug.innerHTML=items.map((x,i)=>`<div data-k="${x.k}" style="padding:7px 12px;cursor:pointer">${x.n} <span class="muted">${x.k}</span></div>`).join('')||'<div class="muted" style="padding:7px 12px">보유 종목 중 일치 없음</div>';sug.style.display='block';
   sug.querySelectorAll('[data-k]').forEach(d=>d.onmousedown=e=>{e.preventDefault();show(d.dataset.k);});}
  q.addEventListener('input',render);q.addEventListener('blur',()=>setTimeout(()=>sug.style.display='none',150));
  q.addEventListener('keydown',e=>{const ds=sug.querySelectorAll('[data-k]');if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();cur=(cur+(e.key==='ArrowDown'?1:-1)+ds.length)%ds.length;ds.forEach((d,i)=>d.style.background=i===cur?'#1e3a8a':'');}
   else if(e.key==='Enter'){const x=items[cur<0?0:cur];if(x)show(x.k);}});
  const k0=new URLSearchParams(location.search).get('q');if(k0&&S[k0])show(k0);
  box.addEventListener('click',e=>{const li=e.target.closest('li[data-k]');if(li){show(li.dataset.k);document.getElementById('eaSearch').scrollIntoView({behavior:'smooth'});}});
 }

 // 전 종목 표: 기준일 A(N거래일 전) vs B(최신) — 보유 ETF 수, 신규·편출, 수량 증가·감소·유지, 평균 비중
 let AT=[],aSort='inc',aDir=-1;
 function allTbl(){
  const T=document.getElementById('eaft');if(!T)return;const last=ALL.map(j=>j.dates.at(-1)).sort().at(-1);const M={};let dA='',byW=false;
  for(const J of ALL){const B=J.dates.length-1;if(J.dates[B]!==last)continue;const A=Math.max(0,B-N);dA=J.dates[A];
   const hasS=J.sd&&J.sd.includes(J.dates[A])&&J.sd.includes(J.dates[B]);if(!hasS)byW=true;
   const keys=new Set([...Object.keys(J.w)]);
   for(const k of keys){const n=J.names[k]||k;if(!isStock(k,n))continue;const a=J.w[k],wa=a[A]??null,wb=a[B]??null;if(wa==null&&wb==null)continue;
    const r=M[k]=M[k]||{k,n,ha:0,hb:0,nw:0,ex:0,inc:0,dec:0,keep:0,sa:0,sb:0,incL:[],decL:[],byW:false};
    if(wa!=null){r.ha++;r.sa+=wa;}if(wb!=null){r.hb++;r.sb+=wb;}
    if(wa==null){r.nw++;r.incL.push([J.label,null,wb]);continue;}if(wb==null){r.ex++;r.decL.push([J.label,null,wa]);continue;}
    let dir=0,pct=null;
    if(hasS&&J.s&&J.s[k]&&J.s[k][A]!=null&&J.s[k][B]!=null){const qa=J.s[k][A],qb=J.s[k][B];pct=qa?(qb/qa-1)*100:null;dir=qb>qa?1:qb<qa?-1:0;}
    else{const d=wb-wa;dir=d>0.05?1:d<-0.05?-1:0;pct=null;r.byW=true;}
    if(dir>0){r.inc++;r.incL.push([J.label,pct,wb-wa]);}else if(dir<0){r.dec++;r.decL.push([J.label,pct,wb-wa]);}else r.keep++;}}
  AT=Object.values(M).map(r=>({...r,wa:r.ha?r.sa/r.ha:null,wb:r.hb?r.sb/r.hb:null,dw:(r.hb?r.sb/r.hb:0)-(r.ha?r.sa/r.ha:0),net:r.inc+r.nw-r.dec-r.ex}));
  const q=(document.getElementById('eafq').value||'').trim().toLowerCase(),oc=document.getElementById('eafchg').checked;
  let R=AT.filter(r=>(!q||r.n.toLowerCase().includes(q)||r.k.includes(q))&&(!oc||r.inc+r.dec+r.nw+r.ex>0));
  R.sort((x,y)=>{const a=x[aSort],b=y[aSort];if(typeof a==='string')return aDir*a.localeCompare(b);return aDir*((a??-1e9)-(b??-1e9))||(y.hb-x.hb);});
  const dB=last.slice(5).replace('-','/'),dAa=dA.slice(5).replace('-','/');
  document.getElementById('eafh').innerHTML=`<b>${dA} → ${last}</b> · 종목 ${R.length.toLocaleString()}개 (전체 ${AT.length.toLocaleString()}) · ETF ${ALL.length}개${byW?' · <span class="muted">일부 ETF는 수량 기록이 없어 비중 기준</span>':''}`;
  const H=[['n',`종목명`],['ha',`${dAa} 보유 ETF 수`],['hb',`${dB} 보유 ETF 수`],['nw','신규 ETF'],['ex','편출 ETF'],['inc','수량 증가 ETF'],['dec','수량 감소 ETF'],['keep','유지 ETF'],['wa',`${dAa} 평균비중(%)`],['wb',`${dB} 평균비중(%)`],['dw','평균비중 증감(%p)'],['incL','수량 증가 ETF'],['decL','수량 감소·편출 ETF']];
  const L=(r,side)=>(side?r.incL:r.decL).map(([l,p,x])=>p!=null?`${l}(${p>0?'+':''}${p.toFixed(1)}%)`:`${l}${x!=null?`(${x>0?'+':''}${x.toFixed(2)}%p)`:''}`).join(', ');
  T.innerHTML='<thead><tr>'+H.map(([k,t])=>`<th data-k="${k}" class="${k==='n'||k.endsWith('L')?'l':''}">${t}${k===aSort?(aDir<0?' ▼':' ▲'):''}</th>`).join('')+'</tr></thead><tbody>'+
   R.slice(0,1500).map(r=>`<tr><td class="l" style="min-width:110px"><b>${r.n}</b></td><td>${r.ha}</td><td>${r.hb}</td><td class="${r.nw?'up':''}">${r.nw}</td><td class="${r.ex?'dn':''}">${r.ex}</td><td class="${r.inc?'up':''}">${r.inc}</td><td class="${r.dec?'dn':''}">${r.dec}</td><td>${r.keep}</td><td>${r.wa==null?'—':r.wa.toFixed(2)}</td><td>${r.wb==null?'—':r.wb.toFixed(2)}</td><td class="${cl(r.dw)}">${(r.dw>0?'+':'')+r.dw.toFixed(2)}</td><td class="l">${L(r,1)}</td><td class="l">${L(r,0)}</td></tr>`).join('')+'</tbody>';
  T.querySelectorAll('th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(k.endsWith('L'))return;if(aSort===k)aDir=-aDir;else{aSort=k;aDir=k==='n'?1:-1;}allTbl();});
  T.dataset.h=JSON.stringify(H.map(x=>x[1]));window.__eaAll=R.map(r=>[r.n,r.k,r.ha,r.hb,r.nw,r.ex,r.inc,r.dec,r.keep,r.wa==null?null:+r.wa.toFixed(2),r.wb==null?null:+r.wb.toFixed(2),+r.dw.toFixed(2),L(r,1),L(r,0)]);window.__eaHdr=['종목명','종목코드',...H.slice(1).map(x=>x[1])];window.__eaRange=`${dA}_${last}`;}
 async function xls(){const R=window.__eaAll||[];if(!R.length)return;
  if(!window.XLSX)await new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=ok;s.onerror=no;document.head.append(s);});
  const ws=XLSX.utils.aoa_to_sheet([window.__eaHdr,...R]);ws['!cols']=[16,9,10,10,8,8,10,10,8,12,12,12,60,60].map(w=>({wch:w}));ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:R.length,c:13}})};
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'전종목');const blob=new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`액티브ETF_전종목_${window.__eaRange}.xlsx`;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);}
 init();
})();
