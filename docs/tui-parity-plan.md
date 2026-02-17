# TUI parity plan vs `ralph-tui` RunApp + TUI Guide

Date: 2026-02-17

## Scope
- Reference: `C:\Users\adity\Projects\references\ralph-tui\src\tui\components\RunApp.tsx`,
  `C:\Users\adity\Projects\references\ralph-tui\website\content\docs\parallel\tui-guide.mdx`, and related
  components (`ParallelProgressView.tsx`, `IterationHistoryView.tsx`, `IterationDetailView.tsx`, `ConflictResolutionPanel.tsx`, `TabBar.tsx`).
- Ouroboros current: `tui/tui.tsx`, `core/terminal-ui.ts`, `core/live-run-state.ts`, `core/loop-controller.ts`.

## Explicit non-goal (defer this phase)
- Remote tabs and instance management (`TabBar`, `RemoteConfigView`, `RemoteManagementOverlay`, `instance-tabs` model in `RunApp.tsx` and reference `TabBar.tsx`) are out of scope for this parity phase.
- Tracked as not-in-scope in this phase so we can ship terminal clarity first.

## Core parity (must-have)
| Area | Reference behavior | Ouroboros current | Gap | Status / bead mapping |
| --- | --- | --- | --- | --- |
| Live status shell | RunApp prints loop header and iteration context; cards/panels render agent/task activity (`RunApp.tsx`, `Header.tsx`, `Footer.tsx`) | `tui/tui.tsx` renders run header + per-slot cards + agent summaries (`renderHeader`, `renderAgentCard`) and `core/terminal-ui.ts` mirrors ANSI | Keep coherent, low-noise, cross-platform baseline and align both renderers | Done (10.1-10.5); 10.6 still open for ANSI fallback polish |
| Agent identity and card structure | Per-slot identity and task context in the reference panels (`LeftPanel.tsx`, parallel views use worker identifiers) | Ouroboros cards use `Agent <id>` notch and `<bead id> · <title>` title formatting (`buildAgentNotchLine`, `formatAgentTitle`) | Preserve readability for quick slot scan and status parsing in compact terminals | Done (`ouroboros-10.3` and `10.4`) |
| Dev/Review split | Reference has dedicated review phases and status detail in dedicated panels (`IterationStatus`, fix/review flows in run loop) | Ouroboros has Dev/Review selector per-agent and review auto-switch in state + renderer (`setAgentReviewPhase`, `agentActiveTab`, `renderAgentCard`) | No separate external panel needed; this is already in-place and complete in 10.x path | Done (`ouroboros-10.4`) |
| Iteration strip + retry/failure context | Reference merge/history overlays encode run progress over time and failure events in list views | Ouroboros `buildIterationStripParts` / `buildIterationStrip` produce compact modes with R/F counts and markers | Keep semantics stable; complete for parity baseline | Done (`ouroboros-10.5`) |

## Enhanced parity (next)
| Area | Reference behavior | Ouroboros current | Gap | Target bead |
| --- | --- | --- | --- | --- |
| View state machine | RunApp supports tasks/iterations/iteration-detail/parallel-views (`ViewMode` type and render branches in `RunApp.tsx`) | Ouroboros has single loop-oriented render mode (`InkLiveRunRenderer` + `TerminalLiveRunRenderer`) without explicit user view modes | Add explicit view-state model and keyboard routing for tasks/iterations/drilldown/parallel views | `ouroboros-13.2` |
| Iteration history list | `IterationHistoryView.tsx` shows per-iteration outcomes, pending entries, and selection flow | Ouroboros currently has only compact last-iteration summary and no global iteration list component | Build an iteration list model and navigation model tied to loop iteration state | `ouroboros-13.2` |
| Iteration detail drilldown | `IterationDetailView.tsx` exposes task/agent context, timeline, output, and status metadata | Ouroboros currently has aggregate summaries and live row preview only | Add read-only drilldown to show current/rerun context and prior output slice | `ouroboros-13.3` |
| Parallel worker panel | `ParallelProgressView.tsx`, `WorkerDetailView.tsx`, `MergeProgressView.tsx` expose worker progress, active task details, and merge progress | Ouroboros currently has no worker/merge entities in runtime or renderer | Build worker/merge domain mapping and render states from loop runtime snapshot | `ouroboros-13.3` |
| Conflict resolution overlay | `ConflictResolutionPanel.tsx` with file-level states, retry/skip controls, and live AI resolution feedback | Ouroboros has no conflict-resolution pipeline nor modal state model in renderer | Add conflict overlay and callbacks for failure/skip/retry actions in enhanced TUI | `ouroboros-13.4` |
| Interaction affordances | Reference `tui-guide.mdx` lists shortcut map (`w`, `m`, arrows, Enter, `Esc`, `?`) and modal workflows | Ouroboros currently has no keyboard router in renderer; controls are loop-level only | Add parser-safe keyboard router and help/overlay text model | `ouroboros-13.2` |

## Advanced parity (later)
| Area | Reference behavior | Ouroboros current | Gap | Target bead |
| --- | --- | --- | --- | --- |
| Remote tabs & instance management | `TabBar.tsx` supports connected/connecting/reconnecting status, alias-based remote metrics, numeric tab switch | No reference remote state model in Ouroboros loop/runtime stack | Deferred as explicit non-goal for this phase | `ouroboros-13.7` (revisit scope) |
| Detailed task/dependency metadata | Reference iter detail surfaces dependency links, sandbox mode, execution model, timeline, output files | Ouroboros currently does not persist/display execution metadata side panel | Deferred until iteration detail surfaces enough runtime artifacts | `ouroboros-13.3` and `13.7` |

## Mapping of existing `ouroboros-10.x` work into this parity roadmap
| Bead | Contribution |
| --- | --- |
| `ouroboros-10.2` | Added per-agent tab state and retry/failure timeline foundation |
| `ouroboros-10.3` | Added notch header and canonical `<id> · <title>` agent title formatting |
| `ouroboros-10.4` | Added Dev/Review card tabs + per-phase selector integration |
| `ouroboros-10.5` | Added responsive iteration strip + retry/failure chips |
| `ouroboros-10.6` | Remaining in-scope fallback simplification for ANSI card/title/review/summary behavior |

## Implementation order (this phase)
1. `ouroboros-10.6`: finish coherent ANSI simplified fallback and no-op chrome parity.
2. `ouroboros-13.1`: maintain this matrix as source of truth and keep updated as execution evolves.
3. `ouroboros-13.2`: view-state + key routing.
4. `ouroboros-13.3`: worker/iteration detail plumbing in multi-view loop context.
5. `ouroboros-13.4`: conflict/merge operational overlays.
6. `ouroboros-13.5`+: UX overlays/theme once interaction is stable.

## Prioritized open-gap matrix (top 5)
- P0 | Keyboard interaction model (`ouroboros-13.2`)
  - Open gap: no parser-safe view-aware key router for task/iteration/parallel panes.
  - Acceptance check: each reference shortcut path (`Tab`, `w`, `m`, `a`, `Enter`, `Esc`, `?`) has deterministic handling and no uncaught key exceptions in interactive mode.
  - Measurable outcome: visible help text and one deterministic route per mode.
- P0 | View-state model (`ouroboros-13.2`)
  - Open gap: no first-class, user-selectable view states beyond live stream + compact strip.
  - Acceptance check: user can switch between tasks, iteration list, and iteration detail from keyboard and return to live mode without lost iteration cursor.
- P1 | Iteration history pane (`ouroboros-13.3`)
  - Open gap: missing persistent iteration list and pending/failure entries in list mode.
  - Acceptance check: backlog and failure markers are visible in a list model and can be cursor-selected.
- P1 | Iteration detail drilldown (`ouroboros-13.3`)
  - Open gap: no per-iteration timeline or output slice in detail view.
  - Acceptance check: selected history entry opens detail view with deterministic fields (status, timing, summary, failure reason).
- P2 | Conflict merge/worker conflict surface (`ouroboros-13.4`)
  - Open gap: no conflict-resolution overlay or retry/skip actions for failed units.
  - Acceptance check: failure entries can open a conflict/merge surface and expose user actions as enabled/disabled state only by data availability.

## Implementation notes (current session)

- `ouroboros-13.3` now has Ink TUI multi-pane shell behavior with left live/task panel and right iteration history panel.
- Focused pane navigation is explicit (`Tab` / `←` / `→`), with iteration detail drilldown via `Enter` from history focus.
