(async()=>{
 const $=id=>document.getElementById(id);
 const paper=$('paper');
 try{
  const r=await fetch('./global_earnings.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json(),list=data.watchlist||[],byT=new Map(list.map(x=>[x.ticker,x]));
  const events=(data.events||[]).filter(e=>byT.has(e.ticker)&&e.source&&e.date);
  // 실적 시즌: 발표 월 기준 (1~3월=전년 Q4, 4~6월=Q1, 7~9월=Q2, 10~12월=Q3)
  const season=e=>{const [y,m]=e.date.split('-').map(Number);return m<=3?`${y-1} Q4`:`${y} Q${Math.floor((m-1)/3)}`;};
  const seasonMonths=s=>{const q=+s.slice(-1);return q===4?'1~3월 발표':`${q*3+1}~${q*3+3}월 발표`;};
  const seasons=[...new Set(events.map(season))].sort((a,b)=>b.localeCompare(a));
  for(const s of [...new Set(list.map(x=>x.sector))])$('sector').add(new Option(s,s));
  const st=Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  let cur={season:seasons.includes(st.season)?st.season:seasons[0],key:st.key||'',sector:''};
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const link=(url,text)=>{const a=el('a',null,text);if(!/^https:\/\//.test(url||''))return el('span',null,text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  // 숫자 강조: 증감(+/−)은 색, 금액·수치는 파랑
  const RX=/((?<=^|[\s(（:,·→~])[+＋][\d.,]+\s?(?:%p|%|bp|배)?|(?<=^|[\s(（:,·→])[−-][\d.,]+\s?(?:%p|%|bp)|[−-]?[$€¥][\d.,]+\s?(?:[BMK]n?|bn|m|조|억)?|[\d.,]+\s?(?:GW|bn|%p))/g;
  const rich=t=>{const f=document.createDocumentFragment();let last=0;String(t??'').replace(RX,(m,_g,i)=>{if(i>last)f.append(document.createTextNode(t.slice(last,i)));const c=/^[+＋]/.test(m)?'pos':/^[−-][\d]/.test(m)?'neg':'num';f.append(el('span',c,m));last=i+m.length;return m;});if(last<String(t??'').length)f.append(document.createTextNode(String(t).slice(last)));return f;};
  const P=(t,cls)=>{const p=el('p',cls);p.append(rich(t));return p;};
  const sec=(no,ko,en)=>{const h=el('h3','sec');h.append(el('span','no',no),document.createTextNode(` ${ko} `),el('span','lite',en?`(${en})`:''));return h;};
  const call=(head,body,cls='')=>{const d=el('div','call '+cls);if(head)d.append(el('b','h',head));for(const b of [].concat(body||[])){if(b instanceof Node)d.append(b);else d.append(P(b));}return d;};
  const table=(cols,rows)=>{const w=el('div','tw'),t=el('table'),th=el('thead'),tr=el('tr');for(const c of cols)tr.append(el('th',null,c));th.append(tr);const tb=el('tbody');for(const r of rows){const x=el('tr');r.forEach(v=>{const td=el('td',/^[−+\-$€¥\d]/.test(String(v))&&String(v).length<40?'n':null);td.append(rich(v));x.append(td);});tb.append(x);}t.append(th,tb);w.append(t);return w;};
  const kpis=arr=>{const g=el('div','kpis');for(const k of arr||[]){const c=el('div','kpi '+(k.tone||''));c.append(el('div','l',k.label),el('div','v',k.value));if(k.sub)c.append(el('div','s',k.sub));g.append(c);}return g;};
  const sq=items=>{const u=el('ul','sq');for(const it of items){const li=el('li');if(typeof it==='string')li.append(rich(it));else{li.append(el('b',null,it.label+': '),rich(it.body));}u.append(li);}return u;};
  const dirCls=d=>d==='개선'?'up':d==='악화'?'down':'flat';

  function header(e,co){const f=document.createDocumentFragment();f.append(el('div','kicker','Official IR Earnings Review'));const h=el('div','title',`${co.name} ${e.period} 실적 리뷰`);h.setAttribute('role','heading');h.setAttribute('aria-level','2');f.append(h);const m=el('div','meta');m.append(document.createTextNode(`발표 ${e.date} | 업종: ${e.report?.industry||co.sector} | 티커: ${e.ticker}`));m.append(el('span','verdict '+dirCls(e.direction),e.direction||'—'));f.append(m);return f;}
  function sources(e){const d=el('div','src');d.append(document.createTextNode('출처(회사 공식 IR): '),link(e.source,e.source_label||'이번 분기 자료'),document.createTextNode(' · '),link(e.prior_source,e.prior_source_label||'직전 분기 자료'));if(e.call_source){d.append(document.createTextNode(' · '),link(e.call_source,e.call_source_label||'컨콜 녹취록'));}d.append(el('br'),document.createTextNode(`검증 범위: ${e.call_coverage||e.evidence||'—'}. '분석'으로 표시한 문장은 해석이며 투자 권유가 아닙니다.`));return d;}
  function changesTable(e){if(!(e.changes||[]).length)return null;const f=document.createDocumentFragment();f.append(el('h4',null,'직전 발표 대비 변화'));f.append(table(['항목','방향','의미'],e.changes.map(c=>[c.title,c.direction||'—',c.meaning||'—'])));return f;}

  function renderRich(e,co){const R=e.report,f=document.createDocumentFragment();
   f.append(header(e,co));
   f.append(sec('01','회사 개요','Company Description'));for(const t of R.overview||[])f.append(P(t));if(R.positioning)f.append(call('핵심 포지셔닝',R.positioning));
   f.append(sec('02','실적 리뷰','Performance Review'));let n=1;
   f.append(el('h4',null,`${n++}. ${e.period} 종합 성과`));f.append(kpis(R.kpis));if(R.summary)f.append(call('핵심 성과 요약',R.summary,'blue'));
   for(const t of R.tables||[]){f.append(el('h4',null,`${n++}. ${t.title}`));f.append(table(t.columns,t.rows));if(t.note)f.append(P(t.note,'note'));}
   if(R.highlight)f.append(call('사업부문별 하이라이트',R.highlight));
   if((R.capex_kpis||[]).length){f.append(el('h4',null,`${n++}. 현금 흐름 및 자본 배분`));f.append(kpis(R.capex_kpis));if(R.capex_text)f.append(P(R.capex_text));}
   const ch=changesTable(e);if(ch)f.append(ch);
   f.append(sec('03','가이던스 전망','Forward Guidance'));
   if((R.guidance_kpis||[]).length)f.append(kpis(R.guidance_kpis));
   if(R.guidance_table){f.append(el('h4',null,'가이던스 변화'));f.append(table(R.guidance_table.columns,R.guidance_table.rows));}
   if(R.guidance_text)f.append(call('경영진 전망',R.guidance_text,'blue'));
   if((R.roadmap||[]).length){f.append(el('h4',null,'향후 일정 · 장기 로드맵'));f.append(call(null,sq(R.roadmap)));}
   f.append(sec('04','회사 경영진 발언','Management Commentary'));
   (R.management||[]).forEach((m,i)=>{f.append(el('h4',null,`${i+1}. ${m.role} ${m.name} 발언`));if(m.quote){f.append(el('blockquote',null,`"${m.quote}"`));f.append(el('div','who',`${m.name}, ${m.role}`));}for(const b of m.body||[])f.append(P(b));});
   f.append(sec('05','추가 논평','Commentary & Analysis'));
   (R.commentary||[]).forEach((c,i)=>{f.append(el('h4',null,`${i+1}. ${c.title}`));f.append(P(c.body));});
   f.append(sec('06','종합 평가','Conclusion'));const C=R.conclusion||{};
   if(C.message)f.append(call('핵심 메시지',C.message,'blue'));
   if((C.positives||[]).length){f.append(el('h4',null,`${C.positives.length}가지 긍정 요인`));f.append(sq(C.positives));}
   if(C.risks)f.append(call('핵심 리스크 요인',C.risks,'red'));
   for(const t of C.closing||[])f.append(P(t));
   if(e.watch)f.append(call('다음에 확인할 것',e.watch.replace(/^분석:\s*/,'')));
   f.append(sources(e));return f;}

  function renderBasic(e,co){const f=document.createDocumentFragment();
   f.append(header(e,co));
   f.append(sec('01','회사 개요','Company Description'));f.append(P(`${co.name}(${e.ticker}) · 업종: ${co.sector}.`));f.append(call('핵심 판단',e.headline||'—'));
   f.append(sec('02','실적 리뷰','Performance Review'));
   f.append(el('h4',null,'1. 공식 발표 핵심 수치'));f.append(P(e.facts||'—'));
   (e.changes||[]).forEach((c,i)=>{const h=el('h4',null,`${i+2}. ${c.title} `);h.append(el('span','verdict '+dirCls(c.direction),c.direction||'—'));f.append(h);
    if(Array.isArray(c.rows)&&c.rows.length){const hasD=c.rows.some(r=>r.delta);f.append(table(['항목','직전 발표·기준','이번 발표·전망'].concat(hasD?['변화']:[]),c.rows.map(r=>[r.item,r.before||'—',r.now||'—'].concat(hasD?[r.delta||'']:[]))));if(c.note)f.append(P(c.note,'note'));}
    else f.append(table(['구분','내용'],[['직전 발표·기준',c.before||'—'],['이번 발표·전망',c.now||'—']]));
    if(c.meaning)f.append(P('의미 · '+c.meaning,'note'));});
   f.append(sec('03','가이던스 전망','Forward Guidance'));f.append(P(e.guidance||'—'));if(e.estimate_signal)f.append(call('추정치 방향',e.estimate_signal,'blue'));
   f.append(sec('04','회사 경영진 발언','Management Commentary'));f.append(P(e.tone||'—'));
   for(const g of e.call_readthrough?.groups||[]){f.append(el('h4',null,g.title));for(const it of g.items||[]){const p=el('p');p.append(el('b',null,it.title+' · '),rich(it.body));f.append(p);}}
   if(e.call_readthrough?.scope)f.append(P(e.call_readthrough.scope,'note'));
   f.append(sec('05','추가 논평','Commentary & Analysis'));
   (e.call_topics||[]).forEach((t,i)=>{f.append(el('h4',null,`${i+1}. ${t.topic}`));if((t.points||[]).length)f.append(sq(t.points));if(t.implication)f.append(P('시사점 · '+t.implication,'note'));});
   if(!(e.call_topics||[]).length)f.append(P('공식 자료 기반 주제별 요약 없음.','note'));
   f.append(sec('06','종합 평가','Conclusion'));f.append(call('핵심 메시지',(e.interpretation||'—').replace(/^분석:\s*/,''),'blue'));if(e.watch)f.append(call('다음에 확인할 것',e.watch.replace(/^분석:\s*/,''),'red'));
   f.append(sources(e));return f;}

  const keyOf=e=>e.ticker+'|'+e.period;
  function draw(){
   const qt=$('qtabs');qt.replaceChildren();
   for(const s of seasons){const b=el('button',s===cur.season?'on':'');b.type='button';b.append(document.createTextNode(`${s} 시즌`),el('small',null,`${seasonMonths(s)} · ${events.filter(e=>season(e)===s).length}건`));b.onclick=()=>{cur.season=s;cur.key='';draw();};qt.append(b);}
   let pool=events.filter(e=>season(e)===cur.season&&(!cur.sector||byT.get(e.ticker).sector===cur.sector));
   pool.sort((a,b)=>(!!b.report-!!a.report)||b.date.localeCompare(a.date)||a.ticker.localeCompare(b.ticker));
   const ct=$('cotabs');ct.replaceChildren();
   if(!pool.some(e=>keyOf(e)===cur.key))cur.key=pool[0]?keyOf(pool[0]):'';
   for(const e of pool){const b=el('button',keyOf(e)===cur.key?'on':'');b.type='button';b.title=`${e.period} · ${e.date}`;b.append(document.createTextNode(`${byT.get(e.ticker).name} · ${e.period}`));if(e.report)b.append(el('span','rich'));b.onclick=()=>{cur.key=keyOf(e);draw();window.scrollTo({top:$('cotabs').offsetTop-10,behavior:'smooth'});};ct.append(b);}
   paper.replaceChildren();const e=pool.find(x=>keyOf(x)===cur.key);
   if(!e){paper.append(el('p','lite','이 조건에 해당하는 실적 기록이 없습니다.'));}
   else{const co=byT.get(e.ticker);paper.append(e.report?renderRich(e,co):renderBasic(e,co));document.title=`${co.name} ${e.period} 실적 리뷰 · 해외 분기 실적 리포트`;}
   history.replaceState(null,'','#'+new URLSearchParams({season:cur.season,key:cur.key}).toString());
  }
  $('sector').onchange=ev=>{cur.sector=ev.target.value;cur.key='';draw();};
  draw();
 }catch(err){paper.replaceChildren();const p=document.createElement('p');p.textContent='자료 표시 오류: '+err.message;paper.append(p);console.error(err);}
})();
