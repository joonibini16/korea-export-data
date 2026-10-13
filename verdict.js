// 업체 선택 시 맨 앞에 보여주는 결론 카드.
// 1) 수출·재고 기반 다음 분기 매출 추정치가 컨센서스를 상회할지(확률·상회폭)
// 2) 시가총액과 올해·내년 PER
(function(){
 let sh=null,sl=null;
 async function shares(){if(sh)return sh;if(!sl)sl=fetch('stock_shares.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>{sh=new Map();for(const l of (t||'').trim().split(/\r?\n/).slice(1)){const [id,n,mc,p,d]=l.split(',');if(id)sh.set(id,{shares:Number(n),mcap:Number(mc),price:Number(p),date:d});}return sh;}).catch(()=>sh=new Map());return sl;}
 // 표준정규 누적분포(Abramowitz-Stegun 근사)
 function Phi(z){const t=1/(1+0.2316419*Math.abs(z)),d=0.3989423*Math.exp(-z*z/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return z>0?1-p:p;}
 const fmtE=v=>Math.round(v).toLocaleString()+'억원',pc=v=>(v>0?'+':'')+v.toFixed(1)+'%';
 const big=v=>v==null?'—':Math.abs(v)>=10000?(v/10000).toLocaleString(undefined,{maximumFractionDigits:2})+'조원':Math.round(v).toLocaleString()+'억원';
 function methods(c){const out=[];
  try{const o=companyOutlook(c);if(o&&o.fc&&o.fc.value>0&&!o.fc.fail){const mape=o.fc.mape;out.push({name:'수출 기반',period:o.period,value:o.fc.value,mape,sigma:mape!=null?Math.max(0.03,mape/100*1.25):0.25,note:o.natFallback?'전국 품목 수출로 대체':''});}}catch(e){}
  try{const s=inventorySummary(c),f=s?inventoryForecast(s):null;if(f&&f.value>0&&!f.fail&&!f.weak){const sd=f.high&&f.value?Math.log(f.high/f.value):null;out.push({name:'재고 기반',period:f.target,value:f.value,mape:f.mape,sigma:Math.max(0.03,f.mape!=null?f.mape/100*1.25:(sd||0.25)),note:f.grade?'신뢰도 '+f.grade:''});}}catch(e){}
  return out;}
 let seq=0;window.renderVerdict=async function(c){const box=document.getElementById('verdictPanel');if(!box)return;const my=++seq,body=document.createDocumentFragment();
  document.getElementById('verdictTitle').textContent=c.name+' · 결론';
  // 1) 분기 매출 추정 vs 컨센서스
  const ms=methods(c);const line1=document.createElement('div');line1.className='vd-line';
  const tq=ms.find(m=>consensusFor(c,m.period))?.period||ms[0]?.period,cs=tq?consensusFor(c,tq):null,use=ms.filter(m=>m.period===tq);
  if(!use.length){line1.innerHTML='<b>분기 실적 추정</b><span class="muted">수출·재고로 추정할 수 있는 진행 분기가 없습니다(자료 부족 또는 최신 분기 실적 발표 완료).</span>';}
  else if(!cs){const v=use[0];line1.innerHTML=`<b>${tq} 매출 추정</b><span>${fmtE(v.value)} (${v.name})</span><span class="muted">네이버 분기 컨센서스가 없어 상회 여부를 판단할 수 없습니다.</span>`;}
  else{// 방법별 로그 추정치를 오차(σ)의 역분산으로 가중 평균
   const w=use.map(m=>1/(m.sigma*m.sigma)),W=w.reduce((a,b)=>a+b,0),lf=use.reduce((a,m,i)=>a+w[i]*Math.log(m.value),0)/W,sig=Math.sqrt(1/W),F=Math.exp(lf);
   const gap=(F/cs.value-1)*100,p=Phi(Math.log(F/cs.value)/sig)*100,beat=gap>=0;
   const strength=p>=70?(beat?'상회 가능성 높음':''):p<=30?'하회 가능성 높음':'컨센서스 부근';
   line1.innerHTML=`<b>${tq} 매출</b><span class="vd-big ${beat?'pos':'neg'}">${beat?'상회':'하회'} 예상 ${pc(gap)}</span><span class="vd-big">상회 확률 ${Math.round(p)}%</span><span class="muted">${strength} · 추정 ${fmtE(F)} vs 컨센서스 ${fmtE(cs.value)}</span>`;
   const sub=document.createElement('div');sub.className='vd-sub muted';
   sub.textContent=use.map(m=>`${m.name} ${fmtE(m.value)} (${pc((m.value/cs.value-1)*100)}, 과거 오차 ${m.mape!=null?'±'+m.mape.toFixed(0)+'%':'추정'}${m.note?' · '+m.note:''})`).join(' · ')+` → 오차가 작은 방법에 가중치를 더 둬 합침. 확률 = 추정 오차를 정규분포로 봤을 때 실제 매출이 컨센서스보다 클 확률. 매출 기준이며 이익 서프라이즈와는 다를 수 있습니다.`;
   line1.append(sub);}
  body.append(line1);
  // 2) 시가총액 · 올해/내년 PER
  if(window.__ctLoad)await window.__ctLoad();const S=(await shares()).get(c.id),y0=new Date().getFullYear(),rows=(window.__ctRows?window.__ctRows():[]).filter(r=>r.company_id===c.id&&r.freq==='Y'&&r.item==='eps');
  const eps=y=>{const a=rows.filter(r=>r.period===`${y}/12`).sort((x,z)=>x.date.localeCompare(z.date));return a.length?Number(a.at(-1).avg):null;};
  const price=S?.price,mcap=S?.shares&&price?S.shares*price/1e8:S?.mcap,per=y=>{const e=eps(y);return e>0&&price?(price/e).toFixed(1)+'배':e!=null&&e<=0?'적자':'—';};
  const line2=document.createElement('div');line2.className='vd-line';
  line2.innerHTML=`<b>밸류에이션</b><span class="vd-big">시총 ${big(mcap)}</span><span class="vd-big">${y0}E PER ${per(y0)}</span><span class="vd-big">${y0+1}E PER ${per(y0+1)}</span><span class="muted">주가 ${price?price.toLocaleString()+'원':'—'} (${S?.date||''})</span>`;
  body.append(line2);if(my!==seq)return;document.getElementById('verdictBody').replaceChildren(body);};
 // 레이아웃이 만들어진 뒤 결론 패널을 선택 막대 바로 아래(지표 카드·첫 구역보다 앞)로 옮김
 function place(){const p=document.getElementById('verdictPanel'),st=document.querySelector('.dash-sticky'),w=document.querySelector('.dash-wrap');if(!p)return;if(st){if(st.nextElementSibling!==p)st.after(p);}else if(w)w.before(p);}
 if(document.readyState!=='loading')setTimeout(place,0);else document.addEventListener('DOMContentLoaded',()=>setTimeout(place,0));
})();
