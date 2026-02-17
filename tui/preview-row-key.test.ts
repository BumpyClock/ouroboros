import { describe, expect, it } from 'bun:test';
import { buildPreviewRowKey } from './preview-row-key';

describe('buildPreviewRowKey', () => {
  it('is unique for duplicate placeholder rows by slot index', () => {
    const keys = Array.from({ length: 4 }, (_, rowIndex) => buildPreviewRowKey(2, rowIndex));
    expect(new Set(keys).size).toBe(4);
  });

  it('is stable for the same agent and row index', () => {
    expect(buildPreviewRowKey(3, 1)).toBe(buildPreviewRowKey(3, 1));
  });
});
