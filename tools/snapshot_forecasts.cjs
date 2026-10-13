// Freeze today's export-based revenue forecasts and Naver consensus for later error tracking.
// Runs the same browser code as regional.html (jsdom) so the log matches what the page showed.
// Append-only: 기존 행은 절대 지우거나 고치지 않습니다. 같은 날 다시 돌려도 값이 바뀐 행만 snapshot_time과 함께 덧붙입니다.
const {JSDOM} = require('jsdom'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'forecast_log.csv');
const FIELDS = ['snapshot_date','company_id','name','period','model','months_collected','export_actual_part','export_estimate_total','export_qoq_pct',
  'forecast_revenue_100m','forecast_low_100m','forecast_high_100m','anchor_period','anchor_revenue_100m','beta','backtest_mape_pct',
  'consensus_revenue_100m','consensus_date','gap_vs_consensus_pct','status_note','prob_beat_pct','sigma_pct','snapshot_time'];
const MODEL = 'qoq-elasticity-v1';
const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
(async () => {
  let html = fs.readFileSync(path.join(root, 'regional.html'), 'utf8')
    .replace(/<script src="https:[^"]+"><\/script>/, '').replace(/<script src="\.\/regional\.js[^"]*"><\/script>/, '');
  const dom = new JSDOM(html, {runScripts: 'outside-only', url: 'http://local/regional.html'});
  const w = dom.window, errs = [];
  w.fetch = async u => { const f = path.join(root, u.split('?')[0].replace(/^\.\//, ''));
    return fs.existsSync(f) ? {ok: true, status: 200, text: async () => fs.readFileSync(f, 'utf8')} : {ok: false, status: 404, text: async () => ''}; };
  w.Chart = class { constructor(el, cfg) { this.data = cfg.data; this.options = cfg.options || {}; this.options.scales = this.options.scales || {};
    this.options.scales.x = this.options.scales.x || {}; this.options.scales.y = this.options.scales.y || {}; } destroy() {} update() {} };
  w.addEventListener('error', e => errs.push(e.message));
  w.eval(fs.readFileSync(path.join(root, 'regional.js'), 'utf8') + '\n;window.__api={get watch(){return watch},companyOutlook,consensusFor,inventorySummary,inventoryForecast};Object.assign(window,{companyOutlook,consensusFor,inventorySummary,inventoryForecast,revenueMap});Object.defineProperty(window,"watch",{get(){return watch}});');
  for (let i = 0; i < 60 && !w.document.querySelector('#companyList tr'); i++) await new Promise(r => setTimeout(r, 500));
  if (errs.length) throw new Error('page errors: ' + errs.join('; '));
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const rows = w.eval(`__api.watch.map(c=>{const o=__api.companyOutlook(c);if(!o||!o.est)return null;const cs=__api.consensusFor(c,o.period);const f=o.fc;
    return {company_id:c.id,name:c.name,period:o.period,months_collected:o.est.have.join(' '),export_actual_part:Math.round(o.est.actual),
      export_estimate_total:Math.round(o.est.total),export_qoq_pct:f?((Math.exp(f.dx)-1)*100).toFixed(1):'',
      forecast_revenue_100m:f?Math.round(f.value):'',forecast_low_100m:f?Math.round(f.low):'',forecast_high_100m:f?Math.round(f.high):'',
      anchor_period:f?f.anchor:'',anchor_revenue_100m:f?Math.round(f.anchorRev):'',beta:f?f.beta.toFixed(3):'',backtest_mape_pct:f&&f.mape!=null?f.mape.toFixed(1):'',
      consensus_revenue_100m:cs?Math.round(cs.value):'',consensus_date:cs?cs.date:'',gap_vs_consensus_pct:o.gap!=null?o.gap.toFixed(1):'',status_note:f?'':(o.note||'')};}).filter(Boolean)`);
  const invRows = w.eval(`__api.watch.map(c=>{const s=__api.inventorySummary(c);const f=s?__api.inventoryForecast(s):null;if(!f||f.value==null)return null;const cs=__api.consensusFor(c,f.target);
    return {company_id:c.id,name:c.name,period:f.target,model:'inventory-qoq-v2',months_collected:'',export_actual_part:'',export_estimate_total:'',export_qoq_pct:'',
      forecast_revenue_100m:Math.round(f.value),forecast_low_100m:Math.round(f.low),forecast_high_100m:Math.round(f.high),anchor_period:f.from,anchor_revenue_100m:Math.round(f.base),
      beta:f.b.toFixed(3),backtest_mape_pct:f.mape!=null?f.mape.toFixed(1):'',consensus_revenue_100m:cs?Math.round(cs.value):'',consensus_date:cs?cs.date:'',
      gap_vs_consensus_pct:cs?((f.value/cs.value-1)*100).toFixed(1):'',status_note:'신뢰도 '+f.grade+' · 재고 QoQ '+f.x0.toFixed(1)+'%'};}).filter(Boolean)`);
  rows.push(...invRows);
  // 종합 판단(verdict.js와 같은 계산): 상회/하회·상회 확률·합친 추정치. 실적이 나오면 forecast_tracker·결론 패널이 실제와 비교합니다.
  w.eval(fs.readFileSync(path.join(root, 'verdict.js'), 'utf8'));
  await w.verdictPrep();
  const vRows = w.eval(`__api.watch.map(c=>{const v=verdictCalc(c);if(!v.ok)return null;
    return {company_id:c.id,name:c.name,period:v.period,model:'combined-verdict-v1',forecast_revenue_100m:Math.round(v.F),
      forecast_low_100m:Math.round(v.F*Math.exp(-v.sig)),forecast_high_100m:Math.round(v.F*Math.exp(v.sig)),
      consensus_revenue_100m:Math.round(v.cs.value),consensus_date:v.cs.date,gap_vs_consensus_pct:v.gap.toFixed(1),
      prob_beat_pct:v.p.toFixed(1),sigma_pct:(v.sig*100).toFixed(1),
      status_note:(v.gap>=0?'상회':'하회')+' 판단 · '+v.use.map(m=>m.name+(m.calibrated?'(실측보정 '+m.liveN+'건)':'')).join('+')};}).filter(Boolean)`);
  rows.push(...vRows);
  let old = [], header = FIELDS;
  if (fs.existsSync(OUT)) {
    const lines = fs.readFileSync(OUT, 'utf8').replace(/^\uFEFF/, '').trim().split('\n');
    old = lines.slice(1);
  }
  // 같은 (날짜·회사·분기·모델)에 내용이 같은 행이 이미 있으면 건너뜀(시각 칸 제외 비교)
  const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  const body = r => FIELDS.slice(0, -1).map(k => esc(k === 'snapshot_date' ? today : k === 'model' ? (r.model || MODEL) : r[k])).join(',');
  const seen = new Set(old.map(l => l.replace(/,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, '')));
  const fresh = rows.map(r => body(r)).filter(b => !seen.has(b)).map(b => b + ',' + esc(stamp));
  fs.writeFileSync(OUT, '\uFEFF' + [header.join(','), ...old, ...fresh].join('\n') + '\n');
  console.log(`snapshot ${today}: ${rows.length} rows computed, ${fresh.length} new appended (inventory model ${invRows.length}, verdict ${vRows.length})`);
})().catch(e => { console.error(e); process.exit(1); });
