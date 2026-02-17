
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
- 2026-02-17: Added shared retry-delay extraction helper in `providers/retry.ts`; providers now consume a single regex + structured-key extraction path to keep retry delays consistent across `claude`, `copilot`, and `codex`.
- 2026-02-17: Captured adapter boundary decision in `docs/provider-adapter-boundary.md`: providers remain thin transport/preview adapters, while parsing/retry/marker logic is shared and test-bound.
- 2026-02-17: Strengthened `ouroboros-6.1` by linking provider boundary policy from `README.md` and documenting explicit good/bad examples in `docs/provider-adapter-boundary.md` so future adapters follow consistent parsing/retry ownership.

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
- 2026-02-17: when closing provider refactor beads, run targeted checks on touched files (e.g., `bunx biome check providers/*.ts`) since repo-wide `doctor` may fail on unrelated pending refactors.
- 2026-02-17: Shared parser extraction bead shows it's safer to keep provider-specific irstStringValue key-order arrays in one module to avoid subtle behavior drift while still deduplicating recursion/parsing logic.
- 2026-02-17: when extracting loop-engine helpers (`ouroboros-3.1`), move small helper blocks wholesale into one new file to avoid leaving partial syntax artifacts.

## TUI Lifecycle
- 2026-02-17: rich TTY mode now routes iteration lifecycle (`START`/`RUN`/`BATCH`/`TOKENS`/pause/retry) through renderer state updates; these lines should no longer be printed as per-iteration stdout spam.
- 2026-02-17: added `core/live-run-state` + `core/loop-engine` test coverage for rich-mode suppression and non-TTY legacy fallback behavior.
- 2026-02-17: staged parallel spawn refactor must keep readiness release names consistent; a stray `releaseReadinessOnce()` reference (instead of `releasePickedReadinessOnce()`) caused loop termination as agents finished.

## Cross-platform Path Defaults
- 2026-02-17: Keep home resolution explicit: prefer HOME, then Windows USERPROFILE, then HOMEDRIVE+HOMEPATH, then homedir().
- 2026-02-17: Added core/paths.test.ts assertions for platform-agnostic home/log path construction with non-deterministic timestamp handled by format checks only.
- 2026-02-17: Avoid parallel `bd close` writes; concurrent JSONL flushes can race on Windows (`issues.jsonl.tmp` rename access denied). Use sequential close commands.
