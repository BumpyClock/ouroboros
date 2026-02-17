# ouroboros

Provider-agnostic multi-agent loop runner with a live Ink TUI, staged parallel startup, and beads-aware progress.

Supported providers:

- `codex`
- `claude`
- `copilot`

## Usage

```bash
bun ouroboros.ts --help
```

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
