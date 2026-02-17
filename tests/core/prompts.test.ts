import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  readBuiltinPrompt,
  resolveBuiltinPromptPath,
  resolveDeveloperPromptPath,
  resolvePromptPath,
  resolveReviewerPromptPath,
} from '../../core/prompts';

describe('builtin prompt assets', () => {
  test('has versioned developer and reviewer defaults', () => {
    expect(existsSync(resolveBuiltinPromptPath('developer'))).toBe(true);
    expect(existsSync(resolveBuiltinPromptPath('reviewer'))).toBe(true);
  });

  test('can read built-in defaults', () => {
    const developerDefault = readBuiltinPrompt('developer');
    const reviewerDefault = readBuiltinPrompt('reviewer');
    expect(developerDefault.trim()).toBeTruthy();
    expect(reviewerDefault.trim()).toBeTruthy();
  });
});

let tmpDir: string;

function setup() {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'prompts-test-'));
}

function teardown() {
  rmSync(tmpDir, { recursive: true, force: true });
}

describe('resolvePromptPath', () => {
  afterEach(teardown);

  test('returns explicit path when file exists', () => {
    setup();
    const explicit = path.join(tmpDir, 'custom.md');
    writeFileSync(explicit, '# custom');
    const result = resolvePromptPath('developer', tmpDir, explicit);
    expect(result).toBe(explicit);
  });

  test('returns resolved explicit path even when file is missing (for error reporting)', () => {
    setup();
    const result = resolvePromptPath('developer', tmpDir, 'missing/prompt.md');
    expect(result).toBe(path.resolve(tmpDir, 'missing/prompt.md'));
  });

  test('falls back to role-specific default', () => {
    setup();
    const promptsDir = path.join(tmpDir, '.ai_agents', 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(path.join(promptsDir, 'developer.md'), '# dev');
    const result = resolvePromptPath('developer', tmpDir);
    expect(result).toBe(path.join(promptsDir, 'developer.md'));
  });

  test('falls back to legacy prompt for developer role', () => {
    setup();
    const legacyDir = path.join(tmpDir, '.ai_agents');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(path.join(legacyDir, 'prompt.md'), '# legacy');
    const result = resolvePromptPath('developer', tmpDir);
    expect(result).toBe(path.join(legacyDir, 'prompt.md'));
  });

  test('does NOT fall back to legacy prompt for reviewer role', () => {
    setup();
    const legacyDir = path.join(tmpDir, '.ai_agents');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(path.join(legacyDir, 'prompt.md'), '# legacy');
    const result = resolvePromptPath('reviewer', tmpDir);
    expect(result).toBeNull();
  });

  test('returns null when no files exist', () => {
    setup();
    const result = resolvePromptPath('developer', tmpDir);
    expect(result).toBeNull();
  });

  test('prefers explicit path over role default', () => {
    setup();
    const promptsDir = path.join(tmpDir, '.ai_agents', 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(path.join(promptsDir, 'developer.md'), '# role default');
    const explicit = path.join(tmpDir, 'override.md');
    writeFileSync(explicit, '# override');
    const result = resolvePromptPath('developer', tmpDir, explicit);
    expect(result).toBe(explicit);
  });

  test('prefers role default over legacy', () => {
    setup();
    const promptsDir = path.join(tmpDir, '.ai_agents', 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(path.join(promptsDir, 'developer.md'), '# role');
    const legacyDir = path.join(tmpDir, '.ai_agents');
    writeFileSync(path.join(legacyDir, 'prompt.md'), '# legacy');
    const result = resolvePromptPath('developer', tmpDir);
    expect(result).toBe(path.join(promptsDir, 'developer.md'));
  });

  test('resolves reviewer role-specific default', () => {
    setup();
    const promptsDir = path.join(tmpDir, '.ai_agents', 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(path.join(promptsDir, 'reviewer.md'), '# reviewer');
    const result = resolvePromptPath('reviewer', tmpDir);
    expect(result).toBe(path.join(promptsDir, 'reviewer.md'));
  });
});

describe('resolveDeveloperPromptPath', () => {
  afterEach(teardown);

  test('returns path when found', () => {
    setup();
    const legacyDir = path.join(tmpDir, '.ai_agents');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(path.join(legacyDir, 'prompt.md'), '# dev');
    const result = resolveDeveloperPromptPath(tmpDir);
    expect(result).toBe(path.join(legacyDir, 'prompt.md'));
  });

  test('throws when no prompt found', () => {
    setup();
    expect(() => resolveDeveloperPromptPath(tmpDir)).toThrow(/No developer prompt found/);
  });
});

describe('resolveReviewerPromptPath', () => {
  afterEach(teardown);

  test('returns null when no reviewer prompt exists', () => {
    setup();
    const result = resolveReviewerPromptPath(tmpDir);
    expect(result).toBeNull();
  });

  test('returns path when reviewer prompt exists', () => {
    setup();
    const promptsDir = path.join(tmpDir, '.ai_agents', 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(path.join(promptsDir, 'reviewer.md'), '# reviewer');
    const result = resolveReviewerPromptPath(tmpDir);
    expect(result).toBe(path.join(promptsDir, 'reviewer.md'));
  });
});
