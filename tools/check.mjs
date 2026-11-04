// Syntax check for everything clasp pushes (2026-11-04). Run before every push: node tools/check.mjs
// Parses (never runs) Code.gs, the root .js files and every inline <script> in the .html files.
// .mjs on purpose: clasp only pushes .gs/.js/.html/.json, so this file never reaches Apps Script.
import fs from 'fs';
let bad = 0;
const parse = (code, where) => {
  try { new Function(code); }
  catch (e) { bad++; console.error('✗ ' + where + ': ' + e.message); }
};
for (const f of fs.readdirSync('.')) {
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
