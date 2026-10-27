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
  { id: 'n-20261026-wrap', date: '2026-10-26', kind: 'wrap', title: 'Day wrap-up · Mon 10/26', lines: [
    '**Done: 28 / 36 tasks** in today\'s cell (3 more Claude items land on next load)',
    'Urgent: no red tasks; 1 yellow open (Halloween gig, Fri 10/30)',
    '',
    '## Focus',
    '- Gantt: 13 Claude items (Reference Options, create from Urgent, Inbox, due styles, grouped done log, Due group, * marker) + Calendar panel and nightly notes; your sort row, urgency checkbox, margins',
    '- Exercise Tracker: 6 Claude items (In Today marker, weight-only logging, fits every screen, compact Today, Hide grid) + PT rotation',
    '- IT Associate 2 (CDCR JC-535126): compared jobs, application doc, tailored combined résumé',
    '- Calendar: CalCareers block moved to Tue 4–6:30 pm · FAQ: Claude can write to it · Light exercise done',
    '',
    '## Carries over',
    '- CDCR IT application: SOQ, cover letter, STD 678, submit (due Tue)',
    '- Claude-to-Gantt pipeline · Move out ex thing · Frictionless capture',
    '- Halloween gig (Fri 10/30)',
  ] },
  { id: 'n-20261027-plan', date: '2026-10-27', kind: 'plan', title: 'Suggested day · Tue 10/27', lines: [
    'Fixed: wake 7:30 · routine 8–8:45 · nap 2–3 · CalCareers block 4–6:30 · chill 9:30 pm · no dog walks',
    '',
    '## Must do',
    '**CDCR application (due today)**: 9:00–12:00 write 2-page SOQ + cover letter against the duty statement',
    '**Submit it**: 4:00–6:30 fill STD 678, attach résumé, cover letter, SOQ; submit before end of day',
    '',
    '## Next',
    '- Halloween gig (Fri 10/30): 7:00–7:30 pm prep check',
    '- Claude-to-Gantt pipeline: 12:30–1:45',
    '- Calendar visibility: confirm Claude sees every calendar before scheduling',
    '',
    '## Can wait',
    '- Cleanup IT Associate ref (after submitting)',
    '- Pin references to top: stay put when sorting',
    '- Move out ex thing · Frictionless capture',
    '',
    '## Stretch',
    '- IT lab (AD / M365, target ~Nov 6): 7:30–8:30 pm',
    '- A+ review: modular vs non-modular PSUs',
    '',
    '## For fun',
    '- Chill from 9:30 pm',
  ] },
];
