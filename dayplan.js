// Claude's blocks for the Notes column (2026-10-26, Julius).
// A scheduled Claude run at ~10 pm writes two entries each night and pushes:
//   kind 'wrap' → today's Day wrap-up, added at the END of that day's Notes cell
//   kind 'plan' → tomorrow's Suggested day, added at the TOP of that day's Notes cell
// Format: { id: 'n-YYYYMMDD-plan' | 'n-YYYYMMDD-wrap', date: 'YYYY-MM-DD', kind: 'plan' | 'wrap',
//           title: 'Suggested day · Tue 10/27', lines: ['## Must Do / Urgent + Important', '**Resume**: finish bullets', '- plain line'] }
// Line markup: '## x' = bold underlined sub-header, '**x**' = bold, '__x__' = underlined, '- x' = dash list item
//   (every list line starts with '- ', shown as a dash), '[] x' = checkbox task with a "→ Day" send button, '' = blank line.
// Style (Julius, 2026-10-26): Must do lines are '- ' items too. In the wrap-up, don't mention what's absent
//   (no "no red tasks"). '## Focus (Most Time First)': per area a line '__Area__ · short summary' then ONE line
//   underneath listing the items joined by ' · ' (not a line each). '## Carries Over' items are '[] ' tasks.
// Nesting (2026-10-26): 2 leading spaces per level. '  [] x' = subtask under the task above (→ Day on the
//   parent sends it with all its subtasks; on a subtask, just that one). '  x' = indented detail line.
// Wrap-up (Julius, 2026-10-26): cells:true, so the counts, Focus, Priority check and Carries over each get their
//   own cell. Focus and Priority check use the same shape: an underlined '__Main thing__' line (Focus adds
//   ' · N Claude items'), then ONE plain line underneath with the details (Focus: items joined by ' · ', every
//   item there, none on the header line). Focus is most time first. Priority check heading is
//   '## Priority check · **N/10**': score 0–10 for whether the time went to the right things (deadlines / red
//   first; app work like Gantt or Exercise Tracker can wait while a deadline is open); 2–4 entries: what got the
//   time, what's still open on the priority, what went right, the fix for tomorrow. Don't mention what's absent.
//   '## Carries Over': every task is '[] **Name**: specific details' (never just a name); a task with parts gets
//   each part as a '  [] ' subtask, also **Name**: details.
// Plan (Julius, 2026-10-26): cells:true (each section its own row, no blank lines needed). Each entry is a
//   '- **Name**: one-line summary' with its time blocks / steps underneath as '  ' detail lines ('9:00–12:00 · …').
//   Section order: '## Calendar' → '## Must Do / Urgent + Important' → '## Important / Not The Most Urgent' → '## Stretch' → '## Later'. No For fun section.
//   Calendar: only real events (e.g. '- **CalCareers block**: 4:00–6:30'); never wake, routine, nap, chill or
//   other fixed daily blocks. Always a dog-walk line from the Time To Pet calendar with client first names:
//   '- **Dog walks**: 11:15 Brittany · 12:00 Catherine · 12:30 David', or '- **Dog walks**: none today'.
//   Must Do names are bold + underlined and Title Cased (every word capitalized): '- **__CDCR Application__**: …' (Julius, 2026-10-27). Important = matters but not the most
//   urgent (yellow). Stretch = bonus if there's time. Later = blue, can wait.
// Look (Julius, 2026-10-27): box outline and dividers are the same thin 1px day-colored line; fill is a slightly darker
//   day tint; every underlined line (Focus areas, Priority check entries) shows bold too.
// Titles (Julius, 2026-10-27): every word of the block title and every '## ' section header is capitalized,
//   e.g. 'Suggested Day · Tue 10/27', '## Important / Not The Most Urgent', '## Stretch · Bonus If There\'s Time',
//   '## Later · Can Wait', 'Day Wrap-Up · …', '## Focus (Most Time First)', '## Priority Check · **N/10**', '## Carries Over'.
// Bold names (Julius, 2026-10-27): every bold or underlined name is Title Cased (each word capitalized) and
//   written **Name**: short details. Time-block detail lines too: '  9:00–10:45 · **SOQ**: 2 pages …'. Wrap-up
//   stat lines likewise ('**Done**: 28 / 36 tasks', '**Urgent**: …'); Priority Check entries '__Time Went To Apps__'.
// Times (Julius, 2026-10-27): in the Suggested Day every time or time range is bold: '  **9:00–10:45** · **SOQ**: …'.
// rev: bump (2, 3, …) to re-render an already-inserted block in place; a block he deleted stays deleted.
// Each entry is applied once (ids in script property "claudeNotesApplied"); deleting it in the app keeps it deleted.
// Ids must be unique and never reused. Prune entries older than ~30 days.
const CLAUDE_NOTES = [
  { id: 'n-20261026-wrap', rev: 6, cells: true, date: '2026-10-26', kind: 'wrap', title: 'Day Wrap-Up · Mon 10/26', lines: [
    '**Done**: 28 / 36 tasks in today\'s cell (3 more Claude items land on next load)',
    '**Urgent**: 1 yellow open (Halloween gig, Fri 10/30)',
    '## Focus (Most Time First)',
    '__Gantt__ · 13 Claude items',
    'Calendar panel · nightly plan + wrap-up · Reference Options · create from Urgent · Inbox · due styles · grouped done log · Due group · * marker · your sort row, urgency checkbox, margins',
    '__Exercise Tracker__ · 6 Claude items',
    'PT rotation · In Today marker · weight-only logging · fits every screen · compact Today · Hide grid',
    '__IT Associate 2__ · CDCR JC-535126',
    'Compared jobs · application doc · tailored combined résumé',
    '__Other__',
    'CalCareers block moved to Tue 4–6:30 pm · FAQ: Claude can write to it · light exercise done',
    '## Priority Check · **5/10**',
    '__Time Went To Apps__',
    '~19 Gantt + Exercise Tracker items; both could have waited until after the deadline',
    '__Deadline Still Open__',
    'CDCR application is due Tue; SOQ, cover letter and STD 678 not started',
    '__What Went Right__',
    'Jobs compared and résumé tailored, so tomorrow starts from a solid base',
    '__Fix For Tomorrow__',
    'CDCR first thing; no app work until it\'s submitted',
    '## Carries Over',
    '[] **CDCR IT Application (JC-535126)**: submit by end of day Tue 10/27',
    '  [] **SOQ**: 2 pages, answer each question against the duty statement',
    '  [] **Cover Letter**: one page, field support + troubleshooting',
    '  [] **STD 678**: work history to match the résumé',
    '  [] **Submit On CalCareers**: attach résumé, cover letter, SOQ; check every file',
    '[] **Claude-To-Gantt Pipeline**: hold a button, tell Claude a task, it lands in today\'s cell (needs the Apps Script endpoint)',
    '[] **Move Out Ex Thing**: move the exercise items out of Gantt (confirm details)',
    '[] **Frictionless Capture**: button opens Claude listening; idea becomes Title: details in the Inbox',
    '[] **Halloween Gig (Fri 10/30)**: rock show for a friend; final prep check',
  ] },
  { id: 'n-20261027-plan', rev: 11, cells: true, date: '2026-10-27', kind: 'plan', title: 'Suggested Day · Tue 10/27', lines: [
    '## Calendar',
    '- **CalCareers Block**: **4:00–6:30**',
    '- **Dog Walks**: none today',
    '## Must Do / Urgent + Important',
    '- **__CDCR Application__**: due end of day today',
    '  **9:00–10:45** · **SOQ**: 2 pages against the duty statement',
    '  **10:45–12:00** · **Cover Letter**: one page',
    '- **__Submit It__**: in the **4:00–6:30** CalCareers block',
    '  **4:00–5:15** · **STD 678**: match the résumé',
    '  **5:15–6:30** · **Attach + Submit**: résumé, cover letter, SOQ',
    '## Important / Not The Most Urgent',
    '- **Claude-To-Gantt Pipeline**: only after submitting',
    '  **12:30–1:45** · **Endpoint Plan**: Apps Script endpoint',
    '- **Calendar Visibility**: confirm Claude sees every calendar before scheduling',
    '- **Dog Walk Scheduler**: auto walking blocks from the walk calendar',
    '  **7:00–7:30 pm** · **Plan It**: travel-time list per client, 30-min gap split, update on walk changes',
    '## Stretch · Bonus If There\'s Time',
    '- **IT Lab (AD / M365)**: target ~Nov 6',
    '  **7:30–8:30 pm** · **Next Lab Step**: AD / M365',
    '- **A+ Review**: modular vs non-modular PSUs',
    '## Later · Can Wait',
    '- **Cleanup IT Associate Ref**: after submitting',
    '- **Pin References To Top**: stay put when sorting',
    '- **Move Out Ex Thing** · **Frictionless Capture**',
  ] },
];
