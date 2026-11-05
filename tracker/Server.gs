/* Time Tracker server (2026-11-05). Standalone from Gantt: open the web app with ?app=tracker.
   Storage: its OWN spreadsheet "Time Tracker DB" (created on first use, id in script property TRACKER_DB_ID),
   never the Gantt sheet. One row per record (block / item / entry / plan / series / cat / cfg) holding its JSON.
   Sync is last-write-wins per record under a script lock: the page sends records changed on the device and gets
   back every record changed since its last sync (Seq), so phone and laptop converge and retries never duplicate.
   Auth: the web app runs as Julius with access MYSELF, so only his Google login can call trackerSync. A future
   watch / voice endpoint (doPost) needs its own secret token before it may write — not built yet. */
const TT_HEADERS = ['Seq', 'Id', 'Kind', 'Updated', 'Deleted', 'Json', 'Device', 'Saved'];
const TT_KINDS = { cat: 1, block: 1, item: 1, entry: 1, plan: 1, series: 1, cfg: 1 };

function trackerPage_() {
  return HtmlService.createTemplateFromFile('tracker/App').evaluate()
    .setTitle('Time Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

function trackerInclude_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// Call only while holding the script lock (creation must happen once).
function trackerDb_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('TRACKER_DB_ID');
  // An unreachable id is an error, never a reason to start a fresh empty sheet (that would hide the history).
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Time Tracker DB');
  const sh = ss.getSheets()[0].setName('Records');
  sh.getRange(1, 1, 1, TT_HEADERS.length).setValues([TT_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  props.setProperty('TRACKER_DB_ID', ss.getId());
  return ss;
}

function trackerSheet_(ss) {
  let sh = ss.getSheetByName('Records');
  if (!sh) {
    sh = ss.insertSheet('Records');
    sh.getRange(1, 1, 1, TT_HEADERS.length).setValues([TT_HEADERS]).setFontWeight('bold');
  }
  return sh;
}

function trackerValid_(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.id !== 'string' || !r.id || r.id.length > 64 || /^[=+\-@]/.test(r.id)) return false;
  if (!TT_KINDS[r.kind] || !(Number(r.u) > 0)) return false;
  return JSON.stringify(r).length < 40000;
}

// req = {since: Seq the page already has, changes: [records], dev: device label}
// -> {seq, accepted: [{id,u}], changes: [records newer than since + current copies of rejected ones], url}
function trackerSync(req) {
  req = req || {};
  const since = Number(req.since) || 0;
  const incoming = (Array.isArray(req.changes) ? req.changes : []).slice(0, 2000);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = trackerDb_();
    const sh = trackerSheet_(ss);
    const n = sh.getLastRow() - 1;
    const vals = n > 0 ? sh.getRange(2, 1, n, TT_HEADERS.length).getValues() : [];
    const at = {};
    let seq = 0;
    vals.forEach((r, i) => { at[String(r[1])] = i; seq = Math.max(seq, Number(r[0]) || 0); });
    const accepted = [], rejected = [], appended = [], now = new Date().toISOString();
    incoming.forEach(r => {
      if (!trackerValid_(r)) return;
      const i = at[r.id];
      if (i !== undefined && Number(vals[i][3]) >= Number(r.u)) {
        if (Number(vals[i][3]) > Number(r.u)) rejected.push(i);
        else accepted.push({ id: r.id, u: r.u }); // same write sent twice
        return;
      }
      const row = [++seq, r.id, r.kind, Number(r.u), r.del ? 1 : '', JSON.stringify(r), String(req.dev || '').slice(0, 24), now];
      if (i === undefined) { at[r.id] = vals.length + appended.length; appended.push(row); }
      else { vals[i] = row; sh.getRange(i + 2, 1, 1, TT_HEADERS.length).setNumberFormat('@').setValues([row]); }
      accepted.push({ id: r.id, u: r.u });
    });
    if (appended.length) {
      sh.getRange(vals.length + 2, 1, appended.length, TT_HEADERS.length).setNumberFormat('@').setValues(appended);
    }
    const all = vals.concat(appended);
    const out = [];
    all.forEach((r, i) => {
      if (Number(r[0]) > since || rejected.indexOf(i) >= 0) {
        try { out.push(JSON.parse(r[5])); } catch (e) { /* skip a hand-broken row */ }
      }
    });
    return { seq: seq, accepted: accepted, changes: out, url: ss.getUrl() };
  } finally {
    lock.releaseLock();
  }
}
