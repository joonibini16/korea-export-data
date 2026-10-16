// 제품별 매출 구성 · 매출 비중 추이 · 제품 단가 추이 (국내: 정기보고서 / 해외: 회사 IR 공식 자료)
// 사용: <section id="prodPanel" data-src="kr|global"></section> + 회사 선택값을 window.__prodCompany 로 알려 주거나 select#company/#companyPick 을 감시
(function(){
 const sec=document.getElementById('prodPanel');if(!sec)return;
 const SRC=sec.dataset.src||'kr';
 const PAL=['#ef4444','#64748b','#f59e0b','#22c55e','#3b82f6','#a855f7','#06b6d4','#f97316','#84cc16','#ec4899'];
 const parse=t=>{const L=t.replace(/^﻿/,'').trim().split(/\r?\n/);const h=L.shift().split(',');return L.filter(Boolean).map(l=>{const o=[],re=/("([^"]|"")*"|[^,]*)(,|$)/g;let m;while((m=re.exec(l))&&o.length<h.length){o.push(m[1].replace(/^"|"$/g,'').replace(/""/g,'"'));if(m[3]==='')break;}return Object.fromEntries(h.map((k,i)=>[k,o[i]??'']));});};
 const get=f=>fetch(f+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>t?parse(t):[]).catch(()=>[]);
 let P=null,PR=null,G=null,charts=[],cur=null,mode='rev';
 const load=async()=>{if(SRC==='kr'){if(!P)[P,PR]=await Promise.all([get('company_products.csv'),get('company_prices.csv')]);}else if(!G)G=await get('global_products.csv');};
 const pid=p=>p; // 'YYYY-Qn'
 const lab=p=>p.slice(2,4)+'.'+p.slice(-2);
 function destroy(){charts.forEach(c=>c.destroy());charts=[];}
 function data(id){
  if(SRC==='kr'){
   const rs=P.filter(r=>r.company_id===id&&r.q_revenue_KRW!==''),per=[...new Set(rs.map(r=>r.period))].sort();
   const items=[...new Set(rs.map(r=>r.product))];
   const rev={},sh={};rs.forEach(r=>{(rev[r.product]=rev[r.product]||{})[r.period]=Number(r.q_revenue_KRW)/1e8;(sh[r.product]=sh[r.product]||{})[r.period]=r.share_pct===''?null:Number(r.share_pct);});
   const pr={},pu={};PR.filter(r=>r.company_id===id).forEach(r=>{(pr[r.product]=pr[r.product]||{})[r.period]=Number(r.price);pu[r.product]=r.unit;});
   return {per,items,rev,sh,pr,pu,unit:'억원',src:'정기보고서 II. 사업의 내용 「주요 제품 등의 현황」(누적 매출 → 분기 차이) · 「주요 제품 등의 가격변동추이」(기간 평균, 보고서 기재 단위)',vol:{}};
  }
  const rs=G.filter(r=>r.company===id),per=[...new Set(rs.map(r=>r.period))].sort();
  const rev={},sh={},pr={},pu={},vol={},vu={};
  rs.forEach(r=>{const v=Number(r.value);if(r.kind==='segment_revenue')(rev[r.item]=rev[r.item]||{})[r.period]=v;else if(r.kind==='share')(sh[r.item]=sh[r.item]||{})[r.period]=v;else if(r.kind==='price'){(pr[r.item]=pr[r.item]||{})[r.period]=v;pu[r.item]=r.unit;}else if(r.kind==='volume'){(vol[r.item]=vol[r.item]||{})[r.period]=v;vu[r.item]=r.unit;}});
  const items=[...new Set(rs.filter(r=>r.kind==='share'||r.kind==='segment_revenue').map(r=>r.item))];
  return {per,items,rev,sh,pr,pu,vol,vu,unit:'백만 USD',src:rs[0]?.source?'회사 IR 공식 자료(분기 경영보고서 등) · 부문 매출 = 총매출 × 공시 비중 · 단가 = 매출 ÷ 출하량':''};
 }
 function render(id,name){
  cur=id;destroy();const d=data(id);
  if(!d.per.length&&!Object.keys(d.pr).length){sec.hidden=true;return;}sec.hidden=false;
  // 상위 6개 품목(최근 4분기 매출 합) + 나머지는 기타로 묶음
  const recent=d.per.slice(-4),tot=k=>recent.reduce((s,p)=>s+(d.rev[k]?.[p]||0),0);
  const items=[...d.items].sort((a,b)=>tot(b)-tot(a)),top=items.slice(0,6),rest=items.slice(6);
  const series=top.map(k=>({k,rev:d.rev[k]||{},sh:d.sh[k]||{}}));
  if(rest.length)series.push({k:'그 밖의 품목',rev:Object.fromEntries(d.per.map(p=>[p,rest.reduce((s,k)=>s+(d.rev[k]?.[p]||0),0)])),sh:Object.fromEntries(d.per.map(p=>[p,rest.reduce((s,k)=>s+(d.sh[k]?.[p]||0),0)]))});
  const lastP=d.per.at(-1),yago=lastP?`${Number(lastP.slice(0,4))-1}${lastP.slice(4)}`:null;
  const cleanU=u=>(u||'').replace(/[,\s]*%$/,'').trim();Object.keys(d.pu).forEach(k=>d.pu[k]=cleanU(d.pu[k]));
  const priceKeys=Object.keys(d.pr).filter(k=>Object.keys(d.pr[k]).length>=2).slice(0,8);
  sec.innerHTML=`<h2>${name} · 제품별 매출 구성·비중·단가</h2><p class="muted">${d.src}</p>
   <div class="pd-grid"><div><h3>제품별 분기 매출 (${d.unit})</h3><div class="pd-c"><canvas id="pdRev"></canvas></div></div>
   <div><h3>매출 비중 추이 (%)</h3><div class="pd-c"><canvas id="pdShare"></canvas></div></div></div>
   ${priceKeys.length?`<h3>제품 단가 추이 ${priceKeys.length>1?'(첫 값 = 100 지수, 툴팁에 실제 값)':''}</h3><div class="pd-c" style="height:300px"><canvas id="pdPrice"></canvas></div>`:''}
   <div style="overflow:auto"><table class="pd-t"><thead><tr><th class="l">품목</th><th>${lastP?lab(lastP):''} 매출</th><th>비중</th><th>전년 동기 비중</th><th>매출 YoY</th>${priceKeys.length?'<th>최근 단가</th><th>단가 YoY</th>':''}</tr></thead><tbody>${
    series.map((s,i)=>{const v=s.rev[lastP],p=yago?s.rev[yago]:null,y=v!=null&&p>0?(v/p-1)*100:null;const pk=priceKeys.find(k=>k===s.k)||null;
     const pv=pk?d.pr[pk]:null,pps=pv?Object.keys(pv).sort():[],lp=pps.at(-1),py=lp?pv[`${Number(lp.slice(0,4))-1}${lp.slice(4)}`]:null;
     return `<tr><td class="l"><i style="background:${PAL[i%PAL.length]}"></i>${s.k}</td><td>${v==null?'—':Math.round(v).toLocaleString()}</td><td>${s.sh[lastP]==null?'—':s.sh[lastP].toFixed(1)+'%'}</td><td>${yago&&s.sh[yago]!=null?s.sh[yago].toFixed(1)+'%':'—'}</td><td class="${y>0?'up':y<0?'dn':''}">${y==null?'—':(y>0?'+':'')+y.toFixed(1)+'%'}</td>${priceKeys.length?`<td>${lp?Number(pv[lp]).toLocaleString()+' '+(d.pu[pk]||''):'—'}</td><td>${py?((pv[lp]/py-1)*100).toFixed(1)+'%':'—'}</td>`:''}</tr>`;}).join('')}
   </tbody></table></div>${priceKeys.length&&priceKeys.some(k=>!d.items.includes(k))?`<p class="muted">단가 항목: ${priceKeys.map(k=>k+' ('+(d.pu[k]||'단위 미기재')+')').join(' · ')}</p>`:''}`;
  const labels=d.per.map(lab),opt=(y,stack)=>({responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{rangeNav:false,legend:{position:'bottom',labels:{color:'#cbd5e1',boxWidth:12}}},scales:{x:{stacked:stack,ticks:{color:'#94a3b8',maxTicksLimit:14}},y:{stacked:stack,ticks:{color:'#94a3b8'},title:{display:true,text:y,color:'#94a3b8'}}}});
  charts.push(new Chart(document.getElementById('pdRev'),{type:'bar',data:{labels,datasets:series.map((s,i)=>({label:s.k,data:d.per.map(p=>s.rev[p]??null),backgroundColor:PAL[i%PAL.length]}))},options:opt(d.unit,true)}));
  charts.push(new Chart(document.getElementById('pdShare'),{type:'line',data:{labels,datasets:series.map((s,i)=>({label:s.k,data:d.per.map(p=>s.sh[p]??null),borderColor:PAL[i%PAL.length],backgroundColor:PAL[i%PAL.length],pointRadius:2.5,borderWidth:2,spanGaps:true}))},options:{...opt('%',false),scales:{...opt('%',false).scales,y:{ticks:{color:'#94a3b8',callback:v=>v+'%'},min:0}}}}));
  if(priceKeys.length){const pc=(k,i)=>{const j=series.findIndex(s=>s.k===k);return PAL[(j>=0?j:series.length+i)%PAL.length];};const pp=[...new Set(priceKeys.flatMap(k=>Object.keys(d.pr[k])))].sort(),idx=priceKeys.length>1;
   charts.push(new Chart(document.getElementById('pdPrice'),{type:'line',data:{labels:pp.map(lab),datasets:priceKeys.map((k,i)=>{const s=d.pr[k],b=s[Object.keys(s).sort()[0]];return{label:k,data:pp.map(p=>s[p]==null?null:idx?s[p]/b*100:s[p]),raw:pp.map(p=>s[p]??null),borderColor:pc(k,i),backgroundColor:pc(k,i),pointRadius:2.5,borderWidth:2.2,spanGaps:true};})},
    options:{...opt(idx?'지수(첫 값=100)':(d.pu[priceKeys[0]]||''),false),plugins:{rangeNav:false,legend:{position:'bottom',labels:{color:'#cbd5e1',boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${Number(c.dataset.raw[c.dataIndex]).toLocaleString()} ${d.pu[c.dataset.label]||''}`}}}}}));}
 }
 async function tick(){
  const sel=document.getElementById(SRC==='kr'?'company':'companyPick');const id=window.__prodCompany||sel?.value;if(!id||id===cur)return;
  await load();const name=sel?.selectedOptions?.[0]?.textContent?.replace(/\s*\(.*$/,'').replace(/\s*·.*$/,'')||id;render(id,name);}
 setInterval(tick,600);
})();
