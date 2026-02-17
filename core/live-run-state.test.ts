import { describe, expect, it } from 'bun:test';
import { LiveRunStateStore } from './live-run-state';
import type { BeadIssue, UsageSummary } from './types';

const makeIssue = (id: string): BeadIssue => ({
  id,
  title: `Issue ${id}`,
  status: 'open',
});

const makeUsage = (input: number, cached: number, output: number) => ({
  inputTokens: input,
  cachedInputTokens: cached,
  outputTokens: output,
});

describe('LiveRunStateStore', () => {
  it('keeps iteration state and run context up to date', () => {
    const store = new LiveRunStateStore(1, 10, [1, 2], 2);
    expect(store.getSnapshot().iteration).toBe(1);

    store.setIteration(4);
    store.setRunContext({
      startedAt: 1,
      command: 'codex run',
      batch: 'target 2',
      agentLogPaths: new Map([[1, '/tmp/a1.log']]),
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.iteration).toBe(4);
    expect(snapshot.runContext?.agentLogPaths.get(1)).toBe('/tmp/a1.log');
  });

  it('replaces iteration summary atomically each iteration', () => {
    const store = new LiveRunStateStore(1, 10, [1], 2);

    const firstUsage: UsageSummary = makeUsage(1, 2, 3);
    const secondUsage: UsageSummary = makeUsage(4, 5, 6);
    const firstSummaryMap = new Map([[1, makeIssue('A1')]]);
    const secondSummaryMap = new Map([[2, makeIssue('A2')]]);

    store.setIterationSummary({
      usage: firstUsage,
      pickedBeadsByAgent: firstSummaryMap,
      notice: null,
      noticeTone: 'muted',
    });
    firstSummaryMap.set(2, makeIssue('A2'));
    store.setIterationSummary({
      usage: secondUsage,
      pickedBeadsByAgent: secondSummaryMap,
      notice: 'done',
      noticeTone: 'success',
    });

    const summary = store.getSnapshot().lastIterationSummary;
    expect(summary?.usage).toEqual(secondUsage);
    expect(summary?.pickedBeadsByAgent.size).toBe(1);
    expect(summary?.pickedBeadsByAgent.has(2)).toBeTrue();
    expect(summary?.pickedBeadsByAgent.has(1)).toBeFalse();
    expect(summary?.notice).toBe('done');
    expect(summary?.noticeTone).toBe('success');
  });

  it('tracks pause and retry states', () => {
    const store = new LiveRunStateStore(1, 10, [1], 2);
    store.setPauseState(1_000);
    store.setRetryState(7);
    const withCounts = store.getSnapshot();
    expect(withCounts.pauseMs).toBe(1_000);
    expect(withCounts.retrySeconds).toBe(7);

    store.setPauseState(null);
    store.setRetryState(null);
    const cleared = store.getSnapshot();
    expect(cleared.pauseMs).toBeNull();
    expect(cleared.retrySeconds).toBeNull();
  });
});
