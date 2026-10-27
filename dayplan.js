// Claude's blocks for the Notes column (2026-10-26, Julius).
// A scheduled Claude run at ~10 pm writes two entries each night and pushes:
//   kind 'wrap' → today's Day wrap-up, added at the END of that day's Notes cell
//   kind 'plan' → tomorrow's Suggested day, added at the TOP of that day's Notes cell
// Format: { id: 'n-YYYYMMDD-plan' | 'n-YYYYMMDD-wrap', date: 'YYYY-MM-DD', kind: 'plan' | 'wrap',
//           title: 'Suggested day · Tue 10/27', lines: ['## Must do', '**Resume**: finish bullets', '- plain line'] }
// Line markup: '## x' = bold underlined sub-header, '**x**' = bold, '- x' = bullet, '' = blank line.
// Each entry is applied once (ids in script property "claudeNotesApplied"); deleting it in the app keeps it deleted.
// Ids must be unique and never reused. Prune entries older than ~30 days.
const CLAUDE_NOTES = [
];
