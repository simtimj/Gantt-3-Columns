# Repeatable Gantt timing comparisons

Use a bounded Speed Log range read that includes row 1, then keep its JSON
`values` object or the values array locally. The file contains activity times
and diagnostics; keep real exports and generated summaries out of the public
repository. The tool does not access Google or create new measurements.

```sh
node tools/speed-summary.mjs speed-log.json
node tools/speed-summary-test.mjs
```

The first command prints a JSON summary. No raw task content is needed or
produced by the app's timing instrumentation. Invalid JSON errors do not echo
input content. The second command uses synthetic fixtures only.

## Rules used by the summary

- Group by page/server release, page/server code-build labels, viewport width
  and visibility. `matched` requires known, equal page/server releases **and**
  known, equal code-build labels. Backend-only and unknown records stay separate.
  A viewport is context, not proof of a specific device model or network.
- For one `reportId`, discard only repeated identical measurement payloads.
  Ignore logging time and batched save samples when comparing those payloads.
  If an ID has conflicting payloads, flag the conflict and retain each distinct
  payload. Different report IDs remain separate, even with identical durations.
- Old reports without IDs are never silently removed. Identical legacy
  fingerprints are flagged as possible duplicates, with the records retained.
  A sensitivity calculation may collapse them separately, but must state that
  assumption. It cannot establish which older reports were actually duplicates.
- Use the average of both middle values for an even-sized median. Each metric
  includes its own `n`; missing, nonnumeric or negative optional timing values
  do not count. Malformed rows are listed by their source row number.
- Keep server execution, browser RPC, immediate draw and application time
  separate. Nested server stages overlap their parents and are never summed.
  Missing lock-stage samples mean the stage was not recorded, not a measured
  zero-millisecond lock wait. The helper does not summarize individual save
  acknowledgement samples; those have their own `sampleId` identity.

## Comparing a new session

1. Refresh once on the intended device and keep the app visible for about five
   minutes. Avoid repeated refreshes during the routine-import observation.
2. Read the new records; identify the intended matched release/build and viewport
   group. Record the observation window and metric sample counts.
3. Retain first-load/catch-up records in the default summary. If a pass contains
   deployment intake or genuine changed-source writes, describe it separately.
   Any filtered routine subset must be explicit; do not silently discard slow
   samples or automatically infer unchanged source from a low duration.
4. Compare with the original baseline preserved in the private efficiency audit
   and with a clearly named earlier checkpoint. The rolling log does not retain
   the entire original baseline, so do not replace that baseline with its
   current unknown-build group.
5. State measurement limits: small samples, changing features/data, network and
   device context, unknown identities and any duplicate uncertainty. An arithmetic
   percentage difference is not proof that an optimization caused the change.

No user task, status, source ownership or production save behavior is changed by
this helper. Phone/cross-device recovery and live rollback checks remain separate.
