# Code map (2026-11-21)

Where things live, so a session can jump straight there. **Grep the quoted text; don't trust line numbers** (they drift; the ones here are only rough). Update this file when you add or move a big section.

## Store.gs — storage layer (2026-11-21, NOTES "H2")

Only file allowed to touch the Sheet / Properties (ratchet: `tools/store-guard.mjs` + `tools/store-baseline.json`, run by `check.mjs`). `STORE_BACKEND` (area → `'sheet'`, later `'db'`), `Store.<area>` objects returning `{ value, at }`, `Store.locked(fn)`. Moved: everything — `kim`, `days`, `ref` + `archive`, `plan` + `calBacklog`, `timer`, `props` / `userProps`, plus `sheetFirst(tab)` for AI-written/log tabs (plus the Sheet helpers `ss_`, `getOrCreateSheet_`, `findDayRow_`, `readDoneToday_`, `referenceRowMap_`, `readConfirmCard_`, setup/date coverage). Days on the database (2026-11-22, NOTES "H4"): `Store.days` `COLL` / `lay_` / `layRange_` / `unmirrored_` / `mirror`, `StoreFs.patch` / `query`; PWA side `tools/pwa/shim.js.txt` → `daysArea()` + `hash()`; full history (H5 D): `Store.days.seed_`, shim `history` / `range` / `opening` (grep `pwa.days.up`), smoke `pwa-hist`; switch = `STORE_DB_AREAS_` + `areas` in firebase-config.json. Database (2026-11-22, NOTES "H3"): `FIREBASE_PROJECT_`, `STORE_DB_AREAS_`, `StoreFs` (Firestore REST), `Store.mirror()` / trigger `storeMirror` / `firebaseSetup`. PWA side: `tools/pwa/shim.js.txt` → "Firestore" block. Test: `tools/store-test.mjs`. Moving an area: add `Store.<area>`, point the feature at it, extend store-test, `node tools/store-guard.mjs --update`.

## Index.html (split 2026-11-21, speed item G)

`Index.html` is now a small shell (head, theme script, page markup, start-up scriptlets) that pulls in six parts with `<?!= HtmlService.createHtmlOutputFromFile('Index_X').getContent() ?>`. Parts are raw HTML (no scriptlets: anything with `<?= ?>` must stay in the shell). Order in the page = order below. Tools read the joined page with `tools/index-html.mjs` → `readIndexHtml()`; the part list also lives in Code.gs `INDEX_PARTS_` (build hash). Line numbers below are of the **joined** page.

| File | Holds |
|---|---|
| `Index.html` | head, theme script, `<body>` markup, `__FW_INITIAL__` / build scriptlets, WeekdayIcons + Drafts includes |
| `Index_Css.html` | base CSS + light / dark theme; last block `#wsFrame` = workspace frame + `--ws-*` tokens (head on purpose) |
| `Index_Main.html` | main app script (`STATE` banner) |
| `Index_Cards.html` | side space slider, task cards + subject colors, theme select, card fill, saved looks |
| `Index_Extras.html` | task mirrors, block borders, title cells, block timer, header swipe, pull tabs, long-press panes |
| `Index_Calendar.html` | calendar module (FullCalendar) + Big Three strip |
| `Index_Layout.html` | 4-panel layout / Reference drawer; last block `#uiBatchCss` = UI batch (8 = workspace shell) + `initWsFrame` |


| Area | Grep for | ~Line |
|---|---|---|
| Base CSS + light / dark theme | `Light / dark toggle, saved per device` | 1–2320 |
| Page markup (header, columns, panes) | `<body>` | 2324–2600 |
| **Main app script** (one big block) | `STATE` banner | 2610–11720 |
| Instant screen (snapshot paint / save, early data request) | `INSTANT SCREEN` | 2615 |
| One calm return (`fwResume` queue on coming back; reads batched via `fwBatchStart` / `batchCalls`) | `ONE CALM RETURN`, `Batched calls (speed plan E` | 3058 |
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

## PWA (2026-11-21, NOTES H)
`tools/build-pwa.mjs` (static build) · `tools/pwa/shim.js.txt` (google.script.run → fetch, cache open, offline, update button) · `tools/pwa/sw.js.txt` · `tools/pwa-api/` (router project + deploy.sh) · Code.gs `PWA API` banner (`apiCall`, `ss_`, `pwaSetupPage_`). Smoke: `SMOKE_ONLY=pwa`.

## Tests

`tools/check.mjs` = syntax. `tools/smoke.mjs` suites: `main`, `snap`, `drafts`, `tracker`, `calendar`, `resume`, `calcache` (run one with `SMOKE_ONLY=calendar`). The calendar suite's fake server is `calStub` (seeded events: Dentist 9:00, Standup, Gig, All-day A…). Main suite runs in Pacific time like Julius's browser.
