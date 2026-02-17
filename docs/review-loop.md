# Review Loop

Optional per-slot review/fix loop that runs after implementation when `--review` is enabled.

## Lifecycle

```
implement → review → [pass] → done
                   → [drift] → fix → review → ...
                   → [contract violation] → fail
```

1. Implementation runs as normal for each agent slot.
2. If `reviewEnabled` is true, a bead was picked, and implementation exits 0, the reviewer agent evaluates the output.
3. Reviewer must emit a strict JSON verdict: `{"verdict": "pass" | "drift", "followUpPrompt": "..."}`.
4. On `pass`, the slot succeeds.
5. On `drift`, a fix agent runs with the reviewer's `followUpPrompt`.
6. Steps 2-5 repeat up to `reviewMaxFixAttempts` (default 5) times.
7. Unresolved drift after max attempts fails the slot and the iteration.
8. Malformed/non-JSON reviewer output is treated as a contract violation and fails the slot immediately (no fix attempted).

## Review conditions

Review is **skipped** when any of these are true:

- `reviewEnabled` is false (default)
- No reviewer prompt path is resolved
- No bead was picked by the agent
- Implementation exited non-zero

## Failure policy

Non-zero review/fix subprocess exits are hard failures:

- if reviewer exits non-zero, the slot is failed and no verdict parsing is attempted.
- if fixer exits non-zero, the slot is failed and no extra review/fix retries occur.
- failed slots mark the iteration as failed (`failed` output path).

## Verdict contract

Reviewer output must contain a JSON object:

```json
{"verdict": "pass", "followUpPrompt": "LGTM, all checks passed."}
```

or

```json
{"verdict": "drift", "followUpPrompt": "Missing error handling in auth module."}
```

- `verdict`: `"pass"` or `"drift"` — no other values accepted.
- `followUpPrompt`: required string. On pass, a brief summary. On drift, specific fix instructions.
- Preamble text before the JSON is allowed; the parser extracts the first `{...}` block.

## Reviewer context

The reviewer receives context built by `buildReviewerContext`:

- Bead metadata (id, title, status, priority)
- Implementer output (capped at 50k chars)
- Git diff snapshot (capped at 50k chars)
- Parallel-agent warning when `parallelAgents > 1` (diff may include unrelated changes)
- Fix attempt context on re-reviews (attempt number + previous follow-up)
- Response contract instructions

## Stop-marker exclusion

Stop-marker detection (`hasStopMarker`) only runs on implementation and fix agent outputs. Reviewer output is excluded — a reviewer quoting `no_beads_available` in analysis does not terminate the loop.

## Lifecycle phases

When the live renderer is active, agents show review-specific status:

- `reviewing` — reviewer agent is running (shows `REVIEW` badge with bead id)
- `fixing` — fix agent is running after drift (shows `FIX` badge with attempt count)

These phases are surfaced via `setAgentReviewPhase`/`clearAgentReviewPhase` on `LiveRunStateStore` and consumed by both ANSI and Ink renderers.

## Prompt resolution

See [config.md](./config.md#prompt-resolution) for developer and reviewer prompt fallback chains.

## CLI flags

```
--review                       Enable review loop (default: off)
--no-review                    Disable review loop
--review-max-fix-attempts <n>  Max fix attempts per review cycle (default: 5)
--developer-prompt <path>      Developer prompt path
--reviewer-prompt <path>       Reviewer prompt path
```

## Config keys

```toml
reviewEnabled = true
reviewMaxFixAttempts = 3
developerPromptPath = ".ai_agents/prompts/developer.md"
reviewerPromptPath = ".ai_agents/prompts/reviewer.md"
```
