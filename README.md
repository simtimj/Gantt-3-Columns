# Gantt 3 Columns (Focus Workspace)

Google Apps Script web app: a three-column daily workspace — **Today / Tasks**, **Notes** and **Reference** — saved to a Google Sheet. Built mostly from a phone; every push to `main` deploys automatically (`.github/workflows/deploy.yaml` → `clasp push` + update deployment).

Last updated: 2026-10-26

## Status key

- ✅ **Working** — in use and confirmed
- 🧪 **To be confirmed** — shipped, waiting for Julius to try it
- 🔧 **To be improved** — works, but has known tweaks wanted
- 📋 **To do** — wanted, not built yet
- 💤 **Shelved** — built, parked for now (code kept)

---

## ✅ Working

**Layout**
- Three columns: Today / Tasks, Notes, Reference. Columns are resizable (drag the divider), with **Fit** and **Reset sizes** buttons.
- **Cols** menu: show/hide columns, single-pane focus view, and **Split** (two panes stacked, on desktop or Mobile mode; a repeated pane is a read-only mirror).
- Mobile mode with phone-friendly sizes; toolbars stay clear of the phone camera/notch.
- Save status ("Ready") sits on the same line as the buttons without changing toolbar height.
- **↻ Refresh** reloads the whole app at its /exec URL (picks up new deploys and data).
- No double-tap zoom on buttons, menus or the toolbar. Menus/panels close on outside tap or Escape.

**Options panel** (Options button — was "Scale"; the one place for settings)
- Workspace scale (50–200%).
- Padding left/right and top/bottom as separate sliders (0–300%).
- Text font and size.

**Today / Tasks and Notes**
- One row per day; loads 7 days back and 3 ahead, then more weeks as you scroll (lazy week loading). **Today** button jumps to today.
- Rich text editor: `[]` + Space = checkbox, Tab / Shift+Tab = indent/outdent (subtasks), code blocks with ```.
- Right-click / long-press formatting menu: bold, underline, strike, indent, outdent, checkbox, subtask, horizontal rule.
- Each day saves automatically to the sheet.
- Notes **+ Template** inserts the Reference cell titled "Journal Template" into the selected Notes day.

**Urgency** (like TickTick)
- Hold a checkbox (or right-click it) → pick 1 red (Urgent) / 2 yellow (Soon) / 3 blue (Later) / none, and optionally a due date.
- Urgent panel at the top of Reference lists every urgent task from every day, grouped 1/2/3, with its subtasks underneath. Tap a task to jump to it in Today. Panel is collapsible.

**Reference**
- Cells with a title line and body; collapse/expand each, or all at once with **Ref −/+**.
- **+ Cell**, search box, drag handle to reorder (in Original order).
- Sort: Original order, Title A–Z, Last modified.
- Delete asks to confirm; deleted cells go to the **Archive** (restore any time, children come back with them).

## 🧪 To be confirmed (shipped 2026-10-26)

- **\* marks Claude's work (2026-10-26):** every line Claude logs in the Today cell starts with `*` (no space), e.g. **\*In Today marker**: purple marker on grid cells, so you can tell Claude's lines from your own. Past days were updated once too.

- **Nightly suggested day + day wrap-up (2026-10-26):** every night at ~10 pm a scheduled Claude run writes two blocks into the **Notes** column: a **Day wrap-up** at the end of today's Notes cell (how many tasks got done vs. planned, what you focused on, what carries over) and a **Suggested day** at the top of tomorrow's Notes cell (most urgent first from the Urgent panel, due dates, the Daily Work Log priorities and tomorrow's calendar gaps; then what can wait, stretch, for fun). They land the next time the app loads; delete one and it stays deleted. Done at 10 pm (not 8–9) so late work counts before the plan is made. Already planned tomorrow (or wrapped up today) yourself or with Claude earlier? The nightly run sees it and skips that part. Wrap-up details still to be worked out together.

- **Calendar panel in Reference (2026-10-26):** between Urgent and Inbox, collapsible. **Today** first (times, what's on now highlighted, past dimmed), then the next 3 days as upcoming. Reads your main calendar and Events straight from Google Calendar, so anything Claude adds (and the dog-walk block later) shows up. ↻ reloads; also refreshes when you come back to the app after 5+ min. Tap an event to open it in Google Calendar.

- **Done log spacing (2026-10-26):** a blank line before and after each project group, so groups don't run together.

- **Due group in Urgent (2026-10-26):** tasks with a due date but no urgency show in a grey **Due** group at the bottom of the Urgent panel, soonest first (they leave once checked). Urgent / Soon / Later keep sorting by due date, soonest first, undated last. Header reads `Urgent · N · Due N`.
- **Tapping a cell keeps your place (2026-10-26):** tapping into Notes (or Today) no longer moves the view; leaving a cell resizes its row without scrolling.

- **Done-with-Claude log, grouped (2026-10-26):** work done through Claude is batched under a bold, underlined project header (Exercise Tracker, Gantt…), each line leading with what was done (e.g. **In Today marker**: purple marker on grid cells). Today's lines were regrouped too.

- Sort dropdown in Reference shrunk to fit its text.
- Instructions/tips block under the Reference search removed (shortcuts kept below in this README).
- Urgency: the extra colored square around the checkbox removed — the checkbox itself is drawn in the urgency color, checked or not.
- Urgent panel keeps finished urgent tasks (struck through) until the urgency is cleared by hand.
- Reference follows the Padding left/right slider the same way Today does (one shared setting for now).
- Urgent panel: the red bar down the whole panel is gone; each level (1 Urgent, 2 Soon, 3 Later) has its own left bar and heading in its own color (red / yellow / blue).
- Due dates on urgent tasks: hold the checkbox → under the 1/2/3 buttons is a small **📅 Due date** chip; tap it and a little month calendar pops up beside the picker (right side if there's room, otherwise left/below — no phone date sheet, no grayed-out screen). Tap a day (or Today) and it's set; × clears it. The task line shows 📅 Wed, Oct 29; the Urgent panel shows the due date hugging the right ("Due Thu, Oct 29" / "Due today" bold yellow / bold red when overdue) and lists dated tasks first, soonest first. 
- Change urgency/due date from the Urgent panel: hold (or right-click) a task's colored box in the panel → same picker; it edits the task in its Today day (that day must be loaded — otherwise it says to scroll to it). A plain tap still jumps to the task.
- **Nested Reference cells (folders):** drag a cell by its ⠿ handle and hold it on another cell's title for about half a second — that cell opens and lights up blue — then let go to drop it inside (it goes to the end). Nested cells keep everything: their own collapse/expand, editing, drag, delete. Children show indented under a thin guide line and fold away when the parent is collapsed. Dropping a cell above/below another puts it beside that cell at the same level (that's also how you take one back out). Moving or deleting a parent takes its children with it; search shows a parent when something inside matches. Sorting by Title/Last modified sorts within each level.

- **Options button** replaces "Scale": same panel (scale, padding, font), now titled Options and meant to hold every setting, plus the Urgent panel settings below.
- Urgent panel rows (concise): task text always starts at the left, then the day it was made in small gray ("10/26"), and the due date hugs the right. Options → Urgent panel: **Show day made** on/off, and **Due date** style — "Tue 10/27", "Tue 10/27 · 3d" (default), or just "3d". Due today shows "Today" (bold yellow), tomorrow "Tmrw", overdue "2d late" (bold red); hover/hold shows the full date.
- **Due tasks show on their day:** a task due Oct 27 also appears at the top of the Oct 27 cell in Today/Tasks, as a small "Due ☐ task · from Mon 10/26" line in its urgency color (struck through once done). Tap it to jump to the task where it lives. Works for any task with a due date, urgent or not. (It's a pointer, not a copy — the task still lives on its original day.)

- **☐ Checkbox** in the hold / right-click menu: turns the line you're on into a task (checkbox at the start, text and formatting kept, indent kept) — same as typing `[]` + Space. Not on titles or in code blocks; says so if the line is already a task.

- **Reference Options button** (next to Sort): the Urgent panel settings moved here from the main Options — **Wrap long text** (on by default, so long urgent tasks aren't cut off), Show day made, Due date style. Main Options keeps scale, padding and fonts.
- Hold menu on a phone no longer overlaps the phone's own Cut / Copy / Paste bar: it's placed from the actual selection, on the opposite side from that bar, and moves if the selection changes.
- Sort row: the − / + and Options buttons are now the same small size as the Sort dropdown, and the row wraps onto a second line on narrow screens instead of getting cut off.
- **Done with Claude log**: work you do through Claude shows up in that day's Today / Tasks cell as checked tasks (**Short name**: what was done), added the next time the app loads. Deleting one keeps it deleted. Tap ↻ before editing today's cell, so an older open copy of the app doesn't save over the new lines.
- Day abbreviations in the Urgent panel's due dates are now Sun, Mon, **Tues**, Wed, **Thurs**, Fri, Sat (e.g. "Tues 10/27").
- **More due date styles** (Reference Options → Due date): added **Oct 27 · 3d**, **October 27th · 3d**, **Tue, Oct 27 · 3d** and **Tuesday, October 27th · 3d**, alongside Tue 10/27, Tue 10/27 · 3d and 3d.
- **− / + collapse buttons**: a boxed − / + next to Sort collapses or expands every Reference cell; the toolbar button reads Ref − / Ref +; each cell's ▾ / ▸ arrow is now a boxed − / +; the Urgent and Inbox headers use the same − / +.
- **Make tasks in the Urgent panel**: hold (or right-click) a level heading like "2 · Soon", hold the Urgent header, or tap **+ Task** → *Create Urgent / Soon / Later task* → type → Enter. It's added at the end of today's Today cell with that urgency, so it shows in the panel right away. Typing `Title: details` makes the title bold. The panel now always shows (even with nothing urgent) so + Task is always there.
- **Inbox** under Urgent (collapsed by default): quick captures shown as **Title**: details. Type one in at the bottom, or tell Claude ("add to my Gantt inbox: …") and it shows up about a minute later, tagged Claude. **→ Today** turns it into a task in today; **✕** dismisses it.

## 🔧 To be improved

- Padding: Reference may need its own padding settings later, separate from Today/Notes.

## 📋 To do

- Draggable task cards: every task becomes a card you can drag; dragging a task carries its subtasks, dragging a subtask carries only it and what's nested below.
- Hide the "created by a Google Apps Script user" banner — only if the Exercise Tracker's wrapper experiment works out (it's shelved there for being slow).

---

## 💤 Shelved

- **Focus** button (hid the top toolbar; Show toolbar brought it back) — button hidden 2026-10-26, code kept. To restore, un-comment the Focus button in `Index.html` and put back `initFocusMode()`'s saved state.

## Keyboard shortcuts (removed from the screen, kept here)

- Right-click or long-press = formatting menu (Shift+right-click = browser menu)
- Enter = new line · ⌘/Ctrl+Enter = new cell
- `[]` + Space = checkbox · Tab / Shift+Tab = indent / outdent
- ⌘/Ctrl+B / U = bold / underline · ⌘/Ctrl+Shift+X = strike task
- ``` + Enter = code block; ``` + Enter on its last line = exit

## Files

- `Code.gs` — server: serves the page, sets up the sheets, loads/saves days and Reference cells, archive, urgent days, inbox.
- `inbox.js` — Inbox items Claude adds (`CLAUDE_INBOX`).
- `donelog.js` — work done through Claude (`CLAUDE_DONE`), merged into each day's Today cell.
- `Index.html` — the whole client UI (styles + script).
- `appsscript.json` — Apps Script manifest.
