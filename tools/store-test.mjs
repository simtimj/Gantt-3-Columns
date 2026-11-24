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
  PropertiesService: (() => { const sv = pre => ({ getProperty: k => props[pre + k] ?? null, setProperty: (k, v) => { props[pre + k] = v; },
    setProperties: o => { Object.keys(o).forEach(k => { props[pre + k] = o[k]; }); }, getProperties: () => Object.fromEntries(Object.keys(props).filter(k => k.startsWith(pre)).map(k => [k.slice(pre.length), props[k]])) });
    return { getScriptProperties: () => sv(''), getUserProperties: () => sv('u:') }; })(),
  CacheService: { getScriptCache: () => ({ get: k => (k === 'appBuild' ? 'b1' : null), put: () => {} }) },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Session: { getScriptTimeZone: () => 'America/Los_Angeles' },
  Utilities: { DigestAlgorithm: { MD5: 'MD5' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: (_, t) => [...crypto.createHash('md5').update(t, 'utf8').digest()].map(x => (x > 127 ? x - 256 : x)) }
});
vm.runInContext(fs.readFileSync('Code.gs', 'utf8') + '\n' + fs.readFileSync('Store.gs', 'utf8').replace(/const FIREBASE_PROJECT_ = '[^']*';/, "const FIREBASE_PROJECT_ = '';") + '\n' + fs.readFileSync('Timer.gs', 'utf8') + '\nthis.Store = Store;', ctx);

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
vm.runInContext("STORE_BACKEND.calBacklog = 'db'", ctx);
assert.throws(() => vm.runInContext("storeBackend_('calBacklog')", ctx), /not built yet/);
vm.runInContext("STORE_BACKEND.calBacklog = 'sheet'", ctx);
console.log('✓ store-test: Keep In Mind through Store.kim');

// Database step (2026-11-22, NOTES H3): Keep In Mind on Firestore (fake REST), Sheet mirror, lost-edit backups.
{
  const fsDocs = {}, reqs = [];
  const fctx = vm.createContext(Object.assign({}, ctx, {
    ScriptApp: { getOAuthToken: () => 'tok' },
    UrlFetchApp: { fetchAll(list) { return list.map(x => this.fetch(x.url, x)); }, fetch(url, o) { o = Object.assign({ method: 'get' }, o);
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
  const src = fs.readFileSync('Store.gs', 'utf8').replace(/const FIREBASE_PROJECT_ = '[^']*';/, "const FIREBASE_PROJECT_ = 'g-test';");
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
assert.throws(() => ctx.getReference_(), /FIREBASE_PROJECT_ is empty/);
vm.runInContext("STORE_BACKEND.ref = 'sheet'", ctx);
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
    UrlFetchApp: { fetchAll(list) { return list.map(x => this.fetch(x.url, x)); }, fetch(url, o) { o = Object.assign({ method: 'get' }, o);
      const res = (code, body) => ({ getResponseCode: () => code, getContentText: () => body ? JSON.stringify(body) : '' });
      if (url.includes('/documents:runQuery')) {
        const q = JSON.parse(o.payload).structuredQuery, coll = q.from[0].collectionId + '/';
        return res(200, Object.keys(fsDocs).filter(k => k.startsWith(coll) && hit(fsDocs[k], q.where)).map(k => ({ document: { name: 'x/' + k, fields: fsDocs[k] } })).concat([{ readTime: 'now' }]));
      }
      const [path, qs] = url.split('/documents/')[1].split('?'), p = decodeURIComponent(path);
      if (o.method === 'get' && !p.includes('/')) return res(200, { documents: Object.keys(fsDocs).filter(k => k.startsWith(p + '/')).map(k => ({ name: 'x/' + k, fields: fsDocs[k] })) });
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
  const src = fs.readFileSync('Store.gs', 'utf8').replace(/const FIREBASE_PROJECT_ = '[^']*';/, "const FIREBASE_PROJECT_ = 'g-test';");
  vm.runInContext(fs.readFileSync('Code.gs', 'utf8') + '\n' + src + '\nthis.Store = Store;' +
    "\nformatDate_ = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || ''); parseDate_ = v => new Date(v + 'T00:00:00Z');", dctx);
  assert.equal(vm.runInContext('STORE_BACKEND.days', dctx), 'db');
  const H = s => dctx.cellHash_(s), day = d => vm.runInContext("new Date('" + d + "T00:00:00Z')", dctx);
  ss.insertSheet('Days').rows.push(['Date', 'Today', 'Notes', 'Plan', 'Thoughts'], [day('2026-11-21'), '<div>t0</div>', '<div>n0</div>', '', ''],
    [day('2026-11-10'), '<div>old day</div>', '', '', '<div>tho</div>'], [day('2026-11-11'), '', '', '', '']);
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
  assert.equal(S()[1][2], '<div>pwa</div>'); assert.equal(S().at(-1)[3], '<div>plan</div>');
  // H5 D: the first mirror seeds the full history — a day with text gets a doc (sections at 1, up 1970, so the mirror
  // skips it), an empty day gets none, sections a doc already had are kept, and gantt/daysMeta tells the PWA.
  assert.equal(str('2026-11-10', 'tasks'), '<div>old day</div>'); assert.equal(str('2026-11-10', 'tho'), '<div>tho</div>');
  assert.equal(doc('2026-11-10').tasksAt.integerValue, '1'); assert.equal(Date.parse(doc('2026-11-10').up.timestampValue), 1000);
  assert.equal(doc('2026-11-11'), undefined);
  assert.equal(str('2026-11-21', 'journal'), '<div>pwa</div>'); assert.equal(doc('2026-11-21').planAt.integerValue, '1');
  const meta = fsDocs['gantt/daysMeta'];
  assert.equal(meta.first.stringValue, '2026-11-10'); assert.equal(meta.days.integerValue, '3'); assert.ok(Number(meta.seeded.integerValue) > 0);
  assert.equal(props.daysSeeded, '1');
  assert.equal(tabs.Backup.rows.length, backups0 + 1);
  assert.equal(tabs.Backup.rows.at(-1).slice(1, 3).join(), '2026-11-21,Today'); assert.equal(tabs.Backup.rows.at(-1)[4], '<div>lost</div>');
  assert.equal(dctx.Store.mirror().days, 0); // nothing new
  // An edit that didn't start from the Sheet's copy: the Sheet copy goes to Backup before it's replaced.
  S()[1][2] = '<div>sheet only</div>';
  Object.assign(doc('2026-11-21'), { journal: { stringValue: '<div>pwa2</div>' }, journalAt: { integerValue: String(now + 5) }, journalBase: { stringValue: H('<div>pwa</div>') }, up: { timestampValue: new Date(now + 5).toISOString() } });
  m = dctx.Store.mirror();
  assert.equal(m.days, 1); assert.equal(S()[1][2], '<div>pwa2</div>');
  assert.equal(tabs.Backup.rows.at(-1)[4], '<div>sheet only</div>'); assert.match(tabs.Backup.rows.at(-1)[3], /newest wins\) · phone-1/);
  console.log('✓ store-test: Days on Firestore (overlay, per-section saves, mirror, day backups, full-history seed)');

  // H5 C (2026-11-23): Reference + Archive on Firestore. Seeded once from both tabs; server saves go to the Sheet and
  // the card doc; PWA edits / new cards / deletes / restores in the docs show on top, and the mirror copies them in.
  {
    const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
    delete props.refSeeded; delete props.refMirrorAt;
    tabs.Reference.rows.length = 1; tabs.Archive.rows.length = 1;
    tabs.Reference.rows.push(['c1', '', 'item', 'One', '<p>one</p>', true, 1], ['c2', 'c1', 'item', 'Two', '<p>two</p>', true, 2]);
    tabs.Archive.rows.push(['a1', '', 'item', 'Old', '<p>old</p>', true, 3, '2026-11-01T00:00:00.000Z']);
    const R = () => tabs.Reference.rows, rd = id => fsDocs['ganttRef/' + id], rs = (id, f) => rd(id)[f] && (rd(id)[f].stringValue ?? Number(rd(id)[f].integerValue));
    let list = dctx.getReference_();
    same(list.map(r => r.id), ['c1', 'c2']);
    assert.equal(rs('c1', 'content'), '<p>one</p>'); assert.equal(rs('a1', 'del'), '2026-11-01T00:00:00.000Z'); assert.equal(props.refSeeded, '1');
    assert.ok(fsDocs['gantt/refMeta']);
    // Server save: Sheet + doc.
    const r1 = dctx.saveReferenceItem({ id: 'c1', fwSync: true, content: '<p>one b</p>', contentChanged: true, baseHash: H('<p>one</p>') });
    assert.ok(!r1.conflict); assert.equal(R()[1][4], '<p>one b</p>'); assert.equal(rs('c1', 'content'), '<p>one b</p>'); assert.equal(rs('c1', 'ch'), H('<p>one b</p>'));
    // PWA edits straight in the docs: content of c2, a new card c3, c1's subtree deleted later.
    const t = Date.now() + 1000, up = { timestampValue: new Date(t).toISOString() }, S = v => ({ stringValue: v }), I = v => ({ integerValue: String(v) });
    Object.assign(rd('c2'), { content: S('<p>two pwa</p>'), base: S(H('<p>two</p>')), at: I(t), up: up, dev: S('phone-1') });
    fsDocs['ganttRef/c3'] = { id: S('c3'), parentId: S(''), type: S('item'), title: S('Three'), content: S('<p>3</p>'), expanded: I(1), sort: I(9), del: S(''), at: I(t), up: up };
    list = dctx.getReference_();
    assert.equal(list.find(r => r.id === 'c2').content, '<p>two pwa</p>'); assert.ok(list.some(r => r.id === 'c3'));
    // Stale server save against the doc copy conflicts.
    assert.equal(dctx.saveReferenceItem({ id: 'c2', fwSync: true, content: '<p>x</p>', contentChanged: true, baseHash: H('<p>two</p>') }).conflict, true);
    let m = dctx.Store.mirror();
    assert.equal(m.ref >= 2, true); assert.equal(R().find(r => r[0] === 'c2')[4], '<p>two pwa</p>'); assert.ok(R().some(r => r[0] === 'c3'));
    // PWA delete (c1 + child c2) and restore of a1.
    const t2 = t + 1000, up2 = { timestampValue: new Date(t2).toISOString() }, del = '2026-11-23T10:00:00.000Z';
    ['c1', 'c2'].forEach(id => Object.assign(rd(id), { del: S(del), at: I(t2), up: up2 }));
    Object.assign(rd('a1'), { del: S(''), at: I(t2), up: up2 });
    same(dctx.getReference_().map(r => r.id).sort(), ['a1', 'c3']);
    same(dctx.getArchive().map(x => x.id), ['c1']); assert.equal(dctx.getArchive()[0].children, 1);
    m = dctx.Store.mirror();
    same(R().slice(1).map(r => r[0]).sort(), ['a1', 'c3']);
    same(tabs.Archive.rows.slice(1).map(r => r[0] + '|' + r[7]).sort(), ['c1|' + del, 'c2|' + del]);
    assert.equal(dctx.Store.mirror().ref, 0);
    // Server delete + restore keep Sheet and docs together.
    dctx.deleteReferenceItem('c3');
    assert.ok(rs('c3', 'del')); assert.ok(!R().some(r => r[0] === 'c3'));
    const a = dctx.getArchive().find(x => x.id === 'c3');
    dctx.restoreArchivedItem('c3', a.deletedAt);
    assert.equal(rs('c3', 'del'), ''); assert.ok(R().some(r => r[0] === 'c3'));
    console.log('✓ store-test: Reference + Archive on Firestore (seed, overlay, saves, PWA delete/restore, mirror)');
  }
  // App settings on Firestore (H5 F): pins, card categories, Fun… = property + gantt/kv_<key>; newer doc wins.
  {
    const P = {}, svc = pre => ({ getProperty: k => P[pre + k] ?? null, getProperties: () => Object.fromEntries(Object.keys(P).filter(k => k.startsWith(pre)).map(k => [k.slice(pre.length), P[k]])),
      setProperty: (k, v) => { P[pre + k] = String(v); }, setProperties: o => { Object.keys(o).forEach(k => { P[pre + k] = String(o[k]); }); }, deleteProperty: k => { delete P[pre + k]; } });
    dctx.PropertiesService = { getScriptProperties: () => svc(''), getUserProperties: () => svc('u:') };
    Object.keys(fsDocs).filter(k => /^gantt\/kv/.test(k)).forEach(k => delete fsDocs[k]); // earlier mirrors seeded empty ones
    P.refPinned = '["a"]'; P.funData = '{"v":1,"items":[{"id":"f1","t":"Hike","u":5}],"cats":[]}';
    const kv = () => vm.runInContext('Store.kv', dctx), fresh = () => { kv().docs__ = null; };
    kv().mirror();
    assert.equal(fsDocs['gantt/kv_refPinned'].v.stringValue, '["a"]'); assert.ok(fsDocs['gantt/kvMeta'].seeded); assert.equal(P.kvSeeded, '1');
    assert.equal(fsDocs['gantt/kv_cardCats'].v.stringValue, '');
    // Server write → property + doc.
    fresh(); dctx.setReferencePin('b', true);
    assert.deepEqual(JSON.parse(fsDocs['gantt/kv_refPinned'].v.stringValue), ['b', 'a']); assert.deepEqual(JSON.parse(P.refPinned), ['b', 'a']);
    // PWA edit (newer doc) → the server reads it and copies it in.
    fsDocs['gantt/kv_funData'] = { key: { stringValue: 'funData' }, v: { stringValue: '{"v":1,"items":[{"id":"f2","t":"Swim","u":9}],"cats":[]}' }, at: { integerValue: String(Date.now() + 5000) }, dev: { stringValue: 'phone-1' } };
    fresh(); const fun = dctx.getFun();
    assert.equal(fun.items[0].id, 'f2'); assert.match(P.funData, /Swim/);
    fresh(); const merged = dctx.saveFun({ items: [{ id: 'f3', t: 'Read', u: 10 }] });
    assert.equal(merged.items.map(i => i.id).sort().join(), 'f2,f3'); assert.match(fsDocs['gantt/kv_funData'].v.stringValue, /Read/);
    // Card categories live in user properties.
    fresh(); dctx.inboxWrite_('cardCats', [{ key: 'code', name: 'Code', color: '#111111', words: '' }]);
    assert.match(P['u:cardCats'], /Code/); assert.match(fsDocs['gantt/kv_cardCats'].v.stringValue, /Code/);
    fresh(); dctx.setArchiveAuto(true); assert.equal(fsDocs['gantt/kv_archiveAuto'].v.stringValue, '1');
    console.log('✓ store-test: app settings on Firestore (seed, server writes, newer PWA doc wins, Fun merge)');
  }
  // Calendar copy (H5 B2): month docs + meta, only changed months rewritten, color urgency flagged (uc).
  {
    dctx.LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }), getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
    let evs = [
      { id: 'a|1', eventId: 'a', startMs: 1, calId: 'main', cal: 'Main', title: 'Dentist', allDay: false, start: '2026-11-23T09:00:00-08:00', end: '2026-11-23T10:00:00-08:00', colorId: '11', editable: true, recurring: false },
      { id: 'b|2', eventId: 'b', startMs: 2, calId: 'main', cal: 'Main', title: 'Trip', allDay: true, start: '2026-11-29', end: '2026-12-03', colorId: '', editable: true, recurring: false }];
    vm.runInContext("todayString_ = () => '2026-11-23'; calPanelRead_ = () => ({ events: JSON.parse(globalThis.__evs), calendars: [{ id: 'main', name: 'Main', color: '#fff' }], failed: [], via: 'api' });", dctx);
    dctx.__evs = JSON.stringify(evs);
    const w = vm.runInContext('calCopyWindow_()', dctx);
    assert.equal(w.from, '2026-11-01'); assert.equal(w.to, '2027-03-01'); assert.deepEqual(Array.from(w.months), ['2026-11', '2026-12', '2027-01', '2027-02']);
    let r = dctx.calSyncNow();
    assert.equal(r.months, 4); assert.equal(r.written, 4, JSON.stringify(r));
    const ev = m => JSON.parse(fsDocs['ganttCal/' + m].ev.stringValue);
    assert.deepEqual(ev('2026-11').map(e => e.title), ['Dentist', 'Trip']); assert.deepEqual(ev('2026-12').map(e => e.title), ['Trip']);
    assert.equal(ev('2026-11')[0].urg, '1'); assert.equal(ev('2026-11')[0].uc, 1);
    const meta = fsDocs['ganttCal/meta'];
    assert.equal(meta.from.stringValue, '2026-11-01'); assert.equal(JSON.parse(meta.months.stringValue).length, 4); assert.equal(meta.v.integerValue, '1');
    // Nothing changed → only meta written; one event moved → only its month.
    r = dctx.calSyncNow(); assert.equal(r.written, 0);
    evs[0].title = 'Dentist 2'; dctx.__evs = JSON.stringify(evs);
    r = dctx.calSyncNow(); assert.equal(r.written, 1); assert.equal(ev('2026-11')[0].title, 'Dentist 2');
    console.log('✓ store-test: calendar copy on Firestore (window, month docs, only changed months, color urgency flag)');
  }

  // D2 (2026-11-23): Focus doc, Inbox docs, Plan docs + Cal Backlog doc; seeds, server paths on the docs, mirror back.
  {
    const P = {}, svc = pre => ({ getProperty: k => P[pre + k] ?? null, getProperties: () => Object.fromEntries(Object.keys(P).filter(k => k.startsWith(pre)).map(k => [k.slice(pre.length), P[k]])),
      setProperty: (k, v) => { P[pre + k] = String(v); }, setProperties: o => { Object.keys(o).forEach(k => { P[pre + k] = String(o[k]); }); }, deleteProperty: k => { delete P[pre + k]; } });
    dctx.PropertiesService = { getScriptProperties: () => svc(''), getUserProperties: () => svc('u:') };
    dctx.LockService = { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }), getUserLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) };
    Object.keys(fsDocs).filter(k => /^(ganttFocus|ganttInbox|ganttPlan)\//.test(k) || /^gantt\/(inboxMeta|planMeta|calBacklog)$/.test(k)).forEach(k => delete fsDocs[k]);
    const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);
    const S = v => ({ stringValue: v }), I = v => ({ integerValue: String(v) });
    vm.runInContext("todayString_ = () => '2026-11-23'; Utilities.getUuid = () => 'g' + Math.random().toString(36).slice(2); EVENT_CALENDARS[0] = 'main';", dctx);
    // ---- Focus: seed from the properties, read the doc, server save writes both, newer app doc → properties.
    dctx.writeFocusProps_({ v: 1, cats: [{ id: 'c1', name: 'Work', items: [{ id: 'i1', t: 'One' }] }] });
    assert.equal(dctx.focusMirror_(), 'seeded');
    assert.equal(fsDocs['ganttFocus/main'].at.integerValue, '1');
    assert.equal(dctx.getFocus().cats[0].name, 'Work');
    const base = dctx.getFocus(), mine = JSON.parse(JSON.stringify(base)); mine.cats[0].items.push({ id: 'i2', t: 'Two' });
    const saved = dctx.saveFocus(mine, { base });
    assert.equal(saved.data.cats[0].items.length, 2);
    assert.equal(JSON.parse(fsDocs['ganttFocus/main'].v.stringValue).cats[0].items.length, 2);
    assert.equal(fsDocs['ganttFocus/main'].base.integerValue, '1', 'server write records the version it merged against');
    assert.equal(dctx.readFocusProps_().cats[0].items.length, 2);
    // The app saves a newer copy → the trigger copies it into the properties.
    const appAt = Number(fsDocs['ganttFocus/main'].at.integerValue) + 10;
    fsDocs['ganttFocus/main'] = { v: S(JSON.stringify({ v: 1, cats: [{ id: 'c1', name: 'Work (phone)', items: [] }] })), at: I(appAt), base: I(appAt - 10) };
    assert.equal(dctx.focusMirror_(), 1); assert.equal(dctx.readFocusProps_().cats[0].name, 'Work (phone)'); assert.equal(dctx.focusMirror_(), 0);
    // Same merge on the device: Code.gs mergeFocus_ and the shim's mergeFocus agree on many random edits.
    const shim = fs.readFileSync('tools/pwa/shim.js.txt', 'utf8'), body = shim.slice(shim.indexOf('/* mergeFocus:start */'), shim.indexOf('/* mergeFocus:end */'));
    const devMerge = new Function(body + '; return mergeFocus;')();
    let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    const edit = l => { l = JSON.parse(JSON.stringify(l)); for (let k = rnd(4); k >= 0; k--) { const c = l.cats[rnd(l.cats.length)], op = rnd(5);
      if (op === 0) c.items.push({ id: 'n' + rnd(1e6), t: 'x' + rnd(9) }); else if (op === 1 && c.items.length) c.items.splice(rnd(c.items.length), 1);
      else if (op === 2 && c.items.length) c.items[rnd(c.items.length)].t = 'e' + rnd(9); else if (op === 3) c.items.reverse(); else { c.name = 'n' + rnd(9); c.u = rnd(50); } } return l; };
    for (let i = 0; i < 300; i++) {
      const b = { v: 1, cats: [0, 1, 2].map(j => ({ id: 'c' + j, name: 'C' + j, items: [0, 1, 2, 3].map(x => ({ id: 'i' + j + x, t: 't' + x })) })) };
      const m = edit(b), t = edit(b);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(devMerge(b, m, t))), JSON.parse(JSON.stringify(dctx.mergeFocus_(b, m, t))), 'merge differs on case ' + i);
    }
    // ---- Inbox: seed from properties + inbox.js, same answers, server edits on the docs, new Claude item, properties rebuilt.
    dctx.CLAUDE_INBOX = [{ id: 'ai1', title: 'From Claude', added: '2026-11-20' }, { id: 'ai2', title: 'Dismissed one' }];
    P['u:inboxItems'] = JSON.stringify([{ id: 'a100', title: 'Mine', details: 'd', added: '2026-11-21' }]);
    P['u:inboxDone'] = '["ai2"]'; P['u:inboxOver'] = '{"ai1":{"title":"From Claude (edited)"}}';
    const before = JSON.stringify(dctx.getInbox());
    vm.runInContext('Store.inbox.mirror()', dctx);
    assert.equal(P.inboxSeeded, '1'); assert.equal(fsDocs['ganttInbox/ai2'].gone.integerValue, '1');
    assert.equal(JSON.stringify(dctx.getInbox()), before, 'same Inbox before and after the move');
    let inb = dctx.addInboxItem('New', '');
    eq(inb.map(x => x.title), ['From Claude (edited)', 'Mine', 'New']);
    inb = dctx.updateInboxItem('a100', { done: true, title: 'Mine!' });
    assert.equal(inb[1].done, true); assert.equal(inb[1].title, 'Mine!');
    inb = dctx.dismissInboxItem('ai1'); eq(inb.map(x => x.id).slice(0, 1), ['a100']);
    dctx.CLAUDE_INBOX.push({ id: 'ai3', title: 'Fresh from Claude' });
    assert.equal(dctx.getInbox()[0].id, 'ai3', 'new inbox.js item shows before the trigger copies it');
    assert.equal(fsDocs['ganttInbox/ai3'], undefined);
    vm.runInContext('Store.inbox.mirror()', dctx);
    assert.equal(fsDocs['ganttInbox/ai3'].from.stringValue, 'claude');
    eq(JSON.parse(P['u:inboxItems']).map(x => x.title), ['Mine!', 'New']); assert.equal(JSON.parse(P['u:inboxItems'])[0].done, true);
    eq(JSON.parse(P['u:inboxDone']).sort(), ['ai1', 'ai2']);
    // Updating a Claude item the trigger hasn't copied yet creates its doc.
    dctx.CLAUDE_INBOX.push({ id: 'ai4', title: 'Later' });
    dctx.updateInboxItem('ai4', { arch: 'x' }); assert.equal(fsDocs['ganttInbox/ai4'].title.stringValue, 'Later'); assert.equal(fsDocs['ganttInbox/ai4'].arch.stringValue, 'x');
    // ---- Plan: seed from the Plan tab, planSave on the docs, mirror rewrites the tab, event info cached.
    const ptab = ss.insertSheet('Plan'); ptab.rows.push(['Id', 'Date', 'Group', 'Rank', 'Ref', 'Title', 'Target', 'Event', 'Updated'], ['p1', '', 'big', '1', 'tid:aa', 'One', '', 'ev1@100', '']);
    vm.runInContext("planEventInfo_ = s => ({ eventId: s.split('@')[0], startMs: 100, title: 'Ev', done: false, date: '2026-11-23', allDay: true, recurring: false, time: '' });", dctx);
    let plan = dctx.getPlan('2026-11-23');
    assert.equal(P.planSeeded, '1'); assert.equal(fsDocs['ganttPlan/p1'].ref.stringValue, 'tid:aa'); assert.equal(plan.items[0].title, 'One');
    plan = dctx.planSave({ type: 'upsert', date: '2026-11-23', item: { group: 'next', ref: 'tid:bb', title: 'Two' } });
    eq(plan.items.map(x => x.title).sort(), ['One', 'Two']);
    const two = plan.items.find(x => x.title === 'Two');
    plan = dctx.planSave({ type: 'moveup', date: '2026-11-23', doneId: 'p1', upId: two.id });
    eq(plan.items.map(x => x.group + ':' + x.title), ['big:Two']); assert.equal(fsDocs['ganttPlan/p1'].del.integerValue, '1');
    assert.throws(() => dctx.planSave({ type: 'target', date: '2026-11-23', id: 'nope', target: 'x' }), /not found/);
    vm.runInContext('Store.plan.mirror()', dctx);
    eq(ptab.rows.slice(1).filter(r => r[0]).map(r => r[2] + ':' + r[5]), ['big:Two']);
    assert.equal(dctx.planEvRefresh_().written, 0); // Two has no event
    dctx.planSave({ type: 'upsert', date: '2026-11-23', item: { group: 'next', ref: 'tid:cc', title: 'Three', event: 'ev9@5' } });
    assert.equal(dctx.planEvRefresh_().written, 1); assert.equal(dctx.planEvRefresh_().written, 0);
    assert.equal(JSON.parse(Object.values(fsDocs).find(d => d.ref && d.ref.stringValue === 'tid:cc').ev.stringValue).eventId, 'ev9');
    // ---- Cal Backlog: a change publishes gantt/calBacklog; the trigger republishes after 15 min.
    dctx.Store.calBacklog.add([['u1|2026-11-01', '2026-11-01', 'Old task', '11', '0', 's', '']]);
    dctx.calBacklogPublishIfDirty_();
    eq(JSON.parse(fsDocs['gantt/calBacklog'].items.stringValue).map(x => x.title), ['Old task']);
    assert.equal(vm.runInContext('Store.calBacklog.dirty', dctx), false);
    vm.runInContext("calBacklogSweep_ = () => ({ swept: 2 }); calBacklogRoll_ = () => {};", dctx);
    const tick = dctx.calBacklogTick_();
    assert.equal(tick.swept, 2); assert.equal(JSON.parse(fsDocs['gantt/calBacklog'].sweep.stringValue).swept, 2);
    console.log('✓ store-test: Focus / Inbox / Plan + Cal Backlog on Firestore (seeds, server saves, device merge = server merge, mirror back, event cache, backlog publish)');
  }

  // H5 B (2026-11-23): Block timer events in the day docs (map tmr.<op>), seed, read merge, mirror; Cal Events list doc.
  {
    const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);
    const tday = new Date().toISOString().slice(0, 10);
    vm.runInContext(fs.readFileSync('Timer.gs', 'utf8'), dctx);
    vm.runInContext("Utilities.formatDate = (d, tz, f) => f === 'yyyy-MM-dd' ? new Date(d).toISOString().slice(0, 10) : new Date(d).toISOString().slice(0, 16).replace('T', ' ');", dctx);
    const tl = ss.getSheetByName('Timer Log') || ss.insertSheet('Timer Log');
    tl.rows.length = 0; tl.rows.push(['Op', 'Date', 'At', 'Action', 'Block', 'Item', 'Name', 'Value', 'Device'],
      ['o1', tday, new Date().toISOString(), 'start', 'b1', '', '', '', 'pc'], ['old', '2020-01-01', '2020-01-01T10:00:00Z', 'start', 'b0', '', '', '', 'pc']);
    vm.runInContext('Store.timer.mirror()', dctx);
    assert.equal(dctx.PropertiesService.getScriptProperties().getProperty('timerSeeded'), '1');
    const tdoc = () => fsDocs['ganttDays/' + tday];
    assert.ok(tdoc() && tdoc().tmr && tdoc().tmr.mapValue.fields.o1, 'seeded event in the day doc');
    assert.equal(Object.keys(fsDocs).filter(k => k === 'ganttDays/2020-01-01').length, 0, 'only the last 30 days seeded');
    // The app adds an event straight to the doc → read merges it; the trigger copies it into the tab once.
    tdoc().tmr.mapValue.fields.o2 = { stringValue: JSON.stringify({ op: 'o2', date: tday, at: Date.now(), act: 'pause', blk: 'b1', item: '', name: '', value: null, dev: 'phone' }) };
    eq(dctx.getTimerEvents(tday).map(e => e.op), ['o1', 'o2']);
    vm.runInContext('Store.timer.mirror()', dctx); vm.runInContext('Store.timer.mirror()', dctx);
    eq(tl.rows.slice(1).map(r => r[0]), ['o1', 'old', 'o2']);
    // Server save (old page) → tab + day doc; a day with no doc gets one (date + at).
    dctx.saveTimerEvents([{ op: 'o3', act: 'finish', date: '2026-12-30', at: Date.now(), blk: 'b9' }]);
    assert.ok(fsDocs['ganttDays/2026-12-30'].tmr.mapValue.fields.o3); assert.equal(fsDocs['ganttDays/2026-12-30'].date.stringValue, '2026-12-30');
    assert.equal(fsDocs['ganttDays/2026-12-30'].at.integerValue, '0');
    eq(dctx.getTimerEvents('2026-12-30').map(e => e.op), ['o3'], 'no double from tab + doc');
    // Cal Events list published with the calendar copy, after the month docs.
    vm.runInContext("getCalendarEvents = () => ({ today: '2026-11-23', events: [{ id: 'x', title: 'Dentist' }], archive: { ready: 0, auto: false } });", dctx);
    dctx.calSyncNow();
    const ce = fsDocs['gantt/calEvents'];
    assert.equal(JSON.parse(ce.json.stringValue).events[0].title, 'Dentist'); assert.equal(ce.today.stringValue, '2026-11-23');
    assert.ok(Number(ce.at.integerValue) >= Number(fsDocs['ganttCal/meta'].at.integerValue), 'list stamped after the copy');
    console.log('✓ store-test: timer events in day docs (seed 30 days, read merge, mirror, server save) + Cal Events list doc');
  }
}
