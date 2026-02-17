# session log

## 2026-02-17 (consolidated)

### Completed beads
- `ouroboros-1`, `ouroboros-1.1`-`ouroboros-1.4`: provider parsing/retry/no-bead marker helpers centralized in `providers/parsing.ts` and `providers/retry.ts`; adapters migrated (`claude`, `codex`, `copilot`).
- `ouroboros-2`, `ouroboros-2.1`-`ouroboros-2.5`: live run state centralized in `core/live-run-state.ts`; ANSI and Ink renderers moved to shared selectors.
- `ouroboros-3`, `ouroboros-3.1`-`ouroboros-3.5`: loop engine split by concern (`loop-runs.ts`, `iteration-execution.ts`, `shutdown.ts`, `loop-controller.ts`), then smoke-checked.
- `ouroboros-4`, `ouroboros-4.1`-`ouroboros-4.4`: cross-platform path/state handling hardened for Windows, Linux, and macOS.
- `ouroboros-5`, `ouroboros-5.1`-`ouroboros-5.4`: JSON helper consolidation in `core/json.ts`, malformed JSON behavior hardened and verified.
- `ouroboros-6.1`, `ouroboros-6.2`: provider boundary docs, README links, and decision traceability updates.
- `ouroboros-7`, `ouroboros-7.1`-`ouroboros-7.6`: review/fix loop implemented; config/CLI/prompt resolution, verdict contract, tests, and docs landed.
- `ouroboros-8`, `ouroboros-8.1`-`ouroboros-8.5`: tests moved to `tests/` mirror layout; imports/discovery/docs verified.
- `ouroboros-9`, `ouroboros-9.1`-`ouroboros-9.4`: hardening for reviewer/fixer non-zero exits and malformed JSONL bead snapshots.
- `ouroboros-10`, `ouroboros-10.1`-`ouroboros-10.7`: TUI UX spec plus Ink/ANSI notch/title/tabs/iteration-strip refinements and verification.
- `ouroboros-11`, `ouroboros-11.1`, `ouroboros-11.3`-`ouroboros-11.6`: reviewer provider/model/command overrides wired for mixed-provider flows, with docs and regression coverage.
- `ouroboros-12.1`-`ouroboros-12.6`: built-in prompt contracts/assets, fallback resolution, docs, and `--init-prompts` bootstrap flow.
- `ouroboros-13.1`, `ouroboros-13.2`: TUI parity plan plus interactive Ink foundation (keyboard routing and view state machine).

### Persistent learnings
- Keep precedence deterministic: `CLI > project > global > defaults`.
- Keep reviewer execution explicit: review subprocess can diverge from implementation provider/model/command.
- Treat malformed JSONL snapshots as untrusted; fail closed and fallback safely.
- Prefer helper-level renderer tests to lock UI contracts quickly.

### Cleanup notes
- Removed duplicate bead entries, malformed control characters, and inconsistent bullet/date formatting.
- Kept only consolidated outcomes for compaction-friendly session memory.

