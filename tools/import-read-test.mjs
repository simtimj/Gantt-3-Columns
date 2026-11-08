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
