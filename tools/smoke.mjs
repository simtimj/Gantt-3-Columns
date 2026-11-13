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
const yday = new Date(Date.now() - 864e5 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const line = (t, a = '') => `<div class="check-line" data-level="0"${a}><input type="checkbox"><span class="check-text">${t}</span></div>`;
// Keep In Mind (2026-11-05): old-shape data (Task cards with why + subtasks) that must convert to a free nested list.
const focus = { v: 1, cats: [{ id: 'c1', name: 'Crabbing prep', col: false, projects: [
  { id: 'p1', title: 'Gear', why: 'Before Friday', col: false, tasks: [{ id: 'm-a', t: 'Gloves', d: 0 }, { id: 'm-b', t: 'Bait', d: 1 }] }] }] };
const data = {
  today, inbox: [], cardCats: [], notesSeeds: {}, urgent: [], refPins: [],
  days: [{ date: yday, plan: '',
    // Keep In Mind (2026-11-13): yesterday's per-day section seeds the shared list (styles stripped).
    journal: '<div data-nsec="focus" contenteditable="false">Keep In Mind</div><div><b><u>Trip</u></b></div>' +
      '<div class="check-line" data-level="1" style="margin-left: 24px;"><input type="checkbox"><span class="check-text">Pack <span style="color: rgb(255, 255, 255);">rods</span></span></div>', tasks: line('Renew license', ' data-urg="2"') }, { date: today, journal: '',
    tasks: line('Pay rent', ' data-urg="1"') + line('Walk dog') +
      // Urgent checkmarks (2026-11-04): a finished urgent task (yellow) and one with a subtask.
      '<div class="check-line done" data-level="0" data-urg="2"><input type="checkbox" checked><span class="check-text">Paid bill</span></div>' +
      line('Book trip', ' data-urg="3"') + '<div class="check-line" data-level="1" data-urg="3" style="margin-left: 24px;"><input type="checkbox"><span class="check-text">Pick dates</span></div>' +
      // History modes (2026-11-04): a Morning section with a 50-item Claude group.
      '<div><br></div><div><br></div><div><br></div>' + '<div data-tsec="morning" contenteditable="false">Morning</div><div data-cgrp="Gantt"><b><u>Gantt</u></b></div>' +
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
  tasks: data.days[1].tasks + '<div class="check-line" data-level="0" data-at="09:30"><input type="checkbox"><span class="check-text">From import</span></div>' } } };
const stub = `<script>window.google={script:{run:new Proxy({},{get(t,k){let ok=null;const p=new Proxy({},{get(_,m){
  if(m==='withSuccessHandler')return f=>{ok=f;return p;}; if(m==='withFailureHandler'||m==='withUserObject')return()=>p;
  return(...a)=>{(window.__calls=window.__calls||[]).push([m,a]);return setTimeout(()=>ok&&ok(m==='runImports'||m==='getSyncState'?${JSON.stringify(imported)}:m==='getFocus'?${JSON.stringify(focus)}:m==='getKim'?{html:'',h:'k0',fresh:true}:m==='saveKim'?{h:'k1'}:m==='getMainCalendarEvents'?{date:a[0],events:[{id:'e1',calId:'c',start:0,title:'Sample event',allDay:true,done:false}]}:null),10);};}});return p[k];}})}};</script>`;
let html = fs.readFileSync('Index.html', 'utf8')
  .replace("<?!= HtmlService.createHtmlOutputFromFile('WeekdayIcons').getContent() ?>", fs.readFileSync('WeekdayIcons.html', 'utf8'))
  .replace("<?!= HtmlService.createHtmlOutputFromFile('Drafts').getContent() ?>", fs.readFileSync('Drafts.html', 'utf8'))
  .replace('<?!= initialData ?>', JSON.stringify(data)).replace(/<\?= appUrl \?>/g, '#').replace('<?= build ?>', 'smoke')
  .replace('<head>', '<head>' + stub);
const out = path.join(os.tmpdir(), 'gantt-smoke.html');
fs.writeFileSync(out, html);
// SMOKE_ONLY=main|tracker|calendar runs just that part (2026-11-08); unset = everything.
const only = part => !process.env.SMOKE_ONLY || process.env.SMOKE_ONLY.split(',').includes(part);
const b = await chromium.launch();
let fails = 0;
for (const [name, view] of (only('main') ? [['desktop', { width: 1300, height: 900 }], ['phone', { width: 412, height: 915, isMobile: true, hasTouch: true }]] : [])) {
  const pg = await (await b.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch })).newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message + (process.env.STK ? ' @ ' + (e.stack || '').split('\n').slice(1,4).join(' | ') : '')));
  await pg.goto('file://' + out);
  await pg.waitForTimeout(2000);
  const shot = process.argv.indexOf('--shot');
  if (shot > 0) await pg.screenshot({ path: process.argv[shot + 1].replace(/(\.png)?$/, '-' + name + '.png') });
  // Fast start: the imported line is merged into the open page (no reload), after the load's own save if needed.
  await pg.waitForTimeout(2600);
  const merged = await pg.evaluate(() => [...document.querySelectorAll('#todayScroll .day-editor .check-text')].some(x => x.textContent === 'From import')
    && (window.__calls || []).some(c => c[0] === 'runImports'));
  if (!merged) errs.push('Fast start: the runImports line did not merge into the page');
  // Hold to drag (2026-11-12): slider sets the hold time; the drag handle never shows, even on a picked card.
  const holdOk = await pg.evaluate(() => {
    const s = document.getElementById('holdMs'); if (!s || window.fwHoldMs() !== 500) return 'hold slider missing or default not 0.5 s';
    s.value = 800; s.dispatchEvent(new Event('input')); if (window.fwHoldMs() !== 800) return 'hold slider did not change the hold time';
    document.getElementById('resetHoldMs').click(); if (window.fwHoldMs() !== 500) return 'hold Reset did not go back to 0.5 s';
    const ln = document.querySelector('#todayScroll .day-editor .check-line'); if (ln && window.tcGripPlace) window.tcGripPlace(ln);
    return document.getElementById('tcGrip').hidden ? '' : 'drag handle still shows';
  });
  if (holdOk) errs.push(holdOk);
  // Drawer edge swipe (2026-11-11, phone): left from the right edge opens Next Steps + Reference; right closes it.
  if (view.hasTouch) {
    const swipe = await pg.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const W = innerWidth, H = innerHeight, y = H / 2, ys = H * .3; // ys: away from the ◀ tab
      async function drag(x0, x1, target){
        const tgt = target || document.elementFromPoint(x0, ys) || document.body;
        const touch = x => new Touch({identifier: 1, target: tgt, clientX: x, clientY: ys});
        tgt.dispatchEvent(new TouchEvent('touchstart', {bubbles:true, cancelable:true, touches:[touch(x0)], changedTouches:[touch(x0)]}));
        for (let i = 1; i <= 6; i++) { const x = x0 + (x1 - x0) * i / 6; tgt.dispatchEvent(new TouchEvent('touchmove', {bubbles:true, cancelable:true, touches:[touch(x)], changedTouches:[touch(x)]})); await wait(16); }
        tgt.dispatchEvent(new TouchEvent('touchend', {bubbles:true, cancelable:true, touches:[], changedTouches:[touch(x1)]}));
        await wait(300);
      }
      const out = [];
      await drag(W - 6, W - 160);
      if (!fwRefDrawer.isOpen()) out.push('edge swipe left did not open the drawer');
      await drag(W - 300, W - 120, document.querySelector('#referenceScroll') || document.getElementById('referencePane'));
      if (fwRefDrawer.isOpen()) out.push('swipe right on the drawer did not close it');
      await drag(W - 6, W - 20);
      if (fwRefDrawer.isOpen()) out.push('a tiny edge drag opened the drawer');
      if (document.getElementById('referencePane').style.transform) out.push('drawer kept an inline transform');
      // Drag the ◀ tab: pulls the drawer open at that width and saves it.
      const tab = document.getElementById('rdTab'), pe = (type, x) => tab.dispatchEvent(new PointerEvent(type, {bubbles:true, cancelable:true, pointerId:7, pointerType:'touch', clientX:x, clientY:y, isPrimary:true}));
      pe('pointerdown', W - 10); for (const x of [W - 40, W - 150, W - 250]) { pe('pointermove', x); await wait(16); } pe('pointerup', W - 250); tab.click(); await wait(300);
      const dw = Math.round(document.getElementById('referencePane').getBoundingClientRect().width);
      if (!fwRefDrawer.isOpen()) out.push('dragging the tab did not open the drawer');
      if (Math.abs(dw - 240) > 20) out.push('tab drag width ' + dw + ', wanted ~240');
      if (+localStorage.getItem('fw.rdWidth') !== dw) out.push('drawer width not saved (' + localStorage.getItem('fw.rdWidth') + ')');
      fwRefDrawer.close(); await wait(250);
      return out;
    });
    swipe.forEach(m => errs.push('Drawer swipe: ' + m));
  }
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
  // Section rename preserves priority group names and the existing count controls.
  {
    const renamed = await pg.evaluate(() => {
      const head = document.querySelector('#referencePane .urg-head-row .urg-head');
      return !!head && head.getAttribute('aria-label') === 'Next Steps' &&
        head.querySelector('.next-steps-label')?.textContent === 'Next Steps' &&
        !!head.querySelector('.urg-counts');
    });
    if (!renamed) { fails++; console.error('✗ Next Steps heading/counts missing: ' + name); }
  }
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
    // Urgent tick = done + archived (2026-11-05); unticking it in Archive brings it back.
    row('Pay rent').querySelector('.urg-box').click(); await wait(400);
    if (!line('Pay rent')?.querySelector('input').checked || !line('Pay rent').dataset.arch) out.push('Urgent tick did not finish + archive Pay rent');
    const levelRow = [...document.querySelectorAll('#urgentPanel .urg-group:not(.urg-arch) .urg-row')].some(r => r.querySelector('.urg-text')?.textContent.trim() === 'Pay rent');
    if (levelRow) out.push('archived task still in its urgency group');
    if (!document.querySelector('#urgentPanel .urg-arch .urg-row')) document.querySelector('#urgentPanel .urg-arch-head')?.click();
    await wait(200);
    row('Pay rent')?.querySelector('.urg-box').click(); await wait(400);
    want('untick in Archive → task open + back in Urgent:', 'Pay rent', false);
    if (line('Pay rent')?.dataset.arch) out.push('untick did not unarchive');
    // A task that lives outside today (Reference card): ticking it in Urgent copies a done line into today's History.
    row('Renew license')?.querySelector('.urg-box').click(); await wait(500);
    const copy = [...document.querySelectorAll('#todayScroll .day-editor .check-line[data-ulogof]')].find(l => /Renew license/.test(l.textContent));
    if (!copy || !copy.classList.contains('done') || !copy.dataset.dt) out.push('Reference urgent task not logged in today’s History');
    if (document.querySelector('#urgentPanel .urg-arch .urg-row') === null) document.querySelector('#urgentPanel .urg-arch-head')?.click();
    await wait(200);
    row('Renew license')?.querySelector('.urg-box').click(); await wait(500);
    if ([...document.querySelectorAll('#todayScroll .day-editor .check-line[data-ulogof]')].some(l => /Renew license/.test(l.textContent))) out.push('untick did not remove the History copy');
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
  // Urgent add box (2026-11-05): has a checkbox; Enter makes a real row and puts the caret in it; Tab indents it.
  const uadd = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    window.fwRefDrawer && fwRefDrawer.open(); await wait(250); // 4-panel (2026-11-11): Next Steps is in the drawer
    const form = document.querySelector('#urgentPanel .urg-adder[data-urg="2"]');
    if(!form) return ['no add box'];
    if(!form.querySelector('.urg-box')) return ['add box has no checkbox'];
    const ta = form.querySelector('textarea'); ta.focus(); ta.value = 'Smoke new task';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(600);
    const a = document.activeElement;
    if(!(a && a.matches && a.matches('#urgentPanel .urg-text') && /Smoke new task/.test(a.textContent))) return ['caret not in the new row (' + (a && a.tagName + '.' + a.className) + ') rows=' + [...document.querySelectorAll('#urgentPanel .urg-text')].map(x => x.textContent + ':' + x.contentEditable).join(',') + ' backlog=' + !!backlogCell()];
    if(!a.parentElement.querySelector('.urg-box')) return ['new row has no checkbox'];
    a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await wait(400);
    const ln = [...backlogCell().querySelectorAll('.check-line')].find(l => /Smoke new task/.test(l.textContent));
    if(!ln || ln.dataset.level !== '1') return ['Tab did not indent (level ' + (ln && ln.dataset.level) + ')'];
    document.activeElement && document.activeElement.blur(); window.fwRefDrawer && fwRefDrawer.close(); await wait(250);
    return [];
  });
  uadd.forEach(x => errs.push('Urgent add: ' + x));
  // Keep In Mind (2026-11-13): one shared list in ⭐, built once from yesterday's lines + the old categories as plain lines.
  const kim = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
    document.querySelector('[data-ctab="focus"]')?.click(); await wait(600);
    const ed = document.querySelector('#kimScroll .kim-editor');
    if (!ed || getComputedStyle(document.getElementById('kimScroll')).display === 'none') return ['shared list not shown in ⭐'];
    const txt = ed.textContent.replace(/\s+/g, ' ');
    for (const w of ['Trip', 'Pack rods', 'Crabbing prep', 'Gear', 'Before Friday', 'Gloves', 'Bait']) if (!txt.includes(w)) out.push('missing ' + w + ' in: ' + txt);
    if (txt.indexOf('Trip') > txt.indexOf('Crabbing prep')) out.push('old categories not at the bottom');
    if (ed.querySelector('span[style]')) out.push('font color kept');
    if (document.querySelector('.fx')) out.push('category dashboard still there');
    const g = [...ed.querySelectorAll('.check-line')].find(l => /Gloves/.test(l.textContent));
    if (!g || g.dataset.tid !== 'm-a') out.push('Gloves lost its id');
    if (!(window.__calls || []).some(c => c[0] === 'saveKim' && String(c[1][0]).includes('Gloves'))) out.push('first copy not saved');
    // Same on every day: the list lives outside the day cells.
    if (ed.closest('.day-row')) out.push('list is inside a day');
    // 2026-11-13: each group (header + lines down to the empty line) gets a border; no stacked empty lines.
    await wait(100);
    const boxes = document.querySelectorAll('#kimScroll > .kg-box').length;
    if (boxes < 2) out.push('group borders: ' + boxes);
    const kids = [...ed.children], bl = n => !n.classList.contains('check-line') && !n.textContent.trim();
    if (kids.some((n, i) => i && bl(n) && bl(kids[i - 1]))) out.push('stacked empty lines kept');
    if ((window.__calls || []).filter(c => c[0] === 'saveKim').some(c => /kg-box/.test(String(c[1][0])))) out.push('group border saved into the list');
    document.querySelector('[data-ctab="notes"]')?.click(); await wait(200);
    return out;
  });
  kim.forEach(x => errs.push('Keep In Mind: ' + x));
  // Weather (2026-11-07): one ☁️ tab (hourly + daily merged).
  const wxTabs = await pg.evaluate(() => document.querySelectorAll('.center-tabs [data-ctab="weather"], .center-tabs [data-ctab="wxdaily"]').length);
  if (wxTabs !== 1) errs.push('Weather: expected one tab, found ' + wxTabs);
  // Day Review group header (2026-11-07): name + count on one title line, New / Fixes / Tweaks under it (not two columns).
  const drg = await pg.evaluate(async () => {
    const ed = document.querySelector('#todayScroll .day-editor[data-date="' + localToday() + '"]');
    ed.insertAdjacentHTML('beforeend','<div data-cgrp="Userscripts"><b><u>Userscripts</u></b></div><div class="check-line done" data-level="0" data-cid="u1" data-ltype="new"><input type="checkbox" checked><span class="check-text"><b>*EH search box</b>: summary</span></div><div class="check-line done" data-level="0" data-cid="u2" data-ltype="fix"><input type="checkbox" checked><span class="check-text"><b>*EH pipe</b>: literal</span></div>');
    document.querySelector('[data-ctab="review"]').click(); await new Promise(r => setTimeout(r, 600));
    const g = [...document.querySelectorAll('#dayReviewScroll .dr-group')].find(x => /Userscripts/.test(x.textContent));
    if (!g) return ['no Userscripts group'];
    const nm = g.querySelector('summary .dr-gname'), tc = g.querySelector('summary .dr-tcount');
    if (!nm || !tc) return ['header parts missing'];
    const a = nm.getBoundingClientRect(), c = tc.getBoundingClientRect();
    const out = c.top >= a.bottom - 1 && Math.abs(c.left - a.left) < 2 ? [] : ['counts beside the name: ' + JSON.stringify([a.left, a.bottom, c.left, c.top])];
    // Day in words (2026-11-07): folded by default; opens to sentences with the total and a share.
    const sm = document.querySelector('#dayReviewScroll .dr-sum');
    if (!sm) out.push('no In words box');
    else {
      if (sm.open) out.push('In words open by default');
      sm.querySelector('summary').click(); await new Promise(r => setTimeout(r, 50));
      const tx = sm.textContent;
      const hs = [...sm.querySelectorAll('.dr-sum-h')].map(x => x.textContent).join('|');
      if (!/^\d+ things done/.test(sm.querySelector('.dr-sum-title')?.textContent || '') || !/\d+%/.test(tx) || !/Userscripts/.test(tx)) out.push('In words text: ' + tx.slice(0, 200));
      if (!/^Share\|Biggest/.test(hs) || /yourself|day before/.test(tx)) out.push('In words headings: ' + hs);
      sm.querySelector('summary').click();
    }
    document.querySelector('[data-ctab="notes"]').click();
    return out;
  });
  drg.forEach(x => errs.push('Day Review group: ' + x));
  // Time section header lines (2026-11-07): 1px, the section's own color, no line above Aft / Eve.
  const secLines = await pg.evaluate(async () => {
    const ed = document.querySelector('#todayScroll .day-editor[data-date="' + localToday() + '"]');
    ed.insertAdjacentHTML('beforeend','<div><br></div><div data-tsec="afternoon" contenteditable="false">Afternoon</div><div class="check-line done" data-level="0" data-dt="15:00"><input type="checkbox" checked><span class="check-text">Aft task</span></div><div><br></div><div data-tsec="evening" contenteditable="false">Evening</div><div class="check-line done" data-level="0" data-dt="21:00"><input type="checkbox" checked><span class="check-text">Eve task</span></div>');
    refreshTitleLines(ed); await new Promise(r => setTimeout(r, 200));
    const want = { morning: '227, 189, 67', afternoon: '223, 139, 58', evening: '156, 116, 201' }, out = [];
    for (const k of Object.keys(want)) { const h = ed.querySelector(':scope > [data-tsec="' + k + '"]'); if (!h) { out.push('no ' + k); continue; }
      const c = getComputedStyle(h); if (h.dataset.tsf !== 'o') continue;
      if (c.borderBottomWidth !== '1px' || !c.borderBottomColor.includes(want[k])) out.push(k + ' line: ' + c.borderBottomWidth + ' ' + c.borderBottomColor);
      if (k !== 'morning' && c.borderTopWidth !== '0px') out.push(k + ' has a line above: ' + c.borderTopWidth); }
    return out;
  });
  secLines.forEach(x => errs.push('Time section lines: ' + x));
  // Title-line button never wraps (2026-11-07: "+ 2 hidden" showed as "hidd / en").
  const tlWrap = await pg.evaluate(() => { const n = document.querySelector('#todayScroll [data-tlon]'); if (!n) return ''; const c = getComputedStyle(n, '::before'); return c.whiteSpace === 'nowrap' && c.flexShrink === '0' ? '' : c.whiteSpace + ' shrink ' + c.flexShrink; });
  if (tlWrap) errs.push('Title button can wrap: ' + tlWrap);
  // History date line (2026-11-07): year as 26, no weekday icon, count "n ✓" / "n/m ✓" on the date line, not cut off.
  const dl = await pg.evaluate(() => { const row = document.querySelector('#todayScroll .day-row[data-date="' + localToday() + '"]'); if (!row) return ['no today row'];
    const lab = row.querySelector('.day-label'), d = lab.querySelector('.day-dash'), out = [];
    if (/20\d\d/.test(lab.querySelector('.day-date').innerText)) out.push('4-digit year: ' + lab.querySelector('.day-date').innerText);
    if (lab.querySelector('.wd-icon')) out.push('weekday icon still shown');
    if (!d || !/^\d+(\/\d+)? ✓$/.test(d.textContent)) out.push('count: ' + (d && d.textContent));
    else if (d.getBoundingClientRect().right > row.getBoundingClientRect().right + 1) out.push('count cut off');
    return out; });
  dl.forEach(x => errs.push('History date line: ' + x));
  // Count tap cycles Mini → Types → Full (2026-11-11); Big Three strip hidden at the top of History.
  const cyc = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
    const d = document.querySelector('#todayScroll .day-row[data-date="' + localToday() + '"] .day-dash');
    if (!d) return ['no count'];
    const prev = document.body.dataset.hist, seen = [];
    for (let i = 0; i < 3; i++) { d.click(); await wait(120); seen.push(document.body.dataset.hist); }
    const start = seen.indexOf('mini');
    const order = start < 0 ? seen : seen.slice(start).concat(seen.slice(0, start));
    if (order.join() !== 'mini,types,full') out.push('cycle: ' + seen.join());
    if (document.body.dataset.hist !== 'types') { while (document.body.dataset.hist !== 'types') { d.click(); await wait(100); } }
    if (document.querySelector('#todayScroll [data-tsec]') && !document.querySelector('#todayScroll [data-tsf="c"]')) out.push('Types left sections open');
    const b3 = document.getElementById('b3Strip');
    if (b3 && getComputedStyle(b3).display !== 'none') out.push('Big Three strip still shows');
    // back to where it was
    if (prev && window.setHistMode) window.setHistMode(prev);
    else { const fs = document.querySelector('#histMode [data-hm="' + (prev || 'full') + '"]'); if (fs) fs.click(); await wait(100); }
    return out; });
  cyc.forEach(x => errs.push('History count cycle: ' + x));
  // Fold buttons (2026-11-07: the wrapped "+ hidden" button didn't respond): time section header, group −, title-line button.
  const folds = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
    const ed = document.querySelector('#todayScroll .day-editor[data-date="' + localToday() + '"]');
    const tap = async (el, x, y) => { const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }, t = document.elementFromPoint(x, y) || el;
      t.dispatchEvent(new PointerEvent('pointerdown', o)); t.dispatchEvent(new PointerEvent('pointerup', o)); t.dispatchEvent(new MouseEvent('click', o)); await wait(300); };
    const h = ed.querySelector(':scope > [data-tsec="morning"]'); h.scrollIntoView({ block: 'center' }); await wait(50);
    let r = h.getBoundingClientRect(), s0 = h.dataset.tsf; await tap(h, r.left + r.width / 2, r.top + 6);
    if (h.dataset.tsf === s0) out.push('time section header did not fold'); else await tap(h, r.left + r.width / 2, r.top + 6);
    const st = ed.querySelector('[data-study][data-tlon]');
    if (st) { st.scrollIntoView({ block: 'center' }); await wait(50);
      const tx = st.querySelector('.check-text').getBoundingClientRect(), lr = st.getBoundingClientRect(), wrapped = lr.bottom - tx.bottom > 8, b0 = st.dataset.tlon;
      await tap(st, wrapped ? lr.left + 20 : tx.right + 14, wrapped ? tx.bottom + 6 : tx.top + 8);
      if (st.dataset.tlon === b0) out.push('title-line button (' + (wrapped ? 'wrapped' : 'beside') + ') did not toggle');
      else await tap(st, wrapped ? lr.left + 20 : tx.right + 14, wrapped ? tx.bottom + 6 : tx.top + 8); }
    const g = ed.querySelector(':scope > [data-cgrp="Gantt"]');
    if (g) { g.scrollIntoView({ block: 'center' }); await wait(50); const br = g.querySelector('b').getBoundingClientRect(), g0 = g.dataset.tlon;
      await tap(g, br.right + 10, br.top + br.height / 2); if (g.dataset.tlon === g0) out.push('group − did not fold'); else await tap(g, br.right + 10, br.top + br.height / 2); }
    return out;
  });
  folds.forEach(x => errs.push('History folds: ' + x));
  // History counts read ✓ instead of "done" (2026-11-07).
  const doneWord = await pg.evaluate(() => [...document.querySelectorAll('#todayScroll [data-tlinfo],#todayScroll [data-tsinfo]')].map(n => n.dataset.tlinfo || n.dataset.tsinfo).filter(t => / done$/.test(t)));
  if (doneWord.length) errs.push('History: still says done: ' + doneWord.slice(0,3).join(' | '));
  // Fun tab: 🎮 shows its own list; typing + Enter adds a line and saves; ticking moves it to Done.
  const fun = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ctab="fun"]')?.click(); await wait(200);
    const box = document.getElementById('funScroll');
    if(!box || getComputedStyle(box).display === 'none') return ['tab not shown'];
    if(getComputedStyle(document.getElementById('journalScroll')).display !== 'none') return ['Notes still shown'];
    const inp = document.getElementById('funInput'); inp.value = 'Play Stardew update';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(900);
    const item = [...document.querySelectorAll('#funList .fun-item .fun-t')].find(x => x.textContent === 'Play Stardew update');
    if(!item) return ['added line missing'];
    const saved = (window.__calls || []).filter(c => c[0] === 'saveFun').pop();
    if(!saved || !saved[1][0].items.some(i => i.t === 'Play Stardew update')) return ['not saved'];
    item.closest('.fun-item').querySelector('input').click(); await wait(100);
    if(!/Done 1/.test(document.getElementById('funList').textContent)) return ['tick did not move it to Done'];
    // Categories: make "Shows" (prompt stubbed), add an item into it → it sits under the Shows header.
    window.prompt = () => 'Shows';
    document.querySelector('#funList .fun-newcat').click(); await wait(50);
    if(document.getElementById('funCat').selectedOptions[0].textContent !== 'Shows') return ['new category not picked'];
    inp.value = 'Watch Severance'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(700);
    const sec = [...document.querySelectorAll('#funList .fun-cat[data-cat]')].find(x => x.querySelector('.fun-cat-n').textContent === 'Shows');
    if(!sec || !/Watch Severance/.test(sec.textContent)) return ['item not under Shows'];
    const sv = (window.__calls || []).filter(c => c[0] === 'saveFun').pop();
    if(!sv || !(sv[1][0].cats || []).some(c => c.name === 'Shows')) return ['category not saved'];
    // 2026-11-06: date reads "NOV 5"; hold the checkbox → Move to menu; hold + drag the text onto a category header.
    const dt = sec.querySelector('.fun-date');
    if(!dt || !/^[A-Z]{3} \d{1,2}$/.test(dt.textContent)) return ['date not like NOV 5: ' + (dt && dt.textContent)];
    const sel = document.getElementById('funCat'); sel.value = ''; sel.dispatchEvent(new Event('change'));
    inp.value = 'Play Hades'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(800); // let the save's re-render land first
    const hades = () => [...document.querySelectorAll('#funList .fun-item')].find(x => /Play Hades/.test(x.textContent));
    const pt = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
    let cb = hades().querySelector('input'), r = cb.getBoundingClientRect();
    pt(cb, 'pointerdown', r.left + 3, r.top + 3); await wait(600); pt(cb, 'pointerup', r.left + 3, r.top + 3); cb = hades().querySelector('input'); cb.click(); await wait(50);
    const menu = document.querySelector('.fun-menu');
    if(!menu || !/Shows/.test(menu.textContent) || !/Remove/.test(menu.textContent)) return ['checkbox hold: no Move to menu'];
    if(cb.checked) return ['checkbox hold also ticked it'];
    menu.remove();
    const tx = hades().querySelector('.fun-t'); r = tx.getBoundingClientRect();
    pt(tx, 'pointerdown', r.left + 5, r.top + 5); await wait(650);
    const hh = document.querySelector('#funList .fun-cat[data-cat] .fun-cat-h').getBoundingClientRect();
    pt(document, 'pointermove', hh.left + 20, hh.top + hh.height / 2); await wait(30);
    pt(document, 'pointerup', hh.left + 20, hh.top + hh.height / 2); await wait(100);
    const sec2 = document.querySelector('#funList .fun-cat[data-cat]');
    if(!sec2.querySelector('.fun-item') || !/Play Hades/.test(sec2.querySelector('.fun-item').textContent)) return ['drag onto Shows header did not move it to the top of Shows'];
    document.querySelector('[data-ctab="notes"]')?.click(); await wait(100);
    return [];
  });
  fun.forEach(x => errs.push('Fun tab: ' + x));
  // New things tab (2026-11-07): ✨ sits left of 🌴; add with a date → listed under its month, saved, newest first.
  const nw = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // Cleanup (2026-11-09): New things lives in the 🌴 tab now (box on top, Fun below); no ✨ button.
    const tabs = [...document.querySelectorAll('.center-tabs button')].map(b => b.dataset.ctab);
    if(tabs.includes('new')) return ['✨ tab still there: ' + tabs.join(',')];
    document.querySelector('[data-ctab="fun"]').click(); await wait(200);
    const box = document.getElementById('newScroll');
    if(!box || getComputedStyle(box).display === 'none') return ['New things not shown in the 🌴 tab'];
    if(getComputedStyle(document.getElementById('funScroll')).display === 'none') return ['Fun hidden in the 🌴 tab'];
    if(getComputedStyle(document.getElementById('journalScroll')).display !== 'none') return ['Notes still shown'];
    const inp = document.getElementById('newInput'), dt = document.getElementById('newDate');
    dt.value = '2026-10-03'; inp.value = 'Tried rock climbing';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(100);
    inp.value = 'First sushi class'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(900);
    const rows = [...document.querySelectorAll('#newList .nw-item')].map(r => r.querySelector('.nw-t').textContent + '@' + r.querySelector('.nw-d').textContent);
    if(rows[0] && !/^First sushi class@[A-Z]{3} \d{1,2}$/.test(rows[0])) return ['newest not first: ' + rows.join('|')];
    if(rows[1] !== 'Tried rock climbing@OCT 3') return ['dated item wrong: ' + rows.join('|')];
    if(!/October 2026/.test(document.getElementById('newList').textContent)) return ['no month header'];
    const tm = document.querySelector('#newList .nw-timer');
    if(!tm || !/0 days since new thing · goal 14 days · 2 logged/.test(tm.textContent)) return ['timer: ' + (tm && tm.textContent)];
    const sv = (window.__calls || []).filter(c => c[0] === 'saveNewThings').pop();
    if(!sv || !sv[1][0].items.some(i => i.t === 'Tried rock climbing' && i.w === '2026-10-03')) return ['not saved'];
    // Types (2026-11-07): pick 🎮 Game, add → chip shows 🎮 0d, By type view has a Game section; tap icon → menu.
    const sel = document.getElementById('newCat'); sel.value = 'gGame'; sel.dispatchEvent(new Event('change')); await wait(50);
    inp.value = 'Started Hollow Knight'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(800);
    if(![...document.querySelectorAll('#newList .nw-chip')].some(c => c.textContent === '🎮 0d')) return ['no 🎮 0d chip'];
    document.querySelector('#newList [data-view="type"]').click(); await wait(50);
    const gsec = document.querySelector('#newList .nw-cat[data-cat="gGame"]');
    if(!gsec || !/Game/.test(gsec.textContent) || !/Hollow Knight/.test(gsec.nextElementSibling.textContent)) return ['By type: no Game section'];
    document.querySelector('#newList .nw-item .nw-ic').click(); await wait(50);
    if(!/Light novel/.test((document.querySelector('.nw-menu') || {}).textContent || '')) return ['type menu missing'];
    document.querySelector('.nw-menu').remove();
    const sv2 = (window.__calls || []).filter(c => c[0] === 'saveNewThings').pop();
    if(!sv2 || !sv2[1][0].items.some(i => i.g === 'gGame') || !(sv2[1][0].cats || []).some(c => c.id === 'gManga')) return ['types not saved'];
    document.querySelector('#newList [data-view="date"]').click();
    document.querySelector('[data-ctab="notes"]').click(); await wait(50);
    return [];
  });
  nw.forEach(x => errs.push('New things tab: ' + x));
  // Day Review − / + levels (2026-11-05): categories only → + groups → all open.
  const drl = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ctab="review"]')?.click(); await wait(500);
    const box = document.getElementById('dayReviewScroll');
    const minus = () => box.querySelector('[data-drlv="-1"]'), plus = () => box.querySelector('[data-drlv="1"]');
    if(!minus() || !plus()) return ['no − / + buttons'];
    if(!box.querySelector('.dr-cat')) { document.querySelector('[data-ctab="notes"]')?.click(); return []; } // nothing done in the sample day
    minus().click(); minus()?.click(); await wait(50);
    const st = () => [box.querySelectorAll('.dr-cat[open]').length, box.querySelectorAll('.dr-group[open]').length];
    const a = st(); plus().click(); await wait(50); const b = st(); plus().click(); await wait(50); const c = st();
    document.querySelector('[data-ctab="notes"]')?.click();
    return a[0] === 0 && b[0] > 0 && b[1] === 0 && c[1] > 0 ? [] : ['levels ' + JSON.stringify([a,b,c])];
  });
  drl.forEach(x => errs.push('Day Review: ' + x));
  // Done → Dailies match (2026-11-05): a done "Morning stretch 10 min" suggests the "Stretching" daily; Tick ticks it.
  const dm = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const d = localToday(), jed = document.querySelector('#journalScroll .journal-editor[data-date="' + d + '"]');
    const head = jed && jed.querySelector(':scope > [data-nsec="must"]');
    if(!head) return ['no Dailies section'];
    head.insertAdjacentHTML('afterend','<div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">Stretching</span></div><div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">Read 10 pages</span></div>');
    const ed = document.querySelector('#todayScroll .day-editor[data-date="' + d + '"]');
    ed.insertAdjacentHTML('beforeend','<div class="check-line done" data-level="0"><input type="checkbox" checked><span class="check-text">Morning stretch 10 min</span></div>');
    window.fwDailyMatch.scan(); await wait(50);
    const sh = window.fwDailyMatch.shown.map(m => m.dt).join('|');
    if(sh !== 'Morning · Stretch') return ['matches: ' + sh]; // time words pick the Morning daily over Stretching / Before bed
    // 2026-11-07: ✓ above ✕, a thin column (≤ 34px) so the text keeps the width.
    const yb = document.querySelector('#dailyMatch [data-a="y"]'), nb = document.querySelector('#dailyMatch [data-a="n"]');
    const yr = yb.getBoundingClientRect(), nr = nb.getBoundingClientRect();
    if(!(nr.top >= yr.bottom - 1) || Math.abs(nr.left - yr.left) > 1 || yr.width > 34) return ['buttons not a thin stack: ' + JSON.stringify([yr.left, yr.top, yr.width, nr.left, nr.top])];
    document.querySelector('#dailyMatch [data-a="y"]').click(); await wait(100);
    const cb = [...jed.querySelectorAll('.check-line')].find(l => l.textContent.replace(/\s+/g,' ').trim() === 'Morning · Stretch').querySelector('input');
    if(!cb.checked) return ['Tick did not tick the daily'];
    if(!document.getElementById('dailyMatch').hidden) return ['prompt still shown'];
    // 2026-11-07: Claude's "*" Done Log lines never suggest a daily ("*History easier to read" ≠ Read 10 pages).
    ed.insertAdjacentHTML('beforeend','<div class="check-line done" data-level="0" data-cid="x1"><input type="checkbox" checked><span class="check-text"><b>*History easier to read</b>: no longer stretches Blocks</span></div>');
    window.fwDailyMatch.scan(); await wait(50);
    if(window.fwDailyMatch.shown.length) return ['AI line matched: ' + window.fwDailyMatch.shown.map(m => m.dt).join('|')];
    // Pages counter: type "| +4 · 7" after the reading daily, leave it → total 11/10 and the daily ticks itself.
    const rd = [...jed.querySelectorAll('.check-line')].find(l => /^Read 10 pages/.test(l.textContent.trim()));
    rd.querySelector('.check-text').textContent = 'Read 10 pages | +4 · 7';
    rd.querySelector('.check-text').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); await wait(100);
    const rt = rd.querySelector('.check-text').textContent;
    if(rt !== 'Read 10+ pages: T: 11/10 | +4 · +7') return ['pages total: ' + rt];
    if(!rd.querySelector('input').checked) return ['reading goal did not tick the daily'];
    return [];
  });
  dm.forEach(x => errs.push('Daily match: ' + x));
  // History detail button: List = one line per item (all 50), hidden lines really hidden; Mini = counts only; back to Full.
  // Cleanup (2026-11-09): the ▤ ≡ – buttons are hidden; tapping a day's date cycles Full → List → Mini.
  const setHM = async hm => { for (let i = 0; i < 3 && await pg.evaluate(() => document.body.dataset.hist) !== hm; i++) { await pg.evaluate(() => document.querySelector('#todayScroll .day-row[data-date="' + localToday() + '"] .day-label .day-date').click()); await pg.waitForTimeout(250); } };
  const modes = [];
  for (const hm of ['compact', 'mini', 'full']) {
    await setHM(hm);
    modes.push(await pg.evaluate(() => {
      const ed = document.querySelector('#todayScroll .day-editor[data-date="' + localToday() + '"]'), top = ed.closest('.od-top') || ed;
      const leak = [...ed.querySelectorAll(':scope > [data-tlhid]')].filter(x => getComputedStyle(x).display !== 'none').length;
      const wide = [...ed.querySelectorAll('.ts-it')].filter(x => x.getBoundingClientRect().right > top.getBoundingClientRect().right + 1).length;
      return { mode: document.body.dataset.hist, items: ed.querySelectorAll('.ts-it').length, leak, wide };
    }));
  }
  // Short folded lists (2026-11-07): List mode's folded Morning shows the Gantt list in a 3-row box (scrolls), ⤢ opens all.
  await setHM('compact');
  const hx1 = await pg.evaluate(async () => {
    const ed = document.querySelector('#todayScroll .day-editor[data-date="' + localToday() + '"]');
    const cap = ed.querySelector('.ts-row .ts-items.hx-cap'), btn = cap && cap.parentElement.querySelector('.hx-btn');
    if (!cap) return ['List mode: no 3-row box'];
    const lh = parseFloat(getComputedStyle(cap.querySelector('.ts-it')).lineHeight) || 16;
    if (cap.clientHeight > lh * 3.6 || cap.scrollHeight <= cap.clientHeight) return ['3-row box size: ' + cap.clientHeight + '/' + cap.scrollHeight + ' lh ' + lh];
    if (!btn || btn.textContent !== '⤢') return ['no ⤢ button'];
    btn.click(); await new Promise(r => setTimeout(r, 300));
    const open = ed.querySelector('.ts-row .ts-items');
    if (!open || open.classList.contains('hx-cap') || open.clientHeight < lh * 10) return ['⤢ did not open the list'];
    if (ed.querySelector('[data-tsec="morning"]').dataset.tsf !== 'c') return ['⤢ unfolded the section'];
    ed.querySelector('.ts-row .hx-btn').click(); await new Promise(r => setTimeout(r, 300));
    return ed.querySelector('.ts-row .ts-items.hx-cap') ? [] : ['⤡ did not shrink it back'];
  });
  hx1.forEach(x => errs.push('History short list: ' + x));
  await setHM('full');
  const hx2 = await pg.evaluate(async () => {
    const ed = document.querySelector('#todayScroll .day-editor[data-date="' + localToday() + '"]');
    const g = ed.querySelector(':scope > [data-cgrp="Gantt"]');
    if (!g) return ['no Gantt group'];
    g.dataset.fold = '1'; refreshTitleLines(ed);
    const box = g.querySelector(':scope > .tl-sum'), list = box && box.querySelector('.hx-list');
    if (!box) return ['folded group: no box'];
    const lh = parseFloat(getComputedStyle(list.firstElementChild).lineHeight) || 16;
    if (list.clientHeight > lh * 3.6 || list.scrollHeight <= list.clientHeight) return ['group box size: ' + list.clientHeight + '/' + list.scrollHeight];
    if (getComputedStyle(g, '::after').content !== 'none') return ['old ::after summary still drawn'];
    box.querySelector('.hx-btn').click(); await new Promise(r => setTimeout(r, 300));
    const b2 = g.querySelector(':scope > .tl-sum');
    if (!b2 || !b2.classList.contains('hx-open') || b2.querySelector('.hx-list').clientHeight < lh * 10) return ['group ⤢ did not open'];
    if (g.dataset.tlon !== 'c') return ['⤢ unfolded the group'];
    if (typeof cardCleanHtml === 'function' && /tl-sum|data-tlbox/.test(cardCleanHtml(ed))) return ['box leaked into saved HTML'];
    b2.querySelector('.hx-btn').click(); await new Promise(r => setTimeout(r, 200));
    delete g.dataset.fold; refreshTitleLines(ed);
    return g.querySelector('.tl-sum') ? ['box left after unfold'] : [];
  });
  hx2.forEach(x => errs.push('History group box: ' + x));
  const [list, mini, full] = modes;
  if (list.mode !== 'compact' || list.items < 50 || list.leak || list.wide) errs.push('History List mode: ' + JSON.stringify(list));
  if (mini.mode !== 'mini' || mini.items || mini.leak) errs.push('History Mini mode: ' + JSON.stringify(mini));
  if (full.mode !== 'full' || full.leak) errs.push('History Full mode: ' + JSON.stringify(full));
  // Full time windows (2026-11-05): label "Morn 6–2", never saved; 1 am and 9 pm are Night, 7 pm is Afternoon.
  const win = await pg.evaluate(() => {
    const out = [];
    const h = document.querySelector('#todayScroll .day-editor > [data-tsec="morning"]');
    const lab = h && h.querySelector('.ts-lab');
    if (!lab || lab.textContent !== 'Morn 6–2') out.push('Morning label: ' + (lab ? lab.textContent : 'missing')); // full window only, no a / p (2026-11-07)
    if (typeof tsecOf === 'function') {
      const got = ['00:30', '05:59', '06:00', '13:59', '14:00', '19:30', '20:00'].map(tsecOf).join(',');
      if (got !== 'evening,evening,morning,morning,afternoon,afternoon,evening') out.push('windows: ' + got);
    } else out.push('tsecOf not reachable');
    const saves = (window.__calls || []).filter(c => c[0] === 'saveDay').map(c => String(c[1][1] || ''));
    if (saves.some(x => /ts-lab/.test(x))) out.push('window label leaked into the saved day');
    // No empty lines piled up right above Morning (2026-11-05).
    const prev = h && h.previousElementSibling;
    if (prev && !prev.textContent.trim() && !prev.classList.contains('check-line') && !prev.querySelector('input')) out.push('empty line left above Morning');
    // Header: count stays one piece (its own line when narrow), label one line.
    if (h) { const lh = parseFloat(getComputedStyle(lab).lineHeight) || 14; if (h.getBoundingClientRect().height > lh * 3.2 + 12 && !h.querySelector('.ts-sum')) out.push('Morning header too tall: ' + Math.round(h.getBoundingClientRect().height) + 'px'); }
    return out;
  });
  win.forEach(x => errs.push('Time windows: ' + x));
  // Cal Events (2026-11-05): Cats label; 🕒 day view (2026-11-11).
  const quad = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = [];
    if (document.querySelector('[data-ce-sort]')?.textContent !== 'Cats') out.push('sort button not "Cats"');
    const list = document.getElementById('centerCalendarList');
    // Day timeline (2026-11-11): on by default, under the list (Google Calendar layout); 🕒 hides / shows it.
    const dv = list.querySelector(':scope > .ce-day');
    if (!dv) out.push('timeline not on by default');
    else {
      if (dv.scrollHeight <= dv.clientHeight) out.push('day view does not scroll');
      const lst = list.querySelector(':scope > .ce-list');
      if (!lst || !(lst.compareDocumentPosition(dv) & Node.DOCUMENT_POSITION_FOLLOWING)) out.push('list is not above the timeline');
      // − / + zoom changes the hour height.
      const h0 = dv.querySelector('.ce-day-in').offsetHeight;
      list.querySelector('[data-ce-zoom="1"]').click(); await wait(80);
      const h1 = list.querySelector('.ce-day-in').offsetHeight;
      if (!(h1 > h0)) out.push('+ zoom did not grow the timeline: ' + h0 + ' → ' + h1);
      list.querySelector('[data-ce-zoom="-1"]').click(); await wait(80);
      if (list.querySelector('.ce-day-in').offsetHeight >= h1) out.push('− zoom did not shrink the timeline');
    }
    if (!list.querySelector('.ce-event[data-ce-id="e1"]')) out.push('day view hid the list');
    // ▾ Events folds the list and back.
    list.querySelector('[data-ce-fold]').click(); await wait(80);
    if (list.querySelector('.ce-list') && !list.querySelector('.ce-list').hidden) out.push('▾ Events did not fold the list');
    list.querySelector('[data-ce-fold]').click(); await wait(80);
    if (list.querySelector('.ce-list').hidden) out.push('▸ Events did not open the list');
    // ⚙ hide list: a word hides the event from the list, not the timeline; "1 hidden" shows; ✕ brings it back.
    list.querySelector('[data-ce-opt]').click(); await wait(80);
    const f = list.querySelector('[data-ce-hword-form]');
    if (!f) out.push('⚙ did not open the hide list');
    else {
      f.querySelector('input').value = 'sample'; f.requestSubmit(); await wait(80);
      if (list.querySelector('.ce-list .ce-event[data-ce-id="e1"]')) out.push('hidden word still in the list');
      if (!/1 hidden/.test(list.querySelector('[data-ce-showhid]')?.textContent || '')) out.push('no "1 hidden" count');
      if (!(window.__calls || []).some(c => c[0] === 'setCalEventsHide')) out.push('hide list not saved');
      list.querySelector('[data-ce-hword-x="sample"]').click(); await wait(80);
      if (!list.querySelector('.ce-list .ce-event[data-ce-id="e1"]')) out.push('✕ did not bring the event back');
      list.querySelector('[data-ce-opt-done]').click(); await wait(50);
    }
    document.querySelector('[data-ce-day]').click(); await wait(100);
    if (list.querySelector('.ce-day')) out.push('🕒 did not hide the day view');
    document.querySelector('[data-ce-day]').click(); await wait(100);
    if (!list.querySelector('.ce-day')) out.push('🕒 did not bring the day view back');
    list.querySelector('.ce-event[data-ce-id="e1"] .ce-check').click(); await wait(200);
    // Cats list = urgency boxes then subjects (2026-11-06): e1 was ticked above → Done box.
    if (!list.querySelector('.ce-urg-done .ce-event[data-ce-id="e1"]')) out.push('Cats list: done event not in the Done urgency box');
    // Search box on the Cal Events line (2026-11-06): filters as you type, Esc clears, fits the header.
    const sb = document.querySelector('[data-ce-search]'), head = sb.closest('.ce-head');
    const fits = () => [...head.children].every(c => c.getBoundingClientRect().right <= head.getBoundingClientRect().right + 1) && sb.offsetWidth >= 34;
    if (!fits()) out.push('search box does not fit the header: ' + JSON.stringify([Math.round(head.getBoundingClientRect().width), [...head.children].map(c => [c.className, Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().right)])]));
    const typeQ = v => { sb.value = v; sb.dispatchEvent(new Event('input', { bubbles: true })); };
    typeQ('sample'); await wait(50);
    if (!list.querySelector('.ce-event[data-ce-id="e1"]')) out.push('search "sample" hid the event');
    typeQ('aws cleanup'); await wait(50);
    if (list.querySelector('.ce-event') || !/No match/.test(list.textContent)) out.push('search "aws cleanup" did not filter');
    sb.focus(); if (!fits()) out.push('search box overflows while typing');
    sb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(50);
    if (sb.value || !list.querySelector('.ce-event[data-ce-id="e1"]')) out.push('Esc did not clear the search');
    return out;
  });
  quad.forEach(x => errs.push('Cal Events: ' + x));
  // Hold-to-zoom (2026-11-05): History zooms alone, on top of everything, and closes cleanly.
  const zm = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const j = document.querySelector('.today-jump'); if (!j) return ['no HISTORY label'];
    const r = j.getBoundingClientRect(), o = { bubbles: true, clientX: r.left + 5, clientY: r.top + 5, button: 0 };
    j.dispatchEvent(new PointerEvent('pointerdown', o)); await wait(1400);
    j.dispatchEvent(new PointerEvent('pointerup', o));
    const t = document.querySelector('.fw-focus-target'); if (!t) return ['History did not zoom'];
    const out = [];
    if (t.querySelector('.plan-pad') || t.matches('.plan-pad')) out.push('zoom includes Blocks');
    const b = t.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (!hit || !t.contains(hit)) out.push('something draws over the zoomed History: ' + (hit && hit.className));
    if (b.width < innerWidth * .85) out.push('zoom narrower than 85% of the window');
    // 2026-11-07: zoomed History = List with everything open; the ≡ / ▤ bar switches; closing restores the mode.
    const ed = document.querySelector('#todayScroll .day-editor[data-date="' + localToday() + '"]');
    if (document.body.dataset.hist !== 'compact') out.push('zoom not in List mode: ' + document.body.dataset.hist);
    if (ed && ed.querySelector(':scope > [data-tsec][data-tsf="c"]')) out.push('a section is still folded in the zoom');
    const bar = document.querySelector('.hz-bar');
    if (!bar) out.push('no ≡ / ▤ bar'); else { bar.querySelector('[data-hz="full"]').click(); await wait(100); if (document.body.dataset.hist !== 'full') out.push('▤ Full did not switch'); }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(900);
    if (document.querySelector('.fw-focus-target') || document.querySelector('.fw-focus-spacer')) out.push('zoom did not close cleanly');
    if (document.querySelector('.hz-bar') || document.body.dataset.hist !== 'full') out.push('mode not restored after zoom: ' + document.body.dataset.hist);
    return out;
  });
  zm.forEach(x => errs.push('Zoom: ' + x));
  // 2026-11-06: hold the BLOCKS word → Blocks zooms and History keeps its height; hold a top-middle tab icon → that tab, zoomed.
  const zm2 = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
    const hold = async (el, fx = .5) => { el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(), x = r.left + Math.min(r.width * fx, Math.max(8, r.width / 2)), y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
      if (hit !== el && !el.contains(hit)) return 'covered by ' + (hit && hit.className);
      const o = { bubbles: true, clientX: x, clientY: y, button: 0 }; hit.dispatchEvent(new PointerEvent('pointerdown', o)); await wait(1300); hit.dispatchEvent(new PointerEvent('pointerup', o)); return ''; };
    const close = async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(900); };
    // 2026-11-12 (later): Focus / Thinking at the bottom of the middle column (#blocksScroll); bottom-left = empty Timer.
    const lab = document.querySelector('#blocksScroll .od-pad-head .od-pad-lab'), top = document.querySelector('#todayScroll .od-on > .od-top');
    if (lab && top) { const h0 = top.getBoundingClientRect().height, c = await hold(lab, .1); /* the word "Focus": the split grip sits mid-label on phone */
      if (c) out.push('FOCUS label ' + c); else if (!document.querySelector('.thought-pad.fw-focus-target')) out.push('Focus / Thinking did not zoom');
      else if (Math.abs(top.getBoundingClientRect().height - h0) > 2) out.push('History changed height behind zoomed Focus');
      await close(); } else out.push('no Focus label in the middle column');
    const tlab = document.querySelector('#todayScroll .od-on > .od-pad-head .od-pad-lab');
    if (!tlab || tlab.textContent.trim() !== 'Timer') out.push('bottom-left label is not Timer');
    const tab = document.querySelector('#journalPane button[data-ctab="review"]'), c2 = await hold(tab);
    if (c2) out.push('tab icon ' + c2); else if (!document.querySelector('#journalPane.fw-focus-target') || document.getElementById('journalPane').dataset.ctab !== 'review') out.push('holding 📊 did not open Day Review zoomed');
    await close(); document.querySelector('#journalPane button[data-ctab="notes"]').click(); await wait(100);
    // Urgent: fold it, hold the numbers → it opens + zooms with its rows, no create menu; + button = create menu.
    window.fwRefDrawer && fwRefDrawer.open(); await wait(250); // 4-panel (2026-11-11): Next Steps + Reference live in the drawer
    const uh = document.querySelector('.urg-head'); uh.click(); await wait(100);
    const c3 = await hold(document.querySelector('.urg-head .urg-counts'));
    const up = document.getElementById('urgentPanel');
    if (c3) out.push('Urgent numbers ' + c3); else if (!up.classList.contains('fw-focus-target') || !up.querySelector('.urg-row')) out.push('holding the Urgent numbers did not zoom a filled Urgent');
    if (document.querySelector('.urg-create-menu')) out.push('holding the numbers still opens the create menu');
    await close();
    const ab = document.querySelector('.urg-head-row .urg-add-btn'); if (!ab) out.push('no + button in the Urgent header'); else { ab.click(); await wait(50); if (!document.querySelector('.urg-create-menu')) out.push('+ did not open the create menu'); document.querySelector('.urg-create-menu')?.remove(); }
    // Reference tab icons: hold 📝 → Scratch Pad, zoomed.
    const c4 = await hold(document.querySelector('#referencePane button[data-rtab="scratch"]'));
    if (c4) out.push('📝 ' + c4); else if (!document.querySelector('#referenceScroll.fw-focus-target') || document.getElementById('referencePane').dataset.rtab !== 'scratch') out.push('holding 📝 did not open Scratch Pad zoomed');
    await close(); document.querySelector('#referencePane button[data-rtab="reference"]').click(); await wait(100);
    if (document.querySelector('.fw-focus-target,.fw-focus-spacer')) out.push('zoom did not close cleanly');
    if (window.fwRefDrawer && !fwRefDrawer.isOpen()) out.push('Esc on a zoom also closed the drawer');
    window.fwRefDrawer && fwRefDrawer.close(); await wait(250);
    return out;
  });
  zm2.forEach(x => errs.push('Zoom: ' + x));

  // Block timer MVP (2026-11-05): ▶ on a task starts it + its block, double tap = one tap, tick stops the task,
  // Break / Pause / Resume / correct / Finish, ids saved with the pad, events sent, time from timestamps (lock-proof).
  const tmr = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = [];
    const pad = document.querySelector('#todayScroll .day-row > .plan-pad[data-date="' + localToday() + '"]'); // Blocks hidden in its row (2026-11-12): timer logic still runs
    if (!pad || !window.fwTimer) return ['no Blocks pad or timer'];
    const layer = () => pad.parentElement.querySelector('.tmr-layer');
    const bar = () => pad.parentElement.querySelector('.tmr-bar');
    const chip = t => [...(layer()?.children || [])].find(c => c._line && c._line.textContent.trim() === t);
    const evs = a => fwTimer.events().filter(e => e.act === a);
    const email = [...pad.querySelectorAll('.check-line')].find(l => l.textContent.trim() === 'Email');
    const title = pad.querySelector('[data-title]');
    if (!chip('Next Block') || !chip('Email')) return ['chips missing: ' + [...(layer()?.children || [])].length];
    const off = Math.abs(chip('Email').getBoundingClientRect().top - email.getBoundingClientRect().top);
    if (getComputedStyle(pad).display !== 'none' && off > 20) out.push('Email chip is ' + off + 'px away from its line');
    // Lock-proof: a block started 3 hours ago (e.g. phone locked since) shows 3h, and the forgotten-timer note appears.
    const old = document.createElement('div'); old.setAttribute('data-title', '1'); old.dataset.tmr = 'b-old'; old.innerHTML = '<b>Old block</b>';
    pad.insertBefore(old, pad.firstChild);
    fwTimer.merge([{ op: 'x-old', date: '2000-01-01', at: Date.now() - 3 * 3600e3, act: 'start', blk: 'b-old' }]);
    fwTimer.checkForgot(); const so = fwTimer.replay();
    if (!so.blocks['b-old'] || so.blocks['b-old'].ms < 3 * 3600e3 - 5000) out.push('3h-old start shows ' + JSON.stringify(so.blocks['b-old']));
    if (!/has been running 3h/.test(document.getElementById('status')?.textContent || '')) out.push('no forgotten-timer note');
    fwTimer.merge([{ op: 'x-old2', date: '2000-01-01', at: Date.now(), act: 'finish', blk: 'b-old' }]); old.remove();
    // ▶ buttons sit inside their own cell border (2026-11-05).
    const inside = ['Next Block', 'Email'].map(n => { const c = chip(n); return c.getBoundingClientRect().right <= c._line.getBoundingClientRect().right + 0.5; });
    if (getComputedStyle(pad).display !== 'none' && inside.includes(false)) out.push('▶ outside its cell: ' + inside);
    const go = c => c.querySelector('button').click();
    go(chip('Email')); go(chip('Email')); await wait(150);
    if (evs('istart').length !== 1) out.push('double tap made ' + evs('istart').length + ' starts');
    let s = fwTimer.replay();
    if (!title.dataset.tmr || !email.dataset.tmr) return out.concat('ids not set on the lines');
    if (s.cur !== title.dataset.tmr || s.blocks[s.cur].child !== email.dataset.tmr) out.push('task start did not start its block: ' + JSON.stringify(s.cur));
    if (!/^Block \d/.test(title.textContent.trim())) out.push('Next Block not renamed on start: ' + title.textContent);
    if (![...pad.querySelectorAll('[data-title]')].some(n => /^Next Block/.test(n.textContent.trim()))) out.push('no fresh Next Block after starting');
    await wait(100);
    // Next Block hint (2026-11-05): its empty task shows the placeholder, and it's never saved.
    const ph = pad.querySelector('[data-blkph] > .check-text');
    if (!ph || !/next block/i.test(getComputedStyle(ph, '::before').content)) out.push('Next Block hint missing');
    if (!bar().classList.contains('on') || !bar().classList.contains('run')) out.push('bar not showing the running block');
    email.querySelector('input').click(); await wait(150);
    s = fwTimer.replay();
    if (!evs('istop').length || s.blocks[title.dataset.tmr].child || !s.blocks[title.dataset.tmr].run) out.push('tick did not stop only the task');
    const tap = a => bar().querySelector('[data-tact="' + a + '"]').click();
    tap('break'); await wait(700); s = fwTimer.replay();
    if (s.blocks[title.dataset.tmr].child !== 'break') out.push('Break did not start');
    tap('block'); await wait(700); s = fwTimer.replay();
    if (s.blocks[title.dataset.tmr].run || !s.blocks[title.dataset.tmr].paused || s.cur) out.push('Pause did not pause');
    tap('block'); await wait(700); s = fwTimer.replay();
    if (!s.blocks[title.dataset.tmr].run || s.blocks[title.dataset.tmr].child !== 'break') out.push('Resume did not bring back the block + break');
    window.prompt = () => '45m';
    bar().querySelector('[data-tact="fix-blk"]').click(); await wait(100); s = fwTimer.replay();
    if (s.blocks[title.dataset.tmr].ms !== 45 * 60e3 || s.blocks[title.dataset.tmr].raw > 60e3) out.push('correction: ' + JSON.stringify(s.blocks[title.dataset.tmr]));
    tap('finish'); await wait(150); s = fwTimer.replay();
    if (s.cur || !s.blocks[title.dataset.tmr].done) out.push('Finish did not stop the block');
    if (!/Today: 45m tracked/.test(bar().textContent)) out.push('day total: ' + bar().textContent);
    if (email.classList.contains('done') !== true) out.push('Finish changed the task');
    // Title menu (2026-11-05): tapping the block title opens Start / Finish / Rename / Remove; Remove deletes the block.
    const tapAt = el => { const r = el.getBoundingClientRect(), o = { bubbles: true, clientX: r.left + 10, clientY: r.top + 5, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new MouseEvent('click', o)); };
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    tapAt(title.querySelector('b') || title);
    const menu = document.querySelector('.tmr-menu');
    const labels = menu ? [...menu.querySelectorAll('button')].map(x => x.textContent).join('|') : '';
    if (!/Start|Resume/.test(labels) || !/Rename/.test(labels) || !/Remove block/.test(labels)) out.push('title menu: ' + (labels || 'missing'));
    window.confirm = () => true;
    menu?.querySelector('[data-m="remove"]')?.click(); await wait(100);
    if (title.isConnected || email.isConnected) out.push('Remove block left the block');
    await wait(2500);
    const calls = window.__calls || [];
    const sentOps = calls.filter(c => c[0] === 'saveTimerEvents').flatMap(c => c[1][0].map(e => e.op));
    const mine = fwTimer.events().filter(e => !/^x-old/.test(e.op)).map(e => e.op);
    if (!mine.every(o => sentOps.includes(o))) out.push('events not all sent to the Timer Log');
    const plans = calls.filter(c => c[0] === 'savePlanPad').map(c => String(c[1][1]));
    if (!plans.some(p => p.includes('data-tmr="' + email.dataset.tmr + '"'))) out.push('task id not saved with the Blocks pad');
    if (plans.length && plans[plans.length - 1].includes('Email')) out.push('removed block still in the last save');
    if (plans.some(p => /tmr-chip|tmr-bar/.test(p))) out.push('timer chips leaked into the saved pad');
    if (plans.some(p => /data-blkph/.test(p))) out.push('Next Block hint marker leaked into the saved pad');
    return out;
  });
  tmr.forEach(x => errs.push('Timer: ' + x));

  // Thoughts pad (2026-11-12): bottom-left free writing, saves to its own column; Blocks sits in the middle column.
  const tho = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
    // 2026-11-12 (later): the same pad is now Focus / Thinking, docked bottom-middle; bottom-left = empty Timer slot.
    const bs = document.getElementById('blocksScroll');
    const tp = bs && bs.querySelector(':scope > .thought-pad[data-date="' + localToday() + '"]');
    if (!tp) return ['no Focus / Thinking pad in the middle column'];
    if (getComputedStyle(tp).display === 'none' || getComputedStyle(bs).display === 'none') out.push('Focus / Thinking hidden');
    const ts = document.querySelector('#todayScroll .od-on > .timer-slot');
    if (!ts || getComputedStyle(ts).display === 'none') out.push('no empty Timer slot bottom-left'); else if (ts.textContent.trim()) out.push('Timer slot not empty');
    const pp = document.querySelector('#todayScroll .od-on > .plan-pad');
    if (pp && getComputedStyle(pp).display !== 'none') out.push('Blocks still showing');
    tp.focus(); tp.innerHTML = 'free thought, no rules'; tp.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(1500);
    // 2026-11-13: Focus / Thinking is a full editor — tasks get checkboxes + cards, and a tick saves.
    if (!tp.classList.contains('editor')) out.push('Focus / Thinking is not a full editor');
    const saves = (window.__calls || []).filter(c => c[0] === 'saveThoughtPad');
    if (!saves.some(c => String(c[1][1]).includes('free thought'))) out.push('Thoughts did not save');
    if ((window.__calls || []).filter(c => c[0] === 'savePlanPad').some(c => String(c[1][1]).includes('free thought'))) out.push('Thoughts text leaked into Blocks');
    return out;
  });
  tho.forEach(x => errs.push('Thoughts: ' + x));
  const before = await pg.evaluate(() => window.fwTimer.events().length);
  await pg.reload(); await pg.waitForTimeout(800);
  const after = await pg.evaluate(() => window.fwTimer && window.fwTimer.events().length);
  if (after !== before) errs.push('Timer: events lost on reload (' + before + ' → ' + after + ')');
  // Last on purpose: it changes the column widths the earlier checks measure against.
  // Tuck (2026-11-06): drag the last column line to the right edge → Reference is a thin strip with a pull tab; tap = back.
  const tk = [];
  const hp = await pg.evaluate(() => { const hs = [...document.querySelectorAll('.column-resizer')].filter(h => h.offsetParent); if (!hs.length) return null; const r = hs[hs.length - 1].getBoundingClientRect(); return [r.left + r.width / 2, r.top + 30, innerWidth]; });
  if (hp) {
    await pg.mouse.move(hp[0], hp[1]); await pg.mouse.down(); await pg.mouse.move(hp[0] + 60, hp[1], { steps: 3 }); await pg.mouse.move(hp[2] - 1, hp[1], { steps: 4 }); await pg.mouse.up();
    await pg.waitForTimeout(150);
    const res = await pg.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      window.tuckScan && tuckScan(); await wait(100);
      const ref = document.getElementById('calPane') || document.getElementById('referencePane'), w = ref.getBoundingClientRect().width;
      if (w > 30) out.push('Reference did not tuck: ' + Math.round(w) + 'px');
      if (ref.getBoundingClientRect().right > innerWidth + 1) out.push('Reference went past the window');
      const tab = document.querySelector('.fw-tuck-tab');
      if (!tab) return out.concat('no pull tab on the tucked column');
      tab.click(); await wait(200);
      if (ref.getBoundingClientRect().width < 150) out.push('pull tab did not bring Reference back');
      if (document.querySelector('.fw-tuck-tab')) out.push('pull tab stayed after restore');
      return out;
    });
    tk.push(...res);
  }
  tk.forEach(x => errs.push('Tuck: ' + x));
  // Reference deltas must preserve editor nodes and defer authoritative removals during local work.
  await pg.waitForTimeout(1000);
  const refSync = await pg.evaluate(async () => {
    const failures = [], check = (ok,msg) => { if(!ok) failures.push(msg); };
    window.fwRefDrawer && fwRefDrawer.open(); await new Promise(r => setTimeout(r, 250));
    document.querySelector('#referencePane button[data-rtab="reference"]')?.click();
    document.activeElement?.blur?.();
    const item = (id,content) => ({id,parentId:'',type:'item',title:id,sort:id==='a'?1:2,expanded:true,content,ch:'h-'+id});
    state.reference = [item('a','<h2>Parent</h2>'),item('b','<h2>Child</h2>')];
    state.reference.forEach(refBase); state.refManifestHash = 'old'; renderReference();
    const node = id => document.querySelector('#referenceTree .ref-cell-wrapper[data-id="'+id+'"]');
    const a = node('a'), b = node('b');
    const metadata = (id,parentId='',expanded=true) => ({id,parentId,type:'item',title:id,sort:id==='a'?1:2,expanded});
    fwApplyReferenceSync({ref:{a:{content:'<h2>Renamed parent</h2>',ch:'h-new'},c:{content:'<h2>New card</h2>',ch:'h-c'}},
      refManifest:{hash:'added',items:[metadata('a','',false),metadata('b','a'),metadata('c')]}});
    check(node('a')===a && node('b')===b,'existing editor nodes replaced');
    check(node('b')?.parentElement===a.querySelector(':scope > .ref-children'),'remote nesting not applied');
    check(!!node('c') && a.classList.contains('ref-collapsed'),'new card or collapse missing');
    check(a.querySelector('.ref-cell').textContent.includes('Renamed parent'),'remote title/body missing');
    // Parent deletion with a surviving, reparented child must not discard the child's DOM node.
    fwApplyReferenceSync({ref:{},refManifest:{hash:'removed',items:[metadata('b')]}});
    check(!node('a') && !node('c') && node('b')===b && b.parentElement.id==='referenceTree','delete/reparent lost a surviving editor');
    const ed = b.querySelector(':scope > .ref-cell'); ed.focus();
    const remove = {ref:{},refManifest:{hash:'empty',items:[]}};
    fwApplyReferenceSync(remove);
    check(node('b')===b && state.refManifestHash==='removed','focused edit was removed or acknowledged');
    ed.blur();
    state.reference[0]._timer = 123;
    fwApplyReferenceSync(remove);
    check(node('b')===b,'pending save was removed');
    state.reference[0]._timer = 0;
    state.reference[0]._refDeleted = true;
    fwApplyReferenceSync(remove);
    check(node('b')===b && fwUnsaved(),'deleted local draft was discarded or reload guard disabled');
    delete state.reference[0]._refDeleted;
    // A response captured before a local mutation must not remove a newly added card.
    const original = google.script.run; let complete;
    google.script.run = {withSuccessHandler(fn){complete=fn;return this;},withFailureHandler(){return this;},getSyncState(){}};
    try { fwSync(false); fwRefEpoch++; complete(remove); }
    finally { google.script.run = original; }
    check(node('b')===b && state.refManifestHash==='removed','late response overwrote a newer local action');
    fwRefStructureStart(); fwApplyReferenceSync(remove);
    check(node('b')===b,'in-flight structural write was removed'); fwRefStructureEnd();
    fwApplyReferenceSync(remove);
    check(state.reference.length===0 && !node('b') && !!document.querySelector('#referenceTree .empty'),'empty authoritative manifest not applied');
    check(state.refManifestHash==='empty','applied manifest was not acknowledged');
    const context = fwSpeedContext({rpcMs:12,applyMs:3});
    check(context.pageBuild==='smoke' && context.w===innerWidth && context.rpcMs===12,'timing page/build context missing');
    return failures;
  });
  refSync.forEach(x => errs.push('Reference sync: ' + x));
  if (errs.length) { fails += errs.length; console.error('✗ ' + name + ':\n  ' + errs.join('\n  ')); }
  else console.log('✓ ' + name + ': loads with no page errors');
}
// Recovery after an actual page close/reopen, using the same local storage and changed server fixtures.
if(only('drafts')) for(const [name,view] of [['desktop',{width:1300,height:900}],['phone',{width:412,height:915,isMobile:true,hasTouch:true}]]){
  const ctx=await b.newContext({viewport:{width:view.width,height:view.height},isMobile:view.isMobile,hasTouch:view.hasTouch});
  await ctx.addInitScript(()=>{window.__draftFail=false;window.confirm=()=>true;});
  const errors=[],file=path.join(os.tmpdir(),'gantt-recovery-smoke.html');
  const draftStub=`<script>window.google={script:{run:new Proxy({},{get(t,k){let ok,bad;const p=new Proxy({},{get(_,m){
    if(m==='withSuccessHandler')return f=>{ok=f;return p;};if(m==='withFailureHandler')return f=>{bad=f;return p;};
    return(...a)=>{(window.__calls||=[]).push([m,a]);setTimeout(()=>{
      if(window.__draftFail && (m==='saveDay'||m==='saveReferenceItem')){bad&&bad(new Error('offline test'));return;}
      ok&&ok(m==='saveDay'?{th:'accepted-t',jh:'accepted-j',build:'smoke'}:m==='saveReferenceItem'?{id:a[0].id,ch:'accepted-r',meta:{parentId:'',expanded:true},metaConflicts:[],build:'smoke'}:m==='getFocus'?{v:1,cats:[]}:m==='getMainCalendarEvents'?{date:a[0],events:[]}:m==='getSyncState'||m==='runImports'?{build:'smoke',days:{},ref:{}}:null);
    },15);};}});return p[k];}})}};</script>`;
  function draftPage(changed=false,empty=false){
    const d={today,inbox:[],cardCats:[],notesSeeds:{},urgent:[],refPins:[],timing:{total:1,steps:{},fast:false},
      days:[{date:today,tasks:'<p>'+(changed?'Other device day':'Original day')+'</p>',journal:'',th:changed?'h1':'h0',jh:'j0'}],
      reference:empty?[]:[{id:'recover-ref',parentId:'',type:'item',title:'Reference',sort:1,expanded:true,content:'<h2>Reference</h2><p>'+(changed?'Other device ref':'Original ref')+'</p>',ch:changed?'r1':'r0'}]};
    fs.writeFileSync(file,fs.readFileSync('Index.html','utf8')
      .replace("<?!= HtmlService.createHtmlOutputFromFile('WeekdayIcons').getContent() ?>",fs.readFileSync('WeekdayIcons.html','utf8'))
      .replace("<?!= HtmlService.createHtmlOutputFromFile('Drafts').getContent() ?>",fs.readFileSync('Drafts.html','utf8'))
      .replace('<?!= initialData ?>',JSON.stringify(d)).replace(/<\?= appUrl \?>/g,'https://script.google.com/macros/s/recovery-smoke/dev').replace('<?= build ?>','smoke').replace('<head>','<head>'+draftStub));
  }
  const open=async()=>{const pg=await ctx.newPage();pg.on('pageerror',e=>errors.push(e.message));await pg.goto('file://'+file);await pg.waitForTimeout(2200);return pg;};
  try{
    draftPage();let pg=await open();
    await pg.evaluate(date=>{
      window.__draftFail=true;
      const day=document.querySelector('#todayScroll .day-editor[data-date="'+date+'"]');day.innerHTML='<p>Recovered day edit</p><div class="check-line" data-level="0"><input type="checkbox" data-wired="1"><span class="check-text">Recovered checkbox</span></div>';day.dispatchEvent(new Event('input',{bubbles:true}));
      const ref=document.querySelector('#referenceTree .ref-cell-wrapper[data-id="recover-ref"] > .ref-cell');ref.innerHTML='<h2>Reference</h2><p>Recovered ref edit</p>';ref.dispatchEvent(new Event('input',{bubbles:true}));
    },today);
    await pg.waitForTimeout(1000);await pg.close();
    draftPage(true);pg=await open();
    if(!await pg.evaluate(()=>fwDrafts.list().some(e=>e.kind==='day') && fwDrafts.list().some(e=>e.kind==='ref')))throw Error('unsent day/ref copies not found after reopen');
    if(!await pg.evaluate(()=>document.querySelector('#todayScroll .day-editor').textContent.includes('Other device day') && !document.querySelector('#todayScroll .day-editor').textContent.includes('Recovered day edit')))throw Error('recovery changed server content before review');
    await pg.locator('#fwDraftNotice button').click();await pg.locator('dialog [data-draft-kind="day"] button').first().click();
    await pg.waitForTimeout(1100);
    if(!await pg.evaluate(()=>{const t=document.querySelector('#todayScroll .day-editor').textContent;return t.includes('Recovered day edit')&&t.includes('Other device day');}))throw Error('day recovery lost draft or remote text');
    await pg.waitForFunction(()=>!fwUnsaved());
    if(!await pg.evaluate(()=>{const line=[...document.querySelectorAll('#todayScroll .day-editor .check-line')].find(l=>l.textContent.includes('Recovered checkbox'));const cb=line?.querySelector('input');if(!cb)return false;cb.click();return cb.checked && line.classList.contains('done');}))throw Error('restored checkbox was not wired');
    await pg.waitForFunction(()=>!fwUnsaved());
    await pg.locator('#fwDraftNotice button').click();await pg.locator('dialog [data-draft-kind="ref"] button').first().click();await pg.waitForTimeout(1100);
    if(!await pg.evaluate(()=>{const t=document.querySelector('#referenceTree .ref-cell').textContent;return t.includes('Recovered ref edit')&&t.includes('Other device ref');}))throw Error('Reference recovery lost draft or remote text');
    await pg.waitForFunction(()=>!fwUnsaved() && fwDrafts.list().length===0);
    await pg.evaluate(()=>fwDrafts.put('ref','deleted-ref',{base:{c:'<h2>Deleted</h2>',h:'old'},content:'<h2>Deleted recovery</h2><p>Keep this text</p>'},'Deleted Reference'));
    await pg.close();draftPage(true,true);pg=await open();
    const count=await pg.evaluate(()=>(window.__calls||[]).filter(c=>c[0]==='addReferenceItem').length);
    await pg.locator('#fwDraftNotice button').click();await pg.locator('dialog [data-draft-kind="ref"] button').first().click();
    if(!await pg.evaluate(()=>fwDrafts.list().some(e=>e.id==='deleted-ref')))throw Error('deleted Reference recovery was discarded');
    if(await pg.evaluate(()=>(window.__calls||[]).filter(c=>c[0]==='addReferenceItem').length)!==count)throw Error('deleted Reference was recreated automatically');
    await pg.locator('dialog [data-draft-kind="ref"] button').nth(1).click();
    if(!await pg.evaluate(()=>fwDrafts.list().length===0))throw Error('explicit discard did not remove the selected copy');
  }catch(e){errors.push(e.message);}
  if(errors.length){fails+=errors.length;console.error('✗ drafts '+name+': '+errors.join(' | '));}else console.log('✓ drafts '+name+': closed-page recovery, remote merge, reviewed saves and deleted-card retention');
  await ctx.close();
}
// Time Tracker (2026-11-05): tracker/App.html with Core inlined and an in-page fake trackerSync (last write wins,
// like tracker/Server.gs). Walks the acceptance scenarios on desktop and phone. Core logic: tools/tracker-test.mjs.
{
  const ttStub = `<script>window.__srv={seq:0,rows:{}};window.google={script:{run:new Proxy({},{get(t,k){let ok=null,bad=null;const p=new Proxy({},{get(_,m){
    if(m==='withSuccessHandler')return f=>{ok=f;return p;}; if(m==='withFailureHandler')return f=>{bad=f;return p;};
    return(req)=>setTimeout(()=>{const S=window.__srv,acc=[];(req.changes||[]).forEach(r=>{const o=S.rows[r.id];if(!o||o.r.u<r.u){S.rows[r.id]={s:++S.seq,r};}acc.push({id:r.id,u:r.u});});
      ok&&ok({seq:S.seq,accepted:acc,changes:Object.values(S.rows).filter(x=>x.s>req.since).map(x=>x.r),url:'#sheet'});},20);}});return p[k];}})}};</script>`;
  const tHtml = fs.readFileSync('tracker/App.html', 'utf8')
    .replace("<?!= trackerInclude_('tracker/Core') ?>", fs.readFileSync('tracker/Core.html', 'utf8')).replace('<head>', '<head>' + ttStub);
  const tOut = path.join(os.tmpdir(), 'tracker-smoke.html');
  fs.writeFileSync(tOut, tHtml);
  for (const [name, view] of (only('tracker') ? [['desktop', { width: 1200, height: 900 }], ['phone', { width: 412, height: 915, isMobile: true, hasTouch: true }]] : [])) {
    const ctx = await b.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message + (process.env.STK ? ' @ ' + (e.stack || '').split('\n').slice(1,4).join(' | ') : '')));
    pg.on('dialog', d => d.accept());
    await pg.goto('file://' + tOut);
    await pg.waitForTimeout(500);
    const q = async (text, mode, play) => {
      await pg.click(`[data-a="mode"][data-m="${mode}"]`); await pg.fill('#qa', text);
      if (play) await pg.click('[data-a="quickStart"]'); else await pg.press('#qa', 'Enter');
      await pg.waitForTimeout(80);
    };
    const S = () => pg.evaluate(() => { const s = ttApp.store, T = ttApp.TT, r = T.running(s);
      return { blocks: s.all('block').map(b => ({ id: b.id, t: b.title, staged: b.staged, plan: b.planKey, items: T.itemsOf(s, b.id).map(i => [i.title, i.done]) })),
        run: r && { b: (s.get(r.blockId) || {}).title, item: r.itemId && s.get(r.itemId).title, start: r.start }, entries: s.all('entry').length,
        manual: s.all('entry').filter(e => e.source === 'manual').length, dirty: s.dirtyList().length, srv: Object.keys(window.__srv.rows).length }; });
    // Task with nothing running -> Next Block
    await q('call bank, renew tags', 'task');
    let s = await S();
    const nb = s.blocks.find(x => x.t === 'Next Block');
    if (!nb || !nb.staged || nb.items.length !== 2) errs.push('task with nothing running did not land in Next Block: ' + JSON.stringify(s.blocks));
    // Block with comma items, tap it -> timer starts
    await q('Yard: sweep leaves, wash truck, clean garage', 'block');
    s = await S();
    const yard = s.blocks.find(x => x.t === 'Yard');
    if (!yard || yard.items.map(i => i[0]).join('|') !== 'sweep leaves|wash truck|clean garage') errs.push('comma items: ' + JSON.stringify(yard));
    await pg.click(`.card[data-bid="${yard.id}"] [data-a="toggleBlock"]`); await pg.waitForTimeout(80);
    s = await S();
    if (!s.run || s.run.b !== 'Yard' || !(await pg.textContent('#bar')).includes('Yard')) errs.push('tap block did not start it');
    // Add a task while running -> goes to Yard, timer not restarted
    const st0 = s.run.start;
    await q('rake path', 'task'); s = await S();
    if (!s.blocks.find(x => x.t === 'Yard').items.some(i => i[0] === 'rake path') || s.run.start !== st0) errs.push('quick add to running block');
    // Item start, then check it complete
    const itemBtn = (n, a) => pg.click(`.card.run .it:nth-child(${n}) [data-a="${a}"]`);
    await itemBtn(1, 'itemPlay'); await pg.waitForTimeout(1100); s = await S();
    if (!s.run || s.run.item !== 'sweep leaves') errs.push('item timer did not start');
    await itemBtn(1, 'toggleItem'); await pg.waitForTimeout(80); s = await S();
    if (!s.blocks.find(x => x.t === 'Yard').items[0][1] || !s.run || s.run.item) errs.push('complete did not stop the item / keep the block: ' + JSON.stringify(s.run));
    // Pause from the top bar: everything stops
    await itemBtn(2, 'itemPlay'); await pg.waitForTimeout(1100);
    await pg.click('#bar [data-a="pause"]'); await pg.waitForTimeout(80); s = await S();
    if (s.run) errs.push('pause left a timer running');
    // Switch blocks: no overlap
    await q('Email', 'block', true); await pg.waitForTimeout(1100);
    await pg.click(`.card[data-bid="${yard.id}"] [data-a="toggleBlock"]`); await pg.waitForTimeout(80);
    const open = await pg.evaluate(() => ttApp.TT.openEntries(ttApp.store).length);
    if (open !== 1) errs.push('open entries after switching: ' + open);
    // Lock screen: pretend the open entry started 3 h ago, reload -> elapsed from timestamps + "still on it?" banner
    await pg.evaluate(() => { const s = ttApp.store, r = ttApp.TT.running(s); s.patch(r.id, { start: Date.now() - 3 * 3600e3 }); ttApp.render(); });
    await pg.waitForTimeout(900);
    await pg.reload(); await pg.waitForTimeout(500);
    const el = await pg.textContent('[data-live="el"]');
    if (!/^3:0\d:\d\d$/.test(el)) errs.push('elapsed after reload: ' + el);
    if (!(await pg.$('[data-ban="long"]'))) errs.push('no long-running banner');
    await pg.click('[data-a="stopAtSheet"]'); await pg.click('[data-a="stopAgo"][data-m="60"]'); await pg.click('[data-a="stopAtSave"]'); await pg.waitForTimeout(80);
    s = await S();
    if (s.run) errs.push('stop at… left it running');
    // Manual (estimated) entry
    await pg.click('[data-a="manualSheet"]:not([data-id])');
    // End before the synthetic 3-hour timer. Using the current rounded minute can
    // overlap the real entries made earlier in this test when a minute rolls over.
    const manual = await pg.evaluate(() => {
      const t = Date.now() - 4 * 3600e3, d = new Date(t);
      return {date:ttApp.TT.dateOf(t),end:String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')};
    });
    await pg.fill('#mDate', manual.date); await pg.fill('#mEnd', manual.end);
    await pg.fill('#mTitle', 'Researching Android browsers'); await pg.fill('#mStart', '');
    await pg.fill('#mDur', '30m'); await pg.click('[data-a="saveManual"]'); await pg.waitForTimeout(80);
    if (await pg.isVisible('#mTitle')) throw new Error('Manual fixture rejected: ' + await pg.textContent('#err'));
    s = await S();
    if (s.manual !== 1) errs.push('manual entry not saved: ' + await pg.textContent('#err').catch(() => ''));
    // Calendar: plan tomorrow, start it now; the plan keeps its time
    await pg.click('[data-a="view"][data-v="cal"]');
    await pg.click('[data-a="calNav"][data-n="1"]');
    await pg.click('[data-a="planSheet"]');
    await pg.fill('#pTitle', 'Clean truck'); await pg.fill('#pStart', '14:00'); await pg.fill('#pDur', '1h'); await pg.fill('#pItems', 'vacuum, wash');
    await pg.click('[data-a="savePlan"]'); await pg.waitForTimeout(80);
    const plan = await pg.$('.plan');
    if (!plan) errs.push('planned block not drawn');
    else {
      // Drag the grip down one hour -> 15:00 (this occurrence)
      const g = await pg.$('.plan .grip'), bb = await g.boundingBox();
      await pg.evaluate(([x, y]) => { const t = document.querySelector('.plan .grip'), o = { bubbles: true, pointerId: 7, clientX: x, clientY: y };
        t.dispatchEvent(new PointerEvent('pointerdown', o)); document.dispatchEvent(new PointerEvent('pointermove', { ...o, clientY: y + 48 }));
        document.dispatchEvent(new PointerEvent('pointerup', { ...o, clientY: y + 48 })); }, [bb.x + 5, bb.y + 5]);
      await pg.waitForTimeout(80);
      const startMin = await pg.evaluate(() => ttApp.store.all('plan')[0].start);
      if (startMin !== 15 * 60) errs.push('drag move: start = ' + startMin);
      await pg.click('.plan [data-a="startPlan"]'); await pg.waitForTimeout(80);
      s = await S();
      const pb = s.blocks.find(x => x.plan);
      if (!s.run || s.run.b !== 'Clean truck' || !pb || pb.items.length !== 2) errs.push('start planned block: ' + JSON.stringify(s.run));
      const p0 = await pg.evaluate(() => ttApp.store.all('plan')[0]);
      if (p0.start !== 900 || p0.dur !== 60) errs.push('plan changed by tracking');
    }
    // Recurring: Mon/Wed/Fri study -> 3 in week view, no new entries
    const before = (await S()).entries;
    await pg.click('[data-a="planSheet"]');
    await pg.fill('#pTitle', 'Study'); await pg.fill('#pStart', '08:00'); await pg.fill('#pDur', '45m');
    await pg.selectOption('#pRep', 'weekly');
    await pg.evaluate(() => { const d = document.getElementById('pDate'); d.value = ttApp.TT.addDays(d.value, -ttApp.TT.weekday(d.value)); });
    await pg.evaluate(() => document.querySelectorAll('.pDay').forEach(x => { x.checked = [1, 3, 5].includes(+x.value); }));
    await pg.click('[data-a="savePlan"]'); await pg.click('[data-a="calMode"][data-m="week"]'); await pg.waitForTimeout(80);
    const nStudy = await pg.$$eval('.plan .pt', xs => xs.filter(x => /Study/.test(x.textContent)).length);
    if (nStudy !== 3) errs.push('weekly occurrences shown: ' + nStudy);
    if ((await S()).entries !== before) errs.push('recurrence created time entries');
    // Day view: measured vs estimated vs unaccounted
    await pg.click('[data-a="view"][data-v="day"]');
    const day = await pg.textContent('#main');
    if (!/Measured \(timer\)/.test(day) || !/Estimated \(manual\)/.test(day) || !/Unaccounted/.test(day)) errs.push('day view missing reconciliation rows');
    await pg.click('[data-a="view"][data-v="more"]');
    if (!(await pg.$('[data-a="exportCsv"]'))) errs.push('no export');
    // Sync: everything reached the fake server and nothing is left dirty
    await pg.waitForTimeout(1500);
    s = await S();
    if (s.dirty || s.srv < 10) errs.push('sync: ' + s.dirty + ' dirty, ' + s.srv + ' on server');
    const wide = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (wide) errs.push('page scrolls sideways');
    const shot = process.argv.indexOf('--shot');
    if (shot > 0) { await pg.click('[data-a="view"][data-v="blocks"]'); await pg.screenshot({ path: process.argv[shot + 1].replace(/(\.png)?$/, '-tracker-' + name + '.png') }); }
    if (errs.length) { fails += errs.length; console.error('✗ tracker ' + name + ':\n  ' + errs.join('\n  ')); }
    else console.log('✓ tracker ' + name + ': acceptance walk-through passes');
    await ctx.close();
  }
}
// 📅 Calendar panel, phase 1 (2026-11-08): read-only FullCalendar slide-out. FullCalendar + luxon come from jsDelivr in
// the app; here they're served from a local npm copy (FC_DIR, or installed once into the temp dir) so the test runs
// offline. The device is set to New York on purpose: times must still show in America/Los_Angeles.
{
  const { execSync } = await import('child_process');
  let fcDir = process.env.FC_DIR || path.join(os.tmpdir(), 'fc-smoke', 'node_modules');
  const need = ['fullcalendar/index.global.min.js', '@fullcalendar/luxon3/index.global.min.js', 'luxon/build/global/luxon.min.js'];
  if (!need.every(f => fs.existsSync(path.join(fcDir, f)))) {
    try {
      const d = path.join(os.tmpdir(), 'fc-smoke'); fs.mkdirSync(d, { recursive: true });
      execSync('npm i --silent --no-audit --no-fund --prefix "' + d + '" fullcalendar@6.1.15 @fullcalendar/luxon3@6.1.15 luxon@3.4.4', { stdio: 'ignore' });
      fcDir = path.join(d, 'node_modules');
    } catch (e) { /* falls through to the skip below */ }
  }
  if (!need.every(f => fs.existsSync(path.join(fcDir, f)))) console.log('… calendar panel: skipped (FullCalendar not installable offline)');
  else {
    // Fake main + Events calendars in the page (phase 2): events are seeded per day the first time a range asks for
    // it, then create / update / delete change them like Code.gs does (opId guard, repeating + Events read-only).
    // Switches: __calFail (reads fail), __calEmpty (reads return nothing), __calFailWrite (writes fail),
    // __calLoseReply (write succeeds on the "server" but the reply is lost, like a dropped connection).
    const calStub = `<script>window.__calls=[];window.__cal={ev:{},seeded:{},ops:{},n:0};
    window.__calSrv=function(m,a){if(m==='getFocus')return window.__focus;if(!window.luxon)return undefined;const S=window.__cal,L=luxon.DateTime,Z='America/Los_Angeles',iso=x=>L.fromISO(x,{zone:Z}).toISO({suppressMilliseconds:true});
      const put=e=>{e.id=e.eventId+'|'+e.startMs;S.ev[e.eventId]=e;return e;},ms=(x,ad)=>L.fromISO(x,{zone:Z}).toMillis();
      if(m==='getCalendarRange'){
        for(let d=a[0];d<a[1];d=L.fromISO(d).plus({days:1}).toISODate()){ if(S.seeded[d])continue; S.seeded[d]=1;
          const t=(h,mi)=>iso(d+'T'+h+':'+mi),nx=L.fromISO(d).plus({days:1}).toISODate();
          put({eventId:'a-'+d,title:'All-day A',allDay:true,start:d,end:nx,startMs:ms(d),color:'#3f51b5',colorId:'9',cal:'Main',calId:'main',editable:true});
          put({eventId:'b-'+d,title:'Dentist',allDay:false,start:t('09','00'),end:t('10','00'),startMs:ms(t('09','00')),color:'#d50000',colorId:'11',cal:'Main',calId:'main',location:'Main St',editable:true});
          put({eventId:'c-'+d,title:'Old chore',allDay:false,start:t('13','00'),end:t('13','30'),startMs:ms(t('13','00')),color:'#616161',colorId:'8',done:true,cal:'Main',calId:'main',editable:true});
          put({eventId:'r-'+d,title:'Standup',allDay:false,start:t('15','00'),end:t('15','15'),startMs:ms(t('15','00')),color:'#039be5',colorId:'',cal:'Main',calId:'main',recurring:true,editable:false});
          put({eventId:'g-'+d,title:'Gig',allDay:false,start:t('19','00'),end:t('21','00'),startMs:ms(t('19','00')),color:'#33b679',colorId:'',cal:'Events',calId:'events',editable:false});}
        return {start:a[0],end:a[1],events:window.__calEmpty?[]:Object.values(S.ev).concat(window.__calManyAllDay&&(window.__mDay=window.fwCalendar.api().view.activeStart.toISOString().slice(0,10))?Array.from({length:30},(_,i)=>({id:'m'+i+'|x',eventId:'m'+i,title:'Many '+i,allDay:true,start:window.__mDay,end:L.fromISO(window.__mDay).plus({days:1}).toISODate(),startMs:ms(window.__mDay),color:'#3f51b5',colorId:(window.__mDone||{})['m'+i]??i%5===4?'8':'9',done:(window.__mDone||{})['m'+i]??i%5===4,urg:['1','2','3',''][i%4]||undefined,cat:i%2?'code':'',cal:'Main',calId:'main',editable:true})):[]).filter(e=>e.start.slice(0,10)<a[1]&&(e.allDay?e.end:e.end.slice(0,10))>=a[0]).map(e=>Object.assign({},e)),failed:[]};}
      const r=a[0]||{},shape=e=>{e.title=r.title;e.allDay=!!r.allDay;e.start=r.allDay?r.start:iso(r.start);e.end=r.allDay?r.end:iso(r.end);e.startMs=ms(e.start);return e;};
      if(m==='calPanelCreateEvent'){ if(S.ops[r.opId])return Object.assign({repeat:true},S.ev[S.ops[r.opId]]);
        const e=put(shape({eventId:'n'+(++S.n),color:'#039be5',colorId:'',cal:'Main',calId:'main',editable:true,reminders:0}));S.ops[r.opId]=e.eventId;return e;}
      if(m==='calPanelUpdateEvent'){const e=S.ev[r.eventId];if(!e)throw new Error('Event not found');if(e.recurring||!e.editable)throw new Error('Repeating events are read-only here');delete S.ev[r.eventId];return put(shape(e));}
      // Phase 3b: move / resize in place (same id); Graphite (done) is locked; plan links follow the new start.
      const relink=e=>{const link=e.eventId+'@'+e.startMs;(S.plan||[]).forEach(x=>{if(String(x.event).split('@')[0]===e.eventId)x.event=link;});if(e.tag){S.planEv=S.planEv||{};S.planEv['tid:'+e.tag]=link;}return link;};
      if(m==='calPanelMoveEvent'){const e=S.ev[r.eventId];if(!e)throw new Error('Event not found');if(e.recurring||!e.editable)throw new Error('read-only');if(e.colorId==='8')throw new Error('Done events stay where they are');
        delete S.ev[r.eventId];e.allDay=!!r.allDay;e.start=r.allDay?r.start:iso(r.start);e.end=r.allDay?r.end:iso(r.end);e.startMs=ms(e.start);put(e);relink(e);return Object.assign({},e);}
      if(m==='calPanelDeleteEvent'){const e=S.ev[r.eventId];if(e&&(e.recurring||!e.editable))throw new Error('read-only');delete S.ev[r.eventId];return {ok:true};}
      // Phase 3a plan (same rules as Code.gs: one row per ref, Big / Stretch ≤ 3 per day, Schedule = one all-day event per task).
      S.plan=S.plan||[];const P=S.plan,MAX={big:3,stretch:3,next:500,backlog:500},DATED={stretch:1};
      const evInfo=link=>{const mm=String(link||'').match(/^(.+)@([0-9]+)$/);if(!mm)return null;const e=S.ev[mm[1]];if(!e)return {eventId:mm[1],startMs:+mm[2],gone:true};
        return {eventId:e.eventId,startMs:e.startMs,title:e.title,done:e.colorId==='8',date:e.start.slice(0,10),allDay:e.allDay,recurring:!!e.recurring,time:e.allDay?'':L.fromISO(e.start).setZone(Z).toFormat('h:mm a')};};
      const getPlan=d=>({date:d,cal:'main',items:P.filter(x=>!DATED[x.group]||x.date===d).map(x=>Object.assign({},x,{ev:x.event?evInfo(x.event):null})).sort((a,b)=>a.rank-b.rank)});
      if(m==='getPlan')return getPlan(a[0]);
      if(m==='planSave'){const d=r.date,inG=(g,ex)=>P.filter(x=>x.group===g&&(!DATED[g]||x.date===d)&&x!==ex);
        if(r.type==='upsert'){const it=r.item,g=it.group;let x=P.find(y=>y.ref===it.ref&&(!DATED[y.group]||y.date===d));
          if(inG(g,x).length>=MAX[g])throw new Error('full');if(!x){x={id:'p'+(++S.n),ref:it.ref};P.push(x);}const mv=x.group!==g;x.group=g;x.date=DATED[g]?d:'';x.title=it.title||x.title;
          if(it.event)x.event=it.event;if(mv||!x.rank)x.rank=inG(g,x).reduce((mx,y)=>Math.max(mx,y.rank),0)+1;}
        else if(r.type==='moveup'){const dn=P.findIndex(y=>y.id===r.doneId&&y.group==='big');if(dn>=0)P.splice(dn,1);const up=P.find(y=>y.id===r.upId&&y.group==='next');if(!up)throw new Error('gone');up.group='big';up.date='';up.rank=inG('big',up).reduce((mx,y)=>Math.max(mx,y.rank),0)+1;}
        else if(r.type==='remove'){const i=P.findIndex(y=>y.id===r.id);if(i>=0)P.splice(i,1);}
        else if(r.type==='order'){r.ids.forEach((id,i)=>{const x=P.find(y=>y.id===id);if(x)x.rank=i+1;});}
        else if(r.type==='target'){P.find(y=>y.id===r.id).target=r.target;}
        return getPlan(d);}
      if(m==='planSchedule'){const known=(P.find(x=>x.ref===r.ref&&x.event)||{}).event||S.planEv&&S.planEv[r.ref];let e=known&&S.ev[known.split('@')[0]];
        const nx=L.fromISO(r.date).plus({days:1}).toISODate();
        const sl=r.start&&r.end,ad=sl?!!r.allDay:true,st=sl?(ad?r.start:iso(r.start)):r.date,en=sl?(ad?r.end:iso(r.end)):nx;if(sl&&(!r.title||en<=st))throw new Error('bad slot');
        if(e){e.allDay=ad;e.start=st;e.end=en;e.startMs=ms(st);put(e);}else e=put({eventId:'s'+(++S.n),title:r.title,allDay:ad,start:st,end:en,startMs:ms(st),color:'#039be5',colorId:'',cal:'Main',calId:'main',editable:true,reminders:0,tag:r.ref.slice(4)});
        const link=e.eventId+'@'+e.startMs;S.planEv=S.planEv||{};S.planEv[r.ref]=link;P.filter(x=>x.ref===r.ref).forEach(x=>x.event=link);return {event:link};}
      if(m==='planMoveEvent'){const e=S.ev[r.eventId];if(!e||e.recurring)throw new Error('read-only');const sh=L.fromISO(r.date).diff(L.fromISO(e.start.slice(0,10)),'days').days;
        const mv=x=>e.allDay?L.fromISO(x).plus({days:sh}).toISODate():L.fromISO(x).setZone(Z).plus({days:sh}).toISO({suppressMilliseconds:true});e.start=mv(e.start);e.end=mv(e.end);e.startMs=ms(e.start);put(e);
        const link=e.eventId+'@'+e.startMs;P.forEach(x=>{if(String(x.event).split('@')[0]===e.eventId)x.event=link;});return {event:link};}
      if(m==='setCalendarEventMeta'){const e=Object.values(S.ev).find(x=>x.eventId===a[0]);if(!e)throw new Error('Event not found');['urg','due','dur','cat'].forEach(k=>{if(a[3]&&a[3][k])e[k]=a[3][k];else delete e[k];});if(a[3]&&a[3].urg&&e.colorId!=='8')e.colorId={1:'11',2:'5',3:'9'}[a[3].urg];return null;}
      if(m==='setCalendarEventDone'){if(/^m\d+$/.test(a[1])){(window.__mDone=window.__mDone||{})[a[1]]=!!a[3];return {done:!!a[3]};}const e=S.ev[a[1]];if(!e)throw new Error('Event not found');if(a[3]){e.prev=e.colorId;e.colorId='8';e.done=true;}else{e.colorId=e.prev||'';e.done=false;}return {done:!!a[3]};}
      return undefined;};
    window.google={script:{run:new Proxy({},{get(t,k){let ok=null,bad=null;const p=new Proxy({},{get(_,m){
      if(m==='withSuccessHandler')return f=>{ok=f;return p;}; if(m==='withFailureHandler')return f=>{bad=f;return p;}; if(m==='withUserObject')return()=>p;
      return(...a)=>{window.__calls.push([m,a]);return setTimeout(()=>{
        if(m==='getCalendarRange'&&window.__calFail){bad&&bad(new Error('Calendar service timed out'));return;}
        if((/^calPanel/.test(m)||m==='planSchedule')&&window.__calFailWrite){bad&&bad(new Error('Service invoked too many times'));return;}
        let res;try{res=window.__calSrv(m,a);}catch(e){bad&&bad(e);return;}
        if(/^calPanel/.test(m)&&window.__calLoseReply){window.__calLoseReply=0;bad&&bad(new Error('NetworkError: connection lost'));return;}
        if(res!==undefined){ok&&ok(res);return;}
        ok&&ok(m==='runImports'||m==='getSyncState'?{build:'smoke',ref:{},inbox:[],days:{}}:m==='getMainCalendarEvents'?{date:a[0],events:[]}:null);},15);};}});return p[k];}})}};</script>`;
    // Phase 3a: an Undated Tasks card (plus the Keep In Mind items from `focus`) so + Add has every source.
    const calData = JSON.parse(JSON.stringify(data));
    calData.reference.push({ id: 'r-und', parentId: '', type: 'item', title: 'Undated Tasks', content: '<h2>Undated Tasks</h2>' + line('Fix bike'), expanded: true, sort: 2 });
    const cHtml = fs.readFileSync('Index.html', 'utf8')
      .replace("<?!= HtmlService.createHtmlOutputFromFile('WeekdayIcons').getContent() ?>", fs.readFileSync('WeekdayIcons.html', 'utf8'))
      .replace("<?!= HtmlService.createHtmlOutputFromFile('Drafts').getContent() ?>", fs.readFileSync('Drafts.html', 'utf8'))
      .replace('<?!= initialData ?>', JSON.stringify(calData)).replace(/<\?= appUrl \?>/g, '#').replace('<?= build ?>', 'smoke')
      .replace('<head>', '<head>' + calStub.replace('<script>', '<script>window.__focus=' + JSON.stringify(focus) + ';'));
    const cOut = path.join(os.tmpdir(), 'gantt-cal-smoke.html');
    fs.writeFileSync(cOut, cHtml);
    const libs = { 'luxon@3.4.4/build/global/luxon.min.js': 'luxon/build/global/luxon.min.js',
      'fullcalendar@6.1.15/index.global.min.js': 'fullcalendar/index.global.min.js',
      '@fullcalendar/luxon3@6.1.15/index.global.min.js': '@fullcalendar/luxon3/index.global.min.js' };
    for (const [name, view] of (only('calendar') ? [['desktop', { width: 1300, height: 900 }], ['phone', { width: 412, height: 915, isMobile: true, hasTouch: true }]] : [])) {
      const ctx = await b.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch, timezoneId: 'America/New_York' });
      await ctx.route('https://cdn.jsdelivr.net/npm/**', r => {
        const k = Object.keys(libs).find(x => r.request().url().endsWith(x));
        return k ? r.fulfill({ path: path.join(fcDir, libs[k]), contentType: 'application/javascript' }) : r.abort();
      });
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', e => errs.push(e.message));
      await pg.goto('file://' + cOut);
      await pg.waitForTimeout(5000); // let the app's own start-up (imports, live refresh) settle before snapshotting
      const res = await pg.evaluate(async (phone) => {
        const out = [], wait = ms => new Promise(r => setTimeout(r, ms));
        const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(50); } return false; };
        const panel = document.getElementById('calPanel'), tb = document.getElementById('toolbar');
        const btn = tb.querySelector('[data-cal-open]');
        if (!btn) return ['no Calendar button in the top header'];
        const before = [...tb.querySelectorAll('button,a')].map(x => x.textContent.trim()).join('|');
        const ws = [...document.querySelectorAll('#todayScroll .day-editor, #todayScroll .plan-editor')].map(x => x.innerHTML).join('');
        const visible = () => { const r = panel.getBoundingClientRect(); return getComputedStyle(panel).visibility === 'visible' && r.left >= -1 && r.right <= innerWidth + 1; };
        const evText = () => [...panel.querySelectorAll('.fc-event')].map(x => x.textContent).join(' / ');
        for (let i = 0; i < 3; i++) {
          btn.click();
          if (!await until(() => visible() && panel.querySelector('.fc-timegrid-event'))) { out.push('open #' + (i + 1) + ': panel or events not shown (' + (panel.querySelector('[data-cal-state]').textContent || 'no state') + ')'); break; }
          if (i === 0) {
            const timed = [...panel.querySelectorAll('.fc-timegrid-event')].find(x => /Dentist/.test(x.textContent));
            if (!timed) out.push('timed event missing: ' + evText());
            else {
              if (!/(^|[^\d:])9(:00)?\s?am/i.test(timed.textContent)) out.push('timed event not at 9:00 Los Angeles time: ' + timed.textContent);
              if (getComputedStyle(timed).backgroundColor !== 'rgb(213, 0, 0)') out.push('timed event lost its color: ' + getComputedStyle(timed).backgroundColor);
            }
            const allDay = [...panel.querySelectorAll('.fc-daygrid-event')].find(x => /All-day A/.test(x.textContent));
            if (!allDay) out.push('all-day event not in the all-day row');
            else {
              const col = panel.querySelector('.fc-timegrid-col:not(.fc-timegrid-axis)').getBoundingClientRect().width;
              if (allDay.getBoundingClientRect().width > col * 1.3) out.push('one-day all-day event spans more than its day');
            }
            if (!panel.querySelector('.cp-done')) out.push('done (Graphite) event not marked');
            if (!panel.querySelector('.fc-timeGridDay-button') || !panel.querySelector('.fc-timeGridWeek-button') || !panel.querySelector('.fc-today-button') || !panel.querySelector('.fc-prev-button') || !panel.querySelector('.fc-next-button')) out.push('Day / Week / Today / prev / next missing');
            // Google look (2026-11-08): the week title is only the month, so compare the view's first day.
            const viewDay = () => window.fwCalendar.api().view.activeStart.toISOString();
            const title = viewDay();
            // Cache (2026-11-08): the week before / after came with the first read, so stepping a day or a week is
            // drawn at once from the cache with no new server call.
            if (!phone) panel.querySelector('.fc-timeGridDay-button').click();
            const nCalls = window.__calls.filter(c => c[0] === 'getCalendarRange').length;
            for (const k of ['next', 'next', 'prev', 'prev', 'prev']) {
              panel.querySelector('.fc-' + k + '-button').click(); await wait(0);
              if (!/Dentist/.test(evText())) { out.push('stepping ' + k + ': events not drawn at once from the cache'); break; }
            }
            // Crossing into another week may warm the week beyond it in the background (one call), never block on it.
            if (window.__calls.filter(c => c[0] === 'getCalendarRange').length > nCalls + 1) out.push('stepping days nearby asked the server again: ' + JSON.stringify(window.__calls.filter(c => c[0] === 'getCalendarRange').map(c => c[1])));
            panel.querySelector('.fc-today-button').click();
            if (!phone) panel.querySelector('.fc-timeGridWeek-button').click();
            await wait(50);
            panel.querySelector('.fc-next-button').click(); await wait(150);
            if (viewDay() === title) out.push('next did not move');
            panel.querySelector('.fc-today-button').click(); await wait(150);
            if (viewDay() !== title) out.push('Today did not come back');
            panel.querySelector('.fc-timeGridWeek-button').click(); await wait(200);
            if (panel.querySelectorAll('.fc-col-header-cell').length !== 7) out.push('week view is not 7 days');
            panel.querySelector('.fc-timeGridDay-button').click(); await wait(200);
            if (panel.querySelectorAll('.fc-col-header-cell').length !== 1) out.push('day view is not 1 day');
            await until(() => panel.querySelector('.fc-timegrid-event'));
            // Tap an event → detail card; read-only (no edit controls).
            panel.querySelector('.fc-timegrid-event').click(); await wait(80);
            const det = panel.querySelector('[data-cal-detail]');
            if (det.hidden) out.push('tapping an event shows no detail');
            else {
              // Popup card beside / under the event (2026-11-11), inside the panel, with a visible border.
              const dr = det.getBoundingClientRect(), br = det.parentElement.getBoundingClientRect(), er = panel.querySelector('.fc-timegrid-event').getBoundingClientRect();
              if (!det.classList.contains('cp-pop')) out.push('detail is not a popup');
              if (dr.left < br.left - 1 || dr.right > br.right + 1 || dr.top < br.top - 1 || dr.bottom > br.bottom + 1) out.push('popup outside the panel');
              if (dr.left < er.right - 1 && dr.right > er.left + 1 && dr.top < er.bottom - 1 && dr.bottom > er.top + 1) out.push('popup covers the event');
              if (parseFloat(getComputedStyle(det).borderTopWidth) < 1) out.push('popup has no border');
            }
            const close = panel.querySelector('[data-cal-close]').getBoundingClientRect();
            if (close.top < 0 || close.right > innerWidth + 1 || close.height < 30) out.push('close button not reachable ' + JSON.stringify([innerWidth, Math.round(close.right), Math.round(close.height), [...panel.querySelectorAll('.fc-header-toolbar .fc-button')].map(b => b.className.match(/fc-(\w+)-button/)[1] + ':' + Math.round(b.getBoundingClientRect().width))]));
            if (phone && Math.abs(panel.getBoundingClientRect().width - (innerWidth - 28)) > 2) out.push('phone panel should leave a 28px left peek');
            if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways with the panel open');
          }
          if (i === 1) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          else if (i === 2) document.getElementById('calPanelBackdrop').click();
          else panel.querySelector('[data-cal-close]').click();
          await wait(320);
          // 2026-11-13: closed = back in the right column (docked Day view), not floating over the app.
          if (document.body.classList.contains('cal-open') || !(getComputedStyle(panel).visibility === 'hidden' || panel.closest('#calPane'))) out.push('close #' + (i + 1) + ' did not close the panel');
        }
        if (document.querySelectorAll('#calPanel').length !== 1 || document.querySelectorAll('#calPanel .fc-view-harness').length !== 1 || document.querySelectorAll('#calPanel .fc-header-toolbar').length !== 1) out.push('duplicate panels or calendars after reopening');
        // Error → Retry
        // Cache (2026-11-08): reopening while Google fails still shows the cached days (no error, no blank); a fresh
        // read (↻) that fails shows the error + Retry.
        window.__calFail = 1; btn.click();
        if (!await until(() => visible() && panel.querySelector('.fc-timegrid-event'), 1500)) out.push('reopen with Google failing: cached events not shown');
        panel.querySelector('[data-cal-refresh]').click();
        if (!await until(() => /Couldn.t load events/.test(panel.querySelector('[data-cal-state]').textContent))) out.push('no error state when loading fails');
        window.__calFail = 0; const r = panel.querySelector('[data-cal-retry]');
        if (!r) out.push('no Retry button'); else { r.click(); if (!await until(() => panel.querySelector('[data-cal-state]').hidden && panel.querySelector('.fc-timegrid-event'))) out.push('Retry did not reload events'); }
        // Empty
        window.__calEmpty = 1; panel.querySelector('[data-cal-refresh]').click();
        if (!await until(() => /No events/.test(panel.querySelector('[data-cal-state]').textContent))) out.push('no empty state');
        window.__calEmpty = 0;
        // All-day cap (2026-11-10): a long all-day list stops at half the calendar height, scrolls, shows the grip.
        window.__calManyAllDay = 1; panel.querySelector('[data-cal-refresh]').click();
        if (!await until(() => panel.querySelectorAll('.fc-daygrid-event').length > 20 && panel.querySelector('.cp-adgrip.on'))) out.push('all-day cap: grip not shown for a long all-day list');
        else {
          const sc = panel.querySelector('.fc-daygrid-body').closest('.fc-scroller'), H = panel.querySelector('.fc-view-harness').clientHeight;
          if (sc.clientHeight > H * 0.5 + 2) out.push('all-day cap: list taller than half the calendar (' + sc.clientHeight + ' of ' + H + ')');
          if (sc.scrollHeight <= sc.clientHeight) out.push('all-day cap: capped list does not scroll');
          if (panel.querySelector('.fc-timegrid-body').getBoundingClientRect().height < 40) out.push('all-day cap: timeline squeezed out');
          // Checkboxes + urgency groups (2026-11-11): every card has one; labels top → bottom Urgent, Next, Later, Not set, Done.
          if (panel.querySelector('.fc-event:not(.fc-event-mirror) .cp-ev') && [...panel.querySelectorAll('.fc-event .cp-ev')].some(e => !e.querySelector('.cp-chk'))) out.push('checkbox: an event card has no checkbox');
          if (!panel.querySelector('.fc-daygrid-event .cp-chk-cat')) out.push('checkbox: subject color missing on a code event');
          await wait(60);
          const day = [...panel.querySelectorAll('.fc-daygrid-body .fc-daygrid-day-events')].find(d => d.querySelectorAll('[data-cpgl]').length);
          const labs = day ? [...day.querySelectorAll('[data-cpgl]')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(h => h.dataset.cpgl).join(',') : '';
          if (labs !== 'Urgent,Next,Later,Not set,Done') out.push('urgency groups: got "' + labs + '"');
          if (day) { const ev = [...day.querySelectorAll('.fc-daygrid-event')].map(e => e.getBoundingClientRect()).sort((a, b) => a.top - b.top);
            if (ev.some((r, i) => i && r.top < ev[i - 1].bottom - 1)) out.push('urgency groups: labels make events overlap'); }
          // Tap = done; hold = the Gantt hold menu, shown above the panel.
          const ev0 = () => [...panel.querySelectorAll('.fc-daygrid-event')].find(x => /Many 0$/.test(x.textContent.trim()));
          const n0 = window.__calls.filter(c => c[0] === 'setCalendarEventDone').length;
          if (!ev0()) out.push('checkbox: Many 0 not drawn');
          else {
            ev0().querySelector('.cp-chk').click();
            if (!ev0() || !ev0().classList.contains('cp-done')) out.push('checkbox: tap did not mark it done at once');
            if (!await until(() => window.__calls.filter(c => c[0] === 'setCalendarEventDone').length > n0)) out.push('checkbox: tap did not save done');
            await wait(300); await until(() => ev0());
            if (!ev0()) { out.push('checkbox: Many 0 gone after the tap: ' + [...panel.querySelectorAll('.fc-daygrid-event')].map(x => x.textContent.trim()).slice(0, 4).join('|') + ' state=' + panel.querySelector('[data-cal-state]').textContent); } else {
            const chk = ev0().querySelector('.cp-chk'), r = chk.getBoundingClientRect(), o = {bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5, pointerId: 1, pointerType: 'mouse', button: 0};
            chk.dispatchEvent(new PointerEvent('pointerdown', o)); await wait(600);
            const pk = document.querySelector('.urg-picker');
            if (!pk) out.push('checkbox: hold did not open the menu');
            else { const pr = pk.getBoundingClientRect(), top = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
              if (!top || !pk.contains(top)) out.push('checkbox: hold menu is under the calendar panel'); }
            chk.dispatchEvent(new PointerEvent('pointerup', o)); document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
          } }
          window.__calls = window.__calls.filter(c => c[0] !== 'setCalendarEventDone'); window.__mDone = {};
        }
        window.__calManyAllDay = 0; panel.querySelector('[data-cal-refresh]').click();
        if (!await until(() => !panel.querySelector('.cp-adgrip.on') && panel.querySelectorAll('.fc-daygrid-event').length < 10)) out.push('all-day cap: grip still shown for a short list');
        panel.querySelector('[data-cal-close]').click(); await wait(320);
        // Workspace + header unchanged; Options still opens; only reads went to the server.
        if ([...document.querySelectorAll('#todayScroll .day-editor, #todayScroll .plan-editor')].map(x => x.innerHTML).join('') !== ws) out.push('Gantt workspace changed while the calendar was open');
        if ([...tb.querySelectorAll('button,a')].map(x => x.textContent.trim()).join('|') !== before) out.push('header buttons changed');
        tb.querySelector('[data-layout="scale"]').click(); await wait(100);
        if (document.getElementById('typeSettings').classList.contains('hidden')) out.push('Options button stopped working');
        document.getElementById('closeTypeSettings').click();
        const writes = window.__calls.filter(c => /Calendar/i.test(c[0]) && c[0] !== 'getCalendarRange' && c[0] !== 'getMainCalendarEvents' && c[0] !== 'getCalendarPicker').map(c => c[0]);
        if (writes.length) out.push('calendar write calls: ' + writes.join(', '));
        if (!window.__calls.some(c => c[0] === 'getCalendarRange')) out.push('getCalendarRange never called');
        return out;
      }, !!view.isMobile);
      errs.push(...res);
      // Real input on an event checkbox (2026-11-11 bug: element.click() passed, a real tap didn't toggle).
      {
        await pg.evaluate(async () => { const p = document.getElementById('calPanel'); if (!document.body.classList.contains('cal-open')) document.querySelector('#toolbar [data-cal-open]').click();
          for (let i = 0; i < 80 && !(p.querySelector('.fc-timegrid-event .cp-chk') && p.getBoundingClientRect().right <= innerWidth + 1); i++) await new Promise(r => setTimeout(r, 50));
          await new Promise(r => setTimeout(r, 400)); });
        const box = await pg.evaluate(() => { const ev = document.querySelector('#calPanel .fc-timegrid-event:not(.cp-done):not(.fc-event-mirror)'); if (!ev) return null;
          ev.setAttribute('data-realtap', '1'); window.__rtId = (ev.querySelector('.cp-ev') || {}).dataset?.ceId; ev.scrollIntoView({block: 'center'}); const r = ev.querySelector('.cp-chk').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: (ev.querySelector('.cp-ev') || {}).dataset?.ceId }; });
        if (!box) errs.push('real tap: no timed event with a checkbox');
        else {
          const n0 = await pg.evaluate(() => window.__calls.filter(c => c[0] === 'setCalendarEventDone').length);
          if (view.hasTouch) await pg.touchscreen.tap(box.x, box.y); else await pg.mouse.click(box.x, box.y);
          await pg.waitForTimeout(700);
          const r = await pg.evaluate(n0 => ({ n: window.__calls.filter(c => c[0] === 'setCalendarEventDone').length - n0, det: !document.querySelector('#calPanel [data-cal-detail]').hidden }), n0);
          if (r.n !== 1) errs.push('real ' + (view.hasTouch ? 'tap' : 'click') + ' on a checkbox did not mark the event done (' + r.n + ' saves' + (r.det ? ', opened the details instead' : '') + ')');
          // Tap again = undo (and leaves the fixture as it was for the next phases).
          await pg.waitForTimeout(500);
          const b2 = await pg.evaluate(() => { const ev = document.querySelector('#calPanel .fc-timegrid-event[data-realtap].cp-done .cp-chk') || [...document.querySelectorAll('#calPanel .fc-timegrid-event.cp-done')].find(e => e.querySelector('.cp-ev')?.dataset.ceId === window.__rtId)?.querySelector('.cp-chk'); if (!ev) return null; ev.scrollIntoView({block: 'center'}); const r = ev.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
          if (!b2) errs.push('real tap: done event not drawn as done');
          else { if (view.hasTouch) await pg.touchscreen.tap(b2.x, b2.y); else await pg.mouse.click(b2.x, b2.y); await pg.waitForTimeout(900);
            const u = await pg.evaluate(() => ({ n: window.__calls.filter(c => c[0] === 'setCalendarEventDone' && c[1][3] === false).length, left: [...document.querySelectorAll('#calPanel .fc-timegrid-event.cp-done')].filter(e => e.querySelector('.cp-ev')?.dataset.ceId === window.__rtId).length }));
            if (u.n !== 1 || u.left) errs.push('real tap: second tap did not undo done (' + JSON.stringify(u) + ')'); }
          await pg.evaluate(async () => { window.__calls = window.__calls.filter(c => c[0] !== 'setCalendarEventDone'); document.querySelector('#calPanel [data-cal-close]')?.click(); await new Promise(r => setTimeout(r, 400)); });
        }
      }
      // Phase 2 (2026-11-08): create / edit / delete on the main calendar, duplicates, failures, read-only repeats.
      const res2 = await pg.evaluate(async () => {
        const out = [], wait = ms => new Promise(r => setTimeout(r, ms));
        const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(40); } return false; };
        const panel = document.getElementById('calPanel'), det = panel.querySelector('[data-cal-detail]'), S = window.__cal;
        const calls = m => window.__calls.filter(c => c[0] === m);
        const evEl = t => [...panel.querySelectorAll('.fc-event')].find(x => x.textContent.includes(t));
        const byTitle = t => Object.values(S.ev).filter(e => e.title === t);
        const form = () => det.querySelector('[data-cal-form]');
        const set = (n, v) => { const el = form().elements[n]; if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
        document.querySelector('#toolbar [data-cal-open]').click();
        await until(() => panel.querySelector('.fc-timegrid-event'));
        const api = window.fwCalendar.api();
        api.changeView('timeGridDay'); await wait(200);
        const day = api.formatIso(api.getDate()).slice(0, 10);
        // Validation: empty title → message, no server call.
        window.fwCalendar.newEvent(); await wait(60);
        if (!form()) return ['+ New opened no form'];
        if (document.activeElement !== form().elements.title) out.push('title box not focused on + New');
        form().querySelector('[data-cal-save]').click(); await wait(60);
        if (!/title/i.test(det.querySelector('[data-cal-ferr]').textContent) || calls('calPanelCreateEvent').length) out.push('empty title was not blocked');
        // Create a timed event; double tap Save → one request, one event.
        set('title', 'Test lunch'); set('sd', day); set('ed', day); set('st', '11:00'); set('et', '12:00');
        const save = form().querySelector('[data-cal-save]'); save.click(); save.click();
        form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        if (!await until(() => evEl('Test lunch'))) out.push('created event not shown after save');
        if (calls('calPanelCreateEvent').length !== 1 || byTitle('Test lunch').length !== 1) out.push('double tap made ' + calls('calPanelCreateEvent').length + ' requests / ' + byTitle('Test lunch').length + ' events');
        if (!det.hidden) out.push('form stayed open after a good save');
        if (!/(^|[^\d:])11(:00)?\s?am/i.test((evEl('Test lunch') || {}).textContent || '')) out.push('created event not at 11:00');
        // Lost reply: the server made it, the app saw an error → Retry save with the same opId → still one event.
        window.__calLoseReply = 1;
        window.fwCalendar.newEvent(); await wait(60);
        set('title', 'Lost reply'); set('sd', day); set('ed', day); set('st', '16:00'); set('et', '17:00');
        form().querySelector('[data-cal-save]').click();
        if (!await until(() => /Not saved/.test(det.querySelector('[data-cal-ferr]')?.textContent || ''))) out.push('no save-failure message');
        if (!form() || form().elements.title.value !== 'Lost reply') out.push('failed save lost the typed text');
        const rb = form() && form().querySelector('[data-cal-save]');
        if (!rb || rb.disabled || !/Retry/.test(rb.textContent)) out.push('no Retry save button after failure');
        else { rb.click(); await until(() => det.hidden); }
        await until(() => evEl('Lost reply'));
        if (byTitle('Lost reply').length !== 1) out.push('retry after a lost reply made ' + byTitle('Lost reply').length + ' events');
        // Plain failure → message, nothing created, then success.
        window.__calFailWrite = 1;
        window.fwCalendar.newEvent(); await wait(60);
        set('title', 'Fails first'); set('sd', day); set('ed', day); set('st', '18:00'); set('et', '18:30');
        form().querySelector('[data-cal-save]').click();
        await until(() => /Not saved/.test(det.querySelector('[data-cal-ferr]')?.textContent || ''));
        if (byTitle('Fails first').length) out.push('failed save still created an event');
        window.__calFailWrite = 0; form().querySelector('[data-cal-save]').click();
        await until(() => det.hidden && evEl('Fails first'));
        if (byTitle('Fails first').length !== 1) out.push('save after failure: ' + byTitle('Fails first').length + ' events');
        // Edit: same event id, new title, switched to all-day.
        const id0 = byTitle('Test lunch')[0].eventId;
        const nCreate = calls('calPanelCreateEvent').length;
        evEl('Test lunch').click(); await wait(60);
        const eb = det.querySelector('[data-cal-edit]');
        if (!eb) out.push('no Edit on a main-calendar event');
        else {
          eb.click(); await wait(60);
          if (form().elements.title.value !== 'Test lunch' || form().elements.st.value !== '11:00') out.push('edit form not prefilled');
          set('title', 'Lunch moved'); set('allDay', true);
          if (!form().classList.contains('allday')) out.push('all-day box did not hide the times');
          form().querySelector('[data-cal-save]').click();
          await until(() => det.hidden && evEl('Lunch moved'));
          const e = byTitle('Lunch moved')[0];
          if (!e || e.eventId !== id0) out.push('edit changed the event id (or lost it)');
          else if (!e.allDay || e.start !== day) out.push('edit did not make it an all-day event on ' + day + ': ' + e.start);
          if (!panel.querySelector('.fc-daygrid-event') || ![...panel.querySelectorAll('.fc-daygrid-event')].some(x => /Lunch moved/.test(x.textContent))) out.push('edited all-day event not in the all-day row');
          if (calls('calPanelCreateEvent').length !== nCreate || calls('calPanelUpdateEvent').length !== 1) out.push('edit did not update in place (create calls ' + (calls('calPanelCreateEvent').length - nCreate) + ', updates ' + calls('calPanelUpdateEvent').length + ')');
        }
        // Delete: asks first; Cancel keeps it; Delete removes it.
        evEl('Lunch moved').click(); await wait(60);
        det.querySelector('[data-cal-del]').click(); await wait(60);
        if (!det.querySelector('[data-cal-del-yes]')) out.push('delete did not ask to confirm');
        det.querySelector('[data-cal-detail-close]').click(); await wait(60);
        if (calls('calPanelDeleteEvent').length || !byTitle('Lunch moved').length) out.push('Cancel still deleted');
        evEl('Lunch moved').click(); await wait(60);
        det.querySelector('[data-cal-del]').click(); await wait(60);
        det.querySelector('[data-cal-del-yes]').click();
        await until(() => det.hidden && !evEl('Lunch moved'));
        if (byTitle('Lunch moved').length || evEl('Lunch moved')) out.push('deleted event still there');
        if (calls('calPanelDeleteEvent').length !== 1) out.push('delete sent ' + calls('calPanelDeleteEvent').length + ' requests');
        // Read-only: a repeating event and an Events-calendar event have no Edit / Delete.
        for (const t of ['Standup', 'Gig']) {
          const el = evEl(t); if (!el) { out.push(t + ' not shown'); continue; }
          el.click(); await wait(60);
          if (det.querySelector('[data-cal-edit],[data-cal-del]')) out.push(t + ' is editable but should be read-only');
          if (!/read-only/.test(det.textContent)) out.push(t + ' has no read-only note');
          det.querySelector('[data-cal-detail-close]').click(); await wait(40);
        }
        if (calls('calPanelUpdateEvent').some(c => /^[rg]-/.test(c[1][0].eventId))) out.push('a read-only event was sent for update');
        // Esc closes the form, not the panel.
        window.fwCalendar.newEvent(); await wait(60);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(60);
        if (!det.hidden || !document.body.classList.contains('cal-open')) out.push('Esc on the form did not just close the form');
        // Typing in the form never reaches the workspace's own key shortcuts.
        window.fwCalendar.newEvent(); await wait(60);
        let leaked = 0; const spy = () => leaked++; document.addEventListener('keydown', spy);
        form().elements.title.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        document.removeEventListener('keydown', spy);
        if (leaked) out.push('typing in the form reached the workspace key handlers');
        det.querySelector('[data-cal-detail-close]').click();
        if (Object.values(S.ev).some(e => e.reminders)) out.push('new event has reminders on');
        panel.querySelector('[data-cal-close]').click(); await wait(320);
        return out;
      });
      errs.push(...res2.map(x => 'phase 2: ' + x));
      // Phase 3a (2026-11-08): daily plan — link (never copy) Urgent / Undated / Keep In Mind / events, limits,
      // rank, target, done sync both ways, Schedule = one all-day event, Move to date keeps the id, remove.
      const res3 = await pg.evaluate(async () => {
        const out = [], wait = ms => new Promise(r => setTimeout(r, ms));
        const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(40); } return false; };
        const panel = document.getElementById('calPanel'), det = panel.querySelector('[data-cal-detail]'), S = window.__cal;
        const calls = m => window.__calls.filter(c => c[0] === m);
        const planRow = t => [...panel.querySelectorAll('.cp-pi')].find(x => x.querySelector('.cp-ptt').textContent.includes(t));
        const groupOf = t => { const r = planRow(t); return r && r.closest('[data-plan-group]').dataset.planGroup; };
        const rows = () => S.plan || [];
        const pick = async (text, g) => {
          det.querySelector('[data-plan-act=addgroup][data-g=' + g + ']').click();
          const b = [...det.querySelectorAll('[data-plan-act=pick]')].find(x => x.querySelector('span').textContent === text);
          if (!b) { out.push('+ Add list has no "' + text + '"'); return; }
          b.click(); await until(() => planRow(text)); await wait(60);
        };
        document.querySelector('#toolbar [data-cal-open]').click();
        // Plan is hidden until the toolbar's Plan button opens it (2026-11-08).
        await until(() => panel.querySelector('.fc-cpPlan-button'));
        if (!panel.querySelector('.cp-plan.folded')) out.push('plan not hidden by default');
        panel.querySelector('.fc-cpPlan-button').click(); await wait(60);
        if (!await until(() => panel.querySelector('[data-plan-group=big]'))) return ['plan section never loaded: ' + panel.querySelector('[data-plan-body]').textContent];
        const api = window.fwCalendar.api(); api.changeView('timeGridDay'); api.today(); await wait(300);
        const day = api.formatIso(api.getDate()).slice(0, 10);
        await until(() => calls('getPlan').some(c => c[1][0] === day));
        if (!/Pick up to 3/.test(panel.querySelector('[data-plan-group=big]').textContent)) out.push('empty Big Three has no hint');
        if (panel.querySelector('[data-plan-group=stretch]')) out.push('Stretch is tabled but still shown');
        // + Add lists every source.
        panel.querySelector('[data-plan-act=add]').click(); await wait(80);
        const listText = det.textContent;
        for (const [src, t] of [['Next Steps', 'Pay rent'], ['Undated Tasks', 'Fix bike'], ['Keep In Mind', 'Gloves'], ['Events this day', 'Dentist']])
          if (!listText.includes(src) || !listText.includes(t)) out.push('+ Add misses ' + src + ' / ' + t);
        if (/Bait/.test(listText)) out.push('+ Add lists a finished Keep In Mind item');
        const todayLine = () => [...document.querySelectorAll('#todayScroll .day-editor .check-line')].find(l => l.textContent.trim() === 'Pay rent');
        const nLines = document.querySelectorAll('#todayScroll .day-editor .check-line').length;
        await pick('Pay rent', 'big');
        await pick('Fix bike', 'big');
        await pick('Gloves', 'next');
        await pick('Dentist', 'next');
        det.querySelector('[data-cal-detail-close]').click(); await wait(60);
        const tid = todayLine() && todayLine().dataset.tid;
        if (!tid || !/^m-/.test(tid)) out.push('planned Gantt line got no task id');
        if (document.querySelectorAll('#todayScroll .day-editor .check-line').length !== nLines) out.push('planning copied a line into Today');
        const r1 = rows().find(x => x.ref === 'tid:' + tid);
        if (!r1 || r1.group !== 'big' || r1.date) out.push('Plan row for Pay rent wrong (Big Three is standing, no date): ' + JSON.stringify(r1));
        if (!rows().some(x => x.ref === 'tid:m-a' && x.group === 'next' && !x.date)) out.push('Keep In Mind item not linked by its id in Next Up');
        if (!rows().some(x => /^cal:b-/.test(x.ref) && x.group === 'next')) out.push('event not linked as cal: ref in the Waiting list');
        if (groupOf('Pay rent') !== 'big' || groupOf('Gloves') !== 'next' || groupOf('Dentist') !== 'next') out.push('plan groups drawn wrong');
        // Adding the same task again moves it, never a second row.
        panel.querySelector('[data-plan-act=add]').click(); await wait(60);
        await pick('Gloves', 'backlog');
        det.querySelector('[data-cal-detail-close]').click(); await wait(60);
        if (rows().filter(x => x.ref === 'tid:m-a').length !== 1 || rows().find(x => x.ref === 'tid:m-a').group !== 'backlog') out.push('re-adding made a duplicate or did not move');
        // Big Three holds 3: a 4th is refused without a server call.
        panel.querySelector('[data-plan-act=add]').click(); await wait(60);
        await pick('Book trip', 'big');
        const nSave = calls('planSave').length;
        det.querySelector('[data-plan-act=addgroup][data-g=big]').click();
        const ev4 = [...det.querySelectorAll('[data-plan-act=pick]')].find(x => /Old chore|Standup|All-day A/.test(x.textContent));
        if (ev4) { ev4.click(); await wait(100); }
        det.querySelector('[data-cal-detail-close]').click(); await wait(60);
        if (calls('planSave').length !== nSave || rows().filter(x => x.group === 'big').length !== 3) out.push('Big Three took a 4th item');
        if (!/full/.test(panel.querySelector('[data-plan-body]').textContent)) out.push('no "full" message for a 4th Big Three item');
        // Rank: ▼ on #1 swaps it with #2.
        planRow('Pay rent').querySelector('[data-plan-act=down]').click();
        await until(() => calls('planSave').some(c => c[1][0].type === 'order'));
        await wait(100);
        const order = [...panel.querySelectorAll('[data-plan-group=big] .cp-ptt')].map(x => x.textContent);
        if (!/Fix bike/.test(order[0]) || !/Pay rent/.test(order[1])) out.push('reorder did not swap: ' + order.join(' | '));
        // Target on a Big Three item.
        planRow('Fix bike').querySelector('[data-plan-act=target]').click(); await wait(60);
        det.querySelector('[data-plan-target-in]').value = 'tires pumped';
        det.querySelector('[data-plan-act=tsave]').click();
        await until(() => /🎯 tires pumped/.test(planRow('Fix bike')?.textContent || ''));
        if (!/🎯 tires pumped/.test(planRow('Fix bike')?.textContent || '')) out.push('target not saved / shown');
        // Done from the plan ticks the real Gantt line (and back).
        const cb = planRow('Pay rent').querySelector('[data-plan-done]');
        cb.click(); await wait(200);
        if (!todayLine() || !todayLine().querySelector('input').checked) out.push('plan tick did not tick the Today line');
        todayLine().querySelector('input').click(); await wait(500);
        if (planRow('Pay rent').querySelector('[data-plan-done]').checked) out.push('unticking in Today did not untick the plan row');
        // A Keep In Mind item ticks its item.
        panel.querySelector('[data-plan-act=bkfold]').click(); await wait(60);
        const kb = planRow('Gloves')?.querySelector('[data-plan-done]');
        if (!kb) out.push('Backlog did not open'); else { kb.click(); await wait(150); if (!(window.focusFindItem('m-a') || {}).d) out.push('plan tick did not finish the Keep In Mind item'); }
        // Schedule… a Gantt task → one all-day event, again → moved (same event).
        planRow('Fix bike').querySelector('[data-plan-act=more]').click(); await wait(60);
        det.querySelector('[data-plan-date]').value = day; det.querySelector('[data-plan-act=sched]').click();
        await until(() => det.hidden && /📅/.test(planRow('Fix bike')?.textContent || ''));
        const sch = Object.values(S.ev).filter(e => e.title === 'Fix bike');
        if (sch.length !== 1 || !sch[0].allDay || sch[0].start !== day || !sch[0].tag) out.push('Schedule did not make one tagged all-day event: ' + JSON.stringify(sch));
        const later = luxon.DateTime.fromISO(day).plus({ days: 2 }).toISODate();
        planRow('Fix bike').querySelector('[data-plan-act=more]').click(); await wait(60);
        det.querySelector('[data-plan-date]').value = later; det.querySelector('[data-plan-act=sched]').click();
        await until(() => det.hidden); await wait(200);
        const sch2 = Object.values(S.ev).filter(e => e.title === 'Fix bike');
        if (sch2.length !== 1 || sch2[0].eventId !== sch[0].eventId || sch2[0].start !== later) out.push('rescheduling made a second event or did not move it');
        // Tick an event in the plan → Graphite; Move to date keeps its id.
        const dRow = planRow('Dentist'), did = rows().find(x => /^cal:b-/.test(x.ref)).ref.slice(4);
        dRow.querySelector('[data-plan-done]').click();
        await until(() => calls('setCalendarEventDone').length);
        await wait(150);
        if (S.ev[did].colorId !== '8') out.push('ticking an event in the plan did not make it Graphite');
        planRow('Dentist').querySelector('[data-plan-act=more]').click(); await wait(60);
        det.querySelector('[data-plan-date]').value = later; det.querySelector('[data-plan-act=move]').click();
        await until(() => det.hidden); await wait(200);
        if (!S.ev[did] || S.ev[did].start.slice(0, 10) !== later || !/09:00/.test(S.ev[did].start)) out.push('Move to date lost the event, its id or its time: ' + JSON.stringify(S.ev[did]));
        // Remove from plan → row gone, task untouched.
        planRow('Fix bike').querySelector('[data-plan-act=more]').click(); await wait(60);
        det.querySelector('[data-plan-act=remove]').click(); await until(() => !planRow('Fix bike'));
        if (rows().some(x => x.ref === 'tid:' + (backlogCell()?.querySelector('.check-line')?.dataset.tid || 'x'))) out.push('remove left the row');
        if (!backlogCell() || !/Fix bike/.test(backlogCell().textContent)) out.push('remove touched the task itself');
        // Fold persists; nothing on the calendar was created besides the Schedule event.
        panel.querySelector('[data-plan-act=fold]').click(); await wait(60);
        if (!panel.querySelector('.cp-plan.folded') || panel.querySelector('.cp-pi')) out.push('plan did not fold');
        panel.querySelector('[data-plan-act=fold]').click(); await wait(60);
        if (calls('calPanelCreateEvent').length > 5) out.push('planning created calendar events through the event form');
        panel.querySelector('[data-cal-close]').click(); await wait(320);
        return out;
      });
      errs.push(...res3.map(x => 'phase 3a: ' + x));
      // Phase 3b (2026-11-08): real gestures — mouse on desktop, touch (hold 400 ms, then drag) on the phone.
      // Move in place (same id), resize, timed ↔ all-day, Graphite / repeating / Events locked, failed save snaps
      // back, plan rows dropped on the timeline (task length or 30 min; one event per task, moved on a second drop).
      {
        const out = [], phone = !!view.isMobile, cdp = phone ? await ctx.newCDPSession(pg) : null;
        const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })) });
        const gesture = async (a, b, hold = phone ? 600 : 0) => {
          const steps = 14;
          if (phone) {
            await touch('touchStart', [a]); await pg.waitForTimeout(hold);
            for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }]); await pg.waitForTimeout(25); }
            await pg.waitForTimeout(80); await touch('touchEnd', []);
          } else {
            await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.waitForTimeout(hold || 30);
            for (let i = 1; i <= steps; i++) { await pg.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await pg.waitForTimeout(20); }
            await pg.waitForTimeout(60); await pg.mouse.up();
          }
          await pg.waitForTimeout(400);
        };
        const ev = (k) => pg.evaluate(k => { const e = window.__cal.ev[k]; return e ? Object.assign({}, e) : null; }, k);
        const calls = m => pg.evaluate(m => window.__calls.filter(c => c[0] === m).length, m);
        const waitIdle = () => pg.waitForFunction(() => !/Saving/.test(document.querySelector('#calPanel [data-cal-state]').textContent), null, { timeout: 4000 }).catch(() => {});
        // Point helpers (viewport coordinates). Slots / events are scrolled into the middle first.
        const slotPt = (d, t) => pg.evaluate(([d, t]) => {
          const lane = document.querySelector('#calPanel .fc-timegrid-slot-lane[data-time="' + t + ':00"]'), col = document.querySelector('#calPanel .fc-timegrid-col[data-date="' + d + '"]');
          if (!lane || !col) return null;
          const l = lane.getBoundingClientRect(), c = col.getBoundingClientRect(); return { x: c.left + c.width / 2, y: l.top + 4 };
        }, [d, t]);
        const allDayPt = d => pg.evaluate(d => { const c = document.querySelector('#calPanel .fc-daygrid-body .fc-daygrid-day[data-date="' + d + '"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 }; }, d);
        const evPt = (title, where = 'top') => pg.evaluate(([t, w]) => {
          const el = [...document.querySelectorAll('#calPanel .fc-event:not(.fc-event-mirror)')].find(x => x.textContent.includes(t)); if (!el) return null;
          if (w === 'middle') { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
          if (w === 'resizer') { const z = el.querySelector('.fc-event-resizer-end'); if (!z) return null; const r = z.getBoundingClientRect(); return r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }
          const r = el.getBoundingClientRect(); return { x: r.left + Math.min(30, r.width / 2), y: r.top + Math.min(8, r.height / 3), drag: el.classList.contains('fc-event-draggable') };
        }, [title, where]);
        // Scroll the timeline so time t sits in the middle (all positions are read after this, never mid-scroll).
        const center = t => pg.evaluate(t => { const lane = document.querySelector('#calPanel .fc-timegrid-slot-lane[data-time="' + t + ':00"]'); if (!lane) return; const sc = lane.closest('.fc-scroller'), r = sc.getBoundingClientRect(); sc.scrollTop += lane.getBoundingClientRect().top - r.top - r.height / 2; }, t).then(() => pg.waitForTimeout(120));
        const setup = await pg.evaluate(async () => {
          const wait = ms => new Promise(r => setTimeout(r, ms));
          document.querySelector('#toolbar [data-cal-open]').click(); await wait(400);
          const api = window.fwCalendar.api(); api.changeView('timeGridDay'); api.today(); api.incrementDate({ days: 5 });
          for (let i = 0; i < 60 && !document.querySelector('#calPanel .fc-timegrid-event'); i++) await wait(50);
          await wait(300);
          // Fold the plan so the timeline has room for the event tests (it's unfolded again for the plan-row drops).
          const plan = document.querySelector('#calPanel .cp-plan'); if (plan && !plan.classList.contains('folded')) document.querySelector('#calPanel [data-plan-act=fold]').click();
          await wait(200); api.updateSize(); await wait(100);
          return api.formatIso(api.getDate()).slice(0, 10);
        });
        const day = setup;
        // Locked: done (Graphite), repeating, Events calendar are not draggable; editable ones are.
        for (const [t, want] of [['Dentist', true], ['Old chore', false], ['Standup', false], ['Gig', false], ['All-day A', true]]) {
          const p = await evPt(t); if (!p) { out.push(t + ' not on the calendar'); continue; }
          if (p.drag !== want) out.push(t + (want ? ' is not draggable' : ' is draggable but should be locked'));
        }
        // Move: Dentist 9:00 → 10:30, same id, 1 hour kept.
        await center('10:00');
        let a = await evPt('Dentist'), b = await slotPt(day, '10:30');
        if (a && b) {
          await gesture(a, { x: b.x, y: b.y + 2 }); await waitIdle(); await pg.waitForTimeout(200);
          const e = await ev('b-' + day);
          if (!e || !/T10:30/.test(e.start) || !/T11:30/.test(e.end) || e.allDay) out.push('drag did not move Dentist to 10:30–11:30 in place: ' + JSON.stringify(e && [e.start, e.end]));
          if (await calls('calPanelCreateEvent') > 5 || await calls('calPanelDeleteEvent') > 1) out.push('a move created or deleted events');
        } else out.push('could not find Dentist or the 10:30 slot');
        // Resize: bottom edge 11:30 → 12:30 (touch: hold first to select the event, then drag the handle).
        await center('11:00');
        if (phone) { const p = await evPt('Dentist', 'middle'); await touch('touchStart', [p]); await pg.waitForTimeout(600);
          await touch('touchEnd', [p]); await pg.waitForTimeout(300); await pg.evaluate(() => { const d = document.querySelector('#calPanel [data-cal-detail]'); if (!d.hidden) d.querySelector('[data-cal-detail-close]').click(); }); await pg.waitForTimeout(100); }
        else { const p = await evPt('Dentist'); await pg.mouse.move(p.x, p.y + 10); await pg.waitForTimeout(150); }
        const rz = await evPt('Dentist', 'resizer'), s1 = await slotPt(day, '11:30'), s2 = await slotPt(day, '12:00');
        if (!rz || !s1) out.push('no resize handle on Dentist');
        else {
          await gesture(rz, { x: rz.x, y: rz.y + 2 * (s2.y - s1.y) }, phone ? 60 : 0); await waitIdle(); await pg.waitForTimeout(200);
          const e = await ev('b-' + day);
          if (!e || !/T10:30/.test(e.start) || !/T12:30/.test(e.end)) out.push('resize did not end Dentist at 12:30: ' + JSON.stringify(e && [e.start, e.end]));
        }
        // Timed → all-day row.
        await center('11:00');
        a = await evPt('Dentist'); b = await allDayPt(day);
        if (a && b) { await gesture(a, b); await waitIdle(); await pg.waitForTimeout(200);
          const e = await ev('b-' + day); if (!e || !e.allDay || e.start !== day) out.push('timed → all-day failed: ' + JSON.stringify(e && [e.allDay, e.start, e.end])); }
        // All-day → 9:00 slot (gets 15 min).
        await center('09:00');
        a = await evPt('All-day A'); b = await slotPt(day, '09:00');
        if (a && b) { await gesture(a, { x: b.x, y: b.y + 2 }); await waitIdle(); await pg.waitForTimeout(200);
          const e = await ev('a-' + day); if (!e || e.allDay || !/T09:00/.test(e.start) || !/T09:15/.test(e.end)) out.push('all-day → 9:00–9:15 timed failed: ' + JSON.stringify(e && [e.allDay, e.start, e.end])); }
        // Done (Graphite) can't be dragged: nothing sent, nothing changed.
        const nMove = await calls('calPanelMoveEvent'), chore0 = await ev('c-' + day);
        await center('14:30');
        a = await evPt('Old chore'); b = await slotPt(day, '16:00');
        if (a && b) { await gesture(a, b); await pg.waitForTimeout(200);
          const e = await ev('c-' + day); if (await calls('calPanelMoveEvent') !== nMove || !e || e.start !== chore0.start) out.push('a done (Graphite) event moved'); }
        // Failed save: the event snaps back and a message shows.
        // A long touch on the locked event above can open its details instead of dragging it.
        // Close that overlay before targeting the next event, and prove a write was attempted.
        await pg.evaluate(() => { const detail=document.querySelector('#calPanel [data-cal-detail]');if(!detail.hidden)detail.querySelector('[data-cal-detail-close]').click(); });
        await pg.waitForTimeout(100);
        await pg.evaluate(() => { window.__calFailWrite = 1; });
        await center('10:00');
        a = await evPt('All-day A'); b = await slotPt(day, '11:00');
        if (a && b) { const attempts=await calls('calPanelMoveEvent');await gesture(a, { x: b.x, y: b.y + 2 });
          if(await calls('calPanelMoveEvent')===attempts)out.push('failed-move gesture sent no write');
          await pg.waitForFunction(() => /put it back/.test(document.querySelector('#calPanel [data-cal-state]').textContent), null, { timeout: 4000 }).catch(() => out.push('no "put it back" message after a failed move'));
          const e = await ev('a-' + day); if (!/T09:00/.test(e.start)) out.push('failed move changed the event');
          const shown = await pg.evaluate(() => { const el = [...document.querySelectorAll('#calPanel .fc-timegrid-event:not(.fc-event-mirror)')].find(x => /All-day A/.test(x.textContent)); return el ? el.textContent : ''; });
          if (!/(^|[^\d:])9(:00)?\s?am/i.test(shown)) out.push('failed move did not snap back on screen: ' + shown); }
        await pg.evaluate(() => { window.__calFailWrite = 0; });
        await pg.waitForTimeout(5300);
        // Plan rows → timeline: unfold, add a Gantt task to Big Three, drop it on 14:00 → one 30-min event; then onto
        // the all-day row → the same event, now all-day.
        const added = await pg.evaluate(async () => {
          const wait = ms => new Promise(r => setTimeout(r, ms)), panel = document.getElementById('calPanel'), det = panel.querySelector('[data-cal-detail]');
          if (panel.querySelector('.cp-plan.folded')) panel.querySelector('[data-plan-act=fold]').click();
          await wait(300); panel.querySelector('[data-plan-act=add]').click(); await wait(100);
          det.querySelector('[data-plan-act=addgroup][data-g=big]').click();
          const b = [...det.querySelectorAll('[data-plan-act=pick]')].find(x => x.querySelector('span').textContent === 'Book trip'); if (!b) return 'no Book trip in + Add';
          b.click(); for (let i = 0; i < 60 && !document.querySelector('#calPanel .cp-pi[data-plan-drag]'); i++) await wait(50);
          det.querySelector('[data-cal-detail-close]').click(); await wait(100); window.fwCalendar.api().updateSize(); await wait(150);
          return [...panel.querySelectorAll('.cp-pi[data-plan-drag]')].some(x => /Book trip/.test(x.textContent)) ? '' : 'Book trip row is not draggable';
        });
        if (added) out.push(added);
        else {
          const rowPt = () => pg.evaluate(() => { const row = [...document.querySelectorAll('#calPanel .cp-pi[data-plan-drag]')].find(x => /Book trip/.test(x.textContent)), el = row && row.querySelector('.cp-ptt'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; });
          const before = await calls('planSchedule');
          a = await rowPt(); await center('14:00'); b = await slotPt(day, '14:00'); a = await rowPt();
          if (!a || !b) out.push('plan row or 14:00 slot not reachable');
          else {
            await gesture(a, { x: b.x, y: b.y + 2 }); await waitIdle(); await pg.waitForTimeout(300);
            const made = await pg.evaluate(() => Object.values(window.__cal.ev).filter(e => e.title === 'Book trip'));
            if (await calls('planSchedule') !== before + 1) out.push('dropping a plan row sent ' + (await calls('planSchedule') - before) + ' schedule calls');
            if (made.length !== 1 || made[0].allDay || !/T14:00/.test(made[0].start) || !/T14:30/.test(made[0].end) || made[0].reminders) out.push('plan drop did not make one 14:00–14:30 event (reminders off): ' + JSON.stringify(made.map(e => [e.start, e.end])));
            const id0 = made[0] && made[0].eventId;
            a = await rowPt(); b = await allDayPt(day);
            if (a && b) { await gesture(a, b); await waitIdle(); await pg.waitForTimeout(300);
              const m2 = await pg.evaluate(() => Object.values(window.__cal.ev).filter(e => e.title === 'Book trip'));
              if (m2.length !== 1 || m2[0].eventId !== id0 || !m2[0].allDay) out.push('second drop made a duplicate or did not move it to all-day: ' + JSON.stringify(m2.map(e => [e.eventId, e.allDay, e.start])));
              const link = await pg.evaluate(() => (window.__cal.plan.find(x => /Book trip/.test(x.title) && x.event) || {}).event || '');
              if (!m2[0] || link !== m2[0].eventId + '@' + m2[0].startMs) out.push('plan row link not updated after the move: ' + link); }
            // A failed drop says so and creates nothing.
            await pg.evaluate(() => { window.__calFailWrite = 1; });
            const n0 = await pg.evaluate(() => Object.keys(window.__cal.ev).length);
            await center('16:00'); a = await rowPt(); b = await slotPt(day, '16:00');
            if (a && b) { await gesture(a, { x: b.x, y: b.y + 2 });
              await pg.waitForFunction(() => /nothing changed/.test(document.querySelector('#calPanel [data-cal-state]').textContent), null, { timeout: 4000 }).catch(() => out.push('no message after a failed plan drop'));
              if (await pg.evaluate(() => Object.keys(window.__cal.ev).length) !== n0) out.push('failed plan drop changed events'); }
            await pg.evaluate(() => { window.__calFailWrite = 0; });
          }
        }
        if (await pg.evaluate(() => document.querySelectorAll('#calPanel .fc-event-mirror').length)) out.push('a drag mirror was left behind');
        await pg.evaluate(() => document.querySelector('#calPanel [data-cal-close]').click()); await pg.waitForTimeout(320);
        errs.push(...out.map(x => 'phase 3b: ' + x));
      }
      const shot = process.argv.indexOf('--shot');
      // Big Three strip (2026-11-08): standing list at the top of Today; hold-menu add, ★ on a card, bubble-up confirm.
      const res4 = await pg.evaluate(async () => {
        const out = [], wait = ms => new Promise(r => setTimeout(r, ms));
        const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(50); } return false; };
        const S = window.__cal, strip = document.getElementById('b3Strip'), rows = () => (S.plan || []);
        if (!window.fwBig) return ['no Big Three strip API'];
        window.fwBig.load();
        if (!await until(() => !strip.hidden)) return ['strip never showed'];
        const big = rows().filter(x => x.group === 'big');
        if (strip.querySelectorAll('.b3-r').length !== big.length) out.push('strip rows ' + strip.querySelectorAll('.b3-r').length + ' ≠ Big Three rows ' + big.length);
        if (strip.closest('#todayPane') == null || strip.nextElementSibling.id !== 'todayScroll') out.push('strip not at the top of Today');
        // Clear the Big Three, then add through the hold menu (right-click a task's checkbox).
        for (const x of big) { window.fwBig.remove(x.ref); await until(() => !rows().some(y => y.id === x.id)); await wait(30); }
        const line = [...document.querySelectorAll('#todayScroll .day-editor .check-line')].find(l => l.textContent.trim() === 'Walk dog');
        if (!line) return out.concat('no Walk dog line');
        line.querySelector('input').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
        await wait(80);
        const b3 = [...document.querySelectorAll('.urg-picker .urg-b3row button')].find(b => /Big Three/.test(b.textContent));
        if (!b3) return out.concat('hold menu has no ★ Big Three');
        b3.click();
        if (!await until(() => line.dataset.tid && rows().some(x => x.ref === 'tid:' + line.dataset.tid && x.group === 'big' && !x.date))) out.push('hold menu did not add a standing Big Three row');
        await until(() => [...strip.querySelectorAll('.b3-t')].some(t => t.textContent === 'Walk dog'));
        if (document.querySelectorAll('#todayScroll .check-line').length && [...document.querySelectorAll('#todayScroll .check-line')].filter(l => l.textContent.trim() === 'Walk dog').length !== 1) out.push('adding copied the task');
        // ★ on a Reference card → project row.
        const card = [...document.querySelectorAll('#referenceTree .ref-cell-wrapper')].find(w => /Undated Tasks/.test(w.textContent));
        card.querySelector(':scope > [data-b3]').click();
        if (!await until(() => rows().some(x => x.ref === 'card:r-und' && x.group === 'big'))) out.push('★ on a card did not add a project');
        await until(() => strip.textContent.includes('📁'));
        // Waiting list + bubble up: tick Walk dog in the strip → "Move up" → ✓ moves the waiting item into the slot.
        const wl = rows().filter(x => x.group === 'next').sort((a, b) => a.rank - b.rank)[0];
        if (!wl) out.push('no waiting item to move up');
        const cb = [...strip.querySelectorAll('.b3-r')].find(r => /Walk dog/.test(r.textContent))?.querySelector('[data-b3-done]');
        if (!cb) return out.concat('strip task has no checkbox');
        cb.click();
        if (!line.querySelector('input').checked) out.push('strip tick did not tick the real task');
        if (wl) {
          if (!await until(() => strip.querySelector('.b3-up'))) out.push('no move-up suggestion after finishing a Big Three task');
          else {
            strip.querySelector('[data-b3-act=up]').click();
            if (!await until(() => rows().some(x => x.id === wl.id && x.group === 'big') && !rows().some(x => x.ref === 'tid:' + line.dataset.tid))) out.push('move up did not swap: ' + JSON.stringify(rows()));
          }
        }
        if (strip.getBoundingClientRect().height > 140) out.push('strip too tall: ' + strip.getBoundingClientRect().height);
        return out;
      });
      errs.push(...res4.map(x => 'Big Three strip: ' + x));
      // Resizable calendar (2026-11-08): drag the left edge → narrower, saved, restored after reload (desktop + phone).
      {
        await pg.evaluate(() => window.fwCalendar.open()); await pg.waitForTimeout(400);
        const g = await pg.evaluate(() => { const r = document.querySelector('#calPanel [data-cal-resize]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: document.getElementById('calPanel').getBoundingClientRect().width }; });
        await pg.mouse.move(g.x, g.y); await pg.mouse.down(); await pg.mouse.move(g.x + 200, g.y, { steps: 6 }); await pg.mouse.up();
        const w1 = await pg.evaluate(() => document.getElementById('calPanel').getBoundingClientRect().width);
        if (Math.abs(w1 - Math.max(280, g.w - 200)) > 12) errs.push('resize: drag did not narrow the calendar (' + g.w + ' → ' + w1 + ')');
        await pg.reload(); await pg.waitForTimeout(2500);
        await pg.evaluate(() => window.fwCalendar.open()); await pg.waitForTimeout(400);
        const w2 = await pg.evaluate(() => document.getElementById('calPanel').getBoundingClientRect().width);
        if (Math.abs(w2 - w1) > 3) errs.push('resize: width not restored after reload (' + w1 + ' → ' + w2 + ')');
      }
      // Docked calendar (2026-11-13, Julius): with the pop-out closed, the same calendar sits in the right column
      // (Day view); Backlog opens as a column left of it and slides the app left (columns) / the left half (phone).
      {
        const dk = await pg.evaluate(async phone => {
          const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
          window.fwCalendar.close(); await wait(900);
          if (window.fwCeRedraw) window.fwCeRedraw(); await wait(600);
          const panel = document.getElementById('calPanel');
          if (!panel.closest('#calPane .ce-dock')) return ['calendar not docked in the right column: ' + (panel.parentElement && (panel.parentElement.id || panel.parentElement.className))];
          if (!panel.classList.contains('cp-docked')) out.push('no docked look');
          if (window.fwCalendar.api().view.type !== 'timeGridDay') out.push('docked view is not Day: ' + window.fwCalendar.api().view.type);
          if (document.querySelector('#centerCalendarList .ce-day')) out.push('old mini timeline still drawn');
          const ws = document.getElementById('workspace'), single = phone || ws.classList.contains('view-single');
          const btn = panel.querySelector('.fc-cpBacklog-button') || panel.querySelector('[data-bl-toggle]');
          btn.click(); await wait(400);
          const bl = document.querySelector('[data-cal-bl]');
          if (!single) {
            if (!bl.closest('#blCol')) out.push('backlog not in its own column');
            const bc = document.getElementById('blCol').getBoundingClientRect(), cp = document.getElementById('calPane').getBoundingClientRect();
            if (bc.width < 100) out.push('backlog column too narrow: ' + bc.width);
            if (Math.abs(bc.right - cp.left) > 3) out.push('backlog not just left of the calendar');
            if (Math.abs(cp.right - innerWidth) > 3) out.push('calendar column not at the right edge: ' + cp.right + ' / ' + innerWidth);
            if (ws.scrollLeft < 50) out.push('app did not slide left: ' + ws.scrollLeft);
          } else if (!bl.closest('#calBlLeft') || !document.body.classList.contains('bl-left')) out.push('phone backlog not on the left');
          // Close: everything slides back.
          (panel.querySelector('.fc-cpBacklog-button') || bl.querySelector('[data-bl-close]') || panel.querySelector('[data-bl-toggle]')).click(); await wait(400);
          if (document.body.classList.contains('bl-push') || document.body.classList.contains('bl-left')) out.push('backlog did not close');
          if (!single && ws.scrollLeft > 2) out.push('app did not slide back: ' + ws.scrollLeft);
          // Pop-out takes it back and closing re-docks.
          window.fwCalendar.open(); await wait(350);
          if (panel.closest('#calPane')) out.push('pop-out still inside the column');
          window.fwCalendar.close(); await wait(900);
          if (!panel.closest('#calPane')) out.push('did not go back into the column');
          return out;
        }, name === 'phone');
        errs.push(...dk.map(x => 'docked calendar: ' + x));
      }

      if (shot > 0) { await pg.click('#toolbar [data-cal-open]'); await pg.waitForTimeout(900); await pg.screenshot({ path: process.argv[shot + 1].replace(/(\.png)?$/, '-calendar-' + name + '.png') }); }
      if (errs.length) { fails += errs.length; console.error('✗ calendar ' + name + ':\n  ' + errs.join('\n  ')); }
      else console.log('✓ calendar ' + name + ': view (1) + create / edit / delete (2) + daily plan, schedule, move, done sync (3a) + drag / resize / plan drops (3b)');
      await ctx.close();
    }
  }
}
await b.close();
process.exit(fails ? 1 : 0);

