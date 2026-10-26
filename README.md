# Gantt 3 Columns (Focus Workspace)

Google Apps Script web app: a three-column daily workspace — **Today / Tasks**, **Notes** and **Reference** — saved to a Google Sheet. Built mostly from a phone; every push to `main` deploys automatically (`.github/workflows/deploy.yaml` → `clasp push` + update deployment).

Last updated: 2026-10-26

## Status key

- ✅ **Working** — in use and confirmed
- 🧪 **To be confirmed** — shipped, waiting for Julius to try it
- 🔧 **To be improved** — works, but has known tweaks wanted
- 📋 **To do** — wanted, not built yet

---

## ✅ Working

**Layout**
- Three columns: Today / Tasks, Notes, Reference. Columns are resizable (drag the divider), with **Fit** and **Reset sizes** buttons.
- **Cols** menu: show/hide columns, single-pane focus view, and **Split** (two panes stacked, on desktop or Mobile mode; a repeated pane is a read-only mirror).
- **Focus** button hides the top toolbar; a Show toolbar button brings it back.
- Mobile mode with phone-friendly sizes; toolbars stay clear of the phone camera/notch.
- Save status ("Ready") sits on the same line as the buttons without changing toolbar height.
- **↻ Refresh** reloads the whole app at its /exec URL (picks up new deploys and data).
- No double-tap zoom on buttons, menus or the toolbar. Menus/panels close on outside tap or Escape.

**Scale / Fonts panel** (Scale button)
- Workspace scale (50–200%).
- Padding left/right and top/bottom as separate sliders (0–300%).
- Text font and size.

**Today / Tasks and Notes**
- One row per day; loads 7 days back and 3 ahead, then more weeks as you scroll (lazy week loading). **Today** button jumps to today.
- Rich text editor: `[]` + Space = checkbox, Tab / Shift+Tab = indent/outdent (subtasks), code blocks with ```.
- Right-click / long-press formatting menu: bold, underline, strike, indent, outdent, subtask, horizontal rule.
- Each day saves automatically to the sheet.
- Notes **+ Template** inserts the Reference cell titled "Journal Template" into the selected Notes day.

**Urgency** (like TickTick)
- Hold a checkbox (or right-click it) → pick 1 red (Urgent) / 2 yellow (Soon) / 3 blue (Later) / none.
- Urgent panel at the top of Reference lists every urgent task from every day, grouped 1/2/3, with its subtasks underneath. Tap a task to jump to it in Today. Panel is collapsible.

**Reference**
- Cells with a title line and body; collapse/expand each, or all at once with **Ref ▾**.
- **+ Cell**, search box, drag handle to reorder (in Original order).
- Sort: Original order, Title A–Z, Last modified.
- Delete asks to confirm; deleted cells go to the **Archive** (restore any time, children come back with them).

## 🧪 To be confirmed (shipped 2026-10-26)

- Sort dropdown in Reference shrunk to fit its text.
- Instructions/tips block under the Reference search removed (shortcuts kept below in this README).
- Urgency: the extra colored square around the checkbox removed — the checkbox itself is drawn in the urgency color, checked or not.
- Urgent panel keeps finished urgent tasks (struck through) until the urgency is cleared by hand.
- Reference follows the Padding left/right slider the same way Today does (one shared setting for now).
- Urgent panel: the red bar down the whole panel is gone; each level (1 Urgent, 2 Soon, 3 Later) has its own left bar and heading in its own color (red / yellow / blue).

## 🔧 To be improved

- Padding: Reference may need its own padding settings later, separate from Today/Notes.

## 📋 To do

- Draggable task cards: every task becomes a card you can drag; dragging a task carries its subtasks, dragging a subtask carries only it and what's nested below.
- Hide the "created by a Google Apps Script user" banner — only if the Exercise Tracker's wrapper experiment works out (it's shelved there for being slow).

---

## Keyboard shortcuts (removed from the screen, kept here)

- Right-click or long-press = formatting menu (Shift+right-click = browser menu)
- Enter = new line · ⌘/Ctrl+Enter = new cell
- `[]` + Space = checkbox · Tab / Shift+Tab = indent / outdent
- ⌘/Ctrl+B / U = bold / underline · ⌘/Ctrl+Shift+X = strike task
- ``` + Enter = code block; ``` + Enter on its last line = exit

## Files

- `Code.gs` — server: serves the page, sets up the sheets, loads/saves days and Reference cells, archive, urgent days.
- `Index.html` — the whole client UI (styles + script).
- `appsscript.json` — Apps Script manifest.
