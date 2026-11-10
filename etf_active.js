// 액티브 ETF 구성종목 비중 변화: 두 날짜 비교 표 + 비중 추이 그래프 (원본 KRX ETF PDF, etf_pdf/*.json)
(function(){
 const box=document.getElementById('actWrap');if(!box)return;
 const $=s=>box.querySelector(s),get=u=>fetch(u+'?v='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
 let IDX=null,J=null,cur=null,A=null,B=null,sortK='chg',sortD=-1,pick=new Set(),ch=null,loaded=false;
 const f2=v=>v==null?'—':v.toFixed(2)+'%',sg=v=>v==null?'—':(v>0?'+':'')+v.toFixed(2)+'%p',cl=v=>v>0?'up':v<0?'dn':'';
 const C=['#f87171','#60a5fa','#34d399','#fbbf24','#a78bfa','#f472b6','#22d3ee','#fb923c','#e2e8f0','#86efac','#fca5a5','#93c5fd'];
 async function init(){if(loaded)return;loaded=true;IDX=await get('etf_pdf/index.json');
  if(!IDX||!IDX.etfs?.length){$('.ea-body').innerHTML='<p class="muted">구성종목 자료를 수집 중입니다. 첫 수집이 끝나면 표시됩니다.</p>';return;}
  $('.ea-etfs').innerHTML=IDX.etfs.map((e,i)=>`<button data-c="${e.code}" class="${i?'':'on'}">${e.label}</button>`).join('');
  $('.ea-etfs').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('.ea-etfs').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));load(b.dataset.c);});
  load(IDX.etfs[0].code);}
 async function load(code){cur=code;J=await get('etf_pdf/'+code+'.json');pick=new Set();if(!J||!J.dates.length){$('.ea-body').innerHTML='<p class="muted">자료 없음</p>';return;}
  const n=J.dates.length;B=n-1;A=Math.max(0,n-2);
  const opts=J.dates.map((d,i)=>`<option value="${i}">${d}</option>`).join('');$('#eaA').innerHTML=opts;$('#eaB').innerHTML=opts;$('#eaA').value=A;$('#eaB').value=B;
  // 기본 그래프 종목: 최근 비중 상위 8
  Object.entries(J.w).filter(([,a])=>a[B]!=null).sort((x,y)=>y[1][B]-x[1][B]).slice(0,8).forEach(([k])=>pick.add(k));
  render();}
 const at=(a,i)=>a&&i>=0?a[i]:null;
 function render(){if(!J)return;A=+$('#eaA').value;B=+$('#eaB').value;const n=J.dates.length;
  const rows=Object.entries(J.w).map(([k,a])=>{const wa=at(a,A),wb=at(a,B);const b5=at(a,Math.max(0,B-5)),b20=at(a,Math.max(0,B-20));
   return {k,name:J.names[k]||k,wa,wb,chg:wb!=null||wa!=null?(wb||0)-(wa||0):null,c5:wb!=null&&b5!=null?wb-b5:null,c20:wb!=null&&b20!=null?wb-b20:null,
    tag:wa==null&&wb!=null?'신규 편입':wa!=null&&wb==null?'편출':'',rel:wa?((wb||0)/wa-1)*100:null};}).filter(r=>r.wa!=null||r.wb!=null);
  rows.sort((x,y)=>{const a=x[sortK],b=y[sortK];if(a==null)return 1;if(b==null)return -1;return typeof a==='string'?sortD*a.localeCompare(b):sortD*(a-b);});
  const up=rows.filter(r=>r.chg>0.005).length,dn=rows.filter(r=>r.chg<-0.005).length,nw=rows.filter(r=>r.tag==='신규 편입').length,out=rows.filter(r=>r.tag==='편출').length;
  $('.ea-sum').innerHTML=`<b>${J.label||J.name}</b> (${J.code}) · ${J.dates[A]} → ${J.dates[B]} · 비중 확대 <b class="up">${up}</b> · 축소 <b class="dn">${dn}</b> · 신규 편입 <b class="up">${nw}</b> · 편출 <b class="dn">${out}</b> · 구성종목 ${rows.filter(r=>r.wb!=null).length}개`;
  const H=[['pick','그래프'],['name','종목'],['wa',J.dates[A]],['wb',J.dates[B]],['chg','비중 변화'],['rel','상대 변화율'],['c5','5거래일'],['c20','20거래일'],['tag','편입/편출']];
  $('#eaTbl').innerHTML='<thead><tr>'+H.map(([k,t])=>`<th data-k="${k}" class="${k==='name'||k==='tag'?'l':''}${k===sortK?' sorted':''}">${t}${k===sortK?(sortD<0?' ▼':' ▲'):''}</th>`).join('')+'</tr></thead><tbody>'+
   rows.map(r=>`<tr><td><input type="checkbox" data-p="${r.k}" ${pick.has(r.k)?'checked':''}></td><td class="l"><b>${r.name}</b> <span class="muted">${/^\w{6}$/.test(r.k)?r.k:''}</span></td><td>${f2(r.wa)}</td><td>${f2(r.wb)}</td><td class="${cl(r.chg)}" style="font-weight:700">${sg(r.chg)}</td><td class="${cl(r.rel)}">${r.rel==null?'—':(r.rel>0?'+':'')+r.rel.toFixed(1)+'%'}</td><td class="${cl(r.c5)}">${sg(r.c5)}</td><td class="${cl(r.c20)}">${sg(r.c20)}</td><td class="l ${r.tag==='편출'?'dn':r.tag?'up':''}">${r.tag}</td></tr>`).join('')+'</tbody>';
  $('#eaTbl').querySelectorAll('th').forEach(th=>th.onclick=()=>{const k=th.dataset.k;if(k==='pick')return;if(sortK===k)sortD=-sortD;else{sortK=k;sortD=k==='name'||k==='tag'?1:-1;}render();});
  $('#eaTbl').querySelectorAll('[data-p]').forEach(c=>c.onchange=()=>{c.checked?pick.add(c.dataset.p):pick.delete(c.dataset.p);chart();});
  chart();}
 function chart(){const ds=[...pick].map((k,i)=>({label:J.names[k]||k,data:J.w[k].map(v=>v??null),borderColor:C[i%C.length],backgroundColor:C[i%C.length],borderWidth:2,pointRadius:J.dates.length<30?2.5:0,spanGaps:false,tension:0}));
  if(ch)ch.destroy();
  ch=new Chart($('#eaChart'),{type:'line',data:{labels:J.dates,datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
   plugins:{legend:{position:'bottom'},tooltip:{itemSort:(a,b)=>(b.parsed.y??-1)-(a.parsed.y??-1),callbacks:{label:c=>` ${c.dataset.label} ${c.parsed.y==null?'—':c.parsed.y.toFixed(2)+'%'}`}}},
   scales:{x:{ticks:{maxTicksLimit:10,callback:function(v){const l=this.getLabelForValue(v);return typeof l==='string'?l.slice(5).replace('-','/'):'';}},grid:{display:false}},y:{title:{display:true,text:'비중 %'},grid:{color:'rgba(148,163,184,.12)'}}}}});}
 ['#eaA','#eaB'].forEach(s=>box.querySelector(s).addEventListener('change',render));
 box.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{if(!J)return;const n=J.dates.length,q=b.dataset.q;$('#eaB').value=n-1;$('#eaA').value=Math.max(0,n-1-(q==='1'?1:q==='5'?5:q==='20'?20:n));render();});
 window.__etfActive=init;
})();
