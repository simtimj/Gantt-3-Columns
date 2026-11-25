# Current state (read this first; updated 2026-11-25)

Short and current. History and build details live in `docs/NOTES.md` (1,300 lines: `grep -n "^## "`, open one section, never read whole).

## How the app runs
- **PWA = the main app** (GitHub Pages, installed on Julius's phone). Apps Script /dev page still works and is the fallback path.
- **Data**: Firestore for every area (`STORE_DB_AREAS_` in Store.gs = `areas` in tools/pwa/firebase-config.json: cal, days, focus, inbox, kim, kv, plan, ref, timer). The Sheet is the backup copy, filled by the 5-min Apps Script trigger `storeMirror`.
- **Calendar**: reads come from the Firestore calendar copy (`ganttCal`, refreshed by the trigger); edits go to the Cloud Function `cal` (functions/), Apps Script as fallback.
- **Still on Apps Script**: imports (5-min `importsTick`), calendar copy, Cal Backlog sweep, Sheet mirror, auto archive (`archiveTick_`, every 15 min when on), hold-menu metadata writes.
- **PWA build**: `tools/build-pwa.mjs` → minified page + big scripts as `js/<hash>.js` (precached, code cache). Shim `tools/pwa/shim.js.txt` routes each call to Firestore / Function / Apps Script.

## Focus (Gaunt rules)
- Active focus: **PWA upgrade** (Calendar, Timer/Blocks parked).
- Waiting on Julius's phone test: calendar tidy, Google-style checkboxes, side-by-side overlaps, code cache, auto archive (README 🧪 2026-11-24 / 25).
- Captured for later (New Tasks, Can be later): multi-select mode, collapse/expand subtasks, Keep In Mind tab beside Backlog in the full calendar.

## Next (in order)
1. **Dev speed**: plan retiring the old /dev code paths (needs Julius's OK) → see NEXT_SESSION.md.
2. **Split Index_Main.html** (525 KB) into smaller parts.
3. Read the Speed Log after a day of use (did the code cache help?).

## Working rules that changed recently
- Pre-push: `node tools/quick-check.mjs` (only the suites the changed files touch). CI runs the full suite on every push to main.
- Cloud sessions: no Playwright browser → quick-check uses /usr/bin/google-chrome. Never `npm install --no-save` here (prunes the committed node_modules; restore with `git checkout -- node_modules`).
