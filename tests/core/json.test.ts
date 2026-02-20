import { describe, expect, it } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { loadBeadsSnapshot } from '../../core/beads';
import { isRecord, safeJsonParse, toRecord } from '../../core/json';
import { loadIterationState } from '../../core/state';

function installNodeTsqShim(root: string, script: string): void {
  const jsPath = path.join(root, 'tsq-script.js');
  const isWindows = process.platform === 'win32';
  writeFileSync(jsPath, script);
  if (isWindows) {
    writeFileSync(path.join(root, 'tsq.cmd'), `@node "%~dp0\\tsq-script.js" %*\r\n`);
  } else {
    writeFileSync(path.join(root, 'tsq'), `#!/usr/bin/env node\n${script}`);
    chmodSync(path.join(root, 'tsq'), 0o755);
  }
}

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

  it('treats malformed tsq list JSON as empty but available snapshot', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-tsq-'));
    const tsqShim = path.join(tempRoot, process.platform === 'win32' ? 'tsq.cmd' : 'tsq');
    const oldPath = process.env.PATH ?? '';
    const pathSep = process.platform === 'win32' ? ';' : ':';

    try {
      if (process.platform === 'win32') {
        writeFileSync(tsqShim, '@echo off\r\necho {invalid-json}\r\nexit /b 0\r\n');
      } else {
        writeFileSync(tsqShim, "#!/usr/bin/env sh\necho '{invalid-json}'\n");
        chmodSync(tsqShim, 0o755);
      }

      process.env.PATH = `${tempRoot}${pathSep}${oldPath}`;
      const snapshot = await loadBeadsSnapshot(tempRoot);
      expect(snapshot.available).toBeTrue();
      expect(snapshot.source).toBe('tsq list --json');
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

  it('uses tsq list even when legacy .beads/issues.jsonl exists', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-tasks-tsq-source-'));
    const tsqShim = path.join(tempRoot, process.platform === 'win32' ? 'tsq.cmd' : 'tsq');
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
          tsqShim,
          '@echo off\r\necho {"data":{"tasks":[{"id":"tsq-42","title":"from-tsq","status":"open"}]}}\r\nexit /b 0\r\n',
        );
      } else {
        writeFileSync(
          tsqShim,
          '#!/usr/bin/env sh\necho \'{"data":{"tasks":[{"id":"tsq-42","title":"from-tsq","status":"open"}]}}\'\n',
        );
        chmodSync(tsqShim, 0o755);
      }

      process.env.PATH = `${tempRoot}${pathSep}${oldPath}`;
      const snapshot = await loadBeadsSnapshot(tempRoot);
      expect(snapshot.available).toBeTrue();
      expect(snapshot.source).toBe('tsq list --json');
      expect(snapshot.total).toBe(1);
      expect(snapshot.remainingIssues.map((issue) => issue.id)).toEqual(['tsq-42']);
    } finally {
      process.env.PATH = oldPath;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns unavailable snapshot when tsq list exits non-zero', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-tsq-error-'));
    const tsqShim = path.join(tempRoot, process.platform === 'win32' ? 'tsq.cmd' : 'tsq');
    const oldPath = process.env.PATH ?? '';
    const pathSep = process.platform === 'win32' ? ';' : ':';
    try {
      if (process.platform === 'win32') {
        writeFileSync(tsqShim, '@echo off\r\n1>&2 echo tsq failed\r\nexit /b 2\r\n');
      } else {
        writeFileSync(tsqShim, '#!/usr/bin/env sh\necho "tsq failed" >&2\nexit 2\n');
        chmodSync(tsqShim, 0o755);
      }

      process.env.PATH = `${tempRoot}${pathSep}${oldPath}`;
      const snapshot = await loadBeadsSnapshot(tempRoot);
      expect(snapshot.available).toBeFalse();
      expect(snapshot.source).toBe('tsq list --json');
      expect(snapshot.error).toBe('tsq failed');
      expect(snapshot.total).toBe(0);
    } finally {
      process.env.PATH = oldPath;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('scopes snapshot by parent_id in-memory when top-level mode is active', async () => {
    const tempRoot = mkdtempSync(path.join(tmpdir(), 'ouroboros-tsq-top-level-scope-'));
    const oldPath = process.env.PATH ?? '';
    const pathSep = process.platform === 'win32' ? ';' : ':';

    try {
      installNodeTsqShim(
        tempRoot,
        `
const args = process.argv.slice(2);
if (args.includes('--parent')) {
  console.error('unexpected --parent flag');
  process.exit(1);
}
const tasks = [
  { id: 'tsq-parent', title: 'parent', status: 'open' },
  { id: 'tsq-parent.1', title: 'scoped child', status: 'open', parent_id: 'tsq-parent' },
  { id: 'tsq-parent.2', title: 'done child', status: 'closed', parent_id: 'tsq-parent' },
  { id: 'tsq-other.1', title: 'other child', status: 'open', parent_id: 'tsq-other' }
];
console.log(JSON.stringify({ data: { tasks } }));
`.trim(),
      );
      process.env.PATH = `${tempRoot}${pathSep}${oldPath}`;
      const snapshot = await loadBeadsSnapshot(tempRoot, 'tsq-parent');
      expect(snapshot.available).toBeTrue();
      expect(snapshot.source).toBe('tsq list --json');
      expect(snapshot.total).toBe(2);
      expect(snapshot.closed).toBe(1);
      expect(snapshot.remainingIssues.map((issue) => issue.id)).toEqual(['tsq-parent.1']);
    } finally {
      process.env.PATH = oldPath;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
