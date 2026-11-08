// Local storage and save-baseline regression checks; never contacts a real app.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const script=fs.readFileSync('Drafts.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
let serial=0;
function page(map=new Map(),faults={}){
 const storage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,
  setItem:(k,v)=>{if(faults.quota)throw Error('quota');map.set(k,v);},removeItem:k=>map.delete(k)};
 const c=vm.createContext({console,crypto:{randomUUID:()=> 'unique-'+(++serial)},addEventListener(){}});c.window=c;
 Object.defineProperty(c,'localStorage',{get(){if(faults.denied)throw Error('denied');return storage;}});
 vm.runInContext(script,c);c.fwDrafts.init('https://script.google.com/macros/s/app-one/dev');return {c,api:c.fwDrafts,map,faults};
}
let p=page(),payload={base:{c:'base',h:'h'},content:'first'};
const first=p.api.put('ref','r',payload,'Card');payload.content='mutated';
assert.equal(p.api.peek('ref','r').payload.content,'first','stored snapshot must not track later object mutation');
const second=p.api.put('ref','r',{base:{c:'base',h:'h'},content:'second'},'Card');
assert.equal(p.api.ack(first),false);assert.equal(p.map.size,1);
const duplicate=p.api.put('ref','r',{base:{c:'base',h:'h'},content:'second'},'Card');assert.equal(duplicate.rev,second.rev,'pagehide snapshot must not invalidate an identical in-flight acknowledgement');
assert.equal(p.api.ack(second),true);assert.equal(p.map.size,0);
p=page();p.api.put('ref','r',{base:{c:'base',h:'h'},content:'unsent'},'Card');
let reopened=page(p.map),entry=reopened.api.list()[0];assert.equal(entry.payload.content,'unsent');
const adopted=reopened.api.adopt(entry);assert.ok(adopted);assert.notEqual(adopted.key,entry.key);assert.equal(reopened.map.has(entry.key),false);assert.equal(reopened.api.ack(adopted),true);
// Pages have independent keys even for the same record; an older acknowledgement clears only its owner.
p=page();const a=p.api.put('ref','r',{content:'page A'},'A');const other=page(p.map);const b=other.api.put('ref','r',{content:'page B'},'B');
assert.notEqual(a.key,b.key);assert.equal(p.api.ack(a),true);assert.ok(p.map.has(b.key));
// Namespace app IDs, and treat /dev versus /exec of the same configured app consistently.
const foreign=page(p.map);foreign.api.init('https://script.google.com/macros/s/app-two/dev');assert.equal(foreign.api.list().length,0);
const same=page(p.map);same.api.init('https://script.google.com/macros/s/app-one/exec');assert.equal(same.api.list().length,1);
p=page();const older=p.api.put('ref','r',{content:'old'},'Card');p.faults.quota=true;
const failed=p.api.put('ref','r',{content:'latest'},'Card');assert.equal(failed.volatile,true);assert.ok(p.api.problem());assert.ok(p.api.exportData().includes('latest'));
assert.equal(p.api.ack(older),false);p.faults.quota=false;const retry=p.api.put('ref','r',{content:'latest'},'Card');assert.ok(!retry.volatile);assert.equal(p.api.ack(retry),true);
p=page();p.api.put('ref','r',{content:'keep'},'Card');reopened=page(p.map,{quota:true});entry=reopened.api.list()[0];assert.equal(reopened.api.adopt(entry),null);assert.ok(p.map.has(entry.key),'failed adoption must keep old durable copy');
p=page(new Map(),{denied:true});assert.ok(p.api.problem());assert.equal(p.api.put('ref','r',{content:'memory copy'},'Card').volatile,true);assert.ok(p.api.exportData().includes('memory copy'));
p=page();p.api.put('ref','r',{content:'keep'},'Card');reopened=page(p.map);entry=reopened.api.list()[0];
const changed=JSON.parse(p.map.get(entry.key));changed.rev='later';p.map.set(entry.key,JSON.stringify(changed));assert.equal(reopened.api.discard(entry),false);assert.ok(p.map.has(entry.key));
p=page();p.api.put('ref','r',{content:'keep'},'Card');p.map.set([...p.map.keys()][0],'broken JSON');reopened=page(p.map);let notices=0;reopened.api.subscribe(()=>{notices++;reopened.api.list();});
assert.equal(reopened.api.list().length,0);assert.ok(reopened.api.problem());assert.ok(notices<3);assert.ok(reopened.api.exportData().includes('broken JSON'),'corrupt copies must remain exportable');
// Capture an undo while a changed request is in flight. The possible written text becomes
// the recovery merge base, so a retry cannot mistake that undo for an untouched field.
const html=fs.readFileSync('Index.html','utf8');
const helper=html.slice(html.indexOf('  let fwDraftStarted=false;'),html.indexOf('  function fwDraftInit(){'));
p=page();const c=p.c,date='2026-11-08',base={tasks:{t:'original',h:'h0'},journal:{t:'',h:'j0'}},editor={html:'sent'};
c.daySaveState=new Map([[date,{inFlight:true,sent:{tasks:'sent',journal:'',ct:true,cj:false}}]]);
c.fwDayBase=()=>base;c.dayEditorFor=(_,col)=>col==='tasks'?editor:null;c.cardCleanHtml=ed=>ed.html;c.refBase=item=>item._b;c.referenceTitle=item=>item.title||'Card';
vm.runInContext(helper+'\nfwDraftStarted=true;',c);
c.fwDraftCaptureDay(date);assert.equal(c.fwDrafts.peek('day',date).payload.fields.tasks.base.t,'original','first request may never arrive');
editor.html='original';c.fwDraftCaptureDay(date);assert.equal(c.fwDrafts.peek('day',date).payload.fields.tasks.base.t,'sent');
c.daySaveState.get(date).inFlight=false;c.fwDraftPrepareDay(date);assert.equal(base.tasks.t,'sent');assert.equal(base.tasks.h,'h0');assert.notEqual(editor.html,base.tasks.t,'ambiguous retry must send the intended undo');
const item={id:'r',title:'Card',content:'original',_b:{c:'original',h:'r0'},_refSaving:true,_refSent:{content:'sent',contentChanged:true}};
c.fwDraftCaptureRef(item);c.fwDraftPrepareRef(item);assert.equal(item._b.c,'sent');assert.equal(item._b.h,'r0');
console.log('✓ drafts: reload/adoption, exact acknowledgements, page/app isolation, storage failures/export, corrupt copies, and in-flight undo baselines');
// Exercise the actual save/reconcile pipeline after a failed acknowledgement and an undo.
// The first request may have landed or may never have reached the server.
for(const initialRemote of ['sent','original']){
 const p=page(),c=p.c,date='2026-11-08',hash=s=>crypto.createHash('md5').update(s).digest('hex');
 const base={tasks:{t:'original',h:hash('original')},journal:{t:'',h:'j0'}},ed={html:'original',querySelectorAll:()=>[]};
 c.state={days:[{date,tasks:'original',journal:''}]};c.daySaveState=new Map([[date,{inFlight:true,pending:true,sent:{tasks:'sent',journal:'',ct:true,cj:false}}]]);c.saveTimers={};c.performance={now:()=>0};c.fwObserveSave=()=>{};
 c.document={querySelector:q=>q.includes('#todayScroll')?ed:null};c.CSS={escape:s=>s};c.fwDayBase=()=>base;c.dayEditorFor=(_,col)=>col==='tasks'?ed:null;c.cardCleanHtml=e=>e.html;
 c.setStatus=()=>{};c.noteUrgentDay=()=>{};c.fwCheckBuild=()=>{};c.clearTimeout=()=>{};c.setTimeout=()=>1;c.requestAnimationFrame=()=>{};c.replaceEditorHtml=(e,h)=>e.html=h;
 const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
 vm.runInContext(helper+'\nfwDraftStarted=true;'+extract('  function fwSame(a,b){','  // Caret as a text offset')+extract('  function fwReconcileDay(date,col,theirs,h){','  function fwReconcileRef(')+extract('  function scheduleDaySave(date){','  /* Focus ring')+extract('  function saveDay(date){','  /* =========================================================\n     SAFE SYNC'),c);
 c.fwBlocks=s=>[s];c.fwDraftCaptureDay(date);c.daySaveState.get(date).inFlight=false;
 const requests=[];let ok;
 c.google={script:{run:{withSuccessHandler:f=>{ok=f;return c.google.script.run;},withFailureHandler:()=>c.google.script.run,saveDay:(d,t,j,opts)=>requests.push({ok,t,opts})}}};
 const server=vm.createContext({console});vm.runInContext(fs.readFileSync('Code.gs','utf8'),server);server.cellHash_=hash;server.backupCell_=()=>{};
 let remote=initialRemote,firstRequest=true;
 c.saveDay(date);
 for(let guard=0;requests.length && guard<5;guard++){
   const req=requests.shift();if(firstRequest){assert.equal(req.opts.ct,true,'undo must be sent despite matching the old acknowledged base');firstRequest=false;}
   const result=server.syncCol_(remote,req.t,req.opts.th,req.opts.ct,'test','Tasks');remote=result.value;
   req.ok({th:hash(remote),jh:'j0',conflictT:!!result.conflict,conflictJ:false,...(result.sendBack?{tasks:remote}:{})});
 }
 assert.equal(remote,'original','undo survives whether the unacknowledged request landed or not');
 assert.equal(ed.html,'original');assert.equal(p.map.size,0,'the final acknowledged copy clears its recovery entry');
}
console.log('✓ draft retry pipeline: intended undo survives applied and unapplied requests with lost acknowledgements');
