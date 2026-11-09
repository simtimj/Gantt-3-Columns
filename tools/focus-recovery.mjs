// Offline extraction of a saved Script Properties snapshot. Never calls Google.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

export const focusHash = text => crypto.createHash('md5').update(text, 'utf8').digest('hex').slice(0, 16);

export function extractFocus(properties) {
  const fail = message => { throw new Error(message); };
  if (!properties || typeof properties !== 'object' || Array.isArray(properties))
    fail('Expected a flat Script Properties object.');
  const own = key => Object.prototype.hasOwnProperty.call(properties, key);
  const read = key => {
    if (!own(key) || typeof properties[key] !== 'string') fail('Missing or invalid Focus property.');
    return properties[key];
  };
  let raw = '', format;
  if (own('focusDataHead')) {
    let head;
    try { head = JSON.parse(read('focusDataHead')); } catch { fail('Invalid selected Focus head.'); }
    if (!head || head.v !== 2 || !/^[a-zA-Z0-9-]{1,80}$/.test(head.g || '') ||
        !Number.isInteger(head.n) || head.n < 1 || head.n > 200 ||
        !Number.isInteger(head.len) || head.len < 0 || typeof head.h !== 'string')
      fail('Invalid selected Focus head.');
    for (let i = 0; i < head.n; i++) raw += read('focusV2_' + head.g + '_' + i);
    if (raw.length !== head.len || focusHash(raw) !== head.h)
      fail('Selected Focus data failed length/hash verification.');
    format = 'generation-v2';
  } else {
    if (!own('focusDataN') && !own('focusData') &&
        !Object.keys(properties).some(key => /^focusData_\d+$/.test(key)))
      fail('No selected Focus data; refusing to create an empty backup.');
    const count = own('focusDataN') ? read('focusDataN') : '0';
    const n = Number(count || 0);
    if ((own('focusDataN') && !count.trim()) || !Number.isInteger(n) || n < 0 || n > 200)
      fail('Invalid legacy Focus chunk count.');
    if (n) {
      for (let i = 0; i < n; i++) raw += read('focusData_' + i);
      if (!raw) fail('Empty legacy Focus chunks.');
      format = 'legacy-numbered';
    } else {
      raw = own('focusData') ? read('focusData') : '';
      if (!raw && Object.keys(properties).some(key => /^focusData_\d+$/.test(key)))
        fail('Uncounted legacy Focus chunks.');
      format = 'legacy-single';
    }
  }
  let data;
  try { data = raw ? JSON.parse(raw) : { v: 1, cats: [] }; }
  catch { fail('Selected Focus JSON could not be read.'); }
  if (!data || !Array.isArray(data.cats)) fail('Selected Focus list is invalid.');
  return { data, raw: raw || JSON.stringify(data), format };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node tools/focus-recovery.mjs properties.json recovered-focus.json');
    const input = fs.readFileSync(process.argv[2], 'utf8');
    let properties;
    try { properties = JSON.parse(input); } catch { throw new Error('Properties input is not valid JSON.'); }
    const result = extractFocus(properties);
    fs.writeFileSync(process.argv[3], result.raw + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Recovered ' + result.format + ' Focus JSON. Existing files and live stores were not changed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
