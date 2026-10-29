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
//   Section order: '## Calendar' → '## Important / Not The Most Urgent' → '## Stretch' → '## Later'. No For fun section.
//   Calendar: only real events (e.g. '- **CalCareers block**: 4:00–6:30'); never wake, routine, nap, chill or
//   other fixed daily blocks. Always a dog-walk line from the Time To Pet calendar with client first names:
//   '- **Dog walks**: 11:15 Brittany · 12:00 Catherine · 12:30 David', or '- **Dog walks**: none today'.
//   No Must Do / Urgent + Important section (removed Julius, 2026-10-29: must-dos live on his calendar). Important = matters but not the most
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
// Wrap-up layout (Julius, 2026-10-29: the old Done / Urgent lines were one big mass): sections in this order,
//   each its own cell: '## Done · **D/T**' → one '- **Area**: N items' entry per area (most time first) with
//   each item on its own '  ' detail line (max ~7, merge the rest); '## Still Urgent · **N Open**' → one
//   '- **Name**: due' line per open red/yellow task; '## Priority Check · **N/10**' → '- **Label**: detail'
//   lines; '## Carries Over'. Block titles render as banners: Suggested Day yellow, Day Wrap-Up purple.
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
  { id: 'n-20261027-wrap', cells: true, date: '2026-10-27', kind: 'wrap', title: 'Day Wrap-Up · Tue 10/27', lines: [
    '**Done**: 54 / 59 tasks in today\'s cell',
    '**Urgent**: 2 yellow open (White Elephant Present · Halloween Gig, Fri 10/30)',
    '## Focus (Most Time First)',
    '__Gantt__ · 48 Claude items',
    'Task cards + drag · card subjects · title lines that fold · folded lines protected · day sections with boxes, times, spacing · own dark mode, dark cells, tint, day-colored cells, text brightness · light / dark toggle · saved looks → Sheet · Due today group in Notes · swipe between columns · Urgent counts + subtasks · compact Reference · task count under the date · tasks.js pipeline (crabbing task)',
    '__IT Associate 2__ · CDCR JC-535126',
    'SOQ · cover letter · STD 678 · application submitted before the deadline',
    '__Userscripts__ · 3 Claude items',
    'EH recent tags box · tags in sections · tags column (v2.9.0)',
    '__Career__',
    'Security path picked over cloud / analyst · salaries compared · Road To AI Security Engineer roadmap',
    '__Exercise Tracker__ · 2 Claude items',
    '⋯ options confirmed · Up next marker',
    '__Other__',
    'Workout moved to after nap (Mon–Fri 3:00–3:30) · Sun / water / outside added at 8:45 am · rock show blocks (restring Tue, run-through Thu 4–5) · white elephant gift figure',
    '## Priority Check · **7/10**',
    '__Deadline Met__',
    'CDCR application submitted before the Oct 27 deadline',
    '__Time Went To Apps__',
    '48 Gantt items, most of them colors, dark mode and layout',
    '__Still Open__',
    'Halloween gig Fri; White Elephant present; hold-button capture into Gantt not built yet',
    '__Fix For Tomorrow__',
    'Pipeline first in the 9–11 block; look tweaks only after',
    '## Carries Over',
    '[] **Get White Elephant Present**: yellow, open in Tue\'s cell',
    '[] **Halloween Gig (Fri 10/30)**: run-through Thu 4–5 pm',
    '[] **Crabbing Trip Prep**: trip Nov 16–20',
    '  [] **Grippy Rubber Gloves**: buy a new pair',
    '  [] **Bait**: buy or figure out',
    '[] **Pin References To Top**: stay put when sorting',
    '[] **Raindrop Saved Indicator**: badge on the extension button when the page is already saved (Yandex mobile)',
    '[] **Cleanup IT Associate Ref**: application is in, tidy the Reference cell',
    '[] **Gantt Note**: finish the half-written \'how to add something to…\' line in Tue\'s cell',
  ] },
  { id: 'n-20261028-plan', cells: true, date: '2026-10-28', kind: 'plan', title: 'Suggested Day · Wed 10/28', lines: [
    '## Calendar',
    '- **Work Block**: **11:00–1:15**',
    '- **Dog Walks**: **11:15** Brittany · **12:00** Catherine · **12:30** David',
    '  **Open**: **9:00–11:00** · **1:15–2:00** · **3:30–9:30 pm** (nap 2–3, workout 3–3:30)',
    '## Must Do / Urgent + Important',
    '- **__Claude-To-Gantt Pipeline__**: hold a button, say a task, it lands in today\'s cell',
    '  **9:00–11:00** · **Apps Script Endpoint**: build on tasks.js; test one task end to end',
    '- **__Rock Show Prep__**: gig Fri 10/30',
    '  **3:30–4:15** · **Strings + Set List**: guitar ready for Thu\'s 4–5 run-through',
    '## Important / Not The Most Urgent',
    '- **White Elephant Present**: yellow, open since Tue',
    '  **1:15–2:00** · **Pick + Order It**',
    '- **Dog Walk Scheduler**: auto walking blocks from the Time To Pet calendar',
    '  **4:15–5:15** · **Travel-Time List**: per client, 30-min gap split',
    '- **Schedule Review**: post-nap chill vs planned blocks, if not done Tue',
    '  **5:15–5:45** · **Review**',
    '## Stretch · Bonus If There\'s Time',
    '- **IT Lab (AD / M365)**: target ~Nov 6',
    '  **7:00–8:30 pm** · **Next Lab Step**',
    '- **A+ Review**: modular vs non-modular PSUs, by voice on the walks',
    '## Later · Can Wait',
    '- **Crabbing Trip Prep**: gloves + bait before Nov 16',
    '- **Pin References To Top** · **Raindrop Saved Indicator** · **Cleanup IT Associate Ref**',
    '- **Move Out Ex Thing** · **Frictionless Capture**',
  ] },
  { id: 'n-20261028-wrap', rev: 1, cells: true, date: '2026-10-28', kind: 'wrap', title: 'Day Wrap-Up · Wed 10/28', lines: [
    '## Done · **30/40**',
    '- **Gantt**: 29 Claude items, ~3 hrs',
    '  Tap to pick, tap again to type',
    '  Drag grip + hold anywhere to drag',
    '  Drop anywhere in Urgent, nest by sliding',
    '  Urgent fold, add, text hold menu',
    '  Backlog + Remove From Today',
    '  Subtask due dates + task durations',
    '  Quiet cards, side space, slimmer boxes',
    '- **Walk Blocks Script**: built + tested',
    '  Reads Time To Pet every 15 min, writes Walking Blocks',
    '  Drive times for 12 clients',
    '- **Julius AI Hub**: docs moved to Google',
    '  16 Claude Docs + 3 pages copied, Doc Index',
    '  A+ Study Sheet, Reference + Interview Prep',
    '- **Calendar + Planning**: Wed reworked around 10–2 walks',
    '  Eisenhower ranking decided · grey = done rule',
    '- **Other**: knit up pillow · fixed dog belt hook',
    '## Still Urgent · **4 Open**',
    '- **IT Lab**: due Fri 11/6',
    '- **Halloween Gig**: Fri 10/30',
    '- **A+ Core 1 Review**',
    '- **White Elephant Present**',
    '## Priority Check · **5/10**',
    '- **Time Went To Gantt UI**: ~3 of ~4 hrs on tap, drag and grip fixes',
    '- **Went Right**: Walk Blocks built · AI Hub set up · durations added',
    '- **Still Open**: Walk Blocks setup (now Thu 9:15) · IT lab ~1 hr behind · Tasks tab not started',
    '- **Fix For Tomorrow**: setup + Tasks tab before any Gantt UI work',
    '## Carries Over',
    '[] **Walk Blocks Setup**: create repo simtimj/apps-scripts + CLASPRC_JSON secret, Claude pushes, run installTrigger once (Thu 9:15)',
    '[] **Claude Pipeline + Tasks Tab**: due Tue 11/3; Gantt Sheet Tasks tab (name, due, duration, importance)',
    '[] **AI Instructions Card**: was due Wed, in the Reference Backlog; write + verify the rules',
    '[] **IT Lab (AD / M365)**: due Fri 11/6, 8 subtasks unticked',
    '  [] **Finish Lab DC001**: rename LAB-DC01, static IP, promote to domain controller',
    '[] **White Elephant Present**: yellow, open since Tue',
  ] },
  { id: 'n-20261029-plan', rev: 2, cells: true, date: '2026-10-29', kind: 'plan', title: 'Suggested Day · Thu 10/29', lines: [
    '## Calendar',
    '- **Walk Blocks Setup**: **9:15–9:35**',
    '- **Rock Show Run-Through**: **4:30–5:00**',
    '- **Last Band Practice**: **5:00–9:30 pm**',
    '- **Dog Walks**: none today',
    '  **Open**: **9:35–2:00** · **3:30–4:30** (nap 2:10–3, workout 3–3:30)',
    '## Important / Not The Most Urgent',
    '- **IT Lab (AD / M365)**: due Fri 11/6, ~1 hr behind',
    '  **1:00–2:00** · **Finish Lab DC001**: rename LAB-DC01, static IP, promote to domain controller',
    '- **White Elephant Present**: yellow, open since Tue',
    '  **3:30–4:00** · **Pick + Order It**',
    '- **Job Search**: 2–3 applications (Wed\'s 8:30 pm block); no gap left Thu, fit in Fri',
    '## Stretch · Bonus If There\'s Time',
    '- **Gantt Auto-Reshuffle Step 2**: free-gap finder in Code.gs',
    '  **4:00–4:30** · **Gap Finder**',
    '- **Gantt Phone Checks**: confirm Wed\'s changes so they move to Working',
    '## Later · Can Wait',
    '- **A+ Core 1 Review**: yellow in Wed\'s cell; A+ is off the priorities (certified)',
    '- **Crabbing Trip Prep**: gloves + bait before Nov 16',
    '- **Pin References To Top** · **Raindrop Saved Indicator** · **Cleanup IT Associate Ref**',
  ] },
];
