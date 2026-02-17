import { describe, expect, it } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBeadsSnapshot } from '../../core/beads';
import { isRecord, safeJsonParse, toRecord } from '../../core/json';
import { loadIterationState } from '../../core/state';

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

  it('uses readonly bd list even when .beads/issues.jsonl exists', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-beads-bd-source-'));
    const bdShim = path.join(tempRoot, process.platform === 'win32' ? 'bd.cmd' : 'bd');
    const oldPath = process.env.PATH ?? '';
    const pathSep = process.platform === 'win32' ? ';' : ':';
    try {
      const beadsDir = path.join(tempRoot, '.beads');
      mkdirSync(beadsDir, { recursive: true });
      writeFileSync(
        path.join(beadsDir, 'issues.jsonl'),
        '{bad-json-line}\n{"id":"ouroboros-9","title":"from-jsonl","status":"open"}\n',
      );

      if (process.platform === 'win32') {
        writeFileSync(
          bdShim,
          '@echo off\r\necho [{"id":"ouroboros-42","title":"from-bd","status":"open"}]\r\nexit /b 0\r\n',
        );
      } else {
        writeFileSync(
          bdShim,
          '#!/usr/bin/env sh\necho \'[{"id":"ouroboros-42","title":"from-bd","status":"open"}]\'\n',
        );
        chmodSync(bdShim, 0o755);
      }

      process.env.PATH = `${tempRoot}${pathSep}${oldPath}`;
      const snapshot = await loadBeadsSnapshot(tempRoot);
      expect(snapshot.available).toBeTrue();
      expect(snapshot.source).toBe('bd --readonly list --json --all --limit 0 --no-pager');
      expect(snapshot.total).toBe(1);
      expect(snapshot.remainingIssues.map((issue) => issue.id)).toEqual(['ouroboros-42']);
    } finally {
      process.env.PATH = oldPath;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('falls back to non-readonly bd list when readonly flag is unsupported', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-beads-readonly-fallback-'));
    const bdShim = path.join(tempRoot, process.platform === 'win32' ? 'bd.cmd' : 'bd');
    const oldPath = process.env.PATH ?? '';
    const pathSep = process.platform === 'win32' ? ';' : ':';
    try {
      if (process.platform === 'win32') {
        writeFileSync(
          bdShim,
          '@echo off\r\nif "%1"=="--readonly" (\r\n  1>&2 echo unknown flag: --readonly\r\n  exit /b 1\r\n)\r\necho [{"id":"ouroboros-77","title":"fallback","status":"open"}]\r\nexit /b 0\r\n',
        );
      } else {
        writeFileSync(
          bdShim,
          '#!/usr/bin/env sh\nif [ "$1" = "--readonly" ]; then\n  echo "unknown flag: --readonly" >&2\n  exit 1\nfi\necho \'[{"id":"ouroboros-77","title":"fallback","status":"open"}]\'\n',
        );
        chmodSync(bdShim, 0o755);
      }

      process.env.PATH = `${tempRoot}${pathSep}${oldPath}`;
      const snapshot = await loadBeadsSnapshot(tempRoot);
      expect(snapshot.available).toBeTrue();
      expect(snapshot.source).toBe('bd list --json --all --limit 0 --no-pager');
      expect(snapshot.total).toBe(1);
      expect(snapshot.remainingIssues.map((issue) => issue.id)).toEqual(['ouroboros-77']);
    } finally {
      process.env.PATH = oldPath;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
