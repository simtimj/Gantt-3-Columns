// Storage-layer ratchet (2026-11-21, docs/NOTES.md → "H2. Storage layer").
// Only Store.gs may talk to the Sheet or Properties. Files not moved yet are allowed
// their current count (tools/store-baseline.json); a count may only go DOWN.
// New features call Store.*; adding a direct call anywhere else fails the check.
// After moving an area: run `node tools/store-guard.mjs --update` to lower the baseline.
import fs from 'fs';
const RX = /\bgetOrCreateSheet_\(|\.getSheetByName\(|\bss_\(\)|\bSpreadsheetApp\.|\.get(User|Script|Document)Properties\(\)/g;
const files = [...fs.readdirSync('.'), ...fs.readdirSync('tracker').map(x => 'tracker/' + x)]
  .filter(f => /\.gs$/.test(f) && f !== 'Store.gs');
const count = f => (fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').match(RX) || []).length;
const base = JSON.parse(fs.readFileSync('tools/store-baseline.json', 'utf8'));
const now = Object.fromEntries(files.map(f => [f, count(f)]));
export function storeGuard() {
  let bad = 0;
  for (const [f, n] of Object.entries(now)) {
    const allowed = base[f] ?? 0;
    if (n > allowed) { bad++; console.error('✗ ' + f + ': ' + n + ' direct Sheet/Properties calls (allowed ' + allowed + '). Go through Store.* (Store.gs) instead.'); }
    else if (n < allowed) console.log('↓ ' + f + ': ' + n + ' < baseline ' + allowed + ' — run node tools/store-guard.mjs --update');
  }
  return bad;
}
if (process.argv[1] && process.argv[1].endsWith('store-guard.mjs')) {
  if (process.argv.includes('--update')) {
    fs.writeFileSync('tools/store-baseline.json', JSON.stringify(now, null, 2) + '\n');
    console.log('baseline updated', now);
  } else process.exit(storeGuard() ? 1 : (console.log('✓ storage layer: no new direct calls'), 0));
}
