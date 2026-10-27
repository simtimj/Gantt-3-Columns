# Gantt 3 Columns — notes for Claude

- Google Apps Script web app (Today / Notes / Reference columns over a Google Sheet). Pushing to `main` auto-deploys via `.github/workflows/deploy.yaml`, so keep commits small and working. Julius mostly works from his phone.
- Files: `Code.gs` (server), `Index.html` (all UI), `appsscript.json`.

## README is the feature list — always keep it current

- `README.md` lists every feature under: ✅ Working · 🧪 To be confirmed · 🔧 To be improved · 📋 To do · 💤 Shelved.
- **Every change that adds, changes or removes a feature must update `README.md` in the same commit.** New work goes under 🧪 To be confirmed (with the date); move it to ✅ Working once Julius says it works; anything he wants tweaked goes under 🔧; ideas he mentions but hasn't asked to build go under 📋. Update the "Last updated" date.
- Keep useful info that's removed from the screen (e.g. the shortcuts list) in the README.

## Inbox — how Claude adds items (2026-10-26)

- When Julius says "add to my Gantt inbox: …" (or captures an idea for the planner), clean it up into a concise title + details and append to `CLAUDE_INBOX` in `inbox.js`: `{ id: 'c-YYYYMMDD-short-slug', title: 'Concise title', details: 'what else is needed', added: 'YYYY-MM-DD' }`. Ids must be unique and never reused. Push to `main`; it shows in the app in ~1 min, rendered **Title**: details.
- Claude can't reach Google from its workspace, so this file is the pipeline. Dismissed / sent-to-Today ids are stored in the app's user properties (`inboxDone`), so handled items stay hidden; prune entries older than ~30 days when editing the file.
- Items typed in the app live in user properties (`inboxItems`). Server: `getInbox()`, `addInboxItem()`, `dismissInboxItem()` in `Code.gs`; client: `renderInbox()`, `addTaskToToday()` in `Index.html`.
- Urgent panel create: `holdForCreate()` / `openCreateMenu()` / `createRow()` → `addTaskToToday(title, details, urg)` appends a check-line to today's Today cell. Reference options live in `#refOptions` (`initRefOptions()`); `fw.urgWrap` toggles wrapping (default on).

## Done-with-Claude log (2026-10-26, Julius: standing rule)

- **Whenever Julius finishes something through Claude (any project, not just this repo), add a line to `CLAUDE_DONE` in `donelog.js` and push**: `{ id: 'd-YYYYMMDD-short-slug', date: 'YYYY-MM-DD', project: 'Exercise Tracker', title: 'Short substantive name', details: 'what was done' }`. `project` = the app/area (Exercise Tracker, Gantt, …) and becomes the group header; `title` is the main point of the work (e.g. "In Today marker", "Reference Options button"), never the project name again (Julius, 2026-10-26). One entry per finished task; unique ids, never reused; prune entries older than ~30 days.
- `applyClaudeDone_()` in `Code.gs` runs at the start of `getWorkspaceData()`: appends each new entry once to its day's Today cell as a checked `check-line` with `data-cid="<id>"`, and records applied ids in script properties `claudeDoneApplied` (so a line he deletes stays deleted). Creates the day row if missing.
- Grouped layout (2026-10-26, Julius: batch by project, roughly chronological is fine): `groupClaudeDone_()` folds Claude's lines in a day cell into one block per project — a plain `<div data-cgrp><b><u>Project</u></b></div>` header (his own header style, no checkbox), then each item as a checked level-0 check-line `<b>*Title</b>: details` (`*` prefix, no space, marks Claude's lines — Julius 2026-10-26; added in `doneItemHtml_()` whenever there's a cid; migration flag `claudeDoneGrouped` = '2' re-rendered past days). A group sits where its first line was; new items join their project's group; lines he wrote himself stay put (check-lines right under a Claude header stay with that group). Headers are recognized by `data-cgrp` or by bold+underlined text equal to a known project. Old flat lines (`<b>Project</b>: details`) are converted, matched to entries by `data-cid` or the entry's `was` text. Groups get a blank `<p><br></p>` before/after (existing blanks reused); `doneBlocks_()` splits `<div>` and `<p>` blocks. One-time migration of past days is flagged by script property `claudeDoneGrouped`. Test: eval the done-log functions from `Code.gs` in Node with `donelog.js`.
- Caveat: an already-open app tab that saves today's cell can overwrite merged lines (they're marked applied, so they won't come back) — Julius was told to tap ↻ first.

## Urgent panel + view stability (2026-10-26)

- `collectUrgent()` also returns open lines with `data-due` but no `data-urg` as `urg: 0`; `renderUrgent()` draws them last as a grey **Due** group (no hold-to-create). Every group sorts dated first, soonest due first.
- `holdDayView()` (pointerdown on day/journal editors) restores `todayScroll` / `journalScroll` for ~400ms after a tap unless the person wheels or touch-moves; editor blur uses `syncDayHeightStable()`.

## Calendar panel (2026-10-26, Julius)

- `#calPanel` in Reference, between `#urgentPanel` and `#inboxPanel` (Urgent inserts before `calPanel`). Client: `loadCalendar()` (called from `applyWorkspaceData` after `setInbox`, on ↻, and on `visibilitychange` if >5 min old) → `renderCalendar()`; collapse state localStorage `fw.calOpen`. Server: `getCalendarEvents()` in `Code.gs` reads `EVENT_CALENDARS` (main + Events) for today through `EVENT_DAYS_AHEAD` (3) days and returns `{today, events:[{title, cal, allDay, date, endDate, start, end, location, link}]}`. Loaded async so it can't slow or break startup.
- Needs the Calendar scope: if the app asks for access, approve it; or run `authorizeCalendar()` once in the script editor.
- Everything Claude puts on his calendar shows here automatically; the planned dog-walk "walking block" events will too once that script writes them to the main calendar.

## Nightly plan + wrap-up (2026-10-26, Julius)

- A scheduled task ("Gantt: nightly wrap-up + plan", ~10 pm Pacific) reads the Sheet "New Gantt Sheet" (id `1D9aR_pJgddDdO5PD66IBlsDIIT_VbFKYfjvwccR08AE`, tab `Days`: Date / Today / Journal) via the Google Sheets connector, plus the Daily Work Log, `donelog.js` and Google Calendar, then appends two entries to `CLAUDE_NOTES` in `dayplan.js` and pushes: `kind:'wrap'` for today (end of Notes cell) and `kind:'plan'` for tomorrow (top of Notes cell). Format and line markup are in the file header.
- `applyClaudeNotes_()` in `Code.gs` runs in `getWorkspaceData()` after `applyClaudeDone_()`; each id is applied once (script property `claudeNotesApplied`); each block is a one-cell table `<table data-cnote="id" data-ckind="plan|wrap"><tbody><tr><td>…lines…</td></tr></tbody></table>` (boxed, Julius 2026-10-26; styled by `.editor table[data-cnote]` in `Index.html`). Pre-box flat blocks were converted once (`noteBlockFlatHtml_`, script property `claudeNotesBoxed`).
- Counting in the Today cell: a `check-line` is a task; `done` class or `checked` = finished; `data-urg` 1/2/3 = urgency; `data-cid` = logged by Claude.
- **Skip only what Claude already did (Julius, 2026-10-26):** if he plans tomorrow early with Claude in a chat, that Claude writes the plan as `n-<YYYYMMDD>-plan` in `dayplan.js` and pushes, so the nightly run skips it (same for an existing wrap-up id or Claude wrap-up block). It does NOT skip when he wrote his own plan in Notes (he still wants Claude's input, so it adds the Suggested day above his), or when tomorrow's calendar is already blocked out (then the plan opens with a `## Scheduled` list of those blocks as a reminder, plus only tasks not on the calendar). The nightly run never creates or changes calendar events.

## Note block markup + send button (2026-10-26, Julius)

- `noteLineHtml_()` in `Code.gs`: `- x` → dash line (no dots), `[] x` → unchecked check-line with `data-send="1"`, `__x__` → underline. Style rules for wrap/plan are in the `dayplan.js` header.
- `rev` on a CLAUDE_NOTES entry: re-renders an already-applied block in place once per rev (applied key `id@rev`); deleted blocks stay deleted.
- "→ Day" is a CSS `::after` on `table[data-cnote] .check-line[data-send]`; `maybeOpenSendMenu()` (journal editors, pointerdown capture, right ~72px of the line) → `openSendMenu()` → `sendNoteTask()`: client `addTaskToDay()` when that day is loaded, else server `appendTaskToDay(date, html)`; then the line is removed from the note.
- Nesting + cells (2026-10-26, Julius): leading spaces in a line (2 per level) → `[]` subtasks get `data-level`/margin, plain lines get padding (detail lines). `cells:true` on an entry splits each `##` section into its own `<tr>` (`data-ccells`), drops blank lines and gives `- ` entries and `__Area__` lines `padding-top:6px`. "→ Day" uses `noteTaskTree()` (the line + following deeper check-lines) → `addTasksToDay()` or server `appendTasksToDay(date, [{html, level}])`.
- Send menu (2026-10-26, Julius): Today / Tomorrow show `shortDayLabel()` ("10/27 Tue") in a `<small>`. Second row "Reference" `<select>` (`referenceTargets()`: every `.ref-cell-wrapper` in tree order, title = its `h2`, indented by depth; `guessReferenceTarget()` matches title words to the task, else localStorage `fw.sendRef`) → `sendNoteToReference()` appends the task tree as open check-lines to that ref cell and removes it from the note. Mirroring Today ↔ Reference is a 📋 to-do.
- Drag-and-drop to days: done with task cards (below).

## Dark text, day colors, Reference header (2026-10-27, Julius)

- Dark mode text: JS sets `--dm-l` (20–100); `--dm-text`, `--dm-muted`, `--muted`, `--done`, `--text` derive from it. Dark inline colors (luminance < .35, e.g. pasted black) get `data-dkc` from a MutationObserver and are painted `--dm-text` in dark mode.
- Day colors: per-day bases `--day-bg` (light bg), `--note-line`, `--today-border`; always use `--note-line-adj` / `--today-border-adj` (mixed with white `--dc-w` / black `--dc-k` from the `#dayColorAdj` slider, localStorage `fw.dayColorAdj`).
- Reference header holds `.reference-sort-bar` (Sort select, −, Options). Reference-only padding: `--ref-pad-x` / `--ref-pad-y` (sliders in `#refOptions`, localStorage `fw.refPadX`/`fw.refPadY`), multiplied with the main `--pad-x`/`--pad-y`.

## Task cards + subjects (2026-10-27, Julius)

- Card = a level-N `check-line` that is a direct child of an editor plus the following deeper check-lines. Drawn by `refreshCards(ed)` (last `<script>` in `Index.html`) with render-only attributes `data-tc` (f/m/l), `data-tchead`, `data-tcrel`, `data-tccat`, `data-tcdrag`; `cardCleanHtml()` strips them in `saveDay()` and `saveRefFromDom()` — never persist them. A MutationObserver on `#workspace` re-runs it (debounced). Lines inside note tables aren't cards.
- Subject = saved `data-cat` on the card's head line (`code`, `career`, `study`, `work`, `health`, `life`, `fun`, or `none`); set from the checkbox hold menu (`addCardSubjectRow()` called in `showUrgencyPicker()`). No `data-cat` → auto guess `guessCardCat(head, ctx, ctxGrp, rest)`: (1) trailing ` · Name` tag on the head (`cardCatTag`, subject name/key or its words) wins; (2) under a `data-cgrp` Claude project header, the header decides; (3) else `cardCatScore`: non-overlapping keyword hits, longest phrase first (`cardCatHits`), weights head ×2, nearest header-like line / Ref `h2` ×3, subtasks ×1, tie → first hit in the head. Julius 2026-10-27: "stretch" in a Gantt line had turned it Health. Hold menu's Auto label reads the rendered `data-tccat`. Subjects `{key,name,color,words}` are editable in Options (`renderCardCatEditor`); defaults `CARD_CATS_DEFAULT`; saved via server `saveCardCats()` to user property `cardCats` (returned as `cardCats` in `getWorkspaceData`, applied by `applyServerCardCats`), cached in localStorage `fw.cardCats`; `setCardCats()` rebuilds regexes + color CSS. Options: `fw.cards`, `fw.cardsAuto`. Options panel: `.ts-body` uses CSS columns (300px) so it grows right; rows are one-line grids.
- Drag: pointerdown on a card checkbox, move > 8px → drag (works after the urgency hold too; hides the picker). Checkboxes have `touch-action:none`. Drop target = editor under the pointer (`targetAt`), level = original ± horizontal drag / 28px, capped at the line above + 1. Moves nodes, `captureBeforeEdit`/`finishEditorEdit` both editors, `urgChanged()` both.

## Single-column swipe + split prompt (2026-10-27, Julius)

- `initSingleSwipe()` (Index.html, before `initColumnResizers()`): active when `visiblePanes.length===1` and not split. Touch: lock horizontal after 10px (|dx| > 1.5·|dy|, no text selection), then `preventDefault` and slide the current pane + neighbor (`.swipe-cur` / `.swipe-next`, absolutely placed beside it) with `#swipeSeam`; release past 30% → `applyWorkspaceView([next])`. Order is `VIEW_PANES`, no wrap. Holding ~450ms with the seam in 30–70% opens `#swipeSplitMenu` → `setSplit(true)` with `splitOptions` first/second in column order (side by side uses the seam as `mobileSplitRatio`). Skips inputs/buttons/links (so card checkbox drag is untouched). Wheel deltaX > 160 → one column. The 2-column peek (`PEEK_ENABLED`) is still paused.

## Light / dark theme (2026-10-27, Julius)

- `fwTheme` (script at end of `<head>`): `collect()` moves every `@media (prefers-color-scheme: dark)` rule into `<style id="themeDarkCss">`, enabled only when the theme is dark; called after each `<style>` block and at the end of `<body>`. **Write new dark CSS the same way** (inside `@media (prefers-color-scheme: dark)`) and it gets picked up. Device default from `deviceType()`: desktop → light, phone/tablet → dark; saved choice in localStorage `fw.theme` (none = Auto). UI: `#themeToggle` (tap flips, hold 600ms → Auto), `#themeSelect` in Options.

## Due today group in Notes (2026-10-27, Julius)

- `renderDueBlocks()` now draws `.due-notes` (contenteditable=false, `data-render-due`) INSIDE each `#journalScroll .journal-editor`, placed by `placeDueNotes()` right after `table[data-cnote][data-ckind=plan]` or at the top. Render-only: `cardCleanHtml()` removes `[data-render-due]` on save — keep it that way. Old `#todayScroll .due-block` copies are removed. Collapse per date in localStorage `fw.dueNotesOpen` (default open only on today).
- Events are delegated in `initDueNotes()` (survives undo restoring stale HTML): head click toggles; `.di-box` click → `toggleDueTask`; `.di-text` (contenteditable when the source day is loaded) input → writes source `.check-text` via `dueSource()`, debounced `urgChanged(src.ed)`; input/keydown events are stopped in capture so the Notes editor doesn't treat them as its own edits; no redraw while a `.di-text` has focus. `.di-box` counts as an urgency box (`urgencyCheckbox`, `urgTarget`); picker adds `.urg-goto` (↗ Go to task) for `.di-box` / `.urg-box`.
- Theme: `.theme-toggle` buttons (main toolbar `#themeToggle` + focus bar); `themeDarkCss` is moved to the end of `<body>` on each `collect()` so it wins the cascade.
