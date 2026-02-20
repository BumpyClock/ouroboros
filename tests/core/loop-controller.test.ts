import { describe, expect, it } from 'bun:test';
import {
  buildTopLevelScopePrompt,
  shouldIgnoreStopMarkerForNoBeads,
  shouldPrintInitialSummary,
  shouldStopFromTopLevelExhaustion,
} from '../../core/loop-controller';
import type { BeadsSnapshot } from '../../core/types';

function makeSnapshot(available: boolean, remaining: number): BeadsSnapshot {
  return {
    available,
    source: 'test',
    projectRoot: process.cwd(),
    total: 0,
    remaining,
    open: 0,
    inProgress: 0,
    blocked: 0,
    closed: 0,
    deferred: 0,
    remainingIssues: [],
    byId: new Map(),
  };
}

describe('loop controller stop-marker behavior', () => {
  it('does not suppress stop-marker when task snapshot is unavailable', () => {
    const snapshot = makeSnapshot(false, 0);
    expect(
      shouldIgnoreStopMarkerForNoBeads({
        stopDetected: true,
        beadsSnapshot: snapshot,
        pickedCount: 0,
      }),
    ).toBeFalse();
  });

  it('suppresses stop-marker when tasks are available and no work was picked', () => {
    const snapshot = makeSnapshot(true, 0);
    expect(
      shouldIgnoreStopMarkerForNoBeads({
        stopDetected: true,
        beadsSnapshot: snapshot,
        pickedCount: 0,
      }),
    ).toBeTrue();
  });

  it('suppresses stop-marker when picked count fully consumes remaining work', () => {
    const snapshot = makeSnapshot(true, 1);
    expect(
      shouldIgnoreStopMarkerForNoBeads({
        stopDetected: true,
        beadsSnapshot: snapshot,
        pickedCount: 1,
      }),
    ).toBeTrue();
  });

  it('does not suppress stop-marker when picked count is below remaining work', () => {
    const snapshot = makeSnapshot(true, 2);
    expect(
      shouldIgnoreStopMarkerForNoBeads({
        stopDetected: true,
        beadsSnapshot: snapshot,
        pickedCount: 1,
      }),
    ).toBeFalse();
  });

  it('injects top-level scope constraints into prompt', () => {
    const basePrompt = 'Base prompt body';
    const scopedPrompt = buildTopLevelScopePrompt(basePrompt, 'ouroboros-13');
    expect(scopedPrompt).toContain('Base prompt body');
    expect(scopedPrompt).toContain('Top-level scope');
    expect(scopedPrompt).toContain('ouroboros-13');
    expect(scopedPrompt).toContain('no_tasks_available');
  });

  it('does not modify developer prompt when top-level task is not provided', () => {
    const basePrompt = 'Base prompt body';
    expect(buildTopLevelScopePrompt(basePrompt, undefined)).toBe(basePrompt);
  });

  it('stops when top-level work is exhausted in available snapshot', () => {
    const snapshot = makeSnapshot(true, 0);
    expect(
      shouldStopFromTopLevelExhaustion({
        beadMode: 'top-level',
        topLevelBeadId: 'ouroboros-13',
        beadsSnapshot: snapshot,
      }),
    ).toBeTrue();
  });

  it('does not stop for exhaustion in auto mode', () => {
    const snapshot = makeSnapshot(true, 0);
    expect(
      shouldStopFromTopLevelExhaustion({
        beadMode: 'auto',
        topLevelBeadId: 'ouroboros-13',
        beadsSnapshot: snapshot,
      }),
    ).toBeFalse();
  });

  it('does not stop when top-level snapshot is unavailable', () => {
    const snapshot = makeSnapshot(false, 0);
    expect(
      shouldStopFromTopLevelExhaustion({
        beadMode: 'top-level',
        topLevelBeadId: 'ouroboros-13',
        beadsSnapshot: snapshot,
      }),
    ).toBeFalse();
  });

  it('prints startup summary in non-tty mode', () => {
    expect(shouldPrintInitialSummary({ showRaw: false }, false)).toBeTrue();
  });

  it('prints startup summary in raw stream mode even on tty', () => {
    expect(shouldPrintInitialSummary({ showRaw: true }, true)).toBeTrue();
  });

  it('suppresses startup summary in rich tty mode', () => {
    expect(shouldPrintInitialSummary({ showRaw: false }, true)).toBeFalse();
  });
});
