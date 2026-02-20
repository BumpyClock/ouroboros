import { describe, expect, it } from 'bun:test';
import { type RunLoopDependencies, runLoop } from '../../core/loop-engine';
import * as realPrompts from '../../core/prompts';
import type { CliOptions } from '../../core/types';
import {
  getProviderAdapter as getRealProviderAdapter,
  listProviderNames as listRealProviderNames,
} from '../../providers/registry';
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

function buildDeps(): RunLoopDependencies {
  capturedInput.providerName = undefined;
  capturedInput.reviewerProviderName = undefined;
  capturedInput.command = undefined;
  capturedInput.reviewerCommand = undefined;
  capturedInput.reviewerPromptPath = undefined;
  capturedInput.reviewerModel = undefined;

  return {
    getProviderAdapter: (name: string) => {
      if (name === 'primary') {
        return mockPrimaryProvider;
      }
      if (name === 'reviewer') {
        return mockReviewerProvider;
      }
      return getRealProviderAdapter(name);
    },
    resolveRunnableCommand: (command: string) => `resolved:${command}`,
    runLoopController: async (input) => {
      capturedInput.providerName = input.provider.name;
      capturedInput.reviewerProviderName = input.reviewerProvider.name;
      capturedInput.command = input.command;
      capturedInput.reviewerCommand = input.reviewerCommand;
      capturedInput.reviewerPromptPath = input.reviewerPromptPath;
      capturedInput.reviewerModel = input.options.reviewerModel;
      return null;
    },
  };
}

describe('runLoop mixed-review-provider wiring', () => {
  it('passes reviewer adapter + reviewer command from reviewer provider defaults', async () => {
    const baseOptions: CliOptions = {
      projectRoot: process.cwd(),
      projectKey: 'ouroboros',
      provider: 'primary',
      reviewerProvider: 'reviewer',
      developerPromptPath: undefined,
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

    await runLoop(baseOptions, mockPrimaryProvider, buildDeps());

    expect(capturedInput.providerName).toBe('primary');
    expect(capturedInput.reviewerProviderName).toBe('reviewer');
    expect(capturedInput.command).toBe('resolved:primary run command');
    expect(capturedInput.reviewerCommand).toBe('resolved:reviewer default cmd');
    expect(capturedInput.reviewerModel).toBe('reviewer-model-override');
    expect(capturedInput.reviewerPromptPath).toBe(
      realPrompts.resolveReviewerPromptPath(process.cwd()) ?? undefined,
    );
  });

  it('uses explicit reviewerCommand override for reviewer subprocess', async () => {
    const overrideOptions: CliOptions = {
      projectRoot: process.cwd(),
      projectKey: 'ouroboros',
      provider: 'primary',
      reviewerProvider: 'reviewer',
      developerPromptPath: undefined,
      iterationLimit: 1,
      iterationsSet: true,
      previewLines: 2,
      parallelAgents: 1,
      pauseMs: 0,
      command: 'primary run command',
      model: 'primary-model',
      reviewerModel: 'reviewer-model-override',
      reviewerCommand: '/opt/review/reviewer-cli --json',
      reasoningEffort: 'medium',
      yolo: false,
      logDir: '.tmp/review-loop-test',
      showRaw: false,
      reviewEnabled: true,
      reviewMaxFixAttempts: 5,
    };

    await runLoop(overrideOptions, mockPrimaryProvider, buildDeps());

    expect(capturedInput.reviewerCommand).toBe('resolved:/opt/review/reviewer-cli --json');
  });

  it('uses primary command when reviewer provider is the same provider', async () => {
    const sameProviderOptions: CliOptions = {
      projectRoot: process.cwd(),
      projectKey: 'ouroboros',
      provider: 'primary',
      reviewerProvider: 'primary',
      developerPromptPath: undefined,
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

    await runLoop(sameProviderOptions, mockPrimaryProvider, buildDeps());

    expect(capturedInput.command).toBe('resolved:primary run command');
    expect(capturedInput.reviewerCommand).toBe('resolved:primary run command');
    expect(capturedInput.reviewerProviderName).toBe('primary');
  });

  it('keeps provider registry list source stable for fallback coverage', () => {
    expect(listRealProviderNames().length).toBeGreaterThan(0);
  });
});
