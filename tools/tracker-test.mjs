// Time Tracker core tests (2026-11-05): node tools/tracker-test.mjs
// Loads the <script> from tracker/Core.html and checks timer transitions, comma parsing, overlaps,
// recurrence, reconciliation and sync merges with a fake clock. Runs in Pacific time like Julius's phone.
process.env.TZ = process.env.TZ || 'America/Los_Angeles';
import fs from 'fs';
const src = fs.readFileSync(new URL('../tracker/Core.html', import.meta.url), 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const TT = new Function('module', src + '\nreturn TT;')(undefined);

let fails = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fails++; console.error('✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const M = 60000;
const T0 = new Date(2026, 10, 5, 9, 0).getTime(); // Thu 2026-11-05 09:00 local
function mk() { let t = T0; const s = new TT.Store({ now: () => t }); s.tick = m => (t += m * M); s.at = () => t; TT.ensureDefaults(s); return s; }

// Comma parsing
eq(TT.parseItems('sweep leaves, wash truck, clean garage'), ['sweep leaves', 'wash truck', 'clean garage'], 'three items');
eq(TT.parseItems('buy "nuts, bolts", glue'), ['buy nuts, bolts', 'glue'], 'quoted comma kept');
eq(TT.parseItems('“a, b”, c'), ['a, b', 'c'], 'curly quotes');
eq(TT.parseItems(' a ,, b ,'), ['a', 'b'], 'empties dropped');
eq(TT.parseItems("don't stop, go"), ["don't stop", 'go'], 'apostrophe is not a quote');
eq([TT.parseDuration('1h30'), TT.parseDuration('90'), TT.parseDuration('1:30'), TT.parseDuration('45m'), TT.parseDuration('1.5h'), TT.parseDuration('2 h 5 min'), TT.parseDuration('x')],
  [90, 90, 90, 45, 90, 125, null], 'durations');
eq([TT.parseClock('14:05'), TT.parseClock('2:05pm'), TT.parseClock('12am'), TT.parseClock('9'), TT.parseClock('25:00')], [845, 845, 0, 540, null], 'clock times');

// Tap a block -> timer starts; double tap does not restart
{
  const s = mk();
  const b = TT.addBlock(s, { title: 'Chores' });
  const e = TT.startBlock(s, b.id);
  s.tick(1);
  ok(TT.startBlock(s, b.id).id === e.id, 'second tap keeps the same running entry');
  s.tick(9);
  eq(TT.blockTotals(s, b.id).total, 10 * M, 'elapsed derived from timestamps');
}
// Lock screen: elapsed is now - start, so a "sleeping" page still shows the right time
{
  const s = mk(); const b = TT.addBlock(s, { title: 'Study' }); TT.startBlock(s, b.id);
  s.tick(180);
  eq(TT.blockTotals(s, b.id).total, 180 * M, '3 hours later from persisted start');
  const s2 = new TT.Store({ now: s.now }).load(JSON.parse(JSON.stringify(s.toJSON())));
  eq(TT.blockTotals(s2, b.id).total, 180 * M, 'survives reload (serialize/deserialize)');
  ok(!!TT.longRunning(s2, s.at()), 'long-running timer flagged');
  TT.stopAt(s2, T0 + 60 * M);
  eq(TT.blockTotals(s2, b.id).total, 60 * M, 'stop at an earlier time corrects it');
  ok(!TT.running(s2), 'nothing running after correction');
}
// Switch blocks -> no overlap
{
  const s = mk(); const a = TT.addBlock(s, { title: 'A' }), b = TT.addBlock(s, { title: 'B' });
  TT.startBlock(s, a.id); s.tick(10); TT.startBlock(s, b.id); s.tick(5);
  eq(TT.openEntries(s).length, 1, 'one open entry');
  eq([TT.blockTotals(s, a.id).total, TT.blockTotals(s, b.id).total], [10 * M, 5 * M], 'A stopped at switch');
  const d = TT.daySummary(s, '2026-11-05');
  eq(d.overlap, 0, 'no double counting');
}
// Items: start, complete, next item, pause, resume
{
  const s = mk(); const b = TT.addBlock(s, { title: 'Yard' });
  const [x, y, z] = TT.addItems(s, b.id, 'sweep leaves, wash truck, clean garage');
  eq(TT.itemsOf(s, b.id).map(i => i.title), ['sweep leaves', 'wash truck', 'clean garage'], 'items in order');
  TT.startBlock(s, b.id); s.tick(2);               // 2 unassigned
  TT.startItem(s, x.id); s.tick(10);               // 10 on x
  TT.startItem(s, y.id); s.tick(5);                // starting next item stops x
  TT.completeItem(s, y.id); s.tick(3);             // completing stops y, block keeps going (3 unassigned)
  ok(s.get(y.id).done && s.get(y.id).doneAt === T0 + 17 * M, 'completion recorded with time');
  ok(TT.running(s) && TT.running(s).blockId === b.id && !TT.running(s).itemId, 'block still running, unassigned');
  TT.startItem(s, z.id); s.tick(4);
  TT.pause(s);                                     // pausing the block pauses the item
  ok(!TT.running(s), 'pause stops everything');
  s.tick(30);
  TT.startBlock(s, b.id); s.tick(1);               // resume brings the item back
  eq(TT.running(s).itemId, z.id, 'resume continues the paused item');
  const t = TT.blockTotals(s, b.id);
  eq([t.total, t.unassigned, t.items[x.id], t.items[y.id], t.items[z.id]], [25 * M, 5 * M, 10 * M, 5 * M, 5 * M], 'block and item totals');
  TT.completeItem(s, x.id);
  ok(s.get(x.id).done, 'quick complete without item timer');
  TT.stop(s);
  ok(!s.get(b.id).activeItemId, 'stop clears the active item');
}
// Switching blocks pauses the prior block and its item
{
  const s = mk(); const a = TT.addBlock(s, { title: 'A', items: 'a1' }), b = TT.addBlock(s, { title: 'B' });
  const a1 = TT.itemsOf(s, a.id)[0];
  TT.startItem(s, a1.id); s.tick(5); TT.startBlock(s, b.id); s.tick(5);
  eq(TT.blockTotals(s, a.id).items[a1.id], 5 * M, 'item stopped when switching');
  TT.startBlock(s, a.id);
  eq(TT.running(s).itemId, a1.id, 'switching back resumes the item');
}
// Break is counted as break, not work
{
  const s = mk(); const b = TT.addBlock(s, { title: 'Code', catId: 'cat-coding', items: 'fix bug, Break' });
  const [bug, brk] = TT.itemsOf(s, b.id);
  ok(brk.isBreak && !bug.isBreak, 'Break item detected');
  TT.startItem(s, bug.id); s.tick(50); TT.startItem(s, brk.id); s.tick(10); TT.stop(s);
  const d = TT.daySummary(s, '2026-11-05', s.at());
  eq([d.productive, d.breaks], [50 * M, 10 * M], 'productive vs break');
}
// Quick add / voice contract
{
  const s = mk();
  let r = TT.quickAdd(s, 'sweep leaves, wash truck, clean garage');
  eq([r.ok, r.routed, r.items.length], [true, 'next', 3], 'no running block -> Next Block');
  ok(s.get(r.blockId).staged && s.get(r.blockId).title === 'Next Block', 'Next Block created as staged');
  const w = TT.addBlock(s, { title: 'Work' }); const e = TT.startBlock(s, w.id); s.tick(3);
  r = TT.quickAdd(s, 'email Bob');
  eq([r.routed, r.blockId], ['current', w.id], 'running block gets it');
  ok(TT.running(s).id === e.id, 'adding does not restart the timer');
  r = TT.quickAdd(s, 'later thing', 'next');
  ok(r.routed === 'next' && s.get(r.blockId).title === 'Next Block' && TT.stagedBlocks(s).length === 1, 'explicit next reuses staging');
  ok(!TT.quickAdd(s, ' , ').ok, 'empty input rejected');
  TT.startBlock(s, r.blockId);
  ok(!s.get(r.blockId).staged, 'starting a staged block unstages it');
}
// Manual / estimated entries and overlaps
{
  const s = mk(); s.tick(600); // 19:00
  const b = TT.addBlock(s, { title: 'Research browsers' });
  let r = TT.addManual(s, { blockId: b.id, start: T0, dur: 45 });
  ok(r.ok && r.entry.source === 'manual' && r.entry.end === T0 + 45 * M, 'manual by start + duration');
  r = TT.addManual(s, { blockId: b.id, start: T0 + 30 * M, end: T0 + 60 * M });
  ok(!r.ok && r.overlaps.length === 1, 'overlap rejected');
  r = TT.addManual(s, { blockId: b.id, start: T0 + 30 * M, end: T0 + 60 * M, force: true });
  ok(r.ok, 'overlap allowed when forced');
  const d = TT.daySummary(s, '2026-11-05', s.at());
  eq([d.estimated, d.tracked, d.overlap], [75 * M, 60 * M, 15 * M], 'forced overlap is not double counted in tracked');
  ok(!TT.addManual(s, { blockId: b.id, start: T0 + 60 * M, end: T0 + 50 * M }).ok, 'end before start rejected');
  ok(!TT.addManual(s, { blockId: b.id, start: s.at(), dur: 30 }).ok, 'future rejected');
  r = TT.addManual(s, { title: 'Planning business ideas', end: s.at(), dur: 20 });
  ok(r.ok && s.get(r.entry.blockId).title === 'Planning business ideas', 'manual with new block title');
  const e = r.entry;
  ok(!TT.editEntry(s, e.id, { start: T0 + 10 * M }).ok, 'edit into overlap rejected');
  ok(TT.editEntry(s, e.id, { start: e.end - 25 * M }).ok, 'edit duration');
}
// Day reconciliation: measured vs estimated vs unaccounted
{
  const s = mk(); // 09:00
  const b = TT.addBlock(s, { title: 'Work', catId: 'cat-work' });
  TT.addManual(s, { blockId: b.id, start: TT.atMinute('2026-11-05', 7 * 60), dur: 60 }); // 07-08 estimated
  TT.startBlock(s, b.id); s.tick(120); TT.stop(s);                                        // 09-11 measured
  const p = TT.addBlock(s, { title: 'Chat', catId: 'cat-personal' });
  TT.startBlock(s, p.id); s.tick(30); TT.stop(s);                                         // 11-11:30 other
  s.tick(30);                                                                             // now 12:00
  const d = TT.daySummary(s, '2026-11-05', s.at());
  eq([d.measured, d.estimated, d.productive, d.other, d.window, d.unaccounted], [150 * M, 60 * M, 180 * M, 30 * M, 300 * M, 90 * M],
    'measured / estimated / productive / other / window / unaccounted');
}
// Cross-device: two open timers after merge -> older one closed where the newer begins
{
  const a = mk(), b2 = mk();
  const blk = TT.addBlock(a, { title: 'X' }); b2.merge([a.recs[blk.id]]);
  TT.startBlock(a, blk.id); b2.tick(5);
  const y = TT.addBlock(b2, { title: 'Y' }); TT.startBlock(b2, y.id);
  a.merge(b2.dirtyList()); TT.normalize(a);
  eq(TT.openEntries(a).length, 1, 'normalized to one open entry');
  eq(TT.blockTotals(a, blk.id, T0 + 10 * M).total, 5 * M, 'older entry closed at newer start');
  // LWW: newer write wins, stale ignored
  const s = mk(); const c = TT.addBlock(s, { title: 'old' });
  const stale = { ...s.recs[c.id], title: 'stale', u: s.recs[c.id].u - 5 };
  eq(s.merge([stale]), 0, 'stale write ignored');
  eq(s.merge([{ ...s.recs[c.id], title: 'new', u: s.recs[c.id].u + 5 }]), 1, 'newer write applied');
  ok(s.get(c.id).title === 'new' && !s.dirty[c.id], 'merged record not marked dirty');
}
// Recurrence: occurrences, one vs series edits, no actual time created
{
  const s = mk();
  const r = TT.addSeries(s, { title: 'Morning study', catId: 'cat-study', start: 8 * 60, dur: 60, freq: 'weekly', days: [1, 3, 5], from: '2026-11-02' });
  let occ = TT.occurrences(s, '2026-11-02', '2026-11-15');
  eq(occ.map(o => o.date), ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'], 'Mon/Wed/Fri');
  eq(s.all('entry').length, 0, 'planned occurrences create no time entries');
  TT.editOccurrence(s, r.id + '@2026-11-04', { start: 9 * 60 }, 'one');
  occ = TT.occurrences(s, '2026-11-02', '2026-11-08');
  eq(occ.map(o => o.start), [480, 540, 480], 'edit one occurrence only');
  TT.editOccurrence(s, r.id + '@2026-11-06', { dur: 90 }, 'series');
  occ = TT.occurrences(s, '2026-11-02', '2026-11-08');
  eq(occ.map(o => [o.start, o.dur]), [[480, 90], [540, 90], [480, 90]], 'series edit keeps the one-off time');
  TT.deleteOccurrence(s, r.id + '@2026-11-02', 'one');
  eq(TT.occurrences(s, '2026-11-02', '2026-11-08').length, 2, 'skip one occurrence');
  TT.editOccurrence(s, r.id + '@2026-11-06', { date: '2026-11-07' }, 'one');
  eq(TT.occurrences(s, '2026-11-02', '2026-11-08').map(o => o.date), ['2026-11-04', '2026-11-07'], 'move one to another day');
  const d = TT.addSeries(s, { title: 'Dishes', start: 20 * 60, dur: 15, freq: 'daily', from: '2026-11-05', until: '2026-11-07' });
  eq(TT.occurrences(s, '2026-11-01', '2026-11-30').filter(o => o.seriesId === d.id).length, 3, 'daily with until');
  ok(TT.findOcc(s, d.id + '@2026-11-06').title === 'Dishes', 'findOcc');
}
// Calendar: schedule a future block, tap it, track now; plan untouched
{
  const s = mk();
  const p = TT.addPlan(s, { date: '2026-11-06', start: 14 * 60, dur: 60, title: 'Clean truck', items: 'vacuum, wash' });
  const e = TT.startPlanned(s, p.id); s.tick(20);
  const b = s.get(e.blockId);
  ok(b.planKey === p.id && TT.itemsOf(s, b.id).length === 2, 'block made from plan with its items');
  eq([s.get(p.id).date, s.get(p.id).start, s.get(p.id).dur], ['2026-11-06', 840, 60], 'planned time not replaced');
  TT.stop(s);
  const again = TT.startPlanned(s, p.id);
  ok(again.blockId === b.id, 'second start reuses the same block');
  const r = TT.addSeries(s, { title: 'Walk', start: 600, dur: 30, freq: 'daily', from: '2026-11-01' });
  TT.startPlanned(s, r.id + '@2026-11-05'); s.tick(10); TT.stop(s);
  eq(TT.occurrences(s, '2026-11-05', '2026-11-05').filter(o => o.seriesId).length, 1, 'starting does not duplicate occurrences');
  const pva = TT.planVsActual(s, '2026-11-05', s.at()).find(x => x.occ.seriesId === r.id);
  eq(pva.actual, 10 * M, 'planned vs actual via planKey');
}
// Break suggestion
{
  const s = mk(); const b = TT.addBlock(s, { title: 'W', catId: 'cat-work' });
  TT.startBlock(s, b.id); s.tick(30); TT.stop(s); s.tick(2); TT.startBlock(s, b.id); s.tick(25);
  const g = TT.breakSuggestion(s, s.at());
  ok(g && g.workMin === 55 && g.breakMin === 10, 'back-to-back work merged: ' + JSON.stringify(g));
  s.patch('cfg', { breakTips: false });
  ok(TT.breakSuggestion(s, s.at()) === null, 'tips can be turned off');
}
// Search + CSV
{
  const s = mk(); s.tick(120);
  const b = TT.addBlock(s, { title: 'Android, browsers', catId: 'cat-work' });
  TT.addManual(s, { blockId: b.id, start: T0, dur: 30, note: 'Kiwi vs "Firefox"' });
  eq(TT.findEntries(s, { q: 'android' }).length, 1, 'search by block');
  eq(TT.findEntries(s, { catId: 'cat-study' }).length, 0, 'filter by category');
  const csv = TT.entriesCsv(s);
  ok(csv.split('\n').length === 2 && csv.includes('"Android, browsers"') && csv.includes('"Kiwi vs ""Firefox"""'), 'CSV escaping');
}
// Deleting a block removes its items and entries; sub-second taps leave nothing
{
  const s = mk(); const b = TT.addBlock(s, { title: 'Z', items: 'q' });
  TT.startBlock(s, b.id); TT.pause(s);
  eq(s.all('entry').length, 0, 'instant start/stop leaves no entry');
  TT.startBlock(s, b.id); s.tick(3); TT.deleteBlock(s, b.id);
  eq([s.all('block').length, s.all('item').length, s.all('entry').length, TT.running(s)], [0, 0, 0, null], 'block deleted cleanly');
}

console.log(fails ? '✗ ' + fails + ' of ' + n + ' tracker checks failed' : '✓ tracker core: ' + n + ' checks');
process.exit(fails ? 1 : 0);
