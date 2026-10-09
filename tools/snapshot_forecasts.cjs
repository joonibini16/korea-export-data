// Freeze today's export-based revenue forecasts and Naver consensus for later error tracking.
// Runs the same browser code as regional.html (jsdom) so the log matches what the page showed.
// Rows are append-only: one row per snapshot_date × company × quarter; earlier rows are never edited.
const {JSDOM} = require('jsdom'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'forecast_log.csv');
const FIELDS = ['snapshot_date','company_id','name','period','model','months_collected','export_actual_part','export_estimate_total','export_qoq_pct',
  'forecast_revenue_100m','forecast_low_100m','forecast_high_100m','anchor_period','anchor_revenue_100m','beta','backtest_mape_pct',
  'consensus_revenue_100m','consensus_date','gap_vs_consensus_pct','status_note'];
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
  w.eval(fs.readFileSync(path.join(root, 'regional.js'), 'utf8') + '\n;window.__api={get watch(){return watch},companyOutlook,consensusFor};');
  for (let i = 0; i < 60 && !w.document.querySelector('#companyList tr'); i++) await new Promise(r => setTimeout(r, 500));
  if (errs.length) throw new Error('page errors: ' + errs.join('; '));
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const rows = w.eval(`__api.watch.map(c=>{const o=__api.companyOutlook(c);if(!o||!o.est)return null;const cs=__api.consensusFor(c,o.period);const f=o.fc;
    return {company_id:c.id,name:c.name,period:o.period,months_collected:o.est.have.join(' '),export_actual_part:Math.round(o.est.actual),
      export_estimate_total:Math.round(o.est.total),export_qoq_pct:f?((Math.exp(f.dx)-1)*100).toFixed(1):'',
      forecast_revenue_100m:f?Math.round(f.value):'',forecast_low_100m:f?Math.round(f.low):'',forecast_high_100m:f?Math.round(f.high):'',
      anchor_period:f?f.anchor:'',anchor_revenue_100m:f?Math.round(f.anchorRev):'',beta:f?f.beta.toFixed(3):'',backtest_mape_pct:f&&f.mape!=null?f.mape.toFixed(1):'',
      consensus_revenue_100m:cs?Math.round(cs.value):'',consensus_date:cs?cs.date:'',gap_vs_consensus_pct:o.gap!=null?o.gap.toFixed(1):'',status_note:f?'':(o.note||'')};}).filter(Boolean)`);
  let old = [];
  if (fs.existsSync(OUT)) {
    const lines = fs.readFileSync(OUT, 'utf8').replace(/^﻿/, '').trim().split('\n');
    old = lines.slice(1).filter(l => !l.startsWith(today + ','));
  }
  const fresh = rows.map(r => FIELDS.map(k => esc(k === 'snapshot_date' ? today : k === 'model' ? MODEL : r[k])).join(','));
  fs.writeFileSync(OUT, '﻿' + [FIELDS.join(','), ...old, ...fresh].join('\n') + '\n');
  console.log(`snapshot ${today}: ${rows.length} companies, ${rows.filter(r => r.forecast_revenue_100m !== '').length} with forecasts`);
})().catch(e => { console.error(e); process.exit(1); });
