import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  initializeBuiltinPrompts,
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

  test('developer default advertises one-task loop execution discipline', () => {
    const developerDefault = readBuiltinPrompt('developer');
    expect(developerDefault).toContain('One loop iteration = one meaningful task');
    expect(developerDefault).toContain('Pick exactly one task');
    expect(developerDefault).toContain('no_tasks_available');
    expect(developerDefault).toContain('tsq ready --lane coding');
  });

  test('reviewer default enforces strict JSON verdict contract', () => {
    const reviewerDefault = readBuiltinPrompt('reviewer');
    expect(reviewerDefault).toContain('Return exactly one JSON object');
    expect(reviewerDefault).toContain('"verdict":"pass|drift"');
    expect(reviewerDefault).toContain('"followUpPrompt":"string"');
    expect(reviewerDefault).toContain('No markdown, no code fences');
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
    expect(result).toBe(resolveBuiltinPromptPath('reviewer'));
  });

  test('falls back to built-in prompt when no role files exist', () => {
    setup();
    const result = resolvePromptPath('developer', tmpDir);
    expect(result).toBe(resolveBuiltinPromptPath('developer'));
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

  test('falls back to built-in prompt when no local prompt exists', () => {
    setup();
    const result = resolveDeveloperPromptPath(tmpDir);
    expect(result).toBe(resolveBuiltinPromptPath('developer'));
  });

  test('throws when explicit developer prompt path is missing', () => {
    setup();
    expect(() => resolveDeveloperPromptPath(tmpDir, 'missing/developer.md')).toThrow(
      /No developer prompt found/,
    );
  });
});

describe('initializeBuiltinPrompts', () => {
  afterEach(teardown);

  test('writes built-in prompts when missing', () => {
    setup();
    const results = initializeBuiltinPrompts(tmpDir);
    const developerTarget = path.join(tmpDir, '.ai_agents', 'prompts', 'developer.md');
    const reviewerTarget = path.join(tmpDir, '.ai_agents', 'prompts', 'reviewer.md');
    expect(results).toHaveLength(2);
    expect(results.some((entry) => entry.role === 'developer' && entry.action === 'written')).toBe(
      true,
    );
    expect(results.some((entry) => entry.role === 'reviewer' && entry.action === 'written')).toBe(
      true,
    );
    expect(existsSync(developerTarget)).toBe(true);
    expect(existsSync(reviewerTarget)).toBe(true);
    expect(readFileSync(developerTarget, 'utf8')).toBe(readBuiltinPrompt('developer'));
    expect(readFileSync(reviewerTarget, 'utf8')).toBe(readBuiltinPrompt('reviewer'));
  });

  test('skips existing prompts without force', () => {
    setup();
    const promptsDir = path.join(tmpDir, '.ai_agents', 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    const developerTarget = path.join(promptsDir, 'developer.md');
    const reviewerTarget = path.join(promptsDir, 'reviewer.md');
    writeFileSync(developerTarget, '# custom developer');
    writeFileSync(reviewerTarget, '# custom reviewer');

    const results = initializeBuiltinPrompts(tmpDir);
    expect(results).toEqual([
      { role: 'developer', path: developerTarget, action: 'skipped' },
      { role: 'reviewer', path: reviewerTarget, action: 'skipped' },
    ]);
    expect(readFileSync(developerTarget, 'utf8')).toBe('# custom developer');
    expect(readFileSync(reviewerTarget, 'utf8')).toBe('# custom reviewer');
  });

  test('overwrites prompts when force is enabled', () => {
    setup();
    const promptsDir = path.join(tmpDir, '.ai_agents', 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    const developerTarget = path.join(promptsDir, 'developer.md');
    const reviewerTarget = path.join(promptsDir, 'reviewer.md');
    writeFileSync(developerTarget, '# custom developer');
    writeFileSync(reviewerTarget, '# custom reviewer');

    const results = initializeBuiltinPrompts(tmpDir, { force: true });
    expect(results).toEqual([
      { role: 'developer', path: developerTarget, action: 'written' },
      { role: 'reviewer', path: reviewerTarget, action: 'written' },
    ]);
    expect(readFileSync(developerTarget, 'utf8')).toBe(readBuiltinPrompt('developer'));
    expect(readFileSync(reviewerTarget, 'utf8')).toBe(readBuiltinPrompt('reviewer'));
  });
});

describe('resolveReviewerPromptPath', () => {
  afterEach(teardown);

  test('falls back to built-in reviewer prompt when no local prompt exists', () => {
    setup();
    const result = resolveReviewerPromptPath(tmpDir);
    expect(result).toBe(resolveBuiltinPromptPath('reviewer'));
  });

  test('returns path when reviewer prompt exists', () => {
    setup();
    const promptsDir = path.join(tmpDir, '.ai_agents', 'prompts');
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(path.join(promptsDir, 'reviewer.md'), '# reviewer');
    const result = resolveReviewerPromptPath(tmpDir);
    expect(result).toBe(path.join(promptsDir, 'reviewer.md'));
  });

  test('preserves explicit path for missing reviewer prompt input', () => {
    setup();
    const result = resolveReviewerPromptPath(tmpDir, 'missing/reviewer.md');
    expect(result).toBe(path.resolve(tmpDir, 'missing/reviewer.md'));
  });
});
