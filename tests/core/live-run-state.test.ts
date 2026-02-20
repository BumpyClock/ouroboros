import { describe, expect, it } from 'bun:test';
import { LiveRunStateStore } from '../../core/live-run-state';
import type { BeadIssue, UsageSummary } from '../../core/types';

const makeIssue = (id: string): BeadIssue => ({
  id,
  title: `Task ${id}`,
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
      provider: 'codex',
      project: '/workspace/ouroboros',
      projectKey: 'ouroboros-1c0b07168d',
      agentLogPaths: new Map([[1, '/tmp/a1.log']]),
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.iteration).toBe(4);
    expect(snapshot.runContext?.agentLogPaths.get(1)).toBe('/tmp/a1.log');
    expect(snapshot.runContext?.projectKey).toBe('ouroboros-1c0b07168d');
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

  it('auto-switches to review tab and restores previous tab after review clears', () => {
    const store = new LiveRunStateStore(1, 10, [1], 2);
    expect(store.getAgentSelector(1).activeTab).toBe('dev');
    expect(store.getAgentSelector(1).restoreTab).toBeNull();

    store.setAgentActiveTab(1, 'review');
    expect(store.getAgentSelector(1).activeTab).toBe('review');

    store.setAgentReviewPhase(1, {
      phase: 'reviewing',
      fixAttempt: 0,
      beadId: 'ouroboros-10.2',
    });

    const duringReview = store.getAgentSelector(1);
    expect(duringReview.activeTab).toBe('review');
    expect(duringReview.restoreTab).toBe('review');

    store.clearAgentReviewPhase(1);
    const afterReview = store.getAgentSelector(1);
    expect(afterReview.activeTab).toBe('review');
    expect(afterReview.restoreTab).toBeNull();
  });

  it('tracks iteration retry and failure marker metadata', () => {
    const store = new LiveRunStateStore(1, 4, [1], 2);

    store.markIterationRetry(1);
    store.markIterationRetry(1);
    store.setIterationOutcome(1, 'success');
    store.setIteration(2);
    store.markIterationRetry(2);
    store.setIterationOutcome(2, 'failed');

    const timeline = store.getIterationTimeline();
    expect(timeline.currentIteration).toBe(2);
    expect(timeline.totalRetries).toBe(3);
    expect(timeline.totalFailed).toBe(1);

    const iter1 = timeline.markers.find((marker) => marker.iteration === 1);
    const iter2 = timeline.markers.find((marker) => marker.iteration === 2);
    expect(iter1).toBeDefined();
    expect(iter2).toBeDefined();
    expect(iter1?.retryCount).toBe(2);
    expect(iter1?.succeeded).toBeTrue();
    expect(iter1?.failed).toBeFalse();
    expect(iter1?.isCurrent).toBeFalse();
    expect(iter2?.retryCount).toBe(1);
    expect(iter2?.succeeded).toBeFalse();
    expect(iter2?.failed).toBeTrue();
    expect(iter2?.isCurrent).toBeTrue();
  });
});
