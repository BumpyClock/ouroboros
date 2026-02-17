import { describe, expect, it } from 'bun:test';
import type { CliOptions } from '../core/types';
import { claudeProvider } from './claude';

function createOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    projectRoot: '/tmp/project',
    projectKey: 'project',
    provider: 'claude',
    promptPath: '.ai_agents/prompt.md',
    iterationLimit: 3,
    iterationsSet: false,
    previewLines: 5,
    parallelAgents: 1,
    pauseMs: 1000,
    command: 'claude',
    model: '',
    reasoningEffort: 'high',
    yolo: true,
    logDir: '.ai_agents/logs/claude-loop',
    showRaw: false,
    ...overrides,
  };
}

describe('claudeProvider.buildExecArgs', () => {
  it('includes verbose mode when stream-json output format is requested', () => {
    const args = claudeProvider.buildExecArgs(
      'test prompt',
      '/tmp/last-message.md',
      createOptions(),
    );
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');
  });

  it('includes bypass permission mode when yolo is enabled', () => {
    const args = claudeProvider.buildExecArgs(
      'test prompt',
      '/tmp/last-message.md',
      createOptions(),
    );
    expect(args).toContain('--permission-mode');
    expect(args).toContain('bypassPermissions');
  });
});
