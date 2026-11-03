# Reference task archive — implementation plan (2026-11-02)

Status: design only; NOT IMPLEMENTED. Julius approved the behavior below.

## User behavior
- Long-press checkbox on a task within a Reference card and choose **Archive**.
- Save that task and its nested subtasks to the existing Sheet **Archive** tab, removing them from their original Reference card only after successful persistence.
- The existing Reference **Arc** button lists both deleted whole cards and individual archived task trees, with Restore for each.
- Restoring an individual task puts it back into its original Reference card, preserving HTML, task IDs, checked state, urgency, due dates, and subtasks. If its original card is missing, offer a safe fallback instead of silently losing it.
- Archiving must not create a dated Today log, or leave an archived copy in the Reference card. Existing non-Reference archive behavior should remain unchanged.

## Code observations
- `Index.html` hold menu near `showUrgencyPicker` currently calls `setArchived(line,owner,...)` and labels the option `Archive (keep as a log, dated today)`.
- `openArchive()` currently displays only deleted Reference cards, via `getArchive()` / `restoreArchivedItem()`.
- `Code.gs` Archive rows are `ID, ParentID, Type, Title, Content, Expanded, Sort, DeletedAt`; existing rows must remain restorable.

## Implementation safeguards
- Use the script lock and verify the originating Reference card's current content before removing anything; reject stale edits and let client reconcile.
- Preserve the original task subtree as HTML and parent card ID in archive metadata; avoid collision with deleted-card IDs and preserve existing Archive column positions.
- Do not alter `sendRefItem`, three-way merge, `hiddenEditBlocked`, or permanent `data-tid` identity rules.
- Implement and test server archive+restore and client menu/list UI together, including phone long-press, multiple subtasks, folded items, concurrent edits, and failed saves.
- Update README in the implementation commit. Do not merge to main without Julius approval.
