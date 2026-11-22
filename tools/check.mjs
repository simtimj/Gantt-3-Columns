// Syntax check for everything clasp pushes (2026-11-04). Run before every push: node tools/check.mjs
// Parses (never runs) Code.gs, the root .js files and every inline <script> in the .html files.
// .mjs on purpose: clasp only pushes .gs/.js/.html/.json, so this file never reaches Apps Script.
import fs from 'fs';
import { storeGuard } from './store-guard.mjs';
let bad = 0;
const parse = (code, where) => {
  try { new Function(code); }
  catch (e) { bad++; console.error('✗ ' + where + ': ' + e.message); }
};
// tracker/ (2026-11-05): clasp pushes subfolders too, so the Time Tracker files get the same check.
for (const f of [...fs.readdirSync('.'), ...fs.readdirSync('tracker').map(x => 'tracker/' + x)]) {
  if (/\.(gs|js)$/.test(f)) parse(fs.readFileSync(f, 'utf8'), f);
  if (/\.html$/.test(f)) {
    const html = fs.readFileSync(f, 'utf8');
    [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
      const line = html.slice(0, m.index).split('\n').length;
      parse(m[1].replace(/<\?!?=?[\s\S]*?\?>/g, 'null'), f + ' <script> #' + (i + 1) + ' (line ' + line + ')');
    });
  }
}
if (bad) { console.error(bad + ' syntax error(s)'); process.exit(1); }
console.log('✓ syntax OK');
// Storage layer (2026-11-21 H2): no new direct Sheet/Properties calls outside Store.gs.
if (storeGuard()) process.exit(1);
console.log('✓ storage layer: no new direct calls');
// Database step (2026-11-22, NOTES H3): the server's Firebase project must be the PWA config's project.
{
  const fsm = await import('fs');
  const cfg = JSON.parse(fsm.readFileSync('tools/pwa/firebase-config.json', 'utf8'));
  const m = fsm.readFileSync('Store.gs', 'utf8').match(/const FIREBASE_PROJECT_ = '([^']*)'/);
  if (!m || m[1] !== String(cfg.projectId || '')) {
    console.error('✗ FIREBASE_PROJECT_ in Store.gs (' + (m && m[1]) + ') ≠ projectId in tools/pwa/firebase-config.json (' + cfg.projectId + ')');
    process.exit(1);
  }
  // H4: the database areas are switched on in both places together.
  const a = fsm.readFileSync('Store.gs', 'utf8').match(/const STORE_DB_AREAS_ = \[([^\]]*)\]/);
  const srv = a ? a[1].split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean).sort().join(',') : '?';
  const app = (cfg.areas || ['kim']).slice().sort().join(',');
  if (srv !== app) {
    console.error('✗ STORE_DB_AREAS_ in Store.gs (' + srv + ') ≠ areas in tools/pwa/firebase-config.json (' + app + ')');
    process.exit(1);
  }
  console.log('✓ Firebase project: ' + (m[1] || 'off') + ' · areas ' + app);
}
