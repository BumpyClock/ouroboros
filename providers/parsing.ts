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

export function firstStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => firstStringValue(entry))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (!isRecord(value)) {
    return '';
  }

  const keys = [
    'text',
    'content',
    'message',
    'output',
    'result',
    'summary',
    'data',
    'name',
    'input',
  ];
  for (const key of keys) {
    const nested = firstStringValue(value[key]);
    if (nested) {
      return nested;
    }
  }

  return Object.values(value)
    .map((entry) => firstStringValue(entry))
    .filter(Boolean)
    .join(' ')
    .trim();
}
