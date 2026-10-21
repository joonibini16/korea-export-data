'use strict';
(async()=>{
 const $=id=>document.getElementById(id), fmt=(x,n=2)=>Number(x).toLocaleString('ko-KR',{minimumFractionDigits:n,maximumFractionDigits:n}), signed=(x,n=1)=>(x>0?'+':'')+fmt(x,n);
 let data, stockData, stockEntries, stockLoad, chart1, chart2, entries=[];
 // 수급 기준: all = 외국인+기관 합계, core = 외국인+투신·사모·연기금
 let OK=2;window.__flowOK=()=>OK;
 const BASIS={all:{file:'flow_oscillator.json',stocks:'flow_stocks.json',inst:'기관 합계',title:'외국인 + 기관 합계'},core:{file:'flow_oscillator_core.json',stocks:'flow_stocks_core.json',inst:'투신·사모·연기금',title:'외국인 + 투신·사모·연기금'}};
 const g=$('group');let basis=new URLSearchParams(location.search).get('basis')==='core'?'core':'all';
 async function loadBasis(b){
  const res=await fetch('./'+BASIS[b].file+'?v='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error(b==='core'?'투신·사모·연기금 기준 자료가 아직 준비되지 않았습니다(연기금 일별 자료 수집 중). 잠시 후 다시 확인하세요.':'HTTP '+res.status);
  const d=await res.json();data=d;basis=b;stockData=null;stockEntries=null;stockLoad=null;
  entries=Object.entries(data.groups);const keep=g.value||'top700';g.replaceChildren();
  for(const [key,x] of entries){const opt=document.createElement('option');opt.value=key;opt.textContent=x.name+(key.startsWith('sector:')?' · 업종':'');g.append(opt);}
  g.value=data.groups[keep]?keep:'top700';
  const inst=data.institution_label||BASIS[b].inst,title=data.basis_title||BASIS[b].title;
  $('ratioLabel').textContent=`${title} 순매수/시총`;$('flowsLabel').textContent=`외국인 / ${inst} 순매수 (억원)`;$('instHead').textContent=`${inst} 순매수`;
  document.querySelector('h1').firstChild.textContent=`수급 오실레이터 · ${title}`;
  $('basisNote').textContent=b==='core'?'투신·사모·연기금 = KRX 투자자 구분의 투신 + 사모 + 연기금 등. 금융투자(증권사 자기매매·차익거래·ETF 유동성공급), 보험, 은행, 기타금융은 제외합니다.':'기관 합계 = KRX 기관 합계(금융투자·보험·투신·사모·은행·기타금융·연기금 등). 금융투자의 차익거래·ETF 유동성공급 물량이 섞여 있습니다.';
  $('method').textContent=`기준일 ${data.asof} · 생성 ${data.updated_at.replace('T',' ').slice(0,19)} KST · ${data.source}. ${data.membership}. 동일 그룹의 일별 순매수와 시총을 먼저 합산한 뒤 비율을 계산하며, 개별 종목 비율을 단순 평균하지 않습니다.`;
  $('asof').textContent=`기준일 ${data.asof} · 갱신 ${data.updated_at.replace('T',' ').slice(0,19)} KST`;
 }
 try{await loadBasis(basis);}catch(e){if(basis==='core'){try{await loadBasis('all');}catch(e2){e=e2;}}if(!data){$('verdict').textContent='자료 수집 대기';$('explain').textContent='오실레이터 파일을 읽을 수 없습니다: '+e.message;return;}}
 $('basis').value=basis;
 function verdict(last,prev){const h=last[OK],p=prev[OK];if(h>0&&h>p)return ['초록 · 수급 개선','green','양(+)의 오실레이터가 전일보다 확대'];if(h<0&&h<p)return ['빨강 · 수급 악화','red','음(−)의 오실레이터가 전일보다 확대'];return ['노랑 · 방향 확인','yellow',h>=0?'양(+)이지만 전일보다 둔화':'음(−)이지만 전일보다 개선'];}
 function chart(canvas,datasets,ytitle){const price=datasets.some(d=>d.price);return new Chart($(canvas),{type:'line',data:{labels:datasets[0].dates,datasets:datasets.map(d=>({label:d.label,data:d.values,borderColor:d.color,backgroundColor:d.color,borderWidth:d.width||2,pointRadius:0,pointHoverRadius:4,spanGaps:false,tension:.12,yAxisID:d.price?'y1':'y',borderDash:d.dash||[]}))},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#cbd5e1'}},tooltip:{callbacks:{title:items=>items[0]?.label||'',label:c=>c.parsed.y==null?'':`${c.dataset.label}: ${c.dataset.yAxisID==='y1'?fmt(c.parsed.y,0)+'원':fmt(c.parsed.y,4)+'%p'}`}}},scales:{x:{ticks:{color:'#9aabc7',maxTicksLimit:9}},y:{position:'left',title:{display:true,text:ytitle,color:'#9aabc7'},ticks:{color:'#9aabc7'},grid:{color:'rgba(148,163,184,.15)'}},...(price?{y1:{position:'right',title:{display:true,text:'주가 (원)',color:'#9aabc7'},ticks:{color:'#9aabc7',callback:v=>Number(v).toLocaleString('ko-KR')},grid:{drawOnChartArea:false}}}:{})}}});}
 function render(){const stock=$('mode').value==='stock',x=stock?stockData?.stocks[$('stock').value]:data.groups[g.value];if(!x)return;const r=x.rows,last=r.at(-1),prev=r.at(-2),[label,color,explain]=verdict(last,prev);$('verdict').innerHTML=`<span class="light ${color}"></span>${label}`;$('hist').textContent=signed(last[OK],4)+'%p';$('ratio').textContent=signed(last[1],4)+'%';$('flows').textContent=`${signed(last[5])} / ${signed(last[6])}`;
  $('explain').textContent=`${x.name}${stock?' · '+x.market+' · 시총 '+x.rank+'위 · '+x.sector:''} · ${last[0]} · ${explain}. 전일 ${signed(prev[OK],4)}%p → 현재 ${signed(last[OK],4)}%p. ${stock?'개별 종목':`해당일 관측 ${last[8].toLocaleString()}종목 / 현재 그룹 ${x.universe.toLocaleString()}종목`}. 장중 값이 아니라 최신 KRX 수집 기준입니다.`;
  chart1?.destroy();chart2?.destroy();const dates=r.map(z=>z[0]);const osc=[{label:'오실레이터',dates,values:r.map(z=>z[OK]),color:'#fbbf24',width:2.7},{label:'0선',dates,values:r.map(()=>0),color:'#64748b',width:1}];const hasPrice=stock&&stockData.columns.includes('close_krw')&&r.some(z=>Number.isFinite(z[9]));if(hasPrice)osc.push({label:'종가 (원)',dates,values:r.map(z=>Number.isFinite(z[9])?z[9]:null),color:'#34d399',width:2.5,price:true});$('oscTitle').textContent=hasPrice?'수급 오실레이터 · 주가 (좌 %p / 우 원)':'수급 오실레이터 · 0선';chart1=chart('oscChart',osc,'%p');
 }
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function rankTable(){$('ranking').innerHTML=entries.map(([key,x])=>{const r=x.rows,a=r.at(-1),b=r.at(-2);return `<tr class="pick" data-key="${esc(key)}"><td>${esc(x.name)}</td><td>${a[8]} / ${x.universe}</td><td>${signed(a[OK],4)}%p</td><td>${signed(a[OK]-b[OK],4)}%p</td><td>${signed(a[1],4)}%</td><td>${signed(a[5])}억</td><td>${signed(a[6])}억</td></tr>`;}).join('');
 $('ranking').querySelectorAll('tr').forEach(row=>row.onclick=()=>{g.value=row.dataset.key;setMode('group');scrollTo({top:0,behavior:'smooth'});});}
 rankTable();g.onchange=render;render();
 $('basis').onchange=async()=>{const want=$('basis').value;try{await loadBasis(want);}catch(e){$('basis').value=basis;$('explain').textContent=e.message;return;}const url=new URL(location.href);if(want==='core')url.searchParams.set('basis','core');else url.searchParams.delete('basis');history.replaceState(null,'',url);rankTable();setMode($('mode').value);};
 $('stock').onchange=render;
 function filterStocks(){const query=$('stockSearch').value.trim().toLocaleLowerCase();const matched=stockEntries.filter(([code,x])=>code.includes(query)||x.name.toLocaleLowerCase().includes(query));const select=$('stock'),selected=select.value;select.replaceChildren(...matched.map(([code,x])=>{const opt=document.createElement('option');opt.value=code;opt.textContent=`${x.rank}위 · ${x.name} (${code}) · ${x.market}`;return opt;}));if(matched.some(([code])=>code===selected))select.value=selected;$('stockMatches').textContent=matched.length?`${matched.length}개 종목`:'검색 결과 없음';select.disabled=!matched.length;if(matched.length)render();else $('explain').textContent='일치하는 종목이 없습니다. 종목명 또는 6자리 코드를 다시 입력하세요.';}
 $('stockSearch').oninput=filterStocks;
 async function setMode(mode){
  $('mode').value=mode;const selected=mode==='stock';
  document.querySelectorAll('.view-tabs [role=tab]').forEach(tab=>{const active=tab.dataset.mode===mode;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
  $('flowView').setAttribute('aria-labelledby',selected?'stockTab':'groupTab');
  $('selectionLabel').textContent=selected?'종목 검색·선택':'시장·규모·업종 선택';$('selectionLabel').htmlFor=selected?'stockSearch':'group';
  g.hidden=selected;$('stock').hidden=!selected;$('stockSearch').hidden=!selected;$('stockMatches').hidden=!selected;$('groupRanking').hidden=selected;
  const url=new URL(location.href);if(selected)url.searchParams.set('view','stock');else url.searchParams.delete('view');history.replaceState(null,'',url);
  if(!selected){render();return;}
  if(!stockData){
   $('explain').textContent='개별 종목 시계열을 읽는 중입니다.';$('stock').disabled=true;
   if(!stockLoad)stockLoad=(async()=>{const res=await fetch('./'+BASIS[basis].stocks+'?v='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const result=await res.json();stockData=result;stockEntries=Object.entries(result.stocks).sort((a,b)=>a[1].rank-b[1].rank);})();
   try{await stockLoad;}catch(e){stockLoad=null;if($('mode').value==='stock')$('explain').textContent='종목별 자료를 읽을 수 없습니다: '+e.message;return;}
  }
  if($('mode').value==='stock')filterStocks();
 }
 document.querySelectorAll('.view-tabs [role=tab]').forEach((tab,index,tabs)=>{
  tab.onclick=()=>setMode(tab.dataset.mode);
  tab.onkeydown=event=>{let next;if(event.key==='ArrowRight'||event.key==='ArrowLeft')next=tabs[(index+1)%tabs.length];else if(event.key==='Home')next=tabs[0];else if(event.key==='End')next=tabs[tabs.length-1];if(next){event.preventDefault();next.focus();setMode(next.dataset.mode);}};
 });
 setMode(new URLSearchParams(location.search).get('view')==='stock'?'stock':'group');
})();

