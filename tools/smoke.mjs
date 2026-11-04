// Smoke test (2026-11-04): loads Index.html in headless Chromium with a stubbed google.script.run and
// sample data, then reports page errors. Run: node tools/smoke.mjs [--shot out.png]. Needs playwright
// (preinstalled in Claude cloud sessions). Writes the built page to /tmp, never into the repo.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const line = (t, a = '') => `<div class="check-line" data-level="0"${a}><input type="checkbox"><span class="check-text">${t}</span></div>`;
const data = {
  today, inbox: [], cardCats: [], notesSeeds: {}, urgent: [], refPins: [],
  days: [{ date: today, journal: '',
    tasks: line('Pay rent', ' data-urg="1"') + line('Walk dog') +
      // IT study entry (StudyLog.gs): folded title + its own detail lines.
      '<div class="check-line done" data-level="0" data-study="' + today + ':morning" data-tl="1" data-fold="1" data-at="11:17" data-dt="11:17">' +
      '<input type="checkbox" checked><span class="check-text"><b>IT study</b>: 20 min · 2 answered · 1 ✓ · 0 partial · 1 ✗ · DNS</span></div>' +
      '<div data-level="1" data-study-of="' + today + ':morning" style="margin-left: 24px;">✓ <b>DNS</b>: What is DNS?</div>' +
      '<div data-level="1" data-study-of="' + today + ':morning" style="margin-left: 24px;">✗ <b>NAT</b>: What is NAT?</div>' +
      line('After study'),
    plan: '<div data-title="1" data-tl="1"><b>Next Block</b></div>' + line('Email') }],
  reference: [{ id: 'r1', parentId: '', type: 'item', title: '', content: '<h2>Sample card</h2><p>text</p>', expanded: true, sort: 1 }],
};
const stub = `<script>window.google={script:{run:new Proxy({},{get(t,k){let ok=null;const p=new Proxy({},{get(_,m){
  if(m==='withSuccessHandler')return f=>{ok=f;return p;}; if(m==='withFailureHandler'||m==='withUserObject')return()=>p;
  return(...a)=>setTimeout(()=>ok&&ok(m==='getMainCalendarEvents'?{date:a[0],events:[{id:'e1',calId:'c',start:0,title:'Sample event',allDay:true,done:false}]}:null),10);}});return p[k];}})}};</script>`;
let html = fs.readFileSync('Index.html', 'utf8')
  .replace("<?!= HtmlService.createHtmlOutputFromFile('WeekdayIcons').getContent() ?>", fs.readFileSync('WeekdayIcons.html', 'utf8'))
  .replace('<?!= initialData ?>', JSON.stringify(data)).replace(/<\?= appUrl \?>/g, '#').replace('<?= build ?>', 'smoke')
  .replace('<head>', '<head>' + stub);
const out = path.join(os.tmpdir(), 'gantt-smoke.html');
fs.writeFileSync(out, html);
const b = await chromium.launch();
let fails = 0;
for (const [name, view] of [['desktop', { width: 1300, height: 900 }], ['phone', { width: 412, height: 915, isMobile: true, hasTouch: true }]]) {
  const pg = await (await b.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch })).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + out);
  await pg.waitForTimeout(2000);
  const shot = process.argv.indexOf('--shot');
  if (shot > 0) await pg.screenshot({ path: process.argv[shot + 1].replace(/(\.png)?$/, '-' + name + '.png') });
  // The study entry stays folded: its 2 detail lines are hidden, the next task is not, and they follow it.
  const study = await pg.evaluate(() => {
    const head = document.querySelector('.day-editor [data-study]');
    if (!head) return 'no study entry';
    const kids = [...document.querySelectorAll('.day-editor [data-study-of]')];
    if (kids.length !== 2 || kids.some(k => k.getAttribute('data-tlhid') !== '1')) return 'detail lines not folded';
    if (head.nextElementSibling !== kids[0] || kids[0].nextElementSibling !== kids[1]) return 'detail lines split from their entry';
    const after = [...document.querySelectorAll('.day-editor .check-line')].find(x => /After study/.test(x.textContent));
    if (after && after.hasAttribute('data-tlhid')) return 'fold hides the next task';
    return '';
  });
  if (study) errs.push('IT study entry: ' + study);
  if (errs.length) { fails += errs.length; console.error('✗ ' + name + ':\n  ' + errs.join('\n  ')); }
  else console.log('✓ ' + name + ': loads with no page errors');
}
await b.close();
process.exit(fails ? 1 : 0);
