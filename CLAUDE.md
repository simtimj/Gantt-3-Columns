# Gantt 3 Columns — notes for Claude

Google Apps Script web app (Today / Notes / Reference columns over a Google Sheet). Files: `Code.gs` (server), `Index.html` (UI shell) + `Index_*.html` parts (Css / Main / Cards / Extras / Calendar / Layout — see docs/CODE_MAP.md; grep, never read whole), `WeekdayIcons.html`, `appsscript.json`. Push to `main` → `clasp push` (deploy.yaml); Julius tests on the **/dev link** (~30 s, tap ↻), mostly from his phone.

## Token-lean coding (Julius 2026-11-21: usage efficiency matters)
- **One feature = one session.** When Julius brings a new feature idea mid-session, suggest a new session in one line; fixes to the feature in hand stay.
- Start from `docs/CODE_MAP.md` (area → grep word), then grep and read only that range. `docs/NOTES.md`: `grep -n "^## "` then read the one section. Vague request → one short question first.
- Write decisions to NOTES / README as they're made (the next session only knows what's written).
- Non-code jobs (Sheets rows, calendar, Done Log, Reference cards, Central Data Hub, userscripts, IT study log): rules in `docs/RULES.md`, open the section you need.

- **Storage rule (2026-11-21)**: new features read/write data only via `Store.*` (`Store.gs`), never the Sheet or Properties directly; `check.mjs` fails on any direct call outside Store.gs. New data = a new `Store.<area>`; `Store.sheetFirst(tab)` only for tabs people/other AIs write directly (list in Store.gs). NOTES "H2".

## Git + checks
- **Commit as Julius**: `git -c user.name="Julius Simtim" -c user.email="juliussimtim@gmail.com" commit ...`; Claude only in Co-Authored-By.
- **Before every push**: `node tools/check.mjs && node tools/smoke.mjs` (`SMOKE_ONLY=calendar` etc. to run one suite while iterating). Extend `tools/smoke.mjs`, don't build a new harness.
- **Ship small, confirm big**: small changes go straight to `main` once checks pass. Big (new feature, rewrite, multi-file, risky) → one short confirm (what + plan bullets) first.
- **Build your own ideas**: just ship them, mention in one line.
- Every push to `main` auto-logs a Done Log row; if you write one by hand, add trailer `Done-Log: manual`.

## Docs every change
- `README.md` = feature list (✅ Working · 🧪 To be confirmed · 🔧 To be improved · 📋 To do · 💤 Shelved). Every feature change updates it in the same commit: new → 🧪 with date; Julius says works → ✅; update "Last updated".
- Efficiency changes also update `docs/EFFICIENCY_HANDOFF.md`; planning decisions `docs/PLANNING_WORKFLOW.md`. Say proposed / implemented / tested / user-confirmed. No private task contents in the repo.
- **To Confirm: dropped** (Julius 2026-11-21: "forget about it, way too many"): no new rows, don't report counts.

## Talking with Julius (ADHD, phone)
- Short, skimmable: lead with the answer, a few bullets.
- Planning: agree the idea → flesh out → **one batched numbered list** of questions grouped by topic; save answers to `docs/NOTES.md`.
- Wrap-up = two narrow tables: **what was done** (area · what changed), then **what's next** (option · what it is · why now), lettered A, B, C… with stable letters; show the current order.

## His words
- **Time section** = Morn / After / Night (History): change one, change all three.
- **calendar / main calendar** = docked right-side calendar; **big calendar** = pop-out.
- **task cell** = task line / card; **urgency cell** = Urgent area (now **Next Steps**); **reference cell** = Reference card. "Urgent" still = the red level.
- Urgency 0 / 1 / 2 = red / yellow / blue (stored `data-urg` 1 / 2 / 3); Calendar colors 11 / 5 / 9, done = 8.
