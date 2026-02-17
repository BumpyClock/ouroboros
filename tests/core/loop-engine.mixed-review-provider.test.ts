import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { CliOptions } from '../../core/types';
import type { ProviderAdapter } from '../../providers/types';

const capturedInput: {
  providerName?: string;
  reviewerProviderName?: string;
  command?: string;
  reviewerCommand?: string;
  reviewerPromptPath?: string;
  reviewerModel?: string;
} = {};

const mockPrimaryProvider: ProviderAdapter = {
  name: 'primary',
  displayName: 'Primary Mock',
  defaults: {
    command: 'primary-default',
    logDir: '.',
    model: 'primary-model',
    reasoningEffort: 'medium',
    yolo: false,
  },
  buildExecArgs: () => ['primary'],
  previewEntriesFromLine: () => [],
  collectMessages: () => [],
  collectRawJsonLines: () => [],
  extractUsageSummary: () => null,
  extractRetryDelaySeconds: () => null,
  hasStopMarker: () => false,
  formatCommandHint: (command) => `primary:${command}`,
};

const mockReviewerProvider: ProviderAdapter = {
  name: 'reviewer',
  displayName: 'Reviewer Mock',
  defaults: {
    command: 'reviewer default cmd',
    logDir: '.',
    model: 'reviewer-model-default',
    reasoningEffort: 'high',
    yolo: false,
  },
  buildExecArgs: () => ['reviewer'],
  previewEntriesFromLine: () => [],
  collectMessages: () => [],
  collectRawJsonLines: () => [],
  extractUsageSummary: () => null,
  extractRetryDelaySeconds: () => null,
  hasStopMarker: () => false,
  formatCommandHint: (command) => `reviewer:${command}`,
};

mock.module('../../core/process-runner', () => ({
  resolveRunnableCommand: (command: string) => `resolved:${command}`,
  runAgentProcess: async () => ({ status: 0, stdout: '', stderr: '' }),
  terminateChildProcess: async () => {},
}));

mock.module('../../core/prompts', () => ({
  resolveDeveloperPromptPath: () => '.tmp/dev-prompt.md',
  resolveReviewerPromptPath: () => '.tmp/reviewer-prompt.md',
}));

mock.module('../../providers/registry', () => ({
  getProviderAdapter: (name: string) => {
    if (name === 'primary') {
      return mockPrimaryProvider;
    }
    if (name === 'reviewer') {
      return mockReviewerProvider;
    }
    throw new Error(`unsupported provider in test: ${name}`);
  },
  listProviderNames: () => 'primary,reviewer',
}));

mock.module('../../core/loop-controller', () => ({
  runLoopController: async (input: {
    options: CliOptions;
    provider: ProviderAdapter;
    reviewerProvider: ProviderAdapter;
    reviewerCommand: string;
    command: string;
    reviewerPromptPath?: string;
  }) => {
    capturedInput.providerName = input.provider.name;
    capturedInput.reviewerProviderName = input.reviewerProvider.name;
    capturedInput.command = input.command;
    capturedInput.reviewerCommand = input.reviewerCommand;
    capturedInput.reviewerPromptPath = input.reviewerPromptPath;
    capturedInput.reviewerModel = input.options.reviewerModel;
    return null;
  },
}));

describe('runLoop mixed-review-provider wiring', () => {
  let loopEngineModule: typeof import('../../core/loop-engine') | null = null;

  beforeEach(async () => {
    loopEngineModule = await import('../../core/loop-engine');
    capturedInput.providerName = undefined;
    capturedInput.reviewerProviderName = undefined;
    capturedInput.command = undefined;
    capturedInput.reviewerCommand = undefined;
    capturedInput.reviewerPromptPath = undefined;
    capturedInput.reviewerModel = undefined;
  });

  it('passes reviewer adapter + reviewer command from reviewer provider defaults', async () => {
    const baseOptions: CliOptions = {
      projectRoot: process.cwd(),
      projectKey: 'ouroboros',
      provider: 'primary',
      reviewerProvider: 'reviewer',
      developerPromptPath: '.ai_agents/prompt.md',
      iterationLimit: 1,
      iterationsSet: true,
      previewLines: 2,
      parallelAgents: 1,
      pauseMs: 0,
      command: 'primary run command',
      model: 'primary-model',
      reviewerModel: 'reviewer-model-override',
      reasoningEffort: 'medium',
      yolo: false,
      logDir: '.tmp/review-loop-test',
      showRaw: false,
      reviewEnabled: true,
      reviewMaxFixAttempts: 5,
    };

    await loopEngineModule!.runLoop(baseOptions, mockPrimaryProvider);

    expect(capturedInput.providerName).toBe('primary');
    expect(capturedInput.reviewerProviderName).toBe('reviewer');
    expect(capturedInput.command).toBe('resolved:primary run command');
    expect(capturedInput.reviewerCommand).toBe('resolved:reviewer default cmd');
    expect(capturedInput.reviewerModel).toBe('reviewer-model-override');
    expect(capturedInput.reviewerPromptPath).toBe('.tmp/reviewer-prompt.md');
  });

  it('uses primary command when reviewer provider is the same provider', async () => {
    const sameProviderOptions: CliOptions = {
      projectRoot: process.cwd(),
      projectKey: 'ouroboros',
      provider: 'primary',
      reviewerProvider: 'primary',
      developerPromptPath: '.ai_agents/prompt.md',
      iterationLimit: 1,
      iterationsSet: true,
      previewLines: 2,
      parallelAgents: 1,
      pauseMs: 0,
      command: 'primary run command',
      model: 'primary-model',
      reviewerModel: '',
      reasoningEffort: 'medium',
      yolo: false,
      logDir: '.tmp/review-loop-test',
      showRaw: false,
      reviewEnabled: true,
      reviewMaxFixAttempts: 5,
    };

    await loopEngineModule!.runLoop(sameProviderOptions, mockPrimaryProvider);

    expect(capturedInput.command).toBe('resolved:primary run command');
    expect(capturedInput.reviewerCommand).toBe('resolved:primary run command');
    expect(capturedInput.reviewerProviderName).toBe('primary');
  });
});
