// 수출확정치 페이지: 그래프 카드를 좌우 2개씩 배치해 스크롤을 줄입니다(좁은 화면은 1열).
(function(){const pairs=[['mainChartTitle','movingAverageTitle'],['changeChartTitle','seasonalChartTitle']];
 for(const [a,b] of pairs){const A=document.getElementById(a)?.closest('.chart-box'),B=document.getElementById(b)?.closest('.chart-box');if(!A||!B)continue;
  const row=document.createElement('div');row.className='ix-pair';A.before(row);row.append(A,B);}})();
