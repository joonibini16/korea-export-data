const assert=require('node:assert/strict');
const {ad,calculate,signal}=require('./bubble_daily_strength.js');
const row=(i,up=70,down=20,flat=10)=>({date:'2026-01-'+String(i+1).padStart(2,'0'),up,down,flat,total:100,missing:0});
const same=Array.from({length:15},(_,i)=>row(i));
const s=calculate(same);
assert.equal(ad(row(0)),50); // flats included, unlike old proxy (55.56)
assert.equal(s[8].score,null);assert.equal(s[9].score,50);
assert.equal(s[10].delta,0);assert.equal(signal(40),'과매수');
assert.equal(signal(60),'극단 과매수');assert.equal(signal(-40),'과매도');
assert.equal(signal(-60),'극단 과매도');assert.equal(signal(null),'판단 보류');
assert.equal(ad(row(0,0,0,100)),0);assert.equal(ad({...row(0),up:-1}),null);
assert.equal(ad({...row(0),missing:6,up:64}),null);
assert.equal(ad({...row(0),missing:5,up:65}),100*45/95);
assert.equal(ad({...row(0),missing:1}),null);
const bad=same.map(r=>({...r}));bad[7].missing=99;
assert.equal(calculate(bad)[14].score,null); // do not skip invalid samples
const impulse=Array.from({length:10},(_,i)=>row(i,50,50,0));impulse[9]=row(9,100,0,0);
assert.equal(calculate(impulse).at(-1).score,16);
impulse[9]=row(9,50,50,0);impulse[0]=row(0,100,0,0);
assert.equal(calculate(impulse).at(-1).score,4);
assert.equal(calculate(same.slice().reverse()).at(-1).score,50);
assert.equal(calculate([...same,row(14,20,70,10)]).length,15);
assert.equal(same[0].score,undefined);
for(let k=0;k<100;k++){
 const seq=Array.from({length:20},(_,i)=>{let u=Math.floor(Math.random()*101),dn=Math.floor(Math.random()*(101-u));return row(i,u,dn,100-u-dn);});
 for(const r of calculate(seq))assert.ok(r.score===null||(r.score>=-100&&r.score<=100));
}
console.log('OBOS tests passed: formula, weights, boundaries, warmup, missing, dedup, bounds');
