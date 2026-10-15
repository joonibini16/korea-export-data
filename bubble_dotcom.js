// 버블 경로 비교(참고용): 닷컴 버블 나스닥(1995~2002)과 현재 코스피 강세장을 같은 기준으로 겹쳐 봅니다.
(function(){
 const NQ_START='1995-01-03';let KS_START='2023-01-02'; // 기본: 2025-04-09 저점(2,293.7) · 선택: 2023-01-02(AI 사이클 시작, 2,225.7)
 const DAY=864e5,ts=d=>Date.parse(d+'T00:00:00Z');
 const csv=t=>t.replace(/^﻿/,'').trim().split(/\r?\n/).slice(1).map(l=>l.split(','));
 const ma=(a,n)=>a.map((_,i)=>i+1<n?null:a.slice(i-n+1,i+1).reduce((s,x)=>s+x.v,0)/n);
 const fmt=(v,d=1)=>v==null?'—':(v>0?'+':'')+v.toFixed(d);
 let VIEW='path';let charts=[];
 const byId={};function mk(id,cfg){const c=document.getElementById(id);if(!c)return;const ch=new Chart(c,cfg);charts.push(ch);byId[id]=ch;return ch;}
 function applyView(box){box.querySelectorAll('[data-v]').forEach(e=>{if(e.tagName!=='BUTTON')e.style.display=e.dataset.v===VIEW?'':'none';});box.querySelectorAll('#dcView button').forEach(b=>b.classList.toggle('on',b.dataset.v===VIEW));}
 let RAW=null;
 async function run(){const box=document.getElementById('dotcomBox');if(!box)return;
  let nq,ks;
  if(RAW){[nq,ks]=RAW;}else try{const [a,b]=await Promise.all([fetch('dotcom_nasdaq.csv').then(r=>r.text()),fetch('market_daily.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text())]);
   nq=csv(a).map(([d,c])=>({d,v:+c}));ks=csv(b).filter(r=>r[0]==='^KS11').map(r=>({d:r[1],v:+r[2]})).filter(x=>x.v>0).sort((x,y)=>x.d.localeCompare(y.d));RAW=[nq,ks];}
  catch(e){box.innerHTML='<p class="muted">비교 자료를 읽지 못했습니다.</p>';return;}
  const prep=(s,start)=>{const i0=s.findIndex(x=>x.d>=start),b=s[i0].v,m=ma(s,100);return s.map((x,i)=>({d:x.d,v:x.v,y:(ts(x.d)-ts(s[i0].d))/365.25/DAY,idx:x.v/b*100,disp:m[i]?(x.v/m[i]-1)*100:null})).filter(x=>x.y>=-0.25);};
  const N=prep(nq,NQ_START),K=prep(ks,KS_START);window.__ksLD=K.at(-1).d;
  const pk=a=>a.reduce((m,x)=>x.v>m.v?x:m,a[0]);const nP=pk(N),kP=pk(K),kL=K.at(-1);
  const after=(a,p)=>a.filter(x=>x.d>=p.d).map(x=>({d:x.d,t:(ts(x.d)-ts(p.d))/DAY,dd:(x.v/p.v-1)*100}));
  const nA=after(N,nP).filter(x=>x.t<=1000),kA=after(K,kP);
  const n98P=N.filter(x=>x.d>='1998-06-01'&&x.d<='1998-08-31').reduce((m,x)=>x.v>m.v?x:m,{v:-1}),n98=after(N,n98P).filter(x=>x.t<=300);
  const n98L=n98.reduce((m,x)=>x.dd<m.dd?x:m,n98[0]);
  const kNow=kA.at(-1),nSame=nA.reduce((m,x)=>Math.abs(x.t-kNow.t)<Math.abs(m.t-kNow.t)?x:m,nA[0]);
  const nSameDD=nA.find(x=>x.dd<=kNow.dd);
  const kDmax=K.reduce((m,x)=>x.disp!=null&&x.disp>(m?.disp??-1e9)?x:m,null),nDmax=N.reduce((m,x)=>x.disp!=null&&x.disp>(m?.disp??-1e9)?x:m,null);
  // 고점 이후 1차 저점·반등(코스피)
  const kLow1=kA.reduce((m,x)=>x.dd<m.dd?x:m,kA[0]);const kReb=kA.filter(x=>x.t>kLow1.t).reduce((m,x)=>!m||x.dd>m.dd?x:m,null);
  const startTxt={'2023-01-02':'2023-01-02(AI 사이클 시작, 2,225.7)','2020-03-19':'2020-03-19(코로나 저점, 1,457.6)'}[KS_START];
  const nqAtKP=N.reduce((m,x)=>Math.abs(x.y-kP.y)<Math.abs(m.y-kP.y)?x:m,N[0]),nqReach=N.find(x=>x.idx>=kP.idx);
  box.innerHTML=`<div class="dc-start"><span class="muted">코스피 강세장 시작점</span><div class="seg" id="dcStart"><button data-s="2023-01-02" class="${KS_START==='2023-01-02'?'on':''}">2023.1 AI 사이클</button><button data-s="2020-03-19" class="${KS_START==='2020-03-19'?'on':''}">2020.3 코로나 저점</button></div><span class="muted" style="margin-left:14px">비교 방식</span><div class="seg" id="dcView"><button data-v="path" class="${VIEW==='path'?'on':''}">같은 기간</button><button data-v="peak" class="${VIEW==='peak'?'on':''}">정점 정렬</button><button data-v="mid" class="${VIEW==='mid'?'on':''}">중간 조정 정렬</button></div></div><div class="dc-sum">
   <div><b>코스피 현재</b><span>${kL.d} · ${Math.round(kL.v).toLocaleString()} · 시작 대비 ${Math.round(kL.idx)} · 고점 대비 ${fmt(kNow.dd)}% · 고점 후 ${Math.round(kNow.t)}일</span></div>
   <div><b>강세장 속도</b><span>코스피 고점 ${Math.round(kP.idx)}을 T+${kP.y.toFixed(2)}년에 기록 · 나스닥은 같은 시점(T+${nqAtKP.y.toFixed(2)}년, ${nqAtKP.d}) ${Math.round(nqAtKP.idx)}, ${Math.round(kP.idx)} 도달은 ${nqReach?nqReach.d+'(T+'+nqReach.y.toFixed(2)+'년)':'—'} · 나스닥 최종 고점 ${Math.round(nP.idx)}(T+${nP.y.toFixed(1)}년)</span></div>
   <div><b>100일 이격도 최고치</b><span>코스피 ${fmt(kDmax?.disp)}% (${kDmax?.d}) vs 나스닥 ${fmt(nDmax?.disp)}% (${nDmax?.d}) · 1929년 다우 약 +20%(증권사 자료)</span></div>
   <div><b>고점 이후 경로</b><span>코스피 1차 저점 ${fmt(kLow1.dd)}% (${kLow1.d})${kReb&&kReb.d>kLow1.d?` → 반등 ${fmt(kReb.dd)}% (${kReb.d})`:''} → 현재 ${fmt(kNow.dd)}%. 나스닥은 고점 후 같은 ${Math.round(kNow.t)}일째(${nSame.d}) ${fmt(nSame.dd)}%, 같은 낙폭은 ${nSameDD?nSameDD.d+'('+Math.round(nSameDD.t)+'일째)':'없음'}에 처음 도달. 중간 조정 사례: 나스닥 1998년 ${n98P.d} 고점 → ${n98L.d} ${fmt(n98L.dd)}%(${Math.round(n98L.t)}일) 뒤 50일 만에 회복하고 2000년까지 상승</span></div></div>
   <div class="dc-g" data-v="path"><h3>강세장 시작 = 100 (로그)</h3><div class="chart" style="height:400px"><canvas id="dcIdx"></canvas></div><div id="dcIdxNav"></div><div class="g2" style="margin-top:16px"><div><h3>100일 이격도 (%) <span class="muted" style="font-weight:400">· 위 기간 조절과 연동</span></h3><div class="chart"><canvas id="dcDisp"></canvas></div></div><div><h3>고점 이후 낙폭(MDD, %) · 고점 후 경과일</h3><div class="chart"><canvas id="dcDD"></canvas></div><div id="dcDDNav"></div></div></div></div>
   <div class="dc-peak" data-v="peak"><h3>닷컴버블 비교 ① 정점 정렬 · 코스피 고점 = 나스닥 2000-03-10 정점 = 100 (로그)</h3><div class="chart" style="height:340px"><canvas id="dcPeak"></canvas></div><div id="dcPeakNav"></div>
   <p class="muted" id="dcPeakNote"></p></div>
   <div class="dc-peak" data-v="mid"><h3>닷컴버블 비교 ② 중간 조정 정렬 · 코스피 고점 = 닷컴버블 중 1998-07-20 고점(LTCM 조정 직전) = 100 (로그)</h3><div class="chart" style="height:340px"><canvas id="dcMid"></canvas></div><div id="dcMidNav"></div>
   <p class="muted" id="dcMidNote"></p></div>
   <p class="muted">참고용 비교입니다(예측 아님). 나스닥 종합 1995-01-03, 코스피 ${startTxt}을 강세장 시작으로 맞췄습니다(버튼으로 변경). 가로축은 시작(또는 고점) 이후 경과 시간이라 실제 날짜가 다릅니다. 닷컴은 이익 없는 성장주가 주도했고, 현재 코스피는 반도체 실적 증가가 동반된다는 차이가 있습니다. 출처: 나스닥 Yahoo Finance(^IXIC), 코스피 market_daily.csv(매일 갱신).</p>`;
  charts.forEach(c=>c.destroy());charts=[];applyView(box);
  const lineDS=(label,data,color,w=2)=>({label,data,borderColor:color,backgroundColor:color,borderWidth:w,pointRadius:0,tension:0,parsing:false});
  const now=(a,key,lab)=>({label:(lab||'현재')+(window.__ksLD?' ('+window.__ksLD+')':''),data:[a],borderColor:'#fbbf24',backgroundColor:'#fbbf24',pointRadius:5,showLine:false,parsing:false});
  const base={responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:10}}}};
  mk('dcIdx',{type:'line',data:{datasets:[lineDS('닷컴 나스닥 (1995.1~)',N.filter(x=>x.y<=8).map(x=>({x:x.y,y:x.idx})),'#d4a017'),lineDS('코스피 ('+KS_START.slice(0,7).replace('-','.')+'~)',K.map(x=>({x:x.y,y:x.idx})),'#ef4444',2.5),now({x:kL.y,y:kL.idx},'','현재')]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: T+${t.parsed.x.toFixed(2)}년 · ${t.parsed.y.toFixed(0)}`}}},scales:{x:{type:'linear',min:0,max:8,title:{display:true,text:'강세장 시작 후 경과 (년)'},ticks:{callback:v=>'T+'+(+(+v).toFixed(2))+'Y'}},y:{type:'logarithmic',min:80,title:{display:true,text:'시작=100'}}}}});
  mk('dcDisp',{type:'line',data:{datasets:[lineDS('닷컴 나스닥',N.filter(x=>x.disp!=null&&x.y<=8).map(x=>({x:x.y,y:x.disp})),'#d4a017',1.2),lineDS('코스피',K.filter(x=>x.disp!=null).map(x=>({x:x.y,y:x.disp})),'#ef4444',1.8),
    lineDS('나스닥 최고 +'+nDmax.disp.toFixed(0)+'%',[{x:0,y:nDmax.disp},{x:8,y:nDmax.disp}],'rgba(212,160,23,.55)',1),lineDS('1929 다우 약 +20%',[{x:0,y:20},{x:8,y:20}],'rgba(148,163,184,.6)',1),...(K.at(-1).disp!=null?[now({x:K.at(-1).y,y:K.at(-1).disp},'','현재 '+K.at(-1).disp.toFixed(1)+'%')]:[])]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: T+${t.parsed.x.toFixed(2)}년 · ${t.parsed.y.toFixed(1)}%`}}},scales:{x:{type:'linear',min:0,max:8,title:{display:true,text:'강세장 시작 후 경과 (년)'},ticks:{callback:v=>'T+'+(+(+v).toFixed(2))+'Y'}},y:{title:{display:true,text:'종가 ÷ 100일 평균 − 1 (%)'}}}}});
  {const pkRel=(arr,p)=>arr.map(x=>({x:(ts(x.d)-ts(p.d))/DAY,y:x.v/p.v*100,d:x.d}));const Np=pkRel(nq,nP),Kp=pkRel(ks,kP);
   const at=(a,t)=>a.reduce((m,x)=>Math.abs(x.x-t)<Math.abs(m.x-t)?x:m,a[0]);const kN=Kp.at(-1),nN=at(Np,kN.x);
   const rows=[-365,-180,-90,-30].map(t=>`${t}일: 코스피 ${at(Kp,t).y.toFixed(0)} / 나스닥 ${at(Np,t).y.toFixed(0)}`).join(' · ');
   const proj=[180,270,365,945].map(t=>{const n=at(Np,t);return `+${t}일 ${n.d} 나스닥 ${n.y.toFixed(0)} → 코스피 환산 ${Math.round(kP.v*n.y/100).toLocaleString()}`;}).join(' · ');
   const el=document.getElementById('dcPeakNote');if(el)el.textContent=`닷컴버블 정점과 비교: 고점(코스피 ${kP.d} ${Math.round(kP.v).toLocaleString()}, 나스닥 2000-03-10 5,049)을 같은 날로 맞춘 그래프입니다. 고점 전: ${rows}. 현재 고점 후 ${Math.round(kN.x)}일 코스피 ${kN.y.toFixed(0)} vs 같은 날짜 나스닥 ${nN.y.toFixed(0)}(${nN.d}). 나스닥 경로를 그대로 따른다고 가정한 단순 환산(예측 아님): ${proj}.`;
   {const Nm=pkRel(nq,n98P);const nM=at(Nm,kN.x);const lowM=Nm.filter(x=>x.x>0&&x.x<200).reduce((m,x)=>x.y<m.y?x:m,{y:1e9});const recM=Nm.find(x=>x.x>lowM.x&&x.y>=100);
    const rowsM=[-365,-180,-90,-30].map(t=>`${t}일: 코스피 ${at(Kp,t).y.toFixed(0)} / 나스닥 ${at(Nm,t).y.toFixed(0)}`).join(' · ');
    const projM=[60,90,180,365,600].map(t=>{const n=at(Nm,t);return `+${t}일 ${n.d} 나스닥 ${n.y.toFixed(0)} → 코스피 환산 ${Math.round(kP.v*n.y/100).toLocaleString()}`;}).join(' · ');
    const elm=document.getElementById('dcMidNote');if(elm)elm.textContent=`닷컴버블 상승 도중의 조정과 비교: 코스피 고점(${kP.d})을 나스닥의 1998년 중간 고점(${n98P.d} ${Math.round(n98P.v).toLocaleString()})에 맞춘 그래프입니다. 나스닥은 ${lowM.d}까지 ${(lowM.y-100).toFixed(1)}%(${Math.round(lowM.x)}일) 조정 후 ${recM?recM.d+'('+Math.round(recM.x)+'일째)':'—'}에 전고점을 회복했고, 2000-03-10 최종 고점까지 고점 대비 ${Math.round(nP.v/n98P.v*100)}(+${Math.round(nP.v/n98P.v*100-100)}%)로 올랐습니다. 고점 전: ${rowsM}. 현재 고점 후 ${Math.round(kN.x)}일 코스피 ${kN.y.toFixed(0)} vs 같은 날짜 나스닥 ${nM.y.toFixed(0)}(${nM.d}). 1998년 경로를 그대로 따른다고 가정한 단순 환산(예측 아님): ${projM}.`;
    mk('dcMid',{type:'line',data:{datasets:[lineDS('닷컴버블 나스닥 (1998-07-20 중간 고점 = 100)',Nm.filter(x=>x.x>=-1500&&x.x<=1000).map(x=>({x:x.x,y:x.y})),'#94a3b8'),lineDS('코스피 (고점 '+kP.d+')',Kp.filter(x=>x.x>=-1500).map(x=>({x:x.x,y:x.y})),'#ef4444',2.5),now({x:kN.x,y:kN.y},'','현재')]},
     options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: 고점 ${t.parsed.x>=0?'+':''}${Math.round(t.parsed.x)}일 · ${t.parsed.y.toFixed(1)}`}}},scales:{x:{type:'linear',min:-1500,max:1000,title:{display:true,text:'고점 대비 경과일 (음수 = 고점 전)'}},y:{type:'logarithmic',min:15,max:300,title:{display:true,text:'고점 = 100'}}}}});}
   mk('dcPeak',{type:'line',data:{datasets:[lineDS('닷컴버블 나스닥 (2000-03-10 정점 = 100)',Np.filter(x=>x.x>=-1500&&x.x<=1000).map(x=>({x:x.x,y:x.y})),'#d4a017'),lineDS('코스피 (고점 '+kP.d+')',Kp.filter(x=>x.x>=-1500).map(x=>({x:x.x,y:x.y})),'#ef4444',2.5),now({x:kN.x,y:kN.y},'','현재')]},
    options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: 고점 ${t.parsed.x>=0?'+':''}${Math.round(t.parsed.x)}일 · ${t.parsed.y.toFixed(1)}`}}},scales:{x:{type:'linear',min:-1500,max:1000,title:{display:true,text:'고점 대비 경과일 (음수 = 고점 전)'}},y:{type:'logarithmic',min:10,max:110,title:{display:true,text:'고점 = 100'}}}}});}
  mk('dcDD',{type:'line',data:{datasets:[lineDS('나스닥 (2000.3.10 고점)',nA.map(x=>({x:x.t,y:x.dd})),'#d4a017'),lineDS('코스피 ('+kP.d+' 고점)',kA.map(x=>({x:x.t,y:x.dd})),'#ef4444',2.5),now({x:kNow.t,y:kNow.dd},'','현재')]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: ${Math.round(t.parsed.x)}일 · ${t.parsed.y.toFixed(1)}%`}}},scales:{x:{type:'linear',min:0,max:1000,title:{display:true,text:'고점 이후 경과일'}},y:{max:0,title:{display:true,text:'고점 대비 (%)'}}}}});
  if(window.RangeNav){const ser=ch=>ch.data.datasets.filter(d=>d.data&&d.data.length>5).map(d=>({data:d.data,color:d.borderColor}));
   const Y={step:1,fmt:(v,f)=>f?'T+'+v.toFixed(2)+'년':'T+'+v+'Y'},D={step:250,fmt:v=>Math.round(v)+'일'};
   const nv=(id,ids,min,max,log,tick,ms)=>{const cs=ids.map(i=>byId[i]).filter(Boolean);if(cs.length)RangeNav(document.getElementById(id),{charts:cs,min,max,series:ser(cs[0]),log,tick,minSpan:ms});};
   nv('dcIdxNav',['dcIdx','dcDisp'],0,8,true,Y,.25);nv('dcDDNav',['dcDD'],0,1000,false,D,30);
   nv('dcPeakNav',['dcPeak'],-1500,1000,true,D,60);nv('dcMidNav',['dcMid'],-1500,1000,true,D,60);}
 }
 document.addEventListener('click',e=>{const b=e.target.closest('#dcStart button');if(!b)return;KS_START=b.dataset.s;run();});
 document.addEventListener('click',e=>{const b=e.target.closest('#dcView button');if(!b)return;VIEW=b.dataset.v;const box=b.closest('section');applyView(box);charts.forEach(c=>c.resize());});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
