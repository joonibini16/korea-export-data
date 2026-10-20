// GPU rental prices: Vast.ai offers, RunPod list prices, and Ornn OCPI settled values
// (Ornn Data written permission 2026-10-19: attributed, non-commercial display with source links).
(async function () {
  'use strict';
  const specs = [
    ['b200', 'B200', '#c084fc'], ['h200', 'H200', '#f59e0b'],
    ['h100', 'H100 SXM', '#2dd4bf'], ['a100', 'A100 SXM4', '#5b8def'],
    ['rtx5090', 'RTX 5090', '#fb7185']
  ];
  const day = 86400000, stamp = d => Date.parse(d + 'T00:00:00Z');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => n == null ? '—' : '$' + n.toFixed(3);
  const pct = (n, p) => p > 0 ? (n / p - 1) * 100 : null;
  const change = n => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  function csv(text) {
    const all = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
      else if (c === ',' && !quoted) { row.push(field); field = ''; }
      else if (c === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); all.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field || row.length) { row.push(field.replace(/\r$/, '')); all.push(row); }
    const head = all.shift() || [];
    return all.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((k, i) => [k.replace(/^\uFEFF/, ''), r[i]])));
  }
  try {
    const [res, refText, status] = await Promise.all([
      fetch('price_indicators_log.csv?v=' + Date.now(), {cache:'no-store'}),
      fetch('price_ref_history.csv?v=' + Date.now(), {cache:'no-store'}).then(r => r.ok ? r.text() : '').catch(() => ''),
      fetch('price_indicators_status.json?v=' + Date.now(), {cache:'no-store'}).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    if (!res.ok) throw Error('가격 파일 응답 ' + res.status);
    const rows = csv(await res.text());
    const series = key => {
      const seen = new Map();
      rows.filter(r => r.series === key && r.value.trim() !== '').forEach(r => {
        const v = Number(r.value);
        if (/^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(stamp(r.date)) && Number.isFinite(v) && v > 0) seen.set(r.date, {d:r.date, v});
      });
      return [...seen.values()].sort((a, b) => a.d.localeCompare(b.d));
    };
    // 과거 이력: BADONION 차트 판독 참고치(A100·H100·B200, 2024.09~). 집계 방식이 Vast.ai 호가 중앙값과 달라 별도 선으로 표시
    const refRows = refText ? csv(refText) : [];
    const refSeries = key => refRows.filter(r => r.series === 'ref_gpu_' + key && Number(r.value) > 0).map(r => ({d:r.date, v:Number(r.value)})).sort((a, b) => a.d.localeCompare(b.d));
    const ORNN_PAGE = {a100:'a100-sxm4', h100:'h100-sxm', h200:'h200', b200:'b200'};
    const sets = specs.map(([key, name, color]) => ({key, name, color, data:series('gpu_' + key + '_vast')}));
    const ornnSets = specs.filter(([key]) => ORNN_PAGE[key]).map(([key, name, color]) => ({key, name, color, data:series('gpu_' + key + '_ornn')}));
    const ornnLatest = ornnSets.flatMap(s => s.data.map(x => x.d)).sort().at(-1);
    const latestDate = sets.flatMap(s => s.data.map(x => x.d)).sort().at(-1);
    const fmtTime = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'medium', timeStyle:'short', hour12:false}).format(new Date(value)) + ' KST' : '확인 불가';
    document.getElementById('gpu-time').textContent = `가격 기준일 ${latestDate || '수집 전'} · 파일 수집 ${fmtTime(status?.updated)}`;
    document.getElementById('gpu-board').innerHTML = '<thead><tr><th>GPU</th><th>USD/GPU·시간</th><th>전일 대비</th><th>7일 대비</th><th>30일 대비</th><th>매물 수</th><th>기준일</th><th>RunPod Secure 공시가</th><th>RunPod Community 공시가</th><th>Ornn OCPI 체결가</th></tr></thead><tbody>' + sets.map(s => {
      const last = s.data.at(-1);
      const delta = days => {
        const past = last && s.data.find(x => stamp(x.d) === stamp(last.d) - days * day);
        const v = past ? pct(last.v, past.v) : null;
        return `<td style="color:${v == null ? '#93a3bd' : v >= 0 ? '#2dd4bf' : '#f87171'}">${change(v)}</td>`;
      };
      const count = last && rows.find(r => r.series === 'gpu_' + s.key + '_vast_n' && r.date === last.d);
      const runpod = last && series('gpu_' + s.key + '_runpod_secure').find(x => x.d === last.d);
      const community = last && series('gpu_' + s.key + '_runpod_comm').find(x => x.d === last.d);
      const ornn = ornnSets.find(o => o.key === s.key)?.data.at(-1);
      const ornnCell = ornn ? `<td><a href="https://data.ornn.com/markets/${ORNN_PAGE[s.key]}" target="_blank" rel="noopener noreferrer" title="Source: Ornn Data — OCPI, settled ${ornn.d}">${money(ornn.v)}</a> <span class="muted">${ornn.d.slice(5)}</span></td>` : '<td>—</td>';
      return `<tr><td style="color:${s.color}">${esc(s.name)}</td><td><b>${money(last?.v)}</b></td>${[1,7,30].map(delta).join('')}<td>${count ? esc(count.value) : '—'}</td><td>${last?.d || '수집 전'}${last && last.d !== latestDate ? ' · 갱신 지연' : ''}</td><td>${money(runpod?.v)}</td><td>${money(community?.v)}</td>${ornnCell}</tr>`;
    }).join('') + '</tbody>';
    let chart;
    function draw() {
      const mode = document.getElementById('gpu-mode').value;
      const range = document.getElementById('gpu-range').value;
      const src = document.getElementById('gpu-hist').value;
      const ornnMode = src === 'ornn';
      const end = ornnMode ? ornnLatest : latestDate;
      const cutoff = range === 'all' ? -Infinity : stamp(end) - (Number(range) - 1) * day;
      const filtered = (ornnMode ? ornnSets : sets).map(s => ({...s, data:s.data.filter(x => stamp(x.d) >= cutoff)})).filter(s => s.data.length);
      // Index comparisons begin on a date observed for every GPU; never invent history.
      const common = filtered[0]?.data.find(x => filtered.every(s => s.data.some(v => v.d === x.d)))?.d;
      const datasets = filtered.map(s => {
        const base = common && s.data.find(x => x.d === common)?.v;
        const values = mode === 'index' ? s.data.filter(x => base && x.d >= common).map(x => ({x:stamp(x.d), y:x.v / base * 100})) : s.data.map(x => ({x:stamp(x.d), y:x.v}));
        return {label:s.name, data:values, borderColor:s.color, backgroundColor:s.color, borderWidth:2.3, pointRadius:values.length < 8 ? 4 : 0, pointHitRadius:12, parsing:false, spanGaps:false};
      });
      const hist = src === 'hist';
      if (hist) {
        datasets.length = 0;
        const lastAll = Math.max(...sets.flatMap(s => s.data.map(x => stamp(x.d))), 0);
        specs.forEach(([key, name, color]) => {
          let r = refSeries(key).filter(x => stamp(x.d) >= cutoff);
          if (!r.length) return;
          let data = r.map(x => ({x:stamp(x.d), y:x.v}));
          if (mode === 'index') { const b = data[0].y; data = data.map(p => ({x:p.x, y:p.y / b * 100})); }
          datasets.push({label:name, data, borderColor:color, backgroundColor:color, borderWidth:2, pointRadius:0, pointHitRadius:6, parsing:false, spanGaps:true});
        });
      }
      if (!hist && !ornnMode && mode === 'price' && document.getElementById('gpu-runpod').checked) {
        specs.forEach(([key, name, color]) => {
          const data = series('gpu_' + key + '_runpod_secure').filter(x => stamp(x.d) >= cutoff).map(x => ({x:stamp(x.d), y:x.v}));
          if (data.length) datasets.push({label:name + ' RunPod Secure', data, borderColor:color, backgroundColor:color, borderDash:[5,3], borderWidth:1.5, pointRadius:data.length < 8 ? 3 : 0, parsing:false, spanGaps:false});
        });
      }
      document.getElementById('gpu-runpod').disabled = hist || ornnMode || mode !== 'price';
      const times = datasets.flatMap(s => s.data.map(x => x.x)), min = Math.min(...times), max = Math.max(...times), longSpan = max - min > 120 * day;
      if (chart) chart.destroy();
      chart = new Chart(document.getElementById('gpu-trend'), {
        type:'line', data:{datasets}, options:{responsive:true, maintainAspectRatio:false, animation:false,
          interaction:{mode:'nearest', intersect:false, axis:'x'},
          plugins:{legend:{position:'top'}, tooltip:{callbacks:{title:items => new Date(items[0].parsed.x).toISOString().slice(0,10), label:c => c.dataset.label + ': ' + (mode === 'price' ? money(c.parsed.y) + ' / GPU·시간' : c.parsed.y.toFixed(2))}}},
          scales:{x:{type:'linear', min:Number.isFinite(min) && max - min < 2 * day ? min - day : undefined, max:Number.isFinite(max) && max - min < 2 * day ? max + day : undefined, ticks:{stepSize:max - min < 90 * day ? day : undefined, maxTicksLimit:8, callback:v => longSpan ? new Date(v).toISOString().slice(2,7).replace('-', '.') : new Date(v).toISOString().slice(0,10)}}, y:{beginAtZero:false, title:{display:true, text:mode === 'price' ? 'USD / GPU·시간' : (hist ? '각 선의 첫 값 = 100' : `공통 첫 관측일 ${common || '없음'} = 100`)}}}}
      });
      const n = ornnMode ? filtered.length : 5;
      document.getElementById('gpu-attrib').hidden = !ornnMode;
      if (ornnMode) document.getElementById('gpu-attrib').innerHTML = 'Source: Ornn Data — Ornn Compute Price Index (OCPI), USD per GPU-hour, settled ' + esc(ornnLatest || '—') + ' · ' + ornnSets.map(s => `<a href="https://data.ornn.com/markets/${ORNN_PAGE[s.key]}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>`).join(' · ') + ' · Ornn Data의 허가를 받아 표시하며 원자료 재배포·상업적 이용은 하지 않습니다.';
      document.getElementById('gpu-note').textContent = ornnMode ? 'Ornn OCPI: 실제 체결 거래 기반 일별 정산값(미국 동부 16:00 정산, 날짜는 미국 거래일)입니다. 공개 이력(최근 3개월)부터 표시하고 이후 매일 1회 수집해 누적합니다. Vast.ai·RunPod는 호가·공시가라 수준이 다를 수 있습니다. ' + (mode === 'index' ? (common ? `공통 관측일 ${common}=100. ` : '') : '') : hist ? '장기 지수: 2024년 9월부터의 GPU 임대 지수(BADONION 차트 판독 참고치, 일별)로, 값이 Silicon Data의 Silicon Index(SDA100RT·SDH100RT·SDB200RT)와 일치해 원 출처는 Silicon Data로 판단됩니다(© Silicon Data, 표시 허가 요청 중). 최근 값은 판독 자료가 갱신된 날까지이며, 매일 수집하는 Vast.ai 호가는 위 표와 "데이터" 선택에서 따로 볼 수 있습니다. 실제 체결가는 "데이터"에서 Ornn OCPI를 선택해 볼 수 있습니다. 마우스를 올리면 날짜·값이 보입니다.' : (mode === 'index' ? (common ? `${n}종 공통 관측일 ${common}부터 비교합니다. ` : `${n}종 공통 관측일이 아직 없어 지수 비교를 보류합니다. `) : 'Vast.ai 호가와 RunPod 공시가는 실제 체결가가 아닙니다. ') + '전일·7일·30일 값이 없으면 변동률은 비워둡니다. H200·RTX 5090은 10월 중순 수집부터 누적합니다.';
    }
    draw();
    ['gpu-mode','gpu-range','gpu-runpod','gpu-hist'].forEach(id => document.getElementById(id).addEventListener('change', draw));
  } catch (e) {
    document.getElementById('gpu-time').textContent = 'GPU 가격을 불러오지 못했습니다: ' + e.message;
  }
})();
