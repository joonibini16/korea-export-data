// 실적 분석 탭: 발표 숫자(실적·시장 예상·컨센/전년/전분기 대비) 표와 주가 반응 추정 이유.
// global_earnings.json 의 events[].scorecard · events[].reaction 을 그린다. 컨센서스·주가는 회사 자료가 아니므로 외부 출처를 함께 표시.
(async()=>{
 const $=id=>document.getElementById(id),box=$('scoreBody');if(!box)return;
 const el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n;};
 const link=(u,t)=>{if(!/^https:\/\//.test(u||''))return el('span',null,t);const a=el('a',null,t);a.href=u;a.target='_blank';a.rel='noopener noreferrer';return a;};
 let data;try{const r=await fetch('./global_earnings.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);data=await r.json();}catch(e){$('scoreMeta').textContent='자료를 읽지 못했습니다: '+e.message;return;}
 const byT=new Map((data.watchlist||[]).map(x=>[x.ticker,x])),events=data.events||[];
 const tone=v=>/^[+＋]/.test(v)?'up':/^[−-]\d/.test(v)?'down':'';
 const table=(cols,rows,colored)=>{const w=el('div','table'),t=el('table','score-table'),h=el('tr');for(const c of cols)h.append(el('th',null,c));const th=el('thead');th.append(h);const tb=el('tbody');for(const r of rows){const tr=el('tr');r.forEach((v,i)=>{const td=el('td',i===0?'lbl':(colored&&i>=3?tone(String(v)):''),v);tr.append(td);});tb.append(tr);}t.append(th,tb);w.append(t);return w;};
 const srcs=(arr,lead)=>{const p=el('p','muted');p.append(document.createTextNode(lead));(arr||[]).forEach((s,i)=>{if(i)p.append(document.createTextNode(' · '));p.append(link(s.url,s.label));});return p;};
 function render(ticker,period){
  box.replaceChildren();const co=byT.get(ticker);
  const mine=events.filter(e=>e.ticker===ticker).sort((a,b)=>b.date.localeCompare(a.date));
  const e=mine.find(x=>x.period===period)||mine[0];
  if(!co||!e){$('scoreMeta').textContent='기업을 선택하세요.';return;}
  $('scoreMeta').textContent=`${co.name} (${ticker}) · ${e.period} · 발표 ${e.date}`;
  const S=e.scorecard,R=e.reaction;
  if(!S&&!R){box.append(el('p','muted','이 발표는 아직 발표 숫자 표·추정 이유가 정리되지 않았습니다. 공식 수치는 컨콜 분석 탭과 분기 실적 리포트에서 보세요.'));return;}
  if(S){box.append(el('h3',null,S.title||'발표 숫자'));box.append(table(S.columns,S.rows,true));
   if(S.trend){box.append(el('h4',null,S.trend.title||'분기 추이'));box.append(table(S.trend.columns,S.trend.rows,false));}
   if(S.note)box.append(el('p','muted',S.note));if((S.consensus_sources||[]).length)box.append(srcs(S.consensus_sources,'시장 예상 출처(회사 자료 아님): '));}
  if(R){box.append(el('h3',null,R.title||'주가 반응 추정 이유'));if(R.summary)box.append(el('p','signal',R.summary));
   const ol=el('div','reason-list');for(const r of R.reasons||[]){const c=el('div','reason');c.append(el('b',null,r.title),el('p',null,r.body));ol.append(c);}box.append(ol);
   if(R.counterpoint){const p=el('p','counter');p.append(el('b',null,'반대 근거 · '),document.createTextNode(R.counterpoint));box.append(p);}
   if((R.sources||[]).length)box.append(srcs(R.sources,'출처: '));}
 }
 window.addEventListener('ge:show',ev=>render(ev.detail.ticker,ev.detail.period));
 const cp=$('companyPick'),pp=$('periodPick');if(cp&&cp.value)render(cp.value,pp?.value);
})();
