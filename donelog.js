// Work done through Claude (2026-10-26). Each entry is added once, as a
// checked task, to that day's Today / Tasks cell the next time the app loads,
// grouped under an underlined project header (Julius, 2026-10-26):
//   Exercise Tracker            ← project, bold + underlined
//     In Today marker: purple marker on grid cells
// Format: { id: 'd-YYYYMMDD-short-slug', date: 'YYYY-MM-DD', project: 'Exercise Tracker',
//           title: 'Short substantive name', details: 'what was done' }
// `was` = the old one-line details, only on entries written before grouping.
// Ids must be unique and never reused. Prune entries older than ~30 days.
const CLAUDE_DONE = [
  { id: 'd-20261026-et-today-marker', date: '2026-10-26', project: 'Exercise Tracker', title: 'In Today marker', details: 'purple marker on grid cells for exercises in Today', was: 'purple "in Today" marker on grid cells' },
  { id: 'd-20261026-et-remove-chips', date: '2026-10-26', project: 'Exercise Tracker', title: 'Suggested PT chips removed', details: 'chip row under the grid gone; Suggested covers it', was: 'removed the Suggested PT chip row under the grid' },
  { id: 'd-20261026-et-weight-only', date: '2026-10-26', project: 'Exercise Tracker', title: 'Weight-only logging', details: 'logging keeps the weight even with no reps', was: 'logging keeps the weight even with no reps' },
  { id: 'd-20261026-gantt-ref-options', date: '2026-10-26', project: 'Gantt', title: 'Reference Options button', details: 'wrap long urgent text, −/+ collapse buttons', was: 'Reference Options button (wrap long urgent text), −/+ collapse buttons' },
  { id: 'd-20261026-gantt-urgent-create', date: '2026-10-26', project: 'Gantt', title: 'Create from Urgent panel', details: 'add Urgent / Soon / Later tasks right from the panel', was: 'create Urgent / Soon / Later tasks from the Urgent panel' },
  { id: 'd-20261026-gantt-inbox', date: '2026-10-26', project: 'Gantt', title: 'Inbox', details: 'under Urgent; Claude can add to it', was: 'Inbox under Urgent that Claude can add to' },
  { id: 'd-20261026-gantt-due-styles', date: '2026-10-26', project: 'Gantt', title: 'Due date styles', details: 'month names, weekday, and Tues/Thurs abbreviations', was: 'more due date styles (month names, weekday) and Tues/Thurs abbreviations' },
  { id: 'd-20261026-gantt-sort-row', date: '2026-10-26', project: 'Gantt', title: 'Sort row', details: 'buttons shrunk; row wraps on phones', was: 'Sort row buttons shrunk and wrap on phones' },
  { id: 'd-20261026-gantt-hold-menu', date: '2026-10-26', project: 'Gantt', title: 'Hold menu', details: "stays clear of the phone's Cut/Copy/Paste bar", was: 'hold menu stays clear of the phone Cut/Copy/Paste bar' },
  { id: 'd-20261026-gantt-done-log', date: '2026-10-26', project: 'Gantt', title: 'Done-with-Claude log', details: 'work done through Claude lands as checked tasks in the Today cell', was: 'work done through Claude now lands as checked tasks in the Today cell' },
  { id: 'd-20261026-et-fit-screens', date: '2026-10-26', project: 'Exercise Tracker', title: 'Fits every screen', details: 'phone, tablet and desktop; sections no longer cut off on the right', was: 'fits phone, tablet and desktop (sections no longer cut off on the right)' },
  { id: 'd-20261026-et-compact-today', date: '2026-10-26', project: 'Exercise Tracker', title: 'Compact Today, two columns', details: 'Simple view Today cards two per row, smaller text', },
  { id: 'd-20261026-et-grid-hide', date: '2026-10-26', project: 'Exercise Tracker', title: 'Hide grid toggle', details: '▴ Hide folds the sticky grid down to just the tabs' },
  { id: 'd-20261026-gantt-grouped-log', date: '2026-10-26', project: 'Gantt', title: 'Grouped done log', details: 'Claude work batched under an underlined project header' },
  { id: 'd-20261026-gantt-due-group', date: '2026-10-26', project: 'Gantt', title: 'Due group in Urgent', details: 'due-dated tasks with no urgency listed at the bottom, soonest first' },
  { id: 'd-20261026-gantt-tap-no-jump', date: '2026-10-26', project: 'Gantt', title: 'No jump when tapping Notes', details: 'tapping into a Notes or Today cell keeps the view where it was' },
];
