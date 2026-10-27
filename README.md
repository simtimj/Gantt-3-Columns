# Gantt 3 Columns (Focus Workspace)

Google Apps Script web app: a three-column daily workspace — **Today / Tasks**, **Notes** and **Reference** — saved to a Google Sheet. Built mostly from a phone; every push to `main` deploys automatically (`.github/workflows/deploy.yaml` → `clasp push` + update deployment).

Last updated: 2026-10-27

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
- Hold a checkbox (or right-click it) → pick 1 red (Urgent) / 2 yellow (Soon) / 3 blue (Can be later) / none, and optionally a due date.
- Urgent panel at the top of Reference lists every urgent task from every day, grouped 1/2/3, with its subtasks underneath. Tap a task to jump to it in Today. Panel is collapsible.

**Reference**
- Cells with a title line and body; collapse/expand each, or all at once with **Ref −/+**.
- **+ Cell**, search box, drag handle to reorder (in Original order).
- Sort: Original order, Title A–Z, Last modified.
- Delete asks to confirm; deleted cells go to the **Archive** (restore any time, children come back with them).

## 🧪 To be confirmed (shipped 2026-10-26)
- **Urgent header counts (2026-10-27):** the Urgent header reads **Urgent 1(1/4) 2 0** — one number per level in its color (red Urgent, yellow Soon, blue Can be later, always all three even at 0; a grey Due count appears only when there are due-only tasks). Numbers count **tasks, not subtasks**; when a level's tasks have subtasks, (done/total) follows its number. A subtask with its own different color counts as an item in that color. Hover a number for details.
- **Dark cells slider (2026-10-27):** Options → **Dark cells** sets the dark-mode background of the Today, Notes and Reference cells from black (0%) to gray (30%). Default is now a little grayer (11%, was ~7%). Saves on this device as you drag; Reset goes back to 11%. Headers and toolbar stay as they were. Tell Claude the number you settle on and it becomes the default.
- **Mini dashboard (2026-10-27):** at the very top, next to the date: **Today: 7 out of 9 tasks done** with a small progress bar. Counts every task (and subtask) in today's Today/Tasks cell, including Claude's logged ones; updates as you tick. Minimal on purpose — grow it from here.
- **Title lines (2026-10-27):** fold a run of lines to save room. Make a title: hold a task's checkbox → **▤ Make title line**, or right-click / long-press any line → **▤ Title** (same again removes it). Claude's done-log project headers (e.g. **Gantt**) are title lines automatically. A title covers every line under it down to the first empty line (or the next title). Tap the − at its right end to fold; folded it shows a score like **+ 26 out of 27 done** (just **+ 5 hidden** when there are no tasks) — tap that to open. The − / + sits right after the line's text. Folded/open is saved with the cell. Works in Today, Notes and Reference.
- **Due today group in Notes (2026-10-27):** tasks due that day (any urgency, with subtasks) sit in a boxed group under the Suggested day in the Notes cell, so Today/Tasks stays clear. − / + collapses it (open by default on today, closed on other days; remembered per day on this device); collapsed it shows "3 hidden · 1 done" and an urgency dot per task. Edit a task's text right there — it edits the real task (Enter finishes). Tap the box = done. Hold or right-click the box = the usual urgency / due date / subject menu plus **↗ Go to task** (a plain tap no longer jumps). The Urgent panel's hold menu has **↗ Go to task** too. Needs the task's own day loaded to edit it.
- **Theme button in the main toolbar (2026-10-27):** ☾/☀ now sits next to Today in the normal toolbar (it was only in Focus mode's bar); dark mode cards fixed to match the old dark look.
- **Light / dark toggle, saved per device (2026-10-27):** ☾/☀ button next to Today flips the theme and saves it on that device only; hold it to go back to the device default. Defaults: MacBook/desktop light, phone and tablet dark (ignores the OS setting). Also in Options → Theme (Auto / Light / Dark).
- **Smaller Reference panels (2026-10-27):** Urgent, Calendar and Inbox use tighter padding and spacing; the Inbox add box moved to a small **+ Add** button on its header line.

- **Swipe between columns in single view (2026-10-27)**: with one column showing, swipe sideways to the next one in order: Today/Tasks ↔ Notes ↔ Reference (no wrap; nothing left of Today or right of Reference). The next column slides in under your finger; let go past ~30% to switch, less to snap back. Trackpad: a sideways two-finger swipe moves one column.
- **Hold mid-swipe to split (2026-10-27)**: while swiping, hold still with the dividing line near the middle (it turns blue) → prompt: *Split A | B* (side by side, at the size you held), *Split stacked A / B*, *Go to B*, or *Cancel*. Exit split from Cols as usual.

- **Urgency 3 renamed "Can be later" (2026-10-27)**: blue level reads *Can be later* (nice to do, not pressing) instead of *Later* in the hold menu, Urgent panel headings and + Task.
- **Edit card subjects (2026-10-27)**: Options → **Card subjects**: set each subject's color, name and the words that auto-pick it; **+ Subject** adds one, ✕ removes one, **Reset to defaults** brings back the starting list. Saved to your account, so phone and tablet match. New default colors: Code green, Career light green, Study lavender, Work slate gray, Health pink, Life teal, Fun orange
- **Compact Options (2026-10-27)**: each setting is one line (label, slider, value, Reset) with smaller buttons and shorter labels (full name on hover); on wider screens the panel spreads into columns to the right instead of getting longer
- **Task cards (2026-10-27)**: every task is a card — checkbox + text, with its subtasks inside the same card (rounded box, a little space between cards). In Today, Notes and Reference cells. Turn off in Options → **Show tasks as cards**
- **Drag cards (2026-10-27)**: drag a task by its checkbox (quick drag, or hold then drag) to move it; its subtasks come along. Dragging a subtask takes only it and what's nested under it. Drop anywhere in the same cell, another day (Today or Notes) or a Reference cell — a blue line shows where it lands; the list scrolls when you drag near the top/bottom. Drag right while moving to nest it under the task above, left to take it out. A tap still ticks, holding still still opens the urgency menu
- **Card colors by subject (2026-10-27)**: each card's background shows its subject — Code, Career, Study, Work (dog walks), Health, Life, Fun — colors and words editable in Options. Hold the checkbox → **Card color · subject** to pick one, **Auto** to let the app guess, **None** for plain. Auto guesses from the task's words, then the header it sits under (e.g. Claude's Gantt group → Code). Options → **Color cards by subject automatically** turns guessing off (picked colors stay)
- **Urgent subtasks nest (2026-10-27)**: a task's subtasks show right under it in the Urgent panel as real checkbox rows (same box and text size as the task, indented); they're no longer listed again as separate tasks even when they share the parent's urgency. Tap one to jump to it, hold its box to change urgency
- **Urgency on Notes tasks sticks (2026-10-27)**: setting 1/2/3 on a task in Notes (e.g. a carry-over) now stays in the Urgent panel instead of vanishing a second later; tapping it jumps to the Notes line
- **Dark mode (2026-10-27)**: the app's own dark mode instead of the phone inverting it: black background, every cell (Today, Notes, Reference) is the same dark #121212 as the column headers, with gray text whose brightness is set by the **Text brightness · dark mode** slider in Options (black → white, default 52%, saved per device) and slightly dimmed day-colored lines, the day name is in the day's light color, and the note box lines and today outline use the day's light color (Tuesday light orange, Wednesday light blue…), panels and menus dark. Colors to adjust as we go
- **Note boxes match the day (2026-10-27)**: Suggested day / Day wrap-up boxes have the same medium (1.5px) line all around and between sections, the inside is the day's own color (no white), and the Focus areas and Priority check names (Gantt, Exercise Tracker, Time went to apps, Fix for tomorrow…) are bold
- **Urgency picker stays open**: picking 1/2/3/✕ keeps the menu up so you can set the due date next; tap outside to close
- **Subtasks follow urgency**: setting (or clearing) a task's urgency applies it to all its subtasks too
- **Reference Options pop-up**: Options opens as a small pop-up over Reference (nothing gets pushed down); tap outside or scroll to close
- **Send menu dates**: Today and Tomorrow show the actual date underneath in small text (e.g. 10/28 Wed)
- **→ Reference**: the send menu has a Reference picker; the task (with its subtasks) goes to the end of that Reference cell and leaves the note. Preselects the cell whose title matches the task's words, else the last one used
- **Wrap-up Priority check**: a 0–10 score on whether the day's time went to the right things, with what's still open on the priority and the fix for tomorrow
- **Carry-over subtasks**: carry-overs with parts show them as subtasks; → Day on the parent sends it with all its subtasks, → Day on a subtask sends just that one. Every carry-over is **Name**: details
- **Divided Suggested day**: each section (Must do, Next, …) sits in its own cell; each entry is a bold name with its time blocks on lines underneath, small gaps between entries (testing)
- **Suggested day sections**: Calendar (real events only, plus a dog-walk line with client first names or "none today") → Must Do / Urgent + Important (names bold + underlined, Title Cased; every section header and block title capitalized too) → Important / Not The Most Urgent → Stretch (bonus) → Later; no For fun
- **Divided Day wrap-up**: counts, Focus, Priority check and Carries over each in their own cell; Focus and Priority check entries are an underlined name with the details on the line below
- **Note box dividers in the day's color**: the box outline and the lines between sections use a deeper shade of that day's color (Wed → deeper blue; deepened again 2026-10-27 so Monday shows in dark mode), thicker, with more space around each section
- **Note blocks restyled** (2026-10-26): no colored left edge; list lines use dashes (Must do too); wrap-up skips empty stats; Focus ordered by most time, area underlined with a one-line item list under it.
- **Carry-over tasks + → Day** (2026-10-26): Carries over items are checkboxes; tap **→ Day** on the right to move one to Today, Tomorrow or a picked date's Today cell.
- **Re-render note blocks** (2026-10-26): bumping an entry's `rev` in dayplan.js updates that block in place.

- **Boxed plan and wrap-up (2026-10-26):** Claude's Suggested day (top of Notes) and Day wrap-up (bottom of Notes) now sit in their own rounded box, so they're clearly separate from your notes. Tonight's two blocks get boxed on the next load.

- **\* marks Claude's work (2026-10-26):** every line Claude logs in the Today cell starts with `*` (no space), e.g. **\*In Today marker**: purple marker on grid cells, so you can tell Claude's lines from your own. Past days were updated once too.

- **Nightly suggested day + day wrap-up (2026-10-26):** every night at ~10 pm a scheduled Claude run writes two blocks into the **Notes** column: a **Day wrap-up** at the end of today's Notes cell (how many tasks got done vs. planned, what you focused on, what carries over) and a **Suggested day** at the top of tomorrow's Notes cell (most urgent first from the Urgent panel, due dates, the Daily Work Log priorities and tomorrow's calendar gaps; then what can wait, stretch, for fun). They land the next time the app loads; delete one and it stays deleted. Done at 10 pm (not 8–9) so late work counts before the plan is made. Already planned tomorrow with Claude earlier? The nightly run skips it. Wrote your own plan? You still get Claude's suggestions above it. Calendar already blocked out? The plan starts with a **Scheduled** list of those blocks as a reminder (it never touches the calendar). Wrap-up details still to be worked out together.

- **Calendar panel in Reference (2026-10-26):** between Urgent and Inbox, collapsible. **Today** first (times, what's on now highlighted, past dimmed), then the next 3 days as upcoming. Reads your main calendar and Events straight from Google Calendar, so anything Claude adds (and the dog-walk block later) shows up. ↻ reloads; also refreshes when you come back to the app after 5+ min. Tap an event to open it in Google Calendar.

- **Done log spacing (2026-10-26):** a blank line before and after each project group, so groups don't run together.

- **Due group in Urgent (2026-10-26):** tasks with a due date but no urgency show in a grey **Due** group at the bottom of the Urgent panel, soonest first (they leave once checked). Urgent / Soon / Can be later keep sorting by due date, soonest first, undated last. Header reads `Urgent · N · Due N`.
- **Tapping a cell keeps your place (2026-10-26):** tapping into Notes (or Today) no longer moves the view; leaving a cell resizes its row without scrolling.

- **Done-with-Claude log, grouped (2026-10-26):** work done through Claude is batched under a bold, underlined project header (Exercise Tracker, Gantt…), each line leading with what was done (e.g. **In Today marker**: purple marker on grid cells). Today's lines were regrouped too.

- Sort dropdown in Reference shrunk to fit its text.
- Instructions/tips block under the Reference search removed (shortcuts kept below in this README).
- Urgency: the extra colored square around the checkbox removed — the checkbox itself is drawn in the urgency color, checked or not.
- Urgent panel keeps finished urgent tasks (struck through) until the urgency is cleared by hand.
- Reference follows the Padding left/right slider the same way Today does (one shared setting for now).
- Urgent panel: the red bar down the whole panel is gone; each level (1 Urgent, 2 Soon, 3 Can be later) has its own left bar and heading in its own color (red / yellow / blue).
- Due dates on urgent tasks: hold the checkbox → under the 1/2/3 buttons is a small **📅 Due date** chip; tap it and a little month calendar pops up beside the picker (right side if there's room, otherwise left/below — no phone date sheet, no grayed-out screen). Tap a day (or Today) and it's set; × clears it. The task line shows 📅 Wed, Oct 29; the Urgent panel shows the due date hugging the right ("Due Thu, Oct 29" / "Due today" bold yellow / bold red when overdue) and lists dated tasks first, soonest first. 
- Change urgency/due date from the Urgent panel: hold (or right-click) a task's colored box in the panel → same picker; it edits the task in its Today day (that day must be loaded — otherwise it says to scroll to it). A plain tap still jumps to the task.
- **Nested Reference cells (folders):** drag a cell by its ⠿ handle and hold it on another cell's title for about half a second — that cell opens and lights up blue — then let go to drop it inside (it goes to the end). Nested cells keep everything: their own collapse/expand, editing, drag, delete. Children show indented under a thin guide line and fold away when the parent is collapsed. Dropping a cell above/below another puts it beside that cell at the same level (that's also how you take one back out). Moving or deleting a parent takes its children with it; search shows a parent when something inside matches. Sorting by Title/Last modified sorts within each level.

- **Options button** replaces "Scale": same panel (scale, padding, font), now titled Options and meant to hold every setting, plus the Urgent panel settings below.
- Urgent panel rows (concise): task text always starts at the left, then the day it was made in small gray ("10/26"), and the due date hugs the right. Options → Urgent panel: **Show day made** on/off, and **Due date** style — "Tue 10/27", "Tue 10/27 · 3d" (default), or just "3d". Due today shows "Today" (bold yellow), tomorrow "Tmrw", overdue "2d late" (bold red); hover/hold shows the full date.
- **Due tasks show on their day — in Notes (moved 2026-10-27):** a task due Oct 27 shows in the Oct 27 **Notes** cell (no longer in Today/Tasks) as its own boxed **Due today** group, right under Claude's Suggested day (or at the top). See 🧪 for details. It's a live copy — the task still lives on its original day.

- **☐ Checkbox** in the hold / right-click menu: turns the line you're on into a task (checkbox at the start, text and formatting kept, indent kept) — same as typing `[]` + Space. Not on titles or in code blocks; says so if the line is already a task.

- **Reference Options button** (next to Sort): the Urgent panel settings moved here from the main Options — **Wrap long text** (on by default, so long urgent tasks aren't cut off), Show day made, Due date style. Main Options keeps scale, padding and fonts.
- Hold menu on a phone no longer overlaps the phone's own Cut / Copy / Paste bar: it's placed from the actual selection, on the opposite side from that bar, and moves if the selection changes.
- Sort row: the − / + and Options buttons are now the same small size as the Sort dropdown, and the row wraps onto a second line on narrow screens instead of getting cut off.
- **Done with Claude log**: work you do through Claude shows up in that day's Today / Tasks cell as checked tasks (**Short name**: what was done), added the next time the app loads. Deleting one keeps it deleted. Tap ↻ before editing today's cell, so an older open copy of the app doesn't save over the new lines.
- Day abbreviations in the Urgent panel's due dates are now Sun, Mon, **Tues**, Wed, **Thurs**, Fri, Sat (e.g. "Tues 10/27").
- **More due date styles** (Reference Options → Due date): added **Oct 27 · 3d**, **October 27th · 3d**, **Tue, Oct 27 · 3d** and **Tuesday, October 27th · 3d**, alongside Tue 10/27, Tue 10/27 · 3d and 3d.
- **− / + collapse buttons**: a boxed − / + next to Sort collapses or expands every Reference cell; the toolbar button reads Ref − / Ref +; each cell's ▾ / ▸ arrow is now a boxed − / +; the Urgent and Inbox headers use the same − / +.
- **Make tasks in the Urgent panel**: hold (or right-click) a level heading like "2 · Soon", hold the Urgent header, or tap **+ Task** → *Create Urgent / Soon / Can be later task* → type → Enter. It's added at the end of today's Today cell with that urgency, so it shows in the panel right away. Typing `Title: details` makes the title bold. The panel now always shows (even with nothing urgent) so + Task is always there.
- **Inbox** under Urgent (collapsed by default): quick captures shown as **Title**: details. Tap the small **+ Add** on the Inbox header line to type one in (the add box stays hidden otherwise; empty Add or Esc closes it), or tell Claude ("add to my Gantt inbox: …") and it shows up about a minute later, tagged Claude. **→ Today** turns it into a task in today; **✕** dismisses it.

- **Text brightness fix (2026-10-27)**: all dark mode text now follows the Text brightness slider — dimmer labels, done tasks, quotes, code blocks, the calendar's today line and dark pasted/inline-colored text (that last stayed near-black before)
- **Day colors slider (2026-10-27)**: Options → **Day colors · darker / lighter** (−60…+60, default 0, saved per device) lightens or darkens everything in a day's color (Tue orange, Wed blue…): day names, note box lines, today outline, and the light-mode day backgrounds
- **Reference header (2026-10-27)**: Sort / − / Options moved up into the REFERENCE header on the right (one less row); search, + Cell and Archive row is shorter
- **Reference padding (2026-10-27)**: Reference → Options has its own Left/right and Top/bottom padding sliders that apply only to Reference (on top of the main padding sliders)

- **Made date by the text (2026-10-27)**: in Urgent, the day-made date (10/26) now sits at the end of the task's text in its muted color, instead of near the right edge; due date stays on the right (with Wrap long text on)

- **Urgency boxes in dark mode (2026-10-27)**: urgency checkboxes are dark inside with the colored border (were white squares); checked ones fill with the urgency color

- **Full Due tasks on their day (2026-10-27)**: a task due on a day shows at the top of that day's Today cell as the whole task — real urgency-colored checkboxes, full wrapped text in the normal size, and its subtasks indented (no colored edge line); ticking a box ticks the real task, tapping the text jumps to it (day it lives on must be loaded)

- **Smarter card subjects (2026-10-27)**: end a task with ` · Gantt` or ` · Code` (middle dot) to set its subject outright; any subject name or a word from its list works (Gantt → Code). Claude's done-log lines follow their project header (Gantt group → Code). Otherwise words are weighed instead of first-match: longer phrases win ("exercise tracker" = Code, not Health), the task's words count double, a header above counts triple, subtasks once; most points wins.

- **Dark cells tint** (2026-10-27): color picker next to the Dark cells slider in Options; the slider goes from black toward that color (e.g. purple → a touch of purple, still dark). White = plain gray. Reset clears both.
- **Card subjects collapsed** (2026-10-27): Options → Card subjects is closed by default and shows small color chips; tap the header or chips to open the editor (rows now one line each).
- **Subject color in the checkbox** (2026-10-27): cards are neutral; the subject fills the checkbox, urgency is its border, the check mark shows done (white mark with dark outline for contrast). Options toggle switches back to whole-card color. Colors/contrast to be tuned over time.

- **Day-colored dark cells** (2026-10-27): in dark mode each day cell is black → its day color (Dark cells slider sets how much). Options: "Dark day cells match the day color" toggle, 7 color pickers (M–S) defaulting to the day line colors, Default button. Reference cells keep the tint picker.
- **Stronger urgency borders** (2026-10-27): urgency checkboxes have a thicker colored border, a dark gap before the subject fill and a soft glow.

- **Task count in today's cell** (2026-10-27): "Today: X out of Y tasks done" bar moved from the toolbar to right under the date in today's Today cell.

- **Dark day colors, no inversion** (2026-10-27): in dark mode the day cells now default to the same light day colors as light mode, shown as-is (they used to be converted to a dark version, which turned Tuesday brown). Tweak them with the M–S pickers (what you pick is what you see) or the Day colors darker/lighter slider; the Dark text slider sets the text. Default restores the light colors.
- **Saved looks** (2026-10-27): top of Options — pick Light / Dark / Custom, Save stores every look setting (theme, colors, sliders, cards, fonts, padding, scale) on this device; Load applies it and refreshes.
- **Options alignment** (2026-10-27): Dark cells, the match toggle and the day pickers stay together in one column.

- **Day sections** (2026-10-27): today's Today cell always has Morning / Afternoon / Evening separators (added if missing; existing tasks start under Morning). Each folds with − / + like a title line and covers everything down to the next section. Options toggle to turn off.
- **Day section boxes** (2026-10-27): each section is its own rounded box like the Suggested Day — Morning bright yellow outline, Afternoon orange, Evening sunset purple, each with a soft matching fill and a colored header line (softer in dark mode). Tell Claude if a shade is off.
- **Day section spacing** (2026-10-27): the Morning / Afternoon / Evening boxes sit inside the cell with a small margin on both sides (no longer running into the cell edges), and there is always an empty line between sections — a clear gap between the boxes, and room to put something between them. Deleting that line brings it back.
- **Day section look + typing line** (2026-10-27): every section (Morning / Afternoon / Evening) always ends with an empty line inside it, so there's room at the bottom to tap in and type right away; when you type on it, a new empty line appears below. Afternoon (orange) and Evening (purple) outlines are lighter, and the boxes have no fill — just the cell's own color.
- **Day section times** (2026-10-27): each section line shows its time frame — Morning 8:30 am – 2 pm, Afternoon 3:45 – 6:30 pm (after the nap), Evening 6:30 – 9:30 pm. Display only; tell Claude to change them.
- **Day section colors** (2026-10-27): Morning outline + header line now a light, bright midday-sun yellow; Afternoon a brighter, true orange (both brighter in dark mode too). Evening purple unchanged.
- **Claude adds real tasks** (2026-10-27): say "add this to the Gantt" and Claude writes it to `tasks.js` — an open task with urgency (red / yellow / blue) and subtasks, added once to the end of that day's Today cell (shows in Urgent right away). First one: Crabbing trip preparation (blue).
- **Folded lines are protected** (2026-10-27): a folded title line or day section also hides its empty lines (no blank space left in a folded Morning box), and anything hidden can't be deleted or changed — Backspace/Delete next to a folded block, or a selection that covers hidden lines, is blocked with a note to unfold first.
- **Card fill slider** (2026-10-27): Options → Card fill sets how light the inside of task cards is (clear → white), saved separately for light and dark mode; dark mode default is lighter than before (12%, was ~5%).
- **Day cells match the day color** (2026-10-27): the toggle now works in light mode too — off = plain white cells in light mode, plain Dark cells color in dark mode. (Before, it only did anything in dark mode.)

- **Saved looks → Claude** (2026-10-27): Options → Save also copies the look to the Sheet's "Looks" tab (per slot + device), so you can ask Claude "how is it set now?" or "make what I saved the default."

## 🔧 To be improved

- Padding: Reference may need its own padding settings later, separate from Today/Notes.

## 📋 To do
- **Sharper card corners (2026-10-27)**: make card corners a little less round (currently 8px)
- **Hold anywhere on a card to move it (2026-10-27)**: hold and grab a card (not just its checkbox) to drag it; a plain tap on the card still goes into the text for editing, selecting, highlighting
- **Idea: built-in time tracking → plan vs actual (2026-10-27)**: own timekeeping in the app (Toggl-style); send it to Claude to compare the plan with what actually happened, for a more detailed look at habits and pitfalls (could feed the nightly wrap-up)
- **Mirrored tasks (Today ↔ Reference)**: send a carry-over to Today but keep it tracked in its Reference area (e.g. CDCR under State / IT Associate); one linked task in both places, so checking it off in Today also checks it in Reference. Approach to work out (shared task id, show it in both, one source of truth)

- Hide the "created by a Google Apps Script user" banner — only if the Exercise Tracker's wrapper experiment works out (it's shelved there for being slow).

---

## 💤 Shelved
- **Hidden third column by swipe** (built 2026-10-27, paused same day — broke 2-column mode; `PEEK_ENABLED` in Index.html): with only two columns showing, the third sits just off-screen — swipe (or trackpad-scroll) past the edge to reach it. Starts on the right; pull past the left edge instead and it moves to the left side (remembered). Works from anywhere on the screen

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
