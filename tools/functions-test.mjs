// Cloud Function calendar edits (functions/cal-core.mjs, NOTES I): fake Calendar API + fake Firestore. No Google access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as core from '../functions/cal-core.mjs';

// Constants match the Apps Script side.
const code = fs.readFileSync('Code.gs', 'utf8');
assert.ok(code.includes("'" + core.MAIN + "'") && code.includes("'" + core.EVENTS_CAL + "'"), 'calendar ids = Code.gs EVENT_CALENDARS');
assert.ok(code.includes("const URG_EVENT_COLOR_ = { '1': '11', '2': '5', '3': '9' };"), 'urgency colors = Code.gs');
Object.entries(core.COLORS).forEach(([k, v]) => assert.ok(new RegExp("'" + k + "': '" + v + "'").test(code), 'color ' + k));
assert.ok(code.includes("const CAL_ORD_TAG = 'fwOrd'") && code.includes("const CAL_SCHED_TAG = 'fwSched'") && code.includes("const CAL_TID_TAG = 'fwTid', CAL_TT_TAG = 'fwTt';"), 'tag names');

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
      if (q.privateExtendedProperty) { const [k, v] = q.privateExtendedProperty.split('='); return { data: { items: Object.values(S.items).filter(i => i.cal === q.calendarId && ((i.extendedProperties || {}).private || {})[k] === v).map(i => JSON.parse(JSON.stringify(i))) } }; }
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
      if (!it) throw Object.assign(new Error('Not Found'), { code: 404 });
      // Google patch semantics: objects merge recursively (other tags kept), null removes, arrays / values replace.
      const merge = (dst, src) => { Object.keys(src).forEach(k => { const v = src[k];
        if (v === null) delete dst[k]; else if (typeof v === 'object' && !Array.isArray(v)) dst[k] = merge(Object.assign({}, dst[k]), v); else dst[k] = v; }); return dst; };
      merge(it, b);
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
  const cmp = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '<': (a, b) => a < b };
  const coll = (c, fs) => ({ where: (f, op, v) => coll(c, fs.concat([[f, op, v]])),
    get: async () => ({ docs: Object.keys(D).filter(k => k.startsWith(c + '/') && k.split('/').length === 2 && fs.every(([f, op, v]) => D[k][f] !== undefined && cmp[op](D[k][f], v)))
      .map(k => ({ id: k.split('/')[1], data: () => JSON.parse(JSON.stringify(D[k])) })) }) });
  return { D, collection: c => coll(c, []), doc: p => ({ get: async () => ({ exists: !!D[p], data: () => JSON.parse(JSON.stringify(D[p])) }),
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
  assert.equal(copyEv(db).filter(e => e.title === 'Trip').length, 1);
  const lk = await cal.OPS.calPanelCreateEvent({ title: 'Linked', allDay: false, start: '2026-11-25T09:00', end: '2026-11-25T10:00', tid: 't-12$3' });
  assert.equal(lk.tid, 't-123'); assert.equal(lk.tt, 'Linked'); assert.equal(Object.values(S.items).at(-1).extendedProperties.private.fwTid, 't-123'); assert.equal(copyEv(db, '2026-12').filter(e => e.title === 'Trip').length, 1, 'spans both months');
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

// ---- J: add all-day task, all-day order, linked rename, color (copy patched; urgency follows on main)
{
  const { S, db, cal } = setup();
  const t = await cal.OPS.addAllDayTask('2026-11-24', '  Buy  milk ');
  assert.equal(t.date, '2026-11-24'); assert.ok(t.id.endsWith('@google.com')); assert.ok(t.copyAt);
  const it0 = Object.values(S.items)[0]; assert.equal(it0.summary, 'Buy milk'); assert.equal(it0.end.date, '2026-11-25'); assert.deepEqual(it0.reminders.overrides, []);
  await assert.rejects(cal.OPS.addAllDayTask('nope', 'x'), /Invalid calendar date/);
  const a = await cal.OPS.calPanelCreateEvent({ title: 'A', allDay: true, start: '2026-11-25', end: '2026-11-26' });
  const b = await cal.OPS.calPanelCreateEvent({ title: 'B', allDay: true, start: '2026-11-25', end: '2026-11-26', tid: 'tk1' });
  const o = await cal.OPS.calPanelSetOrder([{ eventId: a.eventId, startMs: a.startMs, ord: 2 }, { eventId: b.eventId, startMs: b.startMs, ord: 1 }, { eventId: 'gone@google.com', startMs: a.startMs, ord: 3 }]);
  assert.deepEqual([o.ok, o.failed], [false, ['gone@google.com']]); assert.ok(o.copyAt);
  assert.deepEqual(copyEv(db).filter(e => e.title === 'A' || e.title === 'B').map(e => e.title + e.ord), ['A2', 'B1']);
  const rl = await cal.OPS.calRetitleLinked([{ eventId: b.eventId, startMs: b.startMs, title: 'B renamed' }]);
  assert.equal(rl.ok, true); const bi = Object.values(S.items).find(i => i.summary === 'B renamed');
  assert.equal(bi.extendedProperties.private.fwTt, 'B renamed'); assert.equal(bi.extendedProperties.private.fwTid, 'tk1', 'other tags kept');
  assert.equal(copyEv(db).find(e => e.id === b.id).tt, 'B renamed');
  // color on main: urgency follows (explicit, not uc); clearing the color clears it; metaSync for Apps Script
  let c = await cal.OPS.calPanelSetColor({ eventId: a.eventId, startMs: a.startMs, colorId: '11' });
  assert.equal(c.colorId, '11'); assert.deepEqual(c.metaSync, { eventId: a.eventId, startMs: a.startMs, recurring: false, colorId: '11' });
  let ce = copyEv(db).find(e => e.id === a.id); assert.deepEqual([ce.colorId, ce.urg, ce.uc], ['11', '1', undefined]);
  c = await cal.OPS.calPanelSetColor({ eventId: a.eventId, startMs: a.startMs, colorId: '' });
  ce = copyEv(db).find(e => e.id === a.id); assert.deepEqual([ce.colorId, ce.urg, ce.color], ['', undefined, core.UNASSIGNED]);
  assert.equal(Object.values(S.items).find(i => i.summary === 'A').colorId, undefined);
  await assert.rejects(cal.OPS.calPanelSetColor({ eventId: a.eventId, startMs: a.startMs, colorId: '8' }), /Mark done/);
  // done event: stays Graphite, the new color is saved for "not done"
  await cal.OPS.setCalendarEventDone(core.MAIN, a.eventId, a.startMs, true);
  await cal.OPS.calPanelSetColor({ eventId: a.eventId, startMs: a.startMs, colorId: '9' });
  const ai = Object.values(S.items).find(i => i.summary === 'A'); assert.equal(ai.colorId, '8'); assert.equal(ai.extendedProperties.private.fwPrev, '9');
  assert.equal((await cal.OPS.setCalendarEventDone(core.MAIN, a.eventId, a.startMs, false)).color, '9');
}
console.log('✓ functions J: add all-day task, all-day order, linked rename, color (urgency follows, done keeps Graphite)');

// ---- M: hold-menu fields in gantt/calMeta (transaction-free fake), urgency recolors, color updates the doc
{
  const { S, db, cal } = setup();
  const a = await cal.OPS.calPanelCreateEvent({ title: 'Essay', allDay: true, start: '2026-11-25', end: '2026-11-26' });
  // not seeded yet → Apps Script does it
  await assert.rejects(cal.OPS.setCalendarEventMeta(a.eventId, a.startMs, false, { urg: '1' }), e => e.fallback === true);
  const old = Date.now() - 90 * 864e5;
  db.D['gantt/calMeta'] = { v: JSON.stringify({ 'calMeta:stale@google.com': { s: old, urg: '2' } }), at: 1 };
  let r = await cal.OPS.setCalendarEventMeta(a.eventId, a.startMs, false, { urg: '1', due: '2026-11-30', dur: '45', cat: 'code', junk: 'x' });
  assert.deepEqual(Object.keys(r).filter(k => k !== 'copyAt').sort(), ['cat', 'due', 'dur', 'urg']); assert.ok(r.copyAt);
  let m = JSON.parse(db.D['gantt/calMeta'].v);
  assert.deepEqual(m['calMeta:' + a.eventId], { s: a.startMs, urg: '1', due: '2026-11-30', dur: '45', cat: 'code' });
  assert.equal(m['calMeta:stale@google.com'], undefined, 'older than 60 days dropped');
  const evA = () => Object.values(S.items).find(i => i.summary === 'Essay');
  assert.equal(evA().colorId, '11', 'urgency 1 → Tomato');
  let ce = copyEv(db).find(e => e.id === a.id); assert.deepEqual([ce.urg, ce.due, ce.dur, ce.cat, ce.uc, ce.colorId], ['1', '2026-11-30', '45', 'code', undefined, '11']);
  // same urgency, new due → no color call
  const n0 = S.calls.length; await cal.OPS.setCalendarEventMeta(a.eventId, a.startMs, false, { urg: '1', due: '2026-12-01' });
  assert.equal(S.calls.slice(n0).filter(c => c === 'update' || c === 'patch').length, 0);
  // done event: urgency change keeps Graphite, saves the color for "not done"
  await cal.OPS.setCalendarEventDone(core.MAIN, a.eventId, a.startMs, true);
  await cal.OPS.setCalendarEventMeta(a.eventId, a.startMs, false, { urg: '3' });
  assert.equal(evA().colorId, '8'); assert.equal(evA().extendedProperties.private.fwPrev, '9');
  await cal.OPS.setCalendarEventDone(core.MAIN, a.eventId, a.startMs, false); assert.equal(evA().colorId, '9');
  // cleared → entry removed, color cleared, copy has no urgency
  await cal.OPS.setCalendarEventMeta(a.eventId, a.startMs, false, {});
  m = JSON.parse(db.D['gantt/calMeta'].v); assert.equal(m['calMeta:' + a.eventId], undefined); assert.equal(evA().colorId, undefined);
  ce = copyEv(db).find(e => e.id === a.id); assert.equal(ce.urg, undefined);
  // repeating: key per occurrence
  const rs = Date.now() + 864e5;
  await cal.OPS.setCalendarEventMeta('r9@google.com', rs, true, { cat: 'home' }, 'other@cal');
  assert.deepEqual(JSON.parse(db.D['gantt/calMeta'].v)['calMeta:r9@google.com:' + rs], { s: rs, cat: 'home' });
  // color on main now updates the doc itself (no background call)
  const c = await cal.OPS.calPanelSetColor({ eventId: a.eventId, startMs: a.startMs, colorId: '5' });
  assert.equal(c.metaSync, undefined); assert.equal(JSON.parse(db.D['gantt/calMeta'].v)['calMeta:' + a.eventId].urg, '2');
}
console.log('✓ functions M: hold-menu fields on the database (save, prune, urgency recolor, done keeps Graphite, clear, repeating key, color updates it, not seeded → Apps Script)');

// ---- P: Schedule / Move to date (Plan rows + links follow), Backlog place / drop / bulk / complete
{
  const { S, db, cal } = setup();
  // not on the database yet → Apps Script
  await assert.rejects(cal.OPS.planSchedule({ ref: 'tid:t1', title: 'Essay', date: '2026-11-25' }), e => e.fallback === true);
  db.D['gantt/planMeta'] = { seeded: 1 };
  await assert.rejects(cal.OPS.planSchedule({ ref: 'tid:t1', title: 'Essay', date: '2026-11-25' }), e => e.fallback === true, 'links doc missing');
  db.D['gantt/planLinks'] = { v: '{}', at: 1 };
  db.D['ganttPlan/p1'] = { id: 'p1', group: 'big', ref: 'tid:t1', title: 'Essay', event: '', rank: 1, del: 0, at: 5 };
  db.D['ganttPlan/p2'] = { id: 'p2', group: 'next', ref: 'tid:t1', title: 'Essay', event: '', rank: 1, del: 1, at: 5 };
  await assert.rejects(cal.OPS.planSchedule({ ref: 'card:x', date: '2026-11-25' }), /Only Gantt tasks/);
  await assert.rejects(cal.OPS.planSchedule({ ref: 'tid:t1' }), /Pick a date/);
  let r = await cal.OPS.planSchedule({ ref: 'tid:t1', title: ' Essay ', date: '2026-11-25' });
  const e1 = Object.values(S.items)[0];
  assert.deepEqual([e1.summary, e1.start.date, e1.end.date, e1.extendedProperties.private.ganttTid], ['Essay', '2026-11-25', '2026-11-26', 't1']);
  assert.deepEqual(e1.reminders, { useDefault: false, overrides: [] });
  assert.equal(r.event, e1.iCalUID + '@' + core.dayMs('2026-11-25')); assert.equal(r.moved, false); assert.ok(r.copyAt);
  assert.equal(db.D['ganttPlan/p1'].event, r.event); assert.equal(db.D['ganttPlan/p1'].dev, 'fn'); assert.ok(db.D['ganttPlan/p1'].at > 5);
  assert.equal(db.D['ganttPlan/p2'].event, '', 'removed row left alone');
  assert.equal(JSON.parse(db.D['gantt/planLinks'].v).t1, r.event);
  assert.equal(copyEv(db).filter(e => e.title === 'Essay').length, 1);
  // again → the same event moves (no second one); a slot makes it timed
  r = await cal.OPS.planSchedule({ ref: 'tid:t1', title: 'Essay', start: '2026-11-27T14:00', end: '2026-11-27T15:00', allDay: false });
  assert.equal(r.moved, true); assert.equal(Object.keys(S.items).length, 1); assert.equal(Object.values(S.items)[0].start.date, undefined);
  assert.equal(db.D['ganttPlan/p1'].event, e1.iCalUID + '@' + core.wallMs(2026, 11, 27, 14, 0));
  assert.deepEqual(copyEv(db).filter(e => e.title === 'Essay').map(e => e.start), ['2026-11-27T14:00:00-08:00'], 'old spot gone');
  // link lost (no row, empty links doc) → its tagged event is found, not a second one
  db.D['ganttPlan/p1'].event = ''; db.D['gantt/planLinks'].v = '{}';
  r = await cal.OPS.planSchedule({ ref: 'tid:t1', title: 'Essay', date: '2026-11-28' });
  assert.equal(r.moved, true); assert.equal(Object.keys(S.items).length, 1);
  assert.equal(Object.values(S.items)[0].start.dateTime, new Date(core.wallMs(2026, 11, 28, 14, 0)).toISOString(), 'timed keeps its clock time');
  // Move to date: all-day keeps its length; rows pointing at it follow; across DST the clock time stays
  const t = await cal.OPS.calPanelCreateEvent({ title: 'Trip', allDay: true, start: '2026-11-24', end: '2026-11-26' });
  db.D['ganttPlan/p3'] = { id: 'p3', group: 'next', ref: 'cal:x', title: 'Trip', event: t.eventId + '@' + t.startMs, rank: 2, del: 0, at: 1 };
  r = await cal.OPS.planMoveEvent({ eventId: t.eventId, startMs: t.startMs, date: '2026-12-03' });
  const ti = Object.values(S.items).find(i => i.summary === 'Trip');
  assert.deepEqual([ti.start.date, ti.end.date], ['2026-12-03', '2026-12-05']);
  assert.equal(db.D['ganttPlan/p3'].event, r.event); assert.equal(r.event, t.eventId + '@' + core.dayMs('2026-12-03')); assert.equal(r.relink, undefined);
  assert.deepEqual(copyEv(db, '2026-12').filter(e => e.title === 'Trip').length, 1); assert.equal(copyEv(db).filter(e => e.title === 'Trip').length, 0);
  const d = await cal.OPS.calPanelCreateEvent({ title: 'Call', allDay: false, start: '2026-10-30T09:00', end: '2026-10-30T09:30' });
  await cal.OPS.planMoveEvent({ eventId: d.eventId, startMs: d.startMs, date: '2026-11-02' });
  assert.equal(Object.values(S.items).find(i => i.summary === 'Call').start.dateTime, new Date(core.wallMs(2026, 11, 2, 9, 0)).toISOString());
  // a calendar-panel move of a main event relinks here now (no background Apps Script call)
  const mv = await cal.OPS.calPanelMoveEvent({ eventId: t.eventId, startMs: core.dayMs('2026-12-03'), allDay: true, start: '2026-12-07', end: '2026-12-08' });
  assert.equal(mv.relink, undefined); assert.equal(db.D['ganttPlan/p3'].event, t.eventId + '@' + core.dayMs('2026-12-07'));
}
{
  const { S, db, cal } = setup();
  const mk = async (title, day, color) => { const x = await cal.OPS.calPanelCreateEvent({ title, allDay: true, start: day, end: core.addDays(day, 1) }); if (color) Object.values(S.items).find(i => i.summary === title).colorId = color; return x; };
  const a = await mk('Old A', '2026-11-20', '11'), b = await mk('Old B', '2026-11-21', '3'), c = await mk('Old C', '2026-11-21'), z = await mk('Old Z', '2026-11-19');
  const row = (x, day, colorId) => ({ id: x.eventId + '|' + day, date: day, title: x.title, colorId: colorId || '', urg: '' });
  const items = [row(a, '2026-11-20', '11'), row(b, '2026-11-21', '3'), row(c, '2026-11-21'), row(z, '2026-11-19')];
  // no published list → Apps Script; stale list → Apps Script
  await assert.rejects(cal.OPS.calBacklogPlace({ id: items[0].id, allDay: true, start: '2026-11-25', end: '2026-11-26' }), e => e.fallback === true);
  db.D['gantt/calBacklog'] = { items: JSON.stringify(items), at: Date.now() - 30 * 60000 };
  await assert.rejects(cal.OPS.calBacklogPlace({ id: items[0].id, allDay: true, start: '2026-11-25', end: '2026-11-26' }), e => e.fallback === true);
  db.D['gantt/calBacklog'].at = Date.now();
  await assert.rejects(cal.OPS.calBacklogPlace({ id: 'nope|2026-11-01', allDay: true, start: '2026-11-25', end: '2026-11-26' }), e => e.fallback === true, 'not listed → Apps Script answers');
  // place on a day: moved, color kept, bottom order, op left for Apps Script, row off the list, copy moved
  let r = await cal.OPS.calBacklogPlace({ id: items[0].id, allDay: true, start: '2026-11-25', end: '2026-11-26', ord: 42 });
  const ea = Object.values(S.items).find(i => i.summary === 'Old A');
  assert.deepEqual([ea.start.date, ea.colorId, ea.extendedProperties.private.fwOrd], ['2026-11-25', '11', '42']); assert.ok(r.copyAt);
  const ops = () => Object.keys(db.D).filter(k => k.startsWith('ganttBacklogOps/')).map(k => db.D[k]);
  assert.deepEqual(ops().map(o => [o.id, o.v]), [[items[0].id, '2026-11-25']]);
  assert.equal(JSON.parse(db.D['gantt/calBacklog'].items).length, 3); assert.ok(db.D['gantt/calBacklog'].fnAt);
  assert.deepEqual(copyEv(db).filter(e => e.title === 'Old A').map(e => e.start), ['2026-11-25']);
  // double tap after the list was republished stale-free → already
  db.D['gantt/calBacklog'].items = JSON.stringify(items);
  assert.equal((await cal.OPS.calBacklogPlace({ id: items[0].id, allDay: true, start: '2026-11-26', end: '2026-11-27' })).already, '2026-11-25');
  // bulk: B (old Grape) to a time, C to a day; Grape not kept
  r = await cal.OPS.calBacklogPlaceMany([{ id: items[1].id, allDay: false, start: '2026-11-25T10:00', end: '2026-11-25T10:30' }, { id: items[2].id, allDay: true, start: '2026-11-25', end: '2026-11-26' }]);
  assert.deepEqual([r.ok, r.done.length, r.failed.length], [true, 2, 0]);
  const eb = Object.values(S.items).find(i => i.summary === 'Old B');
  assert.equal(eb.colorId, undefined); assert.equal(eb.start.dateTime, new Date(core.wallMs(2026, 11, 25, 10, 0)).toISOString());
  assert.equal(ops().find(o => o.id === items[1].id).v, '2026-11-25');
  // event deleted meanwhile → a fresh one
  delete S.items[core.MAIN + '/' + c.eventId.replace('@google.com', '')];
  for (const k of Object.keys(db.D)) if (k.startsWith('ganttBacklogOps/')) delete db.D[k];
  db.D['gantt/calBacklog'].items = JSON.stringify(items);
  r = await cal.OPS.calBacklogPlace({ id: items[2].id, allDay: true, start: '2026-11-29', end: '2026-11-30' });
  assert.ok(r.event && r.event.title === 'Old C'); assert.equal(Object.values(S.items).filter(i => i.summary === 'Old C').length, 1);
  // complete · archive: marked done in place, Done Log row waits in the op; ✕ drop deletes the event
  for (const k of Object.keys(db.D)) if (k.startsWith('ganttBacklogOps/')) delete db.D[k];
  r = await cal.OPS.calBacklogComplete({ id: items[3].id, mode: 'archive', day: '2026-11-23' });
  const ez = Object.values(S.items).find(i => i.summary === '[x] Old Z');
  assert.deepEqual([ez.colorId, ez.start.date], ['8', '2026-11-19']); assert.deepEqual([r.mode, r.day], ['archive', '2026-11-23']);
  assert.deepEqual(ops().map(o => [o.v, o.logDay, o.logTitle]), [['done', '2026-11-23', 'Old Z']]);
  assert.equal(copyEv(db).find(e => e.eventId === z.eventId).done, true);
  for (const k of Object.keys(db.D)) if (k.startsWith('ganttBacklogOps/')) delete db.D[k];
  db.D['gantt/calBacklog'].items = JSON.stringify(items); // republished by Apps Script
  await cal.OPS.calBacklogPlace({ id: items[3].id, drop: true });
  assert.equal(Object.values(S.items).filter(i => /Old Z/.test(i.summary)).length, 0); assert.equal(ops()[0].v, 'dropped');
  assert.equal(copyEv(db).filter(e => e.eventId === z.eventId).length, 0);
  for (const k of Object.keys(db.D)) if (k.startsWith('ganttBacklogOps/')) delete db.D[k];
  r = await cal.OPS.calBacklogComplete({ id: items[0].id, mode: 'delete' });
  assert.deepEqual([r.mode, ops()[0].v, ops()[0].logDay], ['delete', 'deleted', undefined]);
}
console.log('✓ functions P: Schedule (create, again = move, slot, lost link finds the tagged event), Move to date (length / clock time kept), rows + links follow, Backlog place / bulk / fresh / done / drop / delete');
