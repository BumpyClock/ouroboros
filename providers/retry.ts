import { isRecord, safeJsonParse, toPositiveNumber } from './parsing';

export const RETRY_DELAY_KEYS = [
  'resets_in_seconds',
  'reset_seconds',
  'retry_after_seconds',
] as const;

const SECOND_RETRY_RE = /(?:try again|retry).{0,30}?(\d+)\s*(?:seconds?|secs?|s)\b/i;
const MINUTE_RETRY_RE = /(?:try again|retry).{0,30}?(\d+)\s*(?:minutes?|mins?|m)\b/i;

function findRetryDelayInValue(value: unknown, keys: readonly string[]): number | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findRetryDelayInValue(entry, keys);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    const found = toPositiveNumber(value[key]);
    if (found !== null) {
      return found;
    }
  }

  for (const nested of Object.values(value)) {
    const found = findRetryDelayInValue(nested, keys);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

export function extractRetryDelayFromOutput(
  output: string,
  keys: readonly string[] = RETRY_DELAY_KEYS,
): number | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parsed = safeJsonParse(line);
    const found = findRetryDelayInValue(parsed, keys);
    if (found !== null) {
      return found;
    }
  }

  const secondMatch = output.match(SECOND_RETRY_RE);
  if (secondMatch) {
    return Number.parseInt(secondMatch[1], 10);
  }
  const minuteMatch = output.match(MINUTE_RETRY_RE);
  if (minuteMatch) {
    return Number.parseInt(minuteMatch[1], 10) * 60;
  }
  return null;
}
