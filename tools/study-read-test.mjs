// Study intake read budget, lock-time corrections and last-row-wins behavior.
// All Sheet calls are local fixtures; no study records are written to Google.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
function fixture() {
  const reads=[],writes=[],props={},faults={};
  const header=['ID','Date','Started','Ended','Minutes','Topics','Questions (JSON)','Correct','Partial','Incorrect','Unanswered','Status','Logged'];
  const first=['it-example','2026-11-08','09:00','09:10',10,'DNS','',1,0,0,0,'draft',''];
  function sheet(name,rows) {return {name,rows,getLastRow:()=>rows.length,
    getRange(r,c,h=1,w=1) {const raw=()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[r-1+i]?.[c-1+j]??''));
      return {getValues(){reads.push(name+':raw');return raw();},getDisplayValues(){reads.push(name+':display');return raw().map(row=>row.map(String));},
        getValue(){reads.push(name+':cell');return raw()[0][0];},
        setValues(vals){writes.push(name);vals.forEach((row,i)=>row.forEach((v,j)=>{rows[r-1+i]||=[];rows[r-1+i][c-1+j]=v;}));},
        setValue(v){writes.push(name);rows[r-1]||=[];rows[r-1][c-1]=v;},clearContent(){writes.push(name);}
      };}
  };}
  const intake=sheet('Study Sessions',[header,first]);
  const days=sheet('Days',[['Date','Today','Journal'],['2026-11-08','','']]);
  const review=sheet('Study Review',[['Topic']]);
  const sheets=new Map([['Study Sessions',intake],['Days',days],['Study Review',review]]);
  const ctx=vm.createContext({console,Date,
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets.get(n)})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},
    LockService:{getScriptLock:()=>({tryLock(){if(faults.onLock)faults.onLock();return !faults.busy;},releaseLock(){faults.released=true;}})},
    Utilities:{formatDate:()=> '2026-11-08 09:15'},Session:{getScriptTimeZone:()=> 'UTC'}
  });
  vm.runInContext(fs.readFileSync('Code.gs','utf8'),ctx);
  vm.runInContext(fs.readFileSync('StudyLog.gs','utf8'),ctx);
  ctx.todayString_=()=> '2026-11-08';
  ctx.formatDate_=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'');
  ctx.cellHash_=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
  ctx.getOrCreateSheet_=n=>sheets.get(n);
  ctx.backupCell_=()=>{};
  const signature=()=>ctx.cellHash_('2026-11-08'+JSON.stringify(intake.rows.map(r=>r.slice(0,12))));
  return {ctx,intake,days,review,reads,writes,props,faults,signature};
}
let f=fixture();f.props.studySig=f.signature();f.ctx.syncStudyLog_();
assert.deepEqual(f.reads,['Study Sessions:raw'],'unchanged import needs one raw read, no display read');
assert.deepEqual(f.writes,[]);
f.intake.rows[1][5]='DHCP';f.faults.busy=true;f.reads.length=0;f.ctx.syncStudyLog_();
assert.deepEqual(f.reads,['Study Sessions:raw'],'busy lock defers without display read or writes');
assert.deepEqual(f.writes,[]);
// Another importer already processed exactly this input while we acquired the lock.
f=fixture();f.faults.onLock=()=>{f.props.studySig=f.signature();};f.ctx.syncStudyLog_();
assert.deepEqual(f.reads,['Study Sessions:raw','Study Sessions:raw']);
assert.deepEqual(f.writes,[]);assert.equal(f.faults.released,true);
// A corrected final segment appended before lock acquisition must replace its
// older draft, be acknowledged correctly, and reach History only once.
f=fixture();f.faults.onLock=()=>{
  f.intake.rows.push(['it-example','2026-11-08','09:00','09:10',10,'DNS','',2,0,0,0,'final','']);
  f.faults.onLock=null;
};f.ctx.syncStudyLog_();
assert.equal(f.intake.rows[1][12],'replaced by a later row with this ID');
assert.match(f.intake.rows[2][12],/^logged → History 2026-11-08 Morning/);
assert.match(f.days.rows[1][1],/2 answered/);
assert.equal((f.days.rows[1][1].match(/data-study="/g)||[]).length,1);
assert.equal(f.props.studySig,f.signature(),'published signature describes the locked input');
f.reads.length=0;f.writes.length=0;f.ctx.syncStudyLog_();
assert.deepEqual(f.reads,['Study Sessions:raw']);assert.deepEqual(f.writes,[]);
// Formatting/acknowledgement column is excluded from signature as before.
f.intake.rows[2][12]='logged acknowledgement';f.reads.length=0;f.ctx.syncStudyLog_();
assert.deepEqual(f.reads,['Study Sessions:raw']);
console.log('Study unchanged read and locked correction tests passed');
