const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {rsi,sma,closedKorean}=require('./bubble_indicators.js');
const series=a=>a.map((v,i)=>({d:String(i),v}));
assert.equal(rsi(series(Array.from({length:20},(_,i)=>i))).at(-1).v,100);
assert.equal(rsi(series(Array.from({length:20},(_,i)=>20-i))).at(-1).v,0);
assert.equal(rsi(series(Array(20).fill(1))).at(-1).v,50);
assert.equal(rsi(series(Array(14).fill(1))).at(-1).v,null);
const wilder=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28];
assert.ok(Math.abs(rsi(series(wilder)).at(-1).v-70.464135)<0.0001);
assert.equal(sma(series([0,0,0,0,0]),5).at(-1).v,0);
assert.equal(sma(series([1,2,null,4,5]),5).at(-1).v,null);
const days=[{d:'2026-10-12',v:1},{d:'2026-10-13',v:2}];
assert.equal(closedKorean(days,'2026-10-13T15:12:00+09:00').length,1);
assert.equal(closedKorean(days,'2026-10-13T16:12:00+09:00').length,2);
// Exercise live renderer bindings and all range selectors without a browser.
class Node{constructor(){this.textContent='';this.children=[];this.classList={toggle(){}};this.dataset={};}append(x){this.children.push(x)}replaceChildren(){this.children=[]}}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)},buttons=['ytd','1y','3y','all'].map(r=>Object.assign(new Node(),{dataset:{r}}));
const configs={};const context={console,Date,Map,Number,Set,document:{querySelectorAll:()=>buttons,createElement:()=>new Node(),createTextNode:x=>x},el:get,read:async p=>fs.readFileSync(p,'utf8'),ser:()=>days,cds:[],num:Number,td:(tr,t)=>{const n=new Node();n.textContent=t;tr.append(n);return n},chart:(id,c)=>{configs[id]=c}};context.window=context;
vm.createContext(context);vm.runInContext(fs.readFileSync('bubble_indicators.js','utf8'),context);
(async()=>{await context.renderBubbleIndicators({updated_at:'2026-10-13T15:12:00+09:00'});for(const b of buttons)b.onclick();assert.equal(Object.keys(configs).length,10);assert.equal(get('hyperTable').children.length,10);assert.match(get('breadthStatus').textContent,/KRX/);console.log('RSI / SMA / closed bars / chart wiring: PASS');})().catch(e=>{console.error(e);process.exit(1)});
