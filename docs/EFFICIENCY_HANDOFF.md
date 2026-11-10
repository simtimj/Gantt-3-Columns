# Gantt efficiency — operating guide and handoff

Updated 2026-11-10. This is the current engineering handoff, not a declaration that the whole efficiency project or actual-device verification is finished. Read the latest `main`, deployment result and confirmation queue before changing code. Keep this guide current when resuming work.

## Latest checkpoint — 2026-11-10

- PR49 merged as `f185642`; full CI `42852365969` and deployment `42853372687` passed.
- PR50 merged as `195dc0c`; full CI `42855036899` and deployment `42855879781` passed.
- Synthetic counts: daily covered-date formatting 2,192 → 0; warm confirmation identity digests 190 → 0. Live reads, IDs, fallback behavior and locked rereads remain intact. Actual total elapsed gains are unmeasured.
- Next normal daily maintenance measures setup; refreshed deployed-build imports measure confirmation hash/cache overhead. Do not reset lastSetupDate or force production maintenance for a benchmark.
- Phone Reference offline recovery was user-confirmed. Cross-device editing and live Focus backup/restore remain open. Frequent recovery prompts/apparently disappearing text are separately deferred.
- Roughly65% complete is a planning judgment in a60–70% range, not a weighted measure or speed gain. No source ownership migration has occurred.
- [Daily planning requirements](PLANNING_WORKFLOW.md) are separate. Historical backlog implementation/cleanup is deferred. Continue efficiency work.

## Live follow-up — 2026-11-10, 09:13 Pacific

Latest retained log has only three reports from server release87b25ae:

| Report | Page / visibility / width | Server | Interpretation |
| --- | --- | ---: | --- |
| 09:05 import | Old page390a3c4 / visible /1421 |10,085 ms | Deployment intake, Done reconciliation and confirmation reconcile occurred; not steady-state |
| 09:13 load | Matching87b25ae / visible /1317 |1,203 ms | Reported ready2,190 ms, render329 ms; warm setup12 ms, not a daily-coverage measurement |
| 09:13 import | Matching87b25ae / hidden /1317 |5,835 ms | One warm sample; do not combine with visible steady-state baseline |

Warm confirmation: hashes0 ms, cache read5 ms, rows22 ms, source read847 ms, card read128 ms, total1,022 ms. Cold preceding check had hashes267 ms and rows347 ms, but also writes/different page state; this pair is not a controlled time-saving estimate. Zero hash work confirms real reuse without proving total latency improvement.

The warm import still spent2,810 ms in Done, including1,490 ms reading today's cell, and741 ms in task intake. Reference568 ms and schedule.read361 ms remain live reads. These costs vary; do not infer another cache is safe or warranted from one slow call. One successful day save acknowledged in3,137 ms does not establish typical save latency.

Next: gather several matching visible reports on the deployed page, assess confirmation cache overhead/hit behavior and source-read variability, then choose another bounded optimization. No runtime code change in this measurement checkpoint. Do not manufacture maintenance or change historical data. Rough completion estimate stays65%; cross-device/live restore and ownership checks remain open.

## Visible phone follow-up — 2026-11-10, 09:16–09:20 Pacific

All ten reports below match page/server release `a44c4a4`, build `4f3f14ff8b90b7ef`, viewport width411 and visible-at-reporting state. Several reloads occurred, so this is not one uninterrupted five-minute steady-state session. Exact report IDs are distinct.

| Kind | Count | Server median | Browser RPC median | Reported ready median |
| --- | ---: | ---: | ---: | ---: |
| Load |4|1,146.5 ms|not reported|2,632 ms|
| Imports |5|2,882 ms|4,591 ms|not applicable|
| Sync |1|1,108 ms|3,037 ms|not applicable|

Confirmation medians over all five imports: total573 ms, rows65 ms, hash work0 ms, cache read21 ms, source read234 ms, card read130 ms. Four imports reused the confirmation hashes; the first did199 ms of digest work and99 ms cache writes. Done hashes similarly warmed after the first import. Parent/component medians are not additive. Reference save had one successful2,464 ms acknowledgement; no typical save estimate from one sample.

Import schedule.read median210 ms; the only sync spent703 ms there and346 ms in Reference. Source inspection confirms schedule already shares its request-local day snapshot and invalidates after writes/errors. Live date scanning is necessary to see moved/backdated rows; skipping it based only on cached positions could hide corrections. Reference bodies/manifests remain live to detect direct edits/additions/deletions. No additional cache or runtime rewrite is justified by this small sample alone.

The latest retained sample has no matching old visible-phone release for a controlled before/after comparison. Do not compare it causally with the earlier width1421 desktop benchmark or the original mixed-history medians. Warm setup was17–107 ms across these loads; no daily maintenance ran, so PR49's elapsed benefit remains open.

No further user five-minute run is needed immediately. Preserve current freshness behavior; next engineering work should isolate service-read/transport variability before changing read policy. Cross-device recovery, live Focus snapshot/restore and ownership coverage remain open. Frequent recovery prompts and backlog implementation remain deferred. This checkpoint changes documentation only and leaves the rough65% planning estimate unchanged.

## Start here

- Apps Script and Google Sheets remain the architecture. Separate hosting/database migration is conditional future work.
- Julius uses `/dev`: successful main-branch deployment pushes the latest source; an open browser page still needs reloading to receive new client code. `/exec` promotion is separate.
- Read [CLAUDE.md](../CLAUDE.md) for current workflow and [README.md](../README.md) for feature/confirmation status. The [ownership and identity map](EFFICIENCY_DATA_MAP.md) defines module boundaries. Detailed save/recovery/timer notes are in [NOTES.md](NOTES.md).
- Optimize the largest measured source of repeated work. Keep changes small, preserve concurrent work and avoid a rewrite based only on module count.

## Runtime flow

1. `doGet` embeds `getWorkspaceData({fast:true})`: setup check, saved day/Reference data and seeds, without running write-producing imports first. The visible day window reuses that request's existing Days snapshot.
2. After drawing, `runImports` handles deployed-code/Done Log/task/confirmation/study intake and maintenance, then returns deltas. Regular light sync handles schedule moves and changed day/Reference data. These calls can write; do not describe them as read-only benchmarks.
3. Day hashes and Reference body/structure hashes drive changes. Reference manifests cover add/delete/title/parent/order/collapse, not just text. Existing editors are reused; focused, dirty, saving or dragging content is protected. An old response must not overwrite newer local mutations.
4. Read reuse is request-local. After schedule writes or an uncertain mutation, reread. A currently unloaded task is not proof of deletion. Calendar browser caches are derived views, with revalidation and fresh data after writes.

The initial snapshot window reader skips distant Date cells before timezone formatting, with a conservative two-day margin for offsets/DST; text dates still follow existing normalization. A synthetic 1,000-old-row/one-current-row fixture drops this reader’s date-format calls from 1,001 to 1 without extra reads. This is a targeted call count, not elapsed-time evidence.

`readAllDays_` still reads the Days A:D history range for Urgent/Dailies seeds. Historical data has not been migrated or fully paged out of routine loading.

## Owners and identities

- Days date + column identifies Tasks/History, Notes, Plan/Blocks pad and Scratch. The Calendar `Plan` table is a separate planning-placement store.
- Reference card UUID differs from a task's `data-tid`. Keep In Mind/Focus has property-backed item IDs. Copies and plan placements should resolve to the task, not become independent editable duplicates.
- Calendar owns event timing/color; retain calendar, event and occurrence identity when linking/moving. Planned duration is distinct from measured timer effort.
- Embedded `Timer Log` operations and the separate `tracker/` database are different systems. Do not merge them implicitly.
- `New Tasks` is append-oriented intake, not a general update API: its generated ID hashes raw date + title. Due/urgency/subtask edits do not create a new ID. Done Log identity includes details; Type does not. Preserve deduplication/correction boundaries until immutable IDs and revisions are designed.
- Big Three / Biggest Return is a standing list of up to three tasks or Reference projects, with one ranked Waiting list. `big` and `next` are undated; project refs use `card:<Reference UUID>`. Stretch is set aside (legacy rows remain readable). Completing an item suggests the next Waiting item for Julius to confirm; it does not automatically promote it. Urgent work stays separate. Lead Tasks is not implemented. These rules supersede the earlier dated Big Three model.
- Visible urgency is now **0 red / 1 yellow / 2 blue**. HTML `data-urg` remains **1 / 2 / 3**. `Urgency 0-2` marks the new intake scale; the legacy header retains legacy numeric interpretation. Do not mass-convert stored HTML values.
- Existing `Open Tasks` is the implementation work register. Reconcile it rather than inventing another master register. Reference project/task IDs and register IDs have distinct roles.

## Current verified work budgets

These are targeted service-read counts, not percentages of total runtime.

| Path | Change |
| --- | --- |
| Initial day data | Typical three reads to one shared snapshot; distant Date cells skip timezone formatting before visible-window selection |
| Overlapping light-sync day ranges | Two queries to one, invalidated after writes/errors |
| Done Log intake / pending New Tasks intake | One raw read / raw plus display reads |
| Already-applied New Tasks intake | One raw read; skip displayed times only after checking every raw row's ID |
| Warm unchanged Done Log Today lookup | Two reads to one validated date/content row read |
| Warm unchanged confirmation refresh | Three data reads/lookups to two |
| Done Log / confirmation date normalization | Reuse identical Date timestamps only within each fresh source read; locked rereads use a new formatter |
| Unchanged study intake | Two reads to one; changed rows reread under lock before processing |
| Daily setup | Reuse a formatting-version hint tied to tab IDs; manual setup still repairs formatting |

Row hints never cache editable history text. Stale, deleted, invalid or unavailable hints fall back. Missing-date insertion sorts complete rows, including Plan and Scratch; it does not infer or repair old misassignments.

## Saves, recovery and rollback

- Reference saves protect exact requested fields and serialize card saves. Focus uses three-way merging; failures/conflicts retain local work instead of replacing it with empty or stale data. A lock alone does not merge stale snapshots, and external Sheet writers do not participate in script locks.
- Day Tasks/Notes and Reference text have revision-specific browser recovery copies captured before debounce. Reopening offers Review/Restore/export; deleted cards are not automatically recreated. Browser storage can fail or be cleared. This is not cross-device or historical backup and does not extend text recovery to every module.
- Focus property storage stages bounded UTF-8 generation chunks, verifies them, then publishes a head. **After migration, rollback must retain a compatible generation reader or convert verified data first.** An old reader alone can make current data inaccessible. Capacity limits remain.
- Offline Focus extraction and its repeatable storage-writer drill are in [Focus recovery procedure](FOCUS_RECOVERY.md). The extractor verifies the selected generation (or legacy data) and creates a new private JSON file without writing to Google. Passing the synthetic drill does not establish that a live backup exists or that live restoration works.
- The derived confirmation card has a 48,000-character budget. Full instructions stay in To Confirm; oversized cards use deterministic previews and, only if titles still cannot fit, an explicit remaining-count notice with whole check-lines. This prevents a large generated card from retrying an over-limit single-cell write on every import. IDs, source status and locked rereads remain authoritative; actual elapsed-time benefit needs live samples.
- Keep original HTML, IDs and reverse mappings until a structural migration and rollback are verified.

## Measurements and checks

Historical mixed-build server medians: initial data **1.278s**, sync **1.124s**, imports **4.004s**. A small matched page/server session on an earlier build measured **1.145s / 0.925s / 4.331s** (2/4/3 samples). It predates the latest optimizations; no post-change overall speedup is established.

Speed Log separates release/page identity, server work, browser RPC and immediate application. Save acknowledgements piggyback on existing reports; no extra per-save logging RPC. Browser reports carry a page-scoped `reportId` generated once per submission, so analysis can deduplicate an applied report that is transported again. Different measurements get different IDs; save `sampleId` remains separate. Older records lack exact report identity. No extra reporting request is added. Samples are bounded, best-effort, exclude debounce and can be lost on close. Missing telemetry does not prove inactivity. A server-only sample from an old page is not a controlled comparison.

Run `node tools/check.mjs` and `node tools/smoke.mjs`; CI includes save/conflict/recovery, setup, sync, intake and study fixtures plus desktop/phone browser smoke. Browser Google services are mocked. Actual phone, close/reopen and cross-device confirmation remain separate. Every shipped feature gets a To Confirm row; main code pushes auto-log, while manually logged/docs-only work uses `Done-Log: manual` to prevent duplication.

Import substeps in `Steps` now distinguish `done.sourceRead`, `done.rows`, `done.todayCheck`, `done.lock`, `done.reconcile`, and `confirm.check` / `confirm.write` source-read, rows, card-read and render stages plus `confirm.lock` / `confirm.reconcile`. These overlap their parent totals (and confirmation write stages overlap reconciliation); never sum parent and child durations. The same existing report carries them, with no new service reads or logging RPCs. Live post-deployment breakdowns still need to accumulate.

For repeatable offline summaries, use [measurement procedure](SPEED_MEASUREMENTS.md) and `node tools/speed-summary.mjs speed-log.json`. It separates matching release/build and viewport/visibility groups, exact report-ID duplicates, legacy uncertainty and conflicting IDs. Preserve the historical audit baseline rather than replacing it with the retained rolling log.

## Resume order and final deliverable

1. Gather matched page/server timings after a real `/dev` reload; distinguish cold/daily setup, warm loading, imports and save acknowledgements.
2. Profile the remaining slow import/sync steps before selecting another optimization. Preserve backdated appends and retry/correction behavior.
3. Finish actual-device conflict/recovery checks and a rollback drill.
4. Extend the read-only identity pilot to Calendar/Plan/timer links and all relevant owners. No write-owner/schema migration is approved by this inventory alone.
5. Keep the agreed Big Three / Biggest Return planning model separate from urgency and from these infrastructure changes. Broader calendar/timer integration still has its own requirements.

At project completion, give Julius a concise copy-ready Claude handoff linking this guide, the ownership map and the private measurement report. Include measured before/after results, deployed state, unverified behavior, known limits and exact remaining/resume steps. Do not put private task content in this public repository. Keep this guide linked rather than maintaining conflicting copies across assistants.

### November 9: skip unused schedule hashes

`getDaysRange_` accepts an optional request-local Set of dates needing hashes. Omitted means the public/full behavior, an empty Set means text-only internal schedule reads. `getSyncState` selects only client-requested dates while retaining the entire upcoming schedule window; `moveScheduleToNotes_` standalone uses no hashes. Schedule writes/failures still invalidate the snapshot and force a full fresh diff. No source reads or concurrent-edit checks are skipped. Tests cover raw/snapshot parity, fresh direct edits, requested hashes and width metadata once across disjoint row runs. An eight-day fixture reduces 24 unused digests to zero; real elapsed-time gains are unmeasured. `schedule` measures Days lookup/migration, not Google Calendar; `schedule.read` isolates the read portion.

### November 9: post-intake Days snapshot shared by imports

`readScheduleForSync_` now holds the existing bounded union-range logic shared by light sync and `runImports`. `runImportSteps_(timer, req)` reads after all normal intake modules, then returns the snapshot only when schedule migration and both later one-time fixes explicitly make no changes. `fixUrgentBold_` and `removeDaySections_` return false for already-completed fixes and true when their repair path runs; exceptions and unknown results invalidate conservatively. Legacy `runImportSteps_(timer)` retains standalone behavior. Tests exercise early partial intake writes, next-request direct edits, all later write/failure/unknown invalidations and disjoint views. Unchanged imports need one Days-range pass instead of two; no persistent data cache or source cursor.

`done.todayRead` and `done.todayParse` split the existing `done.todayCheck` wall time without another read. They are nested metrics: do not add them to their parent. Recent live Today HTML was only205characters, so parsing is not yet established as its bottleneck; avoid speculative parser rewrites.

### November 9: Inbox property-read batching

`getInbox` reads UserProperties once per response, passing that request-local snapshot to `inboxRead_` for inboxDone / inboxItems / inboxOver. Default single-field callers and all write paths are unchanged. A failed bulk read falls back to three independent reads, so readable fields survive isolated failures. No persistent settings cache. Tests compare exact original results for AI overrides, app entries, dismissed items, missing/corrupt JSON, changed settings between calls and service failures. Normal property reads3→1; no extra logging RPC or source write. The preceding live import group had only3 samples and included Claude UI cleanup releasefbfa55e, so do not claim isolated gains.

`done.hashes` accumulates time inside existing Done Log ID digest calls, nested under `done.rows`; do not add parent and child. The ID inputs and digest algorithm are unchanged. It distinguishes the latest1560ms row-processing outlier from the243ms group median without another RPC or exporting content.

### November 9: exact-input Done Log digest memoization

Live releasef0052f5 showed done.hashes574/814ms within done.rows610/863ms. `doneRowHashes_` memoizes pure digest results, never source rows or applied state. Each request reads/normalizes the complete source first. Blocks contain32 normalized input strings plus their16-hex MD5 prefixes. Reuse requires exact input-array and digest-shape matches; edits/reorders/deletions/appends invalidate affected blocks. Non-ID fields (Done by / Type) remain freshly mapped. Missing/corrupt cache entries, getAll/putAll failures and oversized blocks fall back to existing cellHash_; digest failures still propagate. Only up to32 blocks (1024 rows) are eligible; blocks over18000 input-JSON characters bypass caching, and stored JSON is capped20000 characters (below100KB even at3 UTF-8 bytes per UTF-16 unit). Cache namespace `done-id-hashes:v1:` must change if ID normalization or the digest algorithm changes. Entries expire after600seconds; source Sheet data and properties are untouched.

Nested numeric `done.hashCacheRead` / `done.hashCacheWrite` expose cache overhead; `done.hashes` records actual digest work, including0 on fully warm reads. Do not add them to their parent done.rows. Tests compare real Node MD5 output for Unicode and original normalization:324 cold calls→0 warm, with fresh source reads retained. Covers modified/moved/deleted/backdated rows, fresh mine/type fields, malformed cache entries, eviction, read/write/digest failures, Unicode entry bounds and growth cap. Benchmark is an operation count, not proof of device-time savings; revisit if cache I/O costs exceed saved hashing. Google Cache API contract: https://developers.google.com/apps-script/reference/cache/cache

### November 9: study source bounds and timing

After digest reuse, live Done Log hashing was0ms with40/60ms cache reads and56/88ms total row processing; total imports remained4278/4272ms because study rose to996/1156ms and confirmation source reads varied. `syncStudyLog_(timer)` now gets the initial source row count once (formerly twice), preserving the fresh count/value reread inside the existing lock on a changed signature. Standalone callers without a timer remain valid. Nested numeric study.lookup / bounds / sourceRead / signature / appliedRead and lock/lockedRead/lockedSignature/lockedAppliedRead/displayRead identify remaining costs, with no additional source reads. Do not sum nested steps with the parent study total. Tests preserve unchanged/busy behavior, corrected sessions appended during lock acquisition, last-ID-wins history, acknowledgement exclusion, header-only input, exact read budgets and timing shape.

### November 10: daily date-coverage formatting

A live startup showed5816ms in setup. `ensureDayRange_` now reads the same live Date column, builds an exact timestamp set, and skips timezone formatting when a generated date is already present exactly. Text values keep existing formatDate_ normalization. For timestamp mismatches, normalize the candidate and only existing Date values within a conservative two-day margin, memoizing those conversions for this call. This preserves non-midnight legacy dates, timezone differences, duplicates and DST without a cross-request source cache or row cursor. Append/sort behavior and Plan/extra-column attachment remain unchanged. Tests execute a frozen actual pre-change function against the new one across five script timezones and DST transitions: covered1096-day fixture2192→0 format calls; one missing day≤4. A mismatched-timestamp source retains the normalization fallback; operation-count savings are not yet a measured runtime gain. Manual setup and failed-setup retry rules remain unchanged.

Phone recovery check, Nov10: Julius reported the saved online line remained and the offline line was recovered through the recovery UI, leaving both. This verifies that specific phone test only. More frequent recovery prompts/apparently disappearing text were reported separately and remain unresolved; Julius deferred investigation. Do not mark that symptom fixed or broadly certify all recovery paths.

`setup.dateCoverage` and `setup.lock` split existing cold setup work from lock waiting without extra service calls. A setup spike alone does not prove date formatting caused the whole delay. Manual setup still works without a timer; already-completed daily setup keeps its property-only fast path.


## Confirmation identity digest reuse — 2026-11-10

To Confirm imports showed meaningful row-processing cost after source reads. Reuse the existing bounded exact-input digest helper with a separate confirm cache namespace. Every source row is read and normalized on every check and locked reconcile; only deterministic IDs are reused. Date, defaulted project and change title must match exactly. Instructions, status and row positions remain live. Done Log namespace, digest format and timing stay compatible. Misses, eviction, corrupt entries and cache errors compute normally; no source cursor or content cache. A 190-row fixture changes 190→0 warm digest calls, with identical IDs and source reads. Actual elapsed gain is unmeasured; compare confirm.check.hashes and hashCacheRead/Write after deployment. Keep the frequent recovery-prompt investigation deferred.
