// 컨센서스 추이(상향·하향): consensus_trend.csv(collect_consensus_trend.py)를 읽어 회사별로 그립니다.
// 회계기간마다 시점별 컨센서스 평균을 선으로, 1·3·6개월 전 대비 변화율과 상향/하향 판단을 표로 보여줍니다.
(function(){
 let rows=null,loading=null,ct=null;const NAMES={op:'영업이익',revenue:'매출액',ni:'순이익',eps:'EPS'};
 const PAL=['#60a5fa','#f59e0b','#34d399','#f472b6','#a78bfa','#22d3ee'];
 function parse(t){const L=t.replace(/^﻿/,'').trim().split(/\r?\n/),h=L[0].split(',');return L.slice(1).map(l=>{const c=l.split(','),o={};h.forEach((k,i)=>o[k]=c[i]);return o;});}
 async function load(){if(rows)return rows;if(!loading)loading=fetch('consensus_trend.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>rows=t?parse(t):[]).catch(()=>rows=[]);return loading;}
 const n=v=>v===''||v==null?null:Number(v),ts=d=>Date.parse(d+'T00:00:00Z');
 function at(a,d){let b=null;for(const p of a){if(p.date<=d)b=p;else break;}return b;}
 function back(d,m){const x=new Date(d+'T00:00:00Z');x.setUTCMonth(x.getUTCMonth()-m);return x.toISOString().slice(0,10);}
 const pct=(a,b)=>a!=null&&b!=null&&b!==0?(a/b-1)*100*(b<0?-1:1):null;
 const fmt=v=>v==null?'—':(v>0?'+':'')+v.toFixed(1)+'%';
 function verdict(p1,p3){if(p3==null&&p1==null)return['—',''];const v=p3??p1;if(v>=3)return[p1!=null&&p1>=1?'상향 · 진행 중':'상향','up'];if(v<=-3)return[p1!=null&&p1<=-1?'하향 · 진행 중':'하향','down'];if(p1!=null&&p1>=3)return['최근 상향 전환','up'];if(p1!=null&&p1<=-3)return['최근 하향 전환','down'];return['유지',''];}
 let seq=0;window.__ctLoad=load;window.__ctRows=()=>rows||[];window.renderConsTrend=async function(c){const sec=document.getElementById('consTrendPanel');if(!sec)return;const my=++seq;await load();if(my!==seq)return;
  const item=document.getElementById('ctItem').value,freq=document.getElementById('ctFreq').value;
  document.getElementById('ctTitle').textContent=c.name+' · 컨센서스 추이 (상향·하향)';
  const mine=rows.filter(r=>r.company_id===c.id&&r.freq===freq&&r.item===item);const by=new Map();
  const cut=back(new Date().toISOString().slice(0,10),18);for(const r of mine){if(r.date<cut)continue;if(!by.has(r.period))by.set(r.period,[]);by.get(r.period).push({date:r.date,avg:n(r.avg),min:n(r.min),max:n(r.max),unit:r.unit});}
  const today=new Date().toISOString().slice(0,10);
  // 이미 실적이 확정돼 추이가 멈춘 과거 기간은 최근 2개 + 미래 기간 위주로 표시
  let periods=[...by.keys()].sort();const live=periods.filter(p=>by.get(p).some(x=>x.date>=back(today,1)));const done=periods.filter(p=>!live.includes(p)).slice(-2);
  periods=freq==='Y'?[...done,...live].slice(-5):[...done.slice(-1),...live].slice(-5);
  const tb=document.getElementById('ctTable');tb.replaceChildren();const ds=[];let unit='';
  periods.forEach((p,i)=>{const a=by.get(p).sort((x,y)=>x.date.localeCompare(y.date));const last=a.at(-1);unit=last.unit||unit;
   const p1=pct(last.avg,at(a,back(last.date,1))?.avg),p3=pct(last.avg,at(a,back(last.date,3))?.avg),p6=pct(last.avg,at(a,back(last.date,6))?.avg),first=a[0];
   const isLive=live.includes(p);let [vtxt,vcls]=verdict(p1,p3);if(!isLive){vtxt='추정 종료(실적 발표)';vcls='';}const col=PAL[i%PAL.length];
   ds.push({label:(freq==='Y'?p.slice(0,4)+'년':p.replace('/','.')+'월 분기')+(isLive?'':' (추정 종료)'),data:a.map(x=>({x:ts(x.date),y:x.avg})),borderColor:col,backgroundColor:col,borderWidth:isLive?2.4:1.4,borderDash:isLive?[]:[5,4],pointRadius:a.length<20?2.5:0,tension:0});
   const tr=document.createElement('tr');const cells=[freq==='Y'?p.slice(0,4)+'년':p,last.avg==null?'—':last.avg.toLocaleString(undefined,{maximumFractionDigits:item==='eps'?0:0})+' '+(last.unit||''),fmt(p1),fmt(p3),fmt(p6),first?`${first.date.slice(2)} ${first.avg?.toLocaleString(undefined,{maximumFractionDigits:0})}`:'—',last.min!=null?`${last.min.toLocaleString(undefined,{maximumFractionDigits:0})} ~ ${last.max.toLocaleString(undefined,{maximumFractionDigits:0})}`:'—',vtxt];
   cells.forEach((v,k)=>{const td=document.createElement('td');td.textContent=v;if(k>=2&&k<=4){const x=[p1,p3,p6][k-2];td.className=x==null?'':x>0?'pos':x<0?'neg':'';}if(k===7){td.className=vcls==='up'?'pos':vcls==='down'?'neg':'';td.style.fontWeight='700';}if(k===0)td.style.color=col;tr.append(td);});tb.append(tr);});
  const note=document.getElementById('ctNote');
  if(!periods.length){note.textContent='이 회사의 컨센서스 추이 자료가 없습니다(증권사 추정치가 없거나 아직 수집 전).';Chart.getChart(document.getElementById('ctChart'))?.destroy();ct=null;return;}
  note.textContent=`단위 ${unit} · 각 선은 그 회계기간 컨센서스(증권사 추정 평균)가 시점마다 어떻게 바뀌었는지입니다. 오른쪽으로 갈수록 오르면 상향 조정. 판단: 3개월 전 대비 ±3% 이상(자료가 짧으면 1개월). 점선은 실적 발표로 추정이 끝난 기간(변화율은 추정이 끝나기 직전 기준). 최근 18개월만 표시합니다. 출처: 네이버 증권 기업분석(와이즈리포트) 컨센서스 추이, 평일 매일 누적 저장.`;
  const xs=ds.flatMap(d=>d.data.map(q=>q.x)),x0=Math.min(...xs),x1=Math.max(...xs),cv=document.getElementById('ctChart');Chart.getChart(cv)?.destroy();ct=new Chart(cv,{type:'line',data:{datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,parsing:true,interaction:{mode:'nearest',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{callbacks:{title:x=>new Date(x[0].parsed.x).toISOString().slice(0,10),label:x=>`${x.dataset.label}: ${x.parsed.y.toLocaleString(undefined,{maximumFractionDigits:0})} ${unit}`}}},
   scales:{x:{type:'linear',min:x0-3*864e5,max:x1+3*864e5,ticks:{maxTicksLimit:8,callback:v=>new Date(v).toISOString().slice(2,7).replace('-','.')},grid:{display:false}},y:{title:{display:true,text:NAMES[item]+' ('+unit+')'}}}}});};
 document.addEventListener('change',e=>{if(e.target&&(e.target.id==='ctItem'||e.target.id==='ctFreq')){const id=document.getElementById('company')?.value;const c=(window.watch||[]).find?.(x=>x.id===id);if(c)window.renderConsTrend(c);else if(typeof watch!=='undefined'){const cc=watch.find(x=>x.id===id);if(cc)window.renderConsTrend(cc);}}});
})();

// ── 연도별 Forward PER 카드: 최근 종가 ÷ 회계연도별 EPS 컨센서스(올해·내년·내후년)
(function(){let px=null,pl=null;
 async function prices(){if(px)return px;if(!pl)pl=fetch('stock_prices_monthly.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>{px=new Map();if(!t)return px;const L=t.trim().split(/\r?\n/).slice(1);for(const l of L){const [id,m,d,c]=l.split(',');const o=px.get(id);if(!o||d>o.date)px.set(id,{date:d,close:Number(c)});}return px;}).catch(()=>px=new Map());return pl;}
 window.renderPerCards=async function(c){const box=document.getElementById('perCards');if(!box)return;await window.__ctLoad();const P=(await prices()).get(c.id);
  document.getElementById('perTitle').textContent=c.name+' · 연도별 PER (현재 주가 ÷ EPS 컨센서스)';box.replaceChildren();
  const y0=new Date().getFullYear(),rows=window.__ctRows().filter(r=>r.company_id===c.id&&r.freq==='Y'&&r.item==='eps');
  const d=P?`${P.date.slice(0,4)}-${P.date.slice(4,6)}-${P.date.slice(6,8)}`:'';
  for(const [k,lab] of [[0,'올해'],[1,'내년'],[2,'내후년']]){const per=`${y0+k}/12`,a=rows.filter(r=>r.period===per).sort((x,y)=>x.date.localeCompare(y.date)),last=a.at(-1);
   const eps=last?Number(last.avg):null,pe=eps>0&&P?P.close/eps:null;
   const m3=a.filter(r=>r.date<=(()=>{const x=new Date((last?.date||d)+'T00:00:00Z');x.setUTCMonth(x.getUTCMonth()-3);return x.toISOString().slice(0,10);})()).at(-1),ch=m3&&last&&Number(m3.avg)>0?(eps/Number(m3.avg)-1)*100:null;
   const pe3=m3&&Number(m3.avg)>0&&P?P.close/Number(m3.avg):null;
   const el=document.createElement('div');el.className='card per-card';
   el.innerHTML=`<span class="muted">${lab} · ${y0+k}년 PER</span><strong>${pe==null?(eps!=null&&eps<=0?'적자':'—'):pe.toFixed(1)+'배'}</strong><span class="muted">EPS 컨센서스 ${eps==null?'없음':Math.round(eps).toLocaleString()+'원'}${last?' · '+last.date:''}</span><span class="${ch==null?'muted':ch>=0?'pos':'neg'}">${ch==null?'3개월 전 비교 불가':'EPS 3개월 '+(ch>0?'+':'')+ch.toFixed(1)+'% '+(ch>=3?'상향':ch<=-3?'하향':'유지')+(pe3&&pe?` (같은 주가면 PER ${pe3.toFixed(1)}→${pe.toFixed(1)}배)`:'')}</span>`;box.append(el);}
  document.getElementById('perNote').textContent=P?`주가 ${P.close.toLocaleString()}원 (${d} 종가, 수정주가) ÷ 회계연도별 EPS 컨센서스(네이버 와이즈리포트, 최근 3개월 증권사 추정 평균). 적자 추정이면 PER을 계산하지 않습니다.`:'주가 자료가 없습니다.';};
})();
