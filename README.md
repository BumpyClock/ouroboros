# ouroboros

Provider-agnostic multi-agent loop runner with a live OpenTUI renderer, staged parallel startup, and TSQ task-aware progress.

Supported providers:

- `codex`
- `claude`
- `copilot`

## Usage

```bash
bun ouroboros.ts --help
```

## TUI lifecycle output

- In TTY rich mode (`showRaw = false`), iteration lifecycle is rendered inline in live panels:
  - run context (`START`/`RUN`/`BATCH`/agent logs)
  - iteration summary (`TOKENS`, picked tasks, stop/retry/pause state)
  - per-iteration progress and agent status
- In non-TTY environments and when `--show-raw` is enabled, behavior is legacy row-by-row output.

## Install deps

```bash
bun install
```

## Build single executable

Unix/macOS:

```bash
./scripts/install-compiled.sh
```

Windows PowerShell:

```powershell
./scripts/install-compiled.ps1
```

Install targets:

- Unix/macOS: `~/.local/bin/ouroboros`
- Windows: `$HOME\.local\bin\ouroboros.exe`

## Configuration

`ouroboros` loads config from two TOML files and merges them:

- Global: `~/.ouroboros/config.toml`
- Project: `<project-root>/.ouroboros/config.toml`

Merge precedence:

- CLI options > project config > global config > provider defaults

Default logs path (when `--log-dir` and `logDir` are unset):

- `~/.ouroborus/logs/<project_dir>/<date-time>/`

See [`docs/config.md`](./docs/config.md) for full schema, examples, and platform rules.

## Provider architecture

Provider adapters are thin transport wrappers; all shared parsing, retry extraction, and stop-marker behavior lives in shared modules under `providers/`.

- [`docs/provider-adapter-boundary.md`](./docs/provider-adapter-boundary.md): contract and ownership rules for adapter implementations.
