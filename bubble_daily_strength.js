/* Photo-inspired proxy. No original historical values are fabricated. */
(function(){
 'use strict';
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const fmt=x=>finite(x)?(x>0?'+':'')+x.toFixed(2)+'%':'—';
 function signal(x){return !finite(x)?'자료 부족':x>=90?'극단 과매수':x>=80?'과매수':x<=-90?'극단 과매도':x<=-80?'과매도':'중립';}
 const color=x=>!finite(x)?'#94a3b8':x>=80?'#ef4444':x<=-80?'#38bdf8':'#cbd5e1';
 async function run(){
  const root=document.getElementById('dailyStrength');if(!root)return;
  try{
   const response=await fetch('size_breadth.json?v='+Date.now(),{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const D=await response.json(),groups=D.daily_strength?.groups;
   if(!groups?.length)throw Error('신규 산식의 첫 수집 결과 대기 중');
   root.replaceChildren();
   const text=(tag,value,parent=root)=>{const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;};
   text('h2','결론 · 당일 과열/투매 편중도 (사진 기반 추정)');
   const p=text('p','기준일 '+D.live_day+' · 수집 '+D.updated_at.replace('T',' ')+' · 수집 시점 가격 기준 (장중은 잠정). 투자 매수·매도 확정 신호가 아닙니다.');p.className='muted';
   const grid=document.createElement('div');grid.className='db-grid';root.append(grid);
   for(const g of groups){
    const card=document.createElement('article');card.className='db-card';grid.append(card);
    const x=g.rows.at(-1);text('h3',g.name,card);
    const headline=text('p',fmt(x?.value)+' · '+signal(x?.value),card);headline.style.cssText='font-size:22px;font-weight:700;color:'+color(x?.value);
    text('p','5일 평균 '+fmt(x?.sma5)+' · 상승 '+x.up+' / 하락 '+x.down+' / 보합 '+x.flat+' / 누락 '+x.missing,card);
    text('p',!finite(x?.value)?'표본 부족으로 판단 보류':x.value<=-80?'하락이 광범위한 과매도권입니다. 반등 가능성과 추가 하락 위험이 공존하며 바닥 확인은 아닙니다.':x.value>=80?'상승이 광범위한 과매수권입니다. 강한 모멘텀일 수 있어 즉시 하락을 의미하지 않습니다.':'극단 구간이 아닙니다. 5일 평균의 개선·악화 방향을 함께 확인하세요.',card);
    const wrap=document.createElement('div');wrap.style.cssText='height:260px;position:relative';const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',g.name+' 과매수 과매도 추이');wrap.append(canvas);card.append(wrap);
    const rows=g.rows.slice(-120);
    if(typeof Chart!=='undefined')new Chart(canvas,{type:'line',data:{labels:rows.map(r=>r.date),datasets:[
     {label:'당일 편중도 (%)',data:rows.map(r=>r.value),borderColor:'#cbd5e1',borderWidth:2,pointRadius:2,pointBackgroundColor:rows.map(r=>color(r.value)),spanGaps:false},
     {label:'5거래일 평균 (%)',data:rows.map(r=>r.sma5),borderColor:'#34d399',borderWidth:2,pointRadius:0,spanGaps:false},
     ...[80,-80,90,-90].map(v=>({label:(v>0?'과매수 +':'과매도 ')+v+'%',data:rows.map(()=>v),borderColor:v>0?'#ef444488':'#38bdf888',borderDash:[4,4],pointRadius:0,borderWidth:1}))
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#cbd5e1',filter:item=>item.datasetIndex<2}},tooltip:{filter:item=>item.datasetIndex<2,callbacks:{label:c=>c.dataset.label+': '+fmt(c.parsed.y),afterBody:items=>{const r=rows[items[0]?.dataIndex];return r?'상승 '+r.up+' · 하락 '+r.down+' · 보합 '+r.flat+' · 누락 '+r.missing:'';}}}},scales:{x:{ticks:{color:'#94a3b8',maxTicksLimit:5}},y:{min:-100,max:100,ticks:{color:'#94a3b8',callback:v=>v+'%'}}}}});
   }
   const details=document.createElement('details');details.open=true;root.append(details);text('summary','최근 20거래일 · 날짜별 수치와 상태',details);
   const scroll=document.createElement('div');scroll.style.overflowX='auto';details.append(scroll);
   const table=document.createElement('table');table.className='db-data-table';scroll.append(table);
   const head=document.createElement('thead'),tr=document.createElement('tr');head.append(tr);table.append(head);
   ['날짜',...groups.map(g=>g.name)].forEach(s=>text('th',s,tr));const body=document.createElement('tbody');table.append(body);
   const dates=[...new Set(groups.flatMap(g=>g.rows.map(r=>r.date)))].sort().slice(-20).reverse();
   for(const date of dates){const row=document.createElement('tr');text('td',date,row);for(const g of groups){const x=g.rows.find(r=>r.date===date);const cell=text('td',fmt(x?.value)+' · '+signal(x?.value),row);cell.style.color=color(x?.value);}body.append(row);}
   const method=text('p','추정 산식: 100 × (전일 대비 상승 종목 수−하락 종목 수) ÷ (상승+하락 종목 수). 보합은 분모에서 제외, 전체 표본의 95% 미만이면 공란. ±80%·±90% 경계는 사진을 참고한 임시 기준이며 검증된 예측 기준이 아닙니다. 코스피/코스닥 상위 200/150은 현재 시총 순위 대용군으로 공식 KOSPI200·KOSDAQ150과 다릅니다. 과거에도 현재 구성 사용(생존·구성 편향), 원종가의 분할·권리락 영향 가능. 원본 지표 산식·전략 성과는 미확인, 사진 속 과거 값을 채워 넣지 않습니다. 출처: 네이버 증권 일봉·시총 목록. 기존 규모별 Breadth 수집 일정에 맞춰 재계산하고 날짜별 이력을 보존합니다.');method.className='muted';
  }catch(error){root.textContent='과매수·과매도 추정 지표: '+error.message+' — 기존 데이터는 변경하지 않습니다.';}
 }
 if(typeof module!=='undefined')module.exports={signal,fmt};
 if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();}
})();
