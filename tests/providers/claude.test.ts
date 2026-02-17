import { describe, expect, it } from 'bun:test';
import type { CliOptions } from '../../core/types';
import { claudeProvider } from '../../providers/claude';

function createOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    projectRoot: '/tmp/project',
    projectKey: 'project',
    provider: 'claude',
    developerPromptPath: '.ai_agents/prompt.md',
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

describe('claudeProvider.previewEntriesFromLine', () => {
  it('classifies nested assistant tool_use content as tool events', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_123', name: 'TodoWrite', input: { todos: [] } }],
      },
    });

    const [entry] = claudeProvider.previewEntriesFromLine(line);
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('tool');
    expect(entry?.label).toBe('tool');
    expect(entry?.text).toContain('TodoWrite');
  });

  it('keeps assistant text messages classified as assistant events', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Now write the tests' }],
      },
    });

    const [entry] = claudeProvider.previewEntriesFromLine(line);
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe('assistant');
    expect(entry?.label).toBe('assistant');
  });
});
