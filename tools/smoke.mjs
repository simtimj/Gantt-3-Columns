// Smoke test (2026-11-04): loads Index.html in headless Chromium with a stubbed google.script.run and
// sample data, then reports page errors. Run: node tools/smoke.mjs [--shot out.png]. Needs playwright
// (preinstalled in Claude cloud sessions). Writes the built page to /tmp, never into the repo.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { readIndexHtml } from './index-html.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
// Pacific dates, like Code.gs (2026-11-21: UTC dates broke the phone calendar checks every evening after 4 pm PT).
const laDate = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(ms));
const today = laDate(Date.now());
const yday = laDate(Date.now() - 864e5);
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
// Fast start (2026-11-05): the page loads without imports, then the first sync returns the changed cells to merge in
// (speed plan E 2026-11-23: getSyncState with inbox:true; the imports themselves run on the server's timed trigger).
data.timing = { fast: true, total: 1, steps: {} };
const imported = { build: 'smoke', ref: {}, inbox: [], days: { [today]: { th: 'h-imported', jh: '',
  tasks: data.days[1].tasks + '<div class="check-line" data-level="0" data-at="09:30"><input type="checkbox"><span class="check-text">From import</span></div>' } } };
const stub = `<script>window.google={script:{run:new Proxy({},{get(t,k){let ok=null;const p=new Proxy({},{get(_,m){
  if(m==='withSuccessHandler')return f=>{ok=f;return p;}; if(m==='withFailureHandler'||m==='withUserObject')return()=>p;
  return(...a)=>{(window.__calls=window.__calls||[]).push([m,a]);const ans=(m,a)=>(m==='getWorkspaceData'?${JSON.stringify(data)}:m==='runImports'||m==='getSyncState'?${JSON.stringify(imported)}:m==='getFocus'?${JSON.stringify(focus)}:m==='getKim'?{html:'',h:'k0',fresh:true}:m==='saveKim'?{h:'k1'}:m==='getMainCalendarEvents'?{date:a[0],events:[{id:'e1',calId:'c',start:0,title:'Sample event',allDay:true,done:false}]}:null);return setTimeout(()=>ok&&ok(m==='batchCalls'?a[0].map(c=>({ok:true,r:ans(c[0],c[1])})):ans(m,a)),m==='getWorkspaceData'?(+localStorage.getItem('smokeWsd')||10):10);};}});return p[k];}})}};</script>`;
let html = readIndexHtml()
  .replace("<?!= HtmlService.createHtmlOutputFromFile('WeekdayIcons').getContent() ?>", fs.readFileSync('WeekdayIcons.html', 'utf8'))
  .replace("<?!= HtmlService.createHtmlOutputFromFile('Drafts').getContent() ?>", fs.readFileSync('Drafts.html', 'utf8'))
  // Instant screen (2026-11-21): like the live doGet, the page comes without data and asks getWorkspaceData itself.
  .replace('<?!= initialData ?>', 'null').replace(/<\?= appUrl \?>/g, '#').replace('<?= build ?>', 'smoke')
  .replace('<head>', '<head>' + stub);
const out = path.join(os.tmpdir(), 'gantt-smoke.html');
fs.writeFileSync(out, html);
// SMOKE_ONLY=main|snap|tracker|calendar runs just that part (2026-11-08); unset = everything.
const only = part => !process.env.SMOKE_ONLY || process.env.SMOKE_ONLY.split(',').includes(part);
const b = await chromium.launch(process.env.SMOKE_CHROME ? { executablePath: process.env.SMOKE_CHROME } : {});
let fails = 0;
for (const [name, view] of (only('main') ? [['desktop', { width: 1300, height: 900 }], ['phone', { width: 412, height: 915, isMobile: true, hasTouch: true }]] : [])) {
  const pg = await (await b.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch, timezoneId: 'America/Los_Angeles' })).newPage(); // Julius's browser clock
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message + (process.env.STK ? ' @ ' + (e.stack || '').split('\n').slice(1,4).join(' | ') : '')));
  await pg.goto('file://' + out);
  await pg.waitForTimeout(2000);
  const shot = process.argv.indexOf('--shot');
  if (shot > 0) await pg.screenshot({ path: process.argv[shot + 1].replace(/(\.png)?$/, '-' + name + '.png') });
  // Fast start: the imported line is merged into the open page (no reload), after the load's own save if needed.
  await pg.waitForTimeout(2600);
  const merged = await pg.evaluate(() => [...document.querySelectorAll('#todayScroll .day-editor .check-text')].some(x => x.textContent === 'From import')
    && (window.__calls || []).some(c => c[0] === 'getSyncState' && c[1][0] && c[1][0].inbox === true));
  if (!merged) errs.push('Fast start: the first sync (getSyncState + inbox, speed plan E) line did not merge into the page');
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
      // Drag the ◀ tab: opens the drawer (2026-11-21: locked size — full width on the phone, no dimming).
      const tab = document.getElementById('rdTab'), pe = (type, x) => tab.dispatchEvent(new PointerEvent(type, {bubbles:true, cancelable:true, pointerId:7, pointerType:'touch', clientX:x, clientY:y, isPrimary:true}));
      pe('pointerdown', W - 10); for (const x of [W - 40, W - 150, W - 250]) { pe('pointermove', x); await wait(16); } pe('pointerup', W - 250); tab.click(); await wait(300);
      const dw = Math.round(document.getElementById('referencePane').getBoundingClientRect().width), fw = Math.round(document.getElementById('workspace').getBoundingClientRect().width);
      if (!fwRefDrawer.isOpen()) out.push('dragging the tab did not open the drawer');
      if (Math.abs(dw - fw) > 2) out.push('phone drawer width ' + dw + ', wanted the full frame ' + fw); // workspace shell: drawer = whole frame
      if (getComputedStyle(document.getElementById('rdBackdrop')).display !== 'none') out.push('page behind the drawer is dimmed');
      fwRefDrawer.close(); await wait(250);
      return out;
    });
    swipe.forEach(m => errs.push('Drawer swipe: ' + m));
  }
  // Reference = right half (2026-11-21, Julius): desktop drawer is exactly half the screen, nothing dimmed.
  if (!view.hasTouch) {
    const half = await pg.evaluate(async () => { fwRefDrawer.open(); await new Promise(r => setTimeout(r, 300));
      const r = document.getElementById('referencePane').getBoundingClientRect(), f = document.getElementById('workspace').getBoundingClientRect(), out = [];
      if (Math.abs(r.width - f.width / 2) > 2 || Math.abs(r.right - f.right) > 2) // workspace shell: right half of the frame out.push('drawer not the right half (' + Math.round(r.left) + '–' + Math.round(r.right) + ')');
      if (getComputedStyle(document.getElementById('rdBackdrop')).display !== 'none') out.push('page behind the drawer is dimmed');
      const el = document.elementFromPoint(innerWidth / 4, innerHeight / 2); if (!el || el.id === 'rdBackdrop') out.push('left half not usable while open');
      fwRefDrawer.close(); await new Promise(r => setTimeout(r, 250)); return out; });
    half.forEach(m => errs.push('Reference half: ' + m));
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
  // Keep In Mind title with every task deleted shows 0/0; Delete section removes title + lines (2026-11-15, Julius).
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      document.querySelector('[data-ctab="focus"]').click(); await wait(400);
      const ed = document.querySelector('#kimScroll .kim-editor'); if (!ed) return ['no Keep In Mind editor'];
      const L = (t, lv, tl) => '<div class="check-line" data-level="' + lv + '"' + (tl ? ' data-tl="1"' : '') + '><input type="checkbox"><span class="check-text">' + t + '</span></div>';
      ed.insertAdjacentHTML('beforeend', L('Empty title Q', 0, true));
      refreshCards(ed); await wait(200);
      const t = [...ed.querySelectorAll('.check-line')].find(l => /Empty title Q/.test(l.textContent));
      if (t.dataset.tlcnt !== '0/0 ✓') out.push('empty title count: ' + t.dataset.tlcnt);
      // Titleized checkbox line: the count sits on the title row, not under it (2026-11-16, Julius).
      { const u = [...ed.querySelectorAll('.check-line:not([data-tlon])')].find(l => l.offsetHeight); if (u && t.offsetHeight > u.offsetHeight + 6) out.push('title count wrapped under the title (' + t.offsetHeight + ' vs ' + u.offsetHeight + 'px)'); }
      t.insertAdjacentHTML('afterend', L('Under Q', 1)); refreshCards(ed); await wait(200);
      const n0 = ed.querySelectorAll('.check-line').length;
      // Run the same removal the 🗑 Delete section button does.
      const cov = titleCovered(t); captureBeforeEdit(ed); cov.forEach(x => x.remove()); t.remove(); finishEditorEdit(ed);
      if (ed.querySelectorAll('.check-line').length !== n0 - 2) out.push('delete section did not remove title + its line');
      document.querySelector('[data-ctab="notes"]').click(); await wait(200);
      return out; });
    k.forEach(x => errs.push('Keep In Mind section: ' + x));
  }
  // Nested title lines + per-title folded look (2026-11-15, Julius).
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      document.querySelector('[data-ctab="focus"]').click(); await wait(400);
      const ed = document.querySelector('#kimScroll .kim-editor'); if (!ed) return ['no Keep In Mind editor'];
      const L = (t, lv, tl, done) => '<div class="check-line' + (done ? ' done' : '') + '" data-level="' + lv + '"' + (tl ? ' data-tl="1"' : '') + '><input type="checkbox"' + (done ? ' checked' : '') + '><span class="check-text">' + t + '</span></div>';
      ed.insertAdjacentHTML('beforeend', '<div><br></div>' + L('Crab trip', 0, true) + L('Due day of trip', 1, true) + L('Check gear', 2) + L('Pack bait', 2, false, true) + L('Book boat', 1) + '<div><br></div>' + L('After gap', 0));
      refreshCards(ed); await wait(200);
      const f = t => [...ed.querySelectorAll('.check-line')].find(l => l.textContent.trim() === t);
      const names = a => a.map(x => x.textContent.trim()).join(',');
      const outer = f('Crab trip'), inner = f('Due day of trip');
      if (names(titleCovered(inner)) !== 'Check gear,Pack bait') out.push('inner covers: ' + names(titleCovered(inner)));
      if (names(titleCovered(outer)) !== 'Due day of trip,Check gear,Pack bait,Book boat') out.push('outer covers: ' + names(titleCovered(outer)));
      toggleTitleFold(inner, ed); refreshTitleLines(ed);
      if (!f('Check gear').hasAttribute('data-tlhid') || f('Book boat').hasAttribute('data-tlhid') || inner.hasAttribute('data-tlhid')) out.push('inner fold hid the wrong lines');
      if (inner.hasAttribute('data-tlsum')) out.push('Hidden look still shows a list');
      toggleTitleFold(outer, ed); refreshTitleLines(ed);
      if (!['Due day of trip', 'Check gear', 'Book boat'].every(t => f(t).hasAttribute('data-tlhid')) || f('After gap').hasAttribute('data-tlhid')) out.push('outer fold hid the wrong lines');
      setTitleMode(outer, ed, 'c'); refreshTitleLines(ed);
      const sum = outer.dataset.tlsum || '';
      if (outer.dataset.tlmode !== 'c' || !/▸ Due day of trip/.test(sum) || !/✓ Pack bait/.test(sum) || !/○ Book boat/.test(sum)) out.push('Compact list: ' + JSON.stringify(sum));
      const saved = cardCleanHtml(ed);
      if (!/data-tlmode="c"[^>]*>[\s\S]{0,80}Crab trip|Crab trip/.test(saved) || !/data-tlmode="c"/.test(saved)) out.push('look not saved with the title');
      if (/data-tlsum/.test(saved)) out.push('render-only list leaked into the saved cell');
      const gaps = [outer.previousElementSibling, f('After gap').previousElementSibling]; // the two blank lines added above
      captureBeforeEdit(ed); [outer, ...titleCovered(outer), f('After gap'), ...gaps].forEach(x => x.remove()); finishEditorEdit(ed);
      document.querySelector('[data-ctab="notes"]').click(); await wait(200);
      return out; });
    k.forEach(x => errs.push('Nested titles: ' + x));
  }
  // Insert line above / below (2026-11-21, Julius): hold menu → empty line above the first line / below the last one,
  // cursor in it; below a title = right under it, unfolded, at its lines' indent.
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      document.querySelector('[data-ctab="focus"]').click(); await wait(400);
      const ed = document.querySelector('#kimScroll .kim-editor'); if (!ed) return ['no Keep In Mind editor'];
      const L = (t, lv, tl) => '<div class="check-line" data-level="' + lv + '"' + (tl ? ' data-tl="1"' : '') + (lv ? ' style="margin-left: ' + 24 * lv + 'px;"' : '') + '><input type="checkbox"><span class="check-text">' + t + '</span></div>';
      ed.insertAdjacentHTML('beforeend', '<div><br></div>' + L('Ins title', 0, true) + L('Ins child', 1));
      refreshCards(ed); await wait(150);
      const f = t => [...ed.querySelectorAll('.check-line')].find(l => l.textContent.trim() === t);
      const menu = async (line, act) => { const tx = line.querySelector('.check-text') || line, r = document.createRange(); r.setStart(tx.firstChild || tx, 0); r.collapse(true);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); ed.focus(); rememberSelection(ed);
        showContextMenu(ed, 50, 50, false); const b = document.querySelector('#contextMenu [data-ctx="' + act + '"]'); if (!b) return false; b.click(); await wait(100); return true; };
      const isBlank = n => n && !n.textContent.trim() && !n.classList.contains('check-line');
      const first = ed.firstElementChild;
      if (!(await menu(first, 'lineAbove'))) out.push('no "Line above" in the hold menu');
      else {
        if (!isBlank(ed.firstElementChild) || ed.firstElementChild.nextElementSibling !== first) out.push('no empty line above the first line');
        const a = getSelection().anchorNode; if (!(a === ed.firstElementChild || ed.firstElementChild.contains(a))) out.push('cursor not in the new top line');
        ed.firstElementChild.remove();
      }
      const kid = f('Ins child'); await menu(kid, 'lineBelow');
      if (!isBlank(kid.nextElementSibling)) out.push('no empty line below the last line'); else kid.nextElementSibling.remove();
      const ti = f('Ins title'); toggleTitleFold(ti, ed); refreshTitleLines(ed);
      await menu(ti, 'lineBelow');
      const nl = ti.nextElementSibling;
      if (!isBlank(nl)) out.push('no empty line under the title');
      else if (nl.dataset.level !== '1') out.push('line under the title not at its lines\' indent: ' + nl.dataset.level);
      if (ti.dataset.fold === '1') out.push('title stayed folded');
      captureBeforeEdit(ed); [ti.previousElementSibling, ti, nl, f('Ins child')].forEach(x => x && x.remove()); finishEditorEdit(ed);
      hideContextMenu(); document.querySelector('[data-ctab="notes"]').click(); await wait(200);
      return out; });
    k.forEach(x => errs.push('Insert line: ' + x));
  }
  // Keep In Mind Completed section (2026-11-24): ticked tasks drop under "Completed · n" at the bottom of their category,
  // the header folds / unfolds, and neither the header nor the fold is saved.
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      document.querySelector('[data-ctab="focus"]').click(); await wait(400);
      const ed = document.querySelector('#kimScroll .kim-editor'); if (!ed) return ['no Keep In Mind editor'];
      const L = (t, lv, tl, done) => '<div class="check-line' + (done ? ' done' : '') + '" data-level="' + lv + '"' + (tl ? ' data-tl="1"' : '') + '><input type="checkbox"' + (done ? ' checked' : '') + '><span class="check-text">' + t + '</span></div>';
      ed.insertAdjacentHTML('beforeend', '<div><br></div>' + L('KD cat', 0, true) + L('KD a', 1, false, true) + L('KD a sub', 2) + L('KD b', 1) + L('KD c', 1));
      refreshCards(ed); window.fwKimDoneLayout(); await wait(100);
      const f = t => [...ed.querySelectorAll('.check-line')].find(l => l.querySelector('.check-text').textContent.trim() === t);
      const order = () => { const out2 = []; for (let n = f('KD cat'); n && (n.textContent.trim() || n.matches('.check-line')); n = n.nextElementSibling) out2.push(n.matches('[data-render-kd]') ? 'H' : n.textContent.trim().replace('KD ', '')); return out2.join(','); };
      if (order() !== 'cat,b,c,H,a,a sub') out.push('order after layout: ' + order());
      const h = () => ed.querySelector('[data-render-kd]');
      if (!h() || !/Completed · 1/.test(h().textContent)) out.push('header: ' + (h() && h().textContent));
      const c = f('KD c'); c.classList.add('done'); c.querySelector('input').checked = true; window.fwKimDoneLayout(); await wait(50);
      if (order() !== 'cat,b,H,c,a,a sub' || !/· 2/.test(h().textContent)) out.push('tick: ' + order() + ' ' + h().textContent);
      h().click(); await wait(50);
      if (f('KD a').getBoundingClientRect().height || f('KD c').getBoundingClientRect().height) out.push('fold did not hide the completed ones');
      const saved = cardCleanHtml(ed);
      if (/data-render-kd|data-kdhid|Completed ·/.test(saved)) out.push('render-only bits saved');
      h().click(); await wait(50);
      if (!f('KD a').getBoundingClientRect().height) out.push('unfold did not show them');
      f('KD a').classList.remove('done'); window.fwKimDoneLayout(); await wait(50);
      if (order() !== 'cat,b,a,a sub,H,c') out.push('untick: ' + order());
      captureBeforeEdit(ed); const cat = f('KD cat'); const kill = [cat.previousElementSibling]; for (let n = cat; n && (n.textContent.trim() || n.matches('.check-line')); n = n.nextElementSibling) kill.push(n); kill.forEach(x => x && x.remove()); finishEditorEdit(ed);
      try { localStorage.removeItem('fw.kimDoneFold'); } catch (e) {}
      document.querySelector('[data-ctab="notes"]').click(); await wait(200);
      return out; });
    k.forEach(x => errs.push('KIM Completed: ' + x));
  }
  // Checkbox cursor (2026-11-21, Julius; NOTES "F. Checkbox cursor"): every way of making a checkbox leaves the caret in
  // its text (right of the box), so the next letters land inside the task. Real key presses, one case per path.
  {
    await pg.evaluate(async () => { document.querySelector('[data-ctab="focus"]').click(); await new Promise(r => setTimeout(r, 400));
      const ed = () => document.querySelector('#kimScroll .kim-editor');
      window.__cc = {
        add(h){ ed().insertAdjacentHTML('beforeend', h); if (window.refreshCards) refreshCards(ed()); },
        caret(tok, at, onLine){ const e = ed(), el = [...e.children].find(n => n.dataset.cc === tok || (n.textContent || '').includes(tok));
          if (!el) return false; e.focus(); const sel = getSelection(), r = document.createRange();
          if (onLine) { r.setStart(el, 0); r.collapse(true); } else { const tx = el.querySelector('.check-text') || el, w = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT), t = w.nextNode(); if (t) r.setStart(t, Math.min(at, t.data.length)); else r.setStart(tx, 0); r.collapse(true); }
          sel.removeAllRanges(); sel.addRange(r); rememberSelection(e); return true; },
        menu(act){ showContextMenu(ed(), 50, 50, false); const b = document.querySelector('#contextMenu [data-ctx="' + act + '"]'); if (!b) return false; b.click(); return true; },
        line(tok){ return [...ed().querySelectorAll('.check-line')].find(l => (l.textContent || '').includes(tok)); },
        where(tok, want){ const l = this.line(tok); if (!l) return 'no checkbox line holds the typed text';
          const tx = l.querySelector(':scope > .check-text'); if (!tx || !tx.textContent.includes(tok)) return 'typed text landed outside the checkbox text';
          if (want != null && tx.textContent.trim() !== want) return 'text is "' + tx.textContent.trim() + '", wanted "' + want + '"'; return ''; },
        clean(){ const e = ed(); captureBeforeEdit(e); [...e.children].filter(n => n.dataset.cc || /zq|zp/.test(n.textContent || '')).forEach(n => n.remove()); finishEditorEdit(e); }
      }; });
    const L = t => '<div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">' + t + '</span></div>';
    const cases = [
      ['[] + Space on an empty line', '<div data-cc="c1"><br></div>', 'c1', 0, async () => pg.keyboard.type('[] '), 'zq1', 'zq1'],
      ['[] + Space before existing text', '<div data-cc="c2">milk</div>', 'c2', 0, async () => pg.keyboard.type('[] '), 'zq2', 'zq2milk'],
      ['hold menu ☐ Checkbox on an empty line', '<div data-cc="c3"><br></div>', 'c3', 0, async () => pg.evaluate(() => __cc.menu('checkbox')), 'zq3', 'zq3'],
      ['hold menu ☐ Checkbox mid-text (caret stays)', '<div data-cc="c4">abcd</div>', 'c4', 2, async () => pg.evaluate(() => __cc.menu('checkbox')), 'zq4', 'abzq4cd'],
      ['hold menu + Subtask', L('zp5'), 'zp5', 3, async () => pg.evaluate(() => __cc.menu('subtask')), 'zq5', 'zq5'],
      ['Enter after a task', L('zp6'), 'zp6', 3, async () => pg.keyboard.press('Enter'), 'zq6', 'zq6'],
      ['Enter at the start of a task', L('zp7'), 'zp7', 0, async () => pg.keyboard.press('Enter'), 'zq7', 'zq7'],
      ['Next Steps + Task (add line)', L('zp8'), 'zp8', 3, async () => pg.evaluate(() => { const l = __cc.line('zp8'); urgAddLine(l, l.closest('.editor'), 'task', false); }), 'zq8', 'zq8'],
      ['guard: caret put before the box', L('zp9'), 'zp9', -1, null, 'zq9', 'zq9zp9'],
    ];
    for (const [nm, h, tok, at, act, typed, want] of cases) {
      await pg.evaluate(h => __cc.add(h), h);
      const ok = await pg.evaluate(([t, a]) => __cc.caret(t, a, a < 0), [tok, at]);
      if (!ok) { errs.push('Checkbox cursor: ' + nm + ': setup line missing'); continue; }
      if (act) await act();
      await pg.waitForTimeout(220);
      await pg.keyboard.type(typed);
      await pg.waitForTimeout(60);
      const m = await pg.evaluate(([t, w]) => __cc.where(t, w), [typed, want]);
      if (m) errs.push('Checkbox cursor: ' + nm + ': ' + m);
      if (nm === 'Enter at the start of a task') {
        const order = await pg.evaluate(() => { const a = __cc.line('zq7'), b = __cc.line('zp7'); return a && b && a.compareDocumentPosition(b) & 4 ? '' : 'new task not above the old one'; });
        if (order) errs.push('Checkbox cursor: ' + nm + ': ' + order);
      }
      await pg.evaluate(() => __cc.clean());
    }
    // Letters a keyboard dropped left of the box move into the text.
    const stray = await pg.evaluate(async () => { __cc.add('<div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">zp10</span></div>');
      const l = __cc.line('zp10'), t = document.createTextNode('zq10'); l.insertBefore(t, l.firstChild);
      const r = document.createRange(); r.setStart(t, 4); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r);
      l.closest('.editor').dispatchEvent(new InputEvent('input', {bubbles:true})); await new Promise(res => setTimeout(res, 50));
      const m = __cc.where('zq10', 'zq10zp10'); hideContextMenu(); __cc.clean(); document.querySelector('[data-ctab="notes"]').click(); return m; });
    if (stray) errs.push('Checkbox cursor: stray letters left of the box: ' + stray);
  }
  // Reference archive (2026-11-21, Julius; NOTES "D. Reference archive"): hold / right-click a card (its text or its
  // frame) → 🗄 Archive card → moved to the Archive with no question; Delete is a small 🗑; the menu item is Reference-only.
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      fwRefDrawer.open(); await wait(300);
      const add = (id, t) => { state.reference.push({ id, parentId: '', type: 'item', title: '', content: '<h2>' + t + '</h2><p>x</p>', expanded: true, sort: 9 }); renderReference(); };
      add('rArc', 'Arc me'); add('rArc2', 'Arc frame');
      const w = id => document.querySelector('#referenceTree .ref-cell-wrapper[data-id="' + id + '"]');
      if (!w('rArc')) return ['test card did not render'];
      const del = w('rArc').querySelector('[data-del]'); if (!del || del.textContent.trim() !== '🗑') out.push('Delete is not a 🗑 button');
      const ra = () => document.querySelector('#contextMenu [data-ctx="refArchive"]');
      const kimEd = document.querySelector('#kimScroll .kim-editor'); showContextMenu(kimEd, 40, 40, false);
      if (ra() && getComputedStyle(ra()).display !== 'none') out.push('Archive card shows outside Reference'); hideContextMenu();
      const ev = el => { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 })); };
      const before = (window.__calls || []).filter(c => c[0] === 'deleteReferenceItem').length;
      ev(w('rArc').querySelector('.ref-cell')); await wait(80);
      if (!ra() || getComputedStyle(ra()).display === 'none') out.push('no Archive card in a card\'s hold menu');
      else { ra().click(); await wait(150); if (w('rArc')) out.push('card still shows after Archive'); }
      ev(w('rArc2')); await wait(80);
      if (!ra() || getComputedStyle(ra()).display === 'none') out.push('no Archive card when holding the card frame');
      else { ra().click(); await wait(150); if (w('rArc2')) out.push('card (frame hold) still shows after Archive'); }
      const calls = (window.__calls || []).filter(c => c[0] === 'deleteReferenceItem').slice(before).map(c => c[1][0]);
      if (calls.join() !== 'rArc,rArc2') out.push('archive server calls: ' + calls.join());
      hideContextMenu(); fwRefDrawer.close(); await wait(250);
      return out; });
    k.forEach(x => errs.push('Reference archive: ' + x));
  }
  // Reference → Keep In Mind (2026-11-21, Julius; NOTES "E."): hold a card's title, drag onto Keep In Mind → a copy lands
  // as a title line + its lines (task stays a task, child card = nested title); Reference keeps the card.
  {
    const setup = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('[data-ctab="focus"]').click(); await wait(300);
      state.reference.push({ id: 'rk1', parentId: '', type: 'item', title: '', content: '<h2>Drag card</h2><p>rk line</p><div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">rk task</span></div>', expanded: true, sort: 0 });
      state.reference.push({ id: 'rk2', parentId: 'rk1', type: 'item', title: '', content: '<h2>Kid card</h2><p>kid line</p>', expanded: true, sort: 1 });
      renderReference();
      document.getElementById('journalPane').scrollIntoView({ inline: 'start', block: 'nearest' }); await wait(300);
      fwRefDrawer.open(); await wait(350);
      const h = document.querySelector('#referenceTree .ref-cell-wrapper[data-id="rk1"] > .ref-cell > h2');
      if (!h) return { err: 'test card did not render' };
      h.scrollIntoView({ block: 'center' }); await wait(100);
      const hr = h.getBoundingClientRect();
      const ed = document.querySelector('#kimScroll .kim-editor'), last = [...ed.children].filter(c => c.getBoundingClientRect().height > 0).pop();
      return { hx: hr.left + 20, hy: hr.top + hr.height / 2, hold: fwHoldMs() };
    });
    if (setup.err) errs.push('Ref → Keep In Mind: ' + setup.err);
    else {
      const target = () => pg.evaluate(() => { const sc = document.getElementById('kimScroll').getBoundingClientRect(); return { x: Math.max(sc.left, 0) + Math.min(sc.width, innerWidth) / 3, y: sc.top + Math.min(sc.height, innerHeight - sc.top) - 30 }; });
      if (view.hasTouch) {
        await pg.evaluate(async ({ hx, hy, hold }) => { const wait = ms => new Promise(r => setTimeout(r, ms));
          const tgt = document.elementFromPoint(hx, hy), T = (x, y) => new Touch({ identifier: 3, target: tgt, clientX: x, clientY: y });
          tgt.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [T(hx, hy)], changedTouches: [T(hx, hy)] }));
          await wait(hold + 120);
          const sc = document.getElementById('kimScroll').getBoundingClientRect(), tx = Math.max(sc.left, 0) + 40, ty = Math.min(sc.bottom, innerHeight) - 30;
          for (let i = 1; i <= 8; i++) { const x = hx + (tx - hx) * i / 8, y = hy + (ty - hy) * i / 8; tgt.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [T(x, y)], changedTouches: [T(x, y)] })); await wait(30); }
          tgt.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [T(tx, ty)] })); await wait(200);
        }, setup);
      } else {
        await pg.mouse.move(setup.hx, setup.hy); await pg.mouse.down(); await pg.waitForTimeout(setup.hold + 120);
        await pg.mouse.move(setup.hx - 30, setup.hy, { steps: 3 });
        const t = await target(); await pg.mouse.move(t.x, t.y, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(200);
      }
      const k = await pg.evaluate(async () => { const out = [], ed = document.querySelector('#kimScroll .kim-editor');
        const all = [...ed.children], ti = all.findIndex(n => n.dataset.tl === '1' && n.textContent.trim() === 'Drag card');
        if (ti < 0) out.push('no "Drag card" title line in Keep In Mind');
        else {
          const want = [['rk line', '1', false], ['rk task', '1', true], ['Kid card', '1', false], ['kid line', '2', false]];
          want.forEach(([t, lv, task], i) => { const n = all[ti + 1 + i];
            if (!n || n.textContent.trim() !== t) out.push('line ' + (i + 1) + ' is "' + (n && n.textContent.trim()) + '", wanted "' + t + '"');
            else { if (n.dataset.level !== lv) out.push('"' + t + '" at level ' + n.dataset.level + ', wanted ' + lv);
              if (task !== n.classList.contains('check-line')) out.push('"' + t + '" ' + (task ? 'lost its checkbox' : 'became a task')); } });
          if (all[ti + 3] && all[ti + 3].dataset.tl !== '1') out.push('child card is not a nested title');
          const bl = n => n && !n.textContent.trim() && !n.querySelector('input'), rm = all.slice(ti, ti + 5);
          if (bl(all[ti - 1])) rm.push(all[ti - 1]); if (bl(all[ti + 5])) rm.push(all[ti + 5]);
          captureBeforeEdit(ed); rm.forEach(n => n.remove()); finishEditorEdit(ed);
        }
        if (!document.querySelector('#referenceTree .ref-cell-wrapper[data-id="rk1"]')) out.push('card left Reference (should be a copy)');
        if (document.querySelector('.rk-ghost')) out.push('drag ghost left behind');
        state.reference = state.reference.filter(x => !/^rk/.test(x.id)); renderReference(); fwRefDrawer.close();
        document.querySelector('[data-ctab="notes"]').click(); await new Promise(r => setTimeout(r, 200));
        return out; });
      k.forEach(x => errs.push('Ref → Keep In Mind: ' + x));
    }
  }
  // Keep In Mind pin (2026-11-21, Julius; NOTES "B."): hold an item → 📌 Pin to top; pinned items stay on top in pin
  // order with their lines; Unpin moves it just below the pinned ones; the pin is saved in the cell.
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      document.querySelector('[data-ctab="focus"]').click(); await wait(300);
      const ed = document.querySelector('#kimScroll .kim-editor'); if (!ed) return ['no Keep In Mind editor'];
      const L = (t, lv, tl) => '<div class="check-line" data-level="' + lv + '"' + (tl ? ' data-tl="1"' : '') + (lv ? ' style="margin-left: ' + 24 * lv + 'px;"' : '') + '><input type="checkbox"><span class="check-text">' + t + '</span></div>';
      ed.insertAdjacentHTML('beforeend', '<div><br></div><div data-tl="1"><b>PinA</b></div>' + L('PinA kid', 1) + '<div><br></div>' + L('PinB', 0) + L('PinB sub', 1));
      refreshCards(ed); refreshTitleLines(ed); await wait(100);
      const f = t => [...ed.children].find(l => l.textContent.trim() === t);
      const menu = async (t) => { const n = f(t), tx = n.querySelector('.check-text') || n, r = document.createRange(); r.setStart(tx.firstChild || tx, 0); r.collapse(true);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); ed.focus(); rememberSelection(ed);
        showContextMenu(ed, 50, 50, false); const b = document.querySelector('#contextMenu [data-ctx="kimPin"]'); const label = b && !b.hidden ? b.textContent : '';
        if (b && !b.hidden) b.click(); await wait(80); return label; };
      const top = () => [...ed.children].filter(n => !isEmptyLine(n)).slice(0, 4).map(n => n.textContent.trim()).join('|');
      if (!/Pin to top/.test(await menu('PinB sub'))) out.push('no "Pin to top" in the Keep In Mind hold menu');
      if (!top().startsWith('PinB|PinB sub|')) out.push('pinned task + subtask not on top: ' + top());
      await menu('PinA kid');
      if (top() !== 'PinB|PinB sub|PinA|PinA kid') out.push('second pin not right under the first: ' + top());
      if (!f('PinA').hasAttribute('data-kpin') || !/data-kpin/.test(cardCleanHtml(ed))) out.push('pin not saved in the cell');
      // Pin (2026-11-22): a tappable 📌 beside the item; a title keeps its − / count button.
      await wait(80); const pins = () => [...document.querySelectorAll('#kimScroll .kg-pin')];
      if (pins().length !== 2) out.push('expected 2 📌 pins, got ' + pins().length);
      if (/📌/.test(getComputedStyle(f('PinA'), '::before').content)) out.push('pin still replaces the title count');
      { const pa = f('PinA').getBoundingClientRect(), p = pins().find(x => Math.abs(x.getBoundingClientRect().top + 8 - (pa.top + Math.min(pa.height, 24) / 2)) < 12);
        if (!p) out.push('no 📌 beside the pinned title'); else if (p.getBoundingClientRect().width > 18) out.push('pin button too big'); }
      if (!/Unpin/.test(await menu('PinB'))) out.push('pinned item\'s menu does not say Unpin');
      if (top() !== 'PinA|PinA kid|PinB|PinB sub' || f('PinB').hasAttribute('data-kpin')) out.push('unpin did not move it below the pinned ones: ' + top());
      const ki = [...ed.children]; for (let i = 1; i < ki.length; i++) if (isEmptyLine(ki[i]) && isEmptyLine(ki[i - 1])) { out.push('doubled blank lines after pin moves'); break; }
      // Tap the 📌 = unpin; it drops just below the pinned ones.
      { await menu('PinB'); await wait(80); const pb = f('PinB').getBoundingClientRect(), p = pins().find(x => Math.abs(x.getBoundingClientRect().top - pb.top) < 14);
        if (!p) out.push('no 📌 on PinB to tap'); else { p.click(); await wait(120);
          if (f('PinB').hasAttribute('data-kpin') || top() !== 'PinA|PinA kid|PinB|PinB sub') out.push('tapping 📌 did not unpin below the pinned ones: ' + top()); } }
      const kim = document.querySelector('[data-ctab="focus"]');
      showContextMenu(document.querySelector('#todayScroll .day-editor'), 40, 40, false);
      const kb = document.querySelector('#contextMenu [data-ctx="kimPin"]'); if (kb && !kb.hidden) out.push('Pin shows outside Keep In Mind'); hideContextMenu();
      captureBeforeEdit(ed); ['PinA','PinA kid','PinB','PinB sub'].forEach(t => { const n = f(t); if (n) { const nx = n.nextElementSibling; n.remove(); if (nx && isEmptyLine(nx) && t.endsWith('kid') || t.endsWith('sub')) nx && isEmptyLine(nx) && nx.remove(); } });
      if (ed.firstElementChild && isEmptyLine(ed.firstElementChild)) ed.firstElementChild.remove();
      finishEditorEdit(ed); document.querySelector('[data-ctab="notes"]').click(); await wait(200);
      return out; });
    k.forEach(x => errs.push('Keep In Mind pin: ' + x));
  }
  // Hide the top row (2026-11-21, Julius; NOTES "A."): hold an empty spot of the toolbar → hidden, workspace moves up,
  // a strip shows; tap the strip → back; remembered per device; holding a button does not hide it.
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      const bar = document.getElementById('toolbar'), ws = document.getElementById('workspace'), y0 = ws.getBoundingClientRect().top;
      const hold = async (el, ms) => { const r = el.getBoundingClientRect(), o = { bubbles: true, pointerId: 9, pointerType: 'touch', clientX: r.left + 2, clientY: r.top + r.height / 2 };
        el.dispatchEvent(new PointerEvent('pointerdown', o)); await wait(ms); el.dispatchEvent(new PointerEvent('pointerup', o)); await wait(150); };
      await hold(bar.querySelector('button'), fwHoldMs() + 150);
      if (document.body.classList.contains('tb-hidden')) { out.push('holding a button hid the row'); fwToolbarHide.set(false); await wait(150); }
      await hold(bar, 150); if (document.body.classList.contains('tb-hidden')) out.push('a short tap hid the row');
      await hold(bar, fwHoldMs() + 150);
      if (!document.body.classList.contains('tb-hidden') || bar.getClientRects().length) out.push('holding the toolbar did not hide it');
      if (!(ws.getBoundingClientRect().top < y0 - 10)) out.push('workspace did not move up (' + Math.round(y0) + ' → ' + Math.round(ws.getBoundingClientRect().top) + ')');
      if (localStorage.getItem('fw.tbHidden') !== '1') out.push('hidden state not remembered');
      const strip = document.getElementById('tbStrip');
      if (!strip || !strip.getClientRects().length) out.push('no strip to bring it back');
      else { strip.click(); await wait(150); if (document.body.classList.contains('tb-hidden') || !bar.getClientRects().length) out.push('tapping the strip did not bring the row back'); }
      if (localStorage.getItem('fw.tbHidden') !== '0') out.push('shown state not remembered');
      fwToolbarHide.set(false); await wait(150);
      return out; });
    k.forEach(x => errs.push('Hide top row: ' + x));
  }
  // Keep In Mind border color (2026-11-21, Julius; NOTES "G."): hold a title → 🎨 Border color → swatch / color wheel /
  // Reset; saved on the title (data-tbc), the group box + title box use it; not offered on non-title lines.
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      document.querySelector('[data-ctab="focus"]').click(); await wait(300);
      const ed = document.querySelector('#kimScroll .kim-editor'); if (!ed) return ['no Keep In Mind editor'];
      ed.insertAdjacentHTML('beforeend', '<div><br></div><div data-tl="1">ColT</div><div class="check-line" data-level="1" style="margin-left: 24px;"><input type="checkbox"><span class="check-text">ColT kid</span></div><div><br></div><div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">ColLone</span></div><div><br></div><div><b>ColH</b></div><div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">ColH kid</span></div><div><br></div>');
      refreshCards(ed); refreshTitleLines(ed); await wait(150);
      const f = t => [...ed.children].find(l => l.textContent.trim() === t);
      const open = t => { const n = f(t), tx = n.querySelector('.check-text') || n, r = document.createRange(); r.setStart(tx.firstChild || tx, 0); r.collapse(true);
        getSelection().removeAllRanges(); getSelection().addRange(r); ed.focus(); rememberSelection(ed); showContextMenu(ed, 60, 60, false);
        return document.querySelector('#contextMenu [data-ctx="kimColor"]'); };
      let b = open('ColLone'); if (b && !b.hidden) out.push('Border color offered on a task with no title'); hideContextMenu();
      b = open('ColT kid'); if (!b || b.hidden) out.push('no Border color when holding a line inside a title box'); hideContextMenu();
      b = open('ColT');
      if (!b || b.hidden) { out.push('no 🎨 Border color when holding a title'); hideContextMenu(); }
      else {
        b.click(); await wait(100);
        const pop = document.querySelector('.kc-pop'); if (!pop) out.push('no color picker opened');
        else {
          if (!pop.querySelector('input[type=color]')) out.push('no full color picker (wheel)');
          pop.querySelector('[data-c="#fdd835"]').click(); await wait(200);
          if (f('ColT').getAttribute('data-tbc') !== '#fdd835') out.push('yellow not saved on the title');
          if (!/data-tbc="#fdd835"/.test(cardCleanHtml(ed))) out.push('color dropped from the saved cell');
          if (!/fdd835/i.test(decodeURIComponent(ed.style.backgroundImage || ''))) out.push('title box not drawn in the color');
          // One border per section (2026-11-22): the title cell's box is the section's only box, no group box on top.
          const tr = f('ColT').getBoundingClientRect();
          if ([...document.querySelectorAll('#kimScroll .kg-box')].some(x => { const r = x.getBoundingClientRect(); return r.top <= tr.top + 2 && r.bottom >= tr.bottom - 2; })) out.push('titled section has a second (group) border');
          b = open('ColT'); b.click(); await wait(100);
          const inp = document.querySelector('.kc-pop input[type=color]'); inp.value = '#123abc'; inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new Event('change')); await wait(100);
          if (f('ColT').getAttribute('data-tbc') !== '#123abc') out.push('color wheel value not applied');
          document.querySelector('.kc-pop [data-reset]').click(); await wait(100);
          if (f('ColT').hasAttribute('data-tbc')) out.push('Reset left the color');
          if (document.querySelector('.kc-pop')) out.push('picker stayed open after Reset');
        }
      }
      // Plain header line (2026-11-21 UI batch: "still not working"): holding its task offers 🎨 and colors the header's group.
      b = open('ColH kid');
      if (!b || b.hidden) out.push('no Border color under a plain header line');
      else { b.click(); await wait(100); const p2 = document.querySelector('.kc-pop');
        if (!p2) out.push('no picker for a header line'); else { p2.querySelector('[data-c="#43a047"]').click(); await wait(200);
          if (f('ColH').getAttribute('data-tbc') !== '#43a047') out.push('header line did not get the color');
          if (![...document.querySelectorAll('#kimScroll .kg-box')].some(x => /67, 160, 71/.test(getComputedStyle(x).borderTopColor))) out.push('header group box not in the color'); } }
      captureBeforeEdit(ed); ['ColT', 'ColT kid', 'ColLone', 'ColH', 'ColH kid'].forEach(t => { const n = f(t); n && n.remove(); });
      while (ed.lastElementChild && isEmptyLine(ed.lastElementChild) && ed.lastElementChild.previousElementSibling && isEmptyLine(ed.lastElementChild.previousElementSibling)) ed.lastElementChild.remove();
      finishEditorEdit(ed); document.querySelector('[data-ctab="notes"]').click(); await wait(200);
      return out; });
    k.forEach(x => errs.push('Keep In Mind color: ' + x));
  }
  // Title cells (2026-11-21, Julius): a title + its lines sit in one box (nested box inside), archive takes the whole box.
  {
    const k = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
      document.querySelector('[data-ctab="focus"]').click(); await wait(400);
      const ed = document.querySelector('#kimScroll .kim-editor'); if (!ed) return ['no Keep In Mind editor'];
      const L = (t, lv, tl) => '<div class="check-line" data-level="' + lv + '"' + (tl ? ' data-tl="1"' : '') + '><input type="checkbox"><span class="check-text">' + t + '</span></div>';
      ed.insertAdjacentHTML('beforeend', '<div><br></div>' + L('Box A', 0, true) + L('Box sub', 1, true) + L('Box x', 2) + L('Box y', 1) + '<div><br></div>');
      refreshCards(ed); await wait(250);
      const f = t => [...ed.querySelectorAll('.check-line')].find(l => l.textContent.trim() === t);
      const bg = ed.style.backgroundImage || '', n = (bg.match(/%3Crect/g) || []).length;
      if (n < 2) out.push('boxes drawn: ' + n);
      if (!f('Box A').hasAttribute('data-tbf') || !f('Box y').hasAttribute('data-tbl')) out.push('box marks missing');
      const saved = cardCleanHtml(ed);
      if (/data-tb[fl]|--tbs/.test(saved)) out.push('render-only box marks leaked into the saved cell');
      const added = [f('Box A').previousElementSibling, f('Box A'), ...titleCovered(f('Box A')), f('Box y').nextElementSibling];
      captureBeforeEdit(ed); added.forEach(x => x.remove()); finishEditorEdit(ed); await wait(200);
      if (/%3Crect/.test(ed.style.backgroundImage || '') && !ed.querySelector('[data-tl="1"]')) out.push('box left behind after delete');
      // Archive a title in Today: its whole box is archived.
      const te = document.querySelector('#todayScroll .day-editor');
      if (te) {
        te.insertAdjacentHTML('beforeend', '<div><br></div>' + L('Arch T', 0, true).replace('data-level', 'data-urg="3" data-level') + L('Arch 1', 0) + '<div><br></div>');
        refreshCards(te); await wait(150);
        const g = t => [...te.querySelectorAll('.check-line')].find(l => l.textContent.trim() === t);
        setArchived(g('Arch T'), te, true);
        if (!g('Arch 1').dataset.arch) out.push('archive missed a line in the box');
        const rm = [g('Arch T').previousElementSibling, g('Arch T'), g('Arch 1'), g('Arch 1').nextElementSibling];
        captureBeforeEdit(te); rm.forEach(x => x.remove()); finishEditorEdit(te);
      }
      document.querySelector('[data-ctab="notes"]').click(); await wait(200);
      return out; });
    k.forEach(x => errs.push('Title cells: ' + x));
  }
  // Urgent tab in the middle column (2026-11-15, Julius): 🔴 shows the red Next Steps group (real rows), others hidden;
  // leaving the tab puts the panel back in Reference.
  {
    const ut = await pg.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = [], vis = el => !!el && el.getClientRects().length > 0;
      const b = document.querySelector('.center-tabs [data-ctab="urgent"]'); if (!b) return ['no 🔴 tab'];
      b.click(); await wait(300);
      const host = document.getElementById('urgTabScroll'), panel = document.getElementById('urgentPanel');
      if (!panel || panel.parentNode !== host) out.push('Next Steps panel not in the tab');
      if (!vis(host)) out.push('tab area not shown');
      const rows = [...host.querySelectorAll('.urg-row')].filter(vis).map(r => r.querySelector('.urg-text')?.textContent.trim());
      if (!rows.includes('Pay rent')) out.push('red task missing: ' + rows.join(' / '));
      if (rows.includes('Paid bill')) out.push('non-red task shown: ' + rows.join(' / '));
      document.querySelector('.center-tabs [data-ctab="notes"]').click(); await wait(300);
      if (document.getElementById('urgentPanel').closest('#urgTabScroll')) out.push('panel not put back after leaving the tab');
      return out;
    });
    ut.forEach(x => errs.push('Urgent tab: ' + x));
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
    if(!dt || !/^\d{1,2}\/\d{1,2}$/.test(dt.textContent)) return ['date not like 11/5: ' + (dt && dt.textContent)];
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
    // 2026-11-13 (Julius): search line = Find + ⚙ only (no Cats, no ↻).
    if (document.querySelector('.ce-head [data-ce-sort], .ce-head [data-ce-refresh]')) out.push('Cats / ↻ still on the search line');
    const list = document.getElementById('centerCalendarList');
    // Day timeline on by default (2026-11-11). 2026-11-13: no Events bar / list above it, no "Cal Events" title, no 🕒 —
    // ⚙ sits on the search line and holds the 🕒 day-calendar switch; switching it off brings the events list back.
    const dv = list.querySelector(':scope > .ce-day');
    if (!dv) out.push('timeline not on by default');
    else {
      if (dv.scrollHeight <= dv.clientHeight) out.push('day view does not scroll');
      if (list.querySelector(':scope > .ce-list, :scope > .ce-bar')) out.push('events list / bar still above the calendar');
      const h0 = dv.querySelector('.ce-day-in').offsetHeight;
      list.querySelector('[data-ce-zoom="1"]').click(); await wait(80);
      const h1 = list.querySelector('.ce-day-in').offsetHeight;
      if (!(h1 > h0)) out.push('+ zoom did not grow the timeline: ' + h0 + ' → ' + h1);
      list.querySelector('[data-ce-zoom="-1"]').click(); await wait(80);
      if (list.querySelector('.ce-day-in').offsetHeight >= h1) out.push('− zoom did not shrink the timeline');
    }
    const head0 = document.querySelector('#centerDownScroll .ce-head');
    if (head0.querySelector('strong') && head0.querySelector('strong').offsetWidth) out.push('Cal Events title / 📅 still shows');
    if (head0.textContent.includes('🕒')) out.push('🕒 button still in the header');
    const opt = head0.querySelector('[data-ce-opt]');
    if (!opt) out.push('no ⚙ on the search line');
    else {
      opt.click(); await wait(80);
      const dayCb = list.querySelector('[data-ce-optbox] input[data-ce-day]');
      if (!dayCb || !dayCb.checked) out.push('⚙ has no checked 🕒 Day calendar switch');
      else { dayCb.click(); await wait(100); }
      if (list.querySelector('.ce-day')) out.push('switch off did not hide the day calendar');
      if (!list.querySelector('.ce-event[data-ce-id="e1"]')) out.push('switch off did not bring the events list back');
      if (!list.querySelector('[data-ce-showcal]')) out.push('list mode has no 📅 Show calendar button');
      if (!list.querySelector('[data-ce-sortpick="cat"]')) out.push('⚙ has no list order choice');
      list.querySelector('[data-ce-opt-done]')?.click(); await wait(50);
    }
    // ▾ Events folds the list and back (list mode).
    list.querySelector('[data-ce-fold]').click(); await wait(80);
    if (list.querySelector('.ce-list') && !list.querySelector('.ce-list').hidden) out.push('▾ Events did not fold the list');
    list.querySelector('[data-ce-fold]').click(); await wait(80);
    if (list.querySelector('.ce-list').hidden) out.push('▸ Events did not open the list');
    // ⚙ hide list: a word hides the event from the list; "1 hidden" shows; ✕ brings it back.
    opt.click(); await wait(80);
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
    opt.click(); await wait(80); list.querySelector('[data-ce-optbox] input[data-ce-day]').click(); await wait(100);
    if (!list.querySelector('.ce-day')) out.push('switch on did not bring the day calendar back');
    list.querySelector('[data-ce-opt-done]')?.click(); await wait(50);
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
  // No column sliding (2026-11-21 UI batch, Julius: "remove column drag bars, no sliding"). Replaces the 2026-11-06 Tuck
  // drag test: dragging a column line must not change the column widths.
  const tk = [];
  await pg.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); localStorage.setItem('fw.halves', '0'); dispatchEvent(new Event('resize')); });
  await pg.waitForTimeout(200);
  const hp = await pg.evaluate(() => { const hs = [...document.querySelectorAll('.column-resizer')].filter(h => h.offsetParent); if (!hs.length) return null; const r = hs[hs.length - 1].getBoundingClientRect(); return [r.left + r.width / 2, r.top + 30, innerWidth]; });
  if (hp) {
    const widths = () => pg.evaluate(() => [...document.querySelectorAll('#workspace > .pane')].map(p => Math.round(p.getBoundingClientRect().width)).join(','));
    const w0 = await widths();
    await pg.mouse.move(hp[0], hp[1]); await pg.mouse.down(); await pg.mouse.move(hp[0] + 60, hp[1], { steps: 3 }); await pg.mouse.move(hp[2] - 1, hp[1], { steps: 4 }); await pg.mouse.up();
    await pg.waitForTimeout(150);
    const w1 = await widths();
    if (w0 !== w1) tk.push('dragging a column line still resized the columns: ' + w0 + ' → ' + w1);
    const grip = await pg.evaluate(() => [...document.querySelectorAll('.column-resizer,#mobileSplitResizer[data-dir="col"]')].some(h => h.offsetParent && getComputedStyle(h, '::after').display !== 'none'));
    if (grip) tk.push('a column drag grip is still showing');
  }
  tk.forEach(x => errs.push('Columns: ' + x));
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
    fs.writeFileSync(file,readIndexHtml()
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
// Instant screen (2026-11-21, speed item L): save the live page's picture, reopen with slow data → the read-only
// picture shows at once with "Syncing…", can't be edited or saved, then the live page replaces it; Speed Log gets screen.
for (const [name, view] of (only('snap') ? [['desktop', { width: 1300, height: 900 }], ['phone', { width: 412, height: 915, isMobile: true, hasTouch: true }]] : [])) {
  const ctx = await b.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch, timezoneId: 'America/Los_Angeles' });
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  try {
    await pg.goto('file://' + out); await pg.waitForTimeout(2200);
    if (!['none', 'late'].includes(await pg.evaluate(() => window.__FW_SNAP.state))) errs.push('first open (nothing saved yet) should show no picture');
    await pg.evaluate(() => { document.querySelector('#todayScroll')?.scrollBy(0, 40); window.fwSnapSave('test'); });
    await pg.waitForFunction(() => window.__FW_SNAP.saved && window.__FW_SNAP.saved.why === 'test', null, { timeout: 5000 });
    const kb = await pg.evaluate(() => window.__FW_SNAP.saved.kb);
    await pg.evaluate(() => localStorage.setItem('smokeWsd', '3500'));
    await pg.reload(); await pg.waitForTimeout(900);
    const early = await pg.evaluate(() => {
      const f = document.getElementById('fwSnap'), pill = document.getElementById('fwSnapPill'), d = f && f.contentDocument;
      return { state: window.__FW_SNAP.state, pill: pill && pill.textContent, inert: !!(d && d.body.hasAttribute('inert')), scripts: f && f.getAttribute('sandbox'),
        text: d ? d.body.textContent : '', live: !!document.querySelector('#todayScroll .day-editor') };
    });
    if (early.state !== 'shown') errs.push('picture not shown (state ' + early.state + ')');
    if (!/^Syncing…/.test(early.pill || '')) errs.push('no "Syncing…" marker');
    if (!early.inert || early.scripts !== 'allow-same-origin') errs.push('picture is not read-only (inert + no scripts)');
    if (!early.text.includes('Pay rent')) errs.push('picture is missing the saved tasks');
    if (early.live) errs.push('live page drew before the slow data arrived (test timing)');
    await pg.mouse.click(view.width / 2, view.height / 2); await pg.keyboard.type('zzsnap');
    await pg.waitForTimeout(3600);
    const after = await pg.evaluate(() => ({ gone: !document.getElementById('fwSnap') && !document.getElementById('fwSnapPill'),
      live: [...document.querySelectorAll('#todayScroll .day-editor')].some(e => e.textContent.includes('Pay rent')),
      typed: document.body.textContent.includes('zzsnap'),
      writes: (window.__calls || []).filter(c => JSON.stringify(c).includes('zzsnap')).map(c => c[0]) }));
    if (!after.gone) errs.push('picture still covers the live page');
    if (!after.live) errs.push('live data did not draw after the picture');
    if (after.typed) errs.push('typing reached a page while the picture showed');
    if (after.writes.length) errs.push('typing on the picture reached a save: ' + after.writes.join(','));
    await pg.waitForTimeout(1700);
    const log = await pg.evaluate(() => { const c = (window.__calls || []).find(c => c[0] === 'logSpeed' && c[1][0] === 'load'); return c && c[1][2]; });
    if (!log || log.snap !== 'shown' || !(log.screen > 0) || !(log.screen < log.liveMs)) errs.push('Speed Log load row missing screen / snap numbers: ' + JSON.stringify(log && { snap: log.snap, screen: log.screen, liveMs: log.liveMs }));
    // A different width (phone turned) skips the picture instead of showing a wrong layout.
    await pg.setViewportSize({ width: view.width + 120, height: view.height }); await pg.reload(); await pg.waitForTimeout(900);
    const wide = await pg.evaluate(() => ({ state: window.__FW_SNAP.state, f: !!document.getElementById('fwSnap') }));
    if (wide.state !== 'width' || wide.f) errs.push('width change still showed the picture: ' + wide.state);
    await pg.waitForTimeout(3200);
    if (errs.length === 0) console.log('  snapshot ' + kb + ' KB, screen at ' + Math.round(log.screen) + ' ms vs live ' + Math.round(log.liveMs) + ' ms');
  } catch (e) { errs.push(e.message); }
  if (errs.length) { fails += errs.length; console.error('✗ snap ' + name + ': ' + errs.join(' | ')); } else console.log('✓ snap ' + name + ': saved picture shows at once, read-only, replaced by live data, Speed Log screen time');
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
          put({eventId:'b-'+d,title:'Dentist',allDay:false,start:t('09','00'),end:t('10','00'),startMs:ms(t('09','00')),color:'#d50000',colorId:'11',cal:'Main',calId:'main',location:'Main St',desc:'Bring the insurance card\\nhttps://example.com/form',editable:true});
          put({eventId:'c-'+d,title:'Old chore',allDay:false,start:t('13','00'),end:t('13','30'),startMs:ms(t('13','00')),color:'#616161',colorId:'8',done:true,cal:'Main',calId:'main',editable:true});
          put({eventId:'r-'+d,title:'Standup',allDay:false,start:t('15','00'),end:t('15','15'),startMs:ms(t('15','00')),color:'#039be5',colorId:'',cal:'Main',calId:'main',recurring:true,editable:false});
          // Back-to-back pair (2026-11-21, job N), two days out so today's checks don't change: Meditate 11:50 pm – 1 am
          // (crosses midnight) then Sleep 1 – 7:45 am, same color like Julius's real pair.
          if(d===L.now().setZone(Z).plus({days:2}).toISODate()){
          put({eventId:'mz-'+d,title:'Meditate',allDay:false,start:t('23','50'),end:iso(nx+'T01:00'),startMs:ms(t('23','50')),color:'#8e24aa',colorId:'3',cal:'Main',calId:'main',editable:true});
          put({eventId:'sl-'+nx,title:'Sleep',allDay:false,start:iso(nx+'T01:00'),end:iso(nx+'T07:45'),startMs:ms(nx+'T01:00'),color:'#8e24aa',colorId:'3',cal:'Main',calId:'main',editable:true});
          // A real overlap (Walk 3 – 4 am, inside Sleep) and a 10-minute event touching Sleep's end (Pills 7:45 – 7:55).
          put({eventId:'wk-'+nx,title:'Walk',allDay:false,start:iso(nx+'T03:00'),end:iso(nx+'T04:00'),startMs:ms(nx+'T03:00'),color:'#33b679',colorId:'2',cal:'Main',calId:'main',editable:true});
          put({eventId:'pl-'+nx,title:'Pills',allDay:false,start:iso(nx+'T07:45'),end:iso(nx+'T07:55'),startMs:ms(nx+'T07:45'),color:'#f6bf26',colorId:'5',cal:'Main',calId:'main',editable:true});
          put({eventId:'br-'+nx,title:'Breakfast',allDay:false,start:iso(nx+'T07:55'),end:iso(nx+'T08:30'),startMs:ms(nx+'T07:55'),color:'#f4511e',colorId:'6',cal:'Main',calId:'main',editable:true});}
          put({eventId:'g-'+d,title:'Gig',allDay:false,start:t('19','00'),end:t('21','00'),startMs:ms(t('19','00')),color:'#33b679',colorId:'',cal:'Events',calId:'events',editable:false});}
        return {start:a[0],end:a[1],events:window.__calEmpty?[]:Object.values(S.ev).concat(window.__calManyAllDay&&(window.__mDay=window.fwCalendar.api().view.activeStart.toISOString().slice(0,10))?Array.from({length:30},(_,i)=>({id:'m'+i+'|x',eventId:'m'+i,title:'Many '+i,allDay:true,start:window.__mDay,end:L.fromISO(window.__mDay).plus({days:1}).toISODate(),startMs:ms(window.__mDay),color:'#3f51b5',colorId:(window.__mDone||{})['m'+i]??i%5===4?'8':'9',done:(window.__mDone||{})['m'+i]??i%5===4,urg:['1','2','3',''][i%4]||undefined,cat:i%2?'code':'',cal:'Main',calId:'main',editable:true})):[]).filter(e=>e.start.slice(0,10)<a[1]&&(e.allDay?e.end:e.end.slice(0,10))>=a[0]).map(e=>Object.assign({},e)),failed:[]};}
      const r=a[0]||{},shape=e=>{e.title=r.title;e.allDay=!!r.allDay;e.start=r.allDay?r.start:iso(r.start);e.end=r.allDay?r.end:iso(r.end);e.startMs=ms(e.start);return e;};
      if(m==='calPanelCreateEvent'){ if(S.ops[r.opId])return Object.assign({repeat:true},S.ev[S.ops[r.opId]]);
        const e=put(shape({eventId:'n'+(++S.n),color:'#039be5',colorId:'',cal:'Main',calId:'main',editable:true,reminders:0}));if(r.allDay)e.ord=r.ord||Date.now();if(r.tid){e.tid=r.tid;e.tt=e.title;}S.ops[r.opId]=e.eventId;return e;}
      if(m==='calRetitleLinked'){(a[0]||[]).forEach(x=>{const e=S.ev[x.eventId];if(e){e.title=x.title;e.tt=x.title;}});return {ok:true,failed:[]};}
      if(m==='calPanelSetOrder'){(a[0]||[]).forEach(x=>{if(S.ev[x.eventId])S.ev[x.eventId].ord=x.ord;});return {ok:true,failed:[]};}
      if(m==='calPanelUpdateEvent'){const e=S.ev[r.eventId];if(!e)throw new Error('Event not found');if(e.recurring||!e.editable)throw new Error('Repeating events are read-only here');delete S.ev[r.eventId];return put(shape(e));}
      // Phase 3b: move / resize in place (same id); Graphite (done) is locked; plan links follow the new start.
      const relink=e=>{const link=e.eventId+'@'+e.startMs;(S.plan||[]).forEach(x=>{if(String(x.event).split('@')[0]===e.eventId)x.event=link;});if(e.tag){S.planEv=S.planEv||{};S.planEv['tid:'+e.tag]=link;}return link;};
      if(m==='calPanelMoveEvent'){const e=S.ev[r.eventId];if(!e)throw new Error('Event not found');if(e.recurring||!e.editable)throw new Error('read-only');if(e.colorId==='8')throw new Error('Done events stay where they are');
        delete S.ev[r.eventId];if(!r.allDay&&e.allDay)e.sched=true;if(r.allDay)delete e.sched;e.allDay=!!r.allDay;e.start=r.allDay?r.start:iso(r.start);e.end=r.allDay?r.end:iso(r.end);e.startMs=ms(e.start);put(e);relink(e);return Object.assign({},e);}
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
      // Google-style popup (2026-11-14): color + duplicate.
      if(m==='calPanelSetColor'){const e=S.ev[r.eventId];if(!e)throw new Error('Event not found');if(!e.editable)throw new Error('read-only');if(e.colorId==='8'){e.prev=r.colorId;}else{e.colorId=r.colorId;e.color=r.colorId?'#e6ba57':'#8a8f98';}return {colorId:r.colorId};}
      if(m==='calPanelDuplicateEvent'){const e=S.ev[r.eventId];if(!e)throw new Error('Event not found');const c=Object.assign({},e,{eventId:'d'+(++S.n),done:false});if(c.colorId==='8')c.colorId=e.prev||'';return Object.assign({},put(c));}
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
    const cHtml = readIndexHtml()
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
      // CAL_SHOT=dir (2026-11-13): screenshot the docked calendar (app slid to the calendar half) for a look.
      if (process.env.CAL_SHOT) { await pg.evaluate(() => { const w = document.getElementById('workspace'); w.scrollLeft = w.scrollWidth; }); await pg.waitForTimeout(600);
        await pg.screenshot({ path: path.join(process.env.CAL_SHOT, 'cal-' + name + '.png') });
        const cp = await pg.$('#calPane'); if (cp) await cp.screenshot({ path: path.join(process.env.CAL_SHOT, 'calpane-' + name + '.png') });
        // Midnight shot (2026-11-21, job N): the Meditate → Sleep back-to-back pair.
        if (cp) { await pg.evaluate(() => { try { const a = window.fwCalendar.api(); a.changeView('timeGridDay'); a.gotoDate(luxon.DateTime.now().setZone('America/Los_Angeles').plus({days: 3}).toISODate()); a.scrollToTime('00:00'); } catch (e) {} }); await pg.waitForTimeout(800); await pg.waitForTimeout(400);
          await cp.screenshot({ path: path.join(process.env.CAL_SHOT, 'calpane-night-' + name + '.png') });
          for (let z = 0; z < 4; z++) { await pg.evaluate(() => { const b = document.querySelector('#calPane .fc-cpZoomIn-button'); if (b) b.click(); }); await pg.waitForTimeout(150); }
          await pg.waitForTimeout(300); await pg.evaluate(() => { try { window.fwCalendar.api().scrollToTime('00:00'); } catch (e) {} }); await pg.waitForTimeout(400);
          await cp.screenshot({ path: path.join(process.env.CAL_SHOT, 'calpane-nightzoom-' + name + '.png') });
          for (let z = 0; z < 4; z++) { await pg.evaluate(() => { const b = document.querySelector('#calPane .fc-cpZoomOut-button'); if (b) b.click(); }); await pg.waitForTimeout(150); }
          await pg.evaluate(() => { try { const a = window.fwCalendar.api(); a.today(); a.scrollToTime('08:00'); } catch (e) {} }); await pg.waitForTimeout(300); } }
      // Back-to-back layout (2026-11-21, job N, Julius): touching events stack with a small gap (no inset / offset),
      // a real overlap is Google-style (inset, opaque), a 10-minute event is tall enough for its text and sits on top.
      { const bb = await pg.evaluate(async () => { const out = [], a = window.fwCalendar.api(), wait = ms => new Promise(r => setTimeout(r, ms));
          a.changeView('timeGridDay'); a.gotoDate(luxon.DateTime.now().setZone('America/Los_Angeles').plus({days: 3}).toISODate()); a.scrollToTime('00:00');
          let el = t => [...document.querySelectorAll('#calPanel .fc-timegrid-event')].find(x => x.textContent.includes(t));
          for (let i = 0; i < 60 && !(el('Meditate') && el('Sleep') && el('Walk') && el('Pills')); i++) await wait(50);
          await wait(150);
          const M = el('Meditate'), S = el('Sleep'), W = el('Walk'), P = el('Pills'), B = el('Breakfast');
          if (!M || !S || !W || !P || !B) out.push('back-to-back events not drawn');
          else { const r = x => x.getBoundingClientRect(), gap = r(S).top - r(M).bottom, ins = x => x.parentElement.getAttribute('style'), off = x => r(x).left > r(S).left + 2;
            if (gap < 1.5 || gap > 4) out.push('touching events gap ' + gap.toFixed(1) + ' px (want a small gap)');
            if (Math.abs(r(S).left - r(M).left) > 1 || Math.abs(r(S).right - r(M).right) > 1) out.push('touching events offset like an overlap');
            if (!off(W)) out.push('overlap not Google-style (offset over Sleep)');
            if (!/color\(srgb [\d.]+ [\d.]+ [\d.]+\)$|^rgb\(/.test(getComputedStyle(W).backgroundColor)) out.push('overlapping event not solid: ' + getComputedStyle(W).backgroundColor);
            if (!/^rgb\(|color\(srgb [\d.]+ [\d.]+ [\d.]+\)$/.test(getComputedStyle(S).backgroundColor)) out.push('plain event not solid (Google style, 2026-11-21): ' + getComputedStyle(S).backgroundColor);
            if (r(P).height < 16) out.push('10-minute event too short for its text: ' + r(P).height.toFixed(1));
            if (off(B) || off(P)) out.push('event after a short one got offset: ' + ins(B));
            const zi = x => Number(getComputedStyle(x.parentElement).zIndex) || 0;
            if (zi(P) <= zi(B)) out.push('short event not drawn above the next one');
            // Zoomed out, a short event covering the next one keeps a page-colored edge (2026-11-21 12:48, Julius: "they merge into one").
            if (!/rgb/.test(getComputedStyle(P).boxShadow || '')) out.push('short event has no edge ring: ' + getComputedStyle(P).boxShadow); }
          a.today(); a.scrollToTime('08:00'); await wait(300); return out; });
        if (bb.length) errs.push(...bb); }
      // Gap labels (2026-11-21, Julius): today's stub = Dentist 9–10, Old chore 1–1:30, Standup 3–3:15, Gig 7–9 pm →
      // "3 h", "1 h 30 m", "3 h 45 m" between them; nothing before the first / after the last; click-through; no loop.
      { const gl = await pg.evaluate(async () => { const out = [], a = window.fwCalendar.api(), wait = ms => new Promise(r => setTimeout(r, ms));
          a.changeView('timeGridDay'); a.today(); a.scrollToTime('08:00');
          const labs = () => [...document.querySelectorAll('#calPanel .cp-gap')].map(g => g.textContent);
          for (let i = 0; i < 60 && !labs().includes('3 h 45 m'); i++) await wait(50);
          const L = labs();
          ['3 h', '1 h 30 m', '3 h 45 m'].forEach(t => { if (!L.includes(t)) out.push('gap label missing: ' + t + ' (have ' + L.join(' | ') + ')'); });
          if (L.length !== 3) out.push('gap labels: want 3 today, got ' + L.length + ': ' + L.join(' | '));
          const g = [...document.querySelectorAll('#calPanel .cp-gap')].find(x => x.textContent === '3 h 45 m');
          if (g && getComputedStyle(g).pointerEvents !== 'none') out.push('gap label catches clicks');
          if (g && g.classList.contains('cp-gap-x')) out.push('3 h 45 m gap label hidden at default zoom');
          // Top-right of the gap, fully inside it (2026-11-21 12:37, Julius: "align it to the top right", was cut off).
          if (g && !g.classList.contains('cp-gap-x')) { const gr = g.getBoundingClientRect(), tr = g.firstChild.getBoundingClientRect();
            if (tr.top - gr.top > 6 || gr.right - tr.right > 8) out.push('gap label not top-right');
            if (tr.top < gr.top - 0.5 || tr.bottom > gr.bottom + 0.5 || tr.left < gr.left - 0.5 || tr.right > gr.right + 0.5) out.push('gap label cut off'); }
          const n0 = document.querySelectorAll('#calPanel .cp-gap').length; await wait(400);
          const fresh = [...document.querySelectorAll('#calPanel .cp-gap')]; if (fresh.length !== n0 || !fresh.includes(g)) out.push('gap labels keep redrawing');
          return out; });
        if (gl.length) errs.push(...gl); }
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
          window.fwCalendar.open(); // the old pop-out (📅 now opens full screen, tested below)
          if (!await until(() => visible() && panel.querySelector('.fc-timegrid-event'))) { out.push('open #' + (i + 1) + ': panel or events not shown (' + (panel.querySelector('[data-cal-state]').textContent || 'no state') + ')'); break; }
          if (i === 0) {
            const timed = [...panel.querySelectorAll('.fc-timegrid-event')].find(x => /Dentist/.test(x.textContent));
            if (!timed) out.push('timed event missing: ' + evText());
            else {
              if (!/(^|[^\d:])9(:00)?\s?am/i.test(timed.textContent)) out.push('timed event not at 9:00 Los Angeles time: ' + timed.textContent);
              if (getComputedStyle(timed).backgroundColor !== 'rgb(213, 0, 0)') out.push('timed event not solid in its color (2026-11-21 11:30): ' + getComputedStyle(timed).backgroundColor);
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
            // 3 / 4-day views (2026-11-21, Julius): one button cycles Day → 3D → 4D → Wk → Day; 3D starts on the day shown;
            // ‹ › moves one day; holding the button opens a picker; the view is remembered.
            {
              const api = window.fwCalendar.api(), vb = panel.querySelector('.fc-cpView-button'), st = () => api.view.currentStart.toISOString().slice(0, 10);
              const cols = () => panel.querySelectorAll('.fc-col-header-cell').length;
              if (!vb || !vb.getClientRects().length) out.push('3/4-day: no view button shown');
              else {
                api.next(); await wait(150); const shown = st();
                const seq = []; for (let i = 0; i < 3; i++) { vb.click(); await wait(200); seq.push(api.view.type + ':' + cols()); }
                if (seq.join(',') !== 'timeGrid3:3,timeGridWeek:7,timeGridDay:1') out.push('3/4-day: cycle went ' + seq.join(',')); // 4D removed 2026-11-24
                vb.click(); await wait(200);
                if (st() !== shown) out.push('3/4-day: 3D did not start on the day shown (' + st() + ' vs ' + shown + ')');
                const s0 = st(); panel.querySelector('.fc-next-button').click(); await wait(150);
                const dd = (Date.parse(st()) - Date.parse(s0)) / 864e5; if (dd !== 1) out.push('3/4-day: › moved ' + dd + ' days');
                if (localStorage.getItem('fw.calView') !== 'timeGrid3') out.push('3/4-day: view not remembered');
                vb.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await wait(50);
                // 3D header is one line "Mon 23" (2026-11-24)
                const hc = panel.querySelector('.fc-timeGrid3-view .fc-col-header-cell-cushion');
                if (!hc || getComputedStyle(hc).flexDirection !== 'row' || !/^[A-Z][a-z]{2}\s*\d{1,2}$/.test(hc.textContent.trim())) out.push('3D header not one line: ' + (hc && hc.textContent));
                if (panel.querySelector('.cp-vpick [data-cpv="timeGrid4"]')) out.push('4D still in the picker');
                const pk = panel.querySelector('.cp-vpick [data-cpv="timeGridWeek"]');
                if (!pk) out.push('3/4-day: no picker on hold');
                else { pk.click(); await wait(200); if (api.view.type !== 'timeGridWeek') out.push('3/4-day: picker did not switch'); }
                api.changeView('timeGridDay'); panel.querySelector('.fc-today-button').click(); await wait(200);
              }
            }
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
        window.__calFail = 1; window.fwCalendar.open();
        if (!await until(() => visible() && panel.querySelector('.fc-timegrid-event'), 1500)) out.push('reopen with Google failing: cached events not shown');
        panel.querySelector('[data-cal-refresh]').click();
        if (!await until(() => /Couldn.t load events/.test(panel.querySelector('[data-cal-state]').textContent))) out.push('no error state when loading fails');
        window.__calFail = 0; const r = panel.querySelector('[data-cal-retry]');
        if (!r) out.push('no Retry button'); else { r.click(); if (!await until(() => panel.querySelector('[data-cal-state]').hidden && panel.querySelector('.fc-timegrid-event'))) out.push('Retry did not reload events'); }
        // Empty
        window.__calEmpty = 1; panel.querySelector('[data-cal-refresh]').click();
        if (!await until(() => /No events/.test(panel.querySelector('[data-cal-state]').textContent))) out.push('no empty state');
        window.__calEmpty = 0;
        // Divider drag (2026-11-21, Julius: "resize at will"): with a short all-day list, dragging the line down grows
        // the all-day area and up shrinks it; double-tap goes back to auto.
        panel.querySelector('[data-cal-refresh]').click();
        if (!await until(() => panel.querySelector('.fc-timegrid-event') && panel.querySelector('.cp-adgrip.on'))) out.push('divider: grip not shown');
        else { const g = panel.querySelector('.cp-adgrip'), sc = () => panel.querySelector('.fc-daygrid-body').closest('.fc-scroller'), h0 = sc().clientHeight;
          const pe = (t, y) => g.dispatchEvent(new PointerEvent(t, {bubbles: true, cancelable: true, clientX: 10, clientY: y, pointerId: 7, pointerType: 'touch'}));
          const y = g.getBoundingClientRect().top + 9; pe('pointerdown', y); pe('pointermove', y + 60); pe('pointermove', y + 120); pe('pointerup', y + 120); await wait(120);
          const h1 = sc().clientHeight; if (h1 < h0 + 80) out.push('divider: drag down did not grow the all-day area (' + h0 + ' → ' + h1 + ')');
          const y2 = g.getBoundingClientRect().top + 9; pe('pointerdown', y2); pe('pointermove', y2 - 50); pe('pointermove', y2 - 100); pe('pointerup', y2 - 100); await wait(120);
          if (sc().clientHeight > h1 - 70) out.push('divider: drag up did not shrink it (' + h1 + ' → ' + sc().clientHeight + ')');
          const y3 = g.getBoundingClientRect().top + 9; pe('pointerdown', y3); pe('pointerup', y3); await wait(80); pe('pointerdown', y3); pe('pointerup', y3); await wait(120);
          if (panel.classList.contains('cp-adset') || localStorage.getItem('fw.calAllDayMax')) out.push('divider: double-tap did not reset to auto'); }
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
        if (!await until(() => panel.querySelectorAll('.fc-daygrid-event').length < 10)) out.push('all-day cap: short list did not come back'); // grip always shown since 2026-11-14 (Julius)
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
      // End time always visible on timed events, even one-line / narrow ones (2026-11-21, Julius).
      { const hid = await pg.evaluate(() => [...document.querySelectorAll('#calPanel .fc-timegrid-event:not(.fc-event-mirror) .cp-tend')].filter(e => getComputedStyle(e).display === 'none').map(e => e.closest('.fc-event').textContent.slice(0, 30)));
        if (hid.length) errs.push('end time hidden on: ' + hid.join(' | ')); }
      // Event card border = event color; a real tap outside the open card only closes it on touch (no focus →
      // no phone keyboard), while a mouse click still lands (2026-11-21, Julius).
      {
        const r0 = await pg.evaluate(async () => { const p = document.getElementById('calPanel'); if (!document.body.classList.contains('cal-open')) window.fwCalendar.open();
          for (let i = 0; i < 80 && !p.querySelector('.fc-timegrid-event .cp-ev'); i++) await new Promise(r => setTimeout(r, 50));
          await new Promise(r => setTimeout(r, 400));
          const ev = p.querySelector('.fc-timegrid-event:not(.fc-event-mirror)'); if (!ev) return { err: 'no event' };
          ev.click(); await new Promise(r => setTimeout(r, 120));
          const det = p.querySelector('[data-cal-detail]'); if (det.hidden) return { err: 'card did not open' };
          const evc = det.style.getPropertyValue('--evc'), bc = getComputedStyle(det).borderTopColor;
          const ta = document.createElement('textarea'); ta.id = '__tapTa'; ta.style.cssText = 'position:fixed;left:0;bottom:0;width:60px;height:40px;z-index:99999';
          document.body.appendChild(ta); const r = ta.getBoundingClientRect();
          return { evc, bc, x: r.left + 20, y: r.top + 20 }; });
        if (r0.err) errs.push('card tap-outside: ' + r0.err);
        else {
          if (!r0.evc || /154, 160, 166/.test(r0.bc)) errs.push('card border not the event color (' + r0.evc + ' / ' + r0.bc + ')');
          if (view.hasTouch) await pg.touchscreen.tap(r0.x, r0.y); else await pg.mouse.click(r0.x, r0.y);
          await pg.waitForTimeout(300);
          const r1 = await pg.evaluate(() => { const ta = document.getElementById('__tapTa'), f = document.activeElement === ta; ta.remove(); return { hidden: document.querySelector('#calPanel [data-cal-detail]').hidden, focused: f }; });
          if (!r1.hidden) errs.push('card tap-outside: card stayed open');
          if (view.hasTouch && r1.focused) errs.push('card tap-outside: touch tap also focused the field (keyboard would open)');
          if (!view.hasTouch && !r1.focused) errs.push('card click-outside: mouse click no longer reaches the field');
        }
      }
      // Real input on an event checkbox (2026-11-11 bug: element.click() passed, a real tap didn't toggle).
      {
        await pg.evaluate(async () => { const p = document.getElementById('calPanel'); if (!document.body.classList.contains('cal-open')) window.fwCalendar.open();
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
        window.fwCalendar.open();
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
        // Edit right in the card (2026-11-15 13:08, Julius): no second window; same event id, new title + time
        // (end keeps the length), the card stays open on the saved event; ✎ just focuses the title.
        const id0 = byTitle('Test lunch')[0].eventId;
        const nCreate = calls('calPanelCreateEvent').length;
        evEl('Test lunch').click(); await wait(60);
        const qf = () => det.querySelector('[data-cal-qform]');
        if (!det.querySelector('[data-cal-edit]') || !qf()) out.push('no in-card edit on a main-calendar event');
        else {
          det.querySelector('.cp-etop [data-cal-edit]').click(); await wait(60);
          if (det.querySelector('[data-cal-form]')) out.push('✎ still opened a second edit window');
          if (document.activeElement !== qf().elements.title) out.push('✎ did not focus the title');
          if (qf().elements.title.value !== 'Test lunch' || qf().elements.st.value !== '11:00') out.push('card fields not prefilled');
          if (getComputedStyle(qf().querySelector('.cp-qsave')).display !== 'none') out.push('Save shows before any change');
          const q = (n, v) => { const el = qf().elements[n]; el.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
          q('title', 'Lunch moved'); q('st', '12:00');
          if (qf().elements.et.value !== '13:00') out.push('moving the start did not keep the length: end ' + qf().elements.et.value);
          if (getComputedStyle(qf().querySelector('.cp-qsave')).display === 'none') out.push('no Save after a change');
          qf().querySelector('[data-cal-qsave]').click();
          await until(() => byTitle('Lunch moved').length && !det.hidden && qf() && qf().elements.title.value === 'Lunch moved');
          const e = byTitle('Lunch moved')[0];
          if (!e || e.eventId !== id0) out.push('in-card edit changed the event id (or lost it)');
          else if (!/T12:00/.test(e.start)) out.push('in-card edit did not move the start to 12:00: ' + e.start);
          if (det.hidden || !qf()) out.push('card did not stay open after saving');
          if (calls('calPanelCreateEvent').length !== nCreate || calls('calPanelUpdateEvent').length !== 1) out.push('in-card edit did not update in place (create calls ' + (calls('calPanelCreateEvent').length - nCreate) + ', updates ' + calls('calPanelUpdateEvent').length + ')');
          det.querySelector('[data-cal-detail-close]').click(); await wait(60);
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
        // Google-style popup (2026-11-14, Julius): notes shown; one-tap All day ⇄ timed keeps the card open and comes
        // back to the old time; color swatch saves; ⋮ → Duplicate makes a copy.
        {
          evEl('Dentist').click(); await wait(60);
          if (!/insurance card/.test(det.textContent) || !det.querySelector('.cp-desc a')) out.push('popup: notes / link not shown');
          if (!det.querySelector('.cp-etop [data-cal-edit]') || !det.querySelector('.cp-etop [data-cal-del]')) out.push('popup: no edit / delete icons on top');
          const ad = det.querySelector('[data-cal-act="allday"]');
          if (!ad) out.push('popup: no All day button');
          else {
            ad.click();
            await until(() => byTitle('Dentist').some(x => x.allDay) && !det.hidden && det.querySelector('[data-cal-act="allday"].on'), 3000);
            if (!byTitle('Dentist').some(x => x.allDay)) out.push('popup: All day did not make it all-day');
            else if (det.hidden || !det.querySelector('[data-cal-act="allday"].on')) out.push('popup: card did not stay open after All day');
            else {
              det.querySelector('[data-cal-act="allday"]').click();
              await until(() => !byTitle('Dentist').some(x => x.allDay) && !det.hidden && det.querySelector('[data-cal-act="allday"]:not(.on)'), 3000);
              if (byTitle('Dentist').some(x => x.allDay) || !byTitle('Dentist').every(x => /T09:00/.test(x.start))) out.push('popup: back to timed did not restore 9:00 ' + JSON.stringify(byTitle('Dentist').map(x => x.start)));
            }
          }
          const sw = det.querySelector('[data-cal-act="color"][data-c="5"]');
          if (!sw) out.push('popup: no color swatches');
          else {
            sw.click();
            await until(() => calls('calPanelSetColor').length && !det.hidden && det.querySelector('[data-cal-act="color"][data-c="5"].on'), 3000);
            if (!calls('calPanelSetColor').length) out.push('popup: color not saved');
            else if (det.hidden) out.push('popup: card closed after a color change');
          }
          const nD = byTitle('Dentist').length;
          det.querySelector('[data-cal-act="more"]').click(); await wait(40);
          const dup = det.querySelector('[data-cal-act="dup"]');
          if (!dup) out.push('popup: no Duplicate in ⋮');
          else { dup.click(); await until(() => byTitle('Dentist').length > nD, 3000); if (byTitle('Dentist').length !== nD + 1) out.push('popup: Duplicate made ' + (byTitle('Dentist').length - nD)); }
          await wait(200);
          if (!det.hidden) det.querySelector('[data-cal-detail-close]').click();
          await wait(40);
        }
        // Move to today / tomorrow (2026-11-23, Julius): same time and length, all-day stays all-day; each button only
        // when the event isn't already on that day; none on a done event.
        {
          const Lx = luxon.DateTime, Z = 'America/Los_Angeles', api = window.fwCalendar.api();
          const td = Lx.now().setZone(Z).toISODate(), tm = Lx.fromISO(td).plus({days: 1}).toISODate(), z = s => Lx.fromISO(s, {zone: Z});
          const vd = api.view.activeStart.toISOString().slice(0, 10), vz = Lx.fromISO(vd).toISODate();
          if (vz !== td) out.push('move: docked view is not on today (' + vd + ')');
          else {
            const iso = s => z(s).toISO({suppressMilliseconds: true});
            S.ev.mv1 = {id: 'mv1|' + z(td + 'T14:00').toMillis(), eventId: 'mv1', title: 'Move me', allDay: false, start: iso(td + 'T14:00'), end: iso(td + 'T14:45'), startMs: z(td + 'T14:00').toMillis(), color: '#039be5', colorId: '', cal: 'Main', calId: 'main', editable: true};
            S.ev.mv2 = {id: 'mv2|' + z(td).toMillis(), eventId: 'mv2', title: 'Move day', allDay: true, start: td, end: tm, startMs: z(td).toMillis(), color: '#039be5', colorId: '', cal: 'Main', calId: 'main', editable: true};
            api.refetchEvents();
            await until(() => evEl('Move me') && evEl('Move day'), 3000);
            const btn = k => det.querySelector('[data-cal-act="' + k + '"]');
            evEl('Old chore') && evEl('Old chore').click(); await wait(60);
            if (!det.hidden && (btn('mvtoday') || btn('mvtomorrow'))) out.push('move: a done event shows move buttons');
            if (!det.hidden) det.querySelector('[data-cal-detail-close]').click(); await wait(40);
            evEl('Move me').click(); await wait(60);
            if (btn('mvtoday')) out.push('move: today\'s event shows Move to today');
            if (!btn('mvtomorrow')) out.push('move: no Move to tomorrow on a today event');
            else {
              btn('mvtomorrow').click();
              await until(() => String(S.ev.mv1.start).startsWith(tm), 3000);
              const e = S.ev.mv1;
              if (!String(e.start).startsWith(tm + 'T14:00') || !String(e.end).startsWith(tm + 'T14:45') || e.allDay) out.push('move: tomorrow did not keep 2:00–2:45 ' + e.start + ' ' + e.end);
            }
            await wait(200); if (!det.hidden) det.querySelector('[data-cal-detail-close]').click(); await wait(40);
            evEl('Move day').click(); await wait(60);
            if (!btn('mvtomorrow')) out.push('move: no Move to tomorrow on an all-day event');
            else {
              btn('mvtomorrow').click();
              await until(() => S.ev.mv2.start === tm, 3000);
              if (S.ev.mv2.start !== tm || S.ev.mv2.end !== Lx.fromISO(tm).plus({days: 1}).toISODate() || !S.ev.mv2.allDay) out.push('move: all-day tomorrow wrong ' + JSON.stringify([S.ev.mv2.start, S.ev.mv2.end, S.ev.mv2.allDay]));
            }
            await wait(200); if (!det.hidden) det.querySelector('[data-cal-detail-close]').click(); await wait(40);
            // Back: on tomorrow's view, the moved event offers Move to today (and not tomorrow).
            api.next(); await until(() => evEl('Move me'), 3000);
            if (!evEl('Move me')) out.push('move: moved event not on tomorrow');
            else {
              evEl('Move me').click(); await wait(60);
              if (btn('mvtomorrow')) out.push('move: tomorrow\'s event shows Move to tomorrow');
              if (!btn('mvtoday')) out.push('move: no Move to today on a tomorrow event');
              else {
                btn('mvtoday').click();
                await until(() => String(S.ev.mv1.start).startsWith(td), 3000);
                if (!String(S.ev.mv1.start).startsWith(td + 'T14:00') || !String(S.ev.mv1.end).startsWith(td + 'T14:45')) out.push('move: today did not keep 2:00–2:45 ' + S.ev.mv1.start);
              }
              await wait(200); if (!det.hidden) det.querySelector('[data-cal-detail-close]').click(); await wait(40);
            }
            delete S.ev.mv1; delete S.ev.mv2;
            api.today(); api.refetchEvents(); await wait(300);
          }
        }
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
        window.fwCalendar.open();
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
          window.fwCalendar.open(); await wait(400);
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
          await touch('touchEnd', [p]); await pg.waitForTimeout(300); await pg.evaluate(() => { const d = document.querySelector('#calPanel [data-cal-detail]'); if (!d.hidden) d.querySelector('[data-cal-detail-close]').click();
            // 2026-11-13: a hold now also opens the hold menu (🗑 Delete); check it, then shut it the way a tap outside would.
            const m = document.querySelector('.urg-picker'), del = m && m.querySelector('.urg-del'); if (del) del.click();
            const ask = d.querySelector('[data-cal-del-yes]'); window.__holdMenuDel = !!(del && ask && !d.hidden); if (ask) d.querySelector('[data-cal-detail-close]').click(); const m2 = document.querySelector('.urg-picker'); if (m2) m2.remove(); }); await pg.waitForTimeout(100);
          if (!(await pg.evaluate(() => window.__holdMenuDel))) out.push('hold on Dentist → 🗑 Delete did not ask to delete it'); }
        else { const p = await evPt('Dentist'); await pg.mouse.move(p.x, p.y + 10); await pg.waitForTimeout(150); }
        const rz = await evPt('Dentist', 'resizer'), s1 = await slotPt(day, '11:30'), s2 = await slotPt(day, '12:00');
        if (!rz || !s1) out.push('no resize handle on Dentist');
        else {
          await gesture(rz, { x: rz.x, y: rz.y + 2 * (s2.y - s1.y) }, phone ? 60 : 0); await waitIdle(); await pg.waitForTimeout(200);
          const e = await ev('b-' + day);
          if (!e || !/T10:30/.test(e.start) || !/T12:30/.test(e.end)) out.push('resize did not end Dentist at 12:30: ' + JSON.stringify(e && [e.start, e.end]));
        }
        // Fill gaps (2026-11-24): next day (fresh seed). ⇕ → tap 8:30, tap 14:00 → Dentist (9–10) stretches to the done
        // Old chore's 1:00 start; done / repeating / Events calendar untouched; no new-event form; Undo puts 10:00 back.
        {
          const day2 = await pg.evaluate(async () => { const api = window.fwCalendar.api(); api.incrementDate({ days: 1 }); await new Promise(r => setTimeout(r, 400)); window.__fwFillMain = 'main'; return api.formatIso(api.getDate()).slice(0, 10); });
          await waitIdle(); await pg.waitForTimeout(200);
          const nCreate = await calls('calPanelCreateEvent'), f0 = await pg.evaluate(() => window.__fwFill || 0);
          const btnOk = await pg.evaluate(() => { const b = document.querySelector('#calPanel .fc-cpFill-button'); if (!b) return false; b.click(); return b.classList.contains('cp-on'); });
          if (!btnOk) out.push('fill gaps: no ⇕ button in the header, or it did not turn on');
          await center('09:00'); let p1 = await slotPt(day2, '08:30'); if (p1) await pg.mouse.click(p1.x, p1.y + 2); await pg.waitForTimeout(150);
          await center('13:30'); let p2 = await slotPt(day2, '14:00'); if (p2) await pg.mouse.click(p2.x, p2.y + 2);
          await pg.waitForFunction(f0 => (window.__fwFill || 0) > f0, f0, { timeout: 4000 }).catch(() => out.push('fill gaps: taps did not run a fill'));
          await waitIdle(); await pg.waitForTimeout(200);
          const d = await ev('b-' + day2), c = await ev('c-' + day2), r2 = await ev('r-' + day2), g = await ev('g-' + day2);
          if (!d || !/T09:00/.test(d.start) || !/T13:00/.test(d.end)) out.push('fill gaps: Dentist not 9:00–1:00 ' + JSON.stringify(d && [d.start, d.end]));
          if (!c || !/T13:30/.test(c.end) || !r2 || !/T15:15/.test(r2.end) || !g || !/T21:00/.test(g.end)) out.push('fill gaps: touched a done / repeating / other-calendar event');
          if (await calls('calPanelCreateEvent') !== nCreate) out.push('fill gaps: a tap opened / made a new event');
          const f1 = await pg.evaluate(() => { document.querySelector('[data-fill-bar] [data-fill-b]').click(); return window.__fwFill || 0; });
          await pg.waitForFunction(f1 => (window.__fwFill || 0) > f1, f1, { timeout: 4000 }).catch(() => out.push('fill gaps: Undo did not run'));
          await waitIdle(); const d2 = await ev('b-' + day2);
          if (!d2 || !/T10:00/.test(d2.end)) out.push('fill gaps: Undo did not put Dentist back to 10:00 ' + JSON.stringify(d2 && d2.end));
          if (await pg.evaluate(() => window.fwCalendar.fill.active())) out.push('fill gaps: still picking after the fill');
          await pg.evaluate(async () => { delete window.__fwFillMain; const b = document.querySelector('[data-fill-bar]'); if (b) b.hidden = true; window.fwCalendar.api().incrementDate({ days: -1 }); await new Promise(r => setTimeout(r, 400)); });
          await waitIdle(); await pg.waitForTimeout(200);
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
      // Hold to quick add (2026-11-22, Julius): hold on empty space in a half-calendar all-day cell → blank row in that
      // cell; type + Enter = all-day task on that day; a quick tap still opens New event (touch) / no row.
      {
        await pg.evaluate(async () => { const cal = window.fwCalendar.api(); cal.changeView('timeGridDay', '2026-11-20'); await new Promise(r => setTimeout(r, 400)); });
        const c = await pg.evaluate(() => { const d = document.querySelector('#calPanel .fc-timegrid .fc-daygrid-day[data-date="2026-11-20"]'); if (!d) return null;
          const b = d.getBoundingClientRect(); return { x: b.x + b.width - 30, y: b.bottom - 4 }; });
        if (!c) errs.push('hold add: all-day cell not found');
        else {
          if (name === 'phone') {
            const cdp = await pg.context().newCDPSession(pg);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] }); await pg.waitForTimeout(900);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else { await pg.mouse.move(c.x, c.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up(); }
          await pg.waitForTimeout(300);
          const st = await pg.evaluate(() => ({ row: !!document.querySelector('#calPanel .cp-adqa[data-adqa="2026-11-20"] input'), form: !!document.querySelector('#calPanel [data-cal-form]:not([hidden])') && !document.querySelector('#calPanel .cp-detail[hidden]') }));
          if (!st.row) errs.push('hold add: no blank row after a hold');
          else {
            await pg.keyboard.type('Held task'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(900);
            const ok = await pg.evaluate(() => Object.values(window.__cal.ev).some(e => e.title === 'Held task' && e.allDay && String(e.start).slice(0, 10) === '2026-11-20'));
            if (!ok) errs.push('hold add: Enter did not make the all-day task');
            const still = await pg.evaluate(() => { const i = document.querySelector('#calPanel .cp-adqa input'); return !!i && i.value === ''; });
            if (!still) errs.push('hold add: blank row not ready for the next one');
            await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
            if (await pg.evaluate(() => !!document.querySelector('#calPanel .cp-adqa'))) errs.push('hold add: Esc did not close the row');
          }
          // Tap to quick add (2026-11-23, Julius): a plain tap / click on the empty all-day cell opens the same row (no form).
          await pg.waitForTimeout(800);
          const c2 = await pg.evaluate(() => { const d = document.querySelector('#calPanel .fc-timegrid .fc-daygrid-day[data-date="2026-11-20"]'); const b = d.getBoundingClientRect(); return { x: b.x + b.width - 30, y: b.bottom - 4 }; });
          if (name === 'phone') { const cdp = await pg.context().newCDPSession(pg);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c2.x, y: c2.y }] }); await pg.waitForTimeout(60);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else { await pg.mouse.click(c2.x, c2.y); }
          await pg.waitForTimeout(400);
          const tp = await pg.evaluate(() => ({ row: !!document.querySelector('#calPanel .cp-adqa[data-adqa="2026-11-20"] input'), focus: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.cp-adqa')), form: !!document.querySelector('#calPanel [data-cal-form]') && !document.querySelector('#calPanel .cp-detail[hidden]') }));
          if (!tp.row) errs.push('tap add: no blank row after a tap');
          else {
            if (tp.form) errs.push('tap add: New event form opened too');
            if (!tp.focus) errs.push('tap add: row not focused');
            await pg.keyboard.type('Tapped task'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(900);
            const ok = await pg.evaluate(() => Object.values(window.__cal.ev).some(e => e.title === 'Tapped task' && e.allDay && String(e.start).slice(0, 10) === '2026-11-20'));
            if (!ok) errs.push('tap add: Enter did not make the all-day task');
            await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
          }
        }
        await pg.evaluate(() => window.fwCalendar.api().today());
      }
      // Linked tasks (2026-11-23, Julius): a task line dropped on the calendar = an event linked by data-tid; the line
      // stays; drop again = another occurrence; badge counts done; renaming either side renames the other.
      if (name === 'desktop') {
        const lk = await pg.evaluate(async () => { window.__lkSrc = null;
          const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
          const cal = window.fwCalendar.api(); cal.changeView('timeGridDay', '2026-11-20'); await wait(600);
          document.querySelector('[data-ctab="focus"]')?.click(); await wait(600);
          const kimEd = document.querySelector('#kimScroll .kim-editor');
          if (!kimEd) return ['no Keep In Mind editor'];
          kimEd.insertAdjacentHTML('beforeend', '<div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">Wax board</span></div>');
          const src = [...kimEd.querySelectorAll('.check-line')].find(l => l.textContent.trim() === 'Wax board');
          if (!src) return ['no source line'];
          const ed = src.closest('.kim-editor'), name0 = src.textContent.trim();
          const lane = document.querySelector('#calPanel .fc-timegrid-slot-lane[data-time="11:00:00"]'), col = document.querySelector('#calPanel .fc-timegrid-col[data-date="2026-11-20"]');
          if (!lane || !col) return ['no lane / column'];
          const sc = lane.closest('.fc-scroller'); sc.scrollTop += lane.getBoundingClientRect().top - sc.getBoundingClientRect().top - 60; await wait(150);
          const lr = lane.getBoundingClientRect(), cr = col.getBoundingClientRect();
          const t = window.fwCalTaskTarget(cr.left + cr.width / 2, lr.top + 2);
          if (!t || t.allDay || t.time !== '11:00' || t.date !== '2026-11-20') out.push('timed target ' + JSON.stringify(t));
          window.fwCalTaskDrop(src, ed, t); await wait(900);
          const tid = src.dataset.tid, mine = () => Object.values(window.__cal.ev).filter(e => e.tid && e.tid === tid);
          if (!tid || mine().length !== 1 || mine()[0].allDay || mine()[0].title !== name0) out.push('timed drop made ' + JSON.stringify(mine()));
          else { const e = mine()[0], mins = (Date.parse(e.end) - Date.parse(e.start)) / 60000; if (mins !== 30) out.push('timed length ' + mins); }
          const ad = document.querySelector('#calPanel .fc-timegrid .fc-daygrid-day[data-date="2026-11-20"]'), ar = ad.getBoundingClientRect();
          const t2 = window.fwCalTaskTarget(ar.right - 20, ar.bottom - 4);
          if (!t2 || !t2.allDay || t2.date !== '2026-11-20') out.push('all-day target ' + JSON.stringify(t2));
          window.fwCalTaskDrop(src, ed, t2); await wait(900);
          if (mine().length !== 2 || !mine().some(e => e.allDay)) out.push('second drop: ' + mine().length);
          if (src.dataset.tid !== tid || !src.isConnected || src.textContent.trim() !== name0) out.push('source line changed by the drop');
          window.fwLinkRefresh(); await wait(300);
          const css = (document.getElementById('fwLinkCss') || {}).textContent || '';
          if (!css.includes('"' + tid + '"') || !/0\/2/.test(css)) out.push('badge: ' + css.slice(0, 160));
          // Renamed on the calendar → the line follows, and the other occurrence too.
          const e0 = mine().find(e => !e.allDay); e0.title = name0 + ' warm';
          window.fwCalendar.refresh(); await wait(1500);
          if (src.textContent.trim() !== name0 + ' warm') out.push('calendar rename did not reach the line: ' + src.textContent.trim());
          if (!mine().every(e => e.title === name0 + ' warm')) out.push('other occurrence not renamed: ' + mine().map(e => e.title).join(' | '));
          // Renamed on the line → open events follow.
          src.querySelector('.check-text').textContent = name0 + ' (pair)';
          window.fwLinkRefresh(); await wait(600);
          if (!mine().every(e => e.title === name0 + ' (pair)' && e.tt === name0 + ' (pair)')) out.push('line rename did not reach events: ' + mine().map(e => e.title).join(' | '));
          // Badge also counts the database copy (days not loaded here); never the same event twice.
          window.fwCalCopyLinked = () => [{id: 'lk-copy-1', tid, title: 'x', allDay: true, start: '2027-01-05', end: '2027-01-06', startMs: Date.parse('2027-01-05T08:00:00Z'), done: true},
            Object.assign({}, mine()[0])];
          window.fwLinkRefresh(); await wait(300);
          let css2 = (document.getElementById('fwLinkCss') || {}).textContent || '';
          if (!/1\/3 ✓/.test(css2)) out.push('copy badge: ' + css2.slice(0, 200));
          delete window.fwCalCopyLinked; window.fwLinkRefresh(); await wait(300);
          // Tap the badge (just after the text) → the calendar goes to the occurrence's day.
          cal.gotoDate('2026-11-05'); await wait(400); window.__fwLinkJumped = null;
          const tx = src.querySelector('.check-text'), rg = document.createRange(); rg.selectNodeContents(tx);
          const lr2 = [...rg.getClientRects()].pop(), bx = lr2.right + 12, by = lr2.top + lr2.height / 2;
          tx.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, clientX: bx, clientY: by}));
          await wait(700);
          const at = cal.view.currentStart, atDay = at.getFullYear() + '-' + String(at.getMonth() + 1).padStart(2, '0') + '-' + String(at.getDate()).padStart(2, '0');
          if (!window.__fwLinkJumped || window.__fwLinkJumped.tid !== tid || atDay !== '2026-11-20' || !window.fwCalendar.isFull()) out.push('badge tap (full ' + window.fwCalendar.isFull() + '): ' + JSON.stringify(window.__fwLinkJumped) + ' view ' + atDay);
          // A tap in the middle of the text is a normal tap (no jump).
          window.__fwLinkJumped = null;
          tx.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, clientX: lr2.left + 4, clientY: by}));
          await wait(200);
          if (window.__fwLinkJumped) out.push('text tap jumped');
          window.__lkSrc = {tid, name: name0 + ' (pair)'};
          return out;
        });
        lk.forEach(x => errs.push('linked: ' + x));
        // Real gesture: hold the line, drag it onto 2 pm.
        const pts = await pg.evaluate(async () => {
          const w = ms => new Promise(r => setTimeout(r, ms)), ws = document.getElementById('workspace');
          window.fwCalendar.close(); await w(900); if (window.fwCeRedraw) window.fwCeRedraw(); await w(500); ws.scrollLeft = ws.scrollWidth; await w(500); // docked: middle + calendar
          window.fwCalendar.api().changeView('timeGridDay', '2026-11-20'); await w(500);
          window.__probe = {docked: window.fwCalendar.isDocked()};
          const src = [...document.querySelectorAll('#kimScroll .check-line')].find(l => l.dataset.tid === (window.__lkSrc || {}).tid);
          const lane = document.querySelector('#calPanel .fc-timegrid-slot-lane[data-time="14:00:00"]'), col = document.querySelector('#calPanel .fc-timegrid-col[data-date="2026-11-20"]');
          if (!src || !lane || !col) return null;
          const sc = lane.closest('.fc-scroller'); sc.scrollTop += lane.getBoundingClientRect().top - sc.getBoundingClientRect().top - sc.clientHeight / 2;
          const s = src.querySelector('.check-text').getBoundingClientRect(), l = lane.getBoundingClientRect(), c = col.getBoundingClientRect();
          return { sx: s.left + Math.min(40, s.width / 2), sy: s.top + s.height / 2, tx: c.left + c.width / 2, ty: l.top + 3, vis: s.width > 0 && s.top >= 0 && s.bottom <= innerHeight && s.left >= 0 && s.right <= innerWidth && !!document.elementFromPoint(s.left + Math.min(40, s.width / 2), s.top + s.height / 2) };
        });
        if (!pts || !pts.vis) errs.push('linked drag: source line not on screen (' + JSON.stringify(pts) + ') ' + JSON.stringify(await pg.evaluate(() => window.__probe)));
        else {
          const before = await pg.evaluate(() => Object.values(window.__cal.ev).filter(e => e.tid === (window.__lkSrc || {}).tid).length);
          await pg.mouse.move(pts.sx, pts.sy); await pg.mouse.down(); await pg.waitForTimeout(800);
          const hd = await pg.evaluate(({sx, sy}) => { const el = document.elementFromPoint(sx, sy); return 'ready ' + !!document.querySelector('.tc-holdready') + ' at ' + (el && [el, el.parentElement, el.parentElement && el.parentElement.parentElement].map(x => x && (x.tagName + '#' + x.id + '.' + x.className)).join(' < ')) + ' txt ' + (el && el.textContent.slice(0, 40)) + ' holdMs ' + window.fwHoldMs(); }, pts);
          for (let i = 1; i <= 12; i++) { await pg.mouse.move(pts.sx + (pts.tx - pts.sx) * i / 12, pts.sy + (pts.ty - pts.sy) * i / 12); await pg.waitForTimeout(30); }
          const lbl = await pg.evaluate(({tx, ty}) => { const d = document.querySelector('.tc-drop.tc-drop-cal'); const el = document.elementFromPoint(tx, ty);
            return d ? d.dataset.lbl : 'none · dragging ' + document.body.classList.contains('tc-dragging') + ' · ghost ' + !!document.querySelector('.tc-ghost') + ' · at ' + (el && (el.className || el.tagName)); }, pts);
          await pg.mouse.up(); await pg.waitForTimeout(1000);
          const r = await pg.evaluate(() => { const l = Object.values(window.__cal.ev).filter(e => e.tid === (window.__lkSrc || {}).tid);
            return { n: l.length, two: l.some(e => !e.allDay && /T14:00/.test(e.start)), kept: [...document.querySelectorAll('.check-line')].some(x => x.dataset.tid === (window.__lkSrc || {}).tid && x.closest('.kim-editor,.ref-cell')) }; });
          if (!/2:00/.test(lbl)) errs.push('linked drag: label while over 2 pm was ' + JSON.stringify(lbl) + ' · ' + hd);
          if (r.n !== before + 1 || !r.two) errs.push('linked drag: ' + JSON.stringify(r) + ' (before ' + before + ')');
          if (!r.kept) errs.push('linked drag: the line left its cell');
        }
        await pg.evaluate(() => window.fwCalendar.api().today());
      }
      // 📅 button = the newer full-screen calendar, phone too (2026-11-24, Julius: "do the most recent one").
      {
        const b = await pg.evaluate(async (name) => { const wait = ms => new Promise(r => setTimeout(r, ms)); window.fwCalendar.close(); await wait(700);
          const btn = [...document.querySelectorAll('[data-cal-open]')].find(x => x.offsetParent); if (!btn) return 'no visible 📅 button';
          btn.click(); await wait(900); const ok = window.fwCalendar.isFull() && document.body.classList.contains('cal-full');
          if (name === 'phone') return ok ? 'shot' : 'not full';
          window.fwCalendar.close(); await wait(700); return ok ? '' : 'not full'; }, name);
        if (b === 'shot') { await pg.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/cal-full-phone.png' }); await pg.evaluate(async () => { window.fwCalendar.close(); await new Promise(r => setTimeout(r, 700)); }); }
        else if (b) errs.push('📅 button: ' + b);
      }
      // 3-day swipe like Google (2026-11-24, Julius): the days follow the finger; release = as many days as dragged,
      // a short quick flick = one day; a vertical scroll never pans.
      if (name === 'phone') {
        const w = await pg.evaluate(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); window.fwCalendar.close(); await wait(700); document.getElementById('workspace').scrollLeft = 0; await wait(300);
          window.fwCalendar.open(); await wait(700); const api = window.fwCalendar.api(); api.changeView('timeGrid3', '2026-11-20'); await wait(500);
          const c = document.querySelector('#calPanel td.fc-timegrid-col[data-date]'), r = c && c.getBoundingClientRect(), b = document.querySelector('#calPanel .fc-timegrid-body').getBoundingClientRect();
          return r ? { w: r.width, x: r.left + r.width * 2.5, y: b.top + 120 } : null; });
        if (!w) errs.push('3D swipe: no column');
        else {
          const cdp = await pg.context().newCDPSession(pg), T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
          const st = () => pg.evaluate(() => window.fwCalendar.api().view.currentStart.toISOString().slice(0, 10));
          const drag = async (dx, dy, steps, gap) => { await T('touchStart', w.x, w.y); for (let i = 1; i <= steps; i++) { await T('touchMove', w.x + dx * i / steps, w.y + dy * i / steps); await pg.waitForTimeout(gap); } await T('touchEnd'); await pg.waitForTimeout(500); };
          let s0 = await st();
          await T('touchStart', w.x, w.y); for (let i = 1; i <= 8; i++) { await T('touchMove', w.x - w.w * 0.9 * i / 8, w.y); await pg.waitForTimeout(30); }
          const mid = await pg.evaluate(() => (document.querySelector('#calPanel td.fc-timegrid-col[data-date]').style.transform || ''));
          await T('touchEnd'); await pg.waitForTimeout(500);
          if (!/translateX\(-/.test(mid)) errs.push('3D swipe: days did not follow the finger (' + mid + ')');
          let d = (Date.parse(await st()) - Date.parse(s0)) / 864e5; if (d !== 1) errs.push('3D swipe: ~1 column moved ' + d + ' days');
          s0 = await st(); await drag(w.w * 1.7, 0, 10, 30);
          d = (Date.parse(await st()) - Date.parse(s0)) / 864e5; if (d !== -2) errs.push('3D swipe: ~2 columns right moved ' + d + ' days');
          s0 = await st(); await drag(-55, 0, 3, 16);
          d = (Date.parse(await st()) - Date.parse(s0)) / 864e5; if (d !== 1) errs.push('3D swipe: quick flick moved ' + d + ' days');
          s0 = await st(); await drag(25, -200, 10, 20);
          d = (Date.parse(await st()) - Date.parse(s0)) / 864e5; if (d !== 0) errs.push('3D swipe: vertical scroll moved ' + d + ' days');
          const left = await pg.evaluate(() => [...document.querySelectorAll('#calPanel td.fc-timegrid-col[data-date], #calPanel th.fc-col-header-cell')].some(el => el.style.transform || el.style.clipPath));
          if (left) errs.push('3D swipe: transforms left behind');
        }
        await pg.evaluate(async () => { const api = window.fwCalendar.api(); api.changeView('timeGridDay'); api.today(); window.fwCalendar.close(); await new Promise(r => setTimeout(r, 600)); try { localStorage.removeItem('fw.calView'); } catch (e) {} });
      }
      // Half view (2026-11-13, Julius): computer = each column half the screen; opens on History + middle,
      // scrolled right = middle + calendar.
      {
        const hv = await pg.evaluate(async () => {
          const wait = ms => new Promise(r => setTimeout(r, ms)), out = [];
          const ws = document.getElementById('workspace');
          if (!ws.classList.contains('ws-halves')) return ['half view not on'];
          ws.scrollLeft = 0; await wait(200);
          const r = id => document.getElementById(id).getBoundingClientRect(), W = ws.getBoundingClientRect();
          const t = r('todayPane'), j = r('journalPane');
          if (Math.abs(t.width - W.width / 2) > 3) out.push('History not half the screen: ' + t.width + ' / ' + W.width);
          if (Math.abs(j.right - W.right) > 3) out.push('middle column not at the right edge: ' + j.right + ' / ' + W.right);
          ws.scrollLeft = ws.scrollWidth; await wait(300);
          const j2 = r('journalPane'), c2 = r('calPane');
          if (Math.abs(j2.left - W.left) > 3) out.push('scrolled right: middle not on the left: ' + j2.left);
          if (Math.abs(c2.right - W.right) > 3 || Math.abs(c2.width - W.width / 2) > 3) out.push('scrolled right: calendar not the right half: ' + c2.left + '-' + c2.right);
          ws.scrollLeft = 0; await wait(200);
          // Options → Columns (this device): 3 columns turns it off, Half view back on.
          const sel = document.getElementById('halvesMode');
          sel.value = '0'; sel.dispatchEvent(new Event('change')); await wait(150);
          if (ws.classList.contains('ws-halves')) out.push('Options "3 columns" did not turn it off');
          sel.value = '1'; sel.dispatchEvent(new Event('change')); await wait(150);
          if (!ws.classList.contains('ws-halves')) out.push('Options "Half view" did not turn it back on');
          return out;
        });
        errs.push(...hv.map(x => 'half view: ' + x));
        // Phone swipe (2026-11-13, Julius: "sliding right doesn't work"): a real finger swipe moves between the halves,
        // starting on History, the middle column and (going back) the calendar.
        if (name === 'phone') {
          const cdp = await pg.context().newCDPSession(pg);
          await pg.evaluate(() => window.fwCalendar.close()); await pg.waitForTimeout(900);
          const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
          const swipe = async (x, y, dx) => { await T('touchStart', x, y); for (let i = 1; i <= 12; i++) { await T('touchMove', x + dx * i / 12, y); await pg.waitForTimeout(16); } await T('touchEnd'); await pg.waitForTimeout(700); return pg.evaluate(() => document.getElementById('workspace').scrollLeft); };
          for (const [x, y] of [[100, 450], [300, 450], [300, 700]]) {
            await pg.evaluate(() => { document.getElementById('workspace').scrollLeft = 0; }); await pg.waitForTimeout(100);
            const sl = await swipe(x, y, -260);
            if (sl < 150) errs.push('half view: swipe left at ' + x + ',' + y + ' did not reach the calendar (' + sl + ')');
          }
          // 2026-11-13: a sideways swipe ON the docked calendar changes its day (the app stays); sliding back starts
          // from the search line above it (or anywhere left of the calendar).
          {
            await pg.evaluate(() => { const ws = document.getElementById('workspace'); ws.scrollLeft = ws.scrollWidth; }); await pg.waitForTimeout(150);
            const d0 = await pg.evaluate(() => window.fwCalendar.api().view.currentStart.toISOString());
            const sl = await swipe(300, 450, 160);
            const d1 = await pg.evaluate(() => window.fwCalendar.api().view.currentStart.toISOString());
            if (d1 === d0) errs.push('half view: swipe on the calendar did not change the day');
            if (sl < 150) errs.push('half view: swipe on the calendar slid the app (' + sl + ')');
            await pg.evaluate(() => window.fwCalendar.api().today()); await pg.waitForTimeout(200);
          }
          // Empty grid (2026-11-15, Julius): a quick tap opens New event, a hold doesn't (no fight with scrolling).
          {
            await pg.evaluate(() => { const ws = document.getElementById('workspace'); ws.scrollLeft = ws.scrollWidth; window.fwCalendar.api().today(); window.fwCalendar.api().scrollToTime('05:00:00'); const d = document.querySelector('#calPanel [data-cal-detail]'); d.hidden = true; }); await pg.waitForTimeout(500);
            const pt = await pg.evaluate(() => { const c = document.querySelector('#calPanel .fc-timegrid-col[data-date] .fc-timegrid-col-frame'), r = c.getBoundingClientRect(), sl = [...document.querySelectorAll('#calPanel .fc-timegrid-slot-lane[data-time="05:30:00"],#calPanel .fc-timegrid-slot-lane[data-time="05:00:00"]')][0].getBoundingClientRect(); return { x: r.x + r.width * 0.85, y: sl.y + sl.height / 2 }; });
            const formOpen = () => pg.evaluate(() => { const d = document.querySelector('#calPanel [data-cal-detail]'); return !d.hidden && !!d.querySelector('[data-cal-form]'); });
            await T('touchStart', pt.x, pt.y); await pg.waitForTimeout(900); await T('touchEnd'); await pg.waitForTimeout(500);
            if (await formOpen()) errs.push('empty grid: holding opened New event');
            await T('touchStart', pt.x, pt.y); await pg.waitForTimeout(60); await T('touchEnd'); await pg.waitForTimeout(500);
            if (!(await formOpen())) errs.push('empty grid: a quick tap did not open New event');
            await pg.evaluate(() => { const c = document.querySelector('#calPanel [data-cal-detail] [data-cal-detail-close]'); if (c) c.click(); else document.querySelector('#calPanel [data-cal-detail]').hidden = true; }); await pg.waitForTimeout(400);
          }
          // Scroll ≠ pick up (2026-11-14, Julius): a finger that starts on an event and moves right away is a scroll
          // (nothing picked up, even if it then rests past the hold time); holding still first still picks it up.
          {
            await pg.evaluate(() => { const ws = document.getElementById('workspace'); ws.scrollLeft = ws.scrollWidth; window.fwCalendar.api().today(); window.__fwScrollNotDrag = 0; }); await pg.waitForTimeout(400);
            const ev = await pg.evaluate(() => { const e = [...document.querySelectorAll('#calPanel .fc-timegrid-event')].find(x => /Dentist/.test(x.textContent)); if (!e) return null; e.scrollIntoView({block: 'center'}); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(14, r.height / 2) }; });
            if (!ev) errs.push('scroll vs drag: Dentist event not found');
            else {
              await pg.waitForTimeout(200);
              let picked = false;
              await T('touchStart', ev.x, ev.y);
              for (let i = 1; i <= 6; i++) { await T('touchMove', ev.x, ev.y - 12 * i); await pg.waitForTimeout(20); }
              await pg.waitForTimeout(900);
              for (let i = 1; i <= 4; i++) { await T('touchMove', ev.x, ev.y - 72 - 10 * i); await pg.waitForTimeout(20); picked = picked || await pg.evaluate(() => !!document.querySelector('.fc-event-mirror,.fc-event-dragging')); }
              await T('touchEnd'); await pg.waitForTimeout(600);
              if (picked) errs.push('scroll vs drag: scrolling from an event picked it up');
              if (!(await pg.evaluate(() => window.__fwScrollNotDrag))) errs.push('scroll vs drag: the early move was not treated as a scroll');
            }
          }
          // Dragged out and let go (2026-11-16, Julius: "it floats, even after I let go"): no floating copy stays behind.
          {
            const ev = await pg.evaluate(() => { const e = [...document.querySelectorAll('#calPanel .fc-timegrid-event')].find(x => /Dentist/.test(x.textContent)); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(14, r.height / 2) }; });
            if (ev) {
              await T('touchStart', ev.x, ev.y); await pg.waitForTimeout(800);
              let picked = false;
              for (let i = 1; i <= 8; i++) { await T('touchMove', ev.x - 4 * i, ev.y - (ev.y - 8) * i / 8); await pg.waitForTimeout(30); picked = picked || await pg.evaluate(() => !!document.querySelector('.fc-event-dragging')); }
              await T('touchEnd'); await pg.waitForTimeout(1400);
              const left = await pg.evaluate(() => [...document.querySelectorAll('.fc-event-dragging')].filter(el => el.style.position === 'fixed').length);
              if (!picked) errs.push('drag out: holding the event did not pick it up');
              if (left) errs.push('drag out: ' + left + ' floating copy stayed after letting go');
              // A stuck copy from any other path is swept too.
              await pg.evaluate(() => { const m = document.createElement('div'); m.className = 'fc-event fc-event-dragging'; m.style.cssText = 'position:fixed;pointer-events:none;top:10px;left:10px'; document.querySelector('#calPanel .fc').appendChild(m); });
              await T('touchStart', 20, 300); await T('touchEnd'); await pg.waitForTimeout(1300);
              if (await pg.evaluate(() => !!document.querySelector('.fc-event-dragging'))) errs.push('drag out: stuck copy was not swept');
              await pg.evaluate(() => window.fwCalendar.api().refetchEvents()); await pg.waitForTimeout(500);
            }
          }
          for (const [x, y] of [[300, 60], [100, 450]]) {
            await pg.evaluate(() => { const ws = document.getElementById('workspace'); ws.scrollLeft = ws.scrollWidth; }); await pg.waitForTimeout(100);
            const sl = await swipe(x, y, 260);
            if (sl > 50) errs.push('half view: swipe right at ' + x + ',' + y + ' did not go back (' + sl + ')');
          }
        }
      }
      // Computer wheel slide (2026-11-14, Julius: "calendar does not appear when I scroll right"): small sideways wheel
      // steps over the middle column must move the app to the calendar half (the snap used to pull each one back).
      if (name === 'desktop') {
        await pg.evaluate(() => { window.fwCalendar.close(); document.getElementById('workspace').scrollLeft = 0; }); await pg.waitForTimeout(900);
        await pg.mouse.move(view.width * 0.75, view.height / 2);
        for (let i = 0; i < 16; i++) { await pg.mouse.wheel(60, 0); await pg.waitForTimeout(16); }
        await pg.waitForTimeout(900);
        const ws = await pg.evaluate(() => { const w = document.getElementById('workspace'); return [w.scrollLeft, w.scrollWidth - w.clientWidth]; });
        if (ws[0] < ws[1] - 3) errs.push('wheel slide right did not reach the calendar: ' + ws.join(' / '));
        if (await pg.evaluate(() => document.body.classList.contains('cal-full'))) errs.push('wheel slide to the calendar overshot into full screen');
        await pg.evaluate(() => { document.getElementById('workspace').scrollLeft = 0; }); await pg.waitForTimeout(300);
      }
      // Full-screen calendar (2026-11-14, Julius): at the half-screen calendar, one more slide left → big calendar
      // full screen; starts in Day, remembers Day / Week; backlog beside it with full task names; ✕ / Esc / slide back.
      {
        const prep = async () => { await pg.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); window.fwCalendar.close(); await w(900); if (window.fwCeRedraw) window.fwCeRedraw(); await w(500); const ws = document.getElementById('workspace'); ws.scrollLeft = ws.scrollWidth; await w(400); }); };
        const st = () => pg.evaluate(() => { const p = document.getElementById('calPanel'), bl = p.querySelector('.cp-bl'), t = p.querySelector('.cp-bl .cp-blt');
          return { full: document.body.classList.contains('cal-full'), w: Math.round(p.getBoundingClientRect().width), vw: innerWidth, view: window.fwCalendar.api().view.type,
            bl: !!bl && !bl.hidden && !!bl.closest('#calPanel') && bl.getBoundingClientRect().width > 100, wrap: t ? getComputedStyle(t).whiteSpace : 'normal', docked: window.fwCalendar.isDocked() }; });
        await pg.evaluate(() => { localStorage.removeItem('fw.calFullView'); localStorage.removeItem('fw.calFullBl'); });
        await prep();
        // Day colors are full screen only (half-screen tried + reverted 2026-11-15, Julius: "too much").
        // 2026-11-21 (Julius): no tint on the timeline; the sky gradient runs down the hour-label strip instead.
        { const sun = await pg.evaluate(() => { const c = document.querySelector('#calPanel.cp-docked .fc-timegrid-col[data-date]'), l = document.querySelector('#calPanel.cp-docked .fc-timegrid-slot-label[data-time]'); return c && l ? { col: getComputedStyle(c).backgroundImage, lab: getComputedStyle(l).backgroundImage, mk: !!document.querySelector('#calPanel.cp-docked .cp-sunmk') } : null; });
          if (!sun) errs.push('docked calendar: no column / hour label');
          else { if (/gradient/.test(sun.col)) errs.push('docked calendar: timeline still tinted');
            if (!/gradient/.test(sun.lab)) errs.push('docked calendar: hour labels have no sky gradient');
            if (!sun.mk) errs.push('docked calendar: no sunrise / sunset line'); } }
        // Docked divider (2026-11-22, Julius: maintenance batch): the line between the all-day list and the timeline
        // can be grabbed (nothing on top of it) and dragged in the half-screen calendar too.
        { const r = await pg.evaluate(async () => { const w = ms => new Promise(res => setTimeout(res, ms)); const p = document.querySelector('#calPanel.cp-docked'); if (!p) return 'no docked calendar';
            const g = p.querySelector('.cp-adgrip.on'); if (!g) return 'grip not shown'; const b = g.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
            const hit = document.elementFromPoint(cx, cy); if (hit !== g) return 'grip covered by ' + (hit ? hit.tagName + '.' + hit.className : 'nothing') + ' at ' + Math.round(cy);
            const sc = () => p.querySelector('.fc-daygrid-body').closest('.fc-scroller'); const line = sc().getBoundingClientRect().bottom; if (Math.abs(line - cy) > 6) return 'grip not on the line (' + Math.round(cy) + ' vs ' + Math.round(line) + ')';
            const h0 = sc().clientHeight, pe = (t, y) => g.dispatchEvent(new PointerEvent(t, {bubbles: true, cancelable: true, clientX: cx, clientY: y, pointerId: 9, pointerType: 'touch'}));
            pe('pointerdown', cy); pe('pointermove', cy + 40); pe('pointermove', cy + 80); pe('pointerup', cy + 80); await w(150);
            const h1 = sc().clientHeight; window.fwCalendar && localStorage.removeItem('fw.calAllDayMax'); p.classList.remove('cp-adset');
            return h1 >= h0 + 50 ? '' : 'drag did not grow the all-day area (' + h0 + ' → ' + h1 + ')'; });
          if (r) errs.push(name + ' docked divider: ' + r); }
        // Full time range on a card cut off by midnight (2026-11-15 12:54, Julius): "Sat 10 PM – 7:45 AM", not "12 AM".
        { const r = await pg.evaluate(async () => { const api = window.fwCalendar.api(), d0 = api.view.currentStart.toISOString().slice(0, 10);
            const y = new Date(api.view.currentStart.getTime() - 864e5).toISOString().slice(0, 10);
            const ev = api.addEvent({ id: 'smk-x', title: 'Chill X', start: y + 'T22:00:00', end: d0 + 'T07:45:00' });
            await new Promise(r => setTimeout(r, 300));
            const c = [...document.querySelectorAll('#calPanel .fc-timegrid-event')].find(x => /Chill X/.test(x.textContent));
            const t = c ? c.querySelector('.cp-ev-m').textContent : 'no card'; ev.remove(); return t; });
          if (!/^\w{3} 10\s?PM – 7:45\s?AM$/i.test(r.replace(/ /g, ' '))) errs.push('cut-off card time range: ' + JSON.stringify(r)); }
        // Tap outside the event card closes it (2026-11-14, Julius), e.g. on the column left of the calendar.
        {
          const ev = await pg.evaluate(() => { const e = [...document.querySelectorAll('#calPanel .fc-timegrid-event')].find(x => /Dentist/.test(x.textContent)); if (!e) return null; e.scrollIntoView({block: 'center'}); const r = e.getBoundingClientRect(); return { x: r.x + r.width * 0.7, y: r.y + r.height / 2 }; });
          if (!ev) errs.push('card close: Dentist not found');
          else {
            await pg.waitForTimeout(200); await pg.mouse.click(ev.x, ev.y); await pg.waitForTimeout(400);
            if (await pg.evaluate(() => document.querySelector('#calPanel [data-cal-detail]').hidden)) errs.push('card close: tapping the event did not open its card');
            // Half calendar (2026-11-15 13:25, Julius): the card may be wider than its column, stays on screen and on top.
            { const r = await pg.evaluate(() => { const d = document.querySelector('#calPanel [data-cal-detail]'), b = d.getBoundingClientRect(), col = document.getElementById('calPanel').getBoundingClientRect();
                const top = document.elementFromPoint(b.left + b.width / 2, b.top + 12);
                return { w: Math.round(b.width), col: Math.round(col.width), vw: innerWidth, vh: innerHeight, l: b.left, r: b.right, t: b.top, bt: b.bottom, onTop: !!top && d.contains(top) }; });
              if (r.w < Math.min(380, r.vw - 16) - 1) errs.push('half calendar card: not using the room (' + r.w + ' wide, column ' + r.col + ', screen ' + r.vw + ')');
              if (r.l < 0 || r.r > r.vw + 1 || r.t < 0 || r.bt > r.vh + 1) errs.push('half calendar card: off screen ' + JSON.stringify(r));
              if (!r.onTop) errs.push('half calendar card: covered by something'); }
            // All-day row (2026-11-15 13:21, Julius): clear line under it, no empty cell left of it. 2026-11-22 (Julius,
            // maintenance batch): in the half calendar it's one thin 1px line, still visible.
            { const r = await pg.evaluate(() => { const td = [...document.querySelectorAll('#calPanel .fc-scrollgrid-section-body > td')].find(x => x.querySelector('.fc-daygrid-body')), ax = document.querySelector('#calPanel .fc-daygrid-body .fc-timegrid-axis');
                return td ? { bw: getComputedStyle(td).borderBottomWidth, bc: getComputedStyle(td).borderBottomColor, ax: ax ? Math.round(ax.getBoundingClientRect().width) : -1 } : null; });
              if (!r) errs.push('all-day row: not found');
              else { if (r.bw !== '1px' || /, 0\)$/.test(r.bc)) errs.push('all-day row: line under it is ' + r.bw + ' ' + r.bc);
                if (r.ax > 1) errs.push('all-day row: empty cell left of it is still ' + r.ax + 'px wide'); } }
            const jp = await pg.evaluate(() => { const r = document.getElementById('journalPane').getBoundingClientRect(), c = document.querySelector('#calPanel [data-cal-detail]').getBoundingClientRect();
              const x = Math.max(r.left + 20, 20); // workspace shell: aim beside the card, not on it
              if (x < c.left - 2 || x > c.right + 2) return { x, y: r.top + r.height / 2 };
              return { x, y: c.bottom + 12 < r.bottom - 4 ? c.bottom + 12 : Math.max(r.top + 4, c.top - 12) }; });
            await pg.mouse.click(jp.x, jp.y); await pg.waitForTimeout(300);
            if (!(await pg.evaluate(() => document.querySelector('#calPanel [data-cal-detail]').hidden))) errs.push('card close: tapping outside (middle column) did not close the card');
          }
          await pg.evaluate(() => { const ws = document.getElementById('workspace'); ws.scrollLeft = ws.scrollWidth; }); await pg.waitForTimeout(400);
        }
        const slideIn = async () => {
          if (name === 'phone') {
            const cdp = await pg.context().newCDPSession(pg);
            const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
            await T('touchStart', 100, 120); for (let i = 1; i <= 10; i++) { await T('touchMove', 100 - 15 * i, 120); await pg.waitForTimeout(16); } await T('touchEnd');
          } else { await pg.mouse.move(view.width * 0.25, view.height / 2); for (let i = 0; i < 5; i++) { await pg.mouse.wheel(60, 0); await pg.waitForTimeout(16); } }
          await pg.waitForTimeout(700);
        };
        await slideIn();
        let a = await st();
        // ↻ ✕ top right, no 3rd toolbar row; backlog ▾ minimizes it so all-day grows (2026-11-14, Julius).
        if (a.full) { const fb = await pg.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)), p = document.getElementById('calPanel'), out = [];
          const b = p.querySelector('.cp-fbtns'), br = b.getBoundingClientRect(), pr = p.getBoundingClientRect();
          if (br.width < 40 || br.top - pr.top > 8 || pr.right - br.right > 8) out.push('↻ ✕ not at the top right');
          const tb = p.querySelector('#calMount .fc-header-toolbar'), rowsOf = () => { const ys = [...tb.querySelectorAll('.fc-button,.fc-toolbar-title')].filter(x => x.offsetParent).map(x => { const r = x.getBoundingClientRect(); return r.top + r.height / 2; }).sort((m, n) => m - n); let n = 0, last = -99; ys.forEach(y => { if (y - last > 14) n++; last = y; }); return { size: n }; }, tops = rowsOf();
          if (tops.size > 2) out.push('toolbar still has ' + tops.size + ' rows');
          { const pl = p.querySelector('.cp-plan'), was = pl.classList.contains('folded'); pl.classList.add('folded'); await w(150);
            const t2 = rowsOf();
            if (t2.size > 2) out.push('Plan folded: toolbar has ' + t2.size + ' rows');
            const cb = p.querySelector('.cp-fbtns').getBoundingClientRect(), hit = [...tb.querySelectorAll('.fc-button')].filter(x => x.offsetParent).some(x => { const r = x.getBoundingClientRect(); return r.right > cb.left && r.left < cb.right && r.bottom > cb.top && r.top < cb.bottom; });
            if (hit) out.push('Plan folded: a toolbar button sits under ↻ ✕ ' + JSON.stringify([...tb.children].map(c => { const r = c.getBoundingClientRect(); return [c.className, Math.round(r.left), Math.round(r.top), Math.round(r.width), getComputedStyle(c).marginRight]; })) + ' btns ' + JSON.stringify([Math.round(cb.left), Math.round(cb.top), Math.round(cb.bottom)]));
            if (!was) pl.classList.remove('folded'); await w(100); }
          const tb3 = p.querySelector('.fc-cpBacklog-button'); if (tb3 && tb3.offsetParent) out.push('BL button still shown');
          const f = p.querySelector('.cp-fad'), h0 = f.getBoundingClientRect().height, bl = p.querySelector('.cp-bl').getBoundingClientRect();
          if (!p.classList.contains('cp-blmin')) out.push('backlog not minimized by default');
          if (bl.top < f.getBoundingClientRect().bottom || bl.height > 60) out.push('minimized backlog is not a bar under all-day');
          { const hd = p.querySelector('.cp-blh'), r = hd.getBoundingClientRect(), x = r.right - 30, y = r.top + r.height / 2, t = document.elementFromPoint(x, y);
            if (!t || !hd.contains(t) || t.closest('button')) { if (!hd.contains(t)) out.push('minimized bar: nothing to tap at its right side'); p.querySelector('[data-bl-min]').click(); }
            else t.click(); await w(200); if (p.classList.contains('cp-blmin')) out.push('tapping the minimized bar did not open the backlog'); }
          { const pf = p.querySelector('.cp-plan:not(.folded) .cp-pfold'); if (pf && pf.offsetParent && pf.getBoundingClientRect().height > 36) out.push('Plan title wraps (' + Math.round(pf.getBoundingClientRect().height) + 'px)');
            const cb = p.querySelector('.cp-fbtns').getBoundingClientRect(); if (pf && pf.offsetParent && pf.getBoundingClientRect().right > cb.left + 1 && pf.getBoundingClientRect().bottom > cb.top && pf.getBoundingClientRect().top < cb.bottom) out.push('Plan title runs under ↻ ✕'); }
          const h1 = f.getBoundingClientRect().height;
          if (h1 > h0 - 40) out.push('opening the backlog did not make room (' + Math.round(h0) + ' → ' + Math.round(h1) + ')');
          if (localStorage.getItem('fw.calFullBlMin') !== '0') out.push('open backlog not remembered');
          p.querySelector('[data-bl-min]').click(); await w(200);
          window.__shotMin = 1; return out; });
          errs.push(...fb.map(x => 'full screen: ' + x));
          if (process.env.CAL_SHOT) await pg.screenshot({ path: path.join(process.env.CAL_SHOT, 'calfull-' + name + '.png') });
          await pg.evaluate(async () => { document.querySelector('#calPanel [data-bl-min]').click(); localStorage.removeItem('fw.calFullBlMin'); await new Promise(r => setTimeout(r, 200)); }); } // leave it open for the checks below
        if (!a.full) errs.push('full screen: one more slide left at the calendar did not open it');
        else {
          if (Math.abs(a.w - a.vw) > 2) errs.push('full screen: not the whole width (' + a.w + ' / ' + a.vw + ')');
          if (a.view !== 'timeGridDay') errs.push('full screen: did not start in Day view (' + a.view + ')');
          if (!a.bl) errs.push('full screen: backlog not beside the calendar');
          if (a.wrap !== 'normal') errs.push('full screen: backlog names are cut off (' + a.wrap + ')');
          // All-day tasks in the left column (2026-11-14): no all-day strip on the grid; Day = a plain list, Week = by day.
          const fa = await pg.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)), p = document.getElementById('calPanel'), out = [];
            await w(300);
            if (p.querySelector('#calMount .fc-daygrid-body')) out.push('all-day strip still on top of the grid');
            { const t = p.querySelector('.fc-toolbar-title'), want = String(luxon.DateTime.fromJSDate(window.fwCalendar.api().view.currentStart, {zone: 'UTC'}).weekday % 7);
              if (!t || t.dataset.dow !== want) out.push('day title not tagged with its weekday color (' + (t && t.dataset.dow) + ' vs ' + want + ')'); }
            const f = p.querySelector('.cp-fad'), fr = f.getBoundingClientRect(), br = p.querySelector('.cp-bl').getBoundingClientRect();
            if (fr.width < 80) out.push('all-day list not shown');
            if (!/All-day A/.test(f.textContent)) out.push('all-day task missing from the left column');
            if (br.top < fr.bottom) out.push('backlog not below the all-day list');
            { const api = window.fwCalendar.api(), d0 = api.view.currentStart, tmp = api.addEvent({ title: 'Done all-day Z', allDay: true, start: d0, extendedProps: { done: true } }); await w(400);
              const kids = [...f.querySelectorAll('.cp-fadb > *')], si = kids.findIndex(k => k.hasAttribute('data-fad-done')), zi = kids.findIndex(k => /Done all-day Z/.test(k.textContent)), ai = kids.findIndex(k => /All-day A/.test(k.textContent));
              if (si < 0 || !(ai < si && si < zi)) out.push('all-day list: no Done divider between to-do and done (' + [ai, si, zi] + ')');
              f.querySelector('[data-fad-done]').click(); await w(200);
              if (/Done all-day Z/.test(f.textContent) || !/Done · 1/.test(f.textContent) || !/All-day A/.test(f.textContent)) out.push('all-day list: tapping Done did not fold the finished tasks');
              f.querySelector('[data-fad-done]').click(); await w(200);
              if (!/Done all-day Z/.test(f.textContent)) out.push('all-day list: tapping Done again did not show them');
              tmp.remove(); await w(300); }
            // Events group (2026-11-23): a birthday on the Events calendar sits on top, alone, with no checkbox.
            { const api = window.fwCalendar.api(), d0 = api.view.currentStart, bd = api.addEvent({ title: 'Bday Q', allDay: true, start: d0, extendedProps: { allDay: true, life: true, cal: 'Events' } }); await w(400);
              const kids = [...f.querySelectorAll('.cp-fadb > *')], li = kids.findIndex(k => k.hasAttribute('data-fa-life')), bi = kids.findIndex(k => /Bday Q/.test(k.textContent)), oi = kids.findIndex(k => k.hasAttribute('data-fa-og'));
              if (!(li >= 0 && li < bi && (oi < 0 || bi < oi))) out.push('Events group not on top (' + [li, bi, oi] + ')');
              if (bi >= 0 && kids[bi].querySelector('.cp-chk')) out.push('Events row has a checkbox');
              if (/Bday Q/.test((f.querySelector('[data-fa-og]') || {}).textContent || '') ) out.push('birthday counted in Ordered');
              bd.remove(); await w(300); }
            window.fwCalendar.api().changeView('timeGridWeek'); await w(400);
            // Week (2026-11-15, Julius: "too narrow"): full width, left column hidden, all-day strip back on top.
            { const g = p.querySelector('#calMount').getBoundingClientRect(), b = p.querySelector('.cp-body').getBoundingClientRect();
              if (g.width < b.width * 0.9) out.push('week: calendar not full width (' + Math.round(g.width) + ' of ' + Math.round(b.width) + ')');
              if (p.querySelector('.cp-fad').getClientRects().length) out.push('week: left column still shown');
              if (!p.querySelector('#calMount .fc-daygrid-body')) out.push('week: all-day strip not on top'); }
            window.fwCalendar.api().changeView('timeGridDay'); await w(400);
            if (p.querySelector('#calMount .fc-daygrid-body')) out.push('day after week: all-day strip came back on the grid');
            if (!p.querySelector('.cp-fad').getClientRects().length) out.push('day after week: left column not back');
            return out; });
          errs.push(...fa.map(x => 'full screen: ' + x));
          // Backlog hold menu (2026-11-15, Julius): hold a row, let go without moving → 📌 Send to Today = all-day today.
          {
            await pg.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)), srv = window.__calSrv;
              window.__blPlaced = null; window.__calSrvOrig = srv;
              window.__calSrv = (m, a) => m === 'calBacklogSync' ? { items: [{ id: 'bl-1', title: 'Backlog hold B', date: '2026-11-10', urg: '1', color: '11' },
                  { id: 'bl-2', title: 'Backlog bulk C', date: '2026-11-10', urg: '1', color: '9' }, { id: 'bl-3', title: 'Backlog bulk D', date: '2026-11-09', urg: '2', color: '5' }] }
                : m === 'calBacklogPlace' ? (window.__blPlaced = a[0], { ok: true })
                : m === 'calBacklogComplete' ? (window.__blDone = a[0], { ok: true })
                : m === 'calBacklogPlaceMany' ? (window.__blPlaced = a[0][0], window.__blPlacedMany = a[0], { ok: true, done: a[0].map(x => x.id), failed: [] }) : srv(m, a);
              window.fwCalendar.blReload(); await w(300); });
            const r = await pg.evaluate(() => { const e = [...document.querySelectorAll('#calPanel .cp-bli')].find(x => /Backlog hold B/.test(x.textContent)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + 30, y: b.y + b.height / 2 }; });
            if (!r) errs.push('backlog menu: test row not shown');
            else {
              if (name === 'phone') {
                const cdp = await pg.context().newCDPSession(pg);
                const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
                await T('touchStart', r.x, r.y); await pg.waitForTimeout(900); await T('touchEnd');
              } else { await pg.mouse.move(r.x, r.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up(); }
              await pg.waitForTimeout(300);
              const btn = await pg.evaluate(() => { const b = [...document.querySelectorAll('[data-bl-menu] button')].find(x => /Send to Today/.test(x.textContent)); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
              { const dh = await pg.evaluate(async () => { localStorage.setItem('fw.blSort', 'date'); window.fwCalendar.blReload(); await new Promise(r => setTimeout(r, 300));
                  const g = document.querySelector('#calPanel .cp-blg .cp-blgd'); const t = g ? g.textContent + '|' + g.dataset.dow : 'none'; localStorage.removeItem('fw.blSort'); window.fwCalendar.blReload(); await new Promise(r => setTimeout(r, 300)); return t; });
                if (dh !== 'NOV 10 Tue|2') errs.push('backlog date header: ' + dh); }
              if (!btn) errs.push('backlog menu: holding a row did not open the menu');
              else {
                await pg.mouse.click(btn.x, btn.y); await pg.waitForTimeout(500);
                const res = await pg.evaluate(() => ({ p: window.__blPlaced, left: [...document.querySelectorAll('#calPanel .cp-bli')].some(x => /Backlog hold B/.test(x.textContent)), today: luxon.DateTime.now().setZone('America/Los_Angeles').toISODate() }));
                if (!res.p || !res.p.allDay || res.p.start !== res.today || res.p.id !== 'bl-1') errs.push('backlog menu: Send to Today sent ' + JSON.stringify(res.p));
                if (res.left) errs.push('backlog menu: row still in the backlog after Send to Today');
              }
            }
            // ✕ on a backlog row removes it — real tap / click (2026-11-21, Julius: "pressing X doesn't get rid of them").
            {
              await pg.evaluate(() => { window.__blPlaced = null; });
              const x = await pg.evaluate(() => { const e = [...document.querySelectorAll('#calPanel .cp-bli, #blCol .cp-bli, #calBlLeft .cp-bli')].find(r => /Backlog bulk D/.test(r.textContent) && r.getBoundingClientRect().width); const b = e && e.querySelector('[data-bl-x]'); if (!b) return null; b.scrollIntoView({block: 'center'}); const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2, where: e.parentElement.closest('[id]').id }; });
              if (!x) errs.push('backlog ✕: no ✕ on the test row');
              else {
                if (view.hasTouch) await pg.touchscreen.tap(x.x, x.y); else await pg.mouse.click(x.x, x.y);
                await pg.waitForTimeout(600);
                const r2 = await pg.evaluate(() => ({ p: window.__blPlaced, left: [...document.querySelectorAll('.cp-bli')].some(r => /Backlog bulk D/.test(r.textContent)), menu: !!document.querySelector('[data-bl-menu]:not([hidden])') }));
                if (!r2.p || r2.p.id !== 'bl-3' || !r2.p.drop) errs.push('backlog ✕ (' + x.where + '): tap did not remove — sent ' + JSON.stringify(r2.p) + (r2.menu ? ', opened the hold menu' : ''));
                else if (r2.left) errs.push('backlog ✕: row still shown after removing');
              }
            }
            // Mark complete (2026-11-16, Julius): hold → ✓ Done · Archive on a picked day; Undo puts it back; otherwise it saves.
            {
              const hold = async () => { const q = await pg.evaluate(() => { const e = [...document.querySelectorAll('#calPanel .cp-bli')].find(x => /Backlog bulk C/.test(x.textContent)); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + 30, y: b.y + b.height / 2 }; });
                if (!q) return false;
                if (name === 'phone') { const cdp = await pg.context().newCDPSession(pg); const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
                  await T('touchStart', q.x, q.y); await pg.waitForTimeout(900); await T('touchEnd'); }
                else { await pg.mouse.move(q.x, q.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up(); }
                await pg.waitForTimeout(300); return true; };
              const pick = (label, day) => pg.evaluate(([label, day]) => { const m = document.querySelector('[data-bl-menu]'); if (!m) return 'no menu';
                const d = m.querySelector('[data-bl-dday]'); if (!d) return 'no date'; if (day) d.value = day;
                const b = [...m.querySelectorAll('button')].find(x => x.textContent.includes(label)); if (!b) return 'no ' + label; b.click(); return ''; }, [label, day]);
              const gone = () => pg.evaluate(() => ![...document.querySelectorAll('#calPanel .cp-bli')].some(x => /Backlog bulk C/.test(x.textContent)));
              if (!await hold()) errs.push('backlog done: row not shown');
              else {
                let e = await pick('Done · Archive', '2026-11-14'); if (e) errs.push('backlog done: ' + e);
                await pg.waitForTimeout(200);
                const t = await pg.evaluate(() => { const x = document.querySelector('[data-bl-undo]'); return x && !x.hidden ? x.textContent : ''; });
                if (!await gone()) errs.push('backlog done: row still shown');
                if (!/archived \(11\/14\)/.test(t)) errs.push('backlog done: toast ' + JSON.stringify(t));
                await pg.evaluate(() => document.querySelector('[data-bl-undo-b]').click()); await pg.waitForTimeout(200);
                if (await gone()) errs.push('backlog done: Undo did not put it back');
                if (await pg.evaluate(() => window.__blDone)) errs.push('backlog done: saved despite Undo');
                await hold(); e = await pick('Done · Delete'); if (e) errs.push('backlog done: ' + e);
                await pg.evaluate(() => window.fwBlDone.flush()); await pg.waitForTimeout(300);
                const d = await pg.evaluate(() => window.__blDone), today = await pg.evaluate(() => luxon.DateTime.now().setZone('America/Los_Angeles').toISODate());
                if (!d || d.id !== 'bl-2' || d.mode !== 'delete' || d.day !== today) errs.push('backlog done: sent ' + JSON.stringify(d));
                if (await pg.evaluate(() => { const x = document.querySelector('[data-bl-undo]'); return x && !x.hidden; })) errs.push('backlog done: toast still up after save');
              }
            }
            // Drag a backlog row onto the All day box (2026-11-15, Julius) → all-day task on the day shown.
            {
              const g = await pg.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)), cal = window.fwCalendar.api();
                cal.changeView('timeGridDay', '2026-11-18'); window.__blPlaced = null; window.fwCalendar.blReload(); await w(400);
                const e = [...document.querySelectorAll('#calPanel .cp-bli')].find(x => /Backlog hold B/.test(x.textContent)), f = document.querySelector('#calPanel .cp-fad');
                if (!e || !f || !f.getClientRects().length) return null; const b = e.getBoundingClientRect(), q = f.getBoundingClientRect();
                return { x: b.x + 30, y: b.y + b.height / 2, fx: q.x + q.width / 2, fy: q.y + Math.min(40, q.height / 2) }; });
              if (!g) errs.push('backlog → all day: row or all-day box not shown');
              else {
                if (name === 'phone') {
                  const cdp = await pg.context().newCDPSession(pg);
                  const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
                  await T('touchStart', g.x, g.y); await pg.waitForTimeout(900);
                  for (let i = 1; i <= 8; i++) { await T('touchMove', g.x + (g.fx - g.x) * i / 8, g.y + (g.fy - g.y) * i / 8); await pg.waitForTimeout(30); }
                  await T('touchEnd');
                } else { await pg.mouse.move(g.x, g.y); await pg.mouse.down(); await pg.mouse.move(g.fx, g.fy, { steps: 10 }); await pg.mouse.up(); }
                await pg.waitForTimeout(500);
                const p = await pg.evaluate(() => window.__blPlaced);
                if (!p || !p.allDay || p.start !== '2026-11-18' || p.id !== 'bl-1') errs.push('backlog → all day: sent ' + JSON.stringify(p));
                if (await pg.evaluate(() => !!document.querySelector('[data-bl-menu]'))) errs.push('backlog → all day: dragging opened the hold menu');
              }
              await pg.evaluate(() => { document.querySelectorAll('[data-bl-menu]').forEach(m => m.remove()); window.fwCalendar.api().today(); });
            }
            // Bulk select (2026-11-15, Julius): Select → tick two rows → "All day" sends both in one call; ↑ Today sends to today.
            {
              const res = await pg.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)), out = [], cal = window.fwCalendar.api();
                cal.changeView('timeGridDay', '2026-11-19'); window.__blPlacedMany = null; window.fwCalendar.blReload(); await w(400);
                const sel = document.querySelector('#calPanel [data-bl-selmode]'); if (!sel) return ['no Select button'];
                sel.click(); await w(100);
                const rows = () => [...document.querySelectorAll('#calPanel .cp-bli')];
                const pick = re => { const r = rows().find(x => re.test(x.textContent)); if (r) r.querySelector('.cp-blt').click(); return !!r; };
                if (!pick(/Backlog bulk C/) || !pick(/Backlog bulk D/)) return ['bulk rows not shown'];
                await w(100);
                const bar = document.querySelector('#calPanel [data-bl-bar]');
                if (!bar || bar.hidden || !bar.getClientRects().length) out.push('bar not shown');
                if (!/2 selected/.test(bar.textContent)) out.push('count: ' + bar.textContent);
                if (rows().filter(x => x.classList.contains('cp-blon')).length !== 2) out.push('ticks not drawn');
                bar.querySelector('[data-bl-go="day"]').click(); await w(400);
                const m = window.__blPlacedMany || [];
                if (m.length !== 2 || !m.every(x => x.allDay && x.start === '2026-11-19')) out.push('All day sent ' + JSON.stringify(m));
                if (rows().some(x => /Backlog bulk/.test(x.textContent))) out.push('sent rows still in the backlog');
                if (!cal.getEvents().some(e => e.id === 'bltmp-bl-2')) out.push('no stand-in card shown at once');
                document.querySelector('#calPanel [data-bl-selmode]').click(); await w(100);
                if (!bar.hidden) out.push('bar stayed after Done');
                cal.today(); return out; });
              errs.push(...res.map(x => 'backlog bulk: ' + x));
            }
            // All day → Scheduled (2026-11-15, Julius): drag an All day box row onto a time = timed 15 min, listed under
            // "Scheduled" in the box; drag that row back onto the all-day part = all-day again.
            {
              const day = '2026-11-20';
              const pt = async () => pg.evaluate(async d => { const w = ms => new Promise(r => setTimeout(r, ms)); const cal = window.fwCalendar.api();
                if (cal.view.type !== 'timeGridDay' || cal.view.currentStart.toISOString().slice(0, 10) !== d) { cal.changeView('timeGridDay', d); await w(500); }
                const p = document.getElementById('calPanel');
                const row = [...p.querySelectorAll('.cp-fad .cp-fai')].find(x => /All-day A/.test(x.textContent) && !x.classList.contains('cp-fasch'));
                const sch = [...p.querySelectorAll('.cp-fad .cp-fasch')].find(x => /All-day A/.test(x.textContent));
                const lane = p.querySelector('.fc-timegrid-slot-lane[data-time="11:00:00"]'), col = p.querySelector('.fc-timegrid-col[data-date="' + d + '"]');
                if (lane) lane.scrollIntoView({block: 'center'}); await w(150);
                const c = r => { if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x + Math.min(30, b.width / 2), y: b.y + b.height / 2 }; };
                const lb = lane && lane.getBoundingClientRect(), cb = col && col.getBoundingClientRect(), fh = p.querySelector('.cp-fadh').getBoundingClientRect();
                return { row: c(row), sch: c(sch), slot: lb && cb ? { x: cb.x + cb.width / 2, y: lb.y + 3 } : null, head: { x: fh.x + fh.width / 2, y: fh.y + fh.height / 2 } }; }, day);
              const drag = async (a, b) => {
                if (name === 'phone') {
                  const cdp = await pg.context().newCDPSession(pg);
                  const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
                  await T('touchStart', a.x, a.y); await pg.waitForTimeout(900);
                  for (let i = 1; i <= 10; i++) { await T('touchMove', a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10); await pg.waitForTimeout(30); }
                  await T('touchEnd');
                } else { await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(b.x, b.y, { steps: 12 }); await pg.mouse.up(); }
                await pg.waitForTimeout(900); };
              let g = await pt();
              if (!g.row || !g.slot) errs.push('scheduled: all-day row or 11:00 slot not found ' + JSON.stringify(g));
              else {
                await drag(g.row, g.slot);
                const e1 = await pg.evaluate(d => { const e = window.__cal.ev['a-' + d]; return e && Object.assign({}, e, { min: luxon.DateTime.fromISO(e.end).diff(luxon.DateTime.fromISO(e.start), 'minutes').minutes }); }, day);
                if (!e1 || e1.allDay || !/T11:00/.test(e1.start) || e1.min !== 15) errs.push('scheduled: drop onto 11:00 gave ' + JSON.stringify(e1 && { allDay: e1.allDay, start: e1.start, end: e1.end }));
                // Measure once the box has settled (the re-read after the drop redraws it; slow machines take longer).
                for (let k = 0, prev = ''; k < 10; k++) { g = await pt(); const cur = JSON.stringify(g); if (g.sch && cur === prev) break; prev = cur; await pg.waitForTimeout(300); }
                if (!g.sch) errs.push('scheduled: not listed under Scheduled in the All day box');
                else {
                  if (!(await pg.evaluate(() => /Scheduled · 1/.test(document.querySelector('#calPanel .cp-fasg')?.textContent || '')))) errs.push('scheduled: group header missing');
                  await drag(g.sch, g.head);
                  let e2; for (let k = 0; k < 10; k++) { e2 = await pg.evaluate(d => window.__cal.ev['a-' + d], day); if (e2 && e2.allDay && !e2.sched) break; await pg.waitForTimeout(300); }
                  if (!e2 || !e2.allDay || e2.sched) errs.push('scheduled: dragging back to all day gave ' + JSON.stringify(e2 && { allDay: e2.allDay, sched: e2.sched }));
                }
              }
              await pg.evaluate(() => window.fwCalendar.api().today());
            }
            // All-day Ordered / Unordered groups (2026-11-22, Julius): new = Unordered; drag onto the Ordered header =
            // Ordered (numbered); drag above another Ordered row = new order, kept after a re-read; drag down to Unordered = out.
            {
              const D = '2026-11-22';
              const st = () => pg.evaluate(() => { const r = [...document.querySelectorAll('#calPanel .cp-fad .cp-fai:not(.cp-fasch):not(.cp-done)')];
                const t = x => x.querySelector('.cp-ev-t').textContent;
                return { ord: r.filter(x => x.hasAttribute('data-fao')).map(x => x.querySelector('.cp-ordn').textContent + ' ' + t(x)).join('|'), un: r.filter(x => !x.hasAttribute('data-fao')).map(t).join('|') }; });
              await pg.evaluate(async d => { const w = ms => new Promise(r => setTimeout(r, ms)), cal = window.fwCalendar.api(); cal.changeView('timeGridDay', d); await w(400);
                const b = document.querySelector('#calPanel [data-fad-add]'); b.click(); await w(100);
                const i = document.querySelector('#calPanel [data-fad-in]');
                for (const t of ['Order one', 'Order two']) { i.value = t; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await w(700); }
                document.querySelector('#calPanel [data-fad-x]').click(); await w(200); }, D);
              let n = await st();
              if (n.ord || !/Order one\|Order two$/.test(n.un)) errs.push('order: new tasks not at the bottom of Unordered: ' + JSON.stringify(n));
              const pos = (title, top) => pg.evaluate(([tt, tp]) => { const el = tt === 'OG' ? document.querySelector('#calPanel [data-fa-og]') : tt === 'UG' ? document.querySelector('#calPanel [data-fa-ug]')
                : [...document.querySelectorAll('#calPanel .cp-fad .cp-fai')].find(r => r.querySelector('.cp-ev-t').textContent === tt);
                if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + Math.min(40, b.width / 2), y: tp === 'top' ? b.y + 3 : tp === 'low' ? b.bottom - 2 : b.y + b.height / 2 }; }, [title, top]);
              const drag = async (from, to) => {
                if (!from || !to) { errs.push('order: rows not found'); return; }
                if (name === 'phone') {
                  const cdp = await pg.context().newCDPSession(pg);
                  const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
                  await T('touchStart', from.x, from.y); await pg.waitForTimeout(900);
                  for (let i = 1; i <= 8; i++) { await T('touchMove', from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8); await pg.waitForTimeout(30); }
                  await T('touchEnd');
                } else { await pg.mouse.move(from.x, from.y); await pg.mouse.down(); await pg.mouse.move(to.x, to.y, { steps: 10 }); await pg.mouse.up(); }
                await pg.waitForTimeout(600);
              };
              await drag(await pos('Order two'), await pos('OG'));
              n = await st(); if (n.ord !== '1 Order two') errs.push('order: into Ordered gave ' + JSON.stringify(n));
              await drag(await pos('Order one'), await pos('Order two', 'top'));
              n = await st(); if (n.ord !== '1 Order one|2 Order two') errs.push('order: above another gave ' + JSON.stringify(n));
              await pg.evaluate(async () => { window.fwCalendar.api().refetchEvents(); await new Promise(r => setTimeout(r, 600)); });
              n = await st(); if (n.ord !== '1 Order one|2 Order two') errs.push('order: not kept after a re-read: ' + JSON.stringify(n));
              await drag(await pos('Order one'), await pos('UG', 'low'));
              n = await st(); if (n.ord !== '1 Order two' || !/Order one$/.test(n.un)) errs.push('order: back to Unordered gave ' + JSON.stringify(n));
              await pg.evaluate(() => window.fwCalendar.api().today());
            }
            // Quick add in the All day box (2026-11-15, Julius): + → blank row → type → Enter = all-day task on the day shown.
            {
              await pg.evaluate(async () => { const cal = window.fwCalendar.api(); cal.changeView('timeGridDay', '2026-11-21'); await new Promise(r => setTimeout(r, 400)); });
              const add = await pg.evaluate(() => { const b = document.querySelector('#calPanel [data-fad-add]'); if (!b || !b.getClientRects().length) return null; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
              if (!add) errs.push('quick add: + not shown');
              else {
                await pg.mouse.click(add.x, add.y); await pg.waitForTimeout(150);
                await pg.keyboard.type('Quick task Q'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(900);
                const r = await pg.evaluate(() => ({ e: Object.values(window.__cal.ev).find(e => e.title === 'Quick task Q'), open: !document.querySelector('#calPanel [data-fad-new]').hidden, val: document.querySelector('#calPanel [data-fad-in]').value,
                  row: [...document.querySelectorAll('#calPanel .cp-fad .cp-fai')].some(x => /Quick task Q/.test(x.textContent)) }));
                if (!r.e || !r.e.allDay || r.e.start !== '2026-11-21') errs.push('quick add: saved ' + JSON.stringify(r.e));
                if (!r.open || r.val) errs.push('quick add: blank row not ready for the next one');
                if (!r.row) errs.push('quick add: new task not listed in the All day box');
                await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
                if (!(await pg.evaluate(() => document.querySelector('#calPanel [data-fad-new]').hidden))) errs.push('quick add: Esc did not close the row');
              }
              await pg.evaluate(() => window.fwCalendar.api().today());
            }
            await pg.evaluate(() => { if (window.__calSrvOrig) window.__calSrv = window.__calSrvOrig; });
          }
          // Half / half, and the line between drags (2026-11-14, Julius).
          {
            const g = await pg.evaluate(() => { localStorage.removeItem('fw.calFullLw'); const p = document.getElementById('calPanel'); p.style.removeProperty('--fl-w');
              const b = p.querySelector('.cp-body').getBoundingClientRect(), f = p.querySelector('.cp-fad').getBoundingClientRect(), gr = p.querySelector('.cp-flgrip').getBoundingClientRect();
              return { bw: b.width, bl: b.left, fw: f.width, gx: gr.x + gr.width / 2, gy: gr.y + gr.height / 2 }; });
            if (Math.abs(g.fw + 12 - g.bw / 2) > 6) errs.push('full screen: left column not half (' + Math.round(g.fw) + ' of ' + Math.round(g.bw) + ')');
            // 2026-11-15 (Julius): the split is fixed half / half now — dragging the line must not move it.
            await pg.mouse.move(g.gx, g.gy); await pg.mouse.down(); await pg.mouse.move(g.bl + g.bw * 0.3, g.gy, { steps: 6 }); await pg.mouse.up(); await pg.waitForTimeout(300);
            const f2 = await pg.evaluate(() => document.querySelector('#calPanel .cp-fad').getBoundingClientRect().width);
            if (Math.abs(f2 + 12 - g.bw / 2) > 6) errs.push('full screen: the fixed half / half split moved (' + Math.round(f2) + ')');
            await pg.evaluate(() => { localStorage.removeItem('fw.calFullLw'); document.getElementById('calPanel').style.setProperty('--fl-w', '50%'); }); await pg.waitForTimeout(200);
          }
          await pg.evaluate(() => window.fwCalendar.api().changeView('timeGridWeek')); await pg.waitForTimeout(200);
          await pg.keyboard.press('Escape'); await pg.waitForTimeout(1200);
          a = await st();
          if (a.full) errs.push('full screen: Esc did not close it');
          if (!a.docked || a.view !== 'timeGridDay') errs.push('full screen: closing did not go back to the half-screen Day calendar (' + a.view + ')');
          if (!(await pg.evaluate(() => !!document.querySelector('#calPanel #calMount .fc-daygrid-body')))) errs.push('full screen: all-day strip not back after closing');
          await prep(); await slideIn(); a = await st();
          if (!a.full) errs.push('full screen: did not reopen');
          else if (a.view !== 'timeGridWeek') errs.push('full screen: Week view not remembered (' + a.view + ')');
          // Slide back: a swipe in from the left edge (phone) / sideways wheel over the toolbar (computer).
          if (name === 'phone') {
            const cdp = await pg.context().newCDPSession(pg);
            const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
            await T('touchStart', 8, 300); for (let i = 1; i <= 10; i++) { await T('touchMove', 8 + 15 * i, 300); await pg.waitForTimeout(16); } await T('touchEnd');
          } else {
            await pg.waitForTimeout(800);
            const h = await pg.evaluate(() => { const r = document.querySelector('#calPanel .fc-header-toolbar').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
            await pg.mouse.move(h.x, h.y); for (let i = 0; i < 5; i++) { await pg.mouse.wheel(-60, 0); await pg.waitForTimeout(16); }
          }
          await pg.waitForTimeout(1200);
          if ((await st()).full) errs.push('full screen: sliding back did not close it');
        }
        await pg.evaluate(() => { localStorage.removeItem('fw.calFullView'); localStorage.removeItem('fw.calFullBl'); window.fwCalendar.close(); document.getElementById('workspace').scrollLeft = 0; }); await pg.waitForTimeout(900);
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
          const ws = document.getElementById('workspace'), single = ws.classList.contains('view-single') || (phone && !ws.classList.contains('ws-halves')); // half view (phone too): own half column (2026-11-13)
          const btn = panel.querySelector('.fc-cpBacklog-button') || panel.querySelector('[data-bl-toggle]');
          btn.click(); await wait(400);
          const bl = document.querySelector('[data-cal-bl]');
          if (!single) {
            if (!bl.closest('#blCol')) out.push('backlog not in its own column');
            const bc = document.getElementById('blCol').getBoundingClientRect(), cp = document.getElementById('calPane').getBoundingClientRect();
            if (bc.width < 100) out.push('backlog column too narrow: ' + bc.width);
            if (ws.classList.contains('ws-halves') && Math.abs(bc.width - cp.width) > 3) out.push('half view: backlog is not a half-screen column: ' + bc.width + ' vs ' + cp.width);
            if (Math.abs(bc.right - cp.left) > 3) out.push('backlog not just left of the calendar');
            { const f = ws.getBoundingClientRect(), edge = f.right - (parseFloat(getComputedStyle(ws).borderRightWidth) || 0); // workspace shell: frame's inner edge
              if (Math.abs(cp.right - edge) > 3) out.push('calendar column not at the right edge: ' + cp.right + ' / ' + edge); }
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
          // ⚙ Day calendar off → on brings the docked calendar back (2026-11-13: Julius couldn't get it back).
          for (let k = 0; k < 2; k++) {
            document.querySelector('[data-ce-opt]').click(); await wait(100);
            document.querySelector('[data-ce-optbox] input[data-ce-day]').click(); await wait(300);
            document.querySelector('[data-ce-opt-done]')?.click(); await wait(300);
          }
          // 📅 Show calendar in list mode brings it back too; one ⚙ (the calendar's own ⚙ is hidden, its picker is in the top ⚙).
          document.querySelector('[data-ce-opt]').click(); await wait(100);
          document.querySelector('[data-ce-optbox] input[data-ce-day]').click(); await wait(300);
          document.querySelector('[data-ce-showcal]').click(); await wait(400);
          if (!panel.closest('#calPane .ce-dock')) out.push('📅 Show calendar did not bring it back');
          const ownGear = panel.querySelector('.fc-cpCals-button'); if (ownGear && ownGear.offsetWidth) out.push("calendar's own ⚙ still shows");
          document.querySelector('[data-ce-opt]').click(); await wait(150);
          // Calendar list (colored checkboxes) only inside the ⚙ box; no "hide calendars" duplicate (2026-11-13 evening).
          // Folded until "▸ Calendars" is tapped (2026-11-24, Julius).
          const slot0 = document.querySelector('[data-ce-calslot]');
          if (!slot0 || !slot0.hidden) out.push('⚙ calendars list not folded at first');
          document.querySelector('[data-ce-calsfold]')?.click(); await wait(150);
          const slot = document.querySelector('[data-ce-calslot]');
          if (!slot || slot.hidden || !slot.querySelector('.cp-cbody')) out.push('⚙ box has no calendar list');
          if (document.querySelector('[data-ce-hcal]')) out.push('old hide-calendars list still in ⚙');
          document.querySelector('[data-ce-opt-done]')?.click(); await wait(300);
          if (!panel.querySelector('[data-cal-cals] .cp-cbody')) out.push('calendar list did not go back to the calendar when ⚙ closed');
          // One header row while docked: ◉ · date · 🔍 · ⚙ · BL · ↻ on the search line, calendar toolbar hidden.
          const hd = document.querySelector('#centerDownScroll .ce-head');
          const vis = sel => { const el = hd.querySelector(sel); return el && el.offsetWidth > 0 && el; };
          if (!vis('[data-ce-today]') || !vis('[data-ce-bl]') || !vis('[data-cal-refresh]') || vis('[data-ce-search]') || !vis('[data-ce-opt]')) out.push('search line: needs ◉ / BL / ↻ / ⚙, no search box (2026-11-24)');
          if (hd.querySelector('[data-ce-bln]').offsetWidth) out.push('BL shows a count');
          if (!/\d/.test(hd.querySelector('[data-ce-title]').textContent)) out.push('no date on the search line');
          const tops = ['[data-ce-today]', '[data-ce-opt]', '[data-ce-bl]'].map(x => Math.round(hd.querySelector(x).getBoundingClientRect().top));
          if (Math.max(...tops) - Math.min(...tops) > 4) out.push('header not on one row: ' + tops);
          const ftb = panel.querySelector('.fc-header-toolbar'); if (ftb && ftb.offsetHeight) out.push('calendar toolbar row still shows');
          vis('[data-ce-bl]').click(); await wait(300);
          if (!document.body.classList.contains('bl-push') && !document.body.classList.contains('bl-left')) out.push('BL on the search line did not open the backlog');
          vis('[data-ce-bl]').click(); await wait(300);
          if (!panel.closest('#calPane .ce-dock') || panel.offsetHeight < 100) out.push('⚙ Day calendar off → on: calendar did not come back (' + (panel.parentElement && (panel.parentElement.id || panel.parentElement.className)) + ', h ' + panel.offsetHeight + ')');
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
// PWA (2026-11-21, docs/NOTES.md H): the static build opens, talks to the API through the shim with the key,
// opens from cache on the next visit (then syncs), and is read-only offline. API = a stub at https://api.test/.
if (only('pwa')) {
  const { execFileSync } = await import('child_process');
  const http = await import('http');
  const dist = path.join(os.tmpdir(), 'gantt-pwa-smoke');
  execFileSync('node', ['tools/build-pwa.mjs', dist], { env: { ...process.env, PWA_API_URL: 'https://api.test/exec' }, stdio: 'pipe' });
  const types = { html: 'text/html', js: 'text/javascript', webmanifest: 'application/manifest+json', png: 'image/png' };
  const srv = http.createServer((q, r) => {
    let f = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (f.endsWith('/')) f += 'index.html';
    const fp = path.join(dist, f);
    if (!fp.startsWith(dist) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': types[fp.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(fp));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const errs = [], calls = []; let netOff = false;
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', serviceWorkers: 'allow' });
  await ctx.route('https://api.test/**', async route => {
    if (netOff) return route.abort('internetdisconnected');
    const req = JSON.parse(route.request().postData() || '{}'); calls.push(req.fn);
    if (req.k !== 'smokekey') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, auth: true, e: 'Wrong or missing app key' }) });
    const r = req.fn === 'getWorkspaceData' ? data : req.fn === 'runImports' || req.fn === 'getSyncState' ? imported : req.fn === 'getFocus' ? focus
      : req.fn === 'getKim' ? { html: '', h: 'k0', fresh: true }
      : req.fn === 'trackerSync' ? { accepted: [], recs: [], seq: 0 }
      : req.fn === 'getMainCalendarEvents' ? { date: req.a[0], events: [{ id: 'e1', calId: 'c', start: 0, title: 'Sample event', allDay: true, done: false }] } : null;
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, r }) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('page error: ' + e.message + (process.env.SMOKE_DEBUG ? '\n' + e.stack : '')));
  // 1) First open with the setup link: key saved + stripped, data loaded through the API.
  const carried = encodeURIComponent(JSON.stringify({ 'fw.theme': 'dark', focusWorkspaceTypographyV1: '{"x":1}', evil: '1' }));
  await pg.goto(base + '#k=smokekey&s=' + carried); await pg.waitForTimeout(2500);
  const st = await pg.evaluate(() => [localStorage.getItem('fw.theme'), localStorage.getItem('focusWorkspaceTypographyV1'), localStorage.getItem('evil'), window.__PWA__.settingsCopied]);
  if (st[0] !== 'dark' || st[1] !== '{"x":1}' || st[2] !== null || st[3] !== 2) errs.push('setup link: look settings not copied right ' + JSON.stringify(st));
  const first = await pg.evaluate(() => ({ key: localStorage.getItem('pwa.key'), hash: location.hash, text: document.body.innerText,
    keyBox: !!document.getElementById('pwaKeyBox'), title: document.title }));
  if (first.key !== 'smokekey' || first.hash) errs.push('setup link: key not saved / not stripped from the URL');
  if (first.keyBox) errs.push('key box shown even though the key was given');
  if (!/Pay rent/.test(first.text)) errs.push('first open: today\'s tasks did not show');
  if (!calls.includes('getWorkspaceData')) errs.push('first open: getWorkspaceData was not called through the API');
  if (first.title !== 'Gantt') errs.push('title is ' + first.title);
  await pg.evaluate(() => navigator.serviceWorker.ready);
  // Store a copy as the background refresh would (it waits 20 s), then reopen: it must open from that copy and sync.
  await pg.evaluate(() => new Promise(ok => google.script.run.withSuccessHandler(ok).getWorkspaceData({ fast: true })));
  calls.length = 0;
  await pg.reload(); await pg.waitForTimeout(2500);
  const second = await pg.evaluate(() => ({ cache: !!(window.__PWA__ && window.__PWA__.fromCache), sw: !!navigator.serviceWorker.controller, text: document.body.innerText }));
  if (!second.sw) errs.push('service worker is not controlling the page on the second open');
  if (!second.cache) errs.push('second open did not start from the stored data');
  if (calls.includes('getWorkspaceData')) errs.push('second open still waited on getWorkspaceData');
  if (!calls.some(c => c === 'runImports' || c === 'getSyncState')) errs.push('second open did not sync after the stored data');
  if (!/Pay rent/.test(second.text)) errs.push('second open: tasks missing');
  // 2) Offline: opens from the service worker, banner shows, typing is blocked.
  await ctx.setOffline(true); netOff = true;
  await pg.reload(); await pg.waitForTimeout(2000);
  const off = await pg.evaluate(async () => {
    const out = { banner: !!document.getElementById('pwaOffline'), text: document.body.innerText };
    const span = [...document.querySelectorAll('[contenteditable="true"] .check-text')].find(s => s.offsetWidth);
    if (span) { const ed = span.closest('[contenteditable="true"]'); const before = ed.innerHTML;
      const ev = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true });
      out.blocked = !span.dispatchEvent(ev); out.same = ed.innerHTML === before; }
    return out;
  });
  if (!/Pay rent/.test(off.text)) errs.push('offline: the app did not open from cache');
  if (!off.banner) errs.push('offline: no "Offline · read-only" banner');
  if (off.blocked === false) errs.push('offline: typing was not blocked');
  await ctx.setOffline(false); netOff = false;
  // 3) Wrong key → key box. 4) Time Tracker page opens.
  await pg.evaluate(() => localStorage.setItem('pwa.key', 'nope')); await pg.reload(); await pg.waitForTimeout(1500);
  if (!(await pg.evaluate(() => !!document.getElementById('pwaKeyBox')))) errs.push('wrong key: no key box');
  await pg.evaluate(() => localStorage.setItem('pwa.key', 'smokekey'));
  await pg.goto(base + 'tracker.html'); await pg.waitForTimeout(1500);
  if (!(await pg.evaluate(() => document.title === 'Time Tracker' && !!document.getElementById('tabs')))) errs.push('tracker.html did not open');
  await ctx.close(); srv.close();
  if (errs.length) { fails += errs.length; console.error('✗ pwa:\n  ' + errs.join('\n  ')); }
  else console.log('✓ pwa: setup link + API shim + opens from stored data then syncs + offline read-only + key box + tracker');
}
// Database step (2026-11-22, NOTES H3): Keep In Mind on Firestore in the PWA, with a fake Firebase SDK.
if (only('pwa-fb')) {
  const { execFileSync } = await import('child_process');
  const http = await import('http');
  const dist = path.join(os.tmpdir(), 'gantt-pwa-fb-smoke');
  const cfg = { owner: 'juliussimtim@gmail.com', apiKey: 'AIzaTEST', authDomain: 'g.firebaseapp.com', projectId: 'g-test', appId: '1:2:web:3' };
  execFileSync('node', ['tools/build-pwa.mjs', dist], { env: { ...process.env, PWA_API_URL: 'https://api.test/exec', PWA_FIREBASE_CONFIG: JSON.stringify(cfg) }, stdio: 'pipe' });
  const FAKE = `if (!window.firebase) window.firebase = (function () {
    const S = window.__fs = { doc: { html: '<div>Gloves from db</div>', at: 100, base: 0, dev: 'x' }, backups: [], cb: null, sets: 0 };
    const snap = () => ({ exists: !!S.doc, data: () => S.doc, metadata: { fromCache: false, hasPendingWrites: false } });
    S.push = () => S.cb && S.cb(snap());
    const docApi = {
      get: () => Promise.resolve(snap()),
      set: rec => { S.sets++; if (S.doc && !(rec.at > S.doc.at)) return Promise.reject({ code: 'permission-denied' }); S.doc = rec; setTimeout(S.push, 10); return Promise.resolve(); },
      onSnapshot: (o, cb) => { S.cb = cb; setTimeout(S.push, 0); return () => {}; }
    };
    const auth = () => ({ onAuthStateChanged: cb => setTimeout(() => cb({ email: 'JuliusSimtim@gmail.com' }), 0), signOut: () => {} });
    auth.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    return { initializeApp: () => {}, auth, firestore: () => ({ enablePersistence: () => Promise.resolve(),
      collection: n => n === 'gantt' ? { doc: () => docApi } : { add: r => { S.backups.push(r); return Promise.resolve(); } } }) };
  })();`;
  const srv = http.createServer((q, r) => {
    let f = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (f.endsWith('/')) f += 'index.html';
    if (f.startsWith('/fb/')) { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(FAKE); }
    const fp = path.join(dist, f);
    if (!fp.startsWith(dist) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); r.end(fs.readFileSync(fp));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const errs = [], calls = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
  let netOff = false; // offline: the fake API fails like a real fetch would (a route answers even when the context is offline)
  await ctx.route('https://api.test/**', route => {
    if (netOff) return route.abort('internetdisconnected');
    const req = JSON.parse(route.request().postData() || '{}'); calls.push(req.fn);
    const r = req.fn === 'getWorkspaceData' ? data : req.fn === 'runImports' || req.fn === 'getSyncState' ? imported : req.fn === 'getFocus' ? focus
      : req.fn === 'getKim' ? { html: '<div>from server</div>', h: 'k0' }
      : req.fn === 'getMainCalendarEvents' ? { date: req.a[0], events: [] } : null;
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, r }) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('page error: ' + e.message));
  await pg.goto(base + '#k=smokekey'); await pg.waitForTimeout(3000);
  const kim = () => pg.evaluate(() => (document.querySelector('#kimScroll .kim-editor') || {}).innerText || '');
  if (!/Gloves from db/.test(await kim())) errs.push('Keep In Mind did not load from Firestore: ' + JSON.stringify((await kim()).slice(0, 80)));
  if (calls.includes('getKim')) errs.push('getKim still went to the server');
  if (await pg.evaluate(() => !!document.getElementById('pwaSignIn'))) errs.push('sign-in button shown while signed in');
  // Edit → saved to Firestore with a newer `at`, never through the server.
  await pg.evaluate(() => { const ed = document.querySelector('#kimScroll .kim-editor'); ed.insertAdjacentHTML('beforeend', '<div>Typed line</div>'); ed.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.waitForTimeout(1800);
  const s1 = await pg.evaluate(() => ({ html: __fs.doc.html, at: __fs.doc.at, dev: __fs.doc.dev }));
  if (!/Typed line/.test(s1.html) || !(s1.at > 100)) errs.push('edit not saved to Firestore: ' + JSON.stringify(s1).slice(0, 120));
  if (calls.includes('saveKim')) errs.push('saveKim went to the server');
  // Another device saves → live sync merges it in.
  await pg.evaluate(() => { __fs.doc = { html: __fs.doc.html + '<div>From the tablet</div>', at: __fs.doc.at + 50, base: 0, dev: 'pc' }; __fs.push(); });
  await pg.waitForTimeout(800);
  if (!/From the tablet/.test(await kim())) errs.push('live sync: other device\'s line did not show');
  // Older edit refused (newest wins) → copy goes to ganttBackup.
  await pg.evaluate(() => {
    localStorage.setItem('pwa.kim.unconfirmed', JSON.stringify({ html: '<div>stale</div>', at: 5 }));
    __fs.doc = Object.assign({}, __fs.doc, { at: __fs.doc.at + 1 }); __fs.push();
  });
  await pg.waitForTimeout(300);
  const bk = await pg.evaluate(() => ({ n: __fs.backups.length, r: __fs.backups[0] && __fs.backups[0].reason, left: localStorage.getItem('pwa.kim.unconfirmed') }));
  if (bk.n !== 1 || !/newest wins/.test(bk.r || '') || bk.left) errs.push('lost edit not backed up: ' + JSON.stringify(bk));
  // Offline: Keep In Mind can still be typed in, other editors stay read-only.
  netOff = true; await ctx.setOffline(true); await pg.waitForTimeout(300);
  const off = await pg.evaluate(() => {
    const ev = () => new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true });
    const k = document.querySelector('#kimScroll .kim-editor');
    const other = [...document.querySelectorAll('[contenteditable="true"]')].find(e => !e.closest('#kimScroll'));
    return { kim: k.dispatchEvent(ev()), other: other ? other.dispatchEvent(ev()) : null, bar: (document.getElementById('pwaOffline') || {}).textContent };
  });
  if (!off.kim) errs.push('offline: Keep In Mind was blocked');
  if (off.other !== false) errs.push('offline: other editors not read-only');
  if (!/Keep In Mind saves/.test(off.bar || '')) errs.push('offline banner text: ' + off.bar);
  await ctx.close(); srv.close();
  if (errs.length) { fails += errs.length; console.error('✗ pwa-fb:\n  ' + errs.join('\n  ')); }
  else console.log('✓ pwa-fb: Keep In Mind loads/saves on Firestore + live sync + newest-wins backup + offline editing');
}
// Days on the database (2026-11-22, NOTES H4): Today saves to the day doc with the server's hashes, an edit still on
// its way isn't undone by an older server copy, another device's save triggers a sync, an older edit is refused and
// backed up, and offline the days near today stay editable.
if (only('pwa-days')) {
  const { execFileSync } = await import('child_process');
  const http = await import('http');
  const crypto = await import('crypto');
  const md5 = t => crypto.createHash('md5').update(String(t || ''), 'utf8').digest('hex').slice(0, 16);
  const dist = path.join(os.tmpdir(), 'gantt-pwa-days-smoke');
  const cfg = { owner: 'juliussimtim@gmail.com', areas: ['kim', 'days'], apiKey: 'AIzaTEST', authDomain: 'g.firebaseapp.com', projectId: 'g-test', appId: '1:2:web:3' };
  execFileSync('node', ['tools/build-pwa.mjs', dist], { env: { ...process.env, PWA_API_URL: 'https://api.test/exec', PWA_FIREBASE_CONFIG: JSON.stringify(cfg) }, stdio: 'pipe' });
  const dd = JSON.parse(JSON.stringify(data));
  dd.days.forEach(d => { d.th = md5(d.tasks); d.jh = md5(d.journal); d.ph = md5(d.plan); d.hh = md5(d.tho); });
  const td = dd.days.find(d => d.date === today);
  const seed = { date: today, at: 100, tasks: td.tasks, tasksAt: 100, journal: td.journal || '', journalAt: 100, dev: 'x' };
  const FAKE = `if (!window.firebase) window.firebase = (function () {
    const S = window.__fs = { kim: { html: '<div>list</div>', at: 100, base: 0, dev: 'x' }, days: { [${JSON.stringify(today)}]: ${JSON.stringify(seed)} },
      backups: [], qcb: null, hold: false, sets: 0 };
    const meta = { fromCache: false, hasPendingWrites: false };
    S.push = () => S.qcb && S.qcb({ docs: Object.keys(S.days).map(d => ({ id: d, data: () => S.days[d], metadata: meta })) });
    const kimDoc = { get: () => Promise.resolve({ exists: true, data: () => S.kim, metadata: meta }), set: r => { S.kim = r; return Promise.resolve(); },
      onSnapshot: () => () => {} };
    const dayDoc = d => ({
      get: () => Promise.resolve({ exists: !!S.days[d], data: () => S.days[d] }),
      set: (rec, o) => {
        S.sets++;
        const cur = S.days[d] || {};
        for (const f of ['tasks', 'journal', 'plan', 'tho']) if (f in rec && !(rec[f + 'At'] > (cur[f + 'At'] || 0))) return Promise.reject({ code: 'permission-denied' });
        if (S.hold) return new Promise(() => {});
        S.last = { keys: Object.keys(rec), prevTasks: cur.tasks };
        S.days[d] = Object.assign(o && o.merge ? cur : {}, rec, { up: Date.now() });
        setTimeout(S.push, 10);
        return Promise.resolve();
      }
    });
    const q = { where: () => q, onSnapshot: (o, cb) => { S.qcb = cb; setTimeout(S.push, 0); return () => {}; } };
    const auth = () => ({ onAuthStateChanged: cb => setTimeout(() => cb({ email: 'juliussimtim@gmail.com' }), 0), signOut: () => {} });
    auth.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    const firestore = () => ({ enablePersistence: () => Promise.resolve(),
      collection: n => n === 'gantt' ? { doc: () => kimDoc } : n === 'ganttDays' ? { doc: dayDoc, where: q.where } : { add: r => { S.backups.push(r); return Promise.resolve(); } } });
    firestore.FieldValue = { serverTimestamp: () => 'SERVER_TS' };
    return { initializeApp: () => {}, auth, firestore };
  })();`;
  const srv = http.createServer((qq, r) => {
    let f = decodeURIComponent(new URL(qq.url, 'http://x').pathname); if (f.endsWith('/')) f += 'index.html';
    if (f.startsWith('/fb/')) { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(FAKE); }
    const fp = path.join(dist, f);
    if (!fp.startsWith(dist) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); r.end(fs.readFileSync(fp));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const errs = [], calls = [];
  let syncAnswer = { build: 'smoke', ref: {}, inbox: [], days: {} };
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
  await ctx.route('https://api.test/**', route => {
    const req = JSON.parse(route.request().postData() || '{}'); calls.push(req.fn);
    const r = req.fn === 'getWorkspaceData' ? dd : req.fn === 'runImports' || req.fn === 'getSyncState' ? syncAnswer : req.fn === 'getFocus' ? focus
      : req.fn === 'getMainCalendarEvents' ? { date: req.a[0], events: [] } : null;
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, r }) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('page error: ' + e.message));
  await pg.goto(base + '#k=smokekey'); await pg.waitForTimeout(3000);
  const ED = `#todayScroll .day-editor[data-date="${today}"]`;
  const type = t => pg.evaluate(([sel, t]) => { const ed = document.querySelector(sel); ed.insertAdjacentHTML('beforeend', '<div>' + t + '</div>'); ed.dispatchEvent(new Event('input', { bubbles: true })); }, [ED, t]);
  const shown = () => pg.evaluate(sel => (document.querySelector(sel) || {}).innerText || '', ED);
  if (!await pg.evaluate(sel => !!document.querySelector(sel), ED)) errs.push('no Today editor for ' + today);
  // Edit → day doc (Today only, server-matching base hash), never the server.
  await type('Typed today'); await pg.waitForTimeout(1800);
  const d1 = await pg.evaluate(t => { const x = __fs.days[t]; return { tasks: x.tasks, at: x.tasksAt, base: x.tasksBase, last: __fs.last }; }, today);
  if (!/Typed today/.test(d1.tasks || '') || !(d1.at > 100)) errs.push('Today not saved to the day doc: ' + JSON.stringify(d1).slice(0, 160));
  if (d1.base !== md5(d1.last.prevTasks)) errs.push('base hash ≠ server hash of the copy it replaced: ' + d1.base);
  if (d1.last.keys.includes('journal')) errs.push('a Today-only save also wrote Notes');
  if (calls.includes('saveDay')) errs.push('saveDay went to the server');
  // Second save builds on the first (hash from the doc copy = what the app holds).
  await type('Second line'); await pg.waitForTimeout(1800);
  if (!/Second line/.test(await pg.evaluate(t => __fs.days[t].tasks, today))) errs.push('second save did not reach the doc (hash mismatch?)');
  // An edit still on its way: an older server copy in a sync answer must not undo it.
  await pg.evaluate(() => { __fs.hold = true; });
  await type('Pending line'); await pg.waitForTimeout(1500);
  syncAnswer = { build: 'smoke', ref: {}, inbox: [], days: { [today]: { tasks: '<div>older server copy</div>', th: 'zzzz', jh: md5(td.journal) } } };
  await pg.evaluate(() => window.fwSync(false)); await pg.waitForTimeout(1200);
  const keep = await shown();
  if (!/Pending line/.test(keep) || /older server copy/.test(keep)) errs.push('pending edit undone by an older server copy: ' + keep.slice(-80));
  if (!(await pg.evaluate(() => localStorage.getItem('pwa.days.unconfirmed') || '')).includes('Pending line')) errs.push('pending edit not kept in localStorage');
  syncAnswer = { build: 'smoke', ref: {}, inbox: [], days: {} };
  await pg.evaluate(() => { __fs.hold = false; });
  // Another device saves Notes → a sync runs.
  const before = calls.filter(c => c === 'getSyncState').length;
  await pg.evaluate(t => { const x = __fs.days[t]; x.journal = '<div>From the tablet</div>'; x.journalAt = Date.now() + 5000; x.dev = 'pc'; __fs.push(); }, today);
  await pg.waitForTimeout(800);
  if (calls.filter(c => c === 'getSyncState').length <= before) errs.push('live sync: other device\'s save did not start a sync');
  // Newest wins: the doc has a newer Today than this edit → refused, copy goes to ganttBackup.
  await pg.evaluate(t => { __fs.days[t].tasksAt = Date.now() + 9e8; }, today);
  syncAnswer = { build: 'smoke', ref: {}, inbox: [], days: {} };
  await pg.evaluate(t => { const x = __fs.days[t]; x.tasks = x.tasks; }, today);
  await type('Too old'); await pg.waitForTimeout(1800);
  const bk = await pg.evaluate(() => __fs.backups.filter(b => b.area === 'days').map(b => b.field + ':' + b.reason));
  if (!bk.some(b => /^tasks:older edit lost/.test(b))) errs.push('refused edit not backed up: ' + JSON.stringify(bk));
  // Offline: Today (within ± 7 days) and Keep In Mind stay editable; Reference stays read-only.
  await ctx.setOffline(true); await pg.waitForTimeout(300);
  const off = await pg.evaluate(sel => {
    const ev = () => new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true });
    const other = [...document.querySelectorAll('[contenteditable="true"]')].find(e => !e.closest('#kimScroll,#todayScroll,#journalScroll,.plan-pad,.thought-pad,#scratchPad'));
    return { today: document.querySelector(sel).dispatchEvent(ev()), other: other ? other.dispatchEvent(ev()) : null, bar: (document.getElementById('pwaOffline') || {}).textContent };
  }, ED);
  if (!off.today) errs.push('offline: Today was blocked');
  if (off.other !== false) errs.push('offline: other editors not read-only');
  if (!/today ± 7 days save/.test(off.bar || '')) errs.push('offline banner text: ' + off.bar);
  await ctx.close(); srv.close();
  if (errs.length) { fails += errs.length; console.error('✗ pwa-days:\n  ' + errs.join('\n  ')); }
  else console.log('✓ pwa-days: Today saves to the day doc (server hashes), pending edits survive a sync, live sync, newest-wins backup, offline days');
}
// Full Days history on Firestore in the PWA (2026-11-23, NOTES H5 D), fake Firebase SDK: once gantt/daysMeta says the
// history is seeded, the opening (getWorkspaceData) and past days (getDaysRange) are built from the day docs + the
// cards, never the server: every date filled, server hashes, Urgent + Notes seeds from all days, this device's copy
// caught up with one `up` query; a day with no doc saves straight to the database; not seeded → the server.
if (only('pwa-hist')) {
  const { execFileSync } = await import('child_process');
  const http = await import('http');
  const crypto = await import('crypto');
  const md5 = t => crypto.createHash('md5').update(String(t || ''), 'utf8').digest('hex').slice(0, 16);
  const dist = path.join(os.tmpdir(), 'gantt-pwa-hist-smoke');
  const cfg = { owner: 'juliussimtim@gmail.com', areas: ['kim', 'days', 'ref', 'kv'], apiKey: 'AIzaTEST', authDomain: 'g.firebaseapp.com', projectId: 'g-test', appId: '1:2:web:3' };
  execFileSync('node', ['tools/build-pwa.mjs', dist], { env: { ...process.env, PWA_API_URL: 'https://api.test/exec', PWA_FIREBASE_CONFIG: JSON.stringify(cfg) }, stdio: 'pipe' });
  const dd = JSON.parse(JSON.stringify(data));
  dd.days.forEach(d => { d.th = md5(d.tasks); d.jh = md5(d.journal); d.ph = md5(d.plan); d.hh = md5(d.tho); });
  const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const old = addD(today, -40), first = addD(today, -60);
  const docs = {};
  dd.days.forEach(d => { docs[d.date] = { date: d.date, tasks: d.tasks || '', journal: d.journal || '', plan: d.plan || '', tho: d.tho || '', tasksAt: 1, journalAt: 1, planAt: 1, thoAt: 1, at: 1, up: 1000 }; });
  docs[today] = Object.assign(docs[today] || { journal: '', plan: '', tho: '', journalAt: 1, planAt: 1, thoAt: 1, at: 1, up: 1000, date: today },
    { tasks: '<div class="check-line" data-level="0"><input type="checkbox"><span class="check-text">From the database</span></div>', tasksAt: 5 });
  docs[old] = { date: old, tasks: '<div class="check-line" data-level="0" data-urg="1"><input type="checkbox"><span class="check-text">Old urgent</span></div>', tasksAt: 1, at: 1, up: 1000 };
  const cards = { r1: { id: 'r1', parentId: '', type: 'item', title: '', content: '<h2>Db card</h2>', expanded: 1, sort: 1, del: '', at: 100 },
    r9: { id: 'r9', parentId: '', type: 'item', title: '', content: '<h2>Gone</h2>', expanded: 1, sort: 2, del: '2026-01-01T00:00:00Z', at: 100 } };
  const FAKE = `if (!window.firebase) window.firebase = (function () {
    const S = window.__fs = { kim: { html: '<div>list</div>', at: 100, base: 0, dev: 'x' }, days: ${JSON.stringify(docs)}, ref: ${JSON.stringify(cards)},
      meta: { seeded: localStorage.getItem('fake.unseeded') ? 0 : 1, first: ${JSON.stringify(first)}, days: ${Object.keys(docs).length} }, gets: [], backups: [],
      kv: localStorage.getItem('fake.nokv') ? {} : { cardCats: { key: 'cardCats', v: JSON.stringify([{ key: 'code', name: 'DbCode', color: '#123456', words: 'x' }]), at: 5 }, refPinned: { key: 'refPinned', v: '["r1"]', at: 5 },
        funData: { key: 'funData', v: JSON.stringify({ v: 1, items: [{ id: 'f1', t: 'Hike', u: 5 }], cats: [] }), at: 5 } } };
    const meta = { fromCache: false, hasPendingWrites: false };
    const snap = (id, d) => ({ id, exists: !!d, data: () => d, metadata: meta });
    const qset = list => ({ docs: list, size: list.length });
    const query = (coll, fl) => ({
      where: (f, op, v) => query(coll, fl.concat([[f, op, v instanceof Date ? v.getTime() : v]])),
      get: o => { S.gets.push(coll + ':' + (o && o.source) + ':' + fl.map(x => x[0]).join(',')); const all = S[coll];
        return Promise.resolve(qset(Object.keys(all).filter(id => fl.every(([f, op, v]) => { const a = all[id][f]; return op === '>' ? a > v : op === '>=' ? a >= v : op === '<=' ? a <= v : a === v; })).map(id => snap(id, all[id])))); },
      onSnapshot: (o, cb) => { setTimeout(() => cb(coll === 'days' ? qset([]) : { docChanges: () => [] }), 0); return () => {}; } });
    const dayDoc = d => ({ get: () => Promise.resolve(snap(d, S.days[d])), set: (rec, o) => { S.days[d] = Object.assign(o && o.merge && S.days[d] || {}, rec, { up: Date.now() }); return Promise.resolve(); } });
    const gantt = { doc: n => n === 'daysMeta' ? { get: () => Promise.resolve(snap(n, S.meta)) } : n === 'refMeta' ? { get: () => Promise.resolve(snap(n, { seeded: 1 })) }
      : n === 'kvMeta' ? { get: () => Promise.resolve(snap(n, S.meta.seeded && S.kv.cardCats ? { seeded: 1 } : null)) }
      : n.indexOf('kv_') === 0 ? { get: () => Promise.resolve(snap(n, S.kv[n.slice(3)])), set: r => { const old = S.kv[n.slice(3)]; if (old && !(r.at > old.at)) return Promise.reject({ code: 'permission-denied' }); S.kv[n.slice(3)] = r; return Promise.resolve(); } }
      : { get: () => Promise.resolve(snap('kim', S.kim)), set: r => { S.kim = r; return Promise.resolve(); }, onSnapshot: () => () => {} } };
    const auth = () => ({ onAuthStateChanged: cb => setTimeout(() => cb({ email: 'juliussimtim@gmail.com' }), 0), signOut: () => {} });
    auth.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    const firestore = () => ({ enablePersistence: () => Promise.resolve(),
      collection: n => n === 'gantt' ? gantt : n === 'ganttDays' ? Object.assign(query('days', []), { doc: dayDoc })
        : n === 'ganttRef' ? Object.assign(query('ref', []), { doc: id => ({ get: () => Promise.resolve(snap(id, S.ref[id])) }) }) : { add: r => { S.backups.push(r); return Promise.resolve(); } } });
    firestore.FieldValue = { serverTimestamp: () => Date.now() };
    return { initializeApp: () => {}, auth, firestore };
  })();`;
  const srv = http.createServer((qq, r) => {
    let f = decodeURIComponent(new URL(qq.url, 'http://x').pathname); if (f.endsWith('/')) f += 'index.html';
    if (f.startsWith('/fb/')) { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(FAKE); }
    const fp = path.join(dist, f);
    if (!fp.startsWith(dist) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); r.end(fs.readFileSync(fp));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const errs = [], calls = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
  await ctx.route('https://api.test/**', route => {
    const req = JSON.parse(route.request().postData() || '{}'); calls.push(req.fn);
    const r = req.fn === 'getWorkspaceData' ? Object.assign({}, dd, { cardCats: [{ id: 'cc1', name: 'Cat' }] }) : req.fn === 'getSyncState' ? { build: 'smoke', ref: {}, inbox: [], days: {} } : req.fn === 'getFocus' ? focus
      : req.fn === 'getMainCalendarEvents' ? { date: req.a[0], events: [] } : req.fn === 'getDaysRange' ? [{ date: req.a[0], tasks: 'srv', journal: '', plan: '', tho: '' }] : null;
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, r }) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('page error: ' + e.message));
  const logs = []; pg.on('console', m => logs.push(m.text().slice(0, 200)));
  // First open on this device, settings not in the database yet (no last opening here either): the server answers.
  await pg.addInitScript(() => { if (!sessionStorage.getItem('kvOn')) localStorage.setItem('fake.nokv', '1'); });
  await pg.goto(base + '#k=smokekey'); await pg.waitForTimeout(3000);
  if (!calls.includes('getWorkspaceData')) errs.push('first open (no device copy, no settings docs) did not ask the server');
  await pg.evaluate(() => { sessionStorage.setItem('kvOn', '1'); localStorage.removeItem('fake.nokv'); localStorage.removeItem('pwa.days.up'); });
  // Next day's open (device copy from yesterday): built from the database.
  await pg.evaluate(() => { const c = JSON.parse(localStorage.getItem('pwa.initial.v1')); c.data.today = '2000-01-01'; localStorage.setItem('pwa.initial.v1', JSON.stringify(c)); });
  calls.length = 0;
  await pg.reload(); await pg.waitForTimeout(3500);
  if (calls.includes('getWorkspaceData')) errs.push('opening went to the server');
  const st = await pg.evaluate(() => JSON.parse(localStorage.getItem('pwa.initial.v1')).data);
  if (!st.days.some(d => /From the database/.test(d.tasks))) errs.push('opening not built from the database (calls ' + calls.join(',') + ')');
  else {
    const want = []; for (let d = addD(today, -7); d <= addD(today, 3); d = addD(d, 1)) want.push(d);
    if (st.days.map(d => d.date).join() !== want.join()) errs.push('opening dates: ' + st.days.map(d => d.date).join());
    const t = st.days.find(d => d.date === today);
    if (!t || !/From the database/.test(t.tasks) || t.th !== md5(t.tasks) || t.jh !== md5(t.journal)) errs.push('today from the db / hashes: ' + JSON.stringify(t).slice(0, 160));
    if (st.today !== today) errs.push('today: ' + st.today);
    if (!st.urgent.some(u => u.date === old && /Old urgent/.test(u.tasks))) errs.push('Urgent misses an old day');
    if (!st.notesSeeds.focus) errs.push('Notes seed (focus) missing');
    if (st.reference.length !== 1 || st.reference[0].id !== 'r1' || st.reference[0].ch !== md5('<h2>Db card</h2>')) errs.push('reference: ' + JSON.stringify(st.reference).slice(0, 160));
    const man = JSON.stringify(st.reference.map(r => ({ id: r.id, parentId: r.parentId, type: r.type, title: r.title, expanded: r.expanded, sort: r.sort })));
    if (st.refManifestHash !== md5(man)) errs.push('manifest hash ≠ server hash');
    if (!Array.isArray(st.cardCats) || st.cardCats[0].name !== 'DbCode') errs.push('card categories not from the database: ' + JSON.stringify(st.cardCats));
    if ((st.refPins || []).join() !== 'r1') errs.push('pins not from the database: ' + JSON.stringify(st.refPins));
  }
  if (!/From the database/.test(await pg.evaluate(t => (document.querySelector('#todayScroll .day-editor[data-date="' + t + '"]') || {}).innerText || '', today))) errs.push('database Today not on screen');
  // This device's copy is caught up with one `up` query (full read only the first time).
  const gets = await pg.evaluate(() => __fs.gets.slice());
  if (!gets.includes('days:server:')) errs.push('first history read was not a full read: ' + gets.join(' '));
  const run = (fn, ...a) => pg.evaluate(([fn, a]) => new Promise((ok, bad) => google.script.run.withSuccessHandler(ok).withFailureHandler(e => bad(e.message))[fn](...a)), [fn, a]);
  await pg.evaluate(() => { __fs.gets.length = 0; });
  await pg.evaluate(() => { const c = JSON.parse(localStorage.getItem('pwa.initial.v1')); c.data.today = '2000-01-01'; localStorage.setItem('pwa.initial.v1', JSON.stringify(c)); });
  await pg.reload(); await pg.waitForTimeout(3000);
  const g2 = await pg.evaluate(() => __fs.gets.slice());
  if (!g2.includes('days:server:up') || g2.includes('days:server:')) errs.push('second opening did not catch up with an `up` query: ' + g2.join(' '));
  // Past days from the database: every date filled (from the first Sheet day), server hashes.
  calls.length = 0;
  const rg = await run('getDaysRange', addD(old, -2), addD(old, 2));
  if (calls.includes('getDaysRange')) errs.push('getDaysRange went to the server');
  if (!Array.isArray(rg) || rg.length !== 5 || rg[2].date !== old || !/Old urgent/.test(rg[2].tasks) || rg[2].th !== md5(rg[2].tasks) || rg[0].tasks !== '' || rg[0].th !== md5('')) errs.push('range: ' + JSON.stringify(rg).slice(0, 200));
  const before = await run('getDaysRange', addD(first, -3), addD(first, 1));
  if (before.length !== 2 || before[0].date !== first) errs.push('range before the first day: ' + JSON.stringify(before.map(d => d.date)));
  // A day with no doc (empty) saves straight into the database.
  const empty = addD(today, 20);
  const sv = await run('saveDay', empty, '<div>new</div>', '', { th: md5(''), jh: md5(''), ct: true, cj: false });
  await pg.waitForTimeout(200);
  if (calls.includes('saveDay') || !sv || sv.th !== md5('<div>new</div>')) errs.push('empty day save: ' + JSON.stringify(sv));
  if (!(await pg.evaluate(d => __fs.days[d] && __fs.days[d].tasks, empty) || '').includes('new')) errs.push('empty day not written to its doc');
  // App settings (H5 F): Fun / pins straight from and to the database, server answer shapes.
  calls.length = 0;
  const fun = await run('getFun');
  if (!fun || fun.items[0].t !== 'Hike') errs.push('getFun not from the database: ' + JSON.stringify(fun));
  const fm = await run('saveFun', { items: [{ id: 'f2', t: 'Swim', u: 9 }], cats: [] });
  if (!fm || fm.items.map(i => i.id).sort().join() !== 'f1,f2' || !/Swim/.test(await pg.evaluate(() => __fs.kv.funData.v))) errs.push('saveFun did not merge into the doc: ' + JSON.stringify(fm));
  const pins = await run('setReferencePin', 'r2', true);
  if ((pins || []).join() !== 'r2,r1' || await pg.evaluate(() => __fs.kv.refPinned.v) !== '["r2","r1"]') errs.push('pin not saved to the doc: ' + JSON.stringify(pins));
  const hd = await run('setCalEventsHide', { cals: [{ id: 'c1', name: 'C' }], words: [' x '] });
  if (!hd || hd.words[0] !== 'x' || !(await pg.evaluate(() => __fs.kv.ceHide && __fs.kv.ceHide.v) || '').includes('c1')) errs.push('hide list not saved: ' + JSON.stringify(hd));
  if (calls.some(c => /Fun|Pin|Hide/.test(c))) errs.push('settings went to the server: ' + calls.join());
  // Not seeded → the server answers both.
  await pg.evaluate(() => { localStorage.setItem('fake.unseeded', '1'); const c = JSON.parse(localStorage.getItem('pwa.initial.v1')); c.data.today = '2000-01-01'; localStorage.setItem('pwa.initial.v1', JSON.stringify(c)); });
  calls.length = 0;
  await pg.reload(); await pg.waitForTimeout(3500);
  if (!calls.includes('getWorkspaceData')) errs.push('not seeded: opening did not go to the server');
  const r2 = await run('getDaysRange', old, old);
  if (!r2.length || r2[0].tasks !== 'srv') errs.push('not seeded: getDaysRange did not go to the server');
  // Editable local-first (H5 G): yesterday's device copy opens at once, re-dated to today, editable; then the sync.
  await pg.evaluate(([y, gone]) => { const c = JSON.parse(localStorage.getItem('pwa.initial.v1')); c.data.today = y; c.data.days = c.data.days.filter(d => d.date !== gone); localStorage.setItem('pwa.initial.v1', JSON.stringify(c)); }, [addD(today, -1), addD(today, 3)]);
  calls.length = 0;
  await pg.reload(); await pg.waitForTimeout(1500);
  if (calls.includes('getWorkspaceData')) errs.push('yesterday\'s copy: opening waited on the server');
  if (!calls.includes('getSyncState')) errs.push('yesterday\'s copy: no sync right after opening: ' + calls.join());
  const lf = await pg.evaluate(([t, f]) => { const ed = document.querySelector('#todayScroll .day-editor[data-date="' + t + '"]'), fu = document.querySelector('#todayScroll .day-editor[data-date="' + f + '"]');
    return { today: !!ed, editable: !!ed && ed.isContentEditable, future: !!fu, redated: window.__PWA__ && window.__PWA__.redated, snap: !!document.getElementById('fwSnap') }; }, [today, addD(today, 3)]);
  if (!lf.today || !lf.editable || !lf.future || !lf.redated || lf.snap) errs.push('yesterday\'s copy not opened editable at once: ' + JSON.stringify(lf));
  // H (2026-11-23): sync from the database. First sync of a session = server; next ones from the docs, same answer shape.
  await pg.evaluate(() => { localStorage.removeItem('fake.unseeded'); });
  await pg.reload(); await pg.waitForTimeout(2500);
  const sreq = await pg.evaluate(t => { const d = window.__fs.days[t]; return { days: {}, ref: {}, refSync: 2, refManifestHash: '', inbox: false }; }, today);
  const dayNow = await pg.evaluate(t => window.__fs.days[t], today);
  sreq.days[today] = { th: md5(dayNow.tasks), jh: md5(dayNow.journal || '') };
  sreq.ref = { r1: md5('<h2>Db card</h2>') };
  calls.length = 0;
  await run('getSyncState', sreq);
  if (!calls.includes('getSyncState')) await run('getSyncState', sreq); // the page may already have done its server sync
  calls.length = 0;
  let sy = await run('getSyncState', sreq);
  if (calls.includes('getSyncState') || !sy || !sy.timing || !sy.timing.fromDb) errs.push('sync not from the database: ' + JSON.stringify(sy).slice(0, 200) + ' ' + calls.join());
  else {
    if (Object.keys(sy.days).length || Object.keys(sy.ref).length) errs.push('unchanged sync not empty: ' + JSON.stringify(sy).slice(0, 200));
    if (!sy.refManifest || sy.refManifest.items.map(x => x.id).join() !== 'r1') errs.push('manifest: ' + JSON.stringify(sy.refManifest));
  }
  // Another device changes today's Today + the card → the next sync brings exactly those.
  await pg.evaluate(t => { const n = Date.now(); Object.assign(window.__fs.days[t], { tasks: '<div>other device</div>', tasksAt: n, up: n });
    Object.assign(window.__fs.ref.r1, { content: '<h2>Edited elsewhere</h2>', at: n, up: n }); }, today);
  sy = await run('getSyncState', sreq);
  const e = sy && sy.days && sy.days[today];
  if (!e || e.tasks !== '<div>other device</div>' || e.th !== md5('<div>other device</div>') || e.journal !== undefined) errs.push('changed day: ' + JSON.stringify(e));
  if (!sy.ref.r1 || sy.ref.r1.content !== '<h2>Edited elsewhere</h2>' || sy.ref.r1.ch !== md5('<h2>Edited elsewhere</h2>')) errs.push('changed card: ' + JSON.stringify(sy.ref));
  const gH = await pg.evaluate(() => window.__fs.gets.slice(-6));
  if (gH.some(x => /^ref:server:$/.test(x))) errs.push('sync re-read every card: ' + gH.join(' | '));
  await ctx.close(); srv.close();
  if (errs.length) { fails += errs.length; console.error('✗ pwa-hist:\n  ' + errs.join('\n  ')); }
  else console.log('✓ pwa-hist: opening + past days from the database (dates, hashes, Urgent, seeds, cards, pins + subjects), `up` catch-up, empty day saves, settings (Fun merge, pins, hide list), server before the seed, yesterday\'s copy opens editable at once, sync from the docs (only changes read)');
}
// Reference on Firestore in the PWA (2026-11-23, NOTES H5 C), fake Firebase SDK: card saves (server hashes), new cards,
// delete → Archive (del on the subtree), restore, order, expand all go to ganttRef docs, never the server; another
// device's edit starts a sync; a refused write is backed up; before the seed (no gantt/refMeta) it all goes to the server.
if (only('pwa-ref')) {
  const { execFileSync } = await import('child_process');
  const http = await import('http');
  const crypto = await import('crypto');
  const md5 = t => crypto.createHash('md5').update(String(t || ''), 'utf8').digest('hex').slice(0, 16);
  const dist = path.join(os.tmpdir(), 'gantt-pwa-ref-smoke');
  const cfg = { owner: 'juliussimtim@gmail.com', areas: ['kim', 'days', 'ref'], apiKey: 'AIzaTEST', authDomain: 'g.firebaseapp.com', projectId: 'g-test', appId: '1:2:web:3' };
  execFileSync('node', ['tools/build-pwa.mjs', dist], { env: { ...process.env, PWA_API_URL: 'https://api.test/exec', PWA_FIREBASE_CONFIG: JSON.stringify(cfg) }, stdio: 'pipe' });
  const dd = JSON.parse(JSON.stringify(data));
  dd.reference = [{ id: 'r1', parentId: '', type: 'item', title: '', content: '<h2>Sample card</h2><p>text</p>', expanded: true, sort: 1 },
    { id: 'r2', parentId: 'r1', type: 'item', title: '', content: '<h2>Child</h2>', expanded: true, sort: 2 }];
  dd.reference.forEach(r => { r.ch = md5(r.content); });
  const cards = Object.fromEntries(dd.reference.map(r => [r.id, { id: r.id, parentId: r.parentId, type: 'item', title: '', content: r.content, expanded: 1, sort: r.sort, del: '', at: 100, dev: 'x' }]));
  const FAKE = `if (!window.firebase) window.firebase = (function () {
    const S = window.__fs = { kim: { html: '<div>list</div>', at: 100, base: 0, dev: 'x' }, ref: ${JSON.stringify(cards)}, meta: { seeded: localStorage.getItem('fake.unseeded') ? 0 : 1 }, ups: [],
      backups: [], qcb: null, sets: 0, refuse: false };
    const snap = (id, d) => ({ id, exists: !!d, data: () => d, metadata: { hasPendingWrites: false } });
    const write = (id, rec, o) => {
      const cur = S.ref[id];
      if (S.refuse || (cur && !(rec.at > cur.at))) return Promise.reject({ code: 'permission-denied' });
      S.sets++; S.ups.push(rec.up); S.ref[id] = Object.assign(o && o.merge && cur ? cur : {}, rec, { up: Date.now() });
      return Promise.resolve();
    };
    S.push = (id, chg) => { Object.assign(S.ref[id], chg, { up: Date.now() }); S.qcb && S.qcb({ docChanges: () => [{ doc: snap(id, S.ref[id]) }] }); };
    const refDoc = id => ({ get: () => Promise.resolve(snap(id, S.ref[id])), set: (rec, o) => write(id, rec, o) });
    const refColl = { doc: refDoc, get: () => Promise.resolve({ docs: Object.keys(S.ref).map(id => snap(id, S.ref[id])) }),
      where: () => ({ onSnapshot: (o, cb) => { S.qcb = cb; setTimeout(() => cb({ docChanges: () => [] }), 0); return () => {}; } }) };
    const gantt = { doc: n => n === 'refMeta' ? { get: () => Promise.resolve(snap(n, S.meta)) }
      : { get: () => Promise.resolve(snap('kim', S.kim)), set: r => { S.kim = r; return Promise.resolve(); }, onSnapshot: () => () => {} } };
    const batch = () => { const ops = []; return { set: (ref, rec, o) => ops.push([ref, rec, o]), commit: () => S.refuse ? Promise.reject({ code: 'permission-denied' }) : Promise.all(ops.map(x => x[0].set(x[1], x[2]))) }; };
    const auth = () => ({ onAuthStateChanged: cb => setTimeout(() => cb({ email: 'juliussimtim@gmail.com' }), 0), signOut: () => {} });
    auth.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    const noDays = { doc: () => ({ get: () => Promise.resolve(snap('', null)), set: () => Promise.resolve() }), where: () => ({ where: () => ({ onSnapshot: () => () => {} }), onSnapshot: () => () => {} }) };
    const firestore = () => ({ enablePersistence: () => Promise.resolve(), batch,
      collection: n => n === 'gantt' ? gantt : n === 'ganttRef' ? refColl : n === 'ganttDays' ? noDays : { add: r => { S.backups.push(r); return Promise.resolve(); } } });
    firestore.FieldValue = { serverTimestamp: () => 'SERVER_TS' };
    return { initializeApp: () => {}, auth, firestore };
  })();`;
  const srv = http.createServer((qq, r) => {
    let f = decodeURIComponent(new URL(qq.url, 'http://x').pathname); if (f.endsWith('/')) f += 'index.html';
    if (f.startsWith('/fb/')) { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(FAKE); }
    const fp = path.join(dist, f);
    if (!fp.startsWith(dist) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); r.end(fs.readFileSync(fp));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const errs = [], calls = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
  await ctx.route('https://api.test/**', route => {
    const req = JSON.parse(route.request().postData() || '{}'); calls.push(req.fn);
    const r = req.fn === 'getWorkspaceData' ? dd : req.fn === 'getSyncState' ? { build: 'smoke', ref: {}, inbox: [], days: {} } : req.fn === 'getFocus' ? focus
      : req.fn === 'getMainCalendarEvents' ? { date: req.a[0], events: [] } : req.fn === 'getArchive' ? [{ id: 'srv', deletedAt: 'x', title: '', content: '', children: 0 }] : null;
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, r }) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('page error: ' + e.message));
  await pg.goto(base + '#k=smokekey'); await pg.waitForTimeout(3000);
  const run = (fn, ...a) => pg.evaluate(([fn, a]) => new Promise((ok, bad) => google.script.run.withSuccessHandler(ok).withFailureHandler(e => bad(e.message))[fn](...a)), [fn, a]);
  const fsr = () => pg.evaluate(() => JSON.parse(JSON.stringify(__fs.ref)));
  // Typing in a card → its doc (content + server-matching hashes), not the server.
  await pg.evaluate(() => { const ed = document.querySelector('#referenceTree .ref-cell-wrapper[data-id="r1"] .ref-cell'); ed.insertAdjacentHTML('beforeend', '<p>typed here</p>'); ed.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.waitForTimeout(2500);
  let R = await fsr();
  if (!/typed here/.test(R.r1.content || '')) errs.push('card edit not in its doc: ' + String(R.r1.content).slice(0, 80));
  else {
    if (R.r1.ch !== md5(R.r1.content)) errs.push('doc ch ≠ server hash');
    if (R.r1.base !== md5(cards.r1.content)) errs.push('doc base ≠ hash of the copy it replaced');
    const ups = await pg.evaluate(() => __fs.ups);
    if (!(R.r1.at > 100) || !ups.length || ups.some(u => u !== 'SERVER_TS') || !/^(phone|pc)-/.test(R.r1.dev || '')) errs.push('doc stamps: ' + JSON.stringify({ at: R.r1.at, ups, dev: R.r1.dev }));
  }
  if (calls.includes('saveReferenceItem')) errs.push('saveReferenceItem went to the server');
  // Stale base → conflict with the doc copy sent back, nothing written.
  const sets0 = await pg.evaluate(() => __fs.sets);
  const c = await run('saveReferenceItem', { id: 'r2', fwSync: true, content: '<h2>x</h2>', contentChanged: true, baseHash: 'stale' });
  if (!c.conflict || c.content !== cards.r2.content || c.ch !== md5(cards.r2.content)) errs.push('stale save: ' + JSON.stringify(c));
  if (await pg.evaluate(() => __fs.sets) !== sets0) errs.push('stale save wrote the doc');
  // Collapse via metaChanges.
  const m = await run('saveReferenceItem', { id: 'r2', fwSync: true, content: cards.r2.content, contentChanged: false, baseHash: md5(cards.r2.content), metaChanges: { expanded: { before: true, after: false } } });
  if (m.meta.expanded !== false || (await fsr()).r2.expanded !== 0) errs.push('collapse not saved: ' + JSON.stringify(m));
  // New card, order, expand all.
  const id = await run('addReferenceItem', '', '', '<h2><br></h2>');
  R = await fsr();
  if (!R[id] || R[id].del !== '' || R[id].expanded !== 1 || R[id].id !== id) errs.push('new card doc: ' + JSON.stringify(R[id]));
  await run('saveReferenceOrder', [{ id: 'r2', sort: 0 }, { id: 'r1', sort: 5 }]); await pg.waitForTimeout(100);
  R = await fsr(); if (R.r2.sort !== 0 || R.r1.sort !== 5) errs.push('order not saved');
  await run('saveReferenceExpanded', true); await pg.waitForTimeout(100);
  if ((await fsr()).r2.expanded !== 1) errs.push('expand all not saved');
  // Delete r1 → r1 + child r2 marked deleted with one time; Archive lists r1 with 1 inside; restore brings both back.
  await run('deleteReferenceItem', 'r1'); await pg.waitForTimeout(100);
  R = await fsr();
  if (!R.r1.del || R.r1.del !== R.r2.del || R[id].del) errs.push('delete: ' + [R.r1.del, R.r2.del, R[id].del].join('|'));
  const arch = await run('getArchive');
  if (arch.length !== 1 || arch[0].id !== 'r1' || arch[0].children !== 1) errs.push('archive: ' + JSON.stringify(arch));
  else {
    const back = await run('restoreArchivedItem', 'r1', arch[0].deletedAt); await pg.waitForTimeout(100);
    R = await fsr();
    if (R.r1.del || R.r2.del) errs.push('restore left del set');
    if (!Array.isArray(back) || !back.some(x => x.id === 'r2' && x.ch === md5(x.content))) errs.push('restore answer: ' + JSON.stringify(back).slice(0, 120));
  }
  for (const fn of ['addReferenceItem', 'saveReferenceOrder', 'saveReferenceExpanded', 'deleteReferenceItem', 'getArchive', 'restoreArchivedItem'])
    if (calls.includes(fn)) errs.push(fn + ' went to the server');
  // Another device edits a card → a sync runs.
  const before = calls.filter(x => x === 'getSyncState').length + await pg.evaluate(() => window.__PWA_SYNCDB || 0);
  await pg.evaluate(() => __fs.push('r1', { content: '<h2>From the tablet</h2>', at: Date.now() + 5000, dev: 'pc-other' }));
  await pg.waitForTimeout(1200);
  if (calls.filter(x => x === 'getSyncState').length + await pg.evaluate(() => window.__PWA_SYNCDB || 0) <= before) errs.push('live sync: other device\'s card edit did not start a sync');
  // Refused (newer copy elsewhere) → the edit goes to ganttBackup.
  await pg.evaluate(() => { __fs.refuse = true; });
  const cur = (await fsr()).r1.content;
  await run('saveReferenceItem', { id: 'r1', fwSync: true, content: cur + '<p>lost</p>', contentChanged: true, baseHash: md5(cur) }); await pg.waitForTimeout(300);
  if (!(await pg.evaluate(() => __fs.backups.some(b => b.area === 'ref' && b.card === 'r1' && /newest wins/.test(b.reason))))) errs.push('refused card edit not backed up');
  await pg.evaluate(() => { __fs.refuse = false; });
  // Not seeded yet → the server answers.
  await pg.evaluate(() => { localStorage.setItem('fake.unseeded', '1'); });
  await pg.reload(); await pg.waitForTimeout(3000);
  const a2 = await run('getArchive');
  if (!a2.length || a2[0].id !== 'srv') errs.push('before the seed: getArchive did not go to the server');
  await ctx.close(); srv.close();
  if (errs.length) { fails += errs.length; console.error('✗ pwa-ref:\n  ' + errs.join('\n  ')); }
  else console.log('✓ pwa-ref: Reference on Firestore — card saves (server hashes), add, order, expand, delete → Archive → restore, live sync, refused backup, server before the seed');
}
// Calendar copy (H5 B2, 2026-11-23): calendar reads from the server's month docs in the database (server shapes),
// server path when outside the window / copy stale / refused / right after an edit (which asks the server to re-copy).
if (only('pwa-cal')) {
  const { execFileSync } = await import('child_process');
  const http = await import('http');
  const dist = path.join(os.tmpdir(), 'gantt-pwa-cal-smoke');
  const cfg = { owner: 'juliussimtim@gmail.com', areas: ['cal'], apiKey: 'AIzaTEST', authDomain: 'g.firebaseapp.com', projectId: 'g-test', appId: '1:2:web:3' };
  execFileSync('node', ['tools/build-pwa.mjs', dist], { env: { ...process.env, PWA_API_URL: 'https://api.test/exec', PWA_FIREBASE_CONFIG: JSON.stringify(cfg) }, stdio: 'pipe' });
  const m0 = today.slice(0, 7), addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const nextM = m => addD(m + '-28', 7).slice(0, 7), m1 = nextM(m0);
  const evs = [
    { id: 'a@g|1', eventId: 'a@g', startMs: 1, calId: 'main', cal: 'Main', title: 'Dentist', allDay: false, start: today + 'T09:00:00-08:00', end: today + 'T10:30:00-08:00', color: '#de583d', colorId: '11', done: false, editable: true, recurring: false, urg: '1', uc: 1 },
    { id: 'b@g|2', eventId: 'b@g', startMs: Date.parse(today + 'T08:00:00Z'), calId: 'other', cal: 'Other', title: 'Trip', allDay: true, start: today, end: addD(today, 2), color: '#7577c4', colorId: '9', done: false, editable: false, recurring: false, urg: '3', uc: 1 },
    { id: 'c@g|3', eventId: 'c@g', startMs: 3, calId: 'main', cal: 'Main', title: 'Later', allDay: false, start: addD(today, 3) + 'T13:00:00-08:00', end: addD(today, 3) + 'T14:00:00-08:00', color: '#8a8f98', colorId: '', done: false, editable: true, recurring: true, due: '2026-12-01' }];
  const FAKE = `if (!window.firebase) window.firebase = (function () {
    const S = window.__fs = { cb: null, err: null, refuse: !!localStorage.getItem('fake.refuse'),
      docs: { meta: { v: 1, from: ${JSON.stringify(m0 + '-01')}, to: ${JSON.stringify(nextM(m1) + '-01')}, months: ${JSON.stringify(JSON.stringify([m0, m1]))},
        cals: '[{"id":"main","name":"Main","color":"#fff"}]', failed: '[]', main: 'main', tz: 'America/Los_Angeles', at: Date.now() - Number(localStorage.getItem('fake.age') || 0) },
        ${JSON.stringify(m0)}: { ev: ${JSON.stringify(JSON.stringify(evs))} }, ${JSON.stringify(m1)}: { ev: ${JSON.stringify(JSON.stringify(evs))} } } };
    const snap = (id, d) => ({ id, exists: !!d, data: () => d });
    S.push = (id, d) => { S.docs[id] = Object.assign(S.docs[id] || {}, d); S.cb && S.cb({ docChanges: () => [{ type: 'modified', doc: snap(id, S.docs[id]) }] }); };
    const calColl = { onSnapshot: (cb, bad) => { S.cb = cb; setTimeout(() => S.refuse ? bad({ code: 'permission-denied' }) : cb({ docChanges: () => Object.keys(S.docs).map(id => ({ type: 'added', doc: snap(id, S.docs[id]) })) }), 0); return () => {}; } };
    const auth = () => ({ onAuthStateChanged: cb => setTimeout(() => cb({ email: 'juliussimtim@gmail.com' }), 0), signOut: () => {} });
    auth.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    const none = { doc: () => ({ get: () => Promise.resolve(snap('', null)), onSnapshot: () => () => {} }), where: () => ({ onSnapshot: () => () => {} }), add: () => Promise.resolve() };
    const firestore = () => ({ enablePersistence: () => Promise.resolve(), collection: n => n === 'ganttCal' ? calColl : none });
    firestore.FieldValue = { serverTimestamp: () => Date.now() };
    return { initializeApp: () => {}, auth, firestore };
  })();`;
  const srv = http.createServer((qq, r) => {
    let f = decodeURIComponent(new URL(qq.url, 'http://x').pathname); if (f.endsWith('/')) f += 'index.html';
    if (f.startsWith('/fb/')) { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(FAKE); }
    const fp = path.join(dist, f);
    if (!fp.startsWith(dist) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); r.end(fs.readFileSync(fp));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const errs = [], calls = []; let syncAt = 0;
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
  await ctx.route('https://api.test/**', route => {
    const req = JSON.parse(route.request().postData() || '{}'); calls.push(req.fn);
    if (req.fn === 'calSyncNow') syncAt = Date.now() + 60000;
    const r = req.fn === 'getWorkspaceData' ? data : req.fn === 'getSyncState' ? { build: 'smoke', ref: {}, inbox: [], days: {} } : req.fn === 'getFocus' ? focus
      : req.fn === 'getMainCalendarEvents' ? { date: req.a[0], events: [], srv: 1 } : req.fn === 'getCalendarRange' ? { events: [], calendars: [], failed: [], via: 'api' }
      : req.fn === 'calSyncNow' ? { months: 2, written: 1, at: syncAt } : req.fn === 'calPanelCreateEvent' ? { id: 'n' } : null;
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, r }) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('page error: ' + e.message + (process.env.SMOKE_STACK ? ' ' + e.stack : '')));
  await pg.goto(base + '#k=smokekey'); await pg.waitForTimeout(3000);
  const run = (fn, ...a) => pg.evaluate(([fn, a]) => new Promise((ok, bad) => google.script.run.withSuccessHandler(ok).withFailureHandler(e => bad(e.message))[fn](...a)), [fn, a]);
  calls.length = 0;
  const rg = await run('getCalendarRange', today, addD(today, 7));
  if (calls.includes('getCalendarRange') || !rg || rg.via !== 'db') errs.push('range not from the copy: ' + JSON.stringify(rg).slice(0, 160) + ' calls ' + calls.join());
  else {
    if (rg.events.map(e => e.title).join() !== 'Dentist,Trip,Later') errs.push('range events: ' + rg.events.map(e => e.title).join());
    if (rg.events.some(e => 'uc' in e)) errs.push('uc flag leaked into the answer');
    if (rg.calendars[0].name !== 'Main') errs.push('calendars: ' + JSON.stringify(rg.calendars));
  }
  const one = await run('getCalendarRange', addD(today, 3), addD(today, 4));
  if (!one || one.events.map(e => e.title).join() !== 'Later') errs.push('one-day range overlap: ' + JSON.stringify(one && one.events.map(e => e.title)));
  const main = await run('getMainCalendarEvents', today);
  if (calls.includes('getMainCalendarEvents') || !main || main.srv) errs.push('main list not from the copy: ' + JSON.stringify(main).slice(0, 160));
  else {
    const [a, d] = main.events;
    if (!a || a.title !== 'Trip' || !a.allDay || a.ro !== true || a.urg || a.time !== 'All day') errs.push('main all-day row: ' + JSON.stringify(a));
    if (!d || d.title !== 'Dentist' || d.time !== '9:00 AM–10:30 AM' || d.urg !== '1' || d.id !== 'a@g' || d.hex !== '#de583d' || d.ro !== false || d.start !== Date.parse(today + 'T09:00:00-08:00')) errs.push('main timed row: ' + JSON.stringify(d));
    if (a && a.end - a.start < 47 * 3600000) errs.push('all-day end: ' + (a.end - a.start));
  }
  // Outside the window → server.
  calls.length = 0;
  await run('getCalendarRange', addD(m0 + '-01', -10), addD(m0 + '-01', -3));
  if (!calls.includes('getCalendarRange')) errs.push('outside the window did not go to the server');
  // An edit → re-copy asked for, server answers until the copy catches up.
  calls.length = 0;
  await run('calPanelCreateEvent', { title: 'x' }); await pg.waitForTimeout(300);
  if (!calls.includes('calSyncNow')) errs.push('edit did not ask for a re-copy: ' + calls.join());
  calls.length = 0;
  await run('getMainCalendarEvents', today);
  if (!calls.includes('getMainCalendarEvents')) errs.push('right after an edit the copy was used');
  // A copy that finished after the edit but isn't the re-copy it asked for (read before it) must not count.
  await pg.evaluate(at => __fs.push('meta', { at: at - 1000 }), syncAt);
  calls.length = 0;
  await run('getMainCalendarEvents', today);
  if (!calls.includes('getMainCalendarEvents')) errs.push('an older copy (read before the edit) was taken as caught up');
  await pg.evaluate(at => __fs.push('meta', { at: at }), syncAt);
  calls.length = 0;
  await run('getMainCalendarEvents', today);
  if (calls.includes('getMainCalendarEvents')) errs.push('copy not used again after it caught up');
  // Old copy (trigger stopped) → server; refused (rules not published) → server.
  for (const [k, v, why] of [['fake.age', String(30 * 60000), 'stale copy'], ['fake.refuse', '1', 'refused']]) {
    await pg.evaluate(([k, v]) => { localStorage.setItem(k, v); }, [k, v]);
    await pg.reload(); await pg.waitForTimeout(2500);
    calls.length = 0;
    await run('getCalendarRange', today, addD(today, 7));
    if (!calls.includes('getCalendarRange')) errs.push(why + ': did not go to the server');
    await pg.evaluate(k => localStorage.removeItem(k), k);
  }
  await ctx.close(); srv.close();
  if (errs.length) { fails += errs.length; console.error('✗ pwa-cal:\n  ' + errs.join('\n  ')); }
  else console.log('✓ pwa-cal: calendar from the database copy (range + main list in server shapes), server outside the window / after an edit until re-copied / stale / refused');
}
// One calm return (2026-11-21, speed item M; batched 2026-11-23, speed plan E): coming back runs ONE queue — registered
// jobs in order, their reads in one batchCalls, skipping ones refreshed < 60 s ago; Speed Log 'resume' row only when something ran.
// D2 (2026-11-23): Focus (device merge, base check), Inbox (offline too), Plan + Cal Backlog from the database; batched reads split.
if (only('pwa-d2')) {
  const { execFileSync } = await import('child_process');
  const http = await import('http');
  const dist = path.join(os.tmpdir(), 'gantt-pwa-d2-smoke');
  const cfg = { owner: 'juliussimtim@gmail.com', areas: ['focus', 'inbox', 'plan', 'timer', 'cal'], calFn: 'https://fn.test/cal', apiKey: 'AIzaTEST', authDomain: 'g.firebaseapp.com', projectId: 'g-test', appId: '1:2:web:3' };
  execFileSync('node', ['tools/build-pwa.mjs', dist], { env: { ...process.env, PWA_API_URL: 'https://api.test/exec', PWA_FIREBASE_CONFIG: JSON.stringify(cfg) }, stdio: 'pipe' });
  const FAKE = `if (!window.firebase) window.firebase = (function () {
    const now = Date.now();
    const S = window.__fs = { refuseOnce: 0, writes: [], backups: [], subs: {}, touch: n => (S.subs[n] || []).forEach(cb => cb({ docs: all(n) })),
      docs: {
        'ganttFocus/main': { v: JSON.stringify({ v: 1, cats: [{ id: 'c1', name: 'Work', items: [{ id: 'i1', t: 'One' }] }] }), at: 10, base: 0 },
        'gantt/inboxMeta': { seeded: 1 }, 'gantt/planMeta': { seeded: 1, cal: 'main' },
        'ganttInbox/ai1': { id: 'ai1', from: 'claude', title: 'From Claude', details: '', added: '2026-11-20', arch: '', done: 0, gone: 0, ord: 0, at: 1 },
        'ganttInbox/ai2': { id: 'ai2', from: 'claude', title: 'Gone', gone: 1, ord: 1, at: 1 },
        'ganttInbox/a100': { id: 'a100', from: 'app', title: 'Mine', details: 'd', added: '2026-11-21', arch: '', done: 0, gone: 0, ord: 100, at: 1 },
        'ganttPlan/p1': { id: 'p1', date: '', group: 'big', rank: 1, ref: 'tid:aa', title: 'One', target: '', event: 'ev1@100', updated: '', del: 0, at: 1,
          ev: JSON.stringify({ eventId: 'ev1', startMs: 100, title: 'Ev', done: false, date: '2026-11-23', allDay: true, recurring: false, time: '' }) },
        'ganttPlan/p2': { id: 'p2', date: '', group: 'next', rank: 1, ref: 'tid:bb', title: 'Two', target: '', event: '', updated: '', del: 0, at: 1 },
        'ganttPlan/p0': { id: 'p0', date: '', group: 'next', rank: 2, ref: 'tid:zz', title: 'Removed', del: 1, at: 1 },
        'gantt/timerMeta': { seeded: 1, from: '2020-01-01' },
        ['ganttDays/' + ${JSON.stringify(today)}]: { date: ${JSON.stringify(today)}, at: 5, tasks: 'x', tasksAt: 5,
          tmr: { o1: JSON.stringify({ op: 'o1', date: ${JSON.stringify(today)}, at: now - 60000, act: 'start', blk: 'b1', item: '', name: '', value: null, dev: 'pc' }) } },
        'gantt/calEvents': { json: JSON.stringify({ today: ${JSON.stringify(today)}, events: [{ id: 'e1', title: 'Dentist' }], archive: { ready: 0, auto: false } }),
          today: localStorage.getItem('fake.ceDay') || ${JSON.stringify(today)}, at: now },
        'gantt/calBacklog': { items: JSON.stringify([{ id: 'u1', date: '2026-11-01', title: 'Old task', colorId: '11', urg: '0', color: '#f00' }]),
          sweep: JSON.stringify({ swept: 2, at: now }), at: now - Number(localStorage.getItem('fake.blAge') || 0) } } };
    const snap = (id, d) => ({ id, exists: !!d, data: () => d && JSON.parse(JSON.stringify(d)) });
    const refuse = () => Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    function docRef(coll, id) {
      const k = coll + '/' + id;
      return {
        get: () => Promise.resolve(snap(id, S.docs[k])),
        set: (rec, o) => {
          const cur = S.docs[k];
          if (cur && typeof rec.at === 'number' && !(rec.at > cur.at)) return refuse();
          if (coll === 'ganttFocus' && cur && rec.base !== cur.at) return refuse();
          if (coll === 'ganttFocus' && S.refuseOnce) { S.refuseOnce--; S.docs[k] = Object.assign({}, cur, { at: cur.at + 1 }); return refuse(); } // someone saved in between
          const inc = v => v && v.__inc !== undefined;
          const deep = (a, r) => { const out = Object.assign({}, a); Object.keys(r).forEach(f => { const v = r[f];
            out[f] = inc(v) ? (Number(a && a[f]) || 0) + v.__inc : v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[f] === 'object' ? deep(a[f], v) : v; }); return out; };
          if (coll === 'ganttDays' && (!rec.date || rec.date !== id)) return refuse();
          S.docs[k] = o && o.merge && cur ? deep(cur, rec) : deep({}, rec);
          S.writes.push(k);
          (S.subs[coll] || []).forEach(cb => cb({ docs: all(coll) }));
          return Promise.resolve();
        },
        onSnapshot: () => () => {}
      };
    }
    const all = n => Object.keys(S.docs).filter(k => k.startsWith(n + '/')).map(k => snap(k.slice(n.length + 1), S.docs[k]));
    const collRef = n => ({ doc: id => docRef(n, id), add: r => { S.backups.push(r); return Promise.resolve(); },
      get: () => Promise.resolve({ docs: all(n) }),
      where: (f, op, v) => ({ get: () => Promise.resolve({ docs: all(n).filter(x => x.data()[f] >= v) }), onSnapshot: () => () => {} }),
      onSnapshot: (cb) => { if (n === 'ganttCal') setTimeout(() => cb({ docChanges: () => [] }), 0);
        else { (S.subs[n] = S.subs[n] || []).push(cb); setTimeout(() => cb({ docs: all(n) }), 0); } return () => {}; } });
    const auth = () => ({ onAuthStateChanged: cb => setTimeout(() => cb({ email: 'juliussimtim@gmail.com', getIdToken: () => Promise.resolve('idtok') }), 0), signOut: () => {} });
    auth.GoogleAuthProvider = function () { this.setCustomParameters = () => {}; };
    const firestore = () => ({ enablePersistence: () => Promise.resolve(), collection: collRef });
    firestore.FieldValue = { serverTimestamp: () => Date.now(), increment: n => ({ __inc: n }) };
    return { initializeApp: () => {}, auth, firestore };
  })();`;
  const srv = http.createServer((qq, r) => {
    let f = decodeURIComponent(new URL(qq.url, 'http://x').pathname); if (f.endsWith('/')) f += 'index.html';
    if (f.startsWith('/fb/')) { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(FAKE); }
    const fp = path.join(dist, f);
    if (!fp.startsWith(dist) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); r.end(fs.readFileSync(fp));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const errs = [], calls = [], batches = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' });
  await ctx.route('https://api.test/**', route => {
    const req = JSON.parse(route.request().postData() || '{}'); calls.push(req.fn);
    if (req.fn === 'batchCalls') batches.push(req.a[0].map(c => c[0]));
    const one = fn => fn === 'getWorkspaceData' ? data : fn === 'getSyncState' ? { build: 'smoke', ref: {}, inbox: [], days: {} } : fn === 'getFocus' ? focus
      : fn === 'getPlan' ? { date: today, cal: 'main', items: [], srv: 1 } : fn === 'calBacklogSync' ? { items: [], sweep: {}, srv: 1 } : fn === 'getInbox' ? [] : fn === 'getMainCalendarEvents' ? { date: today, events: [] }
      : fn === 'getCalendarRange' ? { events: [], calendars: [], failed: [], via: 'api' } : fn === 'getTimerEvents' ? [] : null;
    const r = req.fn === 'batchCalls' ? req.a[0].map(c => ({ ok: true, r: one(c[0]) })) : one(req.fn);
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, r }) });
  });
  // Cloud Function (I): fnMode = ok | fallback | error | down
  const fnCalls = []; let fnMode = 'ok';
  await ctx.route('https://fn.test/**', route => {
    const q = route.request();
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
    const req = JSON.parse(q.postData() || '{}'); fnCalls.push(req.fn + ':' + (q.headers().authorization || ''));
    if (fnMode === 'down') return route.abort();
    const body = fnMode === 'fallback' ? { fallback: 'not shared' } : fnMode === 'error' ? { ok: false, e: 'Done events stay where they are' }
      : { ok: true, r: Object.assign({ eventId: 'e1@google.com', startMs: 5, calId: 'main', title: 'Fn' }, req.fn === 'calPanelMoveEvent' ? { relink: true, copyAt: Date.now() }
        : req.fn === 'calPanelSetColor' ? { colorId: '11', metaSync: { eventId: 'e1@google.com', startMs: 5, recurring: false, colorId: '11' }, copyAt: Date.now() } : { copyAt: Date.now() }) };
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('page error: ' + e.message + (process.env.SMOKE_STACK ? ' ' + e.stack : '')));
  await pg.goto(base + '#k=smokekey'); await pg.waitForTimeout(3000);
  const run = (fn, ...a) => pg.evaluate(([fn, a]) => new Promise((ok, bad) => google.script.run.withSuccessHandler(ok).withFailureHandler(e => bad(e.message))[fn](...a)), [fn, a]);
  const fsd = k => pg.evaluate(k => __fs.docs[k], k);
  // ---- Cal Events list (H5 B): the server's published list when it's today's.
  calls.length = 0;
  const ce = await run('getCalendarEvents');
  if (calls.includes('getCalendarEvents') || !ce || ce.events[0].title !== 'Dentist') errs.push('getCalendarEvents from doc: ' + JSON.stringify(ce) + ' ' + calls.join());
  // ---- Focus
  calls.length = 0;
  const f0 = await run('getFocus');
  if (calls.includes('getFocus') || !f0 || f0.cats[0].name !== 'Work') errs.push('getFocus not from the doc: ' + JSON.stringify(f0) + ' ' + calls.join());
  // Another device added an item since this device's base; this device renames the category → both kept.
  await pg.evaluate(() => { const d = __fs.docs['ganttFocus/main'], v = JSON.parse(d.v); v.cats[0].items.push({ id: 'i2', t: 'Phone add' }); __fs.docs['ganttFocus/main'] = { v: JSON.stringify(v), at: 20, base: 10 }; });
  const mine = JSON.parse(JSON.stringify(f0)); mine.cats[0].name = 'Work (pc)';
  const s1 = await run('saveFocus', mine, { base: f0 });
  const d1 = await fsd('ganttFocus/main'), v1 = JSON.parse(d1.v);
  if (calls.includes('saveFocus')) errs.push('saveFocus went to the server');
  if (v1.cats[0].name !== 'Work (pc)' || v1.cats[0].items.length !== 2) errs.push('Focus merge lost an edit: ' + d1.v);
  if (d1.base !== 20 || !(d1.at > 20)) errs.push('Focus write base/at: ' + JSON.stringify({ at: d1.at, base: d1.base }));
  if (!s1 || JSON.stringify(s1.data) !== d1.v) errs.push('saveFocus answer ≠ saved list');
  // Someone saves between this device's read and write → refused (base) → merged again and saved.
  await pg.evaluate(() => { __fs.refuseOnce = 1; });
  const mine2 = JSON.parse(JSON.stringify(v1)); mine2.cats[0].items.push({ id: 'i3', t: 'Three' });
  await run('saveFocus', mine2, { base: v1 });
  const v2 = JSON.parse((await fsd('ganttFocus/main')).v);
  if (v2.cats[0].items.length !== 3 || calls.includes('saveFocus')) errs.push('refused Focus save not merged again: ' + JSON.stringify(v2) + ' ' + calls.join());
  // Same value on both sides changed differently → newer wins, the loser goes to Backup.
  await pg.evaluate(() => { const d = __fs.docs['ganttFocus/main'], v = JSON.parse(d.v); v.cats[0].items[0].t = 'Phone edit'; __fs.docs['ganttFocus/main'] = { v: JSON.stringify(v), at: d.at + 5, base: d.at }; });
  const mine3 = JSON.parse(JSON.stringify(v2)); mine3.cats[0].items[0].t = 'PC edit';
  await run('saveFocus', mine3, { base: v2 }); await pg.waitForTimeout(200);
  if (!(await pg.evaluate(() => __fs.backups.some(b => b.area === 'focus')))) errs.push('Focus merge loser not backed up');
  // ---- Inbox
  calls.length = 0;
  let inb = await run('getInbox');
  if (calls.includes('getInbox') || JSON.stringify(inb.map(x => x.id)) !== '["ai1","a100"]') errs.push('getInbox from docs: ' + JSON.stringify(inb) + ' ' + calls.join());
  inb = await run('addInboxItem', 'New one', '');
  if (inb.length !== 3 || inb[2].title !== 'New one' || inb[2].from !== 'app') errs.push('addInboxItem: ' + JSON.stringify(inb));
  inb = await run('updateInboxItem', 'a100', { done: true, title: 'Mine!' });
  if (!inb[1].done || inb[1].title !== 'Mine!' || (await fsd('ganttInbox/a100')).done !== 1) errs.push('updateInboxItem: ' + JSON.stringify(inb[1]));
  inb = await run('dismissInboxItem', 'ai1');
  if (inb.some(x => x.id === 'ai1') || (await fsd('ganttInbox/ai1')).gone !== 1) errs.push('dismissInboxItem');
  if (calls.some(c => /Inbox/.test(c))) errs.push('Inbox calls reached the server: ' + calls.join());
  // ---- Plan
  calls.length = 0;
  let pl = await run('getPlan', today);
  if (calls.includes('getPlan') || !pl || pl.srv) errs.push('getPlan not from docs: ' + JSON.stringify(pl));
  else {
    if (pl.items.map(x => x.title).join() !== 'One,Two' || pl.cal !== 'main') errs.push('getPlan items: ' + JSON.stringify(pl.items.map(x => x.title)));
    if (!pl.items[0].ev || pl.items[0].ev.eventId !== 'ev1' || pl.items[1].ev !== null) errs.push('getPlan ev: ' + JSON.stringify(pl.items.map(x => x.ev)));
  }
  pl = await run('planSave', { date: today, type: 'upsert', item: { group: 'next', ref: 'tid:cc', title: 'Three' } });
  const three = pl && pl.items.find(x => x.title === 'Three');
  if (!three || three.rank !== 2 || calls.includes('planSave')) errs.push('planSave upsert: ' + JSON.stringify(pl));
  pl = await run('planSave', { date: today, type: 'moveup', doneId: 'p1', upId: 'p2' });
  if (JSON.stringify(pl.items.filter(x => x.group === 'big').map(x => x.title)) !== '["Two"]' || (await fsd('ganttPlan/p1')).del !== 1) errs.push('planSave moveup: ' + JSON.stringify(pl.items));
  pl = await run('planSave', { date: today, type: 'order', group: 'next', ids: [three.id] });
  // A change the device refuses (bad group, Big Three full…) goes to the server, which says why.
  calls.length = 0;
  await run('planSave', { date: today, type: 'upsert', item: { group: 'nope', ref: 'tid:dd' } }).catch(() => {});
  if (!calls.includes('planSave') || (await pg.evaluate(() => Object.values(__fs.docs).some(d => d.ref === 'tid:dd')))) errs.push('bad group: not left to the server');
  // A linked event the device knows nothing about → saved on the device, the list (only) from the server.
  calls.length = 0;
  pl = await run('planSave', { date: today, type: 'upsert', item: { group: 'next', ref: 'tid:ee', title: 'Linked', event: 'new@5' } });
  if (calls.includes('planSave') || !calls.includes('getPlan') || !pl.srv) errs.push('unknown event: expected device save + server list: ' + calls.join());
  if (!(await pg.evaluate(() => Object.values(__fs.docs).some(d => d.ref === 'tid:ee')))) errs.push('linked row not saved');
  // ---- Cal Backlog
  calls.length = 0;
  let bl = await run('calBacklogSync');
  if (calls.includes('calBacklogSync') || !bl || bl.items[0].title !== 'Old task' || !bl.sweep || bl.sweep.swept !== 2) errs.push('calBacklogSync from doc: ' + JSON.stringify(bl));
  bl = await run('calBacklogSync');
  if (bl.sweep.swept) errs.push('sweep count shown twice');
  if (calls.includes('calSyncNow')) errs.push('database backlog read asked for a calendar re-copy');
  // The trigger caches the linked event's info on the row.
  await pg.evaluate(() => { const d = Object.values(__fs.docs).find(x => x.ref === 'tid:ee'); d.ev = JSON.stringify({ eventId: 'new', startMs: 5, title: 'L', done: false, date: '2026-11-23', allDay: true, recurring: false, time: '' }); __fs.touch('ganttPlan'); });
  // ---- Block timer (H5 B): read from the day docs, save as one map key per event (merge keeps the others).
  calls.length = 0;
  let te = await run('getTimerEvents', today);
  if (calls.includes('getTimerEvents') || !Array.isArray(te) || te.map(e => e.op).join() !== 'o1') errs.push('getTimerEvents from docs: ' + JSON.stringify(te) + ' ' + calls.join());
  const ts = await run('saveTimerEvents', [{ op: 'o2', act: 'pause', date: today, at: Date.now(), blk: 'b1' }, { op: 'o3', act: 'start', date: '2026-12-30', at: Date.now(), blk: 'b2' }, { op: 'bad', act: 'nope', date: today, at: 1 }]);
  if (!ts || ts.saved.join() !== 'o2,o3' || calls.includes('saveTimerEvents')) errs.push('saveTimerEvents: ' + JSON.stringify(ts));
  const td = await fsd('ganttDays/' + today);
  if (!td.tmr.o1 || !td.tmr.o2 || td.tasks !== 'x' || td.at !== 5) errs.push('timer save changed more than its key: ' + JSON.stringify(td).slice(0, 200));
  const nd = await fsd('ganttDays/2026-12-30');
  if (!nd || nd.at !== 0 || !nd.tmr.o3) errs.push('timer save on a day with no doc: ' + JSON.stringify(nd));
  te = await run('getTimerEvents', today);
  if (te.map(e => e.op).join() !== 'o1,o2,o3') errs.push('timer read after save: ' + te.map(e => e.op).join());
  // ---- Calendar edits on the Cloud Function (I)
  calls.length = 0; fnCalls.length = 0;
  let fr = await run('calPanelCreateEvent', { title: 'x', allDay: true, start: today, end: today, opId: 'o1' });
  if (fr.title !== 'Fn' || 'copyAt' in fr || fnCalls.join() !== 'calPanelCreateEvent:Bearer idtok' || calls.includes('calPanelCreateEvent') || calls.includes('calSyncNow')) errs.push('fn create: ' + JSON.stringify(fr) + ' fn ' + fnCalls.join() + ' srv ' + calls.join());
  fr = await run('calPanelMoveEvent', { eventId: 'e1@google.com', startMs: 5 }); await pg.waitForTimeout(300);
  if ('relink' in fr || !calls.includes('planRelinkEvent') || calls.includes('calPanelMoveEvent')) errs.push('fn move: relink in the background: ' + calls.join());
  calls.length = 0;
  fr = await run('calPanelSetColor', { eventId: 'e1@google.com', startMs: 5, colorId: '11' }); await pg.waitForTimeout(300);
  if ('metaSync' in fr || fr.colorId !== '11' || !calls.includes('calMetaUrgFromColor') || calls.includes('calPanelSetColor')) errs.push('fn color: urgency sync in the background: ' + JSON.stringify(fr) + ' ' + calls.join());
  calls.length = 0; fnCalls.length = 0;
  await run('setCalendarEventMeta', 'e1@google.com', 5, false, { urg: '1' }, 'main');
  if (!fnCalls.some(x => /^setCalendarEventMeta:/.test(x)) || calls.includes('setCalendarEventMeta')) errs.push('hold menu not on the function: ' + fnCalls.join() + ' ' + calls.join());
  // P: Schedule / Move to date / Backlog place, bulk, complete go to the function too
  calls.length = 0; fnCalls.length = 0;
  await run('planSchedule', { ref: 'tid:t1', title: 'x', date: today });
  await run('planMoveEvent', { eventId: 'e1@google.com', startMs: 5, date: today });
  await run('calBacklogPlace', { id: 'u1|' + today, drop: true });
  await run('calBacklogPlaceMany', [{ id: 'u1|' + today, allDay: true, start: today, end: today }]);
  await run('calBacklogComplete', { id: 'u1|' + today, mode: 'archive', day: today });
  if (fnCalls.map(x => x.split(':')[0]).join() !== 'planSchedule,planMoveEvent,calBacklogPlace,calBacklogPlaceMany,calBacklogComplete'
    || ['planSchedule', 'planMoveEvent', 'calBacklogPlace', 'calBacklogPlaceMany', 'calBacklogComplete'].some(n => calls.includes(n))) errs.push('P not on the function: ' + fnCalls.join() + ' srv ' + calls.join());
  fnMode = 'fallback'; calls.length = 0;
  await run('calBacklogComplete', { id: 'u1|' + today, mode: 'archive', day: today }).catch(() => {});
  if (!calls.includes('calBacklogComplete')) errs.push('P fallback did not go to Apps Script');
  calls.length = 0;
  await run('setCalendarEventDone', 'main', 'e1@google.com', 5, true);
  if (!calls.includes('setCalendarEventDone')) errs.push('fn fallback did not go to Apps Script');
  fnMode = 'error'; calls.length = 0;
  const fe = await run('calPanelMoveEvent', { eventId: 'e1@google.com', startMs: 5 }).catch(e => 'ERR ' + e);
  if (!/Done events stay/.test(String(fe)) || calls.includes('calPanelMoveEvent')) errs.push('fn error not shown as is: ' + fe + ' ' + calls.join());
  fnMode = 'down'; calls.length = 0; fnCalls.length = 0;
  const fd = await run('calPanelCreateEvent', { title: 'y', allDay: true, start: today, end: today, opId: 'o2' }).catch(e => 'ERR ' + e);
  if (!/Not sure the event was created/.test(String(fd)) || calls.includes('calPanelCreateEvent') || fnCalls.length !== 2) errs.push('fn create while down: ' + fd + ' fn ' + fnCalls.length + ' srv ' + calls.join());
  calls.length = 0;
  await run('calPanelDeleteEvent', { eventId: 'e1@google.com', startMs: 5 });
  if (!calls.includes('calPanelDeleteEvent')) errs.push('fn down: delete did not go to Apps Script');
  fnMode = 'ok';
  // ---- Batched reads: the database answers what it can; only the rest goes to the server.
  batches.length = 0; calls.length = 0;
  const bo = await run('batchCalls', [['getFocus', []], ['getInbox', []], ['getSyncState', [{}]], ['getPlan', [today]]]);
  if (!Array.isArray(bo) || bo.length !== 4 || !bo.every(x => x && x.ok)) errs.push('batch answer: ' + JSON.stringify(bo).slice(0, 200));
  else if (!bo[0].r.cats || !Array.isArray(bo[1].r) || bo[2].r.build !== 'smoke' || bo[3].r.srv) errs.push('batch answers mixed up');
  if (JSON.stringify(batches) !== '[["getSyncState"]]') errs.push('batch to the server: ' + JSON.stringify(batches) + ' ' + calls.join());
  // ---- Offline: Focus + Inbox save (queued), Plan read-only; banner says so.
  await ctx.setOffline(true); await pg.evaluate(() => window.dispatchEvent(new Event('offline'))); await pg.waitForTimeout(200);
  const banner = await pg.evaluate(() => (document.getElementById('pwaOffline') || {}).textContent || '');
  if (!/Focus/.test(banner) || !/Inbox/.test(banner)) errs.push('offline banner: ' + banner);
  calls.length = 0;
  inb = await run('addInboxItem', 'Offline add', '').catch(e => 'ERR ' + e);
  if (!Array.isArray(inb) || !inb.some(x => x.title === 'Offline add')) errs.push('offline Inbox add: ' + JSON.stringify(inb));
  const f3 = await run('getFocus').catch(e => 'ERR ' + e), m4 = JSON.parse(JSON.stringify(f3)); m4.cats[0].name = 'Offline name';
  const s4 = await run('saveFocus', m4, { base: f3 }).catch(e => 'ERR ' + e);
  if (!s4 || !s4.data || JSON.parse((await fsd('ganttFocus/main')).v).cats[0].name !== 'Offline name') errs.push('offline Focus save: ' + JSON.stringify(s4).slice(0, 120));
  await run('planSave', { date: today, type: 'target', id: 'p2', target: 'x' }).catch(() => {});
  if ((await fsd('ganttPlan/p2')).target === 'x' || !calls.includes('planSave')) errs.push('offline Plan edit was saved on the device');
  if (calls.some(c => c !== 'planSave' && c !== 'calSyncNow')) errs.push('offline: other calls tried the server: ' + calls.join());
  await ctx.setOffline(false);
  // ---- Stale backlog doc (trigger stopped) → server; yesterday's Cal Events list → server.
  await pg.evaluate(() => { localStorage.setItem('fake.blAge', String(30 * 60000)); localStorage.setItem('fake.ceDay', '2020-01-01'); });
  await pg.reload(); await pg.waitForTimeout(2500);
  calls.length = 0;
  bl = await run('calBacklogSync');
  if (!calls.includes('calBacklogSync') || !bl.srv) errs.push('stale backlog doc did not go to the server');
  calls.length = 0;
  await run('getCalendarEvents');
  if (!calls.includes('getCalendarEvents')) errs.push("yesterday's Cal Events list was used");
  await ctx.close(); srv.close();
  if (errs.length) { fails += errs.length; console.error('✗ pwa-d2:\n  ' + errs.join('\n  ')); }
  else console.log('✓ pwa-d2: Focus (device merge, base refusal re-merge, loser backup), Inbox, Plan + Cal Backlog, timer events, Cal Events list from the database; calendar edits on the Cloud Function (fallback, errors, create retry); batch split; offline Focus + Inbox saves, Plan read-only');
}
for (const [name, view] of (only('resume') ? [['phone', { width: 412, height: 915, isMobile: true, hasTouch: true }]] : [])) {
  const ctx = await b.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch, timezoneId: 'America/Los_Angeles' });
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  try {
    await pg.goto('file://' + out); await pg.waitForTimeout(4600);
    const res = await pg.evaluate(async () => {
      const R = window.fwResume, out = [], wait = ms => new Promise(r => setTimeout(r, ms));
      if (!R) return ['fwResume missing'];
      let vis = 'visible';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => vis !== 'visible' });
      const flip = v => { vis = v; document.dispatchEvent(new Event('visibilitychange')); };
      const missing = R.ORDER.filter(n => !R.jobs.includes(n)); if (missing.length) out.push('jobs not registered: ' + missing.join(', '));
      // 1) Quick return (< 60 s): everything was just refreshed → all skipped, no server calls, no Speed Log row.
      let n0 = (window.__calls || []).length; flip('hidden'); await wait(50); flip('visible'); await wait(400);
      const q = window.__FW_RESUME_LAST || {};
      if (!q.skipped || q.ran.length) out.push('quick return should skip all, ran: ' + (q.ran || []).join(','));
      if ((window.__calls || []).slice(n0).some(c => c[0] === 'logSpeed')) out.push('quick return wrote a Speed Log row');
      // 2) Two minutes away (speed plan E): every job runs once, in ORDER, and their reads go out as ONE batchCalls.
      const real = Date.now; Date.now = () => real() + 120000;
      n0 = (window.__calls || []).length; const seen = [], t0 = performance.now();
      const tick = setInterval(() => { const c = window.__calls || []; while (n0 < c.length) seen.push([c[n0], Math.round(performance.now() - t0)]), n0++; }, 10);
      flip('hidden'); flip('visible'); await wait(800); clearInterval(tick);
      const r = window.__FW_RESUME_LAST || {};
      const order = R.jobs.slice().sort((a, b) => R.ORDER.indexOf(a) - R.ORDER.indexOf(b));
      if ((r.ran || []).join() !== order.join()) out.push('ran ' + (r.ran || []).join(',') + ' — want ' + order.join(','));
      const batch = seen.find(s => s[0][0] === 'batchCalls');
      const names = batch ? batch[0][1][0].map(c => c[0]) : [];
      if (!batch || batch[1] > 150) out.push('no batchCalls at once: ' + JSON.stringify(seen.map(s => [s[0][0], s[1]])));
      if (names[0] !== 'getSyncState') out.push('sync not first in the batch: ' + names.join(','));
      ['getMainCalendarEvents','getTimerEvents','getPlan','getFocus','getNewThings','getFun'].forEach(n => { if (!names.includes(n)) out.push(n + ' not batched'); });
      const loose = seen.filter(s => s[1] < 400 && /^get/.test(s[0][0]) && s[0][0] !== 'getKim' && s[0][0] !== 'getCalendarRange');
      if (loose.length) out.push('reads sent outside the batch: ' + loose.map(s => s[0][0]).join(','));
      if (r.batched !== names.length) out.push('Speed Log batched count ' + r.batched + ' vs ' + names.length);
      const log = (window.__calls || []).filter(c => c[0] === 'logSpeed' && c[1][0] === 'resume').pop();
      if (!log || !Array.isArray(log[1][2].ran) || log[1][2].awaySec == null) out.push('no Speed Log resume row with ran / awaySec');
      // 3) Batch answers reach each job: the sync's merged line is on the page (same stub answer as the fast start).
      if (!(window.__FW_RESUME_LAST || {}).ran) out.push('no resume record');
      Date.now = real; flip('visible');
      return out;
    });
    errs.push(...res);
  } catch (e) { errs.push(String(e)); }
  if (errs.length) { fails += errs.length; console.error('✗ resume ' + name + ':\n  ' + errs.join('\n  ')); }
  else console.log('✓ resume ' + name + ': quick return skips all, 2-min return runs every job in order with one batchCalls, Speed Log row');
  await ctx.close();
}
// Calendar device cache (2026-11-23, speed step A, NOTES H5): the day's events list is kept on the device, painted at
// once on the next open (no "Loading…"), refreshed quietly, and dropped with the in-memory copy after a save.
if (only('calcache')) {
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, timezoneId: 'America/Los_Angeles' });
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  try {
    await pg.goto('file://' + out); await pg.waitForTimeout(2500);
    const saved = await pg.evaluate(() => { try { const c = JSON.parse(localStorage.getItem('fw.ceCache.v1')); return Object.values(c.days).some(x => x.data.events.some(e => e.title === 'Sample event')); } catch (e) { return false; } });
    if (!saved) errs.push('day list not kept on the device after a read');
    // Old copy on the device: painted first, then replaced by Google's answer.
    await pg.evaluate(() => { const c = JSON.parse(localStorage.getItem('fw.ceCache.v1')); Object.values(c.days).forEach(x => { x.data.events[0].title = 'Old copy'; }); localStorage.setItem('fw.ceCache.v1', JSON.stringify(c)); });
    await pg.reload(); await pg.waitForTimeout(2500);
    const r = await pg.evaluate(() => ({ painted: window.__fwCeDevPaint || 0, text: (document.getElementById('centerCalendarList') || {}).textContent || '',
      stored: JSON.parse(localStorage.getItem('fw.ceCache.v1') || '{"days":{}}') }));
    if (!r.painted) errs.push('device copy was not painted on open');
    if (/Old copy/.test(r.text)) errs.push('quiet re-read did not replace the old device copy');
    if (!Object.values(r.stored.days).some(x => x.data.events.some(e => e.title === 'Sample event'))) errs.push('device copy not refreshed after the quiet re-read');
    // A save drops the in-memory copy → the device copy goes with it.
    const dropped = await pg.evaluate(() => { centerCalendarCache.clear(); return localStorage.getItem('fw.ceCache.v1') === null; });
    if (!dropped) errs.push('clearing the in-memory copy left the device copy');
  } catch (e) { errs.push(String(e)); }
  if (errs.length) { fails += errs.length; console.error('✗ calcache:\n  ' + errs.join('\n  ')); }
  else console.log('✓ calcache: day list kept on the device, painted at once, refreshed quietly, dropped after a save');
  await ctx.close();
}
await b.close();
process.exit(fails ? 1 : 0);
