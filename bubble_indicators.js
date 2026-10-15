/* Additional indicators are isolated from the existing risk score. */
(function(root){
'use strict';
function rsi(a,n=14){
 const out=a.map(p=>({d:p.d,v:null}));if(a.length<=n)return out;
 let g=0,l=0;const value=()=>g===0&&l===0?50:l===0?100:100-100/(1+g/l);
 for(let i=1;i<=n;i++){const z=a[i].v-a[i-1].v;g+=Math.max(z,0);l+=Math.max(-z,0);}g/=n;l/=n;out[n].v=value();
 for(let i=n+1;i<a.length;i++){const z=a[i].v-a[i-1].v;g=(g*(n-1)+Math.max(z,0))/n;l=(l*(n-1)+Math.max(-z,0))/n;out[i].v=value();}return out;
}
function closedKorean(a,updated){
 // A bar captured during the session stays provisional even when viewed after close.
 const t=new Date(updated);if(!Number.isFinite(+t))return a.filter(x=>x.d<new Date().toISOString().slice(0,10));
 const local=new Date(+t+9*3600000),d=local.toISOString().slice(0,10),closed=local.getUTCHours()>=16;
 return a.filter(x=>x.d<d||(closed&&x.d===d));
}
function sma(a,n){return a.map((x,i)=>{const w=a.slice(i-n+1,i+1);return{d:x.d,v:i>=n-1&&w.length===n&&w.every(p=>Number.isFinite(p.v))?w.reduce((s,p)=>s+p.v,0)/n:null};});}
root.BubbleIndicators={rsi,sma,closedKorean};if(typeof module!=='undefined')module.exports=root.BubbleIndicators;
})(typeof window!=='undefined'?window:globalThis);


// 같은 시장(코스피/코스닥) 그래프끼리 마우스 위치(날짜)를 공유: 세로선 + 툴팁 + 요약 줄
const SYNC={groups:{},last:{},busy:false,pin:{},noteFn:{}};
const EV_ALL=['mousemove','mouseout','click','touchstart','touchmove'];
function syncGroup(id){return id.endsWith('KOSPI')?'KOSPI':id.endsWith('KOSDAQ')?'KOSDAQ':null;}
const syncPlugin={id:'syncCross',
 afterEvent(ch,args){const g=ch.$sg;if(!g||SYNC.busy)return;const e=args.event;
  if(e.type==='click'){const x=ch.scales.x;if(!x||e.x<ch.chartArea.left||e.x>ch.chartArea.right)return;const i=Math.round(x.getValueForPixel(e.x));
   // 왼쪽 클릭 = 그 날짜에 세로선 고정, 같은 곳을 다시 클릭하면 해제(다른 곳 클릭은 고정 위치 이동)
   if(SYNC.pin[g]===i)syncPin(g,null);else syncPin(g,i);return;}
  if(SYNC.pin[g]!=null)return;
  if(e.type==='mouseout'){if(SYNC.last[g]!=null)syncSet(g,null);return;}
  if(e.type!=='mousemove')return;const x=ch.scales.x;if(!x||e.x<ch.chartArea.left||e.x>ch.chartArea.right){return;}
  const i=Math.round(x.getValueForPixel(e.x));if(SYNC.last[g]===i)return;syncSet(g,i,ch);},
 afterDatasetsDraw(ch){const i=ch.$si;if(i==null)return;const x=ch.scales.x.getPixelForValue(i),{top,bottom}=ch.chartArea,c=ch.ctx,pinned=SYNC.pin[ch.$sg]!=null;c.save();c.strokeStyle=pinned?'rgba(251,191,36,.95)':'rgba(226,232,240,.75)';c.lineWidth=pinned?2:1;c.beginPath();c.moveTo(x,top);c.lineTo(x,bottom);c.stroke();c.restore();}};
function syncPin(g,i){SYNC.pin[g]=i;const list=SYNC.groups[g]||[];for(const ch of list){ch.options.events=i==null?EV_ALL:['click'];}syncSet(g,i);}
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Escape'].includes(e.key))return;for(const g of Object.keys(SYNC.pin)){const i=SYNC.pin[g];if(i==null)continue;
 if(e.key==='Escape'){syncPin(g,null);continue;}const n=(SYNC.groups[g]?.[0]?.data.labels.length)||0,j=Math.max(0,Math.min(n-1,i+(e.key==='ArrowRight'?1:-1)));e.preventDefault();syncPin(g,j);}});
function syncSet(g,i,src){SYNC.busy=true;SYNC.last[g]=i;try{syncSet0(g,i,src);}finally{SYNC.busy=false;}}
function syncSet0(g,i,src){const list=(SYNC.groups[g]||[]).filter(ch=>ch&&ch.canvas&&ch.canvas.isConnected);SYNC.groups[g]=list;
 for(const ch of list){if(i==null||i<0||i>=ch.data.labels.length){ch.$si=null;ch.setActiveElements([]);ch.tooltip.setActiveElements([],{x:0,y:0});ch.update('none');continue;}
  ch.$si=i;const act=ch.data.datasets.map((d,k)=>({datasetIndex:k,index:i})).filter(a=>ch.data.datasets[a.datasetIndex].data[i]!=null&&!/^\d+$/.test(ch.data.datasets[a.datasetIndex].label));
  if(ch!==src){ch.setActiveElements(act);ch.tooltip.setActiveElements(act,{x:ch.scales.x.getPixelForValue(i),y:(ch.chartArea.top+ch.chartArea.bottom)/2});}ch.update('none');}
 const note=document.getElementById('syncNote'+g);if(note&&SYNC.noteFn[g]){if(i==null){note.classList.remove('pinned');note.textContent='그래프 위에 마우스를 올리면 같은 날짜 값이 함께 표시됩니다. 왼쪽 클릭 = 그 날짜 고정(다시 클릭하면 해제, ←→ 하루씩 이동, Esc 해제).';return;}note.classList.toggle('pinned',SYNC.pin[g]!=null);note.textContent=(SYNC.pin[g]!=null?'📌 고정 ':'')+SYNC.noteFn[g](i,list);return;}
 if(note){if(i==null){note.classList.remove('pinned');note.textContent='그래프 위에 마우스를 올리면 같은 날짜 값이 함께 표시됩니다. 왼쪽 클릭 = 그 날짜 고정(다시 클릭하면 해제, ←→ 하루씩 이동, Esc 해제).';return;}
  const pick=(id,k=0)=>{const ch=list.find(c=>c.canvas.id===id);const v=ch?.data.datasets[k]?.data[i];return v==null?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:1});};
  const d=list[0]?.data.labels[i]||'';note.classList.toggle('pinned',SYNC.pin[g]!=null);note.textContent=(SYNC.pin[g]!=null?'📌 고정 ':'')+`${d} · 지수 ${pick('idx'+g)} · Breadth_60 ${pick('breadth_60'+g)}% (5-SMA ${pick('breadth_60'+g,1)}) · HLI ${pick('hli'+g)}% (10-SMA ${pick('hli'+g,1)}) · RSI ${pick('rsi'+g)}`;}}

async function renderBubbleIndicators(st){
 const val=v=>Number.isFinite(v)?v.toFixed(1):'—',names={KOSPI:'코스피',KOSDAQ:'코스닥'},palette=['#60a5fa','#f472b6','#34d399','#fbbf24','#a78bfa','#fb7185','#22d3ee'];
 let range='1y',breadth=[],credit=[];
 try{breadth=JSON.parse(await read('breadth_daily.json')||'[]');}catch(e){el('breadthStatus').textContent='Breadth 자료를 읽지 못했습니다.';}
 let bs={};try{bs=JSON.parse(await read('breadth_status.json')||'{}');}catch(e){}
 // KRX 키가 없어 breadth_daily.json이 비어 있으면 네이버 일봉 기반 대체 자료(collect_breadth_naver.py → breadth_kr.csv)를 같은 정의로 환산해 씁니다.
 let fallback=false;if(!breadth.length){try{const t=await read('breadth_kr.csv');if(t){const n=v=>v===''||v==null?null:Number(v);
  breadth=rows(t).filter(r=>r.date).map(r=>{const n250=n(r.n250),nh=n(r.nh);return{date:r.date,market:r.market,breadth_60:n(r.breadth60),above_60:n(r.above60),eligible_60:n(r.n60),hli:n250&&nh!=null?nh/n250*100:null,new_high:nh,eligible_252:n250,total:n(r.n60)};});fallback=breadth.length>0;}}catch(e){}}
 try{credit=JSON.parse(await read('hyperscaler_credit.json')||'[]');}catch(e){el('hyperStatus').textContent='신용 자료를 읽지 못했습니다.';}
 const from=()=>{const d=new Date();if(range==='all')return'2015-01-01';if(range==='ytd')return d.getFullYear()+'-01-01';d.setFullYear(d.getFullYear()-(range==='3y'?3:1));return d.toISOString().slice(0,10);};
 function plot(id,sets,bounds,axis){
  // axis: 같은 시장의 그래프들이 같은 날짜축을 쓰도록 지수 거래일을 공유
  const labels=axis&&axis.length?axis:[...new Set(sets.flatMap(s=>s.data.map(x=>x.d)))].sort();
  const g=syncGroup(id);chart(id,{type:'line',plugins:g?[syncPlugin]:[],data:{labels,datasets:sets.map(s=>{const m=new Map(s.data.map(x=>[x.d,x.v]));return{label:s.label,data:labels.map(d=>m.get(d)??null),borderColor:s.color,backgroundColor:s.color,borderWidth:s.w||2,pointRadius:labels.length===1?4:0,pointHoverRadius:4,borderDash:s.dash,spanGaps:false};})},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{filter:x=>!/^\d+$/.test(x.dataset.label),callbacks:{label:x=>`${x.dataset.label}: ${x.parsed.y==null?'—':x.parsed.y.toLocaleString(undefined,{maximumFractionDigits:id.startsWith('idx')?0:1})}`}}},scales:{x:{ticks:{maxTicksLimit:6},grid:{display:false}},y:{min:bounds?.[0],max:bounds?.[1],afterFit:a=>{a.width=58;},title:{display:true,text:id.startsWith('rsi')?'RSI (0–100)':id.startsWith('idx')?'지수 (pt)':'비율 (%)'}}}}});
  if(g&&typeof charts!=='undefined'&&charts[id]){const ch=charts[id];ch.$sg=g;SYNC.groups[g]=(SYNC.groups[g]||[]).filter(c=>c!==ch&&c.canvas&&c.canvas.id!==id);SYNC.groups[g].push(ch);}
 }
 function renderBreadthSignal(){
  const card=el('breadthSignal');if(!card)return;
  const title=el('breadthSignalTitle'),dateEl=el('breadthSignalDate'),summary=el('breadthSignalConclusion'),metrics=el('breadthSignalMetrics');
  const n=v=>Number.isFinite(v)?v.toFixed(1):'—',dateSet=a=>new Set(a.map(x=>x.d||x.date));
  const markets=['KOSPI','KOSDAQ'],bs=markets.map(m=>breadth.filter(x=>x.market===m).sort((a,b)=>a.date.localeCompare(b.date)));
  const px=markets.map((m,i)=>BubbleIndicators.closedKorean(ser(i?'^KQ11':'^KS11'),st.updated_at));
  const sets=bs.map(dateSet);
  const common=bs[0].map(x=>x.date).filter(d=>sets.every(s=>s.has(d))).at(-1);
  metrics.replaceChildren();card.classList.remove('red','orange','green','neutral');
  if(!common){card.classList.add('neutral');title.textContent='시장 Breadth · 판정 대기';dateEl.textContent='공통 확정 종가 없음';summary.textContent='두 시장의 Breadth가 같은 날짜로 확인되면 판정합니다.';return;}
  const sample=markets.map((market,i)=>{
   const rows=bs[i].filter(x=>x.date<=common),b=rows.at(-1);
   const b5=BubbleIndicators.sma(rows.map(x=>({d:x.date,v:x.breadth_60})),5).at(-1)?.v;
   const h10=BubbleIndicators.sma(rows.map(x=>({d:x.date,v:x.hli})),10).at(-1)?.v;
   const rp=BubbleIndicators.rsi(px[i].filter(x=>x.d<=common)).at(-1),r=rp?.d===common?rp.v:null;
   return {market,b,b5,h10,r,delta:Number.isFinite(b5)?b.breadth_60-b5:null};
  });
  const valid=sample.every(x=>Number.isFinite(x.b?.breadth_60)&&x.b.eligible_60>0&&Number.isFinite(x.b5));
  let color='neutral';
  if(valid){
   const [a,b]=sample;
   color=(a.b.breadth_60<40&&b.b.breadth_60<40)||(Math.min(a.b.breadth_60,b.b.breadth_60)<35&&a.delta<0&&b.delta<0)?'red':
    (a.b.breadth_60>=50&&b.b.breadth_60>=50&&a.delta>=0&&b.delta>=0&&a.b.hli>=3&&b.b.hli>=3)?'green':'orange';
  }
  card.classList.add(color);
  const label={red:'빨강 · 약세',orange:'주황 · 주의',green:'초록 · 확산',neutral:'판정 대기'}[color];
  title.textContent='시장 Breadth · '+label;
  dateEl.textContent=common+' Breadth 확정 종가 · '+(fallback?'네이버 일봉 대체':'KRX')+' 기준 · RSI는 동일일만 표시';
  const [a,b]=sample;
  summary.textContent=color==='red'?`코스피 ${n(a.b.breadth_60)}%·코스닥 ${n(b.b.breadth_60)}%. 상승 참여가 좁거나 두 시장이 5일 평균 아래로 약화됐습니다. 확산 회복 전까지 주의가 필요합니다.`:
   color==='green'?`코스피 ${n(a.b.breadth_60)}%·코스닥 ${n(b.b.breadth_60)}%. 두 시장의 상승 참여와 신고가 비율이 함께 회복됐습니다.`:
   color==='orange'?`코스피 ${n(a.b.breadth_60)}%·코스닥 ${n(b.b.breadth_60)}%. 시장 폭 회복이 엇갈립니다. 5일 평균과 신고가 확산을 더 확인해야 합니다.`:
   '공통 날짜 자료는 있으나 Breadth_60 또는 5일 평균이 부족해 판정을 보류합니다.';
  for(const x of sample){
   const article=document.createElement('article'),head=document.createElement('b'),detail=document.createElement('span'),support=document.createElement('span');
   head.textContent=x.market;
   detail.textContent=`Breadth_60 ${n(x.b.breadth_60)}% (${x.b.above_60??'—'}/${x.b.eligible_60??'—'}) · 5일 평균 ${n(x.b5)}% (${x.delta==null?'—':(x.delta>=0?'+':'')+n(x.delta)}%p)`;
   support.textContent=`HLI ${n(x.b.hli)}% (${x.b.new_high??'—'}/${x.b.eligible_252??'—'}) · 10일 평균 ${n(x.h10)}% · RSI(14) ${n(x.r)}${x.r==null?' (동일일 지수 종가 미확보)':''}`;
   article.append(head,detail,support);metrics.append(article);
  }
 }
 function render(){for(const g of ['KOSPI','KOSDAQ']){SYNC.pin[g]=null;SYNC.last[g]=null;}for(const [market,name]of Object.entries(names)){
  const px=BubbleIndicators.closedKorean(ser(market==='KOSPI'?'^KS11':'^KQ11'),st.updated_at),rs=BubbleIndicators.rsi(px);const a=rs.filter(x=>x.d>=from()),last=rs.filter(x=>Number.isFinite(x.v)).at(-1);
  const ma60=BubbleIndicators.sma(px,60),axis=px.filter(x=>x.d>=from()).map(x=>x.d);
  plot('idx'+market,[{label:name+' 종가',data:px.filter(x=>x.d>=from()),color:'#e2e8f0',w:2},{label:'60일 이동평균',data:ma60.filter(x=>x.d>=from()),color:'#f59e0b',w:1.5,dash:[5,4]}],null,axis);
  const lp=px.at(-1),lm=ma60.at(-1);el('idxNote'+market).textContent=lp?`${lp.d} 종가 ${lp.v.toLocaleString(undefined,{maximumFractionDigits:2})} · 60일선 ${lm?.v!=null?lm.v.toLocaleString(undefined,{maximumFractionDigits:0}):'—'} (${lm?.v?((lp.v/lm.v-1)*100).toFixed(1)+'%':'—'}) · 구간 고점 대비 ${(()=>{const w=px.filter(x=>x.d>=from());const h=Math.max(...w.map(x=>x.v));return ((lp.v/h-1)*100).toFixed(1)+'%';})()}`:'';
  plot('rsi'+market,[{label:name+' RSI(14)',data:a,color:market==='KOSPI'?palette[0]:palette[1],w:2.5},...[70,50,30].map(v=>({label:String(v),data:a.map(x=>({d:x.d,v})),color:v===50?'#64748b':v===70?'#ef4444':'#34d399',w:1,dash:[4,4]}))],[0,100],axis);
  el('rsiNote'+market).textContent=last?`${last.d} 확정 종가 기준 · RSI ${val(last.v)} · ${last.v>=70?'과열 구간':last.v<=30?'과매도 구간':'중립 구간'}`:'확정 종가 자료 부족';
  const b=breadth.filter(x=>x.market===market).sort((x,y)=>x.date.localeCompare(y.date));
  for(const [field,n,title]of [['breadth_60',5,'Breadth_60'],['hli',10,'HLI']]){const raw=b.map(x=>({d:x.date,v:x[field]}));plot(field+market,[{label:title,data:raw.filter(x=>x.d>=from()),color:palette[0],w:1},{label:n+'-SMA',data:BubbleIndicators.sma(raw,n).filter(x=>x.d>=from()),color:palette[3],w:2.5}],field==='hli'?[0,undefined]:[0,100],axis);}
  const lastB=b.at(-1);el('breadthNote'+market).textContent=lastB?`${lastB.date} · Breadth ${val(lastB.breadth_60)}% (${lastB.above_60}/${lastB.eligible_60}) · HLI ${val(lastB.hli)}% (${lastB.new_high}/${lastB.eligible_252}) · 당일 유효 주권 ${lastB.total}개`:'전 종목 종가 수집 대기 · 결측값은 0으로 표시하지 않습니다.';
 }}
 el('breadthStatus').textContent=(bs.message||'KRX 전 종목 종가 수집 상태 확인 중')+(fallback?' → 그동안 네이버 일봉 기반 대체 자료를 표시합니다(현재 상장 종목 기준이라 상장폐지 종목이 빠지는 생존 편향, 우선주 제외).':'');
 document.querySelectorAll('#technicalRange button').forEach(b=>b.onclick=()=>{range=b.dataset.r;document.querySelectorAll('#technicalRange button').forEach(x=>x.classList.toggle('on',x===b));render();});render();renderBreadthSignal();
 const issuers={META:'메타',MSFT:'마이크로소프트',AMZN:'아마존',GOOGL:'알파벳',ORCL:'오라클'};
 const valid=credit.filter(r=>Number.isFinite(r.value_bps)&&r.value_bps>=0&&/^https:\/\//.test(r.source));
 const legacy=cds.filter(r=>issuers[r.ticker]&&Number.isFinite(num(r.cds_5y_bps))).map(r=>({ticker:r.ticker,metric:'CDS',instrument:'5Y · 통화 미명시',date:r.date,date_basis:'기존 기록일',value_bps:num(r.cds_5y_bps),source:r.source,approximate:false}));
 const all=[...legacy,...valid];
 for(const metric of ['CDS','BOND']){
  const groups=new Map();for(const r of all.filter(r=>r.metric===metric)){const key=r.ticker+'|'+r.instrument;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
  const labels=[...new Set([...groups.values()].flat().map(r=>r.date))].sort();
  chart(metric==='CDS'?'hyperCds':'hyperBond',{type:'line',data:{labels,datasets:[...groups].map(([key,a],i)=>{const m=new Map(a.map(r=>[r.date,r]));return{label:(issuers[a[0].ticker]||a[0].entity)+' · '+a[0].instrument,data:labels.map(d=>m.get(d)?.value_bps??null),borderColor:palette[i%palette.length],backgroundColor:palette[i%palette.length],pointRadius:5,showLine:false,spanGaps:false};})},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>c.dataset.label+': '+c.parsed.y+' bp (보도 관측치)'}}},scales:{x:{ticks:{maxTicksLimit:6}},y:{title:{display:true,text:metric==='CDS'?'CDS 프리미엄 (bp)':'개별 채권 / 국채 스프레드 (bp)'}}}}});
 }
 const tb=el('hyperTable');tb.replaceChildren();for(const [ticker,name]of Object.entries(issuers))for(const metric of ['CDS','BOND']){
  const a=all.filter(r=>r.ticker===ticker&&r.metric===metric).sort((a,b)=>a.date.localeCompare(b.date)),r=a.at(-1),tr=document.createElement('tr');td(tr,name);td(tr,metric==='CDS'?'CDS':'본사 회사채');td(tr,r?(r.approximate?'약 ':'')+val(r.value_bps)+' bp':'미확보');td(tr,r?r.date+' · '+r.date_basis:'—');td(tr,r?r.instrument:'검증된 개별 채권 호가 필요');
  const c=td(tr,'');if(r){const link=document.createElement('a');link.href=r.source;link.target='_blank';link.rel='noopener';link.textContent='출처';c.append(link);const age=Math.floor((Date.now()-Date.parse(r.date))/86400000);if(age>30)c.append(document.createTextNode(' · '+age+'일 경과'));}tb.append(tr);
 }
 el('hyperStatus').textContent='공시·보도 관측치만 점으로 표시합니다. 발행 스프레드와 유통시장 호가는 구분하며 CDS의 만기가 출처에 없으면 미명시로 표시합니다. 최신 실시간 호가가 아니며 관측 사이를 보간하지 않습니다. 메타 관련 Beignet 채권은 별도 발행인으로 본사 회사채 표에서 제외합니다. 누락 값·과거 값은 종합 경고등에 추가하지 않습니다.';
}
