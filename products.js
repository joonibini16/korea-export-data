// 제품별 매출 구성 · 매출 비중 추이 · 제품 단가 추이 (국내: 정기보고서 / 해외: 회사 IR 공식 자료)
// 사용: <section id="prodPanel" data-src="kr|global"></section> + 회사 선택값을 window.__prodCompany 로 알려 주거나 select#company/#companyPick 을 감시
(function(){
 const sec=document.getElementById('prodPanel');if(!sec)return;
 const SRC=sec.dataset.src||'kr';
 const PAL=['#ef4444','#64748b','#f59e0b','#22c55e','#3b82f6','#a855f7','#06b6d4','#f97316','#84cc16','#ec4899'];
 const parse=t=>{const L=t.replace(/^﻿/,'').trim().split(/\r?\n/);const h=L.shift().split(',');return L.filter(Boolean).map(l=>{const o=[],re=/("([^"]|"")*"|[^,]*)(,|$)/g;let m;while((m=re.exec(l))&&o.length<h.length){o.push(m[1].replace(/^"|"$/g,'').replace(/""/g,'"'));if(m[3]==='')break;}return Object.fromEntries(h.map((k,i)=>[k,o[i]??'']));});};
 const get=f=>fetch(f+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>t?parse(t):[]).catch(()=>[]);
 let P=null,PR=null,G=null,charts=[],cur=null,mode='rev';
 const load=async()=>{if(SRC==='kr'){if(!P)[P,PR]=await Promise.all([get('company_products.csv'),get('company_prices.csv')]);}else if(!G){const [a,b]=await Promise.all([get('global_products.csv'),get('global_segments_sec.csv')]);const man=new Set(a.map(r=>r.company));G=[...a,...b.filter(r=>!man.has(r.company))];}};
 const pid=p=>p; // 'YYYY-Qn'
 const lab=p=>p.slice(2,4)+'.'+p.slice(-2);
 function destroy(){charts.forEach(c=>c.destroy());charts=[];}
 function data(id){
  if(SRC==='kr'){
   const rs=P.filter(r=>r.company_id===id&&r.q_revenue_KRW!==''),per=[...new Set(rs.map(r=>r.period))].sort();
   const items=[...new Set(rs.map(r=>r.product))];
   const rev={},sh={};rs.forEach(r=>{(rev[r.product]=rev[r.product]||{})[r.period]=Number(r.q_revenue_KRW)/1e8;(sh[r.product]=sh[r.product]||{})[r.period]=r.share_pct===''?null:Number(r.share_pct);});
   const pr={},pu={};PR.filter(r=>r.company_id===id).forEach(r=>{(pr[r.product]=pr[r.product]||{})[r.period]=Number(r.price);pu[r.product]=r.unit;});
   const bad=rs.filter(r=>r.check==='mismatch').length;
   return {warn:bad>rs.length*0.3?`⚠ 이 회사는 보고서의 합계와 품목 합이 다른 분기가 많습니다(${bad}/${rs.length}행) — 품목명 변경·부문 중복 가능성이 있어 참고용으로 보세요.`:'',per,items,rev,sh,pr,pu,unit:'억원',src:'정기보고서 II. 사업의 내용 「주요 제품 등의 현황」(누적 매출 → 분기 차이) · 「주요 제품 등의 가격변동추이」(기간 평균, 보고서 기재 단위)',vol:{}};
  }
  const rs=G.filter(r=>r.company===id),per=[...new Set(rs.map(r=>r.period))].sort();
  const rev={},sh={},pr={},pu={},vol={},vu={};
  rs.forEach(r=>{const v=Number(r.value);if(r.kind==='segment_revenue')(rev[r.item]=rev[r.item]||{})[r.period]=v;else if(r.kind==='share')(sh[r.item]=sh[r.item]||{})[r.period]=v;else if(r.kind==='price'){(pr[r.item]=pr[r.item]||{})[r.period]=v;pu[r.item]=r.unit;}else if(r.kind==='volume'){(vol[r.item]=vol[r.item]||{})[r.period]=v;vu[r.item]=r.unit;}});
  const items=[...new Set(rs.filter(r=>r.kind==='share'||r.kind==='segment_revenue').map(r=>r.item))];
  const pf={op_income:{},gross_profit:{},net_income:{},revenue:{}},sop={};
  rs.forEach(r=>{const v=Number(r.value);if(pf[r.kind])pf[r.kind][r.period]=v;else if(r.kind==='seg_op_income')(sop[r.item]=sop[r.item]||{})[r.period]=v;});
  return {pf,sop,per,items,rev,sh,pr,pu,vol,vu,unit:'백만 USD',src:!rs[0]?'':/SEC XBRL/.test(rs.find(r=>r.kind==='segment_revenue')?.source||'')?'미국 SEC 분기·연간 보고서(10-Q·10-K) 인라인 XBRL의 제품·부문별 매출 · 4분기 = 연간 − 1~3분기 합 · 분기는 회계분기 중간일이 속한 달력 분기 · 항목명은 공시 태그 영문명':'회사 IR 공식 자료(분기 경영보고서 등) · 부문 매출 = 총매출 × 공시 비중 · 단가 = 매출 ÷ 출하량'};
 }
 function render(id,name){
  cur=id;destroy();const d=data(id);
  if(!d.per.length&&!Object.keys(d.pr).length){if(SRC==='kr'){sec.hidden=true;return;}
   const have=[...new Set(G.filter(r=>r.kind==='segment_revenue').map(r=>r.company))].sort();const sel=document.getElementById('companyPick');const nm=t=>{const o=[...(sel?.options||[])].find(o=>o.value===t);return o?o.textContent.replace(/\s*·.*$/,''):t;};
   sec.hidden=false;sec.innerHTML=`<h2>${name} · 제품별 매출 구성·비중·단가</h2><p class="muted">이 기업은 아직 제품·사업부문별 매출 자료가 없습니다. 미국 SEC 공시(10-Q·10-K) 기업은 자동 수집되고, 그 밖의 해외 기업은 회사 IR 자료를 정리하는 대로 추가됩니다. 아래 기업을 누르면 바로 볼 수 있습니다(${have.length}곳).</p><div class="pd-have">${have.map(t=>`<button data-t="${t}">${nm(t)}</button>`).join('')}</div>`;
   sec.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{if(sel){sel.value=b.dataset.t;sel.dispatchEvent(new Event('change'));}});return;}
  sec.hidden=false;
  // 상위 6개 품목(최근 4분기 매출 합) + 나머지는 기타로 묶음
  const recent=d.per.slice(-4),tot=k=>recent.reduce((s,p)=>s+(d.rev[k]?.[p]||0),0);
  const items=[...d.items].sort((a,b)=>tot(b)-tot(a)),top=items.slice(0,6),rest=items.slice(6);
  const series=top.map(k=>({k,rev:d.rev[k]||{},sh:d.sh[k]||{}}));
  if(rest.length)series.push({k:'그 밖의 품목',rev:Object.fromEntries(d.per.map(p=>[p,rest.reduce((s,k)=>s+(d.rev[k]?.[p]||0),0)])),sh:Object.fromEntries(d.per.map(p=>[p,rest.reduce((s,k)=>s+(d.sh[k]?.[p]||0),0)]))});
  const lastP=d.per.at(-1),yago=lastP?`${Number(lastP.slice(0,4))-1}${lastP.slice(4)}`:null;
  const cleanU=u=>(u||'').replace(/[,\s]*%$/,'').trim();Object.keys(d.pu).forEach(k=>d.pu[k]=cleanU(d.pu[k]));
  const priceKeys=Object.keys(d.pr).filter(k=>Object.keys(d.pr[k]).length>=2).slice(0,8);
  sec.innerHTML=`<h2>${name} · 제품별 매출 구성·비중·단가</h2><p class="muted">${d.src}</p>${d.warn?`<p class="muted" style="color:#fbbf24">${d.warn}</p>`:''}
   <div class="pd-grid"><div><h3>제품별 분기 매출 (${d.unit})</h3><div class="pd-c"><canvas id="pdRev"></canvas></div></div>
   <div><h3>매출 비중 추이 (%)</h3><div class="pd-c"><canvas id="pdShare"></canvas></div></div></div>
   ${priceKeys.length?`<h3>제품 단가 추이 ${priceKeys.length>1?'(첫 값 = 100 지수, 툴팁에 실제 값)':''}</h3><div class="pd-c" style="height:300px"><canvas id="pdPrice"></canvas></div>`:''}
   <div style="overflow:auto"><table class="pd-t"><thead><tr><th class="l">품목</th><th>${lastP?lab(lastP):''} 매출</th><th>비중</th><th>전년 동기 비중</th><th>매출 YoY</th>${priceKeys.length?'<th>최근 단가</th><th>단가 YoY</th>':''}</tr></thead><tbody>${
    series.map((s,i)=>[s,i]).filter(([s])=>(s.rev[lastP]||0)>0).map(([s,i])=>{const v=s.rev[lastP],p=yago?s.rev[yago]:null,y=v!=null&&p>0?(v/p-1)*100:null;const pk=priceKeys.find(k=>k===s.k)||null;
     const pv=pk?d.pr[pk]:null,pps=pv?Object.keys(pv).sort():[],lp=pps.at(-1),py=lp?pv[`${Number(lp.slice(0,4))-1}${lp.slice(4)}`]:null;
     return `<tr><td class="l"><i style="background:${PAL[i%PAL.length]}"></i>${s.k}</td><td>${v==null?'—':Math.round(v).toLocaleString()}</td><td>${s.sh[lastP]==null?'—':s.sh[lastP].toFixed(1)+'%'}</td><td>${yago&&s.sh[yago]!=null?s.sh[yago].toFixed(1)+'%':'—'}</td><td class="${y>0?'up':y<0?'dn':''}">${y==null?'—':(y>0?'+':'')+y.toFixed(1)+'%'}</td>${priceKeys.length?`<td>${lp?Number(pv[lp]).toLocaleString()+' '+(d.pu[pk]||''):'—'}</td><td>${py?((pv[lp]/py-1)*100).toFixed(1)+'%':'—'}</td>`:''}</tr>`;}).join('')}
   </tbody></table></div>${priceKeys.length&&priceKeys.some(k=>!d.items.includes(k))?`<p class="muted">단가 항목: ${priceKeys.map(k=>k+' ('+(d.pu[k]||'단위 미기재')+')').join(' · ')}</p>`:''}`;
  const labels=d.per.map(lab),opt=(y,stack)=>({responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{rangeNav:false,legend:{position:'bottom',labels:{color:'#cbd5e1',boxWidth:12}}},scales:{x:{stacked:stack,ticks:{color:'#94a3b8',maxTicksLimit:14}},y:{stacked:stack,ticks:{color:'#94a3b8'},title:{display:true,text:y,color:'#94a3b8'}}}});
  charts.push(new Chart(document.getElementById('pdRev'),{type:'bar',data:{labels,datasets:series.map((s,i)=>({label:s.k,data:d.per.map(p=>s.rev[p]??null),backgroundColor:PAL[i%PAL.length]}))},options:opt(d.unit,true)}));
  charts.push(new Chart(document.getElementById('pdShare'),{type:'line',data:{labels,datasets:series.map((s,i)=>({label:s.k,data:d.per.map(p=>s.sh[p]??null),borderColor:PAL[i%PAL.length],backgroundColor:PAL[i%PAL.length],pointRadius:2.5,borderWidth:2,spanGaps:true}))},options:{...opt('%',false),scales:{...opt('%',false).scales,y:{ticks:{color:'#94a3b8',callback:v=>v+'%'},min:0}}}}));
  if(priceKeys.length){const pc=(k,i)=>{const j=series.findIndex(s=>s.k===k);return PAL[(j>=0?j:series.length+i)%PAL.length];};const pp=[...new Set(priceKeys.flatMap(k=>Object.keys(d.pr[k])))].sort(),idx=priceKeys.length>1;
   charts.push(new Chart(document.getElementById('pdPrice'),{type:'line',data:{labels:pp.map(lab),datasets:priceKeys.map((k,i)=>{const s=d.pr[k],b=s[Object.keys(s).sort()[0]];return{label:k,data:pp.map(p=>s[p]==null?null:idx?s[p]/b*100:s[p]),raw:pp.map(p=>s[p]??null),borderColor:pc(k,i),backgroundColor:pc(k,i),pointRadius:2.5,borderWidth:2.2,spanGaps:true};})},
    options:{...opt(idx?'지수(첫 값=100)':(d.pu[priceKeys[0]]||''),false),plugins:{rangeNav:false,legend:{position:'bottom',labels:{color:'#cbd5e1',boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${Number(c.dataset.raw[c.dataIndex]).toLocaleString()} ${d.pu[c.dataset.label]||''}`}}}}}));}
  if(SRC==='global'&&d.pf)profit(d,series);
 }
 // 매출 비중 변화와 이익률: 회사 전체 영업이익·매출총이익(SEC XBRL) + 사업부문 영업이익
 function profit(d,series){
  const per=[...new Set([...d.per,...Object.keys(d.pf.op_income)])].sort();
  const rev=p=>d.pf.revenue[p]??(series.reduce((a,s)=>a+(s.rev[p]||0),0)||null);
  const opm=p=>d.pf.op_income[p]!=null&&rev(p)?d.pf.op_income[p]/rev(p)*100:null,gpm=p=>d.pf.gross_profit[p]!=null&&rev(p)?d.pf.gross_profit[p]/rev(p)*100:null;
  if(!per.some(p=>opm(p)!=null))return;
  const top=series[0];const tsh=p=>top?.sh?.[p]??null;
  // 비중-이익률 관계(최근 12분기): 상관계수와 기울기
  const pts=per.slice(-12).map(p=>[tsh(p),opm(p)]).filter(x=>x[0]!=null&&x[1]!=null);
  let corr=null,slope=null;if(pts.length>=6){const n=pts.length,mx=pts.reduce((a,x)=>a+x[0],0)/n,my=pts.reduce((a,x)=>a+x[1],0)/n,sxy=pts.reduce((a,x)=>a+(x[0]-mx)*(x[1]-my),0),sxx=pts.reduce((a,x)=>a+(x[0]-mx)**2,0),syy=pts.reduce((a,x)=>a+(x[1]-my)**2,0);corr=sxx&&syy?sxy/Math.sqrt(sxx*syy):null;slope=sxx?sxy/sxx:null;}
  const L=per.filter(p=>opm(p)!=null).at(-1),Y=L&&`${Number(L.slice(0,4))-1}${L.slice(4)}`;const f=v=>v==null?'—':v.toFixed(1)+'%',dp=(a,b)=>a==null||b==null?'—':((a-b>=0?'+':'')+(a-b).toFixed(1)+'%p');
  const sopK=Object.keys(d.sop||{}).filter(k=>Object.keys(d.sop[k]).length>=4);
  const segM=k=>{const r=series.find(s=>s.k===k);return p=>r&&r.rev[p]&&d.sop[k][p]!=null?d.sop[k][p]/r.rev[p]*100:null;};
  const box=document.createElement('div');box.innerHTML=`<h3>매출 비중과 이익 변화</h3><p class="muted">막대 = 회사 전체 영업이익(백만 USD), 선 = 영업이익률·매출총이익률(오른쪽 축), 점선 = 최대 품목(${top?top.k:'—'}) 매출 비중. 영업이익·매출총이익은 SEC 공시의 회사 전체 값입니다.</p>
   <div class="pd-c" style="height:330px"><canvas id="pdProfit"></canvas></div>
   <table class="pd-t"><thead><tr><th class="l">지표</th><th>${L?lab(L):''}</th><th>전년 동기</th><th>변화</th></tr></thead><tbody>
    <tr><td class="l">${top?top.k:'최대 품목'} 매출 비중</td><td>${f(tsh(L))}</td><td>${f(tsh(Y))}</td><td>${dp(tsh(L),tsh(Y))}</td></tr>
    <tr><td class="l">영업이익률</td><td>${f(opm(L))}</td><td>${f(opm(Y))}</td><td>${dp(opm(L),opm(Y))}</td></tr>
    <tr><td class="l">매출총이익률</td><td>${f(gpm(L))}</td><td>${f(gpm(Y))}</td><td>${dp(gpm(L),gpm(Y))}</td></tr>
    <tr><td class="l">영업이익 (백만 USD)</td><td>${d.pf.op_income[L]!=null?Math.round(d.pf.op_income[L]).toLocaleString():'—'}</td><td>${d.pf.op_income[Y]!=null?Math.round(d.pf.op_income[Y]).toLocaleString():'—'}</td><td>${d.pf.op_income[L]!=null&&d.pf.op_income[Y]>0?((d.pf.op_income[L]/d.pf.op_income[Y]-1)*100).toFixed(1)+'%':'—'}</td></tr>
   </tbody></table>
   <p class="pd-int">${corr==null?'비중과 이익률의 관계를 계산할 분기 수가 부족합니다.':`최근 ${pts.length}분기 기준 <b>${top.k}</b> 비중과 영업이익률의 상관계수 <b>${corr.toFixed(2)}</b>, 비중 1%p 변화당 영업이익률 <b>${slope>=0?'+':''}${slope.toFixed(2)}%p</b>. ${Math.abs(corr)>=0.6?(corr>0?'고마진 품목 비중이 커질수록 이익률이 오르는 <em>믹스 개선</em> 구조가 뚜렷합니다.':'이 품목 비중이 커질수록 이익률이 낮아지는 구조입니다(저마진 품목이거나 성장 투자 단계).'):'비중 변화와 이익률의 연관이 약해, 이익률은 가격·원가 등 다른 요인 영향이 큽니다.'} (상관은 인과가 아니며, 회사 전체 이익률 기준입니다.)`}</p>
   ${sopK.length?`<h3>사업부문별 영업이익·이익률</h3><p class="muted">막대 = 부문 영업이익(공시 기준 부문 이익), 선 = 부문 이익률(부문 영업이익 ÷ 같은 이름 부문 매출, 오른쪽 축). 회사가 부문 구분을 바꾼 구간은 끊겨 보일 수 있습니다.</p><div class="pd-c" style="height:330px"><canvas id="pdSegOp"></canvas></div>`:''}`;
  sec.appendChild(box);
  const labels=per.map(lab),axisC={ticks:{color:'#94a3b8'}};
  charts.push(new Chart(document.getElementById('pdProfit'),{data:{labels,datasets:[
   {type:'bar',label:'영업이익',data:per.map(p=>d.pf.op_income[p]??null),backgroundColor:per.map(p=>(d.pf.op_income[p]??0)>=0?'rgba(96,165,250,.6)':'rgba(248,113,113,.7)'),yAxisID:'y'},
   {type:'line',label:'영업이익률',data:per.map(opm),borderColor:'#f59e0b',backgroundColor:'#f59e0b',yAxisID:'y1',pointRadius:2,borderWidth:2.2,spanGaps:true},
   {type:'line',label:'매출총이익률',data:per.map(gpm),borderColor:'#34d399',backgroundColor:'#34d399',yAxisID:'y1',pointRadius:2,borderWidth:2,spanGaps:true},
   {type:'line',label:(top?top.k:'최대 품목')+' 비중',data:per.map(tsh),borderColor:'#f87171',backgroundColor:'#f87171',borderDash:[5,4],yAxisID:'y1',pointRadius:1.5,borderWidth:2,spanGaps:true}]},
   options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{rangeNav:false,legend:{position:'bottom',labels:{color:'#cbd5e1',boxWidth:12}}},scales:{x:{ticks:{color:'#94a3b8',maxTicksLimit:14}},y:{...axisC,title:{display:true,text:'백만 USD',color:'#94a3b8'}},y1:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#94a3b8',callback:v=>v+'%'}}}}}));
  if(sopK.length){const ds=[];sopK.forEach((k,i)=>{const c=PAL[(series.findIndex(s=>s.k===k)+PAL.length)%PAL.length]||PAL[i%PAL.length];ds.push({type:'bar',label:k+' 영업이익',data:per.map(p=>d.sop[k][p]??null),backgroundColor:c+'aa',stack:'op',yAxisID:'y'});const m=segM(k);if(per.some(p=>m(p)!=null))ds.push({type:'line',label:k+' 이익률',data:per.map(m),borderColor:c,backgroundColor:c,yAxisID:'y1',pointRadius:2,borderWidth:2,spanGaps:true});});
   charts.push(new Chart(document.getElementById('pdSegOp'),{data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{rangeNav:false,legend:{position:'bottom',labels:{color:'#cbd5e1',boxWidth:12}}},scales:{x:{stacked:true,ticks:{color:'#94a3b8',maxTicksLimit:14}},y:{stacked:true,...axisC},y1:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'#94a3b8',callback:v=>v+'%'}}}}}));}
 }
 async function tick(){
  const sel=document.getElementById(SRC==='kr'?'company':'companyPick');const id=window.__prodCompany||sel?.value;if(!id||id===cur)return;
  await load();const name=sel?.selectedOptions?.[0]?.textContent?.replace(/\s*\(.*$/,'').replace(/\s*·.*$/,'')||id;render(id,name);}
 setInterval(tick,600);
})();
