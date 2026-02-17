import { formatShort } from '../core/text';
import type { CliOptions, PreviewEntry, UsageSummary } from '../core/types';
import {
  CODEX_FIRST_STRING_KEYS,
  firstStringValue,
  isRecord,
  safeJsonParse,
  toJsonCandidates,
} from './parsing';
import { extractRetryDelayFromOutput } from './retry';
import type { ProviderAdapter } from './types';

function summarizeCommand(command: string): string {
  const compact = command.replace(/\s+/g, ' ').trim();
  const commandMatch = compact.match(/-Command\s+(.+)$/i);
  if (commandMatch) {
    const extracted = commandMatch[1].trim().replace(/^['"]|['"]$/g, '');
    return formatShort(extracted, 140);
  }
  return formatShort(compact, 140);
}

function codexFirstStringValue(value: unknown): string {
  return firstStringValue(value, CODEX_FIRST_STRING_KEYS);
}

function extractCodexPreviewLine(event: Record<string, unknown>): PreviewEntry | null {
  const type = typeof event.type === 'string' ? event.type : '';

  if (type === 'item.started' || type === 'item.completed' || type === 'item.delta') {
    const item = isRecord(event.item) ? event.item : null;
    if (!item) {
      return null;
    }

    const itemType = typeof item.type === 'string' ? item.type : 'item';
    if (itemType === 'agent_message') {
      const payload = codexFirstStringValue(item.text ?? item.content ?? item.message);
      return payload ? { kind: 'assistant', label: 'assistant', text: formatShort(payload) } : null;
    }
    if (itemType === 'reasoning') {
      const payload = codexFirstStringValue(
        item.text ?? item.summary ?? item.content ?? item.message,
      );
      return payload
        ? { kind: 'reasoning', label: 'reasoning', text: formatShort(payload, 200) }
        : null;
    }
    if (
      itemType === 'command_execution' ||
      itemType.includes('tool') ||
      itemType.includes('call')
    ) {
      const commandText = codexFirstStringValue(item.command ?? item.input ?? item.name);
      const status = typeof item.status === 'string' ? item.status : '';
      const exitCode = typeof item.exit_code === 'number' ? item.exit_code : null;
      if (!commandText) {
        return null;
      }
      const summarized = summarizeCommand(commandText);
      const statusPrefix = status ? `${status}: ` : type === 'item.started' ? 'in_progress: ' : '';
      const suffix = exitCode === null ? '' : ` (exit ${exitCode})`;
      return {
        kind: 'tool',
        label: 'tool',
        text: `${statusPrefix}${summarized}${suffix}`,
      };
    }

    const fallbackItemText = codexFirstStringValue(item);
    if (!fallbackItemText) {
      return null;
    }
    const fallbackKind: PreviewEntry['kind'] = itemType.includes('reason')
      ? 'reasoning'
      : itemType.includes('error')
        ? 'error'
        : 'message';
    return { kind: fallbackKind, label: itemType, text: formatShort(fallbackItemText) };
  }

  if (type === 'error') {
    const payload = codexFirstStringValue(event.error ?? event.message ?? event);
    return payload ? { kind: 'error', label: 'error', text: formatShort(payload) } : null;
  }

  const genericPayload = codexFirstStringValue(event.message ?? event.content ?? event.text);
  if (!genericPayload) {
    return null;
  }
  const label = type || 'message';
  return {
    kind: label.includes('reason') ? 'reasoning' : label.includes('error') ? 'error' : 'message',
    label,
    text: formatShort(genericPayload),
  };
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
        const entry = extractCodexPreviewLine(nested);
        if (entry) {
          entries.push(entry);
        }
      }
    } else if (isRecord(value)) {
      const entry = extractCodexPreviewLine(value);
      if (entry) {
        entries.push(entry);
      }
    }
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

function collectRawJsonLines(output: string, previewCount: number): string[] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes('{') || line.includes('}'));
  return lines.slice(-previewCount);
}

function toPositiveNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
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
    if (parsed.type !== 'turn.completed') {
      continue;
    }
    if (!isRecord(parsed.usage)) {
      continue;
    }

    const usage = parsed.usage;
    const inputTokens = toPositiveNumber(usage.input_tokens) ?? 0;
    const cachedInputTokens = toPositiveNumber(usage.cached_input_tokens) ?? 0;
    const outputTokens = toPositiveNumber(usage.output_tokens) ?? 0;
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
  return `on Windows, pass --command with a full path like "C:/Users/<user>/AppData/Local/pnpm/codex.CMD"`;
}

function buildCodexExecArgs(
  _prompt: string,
  lastMessagePath: string,
  options: CliOptions,
): string[] {
  const args = ['exec', '--json'];
  if (options.model.trim()) {
    args.push('-m', options.model.trim());
  }
  args.push('-c', `reasoning_effort="${options.reasoningEffort}"`);
  if (options.yolo) {
    args.push('--yolo');
  }
  args.push('--output-last-message', lastMessagePath, '-');
  return args;
}

export const codexProvider: ProviderAdapter = {
  name: 'codex',
  displayName: 'Codex',
  defaults: {
    command: 'codex',
    logDir: '.ai_agents/logs/codex-loop',
    model: 'gpt-5.3-codex-spark',
    reasoningEffort: 'high',
    yolo: true,
  },
  buildExecArgs: buildCodexExecArgs,
  previewEntriesFromLine,
  collectMessages,
  collectRawJsonLines,
  extractUsageSummary,
  extractRetryDelaySeconds: extractRetryDelayFromOutput,
  hasStopMarker: hasNoBeadsMarker,
  formatCommandHint,
};
