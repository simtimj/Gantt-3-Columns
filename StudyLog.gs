/* =========================================================
   IT STUDY LOG (2026-11-04, Julius; spec: docs/IT_STUDY_HISTORY_AUTOMATION.md)

   Intake: ChatGPT (or Claude) appends one row per finished study segment to the
   "Study Sessions" tab of this spreadsheet with its Google Sheets connector. That
   connector is signed in as Julius, so the only way in is his own Google account:
   no public doPost, no shared secret, nothing in GitHub.

   Columns (A–L): ID · Date · Started · Ended · Minutes · Topics · Questions (JSON) ·
   Correct · Partial · Incorrect · Unanswered · Status, then M = Logged (written here).
   - ID: stable per segment. Writing the same ID again (new row or edited row) REPLACES
     that segment; the last row with an ID wins. Nothing is ever deleted here.
   - Questions: JSON list of {q, answer, ref, result: correct|partial|incorrect|unanswered,
     topic, confidence: 1-5, weak}. When present, counts come from it and H–K are ignored,
     so counts are never typed twice. Without it, H–K are used as given.
   - Minutes = active study time (idle walks excluded). Blank → Ended − Started; neither →
     shown as "time unknown". Status "draft" is skipped; blank or "final" is logged.

   Output, on every app load (getWorkspaceData → syncStudyLog_), only when the tab changed:
   1. One History entry per date + window (Morning <14:00, Afternoon <19:00, Evening) in
      that day's Today cell: a checked, folded title line with the summary, plus detail lines
      (data-level 1, data-study-of) that unfold under it. Re-written in place when a segment
      is added or changed; applied hashes in script property studyApplied.
   2. "Study Review" tab (rebuilt): spaced-repetition state per topic for ChatGPT to read
      before quizzing.
   3. Column M "Logged" = when/where each row landed, so the writer can read it back.
   ========================================================= */
const STUDY_TAB = 'Study Sessions';
const STUDY_HEADERS = ['ID', 'Date', 'Started', 'Ended', 'Minutes', 'Topics', 'Questions (JSON)',
  'Correct', 'Partial', 'Incorrect', 'Unanswered', 'Status', 'Logged'];
const STUDY_REVIEW_TAB = 'Study Review';
const STUDY_REVIEW_HEADERS = ['Topic', 'Priority', 'Next review', 'Interval (days)', 'Last seen', 'Days studied',
  'Questions', 'Correct', 'Partial', 'Missed', 'Last result', 'Last confidence', 'Note'];
const STUDY_WIN_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const STUDY_RESULTS = ['correct', 'partial', 'incorrect', 'unanswered'];

// 'HH:MM' → morning / afternoon / evening. Before 8 counts as morning, after 22 as evening (never dropped).
function studyWindow_(hm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hm || '');
  if (!m) return '';
  const t = Number(m[1]) * 60 + Number(m[2]);
  return t < 14 * 60 ? 'morning' : t < 19 * 60 ? 'afternoon' : 'evening';
}
function studyMinutesBetween_(a, b) {
  if (!/^\d{2}:\d{2}$/.test(a || '') || !/^\d{2}:\d{2}$/.test(b || '')) return null;
  const d = (Number(b.slice(0, 2)) * 60 + Number(b.slice(3))) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3)));
  return d > 0 ? d : null;
}
function studyCount_(v) {
  const s = String(v == null ? '' : v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n < 10000 ? n : null;
}
function studyResult_(v) {
  const s = String(v || '').trim().toLowerCase();
  if (/^(correct|right|yes|✓|y)$/.test(s)) return 'correct';
  if (/^(partial|partly|half|partially correct|½)$/.test(s)) return 'partial';
  if (/^(incorrect|wrong|missed|miss|no|✗|x)$/.test(s)) return 'incorrect';
  return 'unanswered';
}
function studyClip_(v, n) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Rows of the intake tab → segments (last row per ID wins). display = getDisplayValues (times stay 'HH:MM').
function studySegments_(values, display) {
  const byId = new Map();
  for (let i = 1; i < values.length; i++) {
    const r = values[i], d = display[i] || [];
    const id = String(r[0] || '').trim();
    if (!id) continue;
    const date = intakeDate_(r[1]);
    const started = intakeTime_(d[2]);
    const seg = { id, row: i + 1, date, started, ended: intakeTime_(d[3]), status: String(r[11] || '').trim().toLowerCase(),
      problems: [] };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) seg.problems.push('date must be YYYY-MM-DD');
    seg.window = studyWindow_(started);
    if (!seg.window) seg.problems.push('Started must be a time like 11:17');
    let questions = [];
    const raw = String(r[6] || '').trim();
    if (raw) {
      try { const q = JSON.parse(raw); if (Array.isArray(q)) questions = q; else seg.problems.push('Questions must be a JSON list'); }
      catch (e) { seg.problems.push('Questions JSON could not be read'); }
    }
    seg.questions = questions.filter(q => q && typeof q === 'object').slice(0, 500).map(q => ({
      q: studyClip_(q.q || q.question, 300), answer: studyClip_(q.answer || q.user_answer, 300),
      ref: studyClip_(q.ref || q.reference || q.correct_answer, 300), result: studyResult_(q.result),
      topic: studyClip_(q.topic, 60), confidence: studyCount_(q.confidence), weak: studyClip_(q.weak, 200),
    }));
    if (seg.questions.length) {
      seg.counts = {};
      STUDY_RESULTS.forEach(k => { seg.counts[k] = seg.questions.filter(q => q.result === k).length; });
    } else {
      const c = [7, 8, 9, 10].map(j => studyCount_(r[j]));
      seg.counts = c.every(x => x === null) ? null : { correct: c[0] || 0, partial: c[1] || 0, incorrect: c[2] || 0, unanswered: c[3] || 0 };
    }
    const typed = studyCount_(r[4]);
    seg.minutes = typed !== null ? typed : studyMinutesBetween_(seg.started, seg.ended);
    const topics = String(r[5] || '').split(/[,;|]/).map(t => studyClip_(t, 60)).filter(Boolean);
    seg.questions.forEach(q => { if (q.topic && topics.indexOf(q.topic) < 0) topics.push(q.topic); });
    seg.topics = topics;
    byId.set(id, seg); // a later row with the same ID replaces the earlier one
  }
  return [...byId.values()];
}

// Segments logged to History: valid, not draft.
function studyLoggable_(seg) { return !seg.problems.length && seg.status !== 'draft'; }

function studyGroups_(segs) {
  const groups = new Map();
  segs.filter(studyLoggable_).forEach(s => {
    const key = s.date + ':' + s.window;
    if (!groups.has(key)) groups.set(key, { key, date: s.date, window: s.window, segs: [] });
    groups.get(key).segs.push(s);
  });
  groups.forEach(g => g.segs.sort((a, b) => a.started < b.started ? -1 : a.started > b.started ? 1 : 0));
  return [...groups.values()];
}

function studyTotals_(segs) {
  const t = { correct: 0, partial: 0, incorrect: 0, unanswered: 0, known: false, minutes: 0, minutesKnown: true, topics: [] };
  segs.forEach(s => {
    if (s.counts) { t.known = true; STUDY_RESULTS.forEach(k => { t[k] += s.counts[k]; }); }
    if (s.minutes === null) t.minutesKnown = false; else t.minutes += s.minutes;
    s.topics.forEach(x => { if (t.topics.indexOf(x) < 0) t.topics.push(x); });
  });
  t.answered = t.correct + t.partial + t.incorrect;
  return t;
}

// One History block: summary title line (checked, folded) + detail lines.
function studyBlockHtml_(g, review) {
  const t = studyTotals_(g.segs);
  const esc = doneEsc_;
  const parts = [];
  parts.push(t.minutesKnown ? t.minutes + ' min' : (t.minutes ? t.minutes + '+ min' : 'time unknown'));
  if (t.known) {
    parts.push(t.answered + ' answered');
    parts.push(t.correct + ' ✓ · ' + t.partial + ' partial · ' + t.incorrect + ' ✗');
    if (t.unanswered) parts.push(t.unanswered + ' unanswered');
  } else parts.push('counts not recorded');
  const topics = t.topics.slice(0, 5).join(', ') + (t.topics.length > 5 ? ' +' + (t.topics.length - 5) : '');
  if (topics) parts.push(topics);
  const first = g.segs[0].started;
  const key = esc(g.key);
  let html = '<div class="check-line done" data-level="0" data-study="' + key + '" data-tl="1" data-fold="1"' +
    ' data-at="' + first + '" data-dt="' + first + '">' + doneCheck_(true) +
    '<span class="check-text"><b>IT study</b>: ' + esc(parts.join(' · ')) + '</span></div>';
  const sub = text => { html += '<div data-level="1" data-study-of="' + key + '" style="margin-left: 24px;">' + text + '</div>'; };
  g.segs.forEach(s => {
    const c = s.counts ? s.counts.correct + ' ✓ ' + s.counts.partial + ' ½ ' + s.counts.incorrect + ' ✗' +
      (s.counts.unanswered ? ' ' + s.counts.unanswered + ' –' : '') : 'counts not recorded';
    sub('<b>' + esc(s.started + (s.ended ? '–' + s.ended : '')) + '</b> · ' +
      esc((s.minutes === null ? 'time unknown' : s.minutes + ' min') + ' · ' + c));
    s.questions.forEach(q => {
      const mark = { correct: '✓', partial: '½', incorrect: '✗', unanswered: '–' }[q.result];
      let line = mark + ' ' + (q.topic ? '<b>' + esc(q.topic) + '</b>: ' : '') + esc(q.q || '(question not recorded)');
      if (q.answer) line += ' · <i>You:</i> ' + esc(q.answer);
      if (q.ref && q.result !== 'correct') line += ' · <i>Ref:</i> ' + esc(q.ref);
      if (q.confidence !== null) line += ' · conf ' + q.confidence;
      if (q.weak) line += ' · ' + esc(q.weak);
      sub(line);
    });
  });
  // Weak areas: topics with a miss or partial in this window.
  const weak = {};
  g.segs.forEach(s => s.questions.forEach(q => {
    if (!q.topic || q.result === 'correct') return;
    weak[q.topic] = (weak[q.topic] || 0) + (q.result === 'partial' ? 0.5 : 1);
  }));
  const weakList = Object.keys(weak).sort((a, b) => weak[b] - weak[a]);
  if (weakList.length) sub('<b>Weak areas</b>: ' + esc(weakList.slice(0, 8).join(', ')));
  // Progress: next review for this window's topics, from the Study Review state.
  const next = t.topics.map(x => review.get(x.toLowerCase())).filter(Boolean)
    .sort((a, b) => a.next < b.next ? -1 : a.next > b.next ? 1 : 0)
    .slice(0, 8).map(r => r.topic + ' ' + studyShortDate_(r.next) + (r.priority === 'mastered' ? ' (mastered)' : ''));
  if (next.length) sub('<b>Next review</b>: ' + esc(next.join(' · ')));
  return html;
}
function studyShortDate_(d) { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? Number(m[1]) + '/' + Number(m[2]) : String(d || ''); }

/* Spaced repetition per topic (case-insensitive). Results are combined per study DAY, so asking the
   same topic five times in one day counts once (recently repeated ≠ mastered). Day score: correct 1,
   partial .5, missed/unanswered 0.
   ≥ .9 with confidence ≥ 4 (or none given): interval × 2.5 · ≥ .9 with low confidence: × 1.5 ·
   ≥ .5: back to 2 days · below: 1 day. Next review is never the same day. ≥ 21 days = mastered. */
function studyReview_(segs, today) {
  const days = new Map(); // topic → date → {score sum, n, conf, last result}
  const stats = new Map();
  segs.filter(studyLoggable_).forEach(s => s.questions.forEach(q => {
    if (!q.topic) return;
    const k = q.topic.toLowerCase();
    if (!stats.has(k)) stats.set(k, { topic: q.topic, questions: 0, correct: 0, partial: 0, missed: 0 });
    const st = stats.get(k);
    st.questions++;
    if (q.result === 'correct') st.correct++; else if (q.result === 'partial') st.partial++; else st.missed++;
    if (!days.has(k)) days.set(k, new Map());
    const dm = days.get(k);
    const d = dm.get(s.date) || { sum: 0, n: 0, conf: null, last: '', at: '' };
    d.sum += q.result === 'correct' ? 1 : q.result === 'partial' ? 0.5 : 0;
    d.n++;
    if (s.started >= d.at) { d.at = s.started; d.last = q.result; if (q.confidence !== null) d.conf = q.confidence; }
    dm.set(s.date, d);
  }));
  const out = new Map();
  stats.forEach((st, k) => {
    const dates = [...days.get(k).keys()].sort();
    let interval = 0, last = null;
    dates.forEach(date => {
      const d = days.get(k).get(date);
      const score = d.sum / d.n;
      if (score >= 0.9) interval = Math.max(1, Math.round((interval || 1) * (d.conf === null || d.conf >= 4 ? 2.5 : 1.5)));
      else if (score >= 0.5) interval = 2;
      else interval = 1;
      last = { date, d, score };
    });
    interval = Math.min(interval, 180);
    const next = addDaysToDateString_(last.date, Math.max(1, interval));
    const overdue = next <= today;
    const priority = interval >= 21 ? 'mastered' : overdue ? (last.score < 0.5 ? 'high' : 'due') :
      last.score < 0.5 ? 'weak' : 'later';
    out.set(k, { topic: st.topic, priority, next, interval, lastSeen: last.date, daysStudied: dates.length,
      questions: st.questions, correct: st.correct, partial: st.partial, missed: st.missed,
      lastResult: last.d.last, lastConf: last.d.conf,
      note: priority === 'high' ? 'missed last time — review first' : priority === 'weak' ? 'missed — review on the date, not before' :
        priority === 'mastered' ? 'long interval; light check only' : '' });
  });
  return out;
}

function studyReviewRows_(review) {
  const rank = { high: 0, due: 1, weak: 2, later: 3, mastered: 4 };
  return [...review.values()]
    .sort((a, b) => rank[a.priority] - rank[b.priority] || (a.next < b.next ? -1 : a.next > b.next ? 1 : 0) || a.topic.localeCompare(b.topic))
    .map(r => [r.topic, r.priority, r.next, r.interval, r.lastSeen, r.daysStudied, r.questions, r.correct, r.partial,
      r.missed, r.lastResult, r.lastConf === null ? '' : r.lastConf, r.note]);
}

// Put a study block into a day cell: replace the old one for this key in place, else add it to its section.
function studyPutBlock_(html, key, block, window) {
  const blocks = doneBlocks_(html);
  const isOurs = b => doneAttr_(b, 'data-study') === key || doneAttr_(b, 'data-study-of') === key;
  const at = blocks.findIndex(isOurs);
  if (at >= 0) {
    const kept = blocks.filter(b => !isOurs(b));
    kept.splice(at, 0, block);
    return kept.join('');
  }
  return appendDoneInSection_(html, block, window);
}

function syncStudyLog_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(STUDY_TAB);
  if (!sheet || sheet.getLastRow() < 2) return;
  let range = sheet.getRange(1, 1, sheet.getLastRow(), STUDY_HEADERS.length);
  let values = range.getValues();
  const props = PropertiesService.getScriptProperties();
  let sig = cellHash_(todayString_() + JSON.stringify(values.map(r => r.slice(0, 12))));
  if (props.getProperty('studySig') === sig) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // next load retries
  try {
    // The fast path needs only raw values. On change, reread under the lock:
    // another importer or an appended/corrected session may have arrived.
    range = sheet.getRange(1, 1, sheet.getLastRow(), STUDY_HEADERS.length);
    values = range.getValues();
    sig = cellHash_(todayString_() + JSON.stringify(values.map(r => r.slice(0, 12))));
    if (props.getProperty('studySig') === sig) return;
    const display = range.getDisplayValues();
    if (String(values[0][12] || '') !== 'Logged') sheet.getRange(1, 13).setValue('Logged');
    const today = todayString_();
    const segs = studySegments_(values, display);
    const review = studyReview_(segs, today);
    let applied = {};
    try { applied = JSON.parse(props.getProperty('studyApplied') || '{}'); } catch (e) { applied = {}; }
    const days = getOrCreateSheet_('Days', DAYS_HEADERS);
    const where = {};
    studyGroups_(segs).forEach(g => {
      // "Next review" as of this entry, so a later session never rewrites an older day.
      const end = g.segs[g.segs.length - 1].started;
      const asOf = studyReview_(segs.filter(s => s.date < g.date || (s.date === g.date && s.started <= end)), g.date);
      const block = studyBlockHtml_(g, asOf);
      const h = cellHash_(block);
      g.segs.forEach(s => { where[s.id] = g.window; });
      if (applied[g.key] === h) return; // unchanged: if Julius deleted it, it stays deleted
      let row = findDayRow_(days, g.date);
      if (!row) { days.appendRow([parseDate_(g.date), '', '']); row = days.getLastRow(); }
      const cell = days.getRange(row, 2);
      const before = String(cell.getValue() || '');
      const after = studyPutBlock_(before, g.key, block, g.window);
      if (after !== before) {
        if (before) backupCell_(g.date, 'Today', 'IT study log', before);
        cell.setValue(after);
      }
      applied[g.key] = h;
    });
    const keys = Object.keys(applied).sort();
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => { delete applied[k]; });
    props.setProperty('studyApplied', JSON.stringify(applied));
    // Read-back column for whoever wrote the row.
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    const latestRow = new Map(segs.map(s => [s.row, s]));
    const logged = values.slice(1).map((r, i) => {
      const s = latestRow.get(i + 2);
      const old = String(r[12] || '');
      if (!String(r[0] || '').trim()) return [old];
      if (!s) return [/^replaced/.test(old) ? old : 'replaced by a later row with this ID'];
      if (s.problems.length) return ['NOT logged: ' + s.problems.join('; ')];
      if (s.status === 'draft') return ['draft — not logged yet'];
      const msg = 'logged → History ' + s.date + ' ' + STUDY_WIN_LABEL[where[s.id]];
      return [old.indexOf(msg) === 0 ? old : msg + ' (' + stamp + ')'];
    });
    if (logged.length) sheet.getRange(2, 13, logged.length, 1).setValues(logged);
    // Study Review tab: derived, safe to rebuild.
    const rev = getOrCreateSheet_(STUDY_REVIEW_TAB, STUDY_REVIEW_HEADERS);
    const rows = studyReviewRows_(review);
    const last = rev.getLastRow();
    if (last > 1) rev.getRange(2, 1, last - 1, STUDY_REVIEW_HEADERS.length).clearContent();
    if (rows.length) rev.getRange(2, 1, rows.length, STUDY_REVIEW_HEADERS.length).setValues(rows);
    // Signature after our own writes to column M (not part of the signature anyway).
    props.setProperty('studySig', sig);
  } finally { lock.releaseLock(); }
}
