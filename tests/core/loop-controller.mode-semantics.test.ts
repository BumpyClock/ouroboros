import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { BeadsSnapshot, CliOptions } from '../../core/types';
import type { ProviderAdapter } from '../../providers/types';

type LoadBeadsCall = {
  projectRoot: string;
  topLevelBeadId?: string;
};

type IterationRunResult = {
  results: Array<{
    agentId: number;
    jsonlLogPath: string;
    lastMessagePath: string;
    result: { status: number; stdout: string; stderr: string };
  }>;
  pickedByAgent: Map<number, { id: string; title: string; status: string }>;
  reviewOutcomes: Map<number, unknown>;
};

let state = { current_iteration: 0, max_iterations: 1 };
let projectRoot = '';
let loadCalls: LoadBeadsCall[] = [];
let iterationCalls: unknown[][] = [];
let snapshot: BeadsSnapshot = makeSnapshot({ available: true });
let runIterationResult: IterationRunResult = makeIterationResult();

const mockProvider: ProviderAdapter = {
  name: 'mock',
  displayName: 'Mock',
  defaults: {
    command: 'mock-command',
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
  formatCommandHint: (command) => command,
};

function makeSnapshot(values: Partial<BeadsSnapshot> = {}): BeadsSnapshot {
  return {
    available: true,
    source: 'test',
    projectRoot: process.cwd(),
    total: 0,
    remaining: 0,
    open: 0,
    inProgress: 0,
    blocked: 0,
    closed: 0,
    deferred: 0,
    remainingIssues: [],
    byId: new Map(),
    ...values,
  };
}

function makeIterationResult(): IterationRunResult {
  return {
    results: [
      {
        agentId: 1,
        jsonlLogPath: 'agent-01.jsonl',
        lastMessagePath: 'agent-01.last.txt',
        result: { status: 0, stdout: 'agent done', stderr: '' },
      },
    ],
    pickedByAgent: new Map(),
    reviewOutcomes: new Map(),
  };
}

function makeOptions(overrides: Partial<CliOptions>): CliOptions {
  return {
    projectRoot,
    projectKey: 'ouroboros',
    provider: 'mock',
    reviewerProvider: 'mock',
    iterationLimit: 1,
    iterationsSet: true,
    previewLines: 3,
    parallelAgents: 1,
    pauseMs: 0,
    command: 'mock command',
    model: 'mock-model',
    reviewerCommand: 'mock reviewer command',
    reviewerModel: 'mock-reviewer-model',
    reasoningEffort: 'medium',
    yolo: false,
    logDir: '.',
    showRaw: true,
    reviewEnabled: false,
    reviewMaxFixAttempts: 5,
    ...overrides,
  };
}

function makeDependencies() {
  return {
    loadIterationState: () => state,
    isCircuitBroken: ({
      current_iteration,
      max_iterations,
    }: {
      current_iteration: number;
      max_iterations: number;
    }) => current_iteration >= max_iterations,
    writeIterationState: () => {},
    sleep: async () => {},
    loadTasksSnapshot: async (
      projectRoot: string,
      topLevelTaskId?: string,
    ): Promise<BeadsSnapshot> => {
      loadCalls.push({ projectRoot, topLevelBeadId: topLevelTaskId });
      return snapshot;
    },
    runIteration: async (...args: unknown[]) => {
      iterationCalls.push(args);
      return runIterationResult;
    },
    createLiveRenderer: () => null,
  };
}

describe('runLoopController mode-specific termination', () => {
  let loopControllerModule: typeof import('../../core/loop-controller') | null = null;
  let promptPath = '';
  let statePath = '';
  let logDir = '';

  beforeEach(async () => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-loop-mode-'));
    promptPath = path.join(projectRoot, 'developer.md');
    statePath = path.join(projectRoot, 'iteration.json');
    logDir = path.join(projectRoot, 'logs');
    writeFileSync(promptPath, 'base developer prompt', 'utf8');

    state = { current_iteration: 0, max_iterations: 1 };
    loadCalls = [];
    iterationCalls = [];
    snapshot = makeSnapshot();
    runIterationResult = makeIterationResult();

    loopControllerModule = await import(
      `../../core/loop-controller.ts?loop-mode-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('stops before any iteration when top-level scope is exhausted', async () => {
    snapshot = makeSnapshot({ available: true, remaining: 0 });
    if (!loopControllerModule) {
      throw new Error('runLoopController module not initialized');
    }

    await loopControllerModule.runLoopController(
      {
        options: makeOptions({
          beadMode: 'top-level',
          topLevelBeadId: 'ouroboros-13.12',
        }),
        provider: mockProvider,
        reviewerProvider: mockProvider,
        promptPath,
        statePath,
        logDir,
        command: 'resolved:mock command',
        reviewerCommand: 'resolved:mock reviewer command',
        activeChildren: new Set(),
        activeSpinnerStopRef: { value: null },
        shutdownProbe: { isShuttingDown: () => false },
      },
      makeDependencies(),
    );

    expect(iterationCalls).toHaveLength(0);
    expect(loadCalls).toEqual([{ projectRoot, topLevelBeadId: 'ouroboros-13.12' }]);
  });

  it('does not apply top-level scope when task scope mode is auto', async () => {
    state.max_iterations = 2;
    snapshot = makeSnapshot({ available: true, remaining: 0 });
    if (!loopControllerModule) {
      throw new Error('runLoopController module not initialized');
    }

    const options = makeOptions({
      beadMode: 'auto',
      topLevelBeadId: 'ouroboros-13.12',
    });

    await loopControllerModule.runLoopController(
      {
        options,
        provider: mockProvider,
        reviewerProvider: mockProvider,
        promptPath,
        statePath,
        logDir,
        command: 'resolved:mock command',
        reviewerCommand: 'resolved:mock reviewer command',
        activeChildren: new Set(),
        activeSpinnerStopRef: { value: null },
        shutdownProbe: { isShuttingDown: () => false },
      },
      makeDependencies(),
    );

    expect(iterationCalls).toHaveLength(2);
    expect(loadCalls[0]).toEqual({ projectRoot, topLevelBeadId: undefined });
    expect(iterationCalls[0][7]).toBe('base developer prompt');
    expect(iterationCalls[0][6]).toBe(snapshot);
  });

  it('injects top-level scope into prompt when in top-level mode', async () => {
    snapshot = makeSnapshot({
      available: true,
      remaining: 4,
    });
    if (!loopControllerModule) {
      throw new Error('runLoopController module not initialized');
    }

    await loopControllerModule.runLoopController(
      {
        options: makeOptions({
          beadMode: 'top-level',
          topLevelBeadId: 'ouroboros-13.12',
        }),
        provider: mockProvider,
        reviewerProvider: mockProvider,
        promptPath,
        statePath,
        logDir,
        command: 'resolved:mock command',
        reviewerCommand: 'resolved:mock reviewer command',
        activeChildren: new Set(),
        activeSpinnerStopRef: { value: null },
        shutdownProbe: { isShuttingDown: () => false },
      },
      makeDependencies(),
    );

    expect(iterationCalls).toHaveLength(1);
    expect(iterationCalls[0][7] as string).toContain('Top-level scope');
    expect(iterationCalls[0][7] as string).toContain('ouroboros-13.12');
    expect(iterationCalls[0][7] as string).toContain('no_tasks_available');
    expect(loadCalls[0]).toEqual({ projectRoot, topLevelBeadId: 'ouroboros-13.12' });
  });
});
