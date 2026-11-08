// Offline regression checks for Focus three-way saves and recoverable drafts.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const clone=v=>JSON.parse(JSON.stringify(v));
const fixture={v:1,cats:[{id:'c',name:'Work',items:[{id:'a',t:'First',d:0,lv:0},{id:'b',t:'Second',d:0,lv:0}]}]};
const props={};let locked=false;
const server=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...props}),getProperty:k=>props[k]??null,setProperties:p=>Object.assign(props,p),deleteProperty:k=>delete props[k]})},
  LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})}});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),server);
server.writeFocus_(fixture);
const mine=clone(fixture),theirs=clone(fixture);
mine.cats[0].items[0].t='My edit';theirs.cats[0].items[1].d=1;
server.saveFocus(theirs,{base:fixture});
const merged=server.saveFocus(mine,{base:fixture});
assert.equal(merged.data.cats[0].items[0].t,'My edit');
assert.equal(merged.data.cats[0].items[1].d,1);
const opposing=clone(fixture);opposing.cats[0].items[0].t='Conflicting edit';
const conflict=server.saveFocus(opposing,{base:fixture});
assert.equal(conflict.conflict,true);
assert.equal(server.getFocus().cats[0].items[0].t,'My edit');
assert.throws(()=>server.saveFocus(fixture),/Reload/);
const left=clone(fixture),right=clone(fixture);
left.cats[0].items.splice(1,0,{id:'x',t:'New left'});
right.cats[0].items.push({id:'y',t:'New right'});
const adds=server.mergeFocus_(fixture,left,right);
assert.equal(adds.conflicts.length,0);
assert.deepEqual(Array.from(adds.data.cats[0].items,x=>x.id),['a','x','b','y']);
const removed=clone(fixture);removed.cats[0].items.shift();
const deleteEdit=server.mergeFocus_(fixture,removed,mine);
assert.ok(deleteEdit.conflicts.length,'delete versus edit requires a decision');
const resolved=server.saveFocus(opposing,{base:clone(server.getFocus())});
assert.equal(resolved.data.cats[0].items[0].t,'Conflicting edit');
assert.equal(locked,false);
console.log('✓ Focus server: independent edits/additions merge; conflicting edit/deletion stays protected; explicit resolution and legacy-tab guard checked');

const html=fs.readFileSync('Index.html','utf8');
const start=html.indexOf('  (function initFocus(){'),end=html.indexOf('  /* Done → Dailies matches',start);
const calls=[],storage=new Map(),timers=new Map(),statuses=[];let nextTimer=1;
const run={withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.fail=fn;return this;},
  getFocus(){calls.push({kind:'get',ok:this.ok,fail:this.fail});},
  saveFocus(data,opts){calls.push({kind:'save',data:clone(data),opts:clone(opts),ok:this.ok,fail:this.fail});}};
const client={console,google:{script:{run}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  document:{querySelectorAll:()=>[]},setStatus:s=>statuses.push(s),
  setTimeout:fn=>{const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
client.window=client;
vm.runInNewContext(html.slice(start,end),client);
calls[0].ok(clone(fixture));
const tick=()=>{const run=[...timers.values()];timers.clear();run.forEach(fn=>fn());};
client.focusTidToggled('a',true);tick();
assert.equal(calls.length,2);
assert.equal(calls[1].data.cats[0].items[0].d,1);
assert.ok(storage.has('fw.focus.draft.v1'));
client.focusTidToggled('b',true);tick();
assert.equal(calls.length,2,'typing/toggling while saving cannot issue a concurrent snapshot');
calls[1].ok({data:clone(calls[1].data)});tick();
assert.equal(calls.length,3);
assert.equal(calls[2].data.cats[0].items[1].d,1);
calls[2].ok({conflict:true,data:clone(fixture),fields:['focus.cats[c].items[a].d']});tick();
assert.equal(calls.length,3,'conflict does not silently retry against a new base');
assert.ok(storage.has('fw.focus.recovery.v1'));
assert.match(statuses.at(-1),/changed elsewhere/);
console.log('✓ Focus client: draft retained; writes serialized; edits during save stay pending; conflicts stop automatic overwrite');

// A load failure must not turn the shared list into a new empty editable list.
const calls2=[],timers2=[];
const run2={withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.fail=fn;return this;},
  getFocus(){calls2.push({kind:'get',ok:this.ok,fail:this.fail});},saveFocus(){calls2.push({kind:'save'});}};
const noDraft={...client,google:{script:{run:run2}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:fn=>{timers2.push(fn);return timers2.length;},clearTimeout(){}};
noDraft.window=noDraft;
vm.runInNewContext(html.slice(start,end),noDraft);
calls2[0].fail(new Error('offline'));
noDraft.focusTidToggled('a',true);
timers2.forEach(fn=>fn());
assert.deepEqual(calls2.map(c=>c.kind),['get']);

// Reload retains the old base and draft, so the server can merge instead of overwriting blindly.
const restored=[],timers3=[];
const run3={withSuccessHandler(fn){this.ok=fn;return this;},withFailureHandler(fn){this.fail=fn;return this;},
  getFocus(){restored.push({kind:'get',ok:this.ok});},saveFocus(data,opts){restored.push({kind:'save',data:clone(data),opts:clone(opts)});}};
const withDraft={...client,google:{script:{run:run3}},setTimeout:fn=>{timers3.push(fn);return timers3.length;},clearTimeout(){}};
withDraft.window=withDraft;
vm.runInNewContext(html.slice(start,end),withDraft);
restored[0].ok(clone(fixture));
timers3.forEach(fn=>fn());
assert.equal(restored[1].kind,'save');
assert.equal(restored[1].data.cats[0].items[0].d,1);
assert.deepEqual(restored[1].opts.base,JSON.parse(storage.get('fw.focus.draft.v1')).base);
console.log('✓ Focus recovery: failed load cannot save an empty list; reloaded draft sends its original merge base');
