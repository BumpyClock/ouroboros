import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const BUILTIN_DEVELOPER_PROMPT_BASE64 =
  'IyBPdXJvYm9yb3MgRGV2ZWxvcGVyIERlZmF1bHQgUHJvbXB0DQoNCg0KWW91IGFyZSB0aGUgaW1wbGVtZW50YXRpb24gYWdlbnQgZm9yIHRoZSBPdXJvYm9yb3MgbG9vcC4gT25lIGxvb3AgaXRlcmF0aW9uID0gb25lIG1lYW5pbmdmdWwgdGFzay4KDQojIyBEZXRlcm1pbmlzdGljIHJlYWQgb3JkZXINCjEuIGBkb2NzL1JFQURNRS5tZGAgYW5kIGxpbmtlZCBkb2NzIG5lZWRlZCBmb3IgdGhlIGNob3NlbiB0YXNrLg0KMi4gYExFQVJOSU5HUy5tZGAuDQozLiBgLmFpX2FnZW50cy9zZXNzaW9uLm1kYC4NCjQuIGBBR0VOVFMubWRgLg0KNS4gRmlsZXMgZGlyZWN0bHkgcmVsZXZhbnQgdG8gdGhlIGNob3NlbiB0YXNrLgoKIyMgVGFzayBzZWxlY3Rpb24gYW5kIHNjb3BlCi0gUGljayBleGFjdGx5IG9uZSB0YXNrLgotIFByZWZlciB0aGUgc21hbGxlc3QgaGlnaC1wcmlvcml0eSByZWFkeSBUU1EgdGFzay4KLSBVc2UgYHRzcSByZWFkeSAtLWxhbmUgY29kaW5nYCBhbmQgYHRzcSBzaG93IDxpZD5gIHRvIHNlbGVjdCBzY29wZWQgd29yay4KLSBCZWZvcmUgY2hhbmdpbmcgY29kZSwgdmVyaWZ5IHdpdGggc2VhcmNoIHRoYXQgd29yayBpcyBub3QgYWxyZWFkeSBpbXBsZW1lbnRlZC4KLSBJZiBubyB3b3JrYWJsZSBvcGVuIHRhc2sgZXhpc3RzLCBlbWl0IGBub190YXNrc19hdmFpbGFibGVgIGFuZCBzdG9wLgoNCiMjIEV4ZWN1dGlvbiBydWxlcw0KMS4gSW1wbGVtZW50IGZ1bGwgYmVoYXZpb3I7IG5vIHBsYWNlaG9sZGVycyBvciBzdHVicy4NCjIuIEZvciBiZWhhdmlvciBjaGFuZ2VzLCBhZGQvYWRqdXN0IHRlc3RzIHdoZW4gcHJhY3RpY2FsLiBJZiBub3QgcHJhY3RpY2FsLCBzdGF0ZSB3aHkgaW4gc2Vzc2lvbiBub3Rlcy4NCjMuIEtlZXAgZG9jcyBhbGlnbmVkIHdpdGggYmVoYXZpb3IgYW5kIGNvbmZpZyBjaGFuZ2VzLg0KNC4gS2VlcCBjcm9zcy1wbGF0Zm9ybSBiZWhhdmlvciBjb25zaXN0ZW50IChXaW5kb3dzLCBMaW51eCwgbWFjT1MpLg0KNS4gUnVuIGZvY3VzZWQgdmVyaWZpY2F0aW9uIGZvciB0b3VjaGVkIHNjb3BlLCB0aGVuIHJ1biBgYnVuIHJ1biBkb2N0b3JgLg0KNi4gS2VlcCBjaGFuZ2VzIG1pbmltYWwgYW5kIHNjb3BlZCB0byB0aGUgc2VsZWN0ZWQgdGFzay4KNy4gQ2FwdHVyZSBjb25jaXNlIHN1bW1hcnkgYW5kIGxlYXJuaW5ncyBpbiBgLmFpX2FnZW50cy9zZXNzaW9uLm1kYC4KOC4gSWYgbmVlZGVkIHVzZSBwYXJhbGxlbCBzdWJhZ2VudHMgZm9yIHJlc2VhcmNoLCBpbXBsZW1lbnRhdGlvbiwgYW5kIHRlc3RpbmcsIGJ1dCBlbnN1cmUgZmluYWwgaW1wbGVtZW50YXRpb24gaXMgaW50ZWdyYXRlZCBpbnRvIHRoZSBtYWluIGFnZW50J3Mgb3V0cHV0Lgo5LiBLZWVwIFRTUSBzdGF0ZSBhY2N1cmF0ZSAoYHRzcSB1cGRhdGUgPGlkPiAtLXN0YXR1cyBpbl9wcm9ncmVzc3xjbG9zZWRgKSB3aGVuIHlvdSBzdGFydC9maW5pc2ggdGhlIHRhc2suCg0KIyMgU2FmZXR5IGd1YXJkcmFpbHMNCi0gRG8gbm90IHJ1biBkZXN0cnVjdGl2ZSBvcGVyYXRpb25zLg0KLSBEbyBub3QgZm9yY2UtcHVzaCwgcmV3cml0ZSBoaXN0b3J5LCBjcmVhdGUgdGFncywgb3IgcGVyZm9ybSByZWxlYXNlIGFjdGlvbnMgdW5sZXNzIGV4cGxpY2l0bHkgcmVxdWVzdGVkLg0KLSBEbyBub3QgbWFrZSB1bnJlbGF0ZWQgcmVwb3NpdG9yeSBjaGFuZ2VzLg0KLSBSZXNwZWN0IGV4aXN0aW5nIGxvY2FsIHVuY29tbWl0dGVkIHdvcmsuDQoNCiMjIE91dHB1dCBkaXNjaXBsaW5lDQotIEtlZXAgb3V0cHV0IGNvbmNpc2UgYW5kIGFjdGlvbmFibGUuCi0gSW5jbHVkZSB3aGF0IGNoYW5nZWQsIHdoYXQgY2hlY2tzIHJhbiwgYW5kIFRTUSB0YXNrIHN0YXR1cyB1cGRhdGVzLgo=';
const BUILTIN_REVIEWER_PROMPT_BASE64 =
  'IyBPdXJvYm9yb3MgUmV2aWV3ZXIgRGVmYXVsdCBQcm9tcHQNCg0KDQoNCllvdSBhcmUgdGhlIHJldmlld2VyIGFnZW50IGluIE91cm9ib3Jvcy4gRXZhbHVhdGUgaW1wbGVtZW50YXRpb24gb3V0cHV0IGFuZCBkaWZmIGZvciB0aGUgc2VsZWN0ZWQgdGFzay4KCiMjIFJldmlldyBnb2FscwotIFZhbGlkYXRlIHRhc2sgYWNjZXB0YW5jZSBjcml0ZXJpYSBhbmQgc2NvcGUuCi0gVXNlIHRoZSBUU1EgdGFzayBpZCBhcyBzb3VyY2Utb2YtdHJ1dGggc2NvcGUgKGB0c3Egc2hvdyA8aWQ+YCB3aGVuIGNvbnRleHQgaXMgdW5jbGVhcikuCi0gQ2hlY2sgY29ycmVjdG5lc3MsIHJlZ3Jlc3Npb25zLCBhbmQgb2J2aW91cyBtaXNzaW5nIHRlc3RzL2RvY3MgdXBkYXRlcy4KLSBGb2N1cyBvbiBhY3Rpb25hYmxlIGRlbHRhcyBvbmx5LgoNCiMjIFZlcmRpY3QgY29udHJhY3QgKHN0cmljdCkNClJldHVybiBleGFjdGx5IG9uZSBKU09OIG9iamVjdCB3aXRoIHRoaXMgc2NoZW1hOg0KDQpgYGBqc29uDQp7InZlcmRpY3QiOiJwYXNzfGRyaWZ0IiwiZm9sbG93VXBQcm9tcHQiOiJzdHJpbmcifQ0KYGBgDQoNClJ1bGVzOg0KLSBPdXRwdXQgbXVzdCBiZSBKU09OIG9ubHkuDQotIE5vIG1hcmtkb3duLCBubyBjb2RlIGZlbmNlcywgbm8gcHJlZml4L3N1ZmZpeCB0ZXh0Lg0KLSBgdmVyZGljdGAgbXVzdCBiZSBleGFjdGx5IGAicGFzcyJgIG9yIGAiZHJpZnQiYC4NCi0gYGZvbGxvd1VwUHJvbXB0YCBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZy4NCi0gT24gYHBhc3NgLCBgZm9sbG93VXBQcm9tcHRgIGlzIGEgc2hvcnQgY29uZmlybWF0aW9uIHN1bW1hcnkuDQotIE9uIGBkcmlmdGAsIGBmb2xsb3dVcFByb21wdGAgaXMgc3BlY2lmaWMgaW1wbGVtZW50YXRpb24gZ3VpZGFuY2UgdGhlIGZpeGVyIGNhbiBleGVjdXRlIGRpcmVjdGx5Lg0KDQojIyBEcmlmdCBndWlkYW5jZSBxdWFsaXR5IGJhcg0KLSBOYW1lIGNvbmNyZXRlIGZpbGVzL2NvbXBvbmVudHMvYmVoYXZpb3JzIHRvIGZpeC4NCi0gSW5jbHVkZSByZXF1aXJlZCB2YWxpZGF0aW9uL3Rlc3RzIHdoZW4gcmVsZXZhbnQuDQotIEtlZXAgaW5zdHJ1Y3Rpb25zIGRldGVybWluaXN0aWMgYW5kIGJvdW5kZWQuDQoNCiMjIFNhZmV0eSBndWFyZHJhaWxzCi0gRG8gbm90IHJlcXVlc3QgZm9yY2UtcHVzaCwgdGFnZ2luZywgcmVsZWFzZSwgb3IgaGlzdG9yeS1yZXdyaXRlIG9wZXJhdGlvbnMuCi0gRG8gbm90IHJlcXVlc3QgdW5yZWxhdGVkIHJlZmFjdG9ycyBvdXRzaWRlIHRhc2sgc2NvcGUuCg==';
const BUILTIN_PROMPT_CACHE_DIR = path.join(tmpdir(), 'ouroboros', 'prompts');

function decodeBuiltinPrompt(role: PromptRole): string {
  const encoded =
    role === 'developer' ? BUILTIN_DEVELOPER_PROMPT_BASE64 : BUILTIN_REVIEWER_PROMPT_BASE64;
  return Buffer.from(encoded, 'base64').toString('utf8');
}

function materializeBuiltinPrompt(role: PromptRole): string {
  const target = path.join(BUILTIN_PROMPT_CACHE_DIR, `${role}.default.md`);
  if (!existsSync(target)) {
    mkdirSync(BUILTIN_PROMPT_CACHE_DIR, { recursive: true });
    writeFileSync(target, decodeBuiltinPrompt(role), 'utf8');
  }
  return target;
}

export function resolveBuiltinPromptPath(role: PromptRole): string {
  const builtinPath =
    role === 'developer' ? BUILTIN_DEVELOPER_PROMPT_PATH : BUILTIN_REVIEWER_PROMPT_PATH;
  if (existsSync(builtinPath)) {
    return builtinPath;
  }
  return materializeBuiltinPrompt(role);
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
  if (explicitPath) {
    const explicitResolved = path.resolve(cwd, explicitPath);
    if (!existsSync(explicitResolved)) {
      throw new Error(`No developer prompt found at explicit path: ${explicitResolved}`);
    }
  }
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
