# Ink to OpenTUI Migration Plan (source-backed)

Date: 2026-02-19

## Implementation status
- Completed initial cutover:
  - `ink` dependency removed from `package.json`.
  - Rich renderer now boots through direct OpenTUI primitives in `tui/tui.tsx` (no shim).
  - Runtime wiring uses `OpenTuiLiveRunRenderer` in `core/loop-controller.ts`.
- Remaining follow-up:
  - Remove compatibility naming (`Ink*` helper/test labels) where still present.
  - Consider replacing shim with direct OpenTUI JSX primitives once behavior is fully stabilized.

## Why migrate
- Current rich TUI is tightly coupled to Ink (`tui/tui.tsx` + `InkLiveRunRenderer`) and is now large/churn-heavy.
- OpenTUI gives native terminal primitives, built-in cross-platform binaries, and React/Core/Solid options.

## Source snapshot (web)
- OpenTUI latest release: `v0.1.80` published `2026-02-17`.
- npm latest:
  - `@opentui/core`: `0.1.80` (npm metadata modified `2026-02-17T15:31:40.038Z`)
  - `@opentui/react`: `0.1.80` (npm metadata modified `2026-02-17T15:31:56.078Z`)
- Ink latest: `6.8.0` (npm metadata modified `2026-02-19T07:01:52.011Z`)
- OpenTUI docs confirm React entrypoints: `createCliRenderer` + `createRoot(renderer).render(...)`, keyboard via `useKeyboard`.
- OpenTUI gotcha: do not terminate directly without renderer cleanup; use renderer destroy path.

## Current local integration map
- Ink-only import surface:
  - `tui/tui.tsx:1` imports `{ Box, render, Text, useInput }` from `ink`.
- Rich TUI selection path:
  - `core/loop-controller.ts:80` `createLiveRenderer(...)`
  - `core/loop-controller.ts:93` creates `InkLiveRunRenderer` on TTY rich mode
  - `core/loop-controller.ts:100` fallback to ANSI `LiveRunRenderer` on failure
- Renderer contract consumed by loop runtime:
  - `core/iteration-execution.ts:47`-`62` `IterationLiveRenderer` interface methods
  - Same methods heavily called in `core/iteration-execution.ts` and `core/loop-controller.ts`
- Keyboard/view contract and helper exports under test:
  - `tests/tui/tui.test.ts` (interaction state, view switching, shortcuts, strip behavior, run-context tags)
  - `tests/core/loop-engine.rich-mode.test.ts` (rich-mode lifecycle routing through renderer state)

## Options considered
1. `@opentui/react` (recommended)
- Pros: closest migration path from Ink/React, keeps declarative component model, lowest delivery risk.
- Cons: still React reconciler overhead; OpenTUI React intrinsic JSX + tsconfig requirements.

2. `@opentui/core`
- Pros: max control/perf; avoids React reconciliation.
- Cons: large rewrite now; higher risk/time for parity with existing view-state behavior.

3. `@opentui/solid`
- Pros: fine-grained updates, strong perf profile.
- Cons: introduces new paradigm in codebase; no current Solid usage in repo.

Recommendation: migrate to `@opentui/react` first, keep ANSI fallback renderer unchanged.

## Phased execution plan

### Phase 0: Freeze behavior contract (no UI rewrite yet)
- Keep and expand tests that define current contract:
  - `tests/tui/tui.test.ts`
  - `tests/core/loop-engine.rich-mode.test.ts`
- Add missing tests for quit/cleanup behavior and key routing edge cases.
- Goal: green tests before any renderer swap.

### Phase 1: Isolate framework-agnostic logic
- Split `tui/tui.tsx` into:
  - pure state/transition helpers (already mostly pure)
  - renderer view-model formatters
  - framework binding layer (Ink today, OpenTUI next)
- Keep helper exports stable (`transitionTuiInteractionState`, strip/title builders) to preserve tests.

### Phase 2: Add OpenTUI runtime and minimal shell
- Add deps: `@opentui/core`, `@opentui/react` (same version), keep Ink temporarily.
- Implement `OpenTuiLiveRunRenderer` with same public method contract used by loop runtime.
- Boot path:
  - `createCliRenderer({ exitOnCtrlC: false })`
  - `createRoot(renderer).render(<App />)`
- Keyboard path: replace Ink `useInput` with OpenTUI `useKeyboard`.
- Preserve ANSI fallback (`core/terminal-ui.ts`) as-is.

### Phase 3: Parity pass (view-by-view)
- Port and validate, in this order:
  1. status strip + full-screen frame
  2. tasks + agent cards + run context
  3. iteration list + detail
  4. parallel/merge/conflict views
  5. help/dashboard/toasts
- Keep exact shortcuts and semantics from current tests/spec.

### Phase 4: Swap default renderer and remove Ink
- Update `core/loop-controller.ts` to instantiate OpenTUI renderer instead of Ink renderer.
- Remove Ink dependency and related types/imports.
- Remove/replace any direct process kill/exit fallback in renderer quit path with OpenTUI destroy-first flow.
- Update docs:
  - `README.md` (Ink -> OpenTUI wording)
  - `docs/tui-refinement-spec.md` (renderer implementation notes)
  - `docs/tui-parity-plan.md` if scope/order changes

## Risks and mitigations
- Risk: giant file churn in `tui/tui.tsx`.
  - Mitigation: refactor first into smaller modules before component swap.
- Risk: keyboard behavior drift.
  - Mitigation: enforce existing `tests/tui/tui.test.ts` + add regression cases before swap.
- Risk: terminal cleanup/quit regressions.
  - Mitigation: explicit destroy-path test and manual Ctrl+C/q verification on Windows/macOS/Linux.
- Risk: cross-platform rendering differences (glyphs/width).
  - Mitigation: snapshot checks at multiple terminal widths + narrow-width manual checks.

## Verification checklist
- `bun test tests/tui/tui.test.ts`
- `bun test tests/core/loop-engine.rich-mode.test.ts`
- `bun run doctor`
- manual smoke:
  - TTY rich mode
  - non-TTY / `--show-raw`
  - quit via `q` and Ctrl+C
  - width breakpoints (`>=120`, `100-119`, `80-99`, `<80`)

## Web sources
- https://github.com/anomalyco/opentui/releases/tag/v0.1.80
- https://api.github.com/repos/anomalyco/opentui/releases/latest
- https://www.npmjs.com/package/@opentui/core
- https://www.npmjs.com/package/@opentui/react
- https://www.npmjs.com/package/ink
- https://raw.githubusercontent.com/anomalyco/opentui/main/packages/react/README.md
- https://raw.githubusercontent.com/anomalyco/opentui/main/packages/core/docs/getting-started.md
- https://raw.githubusercontent.com/msmps/create-tui/main/README.md
