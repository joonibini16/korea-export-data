// 연도별 비교 그래프(가로축 1~12월): 월 값과 월 YoY를 좌우 2개로 그립니다. 올해 굵은 파랑, 작년 하늘색, 그 이전 회색.
(function(){const inst={};const ST=['#1d6fd8','#8ec5f2','#cbd5e1','#94a3b8','#64748b'],MON=Array.from({length:12},(_,i)=>(i+1)+'월');
 function byYear(map){const by=new Map();for(const [k,v] of map){if(v==null||!/^\d{4}\.\d{2}$/.test(k))continue;const y=k.slice(0,4);if(!by.has(y))by.set(y,new Array(12).fill(null));by.get(y)[Number(k.slice(5,7))-1]=v;}return by;}
 function sets(by,years){return years.slice().reverse().map((y,k)=>({label:y+'년',data:by.get(y),borderColor:ST[k],backgroundColor:ST[k],borderWidth:k===0?3.5:k===1?2.5:1.5,pointRadius:k===0?5:k===1?4:3,pointBackgroundColor:'#0f1a33',pointBorderColor:ST[k],pointBorderWidth:2,tension:0,order:k}));}
 function draw(id,data,yTitle,fmt,zero){inst[id]?.destroy();const cv=document.getElementById(id);if(!cv)return;inst[id]=new Chart(cv,{type:'line',data:{labels:MON,datasets:data},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'top',align:'end'},tooltip:{callbacks:{label:x=>x.parsed.y==null?'':`${x.dataset.label}: ${fmt(x.parsed.y)}`}}},scales:{x:{grid:{display:false}},y:{title:{display:true,text:yTitle},ticks:zero?{callback:v=>v+'%'}:{},grid:zero?{color:c=>c.tick.value===0?'rgba(226,232,240,0.55)':'rgba(148,163,184,0.14)'}:{}}}}});}
 // map: 'YYYY.MM' → 값, unit: 표시 단위, n: 연도 수
 window.renderYearCompare=function(prefix,map,unit,title,n=5){const by=byYear(map);const years=[...by.keys()].sort().slice(-n);if(!years.length)return;
  draw(prefix+'Amt',sets(by,years),unit,v=>v.toLocaleString(undefined,{maximumFractionDigits:1})+' '+unit,false);
  const yy=new Map();for(const y of years){const p=by.get(String(Number(y)-1));yy.set(y,by.get(y).map((v,i)=>v!=null&&p&&p[i]>0?Math.round((v/p[i]-1)*1000)/10:null));}
  const ys=years.filter(y=>yy.get(y).some(v=>v!=null));draw(prefix+'Yoy',sets(yy,ys).map(d=>d),'전년 같은 달 대비 (%)',v=>(v>0?'+':'')+v.toFixed(1)+'%',true);
  const cur=years.at(-1),prev=String(Number(cur)-1),nm=by.get(cur).filter(v=>v!=null).length,sum=y=>{const a=(by.get(y)||[]).slice(0,nm);return a.every(v=>v!=null)?a.reduce((s,v)=>s+v,0):null;};
  const t=document.getElementById(prefix+'Title');if(t)t.textContent=title+' · 연도별 월 비교';
  const note=document.getElementById(prefix+'Note');if(note){const a=sum(cur),b=sum(prev);note.textContent=a!=null&&b?`${cur}년 1~${nm}월 누적 ${a.toLocaleString(undefined,{maximumFractionDigits:1})} ${unit} · 전년 같은 기간 ${b.toLocaleString(undefined,{maximumFractionDigits:1})} ${unit} (${b>0?((a/b-1)*100>0?'+':'')+((a/b-1)*100).toFixed(1)+'%':'—'})`:'';}};
})();
