
ork style: telegraph; noun-phrases ok; drop grammar; min tokens.


- read `docs/` and keep them updated with implementation.
- read `~/.codex/AGENTS.md`
- use `tasque` skill.


# GOAL
This is our custom implementation of TUI for ralph wiggum loop. It is designed to be a more robust and flexible alternative to the default TUI implementation, with a focus on stability, extensibility, and user experience.
- Platform independent, so ensure we support Windows, Linux, and macOS with consistent behavior. for example home on Windows is `$HOME`, while on Linux/macOS it's `~`.


# Package manager
Use `bun` for package management and scripts. if not installed then install from https://bun.sh.
- run `bun install` to install dependencies.
- run `bun run doctor` after changes to ensure formatting and linting are correct.

# Reference
Look at these references for inspiration and guidance:
- Ralph-tui : C:\Users\adity\Projects\references\ralph-tui



## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.


**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
