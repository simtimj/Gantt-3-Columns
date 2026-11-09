# Focus recovery and rollback procedure

This procedure covers Keep In Mind / Focus Script Properties only. It does not
cover Days, Reference text, browser recovery copies, Plan or either timer store.
The offline drill uses synthetic data; a live backup and live restore are still
unverified.

## Extract a saved list offline

1. An authenticated operator obtains a **consistent** Script Properties snapshot
   while cooperating Focus writers are excluded by the app's script lock. Keep
   the raw snapshot private. This tool does not obtain the snapshot or coordinate
   direct external writers. Do not paste complete properties into logs, chat or
   a public repository: unrelated properties may be sensitive. A local export
   containing only `focusDataHead`, `focusV2_*`, `focusData`, `focusDataN` and
   `focusData_*` is sufficient. Keep keys and string values unchanged.
2. From the repository root, run:

   ```sh
   node tools/focus-recovery.mjs properties.json recovered-focus.json
   ```

   The input is a flat JSON object of property names to string values. Output is
   the exact selected Focus JSON plus a newline. The tool never calls Google,
   changes the input or overwrites an existing output. New output permissions
   are owner read/write (`0600`). The output contains personal task content;
   keep it private too.
3. For generation storage, the extractor follows `focusDataHead`, reads only
   that generation's chunks, and verifies the stored JavaScript string length
   and the app's MD5 prefix over UTF-8 bytes before parsing. This is the existing
   storage corruption check, not cryptographic authentication. Uncommitted or
   old generations are ignored. An invalid selected head/chunk fails, even if
   stale legacy data is present.
4. Legacy single-property and numbered-chunk lists remain readable. A snapshot
   with no selected Focus data fails instead of producing a misleading empty
   backup. Explicit saved empty lists remain valid. Successful extraction proves
   that this snapshot is readable; it does not prove it is the newest live list.

## Roll back code without losing access

- After the first generation-format save, retain a compatible generation reader
  and writer. An old `focusData`-only reader cannot read the current selected list.
- Preserve the snapshot, extracted JSON and source revision together before a
  live rollback. Verify the extracted list against the current list while the
  snapshot is still current. Record independent task/category IDs and status;
  title equality does not establish identity.
- Test the intended rollback build against a copied property store first. Read
  the snapshot and save/reload a disposable copy, including emoji and non-English
  text, stale edits and interrupted writes. Retain the real original snapshot.
- Review a proposed restore against current live data, then use the app's
  revision-aware Focus save/conflict flow. A valid old backup is not authority
  to replace newer edits. This extractor supplies no automatic restore or
  property-deletion command. Converting to an old storage format requires a
  separately verified migration; do not delete the generation head to reveal an
  old legacy copy.

## Repeatable offline drill

```sh
node tools/focus-storage-test.mjs
```

The drill runs the real `writeFocus_` and `cellHash_` functions from `Code.gs`
against a mock property service. Node provides MD5 bytes in the signed-byte form
Apps Script uses. An independent extractor then reads the written snapshot.
Checks cover multi-chunk Unicode data, stale legacy and orphan generations,
corrupt/missing selected chunks, legacy formats, missing-data refusal, private
output permissions, existing-output protection and failure without output.
All data in this drill is synthetic. Actual phone recovery, a live snapshot and
a live restoration remain open confirmations.
