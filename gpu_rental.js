// GPU rental offer prices. Ornn/temperature2 indices are linked, not copied.
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
    const [res, status] = await Promise.all([
      fetch('price_indicators_log.csv?v=' + Date.now(), {cache:'no-store'}),
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
    const sets = specs.map(([key, name, color]) => ({key, name, color, data:series('gpu_' + key + '_vast')}));
    const latestDate = sets.flatMap(s => s.data.map(x => x.d)).sort().at(-1);
    const fmtTime = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'medium', timeStyle:'short', hour12:false}).format(new Date(value)) + ' KST' : '확인 불가';
    document.getElementById('gpu-time').textContent = `가격 기준일 ${latestDate || '수집 전'} · 파일 수집 ${fmtTime(status?.updated)}`;
    document.getElementById('gpu-board').innerHTML = '<thead><tr><th>GPU</th><th>USD/GPU·시간</th><th>전일 대비</th><th>7일 대비</th><th>30일 대비</th><th>매물 수</th><th>기준일</th><th>RunPod Secure 공시가</th><th>RunPod Community 공시가</th></tr></thead><tbody>' + sets.map(s => {
      const last = s.data.at(-1);
      const delta = days => {
        const past = last && s.data.find(x => stamp(x.d) === stamp(last.d) - days * day);
        const v = past ? pct(last.v, past.v) : null;
        return `<td style="color:${v == null ? '#93a3bd' : v >= 0 ? '#2dd4bf' : '#f87171'}">${change(v)}</td>`;
      };
      const count = last && rows.find(r => r.series === 'gpu_' + s.key + '_vast_n' && r.date === last.d);
      const runpod = last && series('gpu_' + s.key + '_runpod_secure').find(x => x.d === last.d);
      const community = last && series('gpu_' + s.key + '_runpod_comm').find(x => x.d === last.d);
      return `<tr><td style="color:${s.color}">${esc(s.name)}</td><td><b>${money(last?.v)}</b></td>${[1,7,30].map(delta).join('')}<td>${count ? esc(count.value) : '—'}</td><td>${last?.d || '수집 전'}${last && last.d !== latestDate ? ' · 갱신 지연' : ''}</td><td>${money(runpod?.v)}</td><td>${money(community?.v)}</td></tr>`;
    }).join('') + '</tbody>';
    let chart;
    function draw() {
      const mode = document.getElementById('gpu-mode').value;
      const range = document.getElementById('gpu-range').value;
      const cutoff = range === 'all' ? -Infinity : stamp(latestDate) - (Number(range) - 1) * day;
      const filtered = sets.map(s => ({...s, data:s.data.filter(x => stamp(x.d) >= cutoff)}));
      // Index comparisons begin on a date observed for every GPU; never invent history.
      const common = filtered[0].data.find(x => filtered.every(s => s.data.some(v => v.d === x.d)))?.d;
      const datasets = filtered.map(s => {
        const base = common && s.data.find(x => x.d === common)?.v;
        const values = mode === 'index' ? s.data.filter(x => base && x.d >= common).map(x => ({x:stamp(x.d), y:x.v / base * 100})) : s.data.map(x => ({x:stamp(x.d), y:x.v}));
        return {label:s.name, data:values, borderColor:s.color, backgroundColor:s.color, borderWidth:2.3, pointRadius:values.length < 8 ? 4 : 0, pointHitRadius:12, parsing:false, spanGaps:false};
      });
      if (mode === 'price' && document.getElementById('gpu-runpod').checked) {
        specs.forEach(([key, name, color]) => {
          const data = series('gpu_' + key + '_runpod_secure').filter(x => stamp(x.d) >= cutoff).map(x => ({x:stamp(x.d), y:x.v}));
          if (data.length) datasets.push({label:name + ' RunPod Secure', data, borderColor:color, backgroundColor:color, borderDash:[5,3], borderWidth:1.5, pointRadius:data.length < 8 ? 3 : 0, parsing:false, spanGaps:false});
        });
      }
      document.getElementById('gpu-runpod').disabled = mode !== 'price';
      const times = datasets.flatMap(s => s.data.map(x => x.x)), min = Math.min(...times), max = Math.max(...times);
      if (chart) chart.destroy();
      chart = new Chart(document.getElementById('gpu-trend'), {
        type:'line', data:{datasets}, options:{responsive:true, maintainAspectRatio:false, animation:false,
          interaction:{mode:'nearest', intersect:false, axis:'x'},
          plugins:{legend:{position:'top'}, tooltip:{callbacks:{title:items => new Date(items[0].parsed.x).toISOString().slice(0,10), label:c => c.dataset.label + ': ' + (mode === 'price' ? money(c.parsed.y) + ' / GPU·시간' : c.parsed.y.toFixed(2))}}},
          scales:{x:{type:'linear', min:Number.isFinite(min) && max - min < 2 * day ? min - day : undefined, max:Number.isFinite(max) && max - min < 2 * day ? max + day : undefined, ticks:{stepSize:max - min < 90 * day ? day : undefined, maxTicksLimit:8, callback:v => new Date(v).toISOString().slice(0,10)}}, y:{beginAtZero:false, title:{display:true, text:mode === 'price' ? 'USD / GPU·시간 (호가 중앙값)' : `공통 첫 관측일 ${common || '없음'} = 100`}}}}
      });
      document.getElementById('gpu-note').textContent = (mode === 'index' ? common ? `5종 공통 관측일 ${common}부터 비교합니다. ` : '5종 공통 관측일이 아직 없어 지수 비교를 보류합니다. ' : '호가와 공시가는 실제 체결가가 아닙니다. ') + '마우스를 올리면 해당 날짜·가격을 확인할 수 있습니다. 전일·7일·30일 값이 없으면 변동률은 비워둡니다. H200·RTX 5090은 이번 수집부터 누적합니다.';
    }
    draw();
    ['gpu-mode','gpu-range','gpu-runpod'].forEach(id => document.getElementById(id).addEventListener('change', draw));
  } catch (e) {
    document.getElementById('gpu-time').textContent = 'GPU 가격을 불러오지 못했습니다: ' + e.message;
  }
})();
