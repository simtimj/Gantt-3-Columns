// Gantt PWA build (2026-11-21, docs/NOTES.md H). Turns the Apps Script pages into a static, installable site:
//   node tools/build-pwa.mjs [outDir=dist]
// Renders the <? ?> scriptlets, injects the google.script.run → fetch shim (tools/pwa/shim.js.txt), adds the
// manifests, icons and service worker (tools/pwa/sw.js.txt). API URL: env PWA_API_URL, else tools/pwa-api/project.json.
// Sources here are .txt / .mjs so the main project's clasp push never picks them up.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const out = process.argv[2] || 'dist';
const read = f => fs.readFileSync(f, 'utf8');
let project = {};
try { project = JSON.parse(read('tools/pwa-api/project.json')); } catch (e) {}
const api = process.env.PWA_API_URL || project.url || '';
// Database step (2026-11-22, NOTES H3): Firebase web config; empty apiKey = off (no SDK shipped, Keep In Mind on the server).
let fbCfg = null;
try { fbCfg = JSON.parse(process.env.PWA_FIREBASE_CONFIG || read('tools/pwa/firebase-config.json')); } catch (e) {} // env: tests only
if (!fbCfg || !fbCfg.apiKey) fbCfg = null;
const FB_FILES = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'];
if (!api) console.warn('⚠ No API URL yet (tools/pwa-api/project.json); the app will show "Offline".');

const include = name => read(name.endsWith('.html') ? name : name + '.html');
const render = html => html
  .replace(/<\?!=\s*HtmlService\.createHtmlOutputFromFile\('([^']+)'\)\.getContent\(\)\s*\?>/g, (_, n) => include(n))
  .replace(/<\?!=\s*trackerInclude_\('([^']+)'\)\s*\?>/g, (_, n) => include(n))
  .replace(/<\?=\s*appUrl\s*\?>/g, './')
  .replace(/<\?!=\s*initialData\s*\?>/g, '(window.__PWA_INITIAL__ || null)')
  // The PWA has its own update button; an empty build turns the in-page "New version" bar off.
  .replace(/<\?=\s*build\s*\?>/g, '');

const CSS = `<style id="pwaCss">
#pwaOffline{position:fixed;left:50%;transform:translateX(-50%);top:max(6px,env(safe-area-inset-top));z-index:2147483000;
  background:#5c5f66;color:#fff;font:600 13px/1 system-ui,sans-serif;padding:7px 12px;border-radius:999px;pointer-events:none;transition:background .2s}
#pwaOffline.pwa-flash{background:#d6336c}
#pwaUpdate{position:fixed;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;border:0;border-radius:999px;
  background:#2f6fde;color:#fff;font:600 15px/1 system-ui,sans-serif;padding:12px 16px;box-shadow:0 4px 14px rgba(0,0,0,.3)}
#pwaSignIn{position:fixed;left:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;border:1px solid #3a3f48;border-radius:999px;
  background:#1b1e24;color:#e8eaed;font:600 13px/1 system-ui,sans-serif;padding:9px 13px;box-shadow:0 4px 14px rgba(0,0,0,.3)}
#pwaKeyBox{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}
#pwaKeyBox>div{background:#fff;color:#1b1d22;border-radius:14px;padding:18px;max-width:420px;width:100%;font:15px/1.4 system-ui,sans-serif}
#pwaKeyBox input{width:100%;box-sizing:border-box;padding:10px;margin:6px 0 10px;font:inherit;border:1px solid #ccc;border-radius:8px}
#pwaKeyBox button{width:100%;padding:11px;border:0;border-radius:8px;background:#2f6fde;color:#fff;font:600 15px system-ui,sans-serif}
@media (prefers-color-scheme:dark){#pwaKeyBox>div{background:#1b1e24;color:#e8eaed}#pwaKeyBox input{background:#111317;color:#e8eaed;border-color:#3a3f48}}
</style>`;

const shimSrc = read('tools/pwa/shim.js.txt');
const pages = [
  { file: 'index.html', src: 'Index.html', page: 'index', name: 'Gantt', manifest: 'manifest.webmanifest', icon: 'gantt' },
  { file: 'tracker.html', src: 'tracker/App.html', page: 'tracker', name: 'Time Tracker', manifest: 'tracker.webmanifest', icon: 'tracker' }
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
for (const f of fs.readdirSync('tools/pwa/icons')) fs.copyFileSync(path.join('tools/pwa/icons', f), path.join(out, 'icons', f));
if (fbCfg) {
  fs.mkdirSync(path.join(out, 'fb'), { recursive: true });
  for (const f of FB_FILES) fs.copyFileSync(path.join('tools/pwa/vendor', f + '.txt'), path.join(out, 'fb', f));
}

const built = pages.map(p => ({ p, html: render(read(p.src)) }));
const build = crypto.createHash('sha1').update(api + JSON.stringify(fbCfg) + shimSrc + read('tools/pwa/sw.js.txt') + built.map(b => b.html).join('')).digest('hex').slice(0, 12);

for (const { p, html } of built) {
  const shim = shimSrc.replace('__API__', api).replace('__PAGE__', p.page).replace('__BUILD__', build)
    .replace('__FIREBASE__', JSON.stringify(fbCfg).replace(/</g, '\\u003c'));
  const head = `
  <link rel="manifest" href="${p.manifest}">
  <link rel="icon" href="icons/${p.icon}-192.png">
  <link rel="apple-touch-icon" href="icons/${p.icon}-apple-180.png">
  <meta name="mobile-web-app-capable" content="yes">
  ${CSS}
  <script>${shim}</script>`;
  let doc = html.replace(/<head>/i, '<head>' + head)
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, `<meta name="apple-mobile-web-app-title" content="${p.name}">`);
  doc = /<title>/i.test(doc) ? doc.replace(/<title>[^<]*<\/title>/i, `<title>${p.name}</title>`) : doc.replace(/<\/head>/i, `  <title>${p.name}</title>\n</head>`);
  if (/<\?/.test(doc.replace(/<script>[\s\S]*?<\/script>/g, ''))) throw new Error(p.src + ': an Apps Script scriptlet was left unrendered');
  fs.writeFileSync(path.join(out, p.file), doc);
  fs.writeFileSync(path.join(out, p.manifest), JSON.stringify({
    id: p.page === 'index' ? './' : './tracker.html',
    name: p.name, short_name: p.name, start_url: p.file === 'index.html' ? './' : './tracker.html',
    scope: './', display: 'standalone', background_color: '#1b1e24', theme_color: '#1b1e24',
    icons: [
      { src: `icons/${p.icon}-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `icons/${p.icon}-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `icons/${p.icon}-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }, null, 2));
}

const shell = ['./', 'index.html', 'tracker.html', ...pages.map(p => p.manifest), ...fs.readdirSync(path.join(out, 'icons')).map(f => 'icons/' + f),
  ...(fbCfg ? FB_FILES.map(f => 'fb/' + f) : [])];
fs.writeFileSync(path.join(out, 'sw.js'), read('tools/pwa/sw.js.txt').replace('__BUILD__', build).replace('__SHELL__', JSON.stringify(shell)));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('✓ PWA built → ' + out + ' (build ' + build + ', API ' + (api ? 'set' : 'missing') + ', Firebase ' + (fbCfg ? 'on' : 'off') + ')');
