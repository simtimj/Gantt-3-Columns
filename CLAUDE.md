# Gantt 3 Columns — notes for Claude

- Google Apps Script web app (Today / Notes / Reference columns over a Google Sheet). Pushing to `main` auto-deploys via `.github/workflows/deploy.yaml`, so keep commits small and working. Julius mostly works from his phone.
- Files: `Code.gs` (server), `Index.html` (all UI), `appsscript.json`.

## README is the feature list — always keep it current

- `README.md` lists every feature under: ✅ Working · 🧪 To be confirmed · 🔧 To be improved · 📋 To do · 💤 Shelved.
- **Every change that adds, changes or removes a feature must update `README.md` in the same commit.** New work goes under 🧪 To be confirmed (with the date); move it to ✅ Working once Julius says it works; anything he wants tweaked goes under 🔧; ideas he mentions but hasn't asked to build go under 📋. Update the "Last updated" date.
- Keep useful info that's removed from the screen (e.g. the shortcuts list) in the README.

## Inbox — how Claude adds items (2026-10-26)

- When Julius says "add to my Gantt inbox: …" (or captures an idea for the planner), clean it up into a concise title + details and append to `CLAUDE_INBOX` in `inbox.js`: `{ id: 'c-YYYYMMDD-short-slug', title: 'Concise title', details: 'what else is needed', added: 'YYYY-MM-DD' }`. Ids must be unique and never reused. Push to `main`; it shows in the app in ~1 min, rendered **Title**: details.
- Claude can't reach Google from its workspace, so this file is the pipeline. Dismissed / sent-to-Today ids are stored in the app's user properties (`inboxDone`), so handled items stay hidden; prune entries older than ~30 days when editing the file.
- Items typed in the app live in user properties (`inboxItems`). Server: `getInbox()`, `addInboxItem()`, `dismissInboxItem()` in `Code.gs`; client: `renderInbox()`, `addTaskToToday()` in `Index.html`.
- Urgent panel create: `holdForCreate()` / `openCreateMenu()` / `createRow()` → `addTaskToToday(title, details, urg)` appends a check-line to today's Today cell. Reference options live in `#refOptions` (`initRefOptions()`); `fw.urgWrap` toggles wrapping (default on).
