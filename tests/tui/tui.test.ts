import { describe, expect, it } from 'bun:test';
import type { BeadIssue } from '../../core/types';
import { buildAgentNotchLine, buildIterationStripParts, formatAgentTitle } from '../../tui/tui';

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
    expect(formatAgentTitle(picked, 80)).toBe(
      'ouroboros-10.7 · Implement robust cross-platform path handling for user home resolution',
    );

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
    expect(mid.compactLabels).toBeFalse();
    expect(mid.prevCount).toBe(3);
    expect(mid.chips).toHaveLength(5);

    const narrow = buildIterationStripParts(timeline, 78);
    expect(narrow.fallbackOnly).toBeTrue();
    expect(narrow.compactLabels).toBeTrue();
    expect(narrow.chips).toHaveLength(0);
    expect(narrow.prevCount).toBe(6);
    expect(narrow.retryCount).toBe(11);
    expect(narrow.failedCount).toBe(1);
  });
});
