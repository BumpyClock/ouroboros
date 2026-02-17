# Claude tool-use classification from stream-json (2026-02-17)

## Symptom

Claude provider live preview showed tool calls as `ASSISTANT` instead of `TOOL`.

## Root cause

`providers/claude.ts` classified entries using top-level `event.type`.

In Claude stream-json logs, tool calls can be emitted as:

- top-level `type: "assistant"`
- nested `message.content[].type: "tool_use"`

So tool calls were mapped to assistant events.

## Fix

- Infer event kind from nested content types first (`tool_use`, `thinking`/`reason`, `error`)
- Fall back to top-level/message type only when nested types do not provide a stronger signal

## Regression test

- `providers/claude.test.ts`: assistant event with nested `tool_use` must classify as `tool`
