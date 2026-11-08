// Daily setup read/write budget and date-row integrity; no live Google calls.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const ctx = vm.createContext({console, Date});
vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), ctx);
const props = new Map();
ctx.PropertiesService = {getScriptProperties: () => ({
  getProperty: k => props.get(k) || null,
  setProperty(k,v) { props.set(k,v); return this; }
})};
let frozen = 0, formats = 0, failFormat = false, coverage = 0;
let dayId = 1;
const days = {getSheetId: () => dayId, setFrozenRows() {frozen++;},
  getRange() {return {setNumberFormat() {formats++; if(failFormat) throw Error('format failed');}};}};
const reference = {getSheetId: () => 2, setFrozenRows() {frozen++;}};
ctx.getOrCreateSheet_ = n => n === 'Days' ? days : reference;
ctx.todayString_ = () => '2026-11-08';
const realEnsureRange = ctx.ensureDayRange_;
ctx.ensureDayRange_ = () => {coverage++;};
ctx.setupWorkspace({daily:true});
assert.equal(formats,1);
assert.equal(frozen,2);
ctx.todayString_ = () => '2026-11-09';
ctx.setupWorkspace({daily:true});
assert.equal(formats,1,'next day must not reformat unchanged tabs');
assert.equal(frozen,2);
assert.equal(coverage,2,'date coverage still maintained daily');
assert.equal(props.get('lastSetupDate'),'2026-11-09');
ctx.setupWorkspace();
assert.equal(formats,2,'manual setup still repairs formats');
dayId = 3;
failFormat = true;
ctx.todayString_ = () => '2026-11-10';
assert.throws(() => ctx.setupWorkspace({daily:true}),/format failed/);
assert.equal(props.get('lastSetupDate'),'2026-11-09','failed setup is not marked done');
assert.equal(props.get('workspaceFormatVersion'),'1:1:2','failed format is not published');
failFormat = false;
ctx.setupWorkspace({daily:true});
assert.equal(props.get('workspaceFormatVersion'),'1:3:2','recreated tab invalidates hint');
// Exercise actual date coverage against a column-sensitive sort. Plan and an
// extra column must travel with their dates when a missing day is inserted.
ctx.ensureDayRange_ = realEnsureRange;
ctx.Session = {getScriptTimeZone: () => 'UTC'};
ctx.Utilities = {formatDate: d => d.toISOString().slice(0,10)};
ctx.formatDate_ = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v || '');
const today = new Date(); today.setHours(0,0,0,0);
const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
const rows = [['Date','Tasks','Notes','Plan','Extra'],[tomorrow,'task','note','plan','extra']];
let sortWidth = 0, writes = 0;
const sheet = {getLastRow: () => rows.length, getMaxColumns: () => 5,
  getRange(r,c,h,w) {return {
    getValues: () => rows.slice(r-1,r-1+h).map(row => row.slice(c-1,c-1+w)),
    setValues(vals) {writes++; vals.forEach((row,i) => {rows[r-1+i] = [...row];});},
    sort() {
      sortWidth = w;
      const sorted = rows.slice(r-1,r-1+h).map(row => row.slice(c-1,c-1+w)).sort((a,b) => a[0]-b[0]);
      sorted.forEach((row,i) => {rows[r-1+i].splice(c-1,w,...row);});
    }
  };}};
ctx.ensureDayRange_(sheet,0,1);
assert.equal(sortWidth,5,'sort must cover all columns, including Plan');
assert.equal(rows[2][3],'plan'); assert.equal(rows[2][4],'extra');
assert.equal(rows[1][3],undefined,'new date must not inherit another day’s plan');
ctx.ensureDayRange_(sheet,0,1);
assert.equal(writes,1,'already covered dates need no write or new sort');
console.log('Daily setup tests passed');
