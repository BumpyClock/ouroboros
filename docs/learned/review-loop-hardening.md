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
- snapshot input comes from `bd --readonly list --json --all --limit 0 --no-pager`.
- when `--readonly` is unsupported by local `bd`, loop falls back to `bd list --json --all --limit 0 --no-pager`.
- command execution is timeout-bounded to avoid blocking loop startup and prolonged lock contention.
- no-bead stop-marker suppression requires an available snapshot (`available: true`).

Observed implementation:
- `loadBeadsSnapshot` returns `available: false` when `bd` exits non-zero or times out and includes an error message.
- `shouldIgnoreStopMarkerForNoBeads` returns `false` unless `beadsSnapshot.available === true`.
