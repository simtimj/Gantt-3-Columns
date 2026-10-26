// Inbox items added by Claude (2026-10-26). Julius says an idea out loud,
// Claude cleans it up and adds it here, then pushes to main (deploys in ~1 min).
// Format: { id: 'c-YYYYMMDD-short-slug', title: 'Concise title', details: 'What else is needed', added: 'YYYY-MM-DD' }
// The app shows them as **Title**: details in the Inbox under Urgent (Reference).
// Dismissed / sent-to-Today ids are remembered in the app, so old items here
// are hidden once handled; Claude can prune entries older than ~30 days.
const CLAUDE_INBOX = [
  { id: 'c-20261026-personal-faq', title: 'Personal FAQ → Claude', details: 'Later: find the FAQ Google Doc, save its location in Claude\'s memory so you can just ask Claude instead of searching it; optionally clean it up or move it into a Claude Doc', added: '2026-10-26' },
];
