import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import type { BeadIssue, BeadsSnapshot, CliOptions } from '../../core/types';
import type { ProviderAdapter } from '../../providers/types';

let emittedLine = '';
let firstAgentCompleted = false;
let secondAgentStartedBeforeFirstCompleted = false;
let releaseFirstAgentRun: (() => void) | null = null;

function resetRunState(): void {
  emittedLine = '';
  firstAgentCompleted = false;
  secondAgentStartedBeforeFirstCompleted = false;
  releaseFirstAgentRun = null;
}

mock.module('../../core/process-runner', () => ({
  resolveRunnableCommand: (command: string) => command,
  terminateChildProcess: async () => {},
  runAgentProcess: async ({
    logPath,
    onStdoutLine,
  }: {
    logPath: string;
    onStdoutLine?: (line: string) => void;
  }) => {
    if (logPath.includes('agent-01')) {
      if (emittedLine) {
        onStdoutLine?.(emittedLine);
      }
      await new Promise<void>((resolve) => {
        releaseFirstAgentRun = resolve;
      });
      firstAgentCompleted = true;
      return { status: 0, stdout: '', stderr: '' };
    }

    if (logPath.includes('agent-02')) {
      secondAgentStartedBeforeFirstCompleted = !firstAgentCompleted;
      return { status: 0, stdout: '', stderr: '' };
    }

    return { status: 0, stdout: '', stderr: '' };
  },
}));

let iterationExecutionModule: typeof import('../../core/iteration-execution') | null = null;

const baseOptions: CliOptions = {
  projectRoot: process.cwd(),
  projectKey: 'ouroboros',
  provider: 'mock',
  reviewerProvider: 'mock',
  developerPromptPath: '.ai_agents/prompt.md',
  iterationLimit: 1,
  iterationsSet: true,
  previewLines: 3,
  parallelAgents: 2,
  pauseMs: 0,
  command: 'mock',
  model: '',
  reviewerModel: '',
  reasoningEffort: 'medium',
  yolo: false,
  logDir: '.tmp/test-logs',
  showRaw: false,
  reviewEnabled: false,
  reviewMaxFixAttempts: 5,
};

const providerWithTruncatedPreview: ProviderAdapter = {
  name: 'mock',
  displayName: 'Mock Provider',
  defaults: {
    command: 'mock',
    logDir: '.tmp/test-logs',
    model: '',
    reasoningEffort: 'medium',
    yolo: false,
  },
  buildExecArgs: () => ['mock'],
  previewEntriesFromLine: () => [
    {
      kind: 'message',
      label: 'message',
      text: 'preview payload omitted by provider formatting',
    },
  ],
  collectMessages: () => [],
  collectRawJsonLines: () => [],
  extractUsageSummary: () => null,
  extractRetryDelaySeconds: () => null,
  hasStopMarker: () => false,
  formatCommandHint: (command) => command,
};

function createIssue(id: string, status: string): BeadIssue {
  return { id, title: `${id} title`, status };
}

function createSnapshot(remainingIds: string[], closedIds: string[]): BeadsSnapshot {
  const remainingIssues = remainingIds.map((id) => createIssue(id, 'open'));
  const closedIssues = closedIds.map((id) => createIssue(id, 'closed'));
  const allIssues = [...remainingIssues, ...closedIssues];
  return {
    available: true,
    source: 'test',
    projectRoot: process.cwd(),
    total: allIssues.length,
    remaining: remainingIssues.length,
    open: remainingIssues.length,
    inProgress: 0,
    blocked: 0,
    closed: closedIssues.length,
    deferred: 0,
    remainingIssues,
    byId: new Map(allIssues.map((issue) => [issue.id, issue])),
  };
}

async function waitUntilFirstAgentIsBlocked(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (releaseFirstAgentRun) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error('first agent did not start');
}

async function runIterationWithLine(
  snapshot: BeadsSnapshot,
  line: string,
): Promise<{
  startedSecondBeforeFirstCompleted: boolean;
  pickedByAgent: Map<number, BeadIssue>;
}> {
  if (!iterationExecutionModule) {
    throw new Error('iteration-execution module failed to import');
  }

  resetRunState();
  emittedLine = line;
  const originalLog = console.log;
  console.log = () => {};

  try {
    const runPromise = iterationExecutionModule.runIteration(
      1,
      1,
      baseOptions,
      providerWithTruncatedPreview,
      providerWithTruncatedPreview,
      'mock',
      snapshot,
      'prompt',
      'mock',
      process.cwd(),
      new Set(),
      { value: null },
      null,
    );

    await waitUntilFirstAgentIsBlocked();
    const startedSecondBeforeFirstCompleted = secondAgentStartedBeforeFirstCompleted;
    if (!releaseFirstAgentRun) {
      throw new Error('first agent release callback not initialized');
    }
    releaseFirstAgentRun();

    const result = await runPromise;
    return {
      startedSecondBeforeFirstCompleted,
      pickedByAgent: result.pickedByAgent,
    };
  } finally {
    console.log = originalLog;
  }
}

describe('runIteration bead picking for staged launch', () => {
  beforeAll(async () => {
    iterationExecutionModule = await import('../../core/iteration-execution');
  });

  afterAll(() => {
    mock.restore();
  });

  it('launches the next agent early when a remaining bead id exists only in raw stdout', async () => {
    const snapshot = createSnapshot(['ouroboros-7.1'], ['ouroboros-1']);
    const line = `{"type":"user","content":"${'x'.repeat(500)} ouroboros-7.1"}`;

    const result = await runIterationWithLine(snapshot, line);

    expect(result.startedSecondBeforeFirstCompleted).toBeTrue();
    expect(result.pickedByAgent.get(1)?.id).toBe('ouroboros-7.1');
  });

  it('does not treat closed bead ids as a staged-launch readiness signal', async () => {
    const snapshot = createSnapshot(['ouroboros-7.1'], ['ouroboros-1']);
    const line = `{"type":"user","content":"${'x'.repeat(500)} ouroboros-1"}`;

    const result = await runIterationWithLine(snapshot, line);

    expect(result.startedSecondBeforeFirstCompleted).toBeFalse();
    expect(result.pickedByAgent.size).toBe(0);
  });
});
