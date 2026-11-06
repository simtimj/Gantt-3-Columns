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
  days: [{ date: yday, journal: '', plan: '', tasks: line('Renew license', ' data-urg="2"') }, { date: today, journal: '',
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
    return [];
  });
  uadd.forEach(x => errs.push('Urgent add: ' + x));
  // Keep In Mind: converted to Gear > (note, Gloves, Bait); Tab nests a line one deeper and saves.
  const kim = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ctab="focus"]')?.click(); await wait(300);
    const rows = () => [...document.querySelectorAll('.journal-editor[data-date="' + localToday() + '"] .fx .fx-task')].map(t => (t.style.getPropertyValue('--lv') || '0') + (t.classList.contains('fx-note') ? '~' : '') + t.querySelector('.fx-tt').textContent);
    const got = rows().join('|');
    if (got !== '0Gear|1~Before Friday|1Gloves|1Bait') return ['converted list: ' + got];
    const bait = [...document.querySelectorAll('.journal-editor[data-date="' + localToday() + '"] .fx .fx-tt')].find(x => x.textContent === 'Bait');
    bait.focus(); bait.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await wait(900);
    const after = rows().join('|');
    const saves = (window.__calls || []).filter(c => c[0] === 'saveFocus');
    const saved = saves.length ? saves[saves.length - 1][1][0].cats[0].items.map(i => i.lv).join('') : '';
    if(!(after === '0Gear|1~Before Friday|1Gloves|2Bait' && saved === '0112')) return ['Tab nesting: ' + after + ' saved ' + saved];
    // 2026-11-06: one bordered cell per top line, no ‹ › 📌 buttons, Backspace on an emptied subtask removes it.
    const fx = document.querySelector('.journal-editor[data-date="' + localToday() + '"] .fx');
    if(fx.querySelector('.fx-tools')) return ['line buttons still shown'];
    if(fx.querySelectorAll('.fx-cell').length !== 1) return ['cells: ' + fx.querySelectorAll('.fx-cell').length];
    const b2 = [...fx.querySelectorAll('.fx-tt')].find(x => x.textContent === 'Bait');
    b2.focus(); b2.innerHTML = '<br>';
    b2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })); await wait(900);
    const gone = rows().join('|');
    return gone === '0Gear|1~Before Friday|1Gloves' ? [] : ['Backspace remove: ' + gone];
  });
  kim.forEach(x => errs.push('Keep In Mind: ' + x));
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
    document.querySelector('[data-ctab="notes"]')?.click(); await wait(100);
    return [];
  });
  fun.forEach(x => errs.push('Fun tab: ' + x));
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
    document.querySelector('#dailyMatch [data-a="y"]').click(); await wait(100);
    const cb = [...jed.querySelectorAll('.check-line')].find(l => l.textContent.replace(/\s+/g,' ').trim() === 'Morning · Stretch').querySelector('input');
    if(!cb.checked) return ['Tick did not tick the daily'];
    if(!document.getElementById('dailyMatch').hidden) return ['prompt still shown'];
    return [];
  });
  dm.forEach(x => errs.push('Daily match: ' + x));
  // History detail button: List = one line per item (all 50), hidden lines really hidden; Mini = counts only; back to Full.
  const modes = [];
  for (const hm of ['compact', 'mini', 'full']) {
    await pg.click('#histMode [data-hm="' + hm + '"]'); await pg.waitForTimeout(250);
    modes.push(await pg.evaluate(() => {
      const ed = document.querySelector('#todayScroll .day-editor[data-date="' + localToday() + '"]'), top = ed.closest('.od-top') || ed;
      const leak = [...ed.querySelectorAll(':scope > [data-tlhid]')].filter(x => getComputedStyle(x).display !== 'none').length;
      const wide = [...ed.querySelectorAll('.ts-it')].filter(x => x.getBoundingClientRect().right > top.getBoundingClientRect().right + 1).length;
      const pressed = [...document.querySelectorAll('#histMode .hist-mode[aria-pressed="true"]')].map(b => b.dataset.hm).join();
      const hdr = document.querySelector('#todayPane .pane-header'), btns = [...document.querySelectorAll('#histMode .hist-mode')];
      if (pressed !== document.body.dataset.hist || btns.length !== 3 || btns.some(b => !b.offsetWidth || b.getBoundingClientRect().right > hdr.getBoundingClientRect().right + 1)) return { mode: 'buttons: ' + pressed, hdr: hdr.getBoundingClientRect().width, w: btns.map(b => [b.offsetWidth, Math.round(b.getBoundingClientRect().right)]), r: Math.round(hdr.getBoundingClientRect().right), html: hdr.innerText };
      return { mode: document.body.dataset.hist, items: ed.querySelectorAll('.ts-it').length, leak, wide };
    }));
  }
  const [list, mini, full] = modes;
  if (list.mode !== 'compact' || list.items < 50 || list.leak || list.wide) errs.push('History List mode: ' + JSON.stringify(list));
  if (mini.mode !== 'mini' || mini.items || mini.leak) errs.push('History Mini mode: ' + JSON.stringify(mini));
  if (full.mode !== 'full' || full.leak) errs.push('History Full mode: ' + JSON.stringify(full));
  // Full time windows (2026-11-05): label "Morn 8–2" + small "(6a–2p)", never saved; 1 am and 9 pm are Night, 7 pm is Afternoon.
  const win = await pg.evaluate(() => {
    const out = [];
    const h = document.querySelector('#todayScroll .day-editor > [data-tsec="morning"]');
    const lab = h && h.querySelector('.ts-lab');
    if (!lab || !/Morn 8–2/.test(lab.textContent) || !/\(6a–2p\)/.test(lab.querySelector('small')?.textContent || '')) out.push('Morning label: ' + (lab ? lab.textContent : 'missing'));
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
  // Cal Events 4-box view (2026-11-05): Cats label; ⊞ → 1 Sort (TL) → 2 Urgency (TR) → 3 Schedule (BR) → 4 Done (BL).
  const quad = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = [];
    if (document.querySelector('[data-ce-sort]')?.textContent !== 'Cats') out.push('sort button not "Cats"');
    document.querySelector('[data-ce-grid]').click(); await wait(100);
    const list = document.getElementById('centerCalendarList');
    const boxes = [...list.querySelectorAll(':scope > .ce-q')];
    if (boxes.length !== 4) return out.concat('boxes: ' + boxes.length);
    const pos = n => { const r = list.querySelector('.ce-q' + n).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; };
    const [p1, p2, p3, p4] = [1, 2, 3, 4].map(pos);
    if (getComputedStyle(list).display === 'grid' && list.offsetParent && !(p1[0] < p2[0] && p1[1] === p2[1] && p3[0] === p2[0] && p3[1] > p2[1] && p4[0] === p1[0] && p4[1] === p3[1])) out.push('box order not clockwise: ' + JSON.stringify([p1, p2, p3, p4]));
    const inBox = n => !!list.querySelector('.ce-q' + n + ' .ce-event[data-ce-id="e1"]');
    if (!inBox(1)) out.push('new event not in box 1');
    list.querySelector('.ce-q1 [data-ce-urg="2"]').click(); await wait(100);
    if (!inBox(2) || list.querySelector('.ce-event[data-ce-id="e1"]').dataset.urg !== '2') out.push('urgency did not move it to box 2');
    list.querySelector('.ce-q2 [data-ce-sched]').click(); await wait(200);
    const pad = document.querySelector('#todayScroll .plan-pad[data-date="' + localToday() + '"]');
    if (!inBox(3) || !pad.querySelector('[data-ceid^="e1|"]')) out.push('→ 🧱 did not move it to box 3');
    list.querySelector('.ce-q3 .ce-check').click(); await wait(200);
    if (!inBox(4)) out.push('tick did not move it to box 4');
    pad.querySelector('[data-ceid^="e1|"]').remove(); // leave the Blocks pad as it was for the timer test
    pad.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-ce-grid]').click(); await wait(100);
    if (list.classList.contains('ce-grid')) out.push('☰ did not go back to the list');
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
  quad.forEach(x => errs.push('Cal 4-box: ' + x));
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
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(900);
    if (document.querySelector('.fw-focus-target') || document.querySelector('.fw-focus-spacer')) out.push('zoom did not close cleanly');
    return out;
  });
  zm.forEach(x => errs.push('Zoom: ' + x));
  // Block timer MVP (2026-11-05): ▶ on a task starts it + its block, double tap = one tap, tick stops the task,
  // Break / Pause / Resume / correct / Finish, ids saved with the pad, events sent, time from timestamps (lock-proof).
  const tmr = await pg.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = [];
    const pad = document.querySelector('#todayScroll .plan-pad[data-date="' + localToday() + '"]');
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
  const before = await pg.evaluate(() => window.fwTimer.events().length);
  await pg.reload(); await pg.waitForTimeout(800);
  const after = await pg.evaluate(() => window.fwTimer && window.fwTimer.events().length);
  if (after !== before) errs.push('Timer: events lost on reload (' + before + ' → ' + after + ')');
  if (errs.length) { fails += errs.length; console.error('✗ ' + name + ':\n  ' + errs.join('\n  ')); }
  else console.log('✓ ' + name + ': loads with no page errors');
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
  for (const [name, view] of [['desktop', { width: 1200, height: 900 }], ['phone', { width: 412, height: 915, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext({ viewport: { width: view.width, height: view.height }, isMobile: view.isMobile, hasTouch: view.hasTouch });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
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
    await pg.fill('#mTitle', 'Researching Android browsers'); await pg.fill('#mStart', '');
    await pg.fill('#mDur', '30m'); await pg.click('[data-a="saveManual"]'); await pg.waitForTimeout(80);
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
await b.close();
process.exit(fails ? 1 : 0);
