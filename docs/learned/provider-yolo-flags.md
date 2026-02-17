# Provider permission/yolo flag mapping (2026-02-17)

Goal: verify CLI flags for non-interactive "full permissions" mode across Codex, Claude Code, GitHub Copilot CLI.

## Local code state

- Runtime provider registry includes `codex`, `claude`, `copilot`.
- `yolo` mapping now applied per provider adapter.

## External docs findings

Codex CLI:

- `--dangerously-bypass-approvals-and-sandbox` documented.
- `--yolo` documented as alias.
- Source: https://developers.openai.com/codex/cli

Claude Code:

- `--dangerously-skip-permissions` documented in official setup guidance.
- Headless docs show `--permission-mode` and include `bypassPermissions`.
- Sources:
- https://docs.claude.com/en/docs/claude-code/devcontainer
- https://docs.claude.com/en/docs/claude-code/sdk/sdk-headless

GitHub Copilot CLI:

- No `--yolo` flag in CLI reference.
- Programmatic/approval-related flags documented: `--allow-all`, `--allow-all-tools`, `--allow-all-paths`, `--allow-all-urls`.
- Sources:
- https://docs.github.com/en/copilot/reference/cli-reference
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-and-review-code-with-copilot-coding-agent

## Practical mapping for ouroboros

- `codex`: `yolo=true` -> `--yolo`.
- `claude`: `yolo=true` -> `--permission-mode bypassPermissions`.
- `copilot`: `yolo=true` -> `--allow-all`.
