// 경로 비교(참고용): 2007 금융위기 직전 강세장(코스피 2003.3~, S&P500 2002.10~)과 현재 코스피 강세장을 같은 기준으로 겹쳐 봅니다.
(function(){
 const REF={K:{sym:'^KS11',start:'2003-03-17',peak:'2007-10-31',mid:'2007-07-25',name:'2007 코스피',col:'#38bdf8'},S:{sym:'^GSPC',start:'2002-10-09',peak:'2007-10-09',name:'2007 S&P500',col:'#a78bfa'}};
 let KS_START='2023-01-02';
 const DAY=864e5,ts=d=>Date.parse(d+'T00:00:00Z');
 const csv=t=>t.replace(/^﻿/,'').trim().split(/\r?\n/).slice(1).map(l=>l.split(','));
 const ma=(a,n)=>a.map((_,i)=>i+1<n?null:a.slice(i-n+1,i+1).reduce((s,x)=>s+x.v,0)/n);
 const fmt=(v,d=1)=>v==null?'—':(v>0?'+':'')+v.toFixed(d);
 const num=v=>Math.round(v).toLocaleString();
 let charts=[],RAW=null;
 function mk(id,cfg){const c=document.getElementById(id);if(!c)return;charts.push(new Chart(c,cfg));}
 async function run(){const box=document.getElementById('gfcBox');if(!box)return;
  if(!RAW)try{const [a,b]=await Promise.all([fetch('gfc_index.csv').then(r=>r.text()),fetch('market_daily.csv?v='+Date.now(),{cache:'no-store'}).then(r=>r.text())]);
   const g=csv(a),ser=s=>g.filter(r=>r[0]===s).map(r=>({d:r[1],v:+r[2]})).filter(x=>x.v>0);
   RAW={k7:ser('^KS11'),s7:ser('^GSPC'),ks:csv(b).filter(r=>r[0]==='^KS11').map(r=>({d:r[1],v:+r[2]})).filter(x=>x.v>0).sort((x,y)=>x.d.localeCompare(y.d))};}
  catch(e){box.innerHTML='<p class="muted">비교 자료를 읽지 못했습니다.</p>';return;}
  const {k7,s7,ks}=RAW;
  const prep=(s,start)=>{const i0=s.findIndex(x=>x.d>=start),m=ma(s,100),b=s[i0];return s.map((x,i)=>({d:x.d,v:x.v,y:(ts(x.d)-ts(b.d))/365.25/DAY,idx:x.v/b.v*100,disp:m[i]?(x.v/m[i]-1)*100:null})).filter(x=>x.y>=0);};
  const A=prep(k7,REF.K.start),B=prep(s7,REF.S.start),K=prep(ks,KS_START);
  const byD=(a,d)=>a.find(x=>x.d>=d);
  const aP=byD(A,REF.K.peak),bP=byD(B,REF.S.peak),kP=K.reduce((m,x)=>x.v>m.v?x:m,K[0]),kL=K.at(-1);
  const after=(a,p)=>a.filter(x=>x.d>=p.d).map(x=>({d:x.d,t:(ts(x.d)-ts(p.d))/DAY,dd:(x.v/p.v-1)*100,v:x.v}));
  const aA=after(A,aP).filter(x=>x.t<=1000),bA=after(B,bP).filter(x=>x.t<=1000),kA=after(K,kP);
  const lowOf=a=>a.reduce((m,x)=>x.dd<m.dd?x:m,a[0]);const aLow=lowOf(aA),bLow=lowOf(bA);
  const kNow=kA.at(-1),near=(a,t)=>a.reduce((m,x)=>Math.abs(x.t-t)<Math.abs(m.t-t)?x:m,a[0]);
  const aSame=near(aA,kNow.t),aSameDD=aA.find(x=>x.dd<=kNow.dd);
  const dmax=a=>a.reduce((m,x)=>x.disp!=null&&x.disp>(m?.disp??-1e9)?x:m,null);const aD=dmax(A.filter(x=>x.d<=aLow.d)),kD=dmax(K);
  const aAtK=A.reduce((m,x)=>Math.abs(x.y-kL.y)<Math.abs(m.y-kL.y)?x:m,A[0]);
  const startTxt={'2023-01-02':'2023-01-02(AI 사이클 시작, 2,225.7)','2020-03-19':'2020-03-19(코로나 저점, 1,457.6)'}[KS_START];
  box.innerHTML=`<div class="dc-start"><span class="muted">현재 코스피 강세장 시작점</span><div class="seg" id="gfStart"><button data-s="2023-01-02" class="${KS_START==='2023-01-02'?'on':''}">2023.1 AI 사이클</button><button data-s="2020-03-19" class="${KS_START==='2020-03-19'?'on':''}">2020.3 코로나 저점</button></div></div><div class="dc-sum">
   <div><b>같은 경과 기간 비교</b><span>현재 코스피 시작 후 T+${kL.y.toFixed(2)}년 · 시작 대비 ${Math.round(kL.idx)}. 2007 코스피는 같은 T+${aAtK.y.toFixed(2)}년(${aAtK.d}) ${Math.round(aAtK.idx)}, 최종 고점 ${Math.round(aP.idx)}(T+${aP.y.toFixed(1)}년, ${aP.d} ${num(aP.v)}). S&P500은 고점 ${Math.round(bP.idx)}(T+${bP.y.toFixed(1)}년)</span></div>
   <div><b>100일 이격도 최고치</b><span>현재 코스피 ${fmt(kD?.disp)}% (${kD?.d}) vs 2007 코스피 ${fmt(aD?.disp)}% (${aD?.d}) · 현재 ${fmt(K.at(-1).disp)}%</span></div>
   <div><b>현재 위치</b><span>${kL.d} · ${num(kL.v)} · 고점(${kP.d} ${num(kP.v)}) 대비 ${fmt(kNow.dd)}% · 고점 후 ${Math.round(kNow.t)}일</span></div>
   <div><b>2007 고점 이후 경로</b><span>2007 코스피는 고점 후 같은 ${Math.round(kNow.t)}일째(${aSame.d}) ${fmt(aSame.dd)}%, 현재와 같은 낙폭은 ${aSameDD?aSameDD.d+'('+Math.round(aSameDD.t)+'일째)':'없음'}에 처음 도달. 저점 ${aLow.d} ${fmt(aLow.dd)}%(${Math.round(aLow.t)}일). S&P500은 ${bLow.d} ${fmt(bLow.dd)}%(${Math.round(bLow.t)}일)</span></div></div>
   <div class="g3 dc-g"><div><h3>강세장 시작 = 100 (로그)</h3><div class="chart"><canvas id="gfIdx"></canvas></div></div><div><h3>100일 이격도 (%)</h3><div class="chart"><canvas id="gfDisp"></canvas></div></div><div><h3>고점 이후 낙폭 (%) · 고점 후 경과일</h3><div class="chart"><canvas id="gfDD"></canvas></div></div></div>
   <div class="dc-peak"><h3>금융위기 비교 ① 정점 정렬 · 현재 코스피 고점 = 2007-10-31 코스피 고점 = 100 (로그)</h3><div class="chart" style="height:340px"><canvas id="gfPeak"></canvas></div><p class="muted" id="gfPeakNote"></p></div>
   <div class="dc-peak"><h3>금융위기 비교 ② 중간 조정 정렬 · 현재 코스피 고점 = 2007-07-25 코스피 고점(서브프라임 1차 충격 직전) = 100 (로그)</h3><div class="chart" style="height:340px"><canvas id="gfMid"></canvas></div><p class="muted" id="gfMidNote"></p></div>
   <p class="muted">참고용 비교입니다(예측 아님). 2007 코스피는 2003-03-17 저점(515.2, 카드사태·이라크전), S&P500은 2002-10-09 저점(776.8)을 강세장 시작으로, 현재 코스피는 ${startTxt}을 시작으로 맞췄습니다. 가로축은 시작(또는 고점) 이후 경과 시간이라 실제 날짜가 다릅니다. 2007년은 부채(서브프라임·레버리지) 위기로 실적이 꺾이며 하락했고, 현재는 반도체 이익 증가가 동반된다는 차이가 있습니다. 출처: Yahoo Finance(^KS11·^GSPC 2002~2011), 현재 코스피 market_daily.csv(매일 갱신).</p>`;
  charts.forEach(c=>c.destroy());charts=[];
  const L=(label,data,color,w=2,dash)=>({label,data,borderColor:color,backgroundColor:color,borderWidth:w,borderDash:dash,pointRadius:0,tension:0,parsing:false});
  const now=(p,lab)=>({label:lab,data:[p],borderColor:'#fbbf24',backgroundColor:'#fbbf24',pointRadius:5,showLine:false,parsing:false});
  const base={responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{position:'bottom',labels:{boxWidth:10}}}};
  const tY=t=>`${t.dataset.label}: T+${t.parsed.x.toFixed(2)}년 · `;
  const xY={type:'linear',min:0,max:7,title:{display:true,text:'강세장 시작 후 경과 (년)'},ticks:{callback:v=>'T+'+v+'Y'}};
  const cut=a=>a.filter(x=>x.y<=7);
  mk('gfIdx',{type:'line',data:{datasets:[L('2007 코스피 (2003.3~)',cut(A).map(x=>({x:x.y,y:x.idx})),REF.K.col),L('2007 S&P500 (2002.10~)',cut(B).map(x=>({x:x.y,y:x.idx})),REF.S.col,1.4,[4,3]),L('현재 코스피 ('+KS_START.slice(0,7).replace('-','.')+'~)',K.map(x=>({x:x.y,y:x.idx})),'#ef4444',2.5),now({x:kL.y,y:kL.idx},'현재')]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>tY(t)+t.parsed.y.toFixed(0)}}},scales:{x:xY,y:{type:'logarithmic',min:50,title:{display:true,text:'시작=100'}}}}});
  mk('gfDisp',{type:'line',data:{datasets:[L('2007 코스피',cut(A).filter(x=>x.disp!=null).map(x=>({x:x.y,y:x.disp})),REF.K.col,1.2),L('현재 코스피',K.filter(x=>x.disp!=null).map(x=>({x:x.y,y:x.disp})),'#ef4444',1.8),
    ...(aD?[L('2007 코스피 최고 '+fmt(aD.disp,0)+'%',[{x:0,y:aD.disp},{x:7,y:aD.disp}],'rgba(56,189,248,.55)',1)]:[]),...(K.at(-1).disp!=null?[now({x:K.at(-1).y,y:K.at(-1).disp},'현재 '+K.at(-1).disp.toFixed(1)+'%')]:[])]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>tY(t)+t.parsed.y.toFixed(1)+'%'}}},scales:{x:xY,y:{title:{display:true,text:'종가 ÷ 100일 평균 − 1 (%)'}}}}});
  mk('gfDD',{type:'line',data:{datasets:[L('2007 코스피 ('+aP.d+' 고점)',aA.map(x=>({x:x.t,y:x.dd})),REF.K.col),L('2007 S&P500 ('+bP.d+' 고점)',bA.map(x=>({x:x.t,y:x.dd})),REF.S.col,1.4,[4,3]),L('현재 코스피 ('+kP.d+' 고점)',kA.map(x=>({x:x.t,y:x.dd})),'#ef4444',2.5),now({x:kNow.t,y:kNow.dd},'현재')]},
   options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: ${Math.round(t.parsed.x)}일 · ${t.parsed.y.toFixed(1)}%`}}},scales:{x:{type:'linear',min:0,max:1000,title:{display:true,text:'고점 이후 경과일'}},y:{max:0,title:{display:true,text:'고점 대비 (%)'}}}}});
  // 정점 정렬
  const pkRel=(arr,p)=>arr.map(x=>({x:(ts(x.d)-ts(p.d))/DAY,y:x.v/p.v*100,d:x.d}));
  const at=(a,t)=>a.reduce((m,x)=>Math.abs(x.x-t)<Math.abs(m.x-t)?x:m,a[0]);
  const Kp=pkRel(ks,kP),kN=Kp.at(-1);
  const draw=(id,noteId,ref,refLab,col,days,ymin,ymax,txt,extra)=>{const Rp=pkRel(k7,ref),rN=at(Rp,kN.x);
   const rows=[-365,-180,-90,-30].map(t=>`${t}일: 현재 ${at(Kp,t).y.toFixed(0)} / 2007 ${at(Rp,t).y.toFixed(0)}`).join(' · ');
   const proj=days.map(t=>{const n=at(Rp,t);return `+${t}일 ${n.d} ${n.y.toFixed(0)} → 현재 코스피 환산 ${num(kP.v*n.y/100)}`;}).join(' · ');
   const el=document.getElementById(noteId);if(el)el.textContent=`${txt(Rp)} 고점 전: ${rows}. 현재 고점 후 ${Math.round(kN.x)}일 코스피 ${kN.y.toFixed(0)} vs 같은 날짜 2007 코스피 ${rN.y.toFixed(0)}(${rN.d}). 2007 경로를 그대로 따른다고 가정한 단순 환산(예측 아님): ${proj}.`;
   mk(id,{type:'line',data:{datasets:[L(refLab,Rp.filter(x=>x.x>=-1700&&x.x<=1000).map(x=>({x:x.x,y:x.y})),col),...(extra||[]),L('현재 코스피 (고점 '+kP.d+')',Kp.filter(x=>x.x>=-1700).map(x=>({x:x.x,y:x.y})),'#ef4444',2.5),now({x:kN.x,y:kN.y},'현재')]},
    options:{...base,plugins:{...base.plugins,tooltip:{callbacks:{label:t=>`${t.dataset.label}: 고점 ${t.parsed.x>=0?'+':''}${Math.round(t.parsed.x)}일 · ${t.parsed.y.toFixed(1)}`}}},scales:{x:{type:'linear',min:-1700,max:1000,title:{display:true,text:'고점 대비 경과일 (음수 = 고점 전)'}},y:{type:'logarithmic',min:ymin,max:ymax,title:{display:true,text:'고점 = 100'}}}}});};
  const Sp=pkRel(s7,bP);
  draw('gfPeak','gfPeakNote',aP,'2007 코스피 (2007-10-31 고점 = 100)',REF.K.col,[90,180,360,480,750],20,130,
   Rp=>{const lo=Rp.filter(x=>x.x>0&&x.x<600).reduce((m,x)=>x.y<m.y?x:m,{y:1e9});const rec=Rp.find(x=>x.x>lo.x&&x.y>=100);return `금융위기 정점과 비교: 현재 코스피 고점(${kP.d} ${num(kP.v)})을 2007-10-31(2,064.9)과 같은 날로 맞춘 그래프입니다. 2007 코스피는 ${lo.d} ${(lo.y-100).toFixed(1)}%(${Math.round(lo.x)}일)까지 하락했고 ${rec?rec.d+'('+Math.round(rec.x)+'일째)':'—'}에 전고점을 회복했습니다(점선 = S&P500, 2007-10-09 고점 = 100).`;},
   [L('2007 S&P500 (2007-10-09 고점 = 100)',Sp.filter(x=>x.x>=-1700&&x.x<=1000).map(x=>({x:x.x,y:x.y})),REF.S.col,1.4,[4,3])]);
  const mP=byD(A,REF.K.mid);
  draw('gfMid','gfMidNote',mP,'2007 코스피 (2007-07-25 중간 고점 = 100)','#94a3b8',[23,70,98,200,456],20,130,
   Rp=>{const lo=Rp.filter(x=>x.x>0&&x.x<60).reduce((m,x)=>x.y<m.y?x:m,{y:1e9});const rec=Rp.find(x=>x.x>lo.x&&x.y>=100);return `금융위기 직전 조정과 비교: 현재 코스피 고점을 2007-07-25(${num(mP.v)}, 서브프라임 1차 충격 직전)에 맞춘 그래프입니다. 2007 코스피는 ${lo.d}까지 ${(lo.y-100).toFixed(1)}%(${Math.round(lo.x)}일) 급락 후 ${rec?rec.d+'('+Math.round(rec.x)+'일째)':'—'}에 전고점을 회복해 10-31 최종 고점(${Math.round(aP.v/mP.v*100)})까지 올랐다가, 이후 2008-10-24에는 이 고점 대비 ${Math.round(aLow.v/mP.v*100-100)}%까지 떨어졌습니다.`;});
 }
 document.addEventListener('click',e=>{const b=e.target.closest('#gfStart button');if(!b)return;KS_START=b.dataset.s;run();});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
