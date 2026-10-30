// 요약 탭: ① 발표 숫자(실적·시장 예상·컨센/전년/전분기 대비) 표는 #scoreBody, ③ 실적 분석은 #analysisBody 에 그린다.
// 가이던스 변화(이전→이번)는 ② 가이던스·핵심 변화(events[].changes)에서 보여주므로 숫자 표에서는 가이던스 행을 뺀다.
// global_earnings.json 의 events[].scorecard · events[].analysis 을 그린다. 컨센서스·주가는 회사 자료가 아니므로 외부 출처를 함께 표시.
(async()=>{
 const $=id=>document.getElementById(id),box=$('scoreBody');if(!box)return;
 const el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n;};
 const link=(u,t)=>{if(!/^https:\/\//.test(u||''))return el('span',null,t);const a=el('a',null,t);a.href=u;a.target='_blank';a.rel='noopener noreferrer';return a;};
 let data;try{const r=await fetch('./global_earnings.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);data=await r.json();}catch(e){$('scoreMeta').textContent='자료를 읽지 못했습니다: '+e.message;return;}
 const byT=new Map((data.watchlist||[]).map(x=>[x.ticker,x])),events=data.events||[];
 const tone=v=>/^[+＋]/.test(v)?'up':/^[−-]\d/.test(v)?'down':'';
 // 전년·전분기 대비 칸: "+379% (FQ4'25 $11,315m)" → 비교 분기(FQ4'25)는 열 제목 아래로 올리고, 칸에는 숫자만 남긴다.
 const PER=/^((?:FY\d{2,4}\s?)?(?:F?Q[1-4]|[1-4]Q|H[12]|\d{1,2}월|9개월|FY\d{2,4}|20\d{2})(?:['’]\d{2}|\s?FY\d{2,4})?):?\s+(?=\S)/;
 const splitSub=v=>{const m=String(v).match(/^(.*?)\s*\((.*)\)\s*$/);if(!m||!m[1])return null;const p=m[2].match(PER);return {main:m[1],per:p?p[1]:null,rest:p?m[2].slice(p[0].length):m[2]};};
 const cell=(v,cls,split,colPer)=>{const td=el('td',cls);const x=split&&splitSub(v);if(x){const sub=x.per&&x.per!==colPer?x.per+' '+x.rest:x.rest;td.append(el('div',null,x.main),el('div','sub2',sub));}else td.textContent=v;return td;};
 const table=(cols,rows,colored)=>{const w=el('div','table'),t=el('table','score-table'),h=el('tr');
  // 열마다 가장 많이 쓰인 비교 분기를 제목 아래에 표시
  const colPer=cols.map((c,i)=>{if(!colored||i<3||!/대비/.test(c))return null;const n=new Map();for(const r of rows){const x=splitSub(r[i]??'');if(x&&x.per)n.set(x.per,(n.get(x.per)||0)+1);}let best=null,bc=0;for(const [k,c2] of n)if(c2>bc){best=k;bc=c2;}return best;});
  cols.forEach((c,i)=>{const th=el('th',null,c);if(colPer[i])th.append(el('div','th-per',colPer[i]));h.append(th);});
  const th=el('thead');th.append(h);const tb=el('tbody');for(const r of rows){const tr=el('tr');r.forEach((v,i)=>{tr.append(cell(v,i===0?'lbl':(colored&&i>=3?tone(String(v)):''),colored&&i>=3,colPer[i]));});tb.append(tr);}t.append(th,tb);w.append(t);return w;};
 // ── 가이던스 숫자 읽기: "$61.5bn ±$1.5bn", "$1,250~1,350m (중간 $1,300m)", "€1,100m ±5%", "74.0% ±0.5%p", "약 $34.8bn" → {lo,hi,mid,pct}
 const U={tn:1e6,bn:1e3,b:1e3,m:1,'':1};
 const N=(x,u)=>parseFloat(String(x).replace(/,/g,''))*(U[(u||'').toLowerCase()]??1);
 const NUM='([$€¥]?)\\s?(\\d[\\d,]*\\.?\\d*)\\s?(tn|bn|B|m|M|%)?';
 function parseG(raw){if(!raw)return null;let s=String(raw).replace(/US\$/g,'$').replace(/\s+/g,' ');
  const mid=s.match(/중간\s*([$€¥]?)\s?(\d[\d,]*\.?\d*)\s?(tn|bn|B|m|M|%)?/);
  let m=s.match(new RegExp(NUM+'\\s?[~–]\\s?'+NUM));
  if(m){const u=m[3]||m[6]||'',pct=(m[3]||m[6])==='%';const lo=N(m[2],m[3]||m[6]),hi=N(m[5],m[6]||m[3]);return {lo,hi,mid:mid?N(mid[2],mid[3]||u):(lo+hi)/2,pct};}
  m=s.match(new RegExp(NUM+'\\s?±\\s?([$€¥]?)\\s?(\\d[\\d,]*\\.?\\d*)\\s?(tn|bn|B|m|M|%p|%)?'));
  if(m){const pct=m[3]==='%',c=N(m[2],m[3]);let d;if(m[6]==='%'&&!pct)d=c*parseFloat(m[5])/100;else if(m[6]==='%p'||(pct&&m[6]==='%'))d=parseFloat(m[5]);else d=N(m[5],m[6]||m[3]);return {lo:c-d,hi:c+d,mid:c,pct};}
  if(/대비|보합|유사|미제시|없음|digit|성장/.test(s))return null;
  m=s.match(new RegExp(NUM));if(m&&m[2]){const v=N(m[2],m[3]);return {lo:v,hi:v,mid:v,pct:m[3]==='%',approx:true};}
  return null;}
 const actualNum=(cell,pct)=>{const s=String(cell||'').replace(/US\$/g,'$');if(pct){const m=s.match(/(-?\d[\d,]*\.?\d*)\s?%/);return m?parseFloat(m[1].replace(/,/g,'')):null;}const m=s.match(new RegExp(NUM));return m&&m[2]&&m[3]!=='%'?N(m[2],m[3]):null;};
 const ANNUAL=/연간|상반기|누적|9개월|20\d\d (조정|가이던스)|^20\d\d|FY\d\d 연간/;
 function metricOf(label){const m=String(label).split('가이던스')[1];return m?m.replace(/\(.*?\)/g,'').trim():'';}
 function findActual(rows,metric){if(!metric)return null;const ok=r=>!/가이던스|vs/.test(r[0]);
  if(/EPS/.test(metric)){const g=/비GAAP|조정/.test(metric);return rows.find(r=>ok(r)&&/EPS/.test(r[0])&&(!g||/비GAAP|조정/.test(r[0])))||rows.find(r=>ok(r)&&/EPS/.test(r[0]));}
  if(/총이익률/.test(metric))return rows.find(r=>ok(r)&&/총이익률/.test(r[0]));
  if(/영업이익률/.test(metric))return rows.find(r=>ok(r)&&/영업이익/.test(r[0]));
  if(metric==='매출')return rows.find(r=>ok(r)&&/^매출(\s|$|\()/.test(r[0]));
  return rows.find(r=>ok(r)&&r[0].includes(metric));}
 function judge(g,a){if(g==null||a==null)return null;const tol=g.pct?0.05:Math.abs(g.mid)*0.002;
  const st=a>g.hi+tol?['상단 초과','beat']:a>=g.mid-tol?['범위 내 (중간 이상)','in']:a>=g.lo-tol?['범위 내 (중간 미만)','low']:['하단 미달','miss'];
  const dev=g.pct?(a-g.mid):(a/g.mid-1)*100;return {st:st[0],k:st[1],dev,unit:g.pct?'%p':'%'};}
 // 이번 발표 실적이 직전 발표 가이던스를 달성했는지
 function achievements(ev,prev){const out=[];const rows=ev.scorecard?.rows||[];
  for(const r of rows){if(/vs\s*(회사\s*)?가이던스|가이던스 대비/.test(r[0])){const met=r[0].split(/\s*vs|\s*가이던스 대비|직전 분기 제시/)[0].trim()||'매출';const g=parseG(String(r[2]).replace(/\(?회사 가이던스\)?|가이던스/g,''));const a=actualNum(r[1],g?.pct);const j=judge(g,a);if(j)out.push({met:met.replace(/직전 분기 제시.*/,'매출'),gtxt:String(r[2]),atxt:String(r[1]),...j});}}
  if(prev?.scorecard)for(const r of prev.scorecard.rows){if(!/가이던스/.test(r[0])||ANNUAL.test(r[0])||/vs|대비/.test(r[0]))continue;const met=metricOf(r[0]);const g=parseG(r[1]);if(!g)continue;
   if(out.some(x=>x.met===met))continue;const ar=findActual(rows,met);if(!ar)continue;const a=actualNum(ar[1],g.pct);const j=judge(g,a);if(j)out.push({met,gtxt:String(r[1]),atxt:String(ar[1]),...j});}
  return out;}
 const pctOf=s=>{const m=String(s||'').match(/^([+＋−-]?\d[\d,]*\.?\d*)%/);return m?parseFloat(m[1].replace('−','-').replace('＋','+').replace(/,/g,'')):null;};
 const sg=(v,d=1,u='%')=>v==null||!isFinite(v)?'—':(v>0?'+':'')+v.toFixed(d)+u;
 const srcs=(arr,lead)=>{const p=el('p','muted');p.append(document.createTextNode(lead));(arr||[]).forEach((s,i)=>{if(i)p.append(document.createTextNode(' · '));p.append(link(s.url,s.label));});return p;};
 function guideBlocks(e,mine,S){
  const asc=[...mine].sort((a,b)=>a.date.localeCompare(b.date));const idx=asc.indexOf(e);
  // ① 직전 가이던스 달성 여부 (이번 발표)
  const cur=achievements(e,asc[idx-1]);
  const BADGE={beat:'#22c55e',in:'#86efac',low:'#fbbf24',miss:'#f87171'};
  const mk=(list,withPeriod)=>{const w=el('div','table'),t=el('table','score-table'),th=el('thead'),h=el('tr');['기간','항목','회사 가이던스(직전 발표)','실적','결과','중간값 대비'].filter((x,i)=>withPeriod||i).forEach(c=>h.append(el('th',null,c)));th.append(h);const tb=el('tbody');
   for(const x of list){const tr=el('tr');if(withPeriod)tr.append(el('td','lbl',x.period));tr.append(el('td','lbl',x.met),el('td',null,x.gtxt),el('td',null,x.atxt));const b=el('td');const sp=el('span','gbadge',x.st);sp.style.background=BADGE[x.k];b.append(sp);tr.append(b,el('td',x.dev>=0?'up':'down',sg(x.dev,1,x.unit)));tb.append(tr);}t.append(th,tb);w.append(t);return w;};
  box.append(el('h4',null,'직전 가이던스 달성 여부'));
  if(cur.length)box.append(mk(cur,false));else box.append(el('p','muted','직전 분기 가이던스(같은 항목·수치)가 정리돼 있지 않아 이번 발표의 달성 여부를 계산하지 못했습니다.'));
  // 달성 이력(신뢰도): 정리된 모든 발표
  const hist=[];asc.forEach((x,i)=>achievements(x,asc[i-1]).forEach(a=>hist.push({...a,period:x.period})));
  if(hist.length){const n=hist.length,beat=hist.filter(x=>x.k==='beat').length,okc=hist.filter(x=>x.k==='beat'||x.k==='in').length,miss=hist.filter(x=>x.k==='miss').length,rv=hist.filter(x=>x.unit==='%'),avg=rv.length?rv.reduce((a,b)=>a+b.dev,0)/rv.length:null;
   const grade=miss===0&&okc===n?(beat/n>=0.5?'높음 (상단 초과가 잦은 보수적 가이던스)':'높음 (제시 범위 안 달성)'):miss/n<=0.25?'보통':'낮음 (미달 잦음)';
   const p=el('p','signal');p.textContent=`가이던스 신뢰도: ${grade} · 정리된 ${n}개 항목 중 상단 초과 ${beat} · 범위 내 ${okc-beat} · 미달 ${miss}${avg!=null?` · 금액 항목 중간값 대비 평균 ${sg(avg)}`:''}`;box.append(p);
   if(hist.length>cur.length){const d=el('details');d.append(el('summary',null,'달성 이력 전체 보기'),mk([...hist].reverse(),true));box.append(d);}}
  // ② 다음 가이던스 평가 (컨센·QoQ·YoY)
  const rows=S.rows||[],tr=S.trend,out=[];
  for(const r of rows){if(!/가이던스/.test(r[0])||/vs|대비/.test(r[0])||ANNUAL.test(r[0]))continue;const met=metricOf(r[0]);const g=parseG(r[1]);if(!g||!met)continue;
   const cons=g.pct?null:actualNum(r[2],false),ar=findActual(rows,met),a=ar?actualNum(ar[1],g.pct):null;
   const vsC=cons?(g.mid/cons-1)*100:null,qoq=a!=null?(g.pct?g.mid-a:(g.mid/a-1)*100):null;
   let yoy=null,curY=ar&&!g.pct?pctOf(ar[4]):null;
   if(tr&&!g.pct){const cols=tr.columns,last=cols.length-1;const trow=tr.rows.find(x=>x[0]===met||(met==='매출'&&x[0]==='매출'));if(trow&&/가이던스/.test(cols[last])&&last>=5){const ya=actualNum(trow[last-4],false),gv=g.mid;if(ya)yoy=(gv/ya-1)*100;}}
   let sc=0;const why=[];if(vsC!=null){sc+=vsC>2?1:vsC<-2?-1:0;why.push(`컨센 ${sg(vsC)}`);}if(qoq!=null){const db=g.pct?0.5:1;sc+=qoq>db?1:qoq<-db?-1:0;why.push(`QoQ ${sg(qoq,1,g.pct?'%p':'%')}`);}
   if(yoy!=null){why.push(`YoY ${sg(yoy)}`);if(curY!=null){sc+=yoy>curY+1?1:yoy<curY-1?-1:0;why.push(yoy>curY+1?'성장 가속':yoy<curY-1?'성장 둔화':'성장률 유지');}}
   const v=sc>=2?['강함','#22c55e']:sc===1?['양호','#86efac']:sc===0?['중립','#fbbf24']:['약함','#f87171'];
   out.push({met,txt:String(r[1]),cons:r[2]||'—',vsC,qoq,yoy,curY,v,why,pct:g.pct});}
  if(out.length){box.append(el('h4',null,'다음 가이던스 평가 (컨센·전분기·전년 대비)'));const w=el('div','table'),t=el('table','score-table'),th=el('thead'),h=el('tr');['항목','가이던스','컨센 대비','전분기 대비(QoQ)','전년 대비(YoY)','이번 분기 YoY','평가'].forEach(c=>h.append(el('th',null,c)));th.append(h);const tb=el('tbody');
   for(const x of out){const trw=el('tr');trw.append(el('td','lbl',x.met),el('td',null,x.txt),el('td',x.vsC>0?'up':x.vsC<0?'down':'',x.vsC==null?'—':sg(x.vsC)),el('td',x.qoq>0?'up':x.qoq<0?'down':'',x.qoq==null?'—':sg(x.qoq,1,x.pct?'%p':'%')),el('td',x.yoy>0?'up':x.yoy<0?'down':'',x.yoy==null?'—':sg(x.yoy)),el('td',null,x.curY==null?'—':sg(x.curY)));const b=el('td');const sp=el('span','gbadge',x.v[0]);sp.style.background=x.v[1];b.append(sp);trw.append(b);tb.append(trw);}
   t.append(th,tb);w.append(t);box.append(w);
   box.append(el('p','muted','평가 기준: 가이던스 중간값이 ① 컨센서스보다 2% 넘게 높으면 +1(낮으면 −1) ② 이번 분기 실적보다 1% 넘게 높으면 +1(낮으면 −1, 이익률은 ±0.5%p) ③ 전년 대비 증가율이 이번 분기 전년 대비 증가율보다 1%p 넘게 높으면 +1(성장 가속), 낮으면 −1(성장 둔화). 합계 2 이상 강함 · 1 양호 · 0 중립 · 음수 약함. 전년 대비는 분기 추이 표에 1년 전 같은 분기가 있을 때만 계산합니다. 이익률 항목은 %p 차이.'));}
 }
 // 다각도 분석(events[].deep_analysis): 결론 한 줄 → 각도별(실적·가이던스·피어·환율·현금·환원·한국) 서술 → 계산 근거 → 아직 확인 못 한 것
 function deep(D,box){const w=el('div','deep');if(D.lead)w.append(el('p','deep-lead',D.lead));
  for(const s of D.sections||[]){const c=el('section','deep-sec'),h=el('div','deep-h');if(s.angle)h.append(el('span','deep-angle',s.angle));h.append(el('b',null,s.title||''));c.append(h);for(const p of [].concat(s.body||[]))c.append(el('p',null,p));if(s.calc)c.append(el('p','deep-calc','계산 근거: '+s.calc));w.append(c);}
  if((D.open_questions||[]).length){const o=el('div','deep-open');o.append(el('b',null,'아직 확인 못 한 것'));const ul=el('ul');for(const q of D.open_questions)ul.append(el('li',null,q));o.append(ul);w.append(o);}
  box.append(w);if((D.sources||[]).length)box.append(srcs(D.sources,'출처: '));}
 function render(ticker,period){
  const abox=$('analysisBody')||box;box.replaceChildren();if(abox!==box)abox.replaceChildren();const co=byT.get(ticker);
  const mine=events.filter(e=>e.ticker===ticker).sort((a,b)=>b.date.localeCompare(a.date));
  const e=mine.find(x=>x.period===period)||mine[0];
  if(!co||!e){$('scoreMeta').textContent='기업을 선택하세요.';box.append(el('p','muted',co?`${co.name}: 공식 자료로 검증한 발표 기록이 아직 없습니다.`:'기업을 선택하세요.'));return;}
  $('scoreMeta').textContent=`${co.name} (${ticker}) · ${e.period} · 발표 ${e.date}`;
  const S=e.scorecard,A=e.analysis;
  if(!S)box.append(el('p','muted','이 발표는 아직 발표 숫자 표가 정리되지 않았습니다. 공식 수치는 아래 \'회사 발표 원문 요약\'에서 보세요.'));
  if(S){const hasChanges=(e.changes||[]).length>0;const rows=hasChanges?S.rows.filter(r=>!/가이던스/.test(r[0])):S.rows;
   box.append(table(S.columns,rows.length?rows:S.rows,true));
   guideBlocks(e,mine,S);
   if(S.trend){box.append(el('h4',null,S.trend.title||'분기 추이'));box.append(table(S.trend.columns,S.trend.rows,false));}
   if(S.note){const d=el('details');d.append(el('summary',null,'수치 기준·시장 예상 출처'),el('p','muted',S.note));if((S.consensus_sources||[]).length)d.append(srcs(S.consensus_sources,'시장 예상 출처(회사 자료 아님): '));box.append(d);}
   else if((S.consensus_sources||[]).length)box.append(srcs(S.consensus_sources,'시장 예상 출처(회사 자료 아님): '));}
  const D=e.deep_analysis;if(D)deep(D,abox);
  if(!A){if(!D)abox.append(el('p','muted','이 발표는 아직 실적 분석이 정리되지 않았습니다. 아래 \'회사 발표 원문 요약·출처\'의 투자 해석을 참고하세요.'));return;}
  if(D)abox.append(el('h4',null,'요점 정리'));
  if(A.conclusion)abox.append(el('p','signal',A.conclusion));
  if(A.segment)abox.append(el('p','segment',A.segment));
  const ol=el('div','reason-list');for(const r of A.points||[]){const c=el('div','reason');c.append(el('b',null,r.title),el('p',null,r.body));ol.append(c);}abox.append(ol);
  if((A.sources||[]).length)abox.append(srcs(A.sources,'출처: '));
 }
 window.addEventListener('ge:show',ev=>render(ev.detail.ticker,ev.detail.period));
 const cp=$('companyPick'),pp=$('periodPick');if(cp&&cp.value)render(cp.value,pp?.value);
})();
