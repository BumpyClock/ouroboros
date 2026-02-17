
## Architecture and Extensibility
- Prefer interface/adapter boundaries (`core` vs `providers`) over provider-specific branching.
- Keep config precedence explicit and stable: `CLI > project > global > defaults`.
- Keep schemas flat + typed where possible to reduce ambiguous merges.
- Design optional integrations with graceful fallback when local data/tooling is absent.

## Concurrency and Runtime Behavior
- Avoid eager all-at-once worker startup for heavy loops; use staged launch gates.
- Readiness gates must tolerate early process exit to avoid deadlocks.
- Keep render throttling and log throttling separate concerns.

## TUI / React Rendering
- Use stable identity keys for list rows; never key by repeated placeholder text.
- Keep lifecycle/status messages in per-agent UI sections; avoid noisy global logs.
- Preserve non-TTY / fallback renderer behavior when adding richer TUI paths.
- Keep UI modules separate from runtime core to contain churn and simplify testing.
- Ink preview rows should key by deterministic slot (`agentId + rowIndex`), not content, to avoid duplicate `EMPTY` row keys.

## Config Loading
- Implemented TOML config loading in `core/config.ts` as global `~/.ouroboros/config.toml` + project `./.ouroboros/config.toml`.
- Added loader-level shallow merge for runtime config and switched CLI to use merged config precedence (`CLI > project > global`).
- Used explicit home resolution for Windows via `%HOME%`/`$HOME` fallback to `homedir()`.

## Provider Expansion
- Added provider adapters for `claude` and `copilot` and registered both in provider registry.
- Extended provider adapter contract to receive full prompt so CLIs with `--prompt`/`-p` args work without stdin-only assumptions.
- Standardized `yolo` mapping per provider (`codex --yolo`, `claude --permission-mode bypassPermissions`, `copilot --allow-all`).

## Build/Packaging
- Added install scripts for Bun standalone compile (`scripts/install-compiled.sh`, `scripts/install-compiled.ps1`).
- In this WSL session, `bun build --compile` produced zero-filled outputs (`file: data`); scripts now validate binary headers and fail fast with actionable error.

## Logging
- Default `logDir` now computed at runtime as `~/.ouroborus/logs/<project_dir>/<date-time>` when not set via CLI/TOML.
- Keeps explicit override precedence: `--log-dir` > `config.toml logDir` > computed default.
- Home resolution for default log dir is platform-aware: on Windows prefer `$HOME`, fallback `homedir()`; on Linux/macOS use `homedir()`.

## Tooling
- 2026-02-17: added Biome 2.2.3 tooling with `biome.json` and npm scripts (`format`, `lint`, `lint:check`, `lint:ci`).
- 2026-02-17: `npm run format` now passes after schema update to Biome 2.3.10; `npm run lint` reports 2 errors (e.g., `noUselessSwitchCase`, `noShadowRestrictedNames`, `noArrayIndexKey`) and 3 warnings/2 infos.

## Beads Workflow
- 2026-02-17: for large refactor beads, use `parent-child` plus `blocks` edges so parents drop out of `bd ready` and only smallest actionable tasks remain.
- 2026-02-17: when bulk-creating beads via long shell scripts, verify for partial completion/timeouts and dedupe accidental duplicates with `bd duplicate`.
