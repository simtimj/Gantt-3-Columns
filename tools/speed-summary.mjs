// Offline summaries of Speed Log range JSON; no Google calls or baseline claims.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const metric = values => {
  const sorted = values.filter(value=>finite(value) && value>=0).sort((a,b) => a-b), n = sorted.length;
  return { n, median:n ? n%2 ? sorted[(n-1)/2] : (sorted[n/2-1]+sorted[n/2])/2 : null };
};
const identityOf = client => ({
  pageRelease:String(client.pageRelease || ''), serverRelease:String(client.serverRelease || ''),
  pageBuild:String(client.pageBuild || ''), serverBuild:String(client.serverBuild || ''),
  viewport:finite(client.w) ? client.w : null, visibility:String(client.visibility || 'unknown')
});
const objectJSON = value => {
  const parsed = JSON.parse(value || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Invalid object');
  return parsed;
};

export function summarizeSpeed(input) {
  const values = Array.isArray(input) ? input : input?.values;
  if (!Array.isArray(values) || JSON.stringify(values[0]?.slice(0,5)) !==
      JSON.stringify(['When','Kind','Total ms','Steps','Client']))
    throw new Error('Expected Speed Log range JSON with its header row.');
  const groups = new Map(), reports = new Map(), legacy = new Set(), conflicts = new Set();
  const quality = { sourceRows:values.length-1, invalidRows:[], exactDuplicateRows:0,
    possibleLegacyDuplicateRows:0, conflictingReportIds:0 };
  for (let i=1; i<values.length; i++) {
    const row=values[i];
    if (!Array.isArray(row) || !row[1] || row[2] === '' || row[2] == null) { quality.invalidRows.push(i+1); continue; }
    let steps,client;
    try { steps=objectJSON(row[3]); client=objectJSON(row[4]); }
    catch { quality.invalidRows.push(i+1); continue; }
    const ms=Number(row[2]);
    if (!Number.isFinite(ms) || ms<0) { quality.invalidRows.push(i+1); continue; }
    const identity=identityOf(client), kind=String(row[1]);
    // Logging time and batched save samples do not identify the operation being measured.
    const fingerprint=JSON.stringify(canonical({ identity,kind,ms,steps,
      client:Object.fromEntries(['rpcMs','applyMs','render','drawEnd','ready','dom','frameFirstByte','frameDone']
        .filter(key=>finite(client[key])).map(key=>[key,client[key]])) }));
    const reportId=typeof client.reportId === 'string' ? client.reportId : '';
    let possibleLegacyDuplicate=false;
    if (reportId) {
      const seen=reports.get(reportId) || new Set();
      if (seen.has(fingerprint)) { quality.exactDuplicateRows++; continue; }
      if (seen.size) conflicts.add(reportId); // retain conflicting payloads; never guess which is right
      seen.add(fingerprint); reports.set(reportId,seen);
    } else {
      possibleLegacyDuplicate=legacy.has(fingerprint);
      if (possibleLegacyDuplicate) quality.possibleLegacyDuplicateRows++;
      legacy.add(fingerprint); // old identical records remain in all reported counts
    }
    const key=JSON.stringify(identity);
    if (!groups.has(key)) groups.set(key,{ identity, matched:!!identity.pageRelease &&
      identity.pageRelease===identity.serverRelease && !!identity.pageBuild &&
      identity.pageBuild===identity.serverBuild, firstRecord:String(row[0] || ''),
      lastRecord:String(row[0] || ''), possibleLegacyDuplicateRows:0, records:[] });
    const group=groups.get(key); group.lastRecord=String(row[0] || '');
    if (possibleLegacyDuplicate) group.possibleLegacyDuplicateRows++;
    group.records.push({kind,ms,steps,client});
  }
  quality.conflictingReportIds=conflicts.size;
  return { quality, groups:[...groups.values()].map(({records,...group}) => ({ ...group,
    kinds:Object.fromEntries([...new Set(records.map(r=>r.kind))].map(kind => {
      const list=records.filter(r=>r.kind===kind);
      return [kind,{ records:list.length, serverMs:metric(list.map(r=>r.ms)),
        rpcMs:metric(list.map(r=>r.client.rpcMs)), drawMs:metric(list.map(r=>r.client.render)),
        applyMs:metric(list.map(r=>r.client.applyMs)),
        stepsMs:Object.fromEntries([...new Set(list.flatMap(r=>Object.keys(r.steps)))].sort()
          .map(step=>[step,metric(list.map(r=>r.steps[step]))])) }];
    })) })) };
}

if (process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  try {
    if (process.argv.length!==3) throw Error('Usage: node tools/speed-summary.mjs speed-log.json');
    let input;
    try { input=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); }
    catch { throw Error('Could not read valid Speed Log JSON.'); }
    console.log(JSON.stringify(summarizeSpeed(input),null,2));
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
