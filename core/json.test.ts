import { describe, expect, it } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBeadsSnapshot } from './beads';
import { isRecord, safeJsonParse, toRecord } from './json';
import { loadIterationState } from './state';

describe('json helpers', () => {
  it('parses valid JSON and rejects malformed JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeJsonParse('{invalid}')).toBeNull();
  });

  it('checks plain-object shape with isRecord', () => {
    expect(isRecord({ a: 1 })).toBeTrue();
    expect(isRecord([])).toBeFalse();
    expect(isRecord(null)).toBeFalse();
  });

  it('normalizes records with toRecord', () => {
    expect(toRecord({ a: 1 })).toEqual({ a: 1 });
    expect(toRecord([])).toBeNull();
  });

  it('recovers from malformed iteration state while preserving configured max', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ouroboros-iteration-'));
    const statePath = path.join(root, '.ai_agents');
    try {
      mkdirSync(statePath, { recursive: true });
      const filePath = path.join(statePath, 'iteration.json');
      writeFileSync(filePath, '{bad-json');

      const recovered = loadIterationState(filePath, 9, false);
      expect(recovered).toEqual({ current_iteration: 0, max_iterations: 9 });
      expect(readFileSync(filePath, 'utf8').trim()).toBe(
        '{"current_iteration":0,"max_iterations":9}',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('treats malformed bd list JSON as empty but available snapshot', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-bd-'));
    const bdShim = path.join(tempRoot, process.platform === 'win32' ? 'bd.cmd' : 'bd');
    const oldPath = process.env.PATH ?? '';
    const pathSep = process.platform === 'win32' ? ';' : ':';

    try {
      if (process.platform === 'win32') {
        writeFileSync(bdShim, '@echo off\r\necho {invalid-json}\r\nexit /b 0\r\n');
      } else {
        writeFileSync(bdShim, "#!/usr/bin/env sh\necho '{invalid-json}'\n");
        chmodSync(bdShim, 0o755);
      }

      process.env.PATH = `${tempRoot}${pathSep}${oldPath}`;
      const snapshot = await loadBeadsSnapshot(tempRoot);
      expect(snapshot.available).toBeTrue();
      expect(snapshot.total).toBe(0);
      expect(snapshot.open).toBe(0);
      expect(snapshot.inProgress).toBe(0);
      expect(snapshot.blocked).toBe(0);
      expect(snapshot.deferred).toBe(0);
      expect(snapshot.remainingIssues).toEqual([]);
    } finally {
      process.env.PATH = oldPath;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
