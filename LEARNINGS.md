
## Architecture
- Keep strict `core` vs `providers` boundaries; providers stay thin transport/preview adapters.
- Share parsing/retry/marker logic in common modules; avoid provider-specific forks.
- Prefer interface/adapter composition over provider-specific branching.
- Keep UI modules separate from runtime/loop core to contain churn and simplify testing.

## Config and Defaults
- Preserve deterministic precedence: `CLI > project > global > defaults`.
- Use shallow, typed config merges; avoid ambiguous deep-merge behavior.
- Optional integrations/config sources must degrade gracefully when local files/tools are missing.
- Keep default `logDir` computed from home + project + timestamp, with override precedence `--log-dir > config > computed`.

## Cross-Platform Paths
- Keep home resolution explicit across Windows, Linux, and macOS.
- On Windows, resolve home in order: `$HOME`, `USERPROFILE`, `HOMEDRIVE`+`HOMEPATH`, then `homedir()`.
- Cover path construction with platform-agnostic tests that assert format, not exact timestamps.

## Runtime and TUI
- Use staged worker launch for heavy loops; avoid eager all-at-once startup.
- Readiness gates must tolerate early worker exit to prevent deadlocks.
- Keep render throttling and log throttling as separate controls.
- Use deterministic, stable list-row keys (slot identity), never content-derived placeholders or array index keys.
- Route rich TTY lifecycle updates through renderer state and preserve non-TTY fallback behavior.
- Claude print mode with `--output-format stream-json` now requires `--verbose`; keep both flags together in provider args.
- Bead pick detection should scan raw stream lines and match only remaining bead IDs; preview-only parsing can miss Claude IDs and delay staged launches.
- Bead ID parsing must accept dotted IDs (for example `ouroboros-7.1`) to avoid missing sub-bead picks.
- Claude stream-json tool calls can arrive as top-level `type: "assistant"` with nested `message.content[].type: "tool_use"`; classify by nested content type before top-level event type.
- Prefer explicit bead-pick markers (`Updated issue: <id>` or `bd update <id>`) over generic id mentions; multi-id dumps should be treated as ambiguous.
- Rich-mode empty agent cards are cleaner without `[EMPTY] no event yet` filler rows; show header only until real events arrive.
- BEADS snapshot loading now uses `bd --readonly list --json --all --limit 0 --no-pager` with a 5s timeout; fallback to non-readonly list only when `--readonly` is unsupported.

## Process
- Add regression tests for bug fixes when scope permits.
- When repo-wide checks are blocked by unrelated failures, run targeted checks on touched files and record scope.
- On Windows, run `bd close` sequentially to avoid `issues.jsonl.tmp` rename races.
- `bd create` cannot combine `--id` with `--parent`; for explicit dotted IDs (for example `ouroboros-10.3`), create with `--id` and attach parent via `--deps parent-child:<parent-id>`.
- `.ai_agents/` is git-ignored in this repo; keep canonical default prompt text in tracked docs (`docs/prompts/*.default.md`) and treat `.ai_agents/prompts/*` as runtime/local copies.
- Ensure mixed-reviewer provider paths are enforced at CLI/runtime seam, not ad-hoc in tests: reviewer adapter/model/command should be resolved once in loop-engine before loop execution, then threaded through controller/slot review loop.
- Prefer small, non-destructive local bootstrap commands (`--init-*`) over destructive overwrite behavior; add explicit `--force-*` flags only when required and document clearly.
- 2026-02-17: Implemented Ink TUI multi-pane shell for bead ouroboros-13.3 with focused pane navigation (agents/history), iteration list drilldown, and responsive stacked fallback.

- 2026-02-17: In top-level mode, loadBeadsSnapshot now applies --parent <topLevelBeadId> on both readonly and fallback bd list calls so remaining counts are scoped to direct child beads.
- Bead mode semantics are mode-driven: top-level scope and snapshot loading are applied first, while provider stop-marker handling still controls continuation in auto mode.
- 2026-02-17: For `ouroboros-11`, added config-string normalization so blank/whitespace reviewer settings are treated as unset; added CLI/config regression tests to preserve reviewer provider/model fallback and prevent mixed-provider regressions from empty overrides.
- 2026-02-17: Ink TUI full-screen parity improved by adding explicit `parallel-overview`/`parallel-detail`/`merge-progress`/`conflict-resolution` views plus `w`/`m`/`Esc`/`a`/`r`/`s` routing; keep view bounds synced to live agent count/iteration max to avoid stale selection indices.
- 2026-02-17: For true full-screen terminal UX, replace stacked boxes with one persistent shell frame (`status strip` + `split panes` + `shortcut footer`) and window left-pane rows around selection to prevent overflow in short terminals.
- 2026-02-17: Full-screen Ink shell can flicker if forced redraw runs at 120ms; use ~1s renderer tick and keep frame height under terminal rows (`rows - 1`) to avoid constant repaint flashing.
- 2026-02-18: Carry startup summary metadata in `RunContext` (provider/project/model/paths/limits/yolo) so rich and ANSI TUI surfaces can show stable loop context without relying on pre-run console-only headers.
