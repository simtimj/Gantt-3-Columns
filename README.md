# Gantt 3 Columns (Focus Workspace)

Google Apps Script web app: a three-column daily workspace — **Today / Tasks**, **Notes** and **Reference** — saved to a Google Sheet. Built mostly from a phone; every push to `main` runs `clasp push`. The /dev link uses that pushed code; the workflow does not update a versioned /exec deployment.

Last updated: 2026-11-04

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
- **Jump to today**: tap the TODAY / TASKS header text (top-bar Today button removed 2026-10-29).
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

## 🧪 To be confirmed (2026-11-04)

- **Blocks hierarchy:** indent/outdent and up/down actions now move the selected parent with contiguous deeper-indented descendants. This is editor-line hierarchy, not a new Sheet schema; drag handles and true arbitrary nesting remain to be implemented.
- **Keep In Mind:** long-press fold arrow now exposes prompt-based rename, category color, reorder, add task, and collapse actions. Category colors persist in Focus data. Needs usability refinement; no claim of completed custom menu.


- **Reference header:** Urgent live counts now render beneath the Reference title, instead of taking their own row in the upper panel. Needs mobile visual confirmation.
- **Blocks editing:** adds toolbar indent/outdent and up/down controls for selected top-level Plan lines. Hierarchical parent-child movement and true nested block persistence are not complete.


- **Blocks first pass:** bottom-left former Plan / think area is relabeled Blocks with + Block and + Task actions. It reuses the existing Days Plan column, rich-text editor and save path, preserving existing Plan contents. Block grouping and task checkbox conversion need live validation; dedicated block-level nesting/reordering controls and reusable templates are not implemented yet.


- **Keep In Mind heading contrast:** lighter blue heading text and underline (#70baff), awaiting live phone confirmation. This is a visual-only change; other Keep In Mind redesign requests and Blocks are not yet implemented.

## 🧪 To be confirmed (2026-11-03)

- **Dailies tab icon:** the clickable Dailies/Notes tab uses 📋 with a Dailies tooltip/accessibility label; Weather retains ☁️. Tab switching and content are unchanged.

- **Dailies health groups and hydration:** underlined **P health** / **M health** groups; Read 10+ pages and Meditate go under M health, other routines under P health. Stretch becomes **Morning · Stretch**, with **Before bed · Stretch** and **On waking · Drink a glass of water** added once. Existing checkboxes/IDs remain intact; historical days are not rewritten.
- **Hydration total:** `Hydration 64 oz: T: 24/64 | 8W · 8C · 8W`. All drinks count at their actual ounce volume, including coffee. Hold the hydration checkbox → enter `8W`, `8C`, `8Tea`, `8M` or `8O` → **Add drink**. Edit/remove drink tokens directly and leave the line to recalculate. New days inherit the routine with an empty drink list and zero total. Checking the waking-water habit does not silently add a second drink. Watch/Gemini forwarding still needs a separately authenticated connection; this change does not expose an unauthenticated endpoint.
- **Life subject removed:** omitted from defaults, saved Options and subject guessing. Existing explicit Life assignments/tags appear as Other without deleting or renaming task text. Health is labeled P health, with an M health subject for mental routines.

- **Active lock visibility correction:** closed white and open gray locks now use explicit SVG images rather than CSS masks. Newly typed daily tasks receive their active recurrence marker during refresh, so the closed lock appears immediately. Kept the smaller inline position and existing hold-menu behavior.

- **Dailies lock correction:** a smaller single-color lock sits immediately after the text. White closed lock = repeating daily; gray open lock = recurrence off. Hold/right-click the checkbox and choose **Lock — repeat daily / Unlock — stop repeating**; normal taps still check/uncheck. The icon is render-only CSS, so saved text stays clean.
- **Softer styling:** subject borders remain 1px but are more transparent; project fold controls retain softer category colors. Category groups have more separation. Calendar Events gets slightly larger mobile text, wrapping headings and an easier refresh target, retaining the compact all-day/scheduled layout.
- **Keep In Mind labels:** Category → Task → Subtask; **+ Task** replaces **+ Project**, **+ Subtask** replaces the nested **+ Task**. Why focus stays. Existing saved project/task keys and IDs are preserved.
- **Automatic deployed-code history:** GitHub builds a commit ledger from code changes on main after enablement. On the next app load, each unrecorded commit is appended once to Done Log before History intake. It catches up across multiple deployments, uses Pacific commit dates, retries safely, and does not log failed/unpushed local work as shipped. This covers deployed repo code, not every outside-chat activity or unfinished plan.
- **Schedule parser:** time-section headers remain in History and stop subtask collection when timed tasks move to Notes; fixes an undefined-variable exception from the previous history change.
- **Request review:** current implementation and remaining planning/device checks are tracked in `docs/REQUEST_REVIEW.md`.

- **Dailies:** right-side lock marks daily recurrence while items remain editable. Health routines use pink, including water, hygiene, medicine, supplements and strength training. Read 10+ pages (Study) and Meditate (Health) are added once to Nov 3 and carry forward; both are included in new starter lists.

- **History folding:** project expand/collapse controls and condensed borders use the subject color (Gantt → Code green). Fold only on a short tap; drags, holds and canceled gestures do not toggle. Project folds stop at time-section headers so Afternoon and Evening remain visible. Done Log insertion recognizes current time-section headers and uses 2 pm / 7 pm boundaries.
- **Weather:** location label is **Vallejo**; wind is removed from both the hourly display and forecast request.

- **Dailies carry forward:** new days inherit the latest saved Dailies list, including custom additions such as strength training. Checkboxes start unchecked on a new day; saved historical days are preserved. The repeat-arrow symbol is removed.
- **Daily controls:** hold a Dailies checkbox to keep or remove daily recurrence (the item stays on its existing day).
- **Keep In Mind carries forward:** free notes carry into new days; the shared heading/task dashboard is shown across dates. Use **+ Heading**, then **+ Task**, without creating a category. Names/headings are underlined. Its top divider follows the day's color.
- **Card border only:** subject-colored card outlines are thinner (1px instead of 2px).
- **Resize handles:** compact centered square notches replace the large blocks on vertical and horizontal dividers; invisible phone drag targets retain their size.
- **History Log:** every date displays Morning, Afternoon and Evening, even when empty. Existing section placement is preserved; timed tasks use the existing time boundaries. Dailies and Keep In Mind headers/dashboard are also available on every date.
- **Calendar Events:** the bottom-middle section lists the selected day's main Google Calendar events in compact **All-Day Tasks** and **Scheduled Tasks** groups. All-day entries show titles only; scheduled entries put the title below an underlined time. Read-only, with refresh, empty/error states, and a one-minute cache. The old Reference calendar remains off.

## 🧪 To be confirmed (2026-11-02)

- **AI tasks land in the right time section (2026-11-02):** a task an AI adds for today now goes under Morn / After / Night by when it was added, not at the bottom. New `Added` column in `New Tasks` (time the AI added the row); if it's blank, the time the app picked the row up is used. Tasks for other days and Undated Tasks still go at the end.
- **Logging through the Sheet, no deploy (2026-11-02):** Claude and ChatGPT add a row to the new `Done Log` or `New Tasks` tab in the Sheet, and the Gantt places it in the right day on its next load (↻). Exact repeats are added once, and lines you delete stay deleted.

- **Task tracking rename**: the Focus tracking section in the middle column is now called Task tracking, including on days already saved
- **Even drag lines + stronger grips**: grips are more solid at rest (75%) and a little squarer; every drag line is 2px (the Notes line was doubling up to 4px, phone split lines were 3px); Today's line reaches the column edges; Reset sizes and double-tap put the Today, Notes and Reference lines at the exact same height, dead center of the area under the headers

## 🧪 To be confirmed (2026-11-01)

- **Cursor after typing [ ]**: a new empty task from `[]` (or the toolbar task button) now puts the cursor inside the task, after the box, and a background sync keeps it there.

- **Easier-to-see drag grips** (2026-11-01) — the resize grips on every split / column line show at half strength while idle (were nearly invisible), full strength while dragging.

- **Short time headers** (2026-11-01) — Today's time headers (both the auto time sections and the older Morning / Afternoon / Evening title lines) show one line: rounded icon + short name + times — yellow sunflower sun **Morn 8:30–2**, orange setting sunflower sun **After 3:45–6:30**, filled purple moon **Night 6:30–9:30**.
- **Slimmer − / + boxes** (2026-11-01) — title-line fold boxes are narrower.

- **Sunday icon: sunflower sun** (2026-11-01) — round sun with a soft zigzag mane (like a sunflower / lion), still in the day color. Same sun on the Morn header; After uses the setting-sun half.

- **Plan / think spacing + card outlines** (2026-11-01) — the bottom-left Plan / think cell uses the same text size and line height as the Today cell, so checkboxes line up the same. Its task cards always show a faint outline in their urgency color (red / yellow / blue, gray if none; works in light and dark); the line you tap gets a stronger ring.
- **Date + Completed scroll with the tasks** (2026-11-01) — in the one-day Today view, the date and the Completed label now scroll up with the task list instead of staying fixed at the top. Plan / think below is unchanged.
- **Tighter Make sure you do lines** (2026-11-01) — task lines in the Notes cell use a small gap instead of the full task-card spacing.
- **One line between Notes and Reference** (2026-11-01) — the Urgent box no longer has its own outline, so there's a single line between the middle and right columns, like the left side. The three urgency boxes are unchanged.
- **Focus Tracking, phase 2** (2026-11-01) — each project card has **+ Task**. Tasks have a checkbox and an editable name (clear the name to delete). Ticking a focus task ticks every copy of it (Today, Plan / think, Reference) and adds a done line to today's Completed; ticking a copy elsewhere ticks the focus task too (done wins when a day loads later). 📌 on a task sends a copy to Plan / think for the selected day; renaming a focus task renames its copies. Collapsed projects hide their tasks. Focus data is now stored in pieces, so it can hold many tasks. Next: drag order, priority + progress + dashboard, temporary urgency + expand.
- **Focus Tracking, phase 1** (2026-11-01) — under the Focus tracking header in today's Notes: **+ Category** → **+ Project** cards, each with an editable title and a 2-line "Why focus" reason. ▾/▸ collapses a category or project (remembered). Enter finishes editing; clearing an empty project's title (or an empty category's name) removes it. Saved on the server, so it's the same every day and on every device. Next phases: tasks (shared with mirrors), drag order, priority + progress + dashboard, temporary urgency + expand.
- **Hourly weather** (2026-11-01) — ☁️ tab shows the next 24 hours for the Vallejo / Benicia area (Open-Meteo, free): time, sky symbol, °F, rain chance (10%+), wind. Loads when the tab opens, refreshes after 30 min or with ↻.
- **Repeating marker** (2026-11-01) — Make sure you do starter tasks (they come back every day) show a small ↻ after the text.
- **Line + scroll fixes** (2026-11-01) — Make sure you do / Focus tracking lines 1.5px; no double line under the Today / Notes headers (header keeps the line); active tab icon is see-through white instead of the day color; Completed scrolls only up/down inside its own area.
- **Lines in the day color** (2026-11-01) — Options toggle (off by default): column / split lines and grips take today's day color; section lines and note-table lines inside a day take that day's color; all 2px (Make sure you do / Focus tracking lines stay thin). Header lines under each column title, single line between split columns. Today's time-section lines now reach the column walls too.
- **Center Up stays put** (2026-11-01) — scrolling inside Notes / Weather / Center Down no longer drags the column or page.
- **Notes section look + narrow time sections** (2026-11-01) — Make sure you do = red text + red line, Focus tracking = blue text + blue line, no fill, lines run wall to wall. When Today is narrow, Morning / Afternoon / Evening headers show ☀️ 8:30–2, orange ☀️ 3:45–6:30, 🌙 6:30–9:30.
- **Backlog → Undated Tasks** (2026-11-01) — the Reference card that holds urgency tasks with no day is now titled **Undated Tasks**, with a one-line description at the top. Its tasks show in Urgent ("from Undated Tasks"); tasks typed into Urgent and "📥 Not today" land there. The old "Backlog" title still works.
- **Tight Urgent** (2026-11-01) — the Urgent panel and its group boxes now reach the Reference column edges (1px side padding).
- **Quiet grips** (2026-11-01) — the drag-line grips are faint until you press them, then full strength while dragging.
- **Make sure you do** (2026-11-01) — today's Notes cell (📝 tab) starts with a "MAKE SURE YOU DO" section header, styled like Today's time sections with a light red shade.
- **Make sure you do starters** (2026-11-01) — each new day's section starts with: Drink 64 oz water · 10K steps · Stretch · Hygiene · Medicine · Supplements (checkbox lines). Darker red / blue section text.
- **Focus tracking** (2026-11-01) — second section in today's Notes cell, under Make sure you do (light blue shade). Normal lines for now; dashboard / what-to-keep / temporary time-based urgency to work out with Julius. Lines under it are normal cell lines (checkboxes, drag and drop, menus).
- **Center, phase 2** (2026-11-01) — Notes column is split into **Center Up** and **Center Down** (drag the bar to resize, double-tap to reset; Center Down can shrink to a thin strip). Center Up has small tab symbols in its header (no "NOTES" text, no + Template button anymore): 📝 = Notes (as before), ☁️ = Weather (hourly, see above). The last tab is remembered on each device. Center Down is empty for now.
- **Center, phase 1** (2026-11-01) — Notes column no longer shows the day label (Today keeps its date + weekday icon). Suggested Day + Day wrap-up are paused: their boxes are hidden (not deleted) and the 10 pm nightly scheduled task is turned off. The Schedule box still shows.
- **Task mirrors, phase 1** (2026-11-01) — hold a Reference task's checkbox (Backlog too) → **📌 Send to Today (Plan / think)** puts a linked copy in the selected day's Plan / think pad (the day shown with ▲▼, not always today). Sending again shows "Already in Plan / think". Ticking any copy (Reference, Plan / think, or the Urgent row) ticks the others; a ticked Plan / think copy moves into that day's Completed (Today) as a history line, once per day. Unticking reopens the task but keeps the history line. Two tasks with the same name stay separate. Phase 2 (title edits sync, Go to Reference) not built yet.
- **Even reset** (2026-11-01) — Reset column sizes makes all columns the same width (filling the window) and lines up Today's split line with Reference's; Reference is a true 50/50. With nothing saved yet, the lines start lined up too.
- **Drag grips at the edges** (2026-11-01) — same grips, moved out of the way: Today's split grip sits at the left edge, Reference's at the right edge, the column-line grips at the top (phone split lines too). Only the grip area drags now, not the whole line.
- **Urgent tidy-up** (2026-11-01) — tasks typed into the Urgent add box without a "Title:" are no longer saved bold; the Urgent header has no − box (tap it to fold); the − / + on a task with subtasks and on subject batches sits right after the text instead of at the far edge.

## 🧪 To be confirmed (2026-10-31)
- **No stray dots in Urgent** (2026-10-31) — removed the dashed red box in front of the Urgent add box (on narrow panes it sat alone above the input as red dots); the ⠿ drag grip also no longer shows in the Urgent panel (still there in Today / Notes / Reference cells).
- **Fix: new Reference cells keep their first edit** (2026-10-31) — a cell made in the open tab (e.g. a new Backlog from the Urgent add box, or Reference +) used to snap back to its empty title on the first save. Now saved properly; if making the Backlog fails, the Urgent add box keeps what you typed.
- **One full hold menu in Urgent (2026-10-31):** holding a task's text (not just its checkbox) now opens the full menu (urgency, due, length, subject, Archive, Delete, Go to task) with + Task / + Subtask / Outdent / Indent on top. The menu scrolls if it's taller than the screen.
- **Backup when a task disappears (2026-10-31):** whenever a save removes an open (unticked) task from any cell, the old cell text is copied to the Sheet's Backup tab first, so lost tasks can be recovered.
- **Urgent add box wraps (2026-10-31):** typing a new task in the Urgent panel now wraps onto new lines and the box grows downward, instead of running past the cell. Enter still adds the task; pasted line breaks become spaces.
- **Reference list shrinks further (2026-10-31):** drag the Reference half line down until only a ~30px strip of the list is left; it can't disappear, so the line and its notch are always there to pull it back up.
- **Reset columns also resets the splits (2026-10-31):** besides column widths, it puts the Today, Notes and Reference half lines and the phone split back to half and half.
- **Bolder drag notches (2026-10-31):** the grips on every resize line (columns, Today / Notes / Reference halves, phone split) are thicker and longer and stay full strength even when Line strength fades the lines.
- **Suggested Day + Day wrap-up are cells again (2026-10-31):** stretched edge to edge across the column, so the column lines are their left and right sides; top and bottom lines in the day's color.
- **Weekday icons (2026-10-31):** each Today date header shows its weekday symbol a little right of the date (Sun sun, Mon moon, Tue fire, Wed water, Thu tree, Fri 3D gold bar with open seams between its faces, Sat earth), text height, filled with that day's color (Saturday = dirt brown). Images live in `WeekdayIcons.html`.
- Reference top half = Urgent only (Calendar panel turned off: `CAL_PANEL_ON = false`)
- Reference toolbar: search · + · Arc · Options. Sort and collapse/expand-all moved from the header into Options (with Urgent panel + padding settings)
- Options → Line strength slider (20–100%, default 70%): fades all dividing lines (column/split lines, day separators, note block lines); Reset restores color + strength
- Slimmer resize bars: split lines 3px (were 7px), smaller square grips; bigger invisible grab area (2026-10-31)
- Line strength slider fixed (was squeezed to 16px and stuck at 20%)
- Lines, not boxes: note blocks and today's cell keep only top / bottom lines (no side borders) in Today + Notes
- Column lines (Today | Notes | Reference) drag on phone-size screens too, wider finger grab
- Today ● dot next to the date removed (2026-10-31): one-day view, no list to mark it in
- Three panes side by side: both column lines drag (square grips); double-tap a line to reset to equal widths
- Smaller − / + fold buttons and smaller toolbar / menu buttons
- Today done count: plain "Today: 6/6 done" (no bar, not bold), sits above Morning inside the cell and scrolls away
- Short day dates in narrow panes (Today + Notes): "Sat Oct 31, 2026" on one line; full form when wide

- **Time sections in Today (2026-10-31):** today's tasks sort themselves under Morning (8:30 am – 2 pm), Afternoon (3:45 – 6:30 pm) and Evening (6:30 – 9:30 pm). Checked tasks go by when you checked them, open ones by when you added them; anything done in the 2–3:45 nap gap sits under a short dashed half line after Morning. Headers only show when something is in them. Older lines, notes and Claude's done log stay on top. Sorting happens when you tick a box or leave the cell, never while you type.
- **Bold divider lines (2026-10-31):** the column lines and the lines splitting Today and Reference in half are now dark (light theme) / bright (dark theme), 2px. Change the color in **Options → Divider lines** (Reset puts it back).
- **Square grips (2026-10-31):** the grips on the split lines are thinner and square; column lines got the same square grip, and on the phone the column lines use the divider color too.
- **Drag the half-split lines (2026-10-31):** drag the line above "Plan / think" in Today, or the line between Urgent/Calendar and the cells in Reference, to resize the halves. Each remembers its size; double-tap a line to go back to half and half.
- **Reference split in two (2026-10-31):** like Today, Reference is now two stacked halves that scroll on their own — top = Urgent, Calendar and the other panels; bottom = search, + Cell and all the Reference cells.
- **Inbox removed (2026-10-31):** the Inbox panel is gone. The time-tracking idea moved to Backlog (Can be later); any open items you typed into the inbox move to Backlog automatically.

## 🧪 To be confirmed (2026-10-30)

- **Urgent batches by subject**: inside each level (Urgent / Soon / Can be later / Due), tasks are grouped under small subject headers (e.g. Music, Productivity, Career / IT) with a count, so he can work one batch at a time. Batch order = its soonest task; "Other" (no subject) last. Tap a header to fold that batch. Reference Options → "Group by subject" turns it off.
- **Batch titles + Career / IT** (2026-10-30): batch headers are bold + underlined in the subject's color (Code green, Music purple), no dot. Study (cert) tasks and IT lab work show in the Career / IT batch.
- **Boxed levels + right-side batch fold** (2026-10-30): Urgent, Soon and Can be later each sit in a rounded border in their color (red / yellow / blue, grey for Due), and each batch's − / + sits at the right end of its header.
- **New batches from a task tag**: ending a task with " · #Name" (e.g. "Show prep · #Gigs") creates that subject/batch if it doesn't exist (auto color, saved to all devices) and files the task there. Plain " · Name" only matches existing subjects, so lines like "Walk · LaDonna" never create one. Rename, recolor, add keywords or delete in Options → Card subjects (a task still tagged #Name brings it back).
- **New subjects Music + Productivity, Career renamed "Career / IT"** (more IT words). Added once to his saved subject list on all devices; guitar/music/singing words moved from Fun to Music. Set a task's subject from its checkbox hold menu, or end the task with " · Music" / " · Productivity" / " · Career". More batches = add a subject in Options → Card subjects (or ask Claude).

## 🧪 To be confirmed (2026-10-29)

- **Plan pad works like every other cell** (2026-10-29): checkboxes (`[] task`), subtasks, the hold / right-click menu, task cards, urgency colors, due dates and durations, title lines with fold, drag to and from other cells, undo. Urgent / due tasks written in the Plan pad show in the Urgent panel (labelled Plan).

- **Same text size everywhere** (2026-10-29): Urgent, Inbox and Calendar rows in Reference (and the Plan pad) now use the same font, size and line height as the Today / Notes / Reference cells (Text size × Scale) instead of a fixed 13px; small labels (dates, counts, level names) scale with it.

- **One-day view** (2026-10-29): Today + Notes show one day at a time; ▲ / ▼ next to TODAY / TASKS go to the previous / next day (loads more weeks as needed); tapping TODAY / TASKS goes back to today. Today's cell is split: **Completed** on top (the day's Today cell — Claude's done log lands here grouped by project, as before) and **Plan / think** below (free writing space, saved per day in the Days tab column D "Plan"). Each half scrolls on its own. Toggle in Options → "One day at a time". Folded title lines now show just a count ("12 done") when everything under them is done. Moving finished tasks into Completed stays manual.

- **Folded summary on every title line** (2026-10-29): fold any title line (Claude's Gantt group, Morning / Afternoon / Evening, your own titles) and a condensed block under it lists the bold beginning of each hidden line, e.g. "In Today marker · Safe sync · …". Lines with no bold start use the text before ":". Subtasks are skipped; capped at 30 with "+N more". Not shown on a title line that has its own due/duration label.
- **[x] calendar marker + your own done lines (2026-10-29):** once a Graphite event is in the log, its title starts with **[x] ** (was a trailing " X"). Your own calendar tasks in the done log have no `*` and end with " X"; Claude's still start with `*`.
- **Clearer day lines + dates** (2026-10-29): the line between days (Today and Notes) is thicker and darker; dates are underlined and read "Sunday November 1, 2026" (no comma after the weekday).
- **Free line under Evening** (2026-10-29): every Today cell keeps an empty line below the Evening box, outside it, so you can add things there; tapping below the last line lands on it.
- **Safe saves, no lost edits** (2026-10-29): an old open tab can no longer write over newer changes. Each cell remembers the version it loaded; if the cell changed elsewhere (phone, another tab, Claude's done log), the app merges line by line instead of overwriting — both sides' new lines kept, deletes honored, and if both changed the same line both versions stay (status says "check for doubled lines"). Saving Today no longer rewrites Notes. Ctrl+Z undoes a merge. Big deletions and old-tab overwrites are copied to a **Backup** tab in the Sheet first. Failed saves retry every 5 s instead of giving up.
- **Stale tab catches up by itself**: coming back to the tab (or every 3 min) pulls changes made elsewhere. A **↻ New version** bar appears when newer app code was pushed; ↻ and that bar wait until your edits are saved before reloading.
- **Daily completed-task archive** (Julius's spec): finished task events on the main calendar (Graphite **and** title starting **[x] **, or the older ending " X") fold into one all-day **✅ Completed Tasks — YYYY-MM-DD** event per day, as `[x] Task` lines with the time, original description and event id; the originals are deleted only after the archive is re-read and each one is found in it. Needs 3+ waiting on a date, or any once that day's archive exists; never recurring events, meetings with guests or unfinished events; reruns add without duplicates and never delete the archive. Calendar panel: **🗃 Archive done (N ready)** shows a preview before running; **Auto** (off until you've tested with 3 events) runs it when the panel loads and when you tick an event. Archive events list their tasks underneath. Gantt cells are never touched.
- **No stray bold in Urgent**: new tasks no longer inherit bold from the line above (the browser carried it over on Enter); urgent tasks that were bold end to end were un-bolded once (Claude's bold-title lines left alone).
- **Write anywhere in the empty space**: Today and Notes cells fill their whole row; tapping below the last line puts the cursor on an empty line there (adds one if needed).
- **Schedule cell in Notes**: time-block tasks ("10:00–10:30 · …") move out of Today's Morning block into a blue **Schedule** box right under the Suggested Day — still checkboxes, done state and subtasks kept. New time-block lines added later join it (today + next 7 days).
- **Calendar panel back in Reference, as checkboxes**: every event from the main + Events calendars; Today grouped **To do** (All day / Morning / Afternoon / Evening) then **Done** (foldable), then the next 3 days. Ticking an event turns it Graphite on Google Calendar (done); unticking puts its old color back. Tap the time or title to open the event. Header shows "Today 3/7 done".
- **Quiet block headers** (2026-10-29, toned down): Suggested Day and Day Wrap-Up titles are colored text with a thin underline (yellow / purple), no filled banner and no section bars. Only the Schedule cell keeps its bold blue banner.
- **Wrap-up split into sections**: Done (per area, one item per line) · Still Urgent (one line per task) · Priority Check · Carries Over. Wed 10/28's wrap-up re-rendered in the new layout.
- **Claude tasks into Backlog**: tasks.js entries with `date: 'backlog'` go to the Reference Backlog cell (in Urgent, not Today).

## 🧪 To be confirmed (shipped 2026-10-26)

- **Evening box no longer spills into the next day (2026-10-29)**: the day row re-measures its height after the section boxes / Today chip are drawn, and the boxes can never draw past the cell's bottom edge.
- **Backspace deletes in Urgent (2026-10-28)**: clear a task's or subtask's text in the Urgent panel, then Backspace once more at the start → that line is deleted (in its real cell too) and the cursor jumps to the end of the row above, like in the cells. A task with subtasks asks first. Undo: tap the status message within 30 s.
- **Checkbox tap fixed (2026-10-28)**: a plain tap on a checkbox ticks / unticks it again (holding still opens the menu). Done tasks' faded text was layered over the box in narrow columns and swallowed the tap.
- **Task duration (2026-10-28, auto-reshuffle step 1)**: hold a task's checkbox → **⏱** row: 15m · 30m · 45m · 1h · 1h 30m · 2h, or **…** for any length — type `90`, `1h 30m` or `15h` (up to 100h for big projects). Optional; tap the picked one again to clear. Shows as ⏱ 45m in the line's corner label (under the 📅 due date if it has one), saved with the task in the Sheet (`data-dur`). Deadline = the existing 📅 due date, priority = the existing red/yellow/blue urgency, so every task card now carries all three. Claude can add `dur` to tasks in `tasks.js`.
  - Duration now also survives **→ Day / → Reference** sends from Notes (urgency, subject and due date too — they used to be dropped), Urgent items carry `dur` for prioritization, and `getDayTasks(date)` in `Code.gs` returns a day's tasks with level / done / urgency / due / duration for the future scheduler (2026-10-28).

- **Urgency mark off the box (2026-10-28)**: the checkbox keeps only its subject fill (plain gray-ish border); urgency shows as a thin red/yellow/blue **bar left of the box** (box height). Options → Task cards → **Urgency mark** to try *Line under box*, *Underline text* or the old *Box border*. Urgent panel / Notes Due boxes unchanged.
- **Subtask due dates everywhere** (2026-10-28): a subtask's own due date shows on its line in Today and Reference cells, on its row in Urgent (with Today / overdue colors), and in Notes' Due-today list even when its task is due later. Urgent sorts each task by the soonest open date of the task or its subtasks.
- **Urgent + Reference drag tracks like Today** (2026-10-28): in the Urgent panel the blue line follows your finger between rows like in a Today cell; slide right to make it a subtask, left to come out. When the card comes from another column, the level counts from where your finger rests for a moment (~0.3 s), so crossing from Today no longer forces a deep indent (this also fixes drops into Reference cells).
- **Drop anywhere in Urgent** (2026-10-28): dragging a card into the Urgent panel works on headers, gaps, add lines and empty levels too — it lands next to the nearest task in that level; an empty level (or one whose days aren't loaded) just gives the task that urgency where it is. Inbox drags onto Urgent take the urgency too.

- **Tap to pick, tap again to type (2026-10-28, fixed same day):** on *every* card — tasks and subtasks in Today, Notes and Reference cells (nested ones too), Urgent rows, Inbox rows and the Due-today rows in Notes — the first tap just *picks* it (thin ring + ⠿ grip, no keyboard). Tap the same card again to type. Tapping another card picks that one; tapping outside clears it. Checkboxes and the title-line − / + never open the keyboard. Now handled on the touch itself, so the phone keyboard stays closed.
- **Drag in Urgent (2026-10-28):** pick an Urgent row, drag its ⠿ grip like any card — into any cell, or onto another Urgent row: it lands right above/below that task in its own cell and takes that row's urgency.
- **Short counts (2026-10-28):** counts read `12/22 done` instead of "12 out of 22 done" — title-line − / + (e.g. the Gantt group) and the Today chip at the top (`Today: 12/24 done`).
- **Backlog (2026-10-28):** a Reference cell named **Backlog** (made automatically the first time) holds urgent tasks that aren't for a day yet. Tasks typed straight into Urgent now go there instead of today, and still show in Urgent with their color and due date. Hold a task's checkbox → **📥 Not today → Backlog** moves it (with subtasks) out of its day; in Backlog the same spot says **📅 Move to Today**. You can also drag tasks in and out of the Backlog cell.
- **Remove from Today, keep in Urgent (2026-10-28):** urgent tasks don't need a home day. Hold the checkbox of a task with an urgency color or due date (in Today, Notes, or its Urgent row) → **✂ Remove from Today (stays in Urgent)**: it leaves the day and lives in Backlog with its urgency, due date, duration and subtasks. Plain tasks still show **📥 Not today → Backlog**.
- **No cursor on first tap, take 3 (2026-10-28):** the first tap on any card (Today, Notes, Reference, Urgent, Inbox, Due today) doesn't put the cursor in it at all — the cell is briefly made non-editable during that tap, so you only get the ring + ⠿ grip. Second tap = cursor + keyboard.
- **Drag in Reference (2026-10-28):** the ⠿ grip now works for tasks nested inside Reference cells too (it only worked for top-level lines before).
- **Urgent first tap + nesting by drag (2026-10-28):** in Urgent the first tap now also leaves whatever you were typing in and just picks the row (ring + ⠿). When you drag any card onto an Urgent row, slide your finger right to drop it in as a subtask (left to bring it out a level) — the blue line shifts to show the level, same as in the cells.
- **Grip stays put (2026-10-28):** pressing the ⠿ grip and letting go without dragging keeps the card picked with its grip (it used to vanish while the border stayed, which also broke the next drag from Urgent).

- **Cards match the cell (2026-10-28):** task cards have no fill of their own now — same background as the day cell (Card fill default 0%; old saved fill cleared once). Options → Card fill still adds one back if wanted.

- **Hold anywhere to drag (2026-10-28):** press and hold a card's text (not the checkbox) for about a third of a second — it gets a ring and a small buzz — then move to drag it, subtasks included. Works in Today, Notes and Reference cells (nested too) and on Urgent / Due-today rows. Moving right away still scrolls; a quick tap still picks; holding still and letting go keeps the usual menus. Exception: the line you're typing in keeps the phone's own hold (select words) — use its ⠿ grip there.
- **Drag grip (2026-10-28):** tap into any task or subtask and a small **⠿** pill sits on the **bottom middle** of that line (only the line you're in). Hold it and drag to move the task — reorder, drag left to turn a subtask into a task, right to nest it, or drop it into another day / Notes / Reference cell; its subtasks come along. Works in Today, Notes, Reference cells, the **Urgent** panel and the **Due today** group in Notes (from Urgent/Due you drag the real task into a cell; the panel itself re-sorts on its own). Not on the → lines inside Claude's Suggested-day boxes. The checkbox still works as before (tap = tick, hold = menu).

- **Slimmer urgency box (2026-10-28):** urgent checkboxes are the same size as the rest; the urgency color is a 2px border drawn over the subject color (no gap, no outer ring), with only a faint glow.

- **Side space (2026-10-28):** less empty room left/right so text gets more width — day cells, Morning/Afternoon/Evening boxes, task cards (text to card edge), Suggested-day boxes, Urgent and Inbox panels, Reference column. New **Options → Side space** slider near the top (default 70%, 20–150%); columns narrower than 420px automatically use 60% of that. Saved in Saved looks.

- **Quiet cards + focus ring (2026-10-28):** task cards no longer show an outline all the time. The task or subtask line you're typing in gets a thin ring in its urgency color (gray if none) — same as editing a task in Urgent, whose ring is now thinner too (1px). Also on the Due-today lines in Notes. Card fill (Options → Card fill) is unchanged.

- **Add tasks + subtasks right in Urgent (2026-10-28):** while editing a task's text in Urgent, **Enter** makes a new task at the same level right below it (same parent card, same urgency), ready to type; Enter on an empty line just finishes. A new line left empty disappears. **Hold inside the task's text** (right where you're typing; right-click on desktop) → small menu **+ Task · + Subtask · ← Outdent · Indent →** with nothing highlighted (indent/outdent moves its subtasks too; the line stays open for typing). Moved off the checkbox hold menu 2026-10-28. From Urgent the new line opens for typing right there; a subtask added under a folded task unfolds it.
- **Fold tasks in Urgent (2026-10-28):** any task with subtasks in Urgent / Soon / Can be later (and the Archive log) gets a small **− / +** right after its text (beside the dates when the column is narrow). Tap it to hide or show its subtasks; folded shows **done/total** (e.g. + 2/8). Saved per device; only folds the Urgent panel, not the Today cell.
- **Claude tasks with a due date (2026-10-28):** `tasks.js` entries can carry `due: 'YYYY-MM-DD'`, which lands as the task's due date.
- **Inbox rows = tasks (2026-10-27):** each inbox item is a checkbox + text, like the rest of the app. The text is always editable (tap it, type, Enter or tap away saves; "Title: details" keeps the bold title; empty it to delete). **Tap the box** = done → it goes to a collapsible **Archive** under the inbox (tap again there to bring it back). **Hold the box** = menu: **1 / 2 / 3** sends it to today with that urgency (so it shows in Urgent), **📅 Due date** sends it to today with a due date, **→ Today (no urgency)**, **🗄 Archive**, **🗑 Delete**. **Hold and drag the box** = drop it into any day, Notes or Reference cell. The → Today and ✕ buttons are gone. Narrow Reference: text runs under the box, Claude tag on the right.
- **🗑 Delete in every checkbox menu (2026-10-27):** hold (or right-click) any task's checkbox — Today, Notes, Reference, Urgent panel, Due group — → **🗑 Delete** removes the task and its subtasks (asks first when there are subtasks). Undo: tap the status message within 30 s (or Ctrl+Z in that cell). **🗄 Archive** is in the same menu.
- **+ Task button removed from Urgent (2026-10-27):** the header line is just "Urgent" + counts now; add tasks with each level's add line (or hold the header).

- **Space savers only when narrow (2026-10-27):** all the space-saving layouts now kick in only when a column is under ~420px wide; wider columns keep everything on one line. When narrow: Urgent due dates stack as three short lines (Fri / 10/30 / 3d) on the right and the task text runs under its box; task lines and Notes tasks wrap under the checkbox with the due date under the text; the Notes due group's "from" date stacks. When wide: "Fri 10/30 · 3d" and "📅 Tue Oct 29" stay on one line.
- **Notes send button is just → now (2026-10-27):** the "→ Day" button on Claude's plan/carry-over tasks is a small → (tap it for the same Today / Tomorrow / Reference menu). In narrow columns those Notes tasks also wrap under the checkbox, with the → at the top-right, so the text gets the full width.
- **No highlight when holding a checkbox (2026-10-27):** holding a task's checkbox on the phone to open its menu no longer selects/highlights nearby text; anything the phone highlights anyway is cleared when the menu opens.
- **Text wraps under the checkbox in narrow columns (2026-10-27):** when a column is under ~420px wide (e.g. 3 columns on the phone), a task's checkbox sits at the top-left and the 2nd line onward runs underneath it, using the full width. A due date shows right-aligned under the task text. Wide columns look the same as before.
- **Day made removed from Urgent (2026-10-27):** the small 10/26 created date is gone (and its Reference Options switch); hold the box → ↗ Go to task jumps to the task instead.
- **Row + 2 columns layout (2026-10-27):** Cols → Split → Layout now has **Row on top + 2 columns** (one full-width row, two side-by-side columns below) and **2 columns + row below**. One tap: **Ref top · Today | Notes** sets Reference across the top with Today / Tasks left and Notes right. **↻ Rotate panes** moves every pane one spot over (same layout); **⇄ Swap columns** swaps the two side-by-side panes. The slot names change with the layout (Top row / Bottom left / Bottom right). Drag the long bar for the row height, the short bar for the column widths (both remembered). Each pane scrolls on its own. This layout comes back after a reload; other splits still start off.
- **Stacked due dates everywhere (2026-10-27):** the 📅 due label on task lines (Today, Reference) now stacks in a narrow column — "📅 Tue" over "Oct 29" — and the Notes due group's "from Tue 10/26" stacks the same way, so long task text keeps the width (same fix the Urgent panel already had).

- **Compact narrow rows (2026-10-27):** in the Urgent panel the dates stack in a small column on the right (Mon 11/16 over 20d, then the day made), so task text keeps the width; slightly tighter box-to-text spacing. Title lines (e.g. Morning) keep their name on one line and the − / + "50 out of 50 done" label wraps onto extra lines instead.
- **Full outline while typing (2026-10-27):** the add line and a task being edited in Urgent get a full rounded outline in the level's color (was only a bottom line).
- **Edit tasks in the Urgent panel (2026-10-27):** tap a task's (or subtask's) text to edit it right there — it changes the real task; Enter finishes. Tap the box = done; tap the right side of a row (day made / due date) = jump to the task. Hold the box = urgency, due date, subject, Archive, Go to task. The task's day has to be loaded to edit it.
- **Archive (2026-10-27):** hold a task's box → **🗄 Archive** — the task and its subtasks leave Urgent / Soon / Can be later and the Due group, and go into a collapsible **Archive** log at the bottom of the Urgent panel, grouped by the day archived (newest first). They stay where they are in Today (dimmed). Hold the box again → **↩ Unarchive**.

- **Type tasks right in the Urgent panel (2026-10-27):** every level (Urgent / Soon / Can be later) ends with an add line — a dashed box in that level's color. Tap it, type, Enter → the task lands at the end of today's Today cell with that urgency already set, and the line stays ready for the next one. "Title: details" bolds the title; Esc clears. All three levels always show, even when empty. Holding the Urgent header opens the create menu, which jumps straight into that level's add line.
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
- **Divided Suggested day**: each section (Calendar, Important, …) sits in its own cell; each entry is a bold name with its time blocks on lines underneath, small gaps between entries (testing)
- **Suggested day sections**: Calendar (real events only, plus a dog-walk line with client first names or "none today") → Important / Not The Most Urgent (every section header and block title capitalized; Must Do section removed 2026-10-29, must-dos live on the calendar) → Stretch (bonus) → Later; no For fun
- **Divided Day wrap-up**: counts, Focus, Priority check and Carries over each in their own cell; Focus and Priority check entries are an underlined name with the details on the line below
- **Note box dividers in the day's color**: the box outline and the lines between sections use a deeper shade of that day's color (Wed → deeper blue; deepened again 2026-10-27 so Monday shows in dark mode), thicker, with more space around each section
- **Note blocks restyled** (2026-10-26): no colored left edge; list lines use dashes (Must do too); wrap-up skips empty stats; Focus ordered by most time, area underlined with a one-line item list under it.
- **Carry-over tasks + → Day** (2026-10-26): Carries over items are checkboxes; tap **→ Day** on the right to move one to Today, Tomorrow or a picked date's Today cell.
- **Re-render note blocks** (2026-10-26): bumping an entry's `rev` in dayplan.js updates that block in place.

- **Boxed plan and wrap-up (2026-10-26):** Claude's Suggested day (top of Notes) and Day wrap-up (bottom of Notes) now sit in their own rounded box, so they're clearly separate from your notes. Tonight's two blocks get boxed on the next load.

- **\* marks Claude's work (2026-10-26):** every line Claude logs in the Today cell starts with `*` (no space), e.g. **\*In Today marker**: purple marker on grid cells, so you can tell Claude's lines from your own. Past days were updated once too.

- **Nightly suggested day + day wrap-up (2026-10-26):** every night at ~10 pm a scheduled Claude run writes two blocks into the **Notes** column: a **Day wrap-up** at the end of today's Notes cell (how many tasks got done vs. planned, what you focused on, what carries over) and a **Suggested day** at the top of tomorrow's Notes cell (most urgent first from the Urgent panel, due dates, the Daily Work Log priorities and tomorrow's calendar gaps; then what can wait, stretch, for fun). They land the next time the app loads; delete one and it stays deleted. Done at 10 pm (not 8–9) so late work counts before the plan is made. Already planned tomorrow with Claude earlier? The nightly run skips it. Wrote your own plan? You still get Claude's suggestions above it. Calendar already blocked out? The plan starts with a **Scheduled** list of those blocks as a reminder (it never touches the calendar). Wrap-up details still to be worked out together.


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
- ~~**Inbox**~~ (removed 2026-10-31 — ideas go to Backlog as Can be later; leftover inbox items move there automatically) under Urgent (collapsed by default): quick captures shown as **Title**: details. Tap the small **+ Add** on the Inbox header line to type one in (the add box stays hidden otherwise; empty Add or Esc closes it), or tell Claude ("add to my Gantt inbox: …") and it shows up about a minute later, tagged Claude. Rows work like tasks now (see 🧪 Inbox rows = tasks, 2026-10-27).

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

- **Claude adds real tasks** (2026-10-27): say "add this to the Gantt" and Claude writes it to `tasks.js` — an open task with urgency (red / yellow / blue) and subtasks, added once to the end of that day's Today cell (shows in Urgent right away). First one: Crabbing trip preparation (blue).
- **Folded lines are protected** (2026-10-27): a folded title line or day section also hides its empty lines (no blank space left in a folded Morning box), and anything hidden can't be deleted or changed — Backspace/Delete next to a folded block, or a selection that covers hidden lines, is blocked with a note to unfold first.
- **Card fill slider** (2026-10-27): Options → Card fill sets how light the inside of task cards is (clear → white), saved separately for light and dark mode; dark mode default is lighter than before (12%, was ~5%).
- **Day cells match the day color** (2026-10-27): the toggle now works in light mode too — off = plain white cells in light mode, plain Dark cells color in dark mode. (Before, it only did anything in dark mode.)

- **Saved looks → Claude** (2026-10-27): Options → Save also copies the look to the Sheet's "Looks" tab (per slot + device), so you can ask Claude "how is it set now?" or "make what I saved the default."

## 🔧 To be improved

- Padding: Reference may need its own padding settings later, separate from Today/Notes.

## 📋 To do
- **Center Up / Center Down (2026-11-01, Julius: spec saved; phases 1–2 done)**: hourly Weather built (Open-Meteo, to confirm); Center Down contents still to decide. **Make sure you do**: repeating marker ↻ built for daily starters (other repeat rules still to work out). Spec: `docs/NOTES.md` → "Center Up / Down + planning pause".
- **Auto-reshuffle, Motion/Reclaim-style (Julius, 2026-10-28)**: ✅ step 1 task fields (duration above) · step 2 `Code.gs` reads today's calendar and finds free gaps, skipping the Chill and Repeat Tasks calendars · step 3 scheduler sorts by deadline + priority and puts each task in the first gap it fits · step 4 **Reshuffle** button that reruns it (auto-run later). Keep a manual mode too: set the parameters together with Claude in conversation. Target: Fri Nov 6.
- **Calendar column, like Google Calendar** (Julius, 2026-10-28): a full calendar view as its own column (or swipe in from the right / a button that swaps it in for Reference), so while scheduling with Claude he can see the day at a glance on phone, tablet and computer. Details to settle: day vs 3-day vs week view, read-only first or drag tasks onto it.
- **Sharper card corners (2026-10-27)**: make card corners a little less round (currently 8px)
- **Hold anywhere on a card to move it (2026-10-27)**: hold and grab a card (not just its checkbox) to drag it; a plain tap on the card still goes into the text for editing, selecting, highlighting
- **Idea: built-in time tracking → plan vs actual (2026-10-27)**: own timekeeping in the app (Toggl-style); send it to Claude to compare the plan with what actually happened, for a more detailed look at habits and pitfalls (could feed the nightly wrap-up)
- **Mirrored tasks (Today ↔ Reference)**: send a carry-over to Today but keep it tracked in its Reference area (e.g. CDCR under State / IT Associate); one linked task in both places, so checking it off in Today also checks it in Reference. Approach to work out (shared task id, show it in both, one source of truth)

- Hide the "created by a Google Apps Script user" banner — only if the Exercise Tracker's wrapper experiment works out (it's shelved there for being slow).

---

## 💤 Shelved
- **Notes split + Review (hidden 2026-10-31, "for now"):** Notes column has two halves with a drag bar (double-tap = half and half), like Today and Reference. Top = Plan (the Notes cell: Suggested Day + Schedule). Bottom = live **Review** of the day shown in Today: Done n/m, what got focus (done tasks by Morning / Nap gap / Afternoon / Evening), what's at risk (open red/yellow tasks; on a past day everything still open = Slipped) and tomorrow's top 3 (open tasks, red → yellow → blue). Updates as you tick or edit; tap a line to jump to the task. Not saved anywhere.

- **Morning / Afternoon / Evening day sections — removed 2026-10-29** (Julius): the section lines, boxes, + Blocks, done-log placement into the current block and the Options toggle are gone; saved section lines were stripped from every Today cell once (old copies in the Backup tab). Old notes:
  - **Done log in the right block** (2026-10-29): Claude's done lines land in the Morning / Afternoon / Evening block that has already started (2–3:45 pm counts as Morning), never a later one; today's misplaced lines were moved back once.
  - **Blocks in every Today cell**: + Blocks button removed; Morning / Afternoon / Evening are added to every Today cell from today on. There's always an empty line above Morning, gaps between blocks, and an empty line under Evening (outside the box), so nothing's locked in.
  - **+ Blocks button (2026-10-29)**: tap inside any Today day (e.g. tomorrow's empty cell), then press **+ Blocks** in the Today header → that day gets Morning / Afternoon / Evening like today does, with the cursor ready under Morning. Future days keep their gaps and typing lines after that.
  - **Day sections** (2026-10-27): today's Today cell always has Morning / Afternoon / Evening separators (added if missing; existing tasks start under Morning). Each folds with − / + like a title line and covers everything down to the next section. Options toggle to turn off.
  - **Day section boxes** (2026-10-27): each section is its own rounded box like the Suggested Day — Morning bright yellow outline, Afternoon orange, Evening sunset purple, each with a soft matching fill and a colored header line (softer in dark mode). Tell Claude if a shade is off.
  - **Day section spacing** (2026-10-27): the Morning / Afternoon / Evening boxes sit inside the cell with a small margin on both sides (no longer running into the cell edges), and there is always an empty line between sections — a clear gap between the boxes, and room to put something between them. Deleting that line brings it back.
  - **Day section look + typing line** (2026-10-27): every section (Morning / Afternoon / Evening) always ends with an empty line inside it, so there's room at the bottom to tap in and type right away; when you type on it, a new empty line appears below. Afternoon (orange) and Evening (purple) outlines are lighter, and the boxes have no fill — just the cell's own color.
  - **Day section times** (2026-10-27): each section line shows its time frame — Morning 8:30 am – 2 pm, Afternoon 3:45 – 6:30 pm (after the nap), Evening 6:30 – 9:30 pm. Display only; tell Claude to change them.
  - **Day section colors** (2026-10-27): Morning outline + header line now a light, bright midday-sun yellow; Afternoon a brighter, true orange (both brighter in dark mode too). Evening purple unchanged.
- ~~**Calendar panel in Reference**~~ (back 2026-10-29 with checkboxes, see To be confirmed) (built 2026-10-26, removed 2026-10-28 at Julius's request; `CAL_PANEL_ON` in Index.html, server `getCalendarEvents()` kept): between Urgent and Inbox, collapsible. **Today** first (times, what's on now highlighted, past dimmed), then the next 3 days as upcoming. Reads your main calendar and Events straight from Google Calendar, so anything Claude adds (and the dog-walk block later) shows up. ↻ reloads; also refreshes when you come back to the app after 5+ min. Tap an event to open it in Google Calendar.
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




