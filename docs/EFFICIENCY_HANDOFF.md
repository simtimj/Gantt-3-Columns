# Gantt efficiency — operating guide and handoff

Updated 2026-11-08. This is the current engineering handoff, not a declaration that the whole efficiency project or actual-device verification is finished. Read the latest `main`, deployment result and confirmation queue before changing code. Keep this guide current when resuming work.

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
