# Gantt 3 Columns — notes for Claude

- Google Apps Script web app (Today / Notes / Reference columns over a Google Sheet). Pushing to `main` auto-deploys via `.github/workflows/deploy.yaml`, so keep commits small and working. Julius mostly works from his phone.
- Files: `Code.gs` (server), `Index.html` (all UI), `appsscript.json`.

## README is the feature list — always keep it current

- `README.md` lists every feature under: ✅ Working · 🧪 To be confirmed · 🔧 To be improved · 📋 To do · 💤 Shelved.
- **Every change that adds, changes or removes a feature must update `README.md` in the same commit.** New work goes under 🧪 To be confirmed (with the date); move it to ✅ Working once Julius says it works; anything he wants tweaked goes under 🔧; ideas he mentions but hasn't asked to build go under 📋. Update the "Last updated" date.
- Keep useful info that's removed from the screen (e.g. the shortcuts list) in the README.

## Inbox — how Claude adds items (2026-10-26)

- When Julius says "add to my Gantt inbox: …" (or captures an idea for the planner), clean it up into a concise title + details and append to `CLAUDE_INBOX` in `inbox.js`: `{ id: 'c-YYYYMMDD-short-slug', title: 'Concise title', details: 'what else is needed', added: 'YYYY-MM-DD' }`. Ids must be unique and never reused. Push to `main`; it shows in the app in ~1 min, rendered **Title**: details.
- Claude can't reach Google from its workspace, so this file is the pipeline. Dismissed / sent-to-Today ids are stored in the app's user properties (`inboxDone`), so handled items stay hidden; prune entries older than ~30 days when editing the file.
- Items typed in the app live in user properties (`inboxItems`). Server: `getInbox()`, `addInboxItem()`, `dismissInboxItem()` in `Code.gs`; client: `renderInbox()`, `addTaskToToday()` in `Index.html`.
- Urgent panel create: `holdForCreate()` / `openCreateMenu()` / `createRow()` → `addTaskToToday(title, details, urg)` appends a check-line to today's Today cell. Reference options live in `#refOptions` (`initRefOptions()`); `fw.urgWrap` toggles wrapping (default on).

## Done-with-Claude log (2026-10-26, Julius: standing rule)

- **Whenever Julius finishes something through Claude (any project, not just this repo), add a line to `CLAUDE_DONE` in `donelog.js` and push**: `{ id: 'd-YYYYMMDD-short-slug', date: 'YYYY-MM-DD', project: 'Exercise Tracker', title: 'Short substantive name', details: 'what was done' }`. `project` = the app/area (Exercise Tracker, Gantt, …) and becomes the group header; `title` is the main point of the work (e.g. "In Today marker", "Reference Options button"), never the project name again (Julius, 2026-10-26). One entry per finished task; unique ids, never reused; prune entries older than ~30 days.
- `applyClaudeDone_()` in `Code.gs` runs at the start of `getWorkspaceData()`: appends each new entry once to its day's Today cell as a checked `check-line` with `data-cid="<id>"`, and records applied ids in script properties `claudeDoneApplied` (so a line he deletes stays deleted). Creates the day row if missing.
- Grouped layout (2026-10-26, Julius: batch by project, roughly chronological is fine): `groupClaudeDone_()` folds Claude's lines in a day cell into one block per project — a plain `<div data-cgrp><b><u>Project</u></b></div>` header (his own header style, no checkbox), then each item as a checked level-0 check-line `<b>*Title</b>: details` (`*` prefix, no space, marks Claude's lines — Julius 2026-10-26; added in `doneItemHtml_()` whenever there's a cid; migration flag `claudeDoneGrouped` = '2' re-rendered past days). A group sits where its first line was; new items join their project's group; lines he wrote himself stay put (check-lines right under a Claude header stay with that group). Headers are recognized by `data-cgrp` or by bold+underlined text equal to a known project. Old flat lines (`<b>Project</b>: details`) are converted, matched to entries by `data-cid` or the entry's `was` text. Groups get a blank `<p><br></p>` before/after (existing blanks reused); `doneBlocks_()` splits `<div>` and `<p>` blocks. One-time migration of past days is flagged by script property `claudeDoneGrouped`. Test: eval the done-log functions from `Code.gs` in Node with `donelog.js`.
- Caveat: an already-open app tab that saves today's cell can overwrite merged lines (they're marked applied, so they won't come back) — Julius was told to tap ↻ first.

## Urgent panel + view stability (2026-10-26)

- `collectUrgent()` also returns open lines with `data-due` but no `data-urg` as `urg: 0`; `renderUrgent()` draws them last as a grey **Due** group (no hold-to-create). Every group sorts dated first, soonest due first.
- `holdDayView()` (pointerdown on day/journal editors) restores `todayScroll` / `journalScroll` for ~400ms after a tap unless the person wheels or touch-moves; editor blur uses `syncDayHeightStable()`.

## Calendar panel (2026-10-26, Julius)

- `#calPanel` in Reference, between `#urgentPanel` and `#inboxPanel` (Urgent inserts before `calPanel`). Client: `loadCalendar()` (called from `applyWorkspaceData` after `setInbox`, on ↻, and on `visibilitychange` if >5 min old) → `renderCalendar()`; collapse state localStorage `fw.calOpen`. Server: `getCalendarEvents()` in `Code.gs` reads `EVENT_CALENDARS` (main + Events) for today through `EVENT_DAYS_AHEAD` (3) days and returns `{today, events:[{title, cal, allDay, date, endDate, start, end, location, link}]}`. Loaded async so it can't slow or break startup.
- Needs the Calendar scope: if the app asks for access, approve it; or run `authorizeCalendar()` once in the script editor.
- Everything Claude puts on his calendar shows here automatically; the planned dog-walk "walking block" events will too once that script writes them to the main calendar.

## Nightly plan + wrap-up (2026-10-26, Julius)

- A scheduled task ("Gantt: nightly wrap-up + plan", ~10 pm Pacific) reads the Sheet "New Gantt Sheet" (id `1D9aR_pJgddDdO5PD66IBlsDIIT_VbFKYfjvwccR08AE`, tab `Days`: Date / Today / Journal) via the Google Sheets connector, plus the Daily Work Log, `donelog.js` and Google Calendar, then appends two entries to `CLAUDE_NOTES` in `dayplan.js` and pushes: `kind:'wrap'` for today (end of Notes cell) and `kind:'plan'` for tomorrow (top of Notes cell). Format and line markup are in the file header.
- `applyClaudeNotes_()` in `Code.gs` runs in `getWorkspaceData()` after `applyClaudeDone_()`; each id is applied once (script property `claudeNotesApplied`); each block is a one-cell table `<table data-cnote="id" data-ckind="plan|wrap"><tbody><tr><td>…lines…</td></tr></tbody></table>` (boxed, Julius 2026-10-26; styled by `.editor table[data-cnote]` in `Index.html`). Pre-box flat blocks were converted once (`noteBlockFlatHtml_`, script property `claudeNotesBoxed`).
- Counting in the Today cell: a `check-line` is a task; `done` class or `checked` = finished; `data-urg` 1/2/3 = urgency; `data-cid` = logged by Claude.
- **Skip only what Claude already did (Julius, 2026-10-26):** if he plans tomorrow early with Claude in a chat, that Claude writes the plan as `n-<YYYYMMDD>-plan` in `dayplan.js` and pushes, so the nightly run skips it (same for an existing wrap-up id or Claude wrap-up block). It does NOT skip when he wrote his own plan in Notes (he still wants Claude's input, so it adds the Suggested day above his), or when tomorrow's calendar is already blocked out (then the plan opens with a `## Scheduled` list of those blocks as a reminder, plus only tasks not on the calendar). The nightly run never creates or changes calendar events.
