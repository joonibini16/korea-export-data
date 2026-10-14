// 기간 조절 바(내비게이터): 아래 미니 차트의 창을 드래그해 연결된 Chart.js 그래프의 가로축 구간을 확대·이동합니다.
// RangeNav(host, {charts, min, max, series:[{data:[{x,y}], color, log}], tick:{step, fmt}, minSpan, autoY})
(function(){
 const css=`.rnav{position:relative;height:58px;margin-top:4px;user-select:none;touch-action:none}
.rnav canvas{position:absolute;inset:0;display:block}
.rn-shade{position:absolute;top:0;bottom:14px;background:rgba(11,18,32,.62);pointer-events:none}
.rn-win{position:absolute;top:0;bottom:14px;background:rgba(96,165,250,.16);border:1px solid #60a5fa;border-radius:3px;cursor:grab}
.rn-win:active{cursor:grabbing}
.rn-h{position:absolute;top:50%;width:10px;height:24px;margin-top:-12px;background:#e2e8f0;border:1px solid #64748b;border-radius:3px;cursor:ew-resize}
.rn-h::after{content:'';position:absolute;left:3px;right:3px;top:6px;bottom:6px;border-left:1px solid #64748b;border-right:1px solid #64748b}
.rn-h.l{left:-6px}.rn-h.r{right:-6px}
.rn-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:#94a3b8;margin-top:2px}
.rn-bar button{white-space:nowrap;flex:0 0 auto;background:#0f1a31;border:1px solid #2a3a5c;color:#cbd5e1;border-radius:999px;padding:2px 10px;font-size:12px;cursor:pointer}`;
 if(!document.getElementById('rnavCss')){const st=document.createElement('style');st.id='rnavCss';st.textContent=css;document.head.appendChild(st);}
 window.RangeNav=function(host,o){
  if(!host||!o.charts.length)return null;
  host.innerHTML='<div class="rnav"><canvas></canvas><div class="rn-shade l"></div><div class="rn-shade r"></div><div class="rn-win"><span class="rn-h l"></span><span class="rn-h r"></span></div></div><div class="rn-bar"><span class="rn-lab"></span><span><button type="button" class="rn-reset">전체 기간</button></span></div>';
  const wrap=host.querySelector('.rnav'),cv=wrap.querySelector('canvas'),win=wrap.querySelector('.rn-win'),sl=wrap.querySelector('.rn-shade.l'),sr=wrap.querySelector('.rn-shade.r'),lab=host.querySelector('.rn-lab');
  const H=58,PH=44;let a=o.min,b=o.max;const span=o.minSpan||(o.max-o.min)/40;
  const orig=o.charts.map(ch=>({min:ch.options.scales.y.min,max:ch.options.scales.y.max}));
  const area=()=>{const ca=o.charts[0].chartArea;return ca&&ca.right>ca.left?{l:ca.left,r:ca.right}:{l:40,r:wrap.clientWidth-10};};
  const px=v=>{const {l,r}=area();return l+(v-o.min)/(o.max-o.min)*(r-l);};
  const val=x=>{const {l,r}=area();return o.min+Math.min(1,Math.max(0,(x-l)/(r-l)))*(o.max-o.min);};
  function draw(){const w=wrap.clientWidth;if(!w)return;const dpr=devicePixelRatio||1;cv.width=w*dpr;cv.height=H*dpr;cv.style.width=w+'px';cv.style.height=H+'px';
   const c=cv.getContext('2d');c.scale(dpr,dpr);const {l,r}=area();
   c.fillStyle='rgba(15,26,49,.9)';c.fillRect(l,0,r-l,PH);c.strokeStyle='#22314f';c.strokeRect(l+.5,.5,r-l-1,PH-1);
   if(o.tick){c.font='11px system-ui,sans-serif';c.fillStyle='#64748b';c.strokeStyle='#22314f';
    for(let t=Math.ceil(o.min/o.tick.step)*o.tick.step;t<=o.max;t+=o.tick.step){const x=px(t);c.beginPath();c.moveTo(x,0);c.lineTo(x,PH);c.stroke();if(x<r-28)c.fillText(o.tick.fmt(t),x+3,H-2);}}
   let lo=Infinity,hi=-Infinity;const tr=y=>o.log?Math.log(y):y;
   o.series.forEach(s=>s.data.forEach(p=>{if(p.y==null||p.x<o.min||p.x>o.max||(o.log&&p.y<=0))return;const v=tr(p.y);if(v<lo)lo=v;if(v>hi)hi=v;}));
   o.series.forEach(s=>{c.beginPath();let first=true;s.data.forEach(p=>{if(p.y==null||p.x<o.min||p.x>o.max||(o.log&&p.y<=0))return;const x=px(p.x),y=3+(PH-6)*(1-(tr(p.y)-lo)/((hi-lo)||1));if(first){c.moveTo(x,y);first=false;}else c.lineTo(x,y);});c.strokeStyle=s.color;c.lineWidth=1.1;c.stroke();});
   place();}
  function place(){const {l,r}=area(),x1=px(a),x2=px(b);win.style.left=x1+'px';win.style.width=Math.max(4,x2-x1)+'px';sl.style.left=l+'px';sl.style.width=Math.max(0,x1-l)+'px';sr.style.left=x2+'px';sr.style.width=Math.max(0,r-x2)+'px';
   lab.textContent=(a<=o.min&&b>=o.max)?'아래 막대의 창을 드래그해 기간을 확대·이동하세요 (양쪽 손잡이 = 기간 조절, 더블클릭 = 전체)':`표시 구간: ${o.tick?o.tick.fmt(a,true):a.toFixed(1)} ~ ${o.tick?o.tick.fmt(b,true):b.toFixed(1)}`;}
  function apply(){const full=a<=o.min&&b>=o.max;
   const rd=v=>(o.max-o.min)>100?Math.round(v):Math.round(v*100)/100;o.charts.forEach((ch,i)=>{const xs=ch.options.scales.x;xs.min=full?o.min:rd(a);xs.max=full?o.max:rd(b);
    if(o.autoY!==false){const ys=ch.options.scales.y;if(full){ys.min=orig[i].min;ys.max=orig[i].max;}else{let lo=Infinity,hi=-Infinity;
     ch.data.datasets.forEach(ds=>{if(ds.rnSkip)return;(ds.data||[]).forEach(p=>{if(p&&p.x>=a&&p.x<=b&&p.y!=null){if(p.y<lo)lo=p.y;if(p.y>hi)hi=p.y;}});});
     if(lo<Infinity){if(ys.type==='logarithmic'){const n=(v,up)=>{const m=Math.pow(10,Math.floor(Math.log10(v)))/2;return (up?Math.ceil(v/m):Math.floor(v/m))*m;};ys.min=n(lo/1.03,false);ys.max=n(hi*1.03,true);}else{const st=Math.pow(10,Math.floor(Math.log10((hi-lo)||1)))/2;ys.min=Math.floor((lo-(hi-lo)*.04)/st)*st;ys.max=Math.ceil((hi+(hi-lo)*.04)/st)*st;if(orig[i].max===0)ys.max=Math.min(0,ys.max);}}}}
    ch.update('none');});place();}
  let drag=null;
  wrap.addEventListener('pointerdown',e=>{const t=e.target;const x=e.clientX-wrap.getBoundingClientRect().left;
   if(t.classList.contains('rn-h'))drag={m:t.classList.contains('l')?'l':'r'};
   else if(t===win)drag={m:'m',x0:x,a0:a,b0:b};
   else{const w=b-a,c=val(x);a=Math.max(o.min,Math.min(o.max-w,c-w/2));b=a+w;apply();drag={m:'m',x0:x,a0:a,b0:b};}
   wrap.setPointerCapture(e.pointerId);e.preventDefault();});
  wrap.addEventListener('pointermove',e=>{if(!drag)return;const x=e.clientX-wrap.getBoundingClientRect().left,v=val(x);
   if(drag.m==='l')a=Math.min(v,b-span);else if(drag.m==='r')b=Math.max(v,a+span);
   else{const d=val(x)-val(drag.x0),w=drag.b0-drag.a0;a=Math.max(o.min,Math.min(o.max-w,drag.a0+d));b=a+w;}
   a=Math.max(o.min,a);b=Math.min(o.max,b);apply();});
  const end=()=>{drag=null;};wrap.addEventListener('pointerup',end);wrap.addEventListener('pointercancel',end);
  const reset=()=>{a=o.min;b=o.max;apply();};wrap.addEventListener('dblclick',reset);host.querySelector('.rn-reset').addEventListener('click',reset);
  if(window.ResizeObserver)new ResizeObserver(()=>requestAnimationFrame(draw)).observe(wrap);
  requestAnimationFrame(draw);
  return {draw,reset};
 };
})();
