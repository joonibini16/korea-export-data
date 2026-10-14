'use strict';
const el=id=>document.getElementById(id), charts={};
let pricesM=new Map(),valCons=[],stockShares=new Map(),fx=new Map(),kindRevenue=[],consensus=new Map(),naverActual=new Map(),breaks=[],backlogCoverage={}, financialCoverage={}, watchMeta={}, watch=[], financial=[], domesticFinancial=[], backlog=[], nationwide=[], regional=[], status={}, hsNames={}, tableRows=[];
const num=v=>v==null||String(v).trim()===''?null:(Number.isFinite(Number(v))?Number(v):null);
const opm=r=>{const revenue=num(r?.revenue_KRW),profit=num(r?.operating_profit_KRW);return revenue>0&&profit!=null?profit/revenue*100:null;};
const pct=v=>v==null?'—':`${v>0?'+':''}${v.toFixed(1)}%`;
const growth=(a,b)=>a==null||b==null||b<=0?null:(a/b-1)*100;
const pearson=(pairs)=>{if(pairs.length<2)return null;const xs=pairs.map(p=>p[0]),ys=pairs.map(p=>p[1]),mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;const nume=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0),dx=Math.sqrt(xs.reduce((s,x)=>s+(x-mx)**2,0)),dy=Math.sqrt(ys.reduce((s,y)=>s+(y-my)**2,0));return dx&&dy?nume/(dx*dy):null;};
const musd=v=>v==null?null:Math.round(v/1e4)/100;
const corrText=(r,n)=>r==null?'상관계수 산출 불가 · 완전분기 '+n+'개 미만 또는 값 변동 없음':`피어슨 상관계수 r = ${r.toFixed(2)} · 완전분기 ${n}개 · 금액 수준 비교`;
const monthId=s=>Number(s.slice(0,4))*12+Number(s.slice(5,7))-1;
const monthLabel=i=>`${Math.floor(i/12)}.${String(i%12+1).padStart(2,'0')}`;
function csv(text){const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);return lines.map(line=>{let out=[],v='',quoted=false;for(let i=0;i<line.length;i++){let c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){v+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(v);v='';}else v+=c;}out.push(v);return out;});}
function records(text){const [heads,...rows]=csv(text);return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(heads.map((h,i)=>[h,r[i]??''])));}
async function read(path,optional=false){const r=await fetch(path+'?v='+Date.now(),{cache:'no-store'});if(optional&&r.status===404)return null;if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.text();}
function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
function chart(id,labels,datasets,yTitle,extra={}){charts[id]?.destroy();const scales={y:{title:{display:true,text:yTitle}},x:{ticks:{maxTicksLimit:16},grid:{display:false}},...(extra.scales||{})};const plugins={legend:{position:'bottom'},...(extra.plugins||{})};charts[id]=new Chart(el(id),{type:'line',data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,spanGaps:false,interaction:{mode:'index',intersect:false},...extra,plugins,scales}});}
function correlationChart(id,pairs,xTitle,yTitle){charts[id]?.destroy();const points=pairs.map(p=>({x:p[0],y:p[1]}));let line=[];if(points.length>=2){const mx=points.reduce((s,p)=>s+p.x,0)/points.length,my=points.reduce((s,p)=>s+p.y,0)/points.length;const denominator=points.reduce((s,p)=>s+(p.x-mx)**2,0);const slope=denominator?points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/denominator:0;const intercept=my-slope*mx;const min=Math.min(...points.map(p=>p.x)),max=Math.max(...points.map(p=>p.x));line=[{x:min,y:slope*min+intercept},{x:max,y:slope*max+intercept}];}charts[id]=new Chart(el(id),{type:'scatter',data:{datasets:[{label:'분기별 관측값',type:'scatter',data:points,backgroundColor:'#2784b8',borderColor:'#2784b8',pointRadius:5,order:1},{label:'선형 추세선',type:'line',data:line,borderColor:'#d97835',borderWidth:3,borderDash:[6,4],pointRadius:0,pointHoverRadius:0,showLine:true,tension:0,fill:false,order:0}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>`수출액 ${Number(ctx.parsed.x).toLocaleString()} USD · 매출 ${Number(ctx.parsed.y).toLocaleString(undefined,{maximumFractionDigits:1})}억원`}}},scales:{x:{type:'linear',title:{display:true,text:xTitle},ticks:{callback:v=>Number(v).toLocaleString()}},y:{title:{display:true,text:yTitle},beginAtZero:true,ticks:{callback:v=>Number(v).toLocaleString()}}}}});}
function series(rows){if(!rows.length)return[];const map=new Map();for(const r of rows){if(map.has(r.month))throw Error('동일 월 중복: '+r.month);map.set(r.month,r.value);}const dates=[...map.keys()].sort();const out=[];for(let i=monthId(dates[0]);i<=monthId(dates.at(-1));i++){const month=monthLabel(i);out.push({month,value:map.get(month)??null});}return out;}
function quarterly(rows){const groups=new Map();for(const r of rows){const q=`${r.month.slice(0,4)}-Q${Math.ceil(Number(r.month.slice(5))/3)}`;if(!groups.has(q))groups.set(q,[]);groups.get(q).push(r);}return [...groups].map(([period,rs])=>{const valid=rs.filter(r=>r.value!=null);return{period,months:valid.length,value:valid.length===3?valid.reduce((s,r)=>s+r.value,0):null,actual:valid.reduce((s,r)=>s+r.value,0),rows:rs};});}
function average(rows,i){if(i<2)return null;const part=rows.slice(i-2,i+1);return part.every(x=>x.value!=null)?part.reduce((s,r)=>s+r.value,0)/3:null;}
function populateCompany(){el('company').replaceChildren();watch.filter(c=>c.category===el('category').value).forEach(c=>option(el('company'),c.id,c.name));populateHS();}
function populateHS(){const c=watch.find(c=>c.id===el('company').value);el('hs').replaceChildren();{const a=allSitesHS(c);if(a)option(el('hs'),a,'업체 전체 · 사업장 합산 (HS '+a.slice(4)+')');}c.hs_codes.forEach(h=>option(el('hs'),h,`${hsNames[h]} · ${h}`));{const q=[...(el('hs').options||[])].find(o=>queryHS(c,o.value));if(q)el('hs').value=q.value;}populateRegions();}
function allSitesHS(c){const qs=c.hs_codes.map(h=>c.regional_hs?c.regional_hs[h]:(h.length===6?h:null)).filter(Boolean),u=[...new Set(qs)];const multi=(c.sites||[]).length>1&&(c.sites||[]).some(s=>s.hs_codes);return u.length===1&&multi?'ALL:'+u[0]:null;}
function natHS(c,h){return h.startsWith('ALL:')?c.hs_codes[0]:h;}
function queryHS(c,h){if(h.startsWith('ALL:'))return h.slice(4);return c.regional_hs?c.regional_hs[h]:(h.length===6?h:null);}
function sites(c,h){return (c.sites||[c]).filter(s=>!h||h.startsWith('ALL:')||!s.hs_codes||s.hs_codes.includes(h));}
function nationalSeries(c,h){return series(nationwide.filter(r=>r['HS코드']===natHS(c,h)).map(r=>({month:r['월'],value:num(r['수출금액_USD'])})));}
// 지역 API가 시도 전체를 비공개(빈 응답)로 돌려준 달이 절반 이상이면 지역 시계열로 추정하지 않고 전국 관리품목으로 대체한다.
function sparseRegional(c,h){const rows=regionRows(c,h),keys=new Set(rows.map(r=>r.sido_code+'|'+r.region));if(keys.size!==1||h.startsWith('ALL:'))return false;const nat=nationalSeries(c,h);if(!nat.length)return false;const real=new Set(rows.filter(r=>(r.amount_unit||'').startsWith('API')||(r.amount_unit||'').startsWith('HS2017')).map(r=>r.month));const exp=nat.filter(r=>r.month>='2020.01').length;return exp>0&&real.size/exp<0.5;}
function regionRows(c,h){const q=queryHS(c,h);return regional.filter(r=>r.hs_code===q&&sites(c,h).some(s=>s.sido_code===r.sido_code&&r.region.includes(s.region_keyword)));}
function comboRows(c,h){const rs=regionRows(c,h),keys=[...new Set(rs.map(r=>r.sido_code+'|'+r.region))],by=new Map();for(const r of rs){if(!by.has(r.month))by.set(r.month,new Map());by.get(r.month).set(r.sido_code+'|'+r.region,num(r.export_amount_raw));}return{keys,rows:[...by].map(([month,m])=>({month,value:keys.every(k=>m.get(k)!=null)?keys.reduce((s,k)=>s+m.get(k),0):null})).sort((a,b)=>a.month.localeCompare(b.month))};}

// 진행 중인 분기의 미수집 월을 같은 분기 확보월의 전년 대비 증감률로 추정합니다.
// 분기 3개월 수출이 모두 확보됐지만 그 분기 매출이 아직 발표 전이면, 확정 수출로 매출을 예상합니다.
function completeQuarter(selected,rv){const valid=selected.filter(r=>r.value!=null);const last=valid.at(-1);if(!last)return null;const y=Number(last.month.slice(0,4)),m=Number(last.month.slice(5));if(m%3!==0)return null;const period=y+'-Q'+(m/3);if(rv&&rv.has(period))return null;const months=[m-2,m-1,m].map(x=>y+'.'+String(x).padStart(2,'0'));const vals=months.map(mm=>valid.find(r=>r.month===mm)?.value);if(vals.some(v=>v==null))return null;const total=vals.reduce((a,b)=>a+b,0);return{period,total,actual:total,have:months,est:[],method:'complete',endMonth:last.month,ratio:1,complete:true};}
function estimateQuarter(selected){const valid=selected.filter(r=>r.value!=null);if(!valid.length)return null;const last=valid.at(-1),y=Number(last.month.slice(0,4)),m=Number(last.month.slice(5)),qn=Math.ceil(m/3),first=(qn-1)*3+1;if(m%3===0)return null;
 const map=new Map(selected.map(r=>[r.month,r.value])),lab=k=>`${y}.${String(k).padStart(2,'0')}`,prev=k=>`${y-1}.${String(k).padStart(2,'0')}`;
 const have=[];for(let k=first;k<=m;k++){const v=map.get(lab(k));if(v==null)return null;have.push(k);}
 const missing=[];for(let k=m+1;k<=first+2;k++)missing.push(k);
 const cur=have.reduce((s,k)=>s+map.get(lab(k)),0),base=have.reduce((s,k)=>s+(map.get(prev(k))??NaN),0);
 let ratio=null,method;const est=[];
 if(Number.isFinite(base)&&base>0&&missing.every(k=>map.get(prev(k))!=null)){ratio=cur/base;method='yoy';missing.forEach(k=>est.push({month:lab(k),value:map.get(prev(k))*ratio}));}
 else{method='avg';missing.forEach(k=>est.push({month:lab(k),value:cur/have.length}));}
 // 방향 점검: 확보월 평균(런레이트)이 직전 분기 월평균보다 높은데 YoY 추정 합계가 직전 분기보다 낮게 나오면(또는 반대),
 // 전년 같은 달의 계절성이 최근 추세와 반대로 작용한 것이므로 확보월 평균으로 대신합니다.
 const prevQ=[0,1,2].map(i=>map.get(lab(first-3+i)));let note='';
 if(method==='yoy'&&prevQ.every(v=>v!=null)){const pq=prevQ.reduce((a,b)=>a+b,0),yoyTotal=cur+est.reduce((a,r)=>a+r.value,0),run=cur/have.length*3;
  if(Math.sign(yoyTotal-pq)!==Math.sign(run-pq)){est.length=0;missing.forEach(k=>est.push({month:lab(k),value:cur/have.length}));method='avg';note='전년 같은 달 계절성이 최근 추세와 반대로 작용해 확보월 평균 적용';}}
 const actual=cur,total=cur+est.reduce((s,r)=>s+r.value,0);
 return{period:`${y}-Q${qn}`,endMonth:lab(first+2),have:have.map(lab),est,actual,total,ratio,method,note};}
// 완전분기 수출액-매출 선형회귀로 매출을 예상하고, 최근 분기를 순차 백테스트해 오차를 함께 보여줍니다.
function linfit(pairs){const n=pairs.length,mx=pairs.reduce((s,p)=>s+p[0],0)/n,my=pairs.reduce((s,p)=>s+p[1],0)/n,sxx=pairs.reduce((s,p)=>s+(p[0]-mx)**2,0);if(!sxx)return null;const b=pairs.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/sxx,a=my-b*mx;const res=pairs.map(p=>p[1]-(a+b*p[0])),sd=Math.sqrt(res.reduce((s,r)=>s+r*r,0)/Math.max(1,n-2));return{a,b,sd};}
function revenueForecast(pairs,x){if(pairs.length<8||x==null)return null;const r=pearson(pairs);const f=linfit(pairs);if(!f)return null;
 const errs=[];for(let i=Math.max(6,pairs.length-4);i<pairs.length;i++){const g=linfit(pairs.slice(0,i));if(g&&pairs[i][1])errs.push(Math.abs((g.a+g.b*pairs[i][0])/pairs[i][1]-1)*100);}
 const mape=errs.length?errs.reduce((s,e)=>s+e,0)/errs.length:null;const xs=pairs.map(p=>p[0]),lo=Math.min(...xs),hi=Math.max(...xs);const extrap=x<lo*0.7||x>hi*1.3;
 const fail=r==null||r<0.5?'상관계수 0.5 미만 (r='+(r??0).toFixed(2)+')':mape!=null&&mape>30?'백테스트 오차 '+mape.toFixed(0)+'%로 신뢰 낮음':extrap?'추정 수출액이 과거 범위를 크게 벗어나 외삽 위험':null;
 return{value:f.a+f.b*x,low:f.a+f.b*x-f.sd,high:f.a+f.b*x+f.sd,r,n:pairs.length,mape,tests:errs.length,fail};}

// 직전 분기 기준 탄력도 모형: 매출(t) = 매출(t-1) × (수출(t)/수출(t-1))^β.
// β는 과거 연속 분기의 로그 변화율로 추정(절편 없음, 0~1.5로 제한). 수출이 늘면 매출 예상도 직전 분기보다 늘고, 줄면 줄어듭니다.
function prevQ1(p){const y=Number(p.slice(0,4)),q=Number(p.slice(-1));return q===1?`${y-1}-Q4`:`${y}-Q${q-1}`;}
function fitBeta(ch){const sxx=ch.reduce((s,c)=>s+c[0]*c[0],0);if(!sxx)return null;return Math.min(1.5,Math.max(0,ch.reduce((s,c)=>s+c[0]*c[1],0)/sxx));}
function revenueForecastQoQ(qv,rv,period,x){if(x==null||!(x>0))return null;let anchor=prevQ1(period),gap=1;while(gap<4&&!(qv.get(anchor)>0&&rv.get(anchor)>0)){anchor=prevQ1(anchor);gap++;}const ae=qv.get(anchor),ar=rv.get(anchor);
 const ch=[...rv.keys()].sort().map(p=>{const pp=prevQ1(p),e1=qv.get(p),e0=qv.get(pp),r1=rv.get(p),r0=rv.get(pp);return e1>0&&e0>0&&r1>0&&r0>0?[Math.log(e1/e0),Math.log(r1/r0),p,r0,e0,e1,r1]:null;}).filter(Boolean);
 const out={n:ch.length,anchor,gap,anchorExp:ae,anchorRev:ar};
 if(!(ae>0&&ar>0)){out.fail='최근 4개 분기 안에 수출·매출이 모두 있는 기준 분기가 없음(매출 공시 미수집)';return out;}
 if(ch.length<8){out.fail='연속 분기 변화 8개 미만';return out;}
 const beta=fitBeta(ch),rc=pearson(ch.map(c=>[c[0],c[1]]));out.beta=beta;out.rc=rc;
 const errs=[];for(let i=Math.max(6,ch.length-4);i<ch.length;i++){const b=fitBeta(ch.slice(0,i));if(b==null)continue;const c=ch[i];errs.push(Math.abs(c[3]*Math.pow(c[5]/c[4],b)/c[6]-1)*100);}
 out.mape=errs.length?errs.reduce((s,e)=>s+e,0)/errs.length:null;out.tests=errs.length;
 const dx=Math.log(x/ae),res=ch.map(c=>c[1]-beta*c[0]),sd=Math.sqrt(res.reduce((s,r)=>s+r*r,0)/Math.max(1,ch.length-1));
 out.dx=dx;out.value=ar*Math.exp(beta*dx);out.low=out.value*Math.exp(-sd);out.high=out.value*Math.exp(sd);
 const maxdx=Math.max(...ch.map(c=>Math.abs(c[0])));
 out.fail=beta<0.05?'수출 변화와 매출 변화의 관계가 약함 (β='+beta.toFixed(2)+')':out.mape!=null&&out.mape>30?'백테스트 오차 '+out.mape.toFixed(0)+'%로 신뢰 낮음':Math.abs(dx)>maxdx*1.5*Math.sqrt(gap)?'직전 분기 대비 수출 변화폭이 과거 범위를 크게 벗어남':null;
 return out;}
function yoyFlag(v){return v!=null&&Math.abs(v)>200?' ⚠ 변동 과다(소규모·단절 가능)':'';}

// 업체 목록용: 기본 보기(사업장 합계 또는 대표 지역)로 진행 분기 추정과 매출 예상을 계산합니다.
// 분기 매출(억원). 연결: 검증 공시 매출 → 네이버 실적 → KIND 보고서 직접 추출 순으로 빈 분기를 채웁니다.
// 연결재무제표가 없는 회사(종속회사 없음)는 별도 매출이 회사 전체이므로 별도 기준을 씁니다.
function fillDomestic(){const dh=new Set(domesticFinancial.map(r=>r.company_id+'|'+r.period));for(const r of kindRevenue){const k=r.company_id+'|'+r.period;if(r.basis!=='별도'||dh.has(k)||!(num(r.revenue_KRW)>0)||(r.currency||'KRW')!=='KRW')continue;dh.add(k);domesticFinancial.push({company_id:r.company_id,period:r.period,domestic_revenue_KRW:r.revenue_KRW,basis:'별도',status:'KIND 정기보고서 별도 · '+(r.method||''),source:r.source,operating_profit_KRW:r.operating_profit_KRW||'',source_secondary:''});}const hasCon=new Set(kindRevenue.filter(r=>r.basis==='연결').map(r=>r.company_id)),fh=new Set(financial.map(r=>r.company_id+'|'+r.period));for(const r of domesticFinancial){const k=r.company_id+'|'+r.period;if(hasCon.has(r.company_id)||fh.has(k)||!(num(r.domestic_revenue_KRW)>0))continue;fh.add(k);financial.push({company_id:r.company_id,period:r.period,revenue_KRW:r.domestic_revenue_KRW,basis:'별도',status:'별도 재무(연결 대상 없음) · '+(r.status||''),source:r.source,operating_profit_KRW:r.operating_profit_KRW||'',source_secondary:''});}}
function revenueMap(c,basis){const kind=b=>kindRevenue.filter(r=>r.company_id===c.id&&r.basis===b&&num(r.revenue_KRW)>0&&(r.currency||'KRW')==='KRW');
 if(basis!=='별도'){const m=new Map(financial.filter(r=>r.company_id===c.id&&num(r.revenue_KRW)!=null).map(r=>[r.period,num(r.revenue_KRW)/1e8]));for(const [k,v] of naverActual){const [id,p]=k.split('|');if(id===c.id&&!m.has(p))m.set(p,v.value);}
  // 회사 실적 파일 값이 같은 분기 KIND 연결 매출과 50% 넘게 다르면(예: SK하이닉스 2022-Q4 9,292억 vs 7.67조) 추출 오류로 보고 KIND 값을 씁니다. 재작성(중단영업 등)에 따른 소폭 차이는 그대로 둡니다.
  for(const r of kind('연결')){const v=num(r.revenue_KRW)/1e8,cur=m.get(r.period);if(cur==null||Math.abs(cur/v-1)>0.5)m.set(r.period,v);}
  // 연결 재무제표를 만들기 전(종속회사 없음) 분기는 별도 매출이 곧 전체 매출이므로 앞쪽에만 이어 붙인다.
  const first=[...m.keys()].sort()[0];if(first)for(const r of kind('별도'))if(r.period<first&&!m.has(r.period))m.set(r.period,num(r.revenue_KRW)/1e8);
  if(m.size>=8||basis==='연결')return m;}
 const m=new Map(domesticFinancial.filter(r=>r.company_id===c.id&&num(r.domestic_revenue_KRW)!=null).map(r=>[r.period,num(r.domestic_revenue_KRW)/1e8]));for(const r of kind('별도'))if(!m.has(r.period))m.set(r.period,num(r.revenue_KRW)/1e8);
 if(basis!=='별도'){for(const [k,v] of naverActual){const [id,p]=k.split('|');if(id===c.id&&!m.has(p))m.set(p,v.value);}}return m;}
function consensusFor(c,period){return consensus.get(c.id+'|'+period)||null;}
function companyOutlook(c){const h=allSitesHS(c)||c.hs_codes.find(x=>queryHS(c,x));if(!h)return{note:'지역 조회 품목 없음'};
 const cr=comboRows(c,h);let sel,natFallback=false;
 if(sparseRegional(c,h)){sel=nationalSeries(c,h);natFallback=true;}
 else if(cr.keys.length>1){sel=series(cr.rows);const all=sel.at(-1)?.month;while(sel.length&&sel.at(-1).value==null)sel.pop();}
 else if(cr.keys.length===1){const [sd,rg]=cr.keys[0].split('|'),q=queryHS(c,h);sel=series(regional.filter(r=>r.hs_code===q&&r.sido_code===sd&&r.region===rg).map(r=>{const b=breaks.find(x=>x.hs_code===r.hs_code&&x.region===r.region&&r.month<=x.excluded_through);return{month:r.month,value:b?null:num(r.export_amount_raw)};}));}
 else return{note:'지역 자료 미확보'};
 if(!sel.length)return{note:'지역 자료 미확보'};
 const quarter=quarterly(sel),qv=new Map(quarter.map(q=>[q.period,q.value])),est=estimateQuarter(sel)||completeQuarter(sel,revenueMap(c));
 const fin=new Map([...revenueMap(c)].map(([k,v])=>[k,v*1e8]));
 const pairs=quarter.filter(q=>q.value!=null&&fin.get(q.period)!=null).map(q=>[q.value,fin.get(q.period)/1e8]);
 const prevQ=p=>`${Number(p.slice(0,4))-1}${p.slice(4)}`;
 const out={est,pairs:pairs.length,r:pairs.length>=3?pearson(pairs):null,natFallback,quarter};
 if(est){out.period=est.period;out.exportYoy=growth(est.total,qv.get(prevQ(est.period)));const fc=revenueForecastQoQ(new Map(quarter.filter(q=>q.value!=null).map(q=>[q.period,q.value])),revenueMap(c),est.period,est.total);out.cons=consensusFor(c,est.period);if(fc&&!fc.fail){out.fc=fc;if(out.cons)out.gap=growth(fc.value,out.cons.value);const pr=fin.get(prevQ(est.period));out.revYoy=pr?growth(fc.value,pr/1e8):null;}else out.note=fc?fc.fail:'자료 부족';}
 else{const lastQ=quarter.filter(q=>q.value!=null).at(-1);out.period=lastQ?.period;out.exportYoy=lastQ?growth(lastQ.value,qv.get(prevQ(lastQ.period))):null;out.note='진행 분기 추정 대상 아님(최신 분기 완결 또는 자료 부족)';}
 return out;}
function populateRegions(){const c=watch.find(c=>c.id===el('company').value),h=el('hs').value;el('region').replaceChildren();const rows=regionRows(c,h),seen=new Set();const names=[...new Set(rows.map(r=>r.sido_code+'|'+r.region))];if(names.length>1)option(el('region'),'combo','사업장 합계 · '+names.map(k=>k.split('|')[1].split(' ').at(-1)).join(' + '));for(const r of rows){const key=r.sido_code+'|'+r.region;if(!seen.has(key)){option(el('region'),key,r.region);seen.add(key);}}if(!seen.size)option(el('region'),'missing',queryHS(c,h)?'대상 지역 데이터 미확보':'HS4 지역 조회 미지원');option(el('region'),'national','전국 · 관리 품목 비교용');if(sparseRegional(c,h))el('region').value='national';render();}

function backlogReview(id){return backlogCoverage.companies?.find(r=>r.company_id===id);}
function backlogStatus(id){const review=backlogReview(id),count=backlog.filter(r=>r.company_id===id&&num(r.value)!=null).length;return (count?'금액 '+count+'개 분기 · ':'')+(review?.label||'공시 확인 필요')+(review?.reviewed_period?' · '+review.reviewed_period:'');}
// ── 재고자산 → 매출 선행성 ─────────────────────────────────────────
// 재고(t)와 매출(t+k)을 비교합니다. k>0이면 재고가 매출보다 k분기 먼저, k<0이면 매출이 먼저 움직인 것입니다.
// 추세·계절성 때문에 금액 수준끼리의 상관은 과장되므로, 전년 동기 대비 증감률(YoY)끼리의 상관을 기준으로 봅니다.
let inventory=[];
const qAdd=(p,k)=>{const i=Number(p.slice(0,4))*4+Number(p.slice(-1))-1+k;return `${Math.floor(i/4)}-Q${i%4+1}`;};
function invMap(c){const all=inventory.filter(r=>r.company_id===c.id&&num(r.inventory_KRW)>0);const basis=all.filter(r=>r.basis==='연결').length>=8?'연결':'별도';
 // 재고 공시 통화를 확인해 원화(억원)와 달러(백만 USD)를 섞지 않습니다. 같은 기준·같은 통화 행만 한 시계열로 씁니다.
 const curOf=r=>r.currency||'KRW',cc=new Map();all.filter(r=>r.basis===basis).forEach(r=>cc.set(curOf(r),(cc.get(curOf(r))||0)+1));const currency=[...cc].sort((a,b)=>b[1]-a[1])[0]?.[0]||'KRW';
 const div=currency==='USD'?1e6:1e8,unit=currency==='USD'?'백만 USD':'억원',rs=all.filter(r=>curOf(r)===currency);
 const vals=rs.filter(r=>r.basis===basis).map(r=>num(r.inventory_KRW)).sort((a,b)=>a-b),med=vals[Math.floor(vals.length/2)]||0;const ok=r=>num(r.inventory_KRW)>=med*0.05&&num(r.inventory_KRW)<=med*20;const map=new Map(rs.filter(r=>r.basis===basis&&ok(r)).map(r=>[r.period,num(r.inventory_KRW)/div]));
 // 연결재무제표를 작성하기 전(종속회사 없음) 기간은 별도 재무제표가 회사 전체이므로 이어 붙입니다.
 let spliced=null;if(map.size){const other=basis==='연결'?'별도':'연결',first=[...map.keys()].sort()[0];const early=rs.filter(r=>r.basis===other&&r.period<first);if(early.length){early.forEach(r=>map.set(r.period,num(r.inventory_KRW)/div));spliced=first;}}
 const raws=[...new Set(rs.map(r=>r.unit_raw).filter(Boolean))];
 return{basis,map,spliced,currency,unit,unitRaw:raws,otherCurrency:all.some(r=>curOf(r)!==currency)};}
function qYoy(m,p){return growth(m.get(p),m.get(qAdd(p,-4)));}
// ── 상관관계 등급: 금액 수준 r은 같은 성장 추세만으로도 높게 나오므로, 추세·계절성을 걷어낸
// 전년동기 증감률(YoY) r과 직전분기 대비 변화의 방향 일치율로 등급을 매긴다.
// 높음: YoY r ≥ 0.6 그리고 방향 일치 ≥ 65% / 보통: YoY r ≥ 0.3 또는 방향 일치 ≥ 60% / 낮음: 그 외 / 표본 부족: 비교 8쌍 미만
function relStats(x,y,lag=0){const ps=[...x.keys()].filter(p=>x.get(p)!=null).sort();
 const lv=ps.map(p=>[x.get(p),y.get(qAdd(p,lag))]).filter(a=>a[0]!=null&&a[1]!=null);
 const yy=ps.map(p=>[growth(x.get(p),x.get(qAdd(p,-4))),growth(y.get(qAdd(p,lag)),y.get(qAdd(p,lag-4)))]).filter(a=>a[0]!=null&&a[1]!=null&&isFinite(a[0])&&isFinite(a[1]));
 const qq=ps.map(p=>{const a=x.get(p),b=x.get(qAdd(p,-1)),c2=y.get(qAdd(p,lag)),d=y.get(qAdd(p,lag-1));return a>0&&b>0&&c2>0&&d>0?[Math.log(a/b),Math.log(c2/d)]:null;}).filter(Boolean);
 const dirN=qq.filter(a=>a[0]!==0&&a[1]!==0);const dir=dirN.length?dirN.filter(a=>Math.sign(a[0])===Math.sign(a[1])).length/dirN.length:null;
 const st={level:{n:lv.length,r:lv.length>=4?pearson(lv):null},yoy:{n:yy.length,r:yy.length>=8?pearson(yy):null},qoq:{n:qq.length,r:qq.length>=8?pearson(qq):null,dir:qq.length>=8?dir:null}};
 const r=st.yoy.r??st.qoq.r,d=st.qoq.dir,qr=st.qoq.r??0;
 st.grade=r==null?'표본 부족':(r>=0.6&&(d==null||d>=0.65))?'높음':((r>=0.3&&(d==null||d>=0.55))||r>=0.6||(d!=null&&d>=0.75&&qr>=0.4))?'보통':r<=-0.4?'역방향':'낮음';
 return st;}
const josa=(w,a,b)=>{const c=w.charCodeAt(w.length-1)-0xAC00;return w+(c>=0&&c<=11171&&c%28?a:b);};
const relFmt=(v,n)=>v==null?`— (${n}쌍)`:`${v.toFixed(2)} (${n}쌍)`;
function relSentence(st,xName,yName){const g=st.grade,d=st.qoq.dir;
 const why=g==='역방향'?`${josa(xName,'이','가')} 늘면 ${josa(yName,'이','가')} 오히려 줄어드는 반대 관계가 뚜렷합니다(예: 재고 누적 = 수요 둔화 신호). 같은 방향 예상치보다 이 반대 신호로 읽는 편이 맞습니다.`:g==='높음'?`${xName} 흐름이 ${josa(yName,'을','를')} 잘 따라갑니다. 예상치를 참고할 만한 편입니다.`:g==='보통'?`방향은 어느 정도 맞지만 크기는 어긋나는 분기가 많습니다. 방향 신호로만 참고하세요.`:g==='표본 부족'?`비교 가능한 분기가 8쌍 미만이라 판단을 보류합니다.`:`${josa(xName,'으로','로')} ${josa(yName,'을','를')} 설명하기 어렵습니다(다른 사업·해외 생산 비중, 지역 통계의 타 업체 포함 등). 예상치는 신뢰하기 어렵습니다.`;
 return `상관관계 ${g} — 전년동기 증감률 r ${relFmt(st.yoy.r,st.yoy.n)} · 직전분기 대비 변화 방향 일치 ${d==null?'—':Math.round(d*100)+'%'} (${st.qoq.n}쌍) · 금액 수준 r ${relFmt(st.level.r,st.level.n)}. ${why}`;}
function relBox(id,st,xName,yName){const b=el(id);if(!b)return;if(!st){b.hidden=true;return;}b.hidden=false;b.className='rel rel-'+(st.grade.startsWith('높음')?'high':st.grade.startsWith('보통')?'mid':st.grade==='역방향'?'rev':st.grade.startsWith('낮음')?'low':'na');b.textContent=relSentence(st,xName,yName);}
function exportRel(c){const o=companyOutlook(c);if(!o.quarter)return null;return relStats(new Map(o.quarter.filter(q=>q.value!=null).map(q=>[q.period,q.value])),revenueMap(c));}
function inventoryRel(c){const s=inventorySummary(c);return s?relStats(s.inv,s.rev,1):null;}
function renderRelTable(){const tb=el('relList');if(!tb)return;const order={'높음':0,'보통':1,'역방향':2,'낮음':3,'표본 부족':4};tb.replaceChildren();
 const rows=watch.map(c=>{let e=null,v=null;try{e=exportRel(c);}catch(_){}try{v=inventoryRel(c);}catch(_){}return{c,e,v};});
 rows.sort((a,b)=>(order[a.e?.grade]??5)-(order[b.e?.grade]??5)||((b.e?.yoy.r??-9)-(a.e?.yoy.r??-9)));
 const gcell=(tr,st)=>{const td=cell(tr,'');if(!st){td.textContent='자료 없음';return;}const b=document.createElement('span');b.className='g g-'+(st.grade.startsWith('높음')?'high':st.grade.startsWith('보통')?'mid':st.grade==='역방향'?'rev':st.grade.startsWith('낮음')?'low':'na');b.textContent=st.grade;td.append(b);};
 const dtxt=st=>st&&st.qoq.dir!=null?Math.round(st.qoq.dir*100)+'% ('+st.qoq.n+')':'—';
 for(const {c,e,v} of rows){const tr=document.createElement('tr');const n=cell(tr,'');n.append(companyButton(c));cell(tr,c.category);gcell(tr,e);cell(tr,e?relFmt(e.yoy.r,e.yoy.n):'—');cell(tr,dtxt(e));gcell(tr,v);cell(tr,v?relFmt(v.yoy.r,v.yoy.n):'—');cell(tr,dtxt(v));tb.append(tr);}
 const cnt=g=>rows.filter(r=>r.e?.grade===g).length,cntv=g=>rows.filter(r=>r.v?.grade===g).length;
 if(el('relSummary'))el('relSummary').textContent=`수출↔매출: 높음 ${cnt('높음')} · 보통 ${cnt('보통')} · 역방향 ${cnt('역방향')} · 낮음 ${cnt('낮음')} · 표본 부족 ${cnt('표본 부족')}개사 / 재고(t)↔다음 분기 매출(t+1): 높음 ${cntv('높음')} · 보통 ${cntv('보통')} · 역방향 ${cntv('역방향')} · 낮음 ${cntv('낮음')} · 표본 부족 ${cntv('표본 부족')}개사`;}
function invLagStats(inv,rev){const out=[];for(let k=-2;k<=3;k++){const pairs=[...inv.keys()].sort().map(p=>[qYoy(inv,p),qYoy(rev,qAdd(p,k))]).filter(x=>x[0]!=null&&x[1]!=null);out.push({k,n:pairs.length,r:pairs.length>=8?pearson(pairs):null});}return out;}
const lagLabel=k=>k>0?`재고 ${k}분기 선행`:k<0?`매출 ${-k}분기 선행`:'동시';
function inventorySummary(c){const {basis,map:inv,spliced,currency,unit,unitRaw,otherCurrency}=invMap(c);if(!inv.size)return null;const rev=revenueMap(c,basis);const stats=invLagStats(inv,rev);const ok=stats.filter(s=>s.r!=null);
 let best=ok.length?ok.reduce((a,b)=>b.r>a.r?b:a):null;if(best&&best.r<0.3)best=null;const lastP=[...inv.keys()].sort().at(-1);
 const days=currency==='KRW'&&rev.get(lastP)?inv.get(lastP)/(rev.get(lastP)/91):null;return{basis,spliced,inv,rev,stats,best,lastP,invYoy:qYoy(inv,lastP),days,lead:stats.find(s=>s.k===1),currency,unit,unitRaw,otherCurrency};}
// 재고 기반 다음 분기 매출 예상 (직전 분기 기준):
// 매출(t+1) = 매출(t) × (재고(t) ÷ 재고(t-1))^β
// β는 과거 「재고 직전분기 대비 변화(t) → 다음 분기 매출의 직전분기 대비 변화(t+1)」로 추정합니다(절편 없음, 0~1.5).
// 그래서 재고가 늘면 예상 매출은 최근 분기 매출보다 늘고, 줄면 줄어듭니다.
function inventoryForecast(s){if(!s)return null;const ps=[...s.inv.keys()].sort();
 const ch=ps.map(p=>{const i0=s.inv.get(qAdd(p,-1)),i1=s.inv.get(p),r0=s.rev.get(p),r1=s.rev.get(qAdd(p,1));return i0>0&&i1>0&&r0>0&&r1>0?{p,x:Math.log(i1/i0),y:Math.log(r1/r0),r0,r1}:null;}).filter(Boolean);
 const p0=ps.at(-1),target=qAdd(p0,1),i0=s.inv.get(qAdd(p0,-1)),i1=s.inv.get(p0),base=s.rev.get(p0),actual=s.rev.get(target)??null;
 const out={target,from:p0,base,actual,n:ch.length};
 if(!(i0>0&&i1>0)){out.fail=qAdd(p0,-1)+'·'+p0+' 재고가 모두 있어야 함';return out;}
 if(!(base>0)){out.fail=p0+' 매출(기준 분기) 없음';return out;}
 if(ch.length<8){out.fail='재고·매출 연속 분기 변화 8쌍 미만';return out;}
 const beta=fitBeta(ch.map(c=>[c.x,c.y])),dx=Math.log(i1/i0);out.beta=beta;out.b=beta;out.x0=(i1/i0-1)*100;out.r=pearson(ch.map(c=>[c.x,c.y]));
 if(beta==null){out.fail='β 추정 불가';return out;}out.weak=beta<0.05;
 const res=ch.map(c=>c.y-beta*c.x),sd=Math.sqrt(res.reduce((a,v)=>a+v*v,0)/Math.max(1,ch.length-1));
 out.value=base*Math.exp(beta*dx);out.low=out.value*Math.exp(-sd);out.high=out.value*Math.exp(sd);out.qoq=(out.value/base-1)*100;
 const ly=s.rev.get(qAdd(target,-4));out.yoy=ly>0?(out.value/ly-1)*100:null;
 const errs=[];for(let i=Math.max(6,ch.length-4);i<ch.length;i++){const b=fitBeta(ch.slice(0,i).map(c=>[c.x,c.y]));if(b!=null){const c=ch[i];errs.push(Math.abs(c.r0*Math.exp(b*c.x)/c.r1-1)*100);}}
 out.mape=errs.length?errs.reduce((a,v)=>a+v,0)/errs.length:null;out.tests=errs.length;
 const maxdx=Math.max(...ch.map(c=>Math.abs(c.x)));out.extrap=Math.abs(dx)>maxdx*1.5;
 out.grade=out.weak?'낮음':(out.r??0)>=0.4&&out.n>=10&&out.mape!=null&&out.mape<=15&&!out.extrap?'높음':out.mape==null||out.mape<=25?'보통':'낮음';
 return out;}
function renderInventory(c){const sec=el('inventoryPanel');if(!sec)return;const s=inventorySummary(c);const ok=s?s.stats.filter(x=>x.r!=null):[];
 el('inventoryTitle').textContent=c.name+' · 재고자산(t) ↔ 다음 분기 매출(t+1)';
 {const s0=inventorySummary(c),u=el('inventoryUnit');if(u){u.textContent=s0?`단위 · 재고자산: ${s0.unit} (${s0.currency==='USD'?'달러':'원화'} 공시${s0.unitRaw.length?', 공시 원단위 '+s0.unitRaw.join('·')+' → '+s0.unit+' 환산':''})${s0.otherCurrency?' · 다른 통화로 공시된 분기는 섞지 않고 제외':''} · 매출: 억원 (원화)${s0.currency!=='KRW'?' · 통화가 달라 재고일수는 계산하지 않고, 예상은 변화율(통화 무관)로만 계산':''}`:'';}}
 relBox('inventoryRel',inventoryRel(c),'재고','다음 분기 매출');
 if(!s){el('inventoryNote').textContent='재고자산 자료를 아직 확보하지 못했습니다.';charts.inventory?.destroy();el('inventoryLags').replaceChildren();return;}
 const ps=[...s.inv.keys()].sort();
 chart('inventory',ps,[
  {type:'bar',label:'재고자산 (분기말, '+s.unit+')',data:ps.map(p=>s.inv.get(p)),backgroundColor:'#c7d9f4',borderColor:'#245bb0',borderWidth:1,yAxisID:'yInv',order:3},
  {label:'다음 분기 매출 (t+1, 억원)',data:ps.map(p=>s.rev.get(qAdd(p,1))??null),borderColor:'#d97835',borderWidth:3,pointRadius:3,spanGaps:true,yAxisID:'yRev',order:1},
  {label:'같은 분기 매출 (t, 참고)',data:ps.map(p=>s.rev.get(p)??null),borderColor:'#d9783566',borderDash:[4,4],borderWidth:1.5,pointRadius:0,spanGaps:true,yAxisID:'yRev',order:2}
 ],s.unit,{scales:{y:{display:false},yInv:{type:'linear',position:'left',title:{display:true,text:'재고자산 ('+s.unit+')'},ticks:{callback:v=>Number(v).toLocaleString()}},yRev:{type:'linear',position:'right',title:{display:true,text:'매출 (억원)'},grid:{drawOnChartArea:false},ticks:{callback:v=>Number(v).toLocaleString()}}},
  plugins:{tooltip:{callbacks:{title:items=>{const p=ps[items[0].dataIndex];return `재고 ${p} · 매출 ${qAdd(p,1)}`;},label:ctx=>`${ctx.dataset.label.replace(/ \([^)]*\)$/,'')}: ${Number(ctx.parsed.y).toLocaleString(undefined,{maximumFractionDigits:1})} ${ctx.dataset.yAxisID==='yInv'?s.unit:'억원'}`}}}});
 const fc=inventoryForecast(s);s.fc=fc;
 if(fc&&fc.value!=null){const k=ps.indexOf(fc.from);const at=v=>ps.map((_,i)=>i===k?v:null);charts.inventory.data.datasets.push({label:'매출 추정 (재고 기반) · '+fc.target,data:at(fc.value),borderColor:'#d97835',pointStyle:'rect',pointRadius:8,pointBackgroundColor:'#ffffff',pointBorderWidth:2,showLine:false,yAxisID:'yRev'});
  const cs=consensusFor(c,fc.target);if(cs)charts.inventory.data.datasets.push({label:'매출 컨센서스 · '+fc.target+' (네이버)',data:at(cs.value),borderColor:'#6b21a8',pointStyle:'crossRot',pointRadius:9,pointBorderWidth:2.5,showLine:false,yAxisID:'yRev'});charts.inventory.update();}
 el('inventoryLags').replaceChildren();for(const st of s.stats){const sp=document.createElement('span');sp.textContent=`${lagLabel(st.k)}: ${st.r==null?'—':st.r.toFixed(2)} (${st.n})`;if(s.best&&st.k===s.best.k)sp.className='best';el('inventoryLags').append(sp);}
 const lead=s.lead;
 {const fc=s.fc,cs=fc&&fc.value!=null?consensusFor(c,fc.target):null;el('inventoryForecast').textContent=!fc?'':fc.value==null?`${fc.target} 매출 예상 미표시: ${fc.fail}`:`${fc.target} 매출 예상 ${Math.round(fc.value).toLocaleString()}억원 (신뢰도 ${fc.grade}) = ${fc.from} 매출 ${Math.round(fc.base).toLocaleString()}억원 × (${fc.from} 재고 직전 분기 대비 ${pct(fc.x0)})^β ${fc.beta.toFixed(2)} → 직전 분기 대비 ${pct(fc.qoq)}${fc.yoy!=null?`, 전년 대비 ${pct(fc.yoy)}`:''} · 범위 ${Math.round(fc.low).toLocaleString()}~${Math.round(fc.high).toLocaleString()}억원 · 분기 변화 ${fc.n}쌍, 변화율 상관 ${fc.r!=null?fc.r.toFixed(2):'—'}${fc.mape!=null?` · 최근 ${fc.tests}개 분기 순차 백테스트 오차 ${fc.mape.toFixed(1)}%`:''}${fc.extrap?' · ⚠ 재고 변화폭이 과거 범위를 크게 벗어남':''}${fc.weak?' · ⚠ 과거에 재고 변화와 다음 분기 매출 변화의 관계가 거의 없어(β≈0) 직전 분기 매출 유지에 가까운 값입니다':''}${cs?` · 컨센서스 ${Math.round(cs.value).toLocaleString()}억원 대비 ${pct(growth(fc.value,cs.value))}`:''}${fc.actual!=null?` · 실제 ${Math.round(fc.actual).toLocaleString()}억원 (예상 오차 ${pct(growth(fc.value,fc.actual))})`:''}`;}
 el('inventoryNote').textContent=`${s.basis} 기준${s.spliced?` (${s.spliced} 이전은 연결재무제표 작성 전이라 별도 기준)`:''} · 최근 ${s.lastP} 재고 ${s.inv.get(s.lastP).toLocaleString(undefined,{maximumFractionDigits:s.inv.get(s.lastP)<100?1:0})}${s.unit==='억원'?'억원':' '+s.unit} (전년 대비 ${pct(s.invYoy)})${s.days!=null?`, 재고일수 약 ${Math.round(s.days)}일(재고 ÷ 분기 매출 × 91)`:''}. `+
  (s.best?`양(+)의 상관이 가장 큰 시차는 「${lagLabel(s.best.k)}」 r=${s.best.r.toFixed(2)} (${s.best.n}분기)입니다. `:ok.length?'어느 시차에서도 뚜렷한 양(+)의 상관(r 0.3 이상)이 없습니다. ':'겹치는 분기가 8개 미만이라 상관계수를 계산하지 않았습니다. ')+
  (lead?.r!=null?(lead.n<10?`재고 1분기 선행 상관 r=${lead.r.toFixed(2)}은 겹친 분기가 ${lead.n}개뿐이라 참고만 하세요.`:lead.r>=0.5?`재고 증가가 다음 분기 매출 증가로 이어진 경향이 있습니다(r=${lead.r.toFixed(2)}). 최근 재고 ${s.invYoy>0?'증가':'감소'}는 다음 분기 매출 ${s.invYoy>0?'증가':'감소'} 쪽 신호입니다.`:lead.r<=-0.5?`재고가 늘면 다음 분기 매출이 줄었던 경향이 있습니다(r=${lead.r.toFixed(2)}) — 재고 증가가 판매 부진의 결과일 가능성을 봐야 합니다.`:`재고와 다음 분기 매출의 관계는 약합니다(r=${lead.r.toFixed(2)}).`):'');}
// 원/달러 월평균 환율(FRED DEXKOUS 일별 평균)로 달러 수출액을 원화(억원)로 환산합니다. 환율이 아직 없는 달은 직전 달 환율을 씁니다.
function fxRate(m){if(fx.has(m))return{rate:fx.get(m).rate,month:m,partial:fx.get(m).status!=='확정'};const prev=[...fx.keys()].filter(k=>k<m).sort().at(-1);return prev?{rate:fx.get(prev).rate,month:prev,fallback:true}:null;}
function renderTrendKrw(selected,quarter,monthly){const box=el('trendKrw');if(!box)return;const note=el('trendKrwNote');
 if(!fx.size||!selected.length){charts.trendKrw?.destroy();delete charts.trendKrw;if(note)note.textContent='환율 자료를 아직 불러오지 못했습니다.';return;}
 const krw=(m,v)=>{const f=fxRate(m);return v==null||!f?null:v*f.rate/1e8;},used=new Set(),fb=new Set();selected.forEach(r=>{const f=fxRate(r.month);if(f?.fallback)fb.add(r.month);else if(f?.partial)used.add(r.month);});
 const mv=selected.map(r=>krw(r.month,r.value));
 if(monthly){const ma=mv.map((_,i)=>{const w=mv.slice(Math.max(0,i-2),i+1).filter(v=>v!=null);return w.length===3?w.reduce((a,b)=>a+b,0)/3:null;});
  chart('trendKrw',selected.map(r=>r.month),[{type:'bar',label:'월별 수출액 (억원)',data:mv,backgroundColor:'#f3c9a6'},{label:'3개월 이동평균 (억원)',data:ma,borderColor:'#c2410c',borderWidth:3,pointRadius:0}],'수출액 (억원)');}
 else{const t=charts.trend?.data?.datasets||[];const a=t[0]?.data||[],e=t[1]?.data||[];const last=[...fx.keys()].sort().at(-1);
  const act=quarter.map((q,i)=>a[i]==null?null:q.rows.filter(r=>r.value!=null).reduce((s,r)=>s+(krw(r.month,r.value)||0),0));
  const est=quarter.map((q,i)=>e[i]==null?null:e[i]*1e6*fx.get(last).rate/1e8);
  chart('trendKrw',quarter.map(q=>q.period),[{type:'bar',label:'확보 수출 (억원)',data:act,backgroundColor:'#c2410c',stack:'sum'},{type:'bar',label:'수출 추정 · 미확보 월 (억원, 최근 환율)',data:est,backgroundColor:'#f3c9a6',stack:'sum'}],'분기 수출액 (억원)');charts.trendKrw.options.scales.x.stacked=true;charts.trendKrw.options.scales.y.stacked=true;charts.trendKrw.update();}
 const i=selected.length-1,lm=selected[i]?.month,prev=lm?monthLabel(monthId(lm)-12):null,pv=selected.find(r=>r.month===prev);
 const yUsd=pv?growth(selected[i].value,pv.value):null,yKrw=pv?growth(krw(lm,selected[i].value),krw(prev,pv.value)):null,fr=fxRate(lm),fp=fxRate(prev);
 if(note)note.textContent=`원화 환산 = 달러 수출액 × 해당 월 원/달러 평균 환율(FRED DEXKOUS 일별 평균) ÷ 1억. 최근 ${lm} 환율 ${fr?fr.rate.toLocaleString(undefined,{maximumFractionDigits:1}):'—'}원${fp?` (전년 같은 달 ${fp.rate.toLocaleString(undefined,{maximumFractionDigits:1})}원 → 환율 ${pct(growth(fr?.rate,fp.rate))}, ${growth(fr?.rate,fp.rate)>0?'원화 약세':'원화 강세'})`:''} · 최근 월 수출 YoY: 달러 ${pct(yUsd)} / 원화 ${pct(yKrw)} — 원화 매출로 잡히는 금액은 환율 효과만큼 달라집니다.${fb.size?` 환율 미발표 월(${[...fb].join('·')})은 직전 달 환율 적용.`:''}${used.size?` 월중 일부 환율만 반영된 달: ${[...used].join('·')}.`:''}`;}
// ── 12개월 Forward PER 밴드 ──
// 월 t의 12M Fwd 이익 = t+1~t+12월에 속한 분기 이익을 월 단위(분기 이익 ÷ 3)로 더한 값. 6월이면 3분기~다음 해 2분기 합.
// 실적 기반: KIND 정기보고서의 분기 지배주주 순이익(연결이 없으면 별도 순이익) = 그 기간에 실제로 낸 이익(사후 확정치).
// 컨센 기반: 그 시점에 저장한 네이버 컨센서스 스냅샷(분기 EPS 우선, 없으면 연간 EPS ÷ 12, 연간 컨센이 없는 다음 연도는 마지막 연간 컨센 수준 가정).
// 주식수: 네이버 연간 실적의 지배순이익 ÷ EPS(최근 확정 연도, 액면분할 반영) → 없으면 시가총액 ÷ 주가.
const qOfMonth=m=>m.slice(0,4)+'-Q'+Math.ceil(Number(m.slice(5,7))/3);
function niQuarterMap(c){const rows=kindRevenue.filter(r=>r.company_id===c.id);const con=rows.filter(r=>r.basis==='연결'),sep=rows.filter(r=>r.basis==='별도');const m=new Map();
 const ctrlOf=r=>num(r.net_income_ctrl_KRW)??num(r.net_income_KRW);con.forEach(r=>{const v=ctrlOf(r);if(v!=null)m.set(r.period,v);});
 const cp=[...m.keys()].sort(),first=cp[0]||'9999',last=cp.at(-1)||'0000';sep.forEach(r=>{const v=num(r.net_income_KRW);if(v!=null&&!m.has(r.period)&&(r.period<first||r.period>last))m.set(r.period,v);});return m;}
function sharesOf(c){const snaps=[...new Set(valCons.filter(r=>r.company_id===c.id).map(r=>r.snapshot_date))].sort();const last=snaps.at(-1);
 const est=valCons.filter(r=>r.company_id===c.id&&r.snapshot_date===last&&r.freq==='annual'&&r.is_estimate==='0').map(r=>{const ni=num(r.ctrl_net_income_100m)??num(r.net_income_100m),e=num(r.eps);return ni&&e?ni*1e8/e:null;}).filter(v=>v>0).sort((a,b)=>a-b);
 return est.length?est.at(-1):(stockShares.get(c.id)||null);}
function fwdActual(nq,t){let s=0;for(let k=1;k<=12;k++){const v=nq.get(qOfMonth(monthLabel(monthId(t)+k)));if(v==null)return null;s+=v/3;}return s;}
function fwdConsensusEps(c,date,t){const rs=valCons.filter(r=>r.company_id===c.id&&r.snapshot_date===date);if(!rs.length)return null;const qe=new Map(rs.filter(r=>r.freq==='quarter'&&num(r.eps)!=null).map(r=>[r.period,num(r.eps)]));const ae=new Map(rs.filter(r=>r.freq==='annual'&&num(r.eps)!=null).map(r=>[r.period,num(r.eps)]));
 const lastY=[...ae.keys()].sort().at(-1);let s=0,assumed=false;for(let k=1;k<=12;k++){const m=monthLabel(monthId(t)+k),q=qOfMonth(m),y=m.slice(0,4);if(qe.has(q)){s+=qe.get(q)/3;continue;}if(ae.has(y)){s+=ae.get(y)/12;continue;}if(lastY){s+=ae.get(lastY)/12;assumed=true;continue;}return null;}return{eps:s,assumed};}
function pctl(arr,p){const a=[...arr].sort((x,y)=>x-y);if(!a.length)return null;const i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return a[lo]+(a[hi]-a[lo])*(i-lo);}
function fperData(c){const px=(pricesM.get(c.id)||[]).filter(r=>r.month>='2020.01'&&r.close>0);if(!px.length)return null;const sh=sharesOf(c),nq=niQuarterMap(c);
 const act=px.map(r=>{const ni=fwdActual(nq,r.month);const eps=ni!=null&&sh?ni/sh:null;return{month:r.month,price:r.close,eps,per:eps>0?r.close/eps:null};});
 const byMonth=new Map();[...new Set(valCons.filter(r=>r.company_id===c.id).map(r=>r.snapshot_date))].sort().forEach(d=>byMonth.set(d.slice(0,7).replace('-','.'),d));
 const cons=px.filter(r=>byMonth.has(r.month)).map(r=>{const d=byMonth.get(r.month),f=fwdConsensusEps(c,d,r.month);return{month:r.month,date:d,price:r.close,eps:f?.eps??null,assumed:f?.assumed,per:f?.eps>0?r.close/f.eps:null};});
 const pa=act.map(x=>x.per).filter(v=>v>0&&v<300),qs=[0.1,0.25,0.5,0.75,0.9],mults=pa.length>=12?qs.map(q=>pctl(pa,q)):null;
 return{px,act,cons,mults,shares:sh,nPer:pa.length};}
// 증권사 리포트식 Fwd PER 밴드: 과거는 확정 분기 순이익, 아직 안 나온 분기는 회계연도 EPS 컨센서스(최신)로 채운 12M Fwd EPS에
// 일정 간격 배수(예: 3·6·9·12·15배)를 곱한 선을 미래(컨센서스가 있는 마지막 해의 전년 12월)까지 그립니다.
async function renderFperBand(c){if(!el('fperBand'))return;if(globalThis.__ctLoad)await globalThis.__ctLoad();
 const px=(pricesM.get(c.id)||[]).filter(r=>r.month>='2020.01'&&r.close>0),sh=sharesOf(c),nq=niQuarterMap(c);
 const cons=new Map();for(const r of (globalThis.__ctRows?globalThis.__ctRows():[]).filter(r=>r.company_id===c.id&&r.freq==='Y'&&r.item==='eps')){const y=r.period.slice(0,4),o=cons.get(y);if(!o||r.date>o.date)cons.set(y,{date:r.date,eps:Number(r.avg)});}
 if(!px.length||!sh){charts.fperBand?.destroy();delete charts.fperBand;el('fperBandNote').textContent='주가·주식수 자료가 없어 밴드를 그릴 수 없습니다.';return;}
 const qEps=q=>{const v=nq.get(q);if(v!=null)return v/sh;const y=q.slice(0,4),ce=cons.get(y);if(!ce)return null;let r=0,n=0;for(let k=1;k<=4;k++){const a=nq.get(`${y}-Q${k}`);if(a!=null){r+=a/sh;n++;}}return n<4?(ce.eps-r)/(4-n):null;};
 const fwd=t=>{let s=0,used=false;for(let k=1;k<=12;k++){const m=monthLabel(monthId(t)+k),q=qOfMonth(m);if(nq.get(q)==null)used=true;const e=qEps(q);if(e==null)return null;s+=e/3;}return{eps:s,est:used};};
 const lastPx=px.at(-1).month,maxFY=Math.max(0,...[...cons.keys()].map(Number)),end=maxFY?`${maxFY-1}.12`:lastPx;
 const months=[];for(let i=monthId(px[0].month);i<=Math.max(monthId(lastPx),monthId(end));i++)months.push(monthLabel(i));
 const pm=new Map(px.map(r=>[r.month,r.close])),F=new Map(months.map(t=>[t,fwd(t)]));
 const hist=months.filter(t=>pm.has(t)&&F.get(t)?.eps>0).map(t=>pm.get(t)/F.get(t).eps).sort((a,b)=>a-b);
 const q=p=>hist.length?hist[Math.min(hist.length-1,Math.floor(p*(hist.length-1)))]:null;
 let lo=q(0.1),hi=q(0.9);if(lo==null){lo=5;hi=20;}const raw=Math.max((hi-lo)/4,0.5),steps=[1,2,2.5,3,4,5,6,8,10,15,20,25,30,40,50],st=steps.find(x=>x>=raw)||raw;
 let base=Math.max(st,Math.round(lo/st)*st);const mults=[0,1,2,3,4].map(i=>+(base+i*st).toFixed(2));
 const pal=['#1d4ed8','#3b82f6','#9ca3af','#bfdbfe','#1e3a8a'];
 const sets=[{label:'주가',data:months.map(t=>pm.get(t)??null),borderColor:'#facc15',backgroundColor:'#facc15',borderWidth:2.6,pointRadius:0,order:0},
  ...mults.map((m,i)=>({label:`${m.toFixed(1)}x`,data:months.map(t=>{const f=F.get(t);return f==null?null:Math.max(0,f.eps*m);}),borderColor:pal[i],backgroundColor:pal[i],borderWidth:2,pointRadius:0,order:1,
   segment:{borderDash:ctx=>F.get(months[ctx.p1DataIndex])?.est?[6,4]:undefined}}))];
 const xl=t=>`'${t.slice(2,4)}.${Number(t.slice(5,7))}`;
 chart('fperBand',months,sets,'(원)',{plugins:{tooltip:{callbacks:{title:x=>x[0].label+(F.get(x[0].label)?.est?' · 컨센서스 포함':' · 확정 실적'),label:x=>`${x.dataset.label}: ${Math.round(x.parsed.y).toLocaleString()}원`}}},scales:{x:{grid:{display:false},ticks:{autoSkip:false,maxRotation:0,callback:function(v){const t=this.getLabelForValue(v);return t.endsWith('.01')?xl(t):'';}}},y:{title:{display:true,text:'(원)'},min:0,ticks:{callback:v=>Number(v).toLocaleString()}}}});
 const cur=F.get(lastPx),curPer=cur?.eps>0?pm.get(lastPx)/cur.eps:null,fy=[...cons.entries()].sort().map(([y,v])=>`${y} ${Math.round(v.eps).toLocaleString()}`).join(' · ');
 el('fperBandNote').textContent=`밴드 배수 ${mults.map(m=>m.toFixed(1)+'x').join(' · ')} (과거 Fwd PER 10~90% 구간 ${lo?.toFixed(1)}~${hi?.toFixed(1)}배를 ${st}배 간격으로). 12M Fwd EPS = 다음 12개월에 속한 분기 EPS 합: 실적이 나온 분기는 확정 지배주주 순이익 ÷ 주식수, 아직 안 나온 분기는 회계연도 EPS 컨센서스(${fy||'없음'}원)에서 이미 나온 분기를 뺀 나머지를 균등 배분. 점선 구간은 컨센서스가 들어간 달이며, 선은 컨센서스가 있는 마지막 해의 전년 12월(${end})까지 그립니다. 적자(EPS<0) 구간은 0으로 표시. 현재(${lastPx}) Fwd PER ${curPer?curPer.toFixed(1)+'배':'—'}. 주식수 ${Math.round(sh).toLocaleString()}주(현재 기준).`;}

function renderFper(c){const sec=el('fperPanel');if(!sec)return;const d=fperData(c);el('fperTitle').textContent=c.name+' · Fwd PER Band Chart';renderFperBand(c);
 const colors=['#94a3b8','#60a5fa','#16a34a','#f59e0b','#dc2626'],names=['하위 10%','25%','중앙값','75%','상위 10%'];
 if(!d){['fperActual','fperCons'].forEach(id=>{charts[id]?.destroy();delete charts[id];});el('fperActualNote').textContent='주가 자료를 아직 불러오지 못했습니다.';el('fperConsNote').textContent='';return;}
 const months=d.px.map(r=>r.month),am=new Map(d.act.map(x=>[x.month,x])),fmt=v=>v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:1});
 const bandSets=(epsOf,mults,dash)=>mults?mults.map((m,i)=>({label:`${names[i]} ${fmt(m)}배`,data:months.map(t=>{const e=epsOf(t);return e>0?e*m:null;}),borderColor:colors[i],borderWidth:1.5,borderDash:dash,pointRadius:0,spanGaps:false})):[];
 const priceSet={label:'월말 주가 (수정주가, 원)',data:months.map(t=>d.px.find(r=>r.month===t).close),borderColor:'#111827',borderWidth:2.5,pointRadius:0};
 const tip={plugins:{tooltip:{callbacks:{label:x=>`${x.dataset.label}: ${Math.round(x.parsed.y).toLocaleString()}원`}}},scales:{y:{title:{display:true,text:'주가 (원)'},ticks:{callback:v=>Number(v).toLocaleString()}}}};
 chart('fperActual',months,[priceSet,...bandSets(t=>am.get(t)?.eps,d.mults,[])],'주가 (원)',tip);
 const lastA=[...d.act].reverse().find(x=>x.per!=null),cur=d.cons.at(-1);
 const rank=v=>v==null||!d.act.length?null:d.act.filter(x=>x.per>0&&x.per<v).length/d.act.filter(x=>x.per>0).length*100;
 el('fperActualNote').textContent=d.mults?`실적 기반(사후 확정): ${d.act.find(x=>x.per)?.month}~${lastA?.month} 월말 주가 ÷ (다음 12개월 실제 지배주주 순이익 ÷ 주식수). 확정 실적이 12개월치 모두 있는 달까지만 계산합니다. FPER 분포 ${d.nPer}개월: 10% ${fmt(d.mults[0])} · 25% ${fmt(d.mults[1])} · 중앙 ${fmt(d.mults[2])} · 75% ${fmt(d.mults[3])} · 90% ${fmt(d.mults[4])}배. 마지막 계산월 ${lastA?.month} FPER ${fmt(lastA?.per)}배. 실제 낸 이익을 미리 안다고 가정한 값이라, 사이클 고점·저점에서는 당시 컨센 기준 FPER과 다릅니다. 주식수 ${d.shares?Math.round(d.shares).toLocaleString():'—'}주(현재 기준, 수정주가와 맞춤 · 유상증자 등 주식수 변화는 반영 안 됨).`:`확정 실적 기반 FPER을 계산할 수 있는 달이 12개월 미만입니다(적자 구간 제외).`;
 const cmap=new Map(d.cons.map(x=>[x.month,x])),c0=d.cons.length?monthLabel(monthId(d.cons[0].month)-11):months[0],cm=months.filter(t=>t>=c0);
 const cband=d.mults?d.mults.map((m,i)=>({label:`${names[i]} ${fmt(m)}배`,data:cm.map(t=>{const e=cmap.get(t)?.eps;return e>0?e*m:null;}),borderColor:colors[i],backgroundColor:colors[i],borderWidth:1.5,borderDash:[5,4],pointRadius:4,pointStyle:'line',spanGaps:true})):[];
 const csets=[{...priceSet,data:cm.map(t=>d.px.find(r=>r.month===t).close)},...cband,{label:'컨센 FPER 기준 시점',data:cm.map(t=>cmap.get(t)?.price??null),borderColor:'#6b21a8',pointStyle:'crossRot',pointRadius:7,pointBorderWidth:2,showLine:false}];
 chart('fperCons',cm,csets,'주가 (원)',tip);
 el('fperConsNote').textContent=cur?`컨센 기반(그 시점 컨센): 매주·매월 저장하는 네이버 컨센서스 스냅샷으로 계산합니다(저장 시작 ${d.cons[0].date}, ${d.cons.length}개월치). 최근 ${cur.date} 12M Fwd EPS ${fmt(cur.eps)}원 → FPER ${fmt(cur.per)}배${rank(cur.per)!=null?` (실적 기반 과거 분포의 하위 ${Math.round(rank(cur.per))}% 위치)`:''}${cur.assumed?' · 다음 연도 연간 컨센이 없어 마지막 연간 컨센 수준을 가정한 달이 포함됨':''}. 점선 밴드는 실적 기반 과거 배수(10~90%)를 그 시점 컨센 EPS에 곱한 가격입니다. 컨센 FPER 자체의 분포는 스냅샷이 12개월 이상 쌓이면 따로 계산합니다.`:'컨센서스 스냅샷이 아직 없습니다.';}
// 업체·지역 수출액을 1~12월 축에 연도별 선으로 비교(올해 굵은 파랑, 작년 하늘색, 그 이전 회색).
function renderTrendYears(selected,title){if(!el('trendYears'))return;const by=new Map();for(const r of selected){if(r.value==null)continue;const y=r.month.slice(0,4),m=Number(r.month.slice(5,7));if(!by.has(y))by.set(y,new Array(12).fill(null));by.get(y)[m-1]=musd(r.value);}
 const years=[...by.keys()].sort().slice(-5),cur=years.at(-1),st=['#1d6fd8','#8ec5f2','#cbd5e1','#94a3b8','#64748b'];
 const sets=years.slice().reverse().map((y,k)=>({label:y+'년',data:by.get(y),borderColor:st[k],backgroundColor:st[k],borderWidth:k===0?3.5:k===1?2.5:1.5,pointRadius:k===0?5:k===1?4:3,pointBackgroundColor:'#0f1a33',pointBorderColor:st[k],pointBorderWidth:2,tension:0,order:k}));
 if(el('trendYearsTitle'))el('trendYearsTitle').textContent=(title||'')+' · 연도별 월 수출액·YoY 비교';
 const ytd=y=>{const a=by.get(y)||[];const n=(by.get(cur)||[]).filter(v=>v!=null).length;const v=a.slice(0,n);return v.every(x=>x!=null)?v.reduce((s,x)=>s+x,0):null;};const prev=years.at(-2);
 if(el('trendYearsNote'))el('trendYearsNote').textContent=cur&&prev?`${cur}년 1~${(by.get(cur)||[]).filter(v=>v!=null).length}월 누적 ${ytd(cur)?.toLocaleString(undefined,{maximumFractionDigits:1})}백만 USD · 전년 같은 기간 ${ytd(prev)?.toLocaleString(undefined,{maximumFractionDigits:1})}백만 USD (${pct(growth(ytd(cur),ytd(prev)))}). 지역 통계에는 같은 지역의 다른 업체 수출도 포함됩니다.`:'';
 const yy=new Map();for(const y of years){const p=by.get(String(Number(y)-1));yy.set(y,by.get(y).map((v,i)=>v!=null&&p&&p[i]>0?Math.round((v/p[i]-1)*1000)/10:null));}
 const ysets=years.slice().reverse().map((y,k)=>({...sets[k],data:yy.get(y)})).filter(d=>d.data.some(v=>v!=null));
 chart('trendYearsYoy',Array.from({length:12},(_,i)=>(i+1)+'월'),ysets,'전년 같은 달 대비 (%)',{interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',align:'end'},tooltip:{callbacks:{label:x=>x.parsed.y==null?'':`${x.dataset.label}: ${x.parsed.y>0?'+':''}${x.parsed.y.toFixed(1)}%`}}},scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>v+'%'},grid:{color:c=>c.tick.value===0?'rgba(226,232,240,0.55)':'rgba(148,163,184,0.14)'}}}});
 chart('trendYears',Array.from({length:12},(_,i)=>(i+1)+'월'),sets,'수출액 (백만 USD)',{interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',align:'end'},tooltip:{callbacks:{label:x=>x.parsed.y==null?'':`${x.dataset.label}: ${x.parsed.y.toLocaleString(undefined,{maximumFractionDigits:1})} 백만 USD`}}},scales:{x:{grid:{display:false}}}});}
function renderInventoryTable(){const box=el('inventoryTable');if(!box)return;box.replaceChildren();
 const rows=watch.map(c=>({c,s:inventorySummary(c)})).filter(x=>x.s).sort((a,b)=>(b.s.lead?.r??-9)-(a.s.lead?.r??-9));
 for(const {c,s} of rows){const tr=document.createElement('tr');const n=cell(tr,'');n.append(companyButton(c));cell(tr,s.basis);{const v=s.inv.get(s.lastP);cell(tr,v==null?'—':v.toLocaleString(undefined,{maximumFractionDigits:v<100?1:0})+' '+s.unit);}
  for(const k of [-1,0,1,2]){const st=s.stats.find(x=>x.k===k);const td=cell(tr,st?.r==null?'—':st.r.toFixed(2));if(st?.r!=null&&Math.abs(st.r)>=0.5)td.style.fontWeight='bold';}
  cell(tr,s.best?lagLabel(s.best.k)+' (r '+s.best.r.toFixed(2)+' · '+s.best.n+'분기)':'—');cell(tr,s.lastP+' '+pct(s.invYoy));cell(tr,s.days!=null?Math.round(s.days)+'일':'—');
  {const fc=inventoryForecast(s),cs=fc&&fc.value!=null?consensusFor(c,fc.target):null;cell(tr,fc&&fc.value!=null?`${fc.target} ${Math.round(fc.value).toLocaleString()}억 (전분기 ${pct(fc.qoq)}${fc.yoy!=null?', 전년 '+pct(fc.yoy):''} · 재고 ${pct(fc.x0)})`:(fc?fc.fail:'—'));cell(tr,fc&&fc.value!=null?fc.grade+(fc.mape!=null?' · 오차 '+fc.mape.toFixed(0)+'%':''):'—');cell(tr,cs?pct(growth(fc.value,cs.value)):'—');}
  const lr=s.lead?.r,ln=s.lead?.n||0;cell(tr,lr==null||s.invYoy==null?'—':ln<10?'표본 부족':lr>=0.5?(s.invYoy>0?'다음 분기 매출 증가 신호':'다음 분기 매출 감소 신호'):lr<=-0.5?(s.invYoy>0?'재고 누적 · 판매 둔화 주의':'재고 소진 · 판매 개선'):'관계 약함');box.append(tr);}
 if(el('inventoryTableNote'))el('inventoryTableNote').textContent=rows.length+'개 업체 · 숫자는 재고 YoY와 매출 YoY의 피어슨 상관계수(겹치는 분기 8개 이상). 해석은 「재고 1분기 선행」 r이 ±0.5 이상이고 겹친 분기가 10개 이상일 때만 표시합니다.';}
// ── 분기 매출 계절성: 가로축 1~4분기, 연도별 선(최근 5년), 올해는 빨간 선 ──
function renderSeasonality(c){if(!el('seasonPanel'))return;const rev=revenueMap(c);const years=[...new Set([...rev.keys()].map(p=>p.slice(0,4)))].sort().slice(-5);
 el('seasonTitle').textContent=c.name+' · 연도별 분기 매출 (계절성)';
 if(!years.length){charts.season?.destroy();el('seasonNote').textContent='분기 매출 자료가 없습니다.';el('seasonRows').replaceChildren();return;}
 const cur=years.at(-1),past=['#1d4ed8','#0f766e','#7c3aed','#94a3b8'],col=y=>y===cur?'#dc2626':past[Math.min(Number(cur)-Number(y)-1,3)];
 const val=(y,q)=>rev.get(`${y}-Q${q}`)??null,labels=['1분기','2분기','3분기','4분기'];
 const sets=years.map(y=>({label:y+(y===cur?' (올해)':''),data:[1,2,3,4].map(q=>val(y,q)),borderColor:col(y),backgroundColor:col(y),borderWidth:y===cur?4:1.8,pointRadius:y===cur?5:2.5,tension:0.15,spanGaps:false,order:y===cur?0:1}));
 // 완결된 연도(4개 분기 모두)의 분기별 비중 평균 → 계절 지수
 const full=years.filter(y=>y!==cur&&[1,2,3,4].every(q=>val(y,q)>0));
 const share=[1,2,3,4].map(q=>full.length?full.reduce((s,y)=>s+val(y,q)/[1,2,3,4].reduce((a,k)=>a+val(y,k),0),0)/full.length*100:null);
 const pastAvg=[1,2,3,4].map(q=>{const v=years.filter(y=>y!==cur).map(y=>val(y,q)).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;});
 sets.push({label:'지난 '+years.filter(y=>y!==cur).length+'년 평균',data:pastAvg,borderColor:'#64748b',borderDash:[6,4],borderWidth:1.5,pointRadius:0,tension:0.15,order:2});
 // 올해 미발표 분기에는 예상치를 표시합니다(다이아몬드 = 수출 기반, 네모 = 재고 기반, X = 컨센서스).
 const nextQ=[1,2,3,4].find(q=>val(cur,q)==null);const marks=[];
 if(nextQ){const tgt=`${cur}-Q${nextQ}`,at=v=>[1,2,3,4].map(q=>q===nextQ?v:null);
  const o=companyOutlook(c);if(o?.fc&&o.period===tgt)sets.push({label:'매출 추정 (수출 기반)',data:at(o.fc.value),borderColor:'#dc2626',pointStyle:'rectRot',pointRadius:8,pointBackgroundColor:'#fff',pointBorderWidth:2,showLine:false}),marks.push(`수출 기반 ${Math.round(o.fc.value).toLocaleString()}억`);
  const sm=inventorySummary(c),f=sm?inventoryForecast(sm):null;if(f?.value!=null&&f.target===tgt)sets.push({label:'매출 추정 (재고 기반)',data:at(f.value),borderColor:'#dc2626',pointStyle:'rect',pointRadius:7,pointBackgroundColor:'#fff',pointBorderWidth:2,showLine:false}),marks.push(`재고 기반 ${Math.round(f.value).toLocaleString()}억`);
  const cs=consensusFor(c,tgt);if(cs)sets.push({label:'매출 컨센서스 (네이버)',data:at(cs.value),borderColor:'#6b21a8',pointStyle:'crossRot',pointRadius:9,pointBorderWidth:2.5,showLine:false}),marks.push(`컨센 ${Math.round(cs.value).toLocaleString()}억`);
  // 계절 패턴만으로 본 기준치: 올해 직전 분기 매출 × (과거 평균 다음 분기/직전 분기 비율)
  if(nextQ>1&&val(cur,nextQ-1)){const ratios=full.map(y=>val(y,nextQ)/val(y,nextQ-1));if(ratios.length){const r=ratios.reduce((a,b)=>a+b,0)/ratios.length;const v=val(cur,nextQ-1)*r;sets.push({label:'계절 패턴 기준',data:at(v),borderColor:'#64748b',pointStyle:'triangle',pointRadius:7,pointBackgroundColor:'#fff',pointBorderWidth:2,showLine:false});marks.push(`계절 패턴 기준 ${Math.round(v).toLocaleString()}억 (과거 ${nextQ}분기/${nextQ-1}분기 평균 ${pct((r-1)*100)})`);}}}
 chart('season',labels,sets,'분기 매출 (억원)',{scales:{y:{beginAtZero:false,title:{display:true,text:'분기 매출 (억원)'},ticks:{callback:v=>Number(v).toLocaleString()}},x:{grid:{display:false}}},plugins:{tooltip:{callbacks:{label:x=>x.parsed.y==null?'':`${x.dataset.label}: ${Math.round(x.parsed.y).toLocaleString()}억원`}}}});
 const peak=share.every(v=>v!=null)?share.indexOf(Math.max(...share))+1:null,low=share.every(v=>v!=null)?share.indexOf(Math.min(...share))+1:null;
 el('seasonNote').textContent=(full.length?`완결 연도 ${full.length}개(${full.join('·')}) 기준 분기 비중: `+share.map((v,i)=>`${i+1}분기 ${v.toFixed(1)}%`).join(' · ')+` → 성수기 ${peak}분기, 비수기 ${low}분기. `:'4개 분기가 모두 있는 지난 연도가 없어 계절 비중을 계산하지 않았습니다. ')+(marks.length?`${cur}년 ${nextQ}분기: `+marks.join(' · '):'');
 const tb=el('seasonRows');tb.replaceChildren();for(const y of [...years].reverse()){const tr=document.createElement('tr');cell(tr,y);let tot=0,n=0;for(const q of [1,2,3,4]){const v=val(y,q),pv=val(String(Number(y)-1),q);cell(tr,v==null?'—':Math.round(v).toLocaleString()+(pv?` (${pct(growth(v,pv))})`:''));if(v!=null){tot+=v;n++;}}cell(tr,n===4?Math.round(tot).toLocaleString():n?Math.round(tot).toLocaleString()+' ('+n+'개 분기)':'—');tb.append(tr);}}
function renderBacklog(c){
 const rows=backlog.filter(r=>r.company_id===c.id&&num(r.value)!=null).sort((a,b)=>a.period.localeCompare(b.period)),review=backlogReview(c.id);
 el('backlogTitle').textContent=c.name+' · 분기 수주잔고';
 el('backlogNote').textContent=(review?.reason||'추가 공시 확인 필요')+(review?.reviewed_period?' · 점검 공시: '+review.reviewed_period:'')+(review?.expected_quarters?' · '+backlogCoverage.start_period+' ~ '+backlogCoverage.end_period+' · '+review.complete_quarters+'/'+review.expected_quarters+'분기 확보':'')+' · 미확인 분기는 0으로 채우지 않습니다. 수주잔고는 기말 잔액으로 분기 매출과 합산하지 않습니다.';
 el('backlogSources').replaceChildren();
 if(review?.source?.startsWith('https://')){const a=document.createElement('a');a.href=review.source;a.textContent='점검 공시 원문';a.target='_blank';a.rel='noopener';el('backlogSources').append(a);}
 el('backlogRows').replaceChildren();
 for(const r of [...rows].reverse()){const tr=document.createElement('tr');[r.period,Number(r.value).toLocaleString(undefined,{maximumFractionDigits:3}),r.unit_label,r.scope||'기존 참고자료 기준',r.notes||r.status].forEach(v=>cell(tr,v));const td=cell(tr,'');if(r.source?.startsWith('https://')){const a=document.createElement('a');a.href=r.source;a.textContent=r.status;a.target='_blank';a.rel='noopener';td.append(a);}el('backlogRows').append(tr);}
 el('backlog').hidden=!rows.length;el('backlogEmpty').hidden=!!rows.length;
 if(!rows.length){if(charts.backlog){charts.backlog.destroy();delete charts.backlog;}el('backlogEmpty').textContent=review?.label||'확인 가능한 수주잔고 금액이 없습니다.';return;}
 // 범위(scope)가 다른 구간은 섞지 않고 색을 달리한 별도 막대로 그립니다. 가장 최근 분기의 범위를 진한 녹색으로, 이전 범위는 다른 색으로 표시합니다.
 const unit=rows.at(-1).unit_label;if(rows.some(r=>r.unit_label!==unit)){throw Error(c.name+' 수주잔고의 단위가 다릅니다.');}
 const qid=p=>Number(p.slice(0,4))*4+Number(p.at(-1))-1,start=qid(backlogCoverage.start_period||rows[0].period),end=qid(backlogCoverage.end_period||rows.at(-1).period),periods=Array.from({length:end-start+1},(_,i)=>Math.floor((start+i)/4)+'-Q'+((start+i)%4+1));
 const main=rows.at(-1).scope,scopes=[main,...new Set(rows.map(r=>r.scope).filter(x=>x!==main))],pal=[['#087f74','#94bdb7'],['#c2410c','#fdba74'],['#6d28d9','#c4b5fd'],['#475569','#cbd5e1']];
 el('backlogTitle').textContent=c.name+' · 분기 수주잔고 ('+unit+')'+(scopes.length>1?' · 집계 범위 '+scopes.length+'개':'');
 const sets=scopes.map((sc,k)=>{const m=new Map(rows.filter(r=>r.scope===sc).map(r=>[r.period,r]));const [col,light]=pal[k%pal.length];return{type:'bar',label:(sc||'수주잔고')+' · '+[...m.keys()].sort()[0]+'~'+[...m.keys()].sort().at(-1)+' · '+unit,data:periods.map(p=>num(m.get(p)?.value)),backgroundColor:periods.map(p=>m.get(p)?.status==='공시 확인'?col:light),borderColor:col,borderWidth:1,maxBarThickness:44,grouped:false,_m:m};});
 chart('backlog',periods,sets,'수주잔고 ('+unit+')',{scales:{y:{beginAtZero:true,title:{display:true,text:'수주잔고 ('+unit+')'},ticks:{callback:v=>Number(v).toLocaleString()}}},plugins:{tooltip:{callbacks:{label:ctx=>ctx.dataset.label.split(' · ')[0]+': '+Number(ctx.parsed.y).toLocaleString()+' '+unit,afterLabel:ctx=>{const r=sets[ctx.datasetIndex]._m.get(periods[ctx.dataIndex]);return [r?.status||'',r?.notes||''];}}}}});
}

function render(){const c=watch.find(c=>c.id===el('company').value),hs=el('hs').value,reg=el('region').value,isNational=reg==='national',query=queryHS(c,hs);let [sido,regionName]=reg.split('|');
 const national=series(nationwide.filter(r=>r['HS코드']===natHS(c,hs)).map(r=>({month:r['월'],value:num(r['수출금액_USD'])})));
 const isCombo=reg==='combo';let breakNote='';
 const cut=rows=>rows.map(r=>{const b=breaks.find(x=>x.hs_code===r.hs_code&&x.region===r.region&&r.month<=x.excluded_through);if(b&&!isCombo){breakNote=b.region+' '+b.excluded_through+' 이전 제외: '+b.reason;return{...r,value:null};}return r;});
 let selected;
 if(isNational)selected=national;
 else if(isCombo){const cr=comboRows(c,hs),keys=cr.keys;selected=series(cr.rows);const allLast=selected.at(-1)?.month;while(selected.length&&selected.at(-1).value==null)selected.pop();if(selected.length&&selected.at(-1).month!==allLast)breakNote='일부 사업장의 '+allLast+'까지 자료가 아직 없어 합계는 '+selected.at(-1).month+'까지 표시합니다. 지역별 최신 값은 지역 선택에서 확인하세요.';regionName=keys.map(k=>k.split('|')[1]).join(' + ');sido=keys[0].split('|')[0];}
 else selected=series(cut(regional.filter(r=>r.hs_code===query&&r.sido_code===sido&&r.region===regionName).map(r=>({month:r.month,hs_code:r.hs_code,region:r.region,value:num(r.export_amount_raw)}))));
 const quarter=quarterly(selected),qm=new Map(quarter.map(r=>[r.period,r]));
 const natFallback=isNational&&sparseRegional(c,hs);const est=isNational&&!natFallback?null:(estimateQuarter(selected)||completeQuarter(selected,revenueMap(c)));
 const fin=financial.filter(r=>r.company_id===c.id).sort((a,b)=>a.period.localeCompare(b)),fm=new Map(fin.map(r=>[r.period,r]));
 const dfin=domesticFinancial.filter(r=>r.company_id===c.id).sort((a,b)=>a.period.localeCompare(b)),dfm=new Map(dfin.map(r=>[r.period,r]));
 const prior=p=>`${Number(p.slice(0,4))-1}${p.slice(4)}`;
 const fy=p=>growth(num(fm.get(p)?.revenue_KRW),num(fm.get(prior(p))?.revenue_KRW));
 const qy=p=>growth(qm.get(p)?.value,qm.get(prior(p))?.value);
 el('scopeNotice').textContent=isNational?'전국 비교: 관리 품목 '+hs+' 데이터입니다. 지역 상위품목 지표와 범위가 다를 수 있습니다.':!query?'HS 4자리 총괄은 이 지역 API에서 조회할 수 없습니다. 관련 세부 관리 품목을 선택하세요.':query!==hs?'관리 HS '+hs+' → 지역 조회 HS '+query+' 상위 품목군 참고지표. 세부 품목 전용 수출이 아닙니다.':'지역 조회 HS '+query+' · 해당 지역 품목군 전체. 개별 업체 수출액이 아닙니다.';
 if(natFallback)el('scopeNotice').textContent='전국 대체: 이 업체 사업장 지역('+sites(c,hs).map(t=>t.region_keyword).join('·')+')의 HS '+(query||hs)+' 통계는 관세청이 비공개(빈 응답)로 처리한 달이 절반 이상이라, 전국 관리품목 '+hs+' 수출로 분기 추정·매출 예상을 계산합니다. 전국 값에는 다른 업체 수출이 포함됩니다.';
 if(isCombo)el('scopeNotice').textContent='사업장 합계: '+regionName+'의 HS '+query+' 지역 수출을 월별로 더한 값입니다. 모든 사업장 값이 있는 달만 계산합니다. 각 지역에는 다른 업체 수출도 포함됩니다.';
 if(breakNote)el('scopeNotice').textContent+=isCombo?' ⚠ '+breakNote:' ⚠ 시계열 단절 구간 제외 — '+breakNote;
 const peers=watch.filter(x=>x.id!==c.id&&x.hs_codes.some(h=>queryHS(x,h)===query&&sites(x,h).some(t=>t.sido_code===sido&&regionName?.includes(t.region_keyword))));el('sharedCandidates').textContent=isNational?'':peers.length?'동일 지역·HS 통계를 공유하는 후보: '+peers.map(x=>x.name).join(', ')+' — 업체별 기여도 분리 불가.':'목록 내 동일 지역·HS 후보가 없더라도 해당 업체의 독점 수출을 뜻하지 않습니다.';
 el('mapping').textContent=`${c.name} (${c.id}) · ${c.region_basis}. ${c.rationale}`;
 el('coverage').textContent=`선택 지역: ${isNational?'전국':reg==='missing'?sites(c,hs).map(t=>t.region_keyword).join(' · '):regionName} | 확보 ${selected.filter(r=>r.value!=null).length}개월 | 수집 확인: ${status.updated_at??'아직 실행 결과 없음'}${status.failures?.length?' | 수집 실패 '+status.failures.length+'구간 · 기존 정상 데이터 유지':''}`;
 const i=selected.length-1,last=selected[i],map=new Map(selected.map(r=>[r.month,r.value]));
 el('yoy').textContent=pct(last?growth(last.value,map.get(monthLabel(monthId(last.month)-12))):null);el('latest').textContent=last?last.month+' · '+(isNational?'전국':regionName):'지역 데이터 미확보';
 el('maYoy').textContent=pct(growth(average(selected,i),average(selected,i-12)));
 const latestFin=[...fin].reverse().find(r=>fy(r.period)!=null)||fin.at(-1);el('revenueYoy').textContent=latestFin?pct(fy(latestFin.period)):'—';el('revenueLatest').textContent=latestFin?(fy(latestFin.period)!=null?latestFin.period+' · '+latestFin.status:latestFin.period+' · 전년동기 공시 미확보'):'공시 미확보';
 const pairs=quarter.map(q=>[qy(q.period),fy(q.period)]).filter(p=>p.every(v=>v!=null));
 const agree=pairs.length?pairs.filter(p=>Math.sign(p[0])===Math.sign(p[1])).length/pairs.length*100:null;
 const confidence=pairs.length>=8?'참고 가능':pairs.length>=3?'초기 신호':'표본 부족';
 el('agreement').textContent=agree==null?'표본 부족':`${agree.toFixed(0)}% · ${confidence}`;
 el('pairs').textContent=`동일 분기 YoY ${pairs.length}쌍 · 3쌍부터 초기 신호, 8쌍부터 참고 가능`;
 el('validation').textContent=pairs.length<3?`${pairs.length}개 비교 분기 확보. 방향 일치율을 표시하기에는 표본이 부족합니다.`:pairs.length<8?`${pairs.length}개 비교 분기의 초기 신호입니다. 방향 일치율은 참고용으로만 표시하며 매출 예측에는 사용하지 않습니다.`:`${pairs.length}개 비교 분기의 과거 동행성 지표입니다. 표본 외 예측 검증 전에는 매출 전망을 산출하지 않습니다.`;
 const base=selected.find(r=>r.value>0)?.value;const scale=v=>v==null||!base?null:v/base*100;
 el('trendTitle').textContent=(isNational?'전국':reg==='missing'?sites(c,hs).map(t=>t.region_keyword).join(' · '):regionName)+' · '+(isNational?hs:query||hs)+' 수출 추세';
 el('trendEmpty').hidden=!!selected.length;el('trendEmpty').textContent='지역 데이터가 아직 확보되지 않았습니다. 수집 상태를 확인하거나 지역 선택에서 전국 비교를 볼 수 있습니다.';
 if(el('frequency').value==='month'){
 el('trendNote').textContent='월별 수출액(백만 USD, 신고 미화금액). 지역 API 금액은 천 USD 단위입니다(수집 지역 합계가 전국 같은 HS6 수출의 95~99%로 일치함을 확인). 월별 변동은 연속 3개월 이동평균으로 함께 확인합니다.';
 chart('trend',selected.map(r=>r.month),[{type:'bar',label:'월별 수출액 (백만 USD)',data:selected.map(r=>musd(r.value)),backgroundColor:'#adc8ef'},{label:'3개월 이동평균 (백만 USD)',data:selected.map((_,i)=>musd(average(selected,i))),borderColor:'#2159a6',borderWidth:3,pointRadius:0}],'수출액 (백만 USD)');
 }else{const sc=musd;const actual=[],estimate=[];quarter.forEach((q,i)=>{const firstMonth=(Number(q.period.at(-1))-1)*3+1;const valid=q.rows.filter(r=>r.value!=null);const can=q.period===quarterly(national).at(-1)?.period&&i===quarter.length-1&&q.months>0&&q.months<3&&valid.every((r,j)=>Number(r.month.slice(5))===firstMonth+j);actual.push(q.months===3||can?sc(q.actual):null);estimate.push(can?sc(est&&est.period===q.period?est.total-est.actual:q.actual/q.months*(3-q.months)):null);});
 el('trendNote').textContent='분기 수출액(백만 USD). 진한색은 확보분, 옅은색은 미확보 월 추정분입니다(확보월의 전년 대비 증감률을 전년 같은 달에 적용, 전년 자료가 없으면 확보월 평균).';
 chart('trend',quarter.map(q=>q.period),[{type:'bar',label:'확보 수출 (백만 USD)',data:actual,backgroundColor:'#245bb0',stack:'sum'},{type:'bar',label:'수출 추정 · 미확보 월 (백만 USD)',data:estimate,backgroundColor:'#c7d9f4',stack:'sum'}],'분기 수출액 (백만 USD)');charts.trend.options.scales.x.stacked=true;charts.trend.options.scales.y.stacked=true;charts.trend.update();}
 renderTrendKrw(selected,quarter,el('frequency').value==='month');
 renderTrendYears(selected,c.name+' · '+(el('trendTitle')?.textContent||'').replace(/ 수출 추세$/,''));
 const periods=[...new Set([...quarter.map(q=>q.period),...fin.map(f=>f.period)])].sort();
 const monthlyMap=new Map(selected.map(r=>[r.month,r.value]));
 const monthlyYoy=p=>growth(monthlyMap.get(p),monthlyMap.get(monthLabel(monthId(p)-12)));
 const monthlyMode=el('frequency').value==='month';
 const comparisonPeriods=monthlyMode?selected.map(r=>r.month):periods;
 chart('comparison',comparisonPeriods,[{label:monthlyMode?'수출 YoY · 월별':'수출 YoY · 완전분기',data:comparisonPeriods.map(monthlyMode?monthlyYoy:qy),borderColor:'#2784b8',pointRadius:3},...(monthlyMode?[{label:'수출 YoY · 월평균(3개월)',data:selected.map((_,i)=>growth(average(selected,i),average(selected,i-12))),borderColor:'#7c3aed',borderDash:[6,4],pointRadius:0,borderWidth:2}]:[]),{label:monthlyMode?'공시 매출 YoY · 분기 자료':'매출 YoY',data:comparisonPeriods.map(monthlyMode?(p=>{const m=Number(p.slice(5,7));return m%3===0?fy(`${p.slice(0,4)}-Q${m/3}`):null;}):fy),borderColor:'#27925c',backgroundColor:'#27925c',pointRadius:5,borderWidth:3,spanGaps:true}],'전년 동기 대비 (%)');
 if(el('comparisonNote'))el('comparisonNote').textContent=monthlyMode?'월별 선택: 수출 YoY는 동일 월 전년 대비(실선), 월평균 YoY는 최근 3개월 월평균 ÷ 전년 같은 3개월 월평균(점선)입니다. 공시 매출 YoY(초록)는 분기 자료라 분기 마지막 달(3·6·9·12월)에 점으로 찍고 선으로 잇습니다. 같은 달의 월평균(3개월) 수출 YoY가 곧 그 분기 수출 YoY라 둘을 바로 비교할 수 있습니다.':'분기별 선택: 수출 YoY와 회사 공시 매출 YoY를 동일 분기 기준으로 비교합니다.';
 const amountPeriods=monthlyMode?selected.map(r=>r.month):quarter.map(q=>q.period);
 const exportAmounts=monthlyMode?selected.map(r=>r.value):quarter.map(q=>q.value);
 const qMap=new Map(quarter.map(q=>[q.period,q.value]));
 const qExport=monthlyMode?amountPeriods.map(p=>Number(p.slice(5))%3===0?(qMap.get(`${p.slice(0,4)}-Q${Number(p.slice(5))/3}`)??null):null):exportAmounts;
 const estMap=new Map((est?.est||[]).map(r=>[r.month,r.value]));
 if(monthlyMode&&est&&!amountPeriods.includes(est.endMonth)){est.est.forEach(r=>{if(!amountPeriods.includes(r.month))amountPeriods.push(r.month);});}
 const estMonthly=monthlyMode&&est?amountPeriods.map(p=>estMap.has(p)&&!est.have.includes(p)?estMap.get(p):null):null;
 const estQuarter=monthlyMode&&est?amountPeriods.map(p=>p===est.endMonth?est.total:null):null;
 const exportSets=monthlyMode?[{label:'지역 수출액 · 분기 합계 (USD)',data:qExport,borderColor:'#2784b8',backgroundColor:'#2784b8',pointRadius:4,borderWidth:3,spanGaps:true,yAxisID:'yExport'},{label:'지역 수출액 · 월별 (USD, 점선)',data:exportAmounts,borderColor:'#2784b8',borderDash:[4,4],borderWidth:1.5,pointRadius:0,spanGaps:false,yAxisID:'yExport'},...(est?[{label:'수출 추정 · 미수집 월 ('+(est.method==='yoy'?'확보월 YoY 적용':'확보월 평균')+')',data:estMonthly,borderColor:'#9bbad3',borderDash:[2,3],borderWidth:1.5,pointRadius:4,pointStyle:'rectRot',pointBackgroundColor:'#ffffff',spanGaps:true,yAxisID:'yExport'},{label:(est.complete?'수출 확정 · ':'수출 추정 · ')+est.period+' 분기 합계',data:estQuarter,borderColor:'#2784b8',pointRadius:8,pointStyle:'rectRot',pointBackgroundColor:'#ffffff',pointBorderWidth:2,showLine:false,yAxisID:'yExport'}]:[])]:[{label:'지역 수출액 · USD',data:exportAmounts,borderColor:'#2784b8',pointRadius:2,yAxisID:'yExport'}];
 const revenueAmounts=monthlyMode?amountPeriods.map(p=>{const q=`${p.slice(0,4)}-Q${Math.ceil(Number(p.slice(5))/3)}`;const v=num(fm.get(q)?.revenue_KRW);return Number(p.slice(5))%3===0&&v!=null?v/1e8:null;}):amountPeriods.map(p=>{const v=num(fm.get(p)?.revenue_KRW);return v==null?null:v/1e8;});
 chart('amountComparison',amountPeriods,[...exportSets,{label:c.name+' 매출액 · 억원',data:revenueAmounts,borderColor:'#d97835',pointRadius:4,borderWidth:3,spanGaps:true,yAxisID:'yRevenue'}],'금액',{spanGaps:true,scales:{y:{display:false},yExport:{type:'linear',position:'left',title:{display:true,text:'수출액 (백만 USD · 신고미화금액)'},ticks:{callback:v=>(v/1e6).toLocaleString(undefined,{maximumFractionDigits:1})}},yRevenue:{type:'linear',position:'right',title:{display:true,text:'회사 매출액 (억원)'},grid:{drawOnChartArea:false},ticks:{callback:v=>Number(v).toLocaleString()}}},plugins:{tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.dataset.yAxisID==='yRevenue'?Number(ctx.parsed.y).toLocaleString(undefined,{maximumFractionDigits:0})+' 억원':(ctx.parsed.y/1e6).toLocaleString(undefined,{maximumFractionDigits:2})+' 백만 USD'}`}}}});
 const revenueCorrPairs=amountPeriods.map((p,i)=>[qExport[i],revenueAmounts[i]]).filter(([x,y])=>x!=null&&y!=null);if(el('amountCorrelationNote'))el('amountCorrelationNote').textContent=corrText(pearson(revenueCorrPairs),revenueCorrPairs.length);relBox('amountRel',relStats(new Map(quarter.filter(q=>q.value!=null).map(q=>[q.period,q.value])),revenueMap(c)),'수출','매출');
 const addForecast=(chartId,rvMap,revLabel,noteId,cons)=>{const ch=charts[chartId];if(!ch)return;let fNote='';
  if(est&&!monthlyMode){if(!ch.data.labels.includes(est.period))ch.data.labels.push(est.period);const k=ch.data.labels.indexOf(est.period);const d=ch.data.labels.map((_,i)=>i===k?est.total:null);ch.data.datasets.splice(1,0,{label:(est.complete?'수출 확정 · ':'수출 추정 · ')+est.period+' 분기 합계',data:d,borderColor:'#2784b8',pointRadius:8,pointStyle:'rectRot',pointBackgroundColor:'#ffffff',pointBorderWidth:2,showLine:false,yAxisID:'yExport'});}
  const fc=est?revenueForecastQoQ(new Map(quarter.filter(q=>q.value!=null).map(q=>[q.period,q.value])),rvMap,est.period,est.total):null;
  if(fc&&!fc.fail){const pos=monthlyMode?est.endMonth:est.period;if(!ch.data.labels.includes(pos))ch.data.labels.push(pos);const k=ch.data.labels.indexOf(pos);
   ch.data.datasets.push({label:revLabel+' 추정 (수출 기반) · '+est.period,data:ch.data.labels.map((_,i)=>i===k?fc.value:null),borderColor:'#d97835',pointRadius:7,pointStyle:'rect',pointBackgroundColor:'#ffffff',pointBorderWidth:2,showLine:false,yAxisID:'yRevenue'});ch.update();
   fNote=` · ${est.period} ${revLabel} 예상 ${Math.round(fc.value).toLocaleString()}억원 = ${fc.anchor} ${revLabel} ${Math.round(fc.anchorRev).toLocaleString()}억원 × (추정 수출 ÷ ${fc.anchor} 수출 = ${pct((Math.exp(fc.dx)-1)*100)})^β ${fc.beta.toFixed(2)} → ${fc.anchor} 대비 ${pct((fc.value/fc.anchorRev-1)*100)}${fc.gap>1?` (직전 분기 매출 미수집으로 ${fc.gap}분기 전 기준)`:''} (±1σ ${Math.round(fc.low).toLocaleString()}~${Math.round(fc.high).toLocaleString()}억원, 분기 변화 ${fc.n}쌍, 변화율 상관 ${fc.rc!=null?fc.rc.toFixed(2):'—'}${fc.mape!=null?`, 최근 ${fc.tests}개 분기 순차 백테스트 평균 오차 ${fc.mape.toFixed(1)}%`:''})`;}
  else if(est)fNote=` · ${revLabel} 예상 미표시: ${fc?fc.fail:'자료 부족'}`;
  if(est&&est.complete)fNote=` · ${est.period} 수출 확정(3개월 모두 확보, 매출 발표 전): 합계 ${musd(est.total).toLocaleString()}백만 USD (흰 네모 = 매출 예상, 보라 X = 컨센서스)`+fNote;
  else if(est)fNote=` · ${est.period} 수출 추정: 확보 ${est.have.join('·')} 합계 ${musd(est.actual).toLocaleString()}백만 USD${est.method==='yoy'?` → 확보월 전년 대비 ${((est.ratio-1)*100).toFixed(1)}%를 미수집 월(${est.est.map(r=>r.month).join('·')}) 전년 값에 적용`:` → ${est.note||'전년 자료가 없어'} 확보월 평균 적용`.replace('적용 확보월 평균 적용','적용')}, 분기 합계 추정 ${musd(est.total).toLocaleString()}백만 USD (흰 다이아몬드 = 수출 추정, 흰 네모 = 매출 예상, 보라 X = 컨센서스)`+fNote;
  if(est&&cons){const pos=monthlyMode?est.endMonth:est.period;if(!ch.data.labels.includes(pos))ch.data.labels.push(pos);const k=ch.data.labels.indexOf(pos);ch.data.datasets.push({label:'매출 컨센서스 · '+est.period+' (네이버)',data:ch.data.labels.map((_,i)=>i===k?cons.value:null),borderColor:'#6b21a8',backgroundColor:'#6b21a8',pointRadius:9,pointStyle:'crossRot',pointBorderWidth:2.5,showLine:false,yAxisID:'yRevenue'});ch.update();
   fNote+=` · 컨센서스 ${Math.round(cons.value).toLocaleString()}억원(네이버, ${cons.date} 기준)${fc&&!fc.fail?` → 수출 기반 예상이 컨센 대비 ${pct(growth(fc.value,cons.value))}`:''}`;}
  el(noteId)&&(el(noteId).textContent=fNote?('추정·예상'+fNote+'. 지역 통계에는 다른 업체 수출이 포함되며, 예상치는 과거 관계가 유지된다는 가정의 참고값입니다.'):'');};
 addForecast('amountComparison',revenueMap(c),'매출','amountForecastNote',consensusFor(c,est?.period||''));
 correlationChart('connectedCorrelation',revenueCorrPairs,'수출액 (USD)','연결매출 (억원)');
 if(el('amountNote'))el('amountNote').textContent=monthlyMode?'굵은 선은 분기 합계 수출액(3개월 모두 확보된 분기, 분기 말월에 표시), 점선은 월별 수출액입니다. 좌측 수출액은 관세청 API 신고미화금액(USD), 우측 매출액은 공시 원화 매출을 억원으로 환산했습니다. 매출선은 확보된 공시 시점을 연결하며 누락 구간은 추정하지 않습니다.':'좌측 수출액은 관세청 API 신고미화금액(USD), 우측 매출액은 공시 원화 매출을 억원으로 환산했습니다. 매출선은 확보된 공시 시점을 연결하며 누락 구간은 추정하지 않습니다.';
 const domesticAmounts=monthlyMode?amountPeriods.map(p=>{const q=`${p.slice(0,4)}-Q${Math.ceil(Number(p.slice(5))/3)}`;const v=num(dfm.get(q)?.domestic_revenue_KRW);return Number(p.slice(5))%3===0&&v!=null?v/1e8:null;}):amountPeriods.map(p=>{const v=num(dfm.get(p)?.domestic_revenue_KRW);return v==null?null:v/1e8;});
 chart('domesticComparison',amountPeriods,[...exportSets,{label:c.name+' 국내법인 별도 매출 · 억원',data:domesticAmounts,borderColor:'#008b87',pointRadius:4,borderWidth:3,spanGaps:true,yAxisID:'yRevenue'}],'금액',{spanGaps:true,scales:{y:{display:false},yExport:{type:'linear',position:'left',title:{display:true,text:'수출액 (백만 USD · 신고미화금액)'},ticks:{callback:v=>(v/1e6).toLocaleString(undefined,{maximumFractionDigits:1})}},yRevenue:{type:'linear',position:'right',title:{display:true,text:'국내법인 별도 매출 (억원)'},grid:{drawOnChartArea:false},ticks:{callback:v=>Number(v).toLocaleString()}}},plugins:{tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.dataset.yAxisID==='yRevenue'?Number(ctx.parsed.y).toLocaleString(undefined,{maximumFractionDigits:0})+' 억원':(ctx.parsed.y/1e6).toLocaleString(undefined,{maximumFractionDigits:2})+' 백만 USD'}`}}}});
 const domesticCorrPairs=amountPeriods.map((p,i)=>[qExport[i],domesticAmounts[i]]).filter(([x,y])=>x!=null&&y!=null);
 addForecast('domesticComparison',new Map(dfin.filter(r=>num(r.domestic_revenue_KRW)!=null).map(r=>[r.period,num(r.domestic_revenue_KRW)/1e8])),'국내법인 별도 매출','domesticForecastNote');if(el('domesticCorrelationNote'))el('domesticCorrelationNote').textContent=corrText(pearson(domesticCorrPairs),domesticCorrPairs.length);
 correlationChart('standaloneCorrelation',domesticCorrPairs,'수출액 (USD)','별도매출 (억원)');
 if(el('domesticAmountNote'))el('domesticAmountNote').textContent=domesticAmounts.some(v=>v!=null)?'국내법인 별도재무제표 기준 매출. 2020년 이후 확인된 분기 공시값을 표시하며, 설립 전·미확인 분기는 공란으로 유지합니다. 연결매출과 혼용하지 않습니다.':'국내법인 별도재무제표 기준. 확인된 별도 공시값이 없어 선은 공란으로 유지됩니다. 연결매출과 혼용하지 않습니다.';
 const nrows=nationwide.filter(r=>r['HS코드']===natHS(c,hs)).sort((a,b)=>a['월'].localeCompare(b['월']));
 chart('price',nrows.map(r=>r['월']),[{label:'전국 USD/KG',data:nrows.map(r=>{const w=num(r['수출중량_KG']),v=num(r['수출금액_USD']);return w>0&&v!=null?v/w:null;}),borderColor:'#b47737',pointRadius:0}],'USD/KG');
 {// 전국 수출단가 YoY를 1~12월 축에 연도별 선으로(올해 굵은 파랑, 작년 하늘색, 그 이전 회색)
  const pm=new Map(nrows.map(r=>{const w=num(r['수출중량_KG']),v=num(r['수출금액_USD']);return [r['월'],w>0&&v!=null?v/w:null];}));const by=new Map();
  for(const [m,v] of pm){const y=m.slice(0,4),k=Number(m.slice(5,7))-1,p=pm.get((Number(y)-1)+m.slice(4));if(!by.has(y))by.set(y,new Array(12).fill(null));by.get(y)[k]=v!=null&&p>0?Math.round((v/p-1)*1000)/10:null;}
  const years=[...by.keys()].filter(y=>by.get(y).some(v=>v!=null)).sort().slice(-5),st=['#1d6fd8','#8ec5f2','#cbd5e1','#94a3b8','#64748b'];
  const sets=years.slice().reverse().map((y,k)=>({label:y+'년',data:by.get(y),borderColor:st[k],backgroundColor:st[k],borderWidth:k===0?3.5:k===1?2.5:1.5,pointRadius:k===0?5:k===1?4:3,pointBackgroundColor:'#0f1a33',pointBorderColor:st[k],pointBorderWidth:2,tension:0,order:k}));
  if(el('priceYoyTitle'))el('priceYoyTitle').textContent='수출단가 연도별 YoY · '+natHS(c,hs);
  chart('priceYoy',Array.from({length:12},(_,i)=>(i+1)+'월'),sets,'전년 같은 달 대비 (%)',{interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',align:'end'},tooltip:{callbacks:{label:x=>x.parsed.y==null?'':`${x.dataset.label}: ${x.parsed.y>0?'+':''}${x.parsed.y.toFixed(1)}%`}}},scales:{x:{grid:{display:false}},y:{ticks:{callback:v=>v+'%'},grid:{color:g=>g.tick.value===0?'rgba(226,232,240,0.55)':'rgba(148,163,184,0.14)'}}}});}
 const earningsPeriods=[];const qi=p=>Number(p.slice(0,4))*4+Number(p.at(-1))-1;
 const rangeStart=financialCoverage.start_period||fin[0]?.period,rangeEnd=financialCoverage.end_period||fin.at(-1)?.period;
 if(rangeStart&&rangeEnd)for(let q=qi(rangeStart);q<=qi(rangeEnd);q++)earningsPeriods.push(Math.floor(q/4)+'-Q'+(q%4+1));
 const notApplicable=financialCoverage.companies?.find(r=>r.company_id===c.id)?.not_applicable_periods||[];
 const earningsMissing=earningsPeriods.filter(p=>!notApplicable.includes(p)).filter(p=>num(fm.get(p)?.revenue_KRW)==null||opm(fm.get(p))==null);
 el('earningsTitle').textContent=c.name+' · 분기 매출·OPM';
 el('earningsNote').textContent=(rangeStart?rangeStart+' ~ '+rangeEnd+' · ':'')+'연결 분기 실적 · '+(earningsPeriods.length-notApplicable.length-earningsMissing.length)+'/'+(earningsPeriods.length-notApplicable.length)+'분기 확보 · '+(earningsMissing.length?'미확보: '+earningsMissing.join(', '):'누락 없음')+(notApplicable.length?' · 공시 회계기간 시작 전: '+notApplicable.join(', '):'')+'. OPM = 영업이익 ÷ 매출 × 100. 4분기는 연간−3분기 누적으로 산출하며 아래 표에 두 공시 원문을 표시합니다.';
 chart('revenue',earningsPeriods,[{type:'bar',label:'매출액 (좌 · 억원)',data:earningsPeriods.map(p=>{const v=num(fm.get(p)?.revenue_KRW);return v==null?null:v/1e8;}),backgroundColor:'#b7bdc4',yAxisID:'y',order:1,maxBarThickness:46},{type:'line',label:'OPM (우 · %)',data:earningsPeriods.map(p=>opm(fm.get(p))),borderColor:'#008b87',backgroundColor:'#008b87',borderWidth:3,pointRadius:4,yAxisID:'yOPM',order:0,spanGaps:false}],'매출액 (억원)',{scales:{y:{type:'linear',position:'left',beginAtZero:true,title:{display:true,text:'매출액 (억원)'}},yOPM:{type:'linear',position:'right',title:{display:true,text:'OPM (%)'},grid:{drawOnChartArea:false},ticks:{callback:v=>v+'%'}}},plugins:{tooltip:{callbacks:{label:ctx=>ctx.dataset.yAxisID==='yOPM'?'OPM: '+ctx.parsed.y.toFixed(2)+'%':'매출액: '+ctx.parsed.y.toLocaleString(undefined,{maximumFractionDigits:1})+'억원'}}}});
 renderBacklog(c);renderInventory(c);renderSeasonality(c);renderFper(c);if(globalThis.renderConsTrend)globalThis.renderConsTrend(c);if(globalThis.renderPerCards)globalThis.renderPerCards(c);if(globalThis.renderVerdict)globalThis.renderVerdict(c);if(globalThis.renderSegments)globalThis.renderSegments(c);

 tableRows=periods.map(p=>({period:p,months:qm.get(p)?.months??0,export_yoy:qy(p),revenue_KRW:num(fm.get(p)?.revenue_KRW),revenue_yoy:fy(p),operating_profit_KRW:num(fm.get(p)?.operating_profit_KRW),opm_pct:opm(fm.get(p)),source:fm.get(p)?.source??'',source_secondary:fm.get(p)?.source_secondary??'',status:fm.get(p)?.status??''}));
 el('rows').replaceChildren();[...tableRows].reverse().forEach(r=>{const tr=document.createElement('tr');[r.period,r.months+'/3',pct(r.export_yoy),r.revenue_KRW==null?'—':(r.revenue_KRW/1e8).toLocaleString(undefined,{maximumFractionDigits:1}),pct(r.revenue_yoy),r.operating_profit_KRW==null?'—':(r.operating_profit_KRW/1e8).toLocaleString(undefined,{maximumFractionDigits:1}),pct(r.opm_pct)].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});const td=document.createElement('td');if(r.source.startsWith('https://')){const a=document.createElement('a');a.href=r.source;a.textContent=r.status;a.target='_blank';a.rel='noopener';td.append(a);}if(r.source_secondary?.startsWith('https://')){const a=document.createElement('a');a.href=r.source_secondary;a.textContent=' · 3분기 누적 원문';a.target='_blank';a.rel='noopener';td.append(a);}tr.append(td);el('rows').append(tr);});
 el('sources').replaceChildren();c.sources.forEach((url,i)=>{const a=document.createElement('a');a.href=url;a.textContent=`선정 근거 ${i+1} `;a.target='_blank';a.rel='noopener';el('sources').append(a);});
}
el('download').onclick=()=>{const h=['period','months','export_yoy','revenue_KRW','revenue_yoy','operating_profit_KRW','opm_pct','source','source_secondary','status'];const data='\uFEFF'+[['company_id','managed_hs','query_hs','region',...h].join(','),...tableRows.map(r=>[el('company').value,el('hs').value,queryHS(watch.find(c=>c.id===el('company').value),el('hs').value)||'',el('region').value,...h.map(k=>r[k]??'')].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`company-${el('company').value}-${el('hs').value}-comparison.csv`;a.click();URL.revokeObjectURL(url);};
function cell(tr,text){const td=document.createElement('td');td.textContent=text;tr.append(td);return td;}
function choose(c,h){el('category').value=c.category;populateCompany();el('company').value=c.id;populateHS();if(h){el('hs').value=h;populateRegions();}el('company').scrollIntoView({behavior:'smooth',block:'center'});}
function companyButton(c,h){const b=document.createElement('button');b.textContent=c.name;b.onclick=()=>choose(c,h);return b;}
let surpriseRows=[];
function renderSurprise(){const box=el('surpriseList');if(!box)return;box.replaceChildren();const rows=surpriseRows.filter(x=>x.o.fc&&x.o.gap!=null).sort((a,b)=>Math.abs(b.o.gap)-Math.abs(a.o.gap));for(const {c,o,cs} of rows){const tr=document.createElement('tr');const n=cell(tr,'');n.append(companyButton(c));cell(tr,o.period);cell(tr,Math.round(o.fc.value).toLocaleString()+'억원');cell(tr,Math.round(cs.value).toLocaleString()+'억원');const g=cell(tr,pct(o.gap));g.style.color=o.gap>0?'#c0392b':'#1f5fbf';g.style.fontWeight='bold';cell(tr,(o.fc.mape!=null?o.fc.mape.toFixed(0)+'%':'—'));cell(tr,o.fc.mape!=null&&Math.abs(o.gap)>o.fc.mape?'오차 범위 밖 · 주목':'오차 범위 안');box.append(tr);}if(el('surpriseNote'))el('surpriseNote').textContent=rows.length?rows.length+'개 업체 · 괴리 = 수출 기반 매출 예상 ÷ 네이버 컨센서스 − 1. 괴리가 백테스트 오차보다 크면 「주목」으로 표시합니다.':'비교 가능한 업체가 없습니다.';}
function renderUniverse(){surpriseRows=[];if(!el('companyList'))return;const term=(el('companySearch')?.value||'').trim().toLowerCase(),cat=el('industryFilter')?.value||'';el('companyList').replaceChildren();const filtered=watch.filter(c=>(!cat||c.category===cat)&&[c.name,c.id,c.category,...sites(c).map(s=>s.region_keyword),...c.hs_codes,...c.hs_codes.map(h=>hsNames[h])].join(' ').toLowerCase().includes(term));for(const c of filtered){const tr=document.createElement('tr');cell(tr,c.category);const name=cell(tr,'');name.append(companyButton(c));const id=document.createElement('small');id.textContent=c.id==='LS-CABLE'?'비상장 제조사':c.id;name.append(id);cell(tr,[...new Set(sites(c).map(s=>s.region_keyword))].join(' · '));cell(tr,c.hs_codes.map(h=>hsNames[h]+' ('+h+')').join(' / '));const logical=allSitesHS(c)||c.hs_codes.find(h=>queryHS(c,h)),q=logical?queryHS(c,logical):null;const site=logical?sites(c,logical)[0]:null;const rs=site?regionRows(c,logical).filter(r=>r.sido_code===site.sido_code&&r.region.includes(site.region_keyword)).sort((a,b)=>a.month.localeCompare(b.month)):[];const regions=[...new Set(rs.map(r=>r.region))];const last=regions.length===1?rs.at(-1):null,prev=last?rs.find(r=>r.month===monthLabel(monthId(last.month)-12)):null;const combo=logical?comboRows(c,logical):null;if(combo&&combo.keys.length>1){const cr=combo.rows.filter(r=>r.value!=null),cl=cr.at(-1),cp=cl?combo.rows.find(r=>r.month===monthLabel(monthId(cl.month)-12)):null;cell(tr,cl?pct(growth(cl.value,cp?.value))+' · '+cl.month+' · 사업장 합계('+combo.keys.map(k=>k.split('|')[1].split(' ').at(-1)).join('+')+') · HS'+q:'사업장 합계 미확보');}else cell(tr,last?pct(growth(num(last.export_amount_raw),num(prev?.export_amount_raw)))+' · '+last.month+' · '+last.region+' · HS'+q:'미확보 / 대표지역 단일 시계열 확인 필요');const count=new Set(c.hs_codes.flatMap(h=>regionRows(c,h).map(r=>[r.month,r.hs_code,r.sido_code,r.region].join('|')))).size;cell(tr,(c.hs_codes.some(h=>h.length===10)?'HS6 상위 품목군 포함':'HS6 품목군')+' · '+count+'행');const coverage=financialCoverage.companies?.find(r=>r.company_id===c.id);cell(tr,coverage?coverage.complete_quarters+'/'+coverage.expected_quarters+'분기 · '+(coverage.status==='complete'?'누락 없음':coverage.status==='not_collected'?'실적 미확보':'누락 '+coverage.missing_periods.join(', ')):'실적 범위 미확인');cell(tr,backlogStatus(c.id));{const o=companyOutlook(c);cell(tr,o.period?(o.natFallback?'[전국 대체] ':'')+(o.est?o.period+(o.est.complete?' 확정(매출 발표 전) ':' 추정 '):o.period+' 확정 ')+pct(o.exportYoy)+yoyFlag(o.exportYoy):(o.note||'—'));cell(tr,o.fc?Math.round(o.fc.value).toLocaleString()+'억원 ('+(o.fc.gap>1?o.fc.anchor+' 대비 ':'전분기 ')+pct((o.fc.value/o.fc.anchorRev-1)*100)+(o.revYoy!=null?', 전년 '+pct(o.revYoy):'')+') · 수출 '+(o.fc.gap>1?o.fc.anchor+' 대비 ':'전분기 ')+pct((Math.exp(o.fc.dx)-1)*100)+' · β '+o.fc.beta.toFixed(2)+' · 오차 '+(o.fc.mape!=null?o.fc.mape.toFixed(0)+'%':'—'):(o.note||'—'));const cs=o.period?consensusFor(c,o.period):null;cell(tr,cs?Math.round(cs.value).toLocaleString()+'억원'+(o.gap!=null?' · 예상 '+pct(o.gap):''):'—');surpriseRows.push({c,o,cs});}const td=cell(tr,'');const link=document.createElement('a');link.href=c.sources[0];link.textContent='공식 근거';link.target='_blank';link.rel='noopener';td.append(link);el('companyList').append(tr);}if(el('listCount'))el('listCount').textContent=filtered.length+' / '+watch.length+'개 업체 표시 · YoY는 표에 적힌 지역·품목군 값이며, 사업장이 여러 지역이면 사업장 합계입니다.';renderSurprise();renderInventoryTable();renderRelTable();}
function renderCoverage(){if(!el('hsCoverage'))return;el('hsCoverage').replaceChildren();for(const [h,name] of Object.entries(hsNames)){const tr=document.createElement('tr');cell(tr,name+' · '+h);const cs=watch.filter(c=>c.hs_codes.includes(h));cell(tr,h.length===4?'직접 조회 미지원':h.slice(0,6)+(h.length===10?' · 상위 품목군':''));const td=cell(tr,'');cs.forEach(c=>{td.append(companyButton(c,h),document.createTextNode(' '));});if(!cs.length)td.textContent='확인된 연결 없음';cell(tr,watchMeta.unmapped_notes?.[h]||(h.length===4?'총괄을 임의의 세부 코드로 대체하지 않습니다.':h.startsWith('300249')||h.startsWith('854143')?'2020~2021년은 HS2017 선행 코드(300290·854140, 범위가 더 넓음)로 연결한 참고 구간입니다.':h.length===10?'제품·생산지역 근거로 연결한 후보. 개별 수출 신고코드·점유율 미확인.':'제품·생산지역 근거로 연결한 후보. 지역 통계에는 타 업체가 포함됩니다.'));el('hsCoverage').append(tr);}}
async function init(){try{const pr=await read('stock_prices_monthly.csv',true);pricesM=new Map();for(const r of (pr?records(pr):[])){if(!pricesM.has(r.company_id))pricesM.set(r.company_id,[]);pricesM.get(r.company_id).push({month:r.month,date:r.date,close:num(r.close)});}const vc=await read('valuation_consensus.csv',true);valCons=vc?records(vc):[];const ss=await read('stock_shares.csv',true);stockShares=new Map((ss?records(ss):[]).map(r=>[r.company_id,num(r.shares)]));}catch(e){}try{const fr=await read('fx_krw_usd.csv',true);fx=new Map((fr?records(fr):[]).map(r=>[r.month,{rate:num(r.krw_per_usd),status:r.status}]).filter(x=>x[1].rate>0));}catch(e){fx=new Map();}try{const kr=await read('company_revenue_kind.csv',true);kindRevenue=kr?records(kr):[];}catch(e){kindRevenue=[];}try{const it=await read('company_inventory.csv',true);inventory=it?records(it):[];}catch(e){inventory=[];}try{const ct=await read('naver_consensus.csv',true);if(ct){const latest=new Map();for(const r of records(ct)){const k=r.company_id+'|'+r.period;const o=latest.get(k);if(!o||r.snapshot_date>o.snapshot_date)latest.set(k,r);}for(const [k,r] of latest){const v=num(r.revenue_100m);if(v==null)continue;(r.is_estimate==='1'?consensus:naverActual).set(k,{value:v,op:num(r.operating_profit_100m),date:r.snapshot_date,source:r.source});}}}catch(e){}try{const bt=await read('regional_breaks.json',true);breaks=bt?JSON.parse(bt).breaks||[]:[];}catch(e){breaks=[];}const [w,h,n,r,s,f,fc,b,bc]=await Promise.all([read('company_watchlist.json'),read('hs_codes.csv'),read('summary_all.csv'),read('regional_exports.csv',true),read('regional_status.json',true),read('company_financials.csv'),read('company_financial_coverage.json',true),read('company_backlog.csv',true),read('company_backlog_coverage.json',true)]);watchMeta=JSON.parse(w);watch=watchMeta.companies;hsNames=Object.fromEntries(csv(h).slice(1).map(r=>[r[0],r.slice(1).join(',')]));if(watch.some(c=>c.hs_codes.some(h=>!hsNames[h])))throw Error('관심업체 HS코드가 hs_codes.csv에 없습니다.');nationwide=records(n);regional=r?records(r).map(x=>({...x,export_amount_raw:x.export_amount_raw===''?'':String(Number(x.export_amount_raw)*1000)})):[];status=s?JSON.parse(s):{};financial=records(f);{const kv=new Map(kindRevenue.filter(r=>r.basis==='연결').map(r=>[r.company_id+'|'+r.period,num(r.revenue_KRW)]));for(const r of financial){const v=kv.get(r.company_id+'|'+r.period),cur=num(r.revenue_KRW);if(v>0&&cur>0&&Math.abs(cur/v-1)>0.5){r.revenue_KRW=String(v);r.status=(r.status||'')+' · KIND 연결 매출로 교정';}}}{// 회사 실적 파일에 빠진 분기는 KIND 정기보고서에서 직접 읽은 매출·영업이익으로 채웁니다(연결 우선, 연결 작성 전·연결 없는 회사는 별도 = 회사 전체).
 const have=new Set(financial.map(r=>r.company_id+'|'+r.period)),byC=new Map();for(const r of kindRevenue){if(!(num(r.revenue_KRW)>0)||(r.currency||'KRW')!=='KRW')continue;if(!byC.has(r.company_id))byC.set(r.company_id,{c:[],s:[]});byC.get(r.company_id)[r.basis==='연결'?'c':'s'].push(r);}
 const add=(r,label)=>{const k=r.company_id+'|'+r.period;if(have.has(k))return;have.add(k);financial.push({company_id:r.company_id,period:r.period,revenue_KRW:r.revenue_KRW,basis:r.basis,status:'KIND 정기보고서 '+label+' · '+(r.method||''),source:r.source,operating_profit_KRW:r.operating_profit_KRW||'',source_secondary:''});};
 for(const [id,{c,s}] of byC){c.forEach(r=>add(r,'연결'));const cp=c.map(r=>r.period).sort(),first=cp[0]||'9999',last=cp.at(-1)||'0000';s.filter(r=>r.period<first||r.period>last).forEach(r=>add(r,!c.length?'별도(연결 대상 없음)':r.period<first?'별도(연결 작성 전)':'별도(연결 작성 종료 후)'));}
 for(const [k,v] of naverActual){if(have.has(k))continue;const [id,p]=k.split('|');have.add(k);financial.push({company_id:id,period:p,revenue_KRW:String(Math.round(v.value*1e8)),basis:'연결',status:'네이버 확정 실적(공시 파싱 전)',source:'https://m.stock.naver.com/domestic/stock/'+id+'/finance/quarter',operating_profit_KRW:'',source_secondary:''});}
 fillDomestic();}financialCoverage=fc?JSON.parse(fc):{};backlog=b?records(b):[];backlogCoverage=bc?JSON.parse(bc):{};if(el('financialCoverageSummary')){const cs=financialCoverage.companies||[];el('financialCoverageSummary').textContent=cs.length?'실적 점검 범위 '+financialCoverage.start_period+' ~ '+financialCoverage.end_period+' · 연속 분기 확보 '+cs.filter(c=>c.status==='complete').length+'/'+cs.length+'개 업체. 나머지 업체의 미확보 상태는 아래 목록에 표시합니다. 확인일 '+financialCoverage.reviewed_at:'실적 수집 범위 확인 필요';}el('accessNotice').hidden=!status.failures?.some(f=>/SERVICE_KEY|ACCESS_DENIED|PERMISSION|HTTP_401|HTTP_403/.test(f.error));const categories=[...new Set(watch.map(c=>c.category))];categories.forEach(c=>{option(el('category'),c,c);if(el('industryFilter'))option(el('industryFilter'),c,c);});if(el('universeSummary')){const backlogCompanies=new Set(backlog.filter(r=>num(r.value)!=null).map(r=>r.company_id));el('universeSummary').textContent=watch.length+'개 업체 · '+watch.flatMap(c=>sites(c)).length+'개 업체-생산지역 연결 · '+new Set(watch.flatMap(c=>c.hs_codes)).size+'/'+Object.keys(hsNames).length+'개 관리 품목에 후보 연결 · 수주잔고 확인 '+backlogCompanies.size+'/'+watch.length+'개 업체 · 비공개·미기재 등 '+(watch.length-backlogCompanies.size)+'개 업체. 업체별 점검 공시 기간이 다르며 모든 과거 분기를 확보한 것은 아닙니다.';}if(el('reviewDate'))el('reviewDate').textContent=watchMeta.reviewed_at||'2026-10-07';if(el('companySearch'))el('companySearch').oninput=renderUniverse;if(el('industryFilter'))el('industryFilter').onchange=renderUniverse;renderUniverse();renderCoverage();el('category').onchange=populateCompany;el('company').onchange=populateHS;el('hs').onchange=populateRegions;el('region').onchange=render;el('frequency').onchange=render;populateCompany();}
fetch('company_domestic_financials.csv?v='+Date.now()).then(r=>r.ok?r.text():'').then(t=>{if(t){domesticFinancial=records(t);fillDomestic();if(el('company')?.value)render();}}).catch(()=>{});
init().catch(e=>{el('error').hidden=false;el('error').textContent='데이터를 불러오지 못했습니다: '+e.message;});

