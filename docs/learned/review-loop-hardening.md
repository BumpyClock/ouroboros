# Review loop hardening in ouroboros (2026-02-17)

Purpose:
- document hardened failure handling in slot review/fix loop
- capture JSONL bead snapshot trust model

## Non-zero review/fix subprocess behavior

Policy:
- reviewer subprocess exits with non-zero status => hard failure for that slot.
- fixer subprocess exits with non-zero status => hard failure for that slot.
- no JSON contract parsing/extra retries happen after a hard failure exit.
- failure is surfaced as review failure with `failureReason` and marks iteration as failed.

Observed implementation:
- `runSlotReviewLoop` checks reviewer status before parsing verdict.
- if non-zero, returns `passed: false` with `failureReason`.
- after reviewer pass/drift, fixer is executed only for drift.
- if fixer status is non-zero, loop returns immediate hard failure.

## Bead snapshot validity

Policy:
- `.beads/issues.jsonl` is primary snapshot input, but is accepted only when it parses cleanly.
- any malformed line or unparsable payload marks snapshot as unavailable.
- when JSONL is unavailable, loop uses `bd list --json --all --limit 0` as fallback.
- no-bead stop-marker suppression requires an available snapshot (`available: true`), so malformed JSONL cannot mask loop-stop logic.

Observed implementation:
- `loadBeadsSnapshotFromJsonl` returns `available: false` on malformed/partial JSONL and includes an error message.
- `shouldIgnoreStopMarkerForNoBeads` returns `false` unless `beadsSnapshot.available === true`.
