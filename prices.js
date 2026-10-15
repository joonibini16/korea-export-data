// 가격 지표 페이지: price_ref_history.csv(판독 참고치) + price_indicators_log.csv(매일 수집)
(function(){
 const parse=t=>{const L=t.replace(/^﻿/,'').trim().split(/\r?\n/),h=L.shift().split(',');return L.filter(Boolean).map(l=>{const f=l.split(',');return Object.fromEntries(h.map((k,i)=>[k,f[i]??'']));});};
 const DAY=864e5,ts=d=>Date.parse(d+'T00:00:00Z');
 const C={cy:'#2dd4bf',bl:'#5b8def',pu:'#c084fc',gr:'rgba(148,163,184,.45)'};
 const pct=(a,b)=>a!=null&&b?((a/b-1)*100):null;
 const sg=v=>v==null?'—':(v>=0?'+':'')+v.toFixed(2)+'%';
 const col=v=>v==null?'':v>=0?'up':'dn';
 const wow=s=>{if(!s.length)return null;const l=s.at(-1),t=ts(l.d)-7*DAY;let p=null;for(const x of s){if(ts(x.d)<=t)p=x;}return p?pct(l.v,p.v):null;};
 const ser=(rows,name)=>rows.filter(r=>r.series===name&&r.value!=='').map(r=>({d:r.date,v:+r.value})).sort((a,b)=>a.d.localeCompare(b.d));
 const lab=d=>d.slice(2,7).replace('-','.');
 const timeAxis=(ds)=>{let mn=Infinity,mx=-Infinity;(ds||[]).forEach(d=>(d.data||[]).forEach(p=>{if(p&&p.x!=null){if(p.x<mn)mn=p.x;if(p.x>mx)mx=p.x;}}));return {type:'linear',min:mn<Infinity?mn:undefined,max:mx>-Infinity?mx:undefined,ticks:{callback:v=>{const d=new Date(v);return String(d.getUTCFullYear()).slice(2)+'.'+String(d.getUTCMonth()+1).padStart(2,'0');},maxTicksLimit:10}};};
 const pts=s=>s.map(x=>({x:ts(x.d),y:x.v}));
 const base=()=>({responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false,axis:'x'},plugins:{legend:{position:'top',align:'start',labels:{boxWidth:12}},
  tooltip:{callbacks:{title:it=>new Date(it[0].parsed.x).toISOString().slice(0,10),label:t=>`${t.dataset.label}: ${t.parsed.y==null?'—':t.parsed.y.toLocaleString(undefined,{maximumFractionDigits:3})}`}}}});
 const L=(label,data,color,o={})=>Object.assign({type:'line',label,data,borderColor:color,backgroundColor:color,borderWidth:2.2,pointRadius:0,tension:0,parsing:false,spanGaps:true},o);
 Promise.all([fetch('price_ref_history.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text()),fetch('price_indicators_log.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.text():'date,series,value,unit,source\n').catch(()=>'date,series,value,unit,source\n'),
  fetch('price_indicators_status.json?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]).then(([a,b,stj])=>{
  const R=parse(a),G=parse(b);
  // 1) 토큰 지출 지수 (연결)
  {const ref=ser(R,'ref_tei'),own=ser(G,'or_price_per_m');let chain=[];
   if(own.length&&ref.length){const k=ref.at(-1).v/own[0].v;chain=[{d:ref.at(-1).d,v:ref.at(-1).v},...own.filter(x=>x.d>ref.at(-1).d).map(x=>({d:x.d,v:x.v*k}))];}
   const all=[...ref,...chain.slice(1)];const last=all.at(-1);
   document.getElementById('n1').textContent=`일별 이력 · ${ref[0]?.d||''} ~ ${last?.d||''}`;
   document.getElementById('b1').innerHTML=`WoW <span class="${col(wow(all))}">${sg(wow(all))}</span>`;
   const D1=[L('BADONION 지수(판독)',pts(ref),C.cy),L('자체 연결 지수(OpenRouter 가중평균 단가)',pts(chain),'#fbbf24',{borderDash:[5,3],pointRadius:chain.length<6?3:0})];new Chart(document.getElementById('c1'),{type:'line',data:{datasets:D1},
    options:{...base(),scales:{x:timeAxis(D1),y:{title:{display:true,text:'Index'}}}}});
   const o=own.at(-1),sp=ser(G,'or_spend_musd').at(-1),cv=ser(G,'or_priced_cover').at(-1);
   document.getElementById('f1').textContent=o?`최근 ${o.d}: 가중평균 단가 $${o.v.toFixed(3)}/백만 토큰 · 추정 일 지출 $${sp?sp.v.toFixed(2):'—'}M (가격 매칭 토큰 비중 ${cv?cv.v.toFixed(0):'—'}%)`:'자체 수집은 다음 실행부터 이어집니다.';}
  // 2) 토큰 사용량
  {const ref=ser(R,'ref_tokens_t'),own=ser(G,'or_tokens_t');const oD=new Set(own.map(x=>x.d));const all=[...ref.filter(x=>!oD.has(x.d)),...own].sort((a,b)=>a.d.localeCompare(b.d));
   document.getElementById('n2').textContent=`일별 전체 토큰 · ~ ${all.at(-1)?.d||''}`;
   const w=(()=>{const l=all.slice(-7),p=all.slice(-14,-7);if(l.length<7||p.length<7)return wow(all);return pct(l.reduce((s,x)=>s+x.v,0),p.reduce((s,x)=>s+x.v,0));})();
   document.getElementById('b2').innerHTML=`WoW(7일 합) <span class="${col(w)}">${sg(w)}</span>`;
   const D2=[{label:'판독(BADONION)',data:pts(ref.filter(x=>!oD.has(x.d))),backgroundColor:'rgba(91,141,239,.55)',parsing:false,barPercentage:1,categoryPercentage:1},{label:'자체 수집(OpenRouter API)',data:pts(own),backgroundColor:'#5b8def',parsing:false,barPercentage:1,categoryPercentage:1}];new Chart(document.getElementById('c2'),{type:'bar',data:{datasets:D2},
    options:{...base(),scales:{x:{...timeAxis(D2),offset:false,stacked:true},y:{stacked:false,beginAtZero:true,title:{display:true,text:'Total tokens (trillions)'}}}}});
   const l=all.at(-1);document.getElementById('f2').textContent=l?`최근 ${l.d}: ${l.v.toFixed(2)}조 토큰 · 30일 전 대비 ${sg(pct(l.v,(all.find(x=>ts(x.d)>=ts(l.d)-30*DAY)||{}).v))}`:'';}
  // 3) GPU
  {const K=[['a100','A100',C.bl,'y'],['h100','H100',C.cy,'y1'],['b200','B200 (NonHPS)',C.pu,'y2']];const ds=[],bd=[];
   K.forEach(([k,n,c,ax])=>{const ref=ser(R,'ref_gpu_'+k),own=ser(G,`gpu_${k}_vast`);
    // 원본(Vast.ai 중앙값) 우선: 원본이 있는 날부터는 원본의 일별 변화율로 이어 붙임(지수 수준은 판독 마지막 값 기준)
    let cont=[];if(own.length&&ref.length){const k0=ref.at(-1).v/own[0].v;cont=[ref.at(-1),...own.filter(x=>x.d>ref.at(-1).d).map(x=>({d:x.d,v:x.v*k0}))];}
    else if(own.length)cont=own;
    ds.push(L(n+(own.length?' (판독)':''),pts(ref),c,{yAxisID:ax}));if(cont.length)ds.push(L(n+' (원본 Vast.ai 연결)',pts(cont),c,{yAxisID:ax,borderDash:[5,3],pointRadius:cont.length<8?3:0}));
    const all=[...ref,...cont.slice(1)];bd.push(`${n.split(' ')[0]} <span class="${col(wow(all))}">${sg(wow(all))}</span>`);});
   document.getElementById('n3').textContent='일별 임대 지수 · 축 독립(왼쪽 A100 · 오른쪽 H100 · 맨 오른쪽 B200)';
   document.getElementById('b3').innerHTML=bd.join(' | ');
   const ax=(c,t,pos,grid)=>({position:pos,grid:{drawOnChartArea:grid},ticks:{color:c},title:{display:true,text:t,color:c}});
   new Chart(document.getElementById('c3'),{type:'line',data:{datasets:ds},options:{...base(),scales:{x:timeAxis(ds),y:ax(C.bl,'A100','left',true),y1:ax(C.cy,'H100','right',false),y2:ax(C.pu,'B200 (NonHPS)','right',false)}}});
   const t=K.map(([k,n])=>{const v=ser(G,`gpu_${k}_vast`).at(-1),c=ser(G,`gpu_${k}_vast_n`).at(-1),r=ser(G,`gpu_${k}_runpod_secure`).at(-1);return `${n.split(' ')[0]} Vast $${v?v.v.toFixed(2):'—'}(${c?c.v:'—'}건) · RunPod $${r?r.v.toFixed(2):'—'}`;}).join(' / ');
   const r0=K.map(([k,n])=>{const s=ser(R,'ref_gpu_'+k).at(-1);return `${n.split(' ')[0]} ${s?s.v.toFixed(2):'—'}`;}).join(' · ');
   document.getElementById('f3').textContent=`판독 최근(${ser(R,'ref_gpu_h100').at(-1)?.d}): ${r0} · 자체 수집: ${t}`;}
  // 4) DDR5
  {const r32=ser(R,'ref_ddr5_rdimm32_spot'),own32=ser(G,'ddr5_rdimm32_spot').filter(x=>!r32.length||x.d>r32.at(-1).d),r64=ser(R,'ref_ddr5_rdimm64_spot'),rc=ser(R,'ref_ddr5_rdimm64_contract'),sp=ser(R,'ref_ddr5_rdimm64_spread');
   const s32=[...r32,...own32];
   document.getElementById('n4').textContent=`${s32[0]?.d||''} ~ ${s32.at(-1)?.d||''} | 64GB 계약가는 판독치(~${rc.at(-1)?.d.slice(0,7)||''})`;
   document.getElementById('b4').textContent=`32GB $${s32.at(-1)?Math.round(s32.at(-1).v).toLocaleString():'—'} | 64GB $${r64.at(-1)?Math.round(r64.at(-1).v).toLocaleString():'—'} | Spread $${sp.at(-1)?sp.at(-1).v.toLocaleString():'—'} (${sp.at(-1)?.d.slice(0,7)||''})`;
   const D4=[
     L('32GB Spot Average',pts(r32),C.bl),...(own32.length?[L('32GB Spot (DRAMeXchange 자체)',pts([r32.at(-1),...own32].filter(Boolean)),C.bl,{borderDash:[2,2],pointRadius:3})]:[]),
     L('64GB Spot Average',pts(r64),C.cy),L('64GB Contract',pts(rc),C.cy,{borderDash:[7,4]}),
     {type:'bar',label:'64GB Spot - Contract (우)',data:pts(sp),backgroundColor:C.gr,yAxisID:'y1',parsing:false,barThickness:14,order:5}];new Chart(document.getElementById('c4'),{type:'bar',data:{datasets:D4},
    options:{...base(),scales:{x:timeAxis(D4),y:{beginAtZero:true,title:{display:true,text:'Price (USD/module)'}},y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:'64GB Spot - Contract (USD/module)'}}}}});
   const c=ser(G,'ddr5_16gb_chip_spot').at(-1),u=ser(G,'ddr5_udimm16_spot').at(-1);
   document.getElementById('f4').textContent=`DRAMeXchange 자체 수집: DDR5 RDIMM 32GB ${own32.at(-1)?'$'+own32.at(-1).v.toLocaleString()+' ('+own32.at(-1).d+')':'(다음 실행부터)'} · DDR5 UDIMM 16GB ${u?'$'+u.v+' ('+u.d+')':'—'} · DDR5 16Gb 칩 현물 ${c?'$'+c.v+' ('+c.d+')':'—'}`;}
  // 5) 자체 수집 GPU
  {const K=[['a100','A100',C.bl],['h100','H100',C.cy],['b200','B200',C.pu]];const D5=[];
   K.forEach(([k,n,c])=>{const v=ser(G,`gpu_${k}_vast`),r=ser(G,`gpu_${k}_runpod_secure`);D5.push(L(n+' Vast 중앙값',pts(v),c,{pointRadius:v.length<8?3:0}));D5.push(L(n+' RunPod Secure',pts(r),c,{borderDash:[5,3],borderWidth:1.5,pointRadius:r.length<8?2:0}));});
   new Chart(document.getElementById('c5'),{type:'line',data:{datasets:D5},options:{...base(),scales:{x:timeAxis(D5),y:{type:'logarithmic',title:{display:true,text:'USD / GPU·시간 (로그)'}}}}});}
  // 최근 수집값 표
  {const last={};G.forEach(r=>{if(!last[r.series]||r.date>=last[r.series].date)last[r.series]=r;});
   const NM={or_tokens_t:'OpenRouter 일별 토큰',or_price_per_m:'OpenRouter 가중평균 단가',or_spend_musd:'OpenRouter 추정 일 지출',or_priced_cover:'가격 매칭 토큰 비중',or_prompt_share:'입력(prompt) 토큰 비중',or_models:'집계 모델 수',
    gpu_a100_vast:'A100 SXM4 · Vast 중앙값',gpu_h100_vast:'H100 SXM · Vast 중앙값',gpu_b200_vast:'B200 · Vast 중앙값',gpu_a100_vast_n:'A100 · Vast 매물 수',gpu_h100_vast_n:'H100 · Vast 매물 수',gpu_b200_vast_n:'B200 · Vast 매물 수',
    gpu_a100_runpod_secure:'A100 SXM · RunPod Secure',gpu_h100_runpod_secure:'H100 SXM · RunPod Secure',gpu_b200_runpod_secure:'B200 · RunPod Secure',gpu_a100_runpod_comm:'A100 SXM · RunPod Community',gpu_h100_runpod_comm:'H100 SXM · RunPod Community',gpu_b200_runpod_comm:'B200 · RunPod Community',
    ddr5_rdimm32_spot:'DDR5 RDIMM 32GB 현물',ddr5_udimm16_spot:'DDR5 UDIMM 16GB 현물',ddr5_16gb_chip_spot:'DDR5 16Gb 칩 현물',ddr4_16gb_chip_spot:'DDR4 16Gb 칩 현물'};
   const ks=Object.keys(NM).filter(k=>last[k]);
   document.getElementById('kt').innerHTML=ks.length?'<thead><tr><th>항목</th><th>기준일</th><th>값</th><th>단위</th><th>전주 대비</th><th>출처</th></tr></thead><tbody>'+ks.map(k=>{const r=last[k],w=wow(ser(G,k));return `<tr><td>${NM[k]}</td><td>${r.date}</td><td>${(+r.value).toLocaleString(undefined,{maximumFractionDigits:3})}</td><td>${r.unit}</td><td class="${col(w)}">${w==null?'—':sg(w)}</td><td style="text-align:left;color:#93a3bd">${r.source}</td></tr>`;}).join('')+'</tbody>':'<tbody><tr><td>첫 자동 수집 전입니다.</td></tr></tbody>';
   document.getElementById('st').textContent=stj?`마지막 수집: ${stj.updated} · 누적 ${stj.rows}행${stj.errors&&stj.errors.length?' · 오류: '+stj.errors.join(' / '):''}`:'';}
 });
})();
