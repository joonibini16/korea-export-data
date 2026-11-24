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
  draw();search();}
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
 init();
})();
