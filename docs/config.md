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
- `reviewerProvider` (`codex`, `claude`, `copilot`; default: resolved `provider`)
- `reviewerModel` (string; default: resolved `model` when reviewer provider matches primary, otherwise reviewer provider default model)
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

When `--review` is enabled, each agent slot runs a review/fix cycle after implementation:

1. Implementation runs as normal.
2. Reviewer agent evaluates the output and git diff, emitting a strict JSON verdict.
3. On `pass`, the slot succeeds. On `drift`, a fix agent runs with the reviewer's follow-up prompt.
4. Steps 2-3 repeat up to `reviewMaxFixAttempts` (default `5`) times.
5. Unresolved drift after max attempts fails the slot and the iteration.
6. Malformed reviewer output (non-JSON, invalid verdict) fails the slot immediately.
7. Reviewer/fixer process non-zero exit status fails the slot immediately (no extra review/fix continuation).

Review is skipped when `reviewEnabled` is false (default), no reviewer prompt exists, no bead was picked, or implementation exited non-zero.

## Reviewer provider/model resolution contract (bead 11 source of truth)

Status: contract defined in `ouroboros-11.1`; CLI/config resolution lands in `ouroboros-11.2`; runtime execution wiring continues in `ouroboros-11.3+`.

Terms:

- Primary provider/model/command: resolved from existing `provider`/`model`/`command` paths.
- Reviewer provider/model/command: resolved for reviewer subprocesses only.

Resolution rules:

1. `reviewerProvider` defaults to resolved primary provider when unset.
2. `reviewerModel` resolution:
   - explicit `reviewerModel` wins when set;
   - else if reviewer provider equals primary provider, use resolved primary model;
   - else use reviewer provider default model from adapter defaults.
3. Reviewer command resolution:
   - if reviewer provider equals primary provider, reviewer command follows primary command resolution;
   - if reviewer provider differs, reviewer subprocess uses the reviewer provider command resolution path (provider-specific default path), not the resolved primary `command`.
4. Implementation and fix subprocesses remain on the primary provider/model/command path for now; only reviewer may diverge.

Matrix (normative for `ouroboros-11.2` to `ouroboros-11.5`):

| Primary (`provider`,`model`,`command`) | Reviewer overrides | Reviewer provider | Reviewer model | Reviewer command |
| --- | --- | --- | --- | --- |
| `codex`,`gpt-5.3`,`codex` | none | `codex` | `gpt-5.3` | `codex` |
| `codex`,`gpt-5.3`,`codex` | `reviewerModel=o3-mini` | `codex` | `o3-mini` | `codex` |
| `codex`,`gpt-5.3`,`codex` | `reviewerProvider=claude` | `claude` | claude default model | claude command path |
| `codex`,`gpt-5.3`,`codex` | `reviewerProvider=claude`, `reviewerModel=sonnet` | `claude` | `sonnet` | claude command path |
| `claude`,`(empty)`,`claude` | `reviewerProvider=copilot` | `copilot` | copilot default model | copilot command path |

## Bead snapshot trust model

- Bead snapshots are loaded from `bd list --json --all --limit 0`.
- Snapshot is available when the `bd` command succeeds (JSON parse errors are treated as empty, available snapshots).
- No-bead stop-marker suppression applies only when this snapshot is available.

For full lifecycle details and verdict contract, see [`review-loop.md`](./review-loop.md).

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
