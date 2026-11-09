// Statistical and identity rules for repeatable offline comparisons. Synthetic data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import { summarizeSpeed } from './speed-summary.mjs';
const head=['When','Kind','Total ms','Steps','Client','KB'];
const row=(ms,id,extra={},steps={})=>['example time','sync',String(ms),JSON.stringify(steps),JSON.stringify({
  pageRelease:'S',serverRelease:'S',pageBuild:'P',serverBuild:'P',w:411,visibility:'visible',
  ...(id?{reportId:id}:{}),...extra}),'{}'];
let out=summarizeSpeed([head,row(100,'a',{rpcMs:1000},{outer:70,'outer.part':50}),
  row(100,'a',{rpcMs:1000},{'outer.part':50,outer:70}),row(300,'b',{rpcMs:3000})]);
assert.equal(out.quality.exactDuplicateRows,1,'report ID and equal payload deduplicate despite key order');
assert.equal(out.groups[0].matched,true);let stats=out.groups[0].kinds.sync;
assert.equal(stats.records,2);assert.equal(stats.serverMs.median,200,'even median averages both middle values');
assert.equal(stats.rpcMs.median,2000);assert.deepEqual(stats.drawMs,{n:0,median:null});
assert.deepEqual(stats.stepsMs.outer,{n:1,median:70});assert.equal(stats.stepsMs['outer.part'].median,50);
assert.equal(stats.serverMs.median,200,'nested substeps are not added to their parents');
out=summarizeSpeed({values:[head,row(100),row(100)]});
assert.equal(out.quality.exactDuplicateRows,0);assert.equal(out.quality.possibleLegacyDuplicateRows,1);
assert.equal(out.groups[0].kinds.sync.records,2,'legacy identical records are flagged, never silently removed');
out=summarizeSpeed([head,row(100,'a'),row(700,'a'),row(700,'a')]);
assert.equal(out.quality.conflictingReportIds,1);assert.equal(out.quality.exactDuplicateRows,1);
assert.equal(out.groups[0].kinds.sync.records,2,'conflicting payloads are retained');
out=summarizeSpeed([head,row(100,'a'),row(200,'b',{w:1317}),row(300,'c',{visibility:'hidden'}),
  row(400,'d',{pageRelease:'older'}),row(500,'e',{pageRelease:''}),row(600,'f',{pageRelease:'',serverRelease:''}),
  row(700,'g',{pageBuild:'different'}),row(800,'h',{pageBuild:''})]);
assert.equal(out.groups.length,8,'build, viewport and visibility contexts stay separate');
assert.equal(out.groups.filter(g=>g.matched).length,3,'missing identities never count as a version match');
out=summarizeSpeed([head,row(300,'a'),row(100,'b'),row(200,'c'),['bad','sync','NaN','{}','{}'],
  ['bad','sync','10','{private text invalid','{}'],row(400,'d',{rpcMs:'not numeric'})]);
assert.deepEqual(out.quality.invalidRows,[5,6]);
assert.equal(out.groups[0].kinds.sync.serverMs.median,250);assert.equal(out.groups[0].kinds.sync.rpcMs.n,0);
assert.throws(()=>summarizeSpeed([]),/header row/);assert.throws(()=>summarizeSpeed({values:[]}),/header row/);
assert.equal(summarizeSpeed([head]).groups.length,0);
console.log('✓ speed summary: exact IDs, legacy uncertainty/conflicts, build/device/visibility separation, true medians, missing fields, nested stages and invalid-row handling');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gantt-speed-summary-'));
try {
  const input=path.join(temp,'speed.json');fs.writeFileSync(input,JSON.stringify({values:[head,row(100,'a'),row(300,'b')]}));
  let cli=spawnSync(process.execPath,['tools/speed-summary.mjs',input],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).groups[0].kinds.sync.serverMs.median,200);
  fs.writeFileSync(input,'private invalid input');
  cli=spawnSync(process.execPath,['tools/speed-summary.mjs',input],{encoding:'utf8'});
  assert.notEqual(cli.status,0);assert.equal(cli.stdout,'');assert.ok(!cli.stderr.includes('private invalid input'));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
console.log('✓ speed summary CLI: range JSON read, exact output and no private-input echo on failure');
