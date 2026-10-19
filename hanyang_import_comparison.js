(async function(){
 const main=document.querySelector('main'), anchor=main.querySelector('.box');
 const panel=document.createElement('section');panel.className='box';panel.id='import-comparison';
 panel.innerHTML=`<h2 data-upd="hanyang_vietnam_imports.csv,hanyang_product_revenue.csv">베트남→한국 수입 · 제품별 연결매출 비교</h2>
 <p>VINA 생산 → 한양디지텍 → 삼성전자 납품 경로를 참고해, 베트남 상대국 수입과 해당 제품 매출을 비교합니다.</p>
 <p class="note">국가 전체 수입이므로 한양디지텍 전용 물량은 아닙니다. 수입액은 CIF·USD, 회사 매출은 KRW이며 거래가격·회계 인식 범위가 달라 금액 비율을 시장점유율로 해석할 수 없습니다.</p>
 <p class="muted" id="ic-status">수입·부문 매출을 불러오는 중…</p>
 <div class="controls"><label>비교 사업 <select id="ic-product" aria-label="수입 비교 사업"><option value="ssd">SSD · HS 8523511000</option><option value="memory_module">메모리모듈 · HS 8473304060</option></select></label>
 <label>집계 <select id="ic-frequency" aria-label="수입 비교 집계"><option value="quarterly">분기별 · 제품 매출 비교</option><option value="monthly">월별 · 수입 추이</option></select></label>
 <label>기간 <select id="ic-range" aria-label="수입 비교 기간"><option value="recent">최근 8분기 / 24개월</option><option value="all">2020년부터 전체</option></select></label></div>
 <div class="cards" id="ic-cards"></div><div class="grid"><div><h2 id="ic-amount-title">수입액 · 제품 매출</h2><div class="chart"><canvas id="ic-amount"></canvas></div></div><div><h2>YoY · 수입과 제품 매출</h2><div class="chart"><canvas id="ic-growth"></canvas></div></div></div>
 <p class="muted" id="ic-note"></p><div id="ic-table" class="table-wrap"></div>
 <h2>제품 매출 YoY와 수입 YoY의 상관관계</h2><div id="ic-correlation"></div>
 <p class="muted">실제 매출이 있는 분기만 비교합니다. 표본 8개 미만은 계산하지 않습니다. 과거 상관은 인과관계나 예측력 검증 결과가 아닙니다.</p>
 <a class="download" href="./hanyang_vietnam_imports.csv" download>월별 수입 CSV</a><a class="download" href="./hanyang_product_revenue.csv" download>제품별 분기 매출 CSV</a><a class="download" href="./hanyang_import_comparison_quarterly.csv" download>분기 비교 CSV</a>
 <p class="muted">출처: <a href="https://www.data.go.kr/data/15100475/openapi.do" target="_blank" rel="noopener">관세청 품목별 국가별 수출입실적</a> · 매출은 각 행의 KIND 공시 링크. 수입 월별 누락·빈 응답과 미공시 매출을 0으로 채우지 않습니다.</p>`;
 anchor.before(panel);
 const el=id=>document.getElementById(id),n=(v,d=1)=>v==null?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:d}),p=v=>v==null?'—':(v>0?'+':'')+n(v)+'%';let charts=[];
 function pearson(a){if(a.length<8)return null;const x=a.reduce((s,z)=>s+z[0],0)/a.length,y=a.reduce((s,z)=>s+z[1],0)/a.length;let xy=0,xx=0,yy=0;for(const z of a){xy+=(z[0]-x)*(z[1]-y);xx+=(z[0]-x)**2;yy+=(z[1]-y)**2;}return xx&&yy?xy/Math.sqrt(xx*yy):null;}
 try{
 const response=await fetch('./hanyang_import_comparison.json?t='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();
 function render(){charts.forEach(c=>c.destroy());charts=[];const seg=el('ic-product').value,month=el('ic-frequency').value==='monthly';let rows=(month?data.monthly:data.quarterly).filter(r=>r.segment===seg);if(el('ic-range').value==='recent')rows=rows.slice(month?-24:-8);
 const qs=data.quarterly.filter(r=>r.segment===seg),ms=data.monthly.filter(r=>r.segment===seg),last=(month?ms:qs).filter(r=>r.import_usd!=null).at(-1),financial=qs.filter(r=>r.revenue_krw!=null).at(-1);
 el('ic-status').textContent='수입 기준 '+ms[0].month+' ~ '+ms.at(-1).month+' · '+last.name+' 매출 '+(financial?.period||'미확보')+'까지 · 비교 데이터 생성 '+new Date(data.built_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST';
 el('ic-cards').innerHTML=[['베트남→한국 수입 (백만 USD)',n(last.import_usd/1e6),month?last.month:last.period],['수입 YoY',p(last.import_yoy_pct),'전년 동일기간'],[last.name+' 매출 (억원)',n(financial?.revenue_krw==null?null:financial.revenue_krw/1e8),financial?.period||'미공시'],['제품 매출 YoY',p(financial?.revenue_yoy_pct),financial?.period||'미공시']].map(([a,b,c])=>`<div class="card"><small>${a}</small><div class="value">${b}</div><small>${c}</small></div>`).join('');
 const labels=rows.map(r=>month?r.month:r.period),common={responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{rangeNav:false}};
 const amount=[{type:'bar',label:'베트남→한국 수입 (백만 USD·좌)',data:rows.map(r=>r.import_usd==null?null:r.import_usd/1e6),backgroundColor:'#60a5fa99',yAxisID:'y'}];
 amount.push(month?{type:'line',label:'수입 3개월 평균 (백만 USD·좌)',data:rows.map(r=>r.import_ma3_usd==null?null:r.import_ma3_usd/1e6),borderColor:'#fbbf24',pointRadius:2,yAxisID:'y',spanGaps:false}:{type:'line',label:last.name+' 연결매출 (억원·우)',data:rows.map(r=>r.revenue_krw==null?null:r.revenue_krw/1e8),borderColor:'#34d399',pointRadius:4,borderWidth:3,yAxisID:'y1',spanGaps:false});
 el('ic-amount-title').textContent=month?'월별 수입액 · 3개월 평균':'분기 수입액 · '+last.name+' 매출';
 charts.push(new Chart(el('ic-amount'),{data:{labels,datasets:amount},options:{...common,scales:{y:{beginAtZero:true,title:{display:true,text:'수입 (백만 USD·CIF)'}},...(!month?{y1:{position:'right',grid:{drawOnChartArea:false},title:{display:true,text:last.name+' 매출 (억원)'}}}:{})}}}));
 const growth=[{label:'수입액 YoY',data:rows.map(r=>r.import_yoy_pct),borderColor:'#60a5fa',spanGaps:false},{label:'수입중량 YoY',data:rows.map(r=>r.weight_yoy_pct),borderColor:'#fbbf24',borderDash:[4,3],spanGaps:false}];if(!month)growth.push({label:last.name+' 매출 YoY',data:rows.map(r=>r.revenue_yoy_pct),borderColor:'#34d399',borderWidth:3,spanGaps:false});
 charts.push(new Chart(el('ic-growth'),{type:'line',data:{labels,datasets:growth},options:{...common,scales:{y:{title:{display:true,text:'전년동기 대비 (%)'}}}}}));
 el('ic-note').textContent=month?'매출은 분기 공시값만 사용합니다. 분기 매출을 월별로 배분하지 않습니다.':'제품 매출은 공시 사업의 내용 표(백만원 반올림) 기준. Q2~Q4는 누적 차감. 미공시 분기는 빈 값. 각 매출의 원본·직전 누적 공시를 확인할 수 있습니다.';
 el('ic-table').innerHTML='<table><thead><tr>'+['기간','수입 (USD·CIF)','중량 (KG)','수입 YoY',month?'MoM':'QoQ','중량 YoY',month?'수입 3개월 평균 (USD)':last.name+' 매출 (억원)',...(month?[]:['제품 매출 YoY','제품 매출 QoQ','공시'])].map(t=>'<th>'+t+'</th>').join('')+'</tr></thead><tbody>'+[...rows].reverse().map(r=>'<tr><td>'+(month?r.month:r.period)+'</td><td class="num">'+n(r.import_usd,0)+'</td><td class="num">'+n(r.weight_kg,0)+'</td><td class="num">'+p(r.import_yoy_pct)+'</td><td class="num">'+p(month?r.import_mom_pct:r.import_qoq_pct)+'</td><td class="num">'+p(r.weight_yoy_pct)+'</td><td class="num">'+n(month?r.import_ma3_usd:r.revenue_krw==null?null:r.revenue_krw/1e8,month?0:1)+'</td>'+(!month?'<td class="num">'+p(r.revenue_yoy_pct)+'</td><td class="num">'+p(r.revenue_qoq_pct)+'</td><td>'+(r.revenue_source?'<a target="_blank" rel="noopener" href="'+r.revenue_source+'">당기 누적</a>':'—')+(r.revenue_prior_source?' · <a target="_blank" rel="noopener" href="'+r.revenue_prior_source+'">직전 누적</a>':'')+'</td>':'')+'</tr>').join('')+'</tbody></table>';
 const map=new Map(qs.map(r=>[r.period,r]));el('ic-correlation').innerHTML='<table><tr><th>비교</th><th>YoY 상관계수 r</th><th>표본</th></tr>'+[0,1].map(lag=>{const pairs=[];for(const r of qs){const q=+r.period.at(-1),y=+r.period.slice(0,4),prior=lag?(q===1?(y-1)+'-Q4':y+'-Q'+(q-1)):r.period,x=map.get(prior)?.import_yoy_pct;if(x!=null&&r.revenue_yoy_pct!=null)pairs.push([x,r.revenue_yoy_pct]);}const v=pearson(pairs);return '<tr><td>'+(lag?'수입 1분기 선행':'동일 분기')+'</td><td>'+(v==null?'표본 부족 또는 변동 없음':v.toFixed(3))+'</td><td>'+pairs.length+'개 분기</td></tr>';}).join('')+'</table>';
 }
 ['ic-product','ic-frequency','ic-range'].forEach(id=>el(id).addEventListener('change',render));render();
 }catch(e){el('ic-status').textContent='수입 비교 데이터 로딩 실패: '+e.message;}
})();
