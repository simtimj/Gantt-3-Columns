// Regression checks for stale Reference metadata and per-card save ordering.
// Local mocks only: never connects to Google or edits a real spreadsheet.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync('Code.gs','utf8');
const row = ['r1','new-parent','item','New title','same',true,9000];
const sheet = { rows:[[],row], getLastRow(){return this.rows.length;},
  getRange(r,c,h=1,w=1){return {
    getValues:()=>this.rows.slice(r-1,r-1+h).map(v=>v.slice(c-1,c-1+w)),
    getValue:()=>this.rows[r-1][c-1],
    setValue:v=>{this.rows[r-1][c-1]=v;},
    setValues:vs=>vs.forEach((v,i)=>v.forEach((x,j)=>this.rows[r-1+i][c-1+j]=x))
  };}, appendRow(v){this.rows.push(v);}
};
let locked=false;
const server=vm.createContext({console,Utilities:{getUuid:()=> 'new-id'},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})}});
vm.runInContext(src,server);
server.getOrCreateSheet_=()=>sheet;
server.cellHash_=s=>'h:'+s;
server.appBuild_=()=> 'test';
server.backupCell_=()=>{};
const save=(extra={})=>server.saveReferenceItem({id:'r1',parentId:'stale-parent',type:'stale-type',title:'Old title',content:'same',expanded:false,sort:1,fwSync:1,baseHash:'h:same',contentChanged:false,...extra});
save();
assert.deepEqual(row,['r1','new-parent','item','New title','same',true,9000]);
save({content:'edited',contentChanged:true});
assert.deepEqual(row,['r1','new-parent','item','New title','edited',true,9000]);
const conflict=save({content:'stale text',contentChanged:true});
assert.equal(conflict.conflict,true);
assert.equal(row[4],'edited');
const collapse=save({baseHash:'h:edited',metaChanges:{expanded:{before:true,after:false}}});
assert.equal(row[5],false);
assert.equal(collapse.meta.expanded,false);
const move=save({baseHash:'h:edited',metaChanges:{parentId:{before:'new-parent',after:'destination'}}});
assert.equal(row[1],'destination');
assert.equal(move.metaConflicts.length,0);
const stale=save({baseHash:'h:edited',metaChanges:{parentId:{before:'new-parent',after:'other-destination'}}});
assert.deepEqual(Array.from(stale.metaConflicts),['parentId']);
assert.equal(row[1],'destination');
const retry=save({baseHash:'h:edited',metaChanges:{parentId:{before:'new-parent',after:'destination'}}});
assert.equal(retry.metaConflicts.length,0);
assert.equal(locked,false);
const added=server.addReferenceItem('','New card','<h2>New card</h2>');
assert.ok(sheet.rows.at(-1)[6] > 1000000000000,'new cards retain end-of-list order without relying on an autosave');
sheet.rows.splice(1,1);
const rowsBefore = sheet.rows.length;
assert.equal(save({expectedExisting:true}).deleted,true);
assert.equal(save({baseHash:null,expectedExisting:true}).deleted,true);
assert.equal(save({baseHash:null,expectedExisting:false}).deleted,true,'older tabs without the new flag are protected too');
assert.equal(sheet.rows.length,rowsBefore,'a stale save must not recreate a deleted card');
console.log('✓ server: untouched fields preserved; text conflict protected; explicit collapse/move, stale move conflict and retry checked');

const html=fs.readFileSync('Index.html','utf8');
const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const calls=[],statuses=[];
const run={withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.fail=fn;return this;},
  saveReferenceItem(payload){calls.push({payload,ok:this.ok,fail:this.fail});}};
const client=vm.createContext({console,google:{script:{run}},document:{querySelector:()=>null},CSS:{escape:s=>s},
  setStatus:s=>statuses.push(s),fwCheckBuild(){},fwReconcileRef(){}});
vm.runInContext('let refInFlight=0,fwRefEpoch=0;'+extract('  function refBase(item){','  /* Cell HTML')+extract('  function sendRefItem(item,onOk,onErr){','  /* Newer app version'),client);
const item={id:'r1',parentId:'',expanded:true,content:'same',ch:'h:same',title:'',sort:1};
client.refBase(item);
item.expanded=false;
client.sendRefItem(item);
assert.equal(calls[0].payload.metaChanges.expanded.after,false);
item.expanded=true;
client.sendRefItem(item);
assert.equal(calls.length,1,'second save waits for acknowledgement');
calls[0].ok({id:'r1',ch:'h:same',meta:{parentId:'',expanded:false},metaConflicts:[]});
assert.equal(item.expanded,true,'older response must not undo the new click');
assert.equal(calls.length,2);
assert.equal(calls[1].payload.metaChanges.expanded.after,true);
calls[1].ok({id:'r1',ch:'h:same',meta:{parentId:'',expanded:true},metaConflicts:[]});
assert.equal(item._refSaving,false);
assert.equal(vm.runInContext('refInFlight',client),0);
item.parentId='mine';
let completed=false;
client.sendRefItem(item,()=>{completed=true;});
calls[2].ok({id:'r1',ch:'h:same',meta:{parentId:'theirs',expanded:true},metaConflicts:['parentId']});
assert.equal(item.parentId,'theirs');
assert.equal(completed,false,'conflict must not report success or save a stale drag order');
assert.match(statuses.at(-1),/changed elsewhere/);
client.sendRefItem(item);
client.sendRefItem(item);
calls[3].fail(new Error('offline'));
assert.equal(calls.length,5,'queued operation drains after a failed request');
calls[4].ok({id:'r1',ch:'h:same',meta:{parentId:'theirs',expanded:true},metaConflicts:[]});
assert.equal(item._refSaving,false);
console.log('✓ client: serialized saves; latest click survives; conflicts do not call success; queue recovers after failure');
client.sendRefItem(item);
calls.at(-1).ok({id:'r1',deleted:true});
assert.equal(item._refDeleted,true);
const sent = calls.length;
client.sendRefItem(item);
assert.equal(calls.length,sent,'deleted draft must not autosave repeatedly');
assert.match(statuses.at(-1),/copy your text/);
assert.equal(item.content,'same','deleted-card response keeps the local text');
console.log('✓ deleted cards: server refuses resurrection; client retains text and stops automatic writes');
