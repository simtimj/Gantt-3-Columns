# Gantt 3 Columns — notes for Claude

- Google Apps Script web app (Today / Notes / Reference columns over a Google Sheet). Pushing to `main` auto-deploys via `.github/workflows/deploy.yaml`, so keep commits small and working. Julius mostly works from his phone.
- Files: `Code.gs` (server), `Index.html` (all UI), `appsscript.json`.

## README is the feature list — always keep it current

- `README.md` lists every feature under: ✅ Working · 🧪 To be confirmed · 🔧 To be improved · 📋 To do · 💤 Shelved.
- **Every change that adds, changes or removes a feature must update `README.md` in the same commit.** New work goes under 🧪 To be confirmed (with the date); move it to ✅ Working once Julius says it works; anything he wants tweaked goes under 🔧; ideas he mentions but hasn't asked to build go under 📋. Update the "Last updated" date.
- Keep useful info that's removed from the screen (e.g. the shortcuts list) in the README.
