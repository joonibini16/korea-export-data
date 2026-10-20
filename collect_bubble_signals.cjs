// No network calls: snapshot the already validated local collector output.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const {snapshotFromData,rows}=require('./bubble.js');
function mergeRecords(existing,incoming){
 const map=new Map(existing.map(r=>[r.date,r]));
 for(const r of incoming){const old=map.get(r.date);
  if(old?.kind==='observed'&&r.kind!=='observed')continue;
  if(old?.kind==='observed'&&old.total>r.total)continue;
  if(old?.observed_at&&r.observed_at&&old.observed_at>r.observed_at)continue;
  map.set(r.date,r);
 }return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function validate(records){
 if(new Set(records.map(r=>r.date)).size!==records.length)throw Error('Duplicate signal date');
 for(const r of records){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.total<10||r.bad+r.warn+r.ok!==r.total||r.signals.some(s=>!['bad','warn','ok','na'].includes(s.state)))throw Error('Invalid signal snapshot '+r.date);}
}
function main(){
 const files={market:'market_daily.csv',fred:'fred_data.csv',kofia:'kofia_daily.csv',breadth:'breadth_kr.csv',cds:'cds_manual.csv',provisional:'provisional_official.csv'};
 const input={},hash=crypto.createHash('sha256');
 for(const [key,file] of Object.entries(files)){const text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';if(['market','fred'].includes(key)&&!text.trim())throw Error('Missing '+file);input[key]=text.trim()?rows(text):[];hash.update(file+text);}
 const status=JSON.parse(fs.readFileSync('bubble_status.json','utf8'));
 if(!status.updated_at||!status.yahoo_rows||!status.fred_rows)throw Error('No successful market/FRED collection: preserve history');
 const observedAt=status.updated_at,date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(observedAt));
 const path='bubble_signal_history.json';const old=fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):{schema_version:1,records:[]};const incoming=[];
 if(process.argv.includes('--backfill')){
  const start=new Date(date+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-90);
  const dates=[...new Set(input.market.filter(r=>['^KS11','^GSPC'].includes(r.symbol)&&r.date>=start.toISOString().slice(0,10)&&r.date<date).map(r=>r.date))].sort();
  for(const d of dates)if(!old.records.some(r=>r.date===d))incoming.push({date:d,kind:'reconstructed',rule_version:1,...snapshotFromData(input,d)});
 }
 incoming.push({date,kind:'observed',observed_at:observedAt,rule_version:1,input_hash:hash.digest('hex'),collection_failures:status.failures?.length||0,...snapshotFromData(input,date)});
 const records=mergeRecords(old.records,incoming);validate(records);
 const out={...old,schema_version:1,updated_at:observedAt,rule_version:1,notes:'과거 재계산은 현재 보관된 시계열 기준이며 당시 공표시차·데이터 개정을 재현하지 못합니다. 실제 관측 이력과 구분하며 투자 백테스트용이 아닙니다. 하루 중 마지막 정상 수집을 그날의 대표값으로 저장합니다.',records};
 fs.writeFileSync(path+'.tmp',JSON.stringify(out)+'\n');fs.renameSync(path+'.tmp',path);console.log('Signal history:',records.length,'days;',date,'bad',incoming.at(-1).bad,'warn',incoming.at(-1).warn,'total',incoming.at(-1).total);
}
if(require.main===module)main();module.exports={mergeRecords,validate};
