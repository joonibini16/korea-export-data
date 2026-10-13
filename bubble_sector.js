// KIND listed companies by official industry; Naver closing-price breadth in verified batches.
(async function(){
 const $=id=>document.getElementById(id);
 const parse=t=>{if(!t)return[];const out=[],rec=[];let field='',quoted=false;
  for(let i=0;i<t.length;i++){const c=t[i];if(c==='"'){if(quoted&&t[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
   else if(c===','&&!quoted){rec.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&t[i+1]==='\n')i++;rec.push(field);field='';if(rec.some(x=>x!==''))out.push(rec.splice(0));else rec.length=0;}else field+=c;}
  rec.push(field);if(rec.some(x=>x!==''))out.push(rec);const [head,...body]=out;if(!head)return[];head[0]=head[0].replace(/^\ufeff/,'');return body.map(cols=>Object.fromEntries(head.map((h,i)=>[h,cols[i]??''])));};
 const raw=await Promise.all(['market_sector_catalog.csv','sector_breadth.csv','sector_stock_latest.csv','sector_breadth_status.json'].map(read));
 const [catalog,series,stocks]=raw.slice(0,3).map(parse);let status={};try{status=JSON.parse(raw[3]);}catch{}
 if(!catalog.length){$('sectorProgress').textContent='상장법인 업종 목록을 수집 중입니다. 첫 배치 실행 후 표시됩니다.';return;}
 const market=$('sectorMarket'),select=$('sectorSelect'),group=new Map(),history=new Map(),quotes=new Map();
 for(const row of catalog){const key=row.market+'|'+row.sector;if(!group.has(key))group.set(key,[]);group.get(key).push(row);}
 for(const row of series){const key=row.market+'|'+row.sector;if(!history.has(key))history.set(key,[]);history.get(key).push(row);}
 for(const row of stocks)quotes.set(row.market+'|'+row.code,row);
 for(const arr of history.values())arr.sort((a,b)=>a.date.localeCompare(b.date));
 $('sectorProgress').textContent=`업종 ${status.industry_done??history.size}/${status.industry_total??group.size}개 · 종목 ${status.stock_done??stocks.length}/${status.listed??catalog.length}개 수집 완료 · KIND 상장 목록 ${status.listed??catalog.length}개 · 갱신 ${status.updated_at??'—'}`;
 const n=v=>v===''?null:Number(v),fmt=v=>v==null||!Number.isFinite(+v)?'—':(+v).toLocaleString('ko-KR',{maximumFractionDigits:2});
 function sma(values,period){return values.map((_,i)=>{const a=values.slice(i-period+1,i+1);return a.length===period&&a.every(v=>v!==null)?Math.round(a.reduce((x,y)=>x+y,0)/period*100)/100:null;});}
 function plot(id,arr,column,period){const values=arr.map(r=>n(r[column]));const avg=sma(values,period);
  chart(id,{type:'line',data:{labels:arr.map(r=>r.date),datasets:[{label:column==='hli'?'250일 신고가 비율 (%)':'60일선 위 비율 (%)',data:values,borderColor:'#60a5fa',pointRadius:0,borderWidth:2,spanGaps:false},{label:period+'일 평균 (%)',data:avg,borderColor:'#f59e0b',pointRadius:0,borderWidth:2,spanGaps:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{callbacks:{afterBody:items=>{const r=arr[items[0]?.dataIndex];return r?`계산 가능 종목 ${column==='hli'?r.n250:r.n60}개`:'';}}}},scales:{x:{ticks:{maxTicksLimit:8},grid:{display:false}},y:{min:0,max:100,title:{display:true,text:'종목 비율 (%)'}}}}});}
 function show(){const key=market.value+'|'+select.value,arr=history.get(key)||[],members=group.get(key)||[],meta=status.groups?.[key],valid=meta&&+meta.target===members.length&&+meta.success+(meta.unavailable?.length||0)===members.length;
  const last=arr.at(-1);$('sectorNote').textContent=valid&&last?`${market.value} · ${select.value} · ${members.length}개 상장법인 · 가격 확보 ${meta.success}개 · 가격 없음 ${meta.unavailable?.length||0}개 · 시세 ${last.date} · 60일 계산 가능 ${last.n60}개 · 250일 계산 가능 ${last.n250}개. 업종 수집 ${meta.updated_at}`:`${market.value} · ${select.value} · ${members.length}개 상장법인 · 검증된 업종 시세 수집 대기`;
  plot('sectorBreadth',valid?arr:[],'breadth60',5);plot('sectorHli',valid?arr:[],'hli',10);
  const tbody=$('sectorStocks');tbody.replaceChildren();for(const r of members){const q=valid?quotes.get(r.market+'|'+r.code):null,tr=document.createElement('tr');const cells=[r.name,r.code,q?.date||'—',fmt(q?.close),fmt(q?.sma60),q?.above60===''||!q?'—':q.above60==='1'?'예':'아니요',q?.new_high===''||!q?'—':q.new_high==='1'?'예':'아니요'];for(const value of cells){const td=document.createElement('td');td.textContent=value;tr.append(td);}tbody.append(tr);}
 }
 function options(){const entries=[...group.entries()].filter(([k])=>k.startsWith(market.value+'|')).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));select.replaceChildren();for(const [key,members] of entries){const name=key.split('|').slice(1).join('|'),o=document.createElement('option');o.value=name;o.textContent=`${name} · ${members.length}개 · ${history.has(key)?'수집됨':'대기'}`;select.append(o);}show();}
 market.addEventListener('change',options);select.addEventListener('change',show);options();
})().catch(e=>{document.getElementById('sectorProgress').textContent='업종 자료 표시 오류: '+e.message;});
