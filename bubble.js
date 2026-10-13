// 버블 신호 모니터: market_daily.csv(Yahoo), fred_data.csv(FRED), cds_manual.csv 를 읽어 경고등·표·그래프를 그립니다.
const el=id=>document.getElementById(id),num=v=>v===''||v==null?null:Number(v),charts={};
const pct=v=>v==null||!isFinite(v)?'—':(v>0?'+':'')+v.toFixed(1)+'%';
async function read(p){const r=await fetch(p+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)return '';return r.text();}
function rows(t){const L=t.replace(/^﻿/,'').trim().split(/\r?\n/);const h=L[0].split(',');return L.slice(1).map(l=>{const c=l.split(',');const o={};h.forEach((k,i)=>o[k]=c[i]);return o;});}
function chart(id,cfg){charts[id]?.destroy();charts[id]=new Chart(el(id),cfg);}
const C={'^GSPC':['미국 S&P500','US','BOPTEXP'],'^IXIC':['미국 나스닥','US','BOPTEXP'],'^SOX':['미국 반도체(SOX)','US','BOPTEXP'],'^KS11':['한국 코스피','KR','XTEXVA01KRM667S'],'^KQ11':['한국 코스닥','KR','XTEXVA01KRM667S'],'^TWII':['대만 가권','TW',null],'^N225':['일본 닛케이','JP','XTEXVA01JPM667S'],'000001.SS':['중국 상해종합','CN','XTEXVA01CNM667S'],'^HSI':['홍콩 항셍','HK',null],'^GDAXI':['독일 DAX','DE','XTEXVA01DEM667S'],'^FCHI':['프랑스 CAC40','FR','XTEXVA01FRM667S'],'^FTSE':['영국 FTSE100','GB','XTEXVA01GBM667S'],'^STOXX50E':['유로 STOXX50','EU',null],'^NSEI':['인도 니프티50','IN','XTEXVA01INM667S'],'^BVSP':['브라질 보베스파','BR','XTEXVA01BRM667S'],'^GSPTSE':['캐나다 TSX','CA','XTEXVA01CAM667S'],'^AXJO':['호주 ASX200','AU','XTEXVA01AUM667S'],'^JKSE':['인도네시아 JCI','ID','XTEXVA01IDM667S'],'^MXX':['멕시코 IPC','MX','XTEXVA01MXM667S']};
const AI={ORCL:'오라클',NVDA:'엔비디아',AVGO:'브로드컴',MSFT:'마이크로소프트',META:'메타',AMZN:'아마존',GOOGL:'알파벳',TSM:'TSMC(ADR)',AMD:'AMD',CRWV:'코어위브',HYG:'하이일드 채권 ETF (HYG)',LQD:'투자등급 채권 ETF (LQD)'};
let M=new Map(),F=new Map(),E=new Map(),VK=[],cds=[],KRM=[];
const ser=s=>M.get(s)||[],fs=s=>F.get(s)||[];
function at(arr,date){let lo=0,hi=arr.length-1,ans=null;while(lo<=hi){const m=(lo+hi)>>1;if(arr[m].d<=date){ans=arr[m];lo=m+1;}else hi=m-1;}return ans;}
function back(arr,days){const last=arr.at(-1);if(!last)return null;const d=new Date(last.d);d.setDate(d.getDate()-days);return at(arr,d.toISOString().slice(0,10));}
function ret(arr,days){const a=arr.at(-1),b=back(arr,days);return a&&b?(a.v/b.v-1)*100:null;}
function ytd(arr){const a=arr.at(-1);if(!a)return null;const b=at(arr,(Number(a.d.slice(0,4))-1)+'-12-31');return b?(a.v/b.v-1)*100:null;}
function dd52(arr){const a=arr.at(-1);if(!a)return null;const d=new Date(a.d);d.setDate(d.getDate()-365);const s=d.toISOString().slice(0,10);const mx=Math.max(...arr.filter(x=>x.d>=s).map(x=>x.v));return (a.v/mx-1)*100;}
function yoyM(arr){// 월간 시계열 YoY
 const m=new Map(arr.map(x=>[x.d.slice(0,7),x.v]));const last=arr.at(-1);if(!last)return{};const k=last.d.slice(0,7),py=(Number(k.slice(0,4))-1)+k.slice(4);
 const y1=m.get(py)?(last.v/m.get(py)-1)*100:null;const ks=arr.slice(-3).map(x=>x.d.slice(0,7));const a=ks.map(x=>m.get(x)),b=ks.map(x=>m.get((Number(x.slice(0,4))-1)+x.slice(4)));
 const y3=a.every(v=>v!=null)&&b.every(v=>v>0)?(a.reduce((s,v)=>s+v,0)/b.reduce((s,v)=>s+v,0)-1)*100:null;return{y1,y3,month:k};}
function krExport(){// OECD(계절조정, 시차 2~3개월) + 관세청 월간 확정·잠정(수출YoY) 결합
 const o=fs('XTEXVA01KRM667S');const ym=new Map();
 const m=new Map(o.map(x=>[x.d.slice(0,7),x.v]));for(const x of o){const k=x.d.slice(0,7),py=(Number(k.slice(0,4))-1)+k.slice(4);if(m.get(py))ym.set(k,(x.v/m.get(py)-1)*100);}
 for(const r of KRM)ym.set(r.k,r.y);const ks=[...ym.keys()].sort().slice(-3);if(!ks.length)return{};
 return{y1:ym.get(ks.at(-1)),y3:ks.reduce((a,k)=>a+ym.get(k),0)/ks.length,month:ks.at(-1),src:KRM.length?'관세청':''};}
const cls=v=>v==null?'':v<0?'neg':'pos';const heat=v=>v==null?'':v<=-10?'background:#5b1a1a':v<=-5?'background:#3b1d1d':v>=5?'background:#12321f':'';
function td(tr,txt,style,c){const t=document.createElement('td');t.textContent=txt;if(style)t.style.cssText=style;if(c)t.className=c;tr.append(t);return t;}
function renderWeak(){const tb=el('weak');tb.replaceChildren();const pts=[];
 const list=Object.entries(C).map(([s,[name,cc,ex]])=>{const a=ser(s);const e=cc==='KR'?krExport():ex?yoyM(fs(ex)):{};return{s,name,last:a.at(-1),w:ret(a,7),m:ret(a,30),q:ret(a,91),y:ytd(a),dd:dd52(a),e};}).filter(x=>x.last).sort((a,b)=>(a.m??0)-(b.m??0));
 for(const x of list){const tr=document.createElement('tr');td(tr,x.name).title='최근 거래일 '+x.last.d;[x.w,x.m,x.q,x.y,x.dd].forEach(v=>td(tr,pct(v),heat(v),cls(v)+' h'));td(tr,x.e.y1==null?'—':pct(x.e.y1)+' ('+x.e.month.slice(2).replace('-','.')+')','',cls(x.e.y1));td(tr,pct(x.e.y3),heat(x.e.y3),cls(x.e.y3));
  const t=tr.firstChild;const weak=(x.dd!=null&&x.dd<=-10)&&(x.e.y3!=null&&x.e.y3<0),warn=(x.dd!=null&&x.dd<=-10)||(x.e.y3!=null&&x.e.y3<-5&&x.m!=null&&x.m<0);if(weak||warn){const f=document.createElement('span');f.className='flag'+(weak?'':' w');f.style.marginLeft='6px';f.textContent=weak?'약한 고리':'주의';t.append(f);}tb.append(tr);
  if(x.e.y3!=null&&x.dd!=null)pts.push({x:x.e.y3,y:x.dd,label:x.name.split(' ').slice(1).join(' ')||x.name});}
 chart('weakMap',{type:'scatter',data:{datasets:[{label:'국가',data:pts,pointRadius:7,backgroundColor:pts.map(p=>p.x<0&&p.y<=-10?'#ef4444':p.x<0||p.y<=-10?'#f59e0b':'#60a5fa')}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{right:48,top:10}},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw.label}: 수출 ${pct(c.raw.x)} · 고점 대비 ${pct(c.raw.y)}`}}},scales:{x:{title:{display:true,text:'수출 YoY 3개월 평균 (%)'},grid:{color:c=>c.tick.value===0?'rgba(226,232,240,.5)':'rgba(148,163,184,.14)'}},y:{title:{display:true,text:'52주 고점 대비 (%)'},grid:{color:c=>c.tick.value===-10?'rgba(239,68,68,.5)':'rgba(148,163,184,.14)'}}}},plugins:[{id:'lbl',afterDatasetsDraw(ch){const ctx=ch.ctx;ctx.save();ctx.font='11px sans-serif';ctx.fillStyle='#cbd5e1';ch.getDatasetMeta(0).data.forEach((p,i)=>ctx.fillText(pts[i].label,p.x+8,p.y-6));ctx.restore();}}]});
 return list;}
function since(arr,start){return arr.filter(x=>x.d>=start);}
function yoySeries(arr,lagDays=365){return arr.map(x=>{const d=new Date(x.d);d.setDate(d.getDate()-lagDays);const p=at(arr,d.toISOString().slice(0,10));return p&&p.v?{d:x.d,v:(x.v/p.v-1)*100}:null;}).filter(Boolean);}
function line(id,sets,yTitle,opts={}){const labels=[...new Set(sets.flatMap(s=>s.data.map(p=>p.d)))].sort();const ds=sets.map(s=>{const m=new Map(s.data.map(p=>[p.d,p.v]));return{label:s.label,data:labels.map(d=>m.has(d)?m.get(d):null),borderColor:s.color,backgroundColor:s.color,borderWidth:s.w||2,pointRadius:0,spanGaps:true,yAxisID:s.axis||'y',borderDash:s.dash};});
 const scales={x:{ticks:{maxTicksLimit:8},grid:{display:false}},y:{title:{display:true,text:yTitle}}};if(sets.some(s=>s.axis==='y1'))scales.y1={position:'right',grid:{drawOnChartArea:false},title:{display:true,text:opts.y1||''}};
 chart(id,{type:'line',data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom'}},scales}});}
function netLiq(){const w=fs('WALCL'),t=fs('WTREGEN'),r=fs('RRPONTSYD');return w.map(x=>{const tt=at(t,x.d),rr=at(r,x.d);return tt&&rr?{d:x.d,v:(x.v-tt.v-rr.v*1000)/1e6}:null;}).filter(Boolean);}// WALCL·TGA 백만달러, RRP 십억달러 → 조달러
function renderLiq(){const S='2020-01-01',nl=since(netLiq(),S);
 line('liqGov',[{label:'순유동성 (조 달러)',data:nl,color:'#60a5fa',w:3},{label:'연준 자산 (조 달러)',data:since(fs('WALCL'),S).map(x=>({d:x.d,v:x.v/1e6})),color:'#94a3b8'},{label:'TGA (조 달러)',data:since(fs('WTREGEN'),S).map(x=>({d:x.d,v:x.v/1e6})),color:'#f59e0b',axis:'y1'},{label:'역레포 (조 달러)',data:since(fs('RRPONTSYD'),S).map(x=>({d:x.d,v:x.v/1e3})),color:'#a78bfa',axis:'y1'}],'조 달러',{y1:'TGA·역레포 (조 달러)'});
 const ch3=nl.length>13?(nl.at(-1).v/nl.at(-14).v-1)*100:null;el('liqGovNote').textContent=nl.length?`최근 ${nl.at(-1).d} 순유동성 ${nl.at(-1).v.toFixed(2)}조 달러 · 3개월 변화 ${pct(ch3)}`:'';
 const bc=yoySeries(fs('TOTBKCR')),bl=yoySeries(fs('BUSLOANS'));
 line('liqBank',[{label:'지급준비금 (조 달러)',data:since(fs('WRESBAL'),S).map(x=>({d:x.d,v:x.v/1e6})),color:'#60a5fa',w:3},{label:'은행 신용 YoY (%)',data:since(bc,S),color:'#34d399',axis:'y1'},{label:'기업대출 YoY (%)',data:since(bl,S),color:'#f59e0b',axis:'y1'}],'조 달러',{y1:'YoY %'});
 el('liqBankNote').textContent=`은행 신용 YoY ${pct(bc.at(-1)?.v)} · 기업대출 YoY ${pct(bl.at(-1)?.v)} (${bc.at(-1)?.d||''})`;
 const m2=yoySeries(fs('M2SL')),cs=yoySeries(fs('CONSUMER'));
 line('liqPriv',[{label:'M2 YoY (%)',data:since(m2,S),color:'#60a5fa',w:3},{label:'소비자대출 YoY (%)',data:since(cs,S),color:'#f472b6'},{label:'대출태도 강화 비율 (%)',data:since(fs('DRTSCILM'),S),color:'#f59e0b',axis:'y1',dash:[5,4]}],'YoY %',{y1:'강화 응답 %'});
 el('liqPrivNote').textContent=`M2 YoY ${pct(m2.at(-1)?.v)} · 소비자대출 YoY ${pct(cs.at(-1)?.v)} · 대출태도 강화 ${fs('DRTSCILM').at(-1)?.v??'—'}%`;
 return{nl,ch3,bc:bc.at(-1)?.v,bl:bl.at(-1)?.v};}
function renderCredit(){const S='2019-01-01';
 line('oas',[{label:'하이일드',data:since(fs('BAMLH0A0HYM2'),S),color:'#ef4444',w:3},{label:'CCC 이하',data:since(fs('BAMLH0A3HYC'),S),color:'#f59e0b',axis:'y1'},{label:'BBB',data:since(fs('BAMLC0A4CBBB'),S),color:'#60a5fa'},{label:'투자등급 전체',data:since(fs('BAMLC0A0CM'),S),color:'#34d399'}],'%p',{y1:'CCC %p'});
 const by=new Map();cds.forEach(r=>{if(!by.has(r.ticker))by.set(r.ticker,[]);by.get(r.ticker).push({d:r.date,v:num(r.cds_5y_bps),r});});
 const pal=['#ef4444','#60a5fa','#f59e0b','#a78bfa','#34d399'];let i=0;const labels=[...new Set(cds.map(r=>r.date))].sort();
 chart('cds',{type:'line',data:{labels,datasets:[...by].map(([t,a])=>{const m=new Map(a.map(p=>[p.d,p.v]));const c=pal[i++%pal.length];return{label:a[0].r.entity,data:labels.map(d=>m.get(d)??null),borderColor:c,backgroundColor:c,pointRadius:5,spanGaps:true};})},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{title:{display:true,text:'bp'}},x:{grid:{display:false}}}}});
 const tb=el('cdsTable');tb.replaceChildren();for(const [t,a] of by){a.sort((x,y)=>x.d.localeCompare(y.d));const l=a.at(-1),p=a.at(-2);const tr=document.createElement('tr');td(tr,a[0].r.entity+' ('+t+')');td(tr,l.d);td(tr,l.v.toLocaleString(),l.v>=200?'background:#5b1a1a':l.v>=100?'background:#3b2a12':'');td(tr,p?(l.v-p.v>0?'+':'')+(l.v-p.v).toFixed(0)+'bp':'—');const s=td(tr,'');const aEl=document.createElement('a');aEl.href=l.r.source;aEl.target='_blank';aEl.rel='noopener';aEl.textContent='보도';s.append(aEl);tb.append(tr);}
 const ai=el('ai');ai.replaceChildren();for(const [s,n] of Object.entries(AI)){const a=ser(s);if(!a.length)continue;const tr=document.createElement('tr');td(tr,n+' ('+s+')');td(tr,a.at(-1).d);[ret(a,7),ret(a,30),ret(a,91),dd52(a)].forEach(v=>td(tr,pct(v),heat(v),cls(v)+' h'));ai.append(tr);}
 const hy=fs('BAMLH0A0HYM2');const h3=hy.length>63?hy.at(-1).v-hy.at(-64).v:null;return{hy:hy.at(-1),h3,orcl:by.get('ORCL')?.at(-1)};}
function renderOther(){const S='2020-01-01',p=s=>since(ser(s),S).map(x=>({d:x.d,v:x.v}));
 line('vol',[{label:'VIX',data:p('^VIX'),color:'#ef4444',w:2.5},{label:'NFCI',data:since(fs('NFCI'),S),color:'#60a5fa',axis:'y1'},{label:'금융스트레스(STLFSI4)',data:since(fs('STLFSI4'),S),color:'#f59e0b',axis:'y1'}],'VIX',{y1:'지수'});
 line('rates',[{label:'10년−3개월',data:since(fs('T10Y3M'),S),color:'#60a5fa',w:2.5},{label:'10년−2년',data:since(fs('T10Y2Y'),S),color:'#34d399'},{label:'10년 실질금리',data:since(fs('DFII10'),S),color:'#f59e0b',axis:'y1'}],'%p',{y1:'실질금리 %'});
 line('fx',[{label:'달러/엔',data:p('JPY=X'),color:'#ef4444',w:2.5},{label:'달러인덱스',data:p('DX-Y.NYB'),color:'#60a5fa',axis:'y1'},{label:'원/달러',data:p('KRW=X').map(x=>({d:x.d,v:x.v/10})),color:'#34d399',axis:'y1',dash:[4,3]}],'엔',{y1:'달러인덱스 · 원/달러÷10'});
 const cu=ser('HG=F'),au=ser('GC=F');const cg=since(cu,S).map(x=>{const g=at(au,x.d);return g?{d:x.d,v:x.v/g.v*1000}:null;}).filter(Boolean);
 line('macro',[{label:'구리/금 ×1000',data:cg,color:'#f59e0b',w:2.5},{label:'신규 실업수당 청구 (만 건)',data:since(fs('ICSA'),S).map(x=>({d:x.d,v:x.v/1e4})),color:'#60a5fa',axis:'y1'},{label:'삼의 법칙 ×10',data:since(fs('SAHMREALTIME'),S).map(x=>({d:x.d,v:x.v*10})),color:'#ef4444',axis:'y1',dash:[5,4]}],'구리/금',{y1:'만 건 · 삼의 법칙×10'});}
// ── 유동성·신용 한눈에: 최근 1년 소형 그래프 12개. 경보 = 1년 백분위 90% 이상(위험 방향) · 1개월 위험방향 급변 · 절대 수준 초과
function joinS(a,b,f){const mb=new Map(b.map(x=>[x.d,x.v]));return a.filter(x=>mb.has(x.d)).map(x=>({d:x.d,v:f(x.v,mb.get(x.d))}));}
const es=k=>E.get(k)||[];
function miniDefs(){const bp=(a,b)=>joinS(es(a),es(b),(x,y)=>(x-y)*100),need='ECOS 키 등록 후 표시';
 return[
 {t:'회사채 AA− − 국고채 3년',s:'한국 우량 신용 스프레드',u:'bp',d:bp('CORP_AA','KTB3Y'),dir:1,jump:15,miss:need},
 {t:'회사채 BBB− − 국고채 3년',s:'한국 비우량 신용 스프레드',u:'bp',d:bp('CORP_BBB','KTB3Y'),dir:1,jump:30,miss:need},
 {t:'CP 91일 − CD 91일',s:'한국 단기자금 경색 (레고랜드 때 급등)',u:'bp',d:bp('CP91','CD91'),dir:1,jump:20,miss:need},
 {t:'국고채 10년 − 3년',s:'한국 장단기 금리차',u:'bp',d:bp('KTB10Y','KTB3Y'),dir:-1,abs:0,miss:need},
 {t:'미국 하이일드 스프레드',s:'ICE BofA HY OAS',u:'bp',d:fs('BAMLH0A0HYM2').map(x=>({d:x.d,v:x.v*100})),dir:1,jump:75,abs:500},
 {t:'미국 투자등급 스프레드',s:'ICE BofA IG OAS',u:'bp',d:fs('BAMLC0A0CM').map(x=>({d:x.d,v:x.v*100})),dir:1,jump:20,abs:150},
 {t:'미국 순유동성',s:'연준자산 − TGA − 역레포 · 십억 달러',u:'',d:netLiq().map(x=>({d:x.d,v:x.v*1000})),dir:-1,jumpPct:5},
 {t:'미국 10년 − 2년',s:'미국 장단기 금리차',u:'bp',d:fs('T10Y2Y').map(x=>({d:x.d,v:x.v*100})),dir:-1,abs:0},
 {t:'VIX',s:'S&P500 30일 내재변동성',u:'',d:ser('^VIX'),dir:1,abs:25,dec:1},
 {t:'VIX / VIX3M',s:'1 초과 = 단기 공포 > 장기 (역전)',u:'x',d:joinS(ser('^VIX'),ser('^VIX3M'),(a,b)=>a/b),dir:1,abs:1,dec:2},
 {t:'MOVE',s:'미국 국채 내재변동성',u:'',d:ser('^MOVE'),dir:1,abs:130,jumpPct:25,dec:1},
 {t:'VKOSPI',s:'코스피200 30일 내재변동성',u:'',d:VK,dir:1,abs:30,dec:1,miss:'KRX 키 등록 후 표시 (선택)'}];}
function miniStat(o){const a=o.d;if(!a.length)return null;const last=a.at(-1),d0=new Date(last.d);const ago=n=>{const d=new Date(d0);d.setDate(d.getDate()-n);return at(a,d.toISOString().slice(0,10));};
 const y=new Date(d0);y.setFullYear(y.getFullYear()-1);const yr=a.filter(x=>x.d>=y.toISOString().slice(0,10));const w=ago(7),m=ago(30);
 const pc=yr.filter(x=>x.v<=last.v).length/yr.length*100,sorted=yr.map(x=>x.v).sort((p,q)=>p-q),med=sorted[Math.floor(sorted.length/2)];
 const ch1m=m?last.v-m.v:null,adv=v=>v==null?null:v*o.dir;const why=[];
 if((o.dir>0&&pc>=90)||(o.dir<0&&pc<=10))why.push('1년 백분위 '+Math.round(pc)+'%');
 if(o.jump!=null&&adv(ch1m)>=o.jump)why.push('1개월 '+(ch1m>0?'+':'')+ch1m.toFixed(0)+o.u);
 if(o.jumpPct!=null&&m&&adv((last.v/m.v-1)*100)>=o.jumpPct)why.push('1개월 '+pct((last.v/m.v-1)*100));
 if(o.abs!=null&&(o.dir>0?last.v>=o.abs:last.v<o.abs))why.push(o.dir>0?o.abs+' 이상':'역전');
 return{last,w:w?last.v-w.v:null,m:ch1m,pc,med,yr,why};}
function renderMini(){const box=el('mini');box.replaceChildren();const alerts=[];
 const fmt=(o,v)=>v==null?'—':o.u==='bp'?Math.round(v)+'bp':o.u==='x'?v.toFixed(2)+'x':v.toLocaleString(undefined,{maximumFractionDigits:o.dec??0});
 const sg=(o,v)=>v==null?'—':(v>0?'+':v<0?'−':'')+fmt(o,Math.abs(v)).replace(/x$/,'');
 miniDefs().forEach((o,i)=>{const st=miniStat(o);const c=document.createElement('div');c.className='mini';
  c.innerHTML='<b></b><small></small><div class="mv"><strong></strong><span></span></div><div class="mc"><canvas></canvas></div><em></em>';
  c.querySelector('b').textContent=o.t;c.querySelector('small').textContent=o.s;
  if(!st){c.querySelector('strong').textContent='—';c.querySelector('em').textContent=o.miss||'데이터 없음';c.classList.add('empty');box.append(c);return;}
  const bad=st.why.length>0;if(bad){alerts.push(o.t);c.classList.add('bad');c.title='경보: '+st.why.join(' · ');}
  c.querySelector('strong').textContent=fmt(o,st.last.v);c.querySelector('span').textContent=`1주 ${sg(o,st.w)} · 1개월 ${sg(o,st.m)} · 백분위 ${Math.round(st.pc)}%`;
  c.querySelector('em').textContent=(bad?'경보: '+st.why.join(' · ')+' · ':'')+'기준일 '+st.last.d.slice(5).replace('-','/');box.append(c);
  const col=bad?'#f87171':'#cbd5e1',L=st.yr.map(x=>x.d);
  const ds=[{data:st.yr.map(x=>x.v),borderColor:col,borderWidth:1.6,pointRadius:L.map((_,k)=>k===L.length-1?3:0),pointBackgroundColor:col,tension:0},
   {data:L.map(()=>st.med),borderColor:'rgba(148,163,184,.6)',borderDash:[4,3],borderWidth:1,pointRadius:0}];
  const vs=st.yr.map(x=>x.v),hi=Math.max(...vs),lo=Math.min(...vs),rg=(hi-lo)||1;if(o.abs!=null&&o.abs<=hi+rg*0.4&&o.abs>=lo-rg*0.4)ds.push({data:L.map(()=>o.abs),borderColor:'rgba(239,68,68,.55)',borderDash:[2,3],borderWidth:1,pointRadius:0});
  const id='mini'+i;c.querySelector('canvas').id=id;
  chart(id,{type:'line',data:{labels:L,datasets:ds},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{filter:x=>x.datasetIndex===0,callbacks:{label:x=>fmt(o,x.parsed.y)}}},
   scales:{x:{ticks:{maxTicksLimit:4,callback:function(v){const s=this.getLabelForValue(v);return s.slice(2,7).replace('-','.');},font:{size:10}},grid:{display:false}},y:{ticks:{maxTicksLimit:5,font:{size:10}},grid:{color:'rgba(148,163,184,.1)'}}}}});});
 el('miniHead').innerHTML='';const h=document.createElement('span');h.style.cssText='font-weight:700;color:'+(alerts.length?'#f87171':'#4ade80');h.textContent=alerts.length?`● 경보 ${alerts.length}개 · ${alerts.join(', ')}`:'● 경보 없음';el('miniHead').append(h);
 const n=document.createElement('span');n.className='muted';n.textContent='  — 경보: 1년 백분위 90% 이상(위험 방향) · 1개월 위험방향 급변 · 절대수준 초과. 회색 점선 = 1년 중앙값, 빨간 점선 = 경보 수준. 카드에 마우스를 올리면 경보 이유가 보입니다.';el('miniHead').append(n);}

function light(name,val,state,sub){const d=document.createElement('div');d.className='light '+state;d.innerHTML='<b></b><strong></strong><span></span>';d.children[0].textContent=name;d.children[1].textContent=val;d.children[2].textContent=sub;el('lights').append(d);return state;}
function renderLights(weak,liq,cr){el('lights').replaceChildren();const st=[];const L=(...a)=>st.push(light(...a));
 const spx=ser('^GSPC'),sox=ser('^SOX');const a=dd52(spx),b=dd52(sox);
 L('S&P500 고점 대비',pct(a),a==null?'na':a<=-10?'bad':a<=-5?'warn':'ok','−5% 주의 · −10% 경고');
 L('반도체(SOX) 고점 대비',pct(b),b==null?'na':b<=-20?'bad':b<=-10?'warn':'ok','−10% 주의 · −20% 경고');
 const nW=weak.filter(x=>x.dd!=null&&x.dd<=-10).length,nWe=weak.filter(x=>x.dd!=null&&x.dd<=-10&&x.e.y3!=null&&x.e.y3<0).length;
 L('약한 고리 국가 수',`${nWe}곳 (고점−10%↓ ${nW}곳)`,nWe>=2?'bad':nW>=3||nWe>=1?'warn':'ok','주가 고점 대비 −10%↓ & 수출 YoY<0');
 const vix=ser('^VIX').at(-1)?.v;L('VIX',vix?.toFixed(1)??'—',vix==null?'na':vix>=30?'bad':vix>=20?'warn':'ok','20 주의 · 30 경고');
 const hy=cr.hy?.v;L('하이일드 스프레드',hy!=null?hy.toFixed(2)+'%p':'—',hy==null?'na':hy>=5||cr.h3>=1?'bad':hy>=4||cr.h3>=0.5?'warn':'ok',`3개월 변화 ${cr.h3!=null?(cr.h3>0?'+':'')+cr.h3.toFixed(2)+'%p':'—'}`);
 const o=cr.orcl;L('오라클 CDS 5년',o?o.v+'bp':'—',!o?'na':o.v>=200?'bad':o.v>=120?'warn':'ok',o?o.d+' 보도 기준':'');
 L('순유동성 3개월 변화',pct(liq.ch3),liq.ch3==null?'na':liq.ch3<=-5?'bad':liq.ch3<0?'warn':'ok','감소 = 달러 유동성 축소');
 L('은행 신용 YoY',pct(liq.bc),liq.bc==null?'na':liq.bc<0?'bad':liq.bc<2?'warn':'ok','0% 미만 = 신용 수축');
 const nf=fs('NFCI').at(-1)?.v;L('금융여건(NFCI)',nf?.toFixed(2)??'—',nf==null?'na':nf>0?'bad':nf>-0.3?'warn':'ok','0 이상 = 평균보다 긴축');
 const jp=ser('JPY=X'),j1=ret(jp,30);L('엔화 1개월 (달러/엔)',pct(j1),j1==null?'na':j1<=-5?'bad':j1<=-3?'warn':'ok','−3% 주의 · −5% 경고 (엔캐리 청산)');
 const t3=fs('T10Y3M').at(-1)?.v;L('장단기 금리차 10Y−3M',t3!=null?t3.toFixed(2)+'%p':'—',t3==null?'na':t3<0?'warn':'ok','역전 = 경기 둔화 신호');
 const sahm=fs('SAHMREALTIME').at(-1)?.v;L('삼의 법칙',sahm?.toFixed(2)??'—',sahm==null?'na':sahm>=0.5?'bad':sahm>=0.3?'warn':'ok','0.5 이상 = 침체 진입 신호');
 const bad=st.filter(s=>s==='bad').length,warn=st.filter(s=>s==='warn').length,tot=st.filter(s=>s!=='na').length;
 el('scoreBig').textContent=`경고 ${bad} · 주의 ${warn} / ${tot}`;el('scoreBig').style.color=bad>=4?'#f87171':bad>=2||warn>=4?'#fbbf24':'#4ade80';
 el('scoreText').textContent=bad>=4?'여러 영역(주가·신용·유동성)이 동시에 경고 — 위험 관리 강화 구간':bad>=2||warn>=4?'일부 영역에서 균열 — 신용·유동성 지표가 따라 움직이는지 주시':'광범위한 스트레스 신호는 아직 제한적';}
async function init(){try{const [m,f,c,s,kp,ec,vk]=await Promise.all([read('market_daily.csv'),read('fred_data.csv'),read('cds_manual.csv'),read('bubble_status.json'),read('provisional_official.csv'),read('ecos_rates.csv'),read('vkospi.csv')]);
 if(!m||!f){el('err').hidden=false;el('err').textContent='데이터를 아직 수집하지 못했습니다. 자동 수집이 끝나면 표시됩니다.';}
 for(const r of rows(m||'symbol,date,close')){const v=num(r.close);if(v==null)continue;if(!M.has(r.symbol))M.set(r.symbol,[]);M.get(r.symbol).push({d:r.date,v});}
 for(const r of rows(f||'series,date,value')){const v=num(r.value);if(v==null)continue;if(!F.has(r.series))F.set(r.series,[]);F.get(r.series).push({d:r.date,v});}
 for(const r of rows(ec||'series,date,value')){const v=num(r.value);if(v==null)continue;if(!E.has(r.series))E.set(r.series,[]);E.get(r.series).push({d:r.date,v});}
 VK=rows(vk||'date,close').map(r=>({d:r.date,v:num(r.close)})).filter(x=>x.v!=null);
 for(const a of [...M.values(),...F.values(),...E.values(),VK])a.sort((x,y)=>x.d.localeCompare(y.d));cds=c?rows(c):[];
 KRM=kp?rows(kp).filter(r=>r['기간구분']==='MONTH'&&num(r['수출YoY_pct'])!=null).map(r=>({k:r['기준월'].replace('.','-'),y:num(r['수출YoY_pct'])})):[];
 const weak=renderWeak(),liq=renderLiq(),cr=renderCredit();renderOther();renderLights(weak,liq,cr);renderMini();
 const st=s?JSON.parse(s):{};el('asof').textContent=`자료 기준: 주가 ${ser('^GSPC').at(-1)?.d||'—'} · 스프레드 ${fs('BAMLH0A0HYM2').at(-1)?.d||'—'} · 순유동성 ${liq.nl.at(-1)?.d||'—'} · 수집 ${st.updated_at||'—'}`;
 el('status').textContent=st.failures?.length?`수집 실패 ${st.failures.length}건: `+st.failures.map(x=>x.id).join(', '):'';
 }catch(e){el('err').hidden=false;el('err').textContent='오류: '+e.message;console.error(e);}}
init();
