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

Current runtime behavior:

- `reviewEnabled` and `reviewMaxFixAttempts` are parsed and available in runtime options.
- Reviewer/developer prompt paths are resolved and validated at startup when review is enabled.
- The implement->review->fix execution loop is not wired yet (planned in follow-up beads).

Planned behavior (not yet active):

1. Implementation runs as normal.
2. A reviewer agent evaluates the output (using `reviewerPromptPath` if set).
3. If the reviewer reports drift, a fix agent runs with the reviewer's follow-up prompt.
4. Steps 2-3 repeat up to `reviewMaxFixAttempts` (default `5`) times.
5. Unresolved drift after max attempts fails the iteration.

Prompt paths use the standard prompt resolution fallback (see below).

## Prompt resolution

Prompt files are resolved per-role with a fallback chain:

### Developer prompt

1. `--developer-prompt <path>` or `developerPromptPath` in TOML
2. `--prompt <path>` or `promptPath` in TOML (legacy flag)
3. `.ai_agents/prompts/developer.md`
4. `.ai_agents/prompt.md` (legacy default)

If none of these exist, the loop errors at startup.

### Reviewer prompt

1. `--reviewer-prompt <path>` or `reviewerPromptPath` in TOML
2. `.ai_agents/prompts/reviewer.md`

When review is enabled (`--review`) and no reviewer prompt is found, the loop errors at startup.

### Directory layout

```
.ai_agents/
  prompt.md                  # legacy default (developer fallback)
  prompts/
    developer.md             # role-specific developer prompt
    reviewer.md              # role-specific reviewer prompt
```

The `prompts/` directory is optional. Projects that don't use the review loop can continue using `.ai_agents/prompt.md` with no changes.

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
