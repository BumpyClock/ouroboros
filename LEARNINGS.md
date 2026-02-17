
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
- Reverted BEADS snapshot loading to `bd list --json --all --limit 0`; do not read `.beads/issues.jsonl` directly in runtime path.

## Process
- Add regression tests for bug fixes when scope permits.
- When repo-wide checks are blocked by unrelated failures, run targeted checks on touched files and record scope.
- On Windows, run `bd close` sequentially to avoid `issues.jsonl.tmp` rename races.
- `bd create` cannot combine `--id` with `--parent`; for explicit dotted IDs (for example `ouroboros-10.3`), create with `--id` and attach parent via `--deps parent-child:<parent-id>`.
- `.ai_agents/` is git-ignored in this repo; keep canonical default prompt text in tracked docs (`docs/prompts/*.default.md`) and treat `.ai_agents/prompts/*` as runtime/local copies.
- Ensure mixed-reviewer provider paths are enforced at CLI/runtime seam, not ad-hoc in tests: reviewer adapter/model/command should be resolved once in loop-engine before loop execution, then threaded through controller/slot review loop.
- Prefer small, non-destructive local bootstrap commands (`--init-*`) over destructive overwrite behavior; add explicit `--force-*` flags only when required and document clearly.
