// 지역·업체 추적 페이지 배치: 선택 바 고정 + 탭 + 2열 그리드로 스크롤을 줄입니다.
(function(){
 const main=document.querySelector('main');if(!main||document.getElementById('dashTabs'))return;
 const panels=[...main.children];
 const byH=t=>panels.find(e=>{const h=e.querySelector&&e.querySelector('h2');return h&&h.textContent.trim().startsWith(t);});
 const byId=id=>document.getElementById(id)?.closest('main > *');
 const controls=document.getElementById('category')?.closest('section');const cards=main.querySelector(':scope > .cards');
 // 탭 정의: [이름, [요소, 넓게?]...]
 const TABS=[
  ['수출',[[controls,1],[byH('지역 수출 추세'),1],[byH('연도별 월 수출액'),1],[byH('수출 YoY와 회사 매출 YoY'),0],[byH('전국 품목 수출단가')?.closest('.grid')||byH('전국 품목 수출단가'),0]]],
  ['수출↔매출',[[byH('수출액과 회사 매출액'),0],[byH('수출액 ↔ 연결매출'),0],[byH('수출액과 국내법인'),0],[byH('수출액 ↔ 별도매출'),0]]],
  ['실적·밸류에이션',[[byId('seasonPanel'),0],[byId('earningsTitle')?.closest('section'),0]]],
  ['재고·수주',[[byId('inventoryPanel'),0],[byH('회사 분기 수주잔고'),0]]],
  ['전체 업체 요약',[[byH('서프라이즈 후보'),1],[byH('업체별 상관관계 요약'),1],[byH('지역 · 품목 · 관련 업체 전체 목록'),1],[panels.find(e=>e.querySelector&&e.querySelector('#hsCoverage')),1]]],
  ['데이터·출처',[[byH('비교 데이터'),1],[byH('기준과 출처'),1]]],
  ['PER 밴드',[[byId('fperPanel'),1]]]];  // 요청에 따라 맨 아래
 // 전국 단가·회사 매출 묶음(grid)은 둘로 나눠 각 탭에 넣습니다.
 const g=byH('전국 품목 수출단가')?.closest('.grid');if(g){const [a,py,b]=g.children;const yv=TABS[0][1][3][0];TABS[0][1].splice(3,2,[a,0],[py,0],[yv,1]);TABS[2][1][1]=[b,0];}
 const bar=document.createElement('div');bar.id='dashTabs';bar.className='dash-tabs';
 const wrap=document.createElement('div');wrap.className='dash-wrap';
 const sticky=document.createElement('div');sticky.className='dash-sticky';const ctl=controls?.querySelector('.controls');if(controls&&ctl){controls.before(sticky);const box=document.createElement('section');box.className='panel';box.append(ctl);sticky.append(box);sticky.append(bar);}if(cards)sticky.after(cards);
 if(!bar.parentNode)(cards||sticky).after(bar);(cards||sticky).after(wrap);
 let saved=0;try{saved=Number(localStorage.getItem('regionalTab')||0);}catch(e){}
 const grids=TABS.map(([name,items],i)=>{const b=document.createElement('button');b.type='button';b.className='dash-tab';b.textContent=name;b.onclick=()=>show(i);bar.append(b);
  const head=document.createElement('h2');head.className='dash-section';head.textContent=name;wrap.append(head);const grid=document.createElement('div');grid.className='dash-grid';for(const [elx,wide] of items){if(!elx)continue;if(wide)elx.classList.add('wide');grid.append(elx);}wrap.append(grid);return grid;});
 // 패널 안의 위·아래 두 그래프를 좌우로 배치
 const pairUp=(panel,firstCanvas,secondTitleSel)=>{if(!panel)return;const c1=document.getElementById(firstCanvas)?.closest('.chart'),h3=panel.querySelector(secondTitleSel);if(!c1||!h3)return;
  const left=document.createElement('div'),right=document.createElement('div'),row=document.createElement('div');row.className='dash-pair';
  let n=c1;const leftNodes=[];let prev=c1.previousElementSibling;while(prev&&prev.tagName!=='H2'){leftNodes.unshift(prev);prev=prev.previousElementSibling;}
  leftNodes.forEach(x=>left.append(x));left.append(c1);const rightNodes=[];let cur=h3;while(cur){const nx=cur.nextElementSibling;rightNodes.push(cur);cur=nx;}
  rightNodes.forEach(x=>right.append(x));row.append(left,right);panel.append(row);};
 pairUp(byH('지역 수출 추세'),'trend','h3');
 // 선택 범위 설명은 접어 두고, 범위 경고(scopeNotice)만 보이게 합니다.
 if(controls){const d=document.createElement('details');d.className='dash-info';const sm=document.createElement('summary');sm.textContent='선정 근거 · 같은 지역 다른 업체 · 수집 상태';d.append(sm);['mapping','sharedCandidates','coverage'].forEach(id=>{const x=document.getElementById(id);if(x)d.append(x);});const bd=controls.querySelector('.badge');if(bd)d.append(bd);controls.append(d);controls.classList.add('dash-compact');}
 const fp=document.getElementById('fperPanel');if(fp){const h3s=fp.querySelectorAll('h3');if(h3s.length===2){const row=document.createElement('div');row.className='dash-pair';const L=document.createElement('div'),R=document.createElement('div');let n=h3s[0];while(n&&n!==h3s[1]){const nx=n.nextElementSibling;L.append(n);n=nx;}while(n){const nx=n.nextElementSibling;R.append(n);n=nx;}row.append(L,R);fp.append(row);}}
 // 탭은 숨기지 않고 해당 묶음으로 이동하는 바로가기입니다(모든 그래프가 한 페이지에 이어서 보임).
 function show(i,noScroll){[...bar.children].forEach((b,k)=>b.classList.toggle('active',k===i));if(!noScroll){const head=grids[i].previousElementSibling;const top=head.getBoundingClientRect().top+window.scrollY-(document.querySelector('.dash-sticky')?.offsetHeight||0)-8;window.scrollTo({top,behavior:'smooth'});}}
 window.addEventListener('scroll',()=>{const off=(document.querySelector('.dash-sticky')?.offsetHeight||0)+20;let cur=0;grids.forEach((g,k)=>{if(g.previousElementSibling.getBoundingClientRect().top-off<=0)cur=k;});[...bar.children].forEach((b,k)=>b.classList.toggle('active',k===cur));},{passive:true});
 show(0,true);
 // 업체 목록에서 업체를 누르면 수출 탭으로 이동
 const oc=window.choose;if(typeof choose==='function'){window.choose=function(...a){const r=oc.apply(this,a);show(0);return r;};}
})();
