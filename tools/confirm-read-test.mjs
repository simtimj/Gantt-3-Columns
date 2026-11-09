// Confirmation refresh service budgets and live-data reconciliation. No Google access.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source = fs.readFileSync('Code.gs','utf8');
const HEAD = ['Date','Project','Change','How to check','Status','Checked on'];
export function fixture(serverSource = source) {
  const reads=[],writes=[],cache=new Map(),props={},stats={lookups:0,locks:0},faults={};
  function sheet(name,rows) { return {name,rows,grid:1000,
    getLastRow(){return this.rows.length;},
    getDataRange(){return this.getRange(1,1,this.rows.length,Math.max(...this.rows.map(r=>r.length)));},
    getRange(r,c,h=1,w=1){
      if(r+h-1>this.grid) throw Error('out of bounds');
      const get=()=>{reads.push({name,r,c,h,w});return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>this.rows[r-1+i]?.[c-1+j]??''));};
      return {getValues:get,getValue:()=>get()[0][0],setValues:values=>{
        writes.push({name,r,c,values});values.forEach((row,i)=>row.forEach((v,j)=>{this.rows[r-1+i] ||= [];this.rows[r-1+i][c-1+j]=v;}));
      },setValue:v=>{writes.push({name,r,c,values:[[v]]});this.rows[r-1] ||= [];this.rows[r-1][c-1]=v;}};
    },appendRow(row){writes.push({name,append:true});this.rows.push(row);}
  }; }
  const intake=sheet('To Confirm',[HEAD,['2026-11-07','Gantt','Example','Check it','','']]);
  const ref=sheet('Reference',[['ID','ParentID','Type','Title','Content','Expanded','Sort']]);
  const sheets=new Map([['To Confirm',intake],['Reference',ref]]);
  const ss={getSheetByName:name=>{stats.lookups++;return sheets.get(name)||null;}};
  const ctx=vm.createContext({console,SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
    CacheService:{getScriptCache:()=>({get:k=>{if(faults.cache)throw Error('cache down');return cache.get(k)||null;},put:(k,v)=>{if(faults.cache)throw Error('cache down');cache.set(k,v);},remove:k=>cache.delete(k)})},
    LockService:{getScriptLock:()=>({tryLock(){stats.locks++;if(faults.busy)return false;if(faults.onLock)faults.onLock();return true;},releaseLock(){stats.released=true;}})},
    PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>props[k]=v})}});
  vm.runInContext(serverSource,ctx);
  ctx.cellHash_=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
  ctx.getOrCreateSheet_=(name)=>ss.getSheetByName(name);
  ctx.todayString_=()=> '2026-11-07';ctx.getRefPins_=()=>['other'];ctx.backupCell_=()=>{};
  ref.rows.push(['p-to-confirm','','item','To Confirm',ctx.confirmCardHtml_(ctx.confirmRows_(intake)),true,0]);
  const reset=()=>{reads.length=0;writes.length=0;stats.lookups=0;stats.locks=0;};
  reset();
  return {ctx,intake,ref,reads,writes,cache,props,stats,faults,sheets,reset};
}
const key='confirm-card-row:v1';
let f=fixture();f.ctx.syncConfirmCard_();
assert.equal(f.reads.length,3,'cold path reads source, ID column, then content');assert.equal(f.stats.lookups,2);assert.equal(f.stats.locks,0);assert.equal(f.writes.length,0);
f.reset();f.ctx.syncConfirmCard_();
assert.equal(f.reads.length,2,'warm unchanged path reads source plus card identity/content');assert.equal(f.stats.lookups,2);assert.equal(f.stats.locks,0);assert.equal(f.writes.length,0);
assert.equal(f.reads.filter(r=>r.name==='Reference'&&r.c===1&&r.w===5).length,1);
// Neither source status nor checkbox state is cached.
f.intake.rows[1][4]='works';f.ctx.syncConfirmCard_();assert.ok(!f.ref.rows[1][4].includes('data-kid='));
f=fixture();f.ctx.syncConfirmCard_();f.ref.rows[1][4]=f.ref.rows[1][4].replace('class="check-line"','class="check-line done"');
f.ctx.syncConfirmCard_();assert.equal(f.intake.rows[1][4],'works');assert.equal(f.intake.rows[1][5],'2026-11-07');assert.ok(!f.ref.rows[1][4].includes('data-kid='));
// A stale hint may point at another card: never overwrite it.
f=fixture();f.ctx.syncConfirmCard_();const unrelated=['other','','item','Other','Keep me',true,1];f.ref.rows.splice(1,0,unrelated);
f.ctx.syncConfirmCard_();assert.equal(unrelated[4],'Keep me');assert.equal(f.cache.get(key),'3');
f.cache.set(key,'1001');f.ctx.syncConfirmCard_();assert.equal(f.cache.get(key),'3');
f.cache.set(key,'not-a-row');f.ctx.syncConfirmCard_();assert.equal(f.cache.get(key),'3');
f.faults.cache=true;f.intake.rows[1][4]='works';f.ctx.syncConfirmCard_();assert.ok(!f.ref.rows[2][4].includes('data-kid='));
// Deleted card is recreated once and pinned, while an insertion before lock acquisition is observed.
f=fixture();f.ctx.syncConfirmCard_();f.ref.rows.splice(1,1);f.ctx.syncConfirmCard_();
assert.equal(f.ref.rows.filter(r=>r[0]==='p-to-confirm').length,1);assert.equal(JSON.parse(f.props.refPinned)[0],'p-to-confirm');
f=fixture();const saved=f.ref.rows.pop();f.faults.onLock=()=>{f.ref.rows.push(saved);f.faults.onLock=null;};
f.ctx.syncConfirmCard_();assert.equal(f.ref.rows.filter(r=>r[0]==='p-to-confirm').length,1);assert.equal(f.writes.length,0);
// Work discovered before a lock must be reconciled again with edits made before acquiring it.
f=fixture();f.intake.rows.push(['2026-11-07','Gantt','New item','Try it','','']);
f.faults.onLock=()=>{f.ref.rows[1][4]=f.ref.rows[1][4].replace('class="check-line"','class="check-line done"');f.faults.onLock=null;};
f.ctx.syncConfirmCard_();assert.equal(f.intake.rows[1][4],'works');assert.ok(f.ref.rows[1][4].includes('New item'));assert.ok(!f.ref.rows[1][4].includes('<b>Example</b>'));
f=fixture();f.intake.rows.push(['2026-11-07','Gantt','New item','Try it','','']);f.faults.busy=true;
f.ctx.syncConfirmCard_();assert.equal(f.writes.length,0);f.faults.busy=false;f.ctx.syncConfirmCard_();assert.ok(f.ref.rows[1][4].includes('New item'));
f=fixture();f.sheets.delete('To Confirm');f.ctx.syncConfirmCard_();assert.equal(f.stats.lookups,1);assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);
console.log('✓ To Confirm: warm unchanged refresh = 2 data reads / 2 Sheet lookups; live edits, moved/deleted rows, invalid hints, cache failure, creation races and locked rereads preserved');
// Instrument the real unchanged and changed paths without changing service budgets.
f=fixture();f.ctx.syncConfirmCard_();f.reset();
let profile=f.ctx.speedTimer_();f.ctx.syncConfirmCard_(profile);
assert.equal(f.reads.length,2);assert.equal(f.writes.length,0);
for(const key of ['confirm.check.sourceRead','confirm.check.rows','confirm.check.cardRead','confirm.check.render'])
  assert.equal(typeof profile.done().steps[key],'number',key);
assert.equal(profile.done().steps['confirm.lock'],undefined,'no lock on the unchanged path');
f.intake.rows[1][4]='works';f.reset();profile=f.ctx.speedTimer_();f.ctx.syncConfirmCard_(profile);
assert.equal(f.reads.length,4,'changed source and card reread under lock');
assert.equal(typeof profile.done().steps['confirm.lock'],'number');
for(const key of ['confirm.write.sourceRead','confirm.write.rows','confirm.write.cardRead','confirm.write.render','confirm.reconcile'])
  assert.equal(typeof profile.done().steps[key],'number',key);
assert.ok(!f.ref.rows[1][4].includes('data-kid='));assert.equal(f.stats.released,true);
