# ouroboros docs

Project documentation index.

- [`config.md`](./config.md): configuration model, load paths, merge order, platform rules, review loop config.
- [`review-loop.md`](./review-loop.md): optional slot-local review/fix loop lifecycle, verdict contract, and prompt resolution.
- [`testing.md`](./testing.md): test directory layout, naming convention, and exception policy.
- [`provider-adapter-boundary.md`](./provider-adapter-boundary.md): provider boundary and shared parsing/retry ownership rules.
- [`learned/rich-tui-iteration-lifecycle.md`](./learned/rich-tui-iteration-lifecycle.md): loop lifecycle rendering decisions.
- [`learned/claude-stream-json-verbose.md`](./learned/claude-stream-json-verbose.md): Claude print-mode `stream-json` requires `--verbose`.
- [`learned/review-loop-hardening.md`](./learned/review-loop-hardening.md): non-zero reviewer/fixer exits and JSONL validity/fallback policy.
- [`learned/claude-bead-pick-detection.md`](./learned/claude-bead-pick-detection.md): staged launch bead detection for Claude stream output.
- [`learned/claude-tool-use-classification.md`](./learned/claude-tool-use-classification.md): classify Claude tool calls using nested content type, not only top-level event type.
