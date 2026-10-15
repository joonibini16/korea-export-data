// 수출확정치: 선택 품목의 국가별 YoY·MoM(월별) / YoY·QoQ(분기별) 표 — 비중 높은 순
(function(){
 const box=document.getElementById('cgBox');if(!box)return;
 let mode=null,period=null,item=null;
 const num=v=>Number(v||0);
 const money=v=>{const a=Math.abs(v);return a>=1e9?'$'+(v/1e9).toFixed(2)+'B':a>=1e6?'$'+(v/1e6).toFixed(1)+'M':a>=1e3?'$'+(v/1e3).toFixed(0)+'K':'$'+Math.round(v);};
 const pct=(a,b)=>b>0?(a/b-1)*100:null;
 const fp=v=>v==null?'—':(v>0?'+':'')+v.toFixed(1)+'%';
 const cls=v=>v==null?'':v>0?'cg-up':v<0?'cg-dn':'';
 const qOf=m=>m.slice(0,4)+'Q'+Math.ceil(+m.slice(5,7)/3);
 const prevM=m=>{let y=+m.slice(0,4),k=+m.slice(5,7)-1;if(!k){y--;k=12;}return y+'.'+String(k).padStart(2,'0');};
 const yAgo=m=>(+m.slice(0,4)-1)+m.slice(4);
 const prevQ=q=>{let y=+q.slice(0,4),k=+q.slice(5)-1;if(!k){y--;k=4;}return y+'Q'+k;};
 const qMonths=q=>{const y=q.slice(0,4),k=+q.slice(5);return [1,2,3].map(i=>y+'.'+String((k-1)*3+i).padStart(2,'0'));};

 function spark(vals,col){const W=96,H=22,v=vals.filter(x=>x!=null);if(v.length<2)return '';const lo=Math.min(...v),hi=Math.max(...v),r=hi-lo||1;
  const pts=vals.map((x,i)=>x==null?null:[(2+i*(W-4)/(vals.length-1)).toFixed(1),(H-2-(x-lo)/r*(H-4)).toFixed(1)]).filter(Boolean);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="2.2" fill="${col}"/></svg>`;}

 function render(){
  item=typeof selectedItem!=='undefined'?selectedItem:null;
  const rows=(typeof countryData!=='undefined'?countryData:[]).filter(r=>r['품목명']===item);
  if(!item||!rows.length){box.hidden=true;return;}box.hidden=false;
  if(!mode)mode=(document.getElementById('comparisonPeriod')?.value==='quarter')?'q':'m';
  // 국가 × 월 금액·중량
  const V={},W={},C={},months=new Set();
  rows.forEach(r=>{const k=r['국가명'];C[k]=r['국가코드'];(V[k]=V[k]||{})[r['월']]=num(r['수출금액_USD']);(W[k]=W[k]||{})[r['월']]=num(r['수출중량_KG']);months.add(r['월']);});
  const M=[...months].sort(),last=M.at(-1),has=new Set(M);
  const val=(k,ms)=>ms.every(m=>has.has(m))?ms.reduce((s,m)=>s+(V[k][m]||0),0):null;
  const wt=(k,ms)=>ms.every(m=>has.has(m))?ms.reduce((s,m)=>s+(W[k]?.[m]||0),0):null;
  // 기간 목록
  let P;
  if(mode==='m')P=[...M].reverse().map(m=>({id:m,lab:m,ms:[m],prev:[prevM(m)],yago:[yAgo(m)]}));
  else{const qs=[...new Set(M.map(qOf))].reverse();P=qs.map(q=>{const all=qMonths(q),ms=all.filter(m=>has.has(m)),full=ms.length===3;
   return {id:q,lab:q.replace('Q',' Q')+(full?'':` (진행 중 ${ms.length}개월)`),ms,prev:full?qMonths(prevQ(q)):null,yago:ms.map(yAgo),full};}).filter(p=>p.ms.length);}
  if(!P.find(p=>p.id===period))period=(mode==='q'?(P.find(p=>p.full)||P[0]):P[0]).id;
  const p=P.find(x=>x.id===period);
  const names=Object.keys(V);
  const T=ms=>ms?names.reduce((s,k)=>s+(val(k,ms)??0),0):null;
  const tot=T(p.ms),totY=val(names[0],p.yago)!=null?T(p.yago):null,totP=p.prev&&val(names[0],p.prev)!=null?T(p.prev):null;
  // 추이(최근 12개월 / 8분기)
  const trendIds=mode==='m'?M.filter(m=>m<=p.id).slice(-12).map(m=>[m]):(()=>{const qs=P.filter(x=>x.full&&x.id<=p.id).map(x=>x.id).reverse().slice(-8);return qs.map(qMonths);})();
  const R=names.map(k=>{const v=val(k,p.ms)||0,y=val(k,p.yago),pv=p.prev?val(k,p.prev):null,w=wt(k,p.ms),wy=wt(k,p.yago);
   const sh=tot?v/tot*100:0,shY=totY&&y!=null?y/totY*100:null;
   return {k,code:C[k],v,y,pv,sh,dsh:shY==null?null:sh-shY,yoy:pct(v,y),mom:pv==null?null:pct(v,pv),up:w&&wy&&y?pct(v/w,y/wy):null,
    contrib:totY&&y!=null?(v-y)/totY*100:null,tr:trendIds.map(ms=>val(k,ms))};});
  R.sort((a,b)=>(a.k==='기타')-(b.k==='기타')||b.v-a.v);
  const L2=mode==='m'?'MoM':'QoQ',L1=mode==='m'?'전년 동월':'전년 동기';
  const tYoY=pct(tot,totY),tMoM=totP==null?null:pct(tot,totP);
  box.innerHTML=`<h2 class="chart-title">${item} · 국가별 ${mode==='m'?'월별':'분기별'} 증감 (${p.lab})</h2>
  <div class="control-row cg-ctl"><span class="cg-tg">${[['m','월별'],['q','분기별']].map(([k,t])=>`<button data-mode="${k}" class="period${mode===k?' active':''}">${t}</button>`).join('')}</span>
   <label for="cgPeriod">기간</label><select id="cgPeriod">${P.map(x=>`<option value="${x.id}"${x.id===p.id?' selected':''}>${x.lab}</option>`).join('')}</select></div>
  <div class="table-wrapper"><table class="cg-t"><thead><tr><th>순위</th><th>국가</th><th>수출액</th><th>비중</th><th>비중 변화<div class="cg-s">${L1} 대비 %p</div></th><th>YoY</th><th>${L2}</th><th>YoY 기여도<div class="cg-s">전체 증감 중 %p</div></th><th>단가 YoY<div class="cg-s">$/kg</div></th><th>${L1} 금액</th><th>추이<div class="cg-s">${mode==='m'?'최근 12개월':'최근 8분기'}</div></th></tr></thead><tbody>
  ${R.map((r,i)=>`<tr${r.k==='기타'?' class="cg-etc"':''}><td class="center">${r.k==='기타'?'—':i+1}</td><td>${r.k} <span class="cg-s">${r.code||''}</span></td><td class="number">${money(r.v)}</td>
   <td class="number"><div class="cg-bar"><i style="width:${Math.min(100,r.sh).toFixed(1)}%"></i><span>${r.sh.toFixed(1)}%</span></div></td>
   <td class="number ${cls(r.dsh)}">${r.dsh==null?'—':(r.dsh>0?'+':'')+r.dsh.toFixed(1)}</td><td class="number ${cls(r.yoy)}"><b>${fp(r.yoy)}</b></td><td class="number ${cls(r.mom)}">${fp(r.mom)}</td>
   <td class="number ${cls(r.contrib)}">${r.contrib==null?'—':(r.contrib>0?'+':'')+r.contrib.toFixed(1)}</td><td class="number ${cls(r.up)}">${fp(r.up)}</td><td class="number">${r.y==null?'—':money(r.y)}</td><td>${spark(r.tr,r.yoy==null||r.yoy>=0?'#f87171':'#60a5fa')}</td></tr>`).join('')}
  <tr class="cg-tot"><td></td><td><b>합계</b></td><td class="number"><b>${money(tot)}</b></td><td class="number">100%</td><td></td><td class="number ${cls(tYoY)}"><b>${fp(tYoY)}</b></td><td class="number ${cls(tMoM)}">${fp(tMoM)}</td><td class="number ${cls(tYoY)}">${tYoY==null?'—':(tYoY>0?'+':'')+tYoY.toFixed(1)}</td><td></td><td class="number">${totY==null?'—':money(totY)}</td><td></td></tr></tbody></table></div>
  <p class="selection-hint">비중 높은 순(기타는 맨 아래). YoY 기여도 = (해당 국가 증감액 ÷ 전년 ${mode==='m'?'동월':'동기'} 전체 수출액), 국가별 기여도를 더하면 전체 YoY가 됩니다. ${mode==='q'?'분기는 3개월 합계이며, 진행 중 분기는 확보된 달만 전년 같은 달과 비교하고 QoQ는 표시하지 않습니다. ':''}출처: 관세청 수출입무역통계(확정치, 품목·국가별).</p>`;
  box.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;period=null;render();});
  box.querySelector('#cgPeriod').onchange=e=>{period=e.target.value;render();};
 }
 window.renderCountryGrowth=render;
 // 품목 선택·조회 기준(월별/분기별) 변경을 따라감
 const sel=document.getElementById('comparisonPeriod');if(sel)sel.addEventListener('change',()=>{mode=sel.value==='quarter'?'q':'m';period=null;render();});
 let lastItem=null;setInterval(()=>{const s=typeof selectedItem!=='undefined'?selectedItem:null;if(s!==lastItem){lastItem=s;period=null;render();}},400);
})();
