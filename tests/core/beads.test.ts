import { describe, expect, it } from 'bun:test';
import { extractReferencedBeadIds } from '../../core/beads';

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

  it('prefers explicit updated issue markers over generic matches', () => {
    const knownIds = new Set(['ouroboros-7', 'ouroboros-7.5']);
    const text = 'open beads include ouroboros-7 and ouroboros-7.5. ✓ Updated issue: ouroboros-7.5';

    expect(extractReferencedBeadIds(text, knownIds)).toEqual(['ouroboros-7.5']);
  });

  it('prefers explicit bd update command targets over generic matches', () => {
    const knownIds = new Set(['ouroboros-7', 'ouroboros-7.5']);
    const text = 'running bd update ouroboros-7.5 --status in_progress after checking ouroboros-7';

    expect(extractReferencedBeadIds(text, knownIds)).toEqual(['ouroboros-7.5']);
  });

  it('ignores ambiguous multi-id text without explicit pick markers', () => {
    const knownIds = new Set(['ouroboros-7', 'ouroboros-7.5']);
    const text = 'open beads: ouroboros-7 and ouroboros-7.5';

    expect(extractReferencedBeadIds(text, knownIds)).toEqual([]);
  });
});
