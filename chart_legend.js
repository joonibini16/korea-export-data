// 범례 아이콘을 실제 그래프 표시와 같게 맞춘다: 막대=사각형, 선=선(점선 포함), 점만 찍는 시리즈=그 점 모양(◇·□·X 등, 속 빈 모양 포함).
(function(){if(!window.Chart)return;const L=Chart.defaults.plugins.legend.labels,base=L.generateLabels;
L.usePointStyle=true;
L.generateLabels=function(chart){const items=base.call(this,chart);for(const it of items){const ds=chart.data.datasets[it.datasetIndex];if(!ds)continue;
 const type=ds.type||chart.config.type,pick=v=>Array.isArray(v)?v.find(x=>x!=null):v,ps=pick(ds.pointStyle);
 if(type==='bar'){it.pointStyle='rect';}
 else if(ds.showLine===false||type==='scatter'||type==='bubble'){it.pointStyle=ps||'circle';it.fillStyle=pick(ds.pointBackgroundColor)||pick(ds.backgroundColor)||pick(ds.borderColor);it.strokeStyle=pick(ds.pointBorderColor)||pick(ds.borderColor);it.lineWidth=pick(ds.pointBorderWidth)||1.5;it.lineDash=[];}
 else{it.pointStyle='line';it.strokeStyle=pick(ds.borderColor);it.lineWidth=Math.max(2,pick(ds.borderWidth)||2);it.lineDash=ds.borderDash||[];}}
 return items;};})();
// 마우스오버 상세(툴팁)의 색 상자도 그래프 표시와 같은 모양(◇·□·X·선·막대)으로 보여준다.
(function(){if(!window.Chart)return;const T=Chart.defaults.plugins.tooltip;T.usePointStyle=true;T.boxPadding=4;
 const pick=(v,i)=>Array.isArray(v)?(v[i]??v.find(x=>x!=null)):v;
 T.callbacks.labelPointStyle=function(ctx){const ds=ctx.dataset,type=ds.type||ctx.chart.config.type,i=ctx.dataIndex;
  if(type==='bar')return{pointStyle:'rect',rotation:0};
  if(ds.showLine===false||type==='scatter'||type==='bubble')return{pointStyle:pick(ds.pointStyle,i)||'circle',rotation:0};
  return{pointStyle:pick(ds.pointStyle,i)&&pick(ds.pointStyle,i)!=='circle'?pick(ds.pointStyle,i):'line',rotation:0};};
 T.callbacks.labelColor=function(ctx){const ds=ctx.dataset,i=ctx.dataIndex,type=ds.type||ctx.chart.config.type;
  const border=pick(ds.pointBorderColor,i)||pick(ds.borderColor,i)||'#64748b';
  const bg=type==='bar'?(pick(ds.backgroundColor,i)||border):(pick(ds.pointBackgroundColor,i)||(ds.showLine===false?border:pick(ds.borderColor,i))||border);
  return{borderColor:border,backgroundColor:bg,borderWidth:2,borderDash:ds.borderDash||[]};};})();
// 밝은 툴팁: 보라 X·흰 속 표시가 어두운 배경에 묻히지 않게 한다.
(function(){if(!window.Chart)return;Object.assign(Chart.defaults.plugins.tooltip,{backgroundColor:'rgba(255,255,255,0.97)',titleColor:'#18283c',bodyColor:'#18283c',borderColor:'#cbd5e1',borderWidth:1});})();
