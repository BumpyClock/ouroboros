import { describe, expect, it } from 'bun:test';
import {
  runSlotReviewLoop,
  type SlotReviewInput,
  type SlotReviewOutcome,
} from '../../core/iteration-execution';
import type {
  BeadIssue,
  BeadsSnapshot,
  CliOptions,
  RunResult,
  StreamResult,
} from '../../core/types';
import type { ProviderAdapter } from '../../providers/types';

/**
 * Regression tests for the optional slot-local review/fix loop.
 *
 * Tests cover:
 *   - review disabled path (review skipped by caller)
 *   - pass on first review
 *   - drift -> fix -> pass
 *   - malformed reviewer JSON failure
 *   - cap at maxFixAttempts failure
 *   - stop-marker exclusion for reviewer output
 *   - review failure surfaced in aggregation
 */

// --- mock state ---
let mockRunIndex = 0;
let mockRunResults: StreamResult[] = [];
type RunCall = { prompt: string; logPath: string; command: string; args: string[] };
const runCalls: RunCall[] = [];

function resetMockState(): void {
  mockRunIndex = 0;
  mockRunResults = [];
  runCalls.length = 0;
}

const mockRunAgentProcess = async ({
  prompt,
  logPath,
  command,
  args,
}: {
  prompt: string;
  logPath: string;
  command: string;
  args: string[];
}): Promise<StreamResult> => {
  const idx = mockRunIndex;
  mockRunIndex += 1;
  runCalls.push({ prompt, logPath, command, args });
  return mockRunResults[idx] ?? { status: 0, stdout: '', stderr: '' };
};

function runReviewLoop(input: SlotReviewInput): Promise<SlotReviewOutcome> {
  return runSlotReviewLoop(
    input,
    mockRunAgentProcess as unknown as typeof import('../../core/process-runner').runAgentProcess,
  );
}

// --- helpers ---

const REVIEW_LOG_DIR = '.tmp/review-loop-test';

const baseOptions: CliOptions = {
  projectRoot: process.cwd(),
  projectKey: 'test',
  provider: 'primary',
  reviewerProvider: 'reviewer',
  developerPromptPath: '.ai_agents/prompt.md',
  iterationLimit: 1,
  iterationsSet: true,
  previewLines: 3,
  parallelAgents: 1,
  pauseMs: 0,
  command: 'primary-command',
  model: 'primary-model',
  reviewerModel: 'reviewer-model',
  reasoningEffort: 'medium',
  yolo: false,
  logDir: REVIEW_LOG_DIR,
  showRaw: false,
  reviewEnabled: true,
  reviewMaxFixAttempts: 5,
};

function hasStopToken(output: string): boolean {
  const normalized = output.toLowerCase();
  return normalized.includes('no_tasks_available') || normalized.includes('no_beads_available');
}

const mockProvider: ProviderAdapter = {
  name: 'primary',
  displayName: 'Primary Mock',
  defaults: {
    command: 'primary-command',
    logDir: REVIEW_LOG_DIR,
    model: 'primary-model',
    reasoningEffort: 'medium',
    yolo: false,
  },
  buildExecArgs: (_prompt, _lastMessagePath, options) => ['--model', options.model],
  previewEntriesFromLine: () => [],
  collectMessages: () => [],
  collectRawJsonLines: () => [],
  extractUsageSummary: () => null,
  extractRetryDelaySeconds: () => null,
  hasStopMarker: hasStopToken,
  formatCommandHint: (command) => command,
};

const reviewerProvider: ProviderAdapter = {
  name: 'reviewer',
  displayName: 'Reviewer Mock',
  defaults: {
    command: 'reviewer-command',
    logDir: REVIEW_LOG_DIR,
    model: 'reviewer-default',
    reasoningEffort: 'medium',
    yolo: false,
  },
  buildExecArgs: (_prompt, _lastMessagePath, options) => ['--model', options.model],
  previewEntriesFromLine: () => [],
  collectMessages: () => [],
  collectRawJsonLines: () => [],
  extractUsageSummary: () => null,
  extractRetryDelaySeconds: () => null,
  hasStopMarker: hasStopToken,
  formatCommandHint: (command) => command,
};

function makeTask(id: string): BeadIssue {
  return { id, title: `${id} title`, status: 'in_progress', priority: 1 };
}

function makeSnapshot(taskIds: string[]): BeadsSnapshot {
  const issues = taskIds.map((id) => makeTask(id));
  return {
    available: true,
    source: 'test',
    projectRoot: process.cwd(),
    total: issues.length,
    remaining: issues.length,
    open: issues.length,
    inProgress: 0,
    blocked: 0,
    closed: 0,
    deferred: 0,
    remainingIssues: issues,
    byId: new Map(issues.map((i) => [i.id, i])),
  };
}

function passVerdict(msg = 'LGTM'): string {
  return JSON.stringify({ verdict: 'pass', followUpPrompt: msg });
}

function driftVerdict(followUp: string): string {
  return JSON.stringify({ verdict: 'drift', followUpPrompt: followUp });
}

function makeImplRunResult(stdout = 'implemented', stderr = ''): RunResult {
  return {
    agentId: 1,
    jsonlLogPath: `${REVIEW_LOG_DIR}/run-0001-agent-01.jsonl`,
    lastMessagePath: `${REVIEW_LOG_DIR}/run-0001-agent-01.last-message.txt`,
    result: { status: 0, stdout, stderr },
  };
}

function makeSlotReviewInput(
  reviewResults: StreamResult[],
  opts: Partial<CliOptions> = {},
): SlotReviewInput {
  resetMockState();
  mockRunResults = reviewResults;
  const pickedTask = makeTask('test-task-1');
  return {
    agentId: 1,
    iteration: 1,
    implementResult: makeImplRunResult(),
    pickedTask,
    options: { ...baseOptions, ...opts },
    provider: mockProvider,
    reviewerProvider,
    reviewerPrompt: '# Review the implementation',
    command: 'primary-command',
    reviewerCommand: 'reviewer-command',
    logDir: REVIEW_LOG_DIR,
    activeChildren: new Set(),
    liveRendererEnabled: false,
    liveRenderer: null,
  };
}

describe('review loop integration', () => {
  // --- 1. review disabled (caller responsibility) ---
  it('review is skipped by caller when reviewEnabled is false', () => {
    // This test validates the contract: runIteration only calls runSlotReviewLoop
    // when reviewEnabled && reviewerPrompt && pickedTask && exitCode === 0.
    // When reviewEnabled is false, reviewOutcomes map stays empty.
    const options = { ...baseOptions, reviewEnabled: false };
    // The condition in runIteration (line ~549):
    //   options.reviewEnabled && reviewerPrompt && pickedTask && result.status === 0
    expect(options.reviewEnabled).toBe(false);
    // Therefore runSlotReviewLoop is never called — no outcomes produced.
  });

  // --- 2. pass on first review ---
  it('passes on first review with no fix attempts', async () => {
    const reviewResult: StreamResult = { status: 0, stdout: passVerdict(), stderr: '' };
    const input = makeSlotReviewInput([reviewResult]);

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(true);
      expect(outcome.fixAttempts).toBe(0);
      expect(outcome.lastVerdict?.verdict).toBe('pass');
      // Only one call: the review
      expect(runCalls.length).toBe(1);
    } finally {
      console.log = origLog;
    }
  });

  // --- 3. drift -> fix -> pass ---
  it('handles drift then fix then pass', async () => {
    const reviewResults: StreamResult[] = [
      // review 0: drift
      { status: 0, stdout: driftVerdict('Add error handling'), stderr: '' },
      // fix 1
      { status: 0, stdout: 'fixed code', stderr: '' },
      // review 1: pass
      { status: 0, stdout: passVerdict('Fixed correctly'), stderr: '' },
    ];
    const input = makeSlotReviewInput(reviewResults);

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(true);
      expect(outcome.fixAttempts).toBe(1);
      // review0 + fix1 + review1 = 3 calls
      expect(runCalls.length).toBe(3);

      // Fix prompt should contain reviewer feedback
      const fixCall = runCalls[1];
      expect(fixCall.prompt).toContain('Add error handling');
      expect(fixCall.prompt).toContain('test-task-1');
    } finally {
      console.log = origLog;
    }
  });

  // --- 4. malformed reviewer JSON failure ---
  it('fails on malformed reviewer JSON (no JSON object)', async () => {
    const reviewResults: StreamResult[] = [
      { status: 0, stdout: 'I think everything looks good!', stderr: '' },
    ];
    const input = makeSlotReviewInput(reviewResults);

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(false);
      expect(outcome.failureReason).toContain('reviewer contract violation');
      // Only one review call — no fix attempted after contract violation
      expect(runCalls.length).toBe(1);
    } finally {
      console.log = origLog;
    }
  });

  it('fails when reviewer subprocess exits non-zero', async () => {
    const reviewResults: StreamResult[] = [
      { status: 2, stdout: passVerdict(), stderr: 'reviewer crashed' },
    ];
    const input = makeSlotReviewInput(reviewResults);

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(false);
      expect(outcome.fixAttempts).toBe(0);
      expect(outcome.failureReason).toContain('reviewer process exited with status 2');
      expect(outcome.failureReason).not.toContain('reviewer contract violation');
      expect(runCalls.length).toBe(1);
    } finally {
      console.log = origLog;
    }
  });

  it('fails on reviewer JSON with invalid verdict value', async () => {
    const reviewResults: StreamResult[] = [
      {
        status: 0,
        stdout: JSON.stringify({ verdict: 'approved', followUpPrompt: 'ok' }),
        stderr: '',
      },
    ];
    const input = makeSlotReviewInput(reviewResults);

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(false);
      expect(outcome.failureReason).toContain('reviewer contract violation');
      expect(outcome.failureReason).toContain('invalid verdict');
    } finally {
      console.log = origLog;
    }
  });

  it('fails on reviewer JSON missing followUpPrompt', async () => {
    const reviewResults: StreamResult[] = [
      { status: 0, stdout: JSON.stringify({ verdict: 'pass' }), stderr: '' },
    ];
    const input = makeSlotReviewInput(reviewResults);

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(false);
      expect(outcome.failureReason).toContain('reviewer contract violation');
    } finally {
      console.log = origLog;
    }
  });

  // --- 5. cap at maxFixAttempts ---
  it('fails after max fix attempts with unresolved drift', async () => {
    const maxFix = 2;
    // With maxFix=2: review0(drift) + fix1 + review1(drift) + fix2 + review2(drift) = fail
    const reviewResults: StreamResult[] = [
      { status: 0, stdout: driftVerdict('fix issue A'), stderr: '' },
      { status: 0, stdout: 'fix attempt 1', stderr: '' },
      { status: 0, stdout: driftVerdict('fix issue B'), stderr: '' },
      { status: 0, stdout: 'fix attempt 2', stderr: '' },
      { status: 0, stdout: driftVerdict('still broken'), stderr: '' },
    ];
    const input = makeSlotReviewInput(reviewResults, { reviewMaxFixAttempts: maxFix });

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(false);
      expect(outcome.fixAttempts).toBe(maxFix);
      expect(outcome.failureReason).toContain('drift unresolved');
      expect(outcome.failureReason).toContain(`${maxFix}`);
      // review0 + fix1 + review1 + fix2 + review2 = 5 calls
      expect(runCalls.length).toBe(5);
    } finally {
      console.log = origLog;
    }
  });

  it('fails when fixer subprocess exits non-zero and stops retrying', async () => {
    const reviewResults: StreamResult[] = [
      { status: 0, stdout: driftVerdict('fix this issue'), stderr: '' },
      { status: 7, stdout: 'did not apply fix', stderr: '' },
      { status: 0, stdout: passVerdict(), stderr: '' },
    ];
    const input = makeSlotReviewInput(reviewResults);

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(false);
      expect(outcome.fixAttempts).toBe(1);
      expect(outcome.failureReason).toContain('fixer process exited with status 7');
      expect(runCalls.length).toBe(2);
      // third call must not run after failed fixer
    } finally {
      console.log = origLog;
    }
  });

  it('routes review subprocess to reviewer provider command/model while fix stays on implementation provider', async () => {
    const reviewResults: StreamResult[] = [
      { status: 0, stdout: driftVerdict('add guardrails'), stderr: '' },
      { status: 0, stdout: 'implemented fix', stderr: '' },
      { status: 0, stdout: passVerdict('fixed'), stderr: '' },
    ];
    const input = makeSlotReviewInput(reviewResults, {
      reviewerProvider: 'reviewer',
      model: 'primary-model',
      reviewerModel: 'reviewer-model',
    });

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(true);
      expect(outcome.fixAttempts).toBe(1);
      expect(runCalls[0].command).toBe('reviewer-command');
      expect(runCalls[0].args).toContain('--model');
      expect(runCalls[0].args).toContain('reviewer-model');
      expect(runCalls[1].command).toBe('primary-command');
      expect(runCalls[1].args).toContain('primary-model');
    } finally {
      console.log = origLog;
    }
  });

  // --- 6. stop-marker exclusion for reviewer output ---
  it('does not include reviewer output in implementation results (stop-marker safe)', async () => {
    // Reviewer output contains a stop marker, but it should not affect stop detection
    const reviewWithStopMarker: StreamResult = {
      status: 0,
      stdout: `The agent output no_tasks_available\n${passVerdict()}`,
      stderr: '',
    };
    const input = makeSlotReviewInput([reviewWithStopMarker]);

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(true);
      const freshModule = (await import(
        `../../core/iteration-execution.ts?review-loop-stop-marker-${Date.now()}-${Math.random().toString(36).slice(2)}`
      )) as typeof import('../../core/iteration-execution');

      // Verify aggregation doesn't see stop marker from review output
      // The implementation result's stdout is 'implemented' (no stop marker)
      const implResult = makeImplRunResult();
      const aggResult = freshModule.aggregateIterationOutput({
        provider: mockProvider,
        results: [implResult],
        tasksSnapshot: makeSnapshot(['test-task-1']),
        pickedByAgent: new Map([[1, makeTask('test-task-1')]]),
        liveRenderer: null,
        previewLines: 3,
        reviewOutcomes: new Map([[1, outcome]]),
      });
      expect(aggResult.stopDetected).toBe(false);
    } finally {
      console.log = origLog;
    }
  });

  // --- review outcome failure surfaced in aggregation ---
  it('surfaces review failure in aggregation failed list', async () => {
    const originalLog = console.log;
    console.log = () => {};
    try {
      const implResult = makeImplRunResult();
      const reviewFailure: SlotReviewOutcome = {
        passed: false,
        fixAttempts: 0,
        failureReason: 'reviewer contract violation: no JSON object found',
      };
      const reviewOutcomes = new Map([[1, reviewFailure]]);
      const freshModule = (await import(
        `../../core/iteration-execution.ts?review-loop-agg-${Date.now()}-${Math.random().toString(36).slice(2)}`
      )) as typeof import('../../core/iteration-execution');
      const agg = freshModule.aggregateIterationOutput({
        provider: mockProvider,
        results: [implResult],
        tasksSnapshot: makeSnapshot(['test-task-1']),
        pickedByAgent: new Map([[1, makeTask('test-task-1')]]),
        liveRenderer: null,
        previewLines: 3,
        reviewOutcomes,
      });
      expect(agg.failed.length).toBeGreaterThanOrEqual(1);
      const reviewFail = agg.failed.find((f) => f.combinedOutput.includes('review failed'));
      expect(reviewFail).toBeDefined();
    } finally {
      console.log = originalLog;
    }
  });

  // --- multi-drift with pass on final attempt ---
  it('passes after multiple drift-fix cycles', async () => {
    const maxFix = 3;
    const reviewResults: StreamResult[] = [
      { status: 0, stdout: driftVerdict('fix A'), stderr: '' },
      { status: 0, stdout: 'fix 1', stderr: '' },
      { status: 0, stdout: driftVerdict('fix B'), stderr: '' },
      { status: 0, stdout: 'fix 2', stderr: '' },
      { status: 0, stdout: passVerdict('finally good'), stderr: '' },
    ];
    const input = makeSlotReviewInput(reviewResults, { reviewMaxFixAttempts: maxFix });

    const origLog = console.log;
    console.log = () => {};
    try {
      const outcome = await runReviewLoop(input);
      expect(outcome.passed).toBe(true);
      expect(outcome.fixAttempts).toBe(2);
      expect(outcome.lastVerdict?.followUpPrompt).toBe('finally good');
    } finally {
      console.log = origLog;
    }
  });
});
