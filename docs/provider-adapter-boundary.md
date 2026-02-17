# Provider adapter boundary decision

Provider adapters are intentionally thin wrappers over shared parsing and retry utilities.

## Decision

Treat each adapter as transport configuration only:

- command name and CLI arguments (`buildExecArgs`)
- provider-specific preview classification (`previewEntriesFromLine`, `collectMessages`, `extractUsageSummary`)
- user-facing hints (`formatCommandHint`, `displayName`)
- provider defaults (`defaults`)

Keep all shared parsing, retry extraction, and marker detection in shared modules:

- `providers/parsing.ts`
- `providers/retry.ts`
- `providers/types.ts` for the public adapter contract

## Edge-case policy

- Default to shared logic first:
  - `collectRawJsonLines` from `parsing.ts`
  - `extractRetryDelaySeconds` from `retry.ts`
  - `hasStopMarker` from `parsing.ts`
- Custom behavior is allowed only when a provider has proven output semantics that cannot be represented by shared helpers.
- If custom behavior is added, add/extend tests near the adapter module to lock behavior.
- If a provider can parse JSON output directly with a stable schema, keep that inside adapter-specific collection only and still keep stop/retry/no-beads shared.
- Retry policy is:
  - first attempt to extract structured retry delay keys (`retry_after_seconds`, `reset_seconds`, `resets_in_seconds`)
  - then parse common prose patterns (`retry`/`try again` + seconds/minutes)

## Decision links

- Decision artifact: `ouroboros-6` (beads)
- Provider refactor and cleanup tasks that adopted this boundary:
  - `ouroboros-1`, `ouroboros-1.1`, `ouroboros-1.2`, `ouroboros-1.3`, `ouroboros-1.4`
  - `ouroboros-6.3`, `ouroboros-6.4`

## Examples

1. Good: adapter only provides transport, then uses shared helpers.
   - `parseIterationOutput` is not duplicated in adapters.
   - `collectRawJsonLines` and `hasStopMarker` are shared.
2. Bad: adapter re-implements stop-marker and retry parsing for every provider.
   - behavior diverges over time and failures become inconsistent.

This keeps provider-specific decisions small, testable, and consistent across Codex, Claude, and Copilot.
