// Confirmation refresh service budgets and live-data reconciliation. No Google access.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source = fs.readFileSync('Code.gs','utf8');
const HEAD = ['Date','Project','Change','How to check','Status','Checked on'];
export function fixture(serverSource = source) {
  const reads=[],writes=[],cache=new Map(),props={},stats={lookups:0,locks:0,hashes:0},faults={};
  function sheet(name,rows) { return {name,rows,grid:1000,
    getLastRow(){return this.rows.length;},
    getDataRange(){return this.getRange(1,1,this.rows.length,Math.max(...this.rows.map(r=>r.length)));},
    getRange(r,c,h=1,w=1){
      if(r+h-1>this.grid) throw Error('out of bounds');
      const get=()=>{reads.push({name,r,c,h,w});return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>this.rows[r-1+i]?.[c-1+j]??''));};
      return {getValues:get,getValue:()=>get()[0][0],setValues:values=>{
        writes.push({name,r,c,values});values.forEach((row,i)=>row.forEach((v,j)=>{this.rows[r-1+i] ||= [];this.rows[r-1+i][c-1+j]=v;}));
      },setValue:v=>{if(name==='Reference'&&c===5&&String(v).length>50000)throw Error('Sheet cell limit');writes.push({name,r,c,values:[[v]]});this.rows[r-1] ||= [];this.rows[r-1][c-1]=v;}};
    },appendRow(row){writes.push({name,append:true});this.rows.push(row);}
  }; }
  const intake=sheet('To Confirm',[HEAD,['2026-11-07','Gantt','Example','Check it','','']]);
  const ref=sheet('Reference',[['ID','ParentID','Type','Title','Content','Expanded','Sort']]);
  const sheets=new Map([['To Confirm',intake],['Reference',ref]]);
  const ss={getSheetByName:name=>{stats.lookups++;return sheets.get(name)||null;}};
  const ctx=vm.createContext({console,SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
    CacheService:{getScriptCache:()=>({getAll:keys=>{if(faults.cache)throw Error('cache down');return Object.fromEntries(keys.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)]));},putAll:values=>{if(faults.cache)throw Error('cache down');for(const [k,v] of Object.entries(values))cache.set(k,v);},get:k=>{if(faults.cache)throw Error('cache down');return cache.get(k)||null;},put:(k,v)=>{if(faults.cache)throw Error('cache down');cache.set(k,v);},remove:k=>cache.delete(k)})},
    LockService:{getScriptLock:()=>({tryLock(){stats.locks++;if(faults.busy)return false;if(faults.onLock)faults.onLock();return true;},releaseLock(){stats.released=true;}})},
    PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>props[k]=v})}});
  vm.runInContext(serverSource,ctx);
  ctx.cellHash_=s=>{stats.hashes++;return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0,16);};
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

// A growing queue must fit a single Reference cell, retain every current check
// where possible, and converge to the existing lock-free/no-write fast path.
f=fixture();
f.intake.rows=[HEAD,...Array.from({length:190},(_,i)=>['2026-11-07',i%2?'Gantt':'Other',
  'Change '+i,'Detailed check '+('instruction '.repeat(25)),'',''])];
const original=JSON.stringify(f.intake.rows);
f.ctx.syncConfirmCard_();
let html=f.ref.rows[1][4];
assert.ok(html.length<=48000);assert.ok(html.includes('Short instructions shown'));
assert.equal((html.match(/data-kid=/g)||[]).length,190,'current-sized queue retains every checkbox');
assert.equal(JSON.stringify(f.intake.rows),original,'full source instructions remain unchanged');
f.reset();f.ctx.syncConfirmCard_();
assert.equal(f.stats.locks,0,'bounded rendering converges instead of retrying a failed oversized write');
assert.equal(f.writes.length,0);assert.equal(f.reads.length,2);
// A checkbox tick still updates exactly its source status in a compact card.
f.ref.rows[1][4]=html.replace('class="check-line"','class="check-line done"');
f.ctx.syncConfirmCard_();
assert.equal(f.intake.rows.filter(r=>r[4]==='works').length,1);
assert.equal((f.ref.rows[1][4].match(/data-kid=/g)||[]).length,189);
f.reset();f.ctx.syncConfirmCard_();assert.equal(f.writes.length,0);assert.equal(f.stats.locks,0);
// Source edits remain live, including text in the displayed part of an instruction.
f.intake.rows[2][3]='Visible correction '+f.intake.rows[2][3];
f.ctx.syncConfirmCard_();assert.ok(f.ref.rows[1][4].includes('Visible correction'));
// Pathological title-only queues use complete bounded rows with an explicit
// remaining-count notice. Escaping and Unicode must survive every fallback.
f=fixture();
f.intake.rows=[HEAD,...Array.from({length:800},(_,i)=>['2026-11-07','Group <&> '+i,
  '😀 <script>& '+('long title '.repeat(50))+i,'Full directions remain here','',''])];
f.ctx.syncConfirmCard_();html=f.ref.rows[1][4];
assert.ok(html.length<=48000);assert.ok(html.includes('Showing '));
assert.ok(html.includes('Remaining checks and full instructions'));
assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
assert.equal((html.match(/<div\b/g)||[]).length,(html.match(/<\/div>/g)||[]).length,'HTML is never sliced mid-row');
assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(html),'clipping does not split Unicode code points');
assert.equal(f.intake.rows.length,801,'overflow source rows are retained');
f.reset();f.ctx.syncConfirmCard_();assert.equal(f.stats.locks,0);assert.equal(f.writes.length,0);
console.log('✓ bounded confirmation card: compact queue retains all checks, source text and ticks; pathological overflow explicit, safe Unicode/HTML, no retry/write loop');

// Exact-input digest reuse never replaces live source data or locked rereads.
f=fixture();f.intake.rows=[HEAD,...Array.from({length:190},(_,i)=>['2026-11-07','Gantt','Change '+i,'How '+i,'',''])];
f.cache.clear();f.stats.hashes=0;
const cold=JSON.parse(JSON.stringify(f.ctx.confirmRows_(f.intake)));
assert.equal(f.stats.hashes,190);
f.stats.hashes=0;f.reads.length=0;
assert.deepEqual(JSON.parse(JSON.stringify(f.ctx.confirmRows_(f.intake))),cold);
assert.equal(f.stats.hashes,0,'fully warm queue avoids all 190 ID digests');
assert.equal(f.reads.length,1,'every source row is still read');
f.intake.rows[5][3]='New instructions';f.intake.rows[5][4]='broken';
f.stats.hashes=0;let current=f.ctx.confirmRows_(f.intake);
assert.equal(current[4].how,'New instructions');assert.equal(current[4].status,'broken');
assert.equal(current[4].id,cold[4].id);assert.equal(f.stats.hashes,0,'nonidentity fields remain live');
f.intake.rows[5][2]='Corrected title';f.stats.hashes=0;current=f.ctx.confirmRows_(f.intake);
assert.notEqual(current[4].id,cold[4].id);assert.equal(f.stats.hashes,32,'only changed block is recomputed');
const expected=JSON.parse(JSON.stringify(current));
for(const corruption of ['bad json',JSON.stringify([[],[]]),JSON.stringify([['wrong'],['0'.repeat(16)]])]) {
  f.cache.set('confirm-id-hashes:v1:0',corruption);f.stats.hashes=0;
  assert.deepEqual(JSON.parse(JSON.stringify(f.ctx.confirmRows_(f.intake))),expected);
  assert.equal(f.stats.hashes,32);
}
f.cache.clear();f.faults.cache=true;f.stats.hashes=0;
assert.deepEqual(JSON.parse(JSON.stringify(f.ctx.confirmRows_(f.intake))),expected);
assert.equal(f.stats.hashes,190,'outage/eviction only costs computation');
f.faults.cache=false;
f.intake.rows.reverse();f.intake.rows.pop();f.intake.rows.unshift(HEAD);
current=f.ctx.confirmRows_(f.intake);
for(const row of current) assert.equal(row.id,'k-'+crypto.createHash('sha256').update([row.date,row.project,row.change].join('|')).digest('hex').slice(0,16));
console.log('✓ Confirmation exact-input identities: 190→0 warm digests; edits, reorder, corrupt/evicted caches and outages retain live output');
