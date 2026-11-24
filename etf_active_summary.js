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
  draw();}
 function draw(){
  const last=ALL.map(j=>j.dates.at(-1)).sort().at(-1);
  const agg={},nw=[],out=[],per=[];
  for(const J of ALL){const B=J.dates.length-1,A=Math.max(0,B-N);if(J.dates[B]!==last)continue;
   const ch=[];
   for(const [k,a] of Object.entries(J.w)){const n=J.names[k]||k;if(!isStock(k,n))continue;const wa=a[A]??null,wb=a[B]??null;if(wa==null&&wb==null)continue;
    const d=(wb||0)-(wa||0);if(Math.abs(d)<0.005&&!(wa==null||wb==null))continue;ch.push({k,n,d,wa,wb});
    const g=agg[k]=agg[k]||{n,up:[],dn:[],sum:0};g.sum+=d;if(d>0.05)g.up.push([J.label,d]);else if(d<-0.05)g.dn.push([J.label,d]);
    if(wa==null&&wb!=null)nw.push([n,J.label,wb]);if(wa!=null&&wb==null)out.push([n,J.label,wa]);}
   ch.sort((x,y)=>y.d-x.d);per.push({l:J.label,from:J.dates[A],up:ch.slice(0,3).filter(x=>x.d>0),dn:ch.slice(-3).reverse().filter(x=>x.d<0)});}
  const G=Object.values(agg);
  const cu=G.filter(g=>g.up.length>=2).sort((a,b)=>b.up.length-a.up.length||b.sum-a.sum).slice(0,10);
  const cd=G.filter(g=>g.dn.length>=2).sort((a,b)=>b.dn.length-a.dn.length||a.sum-b.sum).slice(0,10);
  const tip=a=>a.map(([l,d])=>`${l} ${sg(d)}`).join('\n');
  const li=(g,side)=>{const a=side==='up'?g.up:g.dn;return `<li title="${tip(a)}"><b>${g.n}</b> <span class="muted">${a.length}개 ETF</span> <span class="${cl(g.sum)}">${sg(a.reduce((s,x)=>s+x[1],0))}</span></li>`;};
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
 init();
})();
