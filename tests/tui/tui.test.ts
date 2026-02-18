import { describe, expect, it } from 'bun:test';
import type { BeadIssue } from '../../core/types';
import {
  buildAgentNotchLine,
  buildInitialTuiInteractionState,
  buildIterationStripParts,
  buildRunContextInfoLines,
  formatAgentTitle,
  transitionTuiInteractionState,
} from '../../tui/tui';

const makeIssue = (
  id: string,
  title = 'Implement robust cross-platform path handling for user home resolution',
): BeadIssue => ({
  id,
  title,
  status: 'open',
});

const makeTimeline = (currentIteration: number, maxIterations: number) => ({
  currentIteration,
  maxIterations,
  totalRetries: 11,
  totalFailed: 1,
  markers: Array.from({ length: maxIterations }, (_, index) => {
    const iteration = index + 1;
    return {
      iteration,
      retryCount: iteration % 3,
      failed: iteration === 5,
      succeeded: iteration !== 5,
      isCurrent: iteration === currentIteration,
    };
  }),
});

describe('Ink TUI rendering helpers', () => {
  it('formats agent title as <id> · <title> and removes [A#] inline prefix pattern', () => {
    const picked = makeIssue(
      'ouroboros-10.7',
      'Implement robust cross-platform path handling for user home resolution',
    );
    const wide = formatAgentTitle(picked, 80);
    expect(wide).toContain('ouroboros-10.7 ·');
    expect(wide.startsWith('ouroboros-10.7')).toBeTrue();

    const small = formatAgentTitle(picked, 20);
    expect(small).toContain('ouroboros-10.7 ·');
    expect(small).not.toMatch(/\[A\d+\]/);

    expect(formatAgentTitle(null, 20)).toBe('no bead picked');
  });

  it('renders agent notch header line with top label', () => {
    const notch = buildAgentNotchLine(3, 48);
    expect(notch.startsWith('╭─')).toBeTrue();
    expect(notch.endsWith('╮')).toBeTrue();
    expect(notch).toContain('Agent 3');
  });

  it('collapses iteration strip markers by width breakpoints', () => {
    const timeline = makeTimeline(7, 10);

    const wide = buildIterationStripParts(timeline, 130);
    expect(wide.fallbackOnly).toBeFalse();
    expect(wide.compactLabels).toBeFalse();
    expect(wide.prevCount).toBe(3);
    expect(wide.chips).toHaveLength(7);
    expect(wide.chips[3]).toContain('07*');

    const mid = buildIterationStripParts(timeline, 110);
    expect(mid.compactLabels).toBeTrue();
    expect(mid.prevCount).toBe(4);
    expect(mid.chips).toHaveLength(5);

    const narrow = buildIterationStripParts(timeline, 78);
    expect(narrow.fallbackOnly).toBeTrue();
    expect(narrow.compactLabels).toBeTrue();
    expect(narrow.chips).toHaveLength(0);
    expect(narrow.prevCount).toBe(6);
    expect(narrow.retryCount).toBe(11);
    expect(narrow.failedCount).toBe(1);
  });

  it('handles zero-width timeline input with deterministic fallback', () => {
    const timeline = makeTimeline(1, 0);
    const tiny = buildIterationStripParts(timeline, 120);
    expect(tiny).toEqual({
      chips: [],
      prevCount: 0,
      compactLabels: true,
      fallbackOnly: true,
      retryCount: 11,
      failedCount: 1,
    });
  });

  it('maps loop startup metadata into tagged run-context rows', () => {
    const lines = buildRunContextInfoLines({
      startedAt: 1,
      command: 'codex run --all',
      batch: 'target 1',
      agentLogPaths: new Map(),
      loopLabel: 'Codex Loop',
      provider: 'codex',
      project: 'C:/Users/adity/Projects/ouroboros',
      projectKey: 'ouroboros-1c0b07168d',
      commandPath: 'C:/Users/adity/AppData/Local/pnpm/codex.cmd',
      promptPath: 'C:/Users/adity/Projects/ouroboros/.ai_agents/prompt.md',
      logDir: 'C:/Users/adity/.ouroborus/logs/ouroboros/2026-02-18',
      maxIterations: 40,
      model: 'gpt-5.3-codex-spark',
      reasoningEffort: 'high',
      parallelAgents: 1,
      yolo: true,
    });

    expect(lines.map((line) => line.label)).toEqual([
      'LOOP',
      'PROVIDER',
      'PROJECT',
      'PROJECT_KEY',
      'COMMAND',
      'PROMPT',
      'LOGS',
      'LIMIT',
      'MODEL',
      'EFFORT',
      'PARALLEL',
      'YOLO',
    ]);
    expect(lines.find((line) => line.label === 'YOLO')?.value).toBe('enabled');
  });
});

describe('Ink TUI interaction state', () => {
  it('cycles views with tab and shortcuts', () => {
    const state = buildInitialTuiInteractionState(2, 10);

    const next = transitionTuiInteractionState(state, '', { rightArrow: true });
    expect(next.view).toBe('tasks');
    expect(next.focusedPane).toBe('iterations');

    const iterView = transitionTuiInteractionState(next, '', { rightArrow: true });
    expect(iterView.view).toBe('iterations');

    const direct = transitionTuiInteractionState(iterView, '3', {});
    expect(direct.view).toBe('iteration-detail');
    expect(direct.focusedPane).toBe('iterations');
    const reversed = transitionTuiInteractionState(direct, '', { leftArrow: true });
    expect(reversed.view).toBe('iterations');
  });

  it('cycles focus and view safely across boundary transitions', () => {
    const state = buildInitialTuiInteractionState(2, 4);

    const focusIterations = transitionTuiInteractionState(state, '', { rightArrow: true });
    expect(focusIterations.focusedPane).toBe('iterations');
    expect(focusIterations.view).toBe('tasks');

    const nextView = transitionTuiInteractionState(focusIterations, '', { rightArrow: true });
    expect(nextView.view).toBe('iterations');
    expect(nextView.focusedPane).toBe('iterations');

    const backToTasks = transitionTuiInteractionState(nextView, '', { leftArrow: true });
    expect(backToTasks.view).toBe('tasks');
    expect(backToTasks.focusedPane).toBe('iterations');

    const backToAgents = transitionTuiInteractionState(backToTasks, '', { leftArrow: true });
    expect(backToAgents.focusedPane).toBe('agents');
  });

  it('toggles help and tracks navigation selections', () => {
    const state = buildInitialTuiInteractionState(3, 10);
    const withHelp = transitionTuiInteractionState(state, '?', {});
    expect(withHelp.helpVisible).toBeTrue();

    const withSelection = transitionTuiInteractionState(withHelp, 'j', {});
    expect(withSelection.selectedAgentIndex).toBe(1);
    const clipped = transitionTuiInteractionState(withSelection, 'k', {});
    expect(clipped.selectedAgentIndex).toBe(0);
  });

  it('adjusts selected iteration in iteration-detail context', () => {
    const state = buildInitialTuiInteractionState(1, 5);
    const detail = transitionTuiInteractionState(state, '3', {});
    expect(detail.view).toBe('iteration-detail');

    const next = transitionTuiInteractionState(detail, ']', {});
    expect(next.selectedIteration).toBe(2);
    const back = transitionTuiInteractionState(next, '[', {});
    expect(back.selectedIteration).toBe(1);
  });

  it('supports iteration-focus navigation and enter-to-detail', () => {
    const state = buildInitialTuiInteractionState(2, 8);
    const focused = transitionTuiInteractionState(state, '', { tab: true });
    expect(focused.focusedPane).toBe('iterations');
    const moved = transitionTuiInteractionState(focused, 'j', {});
    expect(moved.selectedIteration).toBe(2);
    const detail = transitionTuiInteractionState(moved, '', { return: true });
    expect(detail.view).toBe('iteration-detail');
    expect(detail.focusedPane).toBe('iterations');
  });

  it('keeps Enter scoped to iteration pane context', () => {
    const base = buildInitialTuiInteractionState(2, 8);
    const ignored = transitionTuiInteractionState(base, '', { return: true });
    expect(ignored.view).toBe('tasks');
    expect(ignored.focusedPane).toBe('agents');

    const iterPane = transitionTuiInteractionState(base, '', { tab: true });
    const detail = transitionTuiInteractionState(iterPane, '', { return: true });
    expect(detail.view).toBe('iteration-detail');
    expect(detail.focusedPane).toBe('iterations');
  });

  it('keeps direct view selectors bounded and ignore invalid input', () => {
    const state = buildInitialTuiInteractionState(2, 8);
    expect(transitionTuiInteractionState(state, '1', {}).view).toBe('tasks');
    expect(transitionTuiInteractionState(state, '2', {}).view).toBe('iterations');
    expect(transitionTuiInteractionState(state, '3', {}).view).toBe('iteration-detail');
    expect(transitionTuiInteractionState(state, '4', {}).view).toBe('reviewer');
    expect(transitionTuiInteractionState(state, '5', {})).toEqual(state);
    expect(transitionTuiInteractionState(state, 'x', {})).toEqual(state);
  });

  it('toggles dashboard overlay without changing view state', () => {
    const state = buildInitialTuiInteractionState(2, 8);
    const dashboard = transitionTuiInteractionState(state, 'd', {});
    expect(dashboard.dashboardVisible).toBeTrue();

    const closed = transitionTuiInteractionState(dashboard, 'd', {});
    expect(closed.dashboardVisible).toBeFalse();
    expect(closed.view).toBe(state.view);
    expect(closed.focusedPane).toBe(state.focusedPane);
  });

  it('toggles parallel and merge views with Ralph-style shortcuts', () => {
    const state = buildInitialTuiInteractionState(3, 8);
    const workers = transitionTuiInteractionState(state, 'w', {});
    expect(workers.view).toBe('parallel-overview');

    const workerDetail = transitionTuiInteractionState(workers, '', { return: true });
    expect(workerDetail.view).toBe('parallel-detail');

    const backToWorkers = transitionTuiInteractionState(workerDetail, '', { escape: true });
    expect(backToWorkers.view).toBe('parallel-overview');

    const merge = transitionTuiInteractionState(backToWorkers, 'm', {});
    expect(merge.view).toBe('merge-progress');

    const backToTasks = transitionTuiInteractionState(merge, '', { escape: true });
    expect(backToTasks.view).toBe('tasks');
  });

  it('opens and handles conflict-resolution actions', () => {
    const state = buildInitialTuiInteractionState(2, 5);
    const merge = transitionTuiInteractionState(state, 'm', {});
    const conflict = transitionTuiInteractionState(merge, 'a', {});
    expect(conflict.view).toBe('conflict-resolution');
    expect(conflict.conflictPanelVisible).toBeTrue();
    expect(conflict.selectedConflictIndex).toBe(0);

    const acceptNext = transitionTuiInteractionState(conflict, 'a', {});
    expect(acceptNext.selectedConflictIndex).toBe(1);

    const retried = transitionTuiInteractionState(acceptNext, 'r', {});
    expect(retried.view).toBe('merge-progress');
    expect(retried.conflictPanelVisible).toBeFalse();

    const reopened = transitionTuiInteractionState(retried, 'a', {});
    const skipped = transitionTuiInteractionState(reopened, 's', {});
    expect(skipped.view).toBe('tasks');
    expect(skipped.conflictPanelVisible).toBeFalse();
  });
});
