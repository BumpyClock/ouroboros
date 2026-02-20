import { describe, expect, it } from 'bun:test';
import type { LoopPhase } from '../../core/live-run-state';
import { type LoopControllerDependencies, runLoopController } from '../../core/loop-controller';
import { resolveBuiltinPromptPath } from '../../core/prompts';
import type { CliOptions, Tone } from '../../core/types';
import type { ProviderAdapter } from '../../providers/types';

type RendererCall = {
  setRunContextCount: number;
  setIterationSummaryCount: number;
  setLoopPhase: LoopPhase[];
};

class MockRenderer {
  private readonly enabled: boolean;

  constructor(
    enabled: boolean,
    private readonly calls: RendererCall,
  ) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setIteration(): void {}
  update(): void {}
  setBeadsSnapshot(): void {}
  setAgentLogPath(): void {}

  setRunContext(): void {
    this.calls.setRunContextCount += 1;
  }

  setIterationSummary(): void {
    this.calls.setIterationSummaryCount += 1;
  }

  setLoopNotice(): void {}
  setPauseState(): void {}
  setRetryState(): void {}
  markIterationRetry(): void {}
  setIterationOutcome(): void {}

  setLoopPhase(phase: LoopPhase): void {
    this.calls.setLoopPhase.push(phase);
  }

  setAgentPickedBead(): void {}
  setAgentQueued(): void {}
  setAgentLaunching(): void {}
  setAgentActiveTab(): void {}
  setAgentReviewPhase(): void {}
  clearAgentReviewPhase(): void {}
  stop(): void {}
}

const baseOptions: CliOptions = {
  projectRoot: process.cwd(),
  projectKey: 'ouroboros',
  provider: 'mock',
  reviewerProvider: 'codex',
  developerPromptPath: resolveBuiltinPromptPath('developer'),
  iterationLimit: 1,
  iterationsSet: true,
  previewLines: 2,
  parallelAgents: 1,
  pauseMs: 0,
  command: 'mock agent',
  model: '',
  reviewerModel: '',
  reasoningEffort: 'medium',
  yolo: false,
  logDir: '.',
  showRaw: false,
  reviewEnabled: false,
  reviewMaxFixAttempts: 5,
};

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

function buildDependencies(renderer: MockRenderer): LoopControllerDependencies {
  return {
    loadIterationState: () => ({ current_iteration: 0, max_iterations: 1 }),
    isCircuitBroken: (state) => state.current_iteration >= state.max_iterations,
    writeIterationState: () => {},
    sleep: async () => {},
    loadBeadsSnapshot: async (projectRoot: string) => ({
      available: true,
      source: 'mock',
      projectRoot,
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
    runIteration: (async (...args: unknown[]) => {
      const liveRenderer = args[13] as MockRenderer | null;
      if (liveRenderer?.isEnabled()) {
        liveRenderer.setRunContext();
        liveRenderer.setLoopPhase('starting');
      } else {
        console.log('[START] 12:00:00');
        console.log('[RUN] mock run');
        console.log('[BATCH] target 1 parallel agent(s), staged startup');
      }
      return {
        results: [
          {
            agentId: 1,
            jsonlLogPath: '.tmp/mock.jsonl',
            lastMessagePath: '.tmp/mock.last-message.txt',
            result: { status: 0, stdout: '', stderr: '' },
          },
        ],
        pickedByAgent: new Map(),
        reviewOutcomes: new Map(),
      };
    }) as LoopControllerDependencies['runIteration'],
    createLiveRenderer: () => renderer,
  };
}

function buildControllerInput(options: CliOptions) {
  return {
    options,
    provider: mockProvider,
    reviewerProvider: mockProvider,
    promptPath: resolveBuiltinPromptPath('developer'),
    reviewerPromptPath: undefined,
    statePath: '.tmp/state.json',
    logDir: '.tmp/logs',
    command: 'mock agent',
    reviewerCommand: 'mock reviewer',
    activeChildren: new Set(),
    activeSpinnerStopRef: { value: null as ((message: string, tone?: Tone) => void) | null },
    shutdownProbe: { isShuttingDown: () => false },
  };
}

describe('runLoop rich-mode lifecycle', () => {
  it('writes loop lifecycle through renderer state in rich mode without standalone iteration rows', async () => {
    const calls: RendererCall = {
      setRunContextCount: 0,
      setIterationSummaryCount: 0,
      setLoopPhase: [],
    };
    const renderer = new MockRenderer(true, calls);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };

    try {
      await runLoopController(
        buildControllerInput({ ...baseOptions }),
        buildDependencies(renderer),
      );
    } finally {
      console.log = originalLog;
    }

    expect(calls.setRunContextCount).toBe(1);
    expect(calls.setIterationSummaryCount).toBe(1);
    expect(calls.setLoopPhase).toContain('starting');
    expect(calls.setLoopPhase).toContain('collecting');
    expect(calls.setLoopPhase).toContain('completed');

    const hasLifecycleLines = logs.some(
      (line) =>
        line.includes('[START]') ||
        line.includes('[RUN]') ||
        line.includes('[BATCH]') ||
        line.includes('[PAUSE]') ||
        line.includes('[RETRY]') ||
        line.includes('[TOKENS]') ||
        line.includes('picked task'),
    );
    expect(hasLifecycleLines).toBeFalse();
  });

  it('keeps legacy row output in non-TTY mode', async () => {
    const calls: RendererCall = {
      setRunContextCount: 0,
      setIterationSummaryCount: 0,
      setLoopPhase: [],
    };
    const renderer = new MockRenderer(false, calls);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };

    try {
      await runLoopController(
        buildControllerInput({ ...baseOptions }),
        buildDependencies(renderer),
      );
    } finally {
      console.log = originalLog;
    }

    const hasLegacyRows = logs.some(
      (line) => line.includes('[START]') || line.includes('[RUN]') || line.includes('[BATCH]'),
    );
    expect(hasLegacyRows).toBeTrue();
  });
});
