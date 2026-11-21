# Code map (2026-11-21)

Where things live, so a session can jump straight there. **Grep the quoted text; don't trust line numbers** (they drift; the ones here are only rough). Update this file when you add or move a big section.

## Index.html (~19k lines)

| Area | Grep for | ~Line |
|---|---|---|
| Base CSS + light / dark theme | `Light / dark toggle, saved per device` | 1–2320 |
| Page markup (header, columns, panes) | `<body>` | 2324–2600 |
| **Main app script** (one big block) | `STATE` banner | 2610–11720 |
| Instant screen (snapshot paint / save, early data request) | `INSTANT SCREEN` | 2615 |
| · state, helpers, first load | `BASIC HELPERS`, `LOAD` | 2750 |
| · day rows (History / Today), editors | `DAYS`, `EDITORS`, `AUTO FORMATTING` | 2920–4700 |
| · right-click / hold menu | `RIGHT-CLICK / LONG-PRESS MENU` | 4790 |
| · lazy weeks, day saving, safe sync | `LAZY WEEK LOADING`, `DAY SAVING`, `SAFE SYNC` | 5120–6230 |
| · Reference cards, phone mode / split, archive | `REFERENCE`, `MOBILE MODE / SPLIT`, `ARCHIVE —` | 6230–6850 |
| · workspace layout, resize, focus mode | `WORKSPACE VIEW`, `COLUMN RESIZING` | 6845–7350 |
| · Reference search, top bar, start-up | `REFERENCE SEARCH`, `TOP-BAR BUTTONS`, `START` | 7350–8650 |
| · urgency / Next Steps, backlog cell, batches, archive log | `URGENCY (2026-10-26`, `Urgent batches by subject`, `Urgent tick = log` | 8655–9370 |
| · Cal Events column (center calendar, pinch zoom, title edit) | `Calendar panel back (2026-10-29`, `loadCenterCalendar`, `Pinch zoom on the timeline` | 9670–10350 |
| · Reference options, indent / outdent, Urgent text menu | `Reference options panel`, `Indent / outdent a task` | 10600–11720 |
| Side space slider | `Side space slider` | 11724 |
| Task cards + subject colors | `===== Task cards` | 11896–13880 |
| Theme select, card fill, saved looks | `Card fill slider`, `Saved looks` | 13886–14680 |
| Task mirrors (`data-tid`) | `Task mirrors (2026-11-01` | 14680 |
| Block borders, block timer | `Block borders (2026-11-04`, `Block timer MVP` | 14945–15500 |
| Phone header swipe, pull tabs, long-press panes | `Header rows slide`, `Pull tabs (2026-11-06` | 15540–15720 |
| **Calendar module** (FullCalendar: docked / big / full screen) CSS | `#calPanel .cp-detail` | 15728–16418 |
| · calendar script (IIFE, `TZ = 'America/Los_Angeles'`) | `const LIBS = ['https://cdn.jsdelivr.net/npm/luxon` | 16447–18544 |
| ·· event pop-up | `function showDetail`, `function popAt`, `cardRun` | 16720–16950 |
| ·· edit / save forms | `function editEvent`, `function save(`, `function qsave` | 16950–17060 |
| ·· daily plan | `function loadPlan`, `function renderPlan` | 17067 |
| ·· backlog column | `function blRender` | 17400 |
| ·· mark done | `function toggleDone` | 17693 |
| ·· build / open / close / dock / full screen / all-day box | `function build(`, `function dockTo`, `function openFull`, `function fadRender` | 17860–18450 |
| Big Three strip | `getElementById('b3Strip')` | 18576 |
| Reference drawer | `initRefDrawer` | 18876 |

## Code.gs (~4k lines) — section banners

`SETUP` · `WEB APP DATA` (getWorkspaceData) · `DAY SAVING` · `REFERENCE` · `ARCHIVE —` · `DATE HELPERS` · `INITIAL DATE RANGE` · `SHEET HELPERS` · `INBOX` · `DONE WITH CLAUDE` (Done Log, To Confirm, New Tasks intake) · `CLAUDE NOTES` · `CALENDAR EVENTS` (calPanel* server calls) · `DAILY PLAN` · `DAILY COMPLETED-TASK ARCHIVE` · `CALENDAR BACKLOG` · `KEEP IN MIND`

## Tests

`tools/check.mjs` = syntax. `tools/smoke.mjs` suites: `main`, `snap`, `drafts`, `tracker`, `calendar` (run one with `SMOKE_ONLY=calendar`). The calendar suite's fake server is `calStub` (seeded events: Dentist 9:00, Standup, Gig, All-day A…). Main suite runs in Pacific time like Julius's browser.
