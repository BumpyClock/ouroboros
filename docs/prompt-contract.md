# Default Prompt Contract

Read when: changing default prompt content, review-loop parsing, or prompt resolution behavior.

This document defines the canonical default prompt content contract for Ouroboros.

## Provenance

- Developer/reviewer defaults derive from `C:\Users\adity\Projects\dotfiles\.ai_agents\prompts\ralph.md`.
- Ouroboros-specific adaptation files:
  - `docs/prompts/developer.default.md`
  - `docs/prompts/reviewer.default.md`

## Canonical default prompt files

- Developer default text (canonical): `docs/prompts/developer.default.md`
- Reviewer default text (canonical): `docs/prompts/reviewer.default.md`
- Runtime default locations: `.ai_agents/prompts/developer.md`, `.ai_agents/prompts/reviewer.md`
- Legacy developer fallback: `.ai_agents/prompt.md`
- Built-in fallback files: `docs/prompts/developer.default.md`, `docs/prompts/reviewer.default.md`

Resolution order remains documented in `docs/config.md`.

## Reviewer response contract (normative)

Reviewer default prompt requires a single JSON object:

```json
{"verdict":"pass|drift","followUpPrompt":"string"}
```

Contract rules:
- Exactly one JSON object.
- `verdict` allowed values: `pass`, `drift`.
- `followUpPrompt` required non-empty string.
- No markdown wrappers or extra text.

Runtime parser behavior is documented in `docs/review-loop.md`. Prompt authors should still preserve JSON-only output to minimize ambiguity.

## Safety constraints (normative)

Default prompt content must not require side-effect-heavy repo operations unless explicitly requested by user/project policy, including:
- forced push
- tag/release creation
- history rewrite
- unrelated repo-wide refactors

Default prompts should bias toward bounded, single-bead, verification-backed work.
