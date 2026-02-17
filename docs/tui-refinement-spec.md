# TUI Refinement Spec (Bead 10.1)

## Overview
- Scope: Ink live TUI card shell refinement before implementation beads `ouroboros-10.2` to `ouroboros-10.5`.
- Goal: clearer per-agent context with:
  - top-notch label `Agent N`
  - card title `<bead id> · <bead title>`
  - `Dev` / `Review` tabs with review-phase auto-switch
  - bottom iteration strip with responsive collapse and retry/failure markers
- Design direction: utility + function, dense, minimal color, no decorative motion.

## Inputs and Constraints
- Platform: terminal (Ink), cross-platform width behavior by terminal columns (not CSS px).
- Existing runtime states:
  - implement stream/event rows
  - review phases `reviewing` and `fixing`
  - agent status badges `WAIT`, `QUEUED`, `SPAWN`, `EVENTS`, `REVIEW`, `FIX`
- No behavioral drift from non-TTY output; this spec is TTY-rich view only.

## Breakpoints (Concrete)
- `>= 120 cols` (desktop): full card chrome + full iteration strip chips.
- `100-119 cols` (compact desktop): reduced chip count, still per-chip labels.
- `80-99 cols` (narrow): collapse previous chips into `Prev: N`; keep current + near-future chips.
- `< 80 cols` (very narrow): single compact strip row; no individual historical chips.

## Layout Contract

```text
>=120 cols (desktop)
+----------------------------------------------------------------------------------+
|   [notch: Agent 1]                                                               |
| [A1] ouroboros-10.2 · State contract for tabs                        [EVENTS]    |
| [Dev] [Review]                                                                  |
|   [assistant] ...                                                                |
|   [tool] ...                                                                     |
|----------------------------------------------------------------------------------|
| Iter: [07][08][09][10*][11][12]   Retry:2   Failed:1                            |
+----------------------------------------------------------------------------------+

80-99 cols (narrow)
+---------------------------------------------------------------+
| [Agent 1]                                                     |
| [A1] ouroboros-10.2 · State contract for tabs      [REVIEW]  |
| [Dev] [Review*]                                               |
|   [review] contract check...                                  |
|---------------------------------------------------------------|
| Prev: 9   [10*] [11]   R2   F1                                |
+---------------------------------------------------------------+
```

## Card Header and Notch Rules

### Notch
- Position: top border interruption at left side of card border.
- Copy: exactly `Agent <slotNumber>`.
- Tone: muted neutral; never semantic color-coded.

### Title Copy
- Canonical title format: `<bead id> · <bead title>`.
- If no bead picked: `no bead picked` (existing fallback stays valid).
- Separator is middle dot with spaces: ` · `.

### Truncation Rules
- Compute `headerTextMax = cardInnerWidth - statusBadgeWidth - fixedPadding`.
- Truncate title first; preserve full bead id whenever possible.
- Truncation sequence:
  1. full `<id> · <title>` if fit
  2. `<id> · <title...>` with trailing ellipsis
  3. if still too long, clamp id to `<id...>` then keep separator only when space allows
- Never truncate from the left; keep leading bead identity stable for scanability.

## Dev / Review Tab Contract

### Tab Labels
- Exactly two tabs: `Dev`, `Review`.
- `Dev` contains implement/fix stream rows.
- `Review` contains reviewer verdict context and follow-up prompt summary.

### Per-Agent State Table

| Runtime state | Active badge | Auto-selected tab | Tab behavior |
| --- | --- | --- | --- |
| implementing / queued / spawn / waiting | `EVENTS`/`WAIT`/`QUEUED`/`SPAWN` | `Dev` | show latest implement stream rows |
| reviewing | `REVIEW` | `Review` | switch immediately on phase enter |
| fixing | `FIX` | `Review` | stay on `Review`; show attempt context (`fix attempt N`) |
| review cleared after pass/fail | `EVENTS` or terminal badge | restore previous manual tab | if no previous manual choice, default `Dev` |

### Auto-switch Rules
- Trigger: `setAgentReviewPhase(... reviewing|fixing ...)` enters review mode.
- Effect: force active tab to `Review`.
- Exit trigger: `clearAgentReviewPhase`.
- Exit effect: restore last user-selected tab from before review auto-switch.
- Manual user tab changes are sticky outside active review phase.

## Iteration Strip Contract

### Data Semantics
- Each iteration chip maps to one iteration index.
- Current iteration chip is highlighted (`*` in ASCII examples).
- Retry and failure markers represent aggregate counts in visible loop session.

### Strip Behavior by Width
- `>=120 cols`:
  - Show up to 7 chips centered on current iteration (`current-3 ... current+3` bounded).
  - Show text markers `Retry:<n>` and `Failed:<n>`.
- `100-119 cols`:
  - Show up to 5 chips (`current-2 ... current+2`).
  - Markers use compact copy `R<n>` and `F<n>`.
- `80-99 cols`:
  - Collapse all previous hidden chips into `Prev: <count>`.
  - Keep current chip plus next up to 2 chips.
  - Keep compact markers `R<n>` and `F<n>`.
- `<80 cols`:
  - Single text row: `Iter <current>/<max> | Prev:<count> | R<n> | F<n>`.
  - No individual historical chips rendered.

## Motion and Accessibility
- Motion scope: only tab highlight transition and strip collapse/expand transition.
- Do not animate high-frequency preview row updates.
- Timing/easing:
  - tab switch: `150ms ease-out`
  - strip collapse/expand: `200ms ease-in-out`
- No layout shift:
  - reserve fixed header/tab/strip row heights per card state.
  - use tabular numeric alignment for iteration numbers/counts.
- Reduced motion:
  - if reduced motion enabled, disable transitions (`0ms`) and perform immediate state swap.
- Accessibility in terminal context:
  - badge text (`REVIEW`, `FIX`, `R`, `F`) must carry meaning without relying on color.
  - truncation always keeps bead id prefix when feasible for disambiguation.

## Interaction model and state transitions

`tui/tui.tsx` drives these transitions through `transitionTuiInteractionState` and view state.

### Keyboard contract

| Input | Scope | Effect |
| --- | --- | --- |
| `?` / `h` | global | Toggle help panel |
| `d` | global | Toggle dashboard overlay |
| `Tab` | `tasks` view | Toggle focused pane (`agents` ↔ `iterations`) |
| `←` / `→` | global | Cycle to previous/next view (`tasks` → `iterations` → `iteration-detail` → `reviewer`) |
| `1`/`2`/`3`/`4` | global | Jump to `tasks` / `iterations` / `iteration-detail` / `reviewer` |
| `j` `k` `↑` `↓` | focus-aware | Move selected index in focused pane |
| `[` `]` | iteration-pane | Adjust selected iteration cursor |
| `Enter` | iteration-pane + non-detail view | Open `iteration-detail` |

### Deterministic interaction snapshots

- Rendered help strings are centralized in the TUI help text block; changes should update tests that assert this contract.
- Navigation boundaries use clamp logic to avoid underflow/overflow in both agent and iteration selections.
- `reviewer` and `iteration-detail` are stable, deterministic view states and can be exercised with unit transition tests.

### TUI troubleshooting

- If iteration cursor appears frozen, ensure focus is `iterations` (tasks view defaults to `agents` when agents exist).
- If arrow/`jk` keys no-op, the focused pane/view likely clamps at its boundary.
- If `Enter` appears ineffective, ensure the current pane is `iterations` and view is not already `iteration-detail`.
- If help/dashboard text is out of date, update both `docs/tui-refinement-spec.md` and `tests/tui/tui.test.ts`.

## Empty/Error States
- No picked bead: keep header copy `no bead picked`; tabs still render with `Dev` active.
- No reviewer content yet: `Review` tab shows `pending review output`.
- Snapshot unavailable for iteration metadata: strip fallback `Iter <current>/<max>` without retry/failure counts.

## Implementation Notes for Follow-up Beads
- `ouroboros-10.2`: add slot-local active-tab memory + review auto-switch restore contract.
- `ouroboros-10.3`: implement notch and header truncation utility.
- `ouroboros-10.4`: implement tab UI and review/dev content split.
- `ouroboros-10.5`: implement responsive iteration strip with collapse logic.
