// Timing collection adds no per-save RPC and acknowledges only the submitted batch.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const html=fs.readFileSync('Index.html','utf8');
const source=html.slice(html.indexOf('  let fwSaveSamples='),html.indexOf('  function fwSpeedLog('));
let now=0;const logs=[];
const run={withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.bad=fn;return this;},logSpeed(kind,timing,client){logs.push({kind,timing,client,ok:this.ok,bad:this.bad});}};
const c=vm.createContext({console,performance:{now:()=>now},document:{visibilityState:'visible'},google:{script:{run}}});c.window=c;c.innerWidth=412;c.__FW_BUILD__='page';c.__FW_RELEASE__='open-page';c.crypto={randomUUID:()=> 'timing-session'};
vm.runInContext(source,c);
now=125;c.fwObserveSave('day',100,{release:'server-A',build:'build-A'});
now=160;c.fwObserveSave('reference',140,{release:'server-B',conflict:true});
now=190;c.fwObserveSave('day',180,null,new Error('offline'));
assert.equal(logs.length,0,'observing edits must not make logging requests');
c.fwSendSpeed('sync',{total:1},c.fwSpeedContext({rpcMs:10}));
assert.equal(logs.length,1);const batch=logs[0].client.saveTimings;assert.equal(batch.length,3);
assert.deepEqual(Array.from(batch,s=>s.status),['ok','conflict','error']);assert.equal(batch[0].rpcMs,25);assert.equal(batch[0].serverRelease,'server-A');assert.equal(batch[2].serverRelease,'','failed requests have unknown server identity');
assert.deepEqual(Object.keys(batch[0]).sort(),['kind','rpcMs','sampleId','serverBuild','serverRelease','status'].sort(),'samples contain no task names, content or record IDs');
assert.equal(logs[0].client.reportId,'timing-session-report-1');
assert.equal(logs[0].client.pageRelease,'open-page');assert.equal(logs[0].client.w,412);
now=250;c.fwObserveSave('reference',200,{release:'server-C'});logs[0].ok();
c.fwSendSpeed('imports',{total:2},{});assert.equal(logs[1].client.saveTimings.length,1,'newer samples survive older batch acknowledgement');
assert.notEqual(logs[1].client.reportId,logs[0].client.reportId,'different measurements have different report IDs');
const priorReportId=logs[1].client.reportId;
const retryId=logs[1].client.saveTimings[0].sampleId;logs[1].bad(new Error('log unavailable'));assert.equal(logs[1].client.reportId,priorReportId,'the submitted report identity stays stable after failure');
c.fwSendSpeed('sync',{total:1},{});assert.equal(logs[2].client.saveTimings[0].sampleId,retryId,'failed reports retain stable sample IDs for deduplication');logs[2].ok();
c.fwSendSpeed('sync',{total:1},{});assert.equal(logs[3].client.saveTimings.length,0);
for(let i=0;i<60;i++){now++;c.fwObserveSave('day',now-1,{release:'server-D'});}
c.fwSendSpeed('sync',{total:1},{});assert.equal(logs[4].client.saveTimings.length,50,'best-effort memory buffer is bounded');
assert.equal(new Set(logs[4].client.saveTimings.map(s=>s.sampleId)).size,50);
console.log('✓ save timing: no per-save RPC, response-specific identity, privacy, bounded batches, retry IDs and acknowledgement isolation');

assert.equal(new Set(logs.map(x=>x.client.reportId)).size,logs.length,'each submitted measurement gets a page-scoped unique ID');
console.log('✓ speed reports: unique measurement IDs, stable submitted arguments and separate save-sample identities');
