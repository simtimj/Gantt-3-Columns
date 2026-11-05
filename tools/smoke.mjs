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
// Keep In Mind (2026-11-05): old-shape data (Task cards with why + subtasks) that must convert to a free nested list.
const focus = { v: 1, cats: [{ id: 'c1', name: 'Crabbing prep', col: false, projects: [
  { id: 'p1', title: 'Gear', why: 'Before Friday', col: false, tasks: [{ id: 'm-a', t: 'Gloves', d: 0 }, { id: 'm-b', t: 'Bait', d: 1 }] }] }] };
const data = {
  today, inbox: [], cardCats: [], notesSeeds: {}, urgent: [], refPins: [],
  days: [{ date: today, journal: '',
    tasks: line('Pay rent', ' data-urg="1"') + line('Walk dog') +
      // Urgent checkmarks (2026-11-04): a finished urgent task (yellow) and one with a subtask.
      '<div class="check-line done" data-level="0" data-urg="2"><input type="checkbox" checked><span class="check-text">Paid bill</span></div>' +
      line('Book trip', ' data-urg="3"') + '<div class="check-line" data-level="1" data-urg="3" style="margin-left: 24px;"><input type="checkbox"><span class="check-text">Pick dates</span></div>' +
      // History modes (2026-11-04): a Morning section with a 50-item Claude group.
      '<div data-tsec="morning" contenteditable="false">Morning</div><div data-cgrp="Gantt"><b><u>Gantt</u></b></div>' +
      Array.from({ length: 50 }, (_, i) => '<div class="check-line done" data-level="0" data-cid="s-' + i + '" data-dt="09:' + String(i % 60).padStart(2, '0') + '"><input type="checkbox" checked><span class="check-text"><b>*Item ' + i + ' with a fairly long title that has to wrap</b>: details</span></div>').join('') +
      // IT study entry (StudyLog.gs): folded title + its own detail lines.
      '<div class="check-line done" data-level="0" data-study="' + today + ':morning" data-tl="1" data-fold="1" data-at="11:17" data-dt="11:17">' +
      '<input type="checkbox" checked><span class="check-text"><b>IT study</b>: 20 min · 2 answered · 1 ✓ · 0 partial · 1 ✗ · DNS</span></div>' +
      '<div data-level="1" data-study-of="' + today + ':morning" style="margin-left: 24px;">✓ <b>DNS</b>: What is DNS?</div>' +
      '<div data-level="1" data-study-of="' + today + ':morning" style="margin-left: 24px;">✗ <b>NAT</b>: What is NAT?</div>' +
      line('After study'),
    plan: '<div data-title="1" data-tl="1"><b>Next Block</b></div>' + line('Email') }],
  reference: [{ id: 'r1', parentId: '', type: 'item', title: '', content: '<h2>Sample card</h2><p>text</p>', expanded: true, sort: 1 }],
};
// Fast start (2026-11-05): the page loads without imports, then runImports() returns the changed cells to merge in.
data.timing = { fast: true, total: 1, steps: {} };
const imported = { build: 'smoke', ref: {}, inbox: [], days: { [today]: { th: 'h-imported', jh: '',
  tasks: data.days[0].tasks + '<div class="check-line" data-level="0" data-at="09:30"><input type="checkbox"><span class="check-text">From import</span></div>' } } };
const stub = `<script>window.google={script:{run:new Proxy({},{get(t,k){let ok=null;const p=new Proxy({},{get(_,m){
  if(m==='withSuccessHandler')return f=>{ok=f;return p;}; if(m==='withFailureHandler'||m==='withUserObject')return()=>p;
  return(...a)=>{(window.__calls=window.__calls||[]).push([m,a]);return setTimeout(()=>ok&&ok(m==='runImports'||m==='getSyncState'?${JSON.stringify(imported)}:m==='getFocus'?${JSON.stringify(focus)}:m==='getMainCalendarEvents'?{date:a[0],events:[{id:'e1',calId:'c',start:0,title:'Sample event',allDay:true,done:false}]}:null),10);};}});return p[k];}})}};</script>`;
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
  // Fast start: the imported line is merged into the open page (no reload), after the load's own save if needed.
  await pg.waitForTimeout(2600);
  const merged = await pg.evaluate(() => [...document.querySelectorAll('#todayScroll .day-editor .check-text')].some(x => x.textContent === 'From import')
    && (window.__calls || []).some(c => c[0] === 'runImports'));
  if (!merged) errs.push('Fast start: the runImports line did not merge into the page');
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
  // Urgent checkmarks + two-way sync with the real task (2026-11-04).
  const urg = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const row = t => [...document.querySelectorAll('#urgentPanel .urg-row')].find(r => r.querySelector('.urg-text')?.textContent.trim() === t);
    const line = t => [...document.querySelectorAll('#todayScroll .day-editor .check-line')].find(l => l.textContent.trim() === t);
    const check = r => { const a = getComputedStyle(r.querySelector('.urg-box'), '::after'); return a.content !== 'none' && parseFloat(a.borderRightWidth) >= 2 && a.borderRightColor !== 'rgba(0, 0, 0, 0)'; };
    const state = t => { const r = row(t), l = line(t); return { row: !!r && r.classList.contains('done'), mark: !!r && check(r), task: !!l && l.querySelector('input').checked }; };
    const out = [];
    const want = (label, t, on) => { const s = state(t); if (s.row !== on || s.mark !== on || s.task !== on) out.push(label + ' ' + JSON.stringify(s)); };
    if (!row('Paid bill') || !row('Pay rent')) return ['rows missing in Urgent'];
    want('done task shows a check:', 'Paid bill', true);
    const pb = getComputedStyle(row('Paid bill').querySelector('.urg-box'));
    if (pb.width !== '13px' || pb.height !== '13px') out.push('box size changed: ' + pb.width + ' × ' + pb.height);
    want('open task has no check:', 'Pay rent', false);
    row('Pay rent').querySelector('.urg-box').click(); await wait(400);
    want('tick in Urgent → task done:', 'Pay rent', true);
    row('Pay rent').querySelector('.urg-box').click(); await wait(400);
    want('untick in Urgent → task open:', 'Pay rent', false);
    line('Pay rent').querySelector('input').click(); await wait(400);
    want('tick the task → Urgent checked:', 'Pay rent', true);
    line('Pay rent').querySelector('input').click(); await wait(400);
    want('untick the task → Urgent unchecked:', 'Pay rent', false);
    row('Pick dates').querySelector('.urg-box').click(); await wait(400);
    want('subtask tick in Urgent:', 'Pick dates', true);
    if (!row('Book trip') || row('Book trip').classList.contains('done')) out.push('subtask tick changed its parent');
    // Saved: the last save of the day has the subtask checked (so it survives a refresh) and keeps its urgency.
    await wait(2500);
    const saves = (window.__calls || []).filter(c => c[0] === 'saveDay').map(c => String(c[1][1] || ''));
    const last = saves[saves.length - 1] || '';
    const m = last.match(/<div[^>]*data-level="1"[^>]*>(?:(?!<\/div>).)*Pick dates/);
    if (!m || !/data-urg="3"/.test(m[0])) out.push('saved subtask lost its urgency or was not saved');
    if (!/<input[^>]*checked[^>]*>(?:(?!<\/div>).)*Pick dates/.test(last)) out.push('done state not in the saved day');
    return out;
  });
  urg.forEach(x => errs.push('Urgent: ' + x));
  // Keep In Mind: converted to Gear > (note, Gloves, Bait); Tab nests a line one deeper and saves.
  const kim = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ctab="focus"]')?.click(); await wait(300);
    const rows = () => [...document.querySelectorAll('.fx .fx-task')].map(t => (t.style.getPropertyValue('--lv') || '0') + (t.classList.contains('fx-note') ? '~' : '') + t.querySelector('.fx-tt').textContent);
    const got = rows().join('|');
    if (got !== '0Gear|1~Before Friday|1Gloves|1Bait') return ['converted list: ' + got];
    const bait = [...document.querySelectorAll('.fx .fx-tt')].find(x => x.textContent === 'Bait');
    bait.focus(); bait.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await wait(900);
    const after = rows().join('|');
    const saves = (window.__calls || []).filter(c => c[0] === 'saveFocus');
    const saved = saves.length ? saves[saves.length - 1][1][0].cats[0].items.map(i => i.lv).join('') : '';
    return after === '0Gear|1~Before Friday|1Gloves|2Bait' && saved === '0112' ? [] : ['Tab nesting: ' + after + ' saved ' + saved];
  });
  kim.forEach(x => errs.push('Keep In Mind: ' + x));
  // History detail button: List = one line per item (all 50), hidden lines really hidden; Mini = counts only; back to Full.
  const modes = [];
  for (let i = 0; i < 3; i++) {
    await pg.click('#histMode'); await pg.waitForTimeout(250);
    modes.push(await pg.evaluate(() => {
      const ed = document.querySelector('#todayScroll .day-editor'), top = ed.closest('.od-top') || ed;
      const leak = [...ed.querySelectorAll(':scope > [data-tlhid]')].filter(x => getComputedStyle(x).display !== 'none').length;
      const wide = [...ed.querySelectorAll('.ts-it')].filter(x => x.getBoundingClientRect().right > top.getBoundingClientRect().right + 1).length;
      return { mode: document.body.dataset.hist, items: ed.querySelectorAll('.ts-it').length, leak, wide };
    }));
  }
  const [list, mini, full] = modes;
  if (list.mode !== 'compact' || list.items < 50 || list.leak || list.wide) errs.push('History List mode: ' + JSON.stringify(list));
  if (mini.mode !== 'mini' || mini.items || mini.leak) errs.push('History Mini mode: ' + JSON.stringify(mini));
  if (full.mode !== 'full' || full.leak) errs.push('History Full mode: ' + JSON.stringify(full));
  if (errs.length) { fails += errs.length; console.error('✗ ' + name + ':\n  ' + errs.join('\n  ')); }
  else console.log('✓ ' + name + ': loads with no page errors');
}
await b.close();
process.exit(fails ? 1 : 0);
