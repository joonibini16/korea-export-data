/* Daily public-source signed breadth; separate from user-supplied DB snapshot. */
(async()=>{
 const root=document.getElementById('autoBreadth'),status=document.getElementById('autoBreadthStatus');
 if(!root||!status)return;
 try{
  // 2025년~ 장기 추이: KRX 전 종목 종가로 계산한 60일 신고가·신저가(breadth_hl60.csv)
  const HL={KOSPI:[],KOSDAQ:[]};try{const t=await (await fetch('./breadth_hl60.csv?v='+Date.now(),{cache:'no-store'})).text();for(const l of t.trim().split(/\r?\n/).slice(1)){const [d,m,n,nh,nl,b]=l.split(',');if(HL[m]&&d>='2025-01-01')HL[m].push({date:d,breadth:+b,nh:+nh,nl:+nl,n:+n});}}catch(_){}
  const res=await fetch('./size_breadth.json?v='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();
  const markets=['KOSPI','KOSDAQ'];
  const prepared=markets.map(market=>{
   const m=data.markets?.[market],bucket=m?.buckets?.find(b=>b.name==='종합');
   const trend=bucket?.trend;
   if(!Array.isArray(trend)||trend.length<5||!trend.every(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&Number.isFinite(p.breadth)))throw Error(market+' 추이 자료 부족');
   if(trend.at(-1).date!==data.live_day||!Number.isFinite(bucket.nh)||!Number.isFinite(bucket.nl)||!Number.isFinite(bucket.n))throw Error(market+' 기준일 불일치');
   return {market,m,bucket,trend};
  });
  const age=Math.floor((Date.now()-new Date(data.updated_at).getTime())/86400000);
  const preview=document.getElementById('breadthSignalLive');
  if(preview)preview.textContent='최신 자동 수집 참고 · '+data.live_day+' · '+data.updated_at.replace('T',' ').slice(11,16)+' KST · '+prepared.map(({market,bucket})=>market+' 신고가−신저가 Breadth '+bucket.breadth.toFixed(1)+' (신고가 '+bucket.nh+' / 신저가 '+bucket.nl+')').join(' · ')+' · 확정 종가 Breadth_60 신호등과 산식·표본이 달라 판정에는 미반영';
  status.textContent='네이버 증권 자료 · '+data.updated_at.replace('T',' ').slice(0,16)+' KST 갱신 · '+data.live_day+' 기준. 평일 한국시간 09:30·10:30·13:00·15:40·21:30 자동 수집(실제 반영은 지연될 수 있음). '+(age>3?'자료 갱신 지연 여부를 확인하세요. ':'')+'그래프(2025년~)는 KRX 전 종목 종가로 계산한 60일 종가 신고가·신저가(상장폐지 포함, 수정주가)이고, 위 숫자는 네이버 실시간 산식이라 수준 차이가 있습니다. DB 화면과도 계산식·표본이 달라 수치가 일치하지 않습니다. 평일 장중 값은 확정 종가가 아닙니다.';
  for(const {market,m,bucket,trend} of prepared){
   const card=document.createElement('article');card.className='db-card';
   const title=document.createElement('h3');title.textContent=market+' · 60일 신고가−신저가 폭';
   const latest=document.createElement('p');latest.textContent=data.live_day+' · Breadth '+bucket.breadth.toFixed(1)+' · 신고가 '+bucket.nh+' / 신저가 '+bucket.nl+' · '+bucket.n+'종목';
   const plot=document.createElement('div');plot.className='db-plot';plot.style.height='200px';
   const canvas=document.createElement('canvas');plot.append(canvas);card.append(title,latest,plot);root.append(card);
   const L=HL[market].length?HL[market]:trend,long=HL[market].length>0;
   const labels=[...new Set([...L.map(p=>p.date),...trend.map(p=>p.date)])].sort(),lm=new Map(L.map(p=>[p.date,p.breadth])),tm=new Map(trend.map(p=>[p.date,p.breadth]));
   const values=labels.map(d=>lm.get(d)??null);
   const sma=values.map((_,i)=>{const w=values.slice(Math.max(0,i-4),i+1).filter(v=>v!=null);return i<4||w.length<5?null:Math.round(w.reduce((a,b)=>a+b,0)/5*10)/10;});
   plot.style.height='240px';
   new Chart(canvas,{type:'line',data:{labels,datasets:[
    {label:long?'60일 신고가−신저가 Breadth (KRX 종가)':'60일 신고가−신저가 Breadth',data:values,borderColor:'#fb784e',backgroundColor:'#fb784e',borderWidth:long?1.6:3,pointRadius:long?0:3,tension:0,spanGaps:true},
    {label:'5거래일 평균',data:sma,borderColor:'#34d399',backgroundColor:'#34d399',borderWidth:1.6,pointRadius:long?0:2,tension:0,spanGaps:false}
   ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false,axis:'x'},plugins:{legend:{labels:{color:'#cbd5e1'}},tooltip:{mode:'index',intersect:false,callbacks:{title:items=>items[0]?.label||'',label:item=>item.dataset.label+': '+Number(item.parsed.y).toFixed(1)}}},scales:{x:{ticks:{color:'#94a3b8',maxTicksLimit:8,callback:function(v){const l=this.getLabelForValue(v);return typeof l==='string'?l.slice(2,7).replace('-','.'):'';}},grid:{display:false}},y:{ticks:{color:'#94a3b8'},grid:{color:'rgba(148,163,184,.13)'}}}}});
  }
 }catch(e){status.textContent='자동 Breadth 자료를 표시하지 못했습니다: '+e.message;}
})();
