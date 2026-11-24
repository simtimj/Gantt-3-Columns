// Cloud Function calendar edits (functions/cal-core.mjs, NOTES I): fake Calendar API + fake Firestore. No Google access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as core from '../functions/cal-core.mjs';

// Constants match the Apps Script side.
const code = fs.readFileSync('Code.gs', 'utf8');
assert.ok(code.includes("'" + core.MAIN + "'") && code.includes("'" + core.EVENTS_CAL + "'"), 'calendar ids = Code.gs EVENT_CALENDARS');
assert.ok(code.includes("const URG_EVENT_COLOR_ = { '1': '11', '2': '5', '3': '9' };"), 'urgency colors = Code.gs');
Object.entries(core.COLORS).forEach(([k, v]) => assert.ok(new RegExp("'" + k + "': '" + v + "'").test(code), 'color ' + k));
assert.ok(code.includes("const CAL_ORD_TAG = 'fwOrd'") && code.includes("const CAL_SCHED_TAG = 'fwSched'"), 'tag names');

// Time zone: wall time ↔ ms, across DST.
assert.equal(core.isoLocal(core.wallMs(2026, 11, 24, 9, 30)), '2026-11-24T09:30:00-08:00');
assert.equal(core.isoLocal(core.wallMs(2026, 7, 4, 18, 0)), '2026-07-04T18:00:00-07:00');
assert.equal(core.ymd(core.dayMs('2026-03-08')), '2026-03-08'); // DST starts
assert.equal(core.dayMs('2026-11-01'), Date.parse('2026-11-01T07:00:00Z')); // DST ends that day: midnight is still PDT
assert.equal(core.plainDesc('<p>Hi&amp;bye</p><br><a href="https://x.y">link</a>'), 'Hi&bye\n\nlink https://x.y');

// ---- fakes
function fakeCal() {
  const S = { items: {}, n: 0, calls: [] };
  const key = (c, id) => c + '/' + id;
  const st = i => core.startOf(i);
  const events = {
    async list(q) {
      S.calls.push('list');
      const lo = Date.parse(q.timeMin), hi = Date.parse(q.timeMax);
      return { data: { items: Object.values(S.items).filter(i => i.cal === q.calendarId && i.iCalUID === q.iCalUID && st(i) >= lo && st(i) < hi).map(i => JSON.parse(JSON.stringify(i))) } };
    },
    async get(q) { return { data: JSON.parse(JSON.stringify(S.items[key(q.calendarId, q.eventId)])) }; },
    async insert(q) {
      S.calls.push('insert');
      const id = 'e' + (++S.n), it = Object.assign({}, q.requestBody, { id, iCalUID: id + '@google.com', cal: q.calendarId, htmlLink: 'https://cal/' + id, status: 'confirmed' });
      S.items[key(q.calendarId, id)] = it; return { data: JSON.parse(JSON.stringify(it)) };
    },
    async patch(q) {
      S.calls.push('patch');
      const it = S.items[key(q.calendarId, q.eventId)], b = q.requestBody;
      Object.keys(b).forEach(k => { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { it[k] = Object.assign({}, it[k], b[k]); Object.keys(it[k]).forEach(x => { if (it[k][x] === null) delete it[k][x]; }); } else if (b[k] === null) delete it[k]; else it[k] = b[k]; });
      return { data: JSON.parse(JSON.stringify(it)) };
    },
    async update(q) {
      S.calls.push('update');
      const it = Object.assign({}, q.requestBody, { cal: q.calendarId }); S.items[key(q.calendarId, q.eventId)] = it;
      return { data: JSON.parse(JSON.stringify(it)) };
    },
    async delete(q) { S.calls.push('delete'); delete S.items[key(q.calendarId, q.eventId)]; return { data: {} }; }
  };
  return { S, api: { events } };
}
function fakeDb(docs) {
  const D = docs || {};
  return { D, doc: p => ({ get: async () => ({ exists: !!D[p], data: () => JSON.parse(JSON.stringify(D[p])) }),
    set: async (v, o) => { D[p] = o && o.merge ? Object.assign({}, D[p], v) : v; } }) };
}
const month = '2026-11';
function setup(extraEv) {
  const { S, api } = fakeCal();
  const db = fakeDb({ 'ganttCal/meta': { v: 1, months: JSON.stringify([month, '2026-12']), cals: JSON.stringify([{ id: core.MAIN, name: 'Julius', color: '#039be5' }]), main: core.MAIN, at: 1 },
    ['ganttCal/' + month]: { ev: JSON.stringify(extraEv || []) }, 'ganttCal/2026-12': { ev: '[]' } });
  return { S, api, db, cal: core.makeCal(api, db) };
}
const copyEv = (db, m) => JSON.parse(db.D['ganttCal/' + (m || month)].ev);

// ---- create: reminders off, all-day order tag, copy updated, opId = no second event
{
  const { S, db, cal } = setup();
  const r = await cal.OPS.calPanelCreateEvent({ title: '  Dentist  ', allDay: false, start: '2026-11-24T09:00', end: '2026-11-24T10:30', opId: 'op1' });
  assert.equal(r.title, 'Dentist'); assert.equal(r.start, '2026-11-24T09:00:00-08:00'); assert.equal(r.end, '2026-11-24T10:30:00-08:00');
  assert.equal(r.cal, 'Julius'); assert.equal(r.color, core.UNASSIGNED); assert.equal(r.editable, true); assert.ok(r.copyAt);
  const it = Object.values(S.items)[0];
  assert.deepEqual(it.reminders, { useDefault: false, overrides: [] });
  assert.equal(copyEv(db).length, 1); assert.equal(copyEv(db)[0].id, r.id); assert.equal(db.D['ganttCal/meta'].at, r.copyAt);
  const again = await cal.OPS.calPanelCreateEvent({ title: 'Dentist', allDay: false, start: '2026-11-24T09:00', end: '2026-11-24T10:30', opId: 'op1' });
  assert.equal(again.repeat, true); assert.equal(again.eventId, r.eventId); assert.equal(S.calls.filter(c => c === 'insert').length, 1);
  const ad = await cal.OPS.calPanelCreateEvent({ title: 'Trip', allDay: true, start: '2026-11-29', end: '2026-12-02', ord: 7 });
  assert.equal(ad.ord, 7); assert.equal(ad.allDay, true); assert.equal(ad.end, '2026-12-02');
  assert.equal(copyEv(db).filter(e => e.title === 'Trip').length, 1); assert.equal(copyEv(db, '2026-12').filter(e => e.title === 'Trip').length, 1, 'spans both months');
  await assert.rejects(cal.OPS.calPanelCreateEvent({ title: '', allDay: true, start: '2026-11-29', end: '2026-11-30' }), /Title is empty/);
  await assert.rejects(cal.OPS.calPanelCreateEvent({ title: 'x', calId: 'other@cal' , allDay: true, start: '2026-11-29', end: '2026-11-30' }), e => e.fallback === true);
}
// ---- move: all-day → timed tags Scheduled, back to all-day drops it + bottom order; saved meta carried; done refused
{
  const { S, db, cal } = setup();
  const a = await cal.OPS.calPanelCreateEvent({ title: 'Walk', allDay: true, start: '2026-11-24', end: '2026-11-25' });
  // the copy carries saved meta (urgency from the hold menu, due, minutes)
  const ce = copyEv(db); Object.assign(ce.find(e => e.id === a.id), { urg: '2', due: '2026-11-30', dur: '30', cat: 'code' }); db.D['ganttCal/' + month].ev = JSON.stringify(ce);
  const t = await cal.OPS.calPanelMoveEvent({ eventId: a.eventId, startMs: a.startMs, allDay: false, start: '2026-11-24T14:00', end: '2026-11-24T14:30' });
  assert.equal(t.sched, true); assert.equal(t.start, '2026-11-24T14:00:00-08:00'); assert.equal(t.urg, '2'); assert.equal(t.due, '2026-11-30'); assert.equal(t.relink, true);
  assert.deepEqual(copyEv(db).map(e => e.id), [t.id], 'old spot gone, new spot in');
  const back = await cal.OPS.calPanelMoveEvent({ eventId: t.eventId, startMs: t.startMs, allDay: true, start: '2026-11-25', end: '2026-11-26' });
  assert.equal(back.sched, false); assert.ok(back.ord > 0);
  const it = Object.values(S.items)[0];
  assert.equal(it.extendedProperties.private.fwSched, undefined, 'Scheduled tag really removed');
  await cal.OPS.setCalendarEventDone(core.MAIN, back.eventId, back.startMs, true);
  await assert.rejects(cal.OPS.calPanelMoveEvent({ eventId: back.eventId, startMs: back.startMs, allDay: true, start: '2026-11-27', end: '2026-11-28' }), /Done events stay/);
}
// ---- done / not done: color kept in fwPrev; color-urgency follows; no tag (older save) → Apps Script
{
  const { S, db, cal } = setup();
  const a = await cal.OPS.calPanelCreateEvent({ title: 'Task', allDay: true, start: '2026-11-24', end: '2026-11-25' });
  Object.values(S.items)[0].colorId = '11';
  let d = await cal.OPS.setCalendarEventDone(core.MAIN, a.eventId, a.startMs, true);
  assert.deepEqual([d.done, d.color], [true, '8']); assert.equal(Object.values(S.items)[0].extendedProperties.private.fwPrev, '11');
  assert.equal(copyEv(db)[0].done, true);
  d = await cal.OPS.setCalendarEventDone(core.MAIN, a.eventId, a.startMs, false);
  assert.equal(d.color, '11'); assert.equal(Object.values(S.items)[0].extendedProperties.private.fwPrev, undefined);
  const c = copyEv(db)[0]; assert.equal(c.urg, '1'); assert.equal(c.uc, 1);
  delete Object.values(S.items)[0].extendedProperties.private.fwPrev; Object.values(S.items)[0].colorId = '8';
  await assert.rejects(cal.OPS.setCalendarEventDone(core.MAIN, a.eventId, a.startMs, false), e => e.fallback === true);
  // default color: done then not done clears the color
  const b = await cal.OPS.calPanelCreateEvent({ title: 'Plain', allDay: true, start: '2026-11-26', end: '2026-11-27' });
  await cal.OPS.setCalendarEventDone(core.MAIN, b.eventId, b.startMs, true);
  d = await cal.OPS.setCalendarEventDone(core.MAIN, b.eventId, b.startMs, false); assert.equal(d.color, '');
}
// ---- update, title, duplicate (done copy starts in its old color), delete (gone = ok)
{
  const { S, db, cal } = setup();
  const a = await cal.OPS.calPanelCreateEvent({ title: 'Call', allDay: false, start: '2026-11-24T09:00', end: '2026-11-24T09:30' });
  const u = await cal.OPS.calPanelUpdateEvent({ eventId: a.eventId, startMs: a.startMs, title: 'Call Mom', allDay: false, start: '2026-11-24T10:00', end: '2026-11-24T10:30' });
  assert.equal(u.title, 'Call Mom'); assert.equal(u.start, '2026-11-24T10:00:00-08:00'); assert.deepEqual(copyEv(db).map(e => e.title), ['Call Mom']);
  const t = await cal.OPS.setCalendarEventTitle(core.MAIN, u.eventId, u.startMs, ' Call Dad ');
  assert.equal(t.title, 'Call Dad'); assert.deepEqual(copyEv(db).map(e => e.title), ['Call Dad']);
  Object.values(S.items)[0].colorId = '9';
  await cal.OPS.setCalendarEventDone(core.MAIN, u.eventId, u.startMs, true);
  const dup = await cal.OPS.calPanelDuplicateEvent({ eventId: u.eventId, startMs: u.startMs });
  assert.equal(dup.colorId, '9'); assert.notEqual(dup.eventId, u.eventId); assert.equal(copyEv(db).length, 2);
  assert.deepEqual(await cal.OPS.calPanelDeleteEvent({ eventId: dup.eventId, startMs: dup.startMs }).then(r => Object.keys(r).sort()), ['copyAt', 'ok']);
  assert.equal(copyEv(db).length, 1);
  assert.deepEqual(await cal.OPS.calPanelDeleteEvent({ eventId: dup.eventId, startMs: dup.startMs }), { ok: true, gone: true });
}
// ---- repeating: one day = that instance, all = the series shifted; copy left to the server's re-copy
{
  const { S, db, cal } = setup();
  const t0 = core.wallMs(2026, 11, 24, 9, 0);
  S.items['juliussimtim@gmail.com/m1'] = { id: 'm1', iCalUID: 'r1@google.com', cal: core.MAIN, summary: 'Standup', start: { dateTime: new Date(core.wallMs(2026, 11, 2, 9, 0)).toISOString(), timeZone: core.TZ }, end: { dateTime: new Date(core.wallMs(2026, 11, 2, 9, 15)).toISOString(), timeZone: core.TZ } };
  S.items['juliussimtim@gmail.com/m1_i'] = { id: 'm1_i', iCalUID: 'r1@google.com', recurringEventId: 'm1', cal: core.MAIN, summary: 'Standup', start: { dateTime: new Date(t0).toISOString() }, end: { dateTime: new Date(t0 + 15 * 60000).toISOString() } };
  let r = await cal.OPS.calPanelMoveEvent({ eventId: 'r1@google.com', startMs: t0, allDay: false, start: '2026-11-24T10:00', end: '2026-11-24T10:15', scope: 'one' });
  assert.deepEqual(r, { eventId: 'r1@google.com', refetch: true }); assert.equal(Date.parse(S.items['juliussimtim@gmail.com/m1_i'].start.dateTime), core.wallMs(2026, 11, 24, 10, 0));
  const t1 = core.wallMs(2026, 11, 24, 10, 0);
  r = await cal.OPS.calPanelMoveEvent({ eventId: 'r1@google.com', startMs: t1, allDay: false, start: '2026-11-24T11:00', end: '2026-11-24T11:15', scope: 'all' });
  assert.equal(Date.parse(S.items['juliussimtim@gmail.com/m1'].start.dateTime), core.wallMs(2026, 11, 2, 10, 0), 'series shifted by one hour');
  assert.equal(db.D['ganttCal/meta'].at, 1, 'repeating edits leave the copy to the server');
}
console.log('✓ functions: calendar edits on Cloud Functions (constants = Apps Script, LA time + DST, create + opId, move tags + meta, done / not done via fwPrev, update / title / duplicate / delete, repeating one / all, copy kept in step, fallbacks)');
