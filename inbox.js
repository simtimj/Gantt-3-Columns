// Inbox items added by Claude (2026-10-26). Julius says an idea out loud,
// Claude cleans it up and adds it here, then pushes to main (deploys in ~1 min).
// Format: { id: 'c-YYYYMMDD-short-slug', title: 'Concise title', details: 'What else is needed', added: 'YYYY-MM-DD' }
// The app shows them as **Title**: details in the Inbox under Urgent (Reference).
// Dismissed / sent-to-Today ids are remembered in the app, so old items here
// are hidden once handled; Claude can prune entries older than ~30 days.
// Inbox removed 2026-10-31 (Julius): new ideas go to tasks.js with date 'backlog', urg 3.
const CLAUDE_INBOX = [];
