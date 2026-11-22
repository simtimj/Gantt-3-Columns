/* =========================================================
   STORAGE LAYER (2026-11-21, Julius; docs/NOTES.md → "H2. Storage layer")
   Every feature reads and writes its data through Store.<area>, never the Sheet
   or Properties directly. Today every area's backend is the Sheet; later an area
   flips to 'db' (Firestore) with the Sheet kept as a backup mirror, and the
   feature code doesn't change. tools/check.mjs enforces this (ratchet on direct
   calls outside this file, tools/store-baseline.json).

   Record shape: { value, at } — at = saved-at in ms (0 = unknown / never saved),
   used later for "newest edit wins, the other version goes to Backup".
   ========================================================= */
const STORE_BACKEND = {
  kim: 'sheet'
  // days, ref, plan, calBacklog, timer, props, study, logs: still direct, moving in this order
};

function storeBackend_(area) {
  const b = STORE_BACKEND[area] || 'sheet';
  if (b !== 'sheet') throw new Error('Store: backend "' + b + '" for ' + area + ' is not built yet');
  return b;
}

// One script lock around a read-check-write, same as the old per-feature locks.
function storeLocked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

const Store = {
  /* Keep In Mind — one shared list. Sheet: tab "Keep In Mind", A2 = HTML, B2 = saved-at ms. */
  kim: {
    SHEET: 'Keep In Mind',
    sheet_() {
      storeBackend_('kim');
      const sh = getOrCreateSheet_(this.SHEET, ['Keep In Mind (shared list, HTML) — edited in the app', 'Saved at (ms)']);
      if (!sh.getRange(1, 2).getValue()) sh.getRange(1, 2).setValue('Saved at (ms)');
      return sh;
    },
    read() {
      const row = this.sheet_().getRange(2, 1, 1, 2).getValues()[0];
      return { value: String(row[0] || ''), at: Number(row[1]) || 0 };
    },
    write(html) {
      const at = Date.now();
      this.sheet_().getRange(2, 1, 1, 2).setValues([[String(html || ''), at]]);
      return { value: String(html || ''), at: at };
    },
    // First-copy flag: false until the list has been saved once.
    migrated() { return PropertiesService.getScriptProperties().getProperty('kimMigrated') === '1'; },
    setMigrated() { PropertiesService.getScriptProperties().setProperty('kimMigrated', '1'); },
    backup(reason, html) { backupCell_(this.SHEET, 'A2', reason, html); }
  },

  locked: storeLocked_
};
