# Rules for non-code jobs (moved out of CLAUDE.md 2026-11-21 to save tokens; content unchanged)

Open only the section you need: `grep -n "^## " docs/RULES.md`.

## Userscripts repo
- **"Scripts" / "user scripts" / "users"** (Julius 2026-11-06) = repo `simtimj/userscripts`, code in its `scripts/` folder (Tampermonkey: EH / EX = `eh-oldest-first.user.js`, 4chan WebM gallery). Not this app, not `apps-scripts`. Add it with `add_repo` if it isn't in the session. After every userscript push, tell Julius the new version number (e.g. "pushed v2.50.0"); the download can lag ~5 min. Read the README `## Rules` there first (EH and 4chan auto-update via live loaders).

## Reference cards
- **Reference cards** (Julius 2026-11-04): a one-line "How to use" at the top, sections, short `<b>Name</b>: details` lines, done items out of the list, machine-only notes under a bottom `🔒 DB — don't touch` heading. Back up the old HTML to the Backup tab (copyPaste, then check `=E=…`) before a rewrite. Over ~8k characters → condense.

## Central Data Hub card (2026-10-29, Julius: permanent rule)

- Reference card titled **Central Data Hub** (Sheet "New Gantt Sheet" → `Reference`; title in column D, HTML in column E — find it by title, never by row number) is the home for cross-AI integration: shared master instructions, source-of-truth architecture, sync between ChatGPT / Claude / Gemini / Gantt / Calendar / GitHub / Docs / Sheets.
- Anything hub-related ("add this to the Central Data Hub", or a related idea) is appended to that card under the right section as a check-line `<b>Title</b>: details` — no new card, no `tasks.js` / Backlog entry. Reread the card first, check for duplicates, keep existing lines, done states and formatting. Stays Can be later (`data-urg="3"`) unless Julius sets urgency or a deadline; if a hub task becomes urgent, mirror only the actionable line into the urgency system and keep the details in the card.
- Architecture: Gantt Sheet = tasks / urgency / day logs; Calendar = time; Google Docs = long-form plans + canonical shared AI instructions; Sheets = structured data; GitHub = code, deploy config, repo CLAUDE.md. Claude = coding; ChatGPT = planning and coordination.

## Current component naming — 2026-11-10

**Next Steps** replaces the former Urgent section/top-right urgency cell. Reference (Ref/Fridge) holds full project context and backlog; Next Steps holds immediate actions; CalEvents schedules them. Preserve urgency colors, numeric/decimal ordering and all task IDs. “Urgent” still names the red priority level. Full rules: docs/PLANNING_WORKFLOW.md.

## To Confirm (2026-11-04, Julius: standing rule, every project)

- **Cheap read (2026-11-21):** the `To Confirm Open` tab is a live FILTER of the open rows (Status ≠ works), oldest first. For the count + oldest 3, read `To Confirm Open!A1:C4` and `To Confirm Open!A:A` (count = rows − 1). Never read the whole `To Confirm` tab for this.

- **Every shipped change gets a row in the `To Confirm` tab** of New Gantt Sheet (`1D9aR_pJgddDdO5PD66IBlsDIIT_VbFKYfjvwccR08AE`, Sheets connector, alongside the Done Log row): Date `YYYY-MM-DD`, Project, Change (short name), How to check (one line he can test on his phone), Status blank. One row per feature, not per commit. It shows in the pinned **To Confirm** Reference card; ticking a line there marks it `works`.
- **Before new work in a project**, read its open rows and tell Julius how many are unchecked plus the oldest 3.
- **When Julius says something is broken / not working**, check the tab first. If it was never confirmed, say so plainly ("shipped 11/2, never checked"). Broken → Status `broken` (stays open with ⚠). Works → Status `works` + Checked on date, and move its README item from 🧪 to ✅.

## Claude adds open tasks (2026-10-27, Julius)

- "Add this to the Gantt …" = an open task, not an inbox item: append a row to the `New Tasks` tab (Sheets connector, no deploy): Date `YYYY-MM-DD` or `undated`, Title, Urgency **0/1/2** (header `Urgency 0-2`; words Urgent / Soon / Later also work), Due, Minutes, Subtasks split by ` | `, Added = current Pacific time `HH:MM` (2026-11-02: sets the Morn / After / Night section for a task dated today). `tasks.js` / `CLAUDE_TASKS` is the old route. His urgency words: "for later" / "can be later" = 2 (blue), "next" / "kind of urgent" = 1 (yellow), "must do" / "really important" = 0 (red). (Inside the app `data-urg` stays 1/2/3 = 0/1/2 shown; `intakeUrg_()` translates.) `applyClaudeTasks_()` (Code.gs, in `getWorkspaceData()` after notes) appends them once at the end of that day's Today cell (head line `data-tid` + `data-at`, subtasks level 1 with the same `data-urg`), and `tsecPlaceAi()` in Index.html sorts today's in on load (`data-ai-new`); applied ids in script property `claudeTasksApplied`. Same open-tab caveat as the done log (tap ↻ first).

## Urgency = color, everywhere (2026-11-05, Julius)

- When Julius sets an urgency or color ("yellow priority", "red", "can be later"…), apply it in **every place the task lives**: Gantt (`New Tasks` row Urgency 0/1/2, or `data-urg` 1/2/3 on the line), **and** its Google Calendar event color, plus anything else he names. Urgency reads **0 / 1 / 2** (2026-11-08). Mapping: 0 = red = Calendar Tomato `11`; 1 = yellow = Banana `5`; 2 = blue = Blueberry `9`; done = Graphite `8` (stored `data-urg` is still 1 / 2 / 3). The app reads urgency back from the event color (`getMainCalendarEvents`), so a colored event lands in the right Cal Events box.

## Organizing Google Calendar tasks (2026-11-06, Julius: standing rule)

When he asks to organize his calendar tasks:
- **Numbers = urgency order**: titles `01 | Task name`, fresh list starts at 01, no gaps, lower first. Inserting keeps existing numbers: `00` goes ahead of 01, decimals (`1.5`) go between. Renumber the whole list only when he says reset.
- **Exact colors**: red = Tomato `11`, orange = Pumpkin (API `6`; check on the first event), yellow = Banana `5`, blue = Blueberry `9`; a named shade wins. Default order red → orange → yellow → blue. (The app maps only 11 / 5 / 9 to urgency today; orange events land unsorted.)
- **Blocks**: tasks sharing a workflow + color → one event with one number; description = checklist of the original tasks + useful notes. Re-read the block to verify the details saved **before** deleting the old entries.
- **Scoped**: move / edit only the tasks he names. All-day stays all-day unless he gives a time. New task events get reminders off unless he asks.

## Done-with-Claude log (2026-10-26, Julius: standing rule)

- **Whenever Julius finishes something through Claude (any project), append a row to the `Done Log` tab of New Gantt Sheet (`1D9aR_pJgddDdO5PD66IBlsDIIT_VbFKYfjvwccR08AE`) with the Sheets connector; no clone, push or deploy (2026-11-02, Julius).** Columns: Date `YYYY-MM-DD` (**Pacific date**, not UTC: run `TZ=America/Los_Angeles date +%F`; a UTC date put 11/4-night work into 11/5), Project (group header), Title (main point of the work, never the project name again), Details, Done by (`Claude`, `ChatGPT`, or `Julius` for his own work), Type (`New`, `Fix` or `Tweak`, 2026-11-04). One row per finished task. Never edit `Days`, or edit or delete Done Log rows. `donelog.js` is the old route; don't add to it.
- **Code changes are auto-logged** (2026-11-06): every push to `main` adds a Done Log row from the commit (`.github/scripts/build_deploy_log.py` → `applyDeployedCodeLog_`). When you write your own Done Log row for a change, add the trailer `Done-Log: manual` to its commit(s) so it isn't logged twice.
- **"↪ " events are moved tasks, not done work** (calendar backlog, 2026-11-12): they sit on yesterday and roll forward daily until Julius drags them onto a day. **They keep their own color** (= urgency; 2026-11-13, Julius — the Grape recolor is gone). Skip them in Graphite → Done Log transfers (by the "↪ " prefix); Graphite is strictly = done.
- Graphite transfers (2026-10-29, Julius): his own finished calendar tasks (Graphite) go in the Done Log with Done by `Julius` → `doneItemHtml_` drops the `*` and ends the line with " X". Then rename the calendar event to start with `[x] ` (the only "accounted for" marker; no trailing X, no extra words). Skip events already starting `[x] `.
- Rows apply on the next app load via `sheetDoneRows_()` / `sheetTaskRows_()`; the id is a hash of the row text. Done Log rows older than 30 days are ignored.
- Mechanics (applyClaudeDone_, grouping, day blocks): see `docs/NOTES.md` → "Done-with-Claude log".

## IT study log (2026-11-04)

- ChatGPT appends study sessions to the `Study Sessions` tab; `StudyLog.gs` turns them into folded History entries per Morning / Afternoon / Evening and a `Study Review` tab. Protocol + spec: `docs/IT_STUDY_HISTORY_AUTOMATION.md`; mechanics: `docs/NOTES.md` → "IT study log". Never fabricate study counts.

