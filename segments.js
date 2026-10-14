// 제품·부문별 분기 실적: company_segments.csv(KIND 정기보고서 주석 '영업부문 정보')로 매출·영업이익·OPM 그래프와 표를 그립니다.
(function(){
 let rows=null,lp=null,mode='rev',seq=0,cur=null,segCh=null;
 const PAL=['#60a5fa','#f59e0b','#34d399','#f472b6','#a78bfa','#f87171','#22d3ee','#facc15','#94a3b8','#fb923c'];
 const parse=t=>{const L=t.replace(/^﻿/,'').trim().split(/\r?\n/),h=L.shift().split(',');return L.map(l=>{const f=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,f[i]]));});};
 async function load(){if(rows)return rows;if(!lp)lp=fetch('company_segments.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>rows=t?parse(t):[]).catch(()=>rows=[]);return lp;}
 const eok=v=>v==null||v===''?null:Number(v)/1e8;
 const f0=v=>v==null?'—':Math.round(v).toLocaleString();const fp=v=>v==null||!isFinite(v)?'—':v.toFixed(1)+'%';
 const qAdd=(p,k)=>{const i=Number(p.slice(0,4))*4+Number(p.slice(-1))-1+k;return `${Math.floor(i/4)}-Q${i%4+1}`;};
 function draw(){const c=cur;if(!c)return;const box=document.getElementById('segBody'),note=document.getElementById('segNote');
  const my=rows.filter(r=>r.company_id===c.id);
  if(!my.length){box.innerHTML='<p class="muted">부문(제품)별 실적이 공시되지 않는 회사입니다. 정기보고서 주석의 영업부문 정보가 단일 부문이거나 형식이 달라 수집되지 않았습니다.</p>';note.textContent='';if(segCh){segCh.destroy();segCh=null;}return;}
  const periods=[...new Set(my.map(r=>r.period))].sort().slice(-12);const P8=periods.slice(-8);
  const last=periods.at(-1);const segNames=[...new Set(my.filter(r=>r.role==='segment'&&periods.includes(r.period)).map(r=>r.segment))];
  // 최근 분기에 있는 부문을 앞에, 매출 큰 순
  const val=(s,p,k)=>{const r=my.find(x=>x.segment===s&&x.period===p);return r?eok(k==='rev'?r.q_revenue:r.q_op):null;};
  segNames.sort((a,b)=>(val(b,last,'rev')??-1)-(val(a,last,'rev')??-1));
  const others=[...new Set(my.filter(r=>r.role!=='segment'&&periods.includes(r.period)).map(r=>r.segment+'|'+r.role))];
  const ds=segNames.map((s,i)=>{const col=PAL[i%PAL.length];
   if(mode==='opm')return{type:'line',label:s,data:periods.map(p=>{const a=val(s,p,'rev'),b=val(s,p,'op');return a>0&&b!=null?b/a*100:null;}),borderColor:col,backgroundColor:col,borderWidth:2,pointRadius:3,spanGaps:true};
   return{type:'bar',label:s,data:periods.map(p=>val(s,p,mode)),backgroundColor:col,stack:'s'};});
  // 표: 부문 × (매출·영업이익·OPM) × 최근 8분기 + 전년동기 대비
  const head=`<tr><th>부문</th><th>항목</th>${P8.map(p=>`<th>${p}</th>`).join('')}<th>YoY</th></tr>`;
  const line=(s,k,isOther)=>{const v=P8.map(p=>{if(k==='opm'){const a=val(s,p,'rev'),b=val(s,p,'op');return a>0&&b!=null?b/a*100:null;}return val(s,p,k);});
   const a=k==='opm'?null:val(s,last,k),b=k==='opm'?null:val(s,qAdd(last,-4),k);let y='—';
   if(k==='opm'){const o1=v.at(-1),r0=val(s,qAdd(last,-4),'rev'),o0=r0>0&&val(s,qAdd(last,-4),'op')!=null?val(s,qAdd(last,-4),'op')/r0*100:null;y=o1!=null&&o0!=null?((o1-o0)>0?'+':'')+(o1-o0).toFixed(1)+'%p':'—';}
   else if(a!=null&&b!=null){y=b>0?((a/b-1)*100>0?'+':'')+((a/b-1)*100).toFixed(1)+'%':(a>0&&b<=0?'흑전':a<=0&&b<0?'적지':'적전');}
   return `<td>${{rev:'매출',op:'영업이익',opm:'OPM'}[k]}</td>${v.map(x=>`<td class="${k!=='rev'&&x!=null&&x<0?'neg':''}">${k==='opm'?fp(x):f0(x)}</td>`).join('')}<td>${y}</td>`;};
  let body='';segNames.forEach((s,i)=>{body+=`<tr class="seg-first"><td rowspan="3"><span class="dot" style="background:${PAL[i%PAL.length]}"></span>${s}</td>${line(s,'rev')}</tr><tr>${line(s,'op')}</tr><tr>${line(s,'opm')}</tr>`;});
  for(const o of others){const [s,role]=o.split('|');body+=`<tr class="seg-first seg-other"><td rowspan="2">${role==='total'?'합계':'조정'} · ${s}</td>${line(s,'rev')}</tr><tr class="seg-other">${line(s,'op')}</tr>`;}
  box.innerHTML=`<div class="chart" style="height:320px"><canvas id="segChart"></canvas></div><div class="table" style="overflow:auto;margin-top:12px"><table class="seg-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  if(segCh)segCh.destroy();const ctx=document.getElementById('segChart');
  segCh=new Chart(ctx,{data:{labels:periods,datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:x=>`${x.dataset.label}: ${mode==='opm'?fp(x.parsed.y):f0(x.parsed.y)+'억'}`}}},
   scales:{x:{stacked:mode!=='opm'},y:{stacked:mode!=='opm',title:{display:true,text:mode==='opm'?'OPM (%)':mode==='rev'?'분기 매출 (억원)':'분기 영업이익 (억원)'}}}}});
  const chk=my.filter(r=>r.period===last&&r.check).map(r=>r.check)[0]||'';
  note.textContent=`단위 억원 · 분기 값 = 정기보고서 누적(YTD) 값의 차이(4분기 = 연간 − 3분기 누적). 부문 구분과 이름은 회사 공시 그대로이며 개편되면 이전 분기와 이어지지 않을 수 있습니다. 영업이익은 회사가 공시한 부문이익(일부 회사는 계속영업이익) 기준. ${chk==='ok'?'최근 분기 부문 합계가 연결 매출과 2% 안에서 일치합니다.':chk?'최근 분기 부문 합계와 연결 매출 차이: '+chk.replace('diff ','')+' (내부거래·기준 차이 가능).':''} 출처: KIND 정기보고서 주석 '영업부문 정보'.`;}
 window.renderSegments=async function(c){const my=++seq;cur=c;const sec=document.getElementById('segPanel');if(!sec)return;await load();if(my!==seq)return;document.getElementById('segTitle').textContent=c.name+' · 제품·부문별 분기 실적';draw();};
 document.addEventListener('click',e=>{const b=e.target.closest('#segMode button');if(!b)return;mode=b.dataset.m;document.querySelectorAll('#segMode button').forEach(x=>x.classList.toggle('on',x===b));draw();});
})();
