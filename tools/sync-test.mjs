// Server sync protocol, request-local read reuse, and timing metadata. Never calls Google.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source = fs.readFileSync('Code.gs','utf8');
const server = vm.createContext({console:{error(){}},FW_DEPLOY_BUILD:'release-under-test'});
vm.runInContext(source,server);
server.appBuild_ = () => 'page-under-test';
server.cellHash_ = s => crypto.createHash('md5').update(String(s)).digest('hex');
const timer = () => ({mark(){}});
let refs = [{id:'a',parentId:'',type:'item',title:'A',expanded:true,sort:1,content:'one',ch:'h1'}];
let refReads = 0;
server.getReference_ = () => {refReads++;return refs;};
server.getDaysRange_ = () => [];
const initial = server.syncDiff_({refSync:2,ref:{}},timer());
assert.equal(initial.ref.a.content,'one','empty client receives new cards');
const hash = initial.refManifest.hash;
assert.equal(initial.refManifest.items[0].content,undefined,'manifest excludes body text');
const unchanged = server.syncDiff_({refSync:2,ref:{a:'h1'},refManifestHash:hash},timer());
assert.equal(unchanged.refManifest,undefined);
assert.equal(Object.keys(unchanged.ref).length,0);
refs[0].title = 'Renamed';refs[0].sort = 500;refs[0].expanded = false;refs[0].parentId = 'parent';
const metadata = server.syncDiff_({refSync:2,ref:{a:'h1'},refManifestHash:hash},timer());
assert.equal(Object.keys(metadata.ref).length,0,'metadata change sends no unchanged body');
assert.equal(metadata.refManifest.items[0].title,'Renamed');
assert.equal(metadata.refManifest.items[0].expanded,false);
assert.notEqual(metadata.refManifest.hash,hash);
refs.push({id:'b',parentId:'',type:'item',title:'B',expanded:true,sort:2,content:'two',ch:'h2'});
assert.equal(server.syncDiff_({refSync:2,ref:{a:'h1'},refManifestHash:hash},timer()).ref.b.content,'two');
refs = [];
assert.equal(server.syncDiff_({refSync:2,ref:{a:'h1'},refManifestHash:hash},timer()).refManifest.items.length,0,'deletion has authoritative empty manifest');
const before = refReads;
assert.equal(server.syncDiff_({ref:{}},timer()).refManifest,undefined);
assert.equal(refReads,before,'old empty clients retain the old read budget');
refs = [{id:'a',ch:'new',content:'changed'},{id:'new-card',ch:'h',content:'new'}];
const oldClient = server.syncDiff_({ref:{a:'old'}},timer());
assert.equal(oldClient.ref.a.content,'changed');
assert.equal(oldClient.ref['new-card'],undefined,'legacy response remains compatible');
let reads = [], moved = false, failed = false;
server.todayString_ = () => '2026-11-07';
server.addDaysToDateString_ = () => '2026-11-14';
server.getDaysRange_ = (from,to) => {reads.push([from,to]);return [{date:'2026-11-07',tasks:moved?'after':'before',th:moved?'after-h':'before-h',journal:'',jh:'j',ph:'p'}];};
const realMove = server.moveScheduleToNotes_;
server.getOrCreateSheet_ = () => {throw Error('no schedule means no sheet lookup');};
server.moveScheduleToNotes_ = realMove;
const request = {days:{'2026-11-01':{th:'x',jh:'j'},'2026-11-07':{th:'x',jh:'j'}},ref:{}};
let out = server.getSyncState(request);
assert.equal(reads.length,1,'no-change light sync reads the day range once');
assert.equal(reads[0][0],'2026-11-01');assert.equal(reads[0][1],'2026-11-14');
assert.equal(out.days['2026-11-07'].tasks,'before');
assert.equal(out.timing.release,'release-under-test');assert.equal(out.timing.build,'page-under-test');
reads = [];
server.getSyncState({days:{'2025-01-01':{th:'x',jh:'j'}},ref:{}});
assert.deepEqual(reads,[['2026-11-07','2026-11-14'],['2025-01-01','2025-01-01']],'disjoint ranges must not read intervening history');
reads = [];
server.moveScheduleToNotes_ = () => {moved = true;return true;};
out = server.getSyncState(request);
assert.equal(reads.length,2,'a schedule write invalidates the request-local snapshot');
assert.equal(out.days['2026-11-07'].tasks,'after');
reads = []; moved = false;
server.moveScheduleToNotes_ = () => {moved = true;throw Error('partial schedule write');};
out = server.getSyncState(request);
assert.equal(reads.length,2,'failed movement also invalidates the snapshot');
assert.equal(out.days['2026-11-07'].tasks,'after');
const logged = [];
server.getOrCreateSheet_ = () => ({appendRow:r=>logged.push(r),getLastRow:()=>2});
server.logSpeed('sync',{total:42,steps:{days:1},release:'response-release',build:'response-page'},
  {pageRelease:'old-tab',rpcMs:90,serverRelease:'untrusted',reportId:'report-under-test'});
const context = JSON.parse(logged[0][4]);
assert.equal(context.serverRelease,'response-release','identify the response build, not the logging backend or incoming context');
assert.equal(context.reportId,'report-under-test','logging preserves the submitted measurement identity');
assert.equal(context.pageRelease,'old-tab');assert.equal(context.rpcMs,90);assert.equal(context.schema,2);
server.logSpeed('sync',{total:1},{});
assert.equal(JSON.parse(logged[1][4]).serverRelease,'','legacy timing remains unknown, never relabeled as current');
console.log('✓ sync: add/delete/metadata deltas, unchanged and legacy clients; one shared day read; reread after write/failure; response-specific timing builds');
// Nested import timings must retain return/throw behavior and parent wall time.
let clock = 100;
const timingServer = vm.createContext({console:{error(){}},Date:{now:()=>clock}});
vm.runInContext(source,timingServer);
const profile = timingServer.speedTimer_(), sentinel = {};
assert.equal(timingServer.speedPart_(null,'unused',()=>sentinel),sentinel);
assert.equal(timingServer.speedPart_({mark(){}},'unused',()=>sentinel),sentinel);
assert.equal(profile.measure('done.rows',()=>{clock+=7;return sentinel;}),sentinel);
const failure = Error('source read failed');
assert.throws(()=>profile.measure('done.rows',()=>{clock+=3;throw failure;}),e=>e===failure);
clock+=5;profile.mark('done');
assert.equal(profile.done().steps['done.rows'],10,'repeated substeps accumulate, including errors');
assert.equal(profile.done().steps.done,15,'substeps do not advance the parent mark');
assert.equal(profile.done().total,15);
// The real import orchestrator forwards the same timer, records an import
// failure and continues the remaining stages. Only fixed numeric keys escape.
const seen=[];
for(const name of ['applyDeployedCodeLog_','applyClaudeNotes_','applyClaudeTasks_',
  'syncStudyLog_','moveScheduleToNotes_','fixUrgentBold_','removeDaySections_']) timingServer[name]=()=>seen.push(name);
timingServer.applyClaudeDone_=t=>{assert.equal(t,profile);t.measure('done.sourceRead',()=>{clock+=11;throw failure;});};
timingServer.syncConfirmCard_=t=>{assert.equal(t,profile);t.measure('confirm.check.sourceRead',()=>{clock+=4;});};
timingServer.runImportSteps_(profile);
const parts=profile.done().steps;
assert.equal(parts['done.sourceRead'],11);assert.equal(parts.done,11);
assert.equal(parts['confirm.check.sourceRead'],4);assert.equal(parts.confirm,4);
assert.ok(seen.includes('removeDaySections_'),'later imports run after a failed source read');
assert.ok(Object.values(parts).every(v=>typeof v==='number'));
console.log('✓ nested import timing: parent totals, accumulated/error stages, unchanged return/throw and import continuation');

// Actual sync caller requests hashes only for its visible dates. Schedule
// checks still see the full upcoming window; failure/write fallbacks above
// continue using the normal complete reader.
let selected, scheduleTimer;
server.moveScheduleToNotes_=snapshot=>{assert.equal(snapshot.length,1);return false;};
server.getDaysRange_=(from,to,snapshot,hashDates,timer)=>{
  scheduleTimer=timer; selected=hashDates;
  return [{date:'2026-11-07',tasks:'live text',journal:'',plan:'',th:'live-h',jh:'j',ph:'p'}];
};
server.getSyncState(request);
assert.deepEqual([...selected],['2026-11-01','2026-11-07']);
assert.equal(typeof scheduleTimer.measure,'function','actual sync caller passes its own nested timer');
server.getSyncState({days:{},ref:{}});
assert.equal(selected.size,0,'empty visible date set needs no hashes');
let scheduleSelection;
server.todayString_=()=> '2026-11-07';
server.getDaysRange_=(from,to,snapshot,hashDates)=>{scheduleSelection=hashDates;return [];};
realMove();
assert.equal(scheduleSelection.size,0,'standalone schedule import skips all version hashes');
console.log('✓ sync/import callers select only hashes consumed by the response');

// Background imports share their post-intake schedule read with the response.
// All subsequent writers must explicitly report no-op; partial failures reread.
const imports=vm.createContext({console:{error(){}}});
vm.runInContext(source,imports);
const originalImportMove=imports.moveScheduleToNotes_;
let body='initial',dayReads=[],scheduleWrite=false,throwSchedule=false;
imports.todayString_=()=> '2026-11-07';
imports.addDaysToDateString_=()=> '2026-11-14';
imports.appBuild_=()=> 'same-build';imports.getReference_=()=>[];imports.getInbox=()=>[];
imports.getDaysRange_=(from,to)=>{dayReads.push([from,to]);return [{date:'2026-11-07',tasks:body,journal:'',plan:'',th:body,jh:'j',ph:'p'}];};
for(const name of ['applyDeployedCodeLog_','applyClaudeDone_','applyClaudeNotes_','applyClaudeTasks_','syncConfirmCard_','syncStudyLog_']) imports[name]=()=>{};
imports.moveScheduleToNotes_=()=>{if(scheduleWrite||throwSchedule)body='schedule changed';if(throwSchedule)throw Error('partial write');return scheduleWrite;};
imports.fixUrgentBold_=()=>false;imports.removeDaySections_=()=>false;
const importRequest={days:{'2026-11-07':{th:'old',jh:'j',ph:'p'}},ref:{}};
const run=()=>{dayReads=[];return imports.runImports(importRequest);};
assert.equal(run().days['2026-11-07'].tasks,'initial');assert.equal(dayReads.length,1,'unchanged import reads range once');
body='direct edit';assert.equal(run().days['2026-11-07'].tasks,'direct edit');
assert.equal(dayReads.length,1,'each new request still gets a fresh read');
imports.applyClaudeDone_=()=>{body='intake changed';};
assert.equal(run().days['2026-11-07'].tasks,'intake changed','snapshot is read after intake writes');
imports.applyClaudeDone_=()=>{body='partial intake changed';throw Error('intake failure');};
assert.equal(run().days['2026-11-07'].tasks,'partial intake changed','early failure cannot stale the later read');
imports.applyClaudeDone_=()=>{};
for(const mode of ['write','failure']) {
  scheduleWrite=mode==='write';throwSchedule=mode==='failure';body='before schedule';
  assert.equal(run().days['2026-11-07'].tasks,'schedule changed');
  assert.equal(dayReads.length,2,'schedule '+mode+' invalidates snapshot');
}
scheduleWrite=false;throwSchedule=false;
for(const name of ['fixUrgentBold_','removeDaySections_']) {
  for(const mode of ['write','failure','unknown']) {
    body='before repair';imports[name]=()=>{body='repair changed';if(mode==='failure')throw Error('partial repair');return mode==='write'?true:undefined;};
    assert.equal(run().days['2026-11-07'].tasks,'repair changed');
    assert.equal(dayReads.length,2,name+' '+mode+' must invalidate');
  }
  imports[name]=()=>false;
}
dayReads=[];imports.runImports({days:{'2025-01-01':{th:'old',jh:'j'}},ref:{}});
assert.deepEqual(dayReads,[['2025-01-01','2025-01-01']], 'disjoint schedule helper uses its own bounded read, never an expanded gap');
// Restore real standalone movement so the disjoint path proves two reads.
imports.moveScheduleToNotes_=originalImportMove;
dayReads=[];imports.runImports({days:{'2025-01-01':{th:'old',jh:'j'}},ref:{}});
assert.deepEqual(dayReads,[['2026-11-07','2026-11-14'],['2025-01-01','2025-01-01']]);
const original=vm.createContext({console});vm.runInContext(source,original);
original.PropertiesService={getScriptProperties:()=>({getProperty:()=> '1'})};
assert.equal(original.fixUrgentBold_(),false);assert.equal(original.removeDaySections_(),false);
console.log('✓ import shared snapshot: one live range read, post-intake freshness; schedule/repair writes, partial failures and unknown results force reread');
