// Fault-injected Focus persistence: no credentials, live properties or Sheet writes.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractFocus } from './focus-recovery.mjs';
const source = fs.readFileSync('Code.gs','utf8');
const clone = v => JSON.parse(JSON.stringify(v));
const old = {v:1,cats:[{id:'c',name:'Original',items:[{id:'a',t:'Keep this',d:0}]}]};
const next = {v:1,cats:[{id:'c',name:'Updated',items:[{id:'a',t:'😀日本語 café '.repeat(2800),d:0}]}]};
function fixture(initial = {focusData:JSON.stringify(old),funData:'unrelated'}) {
  const props = {...initial}, faults = {}; let gen = 0;
  const api = {
    getProperties:()=>({...props}),
    getProperty:k=>{if(faults.unreadableHead && k==='focusDataHead') throw Error('read unavailable');return props[k]??null;},
    setProperties:values=>{
      let n = 0;
      for(const [k,v] of Object.entries(values)){
        assert.ok(Buffer.byteLength(v,'utf8')<=8000,'chunk exceeds byte budget');
        props[k]=v;
        if(faults.stageAfter && ++n===faults.stageAfter) throw Error('interrupted staging');
      }
      if(faults.corruptStage) props[Object.keys(values).at(-1)]='corrupt';
    },
    setProperty:(k,v)=>{
      if(faults.commitBefore) throw Error('commit refused');
      props[k]=v;
      if(faults.commitAfter) throw Error('acknowledgement lost');
    },
    deleteProperty:k=>{if(faults.cleanup) throw Error('cleanup unavailable');delete props[k];}
  };
  const ctx = vm.createContext({console,Utilities:{getUuid:()=> 'generation-'+(++gen),DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF_8'},
    computeDigest:(_,text)=>[...crypto.createHash('md5').update(text,'utf8').digest()].map(x=>x>127?x-256:x)},PropertiesService:{getScriptProperties:()=>api}});
  vm.runInContext(source,ctx);
  return {props,faults,ctx,read:()=>clone(ctx.readFocus_()),write:v=>ctx.writeFocus_(v)};
}
// Unicode boundaries and transparent legacy migration.
let f = fixture();
assert.deepEqual(f.read(),old);
f.write(next);
assert.deepEqual(f.read(),next);
let head = JSON.parse(f.props.focusDataHead);
const chunks = Array.from({length:head.n},(_,i)=>f.props['focusV2_'+head.g+'_'+i]);
assert.ok(chunks.length>1);
assert.equal(chunks.join(''),JSON.stringify(next));
chunks.forEach(s=>{assert.ok(Buffer.byteLength(s,'utf8')<=8000);assert.ok(!/[\uD800-\uDBFF]$/.test(s));assert.ok(!/^[\uDC00-\uDFFF]/.test(s));});
assert.equal(f.props.focusData,undefined);
assert.equal(f.props.funData,'unrelated');
// Every pre-commit fault preserves the selected previous version.
for(const fault of ['stageAfter','corruptStage','commitBefore']){
  f = fixture();f.write(old);const priorHead = f.props.focusDataHead;
  f.faults[fault] = fault==='stageAfter'?2:true;
  assert.throws(()=>f.write(next),/could not be confirmed/);
  assert.equal(f.props.focusDataHead,priorHead);
  assert.deepEqual(f.read(),old);
  const prefix='focusV2_'+JSON.parse(priorHead).g+'_';
  assert.ok(Object.keys(f.props).filter(k=>k.startsWith('focusV2_')).every(k=>k.startsWith(prefix)),'failed staging leaves no active replacement');
}
// If failure recovery cannot read the pointer, leave chunks intact for later reconciliation.
f = fixture();f.write(old);f.faults.stageAfter=1;f.faults.unreadableHead=true;
assert.throws(()=>f.write(next),/could not be confirmed/);
f.faults.unreadableHead=false;assert.deepEqual(f.read(),old);
assert.ok(Object.keys(f.props).some(k=>k.startsWith('focusV2_generation-2_')));
f.faults.stageAfter=0;f.write(next);
assert.deepEqual(f.read(),next);
assert.ok(!Object.keys(f.props).some(k=>k.startsWith('focusV2_generation-2_')),'orphan staging chunks reclaimed on next save');
// Applied-but-unacknowledged commit is a success; cleanup never deletes its selected chunks.
f = fixture();f.write(old);f.faults.commitAfter=true;
assert.equal(f.write(next),true);assert.deepEqual(f.read(),next);
assert.ok(Object.keys(f.props).some(k=>k.startsWith('focusV2_generation-1_')),'prior generation retained after ambiguous acknowledgement');
f.faults.commitAfter=false;f.write(old);
assert.deepEqual(f.read(),old);
assert.ok(!Object.keys(f.props).some(k=>k.startsWith('focusV2_generation-1_')));
f = fixture();f.write(old);f.faults.cleanup=true;
assert.equal(f.write(next),true);assert.deepEqual(f.read(),next);
f.faults.cleanup=false;f.write(old);assert.deepEqual(f.read(),old);
f = fixture();f.write(old);f.faults.unreadableHead=true;
assert.throws(()=>f.write(next),/could not be confirmed/);
f.faults.unreadableHead=false;
assert.deepEqual(f.read(),next,'unreadable acknowledgement must not delete a possibly committed generation');
// Numbered legacy chunks survive a failed migration, then migrate without touching other modules.
const json = JSON.stringify(old);
f = fixture({focusDataN:'2',focusData_0:json.slice(0,15),focusData_1:json.slice(15),funData:'unrelated'});
f.faults.commitBefore=true;assert.throws(()=>f.write(next));assert.deepEqual(f.read(),old);assert.equal(f.props.focusDataN,'2');
f.faults.commitBefore=false;f.write(next);assert.deepEqual(f.read(),next);assert.equal(f.props.focusDataN,undefined);assert.equal(f.props.funData,'unrelated');
for(const bad of ['not-json','null','{}']){
  f = fixture({focusDataHead:bad,focusData:JSON.stringify(old)});
  assert.throws(()=>f.read(),/could not be read/,'never fall back to stale legacy data after an invalid committed head');
}
f=fixture({focusDataN:'broken'});assert.throws(()=>f.read(),/could not be read/);
for(const legacy of [{focusDataN:'',focusData_0:'x'},{focusData_0:'x'},{focusDataN:'1',focusData_0:''}]){
  f=fixture(legacy);assert.throws(()=>f.read(),/could not be read/,'damaged legacy metadata must not become an empty list');
}
f=fixture();f.write(next);head=JSON.parse(f.props.focusDataHead);delete f.props['focusV2_'+head.g+'_0'];
assert.throws(()=>f.read(),/could not be read/);
console.log('✓ Focus storage: Unicode byte limits; legacy migration; interrupted/corrupt staging; refused/lost commit acknowledgements; cleanup faults; orphan recovery; invalid heads never become empty lists');

// Offline rollback drill: the independent extractor reads the actual writer's
// selected generation, ignoring stale legacy data and uncommitted orphan chunks.
f=fixture();f.write(next);
f.props.focusData=JSON.stringify(old);
f.props.focusV2_orphan_0='uncommitted';
const recovered=extractFocus(f.props);
assert.deepEqual(recovered.data,next);assert.equal(recovered.format,'generation-v2');
assert.equal(recovered.raw,JSON.stringify(next),'preserve selected raw JSON exactly');
assert.equal(f.props.funData,'unrelated');
const broken={...f.props};delete broken['focusV2_'+JSON.parse(broken.focusDataHead).g+'_0'];
assert.throws(()=>extractFocus(broken),/Missing or invalid/,'never recover stale legacy data after selected-generation loss');
const corrupt={...f.props};corrupt['focusV2_'+JSON.parse(corrupt.focusDataHead).g+'_0']+='x';
assert.throws(()=>extractFocus(corrupt),/length\/hash/);
for(const props of [{focusData:JSON.stringify(next)},
  {focusDataN:'2',focusData_0:JSON.stringify(next).slice(0,15),focusData_1:JSON.stringify(next).slice(15)}]) {
  assert.deepEqual(extractFocus(props).data,next,'legacy and selected generation preserve identical logical data');
}
assert.throws(()=>extractFocus({funData:'unrelated'}),/No selected Focus/);
assert.throws(()=>extractFocus({focusDataN:'',focusData:JSON.stringify(old)}),/chunk count/);
assert.throws(()=>extractFocus({focusDataHead:'{}',focusData:JSON.stringify(old)}),/selected Focus head/);
assert.throws(()=>extractFocus({focusDataN:'1',focusData_0:''}),/Empty legacy/);
assert.throws(()=>extractFocus({focusData_0:'orphan'}),/Uncounted legacy/);
assert.throws(()=>extractFocus({focusData:'{"cats":null}'}),/list is invalid/);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gantt-focus-recovery-'));
try {
  const input=path.join(temp,'properties.json'),output=path.join(temp,'recovered.json');
  fs.writeFileSync(input,JSON.stringify(f.props),{mode:0o600});
  const run=()=>spawnSync(process.execPath,['tools/focus-recovery.mjs',input,output],{encoding:'utf8'});
  let cli=run();assert.equal(cli.status,0,cli.stderr);
  assert.equal(fs.readFileSync(output,'utf8'),JSON.stringify(next)+'\n');
  assert.equal(fs.statSync(output).mode & 0o777,0o600);
  assert.ok(!cli.stdout.includes('日本語'),'task content stays out of the console');
  cli=run();assert.notEqual(cli.status,0,'existing backups are not overwritten');
  assert.equal(fs.readFileSync(output,'utf8'),JSON.stringify(next)+'\n');
  fs.unlinkSync(output);fs.writeFileSync(input,JSON.stringify(broken));
  cli=run();assert.notEqual(cli.status,0);assert.equal(fs.existsSync(output),false,'failed extraction creates no backup');
  fs.writeFileSync(input,'private-task-text invalid json');
  cli=run();assert.notEqual(cli.status,0);assert.ok(!cli.stderr.includes('private-task-text'),'invalid input is not echoed to the console');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
console.log('✓ offline Focus recovery drill: actual MD5/UTF-8 writer, selected generation and legacy reads, stale/corrupt refusal, private output, no overwrite or live writes');
