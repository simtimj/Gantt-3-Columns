# Current state (read this first; updated 2026-11-25, Cairn rename)

App name: **Cairn** (aliases Gantt, Gaunt). Rename step 1 done 2026-11-25 (title, manifest, toolbar wordmark, setup page). Step 2 later: repo + Sheet names (and icon file names `gantt-*`, Firestore `gantt*` collections stay as they are).

Short and current. History and build details live in `docs/NOTES.md` (1,300 lines: `grep -n "^## "`, open one section, never read whole).

## How the app runs
- **PWA = the main app** (GitHub Pages, installed on Julius's phone). Apps Script /dev page still works and is the fallback path.
- **Data**: Firestore for every area (`STORE_DB_AREAS_` in Store.gs = `areas` in tools/pwa/firebase-config.json: cal, days, focus, inbox, kim, kv, plan, ref, timer). The Sheet is the backup copy, filled by the 5-min Apps Script trigger `storeMirror`.
- **Calendar**: reads come from the Firestore calendar copy (`ganttCal`, refreshed by the trigger); edits go to the Cloud Function `cal` (functions/), Apps Script as fallback.
- **Still on Apps Script**: imports (5-min `importsTick`), calendar copy, Cal Backlog sweep, Sheet mirror, auto archive (`archiveTick_`, every 15 min when on), hold-menu metadata writes.
- **PWA build**: `tools/build-pwa.mjs` → minified page + big scripts as `js/<hash>.js` (precached, code cache). Shim `tools/pwa/shim.js.txt` routes each call to Firestore / Function / Apps Script.

## Focus (Gaunt rules)
- Active focus: **PWA upgrade** (Calendar, Timer/Blocks parked).
- Waiting on Julius's phone test: event titles fill the card, calendar tidy, Google-style checkboxes, side-by-side overlaps, code cache, auto archive (README 🧪 2026-11-24 / 25).
- Captured for later (New Tasks, Can be later): Fun tab thumbnails + episode tracking.
- **Task log done 2026-11-26** (full calendar bottom-left box; Calendar parked → Julius asked directly): tabs KIM (real editable Keep In Mind) · Prev · BL n, only ▾ minimizes, tighter margins; instant Keep In Mind + Backlog from device copies. 🧪 README. NOTES "Task log tabs".
- **Backlog batch done 2026-11-25** (Julius overrode the one-focus rule for one session, "do it anyway, all of it"): Send to Backlog, subtask fold, multi-select, Keep In Mind tab in the full calendar, Blocks Quick Add, Unaccounted time view. All 🧪 in README. NOTES → "Backlog batch 2026-11-25".
- Dropped by Julius 2026-11-25: Soon / Later drag lanes (Ordered / Unordered replaced them). Already built before: quick-add on the empty all-day strip, small calendar drag / resize, pop-out panel (📅 = full screen), Blocks child timers + Break.

## Next (in order)
- CI: calendar 3b timed → all-day drag retries once (CI-only flake, NOTES "Cairn rename step 1").
0. Phone check: Cairn name on the installed app + phone calendar text size (README 🧪 2026-11-25) + task log tabs + faster Keep In Mind opening (🧪 2026-11-26).
1. Speed Log: PWA openings now log `load` rows (source device, from 2026-11-25). After a day, read their `screen` / `drawEnd` (no older PWA rows to compare against; /dev rows are the only before).

## Index_Main split (done 2026-11-25)
- Main script = 8 parts (Index_Main, _Editors, _Sync, _Reference, _Search, _NextSteps, _CalEvents, _RefOptions; 55–88 KB each). Load-order rule in CODE_MAP.md.

## Bloat cleanup (done 2026-11-25)
- Dead UI code gone (phone-tested OK; instant screen, old Calendar / Inbox panels, unused functions, dead CSS; ~43 KB). Details NOTES "Bloat cleanup". Store sheet-mode bodies kept (they are the fallback).

## Working rules that changed recently
- PWA-first: new features PWA only; /dev = emergency backup; Apps Script fallback stays (Julius 2026-11-25).
- Pre-push: `node tools/quick-check.mjs` (only the suites the changed files touch). CI runs the full suite on every push to main.
- Cloud sessions: no Playwright browser → quick-check uses /usr/bin/google-chrome. Never `npm install --no-save` here (prunes the committed node_modules; restore with `git checkout -- node_modules`).

- README is the lean feature list now; old 🧪 notes live in docs/README_ARCHIVE.md.
