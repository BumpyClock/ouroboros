import { describe, expect, it } from 'bun:test';
import { shouldStopFromProviderOutput } from '../../core/loop-engine';
import { hasNoBeadsMarker } from '../../providers/parsing';
import type { ProviderAdapter } from '../../providers/types';

const provider = {
  hasStopMarker: hasNoBeadsMarker,
} as ProviderAdapter;

describe('shouldStopFromProviderOutput', () => {
  it('does not stop when marker appears only in tool output', () => {
    const preview = [
      { kind: 'tool', label: 'tool', text: 'Get-Content providers/codex.ts // no_tasks_available' },
      {
        kind: 'assistant',
        label: 'assistant',
        text: 'Completed one task and exited after that task.',
      },
    ];

    expect(shouldStopFromProviderOutput(provider, preview, '')).toBeFalse();
  });

  it('stops when assistant output contains marker', () => {
    const preview = [{ kind: 'assistant', label: 'assistant', text: 'no_tasks_available' }];
    expect(shouldStopFromProviderOutput(provider, preview, '')).toBeTrue();
  });

  it('stops when assistant output contains natural-language task marker', () => {
    const preview = [
      { kind: 'assistant', label: 'assistant', text: 'No tasks available right now.' },
    ];
    expect(shouldStopFromProviderOutput(provider, preview, '')).toBeTrue();
  });

  it('stops when assistant output contains legacy marker for compatibility', () => {
    const preview = [{ kind: 'assistant', label: 'assistant', text: 'no_beads_available' }];
    expect(shouldStopFromProviderOutput(provider, preview, '')).toBeTrue();
  });

  it('stops when last-message output contains legacy marker', () => {
    const preview = [{ kind: 'assistant', label: 'assistant', text: 'normal completion text' }];
    expect(shouldStopFromProviderOutput(provider, preview, 'no_beads_available')).toBeTrue();
  });
});
