// 규모별 Breadth Desk: size_breadth.json(최신) + size_breadth_log.csv(갱신 기록)로 카드와 Desk Note를 그립니다.
(function(){
 const G=['매우약세','약세','중립','강세','매우강세'],gi=g=>G.indexOf(g);
 const arrow=g=>({'매우강세':'▲▲','강세':'▲','중립':'■','약세':'▼','매우약세':'▼▼'}[g]||'');
 const tone=g=>gi(g)>=3?'sb-up':gi(g)<=1&&gi(g)>=0?'sb-dn':'sb-flat';
 const pct=v=>v==null?'—':(v>0?'▲':v<0?'▼':'')+Math.abs(v).toFixed(2)+'%';
 const pcls=v=>v>0?'sb-r':v<0?'sb-b':'';
 const num=v=>v==null?'—':(v>0?'+':'')+Math.round(v);
 const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const badge=b=>!b?'':`<span class="sb-badge ${b==='저가매수 유입'?'sb-badge-b':''}">${b==='쏠림 랠리'?'⚠ ':''}${esc(b)}</span>`;
 const blockColor=v=>v==null?'#334155':v>=50?'#c2453a':v>=15?'#e07b72':v>-15?'#9aa3b2':v>-50?'#5b8fd0':'#2f62a8';
 function blocks(tr,sd){const mx=Math.max(10,...tr.map(t=>Math.abs(t.breadth||0)));return `<div class="sb-blocks">${tr.map(t=>{const v=t.breadth||0,h=Math.max(2,Math.abs(v)/mx*30);return `<div class="sb-col${t.date===sd?' sb-now':''}" data-d="${t.date}" title="${t.date} · Breadth ${num(t.breadth)}"><div class="sb-blk" style="height:${h.toFixed(0)}px;${v>=0?'bottom:50%':'top:50%'};background:${blockColor(t.breadth)}"></div></div>`;}).join('')}</div>`;}
 function bars(tr,sd){const W=220,H=46,mid=H/2,mx=Math.max(10,...tr.map(t=>Math.abs(t.breadth||0))),bw=W/tr.length;
  return `<svg class="sb-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="#64748b" stroke-width=".6"/>${tr.map((t,i)=>{const v=t.breadth||0,h=Math.max(1.5,Math.abs(v)/mx*(mid-3));return `<rect x="${(i*bw+bw*.18).toFixed(1)}" width="${(bw*.64).toFixed(1)}" y="${(v>=0?mid-h:mid).toFixed(1)}" height="${h.toFixed(1)}" fill="${v>=0?'#e0675c':'#4f86d4'}" opacity="${!sd||t.date===sd?1:.35}"><title>${t.date} ${num(v)}</title></rect>`;}).join('')}</svg>`;}
 function card(b,sd){return `<div class="sb-card ${tone(b.grade)}"><div class="sb-cn">${esc(b.name)}</div><div class="sb-ci">지수 <b class="${pcls(b.idx_chg)}">${pct(b.idx_chg)}</b></div>
  <div class="sb-cg ${gi(b.grade)>=3?'sb-r':gi(b.grade)<=1?'sb-b':''}">${esc(b.grade||'—')} ${arrow(b.grade)}</div><div class="sb-cb">${badge(b.badge)}</div>
  <div class="sb-cs">Breadth ${num(b.breadth)} · 신고가 ${b.nh} / 신저가 ${b.nl} / ${b.n}종목</div>${bars(b.trend,sd)}<small>${b.trend.length}거래일 추이${sd?' · <b>'+sd+'</b>':''}</small></div>`;}
 // 선택한 날짜의 구간 값(수집기 trend에 날짜별 신고가·신저가·등락이 있으면 사용)
 const G2=v=>v>=50?'매우강세':v>=15?'강세':v>-15?'중립':v>-50?'약세':'매우약세';
 function atDate(b,sd){const t=b.trend.find(x=>x.date===sd);if(!t||t===b.trend.at(-1))return b;
  const chg=t.idx_chg??null,g=t.grade||(t.breadth!=null?G2(t.breadth):null);
  const badge=t.breadth!=null&&chg!=null?(chg>0&&t.breadth<=-15?'쏠림 랠리':chg<0&&t.breadth>=15?'저가매수 유입':null):null;
  return {...b,idx_chg:chg,grade:g,badge,breadth:t.breadth,nh:t.nh??'—',nl:t.nl??'—',n:t.n??'—'};}
 function notes(D,log){const out=[];const NM={KOSPI:'코스피',KOSDAQ:'코스닥'};const ts=[...new Set(log.map(r=>r.ts))].sort();const cur=ts.at(-1),prev=ts.at(-2);
  const get=(t,m,b)=>log.find(r=>r.ts===t&&r.market===m&&r.bucket===b);
  for(const m of Object.keys(D.markets)){for(const b of D.markets[m].buckets){const c=get(cur,m,b.name),p=prev&&get(prev,m,b.name);if(!c)continue;const label=`${NM[m]} ${b.name==='종합'?'종합':b.name}`;
    if(p&&p.grade&&c.grade&&p.grade!==c.grade){const worse=gi(c.grade)<gi(p.grade);out.push(`<b>${label}</b>${b.name==='종합'?'':'이'} ${p.grade}→${c.grade}로 ${worse?'<em>밀렸다</em>':'<em>개선됐다</em>'}`+(b.badge?` · 지수 ${pct(b.idx_chg)}에 <em>${b.badge}</em>`:'')+'.');}
    else if(b.badge==='쏠림 랠리'&&b.name!=='종합')out.push(`<b>${label}</b>: 지수 ${pct(b.idx_chg)}에도 신저가가 더 많아 <em>쏠림 랠리</em>(${b.grade}).`);
    else if(b.badge==='저가매수 유입')out.push(`<b>${label}</b>: 지수 ${pct(b.idx_chg)} 하락에도 신고가가 우세해 <em>저가매수 유입</em>(${b.grade}).`);}}
  const today=D.live_day,seq=m=>ts.filter(t=>t.slice(0,10)===today).map(t=>get(t,m,'종합')?.breadth).filter(v=>v!=='' && v!=null).map(Number);
  const parts=Object.keys(D.markets).map(m=>{const s=seq(m);if(s.length<2)return null;const a=s[0],z=s.at(-1);return `${NM[m]} ${num(a)}→${num(z)}`+(s.length>=3&&s.every((v,i)=>!i||v<=s[i-1])?'(갱신마다 하락)':s.length>=3&&s.every((v,i)=>!i||v>=s[i-1])?'(갱신마다 상승)':'');}).filter(Boolean);
  if(parts.length)out.push(`오늘 종합 Breadth 흐름: ${parts.join(', ')}.`);
  const kc=D.markets.KOSPI?.buckets.find(b=>b.name==='종합'),qc=D.markets.KOSDAQ?.buckets.find(b=>b.name==='종합');
  if(!out.length&&kc&&qc)out.push(`종합 Breadth는 코스피 ${num(kc.breadth)}(${kc.grade}), 코스닥 ${num(qc.breadth)}(${qc.grade}).`);
  return out.slice(0,6);}
 async function run(){const box=document.getElementById('sbDesk');if(!box)return;let D,log=[];
  try{D=await (await fetch('size_breadth.json?v='+Date.now(),{cache:'no-store'})).json();}catch(e){box.innerHTML='<p class="muted">규모별 Breadth 자료를 아직 수집하지 못했습니다.</p>';return;}
  try{const t=await (await fetch('size_breadth_log.csv?v='+Date.now(),{cache:'no-store'})).text();const L=t.trim().split(/\r?\n/),h=L.shift().split(',');log=L.map(l=>{const f=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,f[i]]));});}catch(e){}
  const at=String(D.updated_at||'').replace('T',' ').slice(0,16);
  let html=`<div class="sb-top"><span>${esc(at)} KST 갱신 · 기준일 ${esc(D.live_day)}</span><span>KOSPI · KOSDAQ 규모별 · 60일 신고가/신저가 기준</span></div>`;
  const mk=(m,M,sd)=>{const c0=M.buckets[0],c=atDate(c0,sd),tr=c0.trend;const last=tr.at(-1)?.date;
   return `<h3>${m} <small>size breadth</small>${sd&&sd!==last?` <span class="sb-sel">${sd} 기준</span>`:''}</h3><div class="sb-head">지수 <b class="${pcls(c.idx_chg)}">${pct(c.idx_chg)}</b> · <span class="${gi(c.grade)>=3?'sb-r':gi(c.grade)<=1?'sb-b':''}">Breadth ${num(c.breadth)} ${esc(c.grade)} ${arrow(c.grade)}</span> ${badge(c.badge)}</div>
   <div class="sb-sub"><span>종합 Breadth · ${tr.length}거래일 추이 (신고가 ${c.nh} · 신저가 ${c.nl} · ${c.n}종목) — 막대에 마우스를 올리면 그 날짜, 클릭하면 고정</span><span>${tr[0]?.date.slice(5)} → ${tr.at(-1)?.date.slice(5)}</span></div>${blocks(tr,sd)}
   <div class="sb-cards">${M.buckets.slice(1).map(b=>card(atDate(b,sd),sd)).join('')}</div>`;};
  for(const [m,M] of Object.entries(D.markets))html+=`<div class="sb-mkt" data-mkt="${m}"></div>`;
  const ns=notes(D,log);html+=`<div class="sb-note"><h3>Desk Note <small>breadth desk view</small></h3><ul>${ns.map(n=>`<li>${n}</li>`).join('')}</ul></div>
  <p class="muted">Breadth = (60일 신고가 종목 수 − 60일 신저가 종목 수) ÷ (신고가 + 신저가, 최소 10) × 100 — 신고가와 신저가 중 어느 쪽이 우세한지(−100~+100). 등급: +50 이상 매우강세 · +15 이상 강세 · ±15 미만 중립 · −15 이하 약세 · −50 이하 매우약세. <b>쏠림 랠리</b> = 지수는 오르는데 Breadth가 약세 이하(소수 대형주가 지수를 끌어올림). <b>저가매수 유입</b> = 지수는 내리는데 Breadth가 강세 이상. 규모 구분은 수집 시점 시가총액 순위(코스피 1~100 대형·101~300 중형·301~ 소형, 코스닥 1~100 K100·101~400 MID·401~ SMALL, 보통주만)이며 과거 막대도 현재 순위로 계산합니다. 구간 지수는 시가총액 가중 등락률, 종합은 실제 지수. 평일 한국시간 09:30·10:30·13:00·15:40·21:30에 수집 예약되며 모든 갱신 기록은 size_breadth_log.csv에 누적됩니다. 출처: 네이버 증권.</p>`;
  box.innerHTML=html;
  const lastD=Object.values(D.markets)[0].buckets[0].trend.at(-1)?.date;let pin=lastD;
  const draw=sd=>{for(const [m,M] of Object.entries(D.markets)){const el=box.querySelector(`[data-mkt="${m}"]`);el.innerHTML=mk(m,M,sd);}};
  draw(pin);
  box.addEventListener('mouseover',e=>{const b=e.target.closest('.sb-col[data-d]');if(b&&b.dataset.d)draw(b.dataset.d);});
  box.addEventListener('mouseleave',()=>draw(pin));
  box.addEventListener('click',e=>{const b=e.target.closest('.sb-col[data-d]');if(b){pin=pin===b.dataset.d?lastD:b.dataset.d;draw(pin);}});
  box.querySelectorAll('.sb-mkt').forEach(el=>el.addEventListener('mouseleave',()=>draw(pin)));}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
