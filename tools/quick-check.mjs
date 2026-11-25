// Quick pre-push check (2026-11-25, NOTES "Dev speed"): runs only what the changed files can break.
//   node tools/quick-check.mjs            → changes vs origin/main (committed + uncommitted)
//   node tools/quick-check.mjs --full     → everything (same as CI)
// The full suite runs in CI on every push to main (reference-checks.yaml), so a miss here still gets caught.
import { execSync } from 'child_process';
import fs from 'fs';

const sh = c => execSync(c, { encoding: 'utf8' }).trim();
const run = (c, env = {}) => { console.log('▶ ' + c + (env.SMOKE_ONLY ? '  [' + env.SMOKE_ONLY + ']' : '')); execSync(c, { stdio: 'inherit', env: { ...process.env, ...env } }); };
// No Playwright browser downloaded (cloud sessions) → use an installed Chrome.
if (!process.env.SMOKE_CHROME) {
  let pw = ''; try { pw = (await import('playwright')).chromium.executablePath(); } catch (e) {}
  const sys = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
  if ((!pw || !fs.existsSync(pw)) && sys) process.env.SMOKE_CHROME = sys;
}

let files = [];
try { files = sh('git diff --name-only origin/main; git diff --name-only; git ls-files --others --exclude-standard').split('\n').filter(Boolean); } catch (e) { files = ['?']; }
files = [...new Set(files)];
const full = process.argv.includes('--full');

// File → smoke suites. Anything not listed (and not docs) → full run.
const PWA = ['pwa', 'pwa-fb', 'pwa-days', 'pwa-hist', 'pwa-ref', 'pwa-cal', 'pwa-d2'];
const MAP = [
  [/^(docs\/|README\.md$|CLAUDE\.md$|\.gitignore$)/, []],
  [/^tools\/(pwa\/|pwa-api\/|build-pwa\.mjs$)/, PWA],
  [/^Store\.gs$/, ['main', ...PWA]],
  [/^Code\.gs$/, ['main', 'resume', 'calendar']],
  [/^Index_Calendar\.html$/, ['calendar', 'calcache', 'pwa-cal']],
  [/^Index_Main\.html$/, ['main', 'snap', 'resume', 'calcache']],
  [/^(Index\.html|Index_(Css|LateCss|Cards|Extras|Layout)\.html|WeekdayIcons\.html)$/, ['main', 'pwa']],
  [/^Drafts\.html$/, ['drafts', 'pwa-days']],
  [/^tracker\//, ['tracker']],
  [/^functions\//, ['pwa-d2']],
  [/^tools\/quick-check\.mjs$/, []]
];
const suites = new Set(); let unknown = full;
for (const f of files) {
  const hit = MAP.find(([re]) => re.test(f));
  if (hit) hit[1].forEach(s => suites.add(s)); else unknown = true;
}
const gs = files.some(f => /\.gs$/.test(f));

run('node tools/check.mjs');
if (gs || unknown) run('node tools/store-test.mjs');
if (unknown) { console.log('Full smoke (' + (full ? '--full' : 'unmapped file changed') + ')'); run('node tools/smoke.mjs'); }
else if (suites.size) run('node tools/smoke.mjs', { SMOKE_ONLY: [...suites].join(',') });
else console.log('Docs only: no smoke needed.');
console.log('✓ quick-check passed (' + files.length + ' files)');
