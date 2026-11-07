# Gantt 3 Columns — notes for Claude

- **Commit as Julius** (so it counts on his GitHub graph): `git -c user.name="Julius Simtim" -c user.email="juliussimtim@gmail.com" commit ...`. Never commit as "Claude <noreply@anthropic.com>"; Claude goes only in a Co-Authored-By trailer.
- **Ship without asking** (Julius 2026-11-04): every request goes straight to `main` (merge, push, deploy) once checks pass; no "want me to merge?" question.
- **Build your own ideas** (Julius 2026-11-07): when you see an improvement or have a suggestion, just build and ship it (mention it in one line); he'll correct what he doesn't like.
- **One topic per conversation** (Julius 2026-11-05, ADHD): when he jumps to a different job or app mid-session, suggest starting a new conversation for it, in one line, before diving in. Keep replies short and skimmable: lead with the answer, a few bullets, no walls of text.
- Google Apps Script web app (Today / Notes / Reference columns over a Google Sheet). Pushing to `main` runs `clasp push` via `.github/workflows/deploy.yaml`, so keep commits small and working. Julius opens the **/dev test link** (latest pushed code, ~30 s after a push, then tap ↻); the workflow no longer updates a versioned /exec deployment (200-version cap, 2026-10-27). Julius mostly works from his phone.
- Files: `Code.gs` (server), `Index.html` (all UI), `WeekdayIcons.html` (header icons, base64), `appsscript.json`.
- **Keep this file short** (Julius 2026-10-31). Detailed feature notes live in `docs/NOTES.md`; open only the section you need (`grep -n "^## " docs/NOTES.md`, then read that range). New feature notes go there, not here.
- **"Scripts" / "user scripts" / "users"** (Julius 2026-11-06) = repo `simtimj/userscripts`, code in its `scripts/` folder (Tampermonkey: EH / EX = `eh-oldest-first.user.js`, 4chan WebM gallery). Not this app, not `apps-scripts`. Add it with `add_repo` if it isn't in the session. After every userscript push, tell Julius the new version number (e.g. "pushed v2.50.0"); the download can lag ~5 min.
- Julius's words (2026-11-01): **task cell** = a task line / card; **urgency cell** = the Urgent area; **reference cell** = a Reference card.
- **Before every push**: `node tools/check.mjs && node tools/smoke.mjs` (syntax + headless load, desktop and phone). Don't rebuild a test harness; extend `tools/smoke.mjs`.
- **Reference cards** (Julius 2026-11-04): a one-line "How to use" at the top, sections, short `<b>Name</b>: details` lines, done items out of the list, machine-only notes under a bottom `🔒 DB — don't touch` heading. Back up the old HTML to the Backup tab (copyPaste, then check `=E=…`) before a rewrite. Over ~8k characters → condense.
- Be token-lean: if a request is vague, ask Julius a short clarifying question before digging through `Index.html` (~9.8k lines); grep for the function/section instead of reading whole files.

## Central Data Hub card (2026-10-29, Julius: permanent rule)

- Reference card titled **Central Data Hub** (Sheet "New Gantt Sheet" → `Reference`; title in column D, HTML in column E — find it by title, never by row number) is the home for cross-AI integration: shared master instructions, source-of-truth architecture, sync between ChatGPT / Claude / Gemini / Gantt / Calendar / GitHub / Docs / Sheets.
- Anything hub-related ("add this to the Central Data Hub", or a related idea) is appended to that card under the right section as a check-line `<b>Title</b>: details` — no new card, no `tasks.js` / Backlog entry. Reread the card first, check for duplicates, keep existing lines, done states and formatting. Stays Can be later (`data-urg="3"`) unless Julius sets urgency or a deadline; if a hub task becomes urgent, mirror only the actionable line into the urgency system and keep the details in the card.
- Architecture: Gantt Sheet = tasks / urgency / day logs; Calendar = time; Google Docs = long-form plans + canonical shared AI instructions; Sheets = structured data; GitHub = code, deploy config, repo CLAUDE.md. Claude = coding; ChatGPT = planning and coordination.

## README is the feature list — always keep it current

- `README.md` lists every feature under: ✅ Working · 🧪 To be confirmed · 🔧 To be improved · 📋 To do · 💤 Shelved.
- **Every change that adds, changes or removes a feature must update `README.md` in the same commit.** New work goes under 🧪 To be confirmed (with the date); move it to ✅ Working once Julius says it works; anything he wants tweaked goes under 🔧; ideas he mentions but hasn't asked to build go under 📋. Update the "Last updated" date.
- Keep useful info that's removed from the screen (e.g. the shortcuts list) in the README.

## To Confirm (2026-11-04, Julius: standing rule, every project)

- **Every shipped change gets a row in the `To Confirm` tab** of New Gantt Sheet (`1D9aR_pJgddDdO5PD66IBlsDIIT_VbFKYfjvwccR08AE`, Sheets connector, alongside the Done Log row): Date `YYYY-MM-DD`, Project, Change (short name), How to check (one line he can test on his phone), Status blank. One row per feature, not per commit. It shows in the pinned **To Confirm** Reference card; ticking a line there marks it `works`.
- **Before new work in a project**, read its open rows and tell Julius how many are unchecked plus the oldest 3.
- **When Julius says something is broken / not working**, check the tab first. If it was never confirmed, say so plainly ("shipped 11/2, never checked"). Broken → Status `broken` (stays open with ⚠). Works → Status `works` + Checked on date, and move its README item from 🧪 to ✅.

## Claude adds open tasks (2026-10-27, Julius)

- "Add this to the Gantt …" = an open task, not an inbox item: append a row to the `New Tasks` tab (Sheets connector, no deploy): Date `YYYY-MM-DD` or `undated`, Title, Urgency 1/2/3, Due, Minutes, Subtasks split by ` | `, Added = current Pacific time `HH:MM` (2026-11-02: sets the Morn / After / Night section for a task dated today). `tasks.js` / `CLAUDE_TASKS` is the old route. His urgency words: "for later" / "can be later" = 3 (blue), "next" / "kind of urgent" = 2 (yellow), "must do" / "really important" = 1 (red). `applyClaudeTasks_()` (Code.gs, in `getWorkspaceData()` after notes) appends them once at the end of that day's Today cell (head line `data-tid` + `data-at`, subtasks level 1 with the same `data-urg`), and `tsecPlaceAi()` in Index.html sorts today's in on load (`data-ai-new`); applied ids in script property `claudeTasksApplied`. Same open-tab caveat as the done log (tap ↻ first).

## Urgency = color, everywhere (2026-11-05, Julius)

- When Julius sets an urgency or color ("yellow priority", "red", "can be later"…), apply it in **every place the task lives**: Gantt (`New Tasks` row Urgency 1/2/3, or `data-urg` on the line), **and** its Google Calendar event color, plus anything else he names. Mapping: 1 = red = Calendar Tomato `11`; 2 = yellow = Banana `5`; 3 = blue = Blueberry `9`; done = Graphite `8`. The app reads urgency back from the event color (`getMainCalendarEvents`), so a colored event lands in the right Cal Events box.

## Organizing Google Calendar tasks (2026-11-06, Julius: standing rule)

When he asks to organize his calendar tasks:
- **Numbers = urgency order**: titles `01 | Task name`, fresh list starts at 01, no gaps, lower first. Inserting keeps existing numbers: `00` goes ahead of 01, decimals (`1.5`) go between. Renumber the whole list only when he says reset.
- **Exact colors**: red = Tomato `11`, orange = Pumpkin (API `6`; check on the first event), yellow = Banana `5`, blue = Blueberry `9`; a named shade wins. Default order red → orange → yellow → blue. (The app maps only 11 / 5 / 9 to urgency today; orange events land unsorted.)
- **Blocks**: tasks sharing a workflow + color → one event with one number; description = checklist of the original tasks + useful notes. Re-read the block to verify the details saved **before** deleting the old entries.
- **Scoped**: move / edit only the tasks he names. All-day stays all-day unless he gives a time. New task events get reminders off unless he asks.

## Done-with-Claude log (2026-10-26, Julius: standing rule)

- **Whenever Julius finishes something through Claude (any project), append a row to the `Done Log` tab of New Gantt Sheet (`1D9aR_pJgddDdO5PD66IBlsDIIT_VbFKYfjvwccR08AE`) with the Sheets connector; no clone, push or deploy (2026-11-02, Julius).** Columns: Date `YYYY-MM-DD` (**Pacific date**, not UTC: run `TZ=America/Los_Angeles date +%F`; a UTC date put 11/4-night work into 11/5), Project (group header), Title (main point of the work, never the project name again), Details, Done by (`Claude`, `ChatGPT`, or `Julius` for his own work), Type (`New`, `Fix` or `Tweak`, 2026-11-04). One row per finished task. Never edit `Days`, or edit or delete Done Log rows. `donelog.js` is the old route; don't add to it.
- **Code changes are auto-logged** (2026-11-06): every push to `main` adds a Done Log row from the commit (`.github/scripts/build_deploy_log.py` → `applyDeployedCodeLog_`). When you write your own Done Log row for a change, add the trailer `Done-Log: manual` to its commit(s) so it isn't logged twice.
- Graphite transfers (2026-10-29, Julius): his own finished calendar tasks (Graphite) go in the Done Log with Done by `Julius` → `doneItemHtml_` drops the `*` and ends the line with " X". Then rename the calendar event to start with `[x] ` (the only "accounted for" marker; no trailing X, no extra words). Skip events already starting `[x] `.
- Rows apply on the next app load via `sheetDoneRows_()` / `sheetTaskRows_()`; the id is a hash of the row text. Done Log rows older than 30 days are ignored.
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
- Undated Tasks + tight Urgent (2026-11-01, Julius) — Backlog card renamed
- Urgent batches (2026-10-30, Julius)
- Reference split (2026-10-31, Julius)
- Time sections in Today (2026-10-31, Julius)
- Done count + short dates (2026-10-31, Julius)
- Weekday icons (2026-10-31, Julius)
- Notes split + Review (2026-10-31, Julius: option A) — HIDDEN 2026-10-31
- Grips + edge-to-edge note cells (2026-10-31, Julius)
- Edge grips (2026-11-01, Julius)
- Task mirrors (2026-11-01, Julius: spec phase 1)
- Center Up / Down + planning pause (2026-11-01, Julius: spec, PENDING)
- Drag into Blocks + block borders (2026-11-04, Julius)
- History log types (2026-11-04, Julius: option 1)
- To Confirm card (2026-11-04, Julius)
- Pinned Reference cards (2026-11-04, Julius)
- IT study log (2026-11-04, Julius)
- History detail modes + fold fixes (2026-11-04, Julius)
- Urgent checkmarks (2026-11-04, Julius)
- Keep In Mind free list (2026-11-05, Julius)
- Fast start + live updates (2026-11-05, Julius)
- Block timer MVP (2026-11-05, Julius)
- Time windows, future-dated done lines, title menu (2026-11-05, Julius)
- Cal Events 4-box view (2026-11-05, Julius)
- Urgent tick = log + archive (2026-11-05, Julius)
- Time Tracker app (2026-11-05, Julius: separate app in `tracker/`, `?app=tracker`)
- Fun for later tab (2026-11-05, Julius)
- New things tab (2026-11-07, Julius)
- Urgent add box = real task (2026-11-05, Julius)
- Day Review levels + Vivaldi → MISC (2026-11-05, Julius)
- Tuck strips + pull tabs (2026-11-06, Julius)
- Done → Dailies matching (2026-11-05, Julius: first version)

## IT study log (2026-11-04)

- ChatGPT appends study sessions to the `Study Sessions` tab; `StudyLog.gs` turns them into folded History entries per Morning / Afternoon / Evening and a `Study Review` tab. Protocol + spec: `docs/IT_STUDY_HISTORY_AUTOMATION.md`; mechanics: `docs/NOTES.md` → "IT study log". Never fabricate study counts.
