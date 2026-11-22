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
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValue: () => (rows[r - 1] || [])[c - 1] ?? '',
        setValue: v => { (rows[r - 1] ||= [])[c - 1] = v; },
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
        setValues: vs => vs.forEach((row, i) => row.forEach((v, j) => { (rows[r - 1 + i] ||= [])[c - 1 + j] = v; }))
      }),
      appendRow: row => rows.push(row),
      getLastRow: () => rows.length,
      deleteRows: () => {}
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
vm.runInContext(fs.readFileSync('Code.gs', 'utf8') + '\n' + fs.readFileSync('Store.gs', 'utf8') + '\nthis.Store = Store;', ctx);

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
