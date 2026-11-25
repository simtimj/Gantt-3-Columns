# Current state (read this first; updated 2026-11-25 09:15)

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
- Captured for later (New Tasks, Can be later): Fun tab thumbnails + episode tracking, multi-select mode, collapse/expand subtasks, Keep In Mind tab beside Backlog in the full calendar.

## Next (in order)
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
