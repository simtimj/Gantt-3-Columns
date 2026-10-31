// Open tasks added by Claude (2026-10-27, Julius: "add this to the Gantt for later in urgency").
// Format: { id: 't-YYYYMMDD-short-slug', date: 'YYYY-MM-DD', title: 'Main task', urg: 1|2|3, due: 'YYYY-MM-DD' (optional), dur: minutes (optional, 1–6000 = up to 100h), subtasks: ['Sub one', 'Sub two'] }
// urg: 1 = red / must do, 2 = yellow / next, 3 = blue / can be later. Subtasks get the parent's urgency.
// applyClaudeTasks_() in Code.gs appends each entry once, as open check-lines at the end of that day's
// Today cell (ids remembered in script property claudeTasksApplied, so a deleted task stays deleted).
// Ids must be unique and never reused; prune entries older than ~30 days.
// date: 'backlog' = into the Reference Backlog cell (shows in Urgent, not in Today).
const CLAUDE_TASKS = [
  { id: 't-20261031-ai-overlay', date: 'backlog', title: 'AI overlay: floating Claude + ChatGPT like Gemini\'s · Code', urg: 3, subtasks: [
    'Minimal floating bar over any app, opened by side key / back tap',
    'Loads claude.ai / chatgpt.com on his subscriptions (no paid API)',
    'On open: continue last chat or start new',
    'Next: paste the scoping prompt into ChatGPT, bring the finished spec to Claude to build',
  ] },
  { id: 't-20261029-pane-tiling', date: 'backlog', title: 'Gantt: free pane layout (tile like desktop windows)', urg: 3, subtasks: [
    'Arrange Today / Tasks, Notes and Reference as blocks, not just columns',
    'e.g. Today top-left, Notes bottom-left, Reference as a bigger area on the right',
    'Drag panes around like desktop windows so they fill the screen',
  ] },
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
