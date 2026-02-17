# Rich TUI Iteration Lifecycle

## Design and behavior
- Keep lifecycle telemetry (`START`, `RUN`, `BATCH`, `TOKENS`, `PAUSE`, `RETRY`, picked beads, stop marker) in the same live state model as the existing panel renderers.
- In TTY rich mode (`showRaw = false`), do not emit per-iteration ad-hoc lifecycle lines to stdout.
- Render lifecycle, run context, and iteration summary through the `IterationLiveRenderer` state contract instead of one-off `console.log` entries.
- Keep legacy, line-by-line output for non-TTY and `--show-raw` runs so CI/scripts keep readable behavior.

## Implementation details
- Added loop lifecycle fields to `core/live-run-state.ts` (`runContext`, `lastIterationSummary`, `loopPhase`, `loopNotice`, pause/retry state).
- Extended renderer contract with: `setRunContext`, `setIterationSummary`, `setLoopNotice`, `setPauseState`, `setRetryState`, `setLoopPhase`, plus existing `setIteration`/feed APIs.
- Reworked `core/loop-engine.ts` to create one renderer per loop session and update state per iteration.
- `runIteration` now suppresses legacy lifecycle row logs in rich mode and always pushes equivalent state updates.
- Added `core/loop-engine.rich-mode.test.ts` coverage for rich-mode suppression and non-TTY fallback row behavior.
- Added `.beads/issues.jsonl` signature polling in `core/loop-controller.ts` so rich-mode BEADS snapshot updates mid-iteration when bead state changes.
- Empty agent state no longer renders `[EMPTY] no event yet` placeholder rows; cards stay compact until actual preview events appear.
- BEADS snapshot loading is now JSONL-first across all platforms (`.beads/issues.jsonl`), with `bd list` used only as fallback when JSONL is unavailable.

## Pitfalls and mitigations
- `InkLiveRunRenderer` can be unavailable at runtime; fallback renderer uses the same state contract so lifecycle behavior still stays replacement-first when not TTY.
- Non-TTY fallback still prints lifecycle rows for backward compatibility; no contract change for CLI output consumers.
- `loopPhase` includes terminal states (`completed`, `failed`, `stopped`) to keep header tone and transitions stable for consumers.
- Refresh loop watches file signature (`size:mtimeMs`) and only reloads snapshots when it changes to avoid continuous `bd list` calls.
