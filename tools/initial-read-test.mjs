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

// Large historical snapshots must not format every Date cell. Match the actual
// normal reader, retaining text dates, unsorted/duplicate rows and near-boundary
// Date cells. No source row or snapshot may be mutated by the prefilter.
const format=ctx.formatDate_;let formats=0;
ctx.formatDate_=v=>{if(v instanceof Date)formats++;return format(v);};
rows=[['Date','Tasks','Notes','Plan'],
  ...Array.from({length:1000},()=>[new Date('2000-01-01T00:00:00Z'),'old','old','old']),
  [new Date('2026-11-09T00:00:00Z'),'middle','notes','plan'],
  [new Date('2026-11-07T00:00:00Z'),'near-before','',''],
  [new Date('2026-11-11T00:00:00Z'),'near-after','',''],
  ['2026-11-08','text date','','text plan'],
  [new Date('2026-11-09T12:00:00Z'),'duplicate date','','duplicate plan'],
  ['', 'no date','','']];
formats=0;const normal=plain(ctx.getDaysRange_('2026-11-08','2026-11-10'));
const normalFormats=formats;const history=ctx.readAllDays_();const frozen=JSON.stringify(history);
formats=0;reads=0;const window=plain(ctx.getDaysRange_('2026-11-08','2026-11-10',history));
assert.deepEqual(window,normal);
assert.equal(formats,normalFormats,'snapshot and normal reader use the same date-filter budget');
assert.equal(formats,4,'only two nearby and two in-window Date cells need formatting');
assert.equal(reads,0);assert.equal(JSON.stringify(history),frozen);
assert.equal(window.length,3,'duplicate dates and text-date rows remain visible');
console.log('✓ startup dates: 1,000 distant historical Date cells skipped before formatting; normal-reader parity, text/duplicate dates and snapshot immutability');

// Preserve the original unfiltered snapshot semantics across Pacific fall-back,
// including both 1:30 occurrences and the last half hour of the 25-hour day.
const pacific=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
ctx.formatDate_=v=>{
  if(!(v instanceof Date))return String(v||'');
  const parts=Object.fromEntries(pacific.formatToParts(v).map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
};
ctx.parseDate_=()=>new Date('2026-11-01T07:00:00Z');
const dstRows=[
  [new Date('2026-11-01T06:59:59Z'),'previous day','',''],
  [new Date('2026-11-01T07:00:00Z'),'start','',''],
  [new Date('2026-11-01T08:30:00Z'),'first 1:30','',''],
  [new Date('2026-11-01T09:30:00Z'),'second 1:30','',''],
  [new Date('2026-11-02T07:30:00Z'),'last half hour','',''],
  [new Date('2026-11-02T08:00:00Z'),'next day','','']
];
assert.deepEqual(plain(ctx.getDaysRange_('2026-11-01','2026-11-01',{width:4,rows:dstRows})).map(d=>d.tasks),
  ['start','first 1:30','second 1:30','last half hour']);
console.log('✓ startup date window retains both repeated Pacific hours and the end of a 25-hour day');
