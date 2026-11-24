/* Cloud Functions entry (docs/NOTES.md → "I. Server jobs → Firebase Cloud Functions", 2026-11-24).
   cal: POST { fn, a } with the app's Firebase sign-in (Authorization: Bearer <ID token>, owner only) → runs one calendar
   edit from cal-core.mjs as the service account the calendars are shared with. Answers { ok, r } | { fallback } | { ok:false, e }.
   calWarm: a free scheduled ping so `cal` is awake while Julius is likely using the app (no 1–3 s cold start).
   .mjs on purpose: clasp pushes .js files to Apps Script. */
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';
import { makeCal, Fallback } from './cal-core.mjs';

initializeApp();
const OWNER = 'juliussimtim@gmail.com';
const ORIGINS = ['https://simtimj.github.io'];
const REGION = 'us-west1';
const SA = 'gantt-functions@gantt-2ee94.iam.gserviceaccount.com'; // runtime service account; the calendars are shared with it (NOTES I)

let api = null;
function calendar() {
  if (!api) api = google.calendar({ version: 'v3', auth: new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/calendar'] }) });
  return api;
}

export const cal = onRequest({ region: REGION, serviceAccount: SA, memory: '256MiB', timeoutSeconds: 30, maxInstances: 3 }, async (req, res) => {
  const origin = req.get('origin') || '';
  if (ORIGINS.includes(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method === 'GET' && req.query.warm) return res.json({ ok: true, warm: true });
  if (req.method !== 'POST') return res.status(405).json({ ok: false, e: 'POST only' });
  try {
    const tok = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const who = await getAuth().verifyIdToken(tok);
    if (String(who.email || '').toLowerCase() !== OWNER || !who.email_verified) return res.status(403).json({ ok: false, e: 'Not allowed' });
  } catch (e) { return res.status(401).json({ ok: false, e: 'Sign in again' }); }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const ops = makeCal(calendar(), getFirestore()).OPS, f = ops[body.fn];
  if (!f) return res.json({ fallback: 'not here: ' + body.fn });
  const t0 = Date.now();
  try {
    const r = await f(...(Array.isArray(body.a) ? body.a : []));
    return res.json({ ok: true, r, ms: Date.now() - t0 });
  } catch (e) {
    if (e instanceof Fallback || e.fallback) return res.json({ fallback: e.message });
    // Calendar API refused (calendar not shared with the service account yet, API off…) → Apps Script does it.
    if (e.code === 403 || e.code === 401 || /insufficient|forbidden|not been used|disabled/i.test(e.message || '')) return res.json({ fallback: 'calendar access: ' + e.message });
    // Google hiccup: Apps Script retries it — except a create, which may already exist (the app retries this one instead).
    if (Number(e.code) >= 500 && body.fn !== 'calPanelCreateEvent') return res.json({ fallback: 'calendar error ' + e.code });
    return res.json({ ok: false, e: e.message || String(e) });
  }
});

// Every 5 min, 6 am–11 pm Pacific: wakes `cal` (a GET ?warm=1 to its own URL).
export const calWarm = onSchedule({ region: REGION, schedule: '*/5 6-23 * * *', timeZone: 'America/Los_Angeles', retryCount: 0 }, async () => {
  const url = 'https://' + REGION + '-' + process.env.GCLOUD_PROJECT + '.cloudfunctions.net/cal?warm=1';
  try { await fetch(url); } catch (e) { console.warn('warm ping: ' + e.message); }
});
