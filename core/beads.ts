import { spawn } from 'node:child_process';
import { safeJsonParse, toRecord } from './json';
import type { BeadIssue, BeadsSnapshot } from './types';

type ShellResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

const BD_LIST_ARGS_READONLY = [
  '--readonly',
  'list',
  '--json',
  '--all',
  '--limit',
  '0',
  '--no-pager',
];
const BD_LIST_ARGS = ['list', '--json', '--all', '--limit', '0', '--no-pager'];
const BD_LIST_SOURCE_READONLY = 'bd --readonly list --json --all --limit 0 --no-pager';
const BD_LIST_SOURCE = 'bd list --json --all --limit 0 --no-pager';
const BD_LIST_TIMEOUT_MS = 5000;

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = (result: ShellResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(result);
    };
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });
    child.on('close', (status) => settle({ status, stdout, stderr }));
    timer = setTimeout(() => {
      child.kill();
      settle({
        status: null,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}bd command timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);
  });
}

function extractIssueArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = toRecord(payload);
  if (!record) {
    return [];
  }
  const candidates = [record.issues, record.items, record.data, record.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeIssue(raw: unknown): BeadIssue | null {
  const record = toRecord(raw);
  if (!record) {
    return null;
  }
  const id = toStringValue(record.id ?? record.issue_id ?? record.key);
  const title = toStringValue(record.title ?? record.summary ?? record.name);
  const status = toStringValue(record.status ?? 'open').toLowerCase() || 'open';
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    status,
    priority: toNumberValue(record.priority),
    assignee: toStringValue(record.assignee) || undefined,
  };
}

function sortRemaining(issues: BeadIssue[]): BeadIssue[] {
  return [...issues].sort((left, right) => {
    const leftPriority = left.priority ?? -1;
    const rightPriority = right.priority ?? -1;
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }
    return left.id.localeCompare(right.id);
  });
}

function createSnapshot(projectRoot: string, source: string, issues: BeadIssue[]): BeadsSnapshot {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const closed = issues.filter((issue) => issue.status === 'closed').length;
  const open = issues.filter((issue) => issue.status === 'open').length;
  const inProgress = issues.filter((issue) => issue.status === 'in_progress').length;
  const blocked = issues.filter((issue) => issue.status === 'blocked').length;
  const deferred = issues.filter((issue) => issue.status === 'deferred').length;
  const remainingIssues = sortRemaining(issues.filter((issue) => issue.status !== 'closed'));
  return {
    available: true,
    source,
    projectRoot,
    total: issues.length,
    remaining: remainingIssues.length,
    open,
    inProgress,
    blocked,
    closed,
    deferred,
    remainingIssues,
    byId,
  };
}

const BEAD_ID_PATTERN = /\b[a-z][a-z0-9]*(?:-[a-z0-9.]+)+\b/gi;
const EXPLICIT_PICK_PATTERNS = [
  /updated issue:\s*([a-z][a-z0-9]*(?:-[a-z0-9.]+)+)\b/gi,
  /\bbd\s+update\s+([a-z][a-z0-9]*(?:-[a-z0-9.]+)+)\b/gi,
];

function collectKnownIdsFromMatches(matches: Iterable<string>, knownIds: Set<string>): string[] {
  const found = new Set<string>();
  for (const match of matches) {
    if (knownIds.has(match)) {
      found.add(match);
    }
  }
  return [...found];
}

function collectKnownIdsByPattern(text: string, knownIds: Set<string>, pattern: RegExp): string[] {
  const matches: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const candidate = match[1];
    if (candidate) {
      matches.push(candidate);
    }
  }
  return collectKnownIdsFromMatches(matches, knownIds);
}

export function extractReferencedBeadIds(text: string, knownIds: Set<string>): string[] {
  for (const pattern of EXPLICIT_PICK_PATTERNS) {
    const explicitMatches = collectKnownIdsByPattern(text, knownIds, pattern);
    if (explicitMatches.length > 0) {
      return explicitMatches;
    }
  }

  const genericMatches = text.match(BEAD_ID_PATTERN) ?? [];
  const genericKnownIds = collectKnownIdsFromMatches(genericMatches, knownIds);
  if (genericKnownIds.length === 1) {
    return genericKnownIds;
  }
  return [];
}

function createUnavailableSnapshot(
  projectRoot: string,
  source: string,
  error: string,
): BeadsSnapshot {
  return {
    available: false,
    source,
    projectRoot,
    total: 0,
    remaining: 0,
    open: 0,
    inProgress: 0,
    blocked: 0,
    closed: 0,
    deferred: 0,
    remainingIssues: [],
    byId: new Map(),
    error,
  };
}

function isReadonlyFlagUnsupported(stderr: string, stdout: string): boolean {
  const combined = `${stderr}\n${stdout}`.toLowerCase();
  return combined.includes('unknown flag: --readonly');
}

export async function loadBeadsSnapshot(projectRoot: string): Promise<BeadsSnapshot> {
  try {
    let source = BD_LIST_SOURCE_READONLY;
    let result = await runCommand('bd', BD_LIST_ARGS_READONLY, projectRoot, BD_LIST_TIMEOUT_MS);
    if (result.status !== 0 && isReadonlyFlagUnsupported(result.stderr, result.stdout)) {
      source = BD_LIST_SOURCE;
      result = await runCommand('bd', BD_LIST_ARGS, projectRoot, BD_LIST_TIMEOUT_MS);
    }

    if (result.status !== 0) {
      return createUnavailableSnapshot(
        projectRoot,
        source,
        result.stderr.trim() || result.stdout.trim() || `bd exited with status ${result.status}`,
      );
    }

    const parsed = safeJsonParse(result.stdout);
    const rawIssues = extractIssueArray(parsed);
    const issues = rawIssues
      .map(normalizeIssue)
      .filter((issue): issue is BeadIssue => issue !== null);
    return createSnapshot(projectRoot, source, issues);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createUnavailableSnapshot(projectRoot, BD_LIST_SOURCE_READONLY, message);
  }
}
