/**
 * IT study intake (2026-11-04).
 * The "Study Sessions" tab is an authenticated, sheet-backed intake queue.
 * ChatGPT/Claude can write rows through a permitted Sheets connector; there is
 * deliberately NO public doPost and no secret embedded in source.
 * Columns: ID, Date, Window, Started, Ended, Minutes, Correct, Partial, Missed,
 *           Unanswered, Topics, QuestionsJSON, Status
 * Status "final" is required before a completed History entry is emitted.
 */
const STUDY_HEADERS = ['ID','Date','Window','Started','Ended','Minutes','Correct','Partial','Missed','Unanswered','Topics','QuestionsJSON','Status'];
const STUDY_WINDOWS = {morning:[8,14],afternoon:[14,19],evening:[19,22]};

function studyWindow_(time) {
  const m = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error('Expected local HH:MM time');
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error('Invalid local time');
  for (const name in STUDY_WINDOWS) {
    const span = STUDY_WINDOWS[name];
    if (h >= span[0] && h < span[1]) return name;
  }
  throw new Error('Study time is outside configured History windows');
}
function studyNumber_(n) {
  if (n === '' || n === null || n === undefined) return 0;
  const v = Number(n);
  if (!Number.isInteger(v) || v < 0) throw new Error('Invalid nonnegative study count');
  return v;
}
function studySafe_(v) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, 15000);
}
/**
 * Authenticated Apps Script function for the web app, or manually from editor.
 * Reusing an ID replaces its source row, not duplicates it.
 * A session may have multiple segments; the aggregation groups by date+window.
 */
function upsertStudySession(record) {
  if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) throw new Error('Date required');
  const id = String(record.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{6,100}$/.test(id)) throw new Error('Stable session ID required');
  const window = studyWindow_(record.started);
  const questions = Array.isArray(record.questions) ? record.questions : [];
  if (questions.length > 500) throw new Error('Too many questions');
  const row = [id,record.date,window,record.started,record.ended || '',studyNumber_(record.minutes),
    studyNumber_(record.correct),studyNumber_(record.partial),studyNumber_(record.missed),
    studyNumber_(record.unanswered),studySafe_(record.topics),
    JSON.stringify(questions).slice(0,45000),record.final ? 'final':'draft'];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getOrCreateSheet_('Study Sessions', STUDY_HEADERS);
    const n = sheet.getLastRow();
    const ids = n > 1 ? sheet.getRange(2,1,n-1,1).getValues().map(x=>String(x[0])) : [];
    const i = ids.indexOf(id);
    if (i >= 0) sheet.getRange(i+2,1,1,row.length).setValues([row]);
    else sheet.appendRow(row);
    return {id,window,status:row[12],row:i>=0?i+2:sheet.getLastRow()};
  } finally { lock.releaseLock(); }
}
/**
 * Turn finalized sessions into ONE Done Log row per date/window. The existing
 * Done Log -> History intake handles actual History display on app reload.
 * Do not update a window after it has been consumed by History without a
 * migration: current intake hashes title/details, and may duplicate revisions.
 */
function publishStudyHistory_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Study Sessions');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const records = sheet.getRange(2,1,sheet.getLastRow()-1,13).getValues();
  const groups = {};
  records.forEach(r=>{
    if (r[12] !== 'final') return;
    const key = String(r[1])+'|'+String(r[2]);
    (groups[key] = groups[key] || []).push(r);
  });
  const done = getOrCreateSheet_('Done Log', ['Date','Project','Title','Details','Done by','Type']);
  const existing = done.getDataRange().getValues();
  let added = 0;
  Object.keys(groups).forEach(key=>{
    const [date,window] = key.split('|');
    const marker = '[IT-STUDY:'+date+':'+window+']';
    if (existing.some(r=>String(r[3]||'').includes(marker))) return;
    const items=groups[key];
    const sum=i=>items.reduce((n,r)=>n+studyNumber_(r[i]),0);
    const topics=[...new Set(items.map(r=>String(r[10]||'').trim()).filter(Boolean))].join('; ');
    const detail=items.map(r=>({
      id:r[0],start:r[3],end:r[4],minutes:r[5],
      correct:r[6],partial:r[7],missed:r[8],unanswered:r[9],
      topics:r[10],questions:(()=>{try{return JSON.parse(r[11]||'[]')}catch(e){return []}})()
    }));
    const total=sum(6)+sum(7)+sum(8);
    const title='IT certification review — '+window+' ('+total+' answered, '+sum(5)+' min)';
    const details=marker+' Correct: '+sum(6)+'; Partial: '+sum(7)+'; Missed: '+sum(8)+
      '; Unanswered: '+sum(9)+'; Topics: '+topics+'; Full session detail: '+
      JSON.stringify(detail).slice(0,42000);
    done.appendRow([date,'Career/IT',title,details,'Julius','']);
    existing.push([date,'Career/IT',title,details,'Julius','']);
    added++;
  });
  return added;
}
