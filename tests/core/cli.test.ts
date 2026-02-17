import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { getProviderAdapter } from '../../providers/registry';

let runtimeConfig: Record<string, unknown> = {};

mock.module('../../core/config', () => ({
  loadOuroborosConfig: () => ({
    globalConfigPath: '/home/test/.ouroboros/config.toml',
    projectConfigPath: '/repo/.ouroboros/config.toml',
    projectRoot: '/repo',
    projectKey: 'repo-key',
    globalConfig: {},
    projectConfig: {},
    runtimeConfig,
  }),
}));

let parseArgs: ((argv?: string[]) => import('../../core/types').CliOptions) | null = null;

function getParseArgs(): (argv?: string[]) => import('../../core/types').CliOptions {
  if (!parseArgs) {
    throw new Error('parseArgs module not loaded');
  }
  return parseArgs;
}

function parseWithConfig(
  argv: string[],
  config: Record<string, unknown> = {},
): import('../../core/types').CliOptions {
  runtimeConfig = config;
  return getParseArgs()(argv);
}

describe('parseArgs reviewer provider/model resolution', () => {
  beforeAll(async () => {
    const mod = await import('../../core/cli');
    parseArgs = mod.parseArgs;
  });

  beforeEach(() => {
    runtimeConfig = {};
  });

  afterAll(() => {
    mock.restore();
  });

  it('defaults reviewer provider/model to resolved primary provider/model when unset', () => {
    const options = parseWithConfig([], {
      provider: 'codex',
      model: 'gpt-5-primary',
    });

    expect(options.provider).toBe('codex');
    expect(options.model).toBe('gpt-5-primary');
    expect(options.reviewerProvider).toBe('codex');
    expect(options.reviewerModel).toBe('gpt-5-primary');
  });

  it('reads reviewerProvider/reviewerModel from config when provided', () => {
    const options = parseWithConfig([], {
      provider: 'codex',
      model: 'gpt-5-primary',
      reviewerProvider: 'claude',
      reviewerModel: 'sonnet',
      reviewerCommand: 'reviewer-cli-path',
    });

    expect(options.reviewerProvider).toBe('claude');
    expect(options.reviewerModel).toBe('sonnet');
    expect(options.reviewerCommand).toBe('reviewer-cli-path');
  });

  it('uses reviewer provider defaults when provider differs and reviewer model is unset', () => {
    const options = parseWithConfig(['--reviewer-provider', 'claude'], {
      provider: 'codex',
      model: 'gpt-5-primary',
    });

    expect(options.reviewerProvider).toBe('claude');
    expect(options.reviewerModel).toBe(getProviderAdapter('claude').defaults.model);
  });

  it('uses reviewer model CLI override with highest precedence', () => {
    const options = parseWithConfig(['--reviewer-model', 'o3-mini'], {
      provider: 'codex',
      model: 'gpt-5-primary',
      reviewerProvider: 'claude',
      reviewerModel: 'sonnet',
    });

    expect(options.reviewerProvider).toBe('claude');
    expect(options.reviewerModel).toBe('o3-mini');
  });

  it('uses runtime reviewerProvider with default model when reviewerModel is unset', () => {
    const options = parseWithConfig([], {
      provider: 'codex',
      model: 'gpt-5-primary',
      reviewerProvider: 'copilot',
    });

    expect(options.reviewerProvider).toBe('copilot');
    expect(options.reviewerModel).toBe(getProviderAdapter('copilot').defaults.model);
  });

  it('reads reviewer command override from config and keeps CLI precedence', () => {
    const withConfig = parseWithConfig(['--reviewer-command', 'reviewer-cli-cli'], {
      provider: 'codex',
      model: 'gpt-5-primary',
      reviewerCommand: 'project-reviewer-command',
    });

    expect(withConfig.reviewerCommand).toBe('reviewer-cli-cli');
  });

  it('prefers reviewer CLI override over runtime reviewer config', () => {
    const options = parseWithConfig(
      ['--reviewer-provider', 'copilot', '--reviewer-model', 'opus'],
      {
        provider: 'codex',
        model: 'gpt-5-primary',
        reviewerProvider: 'claude',
        reviewerModel: 'sonnet',
      },
    );

    expect(options.reviewerProvider).toBe('copilot');
    expect(options.reviewerModel).toBe('opus');
  });

  it('parses init prompts flag', () => {
    const options = parseWithConfig(['--init-prompts']);

    expect(options.initPrompts).toBe(true);
    expect(options.forceInitPrompts).toBe(undefined);
  });

  it('parses init prompts with force flag', () => {
    const options = parseWithConfig(['--init-prompts', '--force-init-prompts']);

    expect(options.initPrompts).toBe(true);
    expect(options.forceInitPrompts).toBe(true);
  });

  it('throws for unsupported reviewer provider names', () => {
    expect(() =>
      parseWithConfig(['--reviewer-provider', 'not-a-provider'], {
        provider: 'codex',
      }),
    ).toThrow(/Unsupported provider "not-a-provider"/);
  });

  it('throws for unsupported reviewer provider from config', () => {
    expect(() =>
      parseWithConfig([], {
        provider: 'codex',
        reviewerProvider: 'not-a-provider',
      }),
    ).toThrow(/Unsupported provider "not-a-provider"/);
  });

  it('normalizes reviewerProvider from config to lowercase', () => {
    const options = parseWithConfig([], {
      provider: 'codex',
      reviewerProvider: 'CLAUDE',
    });

    expect(options.reviewerProvider).toBe('claude');
  });

  it('uses CLI theme override with config and default', () => {
    const withConfig = parseWithConfig(['--theme', 'matrix'], {
      provider: 'codex',
      model: 'gpt-5-primary',
      theme: 'default',
    });

    expect(withConfig.theme).toBe('matrix');

    const fromConfig = parseWithConfig([], {
      provider: 'codex',
      model: 'gpt-5-primary',
      theme: 'matrix',
    });

    expect(fromConfig.theme).toBe('matrix');
  });

  it('throws for unknown theme values', () => {
    expect(() =>
      parseWithConfig(['--theme', 'does-not-exist'], { provider: 'codex', model: 'gpt-5-primary' }),
    ).toThrow(/Unknown theme "does-not-exist"\./);
  });

  it('supports bead mode from config and CLI override', () => {
    const fromConfig = parseWithConfig([], {
      provider: 'codex',
      model: 'gpt-5-primary',
      beadMode: 'top-level',
      topLevelBeadId: 'ouroboros-10',
    });

    expect(fromConfig.beadMode).toBe('top-level');
    expect(fromConfig.topLevelBeadId).toBe('ouroboros-10');

    const fromCli = parseWithConfig(['--bead-mode', 'auto'], {
      provider: 'codex',
      model: 'gpt-5-primary',
      beadMode: 'top-level',
      topLevelBeadId: 'ouroboros-10',
    });

    expect(fromCli.beadMode).toBe('auto');
  });

  it('defaults to auto when bead mode is unset', () => {
    const options = parseWithConfig([
      '--review',
    ], {
      provider: 'codex',
      model: 'gpt-5-primary',
    });

    expect(options.beadMode).toBe('auto');
    expect(options.topLevelBeadId).toBe(undefined);
  });

  it('throws when top-level mode is used without a top-level bead id', () => {
    expect(() =>
      parseWithConfig(
        ['--bead-mode', 'top-level'],
        { provider: 'codex', model: 'gpt-5-primary' },
      ),
    ).toThrow(/Top-level mode requires --top-level-bead/);
  });

  it('throws when top-level mode uses a blank top-level bead id', () => {
    expect(() =>
      parseWithConfig(
        ['--bead-mode', 'top-level', '--top-level-bead', '   '],
        { provider: 'codex', model: 'gpt-5-primary' },
      ),
    ).toThrow(/Top-level mode requires --top-level-bead/);
  });

  it('throws when config contains an invalid bead mode', () => {
    expect(() =>
      parseWithConfig(
        [],
        { provider: 'codex', model: 'gpt-5-primary', beadMode: 'invalid-mode' },
      ),
    ).toThrow(/Unsupported bead mode/);
  });

  it('accepts top-level mode when CLI provides top-level bead id', () => {
    const options = parseWithConfig(
      ['--bead-mode', 'top-level', '--top-level-bead', 'ouroboros-12'],
      { provider: 'codex', model: 'gpt-5-primary' },
    );

    expect(options.beadMode).toBe('top-level');
    expect(options.topLevelBeadId).toBe('ouroboros-12');
  });
});
