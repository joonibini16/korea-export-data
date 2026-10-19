// Official public page embed. No server-side scraper, proxy, or cached price claims.
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const frame = byId('nebius-frame');
  if (!frame) return;
  const interval = 15 * 60 * 1000;
  let requested = 0;
  function refresh() {
    const url = new URL('https://nebius.com/spot-prices');
    url.searchParams.set('historyGpus', byId('nebius-gpu').value);
    url.searchParams.set('historyRange', byId('nebius-range').value);
    url.searchParams.set('period', byId('nebius-range').value);
    url.hash = 'price-history';
    frame.src = url.href;
    byId('nebius-source').href = url.href;
    requested = Date.now();
    const stamp = new Intl.DateTimeFormat('ko-KR', {
      timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    }).format(new Date(requested));
    byId('nebius-status').textContent = `공식 화면 요청 ${stamp} KST · ${byId('nebius-auto').checked ? '15분 자동갱신 켜짐' : '자동갱신 꺼짐'} · 가격 기준 시각은 아래 원문에 표시`;
  }
  byId('nebius-refresh').addEventListener('click', refresh);
  ['nebius-gpu','nebius-range','nebius-auto'].forEach(id => byId(id).addEventListener('change', refresh));
  function refreshIfDue() {
    if (byId('nebius-auto').checked && !document.hidden && Date.now() - requested >= interval) refresh();
  }
  setInterval(refreshIfDue, 60 * 1000);
  document.addEventListener('visibilitychange', refreshIfDue);
  refresh();
})();
