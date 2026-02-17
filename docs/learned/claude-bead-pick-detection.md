# Claude bead pick detection in staged launch (2026-02-17)

## Symptom

With Claude provider and parallel staged launch, A1 can show active events but remain `no bead picked`, so A2/A3 stay queued until A1 exits.

## Root cause

- Stream-time pick detection only checked filtered preview entries (`assistant/tool/reasoning/error`).
- Claude bead IDs may appear in raw JSON lines or `message`-kind payloads that are not used for live rendering.
- Matching set included all bead IDs (including closed), which could cause false positives.
- Bead id regex did not handle dotted IDs like `ouroboros-7.1`.

## Fix

- Detect bead IDs from raw stdout line before preview filtering.
- Keep live-render filtering unchanged; detection now runs independently.
- Match against `remainingIssues` IDs only.
- Update bead id extraction regex to support dotted IDs.

## Regression tests

- `core/iteration-execution.test.ts`: staged launch advances when remaining bead id is only in raw line.
- `core/iteration-execution.test.ts`: closed bead IDs do not trigger staged-launch readiness.
- `core/beads.test.ts`: dotted bead IDs are recognized.
