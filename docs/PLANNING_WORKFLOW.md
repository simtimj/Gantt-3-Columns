# Daily planning workflow — requirements

Updated 2026-11-10. Planning input, not an implementation claim. The Calendar Planning View Reference card remains the detailed product-planning home.

## Reference → Next Steps → CalEvents

The former Urgent section (top-right Gantt) is now **Next Steps**. Reference (Ref/Fridge) is the master repository for full project information, context and backlog. Next Steps is the active short-term action queue of immediate, pressing and timely work drawn from Reference. CalEvents coordinates/schedules that work into daily time slots.

Preserve existing ordering, IDs and color mappings: visible urgency0 red /1 yellow /2 blue; stored data-urg1/2/3. Keep sequential prefixes such as01,02 and decimal insertions such as01.1 within the existing urgency ordering. This renames the component and documents its role; it does not authorize source migration, renumbering, duplicate tasks or a new automatic routing engine. Historical “Urgent area”/“urgency cell” references mean Next Steps; “Urgent” remains the name of the red priority level.

Layout (2026-11-11, implemented, not yet user-confirmed): CalEvents is the full right column; Next Steps + Reference sit in a right-side drawer (◀ edge tab).

## Capture and scheduling

“Add to today” means an all-day item on today's Google Calendar (America/Los_Angeles), unless a specific time is supplied. Calendar is the single capture landing place. Consult Reference and Urgency when planning.

Proposed steps to refine:
1. Gather today's intended tasks onto the calendar/day list.
2. Organize by urgency.
3. Place tasks into estimated timeline slots/work batches.

Keep every intended task visible in the upper all-day-style overview, even after assigning a specific time below. Use linked views of the same task/event, avoiding duplicate all-day calendar events. Show estimated placement, the next task/batch and following batches; allow adjustment. Distinguish planned estimates from actual timer effort and share stable identities with Blocks / Timer App.

Current standing Big Three / ranked Waiting rules remain authoritative. Stretch is set aside; older daily categories are historical.

## Deferred past-task review backlog

Initial proposed scope: October 1, 2026 through yesterday, especially explicitly yellow incomplete task events. Include timed and all-day tasks, retaining original IDs, dates and details. A past date or absent completion tick means needs review, not proof no work occurred.

Review choices: keep/replan, remove, or mark complete after user review. Exclude Graphite/explicit completed markers from incomplete candidates. Preserve real appointments/deadlines. Define ongoing review after the initial cleanup.

The user explicitly deferred backlog implementation, historical collection/cleanup and further investigation during efficiency work. Save requirements only; do not silently move, delete or mark old events complete or claim this queue is implemented.

## Maintenance

Update decisions here and link them from README. Engineering evidence belongs in EFFICIENCY_HANDOFF.md. Keep private event contents and recovery payloads out of GitHub.
