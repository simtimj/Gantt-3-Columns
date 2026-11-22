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
// Database backend without a Firebase project fails loudly instead of silently using the Sheet.
vm.runInContext("STORE_BACKEND.kim = 'db'", ctx);
assert.throws(() => ctx.getKim(), /FIREBASE_PROJECT_ is empty/);
vm.runInContext("STORE_BACKEND.ref = 'db'", ctx);
assert.throws(() => vm.runInContext("storeBackend_('ref')", ctx), /not built yet/);
vm.runInContext("STORE_BACKEND.ref = 'sheet'", ctx);
console.log('✓ store-test: Keep In Mind through Store.kim');

// Database step (2026-11-22, NOTES H3): Keep In Mind on Firestore (fake REST), Sheet mirror, lost-edit backups.
{
  const fsDocs = {}, reqs = [];
  const fctx = vm.createContext(Object.assign({}, ctx, {
    ScriptApp: { getOAuthToken: () => 'tok' },
    UrlFetchApp: { fetch(url, o) {
      const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => body ? JSON.stringify(body) : '' });
      if (url.includes('/documents:runQuery')) return res(200, [{ readTime: 'now' }]); // no day docs here (H4 test below)
      const p = decodeURIComponent(url.split('/documents/')[1].split('?')[0]); reqs.push([o.method, p, o.headers]);
      if (o.method === 'get' && p === 'ganttBackup') return res(200, { documents: Object.keys(fsDocs).filter(k => k.startsWith('ganttBackup/')).map(k => ({ name: 'x/' + k, fields: fsDocs[k] })) });
      if (o.method === 'get') return fsDocs[p] ? res(200, { name: 'x/' + p, fields: fsDocs[p] }) : res(404, { error: 1 });
      if (o.method === 'patch') { fsDocs[p] = JSON.parse(o.payload).fields; return res(200, {}); }
      if (o.method === 'delete') { delete fsDocs[p]; return res(200, null); }
    } }
  }));
  for (const k of Object.keys(tabs)) delete tabs[k];
  const src = fs.readFileSync('Store.gs', 'utf8').replace("const FIREBASE_PROJECT_ = '';", "const FIREBASE_PROJECT_ = 'g-test';");
  vm.runInContext(fs.readFileSync('Code.gs', 'utf8') + '\n' + src + '\nthis.Store = Store;', fctx);
  assert.equal(vm.runInContext('STORE_BACKEND.kim', fctx), 'db');
  // Empty database → seeded from the Sheet copy on first read.
  ss.insertSheet('Keep In Mind').rows.push(['h', 'Saved at (ms)'], ['<div>sheet copy</div>', 50]);
  let g2 = fctx.getKim();
  assert.equal(g2.html, '<div>sheet copy</div>'); assert.equal(fsDocs['gantt/kim'].html.stringValue, '<div>sheet copy</div>');
  assert.equal(reqs[0][2]['X-Goog-User-Project'], 'g-test');
  // Save goes to Firestore, not the Sheet; the mirror then copies it to the Sheet with the same saved-at.
  const r2 = fctx.saveKim('<div>db edit</div>', g2.h);
  assert.ok(!r2.conflict); assert.equal(fsDocs['gantt/kim'].html.stringValue, '<div>db edit</div>');
  assert.equal(tabs['Keep In Mind'].rows[1][0], '<div>sheet copy</div>');
  fsDocs['ganttBackup/b1'] = { area: { stringValue: 'kim' }, html: { stringValue: '<div>lost</div>' }, reason: { stringValue: 'older edit lost (newest wins)' }, dev: { stringValue: 'phone-1' } };
  const m = fctx.Store.mirror();
  assert.equal(m.kim, true); assert.equal(m.backups, 1);
  assert.equal(tabs['Keep In Mind'].rows[1][0], '<div>db edit</div>'); assert.equal(tabs['Keep In Mind'].rows[1][1], r2.at);
  assert.equal(tabs.Backup.rows.at(-1)[4], '<div>lost</div>'); assert.match(tabs.Backup.rows.at(-1)[3], /newest wins\) · phone-1/);
  assert.ok(!fsDocs['ganttBackup/b1']);
  assert.equal(fctx.Store.mirror().kim, false); // nothing new
  // Stale base hash still conflicts on the database backend.
  assert.equal(fctx.saveKim('<div>x</div>', 'stale').conflict, true);
  console.log('✓ store-test: Keep In Mind on Firestore + Sheet mirror + lost-edit backups');
}

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
assert.throws(() => ctx.getDayTasks('2026-11-23'), /FIREBASE_PROJECT_ is empty/);
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


// Sheet-first tabs: only the listed ones, anything else must become a Store area.
assert.throws(() => vm.runInContext("Store.sheetFirst('Days')", ctx), /not a Sheet-first tab/);
assert.equal(vm.runInContext("Store.sheetFirst('New Tasks', { create: false })", ctx), null);
assert.ok(vm.runInContext("Store.sheetFirst('Looks')", ctx));
console.log('✓ store-test: Sheet-first tabs only through Store.sheetFirst');

// H4 (2026-11-22): Days on Firestore (fake REST): server writes go to the Sheet and the day doc, PWA edits in the
// doc show on top of the Sheet, the mirror copies them in (lost Sheet copy → Backup), day backups land on their day.
{
  const fsDocs = {};
  const val = v => 'integerValue' in v ? Number(v.integerValue) : 'timestampValue' in v ? Date.parse(v.timestampValue) : v.stringValue;
  const hit = (doc, f) => {
    if (f.compositeFilter) return f.compositeFilter.filters.every(x => hit(doc, x));
    const a = doc[f.fieldFilter.field.fieldPath]; if (!a) return false;
    const x = val(a), y = val(f.fieldFilter.value);
    return { GREATER_THAN: x > y, GREATER_THAN_OR_EQUAL: x >= y, LESS_THAN: x < y, LESS_THAN_OR_EQUAL: x <= y, EQUAL: x === y }[f.fieldFilter.op];
  };
  const dctx = vm.createContext(Object.assign({}, ctx, {
    ScriptApp: { getOAuthToken: () => 'tok' },
    UrlFetchApp: { fetch(url, o) {
      const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => body ? JSON.stringify(body) : '' });
      if (url.includes('/documents:runQuery')) {
        const q = JSON.parse(o.payload).structuredQuery, coll = q.from[0].collectionId + '/';
        return res(200, Object.keys(fsDocs).filter(k => k.startsWith(coll) && hit(fsDocs[k], q.where)).map(k => ({ document: { name: 'x/' + k, fields: fsDocs[k] } })).concat([{ readTime: 'now' }]));
      }
      const [path, qs] = url.split('/documents/')[1].split('?'), p = decodeURIComponent(path);
      if (o.method === 'get' && p === 'ganttBackup') return res(200, { documents: Object.keys(fsDocs).filter(k => k.startsWith('ganttBackup/')).map(k => ({ name: 'x/' + k, fields: fsDocs[k] })) });
      if (o.method === 'get') return fsDocs[p] ? res(200, { name: 'x/' + p, fields: fsDocs[p] }) : res(404, { error: 1 });
      if (o.method === 'patch') {
        const f = JSON.parse(o.payload).fields;
        fsDocs[p] = qs && qs.includes('updateMask') ? Object.assign(fsDocs[p] || {}, f) : f;
        return res(200, {});
      }
      if (o.method === 'delete') { delete fsDocs[p]; return res(200, null); }
    } }
  }));
  for (const k of Object.keys(tabs)) delete tabs[k];
  for (const k of Object.keys(props)) delete props[k];
  const src = fs.readFileSync('Store.gs', 'utf8').replace("const FIREBASE_PROJECT_ = '';", "const FIREBASE_PROJECT_ = 'g-test';");
  vm.runInContext(fs.readFileSync('Code.gs', 'utf8') + '\n' + src + '\nthis.Store = Store;' +
    "\nformatDate_ = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || ''); parseDate_ = v => new Date(v + 'T00:00:00Z');", dctx);
  assert.equal(vm.runInContext('STORE_BACKEND.days', dctx), 'db');
  const H = s => dctx.cellHash_(s), day = d => vm.runInContext("new Date('" + d + "T00:00:00Z')", dctx);
  ss.insertSheet('Days').rows.push(['Date', 'Today', 'Notes', 'Plan', 'Thoughts'], [day('2026-11-21'), '<div>t0</div>', '<div>n0</div>', '', '']);
  const S = () => tabs.Days.rows, doc = d => fsDocs['ganttDays/' + d], str = (d, f) => doc(d)[f] && doc(d)[f].stringValue;
  // Server save: Sheet + only the changed section in the day doc.
  let r = dctx.saveDay('2026-11-21', '<div>t1</div>', '<div>n0</div>', { th: H('<div>t0</div>'), jh: H('<div>n0</div>'), ct: true, cj: false });
  assert.ok(!r.conflictT); assert.equal(S()[1][1], '<div>t1</div>');
  assert.equal(str('2026-11-21', 'tasks'), '<div>t1</div>'); assert.ok(doc('2026-11-21').tasksAt); assert.equal(doc('2026-11-21').journal, undefined);
  assert.equal(str('2026-11-21', 'date'), '2026-11-21'); assert.ok(doc('2026-11-21').up.timestampValue);
  // A PWA edit (Notes) in the doc shows on top of the Sheet everywhere, before the mirror runs.
  const now = Date.now(), up = { timestampValue: new Date(now).toISOString() };
  Object.assign(doc('2026-11-21'), { journal: { stringValue: '<div>pwa</div>' }, journalAt: { integerValue: String(now) }, journalBase: { stringValue: H('<div>n0</div>') }, up: up, dev: { stringValue: 'phone-1' } });
  assert.equal(dctx.Store.days.get('2026-11-21', ['journal']).journal, '<div>pwa</div>');
  assert.equal(dctx.Store.days.range('2026-11-20', '2026-11-22')[0].journal, '<div>pwa</div>');
  assert.equal(dctx.Store.days.all().rows[0][2], '<div>pwa</div>');
  // Stale base hash on the server conflicts against the doc copy.
  r = dctx.saveDay('2026-11-21', '<div>t1</div>', '<div>old</div>', { th: H('<div>t1</div>'), jh: H('<div>n0</div>'), ct: false, cj: true });
  assert.equal(r.conflictJ, true); assert.equal(r.journal, '<div>pwa</div>');
  // A day only in the database (made on the phone) shows up in range and gets a Sheet row from the mirror.
  fsDocs['ganttDays/2026-11-25'] = { date: { stringValue: '2026-11-25' }, at: { integerValue: String(now) }, up: up, plan: { stringValue: '<div>plan</div>' }, planAt: { integerValue: String(now) }, planBase: { stringValue: '' } };
  assert.equal(dctx.Store.days.range('2026-11-24', '2026-11-26')[0].plan, '<div>plan</div>');
  const backups0 = tabs.Backup ? tabs.Backup.rows.length : 1; // + header row when the tab gets made
  fsDocs['ganttBackup/b2'] = { area: { stringValue: 'days' }, date: { stringValue: '2026-11-21' }, field: { stringValue: 'tasks' }, html: { stringValue: '<div>lost</div>' }, reason: { stringValue: 'older edit lost (newest wins)' }, dev: { stringValue: 'pc-1' } };
  let m = dctx.Store.mirror();
  assert.equal(m.days, 2); assert.equal(m.backups, 1);
  assert.equal(S()[1][2], '<div>pwa</div>'); assert.equal(S()[2][3], '<div>plan</div>');
  assert.equal(tabs.Backup.rows.length, backups0 + 1);
  assert.equal(tabs.Backup.rows.at(-1).slice(1, 3).join(), '2026-11-21,Today'); assert.equal(tabs.Backup.rows.at(-1)[4], '<div>lost</div>');
  assert.equal(dctx.Store.mirror().days, 0); // nothing new
  // An edit that didn't start from the Sheet's copy: the Sheet copy goes to Backup before it's replaced.
  S()[1][2] = '<div>sheet only</div>';
  Object.assign(doc('2026-11-21'), { journal: { stringValue: '<div>pwa2</div>' }, journalAt: { integerValue: String(now + 5) }, journalBase: { stringValue: H('<div>pwa</div>') }, up: { timestampValue: new Date(now + 5).toISOString() } });
  m = dctx.Store.mirror();
  assert.equal(m.days, 1); assert.equal(S()[1][2], '<div>pwa2</div>');
  assert.equal(tabs.Backup.rows.at(-1)[4], '<div>sheet only</div>'); assert.match(tabs.Backup.rows.at(-1)[3], /newest wins\) · phone-1/);
  console.log('✓ store-test: Days on Firestore (overlay, per-section saves, mirror, day backups)');
}
