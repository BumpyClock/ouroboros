import { formatShort } from '../core/text';
import type { CliOptions, PreviewEntry, UsageSummary } from '../core/types';
import {
  COPILOT_FIRST_STRING_KEYS,
  collectRawJsonLines,
  firstStringValue,
  hasNoBeadsMarker,
  isRecord,
  safeJsonParse,
  toJsonCandidates,
  toPositiveNumber,
} from './parsing';
import { extractRetryDelayFromOutput } from './retry';
import type { ProviderAdapter } from './types';

function copilotFirstStringValue(value: unknown): string {
  return firstStringValue(value, COPILOT_FIRST_STRING_KEYS);
}

function previewFromJson(value: Record<string, unknown>): PreviewEntry | null {
  const type = typeof value.type === 'string' ? value.type.toLowerCase() : '';
  const payload = copilotFirstStringValue(
    value.message ?? value.content ?? value.text ?? value.delta ?? value.result ?? value,
  );
  if (!payload) {
    return null;
  }
  if (type.includes('tool')) {
    return { kind: 'tool', label: 'tool', text: formatShort(payload, 200) };
  }
  if (type.includes('reason') || type.includes('think')) {
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
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  const values = toJsonCandidates(trimmed);
  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }
    const entry = previewFromJson(value);
    if (entry) {
      return [entry];
    }
  }

  return [{ kind: 'assistant', label: 'assistant', text: formatShort(trimmed) }];
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
    if (!isRecord(parsed.usage)) {
      continue;
    }
    const usage = parsed.usage;
    const inputTokens =
      toPositiveNumber(usage.input_tokens) ?? toPositiveNumber(usage.inputTokens) ?? 0;
    const cachedInputTokens =
      toPositiveNumber(usage.cached_input_tokens) ?? toPositiveNumber(usage.cachedInputTokens) ?? 0;
    const outputTokens =
      toPositiveNumber(usage.output_tokens) ?? toPositiveNumber(usage.outputTokens) ?? 0;
    return { inputTokens, cachedInputTokens, outputTokens };
  }

  return null;
}

function formatCommandHint(command: string): string {
  if (process.platform !== 'win32') {
    return `make sure "${command}" is installed and available in PATH`;
  }
  return `on Windows, pass --command with a full path like "C:/Users/<user>/AppData/Local/Programs/GitHub Copilot/copilot.exe"`;
}

function buildCopilotExecArgs(
  prompt: string,
  _lastMessagePath: string,
  options: CliOptions,
): string[] {
  const args = ['-p', prompt, '-s'];
  if (options.model.trim()) {
    args.push('--model', options.model.trim());
  }
  if (options.yolo) {
    args.push('--allow-all');
  }
  return args;
}

export const copilotProvider: ProviderAdapter = {
  name: 'copilot',
  displayName: 'GitHub Copilot',
  defaults: {
    command: 'copilot',
    logDir: '.ai_agents/logs/copilot-loop',
    model: '',
    reasoningEffort: 'high',
    yolo: true,
  },
  buildExecArgs: buildCopilotExecArgs,
  previewEntriesFromLine,
  collectMessages,
  collectRawJsonLines,
  extractUsageSummary,
  extractRetryDelaySeconds: extractRetryDelayFromOutput,
  hasStopMarker: hasNoBeadsMarker,
  formatCommandHint,
};
