/* Calendar edits on Cloud Functions (docs/NOTES.md → "I. Server jobs → Firebase Cloud Functions", 2026-11-24).
   A port of the Apps Script calendar panel edits (Code.gs calPanelCreateEvent / UpdateEvent / MoveEvent / DeleteEvent /
   DuplicateEvent, setCalendarEventTitle / setCalendarEventDone) to the Google Calendar API, so an edit takes ~0.3 s
   instead of an Apps Script round trip. Same inputs and answer shapes as the Apps Script functions; the app falls back
   to Apps Script whenever this answers { fallback }. After a non-repeating edit the event is written into the calendar
   copy (ganttCal month docs + meta.at), so the app shows it at once.
   Event ids are iCalUIDs (CalendarApp's getId) and an event is found by iCalUID + start (startMs), like calEventAt_.
   Private event tags = Calendar API private extended properties (CalendarApp setTag). Pure logic: the Calendar client
   and the Firestore handle are passed in (index.mjs wires the real ones; tools/functions-test.mjs fakes them).
   .mjs on purpose: clasp pushes .js files to Apps Script and would break the app. */

export const TZ = 'America/Los_Angeles';
export const MAIN = 'juliussimtim@gmail.com'; // = Code.gs EVENT_CALENDARS[0] (functions-test checks)
export const EVENTS_CAL = 'd9463b07581a50b3e95948fa273e7971bdcde4f97ebf8070c4cf0b215e8f063b@group.calendar.google.com';
export const COLORS = { '1': '#7986cb', '2': '#59af80', '3': '#8e24aa', '4': '#e67c73', '5': '#e6ba57', '6': '#db793a',
  '7': '#5398cf', '8': '#808080', '9': '#7577c4', '10': '#0b8043', '11': '#de583d' }; // = CAL_PANEL_COLORS_
export const UNASSIGNED = '#8a8f98';
export const URG_COLOR = { '1': '11', '2': '5', '3': '9' }; // = URG_EVENT_COLOR_
export const ORD_TAG = 'fwOrd', SCHED_TAG = 'fwSched', PREV_TAG = 'fwPrev', TID_TAG = 'ganttTid', LINK_TID = 'fwTid', LINK_TT = 'fwTt';
const DAY = 864e5;

export class Fallback extends Error { constructor(m) { super(m); this.fallback = true; } }

/* ---- time zone (America/Los_Angeles wall time ↔ ms) ---- */
function offsetMin(ms) {
  const t = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).formatToParts(new Date(ms))
    .find(p => p.type === 'timeZoneName').value, m = t.match(/GMT([+-])(\d+)(?::(\d+))?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}
// Wall time in Los Angeles → ms (two passes settle DST edges).
export function wallMs(y, mo, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - offsetMin(guess) * 60000;
  ms = guess - offsetMin(ms) * 60000;
  return ms;
}
export function dayMs(s) { return wallMs(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10)); }
function parts(ms) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
  return o;
}
export function ymd(ms) { const p = parts(ms); return p.year + '-' + p.month + '-' + p.day; }
export function isoLocal(ms) {
  const p = parts(ms), off = offsetMin(ms), a = Math.abs(off);
  return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + (off < 0 ? '-' : '+') +
    String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
}
export function addDays(s, n) { return new Date(Date.parse(s + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10); }

/* ---- calPanelWhen_ ---- */
export function when(req) {
  const r = req || {}, allDay = !!r.allDay, s = String(r.start || ''), e = String(r.end || '');
  const title = String(r.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!title) throw new Error('Title is empty');
  if (allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) throw new Error('Invalid date');
    const a = dayMs(s), b = dayMs(e);
    if (b <= a) throw new Error('End date is before the start date');
    if (b - a > 366 * DAY) throw new Error('Event is longer than a year');
    return { title, allDay: true, s, e, start: a, end: b, oneDay: addDays(s, 1) === e };
  }
  const re = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/, ms = s.match(re), me = e.match(re);
  if (!ms || !me) throw new Error('Invalid time');
  const a = wallMs(+ms[1], +ms[2], +ms[3], +ms[4], +ms[5]), b = wallMs(+me[1], +me[2], +me[3], +me[4], +me[5]);
  if (b <= a) throw new Error('End time is before the start time');
  if (b - a > 31 * DAY) throw new Error('Event is longer than a month');
  return { title, allDay: false, start: a, end: b };
}
function apiTimes(w) {
  return w.allDay ? { start: { date: ymd(w.start), dateTime: null }, end: { date: ymd(w.end), dateTime: null } }
    : { start: { dateTime: new Date(w.start).toISOString(), timeZone: TZ, date: null }, end: { dateTime: new Date(w.end).toISOString(), timeZone: TZ, date: null } };
}
export function startOf(it) { return it.start.date ? dayMs(it.start.date) : Date.parse(it.start.dateTime); }
function endOf(it) { return it.end.date ? dayMs(it.end.date) : Date.parse(it.end.dateTime); }
function priv(it) { return (it.extendedProperties && it.extendedProperties.private) || {}; }
function clean(o) { const out = {}; Object.keys(o).forEach(k => { if (o[k] !== null) out[k] = o[k]; }); return out; }

export function makeCal(api, db) {
  const ev = api.events;

  // calEventAt_: the instance with this iCalUID nearest startMs (±1 min, then ±1 day).
  async function find(calId, eventId, startMs) {
    if (!eventId) throw new Error('Missing event id');
    const t = Number(startMs);
    for (const span of [60000, DAY]) {
      const r = await ev.list({ calendarId: calId, iCalUID: String(eventId), singleEvents: true, showDeleted: false, maxResults: 50,
        timeMin: new Date(t - span).toISOString(), timeMax: new Date(t + span + 1).toISOString() });
      const items = (r.data.items || []).filter(i => i.status !== 'cancelled' && i.start);
      items.sort((a, b) => Math.abs(startOf(a) - t) - Math.abs(startOf(b) - t));
      if (items[0] && (span === DAY || Math.abs(startOf(items[0]) - t) < 60000)) return items[0];
    }
    throw new Error('Event not found (moved or deleted?) — tap ↻ on the Calendar');
  }

  /* ---- the calendar copy (ganttCal) ---- */
  let metaCache = null;
  async function copyMeta() {
    if (metaCache) return metaCache;
    const s = await db.doc('ganttCal/meta').get();
    return (metaCache = s.exists ? s.data() : null);
  }
  function list(x) { try { const v = JSON.parse(x || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  // Only calendars the copy knows (picked) and edits Apps Script would allow: main, or one whose copied events are editable.
  async function writable(calId) {
    if (calId === MAIN) return true;
    const m = await copyMeta();
    if (!m || !list(m.cals).some(c => c.id === calId)) throw new Fallback('calendar not in the copy');
    return true;
  }
  async function oldEntry(id) {
    const m = await copyMeta();
    if (!m) return null;
    for (const mo of list(m.months)) {
      const s = await db.doc('ganttCal/' + mo).get();
      const hit = s.exists && list(s.data().ev).find(e => e.id === id);
      if (hit) return hit;
    }
    return null;
  }
  // calPanelEventOut_ + calPanelAttachMeta_ (saved urgency / due / minutes / subject carried over from the copy).
  async function panel(it, calId, old) {
    const m = await copyMeta(), cals = m ? list(m.cals) : [], c = cals.find(x => x.id === calId) || {};
    const allDay = !!it.start.date, st = startOf(it), en = endOf(it), colorId = String(it.colorId || ''), p = priv(it);
    const eventId = it.iCalUID || (it.id + '@google.com');
    const out = {
      id: eventId + '|' + st, eventId, startMs: st, calId, cal: c.name || (calId === MAIN ? MAIN : calId), title: it.summary || '(no title)', allDay,
      start: allDay ? ymd(st) : isoLocal(st), end: allDay ? ymd(en) : isoLocal(en),
      color: COLORS[colorId] || (calId === MAIN ? UNASSIGNED : c.color || '#039be5'), colorId, done: colorId === '8',
      location: it.location || '', desc: plainDesc(it.description), recurring: !!it.recurringEventId, link: it.htmlLink || '', editable: true,
      sched: !allDay && p[SCHED_TAG] === '1', ord: allDay ? Number(p[ORD_TAG]) || 0 : 0, life: allDay && calId === EVENTS_CAL,
      tid: p[LINK_TID] || '', tt: p[LINK_TT] || '' // linked task (Code.gs CAL_TID_TAG / CAL_TT_TAG)
    };
    if (old) ['due', 'dur', 'cat'].forEach(k => { if (old[k]) out[k] = old[k]; });
    if (old && old.urg && !old.uc) out.urg = old.urg;
    if (!out.urg) { const u = Object.keys(URG_COLOR).find(k => URG_COLOR[k] === colorId); if (u) { out.urg = u; out.uc = 1; } }
    return out;
  }
  // Put the edited event into the copy now (and drop its old spot), stamp meta.at; Apps Script's 5-min copy won't
  // overwrite a month doc with fnAt newer than when its own read started (Store.cal.sync).
  // dropIds: panel ids, or a function (entry → true = drop), e.g. every spot of one non-repeating event.
  async function intoCopy(dropIds, entry) { return intoCopyMany([{ drop: dropIds, entry }]); }
  // Several changes in one pass over the month docs (bulk backlog send): [{ drop, entry }].
  async function intoCopyMany(changes) {
    const m = await copyMeta();
    if (!m || !changes.length) return 0;
    const now = Date.now(), months = list(m.months);
    const ch = changes.map(c => ({ drop: typeof c.drop === 'function' ? c.drop : e => c.drop.indexOf(e.id) >= 0, entry: c.entry }));
    const hits = (c, mo) => c.entry && String(c.entry.start).slice(0, 7) <= mo && String(c.entry.end).slice(0, 7) >= mo;
    for (const mo of months) {
      const ref = db.doc('ganttCal/' + mo), s = await ref.get();
      if (!s.exists) continue;
      const evs = list(s.data().ev), kept = evs.filter(e => !ch.some(c => c.drop(e))), add = ch.filter(c => hits(c, mo)).map(c => c.entry);
      kept.push(...add);
      if (kept.length === evs.length && !add.length) continue;
      await ref.set({ ev: JSON.stringify(kept), n: kept.length, fnAt: now, at: now }, { merge: true });
    }
    await db.doc('ganttCal/meta').set({ at: now, fnAt: now }, { merge: true });
    return now;
  }
  // Change fields of entries already in the copy (by panel id); fn(entry) returns the changed entry or null.
  async function patchCopy(ids, fn) {
    const m = await copyMeta();
    if (!m || !ids.length) return 0;
    const now = Date.now();
    let hit = false;
    for (const mo of list(m.months)) {
      const ref = db.doc('ganttCal/' + mo), snap = await ref.get();
      if (!snap.exists) continue;
      let changed = false;
      const evs = list(snap.data().ev).map(e => { if (ids.indexOf(e.id) < 0) return e; const n = fn(Object.assign({}, e)); if (n) { changed = true; return n; } return e; });
      if (!changed) continue;
      hit = true;
      await ref.set({ ev: JSON.stringify(evs), n: evs.length, fnAt: now, at: now }, { merge: true });
    }
    if (!hit) return 0;
    await db.doc('ganttCal/meta').set({ at: now, fnAt: now }, { merge: true });
    return now;
  }
  // Up to 5 at a time.
  async function pool(items, f) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(5, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k]).then(v => ({ ok: true, v }), e => ({ ok: false, e })); } }));
    return out;
  }
  /* Hold-menu fields (M): doc gantt/calMeta = { v: JSON map 'calMeta:<eventId>[:<start>]' → { s, urg, due, dur, cat } }
     (Code.gs calMetaKey_ / Store.calMeta). Edited in a transaction; not seeded yet → Apps Script does it (Fallback). */
  const META = 'gantt/calMeta';
  function metaKey(eventId, start, recurring) { return 'calMeta:' + String(eventId).slice(0, 60) + (recurring ? ':' + Number(start) : ''); }
  async function editMeta(fn) {
    const ref = db.doc(META), apply = (snap) => {
      if (!snap.exists || !snap.data().v) throw new Fallback('hold-menu data not on the database yet');
      let m; try { m = JSON.parse(snap.data().v) || {}; } catch (e) { throw new Fallback('hold-menu data unreadable'); }
      const r = fn(m), cut = Date.now() - 60 * DAY;
      Object.keys(m).forEach(k => { if (!(Number(m[k] && m[k].s) >= cut)) delete m[k]; });
      return { r, rec: { v: JSON.stringify(m), at: Date.now(), dev: 'fn' } };
    };
    if (db.runTransaction) return db.runTransaction(async t => { const x = apply(await t.get(ref)); t.set(ref, x.rec, { merge: true }); return x.r; });
    const x = apply(await ref.get()); await ref.set(x.rec, { merge: true }); return x.r;
  }
  // Main-calendar urgency color (Code.gs syncCalUrgencyColor_): a done event keeps Graphite, "not done" brings the new color.
  async function urgColor(it, calId, urg) {
    const c = URG_COLOR[urg] || '';
    if (String(it.colorId || '') === '8') { await ev.patch({ calendarId: calId, eventId: it.id, requestBody: { extendedProperties: { private: { [PREV_TAG]: c || 'default' } } } }); return null; }
    const body = Object.assign({}, it);
    if (c) body.colorId = c; else delete body.colorId;
    return (await ev.update({ calendarId: calId, eventId: it.id, requestBody: body })).data;
  }
  function withCopy(r, at) { return Object.assign({}, r, { copyAt: at || undefined }); }

  // calRecurringEdit_: 'one' = this day's instance, 'all' = the series (same shift of start, same length).
  async function recurringEdit(calId, inst, w, scope, titleOnly) {
    const body = titleOnly ? {} : apiTimes(w);
    if (w.title) body.summary = w.title;
    if (scope !== 'all') { await ev.patch({ calendarId: calId, eventId: inst.id, requestBody: body }); return { eventId: inst.iCalUID, refetch: true }; }
    const master = (await ev.get({ calendarId: calId, eventId: inst.recurringEventId || inst.id })).data;
    if (!titleOnly) {
      if (!!w.allDay !== !!inst.start.date) throw new Error('All-day ↔ timed can only change for this day');
      const delta = w.start - startOf(inst), len = w.end - w.start;
      if (w.allDay) {
        const ms = dayMs(master.start.date) + delta, days = Math.round(len / DAY);
        body.start = { date: ymd(ms + 12 * 3600000) }; body.end = { date: ymd(ms + days * DAY + 12 * 3600000) };
      } else {
        const ms = Date.parse(master.start.dateTime) + delta, mtz = master.start.timeZone || TZ;
        body.start = { dateTime: new Date(ms).toISOString(), timeZone: mtz }; body.end = { dateTime: new Date(ms + len).toISOString(), timeZone: mtz };
      }
    }
    await ev.patch({ calendarId: calId, eventId: master.id, requestBody: body });
    return { eventId: inst.iCalUID, refetch: true };
  }

  /* ---- Plan rows + Schedule links (P, 2026-11-24; Code.gs planSchedule / planMoveEvent / planRelink_) ----
     Rows: ganttPlan/<id> (NOTES D2). Links (task tid → 'eventId@startMs'): ONE doc gantt/planLinks = { v: JSON map }
     (Store.plan.links_ seeds it from the planEv:* properties). Either missing → Apps Script does the job (Fallback). */
  const LINKS = 'gantt/planLinks';
  async function planOn() { const s = await db.doc('gantt/planMeta').get(); return s.exists && Number(s.data().seeded) > 0; }
  const linkOf = it => (it.iCalUID || it.id + '@google.com') + '@' + startOf(it);
  function linkParts(x) { const m = String(x || '').match(/^(.+)@(\d+)$/); return m ? { eventId: m[1], startMs: Number(m[2]) } : null; }
  async function rowsWhere(field, lo, hi) {
    let q = db.collection('ganttPlan');
    q = hi === undefined ? q.where(field, '==', lo) : q.where(field, '>=', lo).where(field, '<', hi);
    return (await q.get()).docs.map(d => Object.assign({}, d.data(), { id: d.id })).filter(x => !Number(x.del));
  }
  function stamp() { const p = parts(Date.now()); return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute; }
  async function writeRow(x, fields) {
    const at = Math.max(Date.now(), (Number(x.at) || 0) + 1);
    await db.doc('ganttPlan/' + x.id).set(Object.assign({}, fields, { updated: stamp(), at, up: new Date(at), dev: 'fn' }), { merge: true });
  }
  // Read-modify-write of one JSON-map doc (transaction when the SDK has one). fn(map) → changed? Missing doc → null.
  async function editMap(path, fn) {
    const ref = db.doc(path), apply = snap => {
      if (!snap.exists || !snap.data().v) return null;
      let m; try { m = JSON.parse(snap.data().v) || {}; } catch (e) { return null; }
      const ch = fn(m), now = Date.now();
      return { m, rec: ch ? { v: JSON.stringify(m), at: now, up: new Date(now), dev: 'fn' } : null };
    };
    if (db.runTransaction) return db.runTransaction(async t => { const x = apply(await t.get(ref)); if (x && x.rec) t.set(ref, x.rec, { merge: true }); return x && x.m; });
    const x = apply(await ref.get()); if (x && x.rec) await ref.set(x.rec, { merge: true }); return x && x.m;
  }
  // planRelink_: every row pointing at this event gets its new link; its task's Schedule link too. ok = links doc there.
  async function relink(it) {
    const link = linkOf(it), uid = link.replace(/@\d+$/, '');
    for (const x of await rowsWhere('event', uid + '@', uid + '@\uf8ff')) {
      const p = linkParts(x.event);
      if (p && p.eventId === uid && x.event !== link) await writeRow(x, { event: link });
    }
    const tid = String(priv(it)[TID_TAG] || '').slice(0, 66);
    if (!tid) return { link, ok: true };
    const m = await editMap(LINKS, map => { if (map[tid] === link) return false; map[tid] = link; return true; });
    return { link, ok: !!m };
  }
  // After a main-calendar move / edit: relink here when Plan is on the database; else the app asks Apps Script (relink).
  async function relinkOut(out, res, calId) {
    if (calId !== MAIN || res.recurringEventId) return Object.assign(out, { relink: true });
    try { if (await planOn() && (await relink(res)).ok) return out; } catch (e) { console.warn('relink: ' + e.message); }
    return Object.assign(out, { relink: true });
  }
  // planMoveEv_: to another day, keeping the length (all-day) or the clock times (timed, LA wall time across DST).
  function shiftTo(it, date) {
    if (it.start.date) {
      const days = Math.max(1, Math.round((dayMs(it.end.date) - dayMs(it.start.date)) / DAY));
      return { start: { date, dateTime: null }, end: { date: addDays(date, days), dateTime: null } };
    }
    const s = Date.parse(it.start.dateTime), e = Date.parse(it.end.dateTime), shift = Math.round((dayMs(date) - dayMs(ymd(s))) / DAY);
    const mv = ms => { const p = parts(ms), d = addDays(p.year + '-' + p.month + '-' + p.day, shift); return wallMs(+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10), +p.hour, +p.minute) + Number(p.second) * 1000; };
    return { start: { dateTime: new Date(mv(s)).toISOString(), timeZone: TZ, date: null }, end: { dateTime: new Date(mv(e)).toISOString(), timeZone: TZ, date: null } };
  }
  const notFound = e => Number(e && e.code) === 404 || Number(e && e.code) === 410;

  /* ---- Cal Backlog (P; Code.gs calBacklogPlace / PlaceMany / Complete) ----
     The open list = doc gantt/calBacklog (Apps Script publishes it from the Cal Backlog tab). The function does the
     calendar part, takes the row off that list, and leaves one ganttBacklogOps doc per row; Apps Script copies it into
     the tab (calBacklogApplyOps_) before its next read of the rows. List missing / older than 20 min → Apps Script. */
  const BL = 'gantt/calBacklog', BL_OPS = 'ganttBacklogOps';
  const opKey = id => Buffer.from(String(id)).toString('base64url').slice(0, 600);
  async function blItems() {
    const s = await db.doc(BL).get();
    if (!s.exists) throw new Fallback('backlog not on the database');
    const d = s.data();
    if (Date.now() - Number(d.at) > 20 * 60000) throw new Fallback('backlog copy is old');
    try { const v = JSON.parse(d.items || '[]'); if (Array.isArray(v)) return v; } catch (e) { /* below */ }
    throw new Fallback('backlog list unreadable');
  }
  async function blPending(id) { const s = await db.doc(BL_OPS + '/' + opKey(id)).get(); return s.exists ? String(s.data().v || 'done') : ''; }
  async function blMark(id, v, log) {
    const now = Date.now(), rec = { key: opKey(id), id: String(id), v, at: now };
    if (log) { rec.logDay = log.day; rec.logTitle = log.title; }
    await db.doc(BL_OPS + '/' + rec.key).set(rec);
  }
  // Take rows off the published open list (the app's Backlog reads it); `at` untouched so a stale list still falls back.
  async function blTakeOut(ids) {
    if (!ids.length) return;
    const ref = db.doc(BL), apply = snap => {
      if (!snap.exists) return null;
      let items; try { items = JSON.parse(snap.data().items || '[]'); } catch (e) { return null; }
      const kept = items.filter(x => ids.indexOf(x.id) < 0);
      return kept.length === items.length ? null : { items: JSON.stringify(kept), fnAt: Date.now() };
    };
    if (db.runTransaction) return db.runTransaction(async t => { const rec = apply(await t.get(ref)); if (rec) t.set(ref, rec, { merge: true }); });
    const rec = apply(await ref.get()); if (rec) await ref.set(rec, { merge: true });
  }
  const blUid = id => String(id || '').split('|')[0];
  const blEvId = id => blUid(id).replace(/@google\.com$/, ''); // Code.gs calBacklogEventId_
  const sameEvent = uid => e => e.eventId === uid && !e.recurring;
  // calBacklogPlaceIn_ for one row (item from the open list).
  async function blPlace(r, it) {
    const id = String(r.id), evId = blEvId(id), uid = blUid(id);
    if (r.drop) {
      try { await ev.delete({ calendarId: MAIN, eventId: evId }); } catch (e) { if (!notFound(e)) throw e; }
      await blMark(id, 'dropped');
      return { res: { ok: true }, copy: { drop: sameEvent(uid), entry: null } };
    }
    const w = when(Object.assign({}, r, { title: it.title }));
    const color = it.colorId && it.colorId !== '8' && it.colorId !== '3' ? String(it.colorId) : '';
    const body = Object.assign({ summary: w.title }, apiTimes(w));
    if (color) body.colorId = color;
    if (w.allDay) body.extendedProperties = { private: { [ORD_TAG]: String(Number(r.ord) || Date.now()) } }; // bottom of the day
    let res, made = false;
    try {
      res = (await ev.patch({ calendarId: MAIN, eventId: evId, requestBody: body })).data;
      if (String(res.colorId || '') === '3') { const full = Object.assign({}, res); delete full.colorId; res = (await ev.update({ calendarId: MAIN, eventId: res.id, requestBody: full })).data; } // old Grape
    } catch (e) {
      if (!notFound(e)) throw e;
      const nb = Object.assign({ summary: w.title, reminders: { useDefault: false, overrides: [] } }, apiTimes(w)); // original gone → a fresh one
      if (color) nb.colorId = color;
      res = (await ev.insert({ calendarId: MAIN, requestBody: nb })).data; made = true;
    }
    const out = await panel(res, MAIN, null);
    await blMark(id, w.allDay ? w.s : ymd(w.start));
    return { res: { ok: true, event: made ? out : { id: res.id } }, copy: { drop: made ? [] : sameEvent(uid), entry: out } };
  }

  const OPS = {
    async calPanelCreateEvent(req) {
      const w = when(req), opId = String((req && req.opId) || '').replace(/[^\w-]/g, '').slice(0, 60);
      const calId = String((req && req.life) ? EVENTS_CAL : (req && req.calId) || MAIN);
      await writable(calId);
      const opRef = opId ? db.doc('ganttCalOps/' + opId) : null;
      if (opRef) {
        const done = await opRef.get();
        if (done.exists) {
          const d = done.data();
          try { return Object.assign(await panel(await find(d.calId, d.eventId, d.startMs), d.calId, null), { repeat: true }); }
          catch (e) { return { eventId: d.eventId, startMs: d.startMs, repeat: true }; }
        }
      }
      const body = Object.assign({ summary: w.title, reminders: { useDefault: false, overrides: [] } }, apiTimes(w));
      const tags = {};
      if (w.allDay) tags[ORD_TAG] = String(Number(req.ord) || Date.now()); // new all-day = bottom
      const tid = String((req && req.tid) || '').replace(/[^\w-]/g, '').slice(0, 60); // linked task (2026-11-23)
      if (tid) { tags[LINK_TID] = tid; tags[LINK_TT] = w.title; }
      if (Object.keys(tags).length) body.extendedProperties = { private: tags };
      const it = (await ev.insert({ calendarId: calId, requestBody: body })).data;
      const out = await panel(it, calId, null);
      if (opRef) await opRef.set({ eventId: out.eventId, startMs: out.startMs, calId, at: Date.now() });
      return withCopy(out, await intoCopy([], out));
    },
    async calPanelUpdateEvent(req) {
      const w = when(req), calId = String(req.calId || MAIN);
      await writable(calId);
      const it = await find(calId, req.eventId, req.startMs);
      if (it.recurringEventId) return recurringEdit(calId, it, w, req.scope);
      const old = await oldEntry(String(req.eventId) + '|' + startOf(it));
      const r = (await ev.patch({ calendarId: calId, eventId: it.id, requestBody: Object.assign({ summary: w.title }, apiTimes(w)) })).data;
      const out = await panel(r, calId, old);
      const at = await intoCopy([String(req.eventId) + '|' + startOf(it)], out);
      return withCopy(await relinkOut(out, r, calId), at);
    },
    async calPanelMoveEvent(req) {
      const r = req || {}, calId = String(r.calId || MAIN);
      await writable(calId);
      const it = await find(calId, r.eventId, r.startMs);
      if (String(it.colorId || '') === '8') throw new Error('Done events stay where they are');
      const w = when(Object.assign({}, r, { title: it.summary || 'Event' }));
      if (it.recurringEventId) { w.title = ''; return recurringEdit(calId, it, w, r.scope); }
      const wasAllDay = !!it.start.date, p = Object.assign({}, priv(it)), t = apiTimes(w);
      if (!w.allDay && wasAllDay) p[SCHED_TAG] = '1';
      else if (w.allDay && p[SCHED_TAG]) delete p[SCHED_TAG];
      if (w.allDay && !wasAllDay) p[ORD_TAG] = String(Date.now());
      // Full update (not patch): the private tag map is replaced exactly, so a removed tag really goes.
      const body = Object.assign({}, it, { start: clean(t.start), end: clean(t.end), extendedProperties: Object.assign({}, it.extendedProperties, { private: p }) });
      const old = await oldEntry(String(r.eventId) + '|' + startOf(it));
      const res = (await ev.update({ calendarId: calId, eventId: it.id, requestBody: body })).data;
      const out = await panel(res, calId, old);
      const at = await intoCopy([String(r.eventId) + '|' + startOf(it)], out);
      return withCopy(await relinkOut(out, res, calId), at);
    },
    async calPanelDeleteEvent(req) {
      const r = req || {}, calId = String(r.calId || MAIN);
      await writable(calId);
      let it;
      try { it = await find(calId, r.eventId, r.startMs); }
      catch (e) { if (/not found/i.test(e.message)) return { ok: true, gone: true }; throw e; }
      if (it.recurringEventId) { await ev.delete({ calendarId: calId, eventId: r.scope === 'all' ? it.recurringEventId : it.id }); return { ok: true }; }
      await ev.delete({ calendarId: calId, eventId: it.id });
      return withCopy({ ok: true }, await intoCopy([String(r.eventId) + '|' + startOf(it)], null));
    },
    async calPanelDuplicateEvent(req) {
      const r = req || {}, calId = String(r.calId || MAIN);
      await writable(calId);
      const src = await find(calId, r.eventId, r.startMs);
      const body = { summary: src.summary || '', start: src.start, end: src.end, reminders: { useDefault: false, overrides: [] } };
      if (src.recurringEventId) Object.assign(body, src.start.date ? { start: { date: src.start.date }, end: { date: src.end.date } }
        : { start: { dateTime: src.start.dateTime, timeZone: src.start.timeZone || TZ }, end: { dateTime: src.end.dateTime, timeZone: src.end.timeZone || TZ } });
      if (src.location) body.location = src.location;
      if (src.description) body.description = src.description;
      let c = String(src.colorId || '');
      if (c === '8') { const pv = priv(src)[PREV_TAG]; c = pv && pv !== 'default' && pv !== '8' ? pv : ''; }
      if (c) body.colorId = c;
      const it = (await ev.insert({ calendarId: calId, requestBody: body })).data;
      const out = await panel(it, calId, null);
      return withCopy(out, await intoCopy([], out));
    },
    async setCalendarEventTitle(calId, eventId, start, title) {
      calId = String(calId || MAIN);
      await writable(calId);
      const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!name) throw new Error('Title is empty');
      const it = await find(calId, eventId, start);
      const res = (await ev.patch({ calendarId: calId, eventId: it.id, requestBody: { summary: name } })).data;
      if (it.recurringEventId) return { title: name };
      const id = String(eventId) + '|' + startOf(it);
      return withCopy({ title: name }, await intoCopy([id], await panel(res, calId, await oldEntry(id))));
    },
    // Hold menu (Code.gs setCalendarEventMeta): urgency / due / length / subject; urgency recolors main-calendar events.
    async setCalendarEventMeta(eventId, start, recurring, meta, calId) {
      calId = String(calId || MAIN);
      const m = meta || {}, clean = {};
      if (/^[123]$/.test(m.urg || '')) clean.urg = m.urg;
      if (/^\d{4}-\d{2}-\d{2}$/.test(m.due || '')) clean.due = m.due;
      if (/^\d{1,4}$/.test(String(m.dur || ''))) clean.dur = String(m.dur);
      if (/^[a-z]{2,12}$/.test(m.cat || '')) clean.cat = m.cat;
      if (!eventId) throw new Error('Missing event id');
      const key = metaKey(eventId, start, recurring);
      const oldUrg = await editMeta(map => {
        const old = (map[key] && map[key].urg) || '';
        if (Object.keys(clean).length) map[key] = Object.assign({ s: Number(start) }, clean); else delete map[key];
        return old;
      });
      let it = null, res = null;
      if ((clean.urg || '') !== oldUrg && calId === MAIN) { it = await find(calId, eventId, start); res = await urgColor(it, calId, clean.urg || ''); }
      if (recurring) return clean; // repeating: no copyAt → the app has the server re-copy, as before
      const at = await patchCopy([String(eventId) + '|' + Number(start)], e => {
        ['urg', 'due', 'dur', 'cat', 'uc'].forEach(k => { delete e[k]; });
        Object.assign(e, clean);
        if (res) { e.colorId = String(res.colorId || ''); e.color = COLORS[e.colorId] || UNASSIGNED; }
        if (!e.urg) { const u = Object.keys(URG_COLOR).find(k => URG_COLOR[k] === e.colorId); if (u) { e.urg = u; e.uc = 1; } }
        return e;
      });
      return withCopy(Object.assign({}, clean), at);
    },
    // Quick add from Cal Events (Code.gs addAllDayTask): one-day all-day event on the main calendar, no reminders.
    async addAllDayTask(dateString, title) {
      const date = String(dateString || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid calendar date');
      const name = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!name) throw new Error('Task name is empty');
      const it = (await ev.insert({ calendarId: MAIN, requestBody: { summary: name, start: { date }, end: { date: addDays(date, 1) }, reminders: { useDefault: false, overrides: [] } } })).data;
      const out = await panel(it, MAIN, null);
      return withCopy({ id: out.eventId, date }, await intoCopy([], out));
    },
    // All-day order (Code.gs calPanelSetOrder): [{eventId, startMs, calId, ord}] → private tag fwOrd on each.
    async calPanelSetOrder(items) {
      items = (Array.isArray(items) ? items : []).filter(x => x && x.eventId).slice(0, 200);
      for (const c of new Set(items.map(x => String(x.calId || MAIN)))) await writable(c);
      const res = await pool(items, async x => {
        const calId = String(x.calId || MAIN), it = await find(calId, x.eventId, x.startMs), ord = String(Number(x.ord) || 0);
        await ev.patch({ calendarId: calId, eventId: it.id, requestBody: { extendedProperties: { private: { [ORD_TAG]: ord } } } });
        return { id: String(x.eventId) + '|' + startOf(it), ord: Number(ord) };
      });
      const failed = items.filter((x, i) => !res[i].ok).map(x => String(x.eventId)), ords = {};
      res.forEach(r => { if (r.ok) ords[r.v.id] = r.v.ord; });
      const at = await patchCopy(Object.keys(ords), e => Object.assign(e, { ord: ords[e.id] }));
      return withCopy({ ok: !failed.length, failed }, at);
    },
    // Linked tasks (Code.gs calRetitleLinked): [{calId, eventId, startMs, title}] → title + fwTt = title.
    async calRetitleLinked(items) {
      items = (Array.isArray(items) ? items : []).filter(x => x && x.eventId).slice(0, 100);
      for (const c of new Set(items.map(x => String(x.calId || MAIN)))) await writable(c);
      const res = await pool(items, async x => {
        const calId = String(x.calId || MAIN), name = String(x.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (!name) throw new Error('Title is empty');
        const it = await find(calId, x.eventId, x.startMs);
        await ev.patch({ calendarId: calId, eventId: it.id, requestBody: { summary: name, extendedProperties: { private: { [LINK_TT]: name } } } });
        return { id: String(x.eventId) + '|' + startOf(it), name };
      });
      const failed = items.filter((x, i) => !res[i].ok).map(x => String(x.eventId)), names = {};
      res.forEach(r => { if (r.ok) names[r.v.id] = r.v.name; });
      const at = await patchCopy(Object.keys(names), e => Object.assign(e, { title: names[e.id], tt: names[e.id] }));
      return withCopy({ ok: !failed.length, failed }, at);
    },
    // Color (Code.gs calPanelSetColor). A done event keeps Graphite and the color is saved for "not done" (fwPrev).
    // Main calendar: the app then has Apps Script update the saved urgency (calMetaUrgFromColor, its properties).
    async calPanelSetColor(req) {
      const r = req || {}, calId = String(r.calId || MAIN), c = String(r.colorId || '');
      if (c && !/^([1-9]|1[01])$/.test(c)) throw new Error('Unknown color');
      if (c === '8') throw new Error('Graphite = done — use Mark done');
      await writable(calId);
      const it = await find(calId, r.eventId, r.startMs), wasDone = String(it.colorId || '') === '8';
      if (wasDone) await ev.patch({ calendarId: calId, eventId: it.id, requestBody: { extendedProperties: { private: { [PREV_TAG]: c || 'default' } } } });
      else {
        const body = Object.assign({}, it);
        if (c) body.colorId = c; else delete body.colorId;
        await ev.update({ calendarId: calId, eventId: it.id, requestBody: body });
      }
      const out = { colorId: c };
      if (calId === MAIN) {
        // Saved urgency follows the color (Code.gs calMetaUrgFromColor) — in the database doc; not seeded → Apps Script.
        const key = metaKey(r.eventId, r.startMs, !!it.recurringEventId), u0 = Object.keys(URG_COLOR).find(k => URG_COLOR[k] === c) || '';
        try {
          await editMeta(map => {
            const e = Object.assign({}, map[key] || {});
            if (u0) e.urg = u0; else delete e.urg;
            if (Object.keys(e).some(k => k !== 's')) map[key] = Object.assign(e, { s: Number(r.startMs) }); else delete map[key];
          });
        } catch (e) {
          if (!e.fallback) throw e;
          out.metaSync = { eventId: String(r.eventId), startMs: Number(r.startMs), recurring: !!it.recurringEventId, colorId: c };
        }
      }
      if (it.recurringEventId || wasDone) return out; // repeating: the server re-copies; done: nothing visible changed
      const id = String(r.eventId) + '|' + startOf(it), u = Object.keys(URG_COLOR).find(k => URG_COLOR[k] === c) || '';
      const at = await patchCopy([id], e => {
        e.colorId = c; e.color = COLORS[c] || (calId === MAIN ? UNASSIGNED : e.color); e.done = false;
        if (calId === MAIN) { delete e.uc; if (u) e.urg = u; else delete e.urg; }
        return e;
      });
      return withCopy(out, at);
    },
    // Graphite = done; the color it had is kept in private tag fwPrev (Apps Script writes the same tag), "not done" puts it back.
    async setCalendarEventDone(calId, eventId, start, done) {
      calId = String(calId || MAIN);
      await writable(calId);
      const it = await find(calId, eventId, start), p = Object.assign({}, priv(it)), body = Object.assign({}, it);
      if (done) {
        const cur = String(it.colorId || '');
        if (cur !== '8') p[PREV_TAG] = cur || 'default';
        body.colorId = '8';
      } else {
        const prev = p[PREV_TAG];
        if (!prev) throw new Fallback('no saved color on the event (older Apps Script save)'); // Apps Script still has it in its properties
        if (prev === 'default') delete body.colorId; else body.colorId = prev !== '8' ? prev : '5';
        delete p[PREV_TAG];
      }
      body.extendedProperties = Object.assign({}, it.extendedProperties, { private: p });
      const res = (await ev.update({ calendarId: calId, eventId: it.id, requestBody: body })).data;
      const out = { done: !!done, color: String(res.colorId || '') };
      if (it.recurringEventId) return out;
      const id = String(eventId) + '|' + startOf(it);
      return withCopy(out, await intoCopy([id], await panel(res, calId, await oldEntry(id))));
    },
    /* Schedule… (Code.gs planSchedule): one event per Gantt task on the main calendar (reminders off, tag ganttTid);
       again = move that event (to r.date, or to the r.start / r.end slot). Its rows + Schedule link follow. */
    async planSchedule(req) {
      const r = req || {}, ref = String(r.ref || ''), slot = !!(r.start && r.end);
      const date = slot ? String(r.start).slice(0, 10) : String(r.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date');
      if (!/^tid:[\w-]{2,64}$/.test(ref)) throw new Error('Only Gantt tasks can be scheduled this way');
      const title = String(r.title || '').replace(/\s+/g, ' ').trim().slice(0, 300) || 'Task';
      const w = slot ? when({ title, allDay: !!r.allDay, start: r.start, end: r.end }) : null;
      if (!(await planOn())) throw new Fallback('plan not on the database');
      const lk = await db.doc(LINKS).get();
      if (!lk.exists) throw new Fallback('schedule links not on the database yet');
      let links = {}; try { links = JSON.parse(lk.data().v || '{}') || {}; } catch (e) { throw new Fallback('schedule links unreadable'); }
      const tid = ref.slice(4, 70), mine = await rowsWhere('ref', ref);
      const known = (mine.find(x => x.event) || {}).event || links[tid] || '';
      let it = null, p = linkParts(known);
      if (p) { try { it = await find(MAIN, p.eventId, p.startMs); } catch (e) { if (!/not found/i.test(e.message)) throw e; } }
      if (!it) {
        // Link lost (or a retry after a create that did go through): the task's own tagged event, newest first.
        const q = await ev.list({ calendarId: MAIN, privateExtendedProperty: TID_TAG + '=' + ref.slice(4), showDeleted: false, maxResults: 10 });
        it = (q.data.items || []).filter(i => i.status !== 'cancelled' && i.start && !i.recurrence).sort((a, b) => startOf(b) - startOf(a))[0] || null;
      }
      let res, moved = false, oldId = '';
      if (it && !it.recurringEventId && !it.recurrence) {
        oldId = (it.iCalUID || it.id + '@google.com') + '|' + startOf(it);
        res = (await ev.patch({ calendarId: MAIN, eventId: it.id, requestBody: w ? apiTimes(w) : shiftTo(it, date) })).data;
        moved = true;
      } else {
        const ww = w || { allDay: true, start: dayMs(date), end: dayMs(addDays(date, 1)) };
        res = (await ev.insert({ calendarId: MAIN, requestBody: Object.assign({ summary: title, reminders: { useDefault: false, overrides: [] },
          extendedProperties: { private: { [TID_TAG]: ref.slice(4) } } }, apiTimes(ww)) })).data;
      }
      const link = (await relink(res)).link;
      for (const x of mine) if (x.event !== link) await writeRow(x, { event: link });
      const out = await panel(res, MAIN, oldId ? await oldEntry(oldId) : null);
      return withCopy({ event: link, moved, date }, await intoCopy(oldId ? [oldId] : [], out));
    },
    // Move to date… for an event in the plan (Code.gs planMoveEvent): keeps the event id; rows + link follow.
    async planMoveEvent(req) {
      const r = req || {}, date = String(r.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date');
      if (!r.eventId) throw new Error('Missing event id');
      if (!(await planOn())) throw new Fallback('plan not on the database');
      const it = await find(MAIN, r.eventId, r.startMs), oldId = String(r.eventId) + '|' + startOf(it);
      const old = it.recurringEventId ? null : await oldEntry(oldId);
      const res = (await ev.patch({ calendarId: MAIN, eventId: it.id, requestBody: shiftTo(it, date) })).data;
      const rl = await relink(res), out = { event: rl.link, date };
      if (!rl.ok) Object.assign(out, { relink: true, calId: MAIN, eventId: res.iCalUID, startMs: startOf(res) });
      if (it.recurringEventId) return out; // repeating: the server re-copies
      return withCopy(out, await intoCopy([oldId], await panel(res, MAIN, old)));
    },
    // Backlog row dropped on a day / time, or ✕ (drop: event deleted) — Code.gs calBacklogPlace.
    async calBacklogPlace(req) {
      const r = req || {}, id = String(r.id || '');
      if (!id) throw new Error('Missing backlog id');
      const it = (await blItems()).find(x => x.id === id);
      if (!it) throw new Fallback('not on the open list');
      const pend = await blPending(id);
      if (pend) return { ok: true, already: pend };
      const x = await blPlace(r, it);
      await blTakeOut([id]);
      return withCopy(x.res, await intoCopyMany([x.copy]));
    },
    // Bulk send: {ok, done: [ids], failed: [{id, error}]} — one bad row doesn't stop the rest.
    async calBacklogPlaceMany(reqs) {
      const list = (Array.isArray(reqs) ? reqs : []).filter(r => r && r.id).slice(0, 100), items = await blItems();
      if (list.some(r => !items.find(x => x.id === String(r.id)))) throw new Fallback('not all on the open list');
      const done = [], failed = [], copy = [];
      let first = true;
      const one = async r => {
        const id = String(r.id);
        if (await blPending(id)) { done.push(id); return; }
        const x = await blPlace(r, items.find(y => y.id === id));
        done.push(id); copy.push(x.copy);
      };
      for (const r of list) {
        try { await one(r); } catch (e) {
          // Calendar not reachable at all on the first row → nothing changed yet: Apps Script does the batch.
          if (first && (Number(e.code) === 403 || Number(e.code) === 401)) throw e;
          failed.push({ id: String(r.id), error: String(e && e.message || e) });
        }
        first = false;
      }
      await blTakeOut(done);
      return withCopy({ ok: !failed.length, done, failed }, await intoCopyMany(copy));
    },
    /* ✓ Done · Archive ("[x] " + Graphite where it sits, Done Log row on the chosen day) or ✓ Done · Delete (event
       removed, nothing logged) — Code.gs calBacklogComplete. */
    async calBacklogComplete(req) {
      const r = req || {}, id = String(r.id || ''), mode = r.mode === 'delete' ? 'delete' : 'archive';
      if (!id) throw new Error('Missing backlog id');
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(r.day || '')) ? String(r.day) : ymd(Date.now());
      const it = (await blItems()).find(x => x.id === id);
      if (!it) throw new Fallback('not on the open list');
      const pend = await blPending(id);
      if (pend) return { ok: true, already: pend };
      const evId = blEvId(id), uid = blUid(id), title = String(it.title || '').replace(/^↪\s*/, '').trim() || '(no title)';
      let at = 0;
      if (mode === 'delete') {
        try { await ev.delete({ calendarId: MAIN, eventId: evId }); } catch (e) { if (!notFound(e)) throw e; }
        await blMark(id, 'deleted');
        at = await intoCopy(sameEvent(uid), null);
      } else {
        let res = null;
        try { res = (await ev.patch({ calendarId: MAIN, eventId: evId, requestBody: { summary: '[x] ' + title, colorId: '8' } })).data; }
        catch (e) { if (!notFound(e)) throw e; } // event gone → still logged
        await blMark(id, 'done', { day, title });
        if (res) at = await intoCopy(sameEvent(uid), await panel(res, MAIN, null));
      }
      await blTakeOut([id]);
      return withCopy(mode === 'delete' ? { ok: true, mode } : { ok: true, mode, day }, at);
    }
  };
  return { OPS, find, panel, when };
}

// calPanelDesc_ (same rules): the description as plain text, short enough for the copy.
export function plainDesc(d) {
  let t = String(d || '');
  if (!t) return '';
  t = t.replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, (m, u, x) => x && x !== u ? x + ' ' + u : u)
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > 700 ? t.slice(0, 700) + '…' : t;
}
