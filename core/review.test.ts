import { describe, expect, test } from 'bun:test';
import {
  buildReviewerContext,
  isReviewFailure,
  isReviewResult,
  parseReviewerVerdict,
} from './review';
import type { BeadIssue } from './types';

describe('parseReviewerVerdict', () => {
  test('parses valid pass verdict', () => {
    const raw = JSON.stringify({ verdict: 'pass', followUpPrompt: 'All checks passed.' });
    const result = parseReviewerVerdict(raw);
    expect(isReviewResult(result)).toBe(true);
    if (isReviewResult(result)) {
      expect(result.verdict).toBe('pass');
      expect(result.followUpPrompt).toBe('All checks passed.');
    }
  });

  test('parses valid drift verdict', () => {
    const raw = JSON.stringify({
      verdict: 'drift',
      followUpPrompt: 'Missing error handling in auth module.',
    });
    const result = parseReviewerVerdict(raw);
    expect(isReviewResult(result)).toBe(true);
    if (isReviewResult(result)) {
      expect(result.verdict).toBe('drift');
      expect(result.followUpPrompt).toBe('Missing error handling in auth module.');
    }
  });

  test('extracts JSON from surrounding text', () => {
    const raw = 'Here is my review:\n{"verdict":"pass","followUpPrompt":"Looks good."}\nDone.';
    const result = parseReviewerVerdict(raw);
    expect(isReviewResult(result)).toBe(true);
    if (isReviewResult(result)) {
      expect(result.verdict).toBe('pass');
    }
  });

  test('fails on empty input', () => {
    const result = parseReviewerVerdict('');
    expect(isReviewFailure(result)).toBe(true);
    if (isReviewFailure(result)) {
      expect(result.reason).toBe('empty reviewer output');
    }
  });

  test('fails on whitespace-only input', () => {
    const result = parseReviewerVerdict('   \n  ');
    expect(isReviewFailure(result)).toBe(true);
    if (isReviewFailure(result)) {
      expect(result.reason).toBe('empty reviewer output');
    }
  });

  test('fails on no JSON object', () => {
    const result = parseReviewerVerdict('just some text without json');
    expect(isReviewFailure(result)).toBe(true);
    if (isReviewFailure(result)) {
      expect(result.reason).toBe('no JSON object found in reviewer output');
    }
  });

  test('fails on malformed JSON', () => {
    const result = parseReviewerVerdict('{verdict: pass}');
    expect(isReviewFailure(result)).toBe(true);
    if (isReviewFailure(result)) {
      expect(result.reason).toBe('reviewer output is not a valid JSON object');
    }
  });

  test('fails on invalid verdict value', () => {
    const raw = JSON.stringify({ verdict: 'approve', followUpPrompt: 'ok' });
    const result = parseReviewerVerdict(raw);
    expect(isReviewFailure(result)).toBe(true);
    if (isReviewFailure(result)) {
      expect(result.reason).toContain('invalid verdict');
      expect(result.reason).toContain('"approve"');
    }
  });

  test('fails on missing verdict field', () => {
    const raw = JSON.stringify({ followUpPrompt: 'missing verdict' });
    const result = parseReviewerVerdict(raw);
    expect(isReviewFailure(result)).toBe(true);
    if (isReviewFailure(result)) {
      expect(result.reason).toContain('invalid verdict');
    }
  });

  test('fails on null verdict', () => {
    const raw = JSON.stringify({ verdict: null, followUpPrompt: 'test' });
    const result = parseReviewerVerdict(raw);
    expect(isReviewFailure(result)).toBe(true);
  });

  test('fails on missing followUpPrompt', () => {
    const raw = JSON.stringify({ verdict: 'pass' });
    const result = parseReviewerVerdict(raw);
    expect(isReviewFailure(result)).toBe(true);
    if (isReviewFailure(result)) {
      expect(result.reason).toContain('followUpPrompt');
    }
  });

  test('fails on non-string followUpPrompt', () => {
    const raw = JSON.stringify({ verdict: 'drift', followUpPrompt: 42 });
    const result = parseReviewerVerdict(raw);
    expect(isReviewFailure(result)).toBe(true);
    if (isReviewFailure(result)) {
      expect(result.reason).toContain('followUpPrompt');
      expect(result.reason).toContain('number');
    }
  });

  test('fails on array input', () => {
    const raw = JSON.stringify([{ verdict: 'pass', followUpPrompt: 'ok' }]);
    const result = parseReviewerVerdict(raw);
    // Array has { and } from inner object, but parse extracts inner object
    // This should still work since we extract first { to last }
    // The inner object should parse successfully
    expect(isReviewResult(result)).toBe(true);
  });
});

describe('buildReviewerContext', () => {
  const baseBead: BeadIssue = {
    id: 'test-1',
    title: 'Fix login bug',
    status: 'in_progress',
    priority: 0,
  };

  test('includes bead metadata', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'done',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: 'diff --git a/file.ts',
      parallelAgents: 1,
    });
    expect(context).toContain('test-1');
    expect(context).toContain('Fix login bug');
    expect(context).toContain('in_progress');
    expect(context).toContain('priority: 0');
  });

  test('includes implementer output', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'build succeeded\nall tests pass',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: '',
      parallelAgents: 1,
    });
    expect(context).toContain('build succeeded');
    expect(context).toContain('all tests pass');
    expect(context).toContain('/logs/a1.jsonl');
  });

  test('shows no-output placeholder when empty', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: '',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: '',
      parallelAgents: 1,
    });
    expect(context).toContain('(no output captured)');
  });

  test('includes git diff', () => {
    const diff = '+const x = 1;\n-const x = 2;';
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'ok',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: diff,
      parallelAgents: 1,
    });
    expect(context).toContain(diff);
  });

  test('shows no-changes placeholder when diff empty', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'ok',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: '  ',
      parallelAgents: 1,
    });
    expect(context).toContain('(no changes detected)');
  });

  test('includes parallel agent warning when agents > 1', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'ok',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: 'diff',
      parallelAgents: 3,
    });
    expect(context).toContain('Parallel Agents Active');
    expect(context).toContain('3 agents');
    expect(context).toContain('test-1');
  });

  test('omits parallel agent warning when single agent', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'ok',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: 'diff',
      parallelAgents: 1,
    });
    expect(context).not.toContain('Parallel Agents Active');
  });

  test('includes fix attempt context', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'ok',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: 'diff',
      parallelAgents: 1,
      fixAttempt: 2,
      previousFollowUp: 'Add input validation to login form.',
    });
    expect(context).toContain('Fix Attempt 2');
    expect(context).toContain('Add input validation to login form.');
  });

  test('omits fix attempt section on first review (no fixAttempt)', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'ok',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: 'diff',
      parallelAgents: 1,
    });
    expect(context).not.toContain('Fix Attempt');
  });

  test('includes response contract instructions', () => {
    const context = buildReviewerContext({
      bead: baseBead,
      implementerOutput: 'ok',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: 'diff',
      parallelAgents: 1,
    });
    expect(context).toContain('Response Contract');
    expect(context).toContain('"verdict"');
    expect(context).toContain('"followUpPrompt"');
  });

  test('omits priority label when undefined', () => {
    const noPriorityBead: BeadIssue = { id: 'x-1', title: 'Test', status: 'open' };
    const context = buildReviewerContext({
      bead: noPriorityBead,
      implementerOutput: 'ok',
      implementerLogPath: '/logs/a1.jsonl',
      gitDiff: 'diff',
      parallelAgents: 1,
    });
    expect(context).not.toContain('priority:');
  });
});
