/* Verified TRACE issue matrix: only CUSIPs with actual observations are shown. */
(async()=>{
 const root=document.getElementById('creditMatrix');if(!root)return;
 const parse=s=>{const [h,...lines]=s.trim().split(/\r?\n/);const cols=h.split(',');
  return lines.filter(Boolean).map(line=>Object.fromEntries(line.split(',').map((v,i)=>[cols[i],v])));};
 const groups=['전체','하이퍼스케일러','AI 클라우드·데이터센터 개발','반도체·하드웨어','데이터센터 리츠·인프라','전력','자금조달 (사모신용·투자자)'];
 const coreGroup={CRWV:groups[2],ORCL:groups[1],META:groups[1],AMZN:groups[1],MSFT:groups[1],
  GOOGL:groups[1],AAPL:groups[1],NVDA:groups[3],AVGO:groups[3]};
 const fmt=v=>Number.isFinite(v)?v.toFixed(2):'—', bp=v=>Number.isFinite(v)?Math.round(v).toLocaleString():'—';
 const pd=s=>s>0?(1-Math.exp(-5*s/10000/.6))*100:0;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 try{
  const urls=['bigtech_bonds.json','bigtech_bonds_hist.csv','corporate_spread_targets.json','corporate_spread_resolved.json','corporate_spreads_hist.csv','corporate_spreads_status.json'];
  const responses=await Promise.all(urls.map(x=>fetch('./'+x+'?v='+Date.now(),{cache:'no-store'})));
  if(responses.some(r=>!r.ok))throw Error('일부 자료가 아직 배포되지 않았습니다');
  const [base,coreCsv,targets,resolved,extraCsv,status]=await Promise.all(responses.map((r,i)=>i===1||i===4?r.text():r.json()));
  const meta={};
  base.bonds.forEach(x=>meta[x.t]={ticker:x.t,name:x.name,group:coreGroup[x.t]||groups[3],bond:x.bond,cusip:x.isin?.slice(2,11)});
  targets.targets.forEach(x=>{meta[x.t]={ticker:x.t,name:x.name,group:x.group,bond:resolved[x.t]?resolved[x.t].coupon+'% '+resolved[x.t].maturity.slice(0,4):'',cusip:resolved[x.t]?.cusip,rating:resolved[x.t]?.rating_sp||resolved[x.t]?.rating_moody||''}});
  const series={};
  for(const r of [...parse(coreCsv),...parse(extraCsv)]){
   if(!meta[r.ticker]||!/^\d{4}-\d\d-\d\d$/.test(r.date))continue;
   const y=Number(r.ytm),u=Number(r.ust);
   if(!Number.isFinite(y)||!Number.isFinite(u)||y<=0||u<=0)continue;
   (series[r.ticker]??=[]).push({date:r.date,y,u,s:(y-u)*100,source:r.source,cusip:r.cusip||meta[r.ticker].cusip});
  }
  const rows=Object.keys(series).map(t=>{
   const s=series[t].sort((a,b)=>a.date.localeCompare(b.date)),last=s.at(-1);
   if(s.length<2)return null;
   const prior=(days,window)=>{
    const target=Date.parse(last.date+'T00:00:00Z')-days*86400000;
    return s.filter(p=>Date.parse(p.date+'T00:00:00Z')<=target).at(-1)??null;
   };
   const delta=(days,window)=>{const p=prior(days,window);if(!p)return null;
    const target=Date.parse(last.date+'T00:00:00Z')-days*86400000;
    if(target-Date.parse(p.date+'T00:00:00Z')>window*86400000)return null;
    return last.s-p.s;};
   return {m:meta[t],s,last,d1:delta(30,15),d3:delta(91,20),dy:delta(365,30)};
  }).filter(Boolean).sort((a,b)=>b.last.s-a.last.s);
  const total=base.bonds.length+targets.targets.length;
  let selected='전체',opened='',chart=null;
  const style=document.createElement('style');
  style.textContent='.cm-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.cm-tabs button{border:1px solid #37465f;border-radius:16px;background:#18243b;color:#cbd5e1;padding:6px 10px;cursor:pointer}.cm-tabs button.on{border-color:#d9582b;color:#fff;background:#75331d}.cm-scroller{overflow:auto}.cm-table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}.cm-table th,.cm-table td{padding:9px 7px;border-bottom:1px solid #27334d;white-space:nowrap;text-align:right}.cm-table th:first-child,.cm-table td:first-child{text-align:left}.cm-table tr[data-t]{cursor:pointer}.cm-table tr[data-t]:hover,.cm-table tr.active{background:#263149}.cm-table tr.cm-group td{color:#93a4be;text-align:left;background:#121d31;font-size:11px}.cm-table .up{color:#fb7185}.cm-table .down{color:#34d399}.cm-bar{display:inline-block;background:#c95b35;height:7px;margin-left:5px;max-width:58px;border-radius:2px}.cm-detail{margin:14px 0}.cm-plot{height:270px}';
  document.head.append(style);
  const change=d=>d==null?'—':`<span class="${d>0?'up':'down'}">${d>0?'+':''}${Math.round(d)}</span>`;
  function render(){
   const visible=rows.filter(x=>selected==='전체'||x.m.group===selected);
   const missing=targets.targets.filter(x=>!series[x.t]).map(x=>x.t);
   root.innerHTML=`<p class="muted">FINRA TRACE 실제 체결 + FRED 동일 만기 미 국채 보간 · 확보 ${rows.length}/${total}개 회사 · 신규 후보 미확보 ${esc(missing.join(', ')||'없음')}. 수익률과 스프레드는 대표 채권 1종의 최종 거래일 기준입니다. 등급은 FINRA 채권 원장에 있는 경우에만 표시합니다.</p>
   <div class="cm-tabs">${groups.map(g=>`<button data-g="${esc(g)}" class="${g===selected?'on':''}">${esc(g)}</button>`).join('')}</div>
   <div class="cm-scroller"><table class="cm-table"><thead><tr><th>회사 · 대표 채권</th><th>등급</th><th>수익률</th><th>국채</th><th>스프레드 bp</th><th>1개월</th><th>3개월</th><th>1년</th><th>5년 위험모형</th><th>거래일</th></tr></thead><tbody>
   ${groups.slice(1).filter(g=>selected==='전체'||g===selected).map(g=>{const items=visible.filter(x=>x.m.group===g);return items.length?`<tr class="cm-group"><td colspan="10">${esc(g)} · ${items.length}개</td></tr>${items.map(r=>`<tr data-t="${esc(r.m.ticker)}" class="${r.m.ticker===opened?'active':''}"><td><b>${esc(r.m.name)}</b> <span class="muted">${esc(r.m.ticker)}</span><br><small class="muted">${esc(r.m.bond)} · ${esc(r.last.cusip)}</small></td><td>${esc(r.m.rating||'—')}</td><td>${fmt(r.last.y)}%</td><td>${fmt(r.last.u)}%</td><td><b>${bp(r.last.s)}</b><i class="cm-bar" style="width:${Math.min(58,Math.max(2,r.last.s/9))}px"></i></td><td>${change(r.d1)}</td><td>${change(r.d3)}</td><td>${change(r.dy)}</td><td>${pd(r.last.s).toFixed(1)}%</td><td>${esc(r.last.date)}</td></tr>`).join('')}`:''}).join('')}
   </tbody></table></div><p class="muted">행 클릭: 채권 스프레드 추이. 1개월·3개월·1년은 각각 해당 시점과 비교한 bp 변화입니다. 5년 위험모형 = 1−exp[−5×max(스프레드,0)/(10,000×0.6)]; 회수율 40% 가정의 단순 환산치이며 실제 CDS·신용평가사의 부도확률이 아닙니다. 무거래·미식별 채권은 값으로 채우지 않습니다.</p><div class="cm-detail" id="cmDetail"></div>`;
   draw();
  }
  function draw(){
   if(chart){chart.destroy();chart=null}
   const r=rows.find(x=>x.m.ticker===opened),el=document.getElementById('cmDetail');
   if(!r||!el)return;
   el.innerHTML=`<h3>${esc(r.m.name)} · ${esc(r.m.bond)} 스프레드 추이</h3><p class="muted">CUSIP ${esc(r.last.cusip)} · 최신 체결 ${esc(r.last.date)} · ${esc(r.last.source)}</p><div class="cm-plot"><canvas id="cmCanvas" aria-label="${esc(r.m.name)} 회사채 스프레드 추이"></canvas></div>`;
   const tail=r.s.slice(-260);
   chart=new Chart(document.getElementById('cmCanvas'),{type:'line',data:{labels:tail.map(p=>p.date),datasets:[{label:'스프레드 bp',data:tail.map(p=>p.s),borderColor:'#f97316',pointRadius:0,borderWidth:2,fill:false,tension:0}]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{tooltip:{callbacks:{label:item=>'스프레드 '+Math.round(item.parsed.y)+'bp'}}},scales:{x:{ticks:{maxTicksLimit:8}},y:{title:{display:true,text:'bp'}}}}});
  }
  root.addEventListener('click',e=>{const b=e.target.closest('button[data-g]');if(b){selected=b.dataset.g;render();return}
   const tr=e.target.closest('tr[data-t]');if(tr){opened=opened===tr.dataset.t?'':tr.dataset.t;render();}});
  render();
 }catch(e){root.textContent='회사채 비교 자료를 읽지 못했습니다: '+e.message}
})();
