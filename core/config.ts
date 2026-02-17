import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { isRecord } from './json';
import { resolveHomeDir, sanitizeProjectName } from './paths';
import type { CliOptions, ReasoningEffort } from './types';

type PartialOptions = Partial<
  Omit<CliOptions, 'provider' | 'projectRoot' | 'projectKey' | 'iterationsSet'>
> & {
  provider?: string;
  reasoningEffort?: ReasoningEffort;
  /** Legacy TOML key — mapped to developerPromptPath at merge time */
  promptPath?: string;
};

type LoadedConfig = {
  globalConfigPath: string;
  projectConfigPath: string;
  projectRoot: string;
  projectKey: string;
  globalConfig: PartialOptions;
  projectConfig: PartialOptions;
  runtimeConfig: PartialOptions;
};

function resolveGitRoot(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new Error('Unable to derive project config without a git repository root');
  }
}

function projectKeyFromRoot(projectRoot: string): string {
  const normalized = path.resolve(projectRoot).toLowerCase();
  const basename = sanitizeProjectName(projectRoot);
  const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 10);
  return `${basename}-${hash}`;
}

function parseTomlFile(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) {
    return {};
  }
  const raw = readFileSync(configPath, 'utf8').trim();
  if (!raw) {
    return {};
  }
  try {
    const parser = (globalThis as { Bun?: { TOML?: { parse: (text: string) => unknown } } }).Bun
      ?.TOML;
    if (!parser?.parse) {
      throw new Error('TOML parser unavailable');
    }
    const parsed = parser.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error('Config root must be a TOML table');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid config at ${configPath}: ${message}`);
  }
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toPositiveInt(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }
  return numeric;
}

function toNonNegativeInt(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return numeric;
}

function toReasoningEffort(value: unknown): ReasoningEffort | undefined {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return undefined;
}

function normalizeConfigRecord(input: Record<string, unknown>): PartialOptions {
  return {
    provider: parseString(input.provider)?.toLowerCase(),
    reviewerProvider: parseString(input.reviewerProvider)?.toLowerCase(),
    reviewerCommand: parseString(input.reviewerCommand),
    promptPath: parseString(input.promptPath),
    iterationLimit: toPositiveInt(input.iterationLimit),
    previewLines: toPositiveInt(input.previewLines),
    parallelAgents: toPositiveInt(input.parallelAgents),
    pauseMs: toNonNegativeInt(input.pauseMs),
    command: parseString(input.command),
    model: parseString(input.model),
    reviewerModel: parseString(input.reviewerModel),
    reasoningEffort: toReasoningEffort(input.reasoningEffort),
    yolo: toBoolean(input.yolo),
    logDir: parseString(input.logDir),
    showRaw: toBoolean(input.showRaw),
    reviewEnabled: toBoolean(input.reviewEnabled),
    reviewMaxFixAttempts: toPositiveInt(input.reviewMaxFixAttempts),
    developerPromptPath: parseString(input.developerPromptPath),
    reviewerPromptPath: parseString(input.reviewerPromptPath),
  };
}

function mergeConfig(globalConfig: PartialOptions, projectConfig: PartialOptions): PartialOptions {
  return {
    ...globalConfig,
    ...projectConfig,
  };
}

export function loadOuroborosConfig(cwd = process.cwd()): LoadedConfig {
  const projectRoot = resolveGitRoot(cwd);
  const projectKey = projectKeyFromRoot(projectRoot);
  const globalConfigPath = path.join(resolveHomeDir(), '.ouroboros', 'config.toml');
  const projectConfigPath = path.join(projectRoot, '.ouroboros', 'config.toml');
  const globalConfig = normalizeConfigRecord(parseTomlFile(globalConfigPath));
  const projectConfig = normalizeConfigRecord(parseTomlFile(projectConfigPath));
  const runtimeConfig = mergeConfig(globalConfig, projectConfig);
  return {
    globalConfigPath,
    projectConfigPath,
    projectRoot,
    projectKey,
    globalConfig,
    projectConfig,
    runtimeConfig,
  };
}
