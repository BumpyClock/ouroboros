import { getProviderAdapter, listProviderNames } from '../providers/registry';
import { loadOuroborosConfig } from './config';
import { defaultLogDir } from './paths';
import type { CliOptions, ReasoningEffort } from './types';

type CliOverrides = {
  provider?: string;
  reviewerProvider?: string;
  iterationLimit?: number;
  iterationsSet: boolean;
  previewLines?: number;
  parallelAgents?: number;
  pauseMs?: number;
  command?: string;
  model?: string;
  reviewerModel?: string;
  reasoningEffort?: ReasoningEffort;
  yolo?: boolean;
  logDir?: string;
  showRaw?: boolean;
  reviewEnabled?: boolean;
  reviewMaxFixAttempts?: number;
  developerPromptPath?: string;
  reviewerPromptPath?: string;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
}

function parseCliOverrides(argv: string[]): CliOverrides {
  const overrides: CliOverrides = {
    iterationsSet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--provider') {
      overrides.provider = (argv[i + 1] ?? '').trim().toLowerCase();
      i += 1;
    } else if (arg === '--reviewer-provider') {
      overrides.reviewerProvider = (argv[i + 1] ?? '').trim().toLowerCase();
      i += 1;
    } else if (arg === '--prompt' || arg === '-p') {
      overrides.developerPromptPath = argv[i + 1];
      i += 1;
    } else if (arg === '--iterations' || arg === '-n') {
      overrides.iterationLimit = parsePositiveInt(argv[i + 1], 50);
      overrides.iterationsSet = true;
      i += 1;
    } else if (arg === '--preview' || arg === '-l') {
      overrides.previewLines = parsePositiveInt(argv[i + 1], 3);
      i += 1;
    } else if (arg === '--parallel' || arg === '-P') {
      overrides.parallelAgents = parsePositiveInt(argv[i + 1], 1);
      i += 1;
    } else if (arg === '--pause-ms') {
      overrides.pauseMs = parseNonNegativeInt(argv[i + 1], 0);
      i += 1;
    } else if (arg === '--command' || arg === '-c') {
      overrides.command = argv[i + 1];
      i += 1;
    } else if (arg === '--model' || arg === '-m') {
      overrides.model = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--reviewer-model') {
      overrides.reviewerModel = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--reasoning-effort') {
      const value = (argv[i + 1] ?? '').toLowerCase();
      if (value === 'low' || value === 'medium' || value === 'high') {
        overrides.reasoningEffort = value;
      }
      i += 1;
    } else if (arg === '--yolo') {
      overrides.yolo = true;
    } else if (arg === '--no-yolo') {
      overrides.yolo = false;
    } else if (arg === '--log-dir') {
      overrides.logDir = argv[i + 1];
      i += 1;
    } else if (arg === '--show-raw') {
      overrides.showRaw = true;
    } else if (arg === '--review') {
      overrides.reviewEnabled = true;
    } else if (arg === '--no-review') {
      overrides.reviewEnabled = false;
    } else if (arg === '--review-max-fix-attempts') {
      overrides.reviewMaxFixAttempts = parsePositiveInt(argv[i + 1], 5);
      i += 1;
    } else if (arg === '--developer-prompt') {
      overrides.developerPromptPath = argv[i + 1];
      i += 1;
    } else if (arg === '--reviewer-prompt') {
      overrides.reviewerPromptPath = argv[i + 1];
      i += 1;
    }
  }

  return overrides;
}

export function printUsage(): void {
  const providers = listProviderNames().join(', ');
  console.log(`Usage:
  ouroboros [options]

Options:
  --provider <name>        Agent provider. default: codex (supported: ${providers})
  -p, --prompt <path>      Developer prompt file path (fallback: .ai_agents/prompts/developer.md, .ai_agents/prompt.md)
  -n, --iterations <n>     Max loops. default: 50
  -l, --preview <n>        Number of recent messages shown. default: 3
  -P, --parallel <n>       Run n agents per iteration. default: 1
      --pause-ms <ms>      Pause between loops in milliseconds. default: 0
  -c, --command <cmd>      Base command to run. default: provider-specific
      --log-dir <path>     Directory for per-iteration logs. default: ~/.ouroborus/logs/<project_dir>/<date-time>
      --show-raw           Stream raw provider output to terminal (default: off)
  -h, --help               Show this help message

Provider-specific:
  -m, --model <model>      Model override (provider-specific identifier)
      --reviewer-provider <name> Reviewer provider override (default: primary --provider)
      --reviewer-model <model>   Reviewer model override (provider-specific identifier)
      --reasoning-effort   low|medium|high (codex only)
      --yolo               Enable high-autonomy mode for selected provider
      --no-yolo            Disable high-autonomy mode

Review loop:
      --review                   Enable slot-local review/fix loop (default: off)
      --no-review                Disable review loop
      --review-max-fix-attempts <n>  Max fix attempts per review cycle. default: 5
      --developer-prompt <path>  Developer prompt (fallback: .ai_agents/prompts/developer.md, .ai_agents/prompt.md)
      --reviewer-prompt <path>   Reviewer prompt (fallback: .ai_agents/prompts/reviewer.md)

Config:
  - Global config: ~/.ouroboros/config.toml
  - Project config: <project-root>/.ouroboros/config.toml
  - Merge order: CLI > project > global > provider defaults`);
}

export function parseArgs(argv = process.argv.slice(2)): CliOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const config = loadOuroborosConfig(process.cwd());
  const cli = parseCliOverrides(argv);
  const cliDefaultLogDir = defaultLogDir(config.projectRoot);
  const providerName = cli.provider ?? config.runtimeConfig.provider ?? 'codex';
  const provider = getProviderAdapter(providerName);

  const pick = <T>(...values: Array<T | undefined>): T | undefined => {
    for (const value of values) {
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  };

  const iterationLimit = pick(
    cli.iterationLimit,
    config.runtimeConfig.iterationLimit,
    50,
  ) as number;
  const model = pick(cli.model, config.runtimeConfig.model, provider.defaults.model) as string;
  const reviewerProviderName = pick(
    cli.reviewerProvider,
    config.runtimeConfig.reviewerProvider,
    provider.name,
  ) as string;
  const reviewerProvider = getProviderAdapter(reviewerProviderName);
  const reviewerModel = pick(
    cli.reviewerModel,
    config.runtimeConfig.reviewerModel,
    reviewerProvider.name === provider.name ? model : reviewerProvider.defaults.model,
  ) as string;
  const iterationsSet = cli.iterationsSet || config.runtimeConfig.iterationLimit !== undefined;

  return {
    projectRoot: config.projectRoot,
    projectKey: config.projectKey,
    provider: provider.name,
    reviewerProvider: reviewerProvider.name,
    iterationLimit,
    iterationsSet,
    previewLines: pick(cli.previewLines, config.runtimeConfig.previewLines, 3) as number,
    parallelAgents: pick(cli.parallelAgents, config.runtimeConfig.parallelAgents, 1) as number,
    pauseMs: pick(cli.pauseMs, config.runtimeConfig.pauseMs, 0) as number,
    command: pick(cli.command, config.runtimeConfig.command, provider.defaults.command) as string,
    model,
    reviewerModel,
    reasoningEffort: pick(
      cli.reasoningEffort,
      config.runtimeConfig.reasoningEffort,
      provider.defaults.reasoningEffort,
    ) as ReasoningEffort,
    yolo: pick(cli.yolo, config.runtimeConfig.yolo, provider.defaults.yolo) as boolean,
    logDir: pick(
      cli.logDir,
      config.runtimeConfig.logDir,
      cliDefaultLogDir,
      provider.defaults.logDir,
    ) as string,
    showRaw: pick(cli.showRaw, config.runtimeConfig.showRaw, false) as boolean,
    reviewEnabled: pick(cli.reviewEnabled, config.runtimeConfig.reviewEnabled, false) as boolean,
    reviewMaxFixAttempts: pick(
      cli.reviewMaxFixAttempts,
      config.runtimeConfig.reviewMaxFixAttempts,
      5,
    ) as number,
    developerPromptPath: pick(
      cli.developerPromptPath,
      config.runtimeConfig.developerPromptPath,
      config.runtimeConfig.promptPath,
    ),
    reviewerPromptPath: pick(cli.reviewerPromptPath, config.runtimeConfig.reviewerPromptPath),
  };
}
