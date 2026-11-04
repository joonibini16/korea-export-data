// 모든 선 그래프 오른쪽에 약간의 여백: 가장 최근 날짜에도 마우스를 올려 값을 볼 수 있게 함
// - 날짜(카테고리) 축: 보이는 구간 길이의 2%(최소 1칸)만큼 빈 칸을 오른쪽에 둠(데이터는 건드리지 않음)
// - 숫자·시간 축: 보이는 범위의 2%만큼 최댓값을 늘림
// - 막대 그래프, 20개 미만 짧은 그래프, options.plugins.rightPad === false 인 그래프는 제외
(function(){
 function register(){
  if(!window.Chart||!Chart.register)return false;
  try{if(Chart.registry.plugins.get('rightPad'))return true;}catch(_){}
  // 여백 칸(데이터 범위 밖)의 눈금 이름은 빈 문자열로 → 기존 눈금 함수(.slice 등)가 깨지지 않게
  const C=Chart.CategoryScale&&Chart.CategoryScale.prototype;
  if(C&&!C.$rpPatched){const g=C.getLabelForValue;C.getLabelForValue=function(v){const L=this.getLabels();if(typeof v==='number'&&(v>=L.length||v<0))return '';return g.call(this,v);};C.$rpPatched=true;}
  Chart.register({id:'rightPad',afterDataLimits(ch,a){const s=a.scale;if(!s||s.axis!=='x'||ch.options?.plugins?.rightPad===false)return;
   const t=ch.config.type,ds=ch.data?.datasets||[];const isLine=t==='line'||t==='scatter'||(t==='bar'&&ds.length&&ds.every(d=>d.type==='line'))||(!t&&ds.some(d=>d.type==='line'));
   if(!isLine)return;
   if(s.type==='category'){const n=(ch.data.labels||[]).length;if(n<20)return;const lo=s.min??0,hi=s.max??n-1;if(hi<n-1)return;/* 최신 구간을 보고 있을 때만 */const pad=Math.max(1,Math.round((hi-lo)*0.02));s.max=hi+pad;s.$rpN=n;}
   else if(s.type==='linear'||s.type==='time'||s.type==='timeseries'){const r=s.max-s.min;if(!(r>0))return;s.max=s.max+r*0.02;}}});
  Chart.register({id:'rightPadTicks',afterBuildTicks(ch,a){const s=a.scale;if(s&&s.$rpN!=null&&Array.isArray(s.ticks))s.ticks=s.ticks.filter(t=>t.value<s.$rpN);}});
  // 여백 칸에서도 가장 가까운 최신 값이 툴팁에 나오도록(index 모드는 범위 밖 인덱스를 무시하므로 가장 가까운 유효 칸으로)
  return true;}
 if(!register()){let k=0;const t=setInterval(()=>{if(register()||++k>40)clearInterval(t);},250);}
})();
