// 공통 셸: 왼쪽 메뉴를 만들고, 첫 제목을 히어로 카드로 감싸며, 그래프 기본색을 어두운 배경에 맞춥니다.
(function(){
 const GROUPS=[['수출',[['./','수출확정치',['','index.html']],['./provisional.html','10일 잠정수출',['provisional.html']],['./memory_trade.html','메모리 수출입 · 중량',['memory_trade.html']]]],
  ['업체·실적',[['./regional.html','지역 수출 · 업체 실적 추적',['regional.html']],['./forecast_tracker.html','매출 예측 추적',['forecast_tracker.html']],['./revenue_signals.html','매출 상향·하향 예상',['revenue_signals.html']]]],
  ['해외 테크',[['./taiwan.html','대만 테크 월매출',['taiwan.html']],['./japan.html','일본 테크 수출',['japan.html']],['./global_earnings.html','해외 실적·컨콜 변곡점',['global_earnings.html']],['./global_earnings_report.html','해외 분기 실적 리포트',['global_earnings_report.html']],['./global_research.html','해외 리서치 · 발간 모니터',['global_research.html']]]],
  ['산업 지표',[['./prices.html','가격 지표 (GPU·토큰·D램)',['prices.html']],['./ess.html','ESS 배터리 설치량',['ess.html']]]],
  ['시장',[['./etf.html','테마 ETF 보드',['etf.html']],['./since.html','7/30 대비 등락률 (전 종목)',['since.html']],['./bubble.html?tab=breadth','시장 Breadth',['bubble.html']],['./bubble.html','버블 신호 모니터',['bubble.html']],['./bubble.html?tab=credit','신용 스프레드',['bubble.html']],['./foreign.html','수급 매수 강도 (외국인·기관)',['foreign.html']],['./flow.html','외국인·기관 수급 오실레이터',['flow.html']]]]];
 const page=(location.pathname.split('/').pop()||'');
 function build(){if(document.querySelector('.sh-side'))return;const side=document.createElement('aside');side.className='sh-side';
  side.innerHTML='<div class="sh-brand">모니터링</div><div class="sh-sub">Monitoring</div>';
  for(const [g,links] of GROUPS){const h=document.createElement('div');h.className='sh-group';h.textContent=g;side.append(h);const box=document.createElement('div');box.className='sh-links';
   for(const [href,label,files] of links){const a=document.createElement('a');const tabQ=(href.split('?tab=')[1]||''),curTab=new URLSearchParams(location.search).get('tab')||'';a.className='sh-link'+(files.includes(page)&&tabQ===curTab?' active':'');a.href=href;a.textContent=label;box.append(a);}side.append(box);}
  document.body.prepend(side);
  const h1=document.querySelector('h1');if(h1&&!h1.closest('.sh-hero')){const hero=document.createElement('section');hero.className='sh-hero';h1.before(hero);hero.append(h1);
   const nxt=hero.nextElementSibling;if(nxt&&/subtitle|sub|muted/.test(nxt.className||'')&&nxt.tagName!=='SECTION'){nxt.classList.add('sh-hero-sub');hero.append(nxt);}}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
 if(window.Chart){const D=Chart.defaults;D.color='#c3cfe2';D.borderColor='rgba(148,163,184,0.16)';D.scale.grid.color='rgba(148,163,184,0.14)';const PAL=['#60a5fa','#f59e0b','#34d399','#f472b6','#a78bfa','#f87171','#22d3ee','#facc15'];
  Object.assign(D.plugins.tooltip,{backgroundColor:'rgba(15,26,51,0.97)',titleColor:'#f1f5fb',bodyColor:'#dbe4f3',borderColor:'#2a4378',borderWidth:1});
  // 어두운 배경에서 안 보이는 검정·남색 선은 밝은 회색으로 바꿉니다.
  const dark=c=>{if(typeof c!=='string')return false;const m=c.match(/^#([0-9a-f]{6})/i);if(!m)return false;const n=parseInt(m[1],16),r=n>>16,g=(n>>8)&255,b=n&255;return (0.2126*r+0.7152*g+0.0722*b)<45;};
  Chart.register({id:'shDarkFix',beforeUpdate(ch){(ch.data.datasets||[]).forEach((ds,i)=>{if(ds.borderColor==null&&ds.backgroundColor==null){const c=PAL[i%PAL.length];ds.borderColor=c;ds.backgroundColor=(ds.type||ch.config.type)==='bar'?c+'cc':c;}});for(const ds of ch.data.datasets||[]){if(dark(ds.borderColor))ds.borderColor='#e5e7eb';if(dark(ds.pointBorderColor))ds.pointBorderColor='#e5e7eb';if(ds.pointBackgroundColor==='#fff'||ds.pointBackgroundColor==='#ffffff')ds.pointBackgroundColor='#0f1a33';if(Array.isArray(ds.pointBackgroundColor))ds.pointBackgroundColor=ds.pointBackgroundColor.map(c=>c==='#fff'||c==='#ffffff'?'#0f1a33':c);}}});}
})();
// 모든 차트에 기간 조절 바(내비게이터) 자동 부착
(function(){if(window.RangeNav&&window.RangeNav.v>=2)return;const s=document.createElement('script');s.src='./rangenav.js?v=1';(document.head||document.documentElement).appendChild(s);})();
// 제목 옆 '기준일 · 수집' 표시: 데이터 파일 안의 마지막 날짜(기준일)와 마지막 갱신(커밋) 시각(data_updated.json)
(function(){
 const used=new Set(),DATA=/\.(csv|json)(\?|#|$)/i;
 const of=window.fetch&&window.fetch.bind(window);
 if(of)window.fetch=function(u,...a){try{const s=typeof u==='string'?u:(u&&u.url)||'';const loc=s.startsWith(location.origin)?s.slice(location.origin.length):s;
  if(DATA.test(loc)&&!/^[a-z]+:\/\//i.test(loc)){const f=loc.split(/[?#]/)[0].replace(/^.*\//,'');if(f&&f!=='data_updated.json')used.add(f);}}catch(e){}return of(u,...a);};
 const css=document.createElement('style');css.textContent='.upd-stamp{margin-left:10px;font-size:12px;font-weight:500;color:#7dd3fc;white-space:nowrap;vertical-align:middle;letter-spacing:0}h1 .upd-stamp{font-size:13px}';
 (document.head||document.documentElement).appendChild(css);
 let M=null;const fmt=s=>s.slice(0,10)+' '+s.slice(11,16);
 const C=f=>typeof M[f]==='string'?M[f]:M[f].c,A=f=>typeof M[f]==='string'?null:M[f].a;
 function stamp(el,files){const fs=files.filter(f=>M[f]);if(!fs.length)return;const AUX=/status|watchlist|hs_codes|_items|catalog|_map|^fx_|config|^bigtech_bonds\.json|_manual|_ref\b|ref_history/i;const core=fs.filter(f=>!AUX.test(f));const mx=fs.map(C).sort().at(-1),as=(core.length?core:fs).map(A).filter(Boolean).sort().at(-1);
  let sp=[...el.children].find(c=>c.classList&&c.classList.contains('upd-stamp'));if(!sp){sp=document.createElement('span');sp.className='upd-stamp';el.append(sp);}
  const t=(as?'기준일 '+as+' · ':'')+'수집 '+fmt(mx);if(sp.textContent!==t)sp.textContent=t;sp.title=fs.map(f=>f+' · '+(A(f)?'기준일 '+A(f)+' · ':'')+'수집 '+fmt(C(f))).join('\n');}
 function run(){if(!M)return;const main=document.querySelector('main')||document.body;if(!main)return;
  const h1=[...main.querySelectorAll('h1')].find(h=>!h.closest('aside,nav,.sh-side,.sh-brand'));if(h1&&used.size)stamp(h1,[...used]);
  const tagged=main.querySelectorAll('[data-upd]');tagged.forEach(el=>stamp(el,el.dataset.upd.split(',').map(x=>x.trim())));
  if(!tagged.length&&used.size)main.querySelectorAll('h2').forEach(h=>{if(!h.closest('aside,nav,.sh-side,.bnav,.ptabs'))stamp(h,[...used]);});}
 fetch('data_updated.json?v='+Math.floor(Date.now()/3e5),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(!j)return;M=j.files||{};run();setInterval(run,2000);}).catch(()=>{});
})();

