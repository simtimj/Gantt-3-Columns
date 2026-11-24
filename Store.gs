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
const FIREBASE_PROJECT_ = 'gantt-2ee94';
const STORE_DB_AREAS_ = ['kim', 'days', 'ref', 'kv', 'cal', 'focus', 'inbox', 'plan', 'timer']; // same list as `areas` in tools/pwa/firebase-config.json (check.mjs)
const STORE_BACKEND = {
  kim: 'sheet',
  days: 'sheet',
  ref: 'sheet',
  archive: 'sheet',
  plan: 'sheet',
  calBacklog: 'sheet',
  timer: 'sheet',
  kv: 'properties',
  cal: 'sheet', // calendar copy (H5 B2): off = the app reads Google Calendar through the server, as before
  focus: 'properties', // D2: Focus list doc ganttFocus/main
  inbox: 'properties', // D2: Inbox docs ganttInbox/<id>
  props: 'properties'
  // calBacklog, timer, props, study, logs: still direct, moving in this order
};

if (FIREBASE_PROJECT_) STORE_DB_AREAS_.forEach(a => { STORE_BACKEND[a] = 'db'; });
// Archive = Reference cards marked deleted in the same docs (NOTES H5 C), so it follows Reference.
if (STORE_BACKEND.ref === 'db') STORE_BACKEND.archive = 'db';
const STORE_DB_BUILT_ = { kim: true, days: true, ref: true, archive: true, kv: true, cal: true, focus: true, inbox: true, plan: true, timer: true };

function storeBackend_(area) {
  const b = STORE_BACKEND[area] || 'sheet';
  if (b === 'db' && STORE_DB_BUILT_[area]) {
    if (!FIREBASE_PROJECT_) throw new Error('Store: ' + area + ' is set to the database but FIREBASE_PROJECT_ is empty');
    return storeDbReady_() ? b : 'sheet';
  }
  if (b !== 'sheet' && b !== 'properties') throw new Error('Store: backend "' + b + '" for ' + area + ' is not built yet');
  return b;
}

/* Database reachable? (2026-11-22 fix: a permission error emptied Keep In Mind.) One probe per run, cached
   2 min: any answer but "doc found" / "doc not there yet" (403, missing database, API off, no scope) → every
   database area falls back to the Sheet, so nothing shows empty and no edit is lost. */
let storeDbReady__ = null;
function storeDbReady_() {
  if (storeDbReady__ !== null) return storeDbReady__;
  const cache = CacheService.getScriptCache(), hit = cache.get('storeDbReady');
  if (hit) return (storeDbReady__ = hit === '1');
  let ok = false, why = '';
  try {
    const res = UrlFetchApp.fetch(StoreFs.url_('gantt/kim'), { muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': FIREBASE_PROJECT_ } });
    const code = res.getResponseCode();
    ok = code === 200 || (code === 404 && !/database/i.test(res.getContentText()));
    if (!ok) why = code + ' ' + res.getContentText().replace(/\s+/g, ' ').slice(0, 300);
  } catch (e) { why = e.message; }
  if (!ok) console.warn('Database not reachable, using the Sheet: ' + why);
  cache.put('storeDbReady', ok ? '1' : '0', 120);
  cache.put('storeDbWhy', why || '', 120);
  return (storeDbReady__ = ok);
}
// Why the database is off right now ('' = on or not switched on), shown in the app so Julius can see the reason.
function storeDbWhy_() {
  if (!FIREBASE_PROJECT_ || storeDbReady_()) return '';
  return CacheService.getScriptCache().get('storeDbWhy') || 'not reachable';
}

/* Firestore over REST, as Julius (his OAuth token; IAM access, so security rules don't apply here — the rules
   lock the browser side to his account). X-Goog-User-Project bills the calls to the Firebase project.
   Plain fields only: strings, whole numbers and dates (timestamps, read back as ms). */
const StoreFs = {
  url_(path) { return 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ + '/databases/(default)/documents' + (path.charAt(0) === ':' ? '' : '/') + path; },
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
      out[k] = 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? Number(v.doubleValue) : 'stringValue' in v ? v.stringValue
        : 'timestampValue' in v ? Date.parse(v.timestampValue) : 'mapValue' in v ? this.dec_(v.mapValue) : null;
    });
    if (doc && doc.name) out.id_ = doc.name.split('/').pop();
    return out;
  },
  enc_(obj) {
    const fields = {};
    Object.keys(obj).forEach(k => {
      const v = obj[k];
      fields[k] = v instanceof Date ? { timestampValue: v.toISOString() }
        : typeof v === 'number' && Math.floor(v) === v ? { integerValue: String(v) }
        : v && typeof v === 'object' ? { mapValue: this.enc_(v) } : { stringValue: String(v == null ? '' : v) };
    });
    return { fields: fields };
  },
  get(path) { const d = this.req_('get', path); return d ? this.dec_(d) : null; },
  set(path, obj) { this.req_('patch', path, this.enc_(obj)); return obj; },
  // Only the given fields change; the doc's other fields stay (created when missing).
  patch(path, obj) {
    const mask = Object.keys(obj).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    this.req_('patch', path + '?' + mask, this.enc_(obj)); return obj;
  },
  // Only the listed field paths change (nested ones like 'tmr.`op`' too); obj holds their values as maps.
  patchPaths(path, obj, paths) {
    const mask = paths.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    this.req_('patch', path + '?' + mask, this.enc_(obj)); return obj;
  },
  // Docs of one collection matching every [field, op, value] (op: >, >=, <, <=, ==), decoded.
  query(coll, filters) {
    const OPS = { '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '==': 'EQUAL' };
    const f = filters.map(x => ({ fieldFilter: { field: { fieldPath: x[0] }, op: OPS[x[1]], value: this.enc_({ v: x[2] }).fields.v } }));
    const where = f.length === 1 ? f[0] : { compositeFilter: { op: 'AND', filters: f } };
    const res = this.req_('post', ':runQuery', { structuredQuery: { from: [{ collectionId: coll }], where: where } }) || [];
    return (Array.isArray(res) ? res : [res]).filter(r => r && r.document).map(r => this.dec_(r.document));
  },
  // Many patches at once ([[path, obj], …]; only the given fields change), 50 per round trip, run in parallel.
  patchMany(list) {
    for (let i = 0; i < list.length; i += 50) {
      const reqs = list.slice(i, i + 50).map(x => ({ url: this.url_(x[0]) + '?' + Object.keys(x[1]).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&'),
        method: 'patch', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(this.enc_(x[1])),
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': FIREBASE_PROJECT_ } }));
      UrlFetchApp.fetchAll(reqs).forEach((res, j) => {
        if (res.getResponseCode() >= 300) throw new Error('Firestore patch ' + list[i + j][0] + ': ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
      });
    }
  },
  list(coll) { return ((this.req_('get', coll + '?pageSize=100') || {}).documents || []).map(d => this.dec_(d)); },
  // Every doc of a collection (pages of 300).
  listAll(coll) {
    let out = [], tok = '';
    for (let i = 0; i < 50; i++) {
      const r = this.req_('get', coll + '?pageSize=300' + (tok ? '&pageToken=' + encodeURIComponent(tok) : '')) || {};
      out = out.concat((r.documents || []).map(d => this.dec_(d)));
      if (!(tok = r.nextPageToken)) break;
    }
    return out;
  },
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
    /* Database (2026-11-22, NOTES "H4"): doc per day ganttDays/{date}; a section is in the database once it has
       <f>At (saved-at ms), <f>Base = hash of the copy the edit started from. Reads = Sheet + docs on top; writes =
       Sheet + only the given sections in the doc. Mirror copies PWA edits into the Sheet. */
    COLL: 'ganttDays',
    FIELDS: ['tasks', 'journal', 'plan', 'tho'],
    LABEL: { tasks: 'Today', journal: 'Notes', plan: 'Plan', tho: 'Thoughts' },
    db_() { return storeBackend_('days') === 'db'; },
    doc_(date) { return StoreFs.get(this.COLL + '/' + date); },
    // Sections the doc holds, on top of a { tasks, journal, … } record (only the given fields).
    lay_(rec, doc, fields) {
      if (!doc) return rec;
      (fields || this.FIELDS).forEach(f => { if (doc[f + 'At']) rec[f] = String(doc[f] == null ? '' : doc[f]); });
      return rec;
    },
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
      const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
      if (this.db_()) {
        // Only edits the mirror hasn't copied yet can differ from the Sheet.
        const docs = this.unmirrored_();
        if (docs.length) {
          const by = {};
          docs.forEach(d => { by[d.date] = d; });
          rows.forEach(r => {
            const doc = by[formatDate_(r[0])];
            if (doc) this.FIELDS.forEach((f, i) => { if (i + 1 < width && doc[f + 'At']) r[i + 1] = String(doc[f] == null ? '' : doc[f]); });
          });
        }
      }
      return { width: width, rows: rows, base: 2 };
    },
    MIRROR_KEY: 'daysMirrorAt',
    SEED_KEY: 'daysSeeded',
    /* Full history (H5 D, 2026-11-23): every Sheet day with any text becomes a doc once, so the PWA can build the
       opening and past days from the database. Run by the mirror trigger (not a page load). Sections a doc already
       has are kept (they're newer); seeded sections get <f>At = 1, so any real edit beats them, and up = 1970, so the
       mirror doesn't copy them back. A date with no doc after this = an empty day. gantt/daysMeta tells the PWA. */
    seed_() {
      if (!this.db_() || Store.props.getProperty(this.SEED_KEY) === '1') return 0;
      const sh = this.sheet_(), last = sh.getLastRow(), mc = sh.getMaxColumns();
      const width = mc >= 5 ? 5 : mc >= 4 ? 4 : 3;
      const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, width).getValues();
      const have = {};
      StoreFs.query(this.COLL, [['date', '>=', '0']]).forEach(d => { if (d.date) have[d.date] = d; });
      let first = '', lastDate = '';
      const list = [];
      rows.forEach(r => {
        const date = formatDate_(r[0]);
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        if (!first || date < first) first = date;
        if (date > lastDate) lastDate = date;
        const doc = have[date], put = {};
        let text = false;
        this.FIELDS.forEach((f, i) => {
          const v = i + 1 < width ? String(r[i + 1] == null ? '' : r[i + 1]) : '';
          if (v) text = true;
          if (!(doc && doc[f + 'At'])) { put[f] = v; put[f + 'At'] = 1; put[f + 'Base'] = ''; }
        });
        if ((!text && !doc) || !Object.keys(put).length) return;
        put.date = date;
        if (!doc) Object.assign(put, { at: 1, up: new Date(1000), dev: 'sheet-seed' });
        list.push([this.COLL + '/' + date, put]);
      });
      StoreFs.patchMany(list);
      const docs = Object.keys(have).length + list.filter(x => !have[x[1].date]).length;
      StoreFs.set('gantt/daysMeta', { seeded: Date.now(), at: Date.now(), first: first, last: lastDate, days: docs });
      Store.props.setProperty(this.SEED_KEY, '1');
      return list.length;
    },
    unmirrored_() {
      const wm = Number(PropertiesService.getScriptProperties().getProperty(this.MIRROR_KEY)) || 0;
      // `up` = when the edit reached the database (server time, so a device's wrong clock can't hide an edit).
      return StoreFs.query(this.COLL, [['up', '>', new Date(Math.max(0, wm - 10 * 60 * 1000))]]).filter(d => d.date);
    },
    // Timed trigger: day docs edited since the last run → Sheet. A Sheet copy that isn't the one the edit started
    // from (another edit lost under "newest wins") goes to Backup first. Returns the number of sections copied.
    mirror() {
      if (!this.db_()) return 0;
      this.seed_();
      const docs = this.unmirrored_();
      let n = 0, top = 0;
      docs.forEach(doc => {
        top = Math.max(top, Number(doc.up) || 0);
        const fields = this.FIELDS.filter(f => doc[f + 'At']);
        if (!fields.length) return;
        const sh = this.sheet_(), row = findDayRow_(sh, doc.date);
        const cur = { exists: !!row, ref_: row };
        fields.forEach(f => { cur[f] = ''; });
        if (row) {
          const vals = sh.getRange(row, 2, 1, Math.min(4, sh.getMaxColumns() - 1)).getValues()[0];
          fields.forEach(f => { cur[f] = String(vals[STORE_DAY_COLS_[f] - 2] || ''); });
        }
        const put = {};
        fields.forEach(f => {
          const v = String(doc[f] == null ? '' : doc[f]);
          if (v === cur[f]) return;
          if (cur[f] && doc[f + 'Base'] && cellHash_(cur[f]) !== doc[f + 'Base']) {
            backupCell_(doc.date, this.LABEL[f], 'Sheet copy replaced by a newer edit (newest wins)' + (doc.dev ? ' · ' + doc.dev : ''), cur[f]);
          }
          put[f] = v;
        });
        if (Object.keys(put).length) { this.sheetSet_(doc.date, put, cur); n += Object.keys(put).length; }
      });
      if (top) PropertiesService.getScriptProperties().setProperty(this.MIRROR_KEY, String(top));
      return n;
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
      if (!matches.length) { const o = []; if (this.db_()) this.layRange_(o, startDate, endDate, timer); return o.sort((a, b) => a.date.localeCompare(b.date)); }
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
      if (this.db_()) this.layRange_(out, startDate, endDate, timer);
      out.sort((a, b) => a.date.localeCompare(b.date));
      return out;
    },
    layRange_(out, startDate, endDate, timer) {
      const docs = speedPart_(timer, 'schedule.dbRead', () => StoreFs.query(this.COLL, [['date', '>=', startDate], ['date', '<=', endDate]]));
      const by = {};
      out.forEach(d => { by[d.date] = d; });
      docs.forEach(doc => {
        if (!doc.date) return;
        if (!by[doc.date]) { by[doc.date] = { date: doc.date, tasks: '', journal: '', plan: '', tho: '' }; out.push(by[doc.date]); }
        this.lay_(by[doc.date], doc);
      });
    },
    // One day's fields: get(date, ['tasks', 'journal']) → { exists, tasks, journal, ref_ }.
    get(date, fields) {
      fields = fields || ['tasks', 'journal', 'plan', 'tho'];
      const sh = this.sheet_();
      const row = findDayRow_(sh, date);
      const out = { exists: !!row, ref_: row };
      fields.forEach(f => { out[f] = ''; });
      if (!row) return this.db_() ? this.lay_(out, this.doc_(date), fields) : out;
      const cols = this.cols_(fields);
      const lo = Math.min.apply(null, cols);
      let hi = Math.max.apply(null, cols);
      if (hi > 3) hi = Math.min(hi, sh.getMaxColumns());
      if (hi < lo) return out;
      const vals = sh.getRange(row, lo, 1, hi - lo + 1).getValues()[0];
      fields.forEach((f, i) => { const c = cols[i]; if (c <= hi) out[f] = String(vals[c - lo] || ''); });
      return this.db_() ? this.lay_(out, this.doc_(date), fields) : out;
    },
    // Write only the given fields; creates the day if missing. rec = what get() returned (optional).
    // Database: the same sections also go into the day's doc (server time wins as the newest edit).
    set(date, values, rec) {
      const fields = Object.keys(values || {});
      if (!fields.length) return;
      this.cols_(fields);
      this.sheetSet_(date, values, rec);
      if (!this.db_()) return;
      // Only sections that actually change (rec = what get() read): an unchanged copy must not get a fresh time,
      // or it would beat a newer edit still queued on a phone.
      const at = Date.now(), d = { date: date, at: at, up: new Date(at), dev: 'server' };
      let n = 0;
      fields.forEach(f => {
        const v = String(values[f] == null ? '' : values[f]);
        if (rec && f in rec && rec[f] === v) return;
        d[f] = v; d[f + 'At'] = at; d[f + 'Base'] = ''; n++;
      });
      if (n) StoreFs.patch(this.COLL + '/' + date, d);
    },
    sheetSet_(date, values, rec) {
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
      if (this.db_()) return this.get(date, ['tasks']);
      const r = readDoneToday_(this.sheet_(), date);
      return { exists: !!r.row, tasks: r.content, ref_: r.row };
    },
    // Daily housekeeping (date coverage, formats): Sheet backend only.
    ensure(timer) { ensureSetup_(timer); }
  },


  /* Reference cards. Record = { id, parentId, type, title, content, expanded, sort, ref_ }.
     Sheet: tab "Reference", columns A–G in that order; ref_ = row number (opaque; null for a card only in the
     database so far).
     Database (2026-11-23, NOTES "H5 C"): doc per card ganttRef/{id} = { id, parentId, type, title, content,
     expanded (1/0), sort, del ('' or the deleted-at ISO time = in the Archive), ch (content hash), base (hash of the
     content the edit started from), at (saved-at ms, newest wins), up (server time it reached the database), dev }.
     Seeded once from the Sheet (Reference + Archive). Reads = Sheet + docs the mirror hasn't copied yet on top;
     writes = Sheet + doc. The 5-min mirror copies PWA edits / deletes / restores into the two tabs. */
  ref: {
    COLL: 'ganttRef',
    MIRROR_KEY: 'refMirrorAt',
    SEED_KEY: 'refSeeded',
    sheet_() { storeBackend_('ref'); return getOrCreateSheet_('Reference', REF_HEADERS); },
    db_() { return storeBackend_('ref') === 'db'; },
    rec_(row, index, at) {
      return { ref_: at, id: String(row[0] || ''), parentId: String(row[1] || ''), type: String(row[2] || 'item'),
        title: String(row[3] || ''), content: String(row[4] || ''), expanded: row[5] !== false, sort: Number(row[6]) || index };
    },
    row_(r) {
      return [r.id, r.parentId || '', r.type || 'item', r.title || '', r.content || '', r.expanded !== false, Number(r.sort) || 0];
    },
    // ---- database helpers ----
    okId_(id) { return !!id && String(id).indexOf('/') < 0; },
    docFields_(r, del) {
      const o = { id: String(r.id), parentId: String(r.parentId || ''), type: String(r.type || 'item'), title: String(r.title || ''),
        content: String(r.content || ''), expanded: r.expanded === false || r.expanded === 'FALSE' ? 0 : 1, sort: Math.round(Number(r.sort) || 0), del: del || '' };
      o.ch = cellHash_(o.content);
      return o;
    },
    stamp_(o) { const at = Date.now(); return Object.assign(o, { at: at, up: new Date(at), dev: 'server' }); },
    // Patch only the given fields of each card's doc ([[id, fields], …]); content changes also get ch.
    put_(list) {
      if (!this.db_()) return;
      StoreFs.patchMany(list.filter(x => this.okId_(x[0])).map(x => {
        const f = Object.assign({}, x[1]);
        if ('content' in f) { f.content = String(f.content || ''); f.ch = cellHash_(f.content); }
        if ('expanded' in f) f.expanded = f.expanded === false || f.expanded === 'FALSE' ? 0 : 1;
        if ('sort' in f) f.sort = Math.round(Number(f.sort) || 0);
        return [this.COLL + '/' + x[0], this.stamp_(f)];
      }));
    },
    fromDoc_(d) {
      return { id: String(d.id || d.id_), parentId: String(d.parentId || ''), type: String(d.type || 'item'), title: String(d.title || ''),
        content: String(d.content || ''), expanded: Number(d.expanded) !== 0, sort: Number(d.sort) || 0 };
    },
    // First database read: every card and archived card from the Sheet into its doc (once).
    seed_() {
      if (!this.db_() || Store.props.getProperty(this.SEED_KEY) === '1') return;
      const sh = this.sheet_(), values = sh.getDataRange().getValues().slice(1);
      const list = values.map((row, i) => this.rec_(row, i, 0)).filter(r => r.id).map(r => [this.COLL + '/' + r.id, this.stamp_(this.docFields_(r, ''))]);
      Store.archive.sheetList_().forEach(x => list.push([this.COLL + '/' + x.id, this.stamp_(this.docFields_(x, x.deletedAt || new Date().toISOString()))]));
      StoreFs.patchMany(list.filter(x => this.okId_(x[0].split('/')[1])));
      StoreFs.set('gantt/refMeta', { seeded: Date.now(), at: Date.now(), cards: list.length });
      Store.props.setProperty(this.SEED_KEY, '1');
    },
    // Docs edited since the mirror last ran (10 min overlap): the only ones that can differ from the Sheet.
    unmirrored_() {
      if (!this.db_()) return [];
      this.seed_();
      const wm = Number(Store.props.getProperty(this.MIRROR_KEY)) || 0;
      return StoreFs.query(this.COLL, [['up', '>', new Date(Math.max(0, wm - 10 * 60 * 1000))]]).filter(d => this.okId_(d.id || d.id_));
    },
    sheetList_() {
      const values = this.sheet_().getDataRange().getValues();
      return values.length <= 1 ? [] : values.slice(1).map((row, i) => this.rec_(row, i, i + 2));
    },
    // Every card in stored order (sort applied by the caller).
    list() {
      const rows = this.sheetList_();
      if (!this.db_()) return rows;
      const by = new Map(rows.map(r => [r.id, r]));
      this.unmirrored_().forEach(d => {
        const id = String(d.id || d.id_), cur = by.get(id);
        if (d.del) { by.delete(id); return; }
        by.set(id, Object.assign(this.fromDoc_(d), { ref_: cur ? cur.ref_ : null }));
      });
      return [...by.values()];
    },
    ids() { return this.db_() ? new Set(this.list().map(r => r.id)) : new Set(referenceRowMap_(this.sheet_()).keys()); },
    get(id) {
      id = String(id);
      const sh = this.sheet_();
      const row = referenceRowMap_(sh).get(id);
      let out = row ? Object.assign({ exists: true }, this.rec_(sh.getRange(row, 1, 1, 7).getValues()[0], 0, row)) : { exists: false, id: id };
      if (this.db_() && this.okId_(id)) {
        this.seed_();
        const d = StoreFs.get(this.COLL + '/' + id);
        if (d && d.del) out = { exists: false, id: id };
        else if (d) out = Object.assign({ exists: true }, this.fromDoc_(d), { ref_: row || null });
      }
      return out;
    },
    // Write only the given fields of an existing card (rec from get()/list()).
    update(id, values, rec) {
      Object.keys(values).forEach(f => { if (!STORE_REF_COLS_[f]) throw new Error('Store.ref: unknown field ' + f); });
      const sh = this.sheet_();
      const row = rec && rec.ref_ ? rec.ref_ : referenceRowMap_(sh).get(String(id));
      if (row) storeWriteCols_(sh, row, Object.keys(values).map(f => [STORE_REF_COLS_[f], values[f]]));
      // A card only in the database so far (ref_ null from list()/get()) still gets its doc updated.
      if (this.db_() && (row || (rec && (rec.exists || rec.ref_ === null)))) { this.put_([[String(id), values]]); return true; }
      return !!row;
    },
    // New card at the bottom; sort defaults to the current row count.
    add(r) {
      const sh = this.sheet_();
      const row = this.row_(r);
      if (r.sort == null || !Number(r.sort)) row[6] = sh.getLastRow();
      sh.appendRow(row);
      if (this.db_()) this.put_([[String(r.id), this.docFields_(Object.assign({}, r, { sort: row[6] }), '')]]);
      return r.id;
    },
    addMany(list) {
      if (!list.length) return;
      const sh = this.sheet_();
      sh.getRange(sh.getLastRow() + 1, 1, list.length, REF_HEADERS.length).setValues(list.map(r => this.row_(r)));
      if (this.db_()) this.put_(list.map(r => [String(r.id), this.docFields_(r, '')]));
    },
    setSorts(order) {
      if (!Array.isArray(order)) return;
      const sh = this.sheet_();
      const lastRow = sh.getLastRow();
      if (lastRow >= 2) {
        const rows = referenceRowMap_(sh);
        const range = sh.getRange(2, 7, lastRow - 1, 1);
        const sorts = range.getValues();
        order.forEach(e => { const row = rows.get(String(e.id)); if (row) sorts[row - 2][0] = Number(e.sort) || 0; });
        range.setValues(sorts);
      }
      if (this.db_()) this.put_(order.map(e => [String(e.id), { sort: e.sort }]));
    },
    setAllExpanded(expanded) {
      const sh = this.sheet_();
      const lastRow = sh.getLastRow();
      if (lastRow >= 2) {
        const values = [];
        for (let i = 0; i < lastRow - 1; i++) values.push([expanded !== false]);
        sh.getRange(2, 6, lastRow - 1, 1).setValues(values);
      }
      if (this.db_()) this.put_(this.list().map(r => [r.id, { expanded: expanded !== false }]));
    },
    // A card and everything under it, as stored (for the Archive). Nothing is removed yet.
    tree(id) {
      const all = this.list();
      const ids = new Set([String(id)]);
      let changed = true;
      while (changed) {
        changed = false;
        all.forEach(r => { if (ids.has(String(r.parentId)) && !ids.has(String(r.id))) { ids.add(String(r.id)); changed = true; } });
      }
      return all.filter(r => ids.has(String(r.id)));
    },
    // Out of Reference (records from tree()); in the database they're marked deleted at deletedAt (= in the Archive).
    remove(records, deletedAt) {
      const sh = this.sheet_();
      records.filter(x => x.ref_).map(x => x.ref_).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
      if (this.db_()) this.put_(records.map(x => [String(x.id), Object.assign(this.docFields_(x, deletedAt || new Date().toISOString()))]));
    },
    // To Confirm card content with a cached row hint (import path).
    peekConfirm() {
      const r = readConfirmCard_(this.sheet_());
      if (!this.db_()) return { exists: !!r.row, content: r.content, ref_: r.row };
      const g = this.get(CONFIRM_CARD_ID);
      return { exists: g.exists, content: g.exists ? g.content : '', ref_: g.ref_ || null };
    },
    /* Timed trigger: database edits → the Reference / Archive tabs. A content edit that didn't start from the Sheet's
       copy puts the Sheet copy in Backup first. Returns the number of cards copied. */
    mirror() {
      if (!this.db_()) return 0;
      this.seed_();
      const docs = this.unmirrored_();
      if (!docs.length) return 0;
      const sh = this.sheet_(), rows = referenceRowMap_(sh), ash = Store.archive.sheet_();
      const arch = Store.archive.sheetList_(), archKey = new Set(arch.map(x => x.id + '|' + x.deletedAt));
      const gone = [], archGone = [], adds = [], archAdds = [];
      let top = 0, n = 0;
      docs.forEach(d => {
        top = Math.max(top, Number(d.up) || 0);
        const id = String(d.id || d.id_), r = this.fromDoc_(d), row = rows.get(id);
        if (d.del) {
          if (row) { gone.push(row); n++; }
          if (!archKey.has(id + '|' + d.del)) { archAdds.push([r.id, r.parentId, r.type, r.title, r.content, r.expanded, r.sort, d.del]); archKey.add(id + '|' + d.del); }
          return;
        }
        arch.filter(x => x.id === id).forEach(x => archGone.push(x.ref_));
        if (!row) { adds.push(this.row_(r)); n++; return; }
        const cur = this.rec_(sh.getRange(row, 1, 1, 7).getValues()[0], 0, row);
        if (cur.content !== r.content && d.base && cellHash_(cur.content) !== d.base)
          backupCell_('Reference ' + id, 'Content', 'Sheet copy replaced by a database edit (newest wins) · ' + (d.dev || ''), cur.content, true);
        if (JSON.stringify(this.row_(cur)) !== JSON.stringify(this.row_(r))) { sh.getRange(row, 1, 1, 7).setValues([this.row_(r)]); n++; }
      });
      if (adds.length) sh.getRange(sh.getLastRow() + 1, 1, adds.length, REF_HEADERS.length).setValues(adds);
      gone.sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
      if (archAdds.length) ash.getRange(ash.getLastRow() + 1, 1, archAdds.length, ARCHIVE_HEADERS.length).setValues(archAdds);
      [...new Set(archGone)].sort((a, b) => b - a).forEach(r => ash.deleteRow(r));
      if (top) Store.props.setProperty(this.MIRROR_KEY, String(top));
      return n;
    }
  },

  /* Archive — deleted Reference cards, restorable. Record = card fields + deletedAt (ISO). Database: the same
     ganttRef docs with del set (see Store.ref). */
  archive: {
    sheet_() { storeBackend_('archive'); return getOrCreateSheet_('Archive', ARCHIVE_HEADERS); },
    sheetList_() {
      const values = this.sheet_().getDataRange().getValues();
      return values.slice(1).map((row, i) => ({
        ref_: i + 2, id: String(row[0] || ''), parentId: String(row[1] || ''), type: String(row[2] || 'item'),
        title: String(row[3] || ''), content: String(row[4] || ''), expanded: row[5] !== false, sort: Number(row[6]) || 0,
        deletedAt: row[7] instanceof Date ? row[7].toISOString() : String(row[7] || '')
      })).filter(x => x.id);
    },
    list() {
      const rows = this.sheetList_();
      if (!Store.ref.db_()) return rows;
      const out = rows.slice(), key = x => x.id + '|' + x.deletedAt;
      Store.ref.unmirrored_().forEach(d => {
        const id = String(d.id || d.id_);
        if (!d.del) { for (let i = out.length - 1; i >= 0; i--) if (out[i].id === id) out.splice(i, 1); return; } // restored
        const x = Object.assign(Store.ref.fromDoc_(d), { ref_: null, deletedAt: String(d.del) });
        if (!out.some(y => key(y) === key(x))) out.push(x);
      });
      return out;
    },
    add(records, deletedAt) {
      if (!records.length) return;
      const sh = this.sheet_();
      sh.getRange(sh.getLastRow() + 1, 1, records.length, ARCHIVE_HEADERS.length)
        .setValues(records.map(r => [r.id, r.parentId, r.type, r.title, r.content, r.expanded, r.sort, deletedAt]));
    },
    // Out of the Archive tab (restore). In the database, Store.ref.addMany clears del on the same docs.
    remove(records) {
      const sh = this.sheet_();
      records.filter(x => x.ref_).map(x => x.ref_).sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
    }
  },

  /* Daily plan (Big Three / Stretch / Next / Backlog). Record = { id, date, group, rank, ref, title, target, event,
     updated, ref_ }. Sheet: tab "Plan" (all text). Schedule links (task → its calendar event) live in script
     properties planEv:<tid>. */
  /* Plan (Big Three / Waiting / Backlog rows). D2 (2026-11-23): on the database (area 'plan') each row is doc
     ganttPlan/<id> = { id, date, group, rank, ref, title, target, event, updated, del (1 = removed), ev (JSON of the
     linked event's live info, refreshed by the trigger: Code.gs planEvRefresh_), at, up, dev }; ref_ = the id. The app
     reads / edits the docs itself; the Plan tab is the backup mirror (rewritten by the trigger when it differs). */
  plan: {
    COLL: 'ganttPlan',
    db_() { return storeBackend_('plan') === 'db'; },
    sheet_(create) {
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
    exists() { return this.db_() ? true : !!this.sheet_(false); },
    sheetList_(create) {
      const sh = this.sheet_(create);
      if (!sh) return [];
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
    docs_() { return StoreFs.listAll(this.COLL); },
    row_(d) {
      return { ref_: String(d.id || d.id_), id: String(d.id || d.id_), date: String(d.date || ''), group: String(d.group || '').toLowerCase(),
        rank: Number(d.rank) || 0, ref: String(d.ref || ''), title: String(d.title || ''), target: String(d.target || ''),
        event: String(d.event || ''), updated: String(d.updated || ''), at_: Number(d.at) || 0 };
    },
    // First database read: copy the Plan tab in once (at = 1, so any real edit beats it).
    seed_() {
      if (Store.props.getProperty('planSeeded') === '1') return 0;
      const have = {}; this.docs_().forEach(d => { have[d.id || d.id_] = 1; });
      const list = this.sheetList_(false).filter(x => x.id && !have[x.id]).map(x => [this.COLL + '/' + x.id,
        { id: x.id, date: x.date, group: x.group, rank: x.rank, ref: x.ref, title: x.title, target: x.target, event: x.event, updated: x.updated, del: 0, at: 1, up: new Date(1000), dev: 'server' }]);
      if (list.length) StoreFs.patchMany(list);
      StoreFs.set('gantt/planMeta', { seeded: Date.now(), cal: String(typeof EVENT_CALENDARS !== 'undefined' ? EVENT_CALENDARS[0] : ''), at: Date.now() });
      Store.props.setProperty('planSeeded', '1');
      return list.length;
    },
    list() {
      if (!this.db_()) return this.sheetList_();
      this.seed_();
      return this.docs_().filter(d => !Number(d.del)).map(d => this.row_(d)).filter(x => x.ref && PLAN_GROUPS[x.group] !== undefined);
    },
    stamp_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); },
    // Insert or update (x.ref_ set = existing). Stamps Updated.
    write(x) {
      x.updated = this.stamp_();
      if (this.db_()) {
        const at = Math.max(Date.now(), (Number(x.at_) || 0) + 1);
        StoreFs.patch(this.COLL + '/' + x.id, { id: x.id, date: x.date || '', group: x.group, rank: Number(x.rank) || 0, ref: x.ref, title: x.title || '',
          target: x.target || '', event: x.event || '', updated: x.updated, del: 0, at: at, up: new Date(at), dev: 'server' });
        x.at_ = at; x.ref_ = x.id;
        return;
      }
      const sh = this.sheet_();
      const vals = [[x.id, x.date || '', x.group, String(x.rank || 0), x.ref, x.title || '', x.target || '', x.event || '', x.updated]];
      if (x.ref_) sh.getRange(x.ref_, 1, 1, PLAN_HEAD.length).setValues(vals);
      else { sh.appendRow(vals[0]); x.ref_ = sh.getLastRow(); }
    },
    // Remove one row; others in `rows` (from list()) keep valid handles.
    remove(x, rows) {
      if (this.db_()) {
        const at = Math.max(Date.now(), (Number(x.at_) || 0) + 1);
        StoreFs.patch(this.COLL + '/' + x.id, { del: 1, at: at, up: new Date(at), dev: 'server' });
        return;
      }
      const at = x.ref_;
      this.sheet_().deleteRow(at);
      (rows || []).forEach(r => { if (r.ref_ > at) r.ref_--; });
    },
    // Event info cache (trigger): [[id, evJson], …] → only the ev field changes (no `at`, so app edits still win).
    setEv(list) { if (list.length) StoreFs.patchMany(list.map(x => [this.COLL + '/' + x[0], { ev: x[1] }])); },
    // Trigger: Plan tab = the live rows (rewritten only when different).
    mirror() {
      if (!this.db_()) return 0;
      this.seed_();
      const rows = this.list().sort((a, b) => (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) || a.rank - b.rank)
        .map(x => [x.id, x.date, x.group, String(x.rank || 0), x.ref, x.title, x.target, x.event, x.updated]);
      const sh = this.sheet_(rows.length > 0);
      if (!sh) return 0;
      const n = sh.getLastRow() - 1;
      const cur = (n > 0 ? sh.getRange(2, 1, n, PLAN_HEAD.length).getDisplayValues() : []).filter(r => r[0]);
      if (JSON.stringify(cur) === JSON.stringify(rows)) return 0;
      const out = rows.concat(Array.from({ length: Math.max(0, n - rows.length) }, () => PLAN_HEAD.map(() => ''))); // blanks over left-over rows
      if (out.length) sh.getRange(2, 1, out.length, PLAN_HEAD.length).setValues(out);
      return rows.length;
    },
    link(tid) { return PropertiesService.getScriptProperties().getProperty('planEv:' + tid); },
    setLink(tid, link) { PropertiesService.getScriptProperties().setProperty('planEv:' + tid, link); }
  },

  /* Focus list (D2, 2026-11-23): doc ganttFocus/main = { v (the list as JSON), at, base (the `at` it was edited
     from), up, dev }. The app merges on the device (same 3-way merge as Code.gs mergeFocus_) and the rules refuse a
     write whose base isn't the stored `at`, so two devices never overwrite each other blind. The script properties
     stay the backup copy (Code.gs focusMirror_, from the trigger). */
  focus: {
    PATH: 'ganttFocus/main',
    db_() { return storeBackend_('focus') === 'db'; },
    get() {
      if (!this.db_()) return null;
      try { return StoreFs.get(this.PATH); } catch (e) { console.error('focus read: ' + e.message); return null; }
    },
    put(text, prevAt, seed) {
      if (!this.db_()) return 0;
      const at = seed ? 1 : Math.max(Date.now(), (Number(prevAt) || 0) + 1);
      StoreFs.set(this.PATH, { v: String(text), at: at, base: Number(prevAt) || 0, up: new Date(seed ? 1000 : at), dev: 'server' });
      Store.props.setProperty('focusAt', String(at));
      return at;
    },
    mirror() { return this.db_() && typeof focusMirror_ === 'function' ? focusMirror_() : 0; }
  },

  /* Inbox (D2, 2026-11-23): one doc per item ganttInbox/<id> = { id, from ('app' | 'claude'), title, details, added,
     arch, done (0/1), gone (1 = dismissed / deleted), ord (claude: its place in inbox.js; app: added-at ms), at, up, dev }.
     Seeded once from the user properties; the trigger copies new CLAUDE_INBOX items in and rewrites the properties
     (inboxItems / inboxDone / inboxOver = the backup copy) from the docs. */
  inbox: {
    COLL: 'ganttInbox',
    db_() { return storeBackend_('inbox') === 'db' && Store.props.getProperty('inboxSeeded') === '1'; },
    on_() { return storeBackend_('inbox') === 'db'; },
    list() { return StoreFs.listAll(this.COLL); },
    put(id, fields, prevAt) {
      const at = Math.max(Date.now(), (Number(prevAt) || 0) + 1);
      const rec = Object.assign({ id: String(id) }, fields, { at: at, up: new Date(at), dev: 'server' });
      StoreFs.patch(this.COLL + '/' + encodeURIComponent(String(id)), rec);
      return rec;
    },
    claude_() { return (typeof CLAUDE_INBOX !== 'undefined' && Array.isArray(CLAUDE_INBOX)) ? CLAUDE_INBOX.filter(x => x && x.id) : []; },
    docFrom_(x, from, ord, over, gone) {
      const o = Object.assign({}, x, over || {});
      return { id: String(x.id), from: from, title: String(o.title || ''), details: String(o.details || ''), added: String(o.added || ''),
        arch: String(o.arch || ''), done: o.done ? 1 : 0, gone: gone ? 1 : 0, ord: ord };
    },
    seed_() {
      if (!this.on_() || Store.props.getProperty('inboxSeeded') === '1') return 0;
      const u = Store.userProps, j = (k, d) => { try { const v = u.getProperty(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
      const mine = j('inboxItems', []), done = j('inboxDone', []), over = j('inboxOver', {}), have = {};
      this.list().forEach(d => { have[d.id || d.id_] = 1; });
      const list = [];
      this.claude_().forEach((x, i) => { if (!have[x.id]) list.push(this.docFrom_(x, 'claude', i, over[String(x.id)], done.indexOf(String(x.id)) >= 0)); });
      mine.forEach((x, i) => { if (x && x.id && !have[x.id]) list.push(this.docFrom_(x, 'app', Number(String(x.id).replace(/^a/, '')) || i, null, false)); });
      if (list.length) StoreFs.patchMany(list.map(d => [this.COLL + '/' + encodeURIComponent(d.id), Object.assign(d, { at: 1, up: new Date(1000), dev: 'server' })]));
      StoreFs.set('gantt/inboxMeta', { seeded: Date.now(), at: Date.now() });
      Store.props.setProperty('inboxSeeded', '1');
      return list.length;
    },
    // Trigger: seed once, copy new Claude items in, rewrite the property backup from the docs.
    mirror() {
      if (!this.on_()) return 0;
      const seeded = this.seed_();
      const docs = this.list(), have = {};
      docs.forEach(d => { have[d.id] = d; });
      const add = [];
      this.claude_().forEach((x, i) => { if (!have[x.id]) { const d = this.docFrom_(x, 'claude', i, null, false); add.push(d); docs.push(d); } });
      if (add.length) StoreFs.patchMany(add.map(d => [this.COLL + '/' + encodeURIComponent(d.id), Object.assign(d, { at: Date.now(), up: new Date(), dev: 'server' })]));
      const items = docs.filter(d => d.from === 'app' && !Number(d.gone)).sort((a, b) => a.ord - b.ord).map(d => {
        const o = { id: d.id, title: d.title || '', details: d.details || '', added: d.added || '' };
        if (d.arch) o.arch = d.arch; if (Number(d.done)) o.done = true;
        return o;
      });
      const doneIds = docs.filter(d => d.from === 'claude' && Number(d.gone)).map(d => d.id);
      const over = {};
      docs.filter(d => d.from === 'claude' && !Number(d.gone)).forEach(d => { over[d.id] = { title: d.title || '', details: d.details || '', arch: d.arch || '', done: !!Number(d.done) }; });
      const want = { inboxItems: JSON.stringify(items), inboxDone: JSON.stringify(doneIds.slice(-300)), inboxOver: JSON.stringify(over) }, cur = Store.userProps.getProperties(), set = {};
      Object.keys(want).forEach(k => { if (cur[k] !== want[k]) set[k] = want[k]; });
      if (Object.keys(set).length) Store.userProps.setProperties(set);
      return seeded + add.length;
    }
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
      this.dirty = true;
    },
    setPlaced(index, value) { this.sheet_().getRange(index + 2, 7).setValue(value); this.dirty = true; },
    // D2: the open list as doc gantt/calBacklog = { items (JSON, calBacklogSync's shape), sweep (JSON, last sweep that
    // moved something: { swept, at }), at, up }, written by Code.gs calBacklogPublish_ after a change and by the trigger.
    dirty: false,
    publish(items, sweep) {
      if (storeBackend_('plan') !== 'db') return false;
      const now = Date.now(), rec = { items: JSON.stringify(items || []), at: now, up: new Date(now) };
      if (sweep && sweep.swept) rec.sweep = JSON.stringify({ swept: sweep.swept, at: now });
      StoreFs.patch('gantt/calBacklog', rec);
      this.dirty = false;
      return true;
    }
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
    append(tuples, sheetOnly) {
      if (!tuples.length) return;
      const sh = this.sheet_();
      const range = sh.getRange(sh.getLastRow() + 1, 1, tuples.length, TIMER_HEADERS.length);
      range.setNumberFormat('@'); // Date/At stay text, never turned into dates in another time zone
      range.setValues(tuples);
      if (!sheetOnly && this.db_()) { try { this.putDb_(tuples); } catch (e) { console.error('timer doc write: ' + e.message); } }
    },
    /* Database (H5 B, 2026-11-23): each event also sits in its day's doc ganttDays/<date> as map field tmr.<op> = the
       event JSON (getTimerEvents' shape). The existing day rules allow it (sections untouched), so no rules change;
       a map merge never loses another device's event. Seeded once (last 30 days, gantt/timerMeta { seeded, from });
       the trigger copies events the app wrote into the Timer Log tab. */
    db_() { return storeBackend_('timer') === 'db'; },
    ready_() { return this.db_() && Store.props.getProperty('timerSeeded') === '1'; },
    ev_(t) { return { op: String(t[0]), date: String(t[1]), at: Date.parse(t[2]), act: String(t[3]), blk: String(t[4] || ''), item: String(t[5] || ''),
      name: String(t[6] || ''), value: t[7] === '' || t[7] === null ? null : Number(t[7]), dev: String(t[8] || '') }; },
    q_(op) { return 'tmr.`' + String(op).replace(/[`\\]/g, '_') + '`'; },
    putDb_(tuples) {
      const by = {};
      tuples.forEach(t => { const d = String(t[1]).slice(0, 10); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) (by[d] = by[d] || []).push(t); });
      Object.keys(by).forEach(date => {
        const path = 'ganttDays/' + date, has = StoreFs.get(path), tmr = {}, paths = by[date].map(t => this.q_(t[0]));
        by[date].forEach(t => { tmr[String(t[0]).replace(/[`\\]/g, '_')] = JSON.stringify(this.ev_(t)); });
        const obj = { tmr: tmr };
        if (!has) { obj.date = date; obj.at = 0; paths.push('date', 'at'); }
        StoreFs.patchPaths(path, obj, paths);
      });
    },
    // Events in the day docs on or after `since` (yyyy-MM-dd).
    dbEvents(since) {
      const out = [];
      StoreFs.query('ganttDays', [['date', '>=', since || '0000-00-00']]).forEach(d => {
        Object.keys(d.tmr || {}).forEach(k => { try { const e = JSON.parse(d.tmr[k]); if (e && e.op) out.push(e); } catch (x) {} });
      });
      return out;
    },
    seed_() {
      if (!this.db_() || Store.props.getProperty('timerSeeded') === '1') return 0;
      const from = Utilities.formatDate(new Date(Date.now() - 30 * 864e5), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const rows = this.rows().map(r => [String(r[0]), r[1] instanceof Date ? Utilities.formatDate(r[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[1]),
        r[2] instanceof Date ? r[2].toISOString() : String(r[2]), r[3], r[4], r[5], r[6], r[7], r[8]]).filter(t => t[0] && t[1] >= from);
      this.putDb_(rows);
      StoreFs.set('gantt/timerMeta', { seeded: Date.now(), from: from, at: Date.now() });
      Store.props.setProperty('timerSeeded', '1');
      return rows.length;
    },
    // Trigger: seed once, then events the app wrote (last 14 days) that the tab doesn't have → appended.
    mirror() {
      if (!this.db_()) return 0;
      const n = this.seed_();
      const since = Utilities.formatDate(new Date(Date.now() - 14 * 864e5), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const have = this.ops(), add = this.dbEvents(since).filter(e => !have.has(String(e.op)) && e.at > 0).sort((a, b) => a.at - b.at)
        .map(e => [String(e.op), String(e.date), new Date(Number(e.at)).toISOString(), String(e.act), e.blk || '', e.item || '', e.name || '',
          e.value === null || e.value === undefined ? '' : Number(e.value), e.dev || '']);
      this.append(add, true);
      return n + add.length;
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

  /* App settings on the database (H5 F, 2026-11-23): Reference pins, card categories (subjects), Fun list, New things
     log, Cal Events hide list, auto-archive. Each is one JSON string in a property AND doc gantt/kv_<key> = { key, v,
     at, up, dev } (same "newest wins" rules as gantt/kim, so no rules change). The PWA reads / writes the docs; the
     server keeps reading properties, but a doc newer than the property's stamp (kvAt:<key>) wins and is copied in
     (one Firestore list per run, memoized). Writes go to both. gantt/kvMeta.seeded = the docs exist (seeded once by
     the mirror). Focus, Inbox, calendar picks, Plan + Cal Backlog stay on the server (merge / calendar side effects). */
  kv: {
    KEYS: { refPinned: 'script', cardCats: 'user', funData: 'script', newData: 'script', ceHide: 'script', archiveAuto: 'script' },
    SEED_KEY: 'kvSeeded',
    docs__: null,
    db_() { return storeBackend_('kv') === 'db'; },
    props_(key) { return this.KEYS[key] === 'user' ? Store.userProps : Store.props; },
    docs_() {
      if (this.docs__) return this.docs__;
      const by = {};
      try { StoreFs.list('gantt').forEach(d => { if (d.key && this.KEYS[d.key] && String(d.id_ || '').indexOf('kv_') === 0) by[d.key] = d; }); }
      catch (e) { console.error('kv read: ' + e.message); }
      return (this.docs__ = by);
    },
    get(key) {
      if (!this.KEYS[key]) throw new Error('Store.kv: unknown key ' + key);
      const p = this.props_(key), v = p.getProperty(key);
      if (!this.db_()) return v;
      const d = this.docs_()[key], at = Number(p.getProperty('kvAt:' + key)) || 0;
      if (d && d.v != null && Number(d.at) > at) {
        const o = {}; o[key] = String(d.v); o['kvAt:' + key] = String(d.at);
        p.setProperties(o);
        return String(d.v);
      }
      return v;
    },
    set(key, v) {
      if (!this.KEYS[key]) throw new Error('Store.kv: unknown key ' + key);
      const p = this.props_(key), prev = this.db_() ? this.docs_()[key] : null;
      const at = Math.max(Date.now(), (prev && Number(prev.at) || 0) + 1), o = {};
      o[key] = String(v); o['kvAt:' + key] = String(at);
      p.setProperties(o);
      if (!this.db_()) return v;
      const rec = { key: key, v: String(v), at: at, up: new Date(at), dev: 'server' };
      try { StoreFs.set('gantt/kv_' + key, rec); this.docs_()[key] = rec; } catch (e) { console.error('kv write ' + key + ': ' + e.message); }
      return v;
    },
    seed_() {
      if (!this.db_() || Store.props.getProperty(this.SEED_KEY) === '1') return 0;
      const docs = this.docs_(); let n = 0;
      Object.keys(this.KEYS).forEach(key => {
        if (docs[key]) return;
        const p = this.props_(key), at = Number(p.getProperty('kvAt:' + key)) || 1;
        const rec = { key: key, v: String(p.getProperty(key) || ''), at: at, up: new Date(1000), dev: 'server' };
        StoreFs.set('gantt/kv_' + key, rec); docs[key] = rec; n++;
      });
      StoreFs.set('gantt/kvMeta', { seeded: Date.now(), at: Date.now() });
      Store.props.setProperty(this.SEED_KEY, '1');
      return n;
    },
    // Trigger: seed once, then copy any newer doc (PWA edit) into its property.
    mirror() {
      if (!this.db_()) return 0;
      this.docs__ = null;
      const n = this.seed_();
      Object.keys(this.KEYS).forEach(key => this.get(key));
      return n;
    }
  },

  /* Calendar copy (H5 B2, 2026-11-23): Code.gs calCopySync_ reads the calendar window and hands the events here,
     bucketed by month. Doc ganttCal/<yyyy-MM> = { month, ev (JSON list, getCalendarRange's event shape + uc = urgency
     came from the color), h, n, at, up }; only months whose hash changed are written (hashes in prop calSyncH; a full
     rewrite every 6 h in case a doc went missing). ganttCal/meta = { v, from, to (exclusive), months, cals, failed,
     main, tz, at, up } is written every run, so its `at` = last good copy (the app ignores a copy > 20 min old).
     Read-only for the app (rules); Google Calendar stays the source of truth. */
  cal: {
    COLL: 'ganttCal',
    db_() { return storeBackend_('cal') === 'db'; },
    sync(byMonth, info) {
      if (!this.db_()) return { off: true };
      const props = Store.props, now = Date.now();
      let prev = {};
      try { prev = JSON.parse(props.getProperty('calSyncH') || '{}'); } catch (e) { prev = {}; }
      if (now - (Number(props.getProperty('calSyncFull')) || 0) > 6 * 3600000) { prev = {}; props.setProperty('calSyncFull', String(now)); }
      const list = [], hs = {}, big = [];
      Object.keys(byMonth).sort().forEach(m => {
        const txt = JSON.stringify(byMonth[m]), h = cellHash_(txt);
        if (txt.length > 900000) { big.push(m); return; } // over the doc limit: that month stays on the server path
        hs[m] = h;
        if (prev[m] !== h) list.push([this.COLL + '/' + m, { month: m, ev: txt, h: h, n: byMonth[m].length, at: now, up: new Date(now) }]);
      });
      if (list.length) StoreFs.patchMany(list);
      StoreFs.set(this.COLL + '/meta', { v: 1, from: info.from, to: info.to, months: JSON.stringify(Object.keys(hs)), cals: JSON.stringify(info.cals || []),
        failed: JSON.stringify(info.failed || []), main: String(info.main || ''), tz: String(info.tz || ''), via: String(info.via || ''), at: now, up: new Date(now) });
      props.setProperty('calSyncH', JSON.stringify(hs));
      return { months: Object.keys(hs).length, written: list.length, big: big, at: now };
    },
    // H5 B: the finished Cal Events list (getCalendarEvents' answer) as doc gantt/calEvents = { json, today, at, up };
    // written after the month docs, so its `at` is ≥ the copy's (the app waits for that after an edit).
    events(r) {
      if (!this.db_() || !r) return false;
      const now = Date.now();
      StoreFs.set('gantt/calEvents', { json: JSON.stringify(r), today: String(r.today || ''), at: now, up: new Date(now) });
      return true;
    }
  },

  /* Database mirror (timed trigger, every 5 min): each database area copied into its Sheet tab, then edits that
     lost under "newest edit wins" (written to Firestore ganttBackup by the app) moved into the Backup tab. */
  mirror() {
    if (!FIREBASE_PROJECT_) return { off: true };
    if (!storeDbReady_()) return { off: true, reason: 'database not reachable' };
    return storeLocked_(() => {
      const out = { kim: Store.kim.mirror(), days: Store.days.mirror(), ref: Store.ref.mirror(), kv: Store.kv.mirror(), backups: 0 };
      // D2: Focus, Inbox, Plan (each guarded: one failing area never stops the others).
      ['focus', 'inbox', 'plan', 'timer'].forEach(a => { try { out[a] = Store[a].mirror(); } catch (e) { out[a] = 'error: ' + e.message; console.error(a + ' mirror: ' + e.message); } });
      StoreFs.list('ganttBackup').forEach(b => {
        const where = b.area === 'focus' ? 'Focus' : b.area === 'kim' ? Store.kim.SHEET : b.area === 'days' && b.date ? b.date : b.area === 'ref' && b.card ? 'Reference ' + b.card : 'Database: ' + b.area;
        const col = b.area === 'kim' ? 'A2' : b.area === 'days' ? (Store.days.LABEL[b.field] || b.field || '') : b.area === 'ref' ? 'Content' : '';
        backupCell_(where, col, (b.reason || 'lost edit') + (b.dev ? ' · ' + b.dev : ''), b.html || '');
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
  // Calendar copy (H5 B2): outside the script lock (a calendar read takes a few seconds; saves shouldn't wait).
  try { if (typeof calCopySync_ === 'function') console.log(JSON.stringify({ cal: calCopySync_() })); } catch (e) { console.error('calendar copy: ' + e.message); }
  // D2: Cal Backlog sweep + roll run here (not on opening) and publish the list; Plan rows get their event info.
  try { if (typeof calBacklogTick_ === 'function') console.log(JSON.stringify({ backlog: calBacklogTick_() })); } catch (e) { console.error('backlog: ' + e.message); }
  try { if (typeof planEvRefresh_ === 'function') console.log(JSON.stringify({ planEv: planEvRefresh_() })); } catch (e) { console.error('plan events: ' + e.message); }
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
