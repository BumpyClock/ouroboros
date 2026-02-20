import { isRecord, safeJsonParse } from './json';
import type { TaskIssue } from './types';

export type ReviewVerdict = 'pass' | 'drift';

export type ReviewResult = {
  verdict: ReviewVerdict;
  followUpPrompt: string;
};

export type ReviewFailure = {
  reason: string;
  raw: string;
};

/**
 * Parse strict reviewer JSON output.
 *
 * Expected shape: { "verdict": "pass" | "drift", "followUpPrompt": "..." }
 *
 * Returns ReviewResult on success, ReviewFailure on any parse/validation error.
 * Malformed or missing fields are always treated as failure — the reviewer
 * contract is strict by design.
 */
export function parseReviewerVerdict(raw: string): ReviewResult | ReviewFailure {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { reason: 'empty reviewer output', raw: trimmed };
  }

  // Extract first JSON object from output (reviewer may emit preamble text)
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return { reason: 'no JSON object found in reviewer output', raw: trimmed };
  }

  const jsonCandidate = trimmed.slice(jsonStart, jsonEnd + 1);
  const parsed = safeJsonParse(jsonCandidate);
  if (!isRecord(parsed)) {
    return { reason: 'reviewer output is not a valid JSON object', raw: jsonCandidate };
  }

  const verdict = parsed.verdict;
  if (verdict !== 'pass' && verdict !== 'drift') {
    return {
      reason: `invalid verdict: expected "pass" or "drift", got ${JSON.stringify(verdict)}`,
      raw: jsonCandidate,
    };
  }

  const followUpPrompt = parsed.followUpPrompt;
  if (typeof followUpPrompt !== 'string') {
    return {
      reason: `missing or invalid followUpPrompt: expected string, got ${typeof followUpPrompt}`,
      raw: jsonCandidate,
    };
  }

  return { verdict, followUpPrompt };
}

/**
 * Type guard: true when parse succeeded.
 */
export function isReviewResult(value: ReviewResult | ReviewFailure): value is ReviewResult {
  return 'verdict' in value;
}

/**
 * Type guard: true when parse failed.
 */
export function isReviewFailure(value: ReviewResult | ReviewFailure): value is ReviewFailure {
  return 'reason' in value;
}

export type ReviewerContextParams = {
  task?: TaskIssue;
  bead?: TaskIssue;
  implementerOutput: string;
  implementerLogPath: string;
  gitDiff: string;
  parallelAgents: number;
  fixAttempt?: number;
  previousFollowUp?: string;
};

/**
 * Build the context block appended to the reviewer prompt for a single slot review.
 *
 * Includes:
 * - Task metadata (id, title, status, priority)
 * - Implementer combined output (stdout+stderr)
 * - Implementer log path reference
 * - Git diff snapshot
 * - Warning about unrelated parallel-agent changes when parallelAgents > 1
 * - Fix attempt context when reviewing after a fix pass
 */
export function buildReviewerContext(params: ReviewerContextParams): string {
  const task = params.task ?? params.bead;
  if (!task) {
    throw new Error('buildReviewerContext requires task metadata');
  }
  const { implementerOutput, implementerLogPath, gitDiff, parallelAgents } = params;

  const sections: string[] = [];

  // Task metadata
  const priorityLabel = task.priority !== undefined ? ` (priority: ${task.priority})` : '';
  sections.push(
    `## Task Under Review\n- **ID**: ${task.id}\n- **Title**: ${task.title}\n- **Status**: ${task.status}${priorityLabel}`,
  );

  // Fix attempt context
  if (params.fixAttempt !== undefined && params.fixAttempt > 0 && params.previousFollowUp) {
    sections.push(
      `## Fix Attempt ${params.fixAttempt}\nThe previous review found drift. The developer was asked to fix the following:\n\n${params.previousFollowUp}`,
    );
  }

  // Implementer output
  const outputSnippet = implementerOutput.trim()
    ? implementerOutput.trim().slice(0, 50_000)
    : '(no output captured)';
  sections.push(
    `## Implementer Output\nLog file: \`${implementerLogPath}\`\n\n\`\`\`\n${outputSnippet}\n\`\`\``,
  );

  // Git diff
  const diffSnippet = gitDiff.trim() ? gitDiff.trim().slice(0, 50_000) : '(no changes detected)';
  sections.push(`## Git Diff Snapshot\n\`\`\`diff\n${diffSnippet}\n\`\`\``);

  // Parallel agent warning
  if (parallelAgents > 1) {
    sections.push(
      `## Warning: Parallel Agents Active\nThis iteration runs ${parallelAgents} agents in parallel. The git diff may include changes from other agents working on different tasks. Focus your review only on changes relevant to task **${task.id}**.`,
    );
  }

  // Response contract
  sections.push(
    '## Response Contract\nYou MUST respond with a single JSON object and nothing else:\n```json\n{ "verdict": "pass" | "drift", "followUpPrompt": "..." }\n```\n- `verdict`: `"pass"` if implementation matches task requirements, `"drift"` if it does not.\n- `followUpPrompt`: When `"pass"`, a brief summary. When `"drift"`, specific instructions for the developer to fix the issues found.',
  );

  return sections.join('\n\n');
}
