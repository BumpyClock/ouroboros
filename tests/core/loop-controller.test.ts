import { describe, expect, it } from 'bun:test';
import { shouldIgnoreStopMarkerForNoBeads } from '../../core/loop-controller';
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
  it('does not suppress stop-marker when beads snapshot is unavailable', () => {
    const snapshot = makeSnapshot(false, 0);
    expect(
      shouldIgnoreStopMarkerForNoBeads({
        stopDetected: true,
        beadsSnapshot: snapshot,
        pickedCount: 0,
      }),
    ).toBeFalse();
  });

  it('suppresses stop-marker when beads are available and no work was picked', () => {
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
});
