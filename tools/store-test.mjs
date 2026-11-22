// Storage layer (Store.gs) with a fake Sheet: no credentials, no live Sheet. node tools/store-test.mjs
// Keep In Mind: read/write through Store.kim, saved-at in B2, conflict on stale hash, big-shrink backup.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
function fakeSheet() {
  const tabs = {};
  const tab = name => {
    const rows = [];
    const sh = {
      rows,
      setFrozenRows: () => {},
      getRange: (r, c, nr = 1, nc = 1) => typeof r === 'string' ? { setNumberFormat: () => {} } : ({
        setFontWeight: () => {},
        setNumberFormat: () => {},
        getDisplayValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => String((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
        getValue: () => (rows[r - 1] || [])[c - 1] ?? '',
        setValue: v => { (rows[r - 1] ||= [])[c - 1] = v; },
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
        setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => { (rows[r - 1 + i] ||= [])[c - 1 + j] = v; })); return this; }
      }),
      appendRow: row => rows.push(row),
      getLastRow: () => rows.length,
      getMaxColumns: () => Math.max(sh.cols || 0, ...rows.map(r => r.length)),
      insertColumnsAfter: (_, n) => { sh.cols = sh.getMaxColumns() + n; },
      deleteRows: () => {},
      deleteRow: r => { rows.splice(r - 1, 1); },
      getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) })
    };
    return sh;
  };
  return { tabs, ss: { getSheetByName: n => tabs[n] || null, insertSheet: n => (tabs[n] = tab(n)) } };
}
const { tabs, ss } = fakeSheet(), props = {};
const ctx = vm.createContext({
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  CacheService: { getScriptCache: () => ({ get: k => (k === 'appBuild' ? 'b1' : null), put: () => {} }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Session: { getScriptTimeZone: () => 'America/Los_Angeles' },
  Utilities: { DigestAlgorithm: { MD5: 'MD5' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_, t) => [...crypto.createHash('md5').update(t, 'utf8').digest()].map(x => (x > 127 ? x - 256 : x)) }
});
vm.runInContext(fs.readFileSync('Code.gs', 'utf8') + '\n' + fs.readFileSync('Store.gs', 'utf8') + '\n' + fs.readFileSync('Timer.gs', 'utf8') + '\nthis.Store = Store;', ctx);

// Fresh: empty + not migrated.
let g = ctx.getKim();
assert.equal(g.html, ''); assert.equal(g.fresh, true); assert.equal(g.at, 0);
assert.deepEqual(tabs['Keep In Mind'].rows[0], ['Keep In Mind (shared list, HTML) — edited in the app', 'Saved at (ms)']);
// Save with the right base hash.
const big = '<div>' + 'x'.repeat(600) + '</div>';
let r = ctx.saveKim(big, g.h);
assert.ok(!r.conflict); assert.ok(r.at > 0);
assert.equal(tabs['Keep In Mind'].rows[1][0], big); assert.equal(tabs['Keep In Mind'].rows[1][1], r.at);
g = ctx.getKim(); assert.equal(g.fresh, false); assert.equal(g.html, big); assert.equal(g.at, r.at);
// Stale hash → conflict with the server copy, nothing written.
r = ctx.saveKim('<div>other</div>', 'stale');
assert.equal(r.conflict, true); assert.equal(r.html, big); assert.equal(tabs['Keep In Mind'].rows[1][0], big);
// Big shrink → old copy to Backup first.
r = ctx.saveKim('<div>tiny</div>', g.h);
assert.ok(!r.conflict); assert.equal(tabs.Backup.rows.at(-1)[3], 'big shrink'); assert.equal(tabs.Backup.rows.at(-1)[4], big);
// Old sheets (header only in A1) get the B1 header added.
delete tabs['Keep In Mind']; ss.insertSheet('Keep In Mind').rows.push(['Keep In Mind (shared list, HTML) — edited in the app']);
tabs['Keep In Mind'].rows.push(['<div>legacy</div>']);
g = ctx.getKim(); assert.equal(g.html, '<div>legacy</div>'); assert.equal(g.at, 0); assert.equal(tabs['Keep In Mind'].rows[0][1], 'Saved at (ms)');
// Unbuilt backend fails loudly instead of silently using the Sheet.
vm.runInContext("STORE_BACKEND.kim = 'db'", ctx);
assert.throws(() => ctx.getKim(), /not built yet/);
console.log('✓ store-test: Keep In Mind through Store.kim');

// Days through Store.days (fields tasks / journal / plan / tho).
vm.runInContext("STORE_BACKEND.kim = 'sheet'; formatDate_ = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || ''); parseDate_ = v => new Date(v + 'T00:00:00Z');", ctx);
const D = vm.runInContext('Store.days', ctx), days = () => tabs.Days.rows;
assert.equal(D.get('2026-11-21', ['tasks']).exists, false);
// saveDay on a missing day appends one row [date, Today, Notes].
let s1 = ctx.saveDay('2026-11-21', '<div>t</div>', '<div>n</div>');
assert.equal(s1, true); assert.equal(days().length, 2); assert.equal(JSON.stringify(days()[1].slice(1)), JSON.stringify(['<div>t</div>', '<div>n</div>']));
// Safe save: only the changed column is written, stale hash sends the server copy back.
const th = ctx.cellHash_('<div>t</div>'), jh = ctx.cellHash_('<div>n</div>');
let s2 = ctx.saveDay('2026-11-21', '<div>t2</div>', 'ignored', { th: th, jh: jh, ct: true, cj: false });
assert.equal(days()[1][1], '<div>t2</div>'); assert.equal(days()[1][2], '<div>n</div>'); assert.ok(!s2.conflictT);
s2 = ctx.saveDay('2026-11-21', '<div>x</div>', '', { th: 'stale', jh: jh, ct: true, cj: false });
assert.equal(s2.conflictT, true); assert.equal(s2.tasks, '<div>t2</div>'); assert.equal(days()[1][1], '<div>t2</div>');
// Plan pad adds column D with its header; Thoughts pad column E.
let p1 = ctx.savePlanPad('2026-11-21', '<div>plan</div>', '');
assert.ok(!p1.conflict); assert.equal(days()[0][3], 'Plan'); assert.equal(days()[1][3], '<div>plan</div>');
ctx.saveThoughtPad('2026-11-22', '<div>tho</div>', '');
assert.equal(days()[0][4], 'Thoughts'); assert.equal(days()[2][4], '<div>tho</div>'); assert.equal(days()[2][1], '');
assert.equal(ctx.getScratchPad('2026-11-22').html, '<div>tho</div>');
// Reads: one day, a range, everything.
assert.deepEqual(JSON.parse(JSON.stringify(D.get('2026-11-21', ['journal', 'plan']))), { exists: true, ref_: 2, journal: '<div>n</div>', plan: '<div>plan</div>' });
const rg = ctx.getDaysRange_('2026-11-20', '2026-11-22');
assert.equal(JSON.stringify(rg.map(d => [d.date, d.tasks, d.plan, d.tho])), JSON.stringify([['2026-11-21', '<div>t2</div>', '<div>plan</div>', ''], ['2026-11-22', '', '', '<div>tho</div>']]));
assert.equal(rg[0].th, ctx.cellHash_('<div>t2</div>'));
assert.equal(ctx.readAllDays_().width, 5); assert.equal(ctx.readAllDays_().rows.length, 2);
// Append helpers and the planning read.
ctx.appendTaskToDay('2026-11-23', 'Walk');
assert.match(days()[3][1], /check-text">Walk</); assert.equal(ctx.getDayTasks('2026-11-23')[0].text, 'Walk');
assert.equal(ctx.getDayTasks('2026-12-31').length, 0);
vm.runInContext("STORE_BACKEND.days = 'db'", ctx);
assert.throws(() => ctx.getDayTasks('2026-11-23'), /not built yet/);
console.log('✓ store-test: Days through Store.days (saves, pads, range, append)');

// Reference + Archive through Store.ref / Store.archive.
vm.runInContext("STORE_BACKEND.days = 'sheet'", ctx);
vm.runInContext('Utilities.getUuid = () => "u" + (' + 0 + ' + (globalThis.__u = (globalThis.__u || 0) + 1))', ctx);
const parent = ctx.addReferenceItem('', 'Parent', '<div>p</div>');
const child = ctx.addReferenceItem(parent, 'Child', '<div>c</div>');
const other = ctx.addReferenceItem('', 'Other', '<div>o</div>');
assert.equal(tabs.Reference.rows.length, 4);
let refs = ctx.getReference_();
assert.equal(refs.length, 3); assert.equal(refs[0].row, 2); assert.equal(refs[1].parentId, parent);
// Sync save: content + explicit collapse written; title untouched; stale hash conflicts.
const ch = ctx.cellHash_('<div>p</div>');
let sv = ctx.saveReferenceItem({ id: parent, fwSync: 1, baseHash: ch, contentChanged: true, content: '<div>p2</div>', title: 'stale', metaChanges: { expanded: { before: true, after: false } } });
assert.ok(!sv.conflict); assert.equal(tabs.Reference.rows[1][4], '<div>p2</div>'); assert.equal(tabs.Reference.rows[1][5], false); assert.equal(tabs.Reference.rows[1][3], 'Parent');
sv = ctx.saveReferenceItem({ id: parent, fwSync: 1, baseHash: 'stale', contentChanged: true, content: 'x' });
assert.equal(sv.conflict, true); assert.equal(sv.content, '<div>p2</div>');
assert.equal(ctx.saveReferenceItem({ id: 'gone', fwSync: 1, expectedExisting: true }).deleted, true);
// Order + expand all.
ctx.saveReferenceOrder([{ id: other, sort: 1 }, { id: parent, sort: 2 }]);
assert.equal(ctx.getReference_()[0].id, other);
ctx.saveReferenceExpanded(true); assert.ok(tabs.Reference.rows.slice(1).every(r => r[5] === true));
// Delete a card → it and its child go to the Archive with one timestamp; restore brings both back.
ctx.deleteReferenceItem(parent);
assert.equal(tabs.Reference.rows.length, 2); assert.equal(tabs.Archive.rows.length, 3);
const arch = ctx.getArchive(); assert.equal(arch.length, 1); assert.equal(arch[0].children, 1);
ctx.restoreArchivedItem(parent, arch[0].deletedAt);
assert.equal(tabs.Reference.rows.length, 4); assert.equal(tabs.Archive.rows.length, 1);
assert.equal(ctx.getReference_().find(r => r.id === child).parentId, parent);
vm.runInContext("STORE_BACKEND.ref = 'db'", ctx);
assert.throws(() => ctx.getReference_(), /not built yet/);
console.log('✓ store-test: Reference + Archive through Store.ref / Store.archive (add, safe save, order, delete → archive → restore)');

// Daily plan + Cal Backlog through Store.plan / Store.calBacklog (Calendar not touched by these paths).
vm.runInContext("STORE_BACKEND.ref = 'sheet'; Utilities.formatDate = (d) => d.toISOString().slice(0, 16).replace('T', ' ');", ctx);
assert.equal(vm.runInContext('Store.plan.exists()', ctx), false);
let plan = ctx.planSave({ type: 'upsert', date: '2026-11-21', item: { group: 'big', ref: 'tid:aa', title: 'One' } });
ctx.planSave({ type: 'upsert', date: '2026-11-21', item: { group: 'big', ref: 'tid:bb', title: 'Two' } });
plan = ctx.planSave({ type: 'upsert', date: '2026-11-21', item: { group: 'next', ref: 'tid:cc', title: 'Three' } });
assert.equal(plan.items.length, 3); assert.equal(tabs.Plan.rows.length, 4); assert.ok(!('ref_' in plan.items[0]));
const big1 = plan.items.find(x => x.ref === 'tid:aa'), next1 = plan.items.find(x => x.ref === 'tid:cc');
plan = ctx.planSave({ type: 'moveup', date: '2026-11-21', doneId: big1.id, upId: next1.id });
assert.equal(tabs.Plan.rows.length, 3); assert.equal(plan.items.filter(x => x.group === 'big').length, 2);
assert.equal(tabs.Plan.rows.find(r => r[4] === 'tid:cc')[2], 'big', 'row handles shift after a delete');
plan = ctx.planSave({ type: 'remove', date: '2026-11-21', id: plan.items[0].id });
assert.equal(plan.items.length, 1);
vm.runInContext("Store.plan.setLink('aa', 'ev@1')", ctx); assert.equal(vm.runInContext("Store.plan.link('aa')", ctx), 'ev@1');
// Backlog: rows as tuples, placed column by index.
assert.equal(ctx.calBacklogList_().length, 0);
vm.runInContext("Store.calBacklog.add([['u1|2026-11-01', '2026-11-01', 'Old task', '11', '0', 's', ''], ['u2|2026-11-02', '2026-11-02', 'Other', '', '', 's', '']])", ctx);
assert.equal(ctx.calBacklogList_().length, 2);
vm.runInContext("Store.calBacklog.setPlaced(0, 'dropped')", ctx);
assert.equal(ctx.calBacklogList_().length, 1); assert.equal(ctx.calBacklogList_()[0].id, 'u2|2026-11-02');
assert.equal(tabs['Cal Backlog'].rows[1][6], 'dropped');
console.log('✓ store-test: Daily plan + Cal Backlog through Store.plan / Store.calBacklog');

// Timer events through Store.timer: append-only, op ids never doubled.
const ev = (op, act) => ({ op, act, date: '2026-11-21', at: Date.parse('2026-11-21T18:00:00Z'), blk: 'b1', value: null });
assert.equal(JSON.stringify(ctx.saveTimerEvents([ev('o1', 'start'), ev('o2', 'pause')]).saved), '["o1","o2"]');
ctx.saveTimerEvents([ev('o2', 'pause'), ev('o3', 'finish')]);
assert.equal(tabs['Timer Log'].rows.length, 4);
assert.equal(ctx.getTimerEvents('2026-11-21').map(e => e.op).join(','), 'o1,o2,o3');
assert.equal(ctx.getTimerEvents('2026-11-22').length, 0);
console.log('✓ store-test: Timer events through Store.timer');

