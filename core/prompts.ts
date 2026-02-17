import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export type PromptRole = 'developer' | 'reviewer';

const PROMPTS_DIR = '.ai_agents/prompts';
const LEGACY_PROMPT = '.ai_agents/prompt.md';
const BUILTIN_PROMPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'prompts',
);
const BUILTIN_DEVELOPER_PROMPT_PATH = path.join(BUILTIN_PROMPTS_DIR, 'developer.default.md');
const BUILTIN_REVIEWER_PROMPT_PATH = path.join(BUILTIN_PROMPTS_DIR, 'reviewer.default.md');

export function resolveBuiltinPromptPath(role: PromptRole): string {
  return role === 'developer' ? BUILTIN_DEVELOPER_PROMPT_PATH : BUILTIN_REVIEWER_PROMPT_PATH;
}

export function readBuiltinPrompt(role: PromptRole): string {
  return readFileSync(resolveBuiltinPromptPath(role), 'utf8');
}

/**
 * Resolve a prompt file path for a given role.
 *
 * Fallback order:
 *   1. explicitPath (CLI / config override) — resolved against cwd
 *   2. .ai_agents/prompts/{role}.md         — role-specific default
 *   3. .ai_agents/prompt.md                 — legacy (developer only)
 *
 * Returns the first existing absolute path, or null if none found.
 */
export function resolvePromptPath(
  role: PromptRole,
  cwd: string,
  explicitPath?: string,
): string | null {
  if (explicitPath) {
    const resolved = path.resolve(cwd, explicitPath);
    if (existsSync(resolved)) {
      return resolved;
    }
    // Explicit path given but missing — return it so caller can emit a clear error
    return resolved;
  }

  const roleDefault = path.resolve(cwd, PROMPTS_DIR, `${role}.md`);
  if (existsSync(roleDefault)) {
    return roleDefault;
  }

  if (role === 'developer') {
    const legacy = path.resolve(cwd, LEGACY_PROMPT);
    if (existsSync(legacy)) {
      return legacy;
    }
  }

  return null;
}

/**
 * Resolve developer prompt path — throws if no prompt file is found.
 */
export function resolveDeveloperPromptPath(cwd: string, explicitPath?: string): string {
  const resolved = resolvePromptPath('developer', cwd, explicitPath);
  if (!resolved) {
    throw new Error(
      `No developer prompt found. Provide --prompt / --developer-prompt or create ${PROMPTS_DIR}/developer.md or ${LEGACY_PROMPT}`,
    );
  }
  return resolved;
}

/**
 * Resolve reviewer prompt path — returns null when unset and no default exists.
 */
export function resolveReviewerPromptPath(cwd: string, explicitPath?: string): string | null {
  return resolvePromptPath('reviewer', cwd, explicitPath);
}
