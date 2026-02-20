# Review loop hardening in ouroboros (2026-02-17)

Purpose:
- document hardened failure handling in slot review/fix loop
- capture task snapshot trust model

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

## Task snapshot validity

Policy:
- snapshot input comes from `tsq list --json`.
- command execution is timeout-bounded to avoid blocking loop startup and prolonged lock contention.
- no-task stop-marker suppression requires an available snapshot (`available: true`).

Observed implementation:
- `loadBeadsSnapshot` returns `available: false` when `tsq` exits non-zero or times out and includes an error message.
- `shouldIgnoreStopMarkerForNoBeads` returns `false` unless `beadsSnapshot.available === true`.
