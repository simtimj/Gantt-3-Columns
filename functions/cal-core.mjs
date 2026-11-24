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
  async function intoCopy(dropIds, entry) {
    const m = await copyMeta();
    if (!m) return 0;
    const now = Date.now(), months = list(m.months);
    const touch = months.filter(mo => entry && String(entry.start).slice(0, 7) <= mo && String(entry.end).slice(0, 7) >= mo);
    for (const mo of months) {
      const ref = db.doc('ganttCal/' + mo), s = await ref.get();
      if (!s.exists) continue;
      const evs = list(s.data().ev), kept = evs.filter(e => dropIds.indexOf(e.id) < 0);
      if (touch.indexOf(mo) >= 0) kept.push(entry);
      if (kept.length === evs.length && touch.indexOf(mo) < 0) continue;
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
      return withCopy(Object.assign(out, { relink: true }), await intoCopy([String(req.eventId) + '|' + startOf(it)], out));
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
      return withCopy(Object.assign(out, { relink: true }), await intoCopy([String(r.eventId) + '|' + startOf(it)], out));
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
      if (calId === MAIN) out.metaSync = { eventId: String(r.eventId), startMs: Number(r.startMs), recurring: !!it.recurringEventId, colorId: c };
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
