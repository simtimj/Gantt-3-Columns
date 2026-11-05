# Time Tracker (standalone, 2026-11-05)

A fast, phone-first time tracker (Toggl-style ideas, own design). Lives in `tracker/`, separate from Gantt.

- **Open it:** the Gantt web app's /dev link with **`?app=tracker`** at the end (e.g. `…/dev?app=tracker`). Add it to the home screen for a one-tap icon.
- **Data:** its own spreadsheet **"Time Tracker DB"** in your Drive (made on first sync; id in script property `TRACKER_DB_ID`). It never reads or writes the Gantt sheet.

## 1. Assessment / why this boundary

- The repo is one Google Apps Script web app (`clasp push` on every push to `main`). clasp pushes **every** `.gs/.js/.html/.json`, subfolders included, into the same script project.
- A separate Apps Script project would need a new script id, a first-run authorization and deploy setup that can't be done or tested from here. So the tracker **shares the deployment only** (one `if` in `doGet`), and is otherwise isolated:
  - own files (`tracker/`), own `tracker…` / `TT_` names, own spreadsheet, own localStorage keys (`tt.v1`, `tt.ui.v1`);
  - no calls into Gantt code; the existing in-Gantt block timer (`Timer.gs`, Timer Log tab) is untouched.
- Moving it to its own project later = copy `tracker/` + a tiny `doGet` into a new project. Nothing else depends on Gantt.

## 2. Files

| File | What |
|---|---|
| `tracker/Core.html` | Pure logic (no DOM, no Apps Script): store + merge, timer transitions, parsing, totals, reconciliation, recurrence, search, CSV. Same code runs in Node tests. |
| `tracker/App.html` | The whole UI (Blocks / Calendar / Day / More), device-first storage, sync loop. |
| `tracker/Server.gs` | `trackerPage_()`, `trackerSync()` (last-write-wins per record, script lock), creates the DB sheet. |
| `tools/tracker-test.mjs` | 71 core checks (fake clock, Pacific time). |
| `tools/smoke.mjs` | Gantt smoke + tracker acceptance walk-through in headless Chromium (desktop + phone) with a fake server. |

## 3. Data model

Every record: `{id, kind, u (last write ms), del?}` + fields. Stable random ids, all times in epoch ms (UTC), each entry also stores the device time zone (`tz`).

- **cat** `{name, color, productive}` — you decide what counts as productive.
- **block** `{title, catId, date, status open|done, staged (Next Block), activeItemId, planKey, lastAt}`
- **item** `{blockId, title, done, doneAt, order, isBreak}`
- **entry** `{blockId, itemId|null, start, end|null, source timer|manual, productive?, note, tz}` — at most **one** open entry exists, so timers never overlap. Block time = its entries; item time = entries with that item; `itemId null` = unassigned.
- **plan** `{date, start (min), dur (min), title, catId, items}` and **series** `{start, dur, freq daily|weekly, days[], from, until, ex{date: skip | {start,dur,title}}}` — planned time, never changed by tracking. Occurrences are computed, not stored.
- **cfg** — day window (07:00–23:00), long-run question (2 h), break-tip rule.

**Sync:** taps change the local store at once (saved to localStorage), then `trackerSync({since, changes})` sends dirty records; the server keeps the newer `u` per id and returns everything with a higher `Seq`. Retries are idempotent. If two devices both started a timer offline, `normalize()` closes the older one where the newer begins.

## 4. Milestones

1. **M1 (this release)** — standalone timer, blocks + items, comma quick add, Next Block, manual entries, corrections, day reconciliation, week summary, calendar day/week with planned blocks, drag/resize (day view), daily/weekly recurrence with this-one / whole-series edits, search, CSV/JSON export, categories, break tips, sync to own sheet.
2. **M2** — Polish from your phone test; JSON import/restore; "this and following" series edits; drag across days in week view; reorder blocks.
3. **M3** — Google Calendar adapter (read-only import first), then Gantt link.
4. **M4** — Authenticated quick-add endpoint for watch / Gemini / Android shortcut; Android foreground notification (needs a native/TWA wrapper).
5. **M5** — Scheduling analysis (planned vs actual patterns over weeks).

## 5. Completed vs deferred

**Done (M1, tested automatically):** everything in M1 above.

**Deferred / not built:**
- Google Calendar import/mirror, Gantt integration, watch / Gemini voice, Android notification, home-screen shortcut beyond "Add to Home screen".
- JSON import (export works), "this and following" scope, week-view drag, cross-day drag, undo.
- Server sync is **not** end-to-end tested here (no Apps Script access from this session); it's tested against an in-page fake that mirrors `trackerSync`. First real test = your phone.

## 6. Run + test

- Tests: `node tools/check.mjs && node tools/tracker-test.mjs && node tools/smoke.mjs` (`--shot out.png` adds screenshots).
- Local, no Google: the smoke test writes the built page to `$TMPDIR/tracker-smoke.html`. Opened without `google.script.run` the app runs **local only** (says so under the timer bar).

## 7. Manual acceptance checklist (phone)

1. Type `Yard: sweep leaves, wash truck, clean garage`, Block mode, **+** → one block with 3 tasks.
2. Tap ▶ on it → timer bar runs. Lock the phone 2 min, unlock → time kept.
3. ▶ on a task, then tick it → task done, its timer stops, block keeps running (Unassigned grows).
4. ❚❚ in the top bar → everything stops; ▶ Resume brings the task back.
5. Start another block → the first stops (one live entry in "Entries today").
6. Task mode with nothing running → tasks land in **Next Block**.
7. **+ Manual entry** → title, 30m → shows "est." in entries.
8. Calendar → **+ Plan** tomorrow 14:00 → tap its ▶ → tracking now; the plan stays at 14:00. Drag ☰ to move, bottom edge to resize.
9. + Plan with Repeat weekly M/W/F → Week view shows them; no entries created.
10. Day tab → Measured / Estimated / Unaccounted.
11. Open on a second device → same blocks and running timer after a few seconds.
12. Gantt (no `?app=`) still opens and works as before.

## 8. Integration notes (design, not built)

- **Google Calendar:** an adapter outside Core maps events ↔ `plan` records with `ext: {source:'gcal', id, etag}`. Import is one-way first; dedupe on `ext.id`; never write back over Graphite (done) events; color → urgency mapping (Tomato 11 = red, Banana 5 = yellow, Blueberry 9 = blue, Graphite 8 = done) kept on the plan, not on entries. Tracked entries never overwrite plans.
- **Gantt:** exchange through stable ids + an explicit mapping tab (`gantt task id ↔ tracker block/item id`), one-way first (tracker reads Gantt's New Tasks, or writes a Done Log row on Finish). No writes into Gantt Days / Reference cells without an agreed contract.
- **Watch / Gemini / Android:** the contract already exists as `TT.quickAdd(store, text)`: adds to the **running** block without touching its timer; with nothing running it goes to Next Block; never an unrelated block; returns a one-line message for the confirmation. Missing piece: an authenticated endpoint (`doPost` with a long random secret in Script Properties, rate-limited, ops idempotent by id) plus a bridge (Tasker/Automate HTTP request or a Gemini extension). Speech recognition alone doesn't run anything; needs an end-to-end test before claiming it works.
- **Notifications:** web/PWA can't keep a reliable foreground timer notification; needs a TWA/native wrapper. The timer itself never needs it (timestamps).
- **Auth today:** the web app runs as you with access MYSELF, so only your Google login can open it or call `trackerSync`.
