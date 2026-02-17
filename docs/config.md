# Configuration

`ouroboros` resolves runtime config from two TOML files and merges into a single runtime object.

## Source files

- Global: `~/.ouroboros/config.toml`
- Project: `<project-root>/.ouroboros/config.toml`

If a file is missing or empty, it is treated as `{}`.

`<project-root>` is the Git repo root of the current working directory.

## Merge order

Runtime precedence is:

- CLI flags
- Project TOML
- Global TOML
- Provider defaults

Only defined values are honored from each layer.

## Default log directory

If `logDir` is not set by CLI or TOML, runtime logs are written to:

- `~/.ouroborus/logs/<project_dir>/<date-time>/`
- Windows equivalent: `$HOME\.ouroborus\logs\<project_dir>\<date-time>\`

Where:

- `<project_dir>` is the git root directory name (sanitized).
- `<date-time>` is an ISO timestamp generated at process start.

## Output mode behavior

- **TTY + rich mode** (`showRaw = false`): iteration lifecycle and summary lines are rendered in live, replace-in-place panels.
- **Non-TTY or `--show-raw`**: legacy per-iteration rows are printed to stdout for script compatibility.

## Platform behavior

- Linux/macOS: uses `HOME` when set, otherwise `homedir()` (the same directory as `~`).
- Windows: prefers `$HOME`, then `%USERPROFILE%`, then `HOMEDRIVE`+`HOMEPATH`, then `homedir()`.

## TOML keys

Supported keys:

- `provider` (`codex`, `claude`, `copilot`)
- `promptPath`
- `iterationLimit`
- `previewLines`
- `parallelAgents`
- `pauseMs`
- `command`
- `model`
- `reasoningEffort` (`low`, `medium`, `high`)
- `yolo`
- `logDir`
- `showRaw`
- `reviewEnabled` (boolean, default `false`)
- `reviewMaxFixAttempts` (positive integer, default `5`)
- `developerPromptPath` (optional string)
- `reviewerPromptPath` (optional string)

Values are normalized into runtime types. Invalid keys are ignored.

## Review loop

When `reviewEnabled = true` (or `--review`), each agent slot runs an optional review/fix cycle after implementation:

1. Implementation runs as normal.
2. A reviewer agent evaluates the output (using `reviewerPromptPath` if set).
3. If the reviewer reports drift, a fix agent runs with the reviewer's follow-up prompt.
4. Steps 2–3 repeat up to `reviewMaxFixAttempts` (default `5`) times.
5. Unresolved drift after max attempts fails the iteration.

The reviewer is prompt-only and cannot edit code. Review/fix execution uses the same provider/model/command/yolo/reasoning settings as the developer.

Optional prompt paths:

- `developerPromptPath`: overrides the default prompt for developer/fix agents.
- `reviewerPromptPath`: prompt file for the reviewer agent.

Both are optional; when unset, the system uses default prompt resolution (see bead `ouroboros-7.2`).

## `yolo` semantics by provider

Current provider mappings:

- Codex: `--yolo`
- Claude Code: `--permission-mode bypassPermissions`
- GitHub Copilot CLI: `--allow-all`

Set `yolo = false` (or `--no-yolo`) to disable these flags.

## Example

Global (`~/.ouroboros/config.toml`):

```toml
provider = "codex"
parallelAgents = 2
previewLines = 5
```

Project (`<project-root>/.ouroboros/config.toml`):

```toml
parallelAgents = 3
pauseMs = 1000
```

Resolved values:

- `parallelAgents = 3` (project override)
- `pauseMs = 1000` (project)
- `previewLines = 5` (global)
