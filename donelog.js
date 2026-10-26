// Work done through Claude (2026-10-26). Each entry is added once, as a
// checked task, to that day's Today / Tasks cell the next time the app loads.
// Format: { id: 'd-YYYYMMDD-short-slug', date: 'YYYY-MM-DD', title: 'Short name', details: 'what was done' }
// Ids must be unique and never reused. Prune entries older than ~30 days.
const CLAUDE_DONE = [
  { id: 'd-20261026-et-today-marker', date: '2026-10-26', title: 'Exercise Tracker', details: 'purple "in Today" marker on grid cells' },
  { id: 'd-20261026-et-remove-chips', date: '2026-10-26', title: 'Exercise Tracker', details: 'removed the Suggested PT chip row under the grid' },
  { id: 'd-20261026-et-weight-only', date: '2026-10-26', title: 'Exercise Tracker', details: 'logging keeps the weight even with no reps' },
  { id: 'd-20261026-gantt-ref-options', date: '2026-10-26', title: 'Gantt', details: 'Reference Options button (wrap long urgent text), −/+ collapse buttons' },
  { id: 'd-20261026-gantt-urgent-create', date: '2026-10-26', title: 'Gantt', details: 'create Urgent / Soon / Later tasks from the Urgent panel' },
  { id: 'd-20261026-gantt-inbox', date: '2026-10-26', title: 'Gantt', details: 'Inbox under Urgent that Claude can add to' },
  { id: 'd-20261026-gantt-due-styles', date: '2026-10-26', title: 'Gantt', details: 'more due date styles (month names, weekday) and Tues/Thurs abbreviations' },
  { id: 'd-20261026-gantt-sort-row', date: '2026-10-26', title: 'Gantt', details: 'Sort row buttons shrunk and wrap on phones' },
  { id: 'd-20261026-gantt-hold-menu', date: '2026-10-26', title: 'Gantt', details: 'hold menu stays clear of the phone Cut/Copy/Paste bar' },
  { id: 'd-20261026-gantt-done-log', date: '2026-10-26', title: 'Gantt', details: 'work done through Claude now lands as checked tasks in the Today cell' },
];
