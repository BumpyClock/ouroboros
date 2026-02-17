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
    });

    expect(options.reviewerProvider).toBe('claude');
    expect(options.reviewerModel).toBe('sonnet');
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

  it('throws for unsupported reviewer provider names', () => {
    expect(() =>
      parseWithConfig(['--reviewer-provider', 'not-a-provider'], {
        provider: 'codex',
      }),
    ).toThrow(/Unsupported provider "not-a-provider"/);
  });
});
