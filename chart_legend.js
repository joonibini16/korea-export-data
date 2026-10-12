// 범례 아이콘을 실제 그래프 표시와 같게 맞춘다: 막대=사각형, 선=선(점선 포함), 점만 찍는 시리즈=그 점 모양(◇·□·X 등, 속 빈 모양 포함).
(function(){if(!window.Chart)return;const L=Chart.defaults.plugins.legend.labels,base=L.generateLabels;
L.usePointStyle=true;
L.generateLabels=function(chart){const items=base.call(this,chart);for(const it of items){const ds=chart.data.datasets[it.datasetIndex];if(!ds)continue;
 const type=ds.type||chart.config.type,pick=v=>Array.isArray(v)?v.find(x=>x!=null):v,ps=pick(ds.pointStyle);
 if(type==='bar'){it.pointStyle='rect';}
 else if(ds.showLine===false||type==='scatter'||type==='bubble'){it.pointStyle=ps||'circle';it.fillStyle=pick(ds.pointBackgroundColor)||pick(ds.backgroundColor)||pick(ds.borderColor);it.strokeStyle=pick(ds.pointBorderColor)||pick(ds.borderColor);it.lineWidth=pick(ds.pointBorderWidth)||1.5;it.lineDash=[];}
 else{it.pointStyle='line';it.strokeStyle=pick(ds.borderColor);it.lineWidth=Math.max(2,pick(ds.borderWidth)||2);it.lineDash=ds.borderDash||[];}}
 return items;};})();
