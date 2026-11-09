// Intake compatibility and service-read budget. Local mocks only; no live Sheet writes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('Code.gs', 'utf8');
const ctx = vm.createContext({ console, Date });
vm.runInContext(source, ctx);
ctx.todayString_ = () => '2026-11-07';
ctx.addDaysToDateString_ = () => '2026-10-08';
ctx.formatDate_ = d => d.toISOString().slice(0, 10);
ctx.cellHash_ = s => s;
const sheets = new Map();
ctx.getOrCreateSheet_ = name => sheets.get(name);
function sheet(rows, display = rows) {
  return { rows, display, reads: [], writes: [],
    getDataRange() { return {
      getValues: () => { this.reads.push('values'); return this.rows.map(r => [...r]); },
      getDisplayValues: () => { this.reads.push('display'); return this.display.map(r => r.map(String)); }
    }; },
    getRange(r, c) { return {
      getValue: () => { this.reads.push('header'); return this.rows[r - 1][c - 1]; },
      setValue: v => { this.writes.push([r,c,v]); this.rows[r - 1][c - 1] = v; }
    }; }
  };
}
const done = sheet([
  ['Date','Project','Title','Details','Done by','Type'],
  [new Date('2026-11-07T12:00:00Z'),' Gantt ',' Saved ',' Details ','Julius','Fix'],
  ['2026-10-07','Gantt','Too old','','ChatGPT','New'],
  ['2026-10-08','','Boundary','','ChatGPT','Tweak'],
  ['2026-11-07','Gantt','','No title','ChatGPT','New']
]);
sheets.set('Done Log', done);
const plain = v => JSON.parse(JSON.stringify(v));
let items = plain(ctx.sheetDoneRows_());
assert.equal(items.length, 2);
assert.deepEqual(items[0], { id:'s-2026-11-07|Gantt|Saved|Details',date:'2026-11-07',project:'Gantt',title:'Saved',details:'Details',mine:true,type:'fix' });
assert.equal(items[1].title, 'Boundary');
assert.equal(items[1].project, 'Other');
assert.deepEqual(done.reads, ['values']);
assert.deepEqual(done.writes, []);
// Recheck all rows: edits and backdated appends cannot be hidden by a cached cursor.
done.rows[1][3] = 'Corrected';
done.rows.push(['2026-10-20','Gantt','Backdated','','ChatGPT','New']);
items = plain(ctx.sheetDoneRows_());
assert.ok(items[0].id.endsWith('|Corrected'));
assert.equal(items.at(-1).title, 'Backdated');
const id = items[0].id;
done.rows[1][5] = 'Tweak';
assert.equal(ctx.sheetDoneRows_()[0].id, id, 'type edits must retain deduplication identity');
const raw = [
  ['Date','Title','Urgency','Due','Minutes','Subtasks','Added'],
  ['undated',' Paddle grips ',3,'',15,'fit | test',new Date('1899-12-30T14:30:00Z')],
  ['2026-11-07','Wood',1,'2026-11-08',20,'',new Date('1899-12-30T08:05:00Z')]
];
const shown = raw.map(r => [...r]);
shown[1][6] = '2:30 PM'; shown[2][6] = '08:05';
const tasks = sheet(raw, shown); sheets.set('New Tasks', tasks);
items = plain(ctx.sheetTaskRows_());
assert.deepEqual(items[0], {id:'s-undated|Paddle grips',date:'backlog',title:'Paddle grips',urg:3,due:'',dur:15,subtasks:['fit','test'],added:'14:30'});
assert.equal(items[1].added, '08:05');
assert.deepEqual(tasks.reads, ['values','display']);
assert.deepEqual(tasks.writes, []);
const known = new Set(items.map(x => x.id));
tasks.reads.length = 0;
assert.deepEqual(plain(ctx.sheetTaskRows_(known)), []);
assert.deepEqual(tasks.reads, ['values'], 'already applied intake needs no display read');
tasks.reads.length = 0;
const pending = plain(ctx.sheetTaskRows_(new Set([items[0].id])));
assert.deepEqual(pending,[items[1]], 'pending times retain original row indexes');
assert.deepEqual(tasks.reads,['values','display']);
// Exercise the real unchanged importer: it must pass the applied IDs through.
ctx.PropertiesService = {getScriptProperties:()=>({getProperty:()=>JSON.stringify([...known])})};
tasks.reads.length = 0;
ctx.applyClaudeTasks_();
assert.deepEqual(tasks.reads,['values']);
assert.deepEqual(tasks.writes,[]);
// Current visible 0/1/2 scale is translated to stored 1/2/3 without changing IDs.
tasks.rows[0][2]='Urgency 0-2';tasks.rows[1][2]=0;tasks.rows[2][2]=2;
const scaled=plain(ctx.sheetTaskRows_());
assert.equal(scaled[0].urg,1);assert.equal(scaled[1].urg,3);
assert.equal(scaled[0].id,items[0].id);
tasks.rows[1][1] = 'Updated task'; tasks.display[1][6] = '9:45 AM';
assert.equal(ctx.sheetTaskRows_()[0].title, 'Updated task');
assert.equal(ctx.sheetTaskRows_()[0].added, '09:45');
assert.equal(ctx.sheetTaskRows_(known)[0].title,'Updated task','title change remains visible');
tasks.rows.push(['2026-10-20','Backdated task',1,'',10,'','08:20']);
tasks.display.push(['2026-10-20','Backdated task',1,'',10,'','08:20']);
assert.equal(ctx.sheetTaskRows_(known).at(-1).title,'Backdated task','no row cursor hides old-date appends');
// Legacy tabs gain their missing headers; header-only tabs still return an empty list.
for (const [name, fn, header, width] of [
  ['Done Log','sheetDoneRows_','Type',6], ['New Tasks','sheetTaskRows_','Added',7]
]) {
  const old = sheet([['Date']]); sheets.set(name, old);
  assert.deepEqual(plain(ctx[fn]()), []);
  assert.deepEqual(old.writes, [[1,width,header]]);
}
console.log('✓ import reads: Done Log 1, New Tasks 1 when applied / 2 when pending; identities, backdated appends, urgency scale, times and legacy headers preserved');
// The real Done Log source emits numeric substeps and retains the single-read budget.
sheets.set('Done Log',done);
done.reads.length=0;
const importTimer=ctx.speedTimer_();
const profiled=plain(ctx.sheetDoneRows_(importTimer));
assert.deepEqual(profiled,plain(ctx.sheetDoneRows_()));
assert.deepEqual(done.reads,['values','values']);
assert.equal(typeof importTimer.done().steps['done.sourceRead'],'number');
assert.equal(typeof importTimer.done().steps['done.rows'],'number');
assert.equal(typeof importTimer.done().steps['done.hashes'],'number');

// Repeated Date cells reuse normalization only within one freshly read source.
// Exercise both real intake functions with distinct Date objects, mixed text
// dates, timestamp changes, timezone changes between reads and normalization errors.
let dateCalls=0,zone='America/Los_Angeles';
ctx.formatDate_=value=>{
  dateCalls++;
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(value).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
};
const repeated=sheet([['Date','Project','Title','Details','Done by','Type'],
  ...Array.from({length:200},(_,i)=>[new Date('2026-11-08T07:00:00Z'),'Gantt','Item '+i,'','ChatGPT','Fix']),
  [new Date('2026-11-08T12:00:00Z'),'Gantt','Different timestamp','','ChatGPT','Fix'],
  ['2026-11-07','Gantt','Text date','','ChatGPT','Fix']]);
sheets.set('Done Log',repeated);
dateCalls=0;let normalized=plain(ctx.sheetDoneRows_());
assert.equal(dateCalls,2,'one formatting call per distinct Date timestamp');
assert.equal(normalized[0].date,'2026-11-07');
assert.equal(normalized[200].date,'2026-11-08');assert.equal(normalized[201].date,'2026-11-07');
assert.deepEqual(repeated.reads,['values']);assert.deepEqual(repeated.writes,[]);
const beforeId=normalized[0].id;zone='UTC';dateCalls=0;normalized=plain(ctx.sheetDoneRows_());
assert.equal(dateCalls,2,'new source call has a fresh formatter');
assert.equal(normalized[0].date,'2026-11-08');assert.notEqual(normalized[0].id,beforeId);
repeated.rows[1][0].setTime(Date.parse('2026-11-09T00:00:00Z'));
dateCalls=0;normalized=plain(ctx.sheetDoneRows_());assert.equal(dateCalls,3);assert.equal(normalized[0].date,'2026-11-09');
const confirms=sheet([['Date','Project','Change','How to check','Status','Checked on'],
  ...Array.from({length:200},(_,i)=>[new Date('2026-11-08T07:00:00Z'),'Gantt','Check '+i,'Try it','','']),
  ['undated','Gantt','Text date','Try it','','']]);
zone='America/Los_Angeles';dateCalls=0;const confirmItems=plain(ctx.confirmRows_(confirms));
assert.equal(dateCalls,1);assert.equal(confirmItems[0].date,'2026-11-07');
assert.equal(confirmItems[200].date,'undated');assert.equal(confirms.reads.length,1);assert.equal(confirms.writes.length,0);
confirms.rows[1][0]=new Date('2026-11-09T08:00:00Z');dateCalls=0;
assert.equal(ctx.confirmRows_(confirms)[0].date,'2026-11-09');assert.equal(dateCalls,2,'changed dates are never hidden');
const formatter=ctx.intakeDateFormatter_();let attempts=0;
ctx.formatDate_=()=>{if(++attempts===1)throw Error('date service failed');return 'recovered';};
assert.throws(()=>formatter(new Date(0)),/date service failed/);
assert.equal(formatter(new Date(0)),'recovered','failed normalization is not cached');
assert.equal(formatter(new Date(0)),'recovered');assert.equal(attempts,2);
assert.equal(formatter('  undated  '),'undated');assert.equal(formatter(0),'');
console.log('✓ intake dates: per-snapshot timestamp reuse; fresh reads/timezone/date edits, mixed values, original IDs/outputs and normalization errors preserved');

// Inbox replies batch related user settings, never cache them across calls.
// Compare against the original three-read behavior, including corrupt fields
// and the individual-read fallback; no setting writes are allowed.
const inboxState={inboxDone:'["dismissed"]',inboxItems:JSON.stringify([{id:'mine',title:'Mine',done:true},{id:'dismissed',title:'Hidden'}]),
  inboxOver:JSON.stringify({ai:{title:'Overridden',details:'Keep details',arch:'archive'}}),unrelated:'private unrelated setting'};
let bulkReads=0,keyReads=0,bulkFailure=false,keyFailure='';
ctx.CLAUDE_INBOX=[{id:'ai',title:'Original',added:'today'},{id:'dismissed',title:'Hidden AI'},null];
const api={getProperties(){bulkReads++;if(bulkFailure)throw Error('bulk unavailable');return {...inboxState};},
 getProperty(k){keyReads++;if(k===keyFailure)throw Error('field unavailable');return inboxState[k]||null;},
 setProperty(){throw Error('read-only path wrote a setting');}};
ctx.PropertiesService={getUserProperties:()=>api};
const originalRead=ctx.inboxRead_;
function originalInbox(){const d=originalRead('inboxDone',[]),m=originalRead('inboxItems',[]),o=originalRead('inboxOver',{});
 return ctx.CLAUDE_INBOX.map(x=>Object.assign({from:'claude'},x,o[String(x&&x.id)]||{})).concat(m.map(x=>Object.assign({from:'app'},x)))
 .filter(x=>x&&x.id&&d.indexOf(String(x.id))<0).map(x=>({id:String(x.id),title:String(x.title||''),details:String(x.details||''),added:String(x.added||''),from:x.from,arch:String(x.arch||''),done:!!x.done}));}
function compare(){const expected=plain(originalInbox());bulkReads=0;keyReads=0;const actual=plain(ctx.getInbox());assert.deepEqual(actual,expected);return actual;}
let inbox=compare();assert.equal(bulkReads,1);assert.equal(keyReads,0);assert.equal(inbox.length,2);assert.equal(inbox[0].title,'Overridden');assert.equal(inbox[1].done,true);
inboxState.inboxItems=JSON.stringify([{id:'new direct edit',title:'New'}]);assert.equal(compare()[1].title,'New','later calls see current settings');
for(const k of ['inboxDone','inboxItems','inboxOver']){const saved=inboxState[k];inboxState[k]='not JSON';compare();assert.equal(bulkReads,1);assert.equal(keyReads,0);delete inboxState[k];compare();inboxState[k]=saved;}
bulkFailure=true;compare();assert.equal(bulkReads,1);assert.equal(keyReads,3,'bulk failure preserves independent reads');
keyFailure='inboxItems';compare();assert.equal(keyReads,3,'one field failure retains other readable fields');
bulkFailure=false;keyFailure='';
assert.equal(ctx.inboxRead_('inboxItems',[])[0].title,'New','other callers retain single-field behavior');
console.log('✓ Inbox settings: 3→1 property reads, exact overrides/dismissals, fresh calls, missing/corrupt fields and independent-read failure fallback; zero writes');
