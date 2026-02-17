# session log

## 2026-02-17
- Completed bead `ouroboros-10.7` (Verification + docs for TUI refinement rollout).
  - Added `tests/tui/tui.test.ts` with focused helper assertions for:
    - `<id> · <title>` rendering and no `[A#]` inline body prefix
    - notch header shape/content via `buildAgentNotchLine`
    - responsive iteration strip behavior at wide/mid/narrow widths
  - Exported testable helper functions from `tui/tui.tsx`:
    - `buildAgentNotchLine`
    - `formatAgentTitle`
    - `buildIterationStripParts`
  - Added `docs/learned/tui-refinement-verification.md` and indexed it in `docs/README.md`.
  - Learned: helper-level renderer assertions are a lightweight way to lock UI contracts before full snapshot plumbing.

- Completed bead `ouroboros-12.4` (Regression tests for no-file prompt fallback and explicit-path errors).
  - Added `tests/core/loop-engine.prompt-resolution.test.ts` with regression coverage for:
    - fallback to built-in developer and reviewer prompts when no local prompt files exist (review-enabled),
    - explicit missing developer prompt path throwing `No developer prompt found`,
    - explicit missing reviewer prompt path throwing `Reviewer prompt file not found`.
  - Updated `core/loop-engine.ts` so explicit missing reviewer prompt paths now fail fast during startup with a clear error instead of silently disabling review.
  - Learned: explicit reviewer-path errors were silently degraded in loop execution and needed run-loop-level guard coverage.

2026-02-17
- Completed bead `ouroboros-11.4` (Regression tests and mixed-provider reviewer execution wiring).
  - Added `tests/core/config.test.ts` to verify `loadOuroborosConfig` preserves project-over-global reviewer override semantics.
  - Extended `tests/core/cli.test.ts` with explicit reviewer CLI precedence checks.
  - Added `tests/core/review-loop.test.ts` case that asserts reviewer subprocess uses `reviewerCommand`/`reviewerProvider` model while fix subprocess stays on implementation provider.
  - Implemented mixed-provider execution wiring in `core/loop-engine.ts`, `core/loop-controller.ts`, and `core/iteration-execution.ts` so review subprocesses use reviewer adapter, command, and model; implementation/fix remains primary path.
  - Learned: review/fix previously reused primary provider context for both stages, so mixed-provider config was silently ineffective.

2026-02-17
- Completed bead `ouroboros-10.1` (UX spec for TUI refinement).
  - Added `docs/tui-refinement-spec.md` with:
    - concrete terminal-width breakpoints for desktop/narrow behavior (`>=120`, `100-119`, `80-99`, `<80` cols),
    - notch/header contract (`Agent N`, `<bead id> · <bead title>` copy + truncation rules),
    - per-agent state table and `Dev`/`Review` auto-switch/restore behavior for implementing/reviewing/fixing phases,
    - bottom iteration strip collapse contract with `Prev`, retry (`R`) and failure (`F`) markers,
    - motion + accessibility guidance (limited transitions, reduced-motion immediate swap, no color-only meaning).
  - Updated `docs/README.md` index to include the new spec.
  - Verification: `bun run doctor` clean.
  - Learning: width-first contract in terminal columns prevents ambiguity for follow-up implementation beads.
  - Challenge: balancing dense terminal copy while preserving bead id visibility required explicit truncation precedence.

2026-02-17
- Completed bead `ouroboros-1` (umbrella provider parser/retry consolidation).
  - Verified `providers/claude.ts`, `providers/codex.ts`, and `providers/copilot.ts` use shared helper imports from `providers/parsing.ts` and `providers/retry.ts` (no local duplicate parser/retry functions remain).
  - Confirmation was done via direct scan in this session; behavior changes are already captured by earlier child beads `ouroboros-1.1`–`1.4`.
  - Learnings: this parent bead can be treated as a bookkeeping closeout once child extraction beads are complete.
  - Challenge: coordinating `bd` metadata and repository status only; no runtime code edit was needed in this bead.

2026-02-17
- Completed bead `ouroboros-5.2` (`refactor: centralize state and beads JSON helpers`).
  - Migrated `core/state.ts` and `core/beads.ts` to shared JSON utilities in `core/json.ts`.
  - Removed local parsing helpers:
    - `safeJsonParse` in both modules
    - `isObject` in `core/state.ts`
    - `asRecord` in `core/beads.ts`
  - Kept behavior unchanged by preserving existing fallback/normalization and bead extraction flow.
  - Challenge: no behavioral test run by policy in this session.
  - Learnings: central helpers remove drift risk between state/bead parsing callers and keep input-shape handling consistent.

2026-02-17
- Completed bead `ouroboros-6.2`.
  - Added explicit decision links from `docs/provider-adapter-boundary.md` to the provider boundary decision (`ouroboros-6`) and provider-refactor bead chain (`ouroboros-1`, `ouroboros-1.1`, `ouroboros-1.2`, `ouroboros-1.3`, `ouroboros-1.4`, `ouroboros-6.3`, `ouroboros-6.4`).
  - Closed beads `ouroboros-6.2` and `ouroboros-6` in `bd` with adoption/traceability as completion criteria.
  - Learnings: one explicit decision-index section in boundary docs is enough for now; it gives reviewers and future contributors a stable link map to refactor lineage.
  - Challenge: duplicate/legacy sibling bead (`ouroboros-6.4`) had already closed; `6.2` remained open despite duplicated intent, requiring explicit completion proof in `6.2`.

2026-02-17
- Completed bead `ouroboros-6.1`.
  - Updated `README.md` with provider architecture link to `docs/provider-adapter-boundary.md`.
  - Expanded `docs/provider-adapter-boundary.md` with explicit ownership policy and good/bad examples for adapter behavior.
  - Kept implementation unchanged; no runtime behavior changes.
  - Learnings: explicit boundary rules and examples should prevent future provider drift.
  - Challenge: no enforced code-level check exists for this boundary, so governance depends on reviewer discipline.

2026-02-17
- Completed bead `ouroboros-3.1`.
  - Extracted run-construction and log-path helpers from `core/loop-engine.ts` into new module `core/loop-runs.ts`.
  - Moved `buildRuns`, `summarizeArgsForLog`, and run-log path resolution (`path.resolve(process.cwd(), options.logDir)`) out of loop orchestration.
  - Updated `core/loop-engine.ts` to import from `./loop-runs` and preserve all existing behavior for non-TTY and TTY render modes.
  - Noted: keep `loop-engine` syntax integrity when moving helper blocks; avoid repeated local edits across shared file sections.

2026-02-17
- Completed bead `ouroboros-2.1`.
  - Removed duplicated live-run state bookkeeping from `core/terminal-ui.ts` and `tui/tui.tsx` by wiring both to `LiveRunStateStore` in `core/live-run-state.ts`.
  - Kept renderer behavior stable (status text, spawn indicators, bead snapshot rendering, spinner frames) while removing duplicated `LiveRunState`-like maps and transition logic.
  - Exported `labelTone` from `terminal-ui` by re-exporting shared implementation so existing imports stay unchanged.
  - Learned: using shared `LiveRunStateStore` avoids drift between ANSI and Ink live views; next step should extend store listeners directly into a future Ink-first renderer path.

2026-02-17
- Completed bead `ouroboros-1.2`.
  - Added shared `providers/retry.ts` with:
    - `RETRY_DELAY_KEYS` for structured payload extraction.
    - recursive JSON field search for retry delay keys.
    - regex retry parsing for textual seconds/minutes phrases.
  - Migrated `providers/claude.ts`, `providers/copilot.ts`, and `providers/codex.ts` to use the shared retry helper.
  - Behavior preserved: seconds/minutes fallback and structured key parsing order remain unchanged.
  - Added notes for future: keep future retry sources in a single key list (`RETRY_DELAY_KEYS`) if providers add headers.

2026-02-17
- Completed bead `ouroboros-1.1`.
  - Implemented `providers/parsing.ts` with shared `isRecord`, `safeJsonParse`, `toJsonCandidates`, and `firstStringValue` helpers.
  - Migrated `providers/claude.ts`, `providers/codex.ts`, and `providers/copilot.ts` to shared helpers.
  - Kept existing first-string key precedence via provider-specific key arrays in `parsing.ts`.
  - Learned: Copilot preview path now uses `toJsonCandidates` to keep parsing behavior aligned with other adapters.
  - Challenge: interim local helper constants and wrappers were present in providers; normalized imports to compile against shared helper API without changing runtime behavior.
- 2026-02-17: Completed bead ouroboros-1.1 by creating providers/parsing.ts with shared safeJsonParse, 	oJsonCandidates, isRecord, and configurable irstStringValue, then refactored codex.ts, claude.ts, and copilot.ts to consume shared parser helpers.
2026-02-17
- Completed bead `ouroboros-1.3`.
  - Consolidated provider parsing/retry helpers into `providers/parsing.ts` and `providers/retry.ts`.
  - `providers/codex.ts`, `providers/claude.ts`, and `providers/copilot.ts` now import shared helpers:
    - `collectRawJsonLines`
    - `toPositiveNumber`
  - Removed duplicated local helper implementations for `collectRawJsonLines` and `toPositiveNumber` in these adapters.
  - Kept behavior unchanged by reusing existing call sites and JSON/key precedence.
  - Challenge: no tests were run per request; next bead should add a small regression test for shared helper imports if needed.

2026-02-17
- Completed bead `ouroboros-1.4`.
  - Centralized no-beads stop-marker matching into shared `providers/parsing.ts` helper `hasNoBeadsMarker` with `NO_BEADS_MARKERS` constants.
  - Removed duplicated inline `hasNoBeadsMarker` implementations from `providers/claude.ts`, `providers/codex.ts`, and `providers/copilot.ts`.
  - Confirmed parity intent for marker behavior remained identical for all providers.
  - No tests were run per instruction.
2026-02-17
- Completed bead `ouroboros-2.2`.
  - Added shared header and per-agent selectors to `core/live-run-state.ts` (`LiveRunHeaderState`, `LiveRunAgentSelector`, `getHeaderState`, `getAgentSelector`) plus generic `setStatus` transition.
  - Goal is to centralize non-renderer logic before ANSI/Ink refactors consume these selectors; kept mutation behavior (`update`, queue/launch, picked bead, stop, snapshot) unchanged.
  - Learned: next renderer refactors can reduce duplicated spawn/status derivation by sourcing status text/tone/age from store selectors instead of local state maps.
2026-02-17
- Completed bead `ouroboros-2.3`.
  - Refactored `core/terminal-ui.ts` to consume shared `LiveRunStateStore` selectors/selectors APIs (`getHeaderState`, `getAgentSelector`) and removed local loop-phase/agent-state branching from render path.
  - Kept rendering flow stable for iteration summary/run context/bead and spinner header; changed implementation to read canonical header/agent states while preserving visible line shapes and tone-based color behavior.
  - Learned: `LiveRunStateStore` now carries enough rendering state for terminal UI parity; next bead should either consume these selectors in `tui/tui.tsx` or extend selector outputs for less direct snapshot access.2026-02-17
- Completed bead `ouroboros-2.4`.
  - Refactored `tui/tui.tsx` Ink renderer to use shared `LiveRunStateStore` selectors (`getHeaderState`, `getAgentSelector`) and removed local loop-phase/agent-state branching.
  - Updated header rendering to use canonical header state (`running`, `spinner`, `tone`, ratio/percent) and agent cards to use selector-driven status labels/tones/text.
  - Kept bead snapshot/rendering shape stable while eliminating duplicate status derivation logic.
  - Learned: `InkLiveRunRenderer` works with selector reads for UI-only decisions and centralizes behavior parity with ANSI path.
2026-02-17
- Completed bead `ouroboros-2.5`.
  - Verified parity gaps in shared live-run model rendering and patched Ink renderer (`tui/tui.tsx`) to mirror terminal behavior for summary ordering, run context fallback text, and no-event agent preview row labeling/detail text.
  - Learned: `selector.detailText` and `STATE` row semantics were not surfaced the same way in Ink vs ANSI; restoring them improved state parity without touching shared state model.
  - Challenge: `loopNotice` still feeds state only and is not rendered in either renderer path; if this was intentional in loop-engine, keep as-is, else it needs separate bead-level update.
2026-02-17
- Completed bead `ouroboros-2`.
  - Finalized shared live-run model usage in `core/live-run-state.ts` and both renderers; no remaining duplicated runtime state management was left in terminal/Ink implementations.
  - Validation: compared `terminal-ui.ts` and `tui/tui.tsx` update paths, agent state transitions, and summary/run-context render inputs for parity consistency.
  - Learned: centralizing state derivation in `LiveRunStateStore` significantly reduced future drift risk during renderer changes.
2026-02-17
- Completed bead `ouroboros-3.2`.
  - Added `core/iteration-execution.ts` and moved `runIteration` plus per-iteration output aggregation/parsing + stop-marker detection into it.
  - `core/loop-engine.ts` now delegates execution/parsing to the new module, keeps orchestration responsibilities, and preserves loop state transitions, retry/pause behavior, and failure handling callsites.
  - Kept exported `shouldStopFromProviderOutput` contract and behavior; run-loop now consumes `aggregateIterationOutput` in orchestration.
  - Challenge: initial extraction left a messy intermediate state; resolved by replacing delegated wrappers and tightening imports before commit.
`n2026-02-17
- Completed bead `ouroboros-3.3`.
  - Created `core/shutdown.ts` with dedicated loop shutdown logic (`installLoopShutdownGuard`) to centralize SIGINT/SIGTERM handling, spinner stop behavior, child termination, and exit-code behavior.
  - Refactored `core/loop-engine.ts` to delegate process-shutdown orchestration to the new helper, leaving iteration/state logic as the main loop concern.
  - `runLoop` now checks `shutdownGuard.isShuttingDown()` in the iteration loop and uses `shutdownGuard.finalize()` for non-signal teardown.
  - Learned: signal handlers should be registered only after spinner stop references are initialized to avoid TDZ/order issues.
  - Risk/Challenge: could not run validation in-session by policy, so runtime verification of exit paths remains pending.
2026-02-17
- Completed bead `ouroboros-3.4`.
  - Moved loop orchestration body out of `core/loop-engine.ts` into new `core/loop-controller.ts`; `runLoop` now only resolves prompt/log/state paths, builds shutdown/runtime wiring, invokes controller, and handles renderer/shutdown finalization.
  - Preserved exported `shouldStopFromProviderOutput` and kept non-TTY/TTY rendering flows, retry wait, pause, circuit-break, and stop-marker behavior intact via controller reuse of extracted iteration helpers.
  - Learning: keep shared `sleep` utility from `state.ts` in orchestration for stable behavior and easier test stubbing; avoid direct `setTimeout` substitutions in extraction refactors.
  - Challenge: renderer finalization ownership needed explicit return of renderer handle from controller to avoid leaked stop behavior.

2026-02-17
- Completed bead ouroboros-3.5 (loop-engine refactor smoke-check).
  - Ran bun run doctor; it formatted/fixed files and reported only a lint warning (unused imports in core/loop-controller.ts).
  - Ran bounded smoke loop via temporary command script (bun ouroboros.ts --iterations 10 --provider codex --command scripts/smoke-provider.cmd --show-raw --log-dir .tmp/ouroboros-smoke3 --prompt .ai_agents/prompt.md --preview 5) and verified stop-marker exit path (no beads available in output).
  - Result confirms smoke path through CLI parse/build-runs/iteration-aggregation/stop-marker detection after loop-controller refactor.
  - Learning: .ai_agents/iteration.json drives loop circuit-breaker state; stale state can suppress runs unless iteration cap is increased.
  - Challenge: command/script for smoke required temporary provider stub because provider CLIs are external/dependent; using this avoids network/tooling dependency.
- 2026-02-17
- Completed bead `ouroboros-4.1`.
  - Added `core/paths.ts` with shared cross-platform helpers:
    - `resolveHomeDir` (Windows: `$HOME` fallback to `homedir()`)
    - `sanitizeProjectName`
    - `defaultLogDir` (`~/.ouroborus/logs/<project>/<timestamp>`, preserving existing format)
  - No caller files were updated in this bead; left `core/cli.ts` and `core/config.ts` untouched so children `ouroboros-4.2` and `ouroboros-4.3` can handle their own migrations.
  - Learned: both existing callsites currently duplicate `sanitize`/home logic and can now be safely migrated without behavior drift.

2026-02-17
- Completed bead ouroboros-4.2.
  - Refactored core/config.ts to use shared core/paths.ts helpers esolveHomeDir and sanitizeProjectName instead of duplicated home/path sanitization logic.
  - Preserved parsing, merge, and projectKey hashing behavior.
  - No verification run in this bead.
2026-02-17
- Completed bead `ouroboros-4.3`.
  - Migrated `core/cli.ts` path/home/project/log directory logic to shared helpers in `core/paths.ts` (`resolveHomeDir`, `sanitizeProjectName`, `defaultLogDir`).
  - Removed duplicated `homedir`/`path` helper functions from CLI and replaced with `defaultLogDir(config.projectRoot)`.
  - Preserved existing CLI behavior/default ordering for `--log-dir` resolution while reducing duplicated logic.
  - Learning: shared helper reuse now reduces OS-specific drift risk; next path-related work should use `paths.ts` as single source of truth.
  - Challenge: no runtime test run per current session policy.

2026-02-17
- Completed bead ouroboros-4.4.
  - Added robust Windows-first home resolution in core/paths.ts using $HOME, %USERPROFILE%, and HOMEDRIVE+HOMEPATH fallbacks, then os.homedir() as final fallback.
  - Added core/paths.test.ts to cover home directory precedence and defaultLogDir path construction on Windows/Linux behavior.
  - Updated docs/platform section in docs/config.md to match resolved precedence.
  - Learnings: keep platform-specific precedence explicit in code and docs to reduce drift between docs/tests/config defaults.
  - Challenges: test suite not run in this iteration by policy; defaultLogDir timestamp segment remains non-deterministic so assertions use shape checks only.

2026-02-17
- Completed bead ouroboros-4.4 (cross-platform path parity).
  - Added core/paths.test.ts covering esolveHomeDir behavior on simulated win32, non-win, and default log directory composition.
  - Verified defaultLogDir sanitizes project names and bases path on home resolution from esolveHomeDir.
  - No runtime verification run due session policy; pending run remains for OS diversity (only runtime-level validation requested).


- 2026-02-17
- Completed bead `ouroboros-4.4` cross-platform parity check.
  - Tightened `core/paths.ts` Windows fallback ordering: `HOME` -> `USERPROFILE` -> `HOMEDRIVE`+`HOMEPATH` -> `homedir()`.
  - Updated `docs/config.md` platform notes to match resolved path precedence and behavior.
  - Note: no runtime validation run this iteration; behavior change is path-resolution only with existing tests already covering constructor cases.

2026-02-17
- Completed bead `ouroboros-5.1`.
  - Added shared `core/json.ts` with `safeJsonParse`, `isRecord`, and `toRecord` helpers.
  - Added `core/json.test.ts` coverage for parse success/failure and record guards.
  - Learning: core modules still parse JSON duplicates in `core/state.ts`, `core/beads.ts`, and `core/config.ts`; migration is still needed and is blocked to bead `ouroboros-5.2`/`5.3`.

- 2026-02-17
- Completed bead ouroboros-5.3 (efactor: migrate remaining core JSON helper callsites).
  - core/config.ts: removed local isRecord and now imports shared isRecord from core/json.ts to align with shared JSON helpers. Behavior unchanged. 
  - No functional behavior change observed in this refactor pass. 
  - Learning: core modules can now consistently consume shared JSON shape guards; fewer duplicated parsers lowers drift risk. 
  - Limitation: runtime validation not run in-session per policy.


2026-02-17
- Completed bead ouroboros-3 (Split loop-engine by concern).
  - Verified that dependent beads ouroboros-3.1, ouroboros-3.2, ouroboros-3.3, ouroboros-3.4, ouroboros-3.5 are closed and no blockers remain for this umbrella task.
  - No runtime code edits were needed in this bead; closure is based on completed extraction and smoke-check work already done in child beads.
  - Learnings: dependency icons can remain ambiguous in status displays (? on DONE); re-check d close behavior directly when parent completion is blocked by stale metadata.
  - Challenge: multiple open parent beads still remain (ouroboros-4, ouroboros-5.4) and may need explicit closure or verification follow-up.
2026-02-17
- Completed bead `ouroboros-4`.
  - Verified path extraction is consolidated in `core/paths.ts` and used by `core/cli.ts` and `core/config.ts`.
  - Confirmed no remaining home/project/log path duplication via repo scan for `HOME`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `sanitizeProjectName`, `defaultLogDir`, and `resolveHomeDir` in core/docs usage.
  - Learnings: this parent bead was functionally complete from child beads once scan confirmed; closure can be safe when all callsites are redirected and platform docs/test coverage exist.
  - Challenge: output from `rg` searches in this environment can be noisy due to PowerShell job metadata, but the relevant hits were still clear.

2026-02-17
- Completed beads ouroboros-5.4 and ouroboros-5 (malformed JSON smoke-check + shared json helper verification).
  - Added tests in core/json.test.ts for malformed iteration-state recovery and malformed d JSON list output path into empty snapshot behavior (loadIterationState + loadBeadsSnapshot smoke checks).
  - No production code edits required; behavior remains parity-focused and backward compatible.
  - Learning: one focused shared helper test file can still cover malformed-input resilience for both core consumers without adding heavy mocks.
  - Challenge: keeping this check platform-stable required temporary PATH shim with Win32 .cmd shim (PATH delimiter-aware).

2026-02-17
- Completed remaining bead closeout cleanup.
  - Closed residual DONE-status beads: `ouroboros-2.1`, `ouroboros-3.2`, `ouroboros-4`.
  - Verified with `bd list --all --json` that all issues are now `closed`.
  - Ran `bd sync` to export updated `.beads/issues.jsonl`.
  - Challenge: initial parallel `bd close` operations caused JSONL rename race (`issues.jsonl.tmp -> issues.jsonl: Access is denied`); sequential closes resolved it.

2026-02-17
- Completed bead `ouroboros-7.1` (review/developer runtime config schema and CLI flags).
  - Added `reviewEnabled` (bool, default false), `reviewMaxFixAttempts` (int, default 5), `developerPromptPath` (optional), `reviewerPromptPath` (optional) to `CliOptions` type.
  - Extended `normalizeConfigRecord` in `core/config.ts` for review fields with existing type coercion helpers.
  - Added CLI flags: `--review`, `--no-review`, `--review-max-fix-attempts`, `--developer-prompt`, `--reviewer-prompt`.
  - Wired through `parseArgs` with standard CLI > project > global > default precedence.
  - Updated `printUsage` and `docs/config.md` with review loop section and TOML key documentation.
  - `bun run doctor` clean (only pre-existing unused import warning in loop-controller.ts).
  - Learning: review config fields follow the same pattern as existing fields — add to type, config normalizer, CLI overrides, parseArgs precedence, usage, docs.
  - Challenge: none; straightforward extension of existing config/CLI infrastructure.

2026-02-17
- Completed bead `ouroboros-7.2` (prompt directory defaults and optional prompt-file resolution).
  - Created `core/prompts.ts` with `resolvePromptPath` (role-based fallback: explicit > `.ai_agents/prompts/{role}.md` > `.ai_agents/prompt.md` legacy), `resolveDeveloperPromptPath` (throws on missing), `resolveReviewerPromptPath` (returns null on missing).
  - Wired prompt resolution in `core/loop-engine.ts` startup: developer prompt required, reviewer prompt required only when `--review` enabled.
  - Added `core/prompts.test.ts` with 13 tests covering fallback precedence, missing file error reporting, role isolation (reviewer doesn't use legacy), and throw/null contracts.
  - Fixed pre-existing unused `progressBar` import in `core/loop-controller.ts`; `bun run doctor` now fully clean (0 warnings).
  - Updated `docs/config.md` with prompt resolution section, directory layout, and fallback chains.
  - Learning: using real temp dirs in tests is simpler than mocking `existsSync` for path resolution tests in bun.
  - Challenge: initial test file had leftover mock scaffolding from abandoned fs-mock approach; cleaned up before final commit.

2026-02-17
- Completed bead `ouroboros-7.3` (reviewer verdict contract parser and follow-up prompt builder).
  - Created `core/review.ts` with:
    - `ReviewVerdict` type (`'pass' | 'drift'`), `ReviewResult`, `ReviewFailure` types.
    - `parseReviewerVerdict`: strict JSON parser extracting `{verdict, followUpPrompt}` from reviewer output; handles preamble text by finding first JSON object; returns typed failure on any contract violation.
    - `isReviewResult` / `isReviewFailure` type guards.
    - `buildReviewerContext`: composes reviewer prompt context with bead metadata, implementer output (capped 50k chars), git diff snapshot, parallel-agent warning, fix-attempt history, and response contract instructions.
  - Added `core/review.test.ts` with 24 tests covering: valid pass/drift, JSON extraction from surrounding text, empty/whitespace, no JSON, malformed JSON, invalid verdict, null verdict, missing/non-string followUpPrompt, array wrapping, bead metadata inclusion, output placeholders, diff placeholders, parallel warning toggle, fix attempt context, response contract, and priority omission.
  - `bun run doctor` fully clean (0 warnings).
  - Learning: extracting first `{` to last `}` is sufficient for reviewer output parsing since reviewers may emit preamble text before the JSON verdict.
  - Challenge: initial `RunResult` import was unused; caught by doctor lint pass.

2026-02-17
- Completed bead `ouroboros-7.4` (integrate slot-local implement->review->fix loop).
  - Added `runSlotReviewLoop` in `core/iteration-execution.ts` — per-slot review/fix pipeline:
    - After implementation, runs reviewer process with `buildReviewerContext` (bead metadata + implementer output + git diff + parallel-agent warning + fix attempt history).
    - Parses strict JSON verdict via `parseReviewerVerdict`; on `drift`, runs fix agent with `followUpPrompt`.
    - Loops review->fix up to `reviewMaxFixAttempts` (default 5); unresolved drift after cap fails the slot.
  - Wired into `runIteration` per-slot async block: review runs only when `--review` enabled, bead picked, and implementation exited 0.
  - Extended `AggregatedIterationOutput` with `reviewOutcomes` map and review failure reporting in `aggregateIterationOutput`.
  - Updated `loop-controller.ts` to pass `reviewerPromptPath` through to `runIteration` and thread `reviewOutcomes` to aggregation.
  - Added `captureGitDiff()` helper using `execSync('git diff HEAD')` with 15s timeout and 1MB buffer.
  - Stop-marker detection remains on implement/fix outputs only (reviewer output excluded).
  - Staged launch and parallel slot behavior unchanged.
  - Doctor clean (0 warnings), 65 tests pass.
  - Learning: review loop is naturally parallel across slots because it runs inside each slot's async block; no additional synchronization needed.
  - Challenge: scoping `iterationReviewOutcomes` across try/finally boundary required hoisting the variable declaration outside the try block.

2026-02-17
- Completed bead `ouroboros-7.5` (constrain stop-marker/failure semantics and add review/fix logs and phases).
  - Extended `LoopPhase` with `reviewing` and `fixing` phases.
  - Added `AgentReviewPhase` type and per-agent review phase map to `LiveRunState`.
  - Added `setAgentReviewPhase`/`clearAgentReviewPhase` to `LiveRunStateStore`, `IterationLiveRenderer` interface, `LiveRunRenderer` (ANSI), and `InkLiveRunRenderer` (Ink).
  - Agent selector now overrides `statusLabel`/`statusTone`/`statusText` when review phase is active (shows REVIEW or FIX badge with bead id and fix attempt count).
  - Wired phase transitions in `runSlotReviewLoop` with try/finally cleanup; review/fix log paths updated per pass via `setAgentLogPath`.
  - Updated mock renderer in `loop-engine.rich-mode.test.ts` with review phase stubs.
  - Stop-marker detection already excluded reviewer output (verified from 7.4 implementation).
  - Doctor clean (0 warnings), 65 tests pass.
  - Learning: selector-driven approach means both renderers automatically surface new status without individual renderer changes; the agent card rendering is data-driven from `getAgentSelector`.
  - Challenge: mock renderer in tests needed review phase stubs to avoid runtime TypeError from missing methods called via non-null liveRenderer reference.

2026-02-17
- Completed bead `ouroboros-8.1` (define and document canonical test directory layout).
  - Created `docs/testing.md` with top-level `tests/` mirror tree convention: test path = `tests/<source-path>.test.ts`.
  - Defined rules: `.test.ts` suffix only, no test files in source dirs, relative imports from test to source.
  - Exception policy: `tests/integration/` for cross-module tests, `tests/_fixtures/` and `tests/_helpers/` for shared test data.
  - Added entry to `docs/README.md` index.
  - Learning: small repos benefit from top-level mirror tree over co-located `__tests__/` — keeps source dirs clean and test runner globs simple.
  - Challenge: none; straightforward documentation bead.

2026-02-17
- Completed bead `ouroboros-8.2` (move provider and TUI tests to dedicated test locations).
  - Moved `providers/claude.test.ts` → `tests/providers/claude.test.ts` and `tui/preview-row-key.test.ts` → `tests/tui/preview-row-key.test.ts`.
  - Updated import paths from `./` and `../` to `../../` relative references matching new locations.
  - All 69 tests pass, `bun run doctor` clean.
  - Learning: git detects renames automatically when content similarity is high; `git rm` + `git add` produces clean rename entries.
  - Challenge: none; straightforward file relocation with import path updates.

2026-02-17
- Completed bead `ouroboros-8.3` (move core tests to dedicated test locations).
  - Moved 9 test files from `core/` to `tests/core/`: beads, json, paths, prompts, review, live-run-state, iteration-execution, loop-engine.stop-marker, loop-engine.rich-mode.
  - Updated all static imports (`./foo` → `../../core/foo`, `../providers/types` → `../../providers/types`).
  - Updated `mock.module` paths (`./beads` → `../../core/beads`, `./state` → `../../core/state`, `./process-runner` → `../../core/process-runner`, `../tui/tui` → `../../tui/tui`).
  - Updated dynamic `import()` paths for `iteration-execution` and `loop-engine` modules.
  - All 70 tests pass, `bun run doctor` clean (0 warnings).
  - Learning: `mock.module` paths in bun:test resolve relative to the test file location, same as static imports — must update them when moving test files.
  - Challenge: none; systematic path replacement with verification.

2026-02-17
- Completed bead `ouroboros-8.4` (verify test imports and discovery after relocation).
  - Confirmed all 11 test files live in `tests/` mirror tree; zero `.test.ts` files remain in `core/`, `providers/`, or `tui/`.
  - All static imports use correct `../../` relative paths; `mock.module` paths also updated.
  - `bun test` discovers all 70 tests across 11 files via default `**/*.test.ts` glob — no `bunfig.toml` or manual path config needed.
  - `bun run doctor` clean (0 warnings, 0 fixes).
  - Learning: bun's default test discovery (`**/*.test.ts`) requires no configuration for mirror-tree layouts; verification-only beads can close quickly when prior child beads did the actual moves.
  - Challenge: none; this was a pure verification pass confirming work from 8.2 and 8.3.

2026-02-17
- Completed bead `ouroboros-7.6` (regression tests and docs for review/fix loop).
  - Added `tests/core/review-loop.test.ts` with 10 tests covering: review disabled path, pass-on-first-review, drift->fix->pass, malformed reviewer JSON failure, invalid verdict, missing followUpPrompt, max fix attempts cap, stop-marker exclusion, aggregation failure surfacing, and multi-drift-then-pass cycle.
  - Exported `runSlotReviewLoop` and `SlotReviewInput` from `core/iteration-execution.ts` for direct testability (avoids `mock.module` collision with `iteration-execution.test.ts` when both mock `process-runner`).
  - Created `docs/review-loop.md` with full lifecycle, verdict contract, reviewer context, stop-marker exclusion, lifecycle phases, and CLI/config reference.
  - Updated `docs/config.md` to replace stale "planned behavior" with actual review loop summary and cross-link.
  - Updated `docs/README.md` index with review-loop.md entry.
  - Closed parent bead `ouroboros-7` (all children 7.1-7.6 complete).
  - Learning: bun `mock.module` for the same module path across test files collides in the same process; testing exported functions directly avoids mock isolation issues.
  - Challenge: initial attempt to mock `process-runner` in new test file conflicted with existing `iteration-execution.test.ts` mock; resolved by exporting `runSlotReviewLoop` and testing it directly.
  - 80 tests pass, doctor clean (0 warnings).

2026-02-17
- Completed bead `ouroboros-8.5` (verify relocation and document test-structure convention).
  - Ran `bun run doctor`: clean (0 fixes, 0 warnings).
  - Ran `bun test`: 80 pass, 0 fail across 12 files.
  - Verified 0 `.test.ts` files remain in source dirs (`core/`, `providers/`, `tui/`).
  - Updated `docs/testing.md` mirror tree listing to include `review-loop.test.ts` (added in 7.6, missing from tree example).
  - Closed parent bead `ouroboros-8` (all children 8.1-8.5 complete).
  - Learning: verification beads are quick when prior work is solid; main value is catching stale docs (tree listing was missing one file).
  - Challenge: none; straightforward verification pass.

- 2026-02-17
  - Completed bead ouroboros-9.1 (Fail fast on non-zero reviewer/fix subprocess exits).
  - Implemented runtime hard-fail handling in core/iteration-execution.ts for unSlotReviewLoop: non-zero reviewer/fixer statuses now return immediate failed SlotReviewOutcome with explicit eviewer process exited with status X / ixer process exited with status X, clear A# non-live logs, and no verdict parsing/fix continuation on failure.
  - Added regression tests in 	ests/core/review-loop.test.ts for reviewer non-zero exit and fixer non-zero exit short-circuit behavior; happy-path pass/drift behavior unchanged by design.
  - Learnings: explicit status checks before JSON parsing are necessary to avoid trusting failed subprocess output; tests should assert call-count/attempt semantics as well as failure reason. 
  - Challenge: tests not executed in-session by policy.

- 2026-02-17
- Completed bead `ouroboros-9.2` (`Harden JSONL-first bead snapshot semantics under transient partial writes`).
  - Behavior change in `core/beads.ts`: `loadBeadsSnapshotFromJsonl` now counts malformed JSONL lines; any malformed line makes JSONL snapshots unavailable (instead of being silently ignored) so partial/truncated writes cannot appear as valid empty state.
  - `core/loop-controller.ts`: no-bead stop condition now requires `beadsSnapshot.available` so unknown/untrusted snapshots do not trigger early stop.
  - `tests/core/json.test.ts`: added regressions for malformed JSONL invalidation and malformed-to-`bd` fallback, plus removed malformed fixture from strict-valid JSONL happy-path test.
  - Learnings: strict JSONL validity should be fail-closed; unknown snapshot states are safe to treat as non-authoritative.
  - Challenge: no runtime verification run in this bead (policy); change is behavioral hardening only.

2026-02-17
- Completed bead ouroboros-9.3 (review-loop/transient JSONL stop-marker hardening regression).
  - Added core/loop-controller.ts:shouldIgnoreStopMarkerForNoBeads and used it in no-bead stop-marker decision path.
  - Added 	ests/core/loop-controller.test.ts covering available/unavailable snapshot and picked-count matrix for marker suppression behavior (prevents malformed/partial JSONL from forcing false no-bead continuation).
  - Learned: this case is best locked by testing the decision predicate directly; avoids expensive loop-controller integration mocks while still covering hardening intent.
  - No test/doctor run in this iteration due session policy.

- Completed bead ouroboros-9.4 (document hardening policy for review subprocess failures and JSONL snapshot validity).
  - Added docs/learned/review-loop-hardening.md with hard-fail and snapshot trust rules (
on-zero reviewer/fixer => slot fail, malformed JSONL invalidates snapshot, fallback to d list).
  - Updated docs/review-loop.md and docs/config.md to document behavior and no-bead stop-marker dependencies on available snapshots.
  - Added learned index reference in docs/README.md for discoverability.
  - Learnings: hard-failure and strict snapshot parsing are now explicit enough to reduce ambiguous reviewer behavior during transient tool/process failures.
  - Challenges: no runtime/test execution was performed in this iteration to keep to user request, so behavior parity is inferred from local implementation/docs alignment.

2026-02-17
- Completed bead `ouroboros-9` (review-loop and JSONL hardening).
  - Validated in-tree runtime and test coverage from children `ouroboros-9.1`, `ouroboros-9.2`, `ouroboros-9.3`, and `ouroboros-9.4` satisfies acceptance:
    - review/fix non-zero subprocess exits fail fast in `core/iteration-execution.ts` via `runSlotReviewLoop` with explicit failure reasons,
    - malformed/partial `.beads/issues.jsonl` invalidates snapshot in `core/beads.ts` and no-bead-stop logic gates on `available` in `core/loop-controller.ts`,
    - regressions cover reviewer/fixer failure and malformed-JSONL handling in `tests/core/review-loop.test.ts` and `tests/core/json.test.ts`.
  - No additional code edits were needed in this bead because all child work is already merged.
  - Learned: for hardening criteria, validating child-bead closure plus behavior parity was sufficient to close parent safely.
  - Challenge: no extra runtime verification run was performed in this bead iteration.

2026-02-17
- Completed bead `ouroboros-11.1` (reviewer provider/model resolution contract).
  - Added source-of-truth contract in `docs/config.md`:
    - `reviewerProvider` default fallback to primary provider,
    - `reviewerModel` fallback matrix (same-provider uses primary model, mixed-provider uses reviewer adapter default model),
    - reviewer command resolution rule for mixed providers (reviewer path, not primary command),
    - explicit scope that implementation/fix remain primary provider/model/command.
  - Added contract summary and cross-link in `docs/review-loop.md`.
  - Verification: `bun run doctor` clean.
  - Learning: explicit provider/model/command matrix removes ambiguity for mixed-provider runtime wiring in follow-up beads.
  - Challenge: `.beads/issues.jsonl` was already staged from tracker updates and was unintentionally included in the docs commit; completed remaining tracker updates in follow-up bead-state commit.
2026-02-17
- Completed bead `ouroboros-10.2` (state contract: agent active tab + iteration timeline metadata).
  - Extended `core/live-run-state.ts` with:
    - per-agent tab state (`dev`/`review`) plus restore memory for review auto-switch/clear,
    - selector fields (`activeTab`, `restoreTab`) in `getAgentSelector`,
    - iteration marker timeline state and selector (`getIterationTimeline`) with retry counts and success/failure flags.
  - Wired lifecycle updates in `core/loop-controller.ts`:
    - `markIterationRetry(iteration)` on retry-delay branch,
    - `setIterationOutcome(iteration, 'failed'|'success')` on failure/success stop paths.
  - Added renderer pass-through APIs in `core/terminal-ui.ts` and `tui/tui.tsx` to keep state model renderer-agnostic.
  - Added tests in `tests/core/live-run-state.test.ts` for review tab auto-switch/restore and retry/failure marker transitions.
  - Updated `tests/core/loop-engine.rich-mode.test.ts` mock renderer with new state API methods.
  - Verification: `bun test tests/core/live-run-state.test.ts tests/core/loop-engine.rich-mode.test.ts` and `bun run doctor` passed.
  - Learning: keeping tab auto-switch memory in shared state avoids renderer-specific branch duplication and aligns with follow-up tab UI bead work.
  - Challenge: repository had unrelated dirty files; staged and committed only bead-specific code changes plus bead metadata updates.
2026-02-17
- Completed bead `ouroboros-10.3` (Ink card shell: border-notch + agent title row).
  - Added `buildAgentNotchLine` in `tui/tui.tsx` for top border notch `"Agent N"` on each agent card.
  - Switched Ink agent header row to canonical `<bead id> · <bead title>` format with no `[A#]` inline prefix.
  - Added `formatAgentTitle` truncation with ID-preserving fallback sequence for narrow widths.
  - Kept existing event feed row rendering intact and preserved snapshot/no-snapshot behavior.
  - Added dynamic card width + preview width derivations to reduce wrapping on narrow terminals.

## Bead ouroboros-10.4
- done: implemented Dev/Review tabs in each Ink agent card; active tab now reflects store-backed `activeTab` (Review during review/fix, restored on exit). 
  - No API changes; tabs render as compact status affordance and preserve existing dev event rows.
  - Challenge: review-loop textual output remains shared with dev event stream (no separate capture hook in current TUI event feed).


2026-02-17
- Completed bead ouroboros-10.5 (Ink bottom iteration strip responsive collapse).
  - Implemented bottom iteration strip in 	ui/tui.tsx using LiveRunIterationTimeline from InkLiveRunRenderer with breakpoint-aware rendering: >=120 (7 chips), 100-119 (5 chips), 80-99 (Prev: + current/near-future), <80 compact single-row summary.
  - Added per-mode marker formatting using aggregate Retry/Failed counts and current/failed/retry indicators on chips.
  - Kept strip at render tail after agent cards, with empty-state fallback when iteration metadata is missing or unavailable.
  - Learnings: centralized timeline selector is the right source of truth for rendering parity with terminal mode; narrow-mode collapse needs both current context and history count to preserve continuity under width pressure.
  - Challenges: no runtime smoke due request constraints; width behavior should be visually sampled in real terminals before final trim.
- Completed bead `ouroboros-11.3` (Runtime wiring: run reviewer loop with reviewer adapter/model).
  - Added `tests/core/loop-engine.mixed-review-provider.test.ts`.
  - New coverage asserts `runLoop` resolves both primary and reviewer adapters when review is enabled, uses reviewer-command resolution when providers differ (cross-platform via `resolveRunnableCommand`), and keeps reviewer command on primary when providers are same.
  - Existing `runSlotReviewLoop` contract remains validated by review-loop tests: reviewer subprocess uses `reviewerModel`/reviewer command while fix subprocess uses primary provider command.
  - Learned: existing mixed-provider wiring was mostly already implemented; this test prevents future regressions by locking the handoff contract in `loop-engine`.

2026-02-17
- Completed bead `ouroboros-12.1` (default prompt content contract).
  - Added canonical prompt texts with Ralph provenance in tracked docs:
    - `docs/prompts/developer.default.md`
    - `docs/prompts/reviewer.default.md`
  - Added `docs/prompt-contract.md` documenting:
    - source path provenance (`C:\Users\adity\Projects\dotfiles\.ai_agents\prompts\ralph.md`),
    - strict reviewer JSON contract (`verdict` + `followUpPrompt`),
    - safety constraints (no forced push/tag/history rewrite by default).
  - Updated `docs/README.md` index to include prompt contract docs.
  - Ran `bun run doctor`; formatting/lint pass completed with two existing warnings in `tests/core/loop-engine.mixed-review-provider.test.ts` (`noNonNullAssertion`, unsafe autofix declined).
  - Learning: because `.ai_agents/` is ignored, canonical prompt assets must live in tracked docs and can be mirrored to runtime paths as needed.
2026-02-17
- Completed bead `ouroboros-11` (Review loop: separate reviewer provider/model via CLI and config).
  - Confirmed resolution contract is enforced in `core/cli.ts`: reviewer provider/model precedence is CLI > runtime config > defaults, with reviewer model fallback to reviewer provider default when provider differs.
  - Added test in `tests/core/cli.test.ts` for runtime `reviewerProvider` fallback model behavior when `reviewerModel` is unset.
  - Reviewed `core/loop-engine.ts` and `core/loop-controller.ts` runtime wiring to keep implementation/fix on primary provider/command while review subprocess uses reviewer provider/command.
  - Learned: defaulting reviewer model to reviewer provider default in CLI path is the contract anchor for mixed-provider review loops.
  - Challenge: no end-to-end run performed in this iteration; coverage is via targeted tests and mixed-provider assertions.

2026-02-17
- Completed bead `ouroboros-12.2` (Built-in prompt assets implementation).
  - Added `core/prompts.ts` built-in prompt asset support: `resolveBuiltinPromptPath()` and `readBuiltinPrompt()` wired to versioned `docs/prompts/developer.default.md` and `docs/prompts/reviewer.default.md`.
  - Added `tests/core/prompts.test.ts` coverage for built-in asset existence/readability.
  - Commit: `a04603c`.
  - Learning: docs-backed prompt markdown is the safest maintainable location for defaults and avoids in-code string drift.
  - Challenge: runtime fallback resolution is still pending in the next bead (`ouroboros-12.3`) to keep behavior split cleanly.

- Completed bead ouroboros-12.3 (Prompt resolution fallback to built-ins).
  - Runtime: esolvePromptPath in core/prompts.ts now falls back to docs/prompts/developer.default.md and docs/prompts/reviewer.default.md when project/local prompts are missing.
  - Explicit paths remain highest priority; missing explicit paths still fail (returned to caller) for clearer errors in downstream checks.
  - Updated 	ests/core/prompts.test.ts for built-in fallback + explicit-path-preservation behavior.
  - Updated docs for new fallback contract: docs/config.md, docs/prompt-contract.md, and core/cli.ts usage text.
  - Commit: 86ab810 (eat(prompts): add built-in prompt fallback).
  - Learnings: built-in prompts now cover the no-file startup path for both dev/reviewer roles without changing existing explicit override semantics.
  - Challenge: no test run or doctor in this iteration per current constraints; recommend one quick un test tests/core/prompts.test.ts and un run doctor pass in follow-up bead if needed.
