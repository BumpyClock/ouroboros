import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export type PromptInitResult = {
  role: PromptRole;
  path: string;
  action: 'written' | 'skipped';
};

export function resolvePromptFilePath(cwd: string, role: PromptRole): string {
  return path.resolve(cwd, PROMPTS_DIR, `${role}.md`);
}

export function initializeBuiltinPrompts(
  cwd: string,
  options: {
    force?: boolean;
    roles?: PromptRole[];
  } = {},
): PromptInitResult[] {
  const roles = options.roles ?? ['developer', 'reviewer'];
  const force = options.force ?? false;

  return roles.map((role) => {
    const target = resolvePromptFilePath(cwd, role);
    const source = resolveBuiltinPromptPath(role);
    if (!force && existsSync(target)) {
      return { role, path: target, action: 'skipped' };
    }

    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(source, 'utf8'));
    return { role, path: target, action: 'written' };
  });
}

/**
 * Resolve a prompt file path for a given role.
 *
 * Fallback order:
 *   1. explicitPath (CLI / config override) — resolved against cwd
 *   2. .ai_agents/prompts/{role}.md         — role-specific default
 *   3. .ai_agents/prompt.md                 — legacy (developer only)
 *   4. docs/prompts/{role}.default.md       — built-in fallback
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

  const builtin = resolveBuiltinPromptPath(role);
  if (existsSync(builtin)) {
    return builtin;
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
      `No developer prompt found. Provide --prompt / --developer-prompt, create ${PROMPTS_DIR}/developer.md or ${LEGACY_PROMPT}, or run with built-in docs prompts.`,
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
