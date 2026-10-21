// 기준일(7/30·10/16) 대비 등락률 페이지 맨 위: 상승·하락 종목군 특징(테마·규모·업종) 자동 집계 + 작성일 기준 분석 메모
(async()=>{
 const meta=document.getElementById('meta');if(!meta)return;
 const box=document.createElement('section');box.className='panel si-box';box.id='insight';meta.after(box);
 const el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n;};
 const pct=v=>v==null||!isFinite(v)?'—':(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(1)+'%';
 const cls=v=>v>0?'si-up':v<0?'si-dn':'';
 const med=a=>{const s=a.filter(x=>x!=null&&isFinite(x)).sort((x,y)=>x-y);if(!s.length)return null;const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
 try{
  const [b,t]=await Promise.all([(new URLSearchParams(location.search).get('tab')==='1016'?'since_base_1016.json':'since_base.json'),'since_themes.json'].map(f=>fetch(f+'?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(f+' HTTP '+r.status);return r.json();})));
  const rows=[];for(const [mk,v] of Object.entries(b.markets||{})){const c=v.columns;for(const r of v.rows){const x={};c.forEach((k,i)=>x[k]=r[i]);x.mkt=mk;if(x.type==='stock'&&x.chg_pct!=null)rows.push(x);}}
  const byName=new Map(rows.map(r=>[r.name,r]));const ix=b.index||{};
  box.append(el('h2',null,'상승·하락 종목군 특징'));
  box.append(el('p','muted',`${b.base_date} 종가 대비 현재가 기준 · 코스피·코스닥 보통주 ${rows.length.toLocaleString()}종목 · 표는 갱신 때마다 자동 재계산`));
  // 1) 테마별
  const th=(t.themes||[]).map(x=>{const f=x.names.map(n=>byName.get(n)).filter(Boolean);const ch=f.map(r=>r.chg_pct);return {name:x.name,n:f.length,med:med(ch),up:f.length?f.filter(r=>r.chg_pct>0).length/f.length*100:null,mdd:med(f.map(r=>r.mdd_pct)),best:[...f].sort((a,c)=>c.chg_pct-a.chg_pct).slice(0,3),worst:[...f].sort((a,c)=>a.chg_pct-c.chg_pct).slice(0,2)};}).filter(x=>x.n>=3).sort((a,c)=>c.med-a.med);
  const top=th.slice(0,3),bot=th.slice(-3).reverse();
  const lead=el('div','si-lead');
  const k1=ix.KOSPI,k2=ix.KOSDAQ;
  lead.append(el('p',null,`지수: 코스피 ${pct(k1?.chg)}, 코스닥 ${pct(k2?.chg)}. 강한 테마는 ${top.map(x=>`${x.name}(${pct(x.med)})`).join(', ')}, 약한 테마는 ${bot.map(x=>`${x.name}(${pct(x.med)})`).join(', ')}입니다.`));
  box.append(lead);
  // 분석 메모
  const NB=(t.notes_by_base||{})[b.base_date],NOTES=NB?NB.notes:(b.base_date==='2026-07-30'?t.notes:[]),NAS=NB?NB.as_of:t.notes_as_of;
  if((NOTES||[]).length){const g=el('div','si-notes');for(const n of NOTES){const c=el('div','si-note');c.append(el('b',null,n.title),el('p',null,n.body));g.append(c);}box.append(g);box.append(el('p','muted si-asof',`분석 메모 작성 기준: ${NAS} (수치는 작성 시점 기준이며, 아래 표는 최신 시세로 자동 갱신됩니다. '분석'은 해석이며 투자 권유가 아닙니다.)`));}
  // 테마 표
  const sec=el('div','si-grid');
  const tw=el('div','si-col');tw.append(el('h3',null,'테마별 등락률 (중앙값 순)'));
  const tb=el('table','kt si-t');tb.innerHTML='<thead><tr><th>테마</th><th>종목</th><th>중앙값</th><th>상승 비율</th><th>고점 대비</th><th>가장 강한 종목</th><th>가장 약한 종목</th></tr></thead>';
  const body=el('tbody');for(const x of th){const tr=el('tr');const c=[[x.name],[String(x.n)],[pct(x.med),cls(x.med)],[x.up==null?'—':Math.round(x.up)+'%'],[pct(x.mdd),'si-dn'],[x.best.slice(0,2).map(r=>`${r.name} ${pct(r.chg_pct)}`).join(', ')],[x.worst.map(r=>`${r.name} ${pct(r.chg_pct)}`).join(', ')]];c.forEach(([v,k],i)=>{const td=el('td',(k||'')+(i>=5?' si-names':''),v);tr.append(td);});body.append(tr);}
  tb.append(body);const wrap=el('div','tw si-tw');wrap.append(tb);tw.append(wrap);
  tw.append(el('p','muted','테마 분류는 since_themes.json의 대표 종목 목록 기준(업종 코드가 아닌 사업 내용 기준)입니다. 고점 대비 = 올해 최고 종가 대비 현재가의 중앙값.'));
  sec.append(tw);
  // 규모별
  const side=el('div','si-col');side.append(el('h3',null,'시장·시가총액별 중앙값'));
  const buckets=[['1조 이상',r=>r.cap_eok>=10000],['1천억~1조',r=>r.cap_eok>=1000&&r.cap_eok<10000],['1천억 미만',r=>(r.cap_eok||0)<1000]];
  const st=el('table','kt si-t');st.innerHTML='<thead><tr><th>구분</th><th>코스피</th><th>코스닥</th></tr></thead>';const sb=el('tbody');
  for(const [lab,f] of buckets){const tr=el('tr');tr.append(el('td',null,lab));for(const mk of ['KOSPI','KOSDAQ']){const s=rows.filter(r=>r.mkt===mk&&f(r));const m=med(s.map(r=>r.chg_pct));tr.append(el('td',cls(m),`${pct(m)} (${s.length})`));}sb.append(tr);}
  const tr0=el('tr');tr0.append(el('td',null,'지수'));for(const mk of ['KOSPI','KOSDAQ'])tr0.append(el('td',cls(ix[mk]?.chg),pct(ix[mk]?.chg)));sb.append(tr0);
  st.append(sb);side.append(st);
  // KIND 업종 상·하위
  const g=new Map();for(const r of rows){if(!r.sector)continue;(g.get(r.sector)||g.set(r.sector,[]).get(r.sector)).push(r);}
  const sl=[...g.entries()].filter(([,v])=>v.length>=8).map(([k,v])=>({k,n:v.length,m:med(v.map(r=>r.chg_pct))})).sort((a,c)=>c.m-a.m);
  const mk=(title,arr)=>{side.append(el('h3',null,title));const t2=el('table','kt si-t');t2.innerHTML='<thead><tr><th>세부 업종(KIND)</th><th>종목</th><th>중앙값</th></tr></thead>';const b2=el('tbody');for(const x of arr){const tr=el('tr');tr.append(el('td',null,x.k),el('td',null,String(x.n)),el('td',cls(x.m),pct(x.m)));b2.append(tr);}t2.append(b2);side.append(t2);};
  mk('세부 업종 상위 5 (8종목 이상)',sl.slice(0,5));mk('세부 업종 하위 5',sl.slice(-5).reverse());
  sec.append(side);box.append(sec);
 }catch(e){box.append(el('p','muted','상승·하락 종목군 특징을 불러오지 못했습니다: '+e.message));console.error(e);}
})();
