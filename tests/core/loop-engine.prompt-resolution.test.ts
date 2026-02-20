import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { type RunLoopDependencies, runLoop } from '../../core/loop-engine';
import { resolveBuiltinPromptPath } from '../../core/prompts';
import type { CliOptions } from '../../core/types';
import { getProviderAdapter as getRealProviderAdapter } from '../../providers/registry';
import type { ProviderAdapter } from '../../providers/types';

type CapturedLoopInput = {
  promptPath?: string;
  reviewerPromptPath?: string;
};

const captured: CapturedLoopInput = {};

const mockProvider: ProviderAdapter = {
  name: 'mock',
  displayName: 'Mock Provider',
  defaults: {
    command: 'mock default',
    logDir: '.',
    model: 'mock-model',
    reasoningEffort: 'medium',
    yolo: false,
  },
  buildExecArgs: () => ['mock'],
  previewEntriesFromLine: () => [],
  collectMessages: () => [],
  collectRawJsonLines: () => [],
  extractUsageSummary: () => null,
  extractRetryDelaySeconds: () => null,
  hasStopMarker: () => false,
  formatCommandHint: (command) => `mock:${command}`,
};

const baseOptions: CliOptions = {
  projectRoot: process.cwd(),
  projectKey: 'ouroboros',
  provider: 'mock',
  reviewerProvider: 'mock',
  iterationLimit: 1,
  iterationsSet: true,
  previewLines: 2,
  parallelAgents: 1,
  pauseMs: 0,
  command: 'mock command',
  model: 'mock-model',
  reviewerModel: 'mock-reviewer-model',
  reasoningEffort: 'medium',
  yolo: false,
  logDir: '.tmp/prompt-resolution',
  showRaw: false,
  reviewEnabled: true,
  reviewMaxFixAttempts: 5,
};

function buildDeps(): RunLoopDependencies {
  captured.promptPath = undefined;
  captured.reviewerPromptPath = undefined;
  return {
    getProviderAdapter: (name: string) => {
      if (name === 'mock') {
        return mockProvider;
      }
      return getRealProviderAdapter(name);
    },
    resolveRunnableCommand: (command: string) => `resolved:${command}`,
    runLoopController: async (input) => {
      captured.promptPath = input.promptPath;
      captured.reviewerPromptPath = input.reviewerPromptPath;
      return null;
    },
  };
}

describe('runLoop prompt-resolution regression coverage', () => {
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ouroboros-prompt-resolution-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    if (originalCwd) {
      process.chdir(originalCwd);
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('uses built-in prompts when no local prompt files exist', async () => {
    await runLoop(
      {
        ...baseOptions,
        developerPromptPath: undefined,
        reviewerPromptPath: undefined,
      },
      mockProvider,
      buildDeps(),
    );
    expect(captured.promptPath).toBe(resolveBuiltinPromptPath('developer'));
    expect(captured.reviewerPromptPath).toBe(resolveBuiltinPromptPath('reviewer'));
  });

  test('throws clear startup error for missing explicit developer prompt path', async () => {
    await expect(
      runLoop(
        {
          ...baseOptions,
          reviewEnabled: false,
          developerPromptPath: 'missing/developer.md',
        },
        mockProvider,
        buildDeps(),
      ),
    ).rejects.toThrow(/No developer prompt found/);
  });

  test('throws clear startup error for missing explicit reviewer prompt path', async () => {
    await expect(
      runLoop(
        {
          ...baseOptions,
          reviewerPromptPath: 'missing/reviewer.md',
        },
        mockProvider,
        buildDeps(),
      ),
    ).rejects.toThrow(/Reviewer prompt file not found/);
  });
});
