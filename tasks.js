// Open tasks added by Claude (2026-10-27, Julius: "add this to the Gantt for later in urgency").
// Format: { id: 't-YYYYMMDD-short-slug', date: 'YYYY-MM-DD', title: 'Main task', urg: 1|2|3, due: 'YYYY-MM-DD' (optional), subtasks: ['Sub one', 'Sub two'] }
// urg: 1 = red / must do, 2 = yellow / next, 3 = blue / can be later. Subtasks get the parent's urgency.
// applyClaudeTasks_() in Code.gs appends each entry once, as open check-lines at the end of that day's
// Today cell (ids remembered in script property claudeTasksApplied, so a deleted task stays deleted).
// Ids must be unique and never reused; prune entries older than ~30 days.
const CLAUDE_TASKS = [
  { id: 't-20261028-it-lab', date: '2026-10-28', title: 'IT lab: Active Directory + Microsoft 365', urg: 2, due: '2026-11-06', subtasks: [
    'Finish Lab DC001: rename LAB-DC01, static IP, promote to domain controller',
    'AD users, groups, password + lockout policy',
    'Join the Windows 11 client to the domain',
    'Tickets: lockout + password reset, with screenshots',
    'Shared folders, permissions, mapped drives',
    'Print server + printer deployed to the client',
    'Microsoft 365 / Entra ID: users, licenses, MFA',
    'Asset inventory sheet + README write-up',
  ] },
  { id: 't-20261027-crabbing-prep', date: '2026-10-27', title: 'Crabbing trip preparation', urg: 3, subtasks: ['Buy new grippy rubber gloves', 'Buy or figure out bait'] },
  { id: 't-20261028-cert-a-plus-core1', date: '2026-10-28', title: 'Cert studies: CompTIA A+ Core 1 review', urg: 2, subtasks: [] },
];
