// 해외 실적·컨콜 변곡점 페이지의 '분기 실적 리포트' 탭.
// global_earnings.js 가 기업·분기를 고르면 'ge:show' 이벤트를 보내고, 여기서 리포트를 그린다.
(async()=>{
 const $=id=>document.getElementById(id);
 const paper=$('reportPaper'),tabsBox=$('reportTabs');if(!paper)return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const NS='http://www.w3.org/2000/svg';const S=(tag,attrs,text)=>{const n=document.createElementNS(NS,tag);for(const k in attrs||{})if(attrs[k]!=null)n.setAttribute(k,attrs[k]);if(text!=null)n.textContent=text;return n;};
 let data;
 try{const r=await fetch('./global_earnings.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);data=await r.json();}
 catch(err){paper.replaceChildren(el('p','lite','자료 표시 오류: '+err.message));return;}
 const list=data.watchlist||[],byT=new Map(list.map(x=>[x.ticker,x]));
 const events=(data.events||[]).filter(e=>byT.has(e.ticker)&&e.source&&e.date);
 const link=(url,text)=>{if(!/^https:\/\//.test(url||''))return el('span',null,text);const a=el('a',null,text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
 // 숫자 강조: 증감(+/−)은 색, 금액·수치는 파랑
 const RX=/((?<=^|[\s(（:,·→~])[+＋][\d.,]+\s?(?:%p|%|bp|배)?|(?<=^|[\s(（:,·→])[−-][\d.,]+\s?(?:%p|%|bp)|[−-]?[$€¥][\d.,]+\s?(?:[BMK]n?|bn|m|조|억)?|[\d.,]+\s?(?:GW|bn|%p))/g;
 const rich=t=>{t=String(t??'');const f=document.createDocumentFragment();let last=0;t.replace(RX,(m,_g,i)=>{if(i>last)f.append(document.createTextNode(t.slice(last,i)));const c=/^[+＋]/.test(m)?'pos':/^[−-][\d]/.test(m)?'neg':'num';f.append(el('span',c,m));last=i+m.length;return m;});if(last<t.length)f.append(document.createTextNode(t.slice(last)));return f;};
 const P=(t,cls)=>{const p=el('p',cls);p.append(rich(t));return p;};
 const sec=(no,ko,en)=>{const h=el('h3','sec');h.append(el('span','no',no),document.createTextNode(` ${ko} `),el('span','lite',en?`(${en})`:''));return h;};
 const call=(head,body,cls='')=>{const d=el('div','call '+cls);if(head)d.append(el('b','h',head));for(const b of [].concat(body||[])){if(b instanceof Node)d.append(b);else d.append(P(b));}return d;};
 const table=(cols,rows)=>{const w=el('div','tw'),t=el('table'),th=el('thead'),tr=el('tr');for(const c of cols)tr.append(el('th',null,c));th.append(tr);const tb=el('tbody');for(const r of rows){const x=el('tr');r.forEach(v=>{const td=el('td',/^[−+\-$€¥\d]/.test(String(v))&&String(v).length<40?'n':null);td.append(rich(v));x.append(td);});tb.append(x);}t.append(th,tb);w.append(t);return w;};
 const kpis=arr=>{const g=el('div','kpis');for(const k of arr||[]){const c=el('div','kpi '+(k.tone||''));c.append(el('div','l',k.label),el('div','v',k.value));if(k.sub)c.append(el('div','s',k.sub));g.append(c);}return g;};
 const sq=items=>{const u=el('ul','sq');for(const it of items){const li=el('li');if(typeof it==='string')li.append(rich(it));else li.append(el('b',null,it.label+': '),rich(it.body));u.append(li);}return u;};
 const dirCls=d=>d==='개선'?'up':d==='악화'?'down':'flat';
 const fmtPct=v=>(v>=0?'+':'−')+Math.abs(v).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';

 // 막대 차트: 공식 수치는 실선, 보도·미검증 전망은 빗금. 증가율은 base(기준 막대) 또는 직전 막대 대비.
 function barChart(c){
  const fig=el('figure','gchart');fig.append(el('figcaption','gc-t',c.title));if(c.subtitle)fig.append(el('div','gc-s',c.subtitle));
  const bars=c.bars||[],n=bars.length;if(!n)return fig;
  const W=760,H=360,L=56,R=16,T=74,B=46,ih=H-T-B,iw=W-L-R;
  const mx=Math.max(...bars.map(b=>b.value))*1.08;const step=niceStep(mx/4);const top=Math.ceil(mx/step)*step;
  const y=v=>T+ih-(v/top)*ih,slot=iw/n,bw=Math.min(150,slot*.62);
  const svg=S('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':c.title,class:'gc-svg'});
  const defs=S('defs');const pat=S('pattern',{id:'gcHatch'+(++uid),width:7,height:7,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'});pat.append(S('rect',{width:7,height:7,fill:'#e8eef8'}),S('line',{x1:0,y1:0,x2:0,y2:7,stroke:'#9db4d6','stroke-width':3}));defs.append(pat);svg.append(defs);
  for(let v=0;v<=top+1e-9;v+=step){svg.append(S('line',{x1:L,x2:W-R,y1:y(v),y2:y(v),stroke:'#e6e9ef','stroke-dasharray':v?'3 4':null}));svg.append(S('text',{x:L-8,y:y(v)+4,'text-anchor':'end',class:'gc-ax'},fmtAxis(v,c.unit)));}
  const bi=Number.isInteger(c.base)?c.base:null;
  bars.forEach((b,i)=>{const cx=L+slot*i+slot/2,x=cx-bw/2,yy=y(b.value),h=Math.max(2,T+ih-yy);
   const rep=b.kind==='reported';const r=S('rect',{x,y:yy,width:bw,height:h,rx:6,fill:rep?`url(#gcHatch${uid})`:(b.accent===false?'#b9c3d3':'#4f8fe8'),stroke:rep?'#7d9cc9':'none','stroke-dasharray':rep?'5 3':null});r.append(S('title',{},`${b.label}: ${b.display||fmtVal(b.value,c.unit)}${rep?' (보도 기준·미검증)':''}`));svg.append(r);
   svg.append(S('text',{x:cx,y:yy-10,'text-anchor':'middle',class:'gc-v'},b.display||fmtVal(b.value,c.unit)));
   let g=null;if(c.growth==='prev'&&i>0)g=(b.value/bars[i-1].value-1)*100;else if(bi!=null&&i>bi)g=(b.value/bars[bi].value-1)*100;
   if(b.growth===false)g=null;if(g!=null&&isFinite(g))svg.append(S('text',{x:cx,y:yy-34,'text-anchor':'middle',class:'gc-g '+(g>=0?'up':'down')},fmtPct(g)));
   else if(bi===i)svg.append(S('text',{x:cx,y:yy-34,'text-anchor':'middle',class:'gc-base'},'기준'));
   const lab=S('text',{x:cx,y:H-B+22,'text-anchor':'middle',class:'gc-x'},b.label);svg.append(lab);
   if(rep)svg.append(S('text',{x:cx,y:H-B+38,'text-anchor':'middle',class:'gc-rep'},'보도 기준·미검증'));});
  svg.append(S('line',{x1:L,x2:W-R,y1:T+ih,y2:T+ih,stroke:'#b8c0cc'}));
  const wrap=el('div','gc-wrap');wrap.append(svg);fig.append(wrap);
  for(const f of c.footnotes||[])fig.append(el('div','gc-f',f));
  if((c.sources||[]).length){const d=el('div','gc-f');d.append(document.createTextNode('출처: '));c.sources.forEach((s,i)=>{if(i)d.append(document.createTextNode(' · '));d.append(link(s.url,s.label));});fig.append(d);}
  return fig;}
 let uid=0;
 function niceStep(x){const p=Math.pow(10,Math.floor(Math.log10(x||1))),m=x/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p;}
 function fmtVal(v,u){const s=v.toLocaleString('en-US',{maximumFractionDigits:2});return u==='$B'?'$'+s+'B':u==='$m'?'$'+s+'m':u==='%'?s+'%':u?s+' '+u:s;}
 function fmtAxis(v,u){const s=v.toLocaleString('en-US',{maximumFractionDigits:2});return u==='$B'?'$'+s+'B':u==='$m'?'$'+s+'m':u==='%'?s+'%':u?s+' '+u:s;}
 const charts=(arr,key)=>{const f=document.createDocumentFragment();for(const c of (arr||[]).filter(c=>(c.section||'review')===key))f.append(barChart(c));return f;};

 function header(e,co){const f=document.createDocumentFragment();f.append(el('div','kicker','Official IR Earnings Review'));const h=el('div','title',`${co.name} ${e.period} 실적 리뷰`);h.setAttribute('role','heading');h.setAttribute('aria-level','3');f.append(h);const m=el('div','meta');m.append(document.createTextNode(`발표 ${e.date} | 업종: ${e.report?.industry||co.sector} | 티커: ${e.ticker}`));m.append(el('span','verdict '+dirCls(e.direction),e.direction||'—'));f.append(m);return f;}
 function sources(e){const d=el('div','src');d.append(document.createTextNode('출처(회사 공식 IR): '),link(e.source,e.source_label||'이번 분기 자료'),document.createTextNode(' · '),link(e.prior_source,e.prior_source_label||'직전 분기 자료'));if(e.call_source)d.append(document.createTextNode(' · '),link(e.call_source,e.call_source_label||'컨콜 녹취록'));d.append(el('br'),document.createTextNode(`검증 범위: ${e.call_coverage||e.evidence||'—'}. 빗금 막대·'보도 기준'은 공식 자료로 확인되지 않은 수치이며, '분석'으로 표시한 문장은 해석으로 투자 권유가 아닙니다.`));return d;}
 function changesTable(e){if(!(e.changes||[]).length)return null;const f=document.createDocumentFragment();f.append(el('h4',null,'직전 발표 대비 변화'));f.append(table(['항목','방향','의미'],e.changes.map(c=>[c.title,c.direction||'—',c.meaning||'—'])));return f;}

 // 실적·컨콜 핵심 요약: 사업별 카드, '직전 → 이번' 변화와 상향·하향 표시
 const TAGC={'상향':'up','개선':'up','신규':'new','유지':'flat','혼재':'flat','하향':'down','악화':'down'};
 function digest(e){
  const R=e.report||{};let cards=R.digest;
  if(!(cards||[]).length)cards=(e.changes||[]).map(c=>({topic:c.title,tag:c.direction,items:(c.rows||[]).length?c.rows.slice(0,5).map(r=>({label:r.item,before:r.before,now:r.now,note:r.delta})):[c.before?{label:'직전',plain:c.before}:null,{label:'이번',now:c.now}].filter(Boolean),note:c.meaning}));
  if(!cards.length)return null;
  const f=document.createDocumentFragment();f.append(el('div','dg-h','실적·컨콜 핵심 요약'));
  if(R.digest_scope)f.append(el('div','dg-scope',R.digest_scope));
  const g=el('div','dg');
  for(const c of cards){const card=el('div','dg-card');const h=el('div','dg-top');h.append(el('b',null,c.topic));if(c.tag)h.append(el('span','dg-tag '+(TAGC[c.tag]||'flat'),c.tag));card.append(h);
   const ul=el('ul');for(const it of c.items||[]){const li=el('li');if(it.label)li.append(el('span','dg-l',it.label+' '));if(it.plain!=null){li.append(rich(it.plain));ul.append(li);continue;}if(it.before&&it.before!=='—'){li.append(rich(it.before),el('span','dg-arrow',' → '));}const nw=el('b','dg-now');nw.append(rich(it.now||'—'));li.append(nw);if(it.note){const n=el('span','dg-note');n.append(document.createTextNode(' · '),rich(it.note));li.append(n);}ul.append(li);}
   card.append(ul);if(c.note)card.append(P(c.note,'dg-mean'));g.append(card);}
  f.append(g);if(R.digest_source)f.append(P(R.digest_source,'note'));return f;}
 function renderRich(e,co){const R=e.report,f=document.createDocumentFragment();
  f.append(header(e,co));{const dg=digest(e);if(dg)f.append(dg);}
  f.append(sec('01','회사 개요','Company Description'));for(const t of R.overview||[])f.append(P(t));if(R.positioning)f.append(call('핵심 포지셔닝',R.positioning));
  f.append(sec('02','실적 리뷰','Performance Review'));let n=1;
  f.append(el('h4',null,`${n++}. ${e.period} 종합 성과`));f.append(kpis(R.kpis));if(R.summary)f.append(call('핵심 성과 요약',R.summary,'blue'));
  f.append(charts(R.charts,'review'));
  for(const t of R.tables||[]){f.append(el('h4',null,`${n++}. ${t.title}`));f.append(table(t.columns,t.rows));if(t.note)f.append(P(t.note,'note'));}
  if(R.highlight)f.append(call('사업부문별 하이라이트',R.highlight));
  if((R.capex_kpis||[]).length){f.append(el('h4',null,`${n++}. 현금 흐름 및 자본 배분`));f.append(kpis(R.capex_kpis));if(R.capex_text)f.append(P(R.capex_text));}
  f.append(charts(R.charts,'capital'));
  const ch=changesTable(e);if(ch)f.append(ch);
  f.append(sec('03','가이던스 전망','Forward Guidance'));
  if((R.guidance_kpis||[]).length)f.append(kpis(R.guidance_kpis));
  if(R.guidance_table){f.append(el('h4',null,'가이던스 변화'));f.append(table(R.guidance_table.columns,R.guidance_table.rows));}
  if(R.guidance_text)f.append(call('경영진 전망',R.guidance_text,'blue'));
  f.append(charts(R.charts,'guidance'));
  if((R.reported_outlook||[]).length){f.append(el('h4',null,'실적 발표 관련 보도된 전망 (공식 녹취록 미확인)'));f.append(table(['항목','보도된 수치','확인 상태'],R.reported_outlook.map(x=>[x.item,x.value,x.status||'보도 기준·미검증'])));if(R.reported_note)f.append(P(R.reported_note,'note'));}
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
  f.append(header(e,co));{const dg=digest(e);if(dg)f.append(dg);}
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

 function render(ticker,period){
  const co=byT.get(ticker);tabsBox.replaceChildren();paper.replaceChildren();
  if(!co){paper.append(el('p','lite','기업을 선택하세요.'));return;}
  const mine=events.filter(e=>e.ticker===ticker).sort((a,b)=>b.date.localeCompare(a.date));
  if(!mine.length){paper.append(el('p','lite',`${co.name}: 공식 자료로 검증한 분기 실적 기록이 아직 없습니다.`));return;}
  const e=mine.find(x=>x.period===period)||mine[0];
  tabsBox.append(el('span','lbl','발표 분기'));
  for(const x of mine){const b=el('button',x===e?'on':'');b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',x===e?'true':'false');b.append(document.createTextNode(x.period),el('small',null,x.date.slice(5).replace('-','/')));
   b.onclick=()=>{const pp=$('periodPick');if(pp&&[...pp.options].some(o=>o.value===x.period)){pp.value=x.period;pp.dispatchEvent(new Event('change'));}else render(ticker,x.period);};tabsBox.append(b);}
  paper.append(e.report?renderRich(e,co):renderBasic(e,co));}
 window.addEventListener('ge:show',ev=>render(ev.detail.ticker,ev.detail.period));
 const cp=$('companyPick'),pp=$('periodPick');if(cp&&cp.value)render(cp.value,pp?.value);
})();
