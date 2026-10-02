## App Description
Focus Workspace is a minimalist productivity web app built with Google Apps Script and Google Sheets. It combines daily task management, journaling, and a persistent reference library into a single workspace designed for staying focused without switching between multiple apps.

The interface provides synchronized daily task and journal views alongside a searchable Reference panel for notes, commands, snippets, links, and other information worth keeping close at hand. Data is automatically saved to Google Sheets, while the interface includes customizable typography, resizable columns, multiple workspace views, and a distraction-free Focus mode.


## Features

- **Daily task manager** — Organize tasks into automatically generated date-based sections.
- **Daily journal** — Keep notes or journal entries alongside each day's tasks.
- **Synchronized timeline** — Task and journal columns stay aligned and scroll together by date.
- **Infinite day navigation** — Previous and upcoming days are loaded as you navigate through the timeline.
- **Interactive checkboxes** — Create tasks by typing `[] `, check them off, and save their state automatically.
- **Nested tasks** — Indent and outdent checkboxes to create subtasks.
- **Reference library** — Maintain persistent notes, commands, snippets, links, and other frequently needed information.
- **Collapsible Reference entries** — Expand individual entries when needed or collapse the entire Reference library.
- **Reference search** — Instantly filter Reference entries, with matching entries automatically expanded to reveal matches inside them.
- **Rich text editing** — Supports paragraph, subtitle, and title formatting along with bold, underline, lists, blockquotes, and structured content.
- **Custom typography** — Configure fonts and sizes for paragraphs, subtitles, and titles.
- **Per-cell undo/redo** — Editing history is maintained independently for each editable cell.
- **Resizable columns** — Drag the dividers between Tasks, Journal, and Reference to customize the workspace layout.
- **Multiple workspace views** — Switch between the full three-column workspace or dedicated Tasks, Journal, and Reference views.
- **Focus mode** — Hide the main toolbar for a distraction-free workspace while retaining quick access to Today, workspace views, and save status.
- **Jump to Today** — Instantly return to the current day's tasks and journal.
- **Automatic saving** — Changes are persisted to Google Sheets with visible Saving/Saved status feedback.
- **Persistent UI preferences** — Typography, column widths, workspace view, Reference collapse state, and Focus mode are remembered between sessions.
- **Google Apps Script backend** — Runs as a lightweight Apps Script web app with Google Sheets providing persistent storage.
