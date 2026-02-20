# ouroboros docs

Project documentation index.

- [`config.md`](./config.md): configuration model, load paths, merge order, platform rules, review loop config.
- [`review-loop.md`](./review-loop.md): optional slot-local review/fix loop lifecycle, verdict contract, and prompt resolution.
- [`prompt-contract.md`](./prompt-contract.md): canonical default developer/reviewer prompt content contract, provenance, and safety guardrails.
- [`tui-refinement-spec.md`](./tui-refinement-spec.md): interaction model, keyboard/contracts, Dev/Review tabs, and responsive iteration strip.
- [`tui-parity-plan.md`](./tui-parity-plan.md): feature gap matrix vs `ralph-tui` reference (RunApp and TUI guide), with Core/Enhanced/Advanced tiers.
- [`testing.md`](./testing.md): test directory layout, naming convention, and exception policy.
- [`provider-adapter-boundary.md`](./provider-adapter-boundary.md): provider boundary and shared parsing/retry ownership rules.
- [`learned/rich-tui-iteration-lifecycle.md`](./learned/rich-tui-iteration-lifecycle.md): loop lifecycle rendering decisions.
- [`learned/opentui-migration-plan.md`](./learned/opentui-migration-plan.md): source-backed plan to replace Ink renderer with OpenTUI.
- [`learned/claude-stream-json-verbose.md`](./learned/claude-stream-json-verbose.md): Claude print-mode `stream-json` requires `--verbose`.
- [`learned/review-loop-hardening.md`](./learned/review-loop-hardening.md): non-zero reviewer/fixer exits and JSONL validity/fallback policy.
- [`learned/tui-refinement-verification.md`](./learned/tui-refinement-verification.md): TUI task-10 refinement verification scope and cross-platform runtime constraints.
- [`learned/claude-bead-pick-detection.md`](./learned/claude-bead-pick-detection.md): staged launch task-pick detection for Claude stream output.
- [`learned/claude-tool-use-classification.md`](./learned/claude-tool-use-classification.md): classify Claude tool calls using nested content type, not only top-level event type.
