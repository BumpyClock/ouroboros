# Claude `stream-json` requires `--verbose` (2026-02-17)

## Symptom

When running Claude provider agents with print mode and stream-json output:

`Error: When using --print, --output-format=stream-json requires --verbose`

## Root cause

`providers/claude.ts` passed:

- `-p` (print mode)
- `--output-format stream-json`

but did not pass `--verbose`.

## Fix

Keep stream-json output and always append `--verbose` in Claude adapter args.

## Sources

- Claude CLI reference: https://docs.anthropic.com/en/docs/claude-code/cli-reference
- Claude output formats: https://docs.anthropic.com/en/docs/claude-code/output-formats
