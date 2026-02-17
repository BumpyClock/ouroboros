import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { resolveBuiltinPromptPath } from '../../core/prompts';
import type { CliOptions } from '../../core/types';
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

mock.module('../../core/process-runner', () => ({
  resolveRunnableCommand: (command: string) => `resolved:${command}`,
  runAgentProcess: async () => ({ status: 0, stdout: '', stderr: '' }),
  terminateChildProcess: async () => {},
}));

mock.module('../../core/loop-controller', () => ({
  runLoopController: async (input: {
    options: CliOptions;
    provider: ProviderAdapter;
    reviewerProvider: ProviderAdapter;
    promptPath: string;
    reviewerPromptPath?: string;
  }) => {
    captured.promptPath = input.promptPath;
    captured.reviewerPromptPath = input.reviewerPromptPath;
    return null;
  },
}));

mock.module('../../providers/registry', () => ({
  getProviderAdapter: (name: string) => {
    if (name === 'mock') {
      return mockProvider;
    }
    throw new Error(`unexpected provider in test: ${name}`);
  },
  listProviderNames: () => 'mock',
}));

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

describe('runLoop prompt-resolution regression coverage', () => {
  let loopEngineModule: typeof import('../../core/loop-engine') | null = null;
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(async () => {
    loopEngineModule = await import('../../core/loop-engine');
    captured.promptPath = undefined;
    captured.reviewerPromptPath = undefined;
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(path.join(tmpdir(), 'ouroboros-prompt-resolution-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('uses built-in prompts when no local prompt files exist', async () => {
    if (!loopEngineModule) {
      throw new Error('failed to import loop-engine module');
    }
    await loopEngineModule.runLoop(
      {
        ...baseOptions,
        developerPromptPath: undefined,
        reviewerPromptPath: undefined,
      },
      mockProvider,
    );
    expect(captured.promptPath).toBe(resolveBuiltinPromptPath('developer'));
    expect(captured.reviewerPromptPath).toBe(resolveBuiltinPromptPath('reviewer'));
  });

  test('throws clear startup error for missing explicit developer prompt path', async () => {
    if (!loopEngineModule) {
      throw new Error('failed to import loop-engine module');
    }
    await expect(() =>
      loopEngineModule.runLoop(
        {
          ...baseOptions,
          reviewEnabled: false,
          developerPromptPath: 'missing/developer.md',
        },
        mockProvider,
      ),
    ).rejects.toThrow(/No developer prompt found/);
  });

  test('throws clear startup error for missing explicit reviewer prompt path', async () => {
    if (!loopEngineModule) {
      throw new Error('failed to import loop-engine module');
    }
    await expect(() =>
      loopEngineModule.runLoop(
        {
          ...baseOptions,
          reviewerPromptPath: 'missing/reviewer.md',
        },
        mockProvider,
      ),
    ).rejects.toThrow(/Reviewer prompt file not found/);
  });
});
