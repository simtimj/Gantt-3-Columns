# Gantt data ownership and identity map

Date: 2026-11-08. Source snapshot: `03d48dda78a41e9bc39123480befd6e9e02d24f5` (including workspace recovery and the Calendar cache).
This is a code inventory and migration design, not a live referential-integrity audit or an implemented migration. Keep Apps Script/Sheets. Do not infer deletion from a task that is absent from the currently loaded DOM.

## Current owners

| Entity | Current store / identity | Writer and important boundary |
| --- | --- | --- |
| Dated day text | `Days`: date in A; Tasks/History in B, Notes/Journal in C | `saveDay`; each complete HTML cell is a conflict boundary. Individual task rows are not separate Sheet records |
| Plan/think / Blocks pad | `Days!D`; date identifies the pad | `savePlanPad`; this is distinct from the Calendar daily-plan `Plan` tab |
| Daily Scratch | `Days!E`; date identifies the pad | `getScratchPad` / `saveScratchPad`; separate from Reference and the daily-plan table |
| Reference card | `Reference!A:G`: UUID, parent, type, title, content, expanded, sort | `saveReferenceItem` protects content and explicit parent/expanded changes; order has its own writer. Stable card ID is not the same as a task ID inside its HTML |
| Archived Reference card | `Archive`: original card fields plus deletion time | Archive restore keeps card identity; archived content is not an active task source |
| Gantt task and mirrors | Optional `data-tid` on an HTML check-line; generated mirrors commonly use `m-…` | Task mirrors and `window.fwTasks` share identity across live copies. Some lines acquire an ID only when linked; identical titles do not establish identity |
| Gantt completion history | `data-htid` for a completed task link; imported completion lines use `data-cid` | History is a completion/provenance view, not another open-task owner |
| Keep In Mind / Focus | Script properties: `focusDataHead` selects verified `focusV2_<generation>_<n>` JSON chunks | `getFocus` / `saveFocus`; item `id` is the bridge identity (`m-…` for newly generated tasks). Category IDs and item IDs have different roles. Public saves use locking and three-way merge |
| Calendar appointment | Google Calendar; calendar ID, event ID and occurrence start matter | Calendar API writers own timing/color. The app's event references often encode `eventId@startMs`; a move must refresh those links |
| Calendar display cache | Browser `fw.calCache.v1` and in-memory event/day maps | A derived last-known view, not a new event owner. Background reads refresh Google data; write paths request fresh data or apply the returned event shape |
| Calendar daily plan | `Plan`: `Id, Date, Group, Rank, Ref, Title, Target, Event, Updated` | `planSave`; `Ref` is `tid:<taskId>` or `cal:<eventId>`. `Id` identifies the plan placement, not a new task. Big/Stretch are dated; Next/Backlog are undated |
| AI task intake | `New Tasks`: Date, Title, Urgency, Due, Minutes, Subtasks, Added | `sheetTaskRows_` creates `s-` + hash(raw date + title); `applyClaudeTasks_` records applied IDs. This is append-oriented intake, not a general task-edit API |
| AI completion intake | `Done Log`: Date, Project, Title, Details, Done by, Type | `sheetDoneRows_` hashes date/project/title/details into `s-…`; imported `data-cid` preserves provenance. The rolling intake window is 30 days |
| Study session | `Study Sessions`: explicit session ID and date/time/result fields | `syncStudyLog_` aggregates History by date + daypart, while Study Review is derived by topic. Session identity differs from the aggregate `data-study` key |
| Embedded timer activity | `Timer Log`: unique `Op`, Date, At, Action, Block, Item, Name, Value, Device | `saveTimerEvents` deduplicates operation IDs; block/item identity comes from timer IDs (`data-tmr`), not automatically `data-tid`. Totals are derived by event replay |
| Separate Time Tracker | Separate spreadsheet selected by `TRACKER_DB_ID`; Records has Seq, Id, Kind, Updated, Deleted, Json, Device, Saved | `trackerSync`; record kinds cat/block/item/entry/plan/series/cfg, per-record updated-time reconciliation and sequence responses. This is not the embedded Timer Log |
| Fun / New Things | Script-property JSON, item/category IDs and updated times/tombstones | `saveFun` / `saveNewThings`; not automatically planner tasks or calendar events |
| Confirmation checklist | `To Confirm` rows; card line `data-kid` hashes date/project/change | `syncConfirmCard_`; source status is authoritative, the pinned Reference card is derived. Confirmation IDs are not general task IDs |
| Recovery copies | Browser-local app/page/record keys in `Drafts.html`; day key is date, Reference key is card ID | Pending text snapshots and their original merge bases. A recovery-copy ID is not a task identity; successful reviewed save returns authority to the server |
| Performance samples | Speed Log with build/release labels | Diagnostic data, not task/session records. Save timing is a separate pending improvement (PR #31); do not treat a missing timing record as inactivity |

Sources: [Code.gs](../Code.gs), [Index.html](../Index.html), [Timer.gs](../Timer.gs), [StudyLog.gs](../StudyLog.gs), [tracker/Server.gs](../tracker/Server.gs), [Drafts.html](../Drafts.html).

## Current links and what they mean

| Link | Existing behavior | Integration constraint |
| --- | --- | --- |
| `data-tid` across editors | Checkbox changes propagate to loaded copies; the client resolves a preferred live copy | Loaded-copy priority is not a declared canonical owner. Do not make a new database owner merely from the first DOM match |
| `Plan.Ref = tid:…` | Uses the live task bridge for text/done, including Focus | `fwTasks.info` may return null because the source is not loaded. The planner displays "not loaded" and disables that tick; that does not prove an orphan |
| `Plan.Ref = cal:…` | Links to a Calendar event; cached row title can be a fallback | Ref does not contain calendar ID, while Event contains event ID/start. Verify cross-calendar and recurring-occurrence semantics before global event deduplication |
| `Plan.Event` and `planEv:<tid>` | Schedule reuses the known task event; calendar moves relink event/start references | Preserve the event ID and refresh its occurrence/start locator. Never create a second event simply because a stale locator cannot find the first |
| Plan row versus task | A dated/undated placement is found by Ref + the relevant day/undated group | Separate placement ID from task ID and from a recurring occurrence. A daily habit template needs occurrence identity; title equality is insufficient |
| Timer Item versus task | A line can carry both task and timer identity | Keep an explicit task-to-timer association before combining the two timer stores. Planned calendar duration is not measured work; estimates remain labelled estimates |
| Done Log / History | Append-oriented materialized history with applied-ID guards | A completion record is not the same entity as the still-open task or its timer session |

`fwTasks.candidates()` currently offers urgent lines from loaded day/Plan-pad/Notes editors, Undated Tasks, and open Focus items. Calendar events are added by the Calendar panel. It is not an exhaustive catalogue of every checkbox in every Reference project or every historical day. IDs can be assigned lazily by `ensureTid` when a line is linked.

## Correction and concurrency constraints to resolve before migration

1. **Intake IDs contain editable text.** Changing a New Tasks title/date changes its generated identity; changing urgency/due/minutes/subtasks does not. Already-applied IDs are skipped. Done Log details also participate in its identity, while Type does not. The existing append-only intake contract must not be presented as a safe general update interface. Define immutable intake IDs, revisions, alias mapping and correction semantics before enabling arbitrary row edits.
2. **One task can have several live HTML copies.** Inventory copies and explicit links first. Never deduplicate by title or allocate a replacement task ID for every view.
3. **Locks are not revision checks.** Reference content/selected metadata and Focus have stale-write protection. Sort writers and plan-row updates have different protocols; serialized writes alone do not merge stale snapshots. External connector writes do not participate in the script lock.
4. **Completion and recurrence are separate.** Preserve template, task, dated plan placement, Calendar occurrence, timer session and completion IDs as distinct roles. Reusing one ID for all of them would make daily habits and recurring appointments ambiguous.
5. **Historical visibility is not deletion.** Live link-coverage checks must read all relevant owners, including Focus properties and older days. An active-window Sheet scan alone cannot prove that a missing task is deleted.

## Proposed small pilot — no schema/data changes implemented

Start with the existing Gantt-efficiency project itself, whose task lines already have explicit IDs. Keep its Reference card authoritative. This avoids using time-sensitive travel or household work as the first migration experiment.

| Phase | Concrete work | Acceptance / rollback |
| --- | --- | --- |
| A. Read-only identity report | Enumerate existing task IDs, all owner/copy locations, Plan references and known event/timer associations; include source hashes/time and unscanned owners | Counts reconcile with source; unknown is distinct from deleted; no user data rewritten |
| B. Source/alias rules | Choose a canonical owner for each pilot task; keep existing IDs and record aliases/provenance | Every displayed copy resolves to one task; legacy IDs and event links remain readable |
| C. Structured sidecar | Pilot immutable TaskId, Owner/OwnerKey, ProjectId, ParentTaskId, Title, Done, Urgency, Due, EstimateMinutes, Revision; keep planning and sessions as separate tables/links | Sidecar is initially derived, never an independent editable duplicate. Old HTML remains readable and recoverable |
| D. Shadow comparison | Compare old and derived task counts/status, plan references, event IDs and measured/estimated time totals; test retry, partial failure and two-device edits | Zero unexplained differences; documented reverse mapping and recovery exercise before changing write authority |
| E. One write owner | Enable exact-field revisioned writes for the chosen owner and derive other views from it | No uncoordinated dual writers. Keep a compatible reader/rollback path and do not delete original storage until verified |

Keep `Urgency` (red/yellow/blue), selected daily `Plan.Group` (Big Three/Stretch/Next/Backlog), due date and outcome target separate. They answer different questions. A quick timer activity may remain unallocated or explicitly linked to a task; it need not create a new permanent task automatically.

Use typed identity keys (task versus completion versus plan placement versus timer operation), even where existing string prefixes happen to match. Preserve legacy strings as aliases rather than globally renumbering them.

Live coverage counts, canonical-owner decisions for mirrored tasks, correction semantics and a tested migration rollback remain open. Separate hosting or a new database is not a prerequisite for this pilot.
