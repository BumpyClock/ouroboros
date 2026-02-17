import { describe, expect, it } from 'bun:test';
import { extractReferencedBeadIds } from './beads';

describe('extractReferencedBeadIds', () => {
  it('matches dotted sub-bead identifiers', () => {
    const knownIds = new Set(['ouroboros-7.1', 'ouroboros-7.2']);
    const text = 'working on `ouroboros-7.1` now';

    expect(extractReferencedBeadIds(text, knownIds)).toEqual(['ouroboros-7.1']);
  });

  it('returns only ids from the known set', () => {
    const knownIds = new Set(['ouroboros-7.1']);
    const text = 'mentions ouroboros-7.1 and unknown-1.2';

    expect(extractReferencedBeadIds(text, knownIds)).toEqual(['ouroboros-7.1']);
  });
});
