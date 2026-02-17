export const CLAUDE_FIRST_STRING_KEYS = [
  'text',
  'content',
  'message',
  'output',
  'result',
  'summary',
  'name',
  'input',
] as const;
export const CODEX_FIRST_STRING_KEYS = [
  'text',
  'content',
  'output',
  'message',
  'data',
  'summary',
] as const;
export const COPILOT_FIRST_STRING_KEYS = [
  'text',
  'content',
  'message',
  'output',
  'result',
  'summary',
] as const;

const FALLBACK_FIRST_STRING_KEYS = Array.from(
  new Set([...CLAUDE_FIRST_STRING_KEYS, ...CODEX_FIRST_STRING_KEYS, ...COPILOT_FIRST_STRING_KEYS]),
);
export const NO_BEADS_MARKERS = ['no beads available', 'no_beads_available'] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function toJsonCandidates(line: string): unknown[] {
  const values: unknown[] = [];
  const direct = safeJsonParse(line);
  if (direct !== null) {
    values.push(direct);
    return values;
  }

  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const embedded = safeJsonParse(line.slice(start, end + 1));
    if (embedded !== null) {
      values.push(embedded);
    }
  }

  return values;
}

export function toPositiveNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

export function collectRawJsonLines(output: string, previewCount: number): string[] {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes('{') || line.includes('}'));
  return lines.slice(-previewCount);
}

export function firstStringValue(
  value: unknown,
  keys: readonly string[] = FALLBACK_FIRST_STRING_KEYS,
): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => firstStringValue(entry, keys))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (!isRecord(value)) {
    return '';
  }

  for (const key of keys) {
    const nested = firstStringValue(value[key], keys);
    if (nested) {
      return nested;
    }
  }

  return Object.values(value)
    .map((entry) => firstStringValue(entry, keys))
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function hasNoBeadsMarker(output: string): boolean {
  const normalized = output.toLowerCase();
  return NO_BEADS_MARKERS.some((marker) => normalized.includes(marker));
}
