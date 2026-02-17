
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

## Tooling
- 2026-02-17: added Biome 2.2.3 tooling with `biome.json` and npm scripts (`format`, `lint`, `lint:check`, `lint:ci`).
- 2026-02-17: `npm run format` now passes after schema update to Biome 2.3.10; `npm run lint` reports 2 errors (e.g., `noUselessSwitchCase`, `noShadowRestrictedNames`, `noArrayIndexKey`) and 3 warnings/2 infos.
