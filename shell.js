// 공통 셸: 왼쪽 메뉴를 만들고, 첫 제목을 히어로 카드로 감싸며, 그래프 기본색을 어두운 배경에 맞춥니다.
(function(){
 const GROUPS=[['수출 모니터링',[['./','수출확정치',['','index.html']],['./provisional.html','10일 잠정수출',['provisional.html']]]],
  ['업체·실적',[['./regional.html','지역 수출 · 업체 실적 추적',['regional.html']],['./forecast_tracker.html','매출 예측 추적',['forecast_tracker.html']]]],
  ['해외 테크',[['./taiwan.html','대만 테크 월매출',['taiwan.html']],['./japan.html','일본 테크 수출',['japan.html']],['./global_earnings.html','해외 실적·컨콜 변곡점',['global_earnings.html']]]],
  ['시장',[['./etf.html','테마 ETF 보드',['etf.html']],['./bubble.html','버블 신호 모니터',['bubble.html']],['./bubble.html?tab=breadth','시장 Breadth',['bubble.html']]]]];
 const page=(location.pathname.split('/').pop()||'');
 function build(){if(document.querySelector('.sh-side'))return;const side=document.createElement('aside');side.className='sh-side';
  side.innerHTML='<div class="sh-brand">수출·실적 모니터</div><div class="sh-sub">Korea Export & Earnings Dashboard</div><p class="sh-note">관세청 수출·지역 통계와 공시 실적, 컨센서스를 한곳에서 점검합니다. 하나의 지표보다 여러 데이터가 같은 방향을 가리키는지 확인하세요.</p>';
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
