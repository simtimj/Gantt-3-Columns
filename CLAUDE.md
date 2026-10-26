# Focus Workspace (Gantt 3 Columns)

Google Apps Script web app: `Code.gs` (server, Sheets storage) and `Index.html`
(all UI). Pushing to `main` deploys via `.github/workflows/deploy.yaml`.

## Reminders / direction

- Keep the top toolbar minimal. Prefer short labels (Scale, Col, Fit, Reset,
  Ref) and remove buttons whose job is covered elsewhere. Keep trimming it
  over time.
- Mobile mode was removed; phones use the same layout, sized with Scale.
- The Focus button was removed; only "Show toolbar" (in the focus bar) remains
  for anyone whose saved state still hides the toolbar.
