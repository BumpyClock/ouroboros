import { describe, expect, it } from 'bun:test';
import type { ProviderAdapter } from '../providers/types';
import { shouldStopFromProviderOutput } from './loop-engine';

const provider = {
  hasStopMarker: (output: string) => output.toLowerCase().includes('no_beads_available'),
} as ProviderAdapter;

describe('shouldStopFromProviderOutput', () => {
  it('does not stop when marker appears only in tool output', () => {
    const preview = [
      { kind: 'tool', label: 'tool', text: 'Get-Content providers/codex.ts // no_beads_available' },
      {
        kind: 'assistant',
        label: 'assistant',
        text: 'Completed one bead and exited after that bead.',
      },
    ];

    expect(shouldStopFromProviderOutput(provider, preview, '')).toBeFalse();
  });

  it('stops when assistant output contains marker', () => {
    const preview = [{ kind: 'assistant', label: 'assistant', text: 'no_beads_available' }];
    expect(shouldStopFromProviderOutput(provider, preview, '')).toBeTrue();
  });

  it('stops when last-message output contains marker', () => {
    const preview = [{ kind: 'assistant', label: 'assistant', text: 'normal completion text' }];
    expect(shouldStopFromProviderOutput(provider, preview, 'no_beads_available')).toBeTrue();
  });
});
