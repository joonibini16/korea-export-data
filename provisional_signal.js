// 10일 단위 품목별 수출 시그널 보드 (관세청 잠정치 1~10일·1~20일 + 월간 확정치 → 1~10 / 11~20 / 21~말일 3구간)
(function(){
 const host=document.getElementById('sigArea');if(!host)return;
 const parse=t=>{const L=t.replace(/^﻿/,'').trim().split(/\r?\n/),h=L.shift().split(',');return L.filter(Boolean).map(l=>{const f=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,f[i]??'']));});};
 const SIG={
  '가속 상승':{c:'#d92d20',bg:'#fee4e2',d:'증가율이 플러스이고 최근 3구간 평균이 직전 3구간보다 5%p 이상 높아짐'},
  '상승 유지':{c:'#e8590c',bg:'#ffedd5',d:'증가율 플러스, 속도 변화가 ±5%p 이내'},
  '상승 둔화(속도↓)':{c:'#b54708',bg:'#fef0c7',d:'증가율은 플러스지만 최근 3구간 평균이 5%p 이상 낮아짐'},
  '꼭지 의심(고레벨 급감속)':{c:'#7a2e9e',bg:'#f3e8ff',d:'직전 3구간 평균 +50% 이상의 높은 증가율에서 15%p 이상 급감속'},
  '반전 조짐':{c:'#0e7490',bg:'#cffafe',d:'최근 평균은 마이너스지만 5%p 이상 개선 중'},
  '하락':{c:'#1570ef',bg:'#dbeafe',d:'최근 3구간 평균이 마이너스이고 개선이 뚜렷하지 않음'},
  '중립':{c:'#667085',bg:'#f2f4f7',d:'증가율과 속도 변화가 모두 작음(±3%, ±5%p 이내)'}};
 const judge=(r3,p3)=>{if(r3==null)return '중립';const m=p3==null?0:r3-p3;
  if(Math.abs(r3)<3&&Math.abs(m)<5)return '중립';
  if(r3>0){if(m>=5)return '가속 상승';if(m<=-5)return (p3>=50&&m<=-15)?'꼭지 의심(고레벨 급감속)':'상승 둔화(속도↓)';return '상승 유지';}
  return m>=5?'반전 조짐':'하락';};
 const avg=a=>{a=a.filter(v=>v!=null&&isFinite(v));return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;};
 const f1=v=>v==null?'—':(v>0?'+':'')+v.toFixed(1);
 const cls=v=>v==null?'':v>=0?'pos':'neg';
 const prevMonth=mo=>{const [y,m]=mo.split('.').map(Number);return m===1?(y-1)+'.12':y+'.'+String(m-1).padStart(2,'0');};
 const monthRate=(c,p,mo,k,daily=adj)=>{if(c==null||!Number.isFinite(c)||!Number.isFinite(p)||!(p>0)||c<0)return null;if(!daily)return (c/p-1)*100;const a=segDays(mo,k,false),b=segDays(prevMonth(mo),k,false);return a&&b?((c/a)/(p/b)-1)*100:null;};
 const SEGL=['1~10일','11~20일','21~말일'];
 let pageView='overall',mode='item',adj=true,R=[],chart=null,focusCharts=[],focusPeriod='D10',focusRange='12';
 const selected={item:'총계',country:''};
 const displayName=n=>n==='총계'?'총괄':n;
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // 관세청 조업일수: 평일 1, 토요일 0.5, 일요일·공휴일 0 (근로자의날 포함, 설·추석이 토요일과 겹칠 때 대체휴일 없음) — 발표문 조업일수와 대조 검증
 const HOL={2024:'0101 0209 0210 0211 0212 0301 0410 0415 0501 0506 0515 0606 0815 0916 0917 0918 1001 1003 1009 1225',
  2025:'0101 0127 0128 0129 0130 0301 0303 0501 0505 0506 0603 0606 0815 1003 1005 1006 1007 1008 1009 1225',
  2026:'0101 0216 0217 0218 0301 0302 0501 0505 0524 0525 0603 0606 0717 0815 0817 0924 0925 0926 1003 1005 1009 1225'};
 const wd=(y,m,d1,d2)=>{if(!HOL[y])return null;const h=HOL[y].split(' ');let s=0;const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  for(let d=d1;d<=Math.min(d2,last);d++){const w=new Date(Date.UTC(y,m-1,d)).getUTCDay();if(w===0||h.includes(String(m).padStart(2,'0')+String(d).padStart(2,'0')))continue;s+=w===6?.5:1;}return s;};
 const segDays=(mo,k,prev)=>{const y=+mo.slice(0,4)-(prev?1:0),m=+mo.slice(5,7);return k==='10d'?wd(y,m,1,10):k==='20d'?wd(y,m,1,20):k===1?wd(y,m,1,10):k===2?wd(y,m,11,20):k===3?wd(y,m,21,31):wd(y,m,1,k);};
 const yoyOf=(c,p,mo,k)=>{if(c==null||!(p>0)||c<0)return null;if(!adj)return (c/p-1)*100;const a=segDays(mo,k,false),b=segDays(mo,k,true);return a&&b?((c/a)/(p/b)-1)*100:(c/p-1)*100;};

 function build(rows){
  const V={};rows.forEach(r=>{V[[r.month,r.release,r.kind,r.flow,r.name].join('|')]={c:r.usd_mn===''?null:+r.usd_mn,p:r.prev_usd_mn===''?null:+r.prev_usd_mn};});
  const months=[...new Set(rows.map(r=>r.month))].sort();
  const g=(m,rel,kind,name)=>{
   if(name==='총계(반도체 제외)'){const t=g(m,rel,'total','총계'),s=g(m,rel,'item','반도체');return t&&s&&t.p!=null&&s.p!=null?{c:t.c-s.c,p:t.p-s.p}:null;}
   const k=name==='총계'?'total':kind;const v=V[[m,rel,k,'export',name].join('|')];
   if(v||rel!=='FINAL'||name!=='총계')return v||null;
   return V[[m,'MONTHLY','total','export','총계'].join('|')]||V[[m,'MONTH','total','export','총계'].join('|')]||null;};
  const latestD=rows.filter(r=>r.release==='D10'||r.release==='D20').map(r=>r.month+(r.release==='D10'?'1':'2')).sort().at(-1);
  const slots=[];months.forEach(m=>[1,2,3].forEach(k=>{if((m+k)<=latestD||k===3&&(m+'3')<latestD)slots.push([m,k]);}));
  const names=mode==='item'
   ?[...new Set(rows.filter(r=>r.kind==='item'&&r.flow==='export'&&(r.release==='D10'||r.release==='D20')).map(r=>r.name))].concat(['총계','총계(반도체 제외)'])
   :[...new Set(rows.filter(r=>r.kind==='country'&&r.flow==='export'&&(r.release==='D10'||r.release==='D20')&&r.month>=months.at(-3)).map(r=>r.name))];
  const kind=mode==='item'?'item':'country';
  return names.map(n=>{
   const seg=slots.map(([m,k])=>{let c=null,p=null;const a=g(m,'D10',kind,n),b=g(m,'D20',kind,n),f=g(m,'FINAL',kind,n);
    if(k===1&&a&&a.c!=null){c=a.c;p=a.p;}else if(k===2&&a&&b&&a.c!=null&&b.c!=null&&a.p!=null&&b.p!=null){c=b.c-a.c;p=b.p-a.p;}else if(k===3&&b&&f&&b.c!=null&&f.c!=null&&b.p!=null&&f.p!=null){c=f.c-b.c;p=f.p-b.p;}
    const y=yoyOf(c,p,m,k),yr=c!=null&&p>0&&c>=0?(c/p-1)*100:null;return {m,k,c,p,y,yr,da:segDays(m,k,false),db:segDays(m,k,true)};});
   seg.forEach(q=>{const prior=seg.find(v=>v.m===prevMonth(q.m)&&v.k===q.k);q.monthRaw=prior&&Number.isFinite(q.c)&&Number.isFinite(prior.c)&&q.c!=null&&prior.c>0&&q.c>=0?(q.c/prior.c-1)*100:null;q.monthChange=prior?monthRate(q.c,prior.c,q.m,q.k):null;q.monthDaily=prior?monthRate(q.c,prior.c,q.m,q.k,true):null;});
   const last9=seg.slice(-9),ys=seg.map(s=>s.y);
   const r3=avg(ys.slice(-3)),p3=avg(ys.slice(-6,-3)),mom=r3!=null&&p3!=null?r3-p3:null;
   const lastY=[...seg].reverse().find(s=>s.y!=null);
   // 당월 누적(최신 잠정치 발표 기준)
   const lm=latestD.slice(0,7),lr=latestD.endsWith('1')?'D10':'D20',cum=g(lm,lr,kind,n);
   const cumY=cum?yoyOf(cum.c,cum.p,lm,lr==='D10'?'10d':'20d'):null;
   const prevCum=g(prevMonth(lm),lr,kind,n),cumMoM=cum&&prevCum?monthRate(cum.c,prevCum.c,lm,lr==='D10'?'10d':'20d'):null;
   // TTM: 확정치 최근 12개월
   const fm=months.filter(m=>g(m,'FINAL',kind,n)).slice(-12);let ttm=null,ttmY=null,ttmEnd=null;
   if(fm.length===12){const s=fm.map(m=>g(m,'FINAL',kind,n));ttm=s.reduce((a,v)=>a+v.c,0);const pp=s.reduce((a,v)=>a+(v.p||0),0);ttmY=pp>0&&s.every(v=>v.p!=null)?(ttm/pp-1)*100:null;ttmEnd=fm.at(-1);}
   const miss3=seg.slice(-9).filter(s=>s.k===3&&s.y==null&&s.m<lm).length;
   const releases={};
for(const rel of ['D10','D20']){const k=rel==='D10'?'10d':'20d';releases[rel]=months.filter(m=>m<=lm).map(m=>{const v=g(m,rel,kind,n),pv=g(prevMonth(m),rel,kind,n);const c=v?.c??null,p=v?.p??null,da=segDays(m,k,false),db=segDays(m,k,true);return {m,k:rel,c,p,da,db,y:yoyOf(c,p,m,k),yr:c!=null&&p>0&&c>=0?(c/p-1)*100:null,monthChange:pv?monthRate(c,pv.c,m,k):null,monthDaily:pv?monthRate(c,pv.c,m,k,true):null,monthRaw:c!=null&&pv?.c>0&&c>=0?(c/pv.c-1)*100:null};});}
   return {n,seg,releases,last9,r3,p3,mom,lastY,cumY,cumMoM,cumLbl:lm+' '+(lr==='D10'?'1~10':'1~20'),ttm,ttmY,ttmEnd,sig:judge(r3,p3),miss3};
  }).filter(x=>x.last9.some(s=>s.y!=null));
 }

 function spark(seg,col){
  const W=150,H=34,ys=seg.map(s=>s.y),v=ys.filter(y=>y!=null);if(!v.length)return '';
  let lo=Math.min(0,...v),hi=Math.max(0,...v);if(hi-lo<1){hi+=1;lo-=1;}
  const X=i=>4+i*(W-8)/Math.max(1,seg.length-1),Y=y=>H-3-(y-lo)/(hi-lo)*(H-6);
  let d='',pen=false;ys.forEach((y,i)=>{if(y==null){pen=false;return;}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(y).toFixed(1);pen=true;});
  const dots=ys.map((y,i)=>y==null?`<circle cx="${X(i)}" cy="${Y(0)}" r="1.6" fill="#cbd5e1"/>`:'').join('');
  const end=ys.map((y,i)=>[y,i]).filter(a=>a[0]!=null).at(-1);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block"><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#d0d5dd" stroke-dasharray="2 2"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8"/>${dots}<circle cx="${X(end[1])}" cy="${Y(end[0])}" r="2.6" fill="${col}"/></svg>`;}

 function renderPicker(){
  const picker=document.getElementById('provisional-item-select'),buttons=document.getElementById('provisional-item-buttons'),overview=document.getElementById('provisional-overview');
  if(!picker||!buttons)return;
  const names=[...new Set(R.filter(r=>r.kind==='item'&&r.flow==='export'&&['D10','D20'].includes(r.release)).map(r=>r.name))].sort((a,b)=>a.localeCompare(b,'ko')).concat(['총계(반도체 제외)']);
  const value=pageView==='overall'?'__overall':mode==='item'?selected.item:'';
  picker.innerHTML='<option value="__overall">총괄 잠정수출</option><option value="">전체 품목 비교</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  picker.value=value;
  const choose=n=>{pageView=n==='__overall'?'overall':'items';mode='item';selected.item=n==='__overall'?'총계':n;render();};
  picker.onchange=e=>choose(e.target.value);
  buttons.innerHTML=[['__overall','총괄'],...names.map(n=>[n,n])].map(([n,t])=>`<button type="button" data-item="${esc(n)}" aria-pressed="${value===n}">${esc(t)}</button>`).join('');
  buttons.querySelectorAll('button').forEach(b=>b.onclick=()=>choose(b.dataset.item));
  if(overview)overview.hidden=pageView!=='overall';
  const status=document.getElementById('provisional-picker-status');
  if(status)status.textContent=pageView==='overall'?'총괄에서 공식 발표 요약과 전체 수출의 YoY·MoM 상세 분석을 함께 볼 수 있습니다.':(mode==='item'&&selected.item?selected.item:mode==='country'?'국가별':'전체 품목')+' 조회 중 · 총괄 버튼으로 돌아갈 수 있습니다.';
 }
 function render(){
  if(mode==='item'&&selected.item==='총계')pageView='overall';
  renderPicker();
  focusCharts.forEach(c=>c.destroy());focusCharts=[];
  if(chart){chart.destroy();chart=null;}
  const all=build(R).sort((a,b)=>(b.mom??-1e9)-(a.mom??-1e9));
  if(selected[mode]&&!all.some(x=>x.n===selected[mode]))selected[mode]='';
  const L=all.filter(x=>!selected[mode]||x.n===selected[mode]);
  const cnt={};L.forEach(x=>cnt[x.sig]=(cnt[x.sig]||0)+1);
  const latest=L[0]?.last9.at(-1);
  host.innerHTML=`<div class="sg-top"><div class="sg-tg">${[['item','수출 품목'],['country','수출 국가']].map(([k,t])=>`<button class="period${mode===k?' active':''}" data-m="${k}">${t}</button>`).join('')}<span style="width:14px"></span>${[[1,'일평균(조업일수 보정)'],[0,'금액 그대로']].map(([k,t])=>`<button class="period${+adj===k?' active':''}" data-a="${k}">${t}</button>`).join('')}</div>
   <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${mode==='item'?'품목 선택':'국가 선택'} <select id="sg-select" aria-label="${mode==='item'?'품목 선택':'국가 선택'}" style="padding:9px 12px;border:1px solid #94a3b8;border-radius:8px;background:#0f1a33;color:#e5e7eb;min-width:220px;max-width:100%"><option value="">전체 ${mode==='item'?'품목':'국가'}</option>${[...all].sort((a,b)=>a.n.localeCompare(b.n,'ko')).map(x=>`<option value="${esc(x.n)}"${selected[mode]===x.n?' selected':''}>${esc(displayName(x.n))}</option>`).join('')}</select><span class="sg-h">${L.length} / ${all.length}개 표시 · 선택하면 상세 그래프가 열립니다</span></label>
   <div class="sg-sum">${Object.keys(SIG).filter(k=>cnt[k]).map(k=>`<span class="sg-b" style="color:${SIG[k].c};background:${SIG[k].bg}">${k} ${cnt[k]}</span>`).join(' ')}</div></div>
   <section id="sg-focus" aria-label="선택 항목 상세"></section>
   <div class="table-wrap"><table class="sg"><thead><tr><th>${mode==='item'?'품목':'국가'}</th><th>시그널</th><th>최신구간 YoY${adj?'<div class="sg-h">일평균 기준</div>':''}<div class="sg-h">${latest?latest.m.slice(2).replace('.','.')+' '+SEGL[latest.k-1]:''}</div></th><th>최신구간 MoM<div class="sg-h">전월 동일 구간${adj?' · 일평균':''}</div></th><th>3개월 추세<div class="sg-h">10일 구간 YoY · 9구간</div></th><th>모멘텀<div class="sg-h">최근3−직전3 (%p)</div></th><th>당월누적 YoY<div class="sg-h">${L[0]?L[0].cumLbl+'일':''}</div></th><th>당월누적 MoM<div class="sg-h">전월 동일 누적기간</div></th><th>TTM YoY<div class="sg-h">확정치 12개월</div></th><th>TTM (억$)</th><th></th></tr></thead><tbody>`+
   L.map((x,i)=>{const s=SIG[x.sig],tot=/^총계/.test(x.n);return `<tr class="${tot?'sg-tot':''}"><td><b>${displayName(x.n)}</b></td><td><span class="sg-b" style="color:${s.c};background:${s.bg}" title="${s.d}">${x.sig}</span></td>
    <td class="num ${cls(x.lastY&&x.lastY.y)}">${x.lastY?f1(x.lastY.y)+'%':'—'}${x.lastY&&x.lastY!==x.last9.at(-1)?'<div class="sg-h">'+x.lastY.m.slice(2)+' '+SEGL[x.lastY.k-1]+'</div>':''}</td>
    <td class="num ${cls(x.last9.at(-1)?.monthChange)}">${x.last9.at(-1)?.monthChange==null?'—':f1(x.last9.at(-1).monthChange)+'%'}</td><td>${spark(x.last9,s.c)}</td><td class="num ${cls(x.mom)}"><b>${f1(x.mom)}</b></td><td class="num ${cls(x.cumY)}">${x.cumY==null?'—':f1(x.cumY)+'%'}</td>
    <td class="num ${cls(x.cumMoM)}">${x.cumMoM==null?'—':f1(x.cumMoM)+'%'}</td><td class="num ${cls(x.ttmY)}">${x.ttmY==null?'—':f1(x.ttmY)+'%'}</td><td class="num">${x.ttm==null?'—':Math.round(x.ttm/100).toLocaleString()}</td>
    <td><button class="sg-d" data-i="${i}">상세</button></td></tr><tr class="sg-x" id="sgx${i}" hidden><td colspan="11"></td></tr>`;}).join('')+'</tbody></table></div>'+
   `<details class="sg-note"><summary>판단 기준·자료 설명</summary><ul>
    <li><b>구간</b>: 관세청 잠정치 1~10일(①), 1~20일−1~10일(②), 월간 확정치−1~20일(③ 21일~말일). 전년동기 금액은 발표 증감률로 역산해 같은 방식으로 뺍니다. 모든 수치는 관세청 원문(보도자료 첨부 PDF) 기준입니다.</li>
    <li><b>일평균(조업일수 보정)</b>: 10일 구간은 명절·공휴일 위치에 따라 조업일수가 크게 달라집니다(예: 2026.10 1~10일 5.5일 vs 전년 3.5일, 2025년 추석이 10월). 기본값은 구간별 조업일수(평일 1, 토 0.5, 일·공휴일 0 — 관세청 방식)로 나눈 일평균 증가율이며, '금액 그대로'를 누르면 발표 증감률 방식으로 바뀝니다. TTM은 금액 기준.</li>
    <li><b>MoM</b> = 당해 금액 ÷ 전월 동일 구간 금액 − 1. ①끼리·②끼리·③끼리 비교하며, 당월누적은 D10끼리·D20끼리 비교합니다. 일평균 모드에서는 양쪽 모두 각 구간 조업일수로 나눕니다. 전월 누락·0·음수이면 비워둡니다. 월말 구간 길이 차이·계절성은 남을 수 있습니다.</li><li><b>모멘텀</b> = 최근 3구간 YoY 평균 − 직전 3구간 YoY 평균. 시그널은 최근 3구간 평균(수준)과 모멘텀(속도)으로 판정합니다.</li>
    ${Object.entries(SIG).map(([k,v])=>`<li><span class="sg-b" style="color:${v.c};background:${v.bg}">${k}</span> ${v.d}</li>`).join('')}
    <li>10일 구간은 조업일수·선적 몰림(선박 인도, 월말 집중)에 따라 크게 흔들립니다. 단일 구간보다 3구간 평균과 TTM을 함께 보세요.</li>
    <li>컴퓨터주변기기·정밀기기는 월간 확정치 표에 같은 분류가 없어 21일~말일 구간(③)이 빈칸(회색 점)이며, 모멘텀은 있는 구간만으로 계산합니다. TTM은 확정치에 같은 품목이 있을 때만 표시합니다.</li>
    <li>국가는 각 발표의 상위 10개국이라 일부 구간이 빠질 수 있습니다(말레이시아·인도 등은 확정치 표에 없어 ③ 빈칸).</li></ul></details>`;
  host.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{pageView='items';mode=b.dataset.m;render();});host.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{adj=b.dataset.a==='1';render();});
  host.querySelector('#sg-select').onchange=e=>{pageView='items';selected[mode]=e.target.value;render();};
  host.querySelectorAll('.sg-d').forEach(b=>b.onclick=()=>{pageView='items';selected[mode]=L[+b.dataset.i].n;render();});
  if(selected[mode]&&L.length)focus(L[0]);
 }

 function focus(x){
  const box=host.querySelector('#sg-focus'),s=SIG[x.sig];
  const label=q=>q.m+' '+(q.k==='D10'?'1~10일':q.k==='D20'?'1~20일':SEGL[q.k-1]);
  const rate=v=>v==null||!Number.isFinite(v)?'—':f1(v)+'%';
  const amount=v=>v==null||!Number.isFinite(v)||v<0?'—':(v/100).toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:1});
  const dailyY=q=>q.yr==null||!(q.da>0&&q.db>0)?null:((1+q.yr/100)*q.db/q.da-1)*100;
  let data=focusPeriod==='SEG'?x.seg:x.releases[focusPeriod];
  if(focusPeriod!=='SEG'){const end=R.filter(r=>r.release===focusPeriod&&r.flow==='export').map(r=>r.month).sort().at(-1);data=data.filter(q=>q.m<=end);}
  const limit=focusRange==='ALL'?null:+focusRange;
  if(limit){const months=[...new Set(data.map(q=>q.m))].slice(-limit);data=data.filter(q=>months.includes(q.m));}
  const latest=data.at(-1),modeLabel=adj?'일평균':'수출액';
  box.innerHTML=`<div class="sg-focus-head"><h3>${esc(displayName(x.n))} · 수출 상세</h3><button class="sg-d" id="sg-all">전체 목록 보기</button></div>
   <div class="sg-focus-controls"><label>조회 기준 <select id="sg-focus-period" aria-label="상세 조회 기준">${[['D10','1~10일 누적 (D10)'],['D20','1~20일 누적 (D20)'],['SEG','10일 개별 구간']].map(([k,t])=>`<option value="${k}"${focusPeriod===k?' selected':''}>${t}</option>`).join('')}</select></label>
   <label>조회 기간 <select id="sg-focus-range" aria-label="상세 조회 기간">${[['6','최근 6개월'],['12','최근 12개월'],['ALL','전체 기간']].map(([k,t])=>`<option value="${k}"${focusRange===k?' selected':''}>${t}</option>`).join('')}</select></label><span class="sub">${latest?label(latest):'조회 자료 없음'} · 차트 증감률: ${modeLabel} 기준</span></div>
   <div class="cards sg-focus-cards">${[
    ['수출액 (억 달러)',amount(latest?.c),latest?label(latest):'',null],
    ['수출액 YoY',rate(latest?.yr),'전년 동일기간 대비',latest?.yr],
    ['수출액 MoM',rate(latest?.monthRaw),'전월 동일기간 대비',latest?.monthRaw],
    ['일평균 YoY',rate(latest?dailyY(latest):null),'조업일수 보정',latest?dailyY(latest):null],
    ['일평균 MoM',rate(latest?.monthDaily),'조업일수 보정',latest?.monthDaily]
   ].map(([t,v,d,r])=>`<div class="card"><div class="label">${t}</div><div class="value ${cls(r)}">${v}</div><div class="detail">${d}</div></div>`).join('')}</div>
   <div class="grid"><div><h3>수출액 · 전년동기 비교</h3><div class="chart"><canvas id="sg-amount-chart" role="img" aria-label="${esc(displayName(x.n))} 수출액 비교"></canvas></div></div>
   <div><h3>${modeLabel} YoY · MoM</h3><div class="chart"><canvas id="sg-rate-chart" role="img" aria-label="${esc(displayName(x.n))} YoY MoM 추이"></canvas></div></div></div>
   <p class="sub">D10은 D10끼리, D20은 D20끼리 비교합니다. 개별 구간은 1~10일·11~20일·21일~말일로 나누며 MoM은 전월의 같은 구간 대비입니다. 빈칸은 자료 미확보 또는 비교 불가입니다.</p>
   <div class="table-wrap sg-focus-table"><table><caption>${esc(displayName(x.n))} 기간별 수출액·YoY·MoM</caption><thead><tr><th>기준기간</th><th>수출액 (억 달러)</th><th>전년동기 (억 달러)</th><th>YoY (%)</th><th>MoM (%)</th><th>일평균 YoY (%)</th><th>일평균 MoM (%)</th><th>조업일수 (당해/전년)</th></tr></thead><tbody>${[...data].reverse().map(q=>`<tr><td>${label(q)}</td><td class="num">${amount(q.c)}</td><td class="num">${amount(q.p)}</td><td class="num ${cls(q.yr)}">${rate(q.yr)}</td><td class="num ${cls(q.monthRaw)}">${rate(q.monthRaw)}</td><td class="num ${cls(dailyY(q))}">${rate(dailyY(q))}</td><td class="num ${cls(q.monthDaily)}">${rate(q.monthDaily)}</td><td>${q.da??'—'} / ${q.db??'—'}</td></tr>`).join('')}</tbody></table></div>
   <p class="sub"><span class="sg-b" style="color:${s.c};background:${s.bg}">${x.sig}</span> 10일 개별 구간 시그널 · 모멘텀 ${f1(x.mom)}%p${x.ttm==null?'':` · TTM ${Math.round(x.ttm/100).toLocaleString()}억 달러 (${x.ttmEnd}까지)`}</p>`;
  box.querySelector('#sg-all').onclick=()=>{selected[mode]='';render();};
  box.querySelector('#sg-focus-period').onchange=e=>{focusPeriod=e.target.value;render();};
  box.querySelector('#sg-focus-range').onchange=e=>{focusRange=e.target.value;render();};
  const common={responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{rangeNav:false}};
  focusCharts.push(new Chart(box.querySelector('#sg-amount-chart'),{type:'bar',data:{labels:data.map(label),datasets:[{label:'전년동기',data:data.map(q=>q.p==null||q.p<0?null:q.p/100),backgroundColor:'#64748b'},{label:'당해 수출',data:data.map(q=>q.c==null||q.c<0?null:q.c/100),backgroundColor:'#60a5fa'}]},options:{...common,scales:{y:{beginAtZero:true,title:{display:true,text:'억 달러 (USD)'}}},plugins:{...common.plugins,tooltip:{callbacks:{label:c=>c.dataset.label+': '+c.parsed.y?.toLocaleString('ko-KR',{maximumFractionDigits:2})+'억 달러'}}}}}));
  focusCharts.push(new Chart(box.querySelector('#sg-rate-chart'),{type:'line',data:{labels:data.map(label),datasets:[{label:modeLabel+' YoY',data:data.map(q=>adj?dailyY(q):q.yr),borderColor:'#f87171',backgroundColor:'#f87171',borderWidth:3,pointRadius:3,spanGaps:false},{label:modeLabel+' MoM',data:data.map(q=>adj?q.monthDaily:q.monthRaw),borderColor:'#fbbf24',backgroundColor:'#fbbf24',borderDash:[5,3],borderWidth:2,pointRadius:3,spanGaps:false}]},options:{...common,scales:{y:{title:{display:true,text:'증감률 (%)'},ticks:{callback:v=>v+'%'}}},plugins:{...common.plugins,tooltip:{callbacks:{label:c=>c.dataset.label+': '+rate(c.parsed.y)}}}}}));
 }


 fetch('provisional_items.csv?t='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():Promise.reject(r.status)).then(t=>{R=parse(t);render();})
  .catch(e=>{const status=document.getElementById('provisional-picker-status');if(status)status.textContent='품목 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.';host.innerHTML='<div class="empty">품목 데이터를 불러오지 못했습니다 ('+e+')</div>';});
})();

