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


function doGet(e) {
  // Time Tracker (2026-11-05): separate app in tracker/, its own spreadsheet; /dev?app=tracker.
  if (e && e.parameter && e.parameter.app === 'tracker') return trackerPage_();
  const template = HtmlService.createTemplateFromFile('Index');

  let initial = null;
  try {
    initial = getWorkspaceData({ fast: true }); // imports run after the page draws (runImports)
  } catch (err) {
    // The page falls back to loading the data itself.
    console.error(err);
  }

  const evalStart = Date.now();
  if (initial && initial.timing) {
    const kb = v => Math.round(JSON.stringify(v || '').length / 1024);
    initial.timing.kb = { days: kb(initial.days), reference: kb(initial.reference), urgent: kb(initial.urgent), seeds: kb(initial.notesSeeds) };
    // How long the previous load spent building the page (can't be known before it's built).
    try { initial.timing.steps.prevPageBuild = Number(CacheService.getScriptCache().get('speedPageMs')) || 0; } catch (e) {}
  }

  template.initialData = JSON.stringify(initial)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  // Refresh button target: the app's own URL, opened in the top window.
  try { template.appUrl = ScriptApp.getService().getUrl(); } catch (err) { template.appUrl = ''; }
  template.build = appBuild_(true);

  const page = template.evaluate()
    .setTitle('Focus Workspace')
    .addMetaTag('viewport', VIEWPORT)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  try { CacheService.getScriptCache().put('speedPageMs', String(Date.now() - evalStart), 3600); } catch (e) {}
  return page;
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
  // Already set up today: one property read (2026-11-05: the two sheet look-ups cost ~0.3 s every load;
  // a missing tab is still created by getOrCreateSheet_ wherever it's used).
  if (props.getProperty('lastSetupDate') === today) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

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

/* Imports that write into the sheet (Done Log, AI tasks, To Confirm card, study log, schedule moves, one-time
   fixes). Fast start (2026-11-05, Julius: "update what it needs, like Google Sheets"): the first page load
   (doGet → getWorkspaceData({fast:true})) skips them and shows what's saved; the page then calls runImports(),
   which runs them and returns only the cells that changed, merged in place by the same code as fwSync. */
function runImportSteps_(t) {
  try { applyDeployedCodeLog_(); } catch (e) { console.error(e); } t.mark('deployLog');
  try { applyClaudeDone_(); } catch (e) { console.error(e); } t.mark('done');
  try { applyClaudeNotes_(); } catch (e) { console.error(e); } t.mark('notes');
  try { applyClaudeTasks_(); } catch (e) { console.error(e); } t.mark('tasks');
  try { syncConfirmCard_(); } catch (e) { console.error(e); } t.mark('confirm');
  try { syncStudyLog_(); } catch (e) { console.error(e); } t.mark('study');
  try { moveScheduleToNotes_(); } catch (e) { console.error(e); } t.mark('schedule');
  try { fixUrgentBold_(); } catch (e) { console.error(e); } t.mark('fixBold');
  try { removeDaySections_(); } catch (e) { console.error(e); } t.mark('fixSecs');
}

function runImports(req) {
  const t = speedTimer_();
  runImportSteps_(t);
  const out = syncDiff_(req || {}, t);
  try { out.inbox = getInbox(); } catch (e) { console.error(e); } t.mark('inbox');
  out.timing = t.done();
  return out;
}

function getWorkspaceData(opts) {
  const fast = !!(opts && opts.fast);
  const t = speedTimer_();
  ensureSetup_(); t.mark('setup');
  if (!fast) runImportSteps_(t);

  const today = todayString_();
  // One read of the whole Days sheet for Urgent + Dailies seeds (2026-11-04: each used to read it on its own,
  // ~800 rows of History HTML twice per load). Read after the apply steps above, so it includes their writes.
  const allDays = readAllDays_(); t.mark('readAllDays');

  const days = getDaysRange_(
    addDaysToDateString_(today, -INITIAL_PAST_DAYS),
    addDaysToDateString_(today, INITIAL_FUTURE_DAYS)
  ); t.mark('days');
  const reference = getReference_(); t.mark('reference');
  const urgent = getUrgentDays_(allDays); t.mark('urgent');
  const inbox = fast ? [] : (function () { try { return getInbox(); } catch (e) { return []; } })(); t.mark('inbox'); // fast: comes with runImports
  const cardCats = getCardCats_(); t.mark('cardCats');
  const refPins = getRefPins_(); t.mark('pins');
  const notesSeeds = getNotesSeeds_(today, allDays); t.mark('seeds');

  return {
    days: days,
    reference: reference,
    urgent: urgent,
    inbox: inbox,
    cardCats: cardCats,
    refPins: refPins,
    notesSeeds: notesSeeds,
    today: today,
    timing: Object.assign(t.done(), { dayRows: allDays.rows.length, refRows: reference.length, fast: fast })
  };
}

/* Speed timing (2026-11-04, Julius: measure, then fix). Each load's server steps + the browser's numbers go to
   the "Speed Log" tab, sent by the page after it has drawn, so logging never slows the load. Last 300 rows kept. */
const SPEED_HEADERS = ['When', 'Kind', 'Total ms', 'Steps', 'Client', 'KB'];
function speedTimer_() {
  const start = Date.now(), steps = {};
  let last = start;
  return {
    mark: name => { const n = Date.now(); steps[name] = n - last; last = n; },
    done: () => ({ total: Date.now() - start, steps: steps })
  };
}
function logSpeed(kind, timing, client) {
  const sheet = getOrCreateSheet_('Speed Log', SPEED_HEADERS);
  const t = timing || {};
  sheet.appendRow([new Date(), String(kind || ''), Number(t.total) || 0, JSON.stringify(t.steps || {}),
    JSON.stringify(client || {}), JSON.stringify(t.kb || {})]);
  const last = sheet.getLastRow();
  if (last > 320) sheet.deleteRows(2, last - 301);
}

// Dailies belong to every day (Julius, 2026-11-03). Carry the latest saved
// section forward, even after a gap longer than the visible date window.
// Read only: historical cells and their completion states remain untouched.
// Every Days row as {date, values} (columns A–D when present), read once.
function readAllDays_() {
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { width: 3, rows: [] };
  const width = sheet.getMaxColumns() >= 4 ? 4 : 3;
  return { width: width, rows: sheet.getRange(2, 1, lastRow - 1, width).getValues() };
}

function getNotesSeeds_(today, allDays) {
  const seeds = {};
  const rows = (allDays || readAllDays_()).rows;
  if (!rows.length) return seeds;
  rows.forEach(row => {
    const journal = String(row[2] || '');
    if (journal.indexOf('data-nsec') < 0) return; // skip the date formatting for most rows
    const date = formatDate_(row[0]);
    ['must', 'focus'].forEach(kind => {
      if (date && date <= today && (!seeds[kind] || date > seeds[kind].date) &&
          new RegExp('data-nsec=["\']' + kind + '["\']').test(journal))
        seeds[kind] = { date: date, journal: journal };
    });
  });
  return seeds;
}


// Days whose Today or Notes text has an urgency-tagged task (data-urg), for the
// Urgent panel in Reference. Reads only the Date and Today columns.
function getUrgentDays_(allDays) {
  // Today and Journal (Notes) columns: urgency set on a task in Notes counts too (Julius, 2026-10-27).
  // Plus the Plan pad (column D, 2026-10-29) when the sheet has it.
  const all = allDays || readAllDays_();
  const width = all.width, values = all.rows;
  if (!values.length) return [];
  const out = [];
  const has = h => h.indexOf('data-urg=') >= 0 || h.indexOf('data-due=') >= 0; // urgent or has a due date
  values.forEach(row => {
    const html = String(row[1] || ''), journal = String(row[2] || ''), plan = width > 3 ? String(row[3] || '') : '';
    if (!has(html) && !has(journal) && !has(plan)) return;
    const key = formatDate_(row[0]);
    if (key) out.push({ date: key, tasks: has(html) ? html : '', journal: has(journal) ? journal : '', plan: has(plan) ? plan : '' });
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
    // Column D = Plan pad (one-day view, 2026-10-29) when the sheet has it.
    const width = sheet.getMaxColumns() >= 4 ? 3 : 2;
    const block = sheet
      .getRange(group.start, 2, group.end - group.start + 1, width)
      .getValues();

    group.items.forEach(match => {
      const row = block[match.row - group.start];
      const plan = width > 2 ? String(row[2] || '') : '';
      out.push({
        date: match.date,
        tasks: String(row[0] || ''),
        journal: String(row[1] || ''),
        plan: plan,
        th: cellHash_(row[0]),
        jh: cellHash_(row[1]),
        ph: cellHash_(plan)
      });
    });
  });

  out.sort((a, b) => a.date.localeCompare(b.date));

  return out;
}


/* =========================================================
   DAY SAVING
   ========================================================= */

/* Safe saves (Julius, 2026-10-29: "bulletproof, never lose anything").
   The app sends what it changed plus the version (hash) of the cell it started from.
   - Cell unchanged on the server since then → write.
   - Cell changed elsewhere (another tab/device, Claude's done log, a server move) → do NOT
     overwrite; send the current cell back so the app merges both sides and saves again.
   - A column the app didn't change is never written (saving Today can't clobber Notes).
   Read-compare-write runs under the script lock. Old app tabs (no opts) still save, but the
   cell they overwrite is copied to the Backup tab first. */
function saveDay(dateString, tasks, journal, opts) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    const row = findDayRow_(sheet, dateString);
    let curT = '', curJ = '';
    if (row) {
      const v = sheet.getRange(row, 2, 1, 2).getValues()[0];
      curT = String(v[0] || ''); curJ = String(v[1] || '');
    }
    tasks = String(tasks || ''); journal = String(journal || '');

    if (!opts) {
      if (curT && curT !== tasks) backupCell_(dateString, 'Today', 'old app tab', curT, true);
      if (curJ && curJ !== journal) backupCell_(dateString, 'Notes', 'old app tab', curJ, true);
      if (row) sheet.getRange(row, 2, 1, 2).setValues([[tasks, journal]]);
      else sheet.appendRow([parseDate_(dateString), tasks, journal]);
      return true;
    }

    const t = syncCol_(curT, tasks, opts.th, opts.ct, dateString, 'Today');
    const j = syncCol_(curJ, journal, opts.jh, opts.cj, dateString, 'Notes');
    if (t.write || j.write) {
      if (row) sheet.getRange(row, 2, 1, 2).setValues([[t.value, j.value]]);
      else sheet.appendRow([parseDate_(dateString), t.value, j.value]);
    }
    const res = { th: cellHash_(t.value), jh: cellHash_(j.value), conflictT: !!t.conflict, conflictJ: !!j.conflict, build: appBuild_() };
    if (t.sendBack) res.tasks = t.value;
    if (j.sendBack) res.journal = j.value;
    return res;
  } finally {
    lock.releaseLock();
  }
}

/* Plan pad (Julius, 2026-10-29): free planning / thinking space under the Today cell in the
   one-day view. Stored in Days column D ("Plan"). Same safe-save rule as saveDay: write only if
   the cell still matches the version the app started from, else send the server copy back. */
function savePlanPad(dateString, html, baseHash) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    if (sheet.getMaxColumns() < 4) sheet.insertColumnsAfter(sheet.getMaxColumns(), 4 - sheet.getMaxColumns());
    if (!sheet.getRange(1, 4).getValue()) sheet.getRange(1, 4).setValue('Plan');
    let row = findDayRow_(sheet, dateString);
    const cur = row ? String(sheet.getRange(row, 4).getValue() || '') : '';
    html = String(html || '');
    const same = baseHash ? cellHash_(cur) === baseHash : cur === '';
    if (!same) return { ph: cellHash_(cur), conflict: true, plan: cur, build: appBuild_() };
    if (cur.length > 400 && html.length < cur.length * 0.6) backupCell_(dateString, 'Plan', 'big shrink', cur);
    if (!row) {
      sheet.appendRow([parseDate_(dateString), '', '']);
      row = sheet.getLastRow();
    }
    sheet.getRange(row, 4).setValue(html);
    return { ph: cellHash_(html), build: appBuild_() };
  } finally {
    lock.releaseLock();
  }
}

/* Daily Scratch Pad (2026-11-03, Julius): one free-writing pad per day, Days column E. Loaded on demand.
   Safe save like savePlanPad: the server copy comes back if it changed since the app read it. */
function ensureScratchCol_(sheet) {
  if (sheet.getMaxColumns() < 5) sheet.insertColumnsAfter(sheet.getMaxColumns(), 5 - sheet.getMaxColumns());
  if (!sheet.getRange(1, 5).getValue()) sheet.getRange(1, 5).setValue('Scratch');
}
function getScratchPad(dateString) {
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  ensureScratchCol_(sheet);
  const row = findDayRow_(sheet, dateString);
  const html = row ? String(sheet.getRange(row, 5).getValue() || '') : '';
  return { html: html, h: cellHash_(html) };
}
function saveScratchPad(dateString, html, baseHash) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    ensureScratchCol_(sheet);
    let row = findDayRow_(sheet, dateString);
    const cur = row ? String(sheet.getRange(row, 5).getValue() || '') : '';
    html = String(html || '');
    if (baseHash && cellHash_(cur) !== baseHash) return { conflict: true, html: cur, h: cellHash_(cur) };
    if (cur.length > 400 && html.length < cur.length * 0.6) backupCell_(dateString, 'Scratch', 'big shrink', cur);
    if (!row) {
      sheet.appendRow([parseDate_(dateString), '', '']);
      row = sheet.getLastRow();
    }
    sheet.getRange(row, 5).setValue(html);
    return { h: cellHash_(html) };
  } finally {
    lock.releaseLock();
  }
}

// One column of a safe save. baseHash = version the app started from (null = it had no row).
function syncCol_(cur, mine, baseHash, changed, where, label, baseText) {
  // No hash yet (a cell made in that tab): compare against the text it was made with (2026-10-31).
  const same = baseHash ? cellHash_(cur) === baseHash : baseText != null ? cur === String(baseText) : cur === '';
  if (!changed) return { value: cur, write: false, sendBack: !same };
  if (!same) return { value: cur, write: false, conflict: true, sendBack: true };
  // Big drop in size (e.g. many lines deleted at once): keep a copy, just in case.
  if (cur.length > 400 && mine.length < cur.length * 0.6) backupCell_(where, label, 'big shrink', cur);
  // An open task disappeared (deleted, moved, or wiped by mistake): keep a copy too (2026-10-31, Julius).
  else if (openTasks_(mine) < openTasks_(cur)) backupCell_(where, label, 'open task removed', cur);
  return { value: mine, write: true };
}

// Number of unticked task lines in a cell.
function openTasks_(html) {
  return (String(html || '').match(/class="check-line(?![^"]*\bdone\b)[^"]*"/g) || []).length;
}

// Short version id of a cell's text.
function cellHash_(s) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s || ''), Utilities.Charset.UTF_8);
  return b.slice(0, 8).map(x => ((x + 256) % 256).toString(16).padStart(2, '0')).join('');
}

// Version of the app's page code, so an open tab can tell a newer version was pushed.
function appBuild_(fresh) {
  const cache = CacheService.getScriptCache();
  let b = fresh ? null : cache.get('appBuild');
  if (b) return b;
  try { b = cellHash_(HtmlService.createHtmlOutputFromFile('Index').getContent()); } catch (e) { b = ''; }
  cache.put('appBuild', b, 120);
  return b;
}

// Safety copies of cell text before risky overwrites → "Backup" tab (newest at the bottom, ~1000 kept).
function backupCell_(where, col, reason, content, throttle) {
  try {
    if (throttle) {
      const cache = CacheService.getScriptCache();
      const key = 'bk:' + where + ':' + col;
      if (cache.get(key)) return;
      cache.put(key, '1', 60);
    }
    const sh = getOrCreateSheet_('Backup', ['Saved', 'Where', 'Column', 'Reason', 'Content']);
    sh.appendRow([new Date(), String(where), col, reason, String(content).slice(0, 49000)]);
    if (sh.getLastRow() > 1200) sh.deleteRows(2, 200);
  } catch (e) { console.error(e); }
}

// Called when the app comes back into view (and every few minutes): returns anything that changed
// elsewhere since the app loaded it. req = { days: { date: {th, jh} }, ref: { id: ch } }
function getSyncState(req) {
  const t = speedTimer_();
  try { moveScheduleToNotes_(); } catch (e) { console.error(e); } t.mark('schedule');
  const out = syncDiff_(req || {}, t);
  out.timing = t.done();
  return out;
}

// Cells whose hash differs from what the page has (days by date, Reference cards by id).
function syncDiff_(req, t) {
  const out = { build: appBuild_(), days: {}, ref: {} }; t.mark('build');
  const dates = Object.keys(req.days || {}).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (dates.length) {
    getDaysRange_(dates[0], dates[dates.length - 1]).forEach(d => {
      const want = req.days[d.date];
      if (!want) return;
      const e = { th: d.th, jh: d.jh, ph: d.ph };
      if (want.th !== d.th) e.tasks = d.tasks;
      if (want.jh !== d.jh) e.journal = d.journal;
      if (want.ph !== undefined && want.ph !== d.ph) e.plan = d.plan;
      if (e.tasks !== undefined || e.journal !== undefined || e.plan !== undefined) out.days[d.date] = e;
    });
  }
  t.mark('days');
  const refWant = req.ref || {};
  if (Object.keys(refWant).length) {
    getReference_().forEach(r => {
      if (Object.prototype.hasOwnProperty.call(refWant, r.id) && refWant[r.id] !== r.ch) out.ref[r.id] = { content: r.content, ch: r.ch };
    });
  }
  t.mark('reference');
  return out;
}


/* Schedule cell (Julius, 2026-10-29): time-block tasks ("10:00–10:30 · Walk Blocks setup …") don't belong in
   the Morning block of Today. For today and the next 7 days they move, as they are (checkboxes, done state,
   subtasks), into their own boxed cell in Notes, right under the Suggested Day:
   <table data-cnote="s-YYYYMMDD" data-ckind="sched"><tr><td>title</td></tr><tr><td>lines</td></tr></table>.
   New time-block lines added later join the same cell. */
const SCHED_RE_ = /^\s*\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*·/i;

function moveScheduleToNotes_() {
  const today = todayString_();
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  const days = getDaysRange_(today, addDaysToDateString_(today, 7));
  const todo = days.filter(d => d.tasks.indexOf('·') >= 0 && splitSchedule_(d.tasks).lines.length);
  if (!todo.length) return false;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    todo.forEach(d => {
      const row = findDayRow_(sheet, d.date);
      if (!row) return;
      const v = sheet.getRange(row, 2, 1, 2).getValues()[0];
      const split = splitSchedule_(String(v[0] || ''));
      if (!split.lines.length) return;
      const notes = addToScheduleCell_(String(v[1] || ''), d.date, split.lines.join(''));
      sheet.getRange(row, 2, 1, 2).setValues([[split.rest, notes]]);
    });
  } finally { lock.releaseLock(); }
  return true;
}

/* One-time fix (2026-10-29, Julius: Urgent rows bold when they shouldn't be). The Urgent panel shows each
   task's own formatting; typing on a new line right after bold text made the browser carry the bold into
   the new task. Unwrap urgency tasks that are bold from end to end (not Claude's lines, which have a bold
   title + plain details). The client now stops the carry-over (see "No stray bold" in Index.html). */
function fixUrgentBold_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('urgBoldFix') === '1') return;
  const fix = html => doneBlocks_(String(html || '')).map(b => {
    if (!/^<div\b[^>]*class="[^"]*check-line/i.test(b) || !/\sdata-urg="/.test(b) || /\sdata-cid="/.test(b)) return b;
    return b.replace(/(<span class="check-text">)\s*<(b|strong)>((?:(?!<\/?(?:b|strong)>)[\s\S])*)<\/\2>\s*(<\/span>)/i, '$1$3$4');
  }).join('');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const days = getOrCreateSheet_('Days', DAYS_HEADERS);
    const last = days.getLastRow();
    if (last >= 2) {
      const range = days.getRange(2, 2, last - 1, 2);
      const vals = range.getValues();
      let n = 0;
      vals.forEach((row, i) => [0, 1].forEach(c => {
        const v = String(row[c] || '');
        if (v.indexOf('data-urg') < 0) return;
        const f = fix(v);
        if (f !== v) { days.getRange(i + 2, 2 + c).setValue(f); n++; }
      }));
    }
    const ref = getOrCreateSheet_('Reference', REF_HEADERS);
    const rl = ref.getLastRow();
    if (rl >= 2) {
      const vals = ref.getRange(2, 5, rl - 1, 1).getValues();
      vals.forEach((row, i) => {
        const v = String(row[0] || '');
        if (v.indexOf('data-urg') < 0) return;
        const f = fix(v);
        if (f !== v) ref.getRange(i + 2, 5).setValue(f);
      });
    }
    props.setProperty('urgBoldFix', '1');
  } finally { lock.releaseLock(); }
}

// Pull time-block check-lines (and the subtasks right under them) out of a Today cell.
function splitSchedule_(html) {
  const blocks = doneBlocks_(html);
  const lines = [], rest = [];
  let takingLevel = -1;
  blocks.forEach(b => {
    const sec = doneAttr_(b, 'data-tsec') || doneAttr_(b, 'data-sec');
    if (sec || doneAttr_(b, 'data-secend') != null) {
      takingLevel = -1; rest.push(b); return;
    }
    const isLine = /^<div\b[^>]*class="[^"]*check-line/i.test(b);
    const level = Number(doneAttr_(b, 'data-level') || 0);
    if (isLine && takingLevel >= 0 && level > takingLevel) { lines.push(b); return; }
    takingLevel = -1;
    const text = isLine ? doneStrip_(doneText_(b) || '') : '';
    if (isLine && SCHED_RE_.test(text)) { lines.push(b); takingLevel = level; return; }
    rest.push(b);
  });
  return { lines, rest: rest.join('') };
}

function addToScheduleCell_(notes, date, linesHtml) {
  const id = 's-' + date.replace(/-/g, '');
  const start = notes.indexOf('<table data-cnote="' + id + '"');
  if (start >= 0) {
    const end = notes.indexOf('</table>', start);
    const close = notes.lastIndexOf('</td></tr></tbody></table>', end + 8);
    if (end >= 0 && close > start) return notes.slice(0, close) + linesHtml + notes.slice(close);
  }
  const label = Utilities.formatDate(parseDate_(date), Session.getScriptTimeZone(), 'EEE M/d');
  const table = '<table data-cnote="' + id + '" data-ckind="sched"><tbody><tr><td><div><b><u>Schedule · ' + label +
    '</u></b></div></td></tr><tr><td>' + linesHtml + '</td></tr></tbody></table>';
  // Right under the Suggested Day if there is one, else at the top.
  const plan = notes.search(/<table data-cnote="[^"]*" data-ckind="plan"/);
  if (plan >= 0) {
    const pEnd = notes.indexOf('</table>', plan);
    if (pEnd >= 0) return notes.slice(0, pEnd + 8) + table + notes.slice(pEnd + 8);
  }
  return table + notes;
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

/* Pinned Reference cards (2026-11-04, Julius): ids in script property refPinned, so pins follow him across
   devices. Pinned cards sort to the top in every sort mode (Index.html sortedReferenceItems). */
function getRefPins_() {
  try { const v = JSON.parse(PropertiesService.getScriptProperties().getProperty('refPinned') || '[]'); return Array.isArray(v) ? v.map(String) : []; }
  catch (e) { return []; }
}
function setReferencePin(id, on) {
  id = String(id || '');
  if (!id) return getRefPins_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const list = getRefPins_().filter(x => x !== id);
    if (on) list.unshift(id);
    PropertiesService.getScriptProperties().setProperty('refPinned', JSON.stringify(list.slice(0, 200)));
    return list;
  } finally { lock.releaseLock(); }
}

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
      sort: Number(row[6]) || index,
      ch: cellHash_(row[4])
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


// Safe save (2026-10-29), same rules as saveDay: item.fwSync + baseHash (version the app started from)
// + contentChanged. Toggling a cell open/closed in a stale tab no longer writes old text over new text.
function saveReferenceItem(item) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getOrCreateSheet_('Reference', REF_HEADERS);
    const id = String(item.id || Utilities.getUuid());
    const row = referenceRowMap_(sheet).get(id);
    const sync = !!item.fwSync;
    let content = String(item.content || '');
    let res = sync ? { id: id, build: appBuild_() } : null;

    if (row) {
      const currentRow = sheet.getRange(row, 1, 1, 7).getValues()[0];
      const cur = String(currentRow[4] || '');
      if (sync) {
        const c = syncCol_(cur, content, item.baseHash || null, !!item.contentChanged, 'Reference ' + id, 'Content', item.baseText);
        content = c.value;
        if (c.conflict) res.conflict = true;
        if (c.sendBack) res.content = cur;
      } else if (cur && cur !== content) {
        backupCell_('Reference ' + id, 'Content', 'old app tab', cur, true);
      }
      if (sync) {
        // Content autosaves must never write stale title/order/parent/collapse snapshots.
        // Only explicit metadata edits participate, with a per-field base value.
        if (content !== cur) sheet.getRange(row, 5).setValue(content);
        const fields = { parentId: 2, expanded: 6 };
        res.meta = {};
        res.metaConflicts = [];
        Object.keys(fields).forEach(key => {
          const range = sheet.getRange(row, fields[key]);
          const normalize = v => key === 'expanded' ? v !== false : String(v || '');
          let current = normalize(currentRow[fields[key] - 1]);
          const change = item.metaChanges && item.metaChanges[key];
          if (change && Object.prototype.hasOwnProperty.call(change, 'before') && Object.prototype.hasOwnProperty.call(change, 'after')) {
            const before = normalize(change.before), after = normalize(change.after);
            if (current === before || current === after) {
              if (current !== after) range.setValue(after);
              current = after;
            } else res.metaConflicts.push(key);
          }
          res.meta[key] = current;
        });
      } else sheet.getRange(row, 1, 1, 7).setValues([
        [
          id,
          item.parentId || '',
          item.type || 'item',
          item.title || '',
          content,
          item.expanded !== false,
          Number(item.sort) || row
        ]
      ]);
    } else {
      sheet.appendRow([
        id,
        item.parentId || '',
        item.type || 'item',
        item.title || '',
        content,
        item.expanded !== false,
        Number(item.sort) || sheet.getLastRow()
      ]);
    }
    if (res) { res.ch = cellHash_(content); return res; }
    return id;
  } finally {
    lock.releaseLock();
  }
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
    Date.now() // New cards start at the end, matching the client; autosaves no longer rewrite Sort.
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
// Urgent batches (2026-10-30, Julius): Music + Productivity subjects, Career shown as
// "Career / IT". One-time upgrade of his saved list (flag cardCatsBatch1) so every
// device gets them; after that his edits in Options win (deleting one keeps it gone).
const CARD_CATS_BATCH1_ = [
  { key: 'music', name: 'Music', color: '#a855f7', words: 'music, guitar, sing, singing, song, songs, setlist, set list, the show, show prep, music show, gig, gigs, rehearsal, rehearse, band, vocals, pedal, pedals, amp, open mic, soundcheck' },
  { key: 'productivity', name: 'Productivity', color: '#0891b2', words: 'productivity, efficiency, efficient, workflow, workflows, automation, automate, organize, organizing, clean up, cleanup, consolidate, chatgpt, gemini, handoff, master instructions, docs cleanup, migrate, migration' }
];
const CARD_CATS_CAREER_WORDS_ = 'help desk, helpdesk, it support, tech support, it job, it jobs, it role, certification, cert, security, cloud security, devsecops';
function getCardCats_() {
  // One read of all user properties (2026-11-05: was up to 7 separate reads + a write on every load).
  const props = PropertiesService.getUserProperties();
  const all = props.getProperties();
  let list = null;
  try { list = all.cardCats ? JSON.parse(all.cardCats) : null; } catch (e) { list = null; }
  if (!Array.isArray(list) || !list.length) return list;
  let out = list;
  if (!all.cardCatsBatch1) { out = cardCatsBatch1_(out); inboxWrite_('cardCats', out); props.setProperty('cardCatsBatch1', '1'); }
  // 2026-10-30 (Julius): Music purple; IT lab words in Career / IT (cert studies fold in on the client).
  if (!all.cardCatsBatch2) { out = cardCatsBatch2_(out); inboxWrite_('cardCats', out); props.setProperty('cardCatsBatch2', '1'); }
  // 2026-11-04 (Julius): "learn" counts toward Productivity.
  if (!all.cardCatsLearn1) { out = cardCatsLearn_(out); inboxWrite_('cardCats', out); props.setProperty('cardCatsLearn1', '1'); }
  // 2026-11-04 (Julius): Productivity is silver.
  if (!all.cardCatsSilver1) { out = out.map(c => c.key === 'productivity' ? Object.assign({}, c, { color: '#c0c4cc' }) : c); inboxWrite_('cardCats', out); props.setProperty('cardCatsSilver1', '1'); }
  // 2026-11-05 (Julius): Vivaldi work goes under MISC (made if missing), not Code.
  if (!all.cardCatsMisc1) { out = cardCatsMisc_(out); inboxWrite_('cardCats', out); props.setProperty('cardCatsMisc1', '1'); }
  const health = cardCatsHealth_(out, !all.cardCatsHealth1);
  if (JSON.stringify(health) !== JSON.stringify(out)) inboxWrite_('cardCats', health);
  if (!all.cardCatsHealth1) props.setProperty('cardCatsHealth1', '1');
  return health;
}
function cardCatsMisc_(list) {
  const words = s => String(s || '').split(',').map(w => w.trim()).filter(Boolean);
  let out = list.map(c => Object.assign({}, c, { words: words(c.words).filter(w => w.toLowerCase() !== 'vivaldi').join(', ') }));
  let m = out.find(c => c.key === 'misc' || /^misc/i.test(String(c.name || '')));
  if (!m) { m = { key: 'misc', name: 'MISC', color: '#9ca3af', words: '' }; out.push(m); }
  m.words = words(m.words).concat('vivaldi').join(', ');
  return out;
}
function cardCatsLearn_(list) {
  const words = c => String(c.words || '').split(',').map(w => w.trim()).filter(Boolean);
  return list.map(c => {
    const w = words(c).filter(x => x.toLowerCase() !== 'learn');
    if (c.key === 'productivity') w.push('learn');
    return Object.assign({}, c, { words: w.join(', ') });
  });
}
// Keep the user's task data intact; legacy Life tags render as uncategorized.
function cardCatsHealth_(list, initialize) {
  initialize = initialize !== false;
  const out = list.filter(c => c.key !== 'life' && String(c.name || '').toLowerCase() !== 'life').map(c => {
    const n = Object.assign({}, c);
    if(initialize && n.key === 'health' && n.name === 'Health') n.name = 'P health';
    return n;
  });
  if(initialize && !out.some(c => c.key === 'mhealth')) out.push({key:'mhealth',name:'M health',color:'#a78bfa',words:'meditation, meditate, mindfulness'});
  return out;
}
function cardCatsBatch2_(list) {
  const lab = ['it lab', 'home lab', 'homelab', 'lab', 'labs'];
  return list.map(c => {
    const n = Object.assign({}, c);
    if (n.key === 'music' && String(n.color).toLowerCase() === '#d946ef') n.color = '#a855f7';
    if (n.key === 'career') {
      const have = String(n.words || '').split(',').map(w => w.trim().toLowerCase());
      const extra = lab.filter(w => have.indexOf(w) < 0);
      if (extra.length) n.words = (n.words ? n.words + ', ' : '') + extra.join(', ');
    }
    return n;
  });
}
function cardCatsBatch1_(list) {
  const moved = ['guitar', 'music', 'sing', 'singing'];
  const out = list.map(c => {
    const n = Object.assign({}, c);
    if (n.key === 'fun') n.words = String(n.words || '').split(',').map(w => w.trim()).filter(w => w && moved.indexOf(w.toLowerCase()) < 0).join(', ');
    if (n.key === 'career') {
      if (n.name === 'Career') n.name = 'Career / IT';
      const have = String(n.words || '').split(',').map(w => w.trim().toLowerCase());
      const extra = CARD_CATS_CAREER_WORDS_.split(', ').filter(w => have.indexOf(w) < 0);
      if (extra.length) n.words = (n.words ? n.words + ', ' : '') + extra.join(', ');
    }
    return n;
  });
  const at = Math.max(0, out.findIndex(c => c.key === 'career') + 1) || out.length;
  CARD_CATS_BATCH1_.slice().reverse().forEach(c => {
    if (!out.some(x => x.key === c.key)) out.splice(at, 0, Object.assign({}, c));
  });
  return out.slice(0, 30);
}
// Card subjects (name, color, keywords) edited in Options — one list for all devices (2026-10-27).
function saveCardCats(list) {
  if (!Array.isArray(list)) return false;
  const clean = cardCatsHealth_(list.filter(c => c && /^[a-z]{2,12}$/.test(c.key || '')), false).slice(0, 30).map(c => ({
    key: c.key, name: String(c.name || c.key).slice(0, 24),
    color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#9ca3af',
    words: String(c.words || '').slice(0, 2000)
  }));
  inboxWrite_('cardCats', clean);
  PropertiesService.getUserProperties().setProperty('cardCatsHealth1', '1');
  return true;
}
// Claude's items can't be edited in inbox.js from the app, so edits / archive
// state for them live in "inboxOver" {id: {title, details, arch, done}} (2026-10-27).
// App items keep those fields on the item itself. arch = 'YYYY-MM-DD' archived day.
// Focus Tracking dashboard (2026-11-01, Julius: phase 1). One JSON blob in script properties:
// {v:1, cats:[{id,name,col, projects:[{id,title,why,col}]}]}. Render-only in the Notes cell, never in cell HTML.
// Phase 2 (2026-11-01): projects carry tasks [{id:'m-…' (= data-tid), t, d:0|1}], so the JSON is split
// into 8k chunks focusData_0..n-1 with the count in focusDataN (one property maxes out at ~9 KB).
function readFocus_() {
  const sp = PropertiesService.getScriptProperties(), all = sp.getProperties();
  let raw = '';
  const n = Number(all.focusDataN || 0);
  if (n > 0) { for (let i = 0; i < n; i++) {
    if(typeof all['focusData_' + i] !== 'string') throw new Error('Focus data is incomplete; the saved list was not changed.');
    raw += all['focusData_' + i];
  } }
  else raw = all.focusData || '';
  try {
    const data = raw ? JSON.parse(raw) : { v: 1, cats: [] };
    if(!data || !Array.isArray(data.cats)) throw new Error('Invalid Focus list');
    return data;
  } catch (e) { throw new Error('Focus data could not be read; the saved list was not changed.'); }
}
function getFocus() {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { return readFocus_(); } finally { lock.releaseLock(); }
}

// Three-way merge: independent records/fields survive; contradictory edits are never guessed.
function mergeFocus_(base, mine, theirs) {
  const conflicts = [];
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  function merge(b,m,t,path) {
    if(same(m,b)) return t;
    if(same(t,b) || same(m,t)) return m;
    if(object(b) && object(m) && object(t)) {
      const out = {};
      [...new Set(Object.keys(b).concat(Object.keys(m),Object.keys(t)))].forEach(k => {
        const v = merge(b[k],m[k],t[k],path + '.' + k);
        if(v !== undefined) out[k] = v;
      });
      return out;
    }
    const records = a => Array.isArray(a) && a.every(x => object(x) && typeof x.id === 'string') && new Set(a.map(x => x.id)).size === a.length;
    if(records(b) && records(m) && records(t)) {
      const maps = [b,m,t].map(a => new Map(a.map(x => [x.id,x]))), out = new Map();
      [...new Set(b.concat(m,t).map(x => x.id))].forEach(id => {
        const v = merge(maps[0].get(id),maps[1].get(id),maps[2].get(id),path + '[' + id + ']');
        if(v !== undefined) out.set(id,v);
      });
      const common = b.map(x => x.id).filter(id => maps[1].has(id) && maps[2].has(id) && out.has(id));
      const order = a => a.map(x => x.id).filter(id => common.indexOf(id) >= 0);
      const mo = order(m), to = order(t), mc = !same(mo,common), tc = !same(to,common);
      if(mc && tc && !same(mo,to)) conflicts.push(path + '.order');
      const primary = tc ? t : m, secondary = tc ? m : t;
      const ids = primary.map(x => x.id).filter(id => out.has(id));
      // Keep insertions near their next surviving neighbour, rather than losing their position.
      secondary.forEach((x,i) => {
        if(!out.has(x.id) || ids.indexOf(x.id) >= 0) return;
        const next = secondary.slice(i+1).find(n => ids.indexOf(n.id) >= 0);
        ids.splice(next ? ids.indexOf(next.id) : ids.length,0,x.id);
      });
      return ids.map(id => out.get(id));
    }
    conflicts.push(path);
    return t;
  }
  return {data:merge(base,mine,theirs,'focus'),conflicts:conflicts};
}

function saveFocus(data, opts) {
  if(!data || !Array.isArray(data.cats) || (opts && opts.base && !Array.isArray(opts.base.cats))) throw new Error('Invalid Focus list');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const current = readFocus_();
    if(JSON.stringify(data) === JSON.stringify(current)) return {data:current};
    if(!opts || !opts.base) throw new Error('Reload the app before saving Focus; this older tab cannot safely merge changes.');
    const result = mergeFocus_(opts.base,data,current);
    if(result.conflicts.length) return {conflict:true,data:current,fields:result.conflicts};
    writeFocus_(result.data);
    return {data:result.data};
  } finally { lock.releaseLock(); }
}

function writeFocus_(data) {
  const json = JSON.stringify(data || { v: 1, cats: [] });
  if (json.length > 200000) throw new Error('Focus data too big (' + json.length + ' chars)');
  const sp = PropertiesService.getScriptProperties();
  const oldN = Number(sp.getProperty('focusDataN') || 0), props = {};
  let n = 0;
  for (let i = 0; i < json.length; i += 8000) props['focusData_' + (n++)] = json.slice(i, i + 8000);
  props.focusDataN = String(n);
  sp.setProperties(props);
  for (let i = n; i < oldN; i++) sp.deleteProperty('focusData_' + i);
  if (sp.getProperty('focusData') != null) sp.deleteProperty('focusData'); // phase-1 single property
  return true;
}
// Fun list (2026-11-05, Julius): "things I want to do for fun later" (🎮 tab, Center Up).
// {v:1, items:[{id, t, d:0|1, u:ms, x?:1}]} in script property funData. saveFun merges by id with the
// newest u winning (x = deleted tombstone), so two devices never wipe each other's items.
function getFun() {
  try { const raw = PropertiesService.getScriptProperties().getProperty('funData'); return raw ? JSON.parse(raw) : { v: 1, items: [], cats: [] }; }
  catch (e) { return { v: 1, items: [], cats: [] }; }
}
function saveFun(data) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const cur = getFun(), week = Date.now() - 30 * 864e5;
    // Items and categories (2026-11-05: cats [{id, name, u, x?}], item.g = category id) merge the same way.
    const mergeList = (a, b) => {
      const by = {};
      (a || []).forEach(i => { if (i && i.id) by[i.id] = i; });
      (b || []).forEach(i => { if (i && i.id && (!by[i.id] || Number(i.u || 0) >= Number(by[i.id].u || 0))) by[i.id] = i; });
      return Object.keys(by).map(k => by[k]).filter(i => !(i.x && Number(i.u || 0) < week));
    };
    const out = { v: 1, items: mergeList(cur.items, data && data.items), cats: mergeList(cur.cats, data && data.cats) };
    const json = JSON.stringify(out);
    if (json.length > 8500) throw new Error('Fun list too big (' + json.length + ' chars)');
    PropertiesService.getScriptProperties().setProperty('funData', json);
    return out;
  } finally { lock.releaseLock(); }
}
// New things log (2026-11-07, Julius): ✨ tab left of 🌴 Fun = "last time I did something new".
// {v:1, items:[{id, t, w:'YYYY-MM-DD' (day it was done), g?, c, u, x?}], cats:[...]} in script property newData; merged like the Fun list.
function getNewThings() {
  try { const raw = PropertiesService.getScriptProperties().getProperty('newData'); return raw ? JSON.parse(raw) : { v: 1, items: [] }; }
  catch (e) { return { v: 1, items: [] }; }
}
function saveNewThings(data) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const cur = getNewThings(), old = Date.now() - 30 * 864e5;
    // Items and types (2026-11-07: cats [{id, e, name, c, u, x?}], item.g = type id) merge the same way.
    const mergeList = (a, b) => {
      const by = {};
      (a || []).forEach(i => { if (i && i.id) by[i.id] = i; });
      (b || []).forEach(i => { if (i && i.id && (!by[i.id] || Number(i.u || 0) >= Number(by[i.id].u || 0))) by[i.id] = i; });
      return Object.keys(by).map(k => by[k]).filter(i => !(i.x && Number(i.u || 0) < old));
    };
    const out = { v: 1, items: mergeList(cur.items, data && data.items), cats: mergeList(cur.cats, data && data.cats) };
    const json = JSON.stringify(out);
    if (json.length > 8500) throw new Error('New things log too big (' + json.length + ' chars)');
    PropertiesService.getScriptProperties().setProperty('newData', json);
    return out;
  } finally { lock.releaseLock(); }
}
function getInbox() {
  const done = inboxRead_('inboxDone', []);
  const mine = inboxRead_('inboxItems', []);
  const over = inboxRead_('inboxOver', {});
  const claude = (typeof CLAUDE_INBOX !== 'undefined' && Array.isArray(CLAUDE_INBOX)) ? CLAUDE_INBOX : [];
  return claude.map(x => Object.assign({ from: 'claude' }, x, over[String(x && x.id)] || {}))
    .concat(mine.map(x => Object.assign({ from: 'app' }, x)))
    .filter(x => x && x.id && done.indexOf(String(x.id)) < 0)
    .map(x => ({
      id: String(x.id), title: String(x.title || ''), details: String(x.details || ''),
      added: String(x.added || ''), from: x.from, arch: String(x.arch || ''), done: !!x.done
    }));
}
// Change an inbox item: fields = any of {title, details, arch, done}.
function updateInboxItem(id, fields) {
  id = String(id || '');
  fields = fields || {};
  const pick = {};
  ['title', 'details', 'arch'].forEach(k => { if (k in fields) pick[k] = String(fields[k] || '').slice(0, 4000); });
  if ('done' in fields) pick.done = !!fields.done;
  const lock = LockService.getUserLock();
  lock.waitLock(10000);
  try {
    const mine = inboxRead_('inboxItems', []);
    const it = mine.find(x => String(x.id) === id);
    if (it) { Object.assign(it, pick); inboxWrite_('inboxItems', mine); }
    else {
      const over = inboxRead_('inboxOver', {});
      over[id] = Object.assign(over[id] || {}, pick);
      inboxWrite_('inboxOver', over);
    }
  } finally { lock.releaseLock(); }
  return getInbox();
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
      const over = inboxRead_('inboxOver', {});
      if (over[id]) { delete over[id]; inboxWrite_('inboxOver', over); }
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
/* History log types (2026-11-04, Julius: option 1). Done Log column F "Type" = New / Fix / Tweak, filled in by
   Claude and ChatGPT; the line carries data-ltype="new|fix|tweak". Lines without one are guessed from their
   wording in the app (logTypeOf in Index.html), never saved. guessLogType_ uses the same rules. */
function normLogType_(v) {
  const t = String(v || '').trim().toLowerCase();
  return /^new/.test(t) ? 'new' : /^fix/.test(t) ? 'fix' : /^tweak/.test(t) ? 'tweak' : '';
}
function guessLogType_(text) {
  const t = String(text || '');
  if (/\b(fix|fixe[ds]|fixing|bug|broken|repair|restor|recover|prevent|correct|resolv|crash|fail|missing|stuck|wrong|glitch)/i.test(t)) return 'fix';
  if (/\b(add|adds|added|adding|new|build|built|creat|implement|enable|introduc|support|allow|launch|set up|setup)/i.test(t)) return 'new';
  if (/\b(tweak|adjust|move|moved|renam|smaller|larger|bigger|lighten|lighter|darker|tight|shrink|spacing|colou?r|align|match|simplif|polish|thinner|thicker|softer|reorder|sort|capitaliz|abbreviat|change|refine|compact|condens|swap|replace|font|typograph|border|tint|gap|padding|margin)/i.test(t)) return 'tweak';
  return '';
}
function doneItemHtml_(name, details, checked, cid, mine, type) {
  // Claude's lines start with "*" (no space) so Julius can tell them from his own (2026-10-26).
  // `mine` = his own Graphite calendar task transferred by Claude: no "*", ends " X" (2026-10-29).
  if (cid && mine) {
    if (name) name = String(name).replace(/^\*+/, '');
    if (details || !name) details = String(details || '').replace(/\s+X$/, '') + ' X';
    else name = name.replace(/\s+X$/, '') + ' X';
  } else if (cid) {
    if (name) name = '*' + String(name).replace(/^\*+/, '');
    else details = '*' + String(details || '').replace(/^\*+/, '');
  }
  const text = name && details ? '<b>' + doneEsc_(name) + '</b>: ' + doneEsc_(details)
    : name ? '<b>' + doneEsc_(name) + '</b>' : doneEsc_(details);
  return '<div class="check-line' + (checked ? ' done' : '') + '" data-level="0"' +
    (cid ? ' data-cid="' + doneEsc_(cid) + '"' : '') + (normLogType_(type) ? ' data-ltype="' + normLogType_(type) + '"' : '') +
    '>' + doneCheck_(checked) + '<span class="check-text">' + text + '</span></div>';
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
  const groups = Object.create(null), slots = [];
  let section = '';
  const groupOf = p => {
    const key = JSON.stringify([section,p]);
    if (!groups[key]) { groups[key] = []; slots.push({ group: key, project: p }); }
    return groups[key];
  };
  let current = null;
  blocks.forEach(b => {
    const sec = doneAttr_(b, 'data-tsec') || doneAttr_(b, 'data-sec');
    if (sec || doneAttr_(b, 'data-secend') != null) {
      section = sec || 'end'; current = null; slots.push({block:b}); return;
    }
    // IT study entries (StudyLog.gs) are their own block: never pulled into a project group.
    if (doneAttr_(b, 'data-study') != null || doneAttr_(b, 'data-study-of') != null) { current = null; slots.push({ block: b }); return; }
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
          if (!item) { groupOf(proj).push(doneItemHtml_('', doneStrip_(m[3]), checked, cid, false, doneAttr_(b, 'data-ltype'))); return; }
        }
      }
      if (proj) {
        proj = doneUnesc_(proj);
        const name = item ? doneItemName_(item) : '';
        const details = item ? String(item.details || '') : doneStrip_(text);
        groupOf(proj).push(doneItemHtml_(name, details, checked, item ? item.id : cid, !!(item && item.mine), (item && item.type) || doneAttr_(b, 'data-ltype')));
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
    parts.push({ group: s.group, html: doneHeaderHtml_(s.project) + groups[s.group].join('') });
  });
  return parts.map(p => p.group ? p.html : p.block).join('');
}

/* Day blocks for the done log (Julius, 2026-10-29): Claude's lines land in the
   Morning / Afternoon / Evening block they happened in, never a block that
   hasn't started yet. A time before a block's start rounds back to the
   previous one (the nap gap 2–3:45 pm counts as Morning). Past days: Evening. */
const DONE_SEC_ORDER_ = ['morning', 'afternoon', 'evening'];
/* Full time windows (2026-11-05, Julius): the day is split into three 8-hour windows, Morning 6 am – 2 pm,
   Afternoon 2 – 8 pm, Night 8 pm – 6 am. The labels keep his working hours (Morn 8–2 · After 2–7 · Night 7–10). */
function doneNowHm_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'); }
function doneSecOfHm_(hm) { return hm < '06:00' ? 'evening' : hm < '14:00' ? 'morning' : hm < '20:00' ? 'afternoon' : 'evening'; }
function doneSecNow_(date) {
  if (date < todayString_()) return 'evening';
  return doneSecOfHm_(doneNowHm_());
}
// Nothing can be done in the future (2026-11-05, Julius): a row dated after today counts as today, and work logged
// between midnight and 6 am belongs to the night before.
function doneTargetDate_(date) {
  const today = todayString_();
  let d = date > today ? today : date;
  if (d === today && doneNowHm_() < '06:00') d = addDaysToDateString_(today, -1);
  return d;
}
// Repair (2026-11-05): Claude / ChatGPT done lines sitting in a time window of today that hasn't started yet
// (e.g. rows applied last night to today's date) move to the previous day's Night. Only data-cid lines move.
function doneFutureLines_(html) {
  const order = DONE_SEC_ORDER_;
  const hm = doneNowHm_();
  const nowIdx = hm < '06:00' ? -1 : order.indexOf(doneSecOfHm_(hm));
  const blocks = doneBlocks_(html);
  const keep = [], moved = [];
  let cur = -1;
  blocks.forEach(b => {
    const k = doneAttr_(b, 'data-tsec') || doneAttr_(b, 'data-sec');
    if (k) cur = order.indexOf(k);
    else if (doneAttr_(b, 'data-secend') != null) cur = -1;
    if (!k && cur > nowIdx && doneAttr_(b, 'data-cid') != null && /^<div\b[^>]*class="[^"]*check-line/i.test(b)) { moved.push(b); return; }
    keep.push(b);
  });
  return { html: moved.length ? keep.join('') : html, moved: moved };
}
// Place only the new intake line; preserve historical groups and their sections.
function appendDoneInSection_(html, line, sec) {
  const blocks = doneBlocks_(html);
  const sectionOf = b => doneAttr_(b, 'data-tsec') || doneAttr_(b, 'data-sec');
  DONE_SEC_ORDER_.forEach((key,i) => {
    if (blocks.some(b => sectionOf(b) === key)) return;
    const next = blocks.findIndex(b => DONE_SEC_ORDER_.indexOf(sectionOf(b)) > i);
    const header = '<div data-tsec="' + key + '" contenteditable="false">' + key[0].toUpperCase() + key.slice(1) + '</div>';
    if (next < 0) blocks.push(header); else blocks.splice(next,0,header);
  });
  const start = blocks.findIndex(b => sectionOf(b) === sec);
  let at = start + 1;
  while (at < blocks.length && !sectionOf(blocks[at]) && doneAttr_(blocks[at],'data-secend') == null) at++;
  blocks.splice(at,0,line);
  return blocks.join('');
}
// Moves Claude groups that sit in a later block (or below the last block) into
// `sec`, just above that block's own empty last line. Cells without blocks are untouched.
function placeDoneInSection_(html, sec) {
  const blocks = doneBlocks_(html);
  const secOf = b => { const m = /^<div\b[^>]*\sdata-(?:tsec|sec)="(\w+)"/i.exec(b); return m ? m[1].toLowerCase() : null; };
  const isEnd = b => /^<div\b[^>]*\sdata-secend=/i.test(b);
  const isBlank = b => /^<(p|div)\b[^>]*>(\s|&nbsp;|<br\b[^>]*>)*<\/(p|div)>$/i.test(b);
  const target = DONE_SEC_ORDER_.indexOf(sec);
  if (target < 0 || !blocks.some(b => secOf(b) === sec)) return html;
  // Region of each block: index of the block section it sits in (-1 above Morning, 99 below the end marker).
  const region = [];
  let cur = -1;
  blocks.forEach(b => {
    const k = secOf(b);
    if (k) cur = DONE_SEC_ORDER_.indexOf(k);
    else if (isEnd(b)) cur = 99;
    region.push(cur);
  });
  const moved = [], keep = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (doneAttr_(b, 'data-cgrp') != null && region[i] > target) {
      moved.push(b);
      let j = i + 1;
      while (j < blocks.length && /^<div\b[^>]*class="[^"]*check-line/i.test(blocks[j]) && doneAttr_(blocks[j], 'data-study') == null) moved.push(blocks[j++]);
      // Drop the blank spacer we left behind if it now doubles up.
      if (j < blocks.length && isBlank(blocks[j]) && keep.length && isBlank(keep[keep.length - 1])) j++;
      i = j - 1;
      continue;
    }
    keep.push(b);
  }
  if (!moved.length) return html;
  // Insert point: before the target block's last empty line (its typing line), else before the next block / end marker.
  const start = keep.findIndex(b => secOf(b) === sec);
  let stop = keep.length;
  for (let k = start + 1; k < keep.length; k++) if (secOf(keep[k]) || isEnd(keep[k])) { stop = k; break; }
  let at = stop;
  while (at - 1 > start && isBlank(keep[at - 1])) at--;
  const BLANK = '<p><br></p>';
  const ins = (at - 1 > start ? [BLANK] : []).concat(moved);
  keep.splice(at, 0, ...ins);
  return keep.join('');
}

/* Day sections removed (Julius, 2026-10-29). One-time: drop the saved Morning / Afternoon / Evening
   header lines from every Today cell and turn the end marker back into a plain line. The old cell is
   copied to the Backup tab first. Flag: script property daySecsRemoved. */
const DAY_SEC_LINE_RE_ = /<div\b[^>]*\sdata-sec="\w+"[^>]*>(?:(?!<div\b)[\s\S])*?<\/div>/gi;
function stripDaySections_(html) {
  return String(html || '')
    .replace(DAY_SEC_LINE_RE_, '')
    .replace(/\sdata-secend="[^"]*"/gi, '');
}
function removeDaySections_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('daySecsRemoved') === '1') return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    const last = sheet.getLastRow();
    if (last >= 2) {
      const range = sheet.getRange(2, 1, last - 1, 2);
      const vals = range.getValues();
      vals.forEach((r, i) => {
        const before = String(r[1] || '');
        if (!/data-sec(end)?=/i.test(before)) return;
        const after = stripDaySections_(before);
        if (after === before) return;
        backupCell_(formatDate_(r[0]), 'Today', 'day sections removed', before);
        sheet.getRange(i + 2, 2).setValue(after);
      });
    }
    props.setProperty('daySecsRemoved', '1');
  } finally { lock.releaseLock(); }
}

/* Sheet intake (2026-11-02, Julius): any AI appends a row to the "Done Log" or
   "New Tasks" tab, with no deploy. Rows are never edited; the next app load
   applies each new one once. The id comes from the row's text, so an exact
   repeat is added once and a line he deletes stays deleted. */
const DONE_LOG_HEADERS = ['Date', 'Project', 'Title', 'Details', 'Done by', 'Type'];
const NEW_TASKS_HEADERS = ['Date', 'Title', 'Urgency', 'Due', 'Minutes', 'Subtasks', 'Added'];
const DONE_LOG_DAYS = 30; // older rows are ignored, so the applied-id list can't age out

// Deployment generates this manifest from main's code changes. Import once on app
// load, before Done Log intake. Scan stable commit markers as a crash/retry guard;
// never edit old rows. No extra scopes, external AI call or calendar event needed.
function applyDeployedCodeLog_() {
  const entries = typeof FW_DEPLOY_LOG !== 'undefined' && Array.isArray(FW_DEPLOY_LOG) ? FW_DEPLOY_LOG : [];
  if (!entries.length) return;
  const signature = cellHash_(JSON.stringify(entries));
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('deployedCodeLog') === signature) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    if (props.getProperty('deployedCodeLog') === signature) return;
    const sheet = getOrCreateSheet_('Done Log', DONE_LOG_HEADERS);
    const rows = sheet.getDataRange().getValues();
    const markers = new Set();
    rows.slice(1).forEach(row => {
      const matches = String(row[3] || '').match(/\[code-change:[a-f0-9]{40}\]/g) || [];
      matches.forEach(marker => markers.add(marker));
    });
    const fresh = entries.filter(entry => /^[a-f0-9]{40}$/.test(entry.sha || '') &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.date || '') && entry.title && !markers.has('[code-change:' + entry.sha + ']'));
    const added = new Set();
    fresh.forEach(entry => {
      const marker = '[code-change:' + entry.sha + ']';
      if (added.has(marker)) return;
      // Prefix user-controlled strings so a commit title cannot become a Sheet formula.
      const text = value => /^[=+@-]/.test(String(value || '')) ? "'" + value : String(value || '');
      sheet.appendRow([entry.date, 'Gantt', text(entry.title),
        text('Code included in deployed build. ' + marker + '\n' + String(entry.details || '') +
          '\nFeature behavior still needs user/device confirmation.'),
        /^(ChatGPT|Claude|Julius)$/.test(entry.by || '') ? entry.by : 'Julius',
        ({ new: 'New', fix: 'Fix', tweak: 'Tweak' })[guessLogType_(entry.title)] || '']);
      added.add(marker);
    });
    props.setProperty('deployedCodeLog', signature);
  } finally { lock.releaseLock(); }
}

/* To Confirm (2026-11-04, Julius: "things slip because nobody checked them"). Every shipped change gets a row
   in the To Confirm tab; open rows show as check-lines in the pinned Reference card "To Confirm" (id
   CONFIRM_CARD_ID). Ticking a line there marks its row Status = works with today's date on the next load,
   and the line leaves the card. Status 'broken' keeps the row open with a ⚠. Rows are the source of truth. */
const CONFIRM_HEADERS = ['Date', 'Project', 'Change', 'How to check', 'Status', 'Checked on'];
const CONFIRM_CARD_ID = 'p-to-confirm';

function confirmRows_(sheet) {
  return sheet.getDataRange().getValues().slice(1).map((r, i) => {
    const date = intakeDate_(r[0]);
    const project = String(r[1] || '').trim() || 'Other';
    const change = String(r[2] || '').trim();
    return { row: i + 2, id: 'k-' + cellHash_([date, project, change].join('|')), date, project, change,
      how: String(r[3] || '').trim(), status: String(r[4] || '').trim().toLowerCase() };
  }).filter(x => x.change);
}

function confirmCardHtml_(rows) {
  const open = rows.filter(x => x.status !== 'works');
  const short = d => { const m = String(d).match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? Number(m[1]) + '/' + Number(m[2]) : String(d); };
  let html = '<h2>To Confirm</h2><p><i>' + (open.length ? open.length + ' to check' : 'Nothing to check') +
    ' · tick a line once it works on your phone. Broken? Tell Claude. (From the To Confirm tab.)</i></p>';
  const projects = [];
  open.forEach(x => { if (projects.indexOf(x.project) < 0) projects.push(x.project); });
  projects.forEach(p => {
    const list = open.filter(x => x.project === p).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row);
    html += '<div data-kgrp="' + doneEsc_(p) + '"><b><u>' + doneEsc_(p) + ' (' + list.length + ')</u></b></div>';
    list.forEach(x => {
      html += '<div class="check-line" data-level="0" data-kid="' + x.id + '">' + doneCheck_(false) +
        '<span class="check-text">' + (x.status === 'broken' ? '⚠ broken · ' : '') + '<b>' + doneEsc_(x.change) + '</b> · ' +
        short(x.date) + (x.how ? ': ' + doneEsc_(x.how) : '') + '</span></div>';
    });
  });
  return html;
}

function syncConfirmCard_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('To Confirm')) return; // nothing until the tab exists
  // Fast path (2026-11-04): most loads change nothing, so check without taking the script lock.
  if (!confirmCardWork_(true)) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // next load retries
  try { confirmCardWork_(false); } finally { lock.releaseLock(); }
}

// dryRun: true → only report whether a write is needed.
function confirmCardWork_(dryRun) {
  {
    const sheet = getOrCreateSheet_('To Confirm', CONFIRM_HEADERS);
    const ref = getOrCreateSheet_('Reference', REF_HEADERS);
    let rows = confirmRows_(sheet);
    const cardRow = referenceRowMap_(ref).get(CONFIRM_CARD_ID);
    const cur = cardRow ? String(ref.getRange(cardRow, 5).getValue() || '') : '';
    // Ticked lines → Status works.
    const ticked = new Set();
    (cur.match(/<div\b[^>]*\bdata-kid="[^"]+"[^>]*>/g) || []).forEach(tag => {
      const id = tag.match(/data-kid="([^"]+)"/)[1];
      if (/\bclass="[^"]*\bdone\b/.test(tag)) ticked.add(id);
    });
    if (dryRun) {
      const pending = rows.some(x => ticked.has(x.id) && x.status !== 'works');
      return pending || !cardRow || cur.replace(/<!--fw-modified:\d+-->/, '') !== confirmCardHtml_(rows);
    }
    const today = todayString_();
    rows.forEach(x => {
      if (ticked.has(x.id) && x.status !== 'works') {
        sheet.getRange(x.row, 5, 1, 2).setValues([['works', today]]);
        x.status = 'works';
      }
    });
    const html = confirmCardHtml_(rows);
    if (cur.replace(/<!--fw-modified:\d+-->/, '') === html) return;
    if (cardRow) {
      if (cur) backupCell_('Reference ' + CONFIRM_CARD_ID, 'Content', 'To Confirm sync', cur, true);
      ref.getRange(cardRow, 5).setValue(html);
    } else {
      ref.appendRow([CONFIRM_CARD_ID, '', 'item', 'To Confirm', html, true, 0]);
      const pins = getRefPins_().filter(x => x !== CONFIRM_CARD_ID);
      pins.unshift(CONFIRM_CARD_ID);
      PropertiesService.getScriptProperties().setProperty('refPinned', JSON.stringify(pins.slice(0, 200)));
    }
    return true;
  }
}

function intakeDate_(value) {
  return value instanceof Date ? formatDate_(value) : String(value || '').trim();
}

// Added column (2026-11-02, Julius): the time the AI added the row, as 'HH:MM' (24 h) or '2:30 PM'. '' if unreadable.
function intakeTime_(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?(?:m\.?)?$/i);
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0);
  if (h > 23 || Number(m[2]) > 59) return '';
  return String(h).padStart(2, '0') + ':' + m[2];
}

function sheetDoneRows_() {
  const sheet = getOrCreateSheet_('Done Log', DONE_LOG_HEADERS);
  // Use the intake snapshot for the header too: no separate header read on every import.
  const rows = sheet.getDataRange().getValues();
  if (rows[0][5] !== 'Type') sheet.getRange(1, 6).setValue('Type'); // tab made before this column
  const oldest = addDaysToDateString_(todayString_(), -DONE_LOG_DAYS);
  return rows.slice(1).map(r => {
    const date = intakeDate_(r[0]);
    const project = String(r[1] || '').trim();
    const title = String(r[2] || '').trim();
    const details = String(r[3] || '').trim();
    return {
      id: 's-' + cellHash_([date, project, title, details].join('|')), date, project: project || 'Other', title, details,
      mine: /^(julius|me)$/i.test(String(r[4] || '').trim()),
      type: normLogType_(r[5]), // not in the id, so adding a type never re-adds a line
    };
  }).filter(x => x.title && x.date >= oldest);
}

function sheetTaskRows_() {
  const sheet = getOrCreateSheet_('New Tasks', NEW_TASKS_HEADERS);
  const range = sheet.getDataRange();
  const rows = range.getValues();
  if (rows[0][6] !== 'Added') sheet.getRange(1, 7).setValue('Added'); // tab made before this column
  const shown = range.getDisplayValues(); // as displayed: a time cell's raw value is an 1899 date
  return rows.slice(1).map((r, i) => {
    const raw = intakeDate_(r[0]);
    const date = /^(backlog|undated)$/i.test(raw) ? 'backlog' : raw;
    const title = String(r[1] || '').trim();
    return {
      id: 's-' + cellHash_([raw, title].join('|')), date, title, urg: Number(r[2]), due: intakeDate_(r[3]), dur: Number(r[4]),
      subtasks: String(r[5] || '').split('|').map(t => t.trim()).filter(Boolean),
      added: intakeTime_(shown[i + 1][6]),
    };
  }).filter(x => x.title);
}

function applyClaudeDone_() {
  let list = (typeof CLAUDE_DONE !== 'undefined' && Array.isArray(CLAUDE_DONE)) ? CLAUDE_DONE : [];
  try { list = list.concat(sheetDoneRows_()); } catch (e) { console.error(e); }
  if (!list.length) return;
  const props = PropertiesService.getScriptProperties();
  let applied = [];
  try { applied = JSON.parse(props.getProperty('claudeDoneApplied') || '[]'); } catch (e) { applied = []; }
  const valid = list.filter(x => x && x.id && /^\d{4}-\d{2}-\d{2}$/.test(x.date || ''));
  const fresh = valid.filter(x => applied.indexOf(String(x.id)) < 0);
  // One-time pass: regroup days already written in the old flat style.
  // '2' (2026-10-26): re-render past days once so old lines get the "*" prefix.
  const migrate = props.getProperty('claudeDoneGrouped') !== '2';
  // One-time (2026-10-29): pull today's lines out of blocks that hadn't started yet.
  const secFix = props.getProperty('claudeDoneSec') !== '1';
  // Cheap check (one cell read): does today's cell hold done lines in a window that hasn't started yet?
  const daysSheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  const tRow0 = findDayRow_(daysSheet, todayString_());
  const needFix = !!tRow0 && doneFutureLines_(String(daysSheet.getRange(tRow0, 2).getValue() || '')).moved.length > 0;
  if (!fresh.length && !migrate && !secFix && !needFix) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = daysSheet;
    const byDate = {};
    fresh.forEach(x => { const d = doneTargetDate_(x.date); (byDate[d] = byDate[d] || []).push(x); });
    // Move today's lines that sit in a window that hasn't started yet back to the night before (see doneFutureLines_).
    const today = todayString_(), yday = addDaysToDateString_(today, -1);
    const todayRow = findDayRow_(sheet, today);
    if (todayRow) {
      const tc = sheet.getRange(todayRow, 2), tBefore = String(tc.getValue() || '');
      const fut = doneFutureLines_(tBefore);
      if (fut.moved.length) {
        let yRow = findDayRow_(sheet, yday);
        if (!yRow) { sheet.appendRow([parseDate_(yday), '', '']); yRow = sheet.getLastRow(); }
        const yc = sheet.getRange(yRow, 2), yBefore = String(yc.getValue() || '');
        let yHtml = yBefore;
        fut.moved.forEach(line => { yHtml = appendDoneInSection_(yHtml, line, 'evening'); });
        yHtml = groupClaudeDone_(yHtml, valid);
        backupCell_(yday, 'Today', 'Done lines moved from tomorrow (not yet started window)', yBefore);
        yc.setValue(yHtml);
        backupCell_(today, 'Today', 'Done lines moved to the night before', tBefore);
        tc.setValue(groupClaudeDone_(fut.html, valid));
      }
    }
    if (migrate) valid.forEach(x => { byDate[x.date] = byDate[x.date] || []; });
    if (secFix) byDate[todayString_()] = byDate[todayString_()] || [];
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
        if (html.indexOf('data-cid="' + doneEsc_(x.id) + '"') < 0) html = appendDoneInSection_(html, doneLineHtml_(x), doneSecNow_(date));
        applied.push(String(x.id));
      });
      html = groupClaudeDone_(html, valid);
      // Groups stay separate in Morning, Afternoon and Evening (2026-11-03).
      if (html !== before) { backupCell_(date, 'Today', 'Done Log section placement', before); cell.setValue(html); }
    });
    props.setProperty('claudeDoneApplied', JSON.stringify(applied.slice(-1000)));
    props.setProperty('claudeDoneGrouped', '2');
    props.setProperty('claudeDoneSec', '1');
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

/* Open tasks from Claude (2026-10-27, Julius): CLAUDE_TASKS in tasks.js → open check-lines (with urgency
   and subtasks) appended once to that day's Today cell. data-tid marks the head line. */
function applyClaudeTasks_() {
  let list = (typeof CLAUDE_TASKS !== 'undefined' && Array.isArray(CLAUDE_TASKS)) ? CLAUDE_TASKS : [];
  try { list = list.concat(sheetTaskRows_()); } catch (e) { console.error(e); }
  const props = PropertiesService.getScriptProperties();
  let applied = [];
  try { applied = JSON.parse(props.getProperty('claudeTasksApplied') || '[]'); } catch (e) { applied = []; }
  // date: 'backlog' (Julius, 2026-10-29) puts the task in the Reference "Backlog" cell instead of a day,
  // so it shows in Urgent without landing in Today. Skipped (retried later) until that cell exists.
  const fresh = list.filter(x => x && x.id && x.title && (/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') || x.date === 'backlog') && applied.indexOf(String(x.id)) < 0);
  if (!fresh.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
    const refSheet = getOrCreateSheet_('Reference', REF_HEADERS);
    fresh.forEach(x => {
      let cell;
      if (x.date === 'backlog') {
        const b = getReference_().find(r => /^(backlog|undated tasks)$/.test(r.title.replace(/<[^>]*>/g, '').trim().toLowerCase()));
        if (!b) return;
        cell = refSheet.getRange(b.row, 5);
      } else {
        let row = findDayRow_(sheet, x.date);
        if (!row) { sheet.appendRow([parseDate_(x.date), '', '']); row = sheet.getLastRow(); }
        cell = sheet.getRange(row, 2);
      }
      let html = String(cell.getValue() || '');
      if (html.indexOf('data-tid="' + doneEsc_(x.id) + '"') < 0) {
        const u = [1, 2, 3].indexOf(Number(x.urg)) >= 0 ? ' data-urg="' + Number(x.urg) + '"' : '';
        const line = (text, level, tid) => '<div class="check-line" data-level="' + level + '"' + u +
          (tid ? ' data-tid="' + doneEsc_(tid) + '"' : '') + (level ? ' style="margin-left: ' + (level * 24) + 'px;"' : '') + '>' +
          doneCheck_(false) + '<span class="check-text">' + doneEsc_(text) + '</span></div>';
        let head = line(x.title, 0, x.id);
        // Optional due date on the head line (2026-10-28): due: 'YYYY-MM-DD'.
        if (/^\d{4}-\d{2}-\d{2}$/.test(x.due || '')) head = head.replace('<div class="check-line"', '<div class="check-line" data-due="' + x.due + '"');
        // Optional duration in minutes (2026-10-28, auto-reshuffle step 1): dur: 45.
        const dur = Math.round(Number(x.dur));
        if (dur >= 1 && dur <= 6000) head = head.replace('<div class="check-line"', '<div class="check-line" data-dur="' + dur + '"');
        // Time section (2026-11-02, Julius): a task for today goes under the section for when the AI added it.
        // data-at = that time (row's Added, else now); data-ai-new tells the app to sort it on load. Any other day
        // gets "-" (no time), and a cell with no times yet has its lines marked "-" so they don't count as new.
        if (x.date !== 'backlog') {
          const today = x.date === todayString_();
          const at = !today ? '-' : (x.added || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'));
          if (!/data-at=/.test(html)) html = html.replace(/<div\b[^>]*class="[^"]*check-line[^>]*>/g, tag =>
            /data-level="[1-9]/.test(tag) ? tag : tag.replace('<div', '<div data-at="-"'));
          head = head.replace('<div class="check-line"', '<div class="check-line" data-at="' + at + '"' + (today ? ' data-ai-new="1"' : ''));
        }
        html += head;
        (Array.isArray(x.subtasks) ? x.subtasks : []).forEach(t => { html += line(t, 1, ''); });
        cell.setValue(html);
      }
      applied.push(String(x.id));
    });
    props.setProperty('claudeTasksApplied', JSON.stringify(applied.slice(-1000)));
  } finally { lock.releaseLock(); }
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

// Center-bottom list: main calendar only (no archive path).
function getMainCalendarEvents(dateString) {
  const date = String(dateString || todayString_());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid calendar date');
  const start = parseDate_(date), end = parseDate_(addDaysToDateString_(date, 1));
  const cal = CalendarApp.getCalendarById(EVENT_CALENDARS[0]);
  if (!cal) throw new Error('Main calendar is unavailable');
  const tz = Session.getScriptTimeZone();
  const events = cal.getEvents(start, end).map(ev => {
    const allDay = ev.isAllDayEvent();
    const s = ev.getStartTime(), e = ev.getEndTime();
    return { title: ev.getTitle() || '(no title)', allDay: allDay,
      id: ev.getId(), calId: EVENT_CALENDARS[0],
      done: String(ev.getColor() || '') === '8',
      color: String(ev.getColor() || ''),
      start: (allDay ? ev.getAllDayStartDate() : s).getTime(), end: e.getTime(),
      recurring: ev.isRecurringEvent(),
      time: allDay ? 'All day' : Utilities.formatDate(s, tz, 'h:mm a') + '–' + Utilities.formatDate(e, tz, 'h:mm a') };
  });
  const saved = PropertiesService.getScriptProperties().getProperties();
  events.forEach(ev => {
    try { Object.assign(ev, JSON.parse(saved[calMetaKey_(ev.id, ev.start, ev.recurring)] || '{}')); } catch (e) { console.error(e); }
    // Color = urgency both ways (2026-11-05, Julius): an event colored red / yellow / blue elsewhere (Calendar app,
    // Claude, ChatGPT) shows with that urgency here when the app hasn't saved one for it.
    if (!ev.urg) { const u = Object.keys(URG_EVENT_COLOR_).find(k => URG_EVENT_COLOR_[k] === ev.color); if (u) ev.urg = u; }
    delete ev.color;
  });
  events.sort((a,b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  return { date: date, events: events };
}

// + Task in Cal Events (2026-11-04, Julius): a real all-day event on the main calendar. No color is set; Julius picks urgency himself.
function addAllDayTask(dateString, title) {
  const date = String(dateString || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid calendar date');
  const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!name) throw new Error('Task name is empty');
  const cal = CalendarApp.getCalendarById(EVENT_CALENDARS[0]);
  if (!cal) throw new Error('Main calendar is unavailable');
  const ev = cal.createAllDayEvent(name, parseDate_(date));
  return { id: ev.getId(), date: date };
}

// Hold-menu fields for a calendar event (2026-11-03, Julius): urgency, due, length, subject. Kept app-side so the
// event itself stays unchanged. A one-off keeps them when moved; a repeating event has them per occurrence.
function calMetaKey_(eventId, start, recurring) {
  return 'calMeta:' + String(eventId).slice(0, 60) + (recurring ? ':' + Number(start) : '');
}
// Urgency shows on the calendar too (2026-11-04, Julius): 1 red (Tomato), 2 yellow (Banana), 3 blue (Blueberry), none = calendar default.
const URG_EVENT_COLOR_ = { '1': '11', '2': '5', '3': '9' };
function syncCalUrgencyColor_(calId, eventId, start, urg) {
  if (EVENT_CALENDARS.indexOf(calId) < 0) return;
  const ev = calEventAt_(calId, eventId, start), color = URG_EVENT_COLOR_[urg] || '';
  if (String(ev.getColor() || '') === '8') { // done stays Graphite; unticking brings back the new urgency color
    PropertiesService.getScriptProperties().setProperty('calPrev:' + eventId.slice(0, 60) + ':' + Number(start), color || 'default');
    return;
  }
  ev.setColor(color || '0');
}

function setCalendarEventMeta(eventId, start, recurring, meta, calId) {
  const m = meta || {}, clean = {};
  if (/^[123]$/.test(m.urg || '')) clean.urg = m.urg;
  if (/^\d{4}-\d{2}-\d{2}$/.test(m.due || '')) clean.due = m.due;
  if (/^\d{1,4}$/.test(String(m.dur || ''))) clean.dur = String(m.dur);
  if (/^[a-z]{2,12}$/.test(m.cat || '')) clean.cat = m.cat;
  const props = PropertiesService.getScriptProperties(), key = calMetaKey_(eventId, start, recurring);
  let oldUrg = '';
  try { oldUrg = (JSON.parse(props.getProperty(key) || '{}').urg) || ''; } catch (e) {}
  if ((clean.urg || '') !== oldUrg) syncCalUrgencyColor_(calId, eventId, start, clean.urg || '');
  if (Object.keys(clean).length) props.setProperty(key, JSON.stringify(Object.assign({ s: Number(start) }, clean)));
  else props.deleteProperty(key);
  // Drop saved fields for events more than 60 days past.
  const cutoff = Date.now() - 60 * DAY_MS, all = props.getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf('calMeta:') !== 0) return;
    try { if (JSON.parse(all[k]).s < cutoff) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
  return clean;
}

function getCalendarEvents() {
  // Auto archive first (when on), so the list below is already tidy.
  if (archiveAuto_()) { try { archiveCompletedTasks({}); } catch (e) { console.error(e); } }
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
      let color = '';
      try { color = String(ev.getColor() || ''); } catch (err) { color = ''; }
      out.push({
        id: ev.getId(),
        calId: id,
        color: color,
        done: color === '8', // Graphite = done (Julius's rule)
        items: (ev.getTitle() || '').indexOf(ARCHIVE_PREFIX) === 0
          ? String(ev.getDescription() || '').split('\n').filter(l => /^\[x\] /.test(l)).map(l => l.slice(4)) : null,
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
  let archive = { ready: 0, auto: archiveAuto_() };
  try { archive.ready = archiveCompletedTasks({ dryRun: true }).ready; } catch (e) { console.error(e); }
  return { today: today, events: out, archive: archive };
}

/* Calendar panel, phase 1 (2026-11-08, Julius): read-only range for the 📅 Calendar slide-out (FullCalendar).
   Never writes: no archive pass (unlike getCalendarEvents), no color sync. Same calendars as Cal Events.
   Dates are yyyy-MM-dd in the script zone (America/Los_Angeles); end is exclusive. All-day events come back as
   plain dates (end exclusive, like Google), timed events as ISO with offset. color = the event's own color, else
   its calendar's color. Phase 2+ plans: docs/NOTES.md → "Calendar panel (FullCalendar)". */
const CAL_PANEL_COLORS_ = { '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000' };
// One event in the panel's shape. editable = main calendar and not repeating (phase 2: repeating stay read-only).
function calPanelEventOut_(ev, calId, calName, calColor, tz) {
  const allDay = ev.isAllDayEvent();
  let colorId = '';
  try { colorId = String(ev.getColor() || ''); } catch (err) { colorId = ''; }
  let link = '';
  try { link = 'https://www.google.com/calendar/event?eid=' + Utilities.base64EncodeWebSafe(ev.getId().split('@')[0] + ' ' + calId).replace(/=+$/, ''); } catch (err) { link = ''; }
  const st = allDay ? ev.getAllDayStartDate() : ev.getStartTime(), en = allDay ? ev.getAllDayEndDate() : ev.getEndTime();
  const fmt = allDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX";
  const recurring = ev.isRecurringEvent();
  return {
    id: ev.getId() + '|' + st.getTime(), eventId: ev.getId(), startMs: st.getTime(), calId: calId, cal: calName,
    title: ev.getTitle() || '(no title)', allDay: allDay,
    start: Utilities.formatDate(st, tz, fmt), end: Utilities.formatDate(en, tz, fmt),
    color: CAL_PANEL_COLORS_[colorId] || calColor, colorId: colorId, done: colorId === '8',
    location: ev.getLocation() || '', recurring: recurring, link: link,
    editable: calId === EVENT_CALENDARS[0] && !recurring
  };
}
function getCalendarRange(startDate, endDate) {
  const s = String(startDate || ''), e = String(endDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || e <= s) throw new Error('Invalid calendar range');
  const from = parseDate_(s), to = parseDate_(e);
  if (to - from > 62 * DAY_MS) throw new Error('Calendar range too long');
  const tz = Session.getScriptTimeZone(), out = [], calendars = [], failed = [];
  EVENT_CALENDARS.forEach(id => {
    let cal = null;
    try { cal = CalendarApp.getCalendarById(id); } catch (err) { cal = null; }
    if (!cal) { failed.push(id); return; }
    const calName = cal.getName(), calColor = String(cal.getColor() || '#039be5');
    calendars.push({ id: id, name: calName, color: calColor });
    cal.getEvents(from, to).forEach(ev => out.push(calPanelEventOut_(ev, id, calName, calColor, tz)));
  });
  return { start: s, end: e, tz: tz, events: out, calendars: calendars, failed: failed };
}

/* Calendar panel, phase 2 (2026-11-08, Julius): create / edit / delete on the MAIN calendar only; repeating events
   stay read-only (edit those in Google Calendar). Edits change the event in place, so its id never changes.
   Duplicate guard: each form save carries an opId; a retry or double tap with the same opId returns the first result
   (script cache, 6 h) instead of creating again. New events get reminders off. Times are America/Los_Angeles wall
   time: all-day 'yyyy-MM-dd' (end exclusive, like Google), timed 'yyyy-MM-ddTHH:mm'. */
function calPanelMain_() {
  const cal = CalendarApp.getCalendarById(EVENT_CALENDARS[0]);
  if (!cal) throw new Error('Main calendar is unavailable');
  return cal;
}
function calPanelWhen_(req) {
  const r = req || {}, allDay = !!r.allDay, s = String(r.start || ''), e = String(r.end || '');
  const title = String(r.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!title) throw new Error('Title is empty');
  if (allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) throw new Error('Invalid date');
    const a = parseDate_(s), b = parseDate_(e);
    if (b <= a) throw new Error('End date is before the start date');
    if (b - a > 366 * DAY_MS) throw new Error('Event is longer than a year');
    return { title: title, allDay: true, start: a, end: b, oneDay: addDaysToDateString_(s, 1) === e };
  }
  const re = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/, ms = s.match(re), me = e.match(re);
  if (!ms || !me) throw new Error('Invalid time');
  const a = new Date(+ms[1], +ms[2] - 1, +ms[3], +ms[4], +ms[5]), b = new Date(+me[1], +me[2] - 1, +me[3], +me[4], +me[5]);
  if (b <= a) throw new Error('End time is before the start time');
  if (b - a > 31 * DAY_MS) throw new Error('Event is longer than a month');
  return { title: title, allDay: false, start: a, end: b };
}
function calPanelOut_(ev) {
  const cal = calPanelMain_();
  return calPanelEventOut_(ev, EVENT_CALENDARS[0], cal.getName(), String(cal.getColor() || '#039be5'), Session.getScriptTimeZone());
}
function calPanelEditable_(eventId, startMs) {
  if (!eventId) throw new Error('Missing event id');
  const ev = calEventAt_(EVENT_CALENDARS[0], String(eventId), Number(startMs));
  if (ev.isRecurringEvent()) throw new Error('Repeating events are read-only here — edit them in Google Calendar');
  return ev;
}
function calPanelCreateEvent(req) {
  const w = calPanelWhen_(req), opId = String((req && req.opId) || '').replace(/[^\w-]/g, '').slice(0, 60);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cache = CacheService.getScriptCache(), key = opId ? 'calOp:' + opId : '';
    const done = key && cache.get(key);
    if (done) {
      const d = JSON.parse(done);
      try { return Object.assign(calPanelOut_(calEventAt_(EVENT_CALENDARS[0], d.eventId, d.startMs)), { repeat: true }); }
      catch (e) { return { eventId: d.eventId, startMs: d.startMs, repeat: true }; }
    }
    const cal = calPanelMain_();
    const ev = w.allDay ? (w.oneDay ? cal.createAllDayEvent(w.title, w.start) : cal.createAllDayEvent(w.title, w.start, w.end))
      : cal.createEvent(w.title, w.start, w.end);
    try { ev.removeAllReminders(); } catch (e) { console.error(e); }
    const out = calPanelOut_(ev);
    if (key) cache.put(key, JSON.stringify({ eventId: out.eventId, startMs: out.startMs }), 21600);
    return out;
  } finally { lock.releaseLock(); }
}
function calPanelUpdateEvent(req) {
  const w = calPanelWhen_(req), ev = calPanelEditable_(req.eventId, req.startMs);
  if (ev.getTitle() !== w.title) ev.setTitle(w.title);
  if (w.allDay) { if (w.oneDay) ev.setAllDayDate(w.start); else ev.setAllDayDates(w.start, w.end); }
  else ev.setTime(w.start, w.end);
  return calPanelOut_(ev);
}
function calPanelDeleteEvent(req) {
  const r = req || {};
  let ev;
  try { ev = calPanelEditable_(r.eventId, r.startMs); }
  catch (e) { if (/not found/i.test(e.message)) return { ok: true, gone: true }; throw e; } // already deleted: nothing to do
  ev.deleteEvent();
  return { ok: true };
}

// One event by id + start time, so the right day of a repeating event is the one found.
function calEventAt_(calId, eventId, start) {
  const cal = CalendarApp.getCalendarById(calId);
  if (!cal) throw new Error('Calendar not found');
  const t = new Date(Number(start));
  const ev = cal.getEvents(new Date(t.getTime() - 60000), new Date(t.getTime() + 60000))
    .filter(e => e.getId() === eventId && Math.abs((e.isAllDayEvent() ? e.getAllDayStartDate() : e.getStartTime()).getTime() - t.getTime()) < 60000)[0]
    || cal.getEvents(new Date(t.getTime() - DAY_MS), new Date(t.getTime() + DAY_MS)).filter(e => e.getId() === eventId)[0];
  if (!ev) throw new Error('Event not found (moved or deleted?) — tap ↻ on the Calendar');
  return ev;
}
// Editing a title in Cal Events changes the Google Calendar event (2026-11-04, Julius).
function setCalendarEventTitle(calId, eventId, start, title) {
  if (EVENT_CALENDARS.indexOf(calId) < 0) throw new Error('Not one of the app calendars');
  const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!name) throw new Error('Title is empty');
  calEventAt_(calId, eventId, start).setTitle(name);
  return { title: name };
}

/* Calendar checkbox (2026-10-29, Julius): ticking an event in the Reference Calendar panel marks it done the
   same way he does by hand — Graphite color. Unticking puts back the color it had (yellow = open if unknown).
   start = the event's start time (ms), so the right day of a repeating event is changed. */
function setCalendarEventDone(calId, eventId, start, done) {
  if (EVENT_CALENDARS.indexOf(calId) < 0) throw new Error('Not one of the app calendars');
  const ev = calEventAt_(calId, eventId, start);
  const props = PropertiesService.getScriptProperties();
  const key = 'calPrev:' + eventId.slice(0, 60) + ':' + Number(start);
  if (done) {
    const cur = String(ev.getColor() || '');
    if (cur !== '8') props.setProperty(key, cur || 'default');
    ev.setColor('8');
  } else {
    const prev = props.getProperty(key);
    // '0' clears the event color so a default-colored event goes back to the calendar's own color.
    ev.setColor(prev && prev !== '8' && prev !== 'default' ? prev : prev === 'default' ? '0' : '5');
    props.deleteProperty(key);
  }
  if (done && archiveAuto_()) { try { archiveCompletedTasks({}); } catch (e) { console.error(e); } }
  return { done: !!done, color: String(ev.getColor() || '') };
}

/* =========================================================
   DAILY COMPLETED-TASK ARCHIVE (Julius's spec, 2026-10-29)
   Keeps the main calendar uncluttered: finished task events (Graphite AND title starting "[x] ", or the old
   trailing " X" — Julius 2026-10-29 switched the logged marker to a "[x] " prefix) are folded
   into one all-day "✅ Completed Tasks — YYYY-MM-DD" event per date on the same calendar, then deleted.
   - Only main calendar; never recurring events, events with guests (meetings) or the archive itself.
   - A date is archived once 3+ eligible events wait on it, or any number once its archive exists.
   - Each task becomes "[x] Title" (marker dropped) + an indented line with the time, the original
     event id marker (dedupe/traceability) and its original description.
   - Originals are deleted only after the archive is re-read and every marker is found in it; anything
     already in the archive (an earlier run that failed to delete) is deleted on the next run.
   - Failures keep the original event and are reported; reruns are safe (script lock + markers).
   - The Gantt cells are never touched (task history stays there).
   - Auto mode is OFF until Julius turns it on in the Calendar panel (test with 3 events first). When on,
     it runs on Calendar panel load and when an event is ticked done.
   ========================================================= */
const ARCHIVE_CAL = 'juliussimtim@gmail.com';
const ARCHIVE_PREFIX = '✅ Completed Tasks — ';
const ARCHIVE_DAYS_BACK = 14;
const ARCHIVE_MIN = 3;

function archiveAuto_() { return PropertiesService.getScriptProperties().getProperty('archiveAuto') === '1'; }
function setArchiveAuto(on) {
  PropertiesService.getScriptProperties().setProperty('archiveAuto', on ? '1' : '0');
  return archiveAuto_();
}

const ARCHIVE_DONE_RE_ = /^\[x\]\s|\sX$/i;
const archiveName_ = t => String(t || '').trim().replace(/^\[x\]\s*/i, '').replace(/\s+X$/, '');

function archiveMarker_(ev, startMs) { return '⟦id ' + ev.getId() + '@' + startMs + '⟧'; }

function archiveIsEligible_(ev) {
  const title = String(ev.getTitle() || '').trim();
  if (title.indexOf(ARCHIVE_PREFIX) === 0) return false;
  if (!ARCHIVE_DONE_RE_.test(title)) return false;            // logged: "[x] " prefix (or old " X")
  if (String(ev.getColor() || '') !== '8') return false;      // Graphite
  try { if (ev.isRecurringEvent()) return false; } catch (e) { return false; }
  try { if (ev.getGuestList().length) return false; } catch (e) {} // meetings / appointments with people
  return true;
}

// opts: { dryRun } → { ready, dates: [{ date, eligible, archived, deleted, waiting, errors }], errors }
function archiveCompletedTasks(opts) {
  opts = opts || {};
  const tz = Session.getScriptTimeZone();
  const cal = CalendarApp.getCalendarById(ARCHIVE_CAL);
  if (!cal) throw new Error('Main calendar not found');
  const today = todayString_();
  const start = parseDate_(addDaysToDateString_(today, -ARCHIVE_DAYS_BACK));
  const end = parseDate_(addDaysToDateString_(today, 1));
  const lock = LockService.getScriptLock();
  if (!opts.dryRun) lock.waitLock(20000);
  const report = { ready: 0, dates: [], errors: [] };
  try {
    const all = cal.getEvents(start, end);
    const byDate = {}, archives = {};
    all.forEach(ev => {
      const allDay = ev.isAllDayEvent();
      const s = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
      const date = Utilities.formatDate(s, tz, 'yyyy-MM-dd');
      const title = String(ev.getTitle() || '');
      if (title === ARCHIVE_PREFIX + date && allDay) { archives[date] = ev; return; }
      if (!archiveIsEligible_(ev)) return;
      (byDate[date] = byDate[date] || []).push({ ev: ev, start: s.getTime(), allDay: allDay, end: (allDay ? ev.getAllDayEndDate() : ev.getEndTime()).getTime() });
    });
    Object.keys(byDate).sort().forEach(date => {
      const list = byDate[date];
      let archive = archives[date] || null;
      const r = { date: date, eligible: list.length, archived: 0, deleted: 0, waiting: 0, errors: [] };
      report.dates.push(r);
      if (!archive && list.length < ARCHIVE_MIN) { r.waiting = list.length; return; }
      report.ready += list.length;
      if (opts.dryRun) { r.titles = list.map(x => x.ev.getTitle()); return; }

      // 1. Write every new entry into the archive (create it if needed).
      const before = archive ? String(archive.getDescription() || '') : '';
      const fresh = list.filter(x => before.indexOf(archiveMarker_(x.ev, x.start)) < 0);
      const text = fresh.map(x => {
        const name = archiveName_(x.ev.getTitle());
        const when = x.allDay ? 'all day' :
          Utilities.formatDate(new Date(x.start), tz, 'h:mm') + '–' + Utilities.formatDate(new Date(x.end), tz, 'h:mm a');
        const desc = String(x.ev.getDescription() || '').trim();
        const loc = String(x.ev.getLocation() || '').trim();
        return '[x] ' + name + '\n    ' + when + (loc ? ' · ' + loc : '') + ' · ' + archiveMarker_(x.ev, x.start) +
          (desc ? '\n' + desc.split('\n').map(l => '    ' + l).join('\n') : '');
      }).join('\n');
      try {
        if (!archive) {
          archive = cal.createAllDayEvent(ARCHIVE_PREFIX + date, parseDate_(date), { description: text });
          try { archive.setColor('8'); } catch (e) {}
        } else if (text) {
          archive.setDescription(before ? before.replace(/\s+$/, '') + '\n' + text : text);
        }
      } catch (e) {
        r.errors.push('Could not write the archive: ' + e.message + ' (nothing deleted)');
        return;
      }
      r.archived = fresh.length;

      // 2. Verify: re-read the archive and check each marker before deleting anything.
      let saved = '';
      try {
        const again = cal.getEventById(archive.getId());
        saved = String((again || archive).getDescription() || '');
      } catch (e) {
        r.errors.push('Could not re-read the archive: ' + e.message + ' (nothing deleted)');
        return;
      }
      // 3. Delete only verified originals.
      list.forEach(x => {
        if (saved.indexOf(archiveMarker_(x.ev, x.start)) < 0) {
          r.errors.push('Not found in archive, kept: ' + x.ev.getTitle());
          return;
        }
        try { x.ev.deleteEvent(); r.deleted++; }
        catch (e) { r.errors.push('Could not delete "' + x.ev.getTitle() + '": ' + e.message + ' (kept; it is already in the archive)'); }
      });
    });
  } catch (e) {
    report.errors.push(e.message);
  } finally {
    if (!opts.dryRun) lock.releaseLock();
  }
  return report;
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
      html += '<div class="check-line" data-level="' + level + '"' + taskMetaAttrs_(it && it.meta) + (level ? ' style="margin-left: ' + (level * 24) + 'px;"' : '') + '>' +
        doneCheck_(false) + '<span class="check-text">' + String((it && it.html) || '') + '</span></div>';
    });
    cell.setValue(html);
    return true;
  } finally { lock.releaseLock(); }
}

/* Task fields kept when a line is sent to a day that isn't loaded (2026-10-28):
   urgency, subject, due, duration. Validated like the client's save filter. The
   corner label (data-due-label) is rebuilt by the app on load. */
function taskMetaAttrs_(m) {
  if (!m) return '';
  let a = '';
  if (/^[123]$/.test(String(m.urg || ''))) a += ' data-urg="' + m.urg + '"';
  if (/^[a-z]{2,12}$/.test(String(m.cat || ''))) a += ' data-cat="' + m.cat + '"';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(m.due || ''))) a += ' data-due="' + m.due + '"';
  const dur = Math.round(Number(m.dur));
  if (dur >= 1 && dur <= 6000) a += ' data-dur="' + dur + '"';
  return a;
}

/* Planning data (2026-10-28, auto-reshuffle groundwork): the tasks in one day's
   Today cell with the fields a scheduler needs. Read-only; no scheduling here.
   Returns [{index, level, text, done, urg (0-3), due ('' or YYYY-MM-DD), dur (minutes, 0 = none)}]. */
function getDayTasks(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) throw new Error('Bad date');
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
  const row = findDayRow_(sheet, dateString);
  return row ? parseTasks_(String(sheet.getRange(row, 2).getValue() || '')) : [];
}

function parseTasks_(html) {
  const out = [];
  const re = /<div\b([^>]*\bclass="[^"]*\bcheck-line\b[^"]*"[^>]*)>/g;
  const opens = [];
  let m;
  while ((m = re.exec(html))) opens.push({ attrs: m[1], start: m.index, end: re.lastIndex });
  opens.forEach((o, i) => {
    const seg = html.slice(o.end, i + 1 < opens.length ? opens[i + 1].start : html.length);
    const attr = name => { const x = new RegExp('\\b' + name + '="([^"]*)"').exec(o.attrs); return x ? x[1] : ''; };
    const urg = /^[123]$/.test(attr('data-urg')) ? Number(attr('data-urg')) : 0;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(attr('data-due')) ? attr('data-due') : '';
    const durN = Math.round(Number(attr('data-dur')));
    const cls = attr('class');
    out.push({
      index: i,
      level: Math.max(0, Math.floor(Number(attr('data-level')) || 0)),
      text: taskText_(seg),
      done: /\bdone\b/.test(cls) || /<input\b[^>]*\bchecked\b/.test(seg),
      urg: urg,
      due: due,
      dur: durN >= 1 && durN <= 6000 ? durN : 0
    });
  });
  return out;
}

// Text of the line's .check-text span (nested spans counted).
function taskText_(seg) {
  const s = seg.search(/<span\b[^>]*\bclass="check-text"[^>]*>/);
  if (s < 0) return '';
  const tag = /<\/?span\b[^>]*>/g;
  tag.lastIndex = seg.indexOf('>', s) + 1;
  const from = tag.lastIndex;
  let depth = 1, t, to = seg.length;
  while ((t = tag.exec(seg))) {
    depth += t[0].charAt(1) === '/' ? -1 : 1;
    if (!depth) { to = t.index; break; }
  }
  return seg.slice(from, to).replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
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







