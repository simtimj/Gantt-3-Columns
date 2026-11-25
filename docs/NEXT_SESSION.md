# Next sessions — queue (rewritten 2026-11-25; the 2026-11-21 queue is done or parked)

One job per session. Read `docs/STATE.md` first.

## 1. Retire the old /dev paths — ANSWERED 2026-11-25 07:10: keep /dev as emergency backup · keep the Apps Script fallback · keep it rolling
Outcome: with both safety nets kept, steps 2–3 stay (the fallback *is* that code) and step 4 is mostly /dev-backup code too. Done: step 1 (freeze rule in CLAUDE.md). Remaining dev-speed win = §2 split. Revisit 2–4 only if the PWA runs a month without needing a fallback.
Why: almost every feature has two paths (Apps Script page / server + PWA / Firestore / Function) with fallbacks between them. Every change costs double code, double tests, double risk.

Plan (proposed, not approved):
- **Step 1, freeze**: new features are built for the PWA only; /dev stays as an emergency page, not kept at parity. Smoke suites for /dev-only behavior (`snap`, parts of `main`) are kept but not extended.
- **Step 2, Store sheet mode**: areas no longer switch between `'sheet'` and `'db'`; Firestore is the source, the Sheet only a mirror. Removes the second read/write body in each `Store.<area>`.
- **Step 3, calendar edits**: Cloud Function only; the Apps Script `calPanel*` write bodies stay just as the fallback the shim already uses (or go, per answer 2).
- **Step 4, delete dead code**: /dev-only start-up (instant screen picture, `fwResume` batching for the non-PWA page), old in-page "New version" bar, matching tests. Measure Index_Main size before / after.

Questions (ask as one batch with clickable answers):
1. /dev page: keep as an emergency backup (read + basic editing), or remove it completely?
2. When Firestore or the Function fails, keep falling back to Apps Script (safer, more code) or show an error and retry (less code)?
3. Do it in one long unattended run ("keep it rolling"), or one step per session with a test in between?

## 2. Split Index_Main.html (525 KB)
Into areas from docs/CODE_MAP.md (days/editors, saving/sync, Reference, layout, Next Steps, Cal Events). Same include pattern as the 2026-11-21 split (`INDEX_PARTS_` in Code.gs, `tools/index-html.mjs`). Do after 1 (less code to move).

## 3. Speed Log check
After a day of use with the code-cache build: compare PWA load rows before / after 2026-11-25.

## Parked (Calendar focus is parked behind the PWA)
- O — follow the now line (questions in docs/NOTES.md history / ask fresh).
