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
/* Database step (2026-11-22, docs/NOTES.md → "H3. Firestore"). FIREBASE_PROJECT_ = projectId from
   tools/pwa/firebase-config.json (check.mjs keeps the two equal). Empty = not switched on: every area stays on the
   Sheet. Set = the areas in STORE_DB_AREAS_ live in Firestore, and the timed trigger storeMirror() copies them
   into the Sheet (backup mirror) and moves lost edits from Firestore into the Backup tab. */
const FIREBASE_PROJECT_ = '';
const STORE_DB_AREAS_ = ['kim'];
const STORE_BACKEND = {
  kim: 'sheet',
  days: 'sheet',
  ref: 'sheet',
  archive: 'sheet',
  plan: 'sheet',
  calBacklog: 'sheet',
  timer: 'sheet',
  props: 'properties'
  // calBacklog, timer, props, study, logs: still direct, moving in this order
};

if (FIREBASE_PROJECT_) STORE_DB_AREAS_.forEach(a => { STORE_BACKEND[a] = 'db'; });
const STORE_DB_BUILT_ = { kim: true };

function storeBackend_(area) {
  const b = STORE_BACKEND[area] || 'sheet';
  if (b === 'db' && STORE_DB_BUILT_[area]) {
    if (!FIREBASE_PROJECT_) throw new Error('Store: ' + area + ' is set to the database but FIREBASE_PROJECT_ is empty');
    return b;
  }
  if (b !== 'sheet' && b !== 'properties') throw new Error('Store: backend "' + b + '" for ' + area + ' is not built yet');
  return b;
}

/* Firestore over REST, as Julius (his OAuth token; IAM access, so security rules don't apply here — the rules
   lock the browser side to his account). X-Goog-User-Project bills the calls to the Firebase project.
   Plain fields only: strings and whole numbers. */
const StoreFs = {
  url_(path) { return 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ + '/databases/(default)/documents/' + path; },
  req_(method, path, body) {
    const res = UrlFetchApp.fetch(this.url_(path), {
      method: method, contentType: 'application/json', muteHttpExceptions: true,
      payload: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': FIREBASE_PROJECT_ }
    });
    const code = res.getResponseCode();
    if (code === 404 && method === 'get') return null;
    if (code >= 300) throw new Error('Firestore ' + method + ' ' + path + ': ' + code + ' ' + res.getContentText().slice(0, 300));
    return res.getContentText() ? JSON.parse(res.getContentText()) : {};
  },
  dec_(doc) {
    const out = {};
    Object.keys((doc && doc.fields) || {}).forEach(k => {
      const v = doc.fields[k];
      out[k] = 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? Number(v.doubleValue) : 'stringValue' in v ? v.stringValue : null;
    });
    if (doc && doc.name) out.id_ = doc.name.split('/').pop();
    return out;
  },
  enc_(obj) {
    const fields = {};
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      fields[k] = typeof v === 'number' && Math.floor(v) === v ? { integerValue: String(v) } : { stringValue: String(v == null ? '' : v) };
    });
    return { fields: fields };
  },
  get(path) { const d = this.req_('get', path); return d ? this.dec_(d) : null; },
  set(path, obj) { this.req_('patch', path, this.enc_(obj)); return obj; },
  list(coll) { return ((this.req_('get', coll + '?pageSize=100') || {}).documents || []).map(d => this.dec_(d)); },
  del(path) { this.req_('delete', path); }
};

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

/* Key-value settings and bookkeeping (Apps Script Properties today). Same method names as a Properties object,
   so existing code reads the same; a 'db' backend later keeps this interface. User data keys (to move with the
   database): refPinned, inboxItems/inboxDone (user scope), cardCats*, focusData*, funData, newData, calendar picks,
   ceHide, calPrev:*, archiveAuto, planEv:*. Everything else is server bookkeeping (applied ids, one-time flags,
   throttles, PWA_KEY) and stays with the server. */
function storeProps_(scope) {
  const svc = () => { storeBackend_('props'); return scope === 'user' ? PropertiesService.getUserProperties() : PropertiesService.getScriptProperties(); };
  const api = {
    getProperty: k => svc().getProperty(k),
    getProperties: () => svc().getProperties(),
    setProperty: (k, v) => { svc().setProperty(k, v); return api; },
    setProperties: (o, del) => { if (del === undefined) svc().setProperties(o); else svc().setProperties(o, del); return api; },
    deleteProperty: k => { svc().deleteProperty(k); return api; }
  };
  return api;
}

/* Sheet-first tabs (2026-11-21 H2): written directly by people and other AIs (ChatGPT / Claude via the Sheets
   connector) or plain logs, so they stay in the Sheet even after the database step. Code reaches them only through
   Store.sheetFirst(name); any other tab name throws. */
const STORE_SHEET_FIRST_ = {
  'Done Log': () => DONE_LOG_HEADERS,
  'New Tasks': () => NEW_TASKS_HEADERS,
  'To Confirm': () => CONFIRM_HEADERS,
  'Study Sessions': () => STUDY_HEADERS,
  'Study Review': () => STUDY_REVIEW_HEADERS,
  'Speed Log': () => SPEED_HEADERS,
  'Backup': () => ['Saved', 'Where', 'Column', 'Reason', 'Content'],
  'Looks': () => ['Slot', 'Device', 'Saved', 'Settings (JSON)']
};

const Store = {
  // A Sheet-first tab (created with its headers when missing; opts.create === false → null when missing).
  sheetFirst(name, opts) {
    const head = STORE_SHEET_FIRST_[name];
    if (!head) throw new Error('Store.sheetFirst: ' + name + ' is not a Sheet-first tab — add a Store area instead');
    return opts && opts.create === false ? ss_().getSheetByName(name) : getOrCreateSheet_(name, head());
  },
  ping() { return ss_().getName(); },

  props: storeProps_('script'),
  userProps: storeProps_('user'),

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

  /* Block timer events (Timer.gs). Tuples [op, date, at, action, block, item, name, value, device];
     append-only, one row per op id. Sheet: tab "Timer Log". */
  timer: {
    sheet_() { storeBackend_('timer'); return getOrCreateSheet_('Timer Log', TIMER_HEADERS); },
    rows() {
      const sh = this.sheet_();
      const n = sh.getLastRow() - 1;
      return n < 1 ? [] : sh.getRange(2, 1, n, TIMER_HEADERS.length).getValues();
    },
    ops() {
      const sh = this.sheet_();
      const n = sh.getLastRow() - 1;
      return new Set(n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : []);
    },
    append(tuples) {
      if (!tuples.length) return;
      const sh = this.sheet_();
      const range = sh.getRange(sh.getLastRow() + 1, 1, tuples.length, TIMER_HEADERS.length);
      range.setNumberFormat('@'); // Date/At stay text, never turned into dates in another time zone
      range.setValues(tuples);
    }
  },

  /* Keep In Mind — one shared list. Sheet: tab "Keep In Mind", A2 = HTML, B2 = saved-at ms. */
  kim: {
    SHEET: 'Keep In Mind',
    DOC: 'gantt/kim',
    sheet_() {
      const sh = getOrCreateSheet_(this.SHEET, ['Keep In Mind (shared list, HTML) — edited in the app', 'Saved at (ms)']);
      if (!sh.getRange(1, 2).getValue()) sh.getRange(1, 2).setValue('Saved at (ms)');
      return sh;
    },
    sheetRead_() {
      const row = this.sheet_().getRange(2, 1, 1, 2).getValues()[0];
      return { value: String(row[0] || ''), at: Number(row[1]) || 0 };
    },
    sheetWrite_(html, at) { this.sheet_().getRange(2, 1, 1, 2).setValues([[String(html || ''), at]]); },
    // Database: Firestore doc gantt/kim = { html, at, base, dev }. No doc yet → seeded from the Sheet copy.
    read() {
      if (storeBackend_('kim') === 'db') {
        const d = StoreFs.get(this.DOC);
        if (d) return { value: String(d.html || ''), at: Number(d.at) || 0 };
        const s = this.sheetRead_();
        if (s.value) StoreFs.set(this.DOC, { html: s.value, at: s.at || Date.now(), base: 0, dev: 'sheet-seed' });
        return s;
      }
      return this.sheetRead_();
    },
    write(html) {
      const at = Date.now();
      html = String(html || '');
      if (storeBackend_('kim') === 'db') StoreFs.set(this.DOC, { html: html, at: at, base: 0, dev: 'server' });
      else this.sheetWrite_(html, at);
      return { value: html, at: at };
    },
    // Timed trigger: newest Firestore copy → Sheet (backup mirror). Returns true when the Sheet changed.
    mirror() {
      if (storeBackend_('kim') !== 'db') return false;
      const d = StoreFs.get(this.DOC);
      if (!d) { this.read(); return false; } // seeds Firestore from the Sheet
      const s = this.sheetRead_(), at = Number(d.at) || 0;
      if (at <= s.at && String(d.html || '') === s.value) return false;
      if (s.at > at && s.value !== String(d.html || '')) backupCell_(this.SHEET, 'A2', 'Sheet copy newer than the database (kept database)', s.value);
      this.sheetWrite_(d.html, at);
      return true;
    },
    // First-copy flag: false until the list has been saved once.
    migrated() { return PropertiesService.getScriptProperties().getProperty('kimMigrated') === '1'; },
    setMigrated() { PropertiesService.getScriptProperties().setProperty('kimMigrated', '1'); },
    backup(reason, html) { backupCell_(this.SHEET, 'A2', reason, html); }
  },

  locked: storeLocked_,

  /* Database mirror (timed trigger, every 5 min): each database area copied into its Sheet tab, then edits that
     lost under "newest edit wins" (written to Firestore ganttBackup by the app) moved into the Backup tab. */
  mirror() {
    if (!FIREBASE_PROJECT_) return { off: true };
    return storeLocked_(() => {
      const out = { kim: Store.kim.mirror(), backups: 0 };
      StoreFs.list('ganttBackup').forEach(b => {
        backupCell_(b.area === 'kim' ? Store.kim.SHEET : 'Database: ' + b.area, b.area === 'kim' ? 'A2' : '', (b.reason || 'lost edit') + (b.dev ? ' · ' + b.dev : ''), b.html || '');
        StoreFs.del('ganttBackup/' + b.id_);
        out.backups++;
      });
      return out;
    });
  }
};

// Trigger target (installed by firebaseSetup). Never throws, so the trigger keeps running.
function storeMirror() {
  try { console.log(JSON.stringify(Store.mirror())); } catch (e) { console.error('storeMirror: ' + e.message); }
}

/* Run once from the editor after FIREBASE_PROJECT_ is set (docs/NOTES.md → "H3"): asks for the new permissions
   (database, outside requests, triggers), replaces the mirror trigger (every 5 min), and runs the first mirror
   (which also copies the Sheet's Keep In Mind into Firestore if the database is still empty). */
function firebaseSetup() {
  if (!FIREBASE_PROJECT_) throw new Error('Set FIREBASE_PROJECT_ in Store.gs first');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'storeMirror').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('storeMirror').timeBased().everyMinutes(5).create();
  const r = Store.mirror();
  console.log('Firebase setup ✓ ' + JSON.stringify(r));
  return r;
}


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
