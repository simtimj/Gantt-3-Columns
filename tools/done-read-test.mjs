// Live Today-cell row hints and unchanged import read budget. No Google access.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('Code.gs','utf8');
function fixture() {
  const reads=[], cache=new Map(), faults={}, props={claudeDoneApplied:'["s-one"]',claudeDoneGrouped:'2',claudeDoneSec:'1'};
  const rows=[['Date','Tasks'],['2026-11-07','old'],['2026-11-08','current']];
  const sheet={getLastRow:()=>rows.length,getRange(r,c,h=1,w=1) {
    if(r>rows.length)throw Error('outside grid');
    const get=()=>{reads.push({r,c,h,w});return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[r-1+i]?.[c-1+j]||''));};
    return {getValues:get,getValue:()=>get()[0][0]};
  }};
  const ctx=vm.createContext({console,CacheService:{getScriptCache:()=>({
    get:k=>{if(faults.cache)throw Error('cache down');return cache.get(k)||null;},
    put:(k,v)=>{if(faults.cache)throw Error('cache down');cache.set(k,v);},remove:k=>cache.delete(k)
  })},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},
  LockService:{getScriptLock:()=>({waitLock(){faults.locked=true;if(faults.onLock)faults.onLock();},releaseLock(){faults.released=true;}})}});
  vm.runInContext(source,ctx);
  ctx.formatDate_=v=>String(v||'');ctx.todayString_=()=> '2026-11-08';
  ctx.getOrCreateSheet_=()=>sheet;ctx.sheetDoneRows_=()=>[{id:'s-one',date:'2026-11-08',title:'Already applied'}];
  ctx.doneFutureLines_=html=>({html,moved:html==='future'?['line']:[]});
  ctx.addDaysToDateString_=()=> '2026-11-07';
  return {ctx,rows,sheet,reads,cache,faults,props};
}
const key='done-today-row:v1:2026-11-08';
let f=fixture();f.ctx.applyClaudeDone_();
assert.equal(f.reads.length,2,'cold unchanged path reads date column and Today');
assert.equal(f.faults.locked,undefined);
f.reads.length=0;f.ctx.applyClaudeDone_();
assert.equal(f.reads.length,1,'warm unchanged path reads live date and Today together');
assert.deepEqual(f.reads[0],{r:3,c:1,h:1,w:2});
f.rows[2][1]='edited live';
assert.equal(f.ctx.readDoneToday_(f.sheet,'2026-11-08').content,'edited live','body is never cached');
f.rows.splice(1,0,['2026-11-06','unrelated']);
assert.equal(f.ctx.readDoneToday_(f.sheet,'2026-11-08').row,4,'moved date invalidates row hint');
assert.equal(f.rows[2][1],'old');
for(const hint of ['1001','invalid','-1']) {
  f.cache.set(key,hint);
  assert.equal(f.ctx.readDoneToday_(f.sheet,'2026-11-08').content,'edited live');
}
f.faults.cache=true;
assert.equal(f.ctx.readDoneToday_(f.sheet,'2026-11-08').content,'edited live','cache outage falls back');
f=fixture();f.ctx.applyClaudeDone_();f.rows.pop();
assert.equal(f.ctx.readDoneToday_(f.sheet,'2026-11-08').row,0,'deleted day is not synthesized');
assert.equal(f.cache.has(key),false);
// The hint only drives the pre-lock check. A change made while waiting for
// the lock must be reread by the existing locked reconciliation path.
f=fixture();f.ctx.applyClaudeDone_();f.rows[2][1]='future';f.reads.length=0;
f.faults.onLock=()=>{f.rows[2][1]='fixed by another request';};
f.ctx.applyClaudeDone_();
assert.equal(f.faults.locked,true);assert.equal(f.faults.released,true);
assert.equal(f.rows[2][1],'fixed by another request');
assert.ok(f.reads.some(r=>r.r===3&&r.c===2),'locked path rereads live content');
console.log('Done import row-hint tests passed');

// Split read/parse costs without another Sheet request or behavior change.
f=fixture();const timing=f.ctx.speedTimer_();f.ctx.applyClaudeDone_(timing);
assert.equal(f.reads.length,2);
for(const key of ['done.todayCheck','done.todayRead','done.todayParse'])assert.equal(typeof timing.done().steps[key],'number');
console.log('✓ Done Today read/parse substeps preserve the live-read budget');
