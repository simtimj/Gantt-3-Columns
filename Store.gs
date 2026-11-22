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
  kim: 'sheet',
  days: 'sheet',
  ref: 'sheet',
  archive: 'sheet',
  plan: 'sheet',
  calBacklog: 'sheet'
  // calBacklog, timer, props, study, logs: still direct, moving in this order
};

function storeBackend_(area) {
  const b = STORE_BACKEND[area] || 'sheet';
  if (b !== 'sheet') throw new Error('Store: backend "' + b + '" for ' + area + ' is not built yet');
  return b;
}

// One script lock around a read-check-write, same as the old per-feature locks.
function storeLocked_(fn, ms) {
  const lock = LockService.getScriptLock();
  lock.waitLock(ms || 20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* Days fields. A day = { date: 'YYYY-MM-DD', tasks (Today), journal (Notes), plan (Plan pad), tho (Thoughts /
   Scratch pad) }. get() returns { exists, <fields>, ref_ }; pass that record back to set() so the Sheet backend
   skips a second date lookup (ref_ is opaque: a row number now, a doc id later). */
const STORE_DAY_COLS_ = { tasks: 2, journal: 3, plan: 4, tho: 5 };
const STORE_DAY_HEAD_ = { 4: 'Plan', 5: 'Thoughts' };

const STORE_REF_COLS_ = { id: 1, parentId: 2, type: 3, title: 4, content: 5, expanded: 6, sort: 7 };

// Write [[col, value], …] into one row; contiguous columns go in one call.
function storeWriteCols_(sh, row, pairs) {
  pairs = pairs.slice().sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < pairs.length;) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[j][0] + 1) j++;
    const run = pairs.slice(i, j + 1);
    if (run.length === 1) sh.getRange(row, run[0][0]).setValue(run[0][1]);
    else sh.getRange(row, run[0][0], 1, run.length).setValues([run.map(p => p[1])]);
    i = j + 1;
  }
}

const Store = {
  /* Days — one row per date. Sheet: tab "Days", A date, B Today, C Notes, D Plan, E Thoughts/Scratch. */
  days: {
    sheet_(timer) {
      storeBackend_('days');
      return getOrCreateSheet_('Days', DAYS_HEADERS, timer);
    },
    ensureCol_(sh, col) {
      if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
      if (!sh.getRange(1, col).getValue()) sh.getRange(1, col).setValue(STORE_DAY_HEAD_[col] || '');
    },
    cols_(fields) {
      return fields.map(f => {
        const c = STORE_DAY_COLS_[f];
        if (!c) throw new Error('Store.days: unknown field ' + f);
        return c;
      });
    },
    // Every day as tuples [date, tasks, journal, plan?, tho?] (width 3–5), read once; row i ↔ handle { ref_: base + i }.
    all() {
      const sheet = this.sheet_();
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return { width: 3, rows: [], base: 2 };
      const mc = sheet.getMaxColumns();
      const width = mc >= 5 ? 5 : mc >= 4 ? 4 : 3;
      return { width: width, rows: sheet.getRange(2, 1, lastRow - 1, width).getValues(), base: 2 };
    },
    // Days with startDate <= date <= endDate, as { date, tasks, journal, plan, tho }, sorted by date.
    // Reads the date column, then only the matching rows in contiguous runs.
    range(startDate, endDate, timer) {
      const sheet = speedPart_(timer, 'schedule.lookup', () => this.sheet_(timer));
      const lastRow = speedPart_(timer, 'schedule.bounds', () => sheet.getLastRow());
      if (lastRow < 2) return [];
      const dates = speedPart_(timer, 'schedule.datesRead', () => sheet.getRange(2, 1, lastRow - 1, 1).getValues());
      const lo = parseDate_(startDate).getTime() - DAY_MS;
      const hi = parseDate_(endDate).getTime() + DAY_MS;
      const matches = [];
      speedPart_(timer, 'schedule.dateScan', () => {
        for (let i = 0; i < dates.length; i++) {
          const value = dates[i][0];
          if (!value) continue;
          // Skip far-away dates without the slower formatting call.
          if (isDate_(value)) {
            const time = value.getTime();
            if (time < lo || time > hi) continue;
          }
          const key = formatDate_(value);
          if (key && key >= startDate && key <= endDate) matches.push({ row: i + 2, date: key });
        }
      });
      if (!matches.length) return [];
      // Contiguous runs, so rows appended at the bottom don't pull in the whole sheet.
      matches.sort((a, b) => a.row - b.row);
      const runs = [];
      let run = null;
      matches.forEach(match => {
        if (run && match.row - run.end <= 20) { run.end = match.row; run.items.push(match); }
        else { run = { start: match.row, end: match.row, items: [match] }; runs.push(run); }
      });
      const out = [];
      // One metadata lookup even when matching dates occupy several row runs.
      const width = speedPart_(timer, 'schedule.width', () => { const mc = sheet.getMaxColumns(); return mc >= 5 ? 4 : mc >= 4 ? 3 : 2; });
      runs.forEach(group => {
        const block = speedPart_(timer, 'schedule.textRead', () => sheet
          .getRange(group.start, 2, group.end - group.start + 1, width).getValues());
        group.items.forEach(match => {
          const row = block[match.row - group.start];
          out.push({ date: match.date, tasks: String(row[0] || ''), journal: String(row[1] || ''),
            plan: width > 2 ? String(row[2] || '') : '', tho: width > 3 ? String(row[3] || '') : '' });
        });
      });
      out.sort((a, b) => a.date.localeCompare(b.date));
      return out;
    },
    // One day's fields: get(date, ['tasks', 'journal']) → { exists, tasks, journal, ref_ }.
    get(date, fields) {
      fields = fields || ['tasks', 'journal', 'plan', 'tho'];
      const sh = this.sheet_();
      const row = findDayRow_(sh, date);
      const out = { exists: !!row, ref_: row };
      fields.forEach(f => { out[f] = ''; });
      if (!row) return out;
      const cols = this.cols_(fields);
      const lo = Math.min.apply(null, cols);
      let hi = Math.max.apply(null, cols);
      if (hi > 3) hi = Math.min(hi, sh.getMaxColumns());
      if (hi < lo) return out;
      const vals = sh.getRange(row, lo, 1, hi - lo + 1).getValues()[0];
      fields.forEach((f, i) => { const c = cols[i]; if (c <= hi) out[f] = String(vals[c - lo] || ''); });
      return out;
    },
    // Write only the given fields; creates the day if missing. rec = what get() returned (optional).
    set(date, values, rec) {
      const fields = Object.keys(values || {});
      if (!fields.length) return;
      const sh = this.sheet_();
      const cols = this.cols_(fields);
      cols.forEach(c => { if (c > 3) this.ensureCol_(sh, c); });
      const row = rec && rec.ref_ ? rec.ref_ : (rec && rec.exists === false ? 0 : findDayRow_(sh, date));
      if (!row) {
        const r = [parseDate_(date), '', ''];
        fields.forEach((f, i) => { while (r.length < cols[i]) r.push(''); r[cols[i] - 1] = String(values[f] == null ? '' : values[f]); });
        sh.appendRow(r);
        if (rec) { rec.exists = true; rec.ref_ = sh.getLastRow(); }
        return;
      }
      // Contiguous columns go in one write (Today + Notes together, as before).
      const pairs = fields.map((f, i) => [cols[i], String(values[f] == null ? '' : values[f])]).sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < pairs.length;) {
        let j = i;
        while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[j][0] + 1) j++;
        const run = pairs.slice(i, j + 1);
        if (run.length === 1) sh.getRange(row, run[0][0]).setValue(run[0][1]);
        else sh.getRange(row, run[0][0], 1, run.length).setValues([run.map(p => p[1])]);
        i = j + 1;
      }
    },
    // Today cell with a cached row hint (import path, read every load).
    peekTasks(date) {
      const r = readDoneToday_(this.sheet_(), date);
      return { exists: !!r.row, tasks: r.content, ref_: r.row };
    },
    // Daily housekeeping (date coverage, formats): Sheet backend only.
    ensure(timer) { ensureSetup_(timer); }
  },


  /* Reference cards. Record = { id, parentId, type, title, content, expanded, sort, ref_ }.
     Sheet: tab "Reference", columns A–G in that order; ref_ = row number (opaque). */
  ref: {
    sheet_() { storeBackend_('ref'); return getOrCreateSheet_('Reference', REF_HEADERS); },
    rec_(row, index, at) {
      return { ref_: at, id: String(row[0] || ''), parentId: String(row[1] || ''), type: String(row[2] || 'item'),
        title: String(row[3] || ''), content: String(row[4] || ''), expanded: row[5] !== false, sort: Number(row[6]) || index };
    },
    row_(r) {
      return [r.id, r.parentId || '', r.type || 'item', r.title || '', r.content || '', r.expanded !== false, Number(r.sort) || 0];
    },
    // Every card in stored order (sort applied by the caller).
    list() {
      const values = this.sheet_().getDataRange().getValues();
      return values.length <= 1 ? [] : values.slice(1).map((row, i) => this.rec_(row, i, i + 2));
    },
    ids() { return new Set(referenceRowMap_(this.sheet_()).keys()); },
    get(id) {
      const sh = this.sheet_();
      const row = referenceRowMap_(sh).get(String(id));
      if (!row) return { exists: false, id: String(id) };
      return Object.assign({ exists: true }, this.rec_(sh.getRange(row, 1, 1, 7).getValues()[0], 0, row));
    },
    // Write only the given fields of an existing card (rec from get()/list()).
    update(id, values, rec) {
      const sh = this.sheet_();
      const row = rec && rec.ref_ ? rec.ref_ : referenceRowMap_(sh).get(String(id));
      if (!row) return false;
      storeWriteCols_(sh, row, Object.keys(values).map(f => {
        const c = STORE_REF_COLS_[f];
        if (!c) throw new Error('Store.ref: unknown field ' + f);
        return [c, values[f]];
      }));
      return true;
    },
    // New card at the bottom; sort defaults to the current row count.
    add(r) {
      const sh = this.sheet_();
      const row = this.row_(r);
      if (r.sort == null || !Number(r.sort)) row[6] = sh.getLastRow();
      sh.appendRow(row);
      return r.id;
    },
    addMany(list) {
      if (!list.length) return;
      const sh = this.sheet_();
      sh.getRange(sh.getLastRow() + 1, 1, list.length, REF_HEADERS.length).setValues(list.map(r => this.row_(r)));
    },
    setSorts(order) {
      const sh = this.sheet_();
      const lastRow = sh.getLastRow();
      if (lastRow < 2 || !Array.isArray(order)) return;
      const rows = referenceRowMap_(sh);
      const range = sh.getRange(2, 7, lastRow - 1, 1);
      const sorts = range.getValues();
      order.forEach(e => { const row = rows.get(String(e.id)); if (row) sorts[row - 2][0] = Number(e.sort) || 0; });
      range.setValues(sorts);
    },
    setAllExpanded(expanded) {
      const sh = this.sheet_();
      const lastRow = sh.getLastRow();
      if (lastRow < 2) return;
      const values = [];
      for (let i = 0; i < lastRow - 1; i++) values.push([expanded !== false]);
      sh.getRange(2, 6, lastRow - 1, 1).setValues(values);
    },
    // A card and everything under it, as stored (raw values, for the Archive). Nothing is removed yet.
    tree(id) {
      const sh = this.sheet_();
      const lastRow = sh.getLastRow();
      if (lastRow < 2) return [];
      const values = sh.getRange(1, 1, lastRow, REF_HEADERS.length).getValues();
      const ids = new Set([String(id)]);
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 1; i < values.length; i++) {
          const childId = String(values[i][0] || ''), parentId = String(values[i][1] || '');
          if (ids.has(parentId) && !ids.has(childId)) { ids.add(childId); changed = true; }
        }
      }
      const out = [];
      for (let i = 1; i < values.length; i++) {
        const r = values[i];
        if (ids.has(String(r[0]))) out.push({ ref_: i + 1, id: r[0], parentId: r[1], type: r[2], title: r[3], content: r[4], expanded: r[5], sort: r[6] });
      }
      return out;
    },
    remove(records) {
      const sh = this.sheet_();
      records.map(x => x.ref_).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
    },
    // To Confirm card content with a cached row hint (import path).
    peekConfirm() {
      const r = readConfirmCard_(this.sheet_());
      return { exists: !!r.row, content: r.content, ref_: r.row };
    }
  },

  /* Archive — deleted Reference cards, restorable. Record = card fields + deletedAt (ISO). */
  archive: {
    sheet_() { storeBackend_('archive'); return getOrCreateSheet_('Archive', ARCHIVE_HEADERS); },
    list() {
      const values = this.sheet_().getDataRange().getValues();
      return values.slice(1).map((row, i) => ({
        ref_: i + 2, id: String(row[0] || ''), parentId: String(row[1] || ''), type: String(row[2] || 'item'),
        title: String(row[3] || ''), content: String(row[4] || ''), expanded: row[5] !== false, sort: Number(row[6]) || 0,
        deletedAt: row[7] instanceof Date ? row[7].toISOString() : String(row[7] || '')
      })).filter(x => x.id);
    },
    add(records, deletedAt) {
      if (!records.length) return;
      const sh = this.sheet_();
      sh.getRange(sh.getLastRow() + 1, 1, records.length, ARCHIVE_HEADERS.length)
        .setValues(records.map(r => [r.id, r.parentId, r.type, r.title, r.content, r.expanded, r.sort, deletedAt]));
    },
    remove(records) {
      const sh = this.sheet_();
      records.map(x => x.ref_).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
    }
  },

  /* Daily plan (Big Three / Stretch / Next / Backlog). Record = { id, date, group, rank, ref, title, target, event,
     updated, ref_ }. Sheet: tab "Plan" (all text). Schedule links (task → its calendar event) live in script
     properties planEv:<tid>. */
  plan: {
    sheet_(create) {
      storeBackend_('plan');
      const ss = ss_();
      let sh = ss.getSheetByName(PLAN_SHEET);
      if (!sh && create !== false) {
        sh = ss.insertSheet(PLAN_SHEET);
        sh.getRange(1, 1, 1, PLAN_HEAD.length).setValues([PLAN_HEAD]).setFontWeight('bold');
        sh.getRange('A:I').setNumberFormat('@'); // dates and ids stay text
        sh.setFrozenRows(1);
      }
      return sh;
    },
    exists() { return !!this.sheet_(false); },
    list() {
      const sh = this.sheet_();
      const n = sh.getLastRow() - 1;
      if (n < 1) return [];
      const tz = Session.getScriptTimeZone();
      return sh.getRange(2, 1, n, PLAN_HEAD.length).getValues().map((r, i) => ({
        ref_: i + 2, id: String(r[0] || ''),
        date: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1] || '').trim(),
        group: String(r[2] || '').trim().toLowerCase(), rank: Number(r[3]) || 0, ref: String(r[4] || '').trim(),
        title: String(r[5] || ''), target: String(r[6] || ''), event: String(r[7] || ''), updated: String(r[8] || '')
      })).filter(x => x.ref && PLAN_GROUPS[x.group] !== undefined);
    },
    // Insert or update (x.ref_ set = existing). Stamps Updated.
    write(x) {
      const sh = this.sheet_();
      const vals = [[x.id, x.date || '', x.group, String(x.rank || 0), x.ref, x.title || '', x.target || '', x.event || '',
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')]];
      if (x.ref_) sh.getRange(x.ref_, 1, 1, PLAN_HEAD.length).setValues(vals);
      else { sh.appendRow(vals[0]); x.ref_ = sh.getLastRow(); }
    },
    // Remove one row; others in `rows` (from list()) keep valid handles.
    remove(x, rows) {
      const at = x.ref_;
      this.sheet_().deleteRow(at);
      (rows || []).forEach(r => { if (r.ref_ > at) r.ref_--; });
    },
    link(tid) { return PropertiesService.getScriptProperties().getProperty('planEv:' + tid); },
    setLink(tid, link) { PropertiesService.getScriptProperties().setProperty('planEv:' + tid, link); }
  },

  /* Calendar backlog (swept past all-day tasks). Rows are tuples of display text
     [id, date, title, colorId, urgency, swept, placed]; a row's handle is its index in rows(). */
  calBacklog: {
    sheet_(create) {
      storeBackend_('calBacklog');
      const ss = ss_();
      let sh = ss.getSheetByName(CAL_BACKLOG_SHEET);
      if (!sh && create !== false) {
        sh = ss.insertSheet(CAL_BACKLOG_SHEET);
        sh.getRange(1, 1, 1, CAL_BACKLOG_HEAD.length).setValues([CAL_BACKLOG_HEAD]).setFontWeight('bold');
        sh.getRange('A:G').setNumberFormat('@');
        sh.setFrozenRows(1);
      }
      return sh;
    },
    exists() { return !!this.sheet_(false); },
    rows() {
      const sh = this.sheet_();
      const n = sh.getLastRow() - 1;
      return n > 0 ? sh.getRange(2, 1, n, CAL_BACKLOG_HEAD.length).getDisplayValues() : [];
    },
    add(tuples) {
      if (!tuples.length) return;
      const sh = this.sheet_();
      sh.getRange(sh.getLastRow() + 1, 1, tuples.length, CAL_BACKLOG_HEAD.length).setValues(tuples);
    },
    setPlaced(index, value) { this.sheet_().getRange(index + 2, 7).setValue(value); }
  },

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


/* =========================================================
   SHEET BACKEND HELPERS (moved from Code.gs 2026-11-21, unchanged)
   Only this file opens the spreadsheet. Not-yet-moved areas in Code.gs still call
   getOrCreateSheet_ (counted by tools/store-guard.mjs).
   ========================================================= */
const GANTT_SS_ID = '1D9aR_pJgddDdO5PD66IBlsDIIT_VbFKYfjvwccR08AE';

// Inside the router the library has no active spreadsheet, so fall back to the ID.
function ss_() { return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(GANTT_SS_ID); }

// Full setup. Safe to run by hand from the editor at any time.
function setupWorkspace(opts) {
  const days = getOrCreateSheet_('Days', DAYS_HEADERS);
  const reference = getOrCreateSheet_('Reference', REF_HEADERS);

  // Keep a reasonable amount of stored date coverage.
  speedPart_(opts && opts.timer, 'setup.dateCoverage', () => ensureDayRange_(days, 730, 365));

  const props = PropertiesService.getScriptProperties();
  // Routine date maintenance must not reformat the entire date column daily.
  // Include tab IDs so replacing either tab invalidates this one-time hint.
  const formatVersion = '1:' + days.getSheetId() + ':' + reference.getSheetId();
  if (!(opts && opts.daily) || props.getProperty('workspaceFormatVersion') !== formatVersion) {
    days.setFrozenRows(1);
    reference.setFrozenRows(1);
    days.getRange('A:A').setNumberFormat('yyyy-mm-dd');
    // Publish only after all format operations succeed; failed setup retries.
    props.setProperty('workspaceFormatVersion', formatVersion);
  }
  props.setProperty('lastSetupDate', todayString_());

  return true;
}


// Cheap check used by every request: run the full setup only once per day,
// or right away if a sheet is missing.
function ensureSetup_(timer) {
  const today = todayString_();
  const props = PropertiesService.getScriptProperties();
  // Already set up today: one property read (2026-11-05: the two sheet look-ups cost ~0.3 s every load;
  // a missing tab is still created by getOrCreateSheet_ wherever it's used).
  if (props.getProperty('lastSetupDate') === today) return;
  const ss = ss_();

  const lock = LockService.getScriptLock();
  if (!speedPart_(timer, 'setup.lock', () => lock.tryLock(10000))) {
    return; // Another request is already doing it.
  }

  try {
    const stillNeeded =
      !ss.getSheetByName('Days') ||
      !ss.getSheetByName('Reference') ||
      props.getProperty('lastSetupDate') !== today;

    if (stillNeeded) {
      setupWorkspace({ daily: true, timer: timer });
    }
  } finally {
    lock.releaseLock();
  }
}



function ensureDayRange_(sheet, pastDays, futureDays) {
  const timezone = Session.getScriptTimeZone();

  const today = new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const existing = new Set(), timestamps = new Set(), dateValues = [];
  const normalized = new Map();
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    // Exact Date timestamps already prove coverage without formatting. Keep
    // text-date normalization and a nearby-Date fallback for legacy times.
    sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(row => {
      const value = row[0];
      if (isDate_(value)) {
        timestamps.add(value.getTime()); dateValues.push(value);
      } else {
        const key = formatDate_(value);
        if (key) existing.add(key);
      }
    });
  }

  const hasDate = (date, key) => existing.has(key) || dateValues.some(value => {
    const time = value.getTime();
    // Dates on the same timezone calendar day are within this conservative
    // margin, including 25-hour DST days. Far history needs no conversion.
    if (Math.abs(time - date.getTime()) > 2 * DAY_MS) return false;
    if (!normalized.has(time)) normalized.set(time, formatDate_(value));
    const found = normalized.get(time);
    if (found) existing.add(found);
    return found === key;
  });

  const missing = [];

  for (
    let offset = -pastDays;
    offset <= futureDays;
    offset++
  ) {
    const date = new Date(today);

    date.setDate(
      today.getDate() + offset
    );

    if (timestamps.has(date.getTime())) continue;
    const key = Utilities.formatDate(
      date,
      timezone,
      'yyyy-MM-dd'
    );

    if (!hasDate(date, key)) {
      missing.push([
        date,
        '',
        ''
      ]);
    }
  }

  if (missing.length) {
    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        missing.length,
        3
      )
      .setValues(missing);

    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        sheet.getMaxColumns() // Keep Plan and every other column attached to its date.
      )
      .sort({
        column: 1,
        ascending: true
      });
  }
}


function getOrCreateSheet_(name, headers, timer) {
  // Optional nested profiling uses the same service calls as ordinary callers.
  // Only the schedule reader supplies a timer; names, IDs and data stay private.
  const ss = speedPart_(timer, 'schedule.spreadsheet', () => ss_());

  let sheet = speedPart_(timer, 'schedule.sheetLookup', () => ss.getSheetByName(name));

  if (!sheet) {
    sheet = ss.insertSheet(name);

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);
  }

  return sheet;
}


function findDayRow_(sheet, dateString) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const target = parseDate_(dateString).getTime();

  for (let i = 0; i < dates.length; i++) {
    const value = dates[i][0];

    if (!value) continue;

    if (isDate_(value) && Math.abs(value.getTime() - target) > DAY_MS) {
      continue;
    }

    if (formatDate_(value) === dateString) {
      return i + 2;
    }
  }

  return 0;
}

// A row hint only: read the live date and content together on every import.
// Moved/deleted rows and cache failures fall back to the normal date lookup.
function readDoneToday_(sheet, date) {
  const key = 'done-today-row:v1:' + date;
  let cache = null, hint = 0;
  try { cache = CacheService.getScriptCache(); hint = Number(cache.get(key)); } catch (e) {}
  if (Number.isInteger(hint) && hint >= 2) {
    try {
      const values = sheet.getRange(hint,1,1,2).getValues()[0];
      if (formatDate_(values[0]) === date) return {row:hint,content:String(values[1] || '')};
    } catch (e) {}
  }
  const row = findDayRow_(sheet,date);
  const content = row ? String(sheet.getRange(row,2).getValue() || '') : '';
  try { if (cache) { if (row) cache.put(key,String(row),3600); else cache.remove(key); } } catch (e) {}
  return {row:row,content:content};
}

// Row number of each Reference ID, reading only the ID column.
function referenceRowMap_(sheet) {
  const lastRow = sheet.getLastRow();
  const map = new Map();

  if (lastRow < 2) {
    return map;
  }

  sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach((row, i) => {
    const id = String(row[0] || '');
    if (id && !map.has(id)) map.set(id, i + 2);
  });

  return map;
}

// Cache only a row hint, never source rows or HTML. Validate the identity and read the live
// content together; direct Sheet edits, moved/deleted rows and cache failures remain visible.
function readConfirmCard_(ref) {
  const key = 'confirm-card-row:v1'; let cache = null, hint = 0;
  try { cache = CacheService.getScriptCache(); hint = Number(cache.get(key)); } catch (e) {}
  if (Number.isInteger(hint) && hint >= 2) {
    try {
      const values = ref.getRange(hint,1,1,5).getValues()[0];
      if (String(values[0] || '') === CONFIRM_CARD_ID) return {row:hint,content:String(values[4] || '')};
    } catch (e) {} // a deleted row can also put the hint outside the sheet bounds
  }
  const row = referenceRowMap_(ref).get(CONFIRM_CARD_ID) || 0;
  const content = row ? String(ref.getRange(row,5).getValue() || '') : '';
  try { if (cache) { if (row) cache.put(key,String(row),3600); else cache.remove(key); } } catch (e) {}
  return {row:row,content:content};
}
