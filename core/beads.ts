import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { safeJsonParse, toRecord } from './json';
import type { BeadIssue, BeadsSnapshot } from './types';

type ShellResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

function runCommand(command: string, args: string[], cwd: string): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => reject(error));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
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

export function loadBeadsSnapshotFromJsonl(projectRoot: string): BeadsSnapshot {
  const source = '.beads/issues.jsonl';
  const issuesPath = path.join(projectRoot, '.beads', 'issues.jsonl');
  if (!existsSync(issuesPath)) {
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
      error: `missing ${source}`,
    };
  }

  try {
    const content = readFileSync(issuesPath, 'utf8');
    const byId = new Map<string, BeadIssue>();
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const parsed = safeJsonParse(trimmed);
      const issue = normalizeIssue(parsed);
      if (issue) {
        byId.set(issue.id, issue);
      }
    }
    return createSnapshot(projectRoot, source, [...byId.values()]);
  } catch (error) {
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

export async function loadBeadsSnapshot(projectRoot: string): Promise<BeadsSnapshot> {
  const jsonlSnapshot = loadBeadsSnapshotFromJsonl(projectRoot);
  if (jsonlSnapshot.available) {
    return jsonlSnapshot;
  }

  try {
    const result = await runCommand('bd', ['list', '--json', '--all', '--limit', '0'], projectRoot);
    if (result.status !== 0) {
      return {
        available: false,
        source: 'bd list --json --all --limit 0',
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
        error:
          result.stderr.trim() || result.stdout.trim() || `bd exited with status ${result.status}`,
      };
    }

    const parsed = safeJsonParse(result.stdout);
    const rawIssues = extractIssueArray(parsed);
    const issues = rawIssues
      .map(normalizeIssue)
      .filter((issue): issue is BeadIssue => issue !== null);
    return createSnapshot(projectRoot, 'bd list --json --all --limit 0', issues);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      source: 'bd list --json --all --limit 0',
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
      error: message,
    };
  }
}
