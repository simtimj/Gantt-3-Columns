/* =========================================================
   FOCUS WORKSPACE — Code.gs (2026-10-20)

   Speed changes in this version:
   - doGet builds the page with the first screen of data already inside it,
     so the browser does not need a second server request to start.
   - The full sheet setup (date coverage, frozen rows, formats) runs at most
     once per day instead of on every page load and every week load.
   - Lookups read only the Date or ID column, not the whole sheet with all
     of its Today / Journal / Reference text.
   ========================================================= */

const DAYS_HEADERS = ['Date', 'Today', 'Journal'];
const REF_HEADERS = ['ID', 'ParentID', 'Type', 'Title', 'Content', 'Expanded', 'Sort'];
// Deleted Reference cells go here (same columns + when) instead of vanishing.
const ARCHIVE_HEADERS = REF_HEADERS.concat(['DeletedAt']);

// The browser keeps 7 days before today and 3 after on first load.
const INITIAL_PAST_DAYS = 7;
const INITIAL_FUTURE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

// Viewport tags inside Index.html are ignored because the page runs inside
// Google's frame; this is the one that actually applies.
const VIEWPORT =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, ' +
  'viewport-fit=cover, interactive-widget=resizes-content';


function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');

  let initial = null;
  try {
    initial = getWorkspaceData();
  } catch (err) {
    // The page falls back to loading the data itself.
    console.error(err);
  }

  template.initialData = JSON.stringify(initial)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  // Refresh button target: the app's own URL, opened in the top window.
  try { template.appUrl = ScriptApp.getService().getUrl(); } catch (err) { template.appUrl = ''; }

  return template.evaluate()
    .setTitle('Focus Workspace')
    .addMetaTag('viewport', VIEWPORT)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/* =========================================================
   SETUP
   ========================================================= */

// Full setup. Safe to run by hand from the editor at any time.
function setupWorkspace() {
  const days = getOrCreateSheet_('Days', DAYS_HEADERS);
  const reference = getOrCreateSheet_('Reference', REF_HEADERS);

  // Keep a reasonable amount of stored date coverage.
  ensureDayRange_(days, 730, 365);

  days.setFrozenRows(1);
  reference.setFrozenRows(1);
  days.getRange('A:A').setNumberFormat('yyyy-mm-dd');

  PropertiesService.getScriptProperties()
    .setProperty('lastSetupDate', todayString_());

  return true;
}


// Cheap check used by every request: run the full setup only once per day,
// or right away if a sheet is missing.
function ensureSetup_() {
  const today = todayString_();
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetsExist = ss.getSheetByName('Days') && ss.getSheetByName('Reference');

  if (sheetsExist && props.getProperty('lastSetupDate') === today) {
    return;
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return; // Another request is already doing it.
  }

  try {
    const stillNeeded =
      !ss.getSheetByName('Days') ||
      !ss.getSheetByName('Reference') ||
      props.getProperty('lastSetupDate') !== today;

    if (stillNeeded) {
      setupWorkspace();
    }
  } finally {
    lock.releaseLock();
  }
}


/* =========================================================
   WEB APP DATA
   ========================================================= */

function getWorkspaceData() {
  ensureSetup_();
  try { applyClaudeDone_(); } catch (e) { console.error(e); }

  const today = todayString_();

  return {
    days: getDaysRange_(
      addDaysToDateString_(today, -INITIAL_PAST_DAYS),
      addDaysToDateString_(today, INITIAL_FUTURE_DAYS)
    ),
    reference: getReference_(),
    urgent: getUrgentDays_(),
    inbox: (function () { try { return getInbox(); } catch (e) { return []; } })(),
    today: today
  };
}


// Days whose Today text has an urgency-tagged task (data-urg), for the
// Urgent panel in Reference. Reads only the Date and Today columns.
function getUrgentDays_() {
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const out = [];
  values.forEach(row => {
    const html = String(row[1] || '');
    if (html.indexOf('data-urg=') < 0 && html.indexOf('data-due=') < 0) return; // urgent or has a due date
    const key = formatDate_(row[0]);
    if (key) out.push({ date: key, tasks: html });
  });
  return out;
}


function getDaysRange(startDate, endDate) {
  ensureSetup_();
  return getDaysRange_(startDate, endDate);
}


function getDaysRange_(startDate, endDate) {
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  // Read only the Date column to find the rows.
  const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const lo = parseDate_(startDate).getTime() - DAY_MS;
  const hi = parseDate_(endDate).getTime() + DAY_MS;
  const matches = [];

  for (let i = 0; i < dates.length; i++) {
    const value = dates[i][0];

    if (!value) continue;

    // Skip far-away dates without the slower formatting call.
    if (isDate_(value)) {
      const time = value.getTime();
      if (time < lo || time > hi) continue;
    }

    const key = formatDate_(value);

    if (key && key >= startDate && key <= endDate) {
      matches.push({ row: i + 2, date: key });
    }
  }

  if (!matches.length) {
    return [];
  }

  // Read the text for the matching rows, in contiguous runs, so rows that
  // were appended at the bottom don't pull in the whole sheet.
  matches.sort((a, b) => a.row - b.row);

  const runs = [];
  let run = null;

  matches.forEach(match => {
    if (run && match.row - run.end <= 20) {
      run.end = match.row;
      run.items.push(match);
    } else {
      run = { start: match.row, end: match.row, items: [match] };
      runs.push(run);
    }
  });

  const out = [];

  runs.forEach(group => {
    const block = sheet
      .getRange(group.start, 2, group.end - group.start + 1, 2)
      .getValues();

    group.items.forEach(match => {
      const row = block[match.row - group.start];
      out.push({
        date: match.date,
        tasks: String(row[0] || ''),
        journal: String(row[1] || '')
      });
    });
  });

  out.sort((a, b) => a.date.localeCompare(b.date));

  return out;
}


/* =========================================================
   DAY SAVING
   ========================================================= */

function saveDay(dateString, tasks, journal) {
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  const row = findDayRow_(sheet, dateString);

  if (row) {
    sheet.getRange(row, 2, 1, 2).setValues([
      [
        tasks || '',
        journal || ''
      ]
    ]);

    return true;
  }

  sheet.appendRow([
    parseDate_(dateString),
    tasks || '',
    journal || ''
  ]);

  return true;
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


/* =========================================================
   REFERENCE
   ========================================================= */

function getReference_() {
  const sheet = getOrCreateSheet_('Reference', REF_HEADERS);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  return values
    .slice(1)
    .map((row, index) => ({
      row: index + 2,
      id: String(row[0] || ''),
      parentId: String(row[1] || ''),
      type: String(row[2] || 'item'),
      title: String(row[3] || ''),
      content: String(row[4] || ''),
      expanded: row[5] !== false,
      sort: Number(row[6]) || index
    }))
    .sort((a, b) => a.sort - b.sort);
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


function saveReferenceItem(item) {
  const sheet = getOrCreateSheet_('Reference', REF_HEADERS);
  const id = String(item.id || Utilities.getUuid());
  const row = referenceRowMap_(sheet).get(id);

  if (row) {
    sheet.getRange(row, 1, 1, 7).setValues([
      [
        id,
        item.parentId || '',
        item.type || 'item',
        item.title || '',
        item.content || '',
        item.expanded !== false,
        Number(item.sort) || row
      ]
    ]);

    return id;
  }

  sheet.appendRow([
    id,
    item.parentId || '',
    item.type || 'item',
    item.title || '',
    item.content || '',
    item.expanded !== false,
    Number(item.sort) || sheet.getLastRow()
  ]);

  return id;
}


// Drag-to-reorder: write every cell's position in one call.
// order = [{ id, sort }, ...]
function saveReferenceOrder(order) {
  const sheet = getOrCreateSheet_('Reference', REF_HEADERS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2 || !Array.isArray(order)) {
    return true;
  }

  const rows = referenceRowMap_(sheet);
  const sortRange = sheet.getRange(2, 7, lastRow - 1, 1);
  const sorts = sortRange.getValues();

  order.forEach(entry => {
    const row = rows.get(String(entry.id));
    if (row) sorts[row - 2][0] = Number(entry.sort) || 0;
  });

  sortRange.setValues(sorts);

  return true;
}


// Expand / collapse every Reference cell in one call.
function saveReferenceExpanded(expanded) {
  const sheet = getOrCreateSheet_('Reference', REF_HEADERS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return true;
  }

  const values = [];
  for (let i = 0; i < lastRow - 1; i++) {
    values.push([expanded !== false]);
  }

  sheet.getRange(2, 6, lastRow - 1, 1).setValues(values);

  return true;
}


function addReferenceItem(parentId, title, content) {
  const sheet = getOrCreateSheet_('Reference', REF_HEADERS);
  const id = Utilities.getUuid();

  sheet.appendRow([
    id,
    parentId || '',
    'item',
    title || '',
    content || '',
    true,
    sheet.getLastRow()
  ]);

  return id;
}


function deleteReferenceItem(id) {
  const sheet = getOrCreateSheet_('Reference', REF_HEADERS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return true;
  }

  // Whole rows, so deleted cells can be archived before they go.
  const values = sheet.getRange(1, 1, lastRow, REF_HEADERS.length).getValues();

  const idsToDelete = new Set([
    String(id)
  ]);

  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 1; i < values.length; i++) {
      const childId = String(values[i][0] || '');
      const parentId = String(values[i][1] || '');

      if (
        idsToDelete.has(parentId) &&
        !idsToDelete.has(childId)
      ) {
        idsToDelete.add(childId);
        changed = true;
      }
    }
  }

  // Archive first (cell + its children, one timestamp), then delete.
  const deletedAt = new Date().toISOString();
  const archived = values.slice(1)
    .filter(row => idsToDelete.has(String(row[0])))
    .map(row => row.concat([deletedAt]));
  if (archived.length) {
    const archive = getOrCreateSheet_('Archive', ARCHIVE_HEADERS);
    archive.getRange(archive.getLastRow() + 1, 1, archived.length, ARCHIVE_HEADERS.length).setValues(archived);
  }

  for (let i = values.length - 1; i >= 1; i--) {
    if (idsToDelete.has(String(values[i][0]))) {
      sheet.deleteRow(i + 1);
    }
  }

  return true;
}


/* =========================================================
   ARCHIVE — deleted Reference cells, restorable
   ========================================================= */

function archiveRows_() {
  const sheet = getOrCreateSheet_('Archive', ARCHIVE_HEADERS);
  const values = sheet.getDataRange().getValues();
  return values.slice(1).map((row, i) => ({
    row: i + 2,
    id: String(row[0] || ''),
    parentId: String(row[1] || ''),
    type: String(row[2] || 'item'),
    title: String(row[3] || ''),
    content: String(row[4] || ''),
    expanded: row[5] !== false,
    sort: Number(row[6]) || 0,
    deletedAt: row[7] instanceof Date ? row[7].toISOString() : String(row[7] || '')
  })).filter(x => x.id);
}

// Top-level deleted cells (children ride along), newest first.
function getArchive() {
  const rows = archiveRows_();
  const key = x => x.deletedAt + '|' + x.id;
  const keys = new Set(rows.map(key));
  return rows
    .filter(x => !keys.has(x.deletedAt + '|' + x.parentId))
    .map(x => ({
      id: x.id,
      deletedAt: x.deletedAt,
      title: x.title,
      content: x.content,
      children: rows.filter(y => y.deletedAt === x.deletedAt && y.id !== x.id).length
    }))
    .reverse();
}

// Puts a deleted cell (and the children deleted with it) back in Reference.
// If its parent is gone, it comes back at the top level. Returns Reference.
function restoreArchivedItem(id, deletedAt) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const archive = getOrCreateSheet_('Archive', ARCHIVE_HEADERS);
    const rows = archiveRows_().filter(x => x.deletedAt === String(deletedAt));
    const root = rows.find(x => x.id === String(id));
    if (!root) throw new Error('That cell is no longer in the archive.');

    const ids = new Set([root.id]);
    let changed = true;
    while (changed) {
      changed = false;
      rows.forEach(x => {
        if (ids.has(x.parentId) && !ids.has(x.id)) { ids.add(x.id); changed = true; }
      });
    }
    const batch = rows.filter(x => ids.has(x.id));

    const ref = getOrCreateSheet_('Reference', REF_HEADERS);
    const existing = referenceRowMap_(ref);
    const toAdd = batch.filter(x => !existing.has(x.id)).map(x => [
      x.id,
      x.id === root.id && x.parentId && !existing.has(x.parentId) ? '' : x.parentId,
      x.type, x.title, x.content, x.expanded, x.sort
    ]);
    if (toAdd.length) {
      ref.getRange(ref.getLastRow() + 1, 1, toAdd.length, REF_HEADERS.length).setValues(toAdd);
    }

    batch.map(x => x.row).sort((a, b) => b - a).forEach(r => archive.deleteRow(r));
  } finally {
    lock.releaseLock();
  }
  return getReference_();
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function todayString_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


function isDate_(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}


function weekStart_(dateString) {
  const date = parseDate_(dateString);
  const day = date.getDay();

  date.setDate(
    date.getDate() - day
  );

  return formatDate_(date);
}


function addDaysToDateString_(dateString, amount) {
  const date = parseDate_(dateString);

  date.setDate(
    date.getDate() + amount
  );

  return formatDate_(date);
}


/* =========================================================
   INITIAL DATE RANGE
   ========================================================= */

function ensureDayRange_(sheet, pastDays, futureDays) {
  const timezone = Session.getScriptTimeZone();

  const today = new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const existing = new Set();
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    // Date column only.
    sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(row => {
      const date = formatDate_(row[0]);
      if (date) existing.add(date);
    });
  }

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

    const key = Utilities.formatDate(
      date,
      timezone,
      'yyyy-MM-dd'
    );

    if (!existing.has(key)) {
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
        3
      )
      .sort({
        column: 1,
        ascending: true
      });
  }
}


/* =========================================================
   SHEET HELPERS
   ========================================================= */

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(name);

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


function formatDate_(value) {
  if (!value) {
    return '';
  }

  if (isDate_(value)) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  const stringValue = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(stringValue)
  ) {
    return stringValue;
  }

  const date = new Date(value);

  if (isNaN(date)) {
    return stringValue;
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


function parseDate_(dateString) {
  const parts = dateString
    .split('-')
    .map(Number);

  return new Date(
    parts[0],
    parts[1] - 1,
    parts[2]
  );
}

/* =========================================================
   INBOX (2026-10-26, Julius)
   Quick captures that aren't scheduled yet. Two sources:
   - CLAUDE_INBOX in inbox.js — Claude adds items by editing that file and
     pushing to main (Claude can't reach Google directly).
   - Items typed into the app, kept in user properties ("inboxItems").
   Dismissed / sent-to-Today ids are remembered in "inboxDone", so Claude's
   items stay gone even though they're still in inbox.js.
   ========================================================= */
function inboxRead_(key, def) {
  try {
    const v = PropertiesService.getUserProperties().getProperty(key);
    return v ? JSON.parse(v) : def;
  } catch (e) { return def; }
}
function inboxWrite_(key, value) {
  PropertiesService.getUserProperties().setProperty(key, JSON.stringify(value));
}
function getInbox() {
  const done = inboxRead_('inboxDone', []);
  const mine = inboxRead_('inboxItems', []);
  const claude = (typeof CLAUDE_INBOX !== 'undefined' && Array.isArray(CLAUDE_INBOX)) ? CLAUDE_INBOX : [];
  return claude.map(x => Object.assign({ from: 'claude' }, x))
    .concat(mine.map(x => Object.assign({ from: 'app' }, x)))
    .filter(x => x && x.id && done.indexOf(String(x.id)) < 0)
    .map(x => ({
      id: String(x.id), title: String(x.title || ''), details: String(x.details || ''),
      added: String(x.added || ''), from: x.from
    }));
}
function addInboxItem(title, details) {
  title = String(title || '').trim();
  details = String(details || '').trim();
  if (!title && !details) return getInbox();
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    const mine = inboxRead_('inboxItems', []);
    mine.push({ id: 'a' + Date.now(), title: title, details: details, added: todayString_() });
    inboxWrite_('inboxItems', mine.slice(-200));
  } finally { lock.releaseLock(); }
  return getInbox();
}
function dismissInboxItem(id) {
  id = String(id || '');
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    const mine = inboxRead_('inboxItems', []);
    const kept = mine.filter(x => String(x.id) !== id);
    if (kept.length !== mine.length) inboxWrite_('inboxItems', kept);
    else {
      const done = inboxRead_('inboxDone', []);
      if (done.indexOf(id) < 0) done.push(id);
      inboxWrite_('inboxDone', done.slice(-300));
    }
  } finally { lock.releaseLock(); }
  return getInbox();
}


/* =========================================================
   DONE WITH CLAUDE (2026-10-26, Julius)
   Work Julius does through Claude lands in that day's Today / Tasks cell
   as a checked task, as a log of the day. Claude adds entries to
   CLAUDE_DONE in donelog.js and pushes; on the next load each new entry is
   appended once to its day (ids remembered in script properties
   "claudeDoneApplied", so deleting a line in the app keeps it deleted).
   ========================================================= */
function doneEsc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function doneLineHtml_(item) {
  const title = String(item.title || '').trim();
  const details = String(item.details || '').trim();
  const text = title && details ? '<b>' + doneEsc_(title) + '</b>: ' + doneEsc_(details)
    : title ? '<b>' + doneEsc_(title) + '</b>' : doneEsc_(details);
  return '<div class="check-line done" data-level="0" data-cid="' + doneEsc_(item.id) + '">' +
    '<input type="checkbox" checked><span class="check-text">' + text + '</span></div>';
}
function applyClaudeDone_() {
  const list = (typeof CLAUDE_DONE !== 'undefined' && Array.isArray(CLAUDE_DONE)) ? CLAUDE_DONE : [];
  if (!list.length) return;
  const props = PropertiesService.getScriptProperties();
  let applied = [];
  try { applied = JSON.parse(props.getProperty('claudeDoneApplied') || '[]'); } catch (e) { applied = []; }
  const fresh = list.filter(x => x && x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') && applied.indexOf(String(x.id)) < 0);
  if (!fresh.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    const byDate = {};
    fresh.forEach(x => { (byDate[x.date] = byDate[x.date] || []).push(x); });
    Object.keys(byDate).forEach(date => {
      let row = findDayRow_(sheet, date);
      if (!row) { sheet.appendRow([parseDate_(date), '', '']); row = sheet.getLastRow(); }
      const cell = sheet.getRange(row, 2);
      let html = String(cell.getValue() || '');
      byDate[date].forEach(x => {
        if (html.indexOf('data-cid="' + doneEsc_(x.id) + '"') < 0) html += doneLineHtml_(x);
        applied.push(String(x.id));
      });
      cell.setValue(html);
    });
    props.setProperty('claudeDoneApplied', JSON.stringify(applied.slice(-1000)));
  } finally { lock.releaseLock(); }
}
