/* Auto-updating market Breadth charts using the same series as the signal card. */
(async()=>{
 const root=document.getElementById('dbBreadth'),status=document.getElementById('dbBreadthStatus');
 if(!root||!status)return;
 const fmt=v=>Number.isFinite(v)?v.toFixed(1):'—';
 const avg=(a,n,i)=>{const w=a.slice(i-n+1,i+1);return w.length===n&&w.every(Number.isFinite)?w.reduce((s,v)=>s+v,0)/n:null};
 try{
  const [krxRes,naverRes]=await Promise.all([
   fetch('./breadth_daily.json?v='+Date.now(),{cache:'no-store'}),
   fetch('./breadth_kr.csv?v='+Date.now(),{cache:'no-store'})
  ]);
  if(!krxRes.ok||!naverRes.ok)throw Error('수집 파일을 읽지 못했습니다');
  const krx=await krxRes.json(),csv=await naverRes.text();
  let source='KRX',data=Array.isArray(krx)?krx:[];
  if(!data.length){
   source='네이버 일봉 대체';
   const [head,...lines]=csv.trim().split(/\r?\n/),keys=head.split(',');
   data=lines.map(line=>{
    const cells=line.split(','),row=Object.fromEntries(keys.map((key,i)=>[key,cells[i]??'']));
    const num=v=>v===''?null:Number(v),n250=num(row.n250),nh=num(row.nh);
    return {date:row.date,market:row.market,breadth_60:num(row.breadth60),above_60:num(row.above60),eligible_60:num(row.n60),hli:n250&&nh!=null?nh/n250*100:null,new_high:nh,eligible_252:n250};
   });
  }
  const names=['KOSPI','KOSDAQ'],groups=names.map(m=>data.filter(x=>x.market===m&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date)));
  if(groups.some(rows=>rows.length<10||!Number.isFinite(rows.at(-1).breadth_60)))throw Error('시장별 추이 자료가 부족합니다');
  root.replaceChildren();
  const lastDates=groups.map(rows=>rows.at(-1).date);
  status.textContent='자동 갱신 · '+source+' 기준 · 코스피 '+lastDates[0]+' / 코스닥 '+lastDates[1]+' 자료. 20거래일 추이를 표시합니다. 평일 한국시간 09:30·10:30·13:00·15:40·21:30 수집 예약(실제 실행·배포는 지연될 수 있음). 장중 수치는 잠정치이며 15:40 이후 수집 자료를 종가 기준으로 확인하세요. 종전 DB 화면의 음수 Breadth와 계산식·표본이 달라 값이 이어지지 않습니다.';
  for(let m=0;m<2;m++){
   const rows=groups[m],name=names[m],latest=rows.at(-1);
   const breadth=rows.map(x=>x.breadth_60),hli=rows.map(x=>x.hli);
   const b5=breadth.map((_,i)=>avg(breadth,5,i)),h10=hli.map((_,i)=>avg(hli,10,i));
   const card=document.createElement('article');card.className='db-card';
   const head=document.createElement('div');head.className='db-head';
   const h3=document.createElement('h3');h3.textContent=name+' · '+latest.date;
   const count=document.createElement('span');count.textContent='60일선 위 '+(latest.above_60??'—')+'/'+(latest.eligible_60??'—');
   head.append(h3,count);card.append(head);
   const defs=[
    {label:'Breadth_60',ma:'5-SMA',values:breadth,mean:b5,color:'#fb784e',full:true},
    {label:'HLI (252일 신고가 비율)',ma:'10-SMA',values:hli,mean:h10,color:'#22d3ee'}
   ];
   for(const d of defs){
    const box=document.createElement('div');box.className='db-metric';
    const p=document.createElement('p');p.textContent=d.label+' '+fmt(d.values.at(-1))+'% · '+d.ma+' '+fmt(d.mean.at(-1))+'%';
    const wrap=document.createElement('div');wrap.className='db-plot';
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-label',name+' '+d.label+' 자동 갱신 추이');
    wrap.append(canvas);box.append(p,wrap);card.append(box);
    const tail=rows.slice(-20),offset=rows.length-tail.length;
    new Chart(canvas,{type:'line',data:{labels:tail.map(x=>x.date),datasets:[
     {label:d.label,data:d.values.slice(offset),borderColor:d.color,backgroundColor:d.color+'33',fill:true,borderWidth:3,pointRadius:2,pointHoverRadius:5,tension:0,spanGaps:false},
     {label:d.ma,data:d.mean.slice(offset),borderColor:'#34d399',backgroundColor:'#34d399',borderWidth:2,pointRadius:1,pointHoverRadius:4,tension:0,spanGaps:false}
    ]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false,axis:'x'},
     plugins:{legend:{labels:{color:'#cbd5e1'}},tooltip:{mode:'index',intersect:false,callbacks:{title:items=>items[0]?.label||'',label:item=>item.dataset.label+': '+fmt(item.parsed.y)+'%'}}},
     scales:{x:{ticks:{color:'#94a3b8',maxTicksLimit:6},grid:{display:false}},y:{min:0,max:d.full?100:(()=>{const v=[...d.values.slice(offset),...d.mean.slice(offset)].filter(Number.isFinite),mx=Math.max(1,...v)*1.3;const st=mx<=5?1:mx<=10?2:mx<=25?5:10;return Math.ceil(mx/st)*st;})(),ticks:{color:'#94a3b8',callback:v=>v+'%'},grid:{color:'rgba(148,163,184,.13)'}}}}});
   }
   const detail=document.createElement('details');detail.open=true;const sum=document.createElement('summary');sum.textContent='최근 5거래일 수치 표로 확인';
   const table=document.createElement('table');table.className='db-data-table';
   const thead=document.createElement('thead'),tr=document.createElement('tr');
   ['거래일','Breadth_60','5-SMA','HLI','10-SMA'].forEach(s=>{const th=document.createElement('th');th.textContent=s;tr.append(th)});
   thead.append(tr);const tbody=document.createElement('tbody');
   for(let i=Math.max(0,rows.length-5);i<rows.length;i++){
    const row=document.createElement('tr');
    [rows[i].date,fmt(breadth[i])+'%',fmt(b5[i])+'%',fmt(hli[i])+'%',fmt(h10[i])+'%'].forEach(s=>{const td=document.createElement('td');td.textContent=s;row.append(td)});
    tbody.append(row);
   }
   table.append(thead,tbody);detail.append(sum,table);card.append(detail);root.append(card);
  }
 }catch(e){status.textContent='시장 Breadth 추이를 표시하지 못했습니다: '+e.message;}
})();