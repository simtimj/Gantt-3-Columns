/* Block timer MVP (2026-11-05, Julius; design: Reference card "📜 Timer App", Nov 3 decisions).
   The page records every timer tap as an event (start / pause / resume / finish a block, start / stop an item,
   correct a total) with a unique op id, keeps them on the device first, then sends them here. This file only
   appends them to the "Timer Log" tab, skipping op ids it already has, so a retry or a second device never
   doubles anything. The page rebuilds all totals from the events; nothing here computes time. */
const TIMER_HEADERS = ['Op', 'Date', 'At', 'Action', 'Block', 'Item', 'Name', 'Value', 'Device'];
// est = an estimate for unaccounted time (2026-11-25, gaps view): its own record, never added to measured time.
const TIMER_ACTIONS = { start: 1, pause: 1, finish: 1, istart: 1, istop: 1, fix: 1, est: 1 };

// Storage: Store.timer (Store.gs, 2026-11-21 H2).

function timerRowToEvent_(r) {
  const at = r[2] instanceof Date ? r[2].getTime() : Date.parse(r[2]);
  const value = r[7] === '' || r[7] === null ? null : Number(r[7]);
  return {
    op: String(r[0]), date: r[1] instanceof Date ? Utilities.formatDate(r[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(r[1]),
    at: at, act: String(r[3]), blk: String(r[4] || ''), item: String(r[5] || ''), name: String(r[6] || ''),
    value: isNaN(value) ? null : value, dev: String(r[8] || '')
  };
}

// Events for days on or after `since` (yyyy-MM-dd). Read after the page has drawn, never during the load.
function getTimerEvents(since) {
  const from = String(since || '');
  const list = Store.timer.rows()
    .map(timerRowToEvent_)
    .filter(e => e.op && TIMER_ACTIONS[e.act] && !isNaN(e.at) && (!from || e.date >= from));
  if (!Store.timer.ready_()) return list;
  // Database (H5 B): events the app saved straight to the day docs, not in the tab yet.
  const have = new Set(list.map(e => e.op));
  let extra = [];
  try { extra = Store.timer.dbEvents(from).filter(e => !have.has(e.op) && TIMER_ACTIONS[e.act] && Number(e.at) > 0); } catch (e) { console.error('timer read: ' + e.message); }
  return list.concat(extra.map(e => ({ op: String(e.op), date: String(e.date), at: Number(e.at), act: String(e.act), blk: String(e.blk || ''),
    item: String(e.item || ''), name: String(e.name || ''), value: e.value === null || e.value === undefined || isNaN(Number(e.value)) ? null : Number(e.value), dev: String(e.dev || '') })));
}

// Appends the events whose op id isn't in the tab yet. Returns the op ids now stored (new + already there),
// so the page can drop them from its send queue.
function saveTimerEvents(events) {
  const list = (Array.isArray(events) ? events : []).filter(e => e && e.op && TIMER_ACTIONS[e.act] && Number(e.at) > 0);
  if (!list.length) return { saved: [] };
  return Store.locked(() => {
    const have = Store.timer.ops();
    const rows = [];
    list.forEach(e => {
      const op = String(e.op).slice(0, 64);
      if (have.has(op)) return;
      have.add(op);
      rows.push([op, String(e.date || '').slice(0, 10), new Date(Number(e.at)).toISOString(), String(e.act),
        String(e.blk || '').slice(0, 40), String(e.item || '').slice(0, 40), String(e.name || '').slice(0, 200),
        e.value === null || e.value === undefined || e.value === '' ? '' : Number(e.value), String(e.dev || '').slice(0, 20)]);
    });
    Store.timer.append(rows);
    return { saved: list.map(e => String(e.op).slice(0, 64)) };
  });
}
