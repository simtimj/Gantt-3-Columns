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

  template.build = appBuild_(true);
  if (initial && initial.timing) initial.timing.build = template.build;
  template.initialData = JSON.stringify(initial)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  // Refresh button target: the app's own URL, opened in the top window.
  try { template.appUrl = ScriptApp.getService().getUrl(); } catch (err) { template.appUrl = ''; }

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
  const ss = SpreadsheetApp.getActiveSpreadsheet();

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


/* =========================================================
   WEB APP DATA
   ========================================================= */

/* Imports that write into the sheet (Done Log, AI tasks, To Confirm card, study log, schedule moves, one-time
   fixes). Fast start (2026-11-05, Julius: "update what it needs, like Google Sheets"): the first page load
   (doGet → getWorkspaceData({fast:true})) skips them and shows what's saved; the page then calls runImports(),
   which runs them and returns only the cells that changed, merged in place by the same code as fwSync. */
function runImportSteps_(t, req) {
  let snapshot = null;
  try { applyDeployedCodeLog_(); } catch (e) { console.error(e); } t.mark('deployLog');
  try { applyClaudeDone_(t); } catch (e) { console.error(e); } t.mark('done');
  try { applyClaudeNotes_(); } catch (e) { console.error(e); } t.mark('notes');
  try { applyClaudeTasks_(); } catch (e) { console.error(e); } t.mark('tasks');
  try { syncConfirmCard_(t); } catch (e) { console.error(e); } t.mark('confirm');
  try { syncStudyLog_(t); } catch (e) { console.error(e); } t.mark('study');
  try { if (req) snapshot = readScheduleForSync_(req, t); else moveScheduleToNotes_(); }
  catch (e) { snapshot = null; console.error(e); } t.mark('schedule');
  // Both one-time fixes can write Days after the schedule read. Only an
  // explicit no-op preserves the snapshot; failures may have partially written.
  try { if (fixUrgentBold_() !== false) snapshot = null; }
  catch (e) { snapshot = null; console.error(e); } t.mark('fixBold');
  try { if (removeDaySections_() !== false) snapshot = null; }
  catch (e) { snapshot = null; console.error(e); } t.mark('fixSecs');
  return snapshot;
}

function runImports(req) {
  const t = speedTimer_();
  req = req || {};
  const snapshot = runImportSteps_(t, req);
  const out = syncDiff_(req, t, snapshot);
  try { out.inbox = getInbox(); } catch (e) { console.error(e); } t.mark('inbox');
  out.timing = t.done();
  out.timing.build = out.build;
  return out;
}

function getWorkspaceData(opts) {
  const fast = !!(opts && opts.fast);
  const t = speedTimer_();
  ensureSetup_(t); t.mark('setup');
  if (!fast) runImportSteps_(t);

  const today = todayString_();
  // One read of the whole Days sheet for Urgent + Dailies seeds (2026-11-04: each used to read it on its own,
  // ~800 rows of History HTML twice per load). Read after the apply steps above, so it includes their writes.
  const allDays = readAllDays_(); t.mark('readAllDays');

  const days = getDaysRange_(
    addDaysToDateString_(today, -INITIAL_PAST_DAYS),
    addDaysToDateString_(today, INITIAL_FUTURE_DAYS),
    allDays
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
    refManifestHash: referenceManifest_(reference).hash,
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
function deployedBuild_() { return typeof FW_DEPLOY_BUILD === 'string' ? FW_DEPLOY_BUILD : ''; }
function speedTimer_() {
  const start = Date.now(), steps = {};
  let last = start;
  return {
    mark: name => { const n = Date.now(); steps[name] = n - last; last = n; },
    // Nested durations overlap their parent mark; do not add them to parent totals.
    measure: (name, work) => {
      const begin = Date.now();
      try { return work(); } finally { steps[name] = (steps[name] || 0) + Date.now() - begin; }
    },
    done: () => ({ total: Date.now() - start, steps: steps, release:deployedBuild_() })
  };
}
// Optional instrumentation: preserve direct callers and old test timers without measure().
function speedPart_(timer, name, work) {
  return timer && typeof timer.measure === 'function' ? timer.measure(name, work) : work();
}
function logSpeed(kind, timing, client) {
  const sheet = getOrCreateSheet_('Speed Log', SPEED_HEADERS);
  const t = timing || {};
  const context = Object.assign({}, client || {}, { schema:2, serverRelease:String(t.release || ''), serverBuild:String(t.build || '') });
  sheet.appendRow([new Date(), String(kind || ''), Number(t.total) || 0, JSON.stringify(t.steps || {}),
    JSON.stringify(context), JSON.stringify(t.kb || {})]);
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


function getDaysRange_(startDate, endDate, snapshot, hashDates, timer) {
  // Schedule checks need the live text, but only requested sync dates need
  // version hashes. No cross-request cache: each read still sees Sheet edits.
  const hashesFor = date => !hashDates || hashDates.has(date);
  // Initial loading has already read these exact rows for seeds and Urgent.
  // Reuse only that request's snapshot; later calls still read current data.
  if (snapshot && Array.isArray(snapshot.rows)) {
    if (!snapshot.rows.length) return [];
    // Skip distant Date cells before timezone formatting. Keep a conservative
    // two-day margin for timezone offsets and 25-hour daylight-saving days.
    const lo = parseDate_(startDate).getTime() - 2 * DAY_MS;
    const hi = parseDate_(endDate).getTime() + 2 * DAY_MS;
    return snapshot.rows.filter(row => {
      const value = row[0];
      if (!value) return false;
      if (isDate_(value)) {
        const time = value.getTime();
        if (time < lo || time > hi) return false;
      }
      return true; // text dates still use the existing normalization below
    }).map(row => ({ row: row, date: formatDate_(row[0]) }))
      .filter(x => x.date && x.date >= startDate && x.date <= endDate)
      .map(x => {
        const row = x.row, plan = snapshot.width >= 4 ? String(row[3] || '') : '';
        return { date:x.date, tasks:String(row[1] || ''), journal:String(row[2] || ''), plan:plan,
          th:hashesFor(x.date) ? cellHash_(row[1]) : undefined,
          jh:hashesFor(x.date) ? cellHash_(row[2]) : undefined,
          ph:hashesFor(x.date) ? cellHash_(plan) : undefined };
      }).sort((a,b) => a.date.localeCompare(b.date));
  }
  const sheet = speedPart_(timer, 'schedule.lookup', () => getOrCreateSheet_('Days', DAYS_HEADERS, timer));
  const lastRow = speedPart_(timer, 'schedule.bounds', () => sheet.getLastRow());

  if (lastRow < 2) {
    return [];
  }

  // Read only the Date column to find the rows.
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

      if (key && key >= startDate && key <= endDate) {
        matches.push({ row: i + 2, date: key });
      }
    }
  });

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
  // One metadata lookup even when matching dates occupy several row runs.
  const width = speedPart_(timer, 'schedule.width', () => sheet.getMaxColumns() >= 4 ? 3 : 2);
  runs.forEach(group => {
    // Column D = Plan pad (one-day view, 2026-10-29) when the sheet has it.
    const block = speedPart_(timer, 'schedule.textRead', () => sheet
      .getRange(group.start, 2, group.end - group.start + 1, width)
      .getValues());

    speedPart_(timer, 'schedule.decode', () => group.items.forEach(match => {
      const row = block[match.row - group.start];
      const plan = width > 2 ? String(row[2] || '') : '';
      out.push({
        date: match.date,
        tasks: String(row[0] || ''),
        journal: String(row[1] || ''),
        plan: plan,
        th: hashesFor(match.date) ? cellHash_(row[0]) : undefined,
        jh: hashesFor(match.date) ? cellHash_(row[1]) : undefined,
        ph: hashesFor(match.date) ? cellHash_(plan) : undefined
      });
    }));
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
    const res = { th: cellHash_(t.value), jh: cellHash_(j.value), conflictT: !!t.conflict, conflictJ: !!j.conflict, build: appBuild_(), release:deployedBuild_() };
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
  req = req || {};
  let snapshot = null;
  try { snapshot = readScheduleForSync_(req, t); }
  catch (e) { console.error(e); } t.mark('schedule');
  const out = syncDiff_(req, t, snapshot);
  out.timing = t.done();
  out.timing.build = out.build;
  return out;
}

// A schedule read can also serve the response, only within this request.
// A write or thrown/partial migration invalidates it; disjoint historical
// views retain separate bounded ranges rather than reading the entire gap.
function readScheduleForSync_(req, t) {
  const dates = Object.keys(req.days || {}).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const today = todayString_(), end = addDaysToDateString_(today, 7);
  if (dates.length && (dates[0] > end || dates[dates.length - 1] < today)) {
    moveScheduleToNotes_();
    return null;
  }
  const snapshot = speedPart_(t, 'schedule.read', () => getDaysRange_(dates.length && dates[0] < today ? dates[0] : today,
    dates.length && dates[dates.length - 1] > end ? dates[dates.length - 1] : end, null, new Set(dates), t));
  return moveScheduleToNotes_(snapshot.filter(d => d.date >= today && d.date <= end)) ? null : snapshot;
}

// Cells whose hash differs from what the page has (days by date, Reference cards by id).
function syncDiff_(req, t, daysSnapshot) {
  const out = { build: appBuild_(), days: {}, ref: {} }; t.mark('build');
  const dates = Object.keys(req.days || {}).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (dates.length) {
    (daysSnapshot || getDaysRange_(dates[0], dates[dates.length - 1])).forEach(d => {
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
  if (req.refSync === 2 || Object.keys(refWant).length) {
    const reference = getReference_();
    reference.forEach(r => {
      const known = Object.prototype.hasOwnProperty.call(refWant, r.id);
      if ((known && refWant[r.id] !== r.ch) || (!known && req.refSync === 2)) out.ref[r.id] = { content: r.content, ch: r.ch };
    });
    if (req.refSync === 2) {
      const manifest = referenceManifest_(reference);
      if (req.refManifestHash !== manifest.hash) out.refManifest = manifest;
    }
  }
  t.mark('reference');
  return out;
}

function referenceManifest_(items) {
  const meta = items.map(r => ({ id:r.id, parentId:r.parentId, type:r.type, title:r.title, expanded:r.expanded, sort:r.sort }));
  return { hash:cellHash_(JSON.stringify(meta)), items:meta };
}


/* Schedule cell (Julius, 2026-10-29): time-block tasks ("10:00–10:30 · Walk Blocks setup …") don't belong in
   the Morning block of Today. For today and the next 7 days they move, as they are (checkboxes, done state,
   subtasks), into their own boxed cell in Notes, right under the Suggested Day:
   <table data-cnote="s-YYYYMMDD" data-ckind="sched"><tr><td>title</td></tr><tr><td>lines</td></tr></table>.
   New time-block lines added later join the same cell. */
const SCHED_RE_ = /^\s*\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*[–—-]\s*\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*·/i;

function moveScheduleToNotes_(snapshot) {
  const today = todayString_();
  const days = snapshot || getDaysRange_(today, addDaysToDateString_(today, 7), null, new Set());
  const todo = days.filter(d => d.tasks.indexOf('·') >= 0 && splitSchedule_(d.tasks).lines.length);
  if (!todo.length) return false;
  const sheet = getOrCreateSheet_('Days', DAYS_HEADERS);
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
  if (props.getProperty('urgBoldFix') === '1') return false;
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
  return true;
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
    let res = sync ? { id: id, build: appBuild_(), release:deployedBuild_() } : null;

    // A stale tab must not recreate a card deleted on another device.
    if (!row && sync && (item.id || item.expectedExisting || item.baseHash)) return { id:id, deleted:true, build:res.build, release:res.release };

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


/* =========================================================
   SHEET HELPERS
   ========================================================= */

function getOrCreateSheet_(name, headers, timer) {
  // Optional nested profiling uses the same service calls as ordinary callers.
  // Only the schedule reader supplies a timer; names, IDs and data stay private.
  const ss = speedPart_(timer, 'schedule.spreadsheet', () => SpreadsheetApp.getActiveSpreadsheet());

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
function inboxRead_(key, def, snapshot) {
  try {
    const v = snapshot ? snapshot[key] : PropertiesService.getUserProperties().getProperty(key);
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
// Legacy numbered chunks remain readable. New saves stage UTF-8-bounded chunks under a unique
// generation, verify them, then publish one head property. An interrupted staging write leaves
// the previous complete list selected; leftover generations are cleaned on the next save.
function focusGenerationText_(all, head) {
  const fail = () => { throw new Error('Focus data could not be read; the saved list was not changed.'); };
  if (!head || head.v !== 2 || !/^[a-zA-Z0-9-]{1,80}$/.test(head.g || '') ||
      !Number.isInteger(head.n) || head.n < 1 || head.n > 200 || !Number.isInteger(head.len) || typeof head.h !== 'string') fail();
  let raw = '';
  for (let i = 0; i < head.n; i++) {
    const part = all['focusV2_' + head.g + '_' + i];
    if (typeof part !== 'string') fail();
    raw += part;
  }
  if (raw.length !== head.len || cellHash_(raw) !== head.h) fail();
  return raw;
}
function readFocus_() {
  const sp = PropertiesService.getScriptProperties(), all = sp.getProperties();
  let raw = '';
  try {
    if (all.focusDataHead !== undefined) raw = focusGenerationText_(all, JSON.parse(all.focusDataHead));
    else {
      const n = Number(all.focusDataN || 0);
      if (!Number.isInteger(n) || n < 0 || n > 200) throw new Error('Invalid Focus chunk count');
      if (all.focusDataN !== undefined && !String(all.focusDataN).trim()) throw new Error('Missing Focus chunk count');
      if (!n && !all.focusData && Object.keys(all).some(k => /^focusData_\d+$/.test(k))) throw new Error('Uncounted Focus chunks');
      if (n > 0) { for (let i = 0; i < n; i++) {
        if(typeof all['focusData_' + i] !== 'string') throw new Error('Incomplete Focus data');
        raw += all['focusData_' + i];
      } }
      else raw = all.focusData || '';
      if (n && !raw) throw new Error('Empty Focus chunks');
    }
    const data = raw ? JSON.parse(raw) : { v: 1, cats: [] };
    if(!data || !Array.isArray(data.cats)) throw new Error('Invalid Focus list');
    return data;
  } catch (e) { throw new Error('Focus data could not be read; the saved list was not changed.'); }
}
function getFocus() {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { return readFocus_(); } finally { lock.releaseLock(); }
}

// Three-way merge (2026-11-09, Julius: "don't make me approve every add"): never asks. Items merge by id
// (adds from every device survive), an item deleted on one side but edited on the other is kept, a field
// both sides changed goes to the newer edit (item u stamp, else this save), and the losing value is kept
// in script property focusMergeLog (last 20) so nothing is silently lost.
function mergeFocus_(base, mine, theirs) {
  const overwritten = [];
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const stamp = v => object(v) && typeof v.u === 'number' ? v.u : 0;
  function merge(b,m,t,path,mineNewer) {
    if(same(m,b)) return t;
    if(same(t,b) || same(m,t)) return m;
    // Removed on one side, changed on the other: keep the changed copy.
    if(m === undefined && object(t)) return t;
    if(t === undefined && object(m)) return m;
    if(object(b) && object(m) && object(t)) {
      const newer = stamp(m) || stamp(t) ? stamp(m) >= stamp(t) : mineNewer;
      const out = {};
      [...new Set(Object.keys(b).concat(Object.keys(m),Object.keys(t)))].forEach(k => {
        const v = merge(b[k],m[k],t[k],path + '.' + k,newer);
        if(v !== undefined) out[k] = v;
      });
      return out;
    }
    const records = a => Array.isArray(a) && a.every(x => object(x) && typeof x.id === 'string');
    const uniq = a => { const seen = {}; return a.filter(x => seen[x.id] ? false : (seen[x.id] = true)); };
    if(Array.isArray(b) && records(m) && records(t) && (records(b) || !b.length)) {
      b = uniq(b); m = uniq(m); t = uniq(t);
      const maps = [b,m,t].map(a => new Map(a.map(x => [x.id,x]))), out = new Map();
      [...new Set(b.concat(m,t).map(x => x.id))].forEach(id => {
        const v = merge(maps[0].get(id),maps[1].get(id),maps[2].get(id),path + '[' + id + ']',mineNewer);
        if(v !== undefined) out.set(id,v);
      });
      const common = b.map(x => x.id).filter(id => maps[1].has(id) && maps[2].has(id) && out.has(id));
      const order = a => a.map(x => x.id).filter(id => common.indexOf(id) >= 0);
      const tc = !same(order(t),common) && same(order(m),common);
      // Order: the side that reordered wins; if both did, this save (the latest action) wins.
      const primary = tc ? t : m, secondary = tc ? m : t;
      const ids = primary.map(x => x.id).filter(id => out.has(id));
      // Keep insertions near their next surviving neighbour, rather than losing their position.
      secondary.forEach((x,i) => {
        if(!out.has(x.id) || ids.indexOf(x.id) >= 0) return;
        const next = secondary.slice(i+1).find(n => ids.indexOf(n.id) >= 0);
        ids.splice(next ? ids.indexOf(next.id) : ids.length,0,x.id);
      });
      out.forEach((v,id) => { if(ids.indexOf(id) < 0) ids.push(id); });
      return ids.map(id => out.get(id));
    }
    const win = mineNewer === false ? t : m, lose = win === m ? t : m;
    overwritten.push({path:path,lost:lose});
    return win;
  }
  return {data:merge(base,mine,theirs,'focus',true),conflicts:[],overwritten:overwritten};
}

function saveFocus(data, opts) {
  if(!data || !Array.isArray(data.cats) || (opts && opts.base && !Array.isArray(opts.base.cats))) throw new Error('Invalid Focus list');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const current = readFocus_();
    if(JSON.stringify(data) === JSON.stringify(current)) return {data:current};
    if(!opts || !opts.base) throw new Error('Reload the app before saving Focus; this older tab cannot safely merge changes.');
    const result = mergeFocus_(opts.base,data,current);
    writeFocus_(result.data);
    if(result.overwritten.length) {
      try {
        const sp = PropertiesService.getScriptProperties();
        let log = []; try { log = JSON.parse(sp.getProperty('focusMergeLog') || '[]'); } catch (e) {}
        log = log.concat(result.overwritten.map(o => ({at:Date.now(),path:o.path,lost:JSON.stringify(o.lost === undefined ? null : o.lost).slice(0,500)}))).slice(-20);
        sp.setProperty('focusMergeLog',JSON.stringify(log));
      } catch (e) {}
    }
    return {data:result.data,merged:result.overwritten.length};
  } finally { lock.releaseLock(); }
}

function writeFocus_(data) {
  const json = JSON.stringify(data || { v: 1, cats: [] });
  if (json.length > 200000) throw new Error('Focus data too big (' + json.length + ' chars)');
  const sp = PropertiesService.getScriptProperties();
  const prior = sp.getProperties(), oldHeadRaw = prior.focusDataHead === undefined ? null : prior.focusDataHead;
  const oldHead = oldHeadRaw === null ? null : JSON.parse(oldHeadRaw);
  if (oldHeadRaw !== null) focusGenerationText_(prior,oldHead);
  const generation = Utilities.getUuid(), prefix = 'focusV2_' + generation + '_';
  if (Object.keys(prior).some(k => k.indexOf(prefix) === 0)) throw new Error('Focus save generation already exists; retry.');
  // Reclaim interrupted or post-commit leftovers, never the selected generation.
  const oldPrefix = oldHead ? 'focusV2_' + oldHead.g + '_' : '';
  Object.keys(prior).filter(k => k.indexOf('focusV2_') === 0 && (!oldPrefix || k.indexOf(oldPrefix) !== 0))
    .forEach(k => { try { sp.deleteProperty(k); } catch (e) {} });
  const props = {}, parts = []; let part = '', bytes = 0;
  for (const character of json) {
    const code = character.codePointAt(0), size = code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    if (bytes + size > 8000) { parts.push(part); part = ''; bytes = 0; }
    part += character; bytes += size;
  }
  if (part) parts.push(part);
  parts.forEach((value,i) => { props[prefix + i] = value; });
  const head = {v:2,g:generation,n:parts.length,len:json.length,h:cellHash_(json)}, headRaw = JSON.stringify(head);
  try {
    sp.setProperties(props);
    const staged = sp.getProperties();
    if ((staged.focusDataHead === undefined ? null : staged.focusDataHead) !== oldHeadRaw) throw new Error('Focus changed during staging');
    if (focusGenerationText_(staged,head) !== json) throw new Error('Focus staging verification failed');
    sp.setProperty('focusDataHead',headRaw);
    if (sp.getProperty('focusDataHead') !== headRaw) throw new Error('Focus commit was not confirmed');
  } catch (e) {
    // A service can apply a write and then report an error. Check before deleting staged chunks.
    let observed;
    try { observed = sp.getProperty('focusDataHead'); } catch (readError) {}
    if (observed === headRaw) return true;
    if (observed !== undefined) Object.keys(props).forEach(k => { try { sp.deleteProperty(k); } catch (cleanupError) {} });
    throw new Error('Focus save could not be confirmed; your draft is kept. Retry. ' + String(e.message || e).slice(0,200));
  }
  // Cleanup is after commit and best effort: a cleanup error must not turn a saved edit into a failure.
  Object.keys(prior).filter(k => k.indexOf('focusV2_') === 0 || /^focusData_\d+$/.test(k) || k === 'focusDataN' || k === 'focusData')
    .forEach(k => { if (k.indexOf(prefix) !== 0) try { sp.deleteProperty(k); } catch (e) {} });
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
  // These three fields belong to the same user settings store. Read them once
  // per response; keep individual-read fallback if the bulk read is unavailable.
  let settings = null;
  try { settings = PropertiesService.getUserProperties().getProperties(); } catch (e) {}
  const done = inboxRead_('inboxDone', [], settings);
  const mine = inboxRead_('inboxItems', [], settings);
  const over = inboxRead_('inboxOver', {}, settings);
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
  if (props.getProperty('daySecsRemoved') === '1') return false;
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
  return true;
}

/* Sheet intake (2026-11-02, Julius): any AI appends a row to the "Done Log" or
   "New Tasks" tab, with no deploy. Rows are never edited; the next app load
   applies each new one once. The id comes from the row's text, so an exact
   repeat is added once and a line he deletes stays deleted. */
const DONE_LOG_HEADERS = ['Date', 'Project', 'Title', 'Details', 'Done by', 'Type'];
const NEW_TASKS_HEADERS = ['Date', 'Title', 'Urgency 0-2', 'Due', 'Minutes', 'Subtasks', 'Added'];
/* Urgency scale (2026-11-08, Julius): people and AIs write 0 / 1 / 2 (0 = red, 1 = yellow, 2 = blue, blank = none);
   inside the app the stored value stays 1 / 2 / 3. The New Tasks column switches to the new scale only when its header
   reads "Urgency 0-2", so rows written before the switch keep their old meaning. Words work on both scales. */
function intakeUrg_(v, newScale) {
  const t = String(v == null ? '' : v).trim().toLowerCase();
  if (!t) return 0;
  if (/^(urgent|now|red|must)/.test(t)) return 1;
  if (/^(soon|next|yellow)/.test(t)) return 2;
  if (/^(later|can be later|blue)/.test(t)) return 3;
  const n = Number(t);
  if (!isFinite(n)) return 0;
  if (newScale) return n === 0 ? 1 : n === 1 ? 2 : n === 2 ? 3 : 0;
  return [1, 2, 3].indexOf(n) >= 0 ? n : 0;
}
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

function confirmRows_(sheet, timer, phase) {
  const rows = speedPart_(timer, phase + '.sourceRead', () => sheet.getDataRange().getValues());
  const dateOf = intakeDateFormatter_();
  return speedPart_(timer, phase + '.rows', () => {
    const normalized = rows.slice(1).map((r, i) => {
      const date = dateOf(r[0]);
      const project = String(r[1] || '').trim() || 'Other';
      const change = String(r[2] || '').trim();
      return { row: i + 2, input: [date, project, change].join('|'), date, project, change,
        how: String(r[3] || '').trim(), status: String(r[4] || '').trim().toLowerCase() };
    });
    const hashes = rowIdentityHashes_(normalized.map(x => x.input), timer, phase, 'confirm');
    return normalized.map(({input, ...item}, i) => Object.assign({id:'k-' + hashes[i]}, item))
      .filter(x => x.change);
  });
}

// Keep the derived card below the Sheet cell limit. Full source rows are never shortened.
const CONFIRM_HTML_LIMIT = 48000;
function confirmCardHtml_(rows) {
  const open = rows.filter(x => x.status !== 'works');
  const short = d => { const m = String(d).match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? Number(m[1]) + '/' + Number(m[2]) : String(d); };
  const clip = (value, limit) => {
    if (limit === Infinity) return String(value);
    const chars = Array.from(String(value));
    return chars.length > limit ? chars.slice(0,Math.max(0,limit-1)).join('') + '…' : String(value);
  };
  const projects = [];
  open.forEach(x => { if (projects.indexOf(x.project) < 0) projects.push(x.project); });
  const ordered = [].concat(...projects.map(p => open.filter(x => x.project === p)
    .sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row)));
  function render(items, howLimit, bounded) {
    const compact = howLimit !== Infinity;
    let html = '<h2>To Confirm</h2><p><i>' + (open.length ? open.length + ' to check' : 'Nothing to check') +
      ' · tick a line once it works on your phone. Broken? Tell Claude. (From the To Confirm tab.)</i></p>';
    if (compact) html += '<p><i>Short instructions shown; full text stays in the To Confirm tab.</i></p>';
    projects.forEach(p => {
      const list = items.filter(x => x.project === p);
      if (!list.length) return;
      const group = bounded ? 'group-' + cellHash_(p) : p;
      html += '<div data-kgrp="' + doneEsc_(group) + '"><b><u>' + doneEsc_(bounded ? clip(p,80) : p) + ' (' + list.length + ')</u></b></div>';
      list.forEach(x => {
        const how = howLimit ? clip(x.how,howLimit) : '';
        html += '<div class="check-line" data-level="0" data-kid="' + x.id + '">' + doneCheck_(false) +
          '<span class="check-text">' + (x.status === 'broken' ? '⚠ broken · ' : '') + '<b>' + doneEsc_(bounded ? clip(x.change,200) : x.change) + '</b> · ' +
          doneEsc_(bounded ? clip(short(x.date),32) : short(x.date)) + (how ? ': ' + doneEsc_(how) : '') + '</span></div>';
      });
    });
    if (items.length < open.length) html += '<p><i>Showing ' + items.length + ' of ' + open.length +
      ' checks. Remaining checks and full instructions stay in the To Confirm tab.</i></p>';
    return html;
  }
  // Preserve the existing full presentation when it fits. Compact deterministically
  // before dropping any rows, so an unchanged large queue stops needing the lock.
  for (const limit of [Infinity,120,80,40,0]) {
    const html = render(ordered,limit,false);
    if (html.length <= CONFIRM_HTML_LIMIT) return html;
  }
  // Even titles alone may eventually exceed one cell. Keep whole oldest-first
  // check-lines (never slice HTML), make omissions explicit and retain the source.
  let lo = 0, hi = ordered.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (render(ordered.slice(0,mid),0,true).length <= CONFIRM_HTML_LIMIT) lo = mid;
    else hi = mid - 1;
  }
  return render(ordered.slice(0,lo),0,true);
}

function syncConfirmCard_(timer) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('To Confirm');
  if (!sheet) return; // nothing until the tab exists
  const sources = { sheet:sheet, ref:getOrCreateSheet_('Reference', REF_HEADERS) };
  // Fast path (2026-11-04): most loads change nothing, so check without taking the script lock.
  if (!confirmCardWork_(true,sources,timer)) return;
  const lock = LockService.getScriptLock();
  if (!speedPart_(timer, 'confirm.lock', () => lock.tryLock(5000))) return; // next load retries
  try { speedPart_(timer, 'confirm.reconcile', () => confirmCardWork_(false,sources,timer)); } finally { lock.releaseLock(); }
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

// dryRun: true → only report whether a write is needed.
function confirmCardWork_(dryRun,sources,timer) {
  {
    const phase = dryRun ? 'confirm.check' : 'confirm.write';
    const sheet = sources ? sources.sheet : getOrCreateSheet_('To Confirm', CONFIRM_HEADERS);
    const ref = sources ? sources.ref : getOrCreateSheet_('Reference', REF_HEADERS);
    let rows = confirmRows_(sheet,timer,phase);
    const card = speedPart_(timer, phase + '.cardRead', () => readConfirmCard_(ref)), cardRow = card.row, cur = card.content;
    // Ticked lines → Status works.
    const ticked = new Set();
    (cur.match(/<div\b[^>]*\bdata-kid="[^"]+"[^>]*>/g) || []).forEach(tag => {
      const id = tag.match(/data-kid="([^"]+)"/)[1];
      if (/\bclass="[^"]*\bdone\b/.test(tag)) ticked.add(id);
    });
    if (dryRun) {
      const pending = rows.some(x => ticked.has(x.id) && x.status !== 'works');
      return pending || !cardRow || cur.replace(/<!--fw-modified:\d+-->/, '') !== speedPart_(timer, phase + '.render', () => confirmCardHtml_(rows));
    }
    const today = todayString_();
    rows.forEach(x => {
      if (ticked.has(x.id) && x.status !== 'works') {
        sheet.getRange(x.row, 5, 1, 2).setValues([['works', today]]);
        x.status = 'works';
      }
    });
    const html = speedPart_(timer, phase + '.render', () => confirmCardHtml_(rows));
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

// A fresh formatter per source read, including the locked reread. Reuse only
// pure date normalization for identical timestamps, never rows, IDs or content.
function intakeDateFormatter_() {
  const dates = new Map();
  return value => {
    if (!(value instanceof Date)) return intakeDate_(value);
    const time = value.getTime();
    if (!dates.has(time)) dates.set(time,intakeDate_(value));
    return dates.get(time);
  };
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

// Memoize only deterministic ID digests, in small private cache blocks. Every
// source row is still read/normalized, and all input strings must match exactly
// before reusing a block. Cache eviction, corruption and failures only cost work.
function doneRowHashes_(inputs, timer) {
  return rowIdentityHashes_(inputs, timer, 'done', 'done');
}

function rowIdentityHashes_(inputs, timer, phase, scope) {
  const blocks = [];
  for (let i = 0; i < inputs.length; i += 32) {
    const values = inputs.slice(i, i + 32);
    blocks.push({ key:scope + '-id-hashes:v1:' + (i / 32), values:values,
      eligible:i < 1024 && JSON.stringify(values).length <= 18000 });
  }
  const keys = blocks.filter(b => b.eligible).map(b => b.key);
  let cache = null, found = {};
  if (keys.length) {
    try {
      cache = CacheService.getScriptCache();
      found = speedPart_(timer, phase + '.hashCacheRead', () => cache.getAll(keys)) || {};
    } catch (e) { cache = null; found = {}; }
  }
  const pending = {}, result = [];
  speedPart_(timer, phase + '.hashes', () => {}); // zero also identifies a fully warm read
  blocks.forEach(b => {
    let saved = null;
    try { saved = JSON.parse(found[b.key] || 'null'); } catch (e) {}
    const valid = Array.isArray(saved) && saved.length === 2 &&
      Array.isArray(saved[0]) && Array.isArray(saved[1]) &&
      saved[0].length === b.values.length && saved[1].length === b.values.length &&
      b.values.every((value, i) => saved[0][i] === value &&
        typeof saved[1][i] === 'string' && /^[a-f0-9]{16}$/.test(saved[1][i]));
    const hashes = valid ? saved[1] : speedPart_(timer, phase + '.hashes', () => b.values.map(value => cellHash_(value)));
    result.push(...hashes);
    if (!valid && cache && b.eligible) {
      const encoded = JSON.stringify([b.values, hashes]);
      if (encoded.length <= 20000) pending[b.key] = encoded;
    }
  });
  if (cache && Object.keys(pending).length) {
    try { speedPart_(timer, phase + '.hashCacheWrite', () => cache.putAll(pending, 600)); } catch (e) {}
  }
  return result;
}

function sheetDoneRows_(timer) {
  const sheet = getOrCreateSheet_('Done Log', DONE_LOG_HEADERS);
  const rows = speedPart_(timer, 'done.sourceRead', () => sheet.getDataRange().getValues());
  if (rows[0][5] !== 'Type') sheet.getRange(1, 6).setValue('Type');
  const oldest = addDaysToDateString_(todayString_(), -DONE_LOG_DAYS);
  const dateOf = intakeDateFormatter_();
  return speedPart_(timer, 'done.rows', () => {
    const normalized = rows.slice(1).map(r => {
      const date = dateOf(r[0]), project = String(r[1] || '').trim();
      const title = String(r[2] || '').trim(), details = String(r[3] || '').trim();
      return { date, project:project || 'Other', title, details,
        mine:/^(julius|me)$/i.test(String(r[4] || '').trim()), type:normLogType_(r[5]),
        input:[date, project, title, details].join('|') };
    });
    const hashes = doneRowHashes_(normalized.map(x => x.input), timer);
    return normalized.map(({input, ...item}, i) => Object.assign({id:'s-' + hashes[i]}, item))
      .filter(x => x.title && x.date >= oldest);
  });
}

function sheetTaskRows_(appliedIds) {
  const sheet = getOrCreateSheet_('New Tasks', NEW_TASKS_HEADERS);
  const range = sheet.getDataRange();
  const rows = range.getValues();
  if (rows[0][6] !== 'Added') sheet.getRange(1, 7).setValue('Added'); // tab made before this column
  const newScale = /0\s*-\s*2/.test(String(rows[0][2] || ''));
  // Every raw row is still checked, including backdated appends and title/date
  // changes. Displayed times are only needed for tasks not already applied.
  const pending = rows.slice(1).map((r, i) => {
    const raw = intakeDate_(r[0]);
    const date = /^(backlog|undated)$/i.test(raw) ? 'backlog' : raw;
    const title = String(r[1] || '').trim();
    return { r:r, i:i, date:date, title:title, id:'s-' + cellHash_([raw, title].join('|')) };
  }).filter(x => x.title && (!appliedIds || !appliedIds.has(x.id)));
  if (!pending.length) return [];
  const shown = range.getDisplayValues(); // time cells have raw 1899 dates
  return pending.map(x => {
    const r = x.r;
    return {
      id:x.id, date:x.date, title:x.title, urg: intakeUrg_(r[2], newScale), due: intakeDate_(r[3]), dur: Number(r[4]),
      subtasks: String(r[5] || '').split('|').map(t => t.trim()).filter(Boolean),
      added: intakeTime_(shown[x.i + 1][6]),
    };
  });
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

function applyClaudeDone_(timer) {
  let list = (typeof CLAUDE_DONE !== 'undefined' && Array.isArray(CLAUDE_DONE)) ? CLAUDE_DONE : [];
  try { list = list.concat(sheetDoneRows_(timer)); } catch (e) { console.error(e); }
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
  const needFix = speedPart_(timer, 'done.todayCheck', () => {
    const todaySnapshot = speedPart_(timer, 'done.todayRead', () => readDoneToday_(daysSheet, todayString_()));
    return speedPart_(timer, 'done.todayParse', () => !!todaySnapshot.row && doneFutureLines_(todaySnapshot.content).moved.length > 0);
  });
  if (!fresh.length && !migrate && !secFix && !needFix) return;
  const lock = LockService.getScriptLock();
  speedPart_(timer, 'done.lock', () => lock.waitLock(10000));
  try { speedPart_(timer, 'done.reconcile', () => {
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
  }); } finally { lock.releaseLock(); }
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
  const props = PropertiesService.getScriptProperties();
  let applied = [];
  try { applied = JSON.parse(props.getProperty('claudeTasksApplied') || '[]'); } catch (e) { applied = []; }
  let list = (typeof CLAUDE_TASKS !== 'undefined' && Array.isArray(CLAUDE_TASKS)) ? CLAUDE_TASKS : [];
  try { list = list.concat(sheetTaskRows_(new Set(applied))); } catch (e) { console.error(e); }
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

/* Calendar picker (2026-11-11, Julius): the 📅 panel and Cal Events show every calendar he ticks in the panel's
   "Calendars" fold (saved in script property calPicked, so phone and desktop match; default = main + Events).
   Editing works on any calendar he can edit (owner / writer); view-only ones (Time To Pet dog walks, holidays,
   subscriptions) stay read-only. Urgency colors (Tomato / Banana / Blueberry) stay main-calendar only. */
const CAL_PICK_PROP_ = 'calPicked';
let CAL_ACCESS_MEMO_ = null; // one read per server call
// Modern Google Calendar *calendar* colors by colorId (the event palette is CAL_PANEL_COLORS_).
const CAL_LIST_COLORS_ = { '1': '#795548', '2': '#e67c73', '3': '#d50000', '4': '#f4511e', '5': '#ef6c00', '6': '#f09300',
  '7': '#009688', '8': '#0b8043', '9': '#7cb342', '10': '#c0ca33', '11': '#e4c441', '12': '#f6bf26', '13': '#33b679',
  '14': '#039be5', '15': '#4285f4', '16': '#3f51b5', '17': '#7986cb', '18': '#b39ddb', '19': '#616161', '20': '#a79b8e',
  '21': '#ad1457', '22': '#d81b60', '23': '#8e24aa', '24': '#9e69af' };
function calAccess_(fresh) {
  if (!fresh && CAL_ACCESS_MEMO_) return CAL_ACCESS_MEMO_;
  const cache = CacheService.getScriptCache();
  if (!fresh) { try { const c = JSON.parse(cache.get('calAccess2') || 'null'); if (c) return (CAL_ACCESS_MEMO_ = c); } catch (e) {} }
  const out = {};
  try {
    let token = null;
    do {
      const q = { maxResults: 250, fields: 'nextPageToken,items(id,summary,summaryOverride,backgroundColor,colorId,accessRole,primary)' };
      if (token) q.pageToken = token;
      const r = Calendar.CalendarList.list(q);
      // The API's backgroundColor is Google's OLD pastel palette; the app shows the modern one. Map colorId → modern
      // (2026-11-11, Julius: match what Google Calendar shows), fall back to backgroundColor for custom colors.
      (r.items || []).forEach(c => { out[c.id] = { name: c.summaryOverride || c.summary || c.id, color: CAL_LIST_COLORS_[c.colorId] || c.backgroundColor || '#039be5', role: c.accessRole || 'reader' }; });
      token = r.nextPageToken;
    } while (token);
  } catch (e) {
    console.error('calAccess_ → CalendarApp fallback: ' + e);
    CalendarApp.getAllCalendars().forEach(c => { out[c.getId()] = { name: c.getName(), color: String(c.getColor() || '#039be5'), role: c.isOwnedByMe() ? 'owner' : 'reader' }; });
  }
  if (!out[EVENT_CALENDARS[0]]) out[EVENT_CALENDARS[0]] = { name: EVENT_CALENDARS[0], color: '#039be5', role: 'owner' };
  out[EVENT_CALENDARS[0]].role = 'owner';
  try { cache.put('calAccess2', JSON.stringify(out), 21600); } catch (e) {}
  return (CAL_ACCESS_MEMO_ = out);
}
function pickedCalendars_() {
  let ids = null;
  try { ids = JSON.parse(PropertiesService.getScriptProperties().getProperty(CAL_PICK_PROP_) || 'null'); } catch (e) { ids = null; }
  if (!Array.isArray(ids)) ids = EVENT_CALENDARS.slice();
  ids = ids.map(String).filter(Boolean);
  return ids.length ? ids : [EVENT_CALENDARS[0]];
}
function calWritable_(calId) {
  if (calId === EVENT_CALENDARS[0]) return true;
  const a = calAccess_()[calId];
  return !!a && (a.role === 'owner' || a.role === 'writer');
}
function calRequireWritable_(calId) {
  if (!calWritable_(calId)) throw new Error('That calendar is view-only — edit it where it comes from');
}
// Panel fold: every calendar in his list, main first, then ticked ones, then the rest by name.
function getCalendarPicker() {
  const acc = calAccess_(true), picked = pickedCalendars_(), main = EVENT_CALENDARS[0];
  const list = Object.keys(acc).map(id => ({ id: id, name: id === main ? 'Main (' + acc[id].name.split('@')[0] + ')' : acc[id].name,
    color: acc[id].color, writable: calWritable_(id), picked: picked.indexOf(id) >= 0, main: id === main }));
  list.sort((a, b) => Number(b.main) - Number(a.main) || Number(b.picked) - Number(a.picked) || a.name.localeCompare(b.name));
  return { main: main, calendars: list };
}
function setCalendarPicked(ids) {
  const acc = calAccess_();
  const clean = (Array.isArray(ids) ? ids : []).map(String).filter(id => acc[id]).slice(0, 30);
  PropertiesService.getScriptProperties().setProperty(CAL_PICK_PROP_, JSON.stringify(clean.length ? clean : [EVENT_CALENDARS[0]]));
  return getCalendarPicker();
}

// Cal Events hide list (2026-11-11, Julius): calendars and title words kept off the Cal Events list (the timeline
// still shows them). {cals:[{id,name}], words:[string]} in script property ceHide, same on every device.
function getCalEventsHide() {
  try { const raw = PropertiesService.getScriptProperties().getProperty('ceHide'); const h = raw ? JSON.parse(raw) : null;
    return h && Array.isArray(h.cals) && Array.isArray(h.words) ? h : { cals: [], words: [] }; }
  catch (e) { return { cals: [], words: [] }; }
}
function setCalEventsHide(h) {
  const cals = (h && Array.isArray(h.cals) ? h.cals : []).filter(c => c && c.id).slice(0, 30)
    .map(c => ({ id: String(c.id).slice(0, 200), name: String(c.name || c.id).slice(0, 80) }));
  const words = (h && Array.isArray(h.words) ? h.words : []).map(w => String(w || '').trim().slice(0, 40)).filter(Boolean).slice(0, 60);
  const out = { cals: cals, words: words };
  PropertiesService.getScriptProperties().setProperty('ceHide', JSON.stringify(out));
  return out;
}

// Center-bottom list: main calendar only (no archive path).
function getMainCalendarEvents(dateString) {
  const date = String(dateString || todayString_());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid calendar date');
  const start = parseDate_(date), end = parseDate_(addDaysToDateString_(date, 1));
  const tz = Session.getScriptTimeZone(), events = [];
  // Follows the 📅 Calendars picker (2026-11-11, Julius); urgency-from-color stays main-calendar only.
  pickedCalendars_().forEach(calId => {
    let cal = null;
    try { cal = CalendarApp.getCalendarById(calId); } catch (e) { cal = null; }
    if (!cal) return;
    const ro = !calWritable_(calId), isMain = calId === EVENT_CALENDARS[0];
    // Calendar color from the API list (2026-11-11, Julius): the same pastels Google Calendar shows.
    // CalendarApp.getColor() returns the old palette (dark navy for a light-blue calendar, etc.).
    let calHex = '#039be5', calName = '';
    try { const acc = calAccess_()[calId]; if (acc) { calHex = acc.color || calHex; calName = acc.name; } } catch (e) { console.error(e); }
    if (!calName) try { calHex = String(cal.getColor() || calHex); calName = cal.getName(); } catch (e) { console.error(e); }
    cal.getEvents(start, end).forEach(ev => {
    const allDay = ev.isAllDayEvent();
    const s = ev.getStartTime(), e = ev.getEndTime();
    events.push({ title: ev.getTitle() || '(no title)', allDay: allDay, ro: ro, main: isMain,
      id: ev.getId(), calId: calId,
      done: String(ev.getColor() || '') === '8',
      color: String(ev.getColor() || ''),
      // 🕒 day view colors (2026-11-11, Julius): event color, else its calendar's color (main: neutral grey), like 📅.
      hex: CAL_PANEL_COLORS_[String(ev.getColor() || '')] || (isMain ? CAL_PANEL_UNASSIGNED_COLOR_ : calHex), cal: calName,
      start: (allDay ? ev.getAllDayStartDate() : s).getTime(), end: e.getTime(),
      recurring: ev.isRecurringEvent(),
      time: allDay ? 'All day' : Utilities.formatDate(s, tz, 'h:mm a') + '–' + Utilities.formatDate(e, tz, 'h:mm a') });
    });
  });
  const saved = PropertiesService.getScriptProperties().getProperties();
  events.forEach(ev => {
    try { Object.assign(ev, JSON.parse(saved[calMetaKey_(ev.id, ev.start, ev.recurring)] || '{}')); } catch (e) { console.error(e); }
    // Color = urgency both ways (2026-11-05, Julius): an event colored red / yellow / blue elsewhere (Calendar app,
    // Claude, ChatGPT) shows with that urgency here when the app hasn't saved one for it.
    if (!ev.urg && ev.main) { const u = Object.keys(URG_EVENT_COLOR_).find(k => URG_EVENT_COLOR_[k] === ev.color); if (u) ev.urg = u; }
    delete ev.color; delete ev.main;
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
  try { ev.removeAllReminders(); } catch (e) { console.error(e); } // no notifications unless Julius asks (standing rule)
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
  if (calId !== EVENT_CALENDARS[0]) return; // urgency colors: main calendar only (2026-11-11, Julius)
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
  pickedCalendars_().forEach(id => {
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
   neutral gray (not the calendar's background color). Phase 2+ plans: docs/NOTES.md → "Calendar panel (FullCalendar)". */
// Colors as Julius's Google Calendar app shows them (2026-11-10, sampled from his phone screenshot): Tomato, Tangerine,
// Banana, Sage, Peacock, Blueberry, Graphite. Lavender, Flamingo, Grape, Basil weren't on screen: Google's published values.
const CAL_PANEL_COLORS_ = { '1': '#7986cb', '2': '#59af80', '3': '#8e24aa', '4': '#e67c73', '5': '#e6ba57', '6': '#db793a',
  '7': '#5398cf', '8': '#808080', '9': '#7577c4', '10': '#0b8043', '11': '#de583d' };
const CAL_PANEL_UNASSIGNED_COLOR_ = '#8a8f98'; // No priority/color: neutral, never calendar background.
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
    color: CAL_PANEL_COLORS_[colorId] || (calId === EVENT_CALENDARS[0] ? CAL_PANEL_UNASSIGNED_COLOR_ : calColor), colorId: colorId, done: colorId === '8',
    location: ev.getLocation() || '', recurring: recurring, link: link,
    editable: calWritable_(calId) // any calendar he can edit; repeating too, with a This day / All days choice (2026-11-11)
  };
}
function getCalendarRange(startDate, endDate) {
  const s = String(startDate || ''), e = String(endDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || e <= s) throw new Error('Invalid calendar range');
  const from = parseDate_(s), to = parseDate_(e);
  if (to - from > 62 * DAY_MS) throw new Error('Calendar range too long');
  const t0 = Date.now(), tz = Session.getScriptTimeZone();
  // Fast path (2026-11-08, Julius: "make the days load faster"): one Calendar API call per calendar returns every
  // field at once, instead of CalendarApp's per-event getters. Same output shape; any failure → CalendarApp below.
  const fast = calPanelRangeApi_(from, to, tz);
  if (fast) { calPanelAttachMeta_(fast.events); return Object.assign(fast, { start: s, end: e, tz: tz, via: 'api', ms: Date.now() - t0 }); }
  const out = [], calendars = [], failed = [];
  pickedCalendars_().forEach(id => {
    let cal = null;
    try { cal = CalendarApp.getCalendarById(id); } catch (err) { cal = null; }
    if (!cal) { failed.push(id); return; }
    const calName = cal.getName(), calColor = String(cal.getColor() || '#039be5');
    calendars.push({ id: id, name: calName, color: calColor });
    cal.getEvents(from, to).forEach(ev => out.push(calPanelEventOut_(ev, id, calName, calColor, tz)));
  });
  calPanelAttachMeta_(out);
  return { start: s, end: e, tz: tz, events: out, calendars: calendars, failed: failed, via: 'app', ms: Date.now() - t0 };
}
// Calendar panel checkboxes (2026-11-11, Julius): each event carries the urgency / subject / due / minutes saved from
// the hold menu (same calMeta keys as Cal Events); no saved urgency → read it from the event color (Tomato / Banana /
// Blueberry), like getMainCalendarEvents.
function calPanelAttachMeta_(events) {
  let saved = {};
  try { saved = PropertiesService.getScriptProperties().getProperties(); } catch (err) { console.error(err); }
  (events || []).forEach(ev => {
    let m = {};
    try { m = JSON.parse(saved[calMetaKey_(ev.eventId, ev.startMs, ev.recurring)] || '{}'); } catch (err) { m = {}; }
    ['urg', 'due', 'dur', 'cat'].forEach(k => { if (m[k]) ev[k] = String(m[k]); });
    if (!ev.urg) { const u = Object.keys(URG_EVENT_COLOR_).find(k => URG_EVENT_COLOR_[k] === ev.colorId); if (u) ev.urg = u; }
  });
}
// Calendar advanced service (appsscript.json → enabledAdvancedServices). Returns null when it's missing or fails, so
// the caller falls back to CalendarApp; a failure is remembered for 30 min so the fallback doesn't pay for it each time.
// Ids / startMs match calPanelEventOut_: eventId = iCalUID (CalendarApp's getId), all-day startMs = local midnight.
function calPanelRangeApi_(from, to, tz) {
  if (typeof Calendar === 'undefined' || !Calendar.Events) return null;
  const cache = CacheService.getScriptCache();
  if (cache.get('calApiOff')) return null;
  try {
    const out = [], calendars = [], acc = calAccess_();
    pickedCalendars_().forEach(id => {
      const meta = acc[id] ? { name: acc[id].name, color: acc[id].color } : null;
      if (!meta) return; // unsubscribed since it was picked
      const canEdit = calWritable_(id), isMain = id === EVENT_CALENDARS[0];
      calendars.push({ id: id, name: meta.name, color: meta.color });
      let token = null;
      do {
        const q = { timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: true, maxResults: 2500,
          fields: 'nextPageToken,items(id,iCalUID,status,summary,start,end,colorId,location,recurringEventId,htmlLink)' };
        if (token) q.pageToken = token;
        const r = Calendar.Events.list(id, q);
        (r.items || []).forEach(it => {
          if (it.status === 'cancelled' || !it.start || !it.end) return;
          const allDay = !!it.start.date;
          const st = allDay ? parseDate_(it.start.date) : new Date(it.start.dateTime);
          const en = allDay ? parseDate_(it.end.date) : new Date(it.end.dateTime);
          const colorId = String(it.colorId || ''), recurring = !!it.recurringEventId;
          const eventId = it.iCalUID || (it.id + '@google.com');
          const fmt = allDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX";
          out.push({
            id: eventId + '|' + st.getTime(), eventId: eventId, startMs: st.getTime(), calId: id, cal: meta.name,
            title: it.summary || '(no title)', allDay: allDay,
            start: Utilities.formatDate(st, tz, fmt), end: Utilities.formatDate(en, tz, fmt),
            color: CAL_PANEL_COLORS_[colorId] || (isMain ? CAL_PANEL_UNASSIGNED_COLOR_ : meta.color), colorId: colorId, done: colorId === '8',
            location: it.location || '', recurring: recurring, link: it.htmlLink || '',
            editable: canEdit
          });
        });
        token = r.nextPageToken;
      } while (token);
    });
    return { events: out, calendars: calendars, failed: [] };
  } catch (err) {
    console.error('calPanelRangeApi_ → CalendarApp fallback: ' + err);
    cache.put('calApiOff', '1', 1800);
    return null;
  }
}

/* Calendar panel, phase 2 (2026-11-08, Julius): create / edit / delete on the MAIN calendar only; repeating events
   stay read-only (edit those in Google Calendar). Edits change the event in place, so its id never changes.
   Duplicate guard: each form save carries an opId; a retry or double tap with the same opId returns the first result
   (script cache, 6 h) instead of creating again. New events get reminders off. Times are America/Los_Angeles wall
   time: all-day 'yyyy-MM-dd' (end exclusive, like Google), timed 'yyyy-MM-ddTHH:mm'. */
function calPanelMain_(calId) {
  const id = String(calId || EVENT_CALENDARS[0]);
  calRequireWritable_(id);
  const cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('Calendar is unavailable');
  return cal;
}
// Repeating events (2026-11-11, Julius): 'one' = just this day, 'all' = the whole series. Done through the Calendar
// API: find this day's instance by iCalUID + start, patch / remove it or its series (recurringEventId).
function calApiStartMs_(i) { return i.start.date ? parseDate_(i.start.date).getTime() : new Date(i.start.dateTime).getTime(); }
function calApiInstance_(calId, eventId, startMs) {
  const t = Number(startMs);
  const r = Calendar.Events.list(calId, { timeMin: new Date(t - 60000).toISOString(), timeMax: new Date(t + 60000).toISOString(),
    singleEvents: true, maxResults: 250, fields: 'items(id,iCalUID,recurringEventId,start,end,summary,status)' });
  const it = (r.items || []).find(i => i.iCalUID === eventId && i.status !== 'cancelled' && Math.abs(calApiStartMs_(i) - t) < 60000);
  if (!it) throw new Error('Event not found (moved or deleted?) — tap ↻ on the Calendar');
  return it;
}
function calApiTimes_(w, tz) {
  const d = x => Utilities.formatDate(x, tz, 'yyyy-MM-dd');
  return w.allDay ? { start: { date: d(w.start), dateTime: null }, end: { date: d(w.end), dateTime: null } }
    : { start: { dateTime: w.start.toISOString(), timeZone: tz, date: null }, end: { dateTime: w.end.toISOString(), timeZone: tz, date: null } };
}
function calRecurringEdit_(calId, r, w, scope, opts) {
  const tz = Session.getScriptTimeZone(), inst = calApiInstance_(calId, String(r.eventId), r.startMs);
  const body = opts && opts.titleOnly ? {} : calApiTimes_(w, tz);
  if (w.title) body.summary = w.title;
  if (scope !== 'all') { Calendar.Events.patch(body, calId, inst.id); return { eventId: r.eventId, refetch: true }; }
  const master = Calendar.Events.get(calId, inst.recurringEventId || inst.id);
  if (!(opts && opts.titleOnly)) {
    if (!!w.allDay !== !!inst.start.date) throw new Error('All-day ↔ timed can only change for this day');
    const delta = w.start.getTime() - calApiStartMs_(inst), len = w.end.getTime() - w.start.getTime();
    if (w.allDay) {
      const ms = parseDate_(master.start.date).getTime() + delta, days = Math.round(len / DAY_MS);
      const a = new Date(ms + 12 * 3600000), b = new Date(ms + days * DAY_MS + 12 * 3600000); // noon: no DST edge
      body.start = { date: Utilities.formatDate(a, tz, 'yyyy-MM-dd') }; body.end = { date: Utilities.formatDate(b, tz, 'yyyy-MM-dd') };
    } else {
      const ms = new Date(master.start.dateTime).getTime() + delta, mtz = master.start.timeZone || tz;
      body.start = { dateTime: new Date(ms).toISOString(), timeZone: mtz }; body.end = { dateTime: new Date(ms + len).toISOString(), timeZone: mtz };
    }
  }
  Calendar.Events.patch(body, calId, master.id);
  return { eventId: r.eventId, refetch: true };
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
function calPanelOut_(ev, calId) {
  const id = String(calId || EVENT_CALENDARS[0]), a = calAccess_()[id] || {};
  const out = calPanelEventOut_(ev, id, a.name || id, a.color || '#039be5', Session.getScriptTimeZone());
  calPanelAttachMeta_([out]); // keep the checkbox's urgency / subject after a move or edit
  return out;
}
function calPanelEditable_(eventId, startMs, calId) {
  if (!eventId) throw new Error('Missing event id');
  const id = String(calId || EVENT_CALENDARS[0]);
  calRequireWritable_(id);
  return calEventAt_(id, String(eventId), Number(startMs));
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
      try { return Object.assign(calPanelOut_(calEventAt_(d.calId || EVENT_CALENDARS[0], d.eventId, d.startMs), d.calId), { repeat: true }); }
      catch (e) { return { eventId: d.eventId, startMs: d.startMs, repeat: true }; }
    }
    const calId = String((req && req.calId) || EVENT_CALENDARS[0]), cal = calPanelMain_(calId);
    const ev = w.allDay ? (w.oneDay ? cal.createAllDayEvent(w.title, w.start) : cal.createAllDayEvent(w.title, w.start, w.end))
      : cal.createEvent(w.title, w.start, w.end);
    try { ev.removeAllReminders(); } catch (e) { console.error(e); }
    const out = calPanelOut_(ev, calId);
    if (key) cache.put(key, JSON.stringify({ eventId: out.eventId, startMs: out.startMs, calId: calId }), 21600);
    return out;
  } finally { lock.releaseLock(); }
}
function calPanelUpdateEvent(req) {
  const w = calPanelWhen_(req), calId = String(req.calId || EVENT_CALENDARS[0]), ev = calPanelEditable_(req.eventId, req.startMs, calId);
  if (ev.isRecurringEvent()) return calRecurringEdit_(calId, req, w, req.scope);
  if (ev.getTitle() !== w.title) ev.setTitle(w.title);
  if (w.allDay) { if (w.oneDay) ev.setAllDayDate(w.start); else ev.setAllDayDates(w.start, w.end); }
  else ev.setTime(w.start, w.end);
  planRelinkLocked_(ev);
  return calPanelOut_(ev, calId);
}
/* Phase 3b (2026-11-08, Julius): drag / resize in the panel. Moves the event in place (same id, color, title,
   reminders); timed ↔ all-day both ways. Done (Graphite) events are locked to their spot. Plan links follow. */
function calPanelMoveEvent(req) {
  const r = req || {}, calId = String(r.calId || EVENT_CALENDARS[0]), ev = calPanelEditable_(r.eventId, r.startMs, calId);
  if (String(ev.getColor() || '') === '8') throw new Error('Done events stay where they are');
  const w = calPanelWhen_(Object.assign({}, r, { title: ev.getTitle() || 'Event' }));
  if (ev.isRecurringEvent()) { w.title = ''; return calRecurringEdit_(calId, r, w, r.scope); }
  if (w.allDay) { if (w.oneDay) ev.setAllDayDate(w.start); else ev.setAllDayDates(w.start, w.end); }
  else ev.setTime(w.start, w.end);
  planRelinkLocked_(ev);
  return calPanelOut_(ev, calId);
}
function calPanelDeleteEvent(req) {
  const r = req || {}, calId = String(r.calId || EVENT_CALENDARS[0]);
  let ev;
  try { ev = calPanelEditable_(r.eventId, r.startMs, calId); }
  catch (e) { if (/not found/i.test(e.message)) return { ok: true, gone: true }; throw e; } // already deleted: nothing to do
  if (ev.isRecurringEvent()) {
    const inst = calApiInstance_(calId, String(r.eventId), r.startMs);
    Calendar.Events.remove(calId, r.scope === 'all' ? (inst.recurringEventId || inst.id) : inst.id);
    return { ok: true };
  }
  ev.deleteEvent();
  return { ok: true };
}

/* =========================================================
   DAILY PLAN (Calendar panel phase 3a, 2026-11-08, Julius)
   Big Three / Stretch (for one day) + Next Up / Backlog (undated) in the Sheet's `Plan` tab, so ChatGPT can read and
   fill it too ("What should I do today?"). Rows LINK to tasks, never copy them:
     Ref = 'tid:<data-tid>' (a Gantt line / Undated Tasks / Keep In Mind item, same ids as Task mirrors)
         or 'cal:<eventId>' (a Google Calendar event).
     Event = '<eventId>@<startMs>' of the event the row points at (cal refs) or the one made by Schedule (tid refs).
   Columns: Id | Date | Group | Rank | Ref | Title | Target | Event | Updated. Date only for big / stretch.
   One row per Ref (adding again moves it). Big Three and Stretch hold at most 3 each per day.
   Schedule makes ONE all-day event per task on the main calendar (reminders off); again = move that event.
   ========================================================= */
const PLAN_SHEET = 'Plan';
const PLAN_HEAD = ['Id', 'Date', 'Group', 'Rank', 'Ref', 'Title', 'Target', 'Event', 'Updated'];
const PLAN_GROUPS = { big: 3, stretch: 3, next: 500, backlog: 500 };
/* Big Three / Biggest Return (2026-11-08, Julius): 'big' is now a STANDING list (no date, the same every day, max 3);
   'next' is shown as the Waiting list (ranked, no cap); 'stretch' is tabled (still read, not offered). Refs may also be
   'card:<Reference id>' = a project. Only 'stretch' keeps a date. */
const PLAN_DATED_ = { stretch: true };
function planSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PLAN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PLAN_SHEET);
    sh.getRange(1, 1, 1, PLAN_HEAD.length).setValues([PLAN_HEAD]).setFontWeight('bold');
    sh.getRange('A:I').setNumberFormat('@'); // dates and ids stay text
    sh.setFrozenRows(1);
  }
  return sh;
}
function planRead_(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, n, PLAN_HEAD.length).getValues().map((r, i) => ({
    row: i + 2, id: String(r[0] || ''),
    date: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') : String(r[1] || '').trim(),
    group: String(r[2] || '').trim().toLowerCase(), rank: Number(r[3]) || 0, ref: String(r[4] || '').trim(),
    title: String(r[5] || ''), target: String(r[6] || ''), event: String(r[7] || ''), updated: String(r[8] || '')
  })).filter(x => x.ref && PLAN_GROUPS[x.group] !== undefined);
}
function planWrite_(sh, x) {
  const vals = [[x.id, x.date || '', x.group, String(x.rank || 0), x.ref, x.title || '', x.target || '', x.event || '',
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")]];
  if (x.row) sh.getRange(x.row, 1, 1, PLAN_HEAD.length).setValues(vals);
  else { sh.appendRow(vals[0]); x.row = sh.getLastRow(); }
}
function planEventParts_(s) {
  const m = String(s || '').match(/^(.+)@(\d+)$/);
  return m ? { eventId: m[1], startMs: Number(m[2]) } : null;
}
// Live state of the event a row points at: title, done (Graphite), date. Missing → gone: true.
function planEventInfo_(s) {
  const p = planEventParts_(s);
  if (!p) return null;
  try {
    const ev = calEventAt_(EVENT_CALENDARS[0], p.eventId, p.startMs), tz = Session.getScriptTimeZone();
    const allDay = ev.isAllDayEvent(), st = allDay ? ev.getAllDayStartDate() : ev.getStartTime();
    return { eventId: p.eventId, startMs: st.getTime(), title: ev.getTitle() || '', done: String(ev.getColor() || '') === '8',
      date: Utilities.formatDate(st, tz, 'yyyy-MM-dd'), allDay: allDay, recurring: ev.isRecurringEvent(),
      time: allDay ? '' : Utilities.formatDate(st, tz, 'h:mm a') };
  } catch (e) { return { eventId: p.eventId, startMs: p.startMs, gone: true }; }
}
function getPlan(date) {
  const d = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Invalid plan date');
  const items = planRead_(planSheet_()).filter(x => !PLAN_DATED_[x.group] || x.date === d);
  items.forEach(x => { delete x.row; x.ev = x.event ? planEventInfo_(x.event) : null; });
  items.sort((a, b) => a.rank - b.rank);
  return { date: d, cal: EVENT_CALENDARS[0], items: items };
}
// op = {type:'upsert', date, item:{id?, group, ref, title, target?, event?}} | {type:'remove', date, id}
//    | {type:'order', date, group, ids:[...]} | {type:'target', date, id, target}
function planSave(op) {
  const o = op || {}, d = String(o.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Invalid plan date');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = planSheet_(), rows = planRead_(sh);
    const inGroup = (g, except) => rows.filter(x => x.group === g && (!PLAN_DATED_[g] || x.date === d) && x !== except);
    if (o.type === 'upsert') {
      const it = o.item || {}, g = String(it.group || '');
      if (PLAN_GROUPS[g] === undefined) throw new Error('Unknown plan group');
      const ref = String(it.ref || '');
      if (!/^(tid:m-[\w-]{2,60}|tid:[\w-]{2,60}|cal:[^\s]{3,200}|card:[\w-]{1,80})$/.test(ref)) throw new Error('Unknown task link');
      // Same task already planned (for this day, or undated) → move it; never a second row.
      let x = rows.find(r => r.ref === ref && (!PLAN_DATED_[r.group] || r.date === d));
      if (inGroup(g, x).length >= PLAN_GROUPS[g]) throw new Error((g === 'big' ? 'Big Three' : 'Stretch') + ' is full (3) — remove one first');
      if (!x) x = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ref: ref };
      const moved = x.group !== g;
      x.group = g; x.date = PLAN_DATED_[g] ? d : '';
      x.title = String(it.title || x.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (it.target !== undefined) x.target = String(it.target || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (it.event && planEventParts_(it.event)) x.event = String(it.event);
      if (moved || !x.rank) x.rank = inGroup(g, x).reduce((m, r) => Math.max(m, r.rank), 0) + 1;
      planWrite_(sh, x);
    } else if (o.type === 'moveup') {
      // Bubble up (confirmed by Julius): the finished Big Three item leaves; the chosen waiting item takes the slot.
      const done = rows.find(r => r.id === String(o.doneId || '') && r.group === 'big');
      const up = rows.find(r => r.id === String(o.upId || '') && r.group === 'next');
      if (!up) throw new Error('That waiting item is gone — tap ↻');
      if (done) { sh.deleteRow(done.row); rows.forEach(r => { if (r.row > done.row) r.row--; }); rows.splice(rows.indexOf(done), 1); }
      if (inGroup('big', up).length >= 3) throw new Error('Big Three is full (3) — remove one first');
      up.group = 'big'; up.date = '';
      up.rank = inGroup('big', up).reduce((m, r) => Math.max(m, r.rank), 0) + 1;
      planWrite_(sh, up);
    } else if (o.type === 'remove') {
      const x = rows.find(r => r.id === String(o.id || ''));
      if (x) sh.deleteRow(x.row);
    } else if (o.type === 'order') {
      const ids = (o.ids || []).map(String);
      ids.forEach((id, i) => { const x = rows.find(r => r.id === id && r.group === o.group); if (x && x.rank !== i + 1) { x.rank = i + 1; planWrite_(sh, x); } });
    } else if (o.type === 'target') {
      const x = rows.find(r => r.id === String(o.id || ''));
      if (!x) throw new Error('Plan item not found — tap ↻');
      x.target = String(o.target || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      planWrite_(sh, x);
    } else throw new Error('Unknown plan change');
  } finally { lock.releaseLock(); }
  return getPlan(d);
}
// Schedule… a Gantt task: one all-day event per task (main calendar, reminders off, tagged with the tid). Again → move it.
// Phase 3b: with r.start / r.end (+ r.allDay) it schedules at that slot (a plan row dropped on the timeline):
// all-day 'yyyy-MM-dd' (end exclusive) or timed 'yyyy-MM-ddTHH:mm'. The task's existing event moves there in place.
function planSchedule(req) {
  const r = req || {}, ref = String(r.ref || ''), slot = !!(r.start && r.end);
  const date = slot ? String(r.start).slice(0, 10) : String(r.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date');
  if (!/^tid:[\w-]{2,64}$/.test(ref)) throw new Error('Only Gantt tasks can be scheduled this way');
  const title = String(r.title || '').replace(/\s+/g, ' ').trim().slice(0, 300) || 'Task';
  const w = slot ? calPanelWhen_({ title: title, allDay: !!r.allDay, start: r.start, end: r.end }) : null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = planSheet_(), rows = planRead_(sh), props = PropertiesService.getScriptProperties(), key = 'planEv:' + ref.slice(4, 70);
    const known = (rows.find(x => x.ref === ref && x.event) || {}).event || props.getProperty(key) || '';
    let ev = null, moved = false;
    const p = planEventParts_(known);
    if (p) { try { ev = calEventAt_(EVENT_CALENDARS[0], p.eventId, p.startMs); } catch (e) { ev = null; } }
    if (ev && !ev.isRecurringEvent()) {
      if (w) { if (w.allDay) { if (w.oneDay) ev.setAllDayDate(w.start); else ev.setAllDayDates(w.start, w.end); } else ev.setTime(w.start, w.end); }
      else planMoveEv_(ev, date);
      moved = true;
    } else {
      const cal = calPanelMain_();
      ev = !w ? cal.createAllDayEvent(title, parseDate_(date))
        : w.allDay ? (w.oneDay ? cal.createAllDayEvent(title, w.start) : cal.createAllDayEvent(title, w.start, w.end))
        : cal.createEvent(title, w.start, w.end);
      try { ev.removeAllReminders(); } catch (e) { console.error(e); }
      try { ev.setTag('ganttTid', ref.slice(4)); } catch (e) { console.error(e); }
    }
    const link = planRelink_(sh, ev);
    props.setProperty(key, link);
    rows.filter(x => x.ref === ref && x.event !== link).forEach(x => { x.event = link; planWrite_(sh, x); });
    return { event: link, moved: moved, date: date };
  } finally { lock.releaseLock(); }
}
// After an event moves, every plan row (and the Schedule property) pointing at it gets its new eventId@startMs,
// so later lookups (calEventAt_ searches near startMs) keep finding it and Schedule never makes a second event.
function planRelink_(sh, ev) {
  const st = (ev.isAllDayEvent() ? ev.getAllDayStartDate() : ev.getStartTime()).getTime(), id = ev.getId(), link = id + '@' + st;
  planRead_(sh).forEach(x => { const p = planEventParts_(x.event); if (p && p.eventId === id && x.event !== link) { x.event = link; planWrite_(sh, x); } });
  let tid = ''; try { tid = ev.getTag('ganttTid') || ''; } catch (e) { tid = ''; }
  if (tid) PropertiesService.getScriptProperties().setProperty('planEv:' + tid.slice(0, 66), link);
  return link;
}
function planRelinkLocked_(ev) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PLAN_SHEET);
  if (!sh) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { planRelink_(sh, ev); } catch (e) { console.error(e); } finally { lock.releaseLock(); }
}
// Move an event to another day, keeping its length (all-day) or its clock times (timed).
function planMoveEv_(ev, date) {
  const tz = Session.getScriptTimeZone();
  if (ev.isAllDayEvent()) {
    const s = ev.getAllDayStartDate(), e = ev.getAllDayEndDate(), days = Math.max(1, Math.round((e - s) / DAY_MS));
    if (days === 1) ev.setAllDayDate(parseDate_(date));
    else ev.setAllDayDates(parseDate_(date), parseDate_(addDaysToDateString_(date, days)));
  } else {
    const s = ev.getStartTime(), e = ev.getEndTime();
    const shift = Math.round((parseDate_(date) - parseDate_(Utilities.formatDate(s, tz, 'yyyy-MM-dd'))) / DAY_MS);
    const ns = new Date(s), ne = new Date(e);
    ns.setDate(ns.getDate() + shift); ne.setDate(ne.getDate() + shift); // calendar days, so DST keeps the clock time
    ev.setTime(ns, ne);
  }
}
// Move to date… for an event in the plan (main calendar, not repeating). Keeps the event id.
function planMoveEvent(req) {
  const r = req || {}, date = String(r.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date');
  const ev = calPanelEditable_(r.eventId, r.startMs);
  planMoveEv_(ev, date);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return { event: planRelink_(planSheet_(), ev), date: date }; } finally { lock.releaseLock(); }
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
  calRequireWritable_(calId);
  const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!name) throw new Error('Title is empty');
  calEventAt_(calId, eventId, start).setTitle(name);
  return { title: name };
}

/* Calendar checkbox (2026-10-29, Julius): ticking an event in the Reference Calendar panel marks it done the
   same way he does by hand — Graphite color. Unticking puts back the color it had (yellow = open if unknown).
   start = the event's start time (ms), so the right day of a repeating event is changed. */
function setCalendarEventDone(calId, eventId, start, done) {
  calRequireWritable_(calId);
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








/* =========================================================
   CALENDAR BACKLOG (2026-11-11, Julius; docs/NOTES.md → "Calendar backlog")
   Unfinished all-day task events on the MAIN calendar from past days move to the `Cal Backlog` tab, so nothing gets
   lost. The original stays on its day as history: title gets "↪ " and the color turns Graphite.
   - Swept: all-day, main calendar, not repeating, not Graphite, not "[x] " / "↪ " / archive titles, ended before today.
   - Cheap: runs at most once a day (script property calBacklogSwept = last date covered); each run reads only the
     days since then (first run: last 30 days) with one Calendar API list. Script lock against double runs.
   - Dropping a backlog task onto a day makes a NEW event (same title + color, reminders off) and marks the row placed.
   - "↪ " Graphite events are moved tasks, not done work: Graphite transfers to the Done Log must skip them.
   ========================================================= */
const CAL_BACKLOG_SHEET = 'Cal Backlog';
const CAL_BACKLOG_HEAD = ['Id', 'Date', 'Title', 'ColorId', 'Urgency', 'Swept', 'Placed'];
const CAL_BACKLOG_PREFIX = '↪ ';
const CAL_BACKLOG_FIRST_DAYS = 30;
function calBacklogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CAL_BACKLOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CAL_BACKLOG_SHEET);
    sh.getRange(1, 1, 1, CAL_BACKLOG_HEAD.length).setValues([CAL_BACKLOG_HEAD]).setFontWeight('bold');
    sh.getRange('A:G').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}
function calBacklogRows_(sh) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, CAL_BACKLOG_HEAD.length).getDisplayValues() : [];
}
function calBacklogSweep_() {
  const tz = Session.getScriptTimeZone(), props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), yest = addDaysToDateString_(today, -1);
  const last = props.getProperty('calBacklogSwept') || '';
  if (last >= yest) return { swept: 0 };
  if (typeof Calendar === 'undefined' || !Calendar.Events) return { swept: 0, off: true };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { swept: 0, busy: true };
  try {
    if ((props.getProperty('calBacklogSwept') || '') >= yest) return { swept: 0 };
    const floor = addDaysToDateString_(today, -CAL_BACKLOG_FIRST_DAYS);
    const from = last && last >= floor ? addDaysToDateString_(last, 1) : floor;
    const calId = EVENT_CALENDARS[0], items = [];
    let token = null;
    do {
      const q = { timeMin: parseDate_(from).toISOString(), timeMax: parseDate_(today).toISOString(), singleEvents: true, maxResults: 2500,
        fields: 'nextPageToken,items(id,iCalUID,status,summary,start,end,colorId,recurringEventId)' };
      if (token) q.pageToken = token;
      const r = Calendar.Events.list(calId, q);
      (r.items || []).forEach(it => {
        if (it.status === 'cancelled' || !it.start || !it.start.date || it.recurringEventId) return;
        if (it.start.date < from || (it.end && it.end.date > today)) return; // still running today → not past yet
        const t = String(it.summary || '');
        if (String(it.colorId || '') === '8' || /^\[x\]\s/i.test(t) || t.indexOf(CAL_BACKLOG_PREFIX) === 0 || t.indexOf(ARCHIVE_PREFIX) === 0 || / X$/.test(t)) return;
        items.push(it);
      });
      token = r.nextPageToken;
    } while (token);
    const sh = calBacklogSheet_(), have = {};
    calBacklogRows_(sh).forEach(r => { have[r[0]] = 1; });
    const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'), add = [];
    items.forEach(it => {
      const id = (it.iCalUID || it.id) + '|' + it.start.date, colorId = String(it.colorId || '');
      if (!have[id]) {
        const u = Object.keys(URG_EVENT_COLOR_).find(k => URG_EVENT_COLOR_[k] === colorId) || '';
        add.push([id, it.start.date, String(it.summary || '(no title)'), colorId, u, stamp, '']);
        have[id] = 1;
      }
      try { Calendar.Events.patch({ summary: CAL_BACKLOG_PREFIX + String(it.summary || ''), colorId: '8' }, calId, it.id); }
      catch (e) { console.error('calBacklogSweep_ patch: ' + e); }
    });
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, CAL_BACKLOG_HEAD.length).setValues(add);
    props.setProperty('calBacklogSwept', yest);
    return { swept: add.length };
  } finally { lock.releaseLock(); }
}
function calBacklogList_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CAL_BACKLOG_SHEET);
  if (!sh) return [];
  return calBacklogRows_(sh).filter(r => r[0] && !r[6]).map(r => ({
    id: r[0], date: r[1], title: r[2], colorId: r[3], urg: r[4],
    color: CAL_PANEL_COLORS_[r[3]] || CAL_PANEL_UNASSIGNED_COLOR_
  }));
}
// Client entry: sweep if due (cheap check), then return the open backlog.
function calBacklogSync() {
  let sweep = {};
  try { sweep = calBacklogSweep_(); } catch (e) { console.error('calBacklogSweep_: ' + e); sweep = { error: String(e.message || e) }; }
  return { items: calBacklogList_(), sweep: sweep };
}
// Drop onto a day: new event with the same title + color; the row is marked placed (or 'dropped' when cleared).
function calBacklogPlace(req) {
  const r = req || {}, id = String(r.id || '');
  if (!id) throw new Error('Missing backlog id');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = calBacklogSheet_(), rows = calBacklogRows_(sh), i = rows.findIndex(x => x[0] === id);
    if (i < 0) throw new Error('Not in the backlog any more — tap ↻');
    if (rows[i][6]) return { ok: true, already: rows[i][6] };
    if (r.drop) { sh.getRange(i + 2, 7).setValue('dropped'); return { ok: true }; }
    const w = calPanelWhen_(Object.assign({}, r, { title: rows[i][2] }));
    const cal = calPanelMain_(EVENT_CALENDARS[0]);
    const ev = w.allDay ? (w.oneDay ? cal.createAllDayEvent(w.title, w.start) : cal.createAllDayEvent(w.title, w.start, w.end))
      : cal.createEvent(w.title, w.start, w.end);
    try { ev.removeAllReminders(); } catch (e) { console.error(e); }
    if (rows[i][3] && rows[i][3] !== '8') { try { ev.setColor(rows[i][3]); } catch (e) { console.error(e); } }
    sh.getRange(i + 2, 7).setValue(Utilities.formatDate(w.start, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
    return { ok: true, event: calPanelOut_(ev, EVENT_CALENDARS[0]) };
  } finally { lock.releaseLock(); }
}
