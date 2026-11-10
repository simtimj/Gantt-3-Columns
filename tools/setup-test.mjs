// Daily setup read/write budget and date-row integrity; no live Google calls.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ctx = vm.createContext({console, Date});
vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), ctx);
const props = new Map();
ctx.PropertiesService = {getScriptProperties: () => ({
  getProperty: k => props.get(k) || null,
  setProperty(k,v) { props.set(k,v); return this; }
})};
let frozen = 0, formats = 0, failFormat = false, coverage = 0;
let dayId = 1;
const days = {getSheetId: () => dayId, setFrozenRows() {frozen++;},
  getRange() {return {setNumberFormat() {formats++; if(failFormat) throw Error('format failed');}};}};
const reference = {getSheetId: () => 2, setFrozenRows() {frozen++;}};
ctx.getOrCreateSheet_ = n => n === 'Days' ? days : reference;
ctx.todayString_ = () => '2026-11-08';
const realEnsureRange = ctx.ensureDayRange_;
ctx.ensureDayRange_ = () => {coverage++;};
ctx.setupWorkspace({daily:true});
assert.equal(formats,1);
assert.equal(frozen,2);
ctx.todayString_ = () => '2026-11-09';
ctx.setupWorkspace({daily:true});
assert.equal(formats,1,'next day must not reformat unchanged tabs');
assert.equal(frozen,2);
assert.equal(coverage,2,'date coverage still maintained daily');
assert.equal(props.get('lastSetupDate'),'2026-11-09');
ctx.setupWorkspace();
assert.equal(formats,2,'manual setup still repairs formats');
dayId = 3;
failFormat = true;
ctx.todayString_ = () => '2026-11-10';
assert.throws(() => ctx.setupWorkspace({daily:true}),/format failed/);
assert.equal(props.get('lastSetupDate'),'2026-11-09','failed setup is not marked done');
assert.equal(props.get('workspaceFormatVersion'),'1:1:2','failed format is not published');
failFormat = false;
ctx.setupWorkspace({daily:true});
assert.equal(props.get('workspaceFormatVersion'),'1:3:2','recreated tab invalidates hint');
// Exercise actual date coverage against a column-sensitive sort. Plan and an
// extra column must travel with their dates when a missing day is inserted.
ctx.ensureDayRange_ = realEnsureRange;
ctx.Session = {getScriptTimeZone: () => 'UTC'};
ctx.Utilities = {formatDate: d => d.toISOString().slice(0,10)};
ctx.formatDate_ = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v || '');
const today = new Date(); today.setHours(0,0,0,0);
const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
const rows = [['Date','Tasks','Notes','Plan','Extra'],[tomorrow,'task','note','plan','extra']];
let sortWidth = 0, writes = 0;
const sheet = {getLastRow: () => rows.length, getMaxColumns: () => 5,
  getRange(r,c,h,w) {return {
    getValues: () => rows.slice(r-1,r-1+h).map(row => row.slice(c-1,c-1+w)),
    setValues(vals) {writes++; vals.forEach((row,i) => {rows[r-1+i] = [...row];});},
    sort() {
      sortWidth = w;
      const sorted = rows.slice(r-1,r-1+h).map(row => row.slice(c-1,c-1+w)).sort((a,b) => a[0]-b[0]);
      sorted.forEach((row,i) => {rows[r-1+i].splice(c-1,w,...row);});
    }
  };}};
ctx.ensureDayRange_(sheet,0,1);
assert.equal(sortWidth,5,'sort must cover all columns, including Plan');
assert.equal(rows[2][3],'plan'); assert.equal(rows[2][4],'extra');
assert.equal(rows[1][3],undefined,'new date must not inherit another day’s plan');
ctx.ensureDayRange_(sheet,0,1);
assert.equal(writes,1,'already covered dates need no write or new sort');
console.log('Daily setup tests passed');

// Compare actual old/new coverage functions under fixed clocks and timezones.
// Exact-timestamp fast paths must not duplicate text dates, legacy times or DST.
const newSource=fs.readFileSync('Code.gs','utf8');
// Actual pre-change coverage function frozen for compatibility, no git history required.
const oldSource=newSource+'\n'+"function ensureDayRange_(sheet, pastDays, futureDays) {\n  const timezone = Session.getScriptTimeZone();\n\n  const today = new Date();\n\n  today.setHours(\n    0,\n    0,\n    0,\n    0\n  );\n\n  const existing = new Set();\n  const lastRow = sheet.getLastRow();\n\n  if (lastRow >= 2) {\n    // Date column only.\n    sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(row => {\n      const date = formatDate_(row[0]);\n      if (date) existing.add(date);\n    });\n  }\n\n  const missing = [];\n\n  for (\n    let offset = -pastDays;\n    offset <= futureDays;\n    offset++\n  ) {\n    const date = new Date(today);\n\n    date.setDate(\n      today.getDate() + offset\n    );\n\n    const key = Utilities.formatDate(\n      date,\n      timezone,\n      'yyyy-MM-dd'\n    );\n\n    if (!existing.has(key)) {\n      missing.push([\n        date,\n        '',\n        ''\n      ]);\n    }\n  }\n\n  if (missing.length) {\n    sheet\n      .getRange(\n        sheet.getLastRow() + 1,\n        1,\n        missing.length,\n        3\n      )\n      .setValues(missing);\n\n    sheet\n      .getRange(\n        2,\n        1,\n        sheet.getLastRow() - 1,\n        sheet.getMaxColumns() // Keep Plan and every other column attached to its date.\n      )\n      .sort({\n        column: 1,\n        ascending: true\n      });\n  }\n}";
function coverageRun(source,input,past,future,zone='UTC',clock='2026-11-10T12:00:00Z') {
 class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}}
 const c=vm.createContext({console,Date:ClockDate});vm.runInContext(source,c);
 let calls=0,reads=0;const mutations=[];
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
 c.Session={getScriptTimeZone:()=>zone};
 c.Utilities={formatDate:d=>{calls++;const p=Object.fromEntries(fmt.formatToParts(d).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}};
 c.isDate_=v=>v instanceof Date&&!Number.isNaN(v.getTime());
 const values=[['Date','Tasks','Notes','Plan','Extra'],...input.map(r=>[...r])];
 const sh={getLastRow:()=>values.length,getMaxColumns:()=>5,getRange(r,col,h,w){return{
  getValues(){reads++;return values.slice(r-1,r-1+h).map(row=>row.slice(col-1,col-1+w));},
  setValues(v){mutations.push({kind:'append',values:v.map(row=>row.map(x=>x instanceof Date?x.toISOString():x))});v.forEach((row,i)=>{values[r-1+i]=[...row];});},
  sort(){mutations.push({kind:'sort',width:w});}
 };}};
 c.ensureDayRange_(sh,past,future);
 return {calls,reads,mutations:JSON.parse(JSON.stringify(mutations))};
}
const dayAt=n=>{const d=new Date('2026-11-10T12:00:00Z');d.setHours(0,0,0,0);d.setDate(d.getDate()+n);return d;};
const covered=Array.from({length:1096},(_,i)=>[dayAt(i-730),'task','note','plan','extra']);
function parity(input,past,future,zone,clock){const old=coverageRun(oldSource,input,past,future,zone,clock),now=coverageRun(newSource,input,past,future,zone,clock);
 assert.deepEqual(now.mutations,old.mutations,'append values/sort width must match original exactly');assert.equal(now.reads,old.reads);return{old,now};}
let pair=parity(covered,730,365);assert.equal(pair.old.calls,2192);assert.equal(pair.now.calls,0);assert.equal(pair.now.mutations.length,0);
pair=parity(covered.slice(0,-1),730,365);assert.equal(pair.now.mutations[0].values.length,1);assert.ok(pair.now.calls<=4,'only missing candidate and nearby existing dates need formatting');
for(const zone of ['UTC','America/Los_Angeles','Asia/Tokyo','Pacific/Kiritimati','Pacific/Pago_Pago']) {
 const mixed=[...covered.slice(0,20),[dayAt(0),'today','notes','plan','extra'],
  ['2026-11-09','text','','text plan',''],[new Date('2026-11-11T12:00:00Z'),'legacy noon','','noon plan',''],
  [new Date('2026-11-11T12:00:00Z'),'duplicate','','duplicate plan',''],['','empty','','',''],['not a date','invalid','','','']];
 parity(mixed,3,3,zone);
 // Non-midnight Date cells still normalize to their calendar day.
 const noon=covered.slice(720,740).map(r=>{const d=new Date(r[0]);d.setUTCHours(12);return[d,...r.slice(1)];});
 parity(noon,3,3,zone);
}
for(const [clock,dates]of[
 ['2026-11-02T12:00:00Z',['2026-11-01T07:00:00Z','2026-11-01T08:30:00Z','2026-11-01T09:30:00Z','2026-11-02T07:30:00Z']],
 ['2026-03-09T12:00:00Z',['2026-03-08T08:00:00Z','2026-03-08T10:30:00Z','2026-03-09T06:30:00Z']]])
 parity(dates.map(d=>[new Date(d),'keep','','plan','extra']),2,2,'America/Los_Angeles',clock);
parity([],0,1);parity([['2026-11-10','text','','','']],0,1);
console.log('✓ daily dates: 2192→0 formats when covered; one missing day ≤4 formats; original append/sort/read parity across text, noon/duplicate dates, five zones and both DST transitions');

// Cold setup exposes date work versus lock time using the same existing timer.
const tc=vm.createContext({console,Date});vm.runInContext(newSource,tc);
const tp=new Map();tc.PropertiesService={getScriptProperties:()=>({getProperty:k=>tp.get(k)||null,setProperty:(k,v)=>tp.set(k,v)})};
tc.todayString_=()=> '2026-11-10';tc.SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:()=>({})})};
let held=false,freed=false,maintained=0;tc.LockService={getScriptLock:()=>({tryLock(){held=true;return true;},releaseLock(){freed=true;}})};
tc.getOrCreateSheet_=()=>({getSheetId:()=>1,setFrozenRows(){},getRange:()=>({setNumberFormat(){}})});
tc.ensureDayRange_=()=>{maintained++;};const st=tc.speedTimer_();tc.ensureSetup_(st);
assert.equal(held,true);assert.equal(freed,true);assert.equal(maintained,1);
assert.equal(typeof st.done().steps['setup.lock'],'number');assert.equal(typeof st.done().steps['setup.dateCoverage'],'number');
held=false;tc.ensureSetup_(tc.speedTimer_());assert.equal(held,false,'warm setup still needs no lock');
console.log('✓ setup timing separates existing lock/date coverage work; warm path remains unchanged');

// Deterministic mixed-date fuzzing guards fallback coverage when timestamps do
// not align with local midnight. Different row order/duplicates retain parity.
let seed=731;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
for(let trial=0;trial<25;trial++) {
 const input=Array.from({length:12},(_,i)=>{
  const offset=(random()%11)-5,d=dayAt(offset);d.setTime(d.getTime()+((random()%37)-18)*3600000);
  return [i%3?d:d.toISOString().slice(0,10),'task '+i,'note','plan '+i,'extra'];
 });
 parity(input,3,3,['UTC','America/Los_Angeles','Asia/Tokyo','Pacific/Kiritimati','Pacific/Pago_Pago'][trial%5]);
}
console.log('✓ daily coverage randomized parity: mixed text/time-offset dates across five zones');
