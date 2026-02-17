# TUI Refinement Verification (Bead 10/10.7)

## What we verified
- `core/live-run-state` tests already cover review-tab auto-switch/restore plus retry/failure marker counters.
- Added Ink helper-level assertions for:
  - notch rendering (`buildAgentNotchLine`),
  - agent title formatting (`formatAgentTitle`) as `<id> · <title>`,
  - responsive iteration strip behavior (`buildIterationStripParts`) across width tiers.
- Added explicit no-regression guard for `[A#]` inline body-prefix pattern by asserting formatted agent titles do not contain `[A\d+]`.

## Cross-platform constraints
- `process.stdout.columns` is terminal-specific; tests and runtime defaults should treat missing width as non-fatal and use conservative defaults.
- Unicode box/line glyphs and middle-dot (`·`) formatting are expected; terminals with legacy code pages can render these imperfectly.
- Narrow width behavior must collapse oldest iteration history and keep context via `Prev:` plus aggregate retry/failure counts.
