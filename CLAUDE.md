# Gantt 3 Columns — notes for Claude

- **Commit as Julius** (so it counts on his GitHub graph): `git -c user.name="Julius Simtim" -c user.email="juliussimtim@gmail.com" commit ...`. Never commit as "Claude <noreply@anthropic.com>"; Claude goes only in a Co-Authored-By trailer.
- Google Apps Script web app (Today / Notes / Reference columns over a Google Sheet). Pushing to `main` runs `clasp push` via `.github/workflows/deploy.yaml`, so keep commits small and working. Julius opens the **/dev test link** (latest pushed code, ~30 s after a push, then tap ↻); the workflow no longer updates a versioned /exec deployment (200-version cap, 2026-10-27). Julius mostly works from his phone.
- Files: `Code.gs` (server), `Index.html` (all UI), `appsscript.json`.
- **Keep this file short** (Julius 2026-10-31). Detailed feature notes live in `docs/NOTES.md`; open only the section you need (`grep -n "^## " docs/NOTES.md`, then read that range). New feature notes go there, not here.
- Be token-lean: if a request is vague, ask Julius a short clarifying question before digging through `Index.html` (~9.8k lines); grep for the function/section instead of reading whole files.

## Central Data Hub card (2026-10-29, Julius: permanent rule)

- Reference card titled **Central Data Hub** (Sheet "New Gantt Sheet" → `Reference`; title in column D, HTML in column E — find it by title, never by row number) is the home for cross-AI integration: shared master instructions, source-of-truth architecture, sync between ChatGPT / Claude / Gemini / Gantt / Calendar / GitHub / Docs / Sheets.
- Anything hub-related ("add this to the Central Data Hub", or a related idea) is appended to that card under the right section as a check-line `<b>Title</b>: details` — no new card, no `tasks.js` / Backlog entry. Reread the card first, check for duplicates, keep existing lines, done states and formatting. Stays Can be later (`data-urg="3"`) unless Julius sets urgency or a deadline; if a hub task becomes urgent, mirror only the actionable line into the urgency system and keep the details in the card.
- Architecture: Gantt Sheet = tasks / urgency / day logs; Calendar = time; Google Docs = long-form plans + canonical shared AI instructions; Sheets = structured data; GitHub = code, deploy config, repo CLAUDE.md. Claude = coding; ChatGPT = planning and coordination.

## README is the feature list — always keep it current

- `README.md` lists every feature under: ✅ Working · 🧪 To be confirmed · 🔧 To be improved · 📋 To do · 💤 Shelved.
- **Every change that adds, changes or removes a feature must update `README.md` in the same commit.** New work goes under 🧪 To be confirmed (with the date); move it to ✅ Working once Julius says it works; anything he wants tweaked goes under 🔧; ideas he mentions but hasn't asked to build go under 📋. Update the "Last updated" date.
- Keep useful info that's removed from the screen (e.g. the shortcuts list) in the README.

## Claude adds open tasks (2026-10-27, Julius)

- "Add this to the Gantt …" = an open task, not an inbox item: append to `CLAUDE_TASKS` in `tasks.js` `{ id: 't-YYYYMMDD-slug', date: 'YYYY-MM-DD' (usually today), title, urg: 1|2|3, subtasks: [...] }` and push. His urgency words: "for later" / "can be later" = 3 (blue), "next" / "kind of urgent" = 2 (yellow), "must do" / "really important" = 1 (red). `applyClaudeTasks_()` (Code.gs, in `getWorkspaceData()` after notes) appends them once at the end of that day's Today cell (head line `data-tid`, subtasks level 1 with the same `data-urg`); applied ids in script property `claudeTasksApplied`. Same open-tab caveat as the done log (tap ↻ first).

## Done-with-Claude log (2026-10-26, Julius: standing rule)

- **Whenever Julius finishes something through Claude (any project, not just this repo), add a line to `CLAUDE_DONE` in `donelog.js` and push**: `{ id: 'd-YYYYMMDD-short-slug', date: 'YYYY-MM-DD', project: 'Exercise Tracker', title: 'Short substantive name', details: 'what was done' }`. `project` = the app/area (Exercise Tracker, Gantt, …) and becomes the group header; `title` is the main point of the work (e.g. "In Today marker", "Reference Options button"), never the project name again (Julius, 2026-10-26). One entry per finished task; unique ids, never reused; prune entries older than ~30 days.
- Graphite transfers (2026-10-29, Julius): his own finished calendar tasks (Graphite) go in `CLAUDE_DONE` with `mine: true` → `doneItemHtml_` drops the `*` and ends the line with " X". Then rename the calendar event to start with `[x] ` (the only "accounted for" marker; no trailing X, no extra words). Skip events already starting `[x] `.
- Mechanics (applyClaudeDone_, grouping, day blocks): see `docs/NOTES.md` → "Done-with-Claude log".

## Index of docs/NOTES.md

- Inbox — REMOVED 2026-10-31 (Julius)
- Done-with-Claude log (2026-10-26, Julius: standing rule)
- Safe sync (2026-10-29, Julius: "bulletproof, never lose anything")
- Schedule cell + calendar checkboxes + empty space (2026-10-29, Julius)
- One-day view + Plan pad (2026-10-29, Julius)
- Urgent panel + view stability (2026-10-26)
- Calendar panel (2026-10-26, Julius)
- Nightly plan + wrap-up (2026-10-26, Julius)
- Note block markup + send button (2026-10-26, Julius)
- Dark text, day colors, Reference header (2026-10-27, Julius)
- Task cards + subjects (2026-10-27, Julius)
- Single-column swipe + split prompt (2026-10-27, Julius)
- Light / dark theme (2026-10-27, Julius)
- Due today group in Notes (2026-10-27, Julius)
- Title lines (2026-10-27, Julius)
- Dark tint, subject chips, checkbox fill (2026-10-27, Julius)
- Day sections (2026-10-27, Julius) — REMOVED 2026-10-29
- Saved looks → defaults (2026-10-27, Julius)
- Row + 2 columns split (2026-10-27, Julius)
- Narrow panes + Urgent made date (2026-10-27, Julius)
- Urgent task fold (2026-10-28, Julius)
- Quiet cards + focus ring (2026-10-28, Julius)
- Side space (2026-10-28, Julius)
- Drag grip (2026-10-28, Julius)
- Urgent batches (2026-10-30, Julius)
- Reference split (2026-10-31, Julius)
- Time sections in Today (2026-10-31, Julius)
- Done count + short dates (2026-10-31, Julius)
