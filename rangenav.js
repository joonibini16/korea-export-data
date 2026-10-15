// 기간 조절 바(내비게이터) — 모든 페이지 공통.
// 1) RangeNav(host, opts): 수동 연결(버블 비교 등). opts = {charts, min, max, series:[{data:[{x,y}],color}], log, tick:{step,fmt}, minSpan, autoY}
// 2) 자동: Chart.js 플러그인으로 선·막대 차트(가로축 = 범주 또는 숫자, 점 24개 이상)에 기간 조절 바를 붙입니다.
//    끄려면 options.plugins.rangeNav = false. 같은 SYNC 그룹(마우스 동기화 차트 묶음)은 첫 차트의 바 하나로 함께 움직입니다.
(function(){
 if(window.RangeNav&&window.RangeNav.v>=2)return;
 const css=`.rnav{position:relative;height:50px;margin-top:4px;user-select:none;touch-action:none}
.rnav canvas{position:absolute;inset:0;display:block}
.rn-shade{position:absolute;top:0;bottom:14px;background:rgba(11,18,32,.62);pointer-events:none}
.rn-win{position:absolute;top:0;bottom:14px;background:rgba(96,165,250,.16);border:1px solid #60a5fa;border-radius:3px;cursor:grab}
.rn-win:active{cursor:grabbing}
.rn-h{position:absolute;top:50%;width:10px;height:22px;margin-top:-11px;background:#e2e8f0;border:1px solid #64748b;border-radius:3px;cursor:ew-resize}
.rn-h::after{content:'';position:absolute;left:3px;right:3px;top:6px;bottom:6px;border-left:1px solid #64748b;border-right:1px solid #64748b}
.rn-h.l{left:-6px}.rn-h.r{right:-6px}
.rn-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11.5px;color:#94a3b8;margin:1px 0 4px}
.rn-bar .rn-lab{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rn-bar button{white-space:nowrap;flex:0 0 auto;background:#0f1a31;border:1px solid #2a3a5c;color:#cbd5e1;border-radius:999px;padding:1px 9px;font-size:11.5px;cursor:pointer}
.rn-auto{margin-top:2px}`;
 function addCss(){if(document.getElementById('rnavCss'))return;const st=document.createElement('style');st.id='rnavCss';st.textContent=css;(document.head||document.documentElement).appendChild(st);}
 addCss();
 const listOf=o=>(typeof o.charts==='function'?o.charts():o.charts).filter(c=>c&&c.canvas);
 // 데이터 점을 {x,y}로 통일 (범주축 = 인덱스)
 function pts(ch,ds){const cat=ch.scales&&ch.scales.x&&ch.scales.x.type==='category';
  return (ds.data||[]).map((p,i)=>{if(p==null)return {x:i,y:null};if(typeof p==='number')return {x:i,y:p};if(Array.isArray(p))return {x:i,y:p[1]};
   const y=typeof p.y==='number'?p.y:null;if(cat||typeof p.x!=='number')return {x:i,y};return {x:p.x,y};});}
 function RangeNav(host,o){
  if(!host)return null;let cs=listOf(o);if(!cs.length)return null;
  cs.forEach(c=>{c.$rnManual=c.$rnManual||!o.auto;});
  host.innerHTML='<div class="rnav"><canvas></canvas><div class="rn-shade l"></div><div class="rn-shade r"></div><div class="rn-win"><span class="rn-h l"></span><span class="rn-h r"></span></div></div><div class="rn-bar"><span class="rn-lab"></span><button type="button" class="rn-reset">전체 기간</button></div>';
  const wrap=host.querySelector('.rnav'),cv=wrap.querySelector('canvas'),win=wrap.querySelector('.rn-win'),sl=wrap.querySelector('.rn-shade.l'),sr=wrap.querySelector('.rn-shade.r'),lab=host.querySelector('.rn-lab');
  const H=50,PH=36;let a=o.min,b=o.max;const span=()=>o.minSpan||(o.max-o.min)/40;
  const origOf=new WeakMap();
  const saveOrig=ch=>{if(origOf.has(ch))return;const m={};Object.entries(ch.options.scales||{}).forEach(([k,s])=>{m[k]={min:s.min,max:s.max};});origOf.set(ch,m);};
  const owner=()=>listOf(o)[0];
  const area=()=>{const c=owner(),ca=c&&c.chartArea;return ca&&ca.right>ca.left?{l:ca.left,r:ca.right}:{l:40,r:wrap.clientWidth-10};};
  const px=v=>{const {l,r}=area();return l+(v-o.min)/((o.max-o.min)||1)*(r-l);};
  const val=x=>{const {l,r}=area();return o.min+Math.min(1,Math.max(0,(x-l)/((r-l)||1)))*(o.max-o.min);};
  const fmt=(v,f)=>o.tick?o.tick.fmt(v,f):(Math.abs(o.max-o.min)>100?Math.round(v):v.toFixed(1));
  function draw(){const w=wrap.clientWidth;if(!w)return;const dpr=devicePixelRatio||1;cv.width=w*dpr;cv.height=H*dpr;cv.style.width=w+'px';cv.style.height=H+'px';
   const c=cv.getContext('2d');c.scale(dpr,dpr);const {l,r}=area();
   c.fillStyle='rgba(15,26,49,.9)';c.fillRect(l,0,r-l,PH);c.strokeStyle='#22314f';c.strokeRect(l+.5,.5,r-l-1,PH-1);
   if(o.tick){c.font='10.5px system-ui,sans-serif';c.fillStyle='#64748b';c.strokeStyle='#22314f';let lastX=-1e9;
    for(let t=Math.ceil(o.min/o.tick.step)*o.tick.step;t<=o.max+1e-9;t+=o.tick.step){const x=px(t);c.beginPath();c.moveTo(x,0);c.lineTo(x,PH);c.stroke();const s=String(fmt(t));const tw=c.measureText(s).width;if(x<r-tw-2&&x-lastX>tw+8){c.fillText(s,x+3,H-2);lastX=x;}}}
   const series=typeof o.series==='function'?o.series():o.series;
   let lo=Infinity,hi=-Infinity;const tr=y=>o.log?Math.log(y):y;
   series.forEach(s=>s.data.forEach(p=>{if(p.y==null||!isFinite(p.y)||p.x<o.min||p.x>o.max||(o.log&&p.y<=0))return;const v=tr(p.y);if(v<lo)lo=v;if(v>hi)hi=v;}));
   series.forEach(s=>{c.beginPath();let first=true;s.data.forEach(p=>{if(p.y==null||!isFinite(p.y)||p.x<o.min||p.x>o.max||(o.log&&p.y<=0)){first=true;return;}const x=px(p.x),y=3+(PH-6)*(1-(tr(p.y)-lo)/((hi-lo)||1));if(first){c.moveTo(x,y);first=false;}else c.lineTo(x,y);});c.strokeStyle=s.color||'#94a3b8';c.lineWidth=1.1;c.stroke();});
   place();}
  function place(){const {l,r}=area(),x1=px(a),x2=px(b);win.style.left=x1+'px';win.style.width=Math.max(4,x2-x1)+'px';sl.style.left=l+'px';sl.style.width=Math.max(0,x1-l)+'px';sr.style.left=x2+'px';sr.style.width=Math.max(0,r-x2)+'px';
   lab.textContent=(a<=o.min&&b>=o.max)?(o.hint||'창을 드래그해 기간 확대·이동 (양쪽 손잡이 = 기간 조절, 더블클릭 = 전체)'):`표시 구간: ${fmt(a,true)} ~ ${fmt(b,true)}`;}
  const niceLog=(v,up)=>{const m=Math.pow(10,Math.floor(Math.log10(v)))/2;return (up?Math.ceil(v/m):Math.floor(v/m))*m;};
  function fitY(ch,lo0,hi0){const orig=origOf.get(ch);Object.entries(ch.options.scales||{}).forEach(([k,ys])=>{if(k==='x'||ys.axis==='x'||ys.stacked)return;
    const t=ys.type||(ch.scales[k]&&ch.scales[k].type);if(t!=='linear'&&t!=='logarithmic')return;
    let lo=Infinity,hi=-Infinity,bar=false;
    ch.data.datasets.forEach((ds,i)=>{if(ds.rnSkip||ds.hidden||(ds.yAxisID||'y')!==k)return;if(!ch.isDatasetVisible(i))return;if((ds.type||ch.config.type)==='bar')bar=true;
     pts(ch,ds).forEach(p=>{if(p.y!=null&&isFinite(p.y)&&p.x>=lo0&&p.x<=hi0){if(p.y<lo)lo=p.y;if(p.y>hi)hi=p.y;}});});
    if(lo===Infinity)return;
    if(t==='logarithmic'){if(lo<=0)return;ys.min=niceLog(lo/1.03,false);ys.max=niceLog(hi*1.03,true);return;}
    const st=Math.pow(10,Math.floor(Math.log10((hi-lo)||Math.abs(hi)||1)))/2;
    let mn=Math.floor((lo-(hi-lo)*.04)/st)*st,mx=Math.ceil((hi+(hi-lo)*.04)/st)*st;
    if(bar||ys.beginAtZero){if(lo>=0)mn=0;if(hi<=0)mx=0;}
    if(orig[k]&&orig[k].max===0)mx=Math.min(0,mx);if(orig[k]&&orig[k].min===0&&lo>=0)mn=0;
    ys.min=mn;ys.max=mx;});}
  function apply(){const full=a<=o.min+1e-9&&b>=o.max-1e-9;const rd=o.round||(v=>(o.max-o.min)>100?Math.round(v):Math.round(v*100)/100);
   listOf(o).forEach(ch=>{saveOrig(ch);const orig=origOf.get(ch);const xs=ch.options.scales.x||(ch.options.scales.x={});
    if(full){xs.min=orig.x?orig.x.min:undefined;xs.max=orig.x?orig.x.max:undefined;if(o.autoY!==false)Object.entries(orig).forEach(([k,m])=>{if(k!=='x'&&ch.options.scales[k]){ch.options.scales[k].min=m.min;ch.options.scales[k].max=m.max;}});}
    else{xs.min=rd(a);xs.max=rd(b);if(o.autoY!==false)fitY(ch,xs.min,xs.max);}
    ch.$rnBusy=true;try{ch.update('none');}finally{ch.$rnBusy=false;}});place();}
  listOf(o).forEach(saveOrig);
  let drag=null;
  wrap.addEventListener('pointerdown',e=>{const t=e.target;const x=e.clientX-wrap.getBoundingClientRect().left;
   if(t.classList.contains('rn-h'))drag={m:t.classList.contains('l')?'l':'r'};
   else if(t===win)drag={m:'m',x0:x,a0:a,b0:b};
   else{const w=b-a,c=val(x);if(w>=o.max-o.min-1e-9){drag=null;return;}a=Math.max(o.min,Math.min(o.max-w,c-w/2));b=a+w;apply();drag={m:'m',x0:x,a0:a,b0:b};}
   try{wrap.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();});
  wrap.addEventListener('pointermove',e=>{if(!drag)return;const x=e.clientX-wrap.getBoundingClientRect().left,v=val(x);
   if(drag.m==='l')a=Math.min(v,b-span());else if(drag.m==='r')b=Math.max(v,a+span());
   else{const d=val(x)-val(drag.x0),w=drag.b0-drag.a0;a=Math.max(o.min,Math.min(o.max-w,drag.a0+d));b=a+w;}
   a=Math.max(o.min,a);b=Math.min(o.max,b);apply();});
  const end=()=>{drag=null;};wrap.addEventListener('pointerup',end);wrap.addEventListener('pointercancel',end);
  const reset=()=>{a=o.min;b=o.max;apply();};wrap.addEventListener('dblclick',reset);host.querySelector('.rn-reset').addEventListener('click',reset);
  let ro=null;if(window.ResizeObserver){ro=new ResizeObserver(()=>requestAnimationFrame(draw));ro.observe(wrap);}
  requestAnimationFrame(draw);
  return {draw,reset,destroy(){if(ro)ro.disconnect();host.remove();},opts:o};
 }
 RangeNav.v=2;window.RangeNav=RangeNav;

 // ---------- 자동 부착 ----------
 const sigOf=ch=>{const L=ch.data.labels||[];return (L.length)+'|'+(L[0]??'')+'|'+(L[L.length-1]??'')+'|'+ch.data.datasets.map(d=>(d.data||[]).length).join(',');};
 function groupOf(ch){try{if(ch.$sg&&typeof SYNC!=='undefined'&&SYNC.groups[ch.$sg])return SYNC.groups[ch.$sg].filter(c=>c.canvas&&c.canvas.isConnected);}catch(_){}return null;}
 const before=(a,b)=>!!(a.canvas.compareDocumentPosition(b.canvas)&Node.DOCUMENT_POSITION_FOLLOWING);
 function eligible(ch){if(!ch.canvas||!ch.canvas.isConnected||ch.$rnManual)return false;
  const po=ch.options.plugins||{};if(po.rangeNav===false)return false;
  const t=ch.config.type;const ok=x=>x==='line'||x==='bar';if(t?!ok(t):!ch.data.datasets.every(d=>ok(d.type||'line')))return false;if(ch.options.indexAxis==='y')return false;
  const xs=ch.scales&&ch.scales.x;if(!xs||(xs.type!=='category'&&xs.type!=='linear'))return false;
  const ph=ch.canvas.parentElement?ch.canvas.parentElement.clientHeight:ch.height;if(!ph||!ch.canvas.offsetParent)return 'later';if(ph<130)return false;
  const n=Math.max(0,...ch.data.datasets.map(d=>(d.data||[]).length));return n>=13;}
 function domainOf(ch){const xs=ch.scales.x;if(xs.type==='category'){const n=(ch.data.labels||[]).length||Math.max(...ch.data.datasets.map(d=>(d.data||[]).length));return {min:0,max:n-1,cat:true};}
  const ox=(ch.$rnOrigX)||{min:ch.options.scales.x&&ch.options.scales.x.min,max:ch.options.scales.x&&ch.options.scales.x.max};
  let lo=Infinity,hi=-Infinity;ch.data.datasets.forEach(ds=>pts(ch,ds).forEach(p=>{if(p.y!=null&&isFinite(p.x)){if(p.x<lo)lo=p.x;if(p.x>hi)hi=p.x;}}));
  return {min:ox.min??lo,max:ox.max??hi,cat:false};}
 function attach(ch){if(ch.$rn)return true;const e=eligible(ch);if(e==='later')return 'later';if(!e)return false;
  const grp=groupOf(ch);if(grp&&grp.length>1){const first=grp.reduce((m,c)=>before(c,m)?c:m,grp[0]);if(first!==ch){ch.$rnFollower=true;return false;}}
  const xs=ch.options.scales&&ch.options.scales.x;ch.$rnOrigX={min:xs&&xs.min,max:xs&&xs.max};
  const d=domainOf(ch);if(!(d.max>d.min))return false;
  const L=ch.data.labels||[];
  const tick=d.cat?{step:Math.max(1,Math.ceil((d.max-d.min+1)/8)),fmt:(v)=>{const s=L[Math.round(v)];return s==null?'':String(Array.isArray(s)?s.join(' '):s);}}:null;
  const anchor=ch.canvas.parentElement&&ch.canvas.parentElement.children.length===1&&ch.canvas.parentElement!==document.body?ch.canvas.parentElement:ch.canvas;
  const host=document.createElement('div');host.className='rn-auto';anchor.after(host);
  const charts=()=>{const g=groupOf(ch);return g&&g.length>1?[ch,...g.filter(c=>c!==ch)]:[ch];};
  const series=()=>ch.data.datasets.map((ds,i)=>({ds,i})).filter(({ds,i})=>!ds.rnSkip&&ch.isDatasetVisible(i)&&(ds.data||[]).length>=5).slice(0,4).map(({ds})=>({data:pts(ch,ds),color:typeof ds.borderColor==='string'?ds.borderColor:(typeof ds.backgroundColor==='string'?ds.backgroundColor:'#94a3b8')}));
  const ylog=ch.scales.y&&ch.scales.y.type==='logarithmic';
  const grpd=grp&&grp.length>1;
  ch.$rn=RangeNav(host,{auto:true,charts,min:d.min,max:d.max,series,log:ylog,tick,minSpan:d.cat?Math.max(2,(d.max-d.min)/60):(d.max-d.min)/60,round:d.cat?Math.round:null,
   hint:grpd?'창을 드래그해 기간 확대·이동 (아래 연동 차트도 함께 · 더블클릭 = 전체)':null});
  ch.$rnHost=host;ch.$rnSig=sigOf(ch);return true;}
 const plugin={id:'rangeNavAuto',
  afterRender(ch){if(ch.$rn||ch.$rnDone||ch.$rnPend||ch.$rnFollower||ch.$rnManual)return;ch.$rnPend=true;setTimeout(()=>{ch.$rnPend=false;if(!ch.canvas||ch.$rn||ch.$rnManual)return;let r=false;try{r=attach(ch);}catch(e){console.warn('rangeNav',e);}if(r!=='later')ch.$rnDone=true;},60);},
  afterUpdate(ch){if(!ch.$rn||ch.$rnBusy)return;const s=sigOf(ch);if(s!==ch.$rnSig){const xs=ch.options.scales.x;if(xs&&ch.$rnOrigX){xs.min=ch.$rnOrigX.min;xs.max=ch.$rnOrigX.max;}ch.$rn.destroy();ch.$rn=null;ch.$rnDone=false;}},
  afterDestroy(ch){if(ch.$rn){ch.$rn.destroy();ch.$rn=null;}}};
 setInterval(()=>{if(!window.Chart)return;Object.values(Chart.instances||{}).forEach(ch=>{if(!ch.$rn&&!ch.$rnDone&&!ch.$rnPend&&!ch.$rnFollower&&!ch.$rnManual&&ch.canvas&&ch.canvas.offsetParent)plugin.afterRender(ch);});},1500);
 function register(){if(!window.Chart||!Chart.register)return false;if(Chart.registry&&Chart.registry.plugins.get&&(()=>{try{return Chart.registry.plugins.get('rangeNavAuto');}catch(_){return null;}})())return true;
  Chart.register(plugin);const inst=Object.values(Chart.instances||{});inst.forEach(ch=>{try{plugin.afterRender(ch);}catch(_){}});return true;}
 if(!register()){let k=0;const t=setInterval(()=>{if(register()||++k>100)clearInterval(t);},100);}
})();
