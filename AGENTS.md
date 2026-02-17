<STYLE>
Work style: telegraph; noun-phrases ok; drop grammar; min tokens.
</STYLE>

- read `docs/` and keep them updated with implementation.
- read `~/.codex/AGENTS.md` 

# GOAL
This is our custom implementation of TUI for ralph wiggum loop. It is designed to be a more robust and flexible alternative to the default TUI implementation, with a focus on stability, extensibility, and user experience.
- Platform independent, so ensure we support Windows, Linux, and macOS with consistent behavior. for example home on Windows is `$HOME`, while on Linux/macOS it's `~`.


# Package manager
Use `bun` for package management and scripts. if not installed then install from https://bun.sh.
- run `bun install` to install dependencies.
- run `bun run doctor` after changes to ensure formatting and linting are correct.