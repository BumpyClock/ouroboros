
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

## Process
- Add regression tests for bug fixes when scope permits.
- When repo-wide checks are blocked by unrelated failures, run targeted checks on touched files and record scope.
- On Windows, run `bd close` sequentially to avoid `issues.jsonl.tmp` rename races.
