// 시장별 업종 수급 오실레이터: KSP/KSQ 업종마다 업종 시가총액(검정·흰 선)과 오실레이터(빨강 선)를 한 장씩
(function(){
 const box=document.getElementById('secOsc');if(!box)return;
 const basis=new URLSearchParams(location.search).get('basis')==='core'?'core':'all';
 const FILE=basis==='core'?'flow_oscillator_core.json':'flow_oscillator.json';
 let D=null,mk='KOSDAQ',rng=90,sortBy='osc',charts=[];
 const sg=(v,d=4)=>v==null?'—':(v>0?'+':'')+v.toFixed(d);
 function draw(){
  charts.forEach(c=>c.destroy());charts=[];
  const C=D.columns,ix=k=>C.indexOf(k),io=(window.__flowOK&&window.__flowOK()===4)?ix('oscillator'):ix('macd'),ic=ix('cap_eok'),idt=ix('date');
  const G=Object.entries(D.groups).filter(([k])=>k.startsWith('msec:'+mk+':')).map(([k,g])=>{const r=g.rows,l=r.at(-1),p=r.at(-2);return {k,name:g.name,n:g.universe,rows:r,osc:l[io],prev:p?p[io]:null,cap:l[ic]};});
  G.sort((a,b)=>sortBy==='cap'?b.cap-a.cap:sortBy==='chg'?((b.osc-(b.prev??b.osc))-(a.osc-(a.prev??a.osc))):b.osc-a.osc);
  const grid=box.querySelector('.so-grid');
  grid.innerHTML=G.map((g,i)=>`<div class="so-card"><div class="so-h"><b>${g.name}</b><span>${g.n}종목</span></div><div class="so-v">최근 OSC <b style="color:${g.osc>=0?'#f87171':'#60a5fa'}">${sg(g.osc)}%p</b> <span class="muted">전일 대비 ${g.prev==null?'—':sg(g.osc-g.prev)} · ${g.osc>0&&g.osc>(g.prev??g.osc)?'수급 개선 확대':g.osc<0&&g.osc<(g.prev??g.osc)?'수급 악화 확대':g.osc>=0?'양(+)이나 둔화':'음(−)이나 개선'}</span></div><div class="so-c"><canvas id="so${i}"></canvas></div></div>`).join('')||'<p class="muted">자료가 아직 없습니다. 다음 수급 수집 후 표시됩니다.</p>';
  G.forEach((g,i)=>{const R=rng?g.rows.slice(-rng):g.rows;
   charts.push(new Chart(document.getElementById('so'+i),{type:'line',data:{labels:R.map(r=>r[idt]),datasets:[
    {label:'시가총액 (조원)',data:R.map(r=>r[ic]/1e4),borderColor:'#e2e8f0',backgroundColor:'#e2e8f0',borderWidth:1.8,pointRadius:0,yAxisID:'y'},
    {label:'오실레이터 (%p)',data:R.map(r=>r[io]),borderColor:'#ef4444',backgroundColor:'#ef4444',borderWidth:2,pointRadius:0,yAxisID:'y1'}]},
    options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
     plugins:{rangeNav:false,legend:{display:i===0,position:'bottom',labels:{color:'#cbd5e1',boxWidth:10,font:{size:11}}},tooltip:{callbacks:{label:c=>c.datasetIndex?`OSC ${sg(c.parsed.y)}%p`:`시총 ${c.parsed.y.toFixed(1)}조원`}}},
     scales:{x:{ticks:{color:'#94a3b8',maxTicksLimit:5,font:{size:10},callback:function(v){const s=this.getLabelForValue(v);return s.slice(5);}},grid:{color:'rgba(148,163,184,.08)'}},
      y:{position:'left',ticks:{color:'#cbd5e1',font:{size:10}},grid:{color:'rgba(148,163,184,.08)'}},
      y1:{position:'right',ticks:{color:'#f87171',font:{size:10}},grid:{drawOnChartArea:false}}}},
    plugins:[{id:'z',beforeDatasetsDraw(ch){const y=ch.scales.y1,a=ch.chartArea;if(!y||y.min>0||y.max<0)return;const p=y.getPixelForValue(0),c=ch.ctx;c.save();c.strokeStyle='rgba(248,113,113,.35)';c.setLineDash([4,4]);c.beginPath();c.moveTo(a.left,p);c.lineTo(a.right,p);c.stroke();c.restore();}}]}));});
  box.querySelector('.so-asof').textContent=`기준일 ${D.asof} · ${D.basis_title||''} · ${G.length}개 업종`;
 }
 fetch(FILE+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(d=>{D=d;
  box.querySelectorAll('[data-mk]').forEach(b=>b.onclick=()=>{mk=b.dataset.mk;box.querySelectorAll('[data-mk]').forEach(x=>{const on=x===b;x.classList.toggle('active',on);x.style.background=on?'#2563eb':'';x.style.color=on?'#fff':'';});draw();});
  box.querySelector('#soRange').onchange=e=>{rng=+e.target.value;draw();};box.querySelector('#soSort').onchange=e=>{sortBy=e.target.value;draw();};
  window.addEventListener('osckind',draw);draw();}).catch(e=>{box.querySelector('.so-grid').innerHTML='<p class="muted">업종 오실레이터 자료를 읽지 못했습니다.</p>';});
})();
