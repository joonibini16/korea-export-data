// 업체 선택 시 맨 앞에 보여주는 결론 카드.
// 1) 수출·재고 기반 다음 분기 매출 추정치가 컨센서스를 상회할지(확률·상회폭)
// 2) 시가총액과 올해·내년 PER
(function(){
 let sh=null,sl=null;
 async function shares(){if(sh)return sh;if(!sl)sl=fetch('stock_shares.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>{sh=new Map();for(const l of (t||'').trim().split(/\r?\n/).slice(1)){const [id,n,mc,p,d]=l.split(',');if(id)sh.set(id,{shares:Number(n),mcap:Number(mc),price:Number(p),date:d});}return sh;}).catch(()=>sh=new Map());return sl;}
 let px=null,pl=null;
 async function closes(){if(px)return px;if(!pl)pl=fetch('stock_prices_monthly.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>{px=new Map();for(const l of (t||'').trim().split(/\r?\n/).slice(1)){const [id,m,d,c]=l.split(',');const o=px.get(id);if(id&&(!o||d>o.date))px.set(id,{date:d,close:Number(c)});}return px;}).catch(()=>px=new Map());return pl;}
 // 표준정규 누적분포(Abramowitz-Stegun 근사)
 function Phi(z){const t=1/(1+0.2316419*Math.abs(z)),d=0.3989423*Math.exp(-z*z/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p;}
 const fmtE=v=>Math.round(v).toLocaleString()+'억원',pc=v=>(v>0?'+':'')+v.toFixed(1)+'%';
 const big=v=>v==null?'—':Math.abs(v)>=10000?(v/10000).toLocaleString(undefined,{maximumFractionDigits:2})+'조원':Math.round(v).toLocaleString()+'억원';
 function methods(c){const out=[];
  try{const o=companyOutlook(c);if(o&&o.fc&&o.fc.value>0&&!o.fc.fail){const mape=o.fc.mape;out.push({model:'qoq-elasticity-v1',name:'수출 기반',period:o.period,value:o.fc.value,mape,sigma:mape!=null?Math.max(0.03,mape/100*1.25):0.25,note:o.natFallback?'전국 품목 수출로 대체':''});}}catch(e){}
  try{const s=inventorySummary(c),f=s?inventoryForecast(s):null;if(f&&f.value>0&&!f.fail&&!f.weak){const sd=f.high&&f.value?Math.log(f.high/f.value):null;out.push({model:'inventory-qoq-v2',name:'재고 기반',period:f.target,value:f.value,mape:f.mape,sigma:Math.max(0.03,f.mape!=null?f.mape/100*1.25:(sd||0.25)),note:f.grade?'신뢰도 '+f.grade:''});}}catch(e){}
  return out;}

 // ── 실측 보정: forecast_log.csv에 쌓인 과거 예측을 실제 매출과 비교해 방법별 편향·오차를 구하고, 다음 판단에 반영
 let LOG=null,logP=null;
 function parseCsv(t){const L=(t||'').replace(/^﻿/,'').trim().split(/\r?\n/);if(L.length<2)return[];const h=L[0].split(',');return L.slice(1).map(l=>{const o=[];let v='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];if(ch==='"'){if(q&&l[i+1]==='"'){v+='"';i++;}else q=!q;}else if(ch===','&&!q){o.push(v);v='';}else v+=ch;}o.push(v);return Object.fromEntries(h.map((k,i)=>[k,o[i]??'']));});}
 window.verdictPrep=async function(){if(LOG)return LOG;if(!logP)logP=fetch('forecast_log.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>LOG=parseCsv(t)).catch(()=>LOG=[]);return logP;};
 function actualOf(id,period){try{const c=(typeof watch!=='undefined'?watch:[]).find(x=>x.id===id);const v=c?revenueMap(c).get(period):null;return v>0?v:null;}catch(e){return null;}}
 // 각 (회사·분기·모델)의 마지막 스냅샷 = 실적 발표 직전에 가장 많은 정보를 담은 예측
 function finals(model){const last=new Map();for(const r of LOG||[]){if(r.model!==model)continue;const k=r.company_id+'|'+r.period,o=last.get(k);if(!o||r.snapshot_date>o.snapshot_date)last.set(k,r);}return [...last.values()];}
 window.verdictCalib=function(){const out={};for(const m of ['qoq-elasticity-v1','inventory-qoq-v2']){const e=finals(m).map(r=>{const a=actualOf(r.company_id,r.period),f=Number(r.forecast_revenue_100m);return a&&f>0?Math.log(a/f):null;}).filter(v=>v!=null);
   const n=e.length,mean=n?e.reduce((a,b)=>a+b,0)/n:0,sd=n>1?Math.sqrt(e.reduce((a,b)=>a+(b-mean)**2,0)/(n-1)):null;out[m]={n,bias:mean,sd};}
  const v=finals('combined-verdict-v1').map(r=>{const a=actualOf(r.company_id,r.period),c=Number(r.consensus_revenue_100m),p=Number(r.prob_beat_pct)/100;if(!(a&&c>0)||!(p>=0))return null;const y=a>c?1:0;return{r,y,p,hit:(p>=0.5)===(y===1),err:(Number(r.forecast_revenue_100m)/a-1)*100};}).filter(Boolean);
  out.verdict={n:v.length,hit:v.filter(x=>x.hit).length,brier:v.length?v.reduce((a,x)=>a+(x.p-x.y)**2,0)/v.length:null,rows:v};return out;};
 // 판단 계산(화면과 일일 스냅샷이 같은 함수 사용)
 window.verdictCalc=function(c){const ms=methods(c),cal=window.verdictCalib();
  const tq=ms.find(m=>consensusFor(c,m.period))?.period||ms[0]?.period,cs=tq?consensusFor(c,tq):null,use=ms.filter(m=>m.period===tq);
  for(const m of use){const k=cal[m.model];m.raw=m.value;m.liveN=k?.n||0;if(k&&k.n>=4){const wgt=k.n/(k.n+8);m.value=m.value*Math.exp(k.bias*wgt);// 편향 보정(표본이 늘수록 강하게)
    if(k.sd!=null){const nb=4;m.sigma=Math.sqrt((nb*m.sigma**2+k.n*Math.max(0.02,k.sd)**2)/(nb+k.n));}m.calibrated=true;}}
  if(!use.length||!cs)return{period:tq,cs,use,ok:false};
  const w=use.map(m=>1/(m.sigma*m.sigma)),W=w.reduce((a,b)=>a+b,0),lf=use.reduce((a,m,i)=>a+w[i]*Math.log(m.value),0)/W,sig=Math.sqrt(1/W),F=Math.exp(lf);
  return{ok:true,period:tq,cs,use,F,sig,gap:(F/cs.value-1)*100,p:Phi(Math.log(F/cs.value)/sig)*100,cal};};
 let seq=0;window.renderVerdict=async function(c){const box=document.getElementById('verdictPanel');if(!box)return;const my=++seq,body=document.createDocumentFragment();
  document.getElementById('verdictTitle').textContent=c.name+' · 결론';
  // 1) 분기 매출 추정 vs 컨센서스
  await window.verdictPrep();const V=window.verdictCalc(c),line1=document.createElement('div');line1.className='vd-line';const tq=V.period,cs=V.cs,use=V.use;
  if(!use.length){line1.innerHTML='<b>분기 실적 추정</b><span class="muted">수출·재고로 추정할 수 있는 진행 분기가 없습니다(자료 부족 또는 최신 분기 실적 발표 완료).</span>';}
  else if(!cs){const v=use[0];line1.innerHTML=`<b>${tq} 매출 추정</b><span>${fmtE(v.value)} (${v.name})</span><span class="muted">네이버 분기 컨센서스가 없어 상회 여부를 판단할 수 없습니다.</span>`;}
  else{const {F,gap,p}=V,beat=gap>=0,strength=p>=70?(beat?'상회 가능성 높음':''):p<=30?'하회 가능성 높음':'컨센서스 부근';
   line1.innerHTML=`<b>${tq} 매출</b><span class="vd-big ${beat?'pos':'neg'}">${beat?'상회':'하회'} 예상 ${pc(gap)}</span><span class="vd-big">상회 확률 ${Math.round(p)}%</span><span class="muted">${strength} · 추정 ${fmtE(F)} vs 컨센서스 ${fmtE(cs.value)}</span>`;
   const sub=document.createElement('div');sub.className='vd-sub muted';
   sub.textContent=use.map(m=>`${m.name} ${fmtE(m.value)} (${pc((m.value/cs.value-1)*100)}, 오차 ±${(m.sigma/1.25*100).toFixed(0)}%${m.calibrated?` · 실측 ${m.liveN}건 반영`:''}${m.note?' · '+m.note:''})`).join(' · ')+` → 오차가 작은 방법에 가중치를 더 둬 합침. 확률 = 추정 오차를 정규분포로 봤을 때 실제 매출이 컨센서스보다 클 확률. 매출 기준이며 이익 서프라이즈와는 다를 수 있습니다.`;
   line1.append(sub);}
  body.append(line1);
  // 2) 시가총액 · 올해/내년 PER
  if(window.__ctLoad)await window.__ctLoad();const S=(await shares()).get(c.id),y0=new Date().getFullYear(),rows=(window.__ctRows?window.__ctRows():[]).filter(r=>r.company_id===c.id&&r.freq==='Y'&&r.item==='eps');
  const eps=y=>{const a=rows.filter(r=>r.period===`${y}/12`).sort((x,z)=>x.date.localeCompare(z.date));return a.length?Number(a.at(-1).avg):null;};
  const P=(await closes()).get(c.id),price=P?.close||S?.price,pdate=P?`${P.date.slice(0,4)}-${P.date.slice(4,6)}-${P.date.slice(6,8)}`:S?.date,mcap=S?.shares&&price?S.shares*price/1e8:S?.mcap,per=y=>{const e=eps(y);return e>0&&price?(price/e).toFixed(1)+'배':e!=null&&e<=0?'적자':'—';};
  const line2=document.createElement('div');line2.className='vd-line';
  line2.innerHTML=`<b>밸류에이션</b><span class="vd-big">시총 ${big(mcap)}</span><span class="vd-big">${y0}E PER ${per(y0)}</span><span class="vd-big">${y0+1}E PER ${per(y0+1)}</span><span class="muted">주가 ${price?price.toLocaleString()+'원':'—'} (${pdate||''} 종가)</span>`;
  body.append(line2);
  // 3) 판단 기록: 매일 저장된 판단을 실제 실적과 비교
  {const cal=V.cal||window.verdictCalib(),vr=cal.verdict,mine=finals('combined-verdict-v1').filter(r=>r.company_id===c.id).sort((x,z)=>x.period.localeCompare(z.period)).slice(-4);
   const line3=document.createElement('div');line3.className='vd-line';const parts=mine.map(r=>{const a=actualOf(r.company_id,r.period),cc=Number(r.consensus_revenue_100m),pp=Number(r.prob_beat_pct);
    if(!a)return `${r.period} 상회 ${Math.round(pp)}% → 실적 대기`;const beat=a>cc,hit=(pp>=50)===beat;return `${r.period} 상회 ${Math.round(pp)}% → 실제 ${beat?'상회':'하회'} ${pc((a/cc-1)*100)} ${hit?'✓':'✗'}`;});
   const lv=['qoq-elasticity-v1','inventory-qoq-v2'].map(m=>`${m.startsWith('qoq')?'수출':'재고'} 기반 실측 ${cal[m]?.n||0}건${cal[m]?.n>1&&cal[m].sd!=null?' (오차 ±'+(cal[m].sd*100).toFixed(0)+'%, 편향 '+pc(cal[m].bias*100)+')':''}`).join(' · ');
   line3.innerHTML=`<b>판단 기록</b><span>${parts.length?parts.join(' · '):'이 회사 판단은 오늘부터 매일 저장됩니다'}</span><span class="muted">전체 적중 ${vr.n?`${vr.hit}/${vr.n} (${Math.round(vr.hit/vr.n*100)}%) · Brier ${vr.brier.toFixed(2)}`:'실적 확인된 판단 아직 없음'} · ${lv}</span>`;
   const sub=document.createElement('div');sub.className='vd-sub muted';sub.textContent='판단(상회 확률)은 평일 매일 forecast_log.csv에 저장되고, 실적이 나오면 마지막 판단을 실제와 비교합니다. 방법별 실측 오차가 4건 이상 쌓이면 편향을 보정하고 오차 범위(σ)를 실측치로 갈아 끼워 확률을 다시 계산합니다. Brier 점수는 0에 가까울수록 확률이 잘 맞는다는 뜻(무작정 50%면 0.25).';line3.append(sub);body.append(line3);}
  if(my!==seq)return;document.getElementById('verdictBody').replaceChildren(body);};
 // 레이아웃이 만들어진 뒤 결론 패널을 선택 막대 바로 아래(지표 카드·첫 구역보다 앞)로 옮김
 function place(){const p=document.getElementById('verdictPanel'),st=document.querySelector('.dash-sticky'),w=document.querySelector('.dash-wrap');if(!p)return;if(st){if(st.nextElementSibling!==p)st.after(p);}else if(w)w.before(p);}
 if(document.readyState!=='loading')setTimeout(place,0);else document.addEventListener('DOMContentLoaded',()=>setTimeout(place,0));
})();
