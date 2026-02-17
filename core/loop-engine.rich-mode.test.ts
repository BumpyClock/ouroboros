import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import type { ProviderAdapter } from '../providers/types';
import type { LoopPhase } from './live-run-state';
import type { CliOptions, IterationState, Tone } from './types';

type RendererCall = {
  setRunContextCount: number;
  setIterationSummaryCount: number;
  setLoopNotice: Array<{ message: string; tone: Tone }>;
  setPauseState: Array<number | null>;
  setRetryState: Array<number | null>;
  setLoopPhase: LoopPhase[];
  setIteration: number[];
  setAgentLogPathCount: number;
  stopped: boolean;
  stop: Array<{ message: string; tone: Tone }>;
};

const baseOptions: CliOptions = {
  projectRoot: process.cwd(),
  projectKey: 'ouroboros',
  provider: 'mock',
  developerPromptPath: '.ai_agents/prompt.md',
  iterationLimit: 1,
  iterationsSet: true,
  previewLines: 2,
  parallelAgents: 1,
  pauseMs: 0,
  command: 'mock agent',
  model: '',
  reasoningEffort: 'medium',
  yolo: false,
  logDir: '.',
  showRaw: false,
  reviewEnabled: false,
  reviewMaxFixAttempts: 5,
};

const rendererCalls: RendererCall = {
  setRunContextCount: 0,
  setIterationSummaryCount: 0,
  setLoopNotice: [],
  setPauseState: [],
  setRetryState: [],
  setLoopPhase: [],
  setIteration: [],
  setAgentLogPathCount: 0,
  stopped: false,
  stop: [],
};

let iterationState: IterationState = {
  current_iteration: 0,
  max_iterations: 1,
};
let runAgentStatus = 0;
let runAgentStdout = '';
let runAgentStderr = '';

function resetState(): void {
  rendererCalls.setRunContextCount = 0;
  rendererCalls.setIterationSummaryCount = 0;
  rendererCalls.setLoopNotice.length = 0;
  rendererCalls.setPauseState.length = 0;
  rendererCalls.setRetryState.length = 0;
  rendererCalls.setLoopPhase.length = 0;
  rendererCalls.setIteration.length = 0;
  rendererCalls.setAgentLogPathCount = 0;
  rendererCalls.stopped = false;
  rendererCalls.stop.length = 0;
  iterationState = {
    current_iteration: 0,
    max_iterations: 1,
  };
  runAgentStatus = 0;
  runAgentStdout = '';
  runAgentStderr = '';
}

mock.module('./beads', () => ({
  extractReferencedBeadIds: () => [],
  loadBeadsSnapshot: async () => ({
    available: true,
    source: 'mock',
    projectRoot: process.cwd(),
    total: 1,
    remaining: 1,
    open: 1,
    inProgress: 0,
    blocked: 0,
    closed: 0,
    deferred: 0,
    remainingIssues: [],
    byId: new Map(),
  }),
}));

mock.module('./state', () => ({
  buildRunFileBase: (iteration: number) => `iter-${String(iteration).padStart(3, '0')}-test`,
  isCircuitBroken: (state: IterationState) => state.current_iteration >= state.max_iterations,
  loadIterationState: () => ({ ...iterationState }),
  resolveIterationStatePath: () => '/tmp/ouroboros-iteration-state.json',
  sleep: async (ms: number) => {
    if (ms > 0) {
      await Promise.resolve();
    }
  },
  writeIterationState: () => {},
}));

mock.module('./process-runner', () => ({
  resolveRunnableCommand: (command: string) => command,
  runAgentProcess: async () => ({
    status: runAgentStatus,
    stdout: runAgentStdout,
    stderr: runAgentStderr,
  }),
  terminateChildProcess: async () => {},
}));

mock.module('../tui/tui', () => ({
  InkLiveRunRenderer: class {
    constructor(
      public iteration: number,
      _maxIterations: number,
      _agentIds: number[],
      _previewLines: number,
    ) {
      rendererCalls.setIteration.push(iteration);
    }

    private readonly enabled = true;
    private phase: LoopPhase = 'starting';

    isEnabled(): boolean {
      return this.enabled;
    }

    setIteration(iteration: number): void {
      rendererCalls.setIteration.push(iteration);
    }

    update(): void {
      return;
    }

    setBeadsSnapshot(): void {
      return;
    }

    setAgentLogPath(): void {
      rendererCalls.setAgentLogPathCount += 1;
    }

    setRunContext(): void {
      rendererCalls.setRunContextCount += 1;
    }

    setIterationSummary(): void {
      rendererCalls.setIterationSummaryCount += 1;
    }

    setLoopNotice(message: string, tone: Tone): void {
      rendererCalls.setLoopNotice.push({ message, tone });
    }

    setPauseState(milliseconds: number | null): void {
      rendererCalls.setPauseState.push(milliseconds);
    }

    setRetryState(seconds: number | null): void {
      rendererCalls.setRetryState.push(seconds);
    }

    setLoopPhase(phase: LoopPhase): void {
      this.phase = phase;
      rendererCalls.setLoopPhase.push(phase);
    }

    setAgentPickedBead(): void {
      return;
    }

    setAgentQueued(): void {
      return;
    }

    setAgentLaunching(): void {
      return;
    }

    stop(message: string, tone = 'success' as Tone): void {
      rendererCalls.stopped = true;
      rendererCalls.stop.push({ message, tone });
    }
  },
}));

let loopEngineModule: typeof import('./loop-engine') | null = null;

const mockProvider: ProviderAdapter = {
  name: 'mock',
  displayName: 'Mock Provider',
  defaults: {
    command: 'mock',
    logDir: '.',
    model: '',
    reasoningEffort: 'medium',
    yolo: false,
  },
  buildExecArgs: () => ['mock'],
  previewEntriesFromLine: () => [],
  collectMessages: () => [],
  collectRawJsonLines: () => [],
  extractUsageSummary: () => ({ inputTokens: 1_100, cachedInputTokens: 200, outputTokens: 300 }),
  extractRetryDelaySeconds: () => null,
  hasStopMarker: () => false,
  formatCommandHint: (command) => `format(${command})`,
};

describe('runLoop rich-mode lifecycle', () => {
  beforeAll(async () => {
    loopEngineModule = await import('./loop-engine');
  });

  afterAll(() => {
    rendererCalls.stop.length = 0;
    rendererCalls.setLoopPhase.length = 0;
  });

  it('writes loop lifecycle through renderer state in rich mode without standalone iteration rows', async () => {
    if (!loopEngineModule) {
      throw new Error('loop-engine module failed to import');
    }
    resetState();
    const originalTty = process.stdout.isTTY;
    process.stdout.isTTY = true;
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };

    try {
      await loopEngineModule.runLoop({ ...baseOptions, iterationLimit: 1 }, mockProvider);
    } finally {
      console.log = originalLog;
      process.stdout.isTTY = originalTty;
    }

    expect(rendererCalls.setRunContextCount).toBe(1);
    expect(rendererCalls.setIterationSummaryCount).toBe(1);
    expect(rendererCalls.setLoopPhase).toContain('starting');
    expect(rendererCalls.setLoopPhase).toContain('collecting');
    expect(rendererCalls.setLoopPhase).toContain('completed');

    const hasLifecycleLines = logs.some(
      (line) =>
        line.includes('[START]') ||
        line.includes('[RUN]') ||
        line.includes('[BATCH]') ||
        line.includes('[PAUSE]') ||
        line.includes('[RETRY]') ||
        line.includes('[TOKENS]') ||
        line.includes('picked bead'),
    );
    expect(hasLifecycleLines).toBeFalse();
  });

  it('keeps legacy row output in non-TTY mode', async () => {
    if (!loopEngineModule) {
      throw new Error('loop-engine module failed to import');
    }
    resetState();
    const originalTty = process.stdout.isTTY;
    process.stdout.isTTY = false;
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };

    try {
      await loopEngineModule.runLoop({ ...baseOptions, iterationLimit: 1 }, mockProvider);
    } finally {
      console.log = originalLog;
      process.stdout.isTTY = originalTty;
    }

    const hasLegacyRows = logs.some(
      (line) => line.includes('[START]') || line.includes('[RUN]') || line.includes('[BATCH]'),
    );
    expect(hasLegacyRows).toBeTrue();
  });
});
