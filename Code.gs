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
  try { applyClaudeNotes_(); } catch (e) { console.error(e); }

  const today = todayString_();

  return {
    days: getDaysRange_(
      addDaysToDateString_(today, -INITIAL_PAST_DAYS),
      addDaysToDateString_(today, INITIAL_FUTURE_DAYS)
    ),
    reference: getReference_(),
    urgent: getUrgentDays_(),
    inbox: (function () { try { return getInbox(); } catch (e) { return []; } })(),
    cardCats: inboxRead_('cardCats', null),
    today: today
  };
}


// Days whose Today or Notes text has an urgency-tagged task (data-urg), for the
// Urgent panel in Reference. Reads only the Date and Today columns.
function getUrgentDays_() {
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  // Today and Journal (Notes) columns: urgency set on a task in Notes counts too (Julius, 2026-10-27).
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const out = [];
  const has = h => h.indexOf('data-urg=') >= 0 || h.indexOf('data-due=') >= 0; // urgent or has a due date
  values.forEach(row => {
    const html = String(row[1] || ''), journal = String(row[2] || '');
    if (!has(html) && !has(journal)) return;
    const key = formatDate_(row[0]);
    if (key) out.push({ date: key, tasks: has(html) ? html : '', journal: has(journal) ? journal : '' });
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
// Card subjects (name, color, keywords) edited in Options — one list for all devices (2026-10-27).
function saveCardCats(list) {
  if (!Array.isArray(list)) return false;
  const clean = list.filter(c => c && /^[a-z]{2,12}$/.test(c.key || '')).slice(0, 30).map(c => ({
    key: c.key, name: String(c.name || c.key).slice(0, 24),
    color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#9ca3af',
    words: String(c.words || '').slice(0, 2000)
  }));
  inboxWrite_('cardCats', clean);
  return true;
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
// Grouped layout (2026-10-26, Julius): one underlined project header per
// project (plain line, his own header style), then each piece of work as a
// checked task under it,
// "<b>Short name</b>: details". Entries: { id, date, project, title, details }
// (older entries without `project` used title = project).
function doneProject_(item) { return String(item.project || item.title || '').trim(); }
function doneItemName_(item) { return item.project ? String(item.title || '').trim() : ''; }
function doneCheck_(checked) { return '<input type="checkbox"' + (checked ? ' checked' : '') + '>'; }
function doneHeaderHtml_(project) {
  return '<div data-cgrp="' + doneEsc_(project) + '"><b><u>' + doneEsc_(project) + '</u></b></div>';
}
function doneItemHtml_(name, details, checked, cid) {
  // Claude's lines start with "*" (no space) so Julius can tell them from his own (2026-10-26).
  if (cid) {
    if (name) name = '*' + String(name).replace(/^\*+/, '');
    else details = '*' + String(details || '').replace(/^\*+/, '');
  }
  const text = name && details ? '<b>' + doneEsc_(name) + '</b>: ' + doneEsc_(details)
    : name ? '<b>' + doneEsc_(name) + '</b>' : doneEsc_(details);
  return '<div class="check-line' + (checked ? ' done' : '') + '" data-level="0"' +
    (cid ? ' data-cid="' + doneEsc_(cid) + '"' : '') + '>' + doneCheck_(checked) +
    '<span class="check-text">' + text + '</span></div>';
}
// Old single-line form, still written first and then folded into its group.
function doneLineHtml_(item) {
  return '<div class="check-line done" data-level="0" data-cid="' + doneEsc_(item.id) + '"' +
    ' data-cproj="' + doneEsc_(doneProject_(item)) + '">' + doneCheck_(true) +
    '<span class="check-text">' + doneEsc_(doneItemName_(item) ? doneItemName_(item) + ': ' : '') + doneEsc_(item.details || '') + '</span></div>';
}

// Split cell HTML into top-level blocks (div / p depth tracking).
function doneBlocks_(html) {
  const out = [];
  const re = /<\/?(div|p)\b[^>]*>/gi; // <p> lines are blocks too
  let depth = 0, start = 0, m, last = 0;
  while ((m = re.exec(html))) {
    if (m[0][1] !== '/') { if (depth === 0) { if (m.index > last) out.push(html.slice(last, m.index)); start = m.index; } depth++; }
    else if (depth > 0) { depth--; if (depth === 0) { out.push(html.slice(start, re.lastIndex)); last = re.lastIndex; } }
  }
  if (last < html.length) out.push(html.slice(last));
  return out.filter(b => b !== '');
}
const doneAttr_ = (b, name) => { const m = b.match(new RegExp('^<div\\b[^>]*\\s' + name + '="([^"]*)"', 'i')); return m ? m[1] : null; };
const doneText_ = b => { const m = b.match(/<span class="check-text">([\s\S]*)<\/span>\s*<\/div>\s*$/i); return m ? m[1] : null; };
const doneUnesc_ = s => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const doneStrip_ = s => doneUnesc_(String(s).replace(/<[^>]*>/g, '')).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// Fold Claude's lines in one cell into project groups. Lines Julius wrote
// himself stay where they are; a group sits where its first line was.
function groupClaudeDone_(html, list) {
  const byId = {}, byOld = {}, projects = {};
  list.forEach(x => {
    byId[x.id] = x;
    projects[doneProject_(x)] = true;
    if (x.was) byOld[doneProject_(x) + '|' + String(x.was).replace(/\s+/g, ' ').trim()] = x;
  });
  const blocks = doneBlocks_(html);
  const order = [], groups = {}, slots = [];
  const groupOf = p => { if (!groups[p]) { groups[p] = []; order.push(p); slots.push({ group: p }); } return groups[p]; };
  let current = null;
  blocks.forEach(b => {
    const isLine = /^<div\b[^>]*class="[^"]*check-line/i.test(b);
    const level = Number(doneAttr_(b, 'data-level') || 0);
    const text = isLine ? doneText_(b) : null;
    const checked = /<input\b[^>]*\schecked/i.test(b);
    if (!isLine && /^<(div|p)\b/i.test(b)) {
      const plain = doneStrip_(b);
      const header = doneAttr_(b, 'data-cgrp') || (/<u\b/i.test(b) && /<(b|strong)\b/i.test(b) && projects[plain] ? plain : null);
      if (header != null) { current = groupOf(doneUnesc_(header)); return; }
    }
    if (isLine && level === 0 && text != null) {
      const cid = doneAttr_(b, 'data-cid');
      let item = cid && byId[cid];
      let proj = item ? doneProject_(item) : doneAttr_(b, 'data-cproj');
      if (!proj) {
        const m = text.match(/^\s*<(b|strong)>([\s\S]*?)<\/\1>\s*:\s*([\s\S]*)$/i);
        if (m && projects[doneStrip_(m[2])]) {
          proj = doneStrip_(m[2]);
          item = item || byOld[proj + '|' + doneStrip_(m[3])];
          if (!item) { groupOf(proj).push(doneItemHtml_('', doneStrip_(m[3]), checked, cid)); return; }
        }
      }
      if (proj) {
        proj = doneUnesc_(proj);
        const name = item ? doneItemName_(item) : '';
        const details = item ? String(item.details || '') : doneStrip_(text);
        groupOf(proj).push(doneItemHtml_(name, details, checked, item ? item.id : cid));
        return;
      }
    }
    if (current && isLine) { current.push(b); return; }
    current = null;
    slots.push({ block: b });
  });
  // A blank line before and after each group so groups don't run together
  // (Julius, 2026-10-26); existing blank lines are reused, never doubled.
  const BLANK = '<p><br></p>';
  const isBlank = b => /^<(p|div)\b[^>]*>(\s|&nbsp;|<br\b[^>]*>)*<\/(p|div)>$/i.test(b);
  const parts = [];
  slots.forEach((s, i) => {
    if (s.group == null) {
      if (parts.length && parts[parts.length - 1].group && !isBlank(s.block)) parts.push({ block: BLANK });
      parts.push(s);
      return;
    }
    if (!groups[s.group].length) return;
    const prev = parts[parts.length - 1];
    if (prev && (prev.group || !isBlank(prev.block))) parts.push({ block: BLANK });
    parts.push({ group: s.group, html: doneHeaderHtml_(s.group) + groups[s.group].join('') });
  });
  return parts.map(p => p.group ? p.html : p.block).join('');
}

function applyClaudeDone_() {
  const list = (typeof CLAUDE_DONE !== 'undefined' && Array.isArray(CLAUDE_DONE)) ? CLAUDE_DONE : [];
  if (!list.length) return;
  const props = PropertiesService.getScriptProperties();
  let applied = [];
  try { applied = JSON.parse(props.getProperty('claudeDoneApplied') || '[]'); } catch (e) { applied = []; }
  const valid = list.filter(x => x && x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date || ''));
  const fresh = valid.filter(x => applied.indexOf(String(x.id)) < 0);
  // One-time pass: regroup days already written in the old flat style.
  // '2' (2026-10-26): re-render past days once so old lines get the "*" prefix.
  const migrate = props.getProperty('claudeDoneGrouped') !== '2';
  if (!fresh.length && !migrate) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    const byDate = {};
    fresh.forEach(x => { (byDate[x.date] = byDate[x.date] || []).push(x); });
    if (migrate) valid.forEach(x => { byDate[x.date] = byDate[x.date] || []; });
    Object.keys(byDate).forEach(date => {
      let row = findDayRow_(sheet, date);
      if (!row) {
        if (!byDate[date].length) return;
        sheet.appendRow([parseDate_(date), '', '']); row = sheet.getLastRow();
      }
      const cell = sheet.getRange(row, 2);
      const before = String(cell.getValue() || '');
      let html = before;
      byDate[date].forEach(x => {
        if (html.indexOf('data-cid="' + doneEsc_(x.id) + '"') < 0) html += doneLineHtml_(x);
        applied.push(String(x.id));
      });
      html = groupClaudeDone_(html, valid);
      if (html !== before) cell.setValue(html);
    });
    props.setProperty('claudeDoneApplied', JSON.stringify(applied.slice(-1000)));
    props.setProperty('claudeDoneGrouped', '2');
  } finally { lock.releaseLock(); }
}


/* =========================================================
   CLAUDE NOTES: suggested day + day wrap-up (2026-10-26, Julius)
   A nightly (~10 pm) Claude run adds entries to CLAUDE_NOTES in dayplan.js:
   'plan' goes at the top of that date's Notes (Journal) cell, 'wrap' at the
   end. Applied once per id (script property "claudeNotesApplied").
   ========================================================= */
function noteInline_(s) {
  return doneEsc_(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<u>$1</u>');
}
// One rendered line of a note block (2026-10-26, Julius): '- x' keeps a real dash (no dots),
// '[] x' is a checkbox task with a "→ Day" send button (data-send), '__x__' underlines.
// Leading spaces nest (2 per level, Julius 2026-10-26): '  [] x' is a subtask under the task
// above (sending the parent takes its subtasks); '  x' is an indented detail line under an item.
// opt.gap adds a little space above a '- ' item (cells mode: entries are separated without blank lines).
function noteLineHtml_(line, opt) {
  line = String(line == null ? '' : line);
  if (!line.trim()) return '<div><br></div>';
  const lead = (line.match(/^ */) || [''])[0].length;
  const level = Math.min(6, Math.floor(lead / 2));
  line = line.replace(/^ +/, '');
  if (/^##\s+/.test(line)) return '<div><b><u>' + noteInline_(line.replace(/^##\s+/, '')) + '</u></b></div>';
  if (/^\[\s?\]\s+/.test(line)) return '<div class="check-line" data-level="' + level + '" data-send="1"' +
    (level ? ' style="margin-left: ' + (level * 24) + 'px;"' : '') + '>' + doneCheck_(false) +
    '<span class="check-text">' + noteInline_(line.replace(/^\[\s?\]\s+/, '')) + '</span></div>';
  if (/^-\s+/.test(line)) {
    const st = (opt && opt.gap ? 'padding-top: 6px;' : '') + (level ? ' padding-left: ' + (level * 16) + 'px;' : '');
    return '<div' + (st ? ' style="' + st.trim() + '"' : '') + '>- ' + noteInline_(line.replace(/^-\s+/, '')) + '</div>';
  }
  if (level) return '<div style="padding-left: ' + (level * 14) + 'px;">' + noteInline_(line) + '</div>';
  return '<div' + (opt && opt.gap ? ' style="padding-top: 6px;"' : '') + '>' + noteInline_(line) + '</div>';
}
// Boxed (Julius, 2026-10-26): the whole block sits in a table so it reads as a contained card;
// styled by .editor table[data-cnote] in Index.html. cells:true (tried for the Suggested day,
// Julius 2026-10-26): each '##' section gets its own row (divided cells) and '- ' entries get a
// small gap above instead of blank lines, to stay space efficient
// ('__Area__' header lines too, for the wrap-up's Focus and Priority check, Julius 2026-10-26).
function noteBlockHtml_(item) {
  const kind = item.kind === 'wrap' ? 'wrap' : 'plan';
  const title = item.title || (kind === 'wrap' ? 'Day Wrap-Up' : 'Suggested Day');
  const rows = [];
  let cur = '<div><b><u>' + doneEsc_(title) + '</u></b> <i>· Claude</i></div>';
  let first = true; // first entry in the current cell gets no gap
  (item.lines || []).forEach(line => {
    const raw = String(line == null ? '' : line);
    if (item.cells && /^##\s+/.test(raw)) { rows.push(cur); cur = ''; first = true; }
    if (item.cells && !raw.trim()) return; // cells mode spaces entries itself
    const isItem = /^(-\s+|__)/.test(raw); // '- ' entries and '__Area__' headers start a spaced entry
    cur += noteLineHtml_(raw, { gap: item.cells && isItem && !first });
    if (isItem) first = false;
  });
  rows.push(cur);
  return '<table data-cnote="' + doneEsc_(item.id) + '" data-ckind="' + kind + '"' + (item.cells ? ' data-ccells="1"' : '') +
    '><tbody>' + rows.map(r => '<tr><td>' + r + '</td></tr>').join('') + '</tbody></table>';
}

// Pre-box flat form, only to find and convert blocks written before 2026-10-26 boxing.
function noteBlockFlatHtml_(item) {
  const kind = item.kind === 'wrap' ? 'wrap' : 'plan';
  const title = item.title || (kind === 'wrap' ? 'Day Wrap-Up' : 'Suggested Day');
  let html = '<div data-cnote="' + doneEsc_(item.id) + '"><b><u>' + doneEsc_(title) + '</u></b> <i>· Claude</i></div>';
  (item.lines || []).forEach(line => {
    line = String(line == null ? '' : line);
    if (!line.trim()) html += '<div><br></div>';
    else if (/^##\s+/.test(line)) html += '<div><b><u>' + noteInline_(line.replace(/^##\s+/, '')) + '</u></b></div>';
    else if (/^-\s+/.test(line)) html += '<div>• ' + noteInline_(line.replace(/^-\s+/, '')) + '</div>';
    else html += '<div>' + noteInline_(line) + '</div>';
  });
  return html;
}

function applyClaudeNotes_() {
  const list = (typeof CLAUDE_NOTES !== 'undefined' && Array.isArray(CLAUDE_NOTES)) ? CLAUDE_NOTES : [];
  if (!list.length) return;
  const props = PropertiesService.getScriptProperties();
  let applied = [];
  try { applied = JSON.parse(props.getProperty('claudeNotesApplied') || '[]'); } catch (e) { applied = []; }
  const valid = list.filter(x => x && x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date || ''));
  const fresh = valid.filter(x => applied.indexOf(String(x.id)) < 0);
  // rev (2026-10-26): bumping an entry's rev re-renders its block in place, once per rev.
  // If he deleted the block, it stays deleted.
  const revKey = x => String(x.id) + '@' + x.rev;
  const redo = valid.filter(x => x.rev && applied.indexOf(String(x.id)) >= 0 && applied.indexOf(revKey(x)) < 0);
  const box = props.getProperty('claudeNotesBoxed') !== '1';
  if (!fresh.length && !redo.length && !box) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    fresh.forEach(x => {
      let row = findDayRow_(sheet, x.date);
      if (!row) { sheet.appendRow([parseDate_(x.date), '', '']); row = sheet.getLastRow(); }
      const cell = sheet.getRange(row, 3);
      const before = String(cell.getValue() || '');
      if (before.indexOf('data-cnote="' + doneEsc_(x.id) + '"') < 0) {
        const block = noteBlockHtml_(x);
        const gap = '<div><br></div>';
        const html = !before.trim() ? block
          : x.kind === 'wrap' ? before + gap + block
          : block + gap + before;
        cell.setValue(html);
      }
      applied.push(String(x.id));
      if (x.rev) applied.push(revKey(x));
    });
    redo.forEach(x => {
      const row = findDayRow_(sheet, x.date);
      if (row) {
        const cell = sheet.getRange(row, 3);
        const html = String(cell.getValue() || '');
        const re = new RegExp('<table[^>]*data-cnote="' + doneEsc_(x.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>[\\s\\S]*?<\\/table>');
        if (re.test(html)) cell.setValue(html.replace(re, function () { return noteBlockHtml_(x); }));
      }
      applied.push(revKey(x));
    });
    if (box) {
      // One-time: put blocks written before boxing into the box (2026-10-26).
      list.filter(x => x && x.id && applied.indexOf(String(x.id)) >= 0).forEach(x => {
        const row = findDayRow_(sheet, x.date);
        if (!row) return;
        const cell = sheet.getRange(row, 3);
        const html = String(cell.getValue() || '');
        const flat = noteBlockFlatHtml_(x);
        if (html.indexOf(flat) >= 0) cell.setValue(html.replace(flat, noteBlockHtml_(x)));
      });
      props.setProperty('claudeNotesBoxed', '1');
    }
    props.setProperty('claudeNotesApplied', JSON.stringify(applied.slice(-1000)));
  } finally { lock.releaseLock(); }
}


/* =========================================================
   CALENDAR EVENTS (2026-10-26, Julius)
   Reference panel between Urgent and Inbox: today's events, then the next
   few days. Read straight from Google Calendar, so anything Claude or a
   script (e.g. the dog-walk "walking block") adds shows up on reload.
   Calendars: his main one plus "Events" (gigs etc.). Add ids to
   EVENT_CALENDARS to include more.
   ========================================================= */
const EVENT_CALENDARS = [
  'juliussimtim@gmail.com',
  'd9463b07581a50b3e95948fa273e7971bdcde4f97ebf8070c4cf0b215e8f063b@group.calendar.google.com' // Events
];
const EVENT_DAYS_AHEAD = 3;

function getCalendarEvents() {
  const tz = Session.getScriptTimeZone();
  const today = todayString_();
  const start = parseDate_(today);
  const end = parseDate_(addDaysToDateString_(today, EVENT_DAYS_AHEAD + 1));
  const out = [];
  EVENT_CALENDARS.forEach(id => {
    let cal = null;
    try { cal = CalendarApp.getCalendarById(id); } catch (e) { cal = null; }
    if (!cal) return;
    const calName = cal.getName();
    cal.getEvents(start, end).forEach(ev => {
      const allDay = ev.isAllDayEvent();
      const s = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
      const e = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
      let link = '';
      try {
        link = 'https://www.google.com/calendar/event?eid=' +
          Utilities.base64EncodeWebSafe(ev.getId().split('@')[0] + ' ' + id).replace(/=+$/, '');
      } catch (err) { link = ''; }
      out.push({
        title: ev.getTitle() || '(no title)',
        cal: calName,
        allDay: allDay,
        date: Utilities.formatDate(s, tz, 'yyyy-MM-dd'),
        endDate: Utilities.formatDate(allDay ? new Date(e.getTime() - 1) : e, tz, 'yyyy-MM-dd'),
        start: s.getTime(),
        end: e.getTime(),
        location: ev.getLocation() || '',
        link: link
      });
    });
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (b.allDay - a.allDay) || a.start - b.start);
  return { today: today, events: out };
}

// Run once from the script editor if the app ever asks for calendar access.
function authorizeCalendar() {
  return CalendarApp.getDefaultCalendar().getName();
}


/* Send several tasks (a task and its subtasks) to a day's Today cell in one write
   (2026-10-26, Julius): items = [{html, level}], levels relative to the sent task. */
function appendTasksToDay(dateString, items) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) throw new Error('Bad date');
  if (!Array.isArray(items) || !items.length) return false;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    let row = findDayRow_(sheet, dateString);
    if (!row) { sheet.appendRow([parseDate_(dateString), '', '']); row = sheet.getLastRow(); }
    const cell = sheet.getRange(row, 2);
    let html = String(cell.getValue() || '');
    items.forEach(it => {
      const level = Math.max(0, Math.min(6, Math.floor(Number(it && it.level) || 0)));
      html += '<div class="check-line" data-level="' + level + '"' + (level ? ' style="margin-left: ' + (level * 24) + 'px;"' : '') + '>' +
        doneCheck_(false) + '<span class="check-text">' + String((it && it.html) || '') + '</span></div>';
    });
    cell.setValue(html);
    return true;
  } finally { lock.releaseLock(); }
}

/* Send a task to a day's Today cell (2026-10-26, Julius): used by the "→ Day"
   button on carry-over tasks when that day isn't loaded in the app. */
function appendTaskToDay(dateString, textHtml) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) throw new Error('Bad date');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    let row = findDayRow_(sheet, dateString);
    if (!row) { sheet.appendRow([parseDate_(dateString), '', '']); row = sheet.getLastRow(); }
    const cell = sheet.getRange(row, 2);
    const before = String(cell.getValue() || '');
    const line = '<div class="check-line" data-level="0">' + doneCheck_(false) +
      '<span class="check-text">' + String(textHtml || '') + '</span></div>';
    cell.setValue(before + line);
    return true;
  } finally { lock.releaseLock(); }
}


/* Saved looks → Sheet (Julius, 2026-10-27): Options → Save also writes the snapshot to the "Looks" tab
   (one row per slot + device, newest wins) so Claude can read it via the Sheets connector and bake it in as the default. */
function saveLookSnapshot(slot, json, ua) {
  slot = String(slot || 'custom').slice(0, 20);
  try { JSON.parse(json); } catch (e) { return false; }
  const dev = /iPhone|Android.*Mobile/.test(ua || '') ? 'phone' : /iPad|Android|Tablet/.test(ua || '') ? 'tablet' : 'desktop';
  const sh = getOrCreateSheet_('Looks', ['Slot', 'Device', 'Saved', 'Settings (JSON)']);
  const vals = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).getValues();
  let row = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i][0] === slot && vals[i][1] === dev) { row = i + 1; break; }
  if (!row) row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, 4).setValues([[slot, dev, new Date(), String(json).slice(0, 45000)]]);
  return true;
}
