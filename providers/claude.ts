import { formatShort } from '../core/text';
import type { CliOptions, PreviewEntry, UsageSummary } from '../core/types';
import {
  CLAUDE_FIRST_STRING_KEYS,
  collectRawJsonLines,
  firstStringValue,
  isRecord,
  safeJsonParse,
  toJsonCandidates,
  toPositiveNumber,
} from './parsing';
import { extractRetryDelayFromOutput } from './retry';
import type { ProviderAdapter } from './types';

function claudeFirstStringValue(value: unknown): string {
  return firstStringValue(value, CLAUDE_FIRST_STRING_KEYS);
}

function extractClaudePreviewLine(event: Record<string, unknown>): PreviewEntry | null {
  const type = typeof event.type === 'string' ? event.type.toLowerCase() : '';
  const payload = claudeFirstStringValue(
    event.message ?? event.content ?? event.text ?? event.delta ?? event.result ?? event,
  );
  if (!payload) {
    return null;
  }

  if (type.includes('tool')) {
    return { kind: 'tool', label: 'tool', text: formatShort(payload, 200) };
  }
  if (type.includes('think') || type.includes('reason')) {
    return { kind: 'reasoning', label: 'reasoning', text: formatShort(payload, 200) };
  }
  if (type.includes('error')) {
    return { kind: 'error', label: 'error', text: formatShort(payload, 200) };
  }
  if (type.includes('assistant') || type.includes('message') || type.includes('result')) {
    return { kind: 'assistant', label: 'assistant', text: formatShort(payload) };
  }
  return { kind: 'message', label: type || 'message', text: formatShort(payload) };
}

function previewEntriesFromLine(line: string): PreviewEntry[] {
  const entries: PreviewEntry[] = [];
  const trimmed = line.trim();
  if (!trimmed) {
    return entries;
  }

  const values = toJsonCandidates(trimmed);
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const nested of value) {
        if (!isRecord(nested)) {
          continue;
        }
        const entry = extractClaudePreviewLine(nested);
        if (entry) {
          entries.push(entry);
        }
      }
      continue;
    }
    if (isRecord(value)) {
      const entry = extractClaudePreviewLine(value);
      if (entry) {
        entries.push(entry);
      }
    }
  }

  if (entries.length === 0) {
    entries.push({ kind: 'assistant', label: 'assistant', text: formatShort(trimmed) });
  }
  return entries;
}

function collectMessages(output: string): PreviewEntry[] {
  const messages: PreviewEntry[] = [];
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    messages.push(...previewEntriesFromLine(line));
  }
  return messages;
}

function extractUsageSummary(output: string): UsageSummary | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parsed = safeJsonParse(line);
    if (!isRecord(parsed)) {
      continue;
    }

    let usage: Record<string, unknown> | null = null;
    if (isRecord(parsed.usage)) {
      usage = parsed.usage;
    } else if (isRecord(parsed.result) && isRecord(parsed.result.usage)) {
      usage = parsed.result.usage;
    } else if (isRecord(parsed.message) && isRecord(parsed.message.usage)) {
      usage = parsed.message.usage;
    }
    if (!usage) {
      continue;
    }

    const inputTokens =
      toPositiveNumber(usage.input_tokens) ?? toPositiveNumber(usage.inputTokens) ?? 0;
    const cachedInputTokens =
      toPositiveNumber(usage.cached_input_tokens) ??
      toPositiveNumber(usage.cache_read_input_tokens) ??
      toPositiveNumber(usage.cachedInputTokens) ??
      0;
    const outputTokens =
      toPositiveNumber(usage.output_tokens) ?? toPositiveNumber(usage.outputTokens) ?? 0;
    return { inputTokens, cachedInputTokens, outputTokens };
  }

  return null;
}

function hasNoBeadsMarker(output: string): boolean {
  const normalized = output.toLowerCase();
  return normalized.includes('no beads available') || normalized.includes('no_beads_available');
}

function formatCommandHint(command: string): string {
  if (process.platform !== 'win32') {
    return `make sure "${command}" is installed and available in PATH`;
  }
  return `on Windows, pass --command with a full path like "C:/Users/<user>/AppData/Roaming/npm/claude.CMD"`;
}

function buildClaudeExecArgs(
  prompt: string,
  _lastMessagePath: string,
  options: CliOptions,
): string[] {
  const args = ['-p', prompt, '--output-format', 'stream-json'];
  if (options.model.trim()) {
    args.push('--model', options.model.trim());
  }
  if (options.yolo) {
    args.push('--permission-mode', 'bypassPermissions');
  }
  return args;
}

export const claudeProvider: ProviderAdapter = {
  name: 'claude',
  displayName: 'Claude Code',
  defaults: {
    command: 'claude',
    logDir: '.ai_agents/logs/claude-loop',
    model: '',
    reasoningEffort: 'high',
    yolo: true,
  },
  buildExecArgs: buildClaudeExecArgs,
  previewEntriesFromLine,
  collectMessages,
  collectRawJsonLines,
  extractUsageSummary,
  extractRetryDelaySeconds: extractRetryDelayFromOutput,
  hasStopMarker: hasNoBeadsMarker,
  formatCommandHint,
};
