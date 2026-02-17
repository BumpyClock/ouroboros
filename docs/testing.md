# Testing

## Convention

Tests live in a top-level `tests/` directory that mirrors the source tree.

```
ouroboros/
  core/
    beads.ts
    json.ts
    paths.ts
    ...
  providers/
    claude.ts
    ...
  tui/
    tui.tsx
    preview-row-key.ts
    ...
  tests/
    core/
      beads.test.ts
      json.test.ts
      paths.test.ts
      prompts.test.ts
      review.test.ts
      live-run-state.test.ts
      iteration-execution.test.ts
      loop-engine.stop-marker.test.ts
      loop-engine.rich-mode.test.ts
    providers/
      claude.test.ts
    tui/
      preview-row-key.test.ts
```

## Rules

1. **Mirror path**: test file path = `tests/<source-path-with-.test.ts-suffix>`.
   - `core/json.ts` → `tests/core/json.test.ts`
   - `providers/claude.ts` → `tests/providers/claude.test.ts`
2. **Suffix**: always `.test.ts` (not `.spec.ts`).
3. **Imports**: use relative paths from the test file to the source module (e.g., `../../core/json`).
4. **Runner**: `bun test` (bun's built-in test runner). No additional test framework needed.
5. **No test files in source dirs**: `core/`, `providers/`, `tui/` must not contain `.test.ts` files.

## Exceptions

- **Integration/smoke tests**: place in `tests/integration/` with a descriptive name. These may span multiple modules.
- **Test fixtures and helpers**: place in `tests/_fixtures/` or `tests/_helpers/`. Prefix with underscore to distinguish from test mirrors.
- **Temporary provider stubs** (for smoke tests without network): place in `tests/_fixtures/scripts/`.

## Running tests

```bash
bun test                    # run all tests
bun test tests/core/        # run core tests only
bun test tests/core/json    # run specific test file (partial match)
```
