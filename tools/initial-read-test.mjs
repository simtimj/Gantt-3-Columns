// Initial-load snapshot compatibility and service-read budget; no Google calls.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ctx = vm.createContext({console, Date});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),ctx);
ctx.formatDate_ = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v || '');
ctx.cellHash_ = v => 'hash:' + String(v || '');
ctx.parseDate_ = v => new Date(v+'T00:00:00Z');
let rows = [
  ['Date','Tasks','Notes','Plan'],
  [new Date('2026-11-09T00:00:00Z'),'next','journal','plan'],
  ['', 'invalid','invalid','invalid'],
  ['2026-11-08','today','','today plan'],
  ['2026-11-01','outside','old','old plan'],
  ['2026-11-10',0,false,'']
];
let reads = 0;
const sheet = {getLastRow: () => rows.length, getMaxColumns: () => rows[0].length,
  getRange(r,c,h,w) {return {getValues() {reads++;return rows.slice(r-1,r-1+h).map(row=>row.slice(c-1,c-1+w));}};}};
ctx.getOrCreateSheet_ = () => sheet;
const plain = x => JSON.parse(JSON.stringify(x));
for(const width of [4,3]) {
  rows = rows.map(row=>row.slice(0,width));
  reads = 0;
  const expected = ctx.getDaysRange_('2026-11-08','2026-11-10');
  assert.equal(reads,2,'legacy path reads dates then visible text');
  const snapshot = ctx.readAllDays_();
  reads = 0;
  const actual = ctx.getDaysRange_('2026-11-08','2026-11-10',snapshot);
  assert.deepEqual(plain(actual),plain(expected),'snapshot preserves text, Plan, hashes and sorted output');
  assert.equal(reads,0,'initial window requires no additional Sheet read');
}
assert.deepEqual(plain(ctx.getDaysRange_('2026-11-08','2026-11-10',{width:4,rows:[]})),[]);
// Verify caller passes its own post-import snapshot to the actual reader.
ctx.ensureSetup_ = () => {};
ctx.todayString_ = () => '2026-11-08';
ctx.addDaysToDateString_ = (d,n) => n < 0 ? '2026-11-01' : '2026-11-11';
ctx.getReference_ = () => [];
ctx.referenceManifest_ = () => ({hash:'empty'});
ctx.getUrgentDays_ = () => [];
ctx.getCardCats_ = () => ({});
ctx.getRefPins_ = () => [];
ctx.getNotesSeeds_ = () => ({});
reads = 0;
ctx.getWorkspaceData({fast:true});
assert.equal(reads,1,'whole initial day payload uses one shared read');
rows[3][1] = 'edited between requests';
const changed = ctx.getWorkspaceData({fast:true});
assert.equal(changed.days.find(d=>d.date==='2026-11-08').tasks,'edited between requests','next request reads fresh data');
console.log('Initial-load snapshot tests passed');
