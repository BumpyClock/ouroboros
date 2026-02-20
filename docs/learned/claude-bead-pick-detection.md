# Claude task-pick detection in staged launch (2026-02-17; legacy bead naming)

## Symptom

With Claude provider and parallel staged launch, A1 can show active events but remain `no task picked`, so A2/A3 stay queued until A1 exits.

## Root cause

- Stream-time pick detection only checked filtered preview entries (`assistant/tool/reasoning/error`).
- Claude task IDs may appear in raw JSON lines or `message`-kind payloads that are not used for live rendering.
- Matching set included all task IDs (including closed), which could cause false positives.
- Task-id regex did not handle dotted IDs like `ouroboros-7.1`.
- Generic id matching on broad tool dumps (`bd list` / `tsq list` output) could lock onto a parent task before explicit pick/update happened.

## Fix

- Detect task IDs from raw stdout line before preview filtering.
- Keep live-render filtering unchanged; detection now runs independently.
- Match against `remainingIssues` IDs only.
- Update task-id extraction regex to support dotted IDs.
- Prefer explicit pick signals (`Updated task: <id>`, `tsq update <id>`) and keep legacy (`Updated issue: <id>`, `bd update <id>`) compatibility.
- Treat generic multi-id text as ambiguous and ignore it unless exactly one known task id is present.

## Regression tests

- `core/iteration-execution.test.ts`: staged launch advances when remaining task id is only in raw line.
- `core/iteration-execution.test.ts`: closed task IDs do not trigger staged-launch readiness.
- `core/beads.test.ts`: dotted task IDs are recognized.
- `core/beads.test.ts`: explicit `Updated task` / `tsq update` id is preferred, with legacy command coverage retained.
- `core/beads.test.ts`: ambiguous multi-id text does not pick a task.
