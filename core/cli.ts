import { getProviderAdapter, listProviderNames } from '../providers/registry';
import { loadOuroborosConfig } from './config';
import { defaultLogDir } from './paths';
import { listThemeNames, resolveTheme } from './theme';
import type { CliOptions, ReasoningEffort } from './types';

type CliOverrides = {
  provider?: string;
  reviewerProvider?: string;
  reviewerCommand?: string;
  taskMode?: 'auto' | 'top-level';
  topLevelTaskId?: string;
  beadMode?: 'auto' | 'top-level';
  topLevelBeadId?: string;
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
  theme?: string;
  developerPromptPath?: string;
  reviewerPromptPath?: string;
  initPrompts?: boolean;
  forceInitPrompts?: boolean;
};

const taskModeValues = new Set(['auto', 'top-level']);

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
}

function parseTaskMode(value: string | undefined): 'auto' | 'top-level' {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !taskModeValues.has(normalized)) {
    throw new Error('Unsupported bead mode. Expected "auto" or "top-level".');
  }
  return normalized;
}

function parseTopLevelTaskId(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? undefined : trimmed;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
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
    } else if (arg === '--reviewer-command') {
      overrides.reviewerCommand = argv[i + 1];
      i += 1;
    } else if (arg === '--task-mode' || arg === '--bead-mode') {
      const parsed = parseTaskMode(argv[i + 1]);
      overrides.taskMode = parsed;
      overrides.beadMode = parsed;
      i += 1;
    } else if (arg === '--top-level-task' || arg === '--top-level-bead') {
      const parsed = parseTopLevelTaskId(argv[i + 1]);
      overrides.topLevelTaskId = parsed;
      overrides.topLevelBeadId = parsed;
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
    } else if (arg === '--theme') {
      overrides.theme = argv[i + 1];
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
    } else if (arg === '--init-prompts') {
      overrides.initPrompts = true;
    } else if (arg === '--force-init-prompts') {
      overrides.forceInitPrompts = true;
    }
  }

  return overrides;
}

export function printUsage(): void {
  const providers = listProviderNames().join(', ');
  const themes = listThemeNames().join(', ');
  console.log(`Usage:
  ouroboros [options]

Options:
  --provider <name>        Agent provider. default: codex (supported: ${providers})
      --task-mode <auto|top-level>  Task selection mode. default: auto
      --top-level-task <id>  Target task id when --task-mode top-level is active
      --bead-mode <auto|top-level>  Alias for --task-mode
      --top-level-bead <id>  Alias for --top-level-task
  -p, --prompt <path>      Developer prompt file path (fallback: .ai_agents/prompts/developer.md, .ai_agents/prompt.md, docs/prompts/developer.default.md)
  -n, --iterations <n>     Max loops. default: 50
  -l, --preview <n>        Number of recent messages shown. default: 3
  -P, --parallel <n>       Run n agents per iteration. default: 1
      --pause-ms <ms>      Pause between loops in milliseconds. default: 0
  -c, --command <cmd>      Base command to run. default: provider-specific
      --log-dir <path>     Directory for per-iteration logs. default: ~/.ouroborus/logs/<project_dir>/<date-time>
      --theme <name|path>  Theme for TUI output (supported: ${themes})
      --show-raw           Stream raw provider output to terminal (default: off)
  -h, --help               Show this help message

Provider-specific:
  -m, --model <model>      Model override (provider-specific identifier)
      --reviewer-provider <name> Reviewer provider override (default: primary --provider)
      --reviewer-command <cmd>  Reviewer command override (default: reviewer provider default command)
      --reviewer-model <model>   Reviewer model override (provider-specific identifier)
      --reasoning-effort   low|medium|high (codex only)
      --yolo               Enable high-autonomy mode for selected provider
      --no-yolo            Disable high-autonomy mode

Review loop:
      --review                   Enable slot-local review/fix loop (default: off)
      --no-review                Disable review loop
      --review-max-fix-attempts <n>  Max fix attempts per review cycle. default: 5
      --developer-prompt <path>  Developer prompt (fallback: .ai_agents/prompts/developer.md, .ai_agents/prompt.md, docs/prompts/developer.default.md)
  --reviewer-prompt <path>   Reviewer prompt (fallback: .ai_agents/prompts/reviewer.md, docs/prompts/reviewer.default.md)
      --init-prompts            Write built-in prompts to .ai_agents/prompts/{developer,reviewer}.md when missing
      --force-init-prompts      Overwrite .ai_agents/prompts/{developer,reviewer}.md when running --init-prompts

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
  const theme = pick(cli.theme, config.runtimeConfig.theme, 'default') as string;
  resolveTheme(theme);
  const model = pick(cli.model, config.runtimeConfig.model, provider.defaults.model) as string;
  const reviewerProviderName = pick(
    cli.reviewerProvider,
    config.runtimeConfig.reviewerProvider,
    provider.name,
  ) as string;
  const reviewerProvider = getProviderAdapter(reviewerProviderName);
  const reviewerModelOverride = normalizeOptionalString(cli.reviewerModel);
  const reviewerModelFromConfig = normalizeOptionalString(config.runtimeConfig.reviewerModel);
  const reviewerModel = pick(
    reviewerModelOverride,
    reviewerModelFromConfig,
    reviewerProvider.name === provider.name ? model : reviewerProvider.defaults.model,
  ) as string;
  const reviewerCommand = pick(cli.reviewerCommand, config.runtimeConfig.reviewerCommand);
  const taskMode = parseTaskMode(
    pick(
      cli.taskMode,
      cli.beadMode,
      config.runtimeConfig.taskMode,
      config.runtimeConfig.beadMode,
      'auto',
    ),
  );
  const topLevelTaskId = parseTopLevelTaskId(
    pick(
      cli.topLevelTaskId,
      cli.topLevelBeadId,
      config.runtimeConfig.topLevelTaskId,
      config.runtimeConfig.topLevelBeadId,
    ),
  );
  if (taskMode === 'top-level' && !topLevelTaskId) {
    throw new Error('Top-level mode requires --top-level-bead (alias: --top-level-task)');
  }
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
    reviewerCommand,
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
    taskMode,
    topLevelTaskId,
    beadMode: taskMode,
    topLevelBeadId: topLevelTaskId,
    theme,
    developerPromptPath: pick(
      cli.developerPromptPath,
      config.runtimeConfig.developerPromptPath,
      config.runtimeConfig.promptPath,
    ),
    reviewerPromptPath: pick(cli.reviewerPromptPath, config.runtimeConfig.reviewerPromptPath),
    initPrompts: cli.initPrompts,
    forceInitPrompts: cli.forceInitPrompts,
  };
}
