// Prices observed on the official public page; never present observation time as effective time.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('nebius-board')) return;
  const order = ['B300','B200','H200','H100','RTX PRO 6000'];
  const colors = ['#60a5fa','#34d399','#fbbf24','#c084fc','#fb7185','#22d3ee','#a3e635'];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = v => '$' + Number(v).toFixed(2);
  const percent = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  const time = (t, zone = 'Asia/Seoul') => new Intl.DateTimeFormat('ko-KR', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t));
  let data, rows = [], historyRows = [], chart, busy = false;
  function options(id, values, previous, defaultValue) {
    const select = $(id);select.replaceChildren();
    for (const [value, label] of values) {const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
    select.value = values.some(v=>v[0]===previous) ? previous : defaultValue;
  }
  function regions() {
    const names=[...new Set(rows.filter(r=>r.gpu===$('nebius-gpu').value).map(r=>r.region))].sort();
    options('nebius-region',[['all','전체 지역'],...names.map(r=>[r,r])],$('nebius-region').value,'all');
  }
  function series(gpu,region) {return rows.filter(r=>r.gpu===gpu&&r.region===region).sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));}
  function priceSeries(gpu,region) {
    const points=new Map();
    for(const r of historyRows.filter(r=>r.gpu===gpu&&r.region===region))points.set(Date.parse(r.price_at),{...r,observed_at:r.price_at});
    for(const r of series(gpu,region))points.set(Date.parse(r.observed_at),r);
    return [...points.values()].sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
  }
  function change(history, days, last) {
    const target=Date.parse(last.observed_at)-days*864e5;
    const prior=history.filter(r=>Date.parse(r.observed_at)<=target&&target-Date.parse(r.observed_at)<=2*3600e3).at(-1);
    return prior?.price_usd_per_gpu_hour>0?(last.price_usd_per_gpu_hour/prior.price_usd_per_gpu_hour-1)*100:null;
  }
  function draw() {
    const gpu=$('nebius-gpu').value, region=$('nebius-region').value, range=$('nebius-range').value;
    const markets=[...new Set(rows.filter(r=>r.gpu===gpu&&(region==='all'||r.region===region)).map(r=>r.region))].sort();
    const latest=markets.map(region=>({region,history:priceSeries(gpu,region),last:series(gpu,region).at(-1)}));
    const prices=latest.map(s=>s.last.price_usd_per_gpu_hour);
    $('nebius-summary').textContent=prices.length?`${gpu} · ${latest.length}개 지역 · ${money(Math.min(...prices))} ~ ${money(Math.max(...prices))} / GPU·시간`:'조회된 시장이 없습니다.';
    $('nebius-board').innerHTML='<thead><tr><th>GPU / 지역</th><th>Spot 가격</th><th>1일 대비</th><th>7일 대비</th><th>가격 적용 시각 (UTC)</th><th>마지막 관측 (KST)</th></tr></thead><tbody>'+latest.map(s=>`<tr><td>${esc(gpu)} / ${esc(s.region)}</td><td><b>${money(s.last.price_usd_per_gpu_hour)}</b></td><td>${percent(change(s.history,1,s.last))}</td><td>${percent(change(s.history,7,s.last))}</td><td>${esc(time(s.last.effective_at,'UTC'))}</td><td>${esc(time(s.last.observed_at))}${Date.parse(data.collected_at)-Date.parse(s.last.observed_at)>2*3600e3?' · 갱신 지연':''}</td></tr>`).join('')+'</tbody>';
    const end=Math.max(Date.parse(data.collected_at),...latest.flatMap(s=>s.history.map(r=>Date.parse(r.observed_at))));
    const cutoff=range==='all'?-Infinity:end-Number(range)*864e5;
    const datasets=latest.map((s,i)=>({label:gpu+' · '+s.region,data:s.history.filter(r=>Date.parse(r.observed_at)>=cutoff).map(r=>({x:Date.parse(r.observed_at),y:r.price_usd_per_gpu_hour})),borderColor:colors[i%colors.length],backgroundColor:colors[i%colors.length],borderWidth:2.2,pointRadius:s.history.length<3?4:0,pointHitRadius:12,stepped:true,spanGaps:false,parsing:false}));
    chart?.destroy();chart=new Chart($('nebius-trend'),{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',axis:'x',intersect:false},plugins:{legend:{position:'top'},tooltip:{callbacks:{title:items=>items.length?time(items[0].parsed.x)+' KST':'',label:c=>c.dataset.label+': '+money(c.parsed.y)+' / GPU·시간'}}},scales:{x:{type:'linear',min:Date.parse(data.collected_at)-3600e3,max:Date.parse(data.collected_at)+3600e3,ticks:{maxTicksLimit:6,callback:t=>time(t).slice(6)}},y:{title:{display:true,text:'USD / GPU·시간'}}}}});
    const times=datasets.flatMap(d=>d.data.map(p=>p.x));if(times.length&&Math.max(...times)-Math.min(...times)>2*3600e3){chart.options.scales.x.min=Math.min(...times);chart.options.scales.x.max=Math.max(...times);chart.update('none');}
    const uniqueTimes=[...new Set(times)];
    $('nebius-growth').textContent=uniqueTimes.length>1?`실제 데이터 ${time(Math.min(...times))} ~ ${time(Math.max(...times))} KST · ${uniqueTimes.length}개 시점 · 공식 시간별 이력 + 이후 관측값${range==='30'?' · 30일 이력은 아직 누적 중':''}`:'관측 1회 · 과거 이력 부족: 추가 수집 후 추이가 표시됩니다.';
    const url=new URL('https://nebius.com/spot-prices');url.searchParams.set('historyGpus',gpu);url.searchParams.set('historyRange',range==='1'?'1d':'7d');url.searchParams.set('period','7d');if(region!=='all')url.searchParams.set('historyRegions',region);url.hash='price-history';$('nebius-source').href=url.href;
    const stale=Date.now()-Date.parse(data.collected_at)>2*3600e3;
    $('nebius-status').textContent=`공식 화면 수집 ${time(data.collected_at)} KST · ${data.latest_market_count}개 시장 · ${stale?'최근 수집 2시간 초과 · 지연 확인 필요':'Work 매시간 갱신'} · ${$('nebius-auto').checked?'페이지 15분 자동 반영':'페이지 자동 반영 꺼짐'}`;
  }
  async function load() {
    if(busy)return;busy=true;
    try {
      const res=await fetch('./nebius_spot_prices.json?v='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);
      const next=await res.json();const clean=next.records.filter(r=>typeof r.price_usd_per_gpu_hour==='number'&&Number.isFinite(r.price_usd_per_gpu_hour)&&r.price_usd_per_gpu_hour>=0&&Number.isFinite(Date.parse(r.observed_at))&&Number.isFinite(Date.parse(r.effective_at))&&r.gpu&&r.region);
      if(!clean.length||!Number.isFinite(Date.parse(next.collected_at)))throw Error('유효 가격 없음');data=next;rows=clean;
      historyRows=(next.history||[]).filter(r=>typeof r.price_usd_per_gpu_hour==='number'&&Number.isFinite(r.price_usd_per_gpu_hour)&&r.price_usd_per_gpu_hour>=0&&Number.isFinite(Date.parse(r.price_at))&&r.gpu&&r.region);
      const gpus=[...new Set(rows.map(r=>r.gpu))].sort((a,b)=>(order.indexOf(a)<0?99:order.indexOf(a))-(order.indexOf(b)<0?99:order.indexOf(b))||a.localeCompare(b));
      options('nebius-gpu',gpus.map(g=>[g,g]),$('nebius-gpu').value,gpus.includes('B300')?'B300':gpus[0]);regions();draw();
    } catch(e) {$('nebius-status').textContent='가격 갱신 실패 · '+e.message+(data?' · 마지막 정상 수집값을 유지합니다.':'');}
    finally {busy=false;}
  }
  $('nebius-gpu').addEventListener('change',()=>{regions();draw();});
  ['nebius-region','nebius-range','nebius-auto'].forEach(id=>$(id).addEventListener('change',draw));
  $('nebius-refresh').addEventListener('click',load);
  setInterval(()=>{if($('nebius-auto').checked&&!document.hidden)load();},15*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('nebius-auto').checked)load();});
  load();
})();
